// Class reminder scheduler.
//
// Runs INSIDE the worker process, not in a browser (section 18). Corhaus is a
// studio-wide system with no branch-level scheduling configuration, so the
// class_reminder template's own offset_minutes is the source of truth and
// whatsapp_settings.reminder_minutes is the global default used when the
// template has no offset.
//
// All class times are interpreted as Asia/Kolkata inside the SQL function
// (migration 056), so the worker itself does not need to reason about zones.

import { db, readSettings } from "./db";

const TICK_MS = 60_000; // one minute

export function startReminderScheduler(): NodeJS.Timeout {
  let inFlight = false;

  const tick = async () => {
    // Never overlap: a slow tick must not double-fire the next one. Combined
    // with the idempotency key in SQL, duplicates are impossible anyway.
    if (inFlight) return;
    inFlight = true;
    try {
      const settings = await readSettings();
      if (!settings?.reminder_enabled) return;

      const { data, error } = await db().rpc("enqueue_class_reminders", {
        p_offset_minutes: settings.reminder_minutes ?? null,
      });
      if (error) {
        console.error("[worker] enqueue_class_reminders failed:", error.message);
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as
        | { enqueued?: number; skipped_unresolvable?: number }
        | null;

      if (row && (row.enqueued ?? 0) > 0) {
        console.log(
          `[worker] reminder tick: queued ${row.enqueued} reminder(s)` +
            (row.skipped_unresolvable
              ? `, ${row.skipped_unresolvable} skipped (no usable phone number)`
              : "")
        );
      }
    } catch (err) {
      console.error("[worker] reminder scheduler error:", err);
    } finally {
      inFlight = false;
    }
  };

  console.log(`[worker] reminder scheduler started (every ${TICK_MS / 1000}s, Asia/Kolkata)`);
  void tick();
  return setInterval(tick, TICK_MS);
}