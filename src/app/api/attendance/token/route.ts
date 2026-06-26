import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { bookingId, classId } = await req.json();

    if (!bookingId || !classId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify that the booking belongs to the authenticated user
    const { data: booking, error: bookingError } = await supabaseServer
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .eq("member_id", user.id)
      .maybeSingle();

    if (bookingError || !booking) {
      return NextResponse.json({ error: "Unauthorized booking access" }, { status: 403 });
    }

    const token = crypto.randomUUID();

    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabaseService.from("attendance").insert({
      booking_id: bookingId,
      class_id: classId,
      member_id: user.id, // Derived securely from authenticated session
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

