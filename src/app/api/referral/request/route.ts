import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: Request) {
  try {
    const { referral_code, applicant_name, applicant_email, applicant_phone } =
      await request.json();

    // 1. All fields required and non-empty
    if (!referral_code || !applicant_name || !applicant_email || !applicant_phone) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    const trimmedCode = referral_code.trim();
    const trimmedName = applicant_name.trim();
    const trimmedEmail = applicant_email.trim().toLowerCase();
    const trimmedPhone = applicant_phone.trim();

    if (!trimmedCode || !trimmedName || !trimmedEmail || !trimmedPhone) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    // 2. referral_code must exist in referral_codes table
    const { data: referralCode, error: codeError } = await serviceClient
      .from("referral_codes")
      .select("*")
      .ilike("code", trimmedCode)
      .single();

    if (codeError || !referralCode) {
      return NextResponse.json(
        { error: "Invalid referral code." },
        { status: 400 }
      );
    }

    // 3. applicant_email must NOT be admin email
    if (trimmedEmail === "srikarkandukuri07@gmail.com") {
      return NextResponse.json(
        { error: "This email cannot be used for referral requests." },
        { status: 400 }
      );
    }

    // 4. applicant_email must NOT already exist in approved_members (case-insensitive)
    const { data: existingMemberByEmail } = await serviceClient
      .from("approved_members")
      .select("id")
      .ilike("email", trimmedEmail)
      .single();

    if (existingMemberByEmail) {
      return NextResponse.json(
        { error: "A member with this email already exists." },
        { status: 400 }
      );
    }

    // 5. applicant_phone must NOT already exist in approved_members
    const { data: existingMemberByPhone } = await serviceClient
      .from("approved_members")
      .select("id")
      .eq("phone_number", trimmedPhone)
      .single();

    if (existingMemberByPhone) {
      return NextResponse.json(
        { error: "A member with this phone number already exists." },
        { status: 400 }
      );
    }

    // 6. No pending referral_requests with same email (case-insensitive)
    const { data: pendingByEmail } = await serviceClient
      .from("referral_requests")
      .select("id")
      .ilike("applicant_email", trimmedEmail)
      .eq("status", "pending")
      .single();

    if (pendingByEmail) {
      return NextResponse.json(
        { error: "A pending request with this email already exists." },
        { status: 400 }
      );
    }

    // 7. No pending referral_requests with same phone
    const { data: pendingByPhone } = await serviceClient
      .from("referral_requests")
      .select("id")
      .eq("applicant_phone", trimmedPhone)
      .eq("status", "pending")
      .single();

    if (pendingByPhone) {
      return NextResponse.json(
        { error: "A pending request with this phone number already exists." },
        { status: 400 }
      );
    }

    // 8. Phone must be exactly 10 digits
    if (!/^\d{10}$/.test(trimmedPhone)) {
      return NextResponse.json(
        { error: "Phone number must be exactly 10 digits." },
        { status: 400 }
      );
    }

    // Get referrer info from approved_members
    const { data: referrer, error: referrerError } = await serviceClient
      .from("approved_members")
      .select("full_name")
      .ilike("email", referralCode.member_email)
      .single();

    if (referrerError || !referrer) {
      return NextResponse.json(
        { error: "Referrer not found." },
        { status: 400 }
      );
    }

    // Insert into referral_requests
    const { error: insertError } = await serviceClient
      .from("referral_requests")
      .insert({
        referral_code: trimmedCode,
        referrer_email: referralCode.member_email,
        referrer_name: referrer.full_name,
        applicant_name: trimmedName,
        applicant_email: trimmedEmail,
        applicant_phone: trimmedPhone,
        status: "pending",
      });

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to create referral request." },
        { status: 400 }
      );
    }

    // Insert admin notification
    await serviceClient.from("admin_notifications").insert({
      type: "referral_request",
      email: trimmedEmail,
      message: `New referral request from ${trimmedName} (referred by ${referrer.full_name})`,
      is_read: false,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
