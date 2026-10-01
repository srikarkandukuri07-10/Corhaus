// Shared helpers for the /api/admin/whatsapp/* routes.
//
// Authorization reuses Corhaus' existing RBAC (src/lib/rbac.ts) rather than
// introducing a parallel mechanism, per the integration spec. Every route calls
// requireWhatsapp() and gets an authorized service-role client.

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface WhatsappAdmin {
  service: SupabaseClient;
  userId: string;
  email: string;
  role: string;
}

export type AdminResult =
  | { ok: true; admin: WhatsappAdmin }
  | { ok: false; response: NextResponse };

/**
 * Requires an authenticated staff user holding `permission`.
 * Owner bypasses inside verifyApiPermission().
 */
export async function requireWhatsapp(permission: string): Promise<AdminResult> {
  try {
    const supabaseServer = await createServerClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();

    if (!user) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }

    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission(permission);
    if (!check.authorized) return { ok: false, response: check.response! };

    const { getUserRolePermissions } = await import("@/lib/rbac");
    const perms = await getUserRolePermissions(user);

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    return {
      ok: true,
      admin: {
        service,
        userId: user.id,
        email: user.email || "",
        role: perms.role,
      },
    };
  } catch (err) {
    console.error("[whatsapp] authorization error:", err);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unable to verify access." },
        { status: 500 }
      ),
    };
  }
}

/**
 * Append to the WhatsApp audit log (section 34). Never throws: an audit
 * failure must not break the admin action that triggered it.
 */
export async function audit(
  service: SupabaseClient,
  action: string,
  admin: { email: string; role: string },
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await service.from("whatsapp_audit_log").insert({
      action,
      actor_email: admin.email || null,
      actor_role: admin.role || null,
      details: details ? (details as Record<string, unknown>) : null,
    });
  } catch (err) {
    console.error("[whatsapp] audit write failed:", action, err);
  }
}

export const WORKER_STALE_MS = 90_000;

/**
 * Project whatsapp_settings into the safe shape the browser receives.
 * Never includes anything session-related beyond the pairing QR, which the
 * admin must be able to scan.
 */
export function toPublicState(row: Record<string, unknown> | null) {
  if (!row) {
    return {
      connection_status: "DISCONNECTED" as const,
      enabled: false,
      connected_phone: null,
      connected_at: null,
      last_connected_at: null,
      last_disconnected_at: null,
      last_error: null,
      last_error_at: null,
      qr: null,
      qr_expires_at: null,
      worker_online: false,
      worker_heartbeat_at: null,
      reminder_enabled: true,
      reminder_minutes: 45,
      max_send_attempts: 3,
    };
  }

  const heartbeat = row.worker_heartbeat_at as string | null;
  const workerOnline =
    !!heartbeat && Date.now() - new Date(heartbeat).getTime() < WORKER_STALE_MS;

  return {
    connection_status: (row.connection_status ?? "DISCONNECTED") as never,
    enabled: Boolean(row.enabled),
    connected_phone: (row.connected_phone as string | null) ?? null,
    connected_at: (row.connected_at as string | null) ?? null,
    last_connected_at: (row.last_connected_at as string | null) ?? null,
    last_disconnected_at: (row.last_disconnected_at as string | null) ?? null,
    last_error: (row.last_error as string | null) ?? null,
    last_error_at: (row.last_error_at as string | null) ?? null,
    // Only surface a QR that has not expired.
    qr: (row.current_qr as string | null) ?? null,
    qr_expires_at: (row.qr_expires_at as string | null) ?? null,
    worker_online: workerOnline,
    worker_heartbeat_at: heartbeat,
    reminder_enabled: row.reminder_enabled !== false,
    reminder_minutes: (row.reminder_minutes as number) ?? 45,
    max_send_attempts: (row.max_send_attempts as number) ?? 3,
  };
}

export async function readSettings(service: SupabaseClient) {
  const { data, error } = await service
    .from("whatsapp_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Record<string, unknown> | null;
}