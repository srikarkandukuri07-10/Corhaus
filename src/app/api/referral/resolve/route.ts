import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: Request) {
  try {
    // 1. Verify admin auth
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 403 }
      );
    }

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden. Admin access required." },
        { status: 403 }
      );
    }

    const { requestId, action } = await request.json();

    if (!requestId || !action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid request. requestId and action (approve/reject) are required." },
        { status: 400 }
      );
    }

    // 3. Look up referral_requests by id
    const { data: referralRequest, error: requestError } = await serviceClient
      .from("referral_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    // 4. If not found or status !== 'pending'
    if (requestError || !referralRequest) {
      return NextResponse.json(
        { error: "Referral request not found." },
        { status: 400 }
      );
    }

    if (referralRequest.status !== "pending") {
      return NextResponse.json(
        { error: "This request has already been processed." },
        { status: 400 }
      );
    }

    // 5. If action === 'reject'
    if (action === "reject") {
      const { error: updateError } = await serviceClient
        .from("referral_requests")
        .update({ status: "rejected" })
        .eq("id", requestId);

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to reject request." },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true }, { status: 200 });
    }

    // 6. If action === 'approve'
    const { error: approveError } = await serviceClient
      .from("referral_requests")
      .update({ status: "approved" })
      .eq("id", requestId);

    if (approveError) {
      return NextResponse.json(
        { error: "Failed to approve request." },
        { status: 400 }
      );
    }

    // 7. Automatic Business Rule: Check if referrer has completed 3 approved referrals
    try {
      const referrerEmail = referralRequest.referrer_email;
      const referrerCode = referralRequest.referral_code;

      if (referrerEmail || referrerCode) {
        let query = serviceClient.from("approved_members").select("id, full_name, email");
        if (referrerCode) {
          query = query.or(`referral_code.eq.${referrerCode},email.eq.${referrerEmail || ""}`);
        } else {
          query = query.eq("email", referrerEmail);
        }

        const { data: referrerMember } = await query.maybeSingle();

        if (referrerMember) {
          let countQuery = serviceClient
            .from("referral_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "approved");

          if (referrerCode) {
            countQuery = countQuery.or(`referral_code.eq.${referrerCode},referrer_email.eq.${referrerEmail || ""}`);
          } else {
            countQuery = countQuery.eq("referrer_email", referrerEmail);
          }

          const { count } = await countQuery;

          if (count && count >= 3) {
            // Check if active referral reward already issued
            const { data: existingReward } = await serviceClient
              .from("member_discounts")
              .select("id")
              .eq("approved_member_id", referrerMember.id)
              .eq("source", "Referral Reward")
              .eq("status", "active")
              .maybeSingle();

            if (!existingReward) {
              // Automatically create 15% Referral Reward discount
              await serviceClient.from("member_discounts").insert({
                approved_member_id: referrerMember.id,
                discount_type: "percentage",
                discount_value: 15,
                source: "Referral Reward",
                reason: "Referral Reward (3 Successful Referrals)",
                status: "active",
                created_by: "System (Automatic Referral Engine)",
              });

              // Notify Member
              await serviceClient.from("admin_notifications").insert({
                type: "member_reward",
                email: referrerMember.email,
                message: "Congratulations! You have successfully referred 3 members. A 15% discount has been added to your account and will automatically be applied to your next eligible bill.",
                is_read: false,
              });

              // Notify Admin
              await serviceClient.from("admin_notifications").insert({
                type: "referral_reward_earned",
                email: "admin@corhaus.com",
                message: `${referrerMember.full_name} has earned a 15% Referral Reward discount.`,
                is_read: false,
              });
            }
          }
        }
      }
    } catch (refErr) {
      console.error("Error evaluating automatic referral discount:", refErr);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: referralRequest.id,
          applicant_name: referralRequest.applicant_name,
          applicant_email: referralRequest.applicant_email,
          applicant_phone: referralRequest.applicant_phone,
          referral_code: referralRequest.referral_code,
          referrer_name: referralRequest.referrer_name,
          referrer_email: referralRequest.referrer_email,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
