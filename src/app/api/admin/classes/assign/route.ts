import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin" || user.email === process.env.ADMIN_EMAIL;
  if (!isAdmin) return { error: "Forbidden", status: 403 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { serviceClient, user };
}

export async function POST(req: Request) {
  try {
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    const body = await req.json();
    const { memberId, classId } = body;

    if (!memberId || !classId) {
      return NextResponse.json({ error: "memberId and classId are required." }, { status: 400 });
    }

    // Check if cancelled booking exists
    const { data: existingBooking } = await serviceClient
      .from("bookings")
      .select("id, booking_status")
      .eq("class_id", classId)
      .eq("member_id", memberId)
      .maybeSingle();

    if (existingBooking) {
      if (existingBooking.booking_status === "booked" || existingBooking.booking_status === "confirmed") {
        return NextResponse.json({ success: true, message: "Member is already assigned to this class." });
      }

      const { error: updateError } = await serviceClient
        .from("bookings")
        .update({
          booking_status: "booked",
          notes: "Corhaus invite u to this session",
          cancelled_at: null
        })
        .eq("id", existingBooking.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "Member assigned successfully!" });
    }

    // Otherwise insert new booking record
    const { error: insertError } = await serviceClient
      .from("bookings")
      .insert({
        member_id: memberId,
        class_id: classId,
        booking_status: "booked",
        notes: "Corhaus invite u to this session"
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Member assigned successfully!" });
  } catch (err: any) {
    console.error("POST /api/admin/classes/assign error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
