import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { getUserRolePermissions } = await import("@/lib/rbac");
    const userPerms = await getUserRolePermissions(user);
    if (userPerms.role === "Member" || userPerms.role === "Guest") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const sessionIds: string[] = Array.isArray(body.sessionIds)
      ? body.sessionIds
      : body.sessionId
      ? [body.sessionId]
      : [];

    if (sessionIds.length === 0) {
      return NextResponse.json({ error: "No session IDs provided" }, { status: 400 });
    }

    const { handlePtSessionConfirmed } = await import("@/lib/whatsapp/events");

    for (const sid of sessionIds) {
      try {
        await handlePtSessionConfirmed(sid);
      } catch (err) {
        console.error(`[PT Notify API] Error notifying session ${sid}:`, err);
      }
    }

    // Send Web Push notification to members for scheduled PT sessions
    try {
      const { data: ptRows } = await supabase
        .from("pt_sessions")
        .select("id, member_id, trainer_name, session_date, session_time")
        .in("id", sessionIds);

      if (ptRows && ptRows.length > 0) {
        const { sendPushToUser } = await import("@/lib/push/service");
        for (const s of ptRows) {
          if (s.member_id) {
            const dateStr = s.session_date || "upcoming date";
            const timeStr = s.session_time ? ` at ${s.session_time}` : "";
            const trainerStr = s.trainer_name ? ` with ${s.trainer_name}` : "";
            await sendPushToUser(s.member_id, {
              title: "PT Session Booked! 🧘",
              body: `Your Personal Training session${trainerStr} is scheduled on ${dateStr}${timeStr}.`,
              url: "/member/bookings",
              tag: `pt-${s.id}`,
            });
          }
        }
      }
    } catch (pushErr) {
      console.error("[PT Notify API] Push error:", pushErr);
    }

    return NextResponse.json({ success: true, count: sessionIds.length });
  } catch (err: any) {
    console.error("[PT Notify API] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
