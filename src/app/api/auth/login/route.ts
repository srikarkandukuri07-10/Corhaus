import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isAdminEmail, isDeveloperEmail } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
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
      return NextResponse.json(
        { error: "Server configuration error. Please contact administrator." },
        { status: 500 }
      );
    }

    const serviceClient = createServiceClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ─── 1. DEVELOPER / SUPPORT IDENTITY ──────────────────────────────────────
    if (isDeveloperEmail(normalizedEmail)) {
      const { data: usersData } = await serviceClient.auth.admin.listUsers();
      let devUser = (usersData?.users || []).find(
        (u) => u.email?.trim().toLowerCase() === normalizedEmail
      );
      if (!devUser) {
        const { data: created } = await serviceClient.auth.admin.createUser({
          email: normalizedEmail,
          email_confirm: true,
          user_metadata: { full_name: "Developer" },
        });
        devUser = created?.user || undefined;
      }

      const tempPassword = `Corhaus_Dev_Auth_${devUser?.id || "2026"}`;
      if (devUser) {
        await serviceClient.auth.admin.updateUserById(devUser.id, {
          password: tempPassword,
          email_confirm: true,
        });
      }

      if (devUser) {
        await serviceClient.from("profiles").upsert(
          { id: devUser.id, email: normalizedEmail, role: "developer", full_name: "Developer" },
          { onConflict: "id" }
        );
      }

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

      await ssrClient.auth.signInWithPassword({ email: normalizedEmail, password: tempPassword });
      const response = NextResponse.json({ success: true, redirectUrl: "/developer/support", accountType: "developer" });
      cookieHeaderMap.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
      return response;
    }

    // ─── 2. STAFF IDENTITY (Manager, Owner, Receptionist, Trainer, Staff) ────
    const { data: staff } = await serviceClient
      .from("staff_members")
      .select("id, role, full_name, phone_number, employment_status")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    const isStaffEmail = !!staff || isAdminEmail(normalizedEmail) || normalizedEmail === "admin@corhaus.com";

    if (isStaffEmail) {
      if (staff && staff.employment_status === "Inactive") {
        return NextResponse.json(
          { error: "Your staff account is currently inactive. Please contact your manager." },
          { status: 403 }
        );
      }

      const staffRole = staff?.role || (isAdminEmail(normalizedEmail) ? "Manager" : "Staff");

      // Find staff user in Supabase Auth
      const { data: usersData } = await serviceClient.auth.admin.listUsers();
      let staffUser = (usersData?.users || []).find(
        (u) => u.email?.trim().toLowerCase() === normalizedEmail
      );

      const hasPassword = !!(
        (staff as any)?.has_password ||
        staffUser?.user_metadata?.has_password ||
        staffUser?.user_metadata?.password_set_at
      );

      // If staff member has provided a password to log in:
      if (password) {
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

        const { error: pwdErr } = await ssrClient.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (pwdErr) {
          return NextResponse.json(
            { error: "Invalid password. Please check your credentials and try again." },
            { status: 400 }
          );
        }

        // Sync profiles role
        if (staffUser) {
          await serviceClient.from("profiles").upsert(
            {
              id: staffUser.id,
              email: normalizedEmail,
              full_name: (staff as any)?.full_name || staffUser.user_metadata?.full_name || "Staff Member",
              phone_number: (staff as any)?.phone_number || staffUser.user_metadata?.phone_number || "",
              role: "admin",
            },
            { onConflict: "id" }
          );
        }

        const response = NextResponse.json({ success: true, redirectUrl: "/admin", accountType: "staff" });
        cookieHeaderMap.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        return response;
      }

      // If password not provided: check if staff password is set or needs setup
      if (!hasPassword) {
        return NextResponse.json({
          success: false,
          needsStaffPasswordSetup: true,
          accountType: "staff",
          staffRole,
          error: `Your staff account (${staffRole}) does not have a password set yet. Please set your password to secure your account.`,
        }, { status: 200 });
      } else {
        return NextResponse.json({
          success: false,
          requiresPassword: true,
          accountType: "staff",
          staffRole,
          error: "Please enter your staff account password.",
        }, { status: 200 });
      }
    }

    // ─── 3. APPROVED MEMBER IDENTITY ──────────────────────────────────────────
    const { data: member } = await serviceClient
      .from("approved_members")
      .select("id, full_name, phone_number, membership_status")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    const isMemberActive = member && (member.membership_status || "").toLowerCase() === "active";

    if (!isMemberActive) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("id, role")
        .ilike("email", normalizedEmail)
        .limit(1)
        .maybeSingle();

      if (!profile) {
        return NextResponse.json(
          { error: "This email is not approved for access. Please contact Corhaus staff to activate your membership." },
          { status: 403 }
        );
      }
    }

    // Member Session Provisioning
    const tempPassword = `Corhaus_Member_Auth_${normalizedEmail}`;
    const { data: usersData } = await serviceClient.auth.admin.listUsers();
    let memberUser = (usersData?.users || []).find(
      (u) => u.email?.trim().toLowerCase() === normalizedEmail
    );

    if (memberUser) {
      await serviceClient.auth.admin.updateUserById(memberUser.id, {
        password: tempPassword,
        email_confirm: true,
      });
    } else {
      const { data: created } = await serviceClient.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        email_confirm: true,
      });
      memberUser = created?.user || undefined;
    }

    if (memberUser) {
      const memberFullName =
        member?.full_name ||
        memberUser.user_metadata?.full_name ||
        normalizedEmail.split("@")[0] ||
        "Member";
      const memberPhone =
        member?.phone_number ||
        memberUser.user_metadata?.phone_number ||
        "";

      await serviceClient.from("profiles").upsert(
        {
          id: memberUser.id,
          email: normalizedEmail,
          role: "member",
          full_name: memberFullName,
          phone_number: memberPhone,
        },
        { onConflict: "id" }
      );
    }

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

    await ssrClient.auth.signInWithPassword({ email: normalizedEmail, password: tempPassword });
    const response = NextResponse.json({ success: true, redirectUrl: "/member", accountType: "member" });
    cookieHeaderMap.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;

  } catch (err: any) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json(
      { error: err.message || "An unexpected authentication error occurred." },
      { status: 500 }
    );
  }
}
