import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/constants";

const debug = process.env.NODE_ENV === "development" ? console.log : () => {};

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  debug("=== AUTH CALLBACK (SERVER) ===");
  debug("CODE PRESENT:", !!code);

  if (!code) {
    debug("DECISION: no code -> redirect to login with error");
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  // We must use NextRequest/NextResponse pattern to ensure session cookies
  // are properly attached to the redirect response.
  let redirectTo = `${origin}/auth/login?error=auth_failed`;

  // Build a temporary response that we'll attach cookies to
  const response = NextResponse.redirect(redirectTo);

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
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  debug("EXCHANGE CODE ERROR:", exchangeError);

  if (exchangeError) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  debug("USER:", user?.email);

  if (!user) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  const normalizedEmail = user.email?.trim().toLowerCase() || "";

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Developer bypass
  if (normalizedEmail === "kandukurisrikar10@gmail.com") {
    const devRedirect = NextResponse.redirect(`${origin}/developer/support`);
    response.cookies.getAll().forEach((c) => devRedirect.cookies.set(c.name, c.value));
    return devRedirect;
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
    debug("USER IS STAFF - ensuring admin profile...");

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

    // Self-heal staff_roles linkage
    try {
      const { getUserRolePermissions } = await import("@/lib/rbac");
      await getUserRolePermissions(user);
    } catch (rbacErr) {
      debug("RBAC LINKAGE ERROR:", rbacErr);
    }

    const adminRedirect = NextResponse.redirect(`${origin}/admin`);
    response.cookies.getAll().forEach((c) => adminRedirect.cookies.set(c.name, c.value));
    debug("DECISION: staff -> redirect to /admin");
    return adminRedirect;
  } else {
    if (!profile) {
      await serviceClient.from("profiles").insert({
        id: user.id,
        full_name: user.user_metadata?.full_name || "",
        phone_number: user.user_metadata?.phone_number || "",
        email: normalizedEmail,
        role: "member",
      });
    }

    const memberRedirect = NextResponse.redirect(`${origin}/member`);
    response.cookies.getAll().forEach((c) => memberRedirect.cookies.set(c.name, c.value));
    debug("DECISION: member -> redirect to /member");
    return memberRedirect;
  }
}
