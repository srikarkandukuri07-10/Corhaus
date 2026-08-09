import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail, isDeveloperEmail } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ approved: false, accountType: "unrecognized", error: "Email is required." }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Developer / Support check
    if (isDeveloperEmail(normalizedEmail)) {
      return NextResponse.json({
        approved: true,
        accountType: "developer",
        hasPassword: true,
      });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    // 2. Staff check (Manager, Owner, Receptionist, Trainer, Staff)
    const { data: staff } = await supabase
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
        const { data: usersData } = await supabase.auth.admin.listUsers();
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
    const { data: member } = await supabase
      .from("approved_members")
      .select("membership_status")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (member && member.membership_status === "active") {
      return NextResponse.json({
        approved: true,
        accountType: "member",
        hasPassword: true,
      });
    }

    // 4. Fallback check for existing profiles table entry
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (profile) {
      const isStaffRole = ["admin", "manager", "owner", "receptionist", "trainer", "staff"].includes(
        (profile.role || "").toLowerCase()
      );
      return NextResponse.json({
        approved: true,
        accountType: isStaffRole ? "staff" : "member",
        hasPassword: true,
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
