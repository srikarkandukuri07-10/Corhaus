import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Service-role client for admin-only DB checks (bypasses RLS)
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const pathname = request.nextUrl.pathname;

  console.log("=== PROXY (SERVER) ===");
  console.log("REQUEST PATH:", pathname);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log("AUTH USER: null (not authenticated)");
  } else {
    console.log("AUTH USER EMAIL:", user.email);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    console.log("PROFILE QUERY ERROR:", profileError);
    console.log("PROFILE FOUND:", !!profile);
    console.log("ROLE:", profile?.role);

    // If no profile exists, create one on-the-fly
    if (!profile) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const rawEmail = userData.user.email ?? "";
        const userEmail = rawEmail.trim().toLowerCase();
        await supabase.from("profiles").insert({
          id: userData.user.id,
          full_name: userData.user.user_metadata?.full_name ?? "",
          phone_number: userData.user.user_metadata?.phone_number ?? "",
          email: userEmail,
          role:
            rawEmail === process.env.ADMIN_EMAIL
              ? "admin"
              : "member",
        });
        console.log("CREATED MISSING PROFILE for:", userEmail);
      }
    }
  }

  // Protected routes that require authentication
  const protectedRoutes = ["/admin", "/member"];
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Auth routes (login/signup) - redirect to dashboard if already logged in
  const authRoutes = ["/auth/login", "/auth/signup"];
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // If not logged in and trying to access protected route
  if (!user && isProtectedRoute) {
    console.log("DECISION: not authenticated on protected route -> redirect to /auth/login");
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    const redirectRes = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => {
      redirectRes.cookies.set(c.name, c.value);
    });
    return redirectRes;
  }

  // If logged in and trying to access auth routes, redirect to appropriate dashboard
  if (user && isAuthRoute) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const target = profile?.role === "admin" ? "/admin" : "/member";
    console.log("DECISION: on auth route, role is", profile?.role, "-> redirect to", target);
    const url = request.nextUrl.clone();
    url.pathname = target;
    const redirectRes = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => {
      redirectRes.cookies.set(c.name, c.value);
    });
    return redirectRes;
  }

  // If logged in, check role-based access
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, phone_number")
      .eq("id", user.id)
      .maybeSingle();

    // Member trying to access admin routes
    if (
      pathname.startsWith("/admin") &&
      profile?.role !== "admin" &&
      profile !== null
    ) {
      console.log("DECISION: non-admin on /admin -> redirect to /member");
      const url = request.nextUrl.clone();
      url.pathname = "/member";
      const redirectRes = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectRes.cookies.set(c.name, c.value);
      });
      return redirectRes;
    }

    // Member on /member route -> check approved_members
    if (pathname.startsWith("/member") && profile?.role === "member") {
      let approved = false;
      const googleEmail = user.email ?? "";
      const normalizedEmail = googleEmail.trim().toLowerCase();

      console.log("APPROVED_MEMBER_EMAIL:", "(querying approved_members)");
      console.log("GOOGLE_EMAIL:", googleEmail);
      console.log("NORMALIZED_EMAIL:", normalizedEmail);

      try {
        const { data: result } = await serviceClient
          .from("approved_members")
          .select("id")
          .ilike("email", normalizedEmail)
          .eq("membership_status", "active")
          .maybeSingle();
        approved = !!result;
        console.log("MATCH_FOUND:", !!result);
      } catch (e) {
        console.log("APPROVED MEMBER CHECK ERROR:", e);
      }

      console.log("APPROVED MEMBER CHECK: email=", googleEmail, "normalized=", normalizedEmail, "approved=", approved);

      if (!approved) {
        console.log("DECISION: member not approved -> redirect to /auth/login");
        try { await supabase.auth.signOut(); } catch { }
        const url = request.nextUrl.clone();
        url.pathname = "/auth/login";
        url.searchParams.set("error", "not_approved");
        const redirectRes = NextResponse.redirect(url);
        supabaseResponse.cookies.getAll().forEach((c) => {
          redirectRes.cookies.set(c.name, c.value);
        });
        return redirectRes;
      }

      console.log("ACCESS_GRANTED:", normalizedEmail);
    }

    // Admin trying to access member routes (redirect to admin)
    if (pathname.startsWith("/member") && profile?.role === "admin") {
      console.log("DECISION: admin on /member -> redirect to /admin");
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      const redirectRes = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectRes.cookies.set(c.name, c.value);
      });
      return redirectRes;
    }
  }

  // Redirect root to appropriate page
  if (pathname === "/") {
    if (!user) {
      console.log("DECISION: root, not authenticated -> redirect to /auth/login");
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      const redirectRes = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectRes.cookies.set(c.name, c.value);
      });
      return redirectRes;
    }
  }

  console.log("DECISION: allow request to proceed");
  return supabaseResponse;
}
