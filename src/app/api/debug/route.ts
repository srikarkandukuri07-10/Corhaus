import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: classes, error: ce } = await supabase.from("classes").select("*").order("class_date", { ascending: true }).order("class_time", { ascending: true });
  const { data: bookings, error: be } = await supabase.from("bookings").select("*").eq("booking_status", "booked");
  const { data: attendance, error: ae } = await supabase.from("attendance").select("*");

  return NextResponse.json({
    now_utc: new Date().toISOString(),
    now_epoch: Date.now(),
    classes: classes?.map(c => ({ id: c.id, title: c.title, class_date: c.class_date, class_time: c.class_time, max_capacity: c.max_capacity })) || [],
    classes_error: ce?.message || null,
    bookings_count: bookings?.length || 0,
    bookings_sample: bookings?.slice(0, 3) || [],
    bookings_error: be?.message || null,
    attendance_count: attendance?.length || 0,
    attendance_error: ae?.message || null,
  });
}
