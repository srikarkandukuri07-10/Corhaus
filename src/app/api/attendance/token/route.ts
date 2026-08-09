import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function parseClassTimeAsIst(dateStr: string, timeStr: string): number {
  if (!dateStr || !timeStr) return 0;
  let hours = 0;
  let minutes = 0;
  const timeUpper = timeStr.trim().toUpperCase();
  const isPm = timeUpper.includes("PM");
  const isAm = timeUpper.includes("AM");
  const cleanTime = timeUpper.replace(/(AM|PM)/g, "").trim();
  const parts = cleanTime.split(":");
  if (parts.length >= 1) hours = parseInt(parts[0], 10) || 0;
  if (parts.length >= 2) minutes = parseInt(parts[1], 10) || 0;
  if (isPm && hours < 12) hours += 12;
  if (isAm && hours === 12) hours = 0;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const isoStr = `${dateStr}T${hh}:${mm}:00+05:30`;
  return new Date(isoStr).getTime();
}

export async function POST(req: Request) {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { bookingId, classId, memberId, isPtSession } = await req.json();

    if (!bookingId || !classId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify class timing (QR expires 1 hour after class start time)
    if (!isPtSession) {
      const { data: clsData } = await supabaseService
        .from("classes")
        .select("class_date, class_time")
        .eq("id", classId)
        .maybeSingle();

      if (clsData?.class_date && clsData?.class_time) {
        const classStart = parseClassTimeAsIst(clsData.class_date, clsData.class_time);
        const classExpiry = classStart + 60 * 60 * 1000; // 1 hour after class start time
        if (Date.now() >= classExpiry) {
          return NextResponse.json(
            { error: "QR code expired. Attendance QR is only valid up to 1 hour after class start time." },
            { status: 410 }
          );
        }
      }
    }

    if (isPtSession) {
      const token = crypto.randomUUID();
      const { error } = await supabaseService.from("attendance").insert({
        booking_id: bookingId,
        class_id: classId,
        member_id: user.id,
        attendance_token: token,
        attendance_status: "pending",
      });
      if (error) {
        return NextResponse.json({ error: "Failed to generate attendance token" }, { status: 500 });
      }
      return NextResponse.json({ token });
    }

    // Retrieve approved member ID for the current logged-in user
    const { data: amData } = await supabaseServer
      .from("approved_members")
      .select("id")
      .eq("email", user.email || "")
      .maybeSingle();
    const approvedMemberId = amData?.id;

    const { data: booking, error: bookingError } = await supabaseServer
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .or(`member_id.eq.${user.id},member_id.eq.${approvedMemberId || user.id}`)
      .maybeSingle();

    if (bookingError || !booking) {
      return NextResponse.json({ error: "Unauthorized booking access" }, { status: 403 });
    }

    const token = crypto.randomUUID();

    const { error } = await supabaseService.from("attendance").insert({
      booking_id: bookingId,
      class_id: classId,
      member_id: user.id,
      attendance_token: token,
      attendance_status: "pending",
    });

    if (error) {
      return NextResponse.json({ error: "Failed to generate attendance token" }, { status: 500 });
    }

    return NextResponse.json({ token });
  } catch (e) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
