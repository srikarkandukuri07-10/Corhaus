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

  const isDev = process.env.NODE_ENV === "development";
  const devLog = (...args: any[]) => {
    if (isDev) console.log(...args);
  };

  devLog("=== PROXY (SERVER) ===");
  devLog("REQUEST PATH:", pathname);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    devLog("AUTH USER: null (not authenticated)");
  } else {
    devLog("AUTH USER EMAIL:", user.email);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    devLog("PROFILE QUERY ERROR:", profileError);
    devLog("PROFILE FOUND:", !!profile);
    devLog("ROLE:", profile?.role);

    let userRole = profile?.role;
    let isApproved = false;
    let matchedMemberEmail = "none";
    const googleEmail = user.email ?? "";
    const normalizedEmail = googleEmail.trim().toLowerCase();

    // Check if they are admin first
    if (googleEmail === process.env.ADMIN_EMAIL || userRole === "admin") {
      isApproved = true;
      userRole = "admin";
    } else {
      // Check approved_members for everyone else!
      try {
        const { data: results } = await serviceClient
          .from("approved_members")
          .select("id, email")
          .eq("membership_status", "active");

        const match = results?.find(
          (r) => r.email.trim().toLowerCase() === normalizedEmail
        );
        isApproved = !!match;
        if (match) {
          matchedMemberEmail = match.email;
        }
      } catch (e) {
        devLog("APPROVED MEMBER CHECK ERROR:", e);
      }
    }

    // Required Debug Logs
    devLog("GOOGLE_EMAIL:", googleEmail);
    devLog("NORMALIZED_EMAIL:", normalizedEmail);
    devLog("APPROVED_MEMBER_EMAIL:", matchedMemberEmail);
    devLog("MATCH_FOUND:", isApproved);

    const isReferralPage = pathname.startsWith("/referral");

    if (!isApproved && !isReferralPage) {
      devLog("DECISION: member not approved -> redirect to /auth/login");
      try {
        await supabase.auth.signOut();
      } catch {}
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("error", "not_approved");
      const redirectRes = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectRes.cookies.set(c.name, c.value);
      });
      return redirectRes;
    }

    devLog("ACCESS_GRANTED: true");

    // Now if they don't have a profile, create it (since they are approved)
    // Only create profile if they are approved (don't create for referral visitors)
    if (!profile && isApproved) {
      devLog("PROFILE_CREATED: true");
      userRole = userRole || "member";
      await supabase.from("profiles").insert({
        id: user.id,
        full_name: user.user_metadata?.full_name ?? "",
        phone_number: user.user_metadata?.phone_number ?? "",
        email: normalizedEmail,
        role: userRole,
      });
    } else {
      devLog("PROFILE_CREATED: false");
    }

    // Protected routes that require authentication
    const protectedRoutes = ["/admin", "/member"];
    const isProtectedRoute = protectedRoutes.some((route) =>
      pathname.startsWith(route)
    );

    // Auth routes (login/signup) - redirect to dashboard if already logged in
    const authRoutes = ["/auth/login", "/auth/signup"];
    const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

    // If logged in and trying to access auth routes, redirect to appropriate dashboard
    if (isAuthRoute) {
      const target = userRole === "admin" ? "/admin" : "/member";
      devLog("DECISION: on auth route, role is", userRole, "-> redirect to", target);
      const url = request.nextUrl.clone();
      url.pathname = target;
      const redirectRes = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectRes.cookies.set(c.name, c.value);
      });
      return redirectRes;
    }

    // Member trying to access admin routes
    if (pathname.startsWith("/admin") && userRole !== "admin") {
      devLog("DECISION: non-admin on /admin -> redirect to /member");
      const url = request.nextUrl.clone();
      url.pathname = "/member";
      const redirectRes = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectRes.cookies.set(c.name, c.value);
      });
      return redirectRes;
    }

    // Admin trying to access member routes (redirect to admin)
    if (pathname.startsWith("/member") && userRole === "admin") {
      devLog("DECISION: admin on /member -> redirect to /admin");
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      const redirectRes = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectRes.cookies.set(c.name, c.value);
      });
      return redirectRes;
    }
  }

  // Protected routes that require authentication (when not logged in)
  const protectedRoutes = ["/admin", "/member"];
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );
  if (!user && isProtectedRoute) {
    devLog("DECISION: not authenticated on protected route -> redirect to /auth/login");
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    const redirectRes = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => {
      redirectRes.cookies.set(c.name, c.value);
    });
    return redirectRes;
  }

  // Redirect root to appropriate page
  if (pathname === "/") {
    if (!user) {
      devLog("DECISION: root, not authenticated -> redirect to /auth/login");
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      const redirectRes = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectRes.cookies.set(c.name, c.value);
      });
      return redirectRes;
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const target = profile?.role === "admin" || user.email === process.env.ADMIN_EMAIL ? "/admin" : "/member";
      const url = request.nextUrl.clone();
      url.pathname = target;
      const redirectRes = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectRes.cookies.set(c.name, c.value);
      });
      return redirectRes;
    }
  }

  devLog("DECISION: allow request to proceed");
  return supabaseResponse;
}
