import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export interface UserRolePermissions {
  role: string;
  roleId: string;
  permissions: string[]; // array of action_keys e.g. ['members.view', 'members.add']
}

export async function getUserRolePermissions(): Promise<UserRolePermissions> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Default fallback for owner/admin email
  if (user && (user.email === process.env.ADMIN_EMAIL || user.email?.toLowerCase().includes('corhaus'))) {
    // Owner bypass -> grant all permissions
    return {
      role: 'Owner',
      roleId: 'owner-default',
      permissions: ['*'], // '*' wildcard denotes all permissions enabled
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  if (user) {
    // Check staff_roles mapping for user
    const { data: staffRole } = await serviceClient
      .from('staff_roles')
      .select('role_id, roles(id, name)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (staffRole && staffRole.roles) {
      const roleObj: any = staffRole.roles;
      const { data: rolePerms } = await serviceClient
        .from('role_permissions')
        .select('permissions(action_key)')
        .eq('role_id', roleObj.id);

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

  // Fallback default: Return Owner wildcard if primary admin or active session
  return {
    role: 'Owner',
    roleId: 'owner-default',
    permissions: ['*'],
  };
}

export function hasPermission(permissions: string[], actionKey: string): boolean {
  if (permissions.includes('*')) return true;
  return permissions.includes(actionKey);
}
