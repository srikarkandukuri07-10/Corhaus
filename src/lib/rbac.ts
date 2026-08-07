import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/constants";

export interface UserRolePermissions {
  role: string;
  roleId: string;
  permissions: string[]; // array of action_keys e.g. ['members.view', 'members.add']
}

export async function getUserRolePermissions(userBypass?: any): Promise<UserRolePermissions> {
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

  // 1. Super Administrator (Manager) check via admin email bypass
  if (isAdminEmail(user.email)) {
    return {
      role: "Manager",
      roleId: "manager-default",
      permissions: ["*"], // '*' wildcard denotes all permissions enabled
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const normalizedEmail = user.email?.trim().toLowerCase();

  // 2. Retrieve the user's staff record matching email
  const { data: staff } = await serviceClient
    .from("staff_members")
    .select("id, role, employment_status, user_id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (staff && staff.employment_status !== "Inactive") {
    // Dynamically auto-link user_id to staff record if not already linked
    if (staff.user_id !== user.id) {
      await serviceClient
        .from("staff_members")
        .update({ user_id: user.id })
        .eq("id", staff.id);
    }

    // Get the corresponding role from DB
    const { data: roleObj } = await serviceClient
      .from("roles")
      .select("id, name")
      .eq("name", staff.role)
      .maybeSingle();

    if (roleObj) {
      // Auto-link/upsert staff_roles entry for self-healing permissions mapping
      await serviceClient
        .from("staff_roles")
        .upsert(
          { staff_id: staff.id, user_id: user.id, role_id: roleObj.id },
          { onConflict: "staff_id" }
        );

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
  }

  // 3. Fallback default for regular members/non-staff users
  return {
    role: "Member",
    roleId: "member-default",
    permissions: [],
  };
}

export function hasPermission(permissions: string[], actionKey: string): boolean {
  if (permissions.includes("*")) return true;
  return permissions.includes(actionKey);
}

export async function verifyApiPermission(actionKey: string) {
  const { role, permissions } = await getUserRolePermissions();
  if (role !== "Manager" && !hasPermission(permissions, actionKey)) {
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

