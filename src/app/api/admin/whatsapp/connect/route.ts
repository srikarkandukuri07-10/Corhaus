import { NextResponse } from "next/server";
import { audit, readSettings, requireWhatsapp } from "@/lib/whatsapp/admin";

// Connect / Disconnect / Reconnect (sections 36, 37).
//
// The Vercel app cannot talk to the WhatsApp process directly - it may not even
// be running. So the app appends a row to whatsapp_commands and the worker picks
// it up on its next poll. This keeps the deployment topology honest: Supabase is
// the only channel.

const VALID_COMMANDS = ["CONNECT", "DISCONNECT", "RECONNECT"] as const;
type Command = (typeof VALID_COMMANDS)[number];

export async function POST(req: Request) {
  const auth = await requireWhatsapp("whatsapp.manage");
  if (!auth.ok) return auth.response;

  let command: Command;
  try {
    const body = await req.json();
    command = String(body?.command ?? "").toUpperCase() as Command;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!VALID_COMMANDS.includes(command)) {
    return NextResponse.json(
      { error: `Unknown command. Expected one of: ${VALID_COMMANDS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const { service, email, role } = auth.admin;
    const settings = await readSettings(service);

    // Section 57: never mark connected optimistically. Disconnecting requests an
    // immediate visible state change because the app genuinely knows messaging
    // must stop now; connecting must wait for the worker to report reality.
    if (command === "DISCONNECT") {
      await service
        .from("whatsapp_settings")
        .update({
          connection_status: "DISCONNECTED",
          enabled: false,
          current_qr: null,
          qr_expires_at: null,
          last_disconnected_at: new Date().toISOString(),
          updated_by: email,
        })
        .eq("id", "default");
    }

    if (command === "RECONNECT" || command === "CONNECT") {
      // Clear any stale pairing string so the UI can never render an expired QR.
      await service
        .from("whatsapp_settings")
        .update({
          connection_status: "CONNECTING",
          current_qr: null,
          qr_expires_at: null,
          last_error: null,
          updated_by: email,
        })
        .eq("id", "default");
    }

    // Collapse any stale pending command so an admin pressing the button twice
    // does not queue two sessions (section 10).
    await service
      .from("whatsapp_commands")
      .update({ status: "CANCELLED", error_message: "Superseded by a newer request", processed_at: new Date().toISOString() })
      .eq("status", "PENDING");

    const { data: cmd, error: cmdErr } = await service
      .from("whatsapp_commands")
      .insert({
        command,
        status: "PENDING",
        requested_by: email,
      })
      .select("id, command, created_at")
      .single();

    if (cmdErr) {
      console.error("[whatsapp] failed to queue command:", cmdErr.message);
      return NextResponse.json(
        { error: "Could not queue the WhatsApp request." },
        { status: 500 }
      );
    }

    await audit(
      service,
      `whatsapp.${command.toLowerCase()}_requested`,
      { email, role },
      { command_id: cmd.id, previous_status: settings?.connection_status ?? null }
    );

    return NextResponse.json({
      success: true,
      command: cmd,
      // The worker may be down; the admin UI surfaces that instead of hanging.
      worker_online: settings?.worker_heartbeat_at
        ? Date.now() - new Date(settings.worker_heartbeat_at as string).getTime() < 90_000
        : false,
    });
  } catch (err) {
    console.error("[whatsapp] command route error:", err);
    return NextResponse.json(
      { error: "Unable to process the WhatsApp request." },
      { status: 500 }
    );
  }
}