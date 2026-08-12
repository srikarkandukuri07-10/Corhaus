import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/constants";

async function verifyAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin" || isAdminEmail(user.email);
  if (!isAdmin) {
    return { error: "Forbidden", status: 403 };
  }

  return { user };
}

export async function POST(req: Request) {
  try {
    const authCheck = await verifyAdmin();
    if ("error" in authCheck) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { bookingId, token } = await req.json();

    if (!bookingId || !token) {
      return NextResponse.json({ error: "Missing QR data" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

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

    const { data: record, error: findError } = await supabase
      .from("attendance")
      .select("*")
      .eq("booking_id", bookingId)
      .eq("attendance_token", token)
      .maybeSingle();

    if (findError || !record) {
      return NextResponse.json({ error: "Invalid or expired QR code" }, { status: 404 });
    }

    // Verify class timing (QR expires 1 hour after class start time)
    if (record.class_id) {
      const { data: clsData } = await supabase
        .from("classes")
        .select("class_date, class_time")
        .eq("id", record.class_id)
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

    if (record.attendance_status === "attended") {
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", record.member_id)
        .single();

      return NextResponse.json({
        error: "Attendance already recorded",
        member: existingProfile,
      }, { status: 409 });
    }

    const { error: updateError } = await supabase
      .from("attendance")
      .update({
        attendance_status: "attended",
        scanned_at: new Date().toISOString(),
      })
      .eq("id", record.id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to record attendance" }, { status: 500 });
    }

    // Also update bookings record for immediate reflection across history and admin dashboards
    try {
      await supabase
        .from("bookings")
        .update({
          booking_status: "checked_in",
          attendance_status: "present",
          checked_in_at: new Date().toISOString(),
        })
        .eq("id", record.booking_id);
    } catch (_) {}


    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", record.member_id)
      .single();

    return NextResponse.json({ success: true, member: profile });
  } catch (e: any) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

