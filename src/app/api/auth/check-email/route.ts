import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail, isDeveloperEmail } from "@/lib/constants";
import { rateLimit } from "@/lib/rateLimit";
import { normalizePhoneNumber } from "@/lib/auth-canonical";

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
    // Rate limit check-email requests: 20 per 15 minutes per IP
    const { success, retryAfter } = await rateLimit(ip, "check-email", 20, 15 * 60 * 1000);
    if (!success) {
      return NextResponse.json(
        { approved: false, accountType: "unrecognized", error: `Too many attempts. Please try again after ${retryAfter} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { email, phone } = await request.json();
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedPhone = normalizePhoneNumber(phone);

    if (!normalizedEmail && !normalizedPhone) {
      return NextResponse.json(
        { approved: false, accountType: "unrecognized", error: "Please enter your phone number and email address." },
        { status: 400 }
      );
    }

    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json(
        { approved: false, accountType: "unrecognized", error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const serviceClient = getServiceClient();

    // Helper: checks if user has established a password in Supabase Auth
    async function checkUserHasPassword(targetEmail: string) {
      if (!targetEmail) return false;
      try {
        const { data: usersData } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existingUser = (usersData?.users || []).find(
          (u) => u.email?.trim().toLowerCase() === targetEmail.toLowerCase()
        );
        if (
          existingUser?.user_metadata?.has_password ||
          existingUser?.user_metadata?.password_set_at ||
          (existingUser?.identities && existingUser.identities.some((i: any) => i.provider === "email" && (existingUser as any).encrypted_password))
        ) {
          return true;
        }
      } catch (_) {}
      return false;
    }

    // ─── 1. DEVELOPER / SUPPORT CHECK ──────────────────────────────────────────
    if (normalizedEmail && isDeveloperEmail(normalizedEmail)) {
      const hasPassword = await checkUserHasPassword(normalizedEmail);
      return NextResponse.json({
        approved: true,
        accountType: "developer",
        hasPassword,
        isFirstLogin: !hasPassword,
        email: normalizedEmail,
        name: "Developer",
      });
    }

    // ─── 2. CHECK PHONE FIRST (Staff or Member) ───────────────────────────────
    if (normalizedPhone) {
      // (a) Check Staff by Phone
      const { data: staffList } = await serviceClient
        .from("staff_members")
        .select("id, role, full_name, email, phone_number, employment_status");

      const matchingStaff = (staffList || []).find(
        (s) => normalizePhoneNumber(s.phone_number) === normalizedPhone
      );

      if (matchingStaff) {
        if (matchingStaff.employment_status === "Inactive") {
          return NextResponse.json({
            approved: false,
            accountType: "staff",
            error: "Your staff account is currently inactive. Please contact your manager.",
          }, { status: 403 });
        }

        const effectiveEmail = matchingStaff.email?.trim().toLowerCase() || normalizedEmail;
        const staffRole = matchingStaff.role || "Staff";
        const hasPassword = await checkUserHasPassword(effectiveEmail);

        return NextResponse.json({
          approved: true,
          accountType: "staff",
          staffRole,
          hasPassword,
          isFirstLogin: !hasPassword,
          email: effectiveEmail,
          name: matchingStaff.full_name,
        });
      }

      // (b) Check Approved Members by Phone
      const { data: allMembers } = await serviceClient
        .from("approved_members")
        .select("id, full_name, email, phone_number, membership_status, location_id");

      const matchingMembers = (allMembers || []).filter(
        (m) => normalizePhoneNumber(m.phone_number) === normalizedPhone
      );

      if (matchingMembers.length > 0) {
        const activeMember = matchingMembers.find(
          (m) => (m.membership_status || "").trim().toLowerCase() === "active"
        ) || matchingMembers[0];

        const isActive = (activeMember.membership_status || "").trim().toLowerCase() === "active";
        if (!isActive) {
          return NextResponse.json({
            approved: false,
            accountType: "member",
            error: "Your membership is currently inactive. Please contact Corhaus staff to reactivate your membership.",
          }, { status: 403 });
        }

        // Register the email ID entered below onto this approved member record
        if (normalizedEmail) {
          try {
            await serviceClient
              .from("approved_members")
              .update({ email: normalizedEmail })
              .eq("id", activeMember.id);
          } catch (updateErr) {
            console.error("Error registering member email:", updateErr);
          }
        }

        const targetEmail = normalizedEmail || (activeMember.email || "").trim().toLowerCase();
        const hasPassword = await checkUserHasPassword(targetEmail);

        return NextResponse.json({
          approved: true,
          accountType: "member",
          hasPassword,
          isFirstLogin: !hasPassword,
          email: targetEmail,
          name: activeMember.full_name,
          phone: normalizedPhone,
        });
      }
    }

    // ─── 3. CHECK EMAIL (Fallback if phone was not provided or didn't match) ──
    if (normalizedEmail) {
      // Check Staff by Email
      const { data: staffByEmail } = await serviceClient
        .from("staff_members")
        .select("id, role, full_name, email, phone_number, employment_status")
        .ilike("email", normalizedEmail)
        .limit(1)
        .maybeSingle();

      const isStaffEmail = !!staffByEmail || isAdminEmail(normalizedEmail) || normalizedEmail === "admin@corhaus.com";
      if (isStaffEmail) {
        if (staffByEmail && staffByEmail.employment_status === "Inactive") {
          return NextResponse.json({
            approved: false,
            accountType: "staff",
            error: "Your staff account is currently inactive. Please contact your manager.",
          }, { status: 403 });
        }

        const staffRole = staffByEmail?.role || (isAdminEmail(normalizedEmail) ? "Manager" : "Staff");
        const hasPassword = await checkUserHasPassword(normalizedEmail);

        return NextResponse.json({
          approved: true,
          accountType: "staff",
          staffRole,
          hasPassword,
          isFirstLogin: !hasPassword,
          email: normalizedEmail,
          name: staffByEmail?.full_name || "Staff Member",
        });
      }

      // Check Member by Email
      const { verifyCanonicalMemberAuthorization } = await import("@/lib/auth-canonical");
      const authResult = await verifyCanonicalMemberAuthorization(normalizedEmail, normalizedPhone || undefined);

      if (authResult.authorized && authResult.member) {
        const hasPassword = await checkUserHasPassword(normalizedEmail);
        return NextResponse.json({
          approved: true,
          accountType: "member",
          hasPassword,
          isFirstLogin: !hasPassword,
          email: normalizedEmail,
          name: authResult.member.full_name,
        });
      }
    }

    return NextResponse.json({
      approved: false,
      accountType: "unrecognized",
      error: normalizedPhone
        ? "No active membership or staff account found for phone number " + phone + ". Please check your number or contact Corhaus staff."
        : "You do not currently have access to the Corhaus Member Portal. Please contact Corhaus staff to activate your membership.",
    }, { status: 403 });

  } catch (err: any) {
    console.error("POST /api/auth/check-email error:", err);
    return NextResponse.json({
      approved: false,
      accountType: "unrecognized",
      error: "An unexpected error occurred while verifying details. Please try again.",
    }, { status: 500 });
  }
}
