import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: "Referral code is required." },
        { status: 400 }
      );
    }

    // Look up referral code (case-insensitive)
    const { data: referralCode, error: codeError } = await serviceClient
      .from("referral_codes")
      .select("*")
      .ilike("code", code.trim())
      .single();

    if (codeError || !referralCode) {
      return NextResponse.json(
        { error: "Referral code not found." },
        { status: 404 }
      );
    }

    // Look up approved member by email (case-insensitive)
    const { data: approvedMember, error: memberError } = await serviceClient
      .from("approved_members")
      .select("full_name")
      .ilike("email", referralCode.member_email)
      .single();

    if (memberError || !approvedMember) {
      return NextResponse.json(
        { error: "Referrer not found in approved members." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        referrerName: approvedMember.full_name,
        referrerEmail: referralCode.member_email,
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
