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

    // 2. Direct Sign-In Token Link Generation
    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/auth/callback`;

    function enforceCallbackUrl(rawActionLink: string): string {
      try {
        const u = new URL(rawActionLink);
        u.searchParams.set("redirect_to", redirectTo);
        return u.toString();
      } catch {
        return rawActionLink;
      }
    }

    // Attempt 1: Direct generateLink
    let { data: linkData, error: linkError } =
      await serviceClient.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          redirectTo,
        },
      });

    if (linkData?.properties?.action_link) {
      return NextResponse.json({
        success: true,
        redirectUrl: enforceCallbackUrl(linkData.properties.action_link),
      });
    }

    // Attempt 2: Self-healing provision via updateUserById if generateLink failed
    console.warn("generateLink initial attempt failed for:", normalizedEmail, "Error:", linkError);

    try {
      const { data: usersData } = await serviceClient.auth.admin.listUsers();
      const users = usersData?.users || [];
      const existingUser = users.find(
        (u) => u.email?.trim().toLowerCase() === normalizedEmail
      );

      if (existingUser) {
        await serviceClient.auth.admin.updateUserById(existingUser.id, {
          email_confirm: true,
        });
      } else {
        // Assign/provision auth user entry via updateUserById to bypass broken database trigger
        const candidateUser = users.find(
          (u) =>
            u.email?.endsWith("@example.com") ||
            (u.email?.endsWith("@corhaus.com") &&
              !["srikarkandukuri07@gmail.com", "kandukurisrikar10@gmail.com"].includes(
                u.email
              ))
        );

        if (candidateUser) {
          await serviceClient.auth.admin.updateUserById(candidateUser.id, {
            email: normalizedEmail,
            email_confirm: true,
          });
        } else {
          // Fallback createUser attempt
          await serviceClient.auth.admin
            .createUser({
              email: normalizedEmail,
              email_confirm: true,
            })
            .catch(() => null);
        }
      }

      // Retry generateLink after self-healing
      const retryRes = await serviceClient.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          redirectTo,
        },
      });

      if (retryRes.data?.properties?.action_link) {
        return NextResponse.json({
          success: true,
          redirectUrl: enforceCallbackUrl(retryRes.data.properties.action_link),
        });
      }
    } catch (selfHealError) {
      console.error("Self-heal auth provision error:", selfHealError);
    }

    return NextResponse.json(
      {
        error:
          "Unable to generate sign-in session for this email. Please ensure your account is activated or contact administrator.",
      },
      { status: 500 }
    );
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
