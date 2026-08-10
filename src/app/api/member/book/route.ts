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
    console.log("[BOOK API] Received classId:", classId);
    if (!classId) {
      return NextResponse.json({ error: "Missing classId" }, { status: 400 });
    }

    // 2. Use service role for all DB operations (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Look up approved_members record for plan lookups
    const cleanEmail = (user.email || "").trim().toLowerCase();
    const { data: amData, error: amError } = await supabase
      .from("approved_members")
      .select("id, membership_level, membership_status, freeze_status")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (amError) {
      console.error("approved_members lookup error:", amError);
      return NextResponse.json({ error: `Profile lookup failed: ${amError.message}` }, { status: 500 });
    }
    if (!amData) {
      return NextResponse.json({ error: "No approved member profile found for your account. Please contact the studio." }, { status: 403 });
    }

    if (amData.membership_status === "frozen" || amData.freeze_status === "frozen") {
      return NextResponse.json({ error: "Your membership is currently frozen. Please resume your membership before booking classes." }, { status: 403 });
    }

    // The bookings table's member_id FK references profiles(id) = auth.uid().
    // Use user.id for the bookings insert; use amData.id only for plan lookups.
    const memberId = user.id;         // auth UUID → satisfies bookings_member_id_fkey
    const approvedMemberId = amData.id; // approved_members UUID → used for plan queries

    // 4. Check class exists — select * to avoid issues with optional columns like is_active
    const { data: cls, error: clsError } = await supabase
      .from("classes")
      .select("*")
      .eq("id", classId)
      .maybeSingle();
    console.log("[BOOK API] Class fetch result:", cls, clsError);

    if (clsError) {
      console.error("Class fetch error:", clsError);
      return NextResponse.json({ error: `Class lookup failed: ${clsError.message}` }, { status: 500 });
    }
    if (!cls) {
      return NextResponse.json({ error: "Class not found." }, { status: 404 });
    }
    // Only block if explicitly set to false (null/undefined means active)
    if (cls.is_active === false) {
      return NextResponse.json({ error: "This class is currently inactive." }, { status: 400 });
    }

    // 5. Check not already booked (check both auth UUID and approved_member UUID for robustness)
    const { data: existingBooking, error: existingError } = await supabase
      .from("bookings")
      .select("id, booking_status")
      .eq("class_id", classId)
      .or(`member_id.eq.${memberId},member_id.eq.${approvedMemberId}`)
      .not("booking_status", "eq", "cancelled")
      .maybeSingle();

    if (existingError) {
      console.error("Existing booking check error:", existingError);
      return NextResponse.json({ error: `Booking check failed: ${existingError.message}` }, { status: 500 });
    }
    if (existingBooking) {
      return NextResponse.json({ error: "You are already booked for this class.", bookingId: existingBooking.id }, { status: 409 });
    }

    // 6. Find active purchased plan — uses approvedMemberId (approved_members.id)
    const { data: plan, error: planError } = await supabase
      .from("member_purchased_plans")
      .select("id, sessions_total, sessions_remaining, status, valid_until, plan_name, invoice_id")
      .eq("approved_member_id", approvedMemberId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planError) {
      console.error("Plan lookup error:", planError);
      return NextResponse.json({ error: `Plan lookup failed: ${planError.message}` }, { status: 500 });
    }

    if (!plan) {
      // Check if they have any plan at all (even inactive/expired)
      const { data: anyPlan } = await supabase
        .from("member_purchased_plans")
        .select("id, status, valid_until")
        .eq("approved_member_id", approvedMemberId)
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
    const { count: currentCount, error: countError } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("class_id", classId)
      .in("booking_status", ["booked", "confirmed", "checked_in", "completed"]);

    if (countError) {
      console.error("Capacity check error:", countError);
    }

    const maxCapacity = cls.max_capacity ?? 10;
    const bookingStatus = (currentCount ?? 0) >= maxCapacity ? "waitlisted" : "booked";

    // 10. Insert booking (try with purchased_plan_id first, fallback without it if column is missing in DB schema)
    let newBooking: { id: string } | null = null;
    let insertError: any = null;

    const resWithPlan = await supabase
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

    newBooking = resWithPlan.data;
    insertError = resWithPlan.error;

    if (insertError && (insertError.message?.includes("purchased_plan_id") || insertError.code === "PGRST204")) {
      console.warn("[BOOK API] purchased_plan_id column not found in bookings table, falling back to insert without it.");
      const resWithoutPlan = await supabase
        .from("bookings")
        .insert({
          class_id: classId,
          member_id: memberId,
          booking_status: bookingStatus,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      newBooking = resWithoutPlan.data;
      insertError = resWithoutPlan.error;
    }

    if (insertError || !newBooking) {
      console.error("Booking insert error:", insertError);
      return NextResponse.json({ error: `Failed to create booking: ${insertError?.message || "unknown error"}` }, { status: 500 });
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
    return NextResponse.json({ error: `Internal server error: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
