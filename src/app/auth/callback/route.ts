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

  // Exchange the code for a session — this triggers setAll with session cookies
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  const normalizedEmail = user.email?.trim().toLowerCase() || "";

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Helper: create a redirect response with all session cookies properly attached
  function redirectWithCookies(url: string) {
    const res = NextResponse.redirect(url);
    cookieMap.forEach(({ name, value, options }) => {
      res.cookies.set(name, value, options);
    });
    return res;
  }

  // Developer bypass
  if (normalizedEmail === "kandukurisrikar10@gmail.com") {
    return redirectWithCookies(`${origin}/developer/support`);
  }

  // Check if staff member
  let isStaff = isAdminEmail(normalizedEmail);
  if (!isStaff) {
    const { data: staff } = await serviceClient
      .from("staff_members")
      .select("employment_status")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (staff && staff.employment_status !== "Inactive") {
      isStaff = true;
    }
  }

  // Read existing profile
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (isStaff) {
    // Ensure staff have admin profile role
    if (!profile) {
      await serviceClient.from("profiles").insert({
        id: user.id,
        full_name: user.user_metadata?.full_name || "",
        phone_number: user.user_metadata?.phone_number || "",
        email: normalizedEmail,
        role: "admin",
      });
    } else if (profile.role !== "admin") {
      await serviceClient.from("profiles").update({ role: "admin" }).eq("id", user.id);
    }

    // Self-heal staff_roles linkage (non-blocking)
    try {
      const { getUserRolePermissions } = await import("@/lib/rbac");
      await getUserRolePermissions(user);
    } catch (_) {}

    return redirectWithCookies(`${origin}/admin`);
  } else {
    // Regular member
    if (!profile) {
      await serviceClient.from("profiles").insert({
        id: user.id,
        full_name: user.user_metadata?.full_name || "",
        phone_number: user.user_metadata?.phone_number || "",
        email: normalizedEmail,
        role: "member",
      });
    }

    return redirectWithCookies(`${origin}/member`);
  }
}
