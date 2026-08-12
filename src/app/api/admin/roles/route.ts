import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const { getUserRolePermissions } = await import("@/lib/rbac");
  const userPerms = await getUserRolePermissions(user);
  if (userPerms.role === "Member" || userPerms.role === "Guest") {
    return { error: "Forbidden", status: 403 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { client: serviceClient, serviceClient, user, profile };
}

export async function GET() {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("staff.manage_rbac");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    // Fetch roles
    const { data: roles, error: rErr } = await serviceClient
      .from("roles")
      .select("id, name, description, is_default, created_at")
      .order("created_at", { ascending: true });

    if (rErr) {
      return NextResponse.json({ error: "Failed to fetch roles" }, { status: 500 });
    }

    // Fetch permissions total count
    const { count: totalPermsCount } = await serviceClient
      .from("permissions")
      .select("*", { count: "exact", head: true });

    // Fetch assigned permissions per role
    const { data: rolePerms } = await serviceClient
      .from("role_permissions")
      .select("role_id, permission_id");

    // Fetch staff members per role
    const { data: staffMembers } = await serviceClient
      .from("staff_members")
      .select("id, role, full_name");

    const rolePermCountMap: Record<string, number> = {};
    (rolePerms || []).forEach((rp) => {
      rolePermCountMap[rp.role_id] = (rolePermCountMap[rp.role_id] || 0) + 1;
    });

    const roleStaffCountMap: Record<string, number> = {};
    (staffMembers || []).forEach((s) => {
      roleStaffCountMap[s.role] = (roleStaffCountMap[s.role] || 0) + 1;
    });

    const enrichedRoles = (roles || []).map((r) => {
      const enabledCount = r.name === "Owner" ? (totalPermsCount || 0) : (rolePermCountMap[r.id] || 0);
      return {
        ...r,
        enabled_permissions_count: enabledCount,
        total_permissions_count: totalPermsCount || 0,
        staff_count: roleStaffCountMap[r.name] || 0,
      };
    });

    return NextResponse.json({ roles: enrichedRoles, total_permissions: totalPermsCount });
  } catch (err: any) {
    console.error("GET /api/admin/roles error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
