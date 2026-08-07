import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  return { serviceClient, user };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("staff.manage_rbac");
    if (!check.authorized) return check.response!;

    const { id: roleId } = await params;
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    // Fetch target role
    const { data: role, error: rErr } = await serviceClient
      .from("roles")
      .select("*")
      .eq("id", roleId)
      .single();

    if (rErr || !role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    // Fetch all available permissions
    const { data: allPermissions, error: pErr } = await serviceClient
      .from("permissions")
      .select("*")
      .order("module", { ascending: true })
      .order("name", { ascending: true });

    if (pErr) {
      return NextResponse.json({ error: "Failed to fetch permissions" }, { status: 500 });
    }

    // Fetch assigned permission IDs for this role
    const { data: rolePerms } = await serviceClient
      .from("role_permissions")
      .select("permission_id")
      .eq("role_id", roleId);

    const assignedSet = new Set((rolePerms || []).map((rp) => rp.permission_id));

    return NextResponse.json({
      role,
      permissions: allPermissions || [],
      assigned_permission_ids: Array.from(assignedSet),
    });
  } catch (err: any) {
    console.error("GET /api/admin/roles/[id]/permissions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("staff.manage_rbac");
    if (!check.authorized) return check.response!;

    const { id: roleId } = await params;
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    const body = await request.json();
    const { permission_ids } = body;

    if (!Array.isArray(permission_ids)) {
      return NextResponse.json({ error: "permission_ids must be an array" }, { status: 400 });
    }

    // Fetch role to ensure it exists and prevent removing Owner perms
    const { data: role } = await serviceClient
      .from("roles")
      .select("name")
      .eq("id", roleId)
      .single();

    if (role?.name === "Owner") {
      // Owner automatically has all permissions
      const { data: allPerms } = await serviceClient.from("permissions").select("id");
      const allIds = (allPerms || []).map((p) => p.id);
      
      await serviceClient.from("role_permissions").delete().eq("role_id", roleId);
      const ownerInserts = allIds.map((pid) => ({ role_id: roleId, permission_id: pid }));
      await serviceClient.from("role_permissions").insert(ownerInserts);

      return NextResponse.json({ success: true, message: "Owner permissions are locked with 100% access" });
    }

    // 1. Delete existing role_permissions for this role
    await serviceClient
      .from("role_permissions")
      .delete()
      .eq("role_id", roleId);

    // 2. Insert new assigned permission IDs
    if (permission_ids.length > 0) {
      const inserts = permission_ids.map((pid: string) => ({
        role_id: roleId,
        permission_id: pid,
      }));
      const { error: insErr } = await serviceClient
        .from("role_permissions")
        .insert(inserts);

      if (insErr) {
        console.error("Error inserting role_permissions:", insErr);
        return NextResponse.json({ error: "Failed to update permissions" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: "Role permissions updated successfully" });
  } catch (err: any) {
    console.error("PUT /api/admin/roles/[id]/permissions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
