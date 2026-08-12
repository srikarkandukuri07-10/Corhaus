import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/constants";

export interface UserRolePermissions {
  role: string;
  roleId: string;
  permissions: string[]; // array of action_keys e.g. ['members.view', 'members.add']
}

export async function getUserRolePermissions(userBypass?: any): Promise<UserRolePermissions> {
  try {
    let user = userBypass;
    if (!user) {
      const supabase = await createServerClient();
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }

    if (!user) {
      return {
        role: "Guest",
        roleId: "guest-default",
        permissions: [],
      };
    }

    // 1. Super Administrator (Owner) check via admin email bypass
    if (isAdminEmail(user.email)) {
      return {
        role: "Owner",
        roleId: "owner-default",
        permissions: ["*"], // '*' wildcard denotes all permissions enabled
      };
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const normalizedEmail = user.email?.trim().toLowerCase();

    if (normalizedEmail) {
      // 2. Retrieve the user's staff record matching email (case-insensitive)
      const { data: staff } = await serviceClient
        .from("staff_members")
        .select("id, role, employment_status")
        .ilike("email", normalizedEmail)
        .limit(1)
        .maybeSingle();

      if (staff && staff.employment_status !== "Inactive") {
        // Active staff member found — they must always be allowed to log in,
        // even if RBAC role/permission tables are missing or misconfigured.
        const fallbackRole = staff.role || "Staff";

        try {
          // Get the corresponding role from DB
          const { data: roleObj } = await serviceClient
            .from("roles")
            .select("id, name")
            .ilike("name", fallbackRole)
            .limit(1)
            .maybeSingle();

          if (roleObj) {
            // Auto-link/upsert staff_roles entry for self-healing permissions mapping
            const { data: existingSR } = await serviceClient
              .from("staff_roles")
              .select("id, user_id, role_id")
              .eq("staff_id", staff.id)
              .limit(1)
              .maybeSingle();

            if (existingSR) {
              if (existingSR.user_id !== user.id || existingSR.role_id !== roleObj.id) {
                await serviceClient
                  .from("staff_roles")
                  .update({ user_id: user.id, role_id: roleObj.id })
                  .eq("id", existingSR.id);
              }
            } else {
              await serviceClient
                .from("staff_roles")
                .insert({ staff_id: staff.id, user_id: user.id, role_id: roleObj.id });
            }

            // Fetch permissions assigned to this role
            const { data: rolePerms } = await serviceClient
              .from("role_permissions")
              .select("permissions(action_key)")
              .eq("role_id", roleObj.id);

            const permKeys = (rolePerms || [])
              .map((rp: any) => rp.permissions?.action_key)
              .filter(Boolean);

            return {
              role: roleObj.name,
              roleId: roleObj.id,
              permissions: permKeys,
            };
          }
        } catch (linkErr) {
          console.error("RBAC role linkage error (allowing staff login with fallback role):", linkErr);
        }

        // Fallback: staff exists but RBAC resolution failed — still grant access.
        return {
          role: fallbackRole,
          roleId: `staff-fallback-${staff.id}`,
          permissions: [],
        };
      }
    }

    // 3. Fallback default for regular members/non-staff users
    return {
      role: "Member",
      roleId: "member-default",
      permissions: [],
    };
  } catch (err) {
    console.error("getUserRolePermissions error:", err);
    return {
      role: "Guest",
      roleId: "guest-default",
      permissions: [],
    };
  }
}

export function hasPermission(permissions: string[], actionKey: string): boolean {
  if (permissions.includes("*")) return true;
  return permissions.includes(actionKey);
}

export async function verifyApiPermission(actionKey: string) {
  const { role, permissions } = await getUserRolePermissions();
  if (role !== "Owner" && !hasPermission(permissions, actionKey)) {
    const { NextResponse } = await import("next/server");
    return {
      authorized: false,
      response: NextResponse.json(
        { error: `Access Denied: Missing permission "${actionKey}"` },
        { status: 403 }
      ),
    };
  }
  return { authorized: true };
}

