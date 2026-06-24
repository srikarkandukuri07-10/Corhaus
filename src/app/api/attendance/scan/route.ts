import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const { bookingId, token } = await req.json();

  if (!bookingId || !token) {
    return NextResponse.json({ error: "Missing QR data" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: record, error: findError } = await supabase
    .from("attendance")
    .select("*")
    .eq("booking_id", bookingId)
    .eq("attendance_token", token)
    .maybeSingle();

  if (findError || !record) {
    return NextResponse.json({ error: "Invalid or expired QR code" }, { status: 404 });
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
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", record.member_id)
    .single();

  return NextResponse.json({ success: true, member: profile });
}
