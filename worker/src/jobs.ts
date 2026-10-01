// Message delivery worker.
//
// Lifecycle per the spec:
//   claim (FOR UPDATE SKIP LOCKED) -> re-verify business state -> send ->
//   record SENT | retry | mark FAILED
//
// Guarantees:
//   - Two workers can never hold the same row (claim is atomic + SKIP LOCKED).
//   - A retry storm is bounded by max_send_attempts with exponential backoff.
//   - One failure never stops the loop.
//   - "SENT" is only written after WhatsApp itself confirms the message left.

import { db, readSettings, writeAudit, type JobRow } from "./db";
import type { WhatsappSession } from "./session";

const BACKOFF_MINUTES = [0, 2, 5, 15, 60, 180];

export class JobProcessor {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private session: WhatsappSession;

  constructor(session: WhatsappSession) {
    this.session = session;
  }

  start(intervalMs = 5000): void {
    if (this.running) return;
    this.running = true;
    const tick = async () => {
      try {
        await this.drain();
      } catch (err) {
        console.error("[worker] job loop error:", err);
      }
    };
    this.timer = setInterval(tick, intervalMs);
    // One immediate pass so a restart does not wait a full interval.
    void tick();
    console.log(`[worker] job processor started (every ${intervalMs}ms)`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  /**
   * Claim and process everything currently due. Bounded per pass so a large
   * backlog cannot starve the socket or blow past any provider rate limit.
   */
  async drain(maxPerPass = 10): Promise<void> {
    if (!this.session.isOpen()) return;

    const settings = await readSettings();
    if (!settings) return;

    // A disconnected studio must not have messages silently sent later, but
    // jobs stay PENDING so they can resume after reconnect.
    if (settings.connection_status === "DISCONNECTED" && settings.enabled === false) {
      // Still allow explicit test messages to flow only when enabled.
      if (settings.enabled === false) return;
    }

    const { data, error } = await db().rpc("claim_whatsapp_jobs", {
      p_limit: maxPerPass,
      p_worker: process.env.WORKER_ID || "worker",
    });
    if (error) {
      console.error("[worker] claim_whatsapp_jobs failed:", error.message);
      return;
    }

    const jobs = (data ?? []) as JobRow[];
    if (jobs.length === 0) return;

    console.log(`[worker] claimed ${jobs.length} job(s)`);
    for (const job of jobs) {
      // Each job is isolated: a throw here cannot stop the remaining jobs.
      try {
        await this.process(job, settings.max_send_attempts);
      } catch (err) {
        console.error(`[worker] job ${job.id} threw:`, err);
        await this.settleFailure(job, settings.max_send_attempts, "Worker error while sending.");
      }
    }
  }

  private async process(job: JobRow, maxAttempts: number): Promise<void> {
    // Re-verify business state immediately before sending (section 30). The
    // queued job is a snapshot; the world may have moved on.
    const stillValid = await this.verifyStillValid(job);
    if (!stillValid) {
      await db()
        .from("whatsapp_message_jobs")
        .update({
          status: "CANCELLED",
          error_message: "Cancelled: the booking or class was cancelled before this message was sent.",
        })
        .eq("id", job.id)
        .eq("status", "PROCESSING");
      console.log(`[worker] job ${job.id} cancelled — booking/class no longer valid`);
      return;
    }

    const sock = this.session.getSock();
    if (!sock) {
      await this.settleFailure(job, maxAttempts, "WhatsApp socket unavailable.");
      return;
    }

    const jid = `${job.recipient_phone}@s.whatsapp.net`;

    try {
      const sent = await sock.sendMessage(jid, { text: job.message_body });
      const providerId = extractMessageId(sent);

      await db()
        .from("whatsapp_message_jobs")
        .update({
          status: "SENT",
          sent_at: new Date().toISOString(),
          provider_message_id: providerId,
          error_message: null,
        })
        .eq("id", job.id)
        .eq("status", "PROCESSING");

      console.log(`[worker] SENT ${job.template_key} -> ${job.recipient_phone}`);
    } catch (err) {
      const message = describeSendError(err);
      await this.settleFailure(job, maxAttempts, message);
    }
  }

  /**
   * A queued job is only sent if the underlying business records still support
   * it. This is what stops a reminder going out for a cancelled booking.
   */
  private async verifyStillValid(job: JobRow): Promise<boolean> {
    if (!job.booking_id) return true;

    const { data: booking } = await db()
      .from("bookings")
      .select("id, booking_status, class_id, classes(class_date, class_time, status, is_active)")
      .eq("id", job.booking_id)
      .maybeSingle();

    // Booking row is gone (cascaded delete) — do not send.
    if (!booking) return false;

    const b = booking as {
      booking_status: string;
      classes: { status?: string; is_active?: boolean } | null;
    };

    if (b.booking_status === "cancelled") return false;
    if (b.classes && b.classes.status === "cancelled") return false;
    if (b.classes && b.classes.is_active === false) return false;

    return true;
  }

  /**
   * Retry with bounded backoff, then permanent FAILED. Never an unbounded loop.
   */
  private async settleFailure(
    job: JobRow,
    maxAttempts: number,
    message: string
  ): Promise<void> {
    const attempts = job.attempt_count;
    const isTest = job.trigger_type === "test";

    // A test message never auto-retries; the admin asked for one send.
    const retryable = !isTest && attempts < maxAttempts;
    const backoff = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)];
    const nextRun = new Date(Date.now() + backoff * 60_000).toISOString();

    const patch: Record<string, unknown> = {
      error_message: message.slice(0, 500),
    };

    if (retryable) {
      patch.status = "PENDING";
      patch.scheduled_for = nextRun;
      patch.claimed_at = null;
      patch.claimed_by = null;
    } else {
      patch.status = "FAILED";
      patch.failed_at = new Date().toISOString();
      patch.claimed_at = null;
      patch.claimed_by = null;
    }

    const { error } = await db()
      .from("whatsapp_message_jobs")
      .update(patch)
      .eq("id", job.id)
      .eq("status", "PROCESSING");

    if (error) {
      console.error(`[worker] could not settle job ${job.id}:`, error.message);
      return;
    }

    await writeAudit(
      retryable ? "whatsapp.message_retry" : "whatsapp.message_failed",
      {
        job_id: job.id,
        template_key: job.template_key,
        recipient_phone: job.recipient_phone,
        attempt: attempts,
        max_attempts: maxAttempts,
        next_attempt_at: retryable ? nextRun : null,
        error: message.slice(0, 300),
      }
    );

    console.log(
      retryable
        ? `[worker] RETRY ${job.template_key} -> ${job.recipient_phone} (attempt ${attempts}/${maxAttempts}, next in ${backoff}m): ${message}`
        : `[worker] FAILED ${job.template_key} -> ${job.recipient_phone} after ${attempts} attempt(s): ${message}`
    );
  }
}

function extractMessageId(sent: unknown): string | null {
  const key = (sent as { key?: { id?: string } })?.key?.id;
  return typeof key === "string" ? key : null;
}

/** Human-readable reason. Raw provider payloads are never shown to the UI. */
function describeSendError(err: unknown): string {
  const anyErr = err as { output?: { statusCode?: number; payload?: { message?: string } }; message?: string };
  const statusCode = anyErr?.output?.statusCode;
  const providerMessage = anyErr?.output?.payload?.message;

  if (statusCode === 404) return "This WhatsApp number is not reachable (not on WhatsApp).";
  if (statusCode === 401 || statusCode === 403) return "The WhatsApp session is not authorised. Reconnect and rescan the QR code.";
  if (statusCode === 429) return "WhatsApp rate limit reached. Will retry automatically.";
  if (statusCode === 500) return "WhatsApp server error. Will retry automatically.";
  if (providerMessage) return `WhatsApp rejected the message: ${providerMessage}`;
  if (anyErr?.message) return anyErr.message;
  return "Unknown WhatsApp delivery error.";
}