import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function parseAsIst(dateStr: string, timeStr: string): number {
  const iso = `${dateStr}T${timeStr}`;
  const d = new Date(iso);
  const browserOffset = -d.getTimezoneOffset() * 60 * 1000;
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  return d.getTime() + (IST_OFFSET - browserOffset);
}

export async function POST(req: Request) {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please log in to mark attendance." }, { status: 401 });

    const body = await req.json();
    const qrData = body.qrData as string;
    const selectedClassId = body.classId as string | undefined;

    if (!qrData) return NextResponse.json({ error: "This is not a valid Corhaus attendance QR code." }, { status: 400 });

    // Validate static QR token
    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    let staticToken: string | null = null;
    try {
      const { data } = await service.from("attendance_config").select("static_token").eq("id", "default").maybeSingle();
      staticToken = data?.static_token || null;
    } catch {}

    // Parse QR data - should be JSON with type and token, or just the token string
    let qrToken: string | null = null;
    try {
      const parsed = JSON.parse(qrData);
      if (parsed.type === "corhaus-attendance" && parsed.token) qrToken = parsed.token;
      else if (parsed.token) qrToken = parsed.token;
      else if (typeof parsed === "string") qrToken = parsed;
    } catch {
      // If not JSON, treat qrData as raw token string
      qrToken = qrData;
    }

    // Validate against static token if we have one
    if (staticToken && qrToken !== staticToken) {
      // Also allow the fallback static string for DBs not yet migrated
      if (qrToken !== "corhaus-attendance-static" && qrData !== "corhaus-attendance-static") {
        return NextResponse.json({ error: "This is not a valid Corhaus attendance QR code." }, { status: 400 });
      }
    } else if (!staticToken && qrToken !== "corhaus-attendance-static" && qrData !== "corhaus-attendance-static") {
      // If no DB token, only allow the fallback
      // For flexibility, allow any QR that contains "corhaus-attendance" type
      try {
        const parsed = JSON.parse(qrData);
        if (parsed.type !== "corhaus-attendance") return NextResponse.json({ error: "This is not a valid Corhaus attendance QR code." }, { status: 400 });
      } catch {
        return NextResponse.json({ error: "This is not a valid Corhaus attendance QR code." }, { status: 400 });
      }
    }

    // Find member's approved record
    const email = user.email?.toLowerCase();
    let memberId: string | null = null;
    let memberName: string | null = null;
    if (email) {
      const { data: am } = await service.from("approved_members").select("id, full_name, membership_status").ilike("email", email).maybeSingle();
      if (am) {
        if (am.membership_status === "frozen" || am.membership_status === "cancelled") {
          return NextResponse.json({ error: "Your membership is currently not active." }, { status: 403 });
        }
        memberId = am.id;
        memberName = am.full_name;
      }
    }
    // Also consider auth uid as memberId for bookings that use profiles.id
    const memberIds = [user.id];
    if (memberId) memberIds.push(memberId);
    // Find eligible bookings - check both approved_member_id and auth uid
    const { data: bookings } = await service.from("bookings").select("id, class_id, booking_status, member_id").in("member_id", memberIds).in("booking_status", ["booked", "confirmed", "checked_in"]);
    if (!bookings || bookings.length === 0) {
      return NextResponse.json({ error: "You do not have an eligible class booking for attendance at this time." }, { status: 404 });
    }

    // Find classes for those bookings
    const classIds = bookings.map(b => b.class_id);
    const { data: classes } = await service.from("classes").select("id, title, class_date, class_time, instructor").in("id", classIds);
    if (!classes || classes.length === 0) {
      return NextResponse.json({ error: "You do not have an eligible class booking for attendance at this time." }, { status: 404 });
    }

    const now = Date.now();
    const eligible: Array<{ booking: any; cls: any }> = [];

    for (const booking of bookings) {
      const cls = classes.find(c => c.id === booking.class_id);
      if (!cls) continue;
      const classStart = parseAsIst(cls.class_date, cls.class_time);
      const classExpiry = classStart + 60 * 60 * 1000; // 1 hour after start
      // Allow scanning right after booking — only block if already expired (1h after start)
      if (now >= classExpiry) continue; // expired
      eligible.push({ booking, cls });
    }

    if (eligible.length === 0) {
      return NextResponse.json({ error: "You do not have an eligible class booking for attendance at this time." }, { status: 404 });
    }

    // If multiple eligible and no classId selected, ask to choose
    if (eligible.length > 1 && !selectedClassId) {
      return NextResponse.json({ error: "Multiple eligible classes found", eligibleClasses: eligible.map(e => e.cls) }, { status: 300 });
    }

    let chosen = eligible[0];
    if (selectedClassId) {
      const found = eligible.find(e => e.cls.id === selectedClassId);
      if (!found) return NextResponse.json({ error: "Invalid class selection" }, { status: 400 });
      chosen = found;
    } else if (eligible.length > 1) {
      // If multiple but no selection, don't arbitrarily choose - already handled above
      return NextResponse.json({ error: "Multiple eligible classes found", eligibleClasses: eligible.map(e => e.cls) }, { status: 300 });
    }

    // Check duplicate
    const { data: existing } = await service.from("attendance").select("id, attendance_status").eq("booking_id", chosen.booking.id).eq("attendance_status", "attended").maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Your attendance has already been marked for this class.", existing: true }, { status: 409 });
    }
    // Also check by class and member
    const { data: existing2 } = await service.from("attendance").select("id").eq("class_id", chosen.cls.id).eq("member_id", user.id).eq("attendance_status", "attended").maybeSingle();
    if (existing2) {
      return NextResponse.json({ error: "Your attendance has already been marked for this class.", existing: true }, { status: 409 });
    }

    // Mark attendance
    const token = chosen.booking.id + "_" + Date.now(); // For static QR, we generate a token based on booking
    const { error: insertError } = await service.from("attendance").insert({
      booking_id: chosen.booking.id,
      class_id: chosen.cls.id,
      member_id: user.id,
      attendance_token: token,
      attendance_status: "attended",
      scanned_at: new Date().toISOString(),
    });

    if (insertError) {
      // If duplicate due to race, return already marked
      if (insertError.code === "23505") return NextResponse.json({ error: "Your attendance has already been marked for this class." }, { status: 409 });
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Sync booking
    try {
      await service.from("bookings").update({ booking_status: "checked_in", attendance_status: "present", checked_in_at: new Date().toISOString() }).eq("id", chosen.booking.id);
    } catch {}

    // Fetch profile for response
    const { data: profile } = await service.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();

    return NextResponse.json({
      success: true,
      message: "Attendance Marked Successfully",
      member: { full_name: profile?.full_name || memberName || "Member", email: profile?.email || email },
      className: chosen.cls.title,
      classDate: chosen.cls.class_date,
      classTime: chosen.cls.class_time,
      instructor: chosen.cls.instructor,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
