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
    // bookings.member_id FK references profiles(id) = auth.uid()
    // Use user.id for ownership check; use amData.id for plan queries
    const memberId = user.id;           // auth UUID → used for ownership check
    const approvedMemberId = amData.id; // approved_members UUID → used for plan queries

    // 4. Fetch the booking
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("*, classes(class_date, class_time)")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingErr || !booking) {
      // Check if this bookingId belongs to pt_sessions table
      const { data: ptSess } = await supabase
        .from("pt_sessions")
        .select("*")
        .eq("id", bookingId)
        .maybeSingle();

      if (ptSess) {
        // Verify ownership (by approved_members ID or auth UID)
        if (ptSess.member_id !== approvedMemberId && ptSess.member_id !== memberId) {
          return NextResponse.json({ error: "Unauthorized: You can only cancel your own sessions." }, { status: 403 });
        }

        // Check cancellation window dynamically
        const { getCancellationPolicy } = await import("@/lib/cancellationPolicy");
        const policy = await getCancellationPolicy();
        const cancelWindowMs = (policy.total_minutes || 360) * 60 * 1000;

        const sessDateTime = new Date(`${ptSess.session_date}T${ptSess.session_time}`);
        const now = new Date();
        if (policy.is_active && sessDateTime.getTime() - now.getTime() < cancelWindowMs) {
          const timeLabel = policy.hours > 0 ? `${policy.hours}h${policy.minutes > 0 ? ` ${policy.minutes}m` : ""}` : `${policy.minutes}m`;
          return NextResponse.json({ error: `Cancellation is not allowed within ${timeLabel} of the session start time.` }, { status: 400 });
        }

        if (ptSess.status === "cancelled") {
          return NextResponse.json({ success: true, message: "PT Session is already cancelled." });
        }

        // Mark PT session as cancelled
        await supabase
          .from("pt_sessions")
          .update({ status: "cancelled" })
          .eq("id", bookingId);

        // Restore session credit
        if (ptSess.purchased_plan_id) {
          const { data: plan } = await supabase
            .from("member_purchased_plans")
            .select("id, sessions_total, sessions_remaining")
            .eq("id", ptSess.purchased_plan_id)
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

        return NextResponse.json({ success: true, message: "PT Session cancelled successfully." });
      }

      console.error("Booking lookup error:", bookingErr);
      return NextResponse.json({ error: `Booking not found: ${bookingErr?.message || ""}` }, { status: 404 });
    }

    // 5. Verify ownership — booking must belong to this member
    if (booking.member_id !== memberId) {
      return NextResponse.json({ error: "Unauthorized: You can only cancel your own bookings." }, { status: 403 });
    }

    // 6. Check dynamic cancellation policy server-side
    const classData = (booking.classes as unknown) as { class_date: string; class_time: string } | null;
    if (classData) {
      const { getCancellationPolicy } = await import("@/lib/cancellationPolicy");
      const policy = await getCancellationPolicy();
      const cancelWindowMs = (policy.total_minutes || 360) * 60 * 1000;

      const classDateTime = new Date(`${classData.class_date}T${classData.class_time}`);
      const now = new Date();
      if (policy.is_active && classDateTime.getTime() - now.getTime() < cancelWindowMs) {
        const timeLabel = policy.hours > 0 ? `${policy.hours}h${policy.minutes > 0 ? ` ${policy.minutes}m` : ""}` : `${policy.minutes}m`;
        return NextResponse.json({ error: `Cancellation is not allowed within ${timeLabel} of the class start time.` }, { status: 400 });
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
    let planToRestoreId = (booking as any).purchased_plan_id;
    if (!planToRestoreId) {
      const { data: activePlan } = await supabase
        .from("member_purchased_plans")
        .select("id")
        .eq("approved_member_id", approvedMemberId)
        .eq("status", "active")
        .not("sessions_total", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activePlan) {
        planToRestoreId = activePlan.id;
      }
    }

    if (planToRestoreId && booking.booking_status !== "waitlisted") {
      const { data: plan } = await supabase
        .from("member_purchased_plans")
        .select("id, sessions_total, sessions_remaining")
        .eq("id", planToRestoreId)
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
