import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    // 1. Authenticate user
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { bookingId } = await req.json();
    if (!bookingId) {
      return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
    }

    // 2. Use service role for all DB operations (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Look up approved_members ID from user email
    const { data: amData } = await supabase
      .from("approved_members")
      .select("id")
      .eq("email", user.email || "")
      .maybeSingle();

    if (!amData) {
      return NextResponse.json({ error: "No approved member profile found." }, { status: 403 });
    }
    const memberId = amData.id;

    // 4. Fetch the booking
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, class_id, member_id, booking_status, purchased_plan_id, classes(class_date, class_time)")
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    // 5. Verify ownership — booking must belong to this member
    if (booking.member_id !== memberId) {
      return NextResponse.json({ error: "Unauthorized: You can only cancel your own bookings." }, { status: 403 });
    }

    // 6. Check 6-hour cancellation policy server-side
    const classData = (booking.classes as unknown) as { class_date: string; class_time: string } | null;
    if (classData) {
      const classDateTime = new Date(`${classData.class_date}T${classData.class_time}`);
      const sixHoursMs = 6 * 60 * 60 * 1000;
      const now = new Date();
      if (classDateTime.getTime() - now.getTime() < sixHoursMs) {
        return NextResponse.json({ error: "Cancellation is not allowed within 6 hours of the class start time." }, { status: 400 });
      }
    }

    // 7. Already cancelled?
    if (booking.booking_status === "cancelled") {
      return NextResponse.json({ success: true, message: "Booking already cancelled." });
    }

    // 8. Cancel the booking
    await supabase
      .from("bookings")
      .update({ booking_status: "cancelled" })
      .eq("id", bookingId);

    // 9. Restore session credit for session-based plans
    if (booking.purchased_plan_id && booking.booking_status !== "waitlisted") {
      const { data: plan } = await supabase
        .from("member_purchased_plans")
        .select("id, sessions_total, sessions_remaining")
        .eq("id", booking.purchased_plan_id)
        .maybeSingle();

      if (plan && plan.sessions_total !== null) {
        await supabase
          .from("member_purchased_plans")
          .update({
            sessions_remaining: Math.min(plan.sessions_total, (plan.sessions_remaining ?? 0) + 1),
          })
          .eq("id", plan.id);
      }
    }

    return NextResponse.json({ success: true, message: "Booking cancelled successfully." });
  } catch (e) {
    console.error("Cancel booking error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
