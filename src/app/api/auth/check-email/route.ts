import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail, isDeveloperEmail } from "@/lib/constants";
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
    // Rate limit check-email requests: 10 per 15 minutes per IP to prevent email enumeration
    const { success, retryAfter } = await rateLimit(ip, "check-email", 10, 15 * 60 * 1000);
    if (!success) {
      return NextResponse.json(
        { approved: false, accountType: "unrecognized", error: `Too many email verification attempts. Please try again after ${retryAfter} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { email } = await request.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ approved: false, accountType: "unrecognized", error: "Email is required." }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const serviceClient = getServiceClient();

    // 1. Developer / Support check
    if (isDeveloperEmail(normalizedEmail)) {
      let hasPassword = false;
      try {
        const { data: usersData } = await serviceClient.auth.admin.listUsers();
        const existingUser = (usersData?.users || []).find(
          (u) => u.email?.trim().toLowerCase() === normalizedEmail
        );
        if (
          existingUser?.user_metadata?.has_password ||
          existingUser?.user_metadata?.password_set_at
        ) {
          hasPassword = true;
        }
      } catch (_) {}

      return NextResponse.json({
        approved: true,
        accountType: "developer",
        hasPassword,
      });
    }

    // 2. Staff check (Manager, Owner, Receptionist, Trainer, Staff)
    const { data: staff } = await serviceClient
      .from("staff_members")
      .select("id, role, employment_status")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (staff || isAdminEmail(normalizedEmail) || normalizedEmail === "admin@corhaus.com") {
      if (staff && staff.employment_status === "Inactive") {
        return NextResponse.json({
          approved: false,
          accountType: "staff",
          employmentStatus: "Inactive",
          error: "Your staff account is currently inactive. Please contact your manager.",
        }, { status: 403 });
      }

      const staffRole = staff?.role || (isAdminEmail(normalizedEmail) ? "Manager" : "Staff");

      // Check if user has established a password in Supabase Auth
      let hasPassword = false;
      try {
        const { data: usersData } = await serviceClient.auth.admin.listUsers();
        const existingUser = (usersData?.users || []).find(
          (u) => u.email?.trim().toLowerCase() === normalizedEmail
        );
        if (
          (staff as any)?.has_password ||
          existingUser?.user_metadata?.has_password ||
          existingUser?.user_metadata?.password_set_at
        ) {
          hasPassword = true;
        }
      } catch (_) {}

      return NextResponse.json({
        approved: true,
        accountType: "staff",
        staffRole,
        employmentStatus: "Active",
        hasPassword,
      });
    }

    // 3. Approved Member check
    const { data: member } = await serviceClient
      .from("approved_members")
      .select("membership_status")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (member && member.membership_status === "active") {
      let hasPassword = false;
      try {
        const { data: usersData } = await serviceClient.auth.admin.listUsers();
        const existingUser = (usersData?.users || []).find(
          (u) => u.email?.trim().toLowerCase() === normalizedEmail
        );
        if (
          existingUser?.user_metadata?.has_password ||
          existingUser?.user_metadata?.password_set_at
        ) {
          hasPassword = true;
        }
      } catch (_) {}

      return NextResponse.json({
        approved: true,
        accountType: "member",
        hasPassword,
      });
    }

    // 4. Fallback check for existing profiles table entry
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("id, role")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (profile) {
      const isStaffRole = ["admin", "manager", "owner", "receptionist", "trainer", "staff"].includes(
        (profile.role || "").toLowerCase()
      );
      let hasPassword = false;
      try {
        const { data: usersData } = await serviceClient.auth.admin.listUsers();
        const existingUser = (usersData?.users || []).find(
          (u) => u.email?.trim().toLowerCase() === normalizedEmail
        );
        if (
          existingUser?.user_metadata?.has_password ||
          existingUser?.user_metadata?.password_set_at
        ) {
          hasPassword = true;
        }
      } catch (_) {}

      return NextResponse.json({
        approved: true,
        accountType: isStaffRole ? "staff" : "member",
        hasPassword,
      });
    }

    return NextResponse.json({
      approved: false,
      accountType: "unrecognized",
      error: "This email is not approved for access. Please contact Corhaus staff.",
    }, { status: 403 });
  } catch (err: any) {
    return NextResponse.json({
      approved: false,
      accountType: "unrecognized",
      error: err.message || "An unexpected error occurred while checking email.",
    }, { status: 500 });
  }
}
