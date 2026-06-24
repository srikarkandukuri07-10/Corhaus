import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const { bookingId, classId, memberId } = await req.json();

  if (!bookingId || !classId || !memberId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const token = crypto.randomUUID();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.from("attendance").insert({
    booking_id: bookingId,
    class_id: classId,
    member_id: memberId,
    attendance_token: token,
    attendance_status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ token });
}
