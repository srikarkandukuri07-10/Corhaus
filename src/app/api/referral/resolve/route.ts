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
