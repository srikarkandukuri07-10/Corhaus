import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isAdminEmail, isDeveloperEmail } from "@/lib/constants";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    // Rate limit password setup: 5 requests per 15 minutes per IP
    const { success, retryAfter } = await rateLimit(ip, "password_setup", 5, 15 * 60 * 1000);
    if (!success) {
      return NextResponse.json(
        { error: `Too many attempts. Please try again after ${retryAfter} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { email, password } = await request.json();
    if (!email || !password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const serviceClient = createServiceClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check staff email
    const { data: staff } = await serviceClient
      .from("staff_members")
      .select("id, role, full_name, phone_number, employment_status")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    const isStaff = !!staff || isAdminEmail(normalizedEmail) || normalizedEmail === "admin@corhaus.com";
    const isDev = isDeveloperEmail(normalizedEmail);

    let isMember = false;
    let memberData: any = null;

    if (!isStaff && !isDev) {
      const { data: member } = await serviceClient
        .from("approved_members")
        .select("id, full_name, phone_number, membership_status")
        .ilike("email", normalizedEmail)
        .limit(1)
        .maybeSingle();

      if (member && (member.membership_status || "").toLowerCase() === "active") {
        isMember = true;
        memberData = member;
      }
    }

    if (!isStaff && !isDev && !isMember) {
      return NextResponse.json(
        { error: "This feature is only for active staff/member accounts." },
        { status: 403 }
      );
    }

    if (staff && staff.employment_status === "Inactive") {
      return NextResponse.json(
        { error: "Your staff account is currently inactive. Please contact your manager." },
        { status: 403 }
      );
    }

    const accountType = isDev ? "developer" : isStaff ? "staff" : "member";

    // Find or create user in Supabase Auth and set password
    const { data: usersData } = await serviceClient.auth.admin.listUsers();
    let authUser = (usersData?.users || []).find(
      (u) => u.email?.trim().toLowerCase() === normalizedEmail
    );

    if (authUser) {
      await serviceClient.auth.admin.updateUserById(authUser.id, {
        password: password,
        email_confirm: true,
        user_metadata: {
          ...authUser.user_metadata,
          has_password: true,
          password_set_at: new Date().toISOString(),
        },
      });
    } else {
      const { data: created } = await serviceClient.auth.admin.createUser({
        email: normalizedEmail,
        password: password,
        email_confirm: true,
        user_metadata: {
          has_password: true,
          password_set_at: new Date().toISOString(),
        },
      });

      if (created?.user) {
        authUser = created.user;
      }
    }

    if (!authUser) {
      return NextResponse.json({ error: "Failed to establish user account." }, { status: 500 });
    }

    if (isStaff && staff) {
      try {
        await serviceClient
          .from("staff_members")
          .update({ has_password: true })
          .eq("id", staff.id);
      } catch (_) {}
    }

    // Sync profiles role and metadata
    const userRole = isDev ? "developer" : isStaff ? "admin" : "member";
    const userFullName = staff?.full_name || memberData?.full_name || authUser.user_metadata?.full_name || (isDev ? "Developer" : "Member");
    const userPhone = staff?.phone_number || memberData?.phone_number || authUser.user_metadata?.phone_number || "";

    await serviceClient.from("profiles").upsert(
      {
        id: authUser.id,
        email: normalizedEmail,
        full_name: userFullName,
        phone_number: userPhone,
        role: userRole,
      },
      { onConflict: "id" }
    );

    // Authenticate session
    const cookieStore = await cookies();
    const cookieHeaderMap = new Map<string, { name: string; value: string; options: any }>();
    const ssrClient = createServerClient(url, anonKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const customizedOptions = {
              ...options,
              maxAge: 60 * 60 * 24 * 365, // 1 year session (C-1)
              secure: true,
              sameSite: "lax" as const,
              httpOnly: true,
            };
            cookieHeaderMap.set(name, { name, value, options: customizedOptions });
          });
        },
      },
    });

    const { error: signInErr } = await ssrClient.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInErr) {
      console.error("signInWithPassword Error in set-password:", signInErr);
      return NextResponse.json(
        { error: "Password was updated, but authentication failed. Please sign in with your new password." },
        { status: 400 }
      );
    }

    const redirectUrl = isDev ? "/developer/support" : isStaff ? "/admin" : "/member";
    const response = NextResponse.json({
      success: true,
      redirectUrl,
      message: "Password set successfully! Redirecting...",
    });
    cookieHeaderMap.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to set password." },
      { status: 500 }
    );
  }
}
