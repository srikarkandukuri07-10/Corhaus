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

    const { classId } = await req.json();
    if (!classId) {
      return NextResponse.json({ error: "Missing classId" }, { status: 400 });
    }

    // 2. Use service role for all DB operations (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Look up approved_members ID from user email
    const { data: amData, error: amError } = await supabase
      .from("approved_members")
      .select("id, membership_level")
      .eq("email", user.email || "")
      .maybeSingle();

    if (!amData) {
      return NextResponse.json({ error: "No approved member profile found for your account. Please contact the studio." }, { status: 403 });
    }
    const memberId = amData.id;

    // 4. Check class exists and is active
    const { data: cls } = await supabase
      .from("classes")
      .select("id, max_capacity, is_active, class_date, class_time")
      .eq("id", classId)
      .maybeSingle();

    if (!cls) {
      return NextResponse.json({ error: "Class not found." }, { status: 404 });
    }
    if (cls.is_active === false) {
      return NextResponse.json({ error: "This class is currently inactive." }, { status: 400 });
    }

    // 5. Check not already booked
    const { data: existingBooking } = await supabase
      .from("bookings")
      .select("id, booking_status")
      .eq("class_id", classId)
      .eq("member_id", memberId)
      .not("booking_status", "eq", "cancelled")
      .maybeSingle();

    if (existingBooking) {
      return NextResponse.json({ error: "You are already booked for this class.", bookingId: existingBooking.id }, { status: 409 });
    }

    // 6. Find active purchased plan
    const { data: plan } = await supabase
      .from("member_purchased_plans")
      .select("id, sessions_total, sessions_remaining, status, valid_until, plan_name, invoice_id")
      .eq("approved_member_id", memberId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!plan) {
      // Check if they have any plan at all (even inactive)
      const { data: anyPlan } = await supabase
        .from("member_purchased_plans")
        .select("id, status, valid_until")
        .eq("approved_member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (anyPlan && anyPlan.valid_until && new Date(anyPlan.valid_until) < new Date()) {
        return NextResponse.json({ error: "Your plan has expired. Please renew to book classes." }, { status: 403 });
      }
      return NextResponse.json({ error: "No active plan found. Please contact the studio to activate your membership." }, { status: 403 });
    }

    // 7. Check payment status
    if (plan.invoice_id) {
      const { data: invoice } = await supabase
        .from("invoices")
        .select("payment_status")
        .eq("id", plan.invoice_id)
        .maybeSingle();
      if (invoice?.payment_status === "due") {
        return NextResponse.json({ error: "Payment is required before booking classes. Please contact the studio." }, { status: 403 });
      }
    }

    // 8. Check session credits
    if (plan.sessions_total !== null) {
      if (!plan.sessions_remaining || plan.sessions_remaining <= 0) {
        return NextResponse.json({ error: "No remaining sessions on your plan." }, { status: 403 });
      }
    }

    // 9. Check capacity — waitlist if full
    const { count: currentCount } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("class_id", classId)
      .in("booking_status", ["booked", "confirmed", "checked_in", "completed"]);

    const bookingStatus = (currentCount ?? 0) >= cls.max_capacity ? "waitlisted" : "booked";

    // 10. Insert booking
    const { data: newBooking, error: insertError } = await supabase
      .from("bookings")
      .insert({
        class_id: classId,
        member_id: memberId,
        booking_status: bookingStatus,
        purchased_plan_id: plan.id,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !newBooking) {
      console.error("Booking insert error:", insertError);
      return NextResponse.json({ error: "Failed to create booking. Please try again." }, { status: 500 });
    }

    // 11. Deduct session credit for session-based plans
    if (bookingStatus !== "waitlisted" && plan.sessions_total !== null) {
      await supabase
        .from("member_purchased_plans")
        .update({ sessions_remaining: Math.max(0, (plan.sessions_remaining ?? 1) - 1) })
        .eq("id", plan.id);
    }

    return NextResponse.json({
      success: true,
      bookingId: newBooking.id,
      status: bookingStatus,
      planName: plan.plan_name,
      sessionsRemaining: plan.sessions_total !== null ? Math.max(0, (plan.sessions_remaining ?? 1) - 1) : null,
    });
  } catch (e) {
    console.error("Book class error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
