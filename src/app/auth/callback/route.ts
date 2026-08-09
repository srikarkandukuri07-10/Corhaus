import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  // Use a Map keyed by cookie name to ensure duplicate setAll calls don't overwrite valid session cookies
  const cookieMap = new Map<string, { name: string; value: string; options: any }>();

  function redirectWithCookies(url: string) {
    const res = NextResponse.redirect(url);
    cookieMap.forEach(({ name, value, options }) => {
      try {
        res.cookies.set(name, value, options);
      } catch (_) {}
    });
    return res;
  }

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieMap.set(name, { name, value, options });
            });
          },
        },
      }
    );

    // Exchange code for session
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.error("Exchange code error:", exchangeError);
      return redirectWithCookies(`${origin}/auth/login?error=auth_failed`);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return redirectWithCookies(`${origin}/auth/login?error=auth_failed`);
    }

    const normalizedEmail = user.email?.trim().toLowerCase() || "";

    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { isDeveloperEmail } = await import("@/lib/constants");
    if (isDeveloperEmail(normalizedEmail)) {
      try {
        await serviceClient.from("profiles").upsert(
          {
            id: user.id,
            email: normalizedEmail,
            role: "developer",
            full_name: user.user_metadata?.full_name || "Developer",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      } catch (err) {
        console.error("Developer profile sync error:", err);
      }
      return redirectWithCookies(`${origin}/developer/support`);
    }

    // Check if staff member
    let isStaff = isAdminEmail(normalizedEmail);
    if (!isStaff && normalizedEmail) {
      try {
        const { data: staff } = await serviceClient
          .from("staff_members")
          .select("employment_status")
          .ilike("email", normalizedEmail)
          .limit(1)
          .maybeSingle();
        if (staff && staff.employment_status !== "Inactive") {
          isStaff = true;
        }
      } catch (staffErr) {
        console.error("Staff lookup error:", staffErr);
      }
    }

    // Read existing profile
    let profile: any = null;
    try {
      const { data } = await serviceClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      profile = data;
    } catch (profErr) {
      console.error("Profile lookup error:", profErr);
    }

    if (isStaff) {
      // Ensure staff members have admin profile role for middleware authorization
      try {
        await serviceClient.from("profiles").upsert(
          {
            id: user.id,
            full_name: user.user_metadata?.full_name || profile?.full_name || "",
            phone_number: user.user_metadata?.phone_number || profile?.phone_number || "",
            email: normalizedEmail,
            role: "admin",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      } catch (insErr) {
        console.error("Profile upsert error:", insErr);
      }

      // Self-heal staff_roles linkage & RBAC permissions
      try {
        const { getUserRolePermissions } = await import("@/lib/rbac");
        await getUserRolePermissions(user);
      } catch (rbacErr) {
        console.error("RBAC linkage error:", rbacErr);
      }

      return redirectWithCookies(`${origin}/admin`);
    } else {
      // Regular gym member
      if (!profile) {
        try {
          await serviceClient.from("profiles").insert({
            id: user.id,
            full_name: user.user_metadata?.full_name || "",
            phone_number: user.user_metadata?.phone_number || "",
            email: normalizedEmail,
            role: "member",
          });
        } catch (memInsErr) {
          console.error("Member profile insert error:", memInsErr);
        }
      }

      return redirectWithCookies(`${origin}/member`);
    }
  } catch (globalCallbackError) {
    console.error("Global Callback Error:", globalCallbackError);
    return redirectWithCookies(`${origin}/auth/login?error=auth_failed`);
  }
}
