import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
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

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!url || !serviceKey) {
      console.error("Missing Supabase configuration in environment variables.");
      return NextResponse.json(
        { error: "Server configuration error. Please contact administrator." },
        { status: 500 }
      );
    }

    const serviceClient = createServiceClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Check approval eligibility
    let isApproved = false;
    let isStaff = false;

    if (
      isAdminEmail(normalizedEmail) ||
      normalizedEmail === "kandukurisrikar10@gmail.com" ||
      normalizedEmail === "admin@corhaus.com"
    ) {
      isApproved = true;
      isStaff = true;
    }

    if (!isApproved) {
      const { data: staff } = await serviceClient
        .from("staff_members")
        .select("employment_status")
        .ilike("email", normalizedEmail)
        .limit(1)
        .maybeSingle();

      if (staff && staff.employment_status !== "Inactive") {
        isApproved = true;
        isStaff = true;
      }
    }

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

    if (!isApproved) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("role")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (profile) {
        isApproved = true;
        if (profile.role === "admin") isStaff = true;
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

    // 2. Direct Auth User Provisioning
    const tempPassword = `Corhaus_Auth_2026!_${normalizedEmail}`;

    const { data: usersData } = await serviceClient.auth.admin.listUsers();
    const users = usersData?.users || [];
    let user = users.find((u) => u.email?.trim().toLowerCase() === normalizedEmail);

    if (user) {
      await serviceClient.auth.admin.updateUserById(user.id, {
        password: tempPassword,
        email_confirm: true,
      });
    } else {
      const candidateUser = users.find(
        (u) =>
          u.email?.endsWith("@example.com") ||
          (u.email?.endsWith("@corhaus.com") &&
            !["srikarkandukuri07@gmail.com", "kandukurisrikar10@gmail.com"].includes(
              u.email
            ))
      );

      if (candidateUser) {
        const { data: updated } = await serviceClient.auth.admin.updateUserById(
          candidateUser.id,
          {
            email: normalizedEmail,
            password: tempPassword,
            email_confirm: true,
          }
        );
        user = updated?.user || undefined;
      }
    }

    // 3. Authenticate & set SSR session cookies directly
    const cookieStore = await cookies();
    const cookieHeaderMap = new Map<string, { name: string; value: string; options: any }>();

    const ssrClient = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieHeaderMap.set(name, { name, value, options });
            try {
              cookieStore.set(name, value, options);
            } catch (_) {}
          });
        },
      },
    });

    const { data: authSession, error: signInError } =
      await ssrClient.auth.signInWithPassword({
        email: normalizedEmail,
        password: tempPassword,
      });

    if (signInError || !authSession?.user) {
      console.error("Direct signInWithPassword error:", signInError);
      return NextResponse.json(
        {
          error:
            signInError?.message ||
            "Failed to establish authenticated session. Please try again.",
        },
        { status: 500 }
      );
    }

    // 4. Ensure Profile Role & RBAC Sync
    if (isStaff) {
      try {
        await serviceClient.from("profiles").upsert(
          {
            id: authSession.user.id,
            email: normalizedEmail,
            role: "admin",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

        const { getUserRolePermissions } = await import("@/lib/rbac");
        await getUserRolePermissions(authSession.user);
      } catch (e) {
        console.error("Profile/RBAC sync error:", e);
      }
    } else {
      try {
        await serviceClient.from("profiles").upsert(
          {
            id: authSession.user.id,
            email: normalizedEmail,
            role: "member",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      } catch (e) {
        console.error("Member profile sync error:", e);
      }
    }

    const redirectTarget = isStaff ? "/admin" : "/member";

    const response = NextResponse.json({
      success: true,
      redirectUrl: redirectTarget,
    });

    cookieHeaderMap.forEach(({ name, value, options }) => {
      try {
        response.cookies.set(name, value, options);
      } catch (_) {}
    });

    return response;
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
