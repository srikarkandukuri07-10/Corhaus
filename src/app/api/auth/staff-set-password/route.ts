import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isAdminEmail, isDeveloperEmail } from "@/lib/constants";
import { rateLimit } from "@/lib/rateLimit";
import { normalizePhoneNumber } from "@/lib/auth-canonical";

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

    const { email, password, phone } = await request.json();
    if (!email || !password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = normalizePhoneNumber(phone);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const serviceClient = createServiceClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check staff email or phone
    let staff: any = null;
    if (normalizedEmail) {
      const { data } = await serviceClient
        .from("staff_members")
        .select("id, role, full_name, phone_number, email, employment_status")
        .ilike("email", normalizedEmail)
        .limit(1)
        .maybeSingle();
      staff = data;
    }

    if (!staff && normalizedPhone) {
      const { data: staffList } = await serviceClient
        .from("staff_members")
        .select("id, role, full_name, phone_number, email, employment_status")
        .ilike("phone_number", `%${normalizedPhone}%`)
        .limit(10);
      staff = (staffList || []).find(
        (s) => normalizePhoneNumber(s.phone_number) === normalizedPhone
      ) || null;
    }

    const isStaff = !!staff || isAdminEmail(normalizedEmail) || normalizedEmail === "admin@corhaus.com";
    const isDev = isDeveloperEmail(normalizedEmail);

    let isMember = false;
    let memberData: any = null;

    if (!isStaff && !isDev) {
      if (normalizedEmail) {
        const { data: member } = await serviceClient
          .from("approved_members")
          .select("id, full_name, phone_number, membership_status, email")
          .ilike("email", normalizedEmail)
          .limit(1)
          .maybeSingle();

        if (member && (member.membership_status || "").toLowerCase() === "active") {
          isMember = true;
          memberData = member;
        }
      }

      if (!isMember && normalizedPhone) {
        let matching: any[] = [];
        const { data: byPhone } = await serviceClient
          .from("approved_members")
          .select("id, full_name, phone_number, membership_status, email")
          .ilike("phone_number", `%${normalizedPhone}%`)
          .limit(10);

        matching = (byPhone || []).filter(
          (m) => normalizePhoneNumber(m.phone_number) === normalizedPhone
        );

        if (matching.length === 0) {
          const { data: allMembers } = await serviceClient
            .from("approved_members")
            .select("id, full_name, phone_number, membership_status, email")
            .limit(2000);
          matching = (allMembers || []).filter(
            (m) => normalizePhoneNumber(m.phone_number) === normalizedPhone
          );
        }

        const activeMem = matching.find(
          (m) => (m.membership_status || "").toLowerCase() === "active"
        ) || matching[0];

        if (activeMem && (activeMem.membership_status || "").toLowerCase() === "active") {
          isMember = true;
          memberData = activeMem;

          // Register email on this member row if not already set
          try {
            await serviceClient
              .from("approved_members")
              .update({ email: normalizedEmail })
              .eq("id", activeMem.id);
          } catch (_) {}
        }
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

    // Find or create user in Supabase Auth and set password
    const { data: usersData } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
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

    // Authenticate session (1 week session)
    const cookieStore = await cookies();
    const cookieHeaderMap = new Map<string, { name: string; value: string; options: any }>();
    const ssrClient = createServerClient(url, anonKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const customizedOptions = {
              ...options,
              maxAge: 604800, // 1 week session
              secure: true,
              sameSite: "lax" as const,
            };
            cookieHeaderMap.set(name, { name, value, options: customizedOptions });
          });
        },
      },
    });

    const { data: { session: pwdSession }, error: signInErr } = await ssrClient.auth.signInWithPassword({
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
    const { data: sessionData } = await ssrClient.auth.getSession();
    const freshSession = pwdSession || sessionData.session;
    const sessionTokens = freshSession
      ? { access_token: freshSession.access_token, refresh_token: freshSession.refresh_token }
      : null;

    const response = NextResponse.json({
      success: true,
      redirectUrl,
      message: "Password set successfully! Redirecting...",
      session: sessionTokens,
    });
    cookieHeaderMap.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  } catch (err: any) {
    console.error("POST /api/auth/staff-set-password error:", err);
    return NextResponse.json(
      { error: "Failed to set password." },
      { status: 500 }
    );
  }
}
