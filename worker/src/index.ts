// Corhaus WhatsApp worker — process entry point.
//
//   WhatsApp Web (Baileys, persistent volume)
//        ↓ claims
//   whatsapp_message_jobs  (Supabase)
//        ↑ written by
//   Vercel /api/member/book, /api/member/cancel, /admin/integration
//
// Supabase is the ONLY channel between the worker and the web app. The worker
// never calls the app, and the app never calls the worker.
//
// This process owns exactly one WhatsApp session and is intended to run as a
// single instance. Two copies pointed at the same Supabase project will still be
// safe for message delivery (SQL claim uses SKIP LOCKED) but would each try to
// hold their own WhatsApp socket, so deploy it as ONE replica.

import { config as loadEnv } from "dotenv";
import http from "node:http";
import path from "node:path";
import { db, patchSettings, readSettings, writeAudit } from "./db";
import { JobProcessor } from "./jobs";
import { startReminderScheduler } from "./reminders";
import { WhatsappSession } from "./session";

// Local development convenience: reuse the web app's existing env files so the
// worker talks to the same Supabase project without a second secret to copy.
// Real process env always wins, so this is a no-op in production.
if (process.env.NODE_ENV !== "production") {
  loadEnv({ path: path.join(__dirname, "..", ".env.local") });
  loadEnv({ path: path.join(__dirname, "..", "..", ".env.local") });
  loadEnv({ path: path.join(__dirname, "..", "..", ".env") });
}

// The worker reads SUPABASE_URL, but the web app calls it NEXT_PUBLIC_SUPABASE_URL.
if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
}

