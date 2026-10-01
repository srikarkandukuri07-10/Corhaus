import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Thin Supabase wrapper for the worker. Uses the service role key because the
// worker is a trusted backend component: it must claim and settle message jobs,
// and it is the only writer of whatsapp_settings.connection_status.

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. See worker/README.md."
    );
  }
  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

export interface SettingsRow {
  id: string;
  enabled: boolean;
  connection_status: string;
  connected_phone: string | null;
  connected_at: string | null;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  current_qr: string | null;
  qr_expires_at: string | null;
  reminder_enabled: boolean;
  reminder_minutes: number;
  max_send_attempts: number;
  worker_heartbeat_at: string | null;
  worker_id: string | null;
}

export async function readSettings(): Promise<SettingsRow | null> {
  const { data, error } = await db()
    .from("whatsapp_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SettingsRow) ?? null;
}

export async function patchSettings(patch: Record<string, unknown>): Promise<void> {
  const { error } = await db()
    .from("whatsapp_settings")
    .update(patch)
    .eq("id", "default");
  if (error) throw new Error(error.message);
}

export interface JobRow {
  id: string;
  template_key: string;
  template_id: string | null;
  member_id: string;
  booking_id: string | null;
  class_id: string | null;
  location_id: string | null;
  recipient_phone: string;
  message_body: string;
  status: string;
  attempt_count: number;
  scheduled_for: string;
  idempotency_key: string;
  trigger_type: string;
}

export async function writeAudit(
  action: string,
  details?: Record<string, unknown>,
  actor?: { email: string; role: string }
): Promise<void> {
  try {
    await db().from("whatsapp_audit_log").insert({
      action,
      actor_email: actor?.email ?? null,
      actor_role: actor?.role ?? "worker",
      details: details ?? null,
    });
  } catch (err) {
    // Auditing must never break message delivery.
    console.error("[worker] audit write failed", action, err);
  }
}