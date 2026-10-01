import { NextResponse } from "next/server";
import { requireWhatsapp } from "@/lib/whatsapp/admin";
import { JOB_STATUSES, type JobStatus } from "@/lib/whatsapp/types";

// Message history (section 22). Branch-scoped to the admin's active location so
// a manager cannot read another branch's member phone numbers.

export async function GET(req: Request) {
  const auth = await requireWhatsapp("whatsapp.view");
  if (!auth.ok) return auth.response;

  try {
    const { service } = auth.admin;
    const url = new URL(req.url);

    const statusFilter = url.searchParams.get("status");
    const templateFilter = url.searchParams.get("template_key");
    const search = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(
      200,
      Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10) || 100)
    );

    let query = service
      .from("whatsapp_message_jobs")
      .select(
        "id, template_key, member_id, booking_id, class_id, recipient_phone, message_body, status, attempt_count, last_attempt_at, sent_at, failed_at, error_message, provider_message_id, scheduled_for, trigger_type, created_at, approved_members(full_name)"
      );

    if (statusFilter && statusFilter !== "ALL") {
      if (!JOB_STATUSES.includes(statusFilter as JobStatus)) {
        return NextResponse.json(
          { error: `Unknown status "${statusFilter}".` },
          { status: 400 }
        );
      }
      query = query.eq("status", statusFilter);
    }

    if (templateFilter && templateFilter !== "ALL") {
      query = query.eq("template_key", templateFilter);
    }

    // Branch isolation, matching the RLS policy the browser client would hit.
    const { getLocationAccess, resolveActiveLocation } = await import("@/lib/location");
    const locAccess = await getLocationAccess({ id: auth.admin.userId, email: auth.admin.email });
    const locationId = resolveActiveLocation(locAccess, req);
    if (locationId) {
      query = query.eq("location_id", locationId);
    }

    query = query.order("created_at", { ascending: false }).limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error("[whatsapp] jobs read failed:", error.message);
      return NextResponse.json(
        { error: "Unable to load message history." },
        { status: 500 }
      );
    }

    let rows = (data ?? []) as Array<Record<string, unknown>>;

    if (search) {
      const needle = search.toLowerCase();
      rows = rows.filter((r) => {
        const member = r.approved_members as { full_name?: string } | null;
        return (
          String(r.recipient_phone ?? "").toLowerCase().includes(needle) ||
          String(r.template_key ?? "").toLowerCase().includes(needle) ||
          String(member?.full_name ?? "").toLowerCase().includes(needle)
        );
      });
    }

    return NextResponse.json({
      jobs: rows.map((r) => {
        const member = r.approved_members as { full_name?: string } | null;
        return {
          id: r.id,
          template_key: r.template_key,
          member_id: r.member_id,
          member_name: member?.full_name ?? null,
          booking_id: r.booking_id,
          class_id: r.class_id,
          recipient_phone: r.recipient_phone,
          message_body: r.message_body,
          status: r.status,
          attempt_count: r.attempt_count,
          sent_at: r.sent_at,
          failed_at: r.failed_at,
          scheduled_for: r.scheduled_for,
          error_message: r.error_message,
          provider_message_id: r.provider_message_id,
          trigger_type: r.trigger_type,
          created_at: r.created_at,
        };
      }),
    });
  } catch (err) {
    console.error("[whatsapp] jobs route error:", err);
    return NextResponse.json(
      { error: "Unable to load message history." },
      { status: 500 }
    );
  }
}