const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`;
const HEARTBEAT_MS = 30_000;

let shuttingDown = false;

async function claimPendingCommand(): Promise<{ id: string; command: string } | null> {
  // PostgREST's UPDATE endpoint does not support `order()` — ordering an
  // update produces an invalid ORDER BY and Postgres reports the column as
  // missing. So pick the oldest pending row with a SELECT, then claim that
  // specific id.
  const { data: pending, error: selErr } = await db()
    .from("whatsapp_commands")
    .select("id, command")
    .eq("status", "PENDING")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selErr) {
    console.error("[worker] command lookup failed:", selErr.message);
    return null;
  }
  if (!pending) return null;

  // The `status = PENDING` predicate is the atomic guard: if another replica
  // claimed it between our SELECT and this UPDATE, zero rows are affected and
  // we correctly do nothing.
  const { data, error } = await db()
    .from("whatsapp_commands")
    .update({ status: "PROCESSING", claimed_at: new Date().toISOString() })
    .eq("id", pending.id)
    .eq("status", "PENDING")
    .select("id, command")
    .maybeSingle();

  if (error) {
    console.error("[worker] command claim failed:", error.message);
    return null;
  }
  return (data as { id: string; command: string } | null) ?? null;
}

async function completeCommand(
  id: string,
  status: "COMPLETED" | "FAILED",
  error?: string
): Promise<void> {
  await db()
    .from("whatsapp_commands")
    .update({
      status,
      processed_at: new Date().toISOString(),
      error_message: error ?? null,
    })
    .eq("id", id);
}

async function handleCommand(session: WhatsappSession, command: string): Promise<void> {
  switch (command) {
    case "CONNECT":
      console.log("[worker] command: CONNECT");
      await session.start({ fresh: true });
      break;
    case "RECONNECT":
      console.log("[worker] command: RECONNECT");
      // Clean slate: stop, clear credentials, fresh QR (section 36).
      await session.softStop();
      await session.start({ fresh: true });
      break;
    case "DISCONNECT":
      console.log("[worker] command: DISCONNECT");
      await session.logoutAndClear();
      break;
    default:
      console.warn(`[worker] unknown command "${command}" — ignoring`);
  }
}

/**
 * Minimal health endpoint.
 *
 * The worker delivers no HTTP API by design — everything goes through Supabase.
 * But container hosts (Railway, Render, Fly, Kubernetes) require a process to
 * bind PORT, and will mark a deployment unhealthy if nothing listens. This binds
 * PORT and answers /health, and exposes nothing else.
 */
function startHealthServer(): void {
  const port = parseInt(process.env.PORT || "8080", 10);
  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          worker_id: WORKER_ID,
          uptime_seconds: Math.floor(process.uptime()),
        })
      );
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });
  server.on("error", (err) => {
    console.error("[worker] health server error:", err);
  });
  server.listen(port, () => {
    console.log(`[worker] health endpoint listening on :${port}/health`);
  });
}

async function main(): Promise<void> {
  console.log(`[worker] Corhaus WhatsApp worker starting (id=${WORKER_ID})`);

  startHealthServer();

  await patchSettings({ worker_id: WORKER_ID, worker_heartbeat_at: new Date().toISOString() });

  const session = new WhatsappSession({
    onConnected: () => {
      // Messaging is enabled only once the socket is genuinely open.
      patchSettings({ enabled: true }).catch((e) =>
        console.error("[worker] failed to enable messaging:", e)
      );
      console.log("[worker] WhatsApp connected — messaging enabled");
    },
    onDisconnected: (reason) => {
      console.log(`[worker] WhatsApp disconnected: ${reason}`);
    },
    onQr: () => {
      console.log("[worker] new pairing QR issued");
    },
    onStatusUpdate: (status) => {
      console.log(`[worker] connection state: ${status}`);
    },
  });

  // An unclean shutdown leaves rows in PROCESSING; put them back so they retry.
  await session.recoverStuckJobs();

  const processor = new JobProcessor(session);
  const reminderTimer = startReminderScheduler();

  // Heartbeat so the admin UI can tell a live worker from a dead one.
  const heartbeat = setInterval(() => {
    patchSettings({ worker_heartbeat_at: new Date().toISOString() }).catch((e) =>
      console.error("[worker] heartbeat failed:", e)
    );
  }, HEARTBEAT_MS);

  // Command poll: the web app's only way to reach this process.
  const commandPoll = setInterval(async () => {
    if (shuttingDown) return;
    try {
      const pending = await claimPendingCommand();
      if (!pending) return;
      try {
        await handleCommand(session, pending.command);
        await completeCommand(pending.id, "COMPLETED");
        await writeAudit("whatsapp.command_completed", {
          command: pending.command,
          command_id: pending.id,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[worker] command ${pending.command} failed:`, message);
        await completeCommand(pending.id, "FAILED", message);
        await patchSettings({
          connection_status: "ERROR",
          last_error: message.slice(0, 500),
          last_error_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("[worker] command poll error:", err);
    }
  }, 3000);

  // Auto-resume: if a session already exists on disk, reconnect automatically so
  // a worker restart does not require the admin to rescan.
  try {
    const settings = await readSettings();
    if (settings?.connection_status === "CONNECTED" || settings?.connection_status === "AUTHENTICATED") {
      console.log("[worker] resuming existing session from disk");
      await session.start();
    } else {
      console.log(
        "[worker] no active session; waiting for a Connect/QR command from the admin UI"
      );
      await patchSettings({ connection_status: "DISCONNECTED", current_qr: null, qr_expires_at: null });
    }
  } catch (err) {
    console.error("[worker] initial session start failed:", err);
  }

  processor.start(5000);

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received — shutting down`);
    clearInterval(heartbeat);
    clearInterval(commandPoll);
    clearInterval(reminderTimer);
    processor.stop();
    try {
      await session.softStop();
    } catch (err) {
      console.error("[worker] socket close error:", err);
    }
    // Leave any PROCESSING row recoverable for the next boot.
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    console.error("[worker] unhandled rejection:", reason);
  });

  console.log("[worker] running");
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);

  // The single most common misconfiguration for this worker, and the raw
  // PostgREST string does not explain itself.
  if (/legacy api keys/i.test(message)) {
    console.error(
      "[worker] SUPABASE_SERVICE_ROLE_KEY is a legacy key and this project has " +
        "legacy API keys disabled.\n" +
        "          Supabase Dashboard -> Project Settings -> API Keys -> copy the " +
        "NEW 'sb_secret_...' service role key.\n" +
        "          Local: put it in .env.local as SUPABASE_SERVICE_ROLE_KEY.\n" +
        "          Hosted: set SUPABASE_SERVICE_ROLE_KEY to the new key in your " +
        "worker's environment."
    );
  } else {
    console.error("[worker] fatal startup error:", message);
  }
  process.exit(1);
});