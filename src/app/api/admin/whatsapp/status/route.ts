import { NextResponse } from "next/server";
import {
  readSettings,
  requireWhatsapp,
  toPublicState,
  WORKER_STALE_MS,
} from "@/lib/whatsapp/admin";

// Single source of truth for connection state (section 8). The UI never infers
// state locally; it renders exactly what this returns. Polling this endpoint is
// how QR refresh and lifecycle transitions reach the admin without a manual
// browser refresh (section 7).

export async function GET() {
  const auth = await requireWhatsapp("whatsapp.view");
  if (!auth.ok) return auth.response;

  try {
    const { service } = auth.admin;
    const settings = await readSettings(service);
    const state = toPublicState(settings);

    const nowIso = new Date().toISOString();

    // Health counters (section 35).
    const [sentRes, failedRes, pendingRes, lastSentRes, lastErrorRes, qrCmdRes] =
      await Promise.all([
        service
          .from("whatsapp_message_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "SENT"),
        service
          .from("whatsapp_message_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "FAILED"),
        service
          .from("whatsapp_message_jobs")
          .select("id", { count: "exact", head: true })
          .in("status", ["PENDING", "PROCESSING"]),
        service
          .from("whatsapp_message_jobs")
          .select("sent_at, template_key, recipient_phone, member:approved_members(full_name)")
          .eq("status", "SENT")
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        service
          .from("whatsapp_message_jobs")
          .select("error_message, failed_at, template_key")
          .eq("status", "FAILED")
          .order("failed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        service
          .from("whatsapp_commands")
          .select("id, command, created_at")
          .in("status", ["PENDING", "PROCESSING"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

    const lastSent = lastSentRes.data as {
      sent_at: string | null;
      template_key: string;
      recipient_phone: string;
      member: { full_name: string } | null;
    } | null;

    const lastFailure = lastErrorRes.data as {
      error_message: string | null;
      failed_at: string | null;
      template_key: string;
    } | null;

    const pendingCommand = qrCmdRes.data as {
      id: string;
      command: string;
      created_at: string;
    } | null;

    return NextResponse.json({
      ...state,
      server_time: nowIso,
      stale_after: WORKER_STALE_MS,
      health: {
        messages_sent: sentRes.count ?? 0,
        messages_failed: failedRes.count ?? 0,
        messages_pending: pendingRes.count ?? 0,
        last_message: lastSent
          ? {
              at: lastSent.sent_at,
              template_key: lastSent.template_key,
              member_name: lastSent.member?.full_name ?? null,
              phone: lastSent.recipient_phone,
            }
          : null,
        last_failure: lastFailure
          ? {
              at: lastFailure.failed_at,
              template_key: lastFailure.template_key,
              error: lastFailure.error_message,
            }
          : null,
        pending_command: pendingCommand
          ? {
              id: pendingCommand.id,
              command: pendingCommand.command,
              created_at: pendingCommand.created_at,
              // How long the request has been waiting with nobody to service
              // it. Without this the UI looks identical whether the worker is
              // about to respond or is not running at all.
              waiting_seconds: Math.max(
                0,
                Math.floor((Date.now() - new Date(pendingCommand.created_at).getTime()) / 1000)
              ),
            }
          : null,
      },
    });
  } catch (err) {
    console.error("[whatsapp] status route error:", err);
    return NextResponse.json(
      { error: "Unable to read WhatsApp status." },
      { status: 500 }
    );
  }
}