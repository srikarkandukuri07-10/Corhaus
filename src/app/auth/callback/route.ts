import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

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

    if (code) {
      // Exchange code for session
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        console.error("Exchange code error:", exchangeError);
      }
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
    let isInactiveStaff = false;
    let staffRole = "";
    let staffDbRecord: { full_name?: string; phone_number?: string } | null = null;

    if (normalizedEmail) {
      try {
        const { data: staff } = await serviceClient
          .from("staff_members")
          .select("id, role, full_name, phone_number, employment_status")
          .ilike("email", normalizedEmail)
          .limit(1)
          .maybeSingle();

        if (staff) {
          if (staff.employment_status === "Inactive") {
            isInactiveStaff = true;
          } else {
            isStaff = true;
            staffRole = staff.role || "Staff";
            staffDbRecord = { full_name: staff.full_name, phone_number: staff.phone_number };
          }
        }
      } catch (staffErr) {
        console.error("Staff lookup error:", staffErr);
      }
    }

    if (isInactiveStaff) {
      try {
        await supabase.auth.signOut();
      } catch {}
      return redirectWithCookies(`${origin}/auth/login?error=staff_inactive`);
    }

    // Read existing profile
    let profile: any = null;
    try {
      const { data } = await serviceClient
        .from("profiles")
        .select("role, full_name, phone_number")
        .eq("id", user.id)
        .maybeSingle();
      profile = data;
    } catch (profErr) {
      console.error("Profile lookup error:", profErr);
    }

    if (isStaff) {
      // Ensure staff members have admin profile role for middleware authorization.
      // NOTE: profiles.role only accepts "admin" or "member" (check constraint).
      // The actual staff role (Owner/Manager/Trainer etc.) is resolved from staff_members via RBAC.
      const staffFullName =
        staffDbRecord?.full_name ||
        user.user_metadata?.full_name ||
        profile?.full_name ||
        "Staff Member";
      const staffPhone =
        staffDbRecord?.phone_number ||
        user.user_metadata?.phone_number ||
        profile?.phone_number ||
        "";

      try {
        await serviceClient.from("profiles").upsert(
          {
            id: user.id,
            full_name: staffFullName,
            phone_number: staffPhone,
            email: normalizedEmail,
            role: "admin",  // always "admin" for all staff — profiles table only allows admin/member
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
    }

    // Member Authorization Canonical Check
    const { verifyCanonicalMemberAuthorization } = await import("@/lib/auth-canonical");
    const userPhone = user.user_metadata?.phone_number || user.phone || profile?.phone_number || null;
    const authResult = await verifyCanonicalMemberAuthorization(normalizedEmail, userPhone);

    if (!authResult.authorized || !authResult.member) {
      try {
        await supabase.auth.signOut();
      } catch {}
      return redirectWithCookies(`${origin}/auth/login?error=not_approved`);
    }

    // Phone-linked member: persist the auth email onto their member row so the
    // rest of the system resolves them by email from now on. Conditional on the
    // email still being NULL, so it cannot repoint an existing record.
    if (authResult.phoneLinked) {
      try {
        const { backfillMemberEmail } = await import("@/lib/member-linking");
        const link = await backfillMemberEmail(serviceClient, {
          memberId: authResult.member.id,
          authEmail: normalizedEmail,
          authUserId: user.id,
          phone: userPhone,
          source: "oauth_callback",
        });
        if (link.ok && link.member) {
          authResult.member = link.member as typeof authResult.member;
        }
      } catch (linkErr) {
        console.error("[auth/callback] member email backfill failed:", linkErr);
      }
    }

    // A membership claimed by PHONE must not stay reachable through Google alone.
    // Send the member to password setup before granting portal access.
    if (authResult.phoneLinked) {
      const alreadyHasPassword = !!(
        user.user_metadata?.has_password || user.user_metadata?.password_set_at
      );
      if (!alreadyHasPassword) {
        try {
          await supabase.auth.signOut();
        } catch {}
        return redirectWithCookies(
          `${origin}/auth/staff-set-password?email=${encodeURIComponent(normalizedEmail)}&role=member&linked=phone`
        );
      }
    }

    const memberDbRecord = authResult.member;

    // Approved gym member profile auto-creation/update
    try {
      const memFullName =
        memberDbRecord?.full_name ||
        user.user_metadata?.full_name ||
        profile?.full_name ||
        normalizedEmail.split("@")[0] ||
        "Member";
      const memPhone =
        memberDbRecord?.phone_number ||
        user.user_metadata?.phone_number ||
        profile?.phone_number ||
        "";

      await serviceClient.from("profiles").upsert(
        {
          id: user.id,
          full_name: memFullName,
          phone_number: memPhone,
          email: normalizedEmail,
          role: "member",
        },
        { onConflict: "id" }
      );
    } catch (memInsErr) {
      console.error("Member profile upsert error:", memInsErr);
    }

    return redirectWithCookies(`${origin}/member`);
  } catch (globalCallbackError) {
    console.error("Global Callback Error:", globalCallbackError);
    return redirectWithCookies(`${origin}/auth/login?error=auth_failed`);
  }
}
