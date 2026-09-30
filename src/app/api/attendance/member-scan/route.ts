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

// The reception QR opens 30 minutes before a session and closes one hour after
// it ends, so members can scan on arrival and shortly after a late finish.
const SCAN_OPEN_LEAD_MS = 30 * 60 * 1000;
const SCAN_CLOSE_GRACE_MS = 60 * 60 * 1000;

type PtSessionRow = {
  id: string;
  member_id: string;
  trainer_name: string;
  session_date: string;
  session_time: string;
  duration_minutes: number | null;
  status: string;
  location_id: string | null;
};

type ClassRow = {
  id: string;
  title: string;
  class_date: string;
  class_time: string;
  instructor: string;
  location_id: string | null;
};

type BookingRow = {
  id: string;
  class_id: string;
  booking_status: string;
  member_id: string;
};

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
    let memberBranch: string | null = null;
    if (email) {
      const { data: am } = await service.from("approved_members").select("id, full_name, membership_status, location_id").ilike("email", email).maybeSingle();
      if (am) {
        if (am.membership_status === "frozen" || am.membership_status === "cancelled") {
          return NextResponse.json({ error: "Your membership is currently not active." }, { status: 403 });
        }
        memberId = am.id;
        memberName = am.full_name;
        memberBranch = (am as any).location_id || null;
      }
    }
    // Also consider auth uid as memberId for bookings that use profiles.id
    const memberIds = [user.id];
    if (memberId) memberIds.push(memberId);
    const now = Date.now();

    // PT sessions live in their own table (attendance.class_id is a UUID FK to
    // `classes`, so a PT row cannot be stored there). pt_sessions.status is the
    // attendance record for PT: scanning marks the session 'completed'.
    const { data: ptSessions } = (await service
      .from("pt_sessions")
      .select("id, member_id, trainer_name, session_date, session_time, duration_minutes, status, location_id")
      .in("member_id", memberIds)
      .in("status", ["scheduled", "completed"])) as { data: PtSessionRow[] | null };

    const ptInWindow: PtSessionRow[] = [];
    for (const s of ptSessions || []) {
      if (memberBranch && s.location_id && s.location_id !== memberBranch) continue;
      const start = parseAsIst(s.session_date, s.session_time);
      const end = start + (s.duration_minutes || 60) * 60 * 1000;
      if (now < start - SCAN_OPEN_LEAD_MS) continue;
      if (now > end + SCAN_CLOSE_GRACE_MS) continue;
      ptInWindow.push(s);
    }

    const ptEligible: Array<{
      id: string;
      title: string;
      class_date: string;
      class_time: string;
      instructor: string;
      sessionId: string;
      branch: string | null;
    }> = [];

    for (const s of ptInWindow) {
      if (s.status === "completed") continue; // already attended — not pickable
      ptEligible.push({
        id: `pt_${s.id}`,
        title: `PT Session with ${s.trainer_name}`,
        class_date: s.session_date,
        class_time: (s.session_time || "").substring(0, 5),
        instructor: s.trainer_name,
        sessionId: s.id,
        branch: s.location_id || memberBranch || null,
      });
    }

    // An explicit pt_ selection short-circuits the class-booking lookup: the
    // member tapped "Scan Attendance QR" on a specific PT card.
    const wantsPt = Boolean(selectedClassId && selectedClassId.startsWith("pt_"));

    // Find eligible bookings - check both approved_member_id and auth uid
    const { data: bookingsRaw } = (await service
      .from("bookings")
      .select("id, class_id, booking_status, member_id")
      .in("member_id", memberIds)
      .in("booking_status", ["booked", "confirmed", "checked_in"])) as { data: BookingRow[] | null };
    const bookings: BookingRow[] = bookingsRaw || [];

    const classCandidates: Array<{ booking: BookingRow; cls: ClassRow }> = [];
    if (!wantsPt) {
      // Find classes for those bookings
      const classIds = bookings.map((b) => b.class_id);
      const { data: classesRaw } = classIds.length
        ? await service.from("classes").select("id, title, class_date, class_time, instructor, location_id").in("id", classIds)
        : { data: [] as ClassRow[] };
      const classes: ClassRow[] = classesRaw || [];

      for (const booking of bookings) {
        const cls = classes.find((c) => c.id === booking.class_id);
        if (!cls) continue;
        // Branch isolation: members may only scan into own-branch classes.
        if (memberBranch && cls.location_id && cls.location_id !== memberBranch) continue;
        const classStart = parseAsIst(cls.class_date, cls.class_time);
        const classExpiry = classStart + 60 * 60 * 1000; // 1 hour after start
        // Allow scanning right after booking — only block if already expired (1h after start)
        if (now >= classExpiry) continue; // expired
        classCandidates.push({ booking, cls });
      }
    }

    const totalEligible = classCandidates.length + ptEligible.length;
    if (totalEligible === 0) {
      return NextResponse.json({ error: "You do not have an eligible class or PT booking for attendance at this time." }, { status: 404 });
    }

    // A specific PT session was requested — verify it is genuinely eligible.
    if (wantsPt) {
      const ptSessionId = selectedClassId!.replace(/^pt_/, "");
      const already = ptInWindow.find((s) => s.id === ptSessionId && s.status === "completed");
      if (already) {
        return NextResponse.json({ error: "Your attendance has already been marked for this PT session.", existing: true }, { status: 409 });
      }
      const chosenPt = ptEligible.find((p) => p.id === selectedClassId);
      if (!chosenPt) {
        return NextResponse.json({ error: "This PT session is not open for attendance scanning right now." }, { status: 404 });
      }

      const { data: ptMarked, error: ptErr } = await service
        .from("pt_sessions")
        .update({ status: "completed" })
        .eq("id", chosenPt.sessionId)
        .eq("status", "scheduled")
        .select("id");
      if (ptErr) {
        return NextResponse.json({ error: "Failed to mark PT session attendance" }, { status: 500 });
      }
      // Lost the race — someone (usually the trainer) already marked it.
      if (!ptMarked || ptMarked.length === 0) {
        return NextResponse.json({ error: "Your attendance has already been marked for this PT session.", existing: true }, { status: 409 });
      }

      const { data: profilePt } = await service.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
      return NextResponse.json({
        success: true,
        message: "Attendance Marked Successfully",
        member: { full_name: profilePt?.full_name || memberName || "Member", email: profilePt?.email || email },
        className: chosenPt.title,
        classDate: chosenPt.class_date,
        classTime: chosenPt.class_time,
        instructor: chosenPt.instructor,
      });
    }

    // If multiple eligible and no classId selected, ask to choose
    if (totalEligible > 1 && !selectedClassId) {
      return NextResponse.json(
        { error: "Multiple eligible classes found", eligibleClasses: [...classCandidates.map((c) => c.cls), ...ptEligible] },
        { status: 300 }
      );
    }

    // Only PT sessions are open — mark the soonest one.
    if (classCandidates.length === 0 && ptEligible.length > 0) {
      const soonest = ptEligible[0];
      const { data: ptMarked2, error: ptErr2 } = await service
        .from("pt_sessions")
        .update({ status: "completed" })
        .eq("id", soonest.sessionId)
        .eq("status", "scheduled")
        .select("id");
      if (ptErr2) {
        return NextResponse.json({ error: "Failed to mark PT session attendance" }, { status: 500 });
      }
      if (!ptMarked2 || ptMarked2.length === 0) {
        return NextResponse.json({ error: "Your attendance has already been marked for this PT session.", existing: true }, { status: 409 });
      }
      const { data: profilePt2 } = await service.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
      return NextResponse.json({
        success: true,
        message: "Attendance Marked Successfully",
        member: { full_name: profilePt2?.full_name || memberName || "Member", email: profilePt2?.email || email },
        className: soonest.title,
        classDate: soonest.class_date,
        classTime: soonest.class_time,
        instructor: soonest.instructor,
      });
    }

    if (classCandidates.length === 0) {
      return NextResponse.json({ error: "You do not have an eligible class booking for attendance at this time." }, { status: 404 });
    }

    let chosen = classCandidates[0];
    if (selectedClassId) {
      const found = classCandidates.find((e) => e.cls.id === selectedClassId);
      if (!found) return NextResponse.json({ error: "Invalid class selection" }, { status: 400 });
      chosen = found;
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
    const scanBranch = ((chosen.cls as any).location_id || memberBranch || null) as string | null;
    const { error: insertError } = await service.from("attendance").insert({
      booking_id: chosen.booking.id,
      class_id: chosen.cls.id,
      member_id: user.id,
      attendance_token: token,
      attendance_status: "attended",
      scanned_at: new Date().toISOString(),
      ...(scanBranch ? { location_id: scanBranch } : {}),
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
