import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address format." },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      console.error("Missing Supabase URL or Service Role Key in environment variables.");
      return NextResponse.json(
        { error: "Server configuration error. Please contact administrator." },
        { status: 500 }
      );
    }

    const serviceClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Check approval eligibility
    let isApproved = false;

    // Super Admin check
    if (
      isAdminEmail(normalizedEmail) ||
      normalizedEmail === "kandukurisrikar10@gmail.com" ||
      normalizedEmail === "admin@corhaus.com"
    ) {
      isApproved = true;
    }

    // Active staff member check
    if (!isApproved) {
      const { data: staff } = await serviceClient
        .from("staff_members")
        .select("employment_status")
        .ilike("email", normalizedEmail)
        .limit(1)
        .maybeSingle();

      if (staff && staff.employment_status !== "Inactive") {
        isApproved = true;
      }
    }

    // Active member check
    if (!isApproved) {
      const { data: member } = await serviceClient
        .from("approved_members")
        .select("membership_status")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (member && member.membership_status === "active") {
        isApproved = true;
      }
    }

    // Existing profile fallback
    if (!isApproved) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (profile) {
        isApproved = true;
      }
    }

    if (!isApproved) {
      return NextResponse.json(
        {
          error:
            "This email is not approved for access. Please contact Corhaus staff to activate your membership.",
        },
        { status: 403 }
      );
    }

    // 2. Direct Sign-In Link Generation via Service Role
    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/auth/callback`;

    let { data: linkData, error: linkError } =
      await serviceClient.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          redirectTo,
        },
      });

    // If user does not exist in auth.users, auto-create them and re-generate link
    if (
      linkError &&
      (linkError.message?.toLowerCase().includes("user not found") ||
        linkError.status === 404)
    ) {
      const { error: createError } = await serviceClient.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true,
      });

      if (createError) {
        console.error("Failed to auto-create auth user:", createError);
        return NextResponse.json(
          { error: "Could not create user session: " + createError.message },
          { status: 500 }
        );
      }

      const retryRes = await serviceClient.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          redirectTo,
        },
      });

      linkData = retryRes.data;
      linkError = retryRes.error;
    }

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Generate authentication link error:", linkError);
      return NextResponse.json(
        {
          error:
            linkError?.message ||
            "Failed to generate authentication token. Please try again.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      redirectUrl: linkData.properties.action_link,
    });
  } catch (err: any) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json(
      {
        error:
          err.message ||
          "An unexpected error occurred while signing in. Please try again.",
      },
      { status: 500 }
    );
  }
}
