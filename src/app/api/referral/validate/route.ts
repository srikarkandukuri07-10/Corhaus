import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    // Rate limit validation: 5 validation requests per 15 minutes per IP
    const { success, retryAfter } = await rateLimit(ip, "referral_validate", 5, 15 * 60 * 1000);
    if (!success) {
      return NextResponse.json(
        { error: `Too many validation attempts. Please try again after ${retryAfter} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { code } = await request.json();

    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json(
        { error: "Referral code is required." },
        { status: 400 }
      );
    }

    const serviceClient = getServiceClient();

    // Look up referral code (case-insensitive)
    const { data: referralCode, error: codeError } = await serviceClient
      .from("referral_codes")
      .select("*")
      .ilike("code", code.trim())
      .single();

    // Generic error message for non-existent/expired codes to prevent code enumeration
    const invalidResponse = NextResponse.json(
      { error: "Invalid referral code." },
      { status: 400 }
    );

    if (codeError || !referralCode) {
      return invalidResponse;
    }

    // Look up approved member by email (case-insensitive)
    const { data: approvedMember, error: memberError } = await serviceClient
      .from("approved_members")
      .select("full_name, membership_status")
      .ilike("email", referralCode.member_email)
      .single();

    if (memberError || !approvedMember || (approvedMember.membership_status || "").toLowerCase() !== "active") {
      return invalidResponse;
    }

    // Never return email - return only full name to front-end (C-3)
    return NextResponse.json(
      {
        referrerName: approvedMember.full_name,
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
