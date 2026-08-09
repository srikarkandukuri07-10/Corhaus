import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isAdminEmail } from "@/lib/constants";

export async function POST(request: Request) {
  try {
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

    // Verify staff email
    const { data: staff } = await serviceClient
      .from("staff_members")
      .select("id, role, employment_status")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    const isStaff = !!staff || isAdminEmail(normalizedEmail) || normalizedEmail === "admin@corhaus.com";

    if (!isStaff) {
      return NextResponse.json(
        { error: "This feature is only for active staff accounts." },
        { status: 403 }
      );
    }

    if (staff && staff.employment_status === "Inactive") {
      return NextResponse.json(
        { error: "Your staff account is currently inactive. Please contact your manager." },
        { status: 403 }
      );
    }

    const staffRole = staff?.role || (isAdminEmail(normalizedEmail) ? "Manager" : "Staff");

    // Find or create user in Supabase Auth and set password
    const { data: usersData } = await serviceClient.auth.admin.listUsers();
    let staffUser = (usersData?.users || []).find(
      (u) => u.email?.trim().toLowerCase() === normalizedEmail
    );

    if (staffUser) {
      await serviceClient.auth.admin.updateUserById(staffUser.id, {
        password: password,
        email_confirm: true,
        user_metadata: {
          ...staffUser.user_metadata,
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
      staffUser = created?.user || undefined;
    }

    if (staff) {
      try {
        await serviceClient
          .from("staff_members")
          .update({ has_password: true })
          .eq("id", staff.id);
      } catch (_) {}
    }

    if (staffUser) {
      await serviceClient.from("profiles").upsert(
        { id: staffUser.id, email: normalizedEmail, role: staffRole },
        { onConflict: "id" }
      );
    }

    // Authenticate session
    const cookieStore = await cookies();
    const cookieHeaderMap = new Map<string, { name: string; value: string; options: any }>();
    const ssrClient = createServerClient(url, anonKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieHeaderMap.set(name, { name, value, options });
          });
        },
      },
    });

    await ssrClient.auth.signInWithPassword({ email: normalizedEmail, password });
    const response = NextResponse.json({ success: true, redirectUrl: "/admin", message: "Password set successfully! Redirecting to Admin Dashboard..." });
    cookieHeaderMap.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to set staff password." },
      { status: 500 }
    );
  }
}
