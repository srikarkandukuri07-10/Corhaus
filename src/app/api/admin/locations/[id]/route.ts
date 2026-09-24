import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/constants";

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Owner-only: rename / edit / activate / deactivate. No deletes (data safety). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { getUserRolePermissions } = await import("@/lib/rbac");
    const perms = await getUserRolePermissions(user);
    if (perms.role !== "Owner" && !isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden: Owner access required." }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) {
      const name = (body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
      patch.name = name;
    }
    if (body.slug !== undefined) {
      const slug = (body.slug || "").trim().toLowerCase();
      if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return NextResponse.json({ error: "Invalid slug format." }, { status: 400 });
      }
      if (slug) patch.slug = slug;
    }
    for (const k of ["address", "city", "state", "phone"]) {
      if (body[k] !== undefined) patch[k] = (body[k] || "").trim() || null;
    }
    if (body.status !== undefined) {
      if (!["active", "inactive"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      // Never deactivate the last active location.
      if (body.status === "inactive") {
        const { count } = await service()
          .from("locations")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .neq("id", id);
        if (!count || count < 1) {
          return NextResponse.json({ error: "Cannot deactivate the last active location." }, { status: 400 });
        }
      }
      patch.status = body.status;
    }

    const { data, error } = await service().from("locations").update(patch).eq("id", id).select("*").single();
    if (error) {
      const msg = /duplicate|unique/i.test(error.message || "") ? "A location with this name or slug already exists." : "Failed to update location.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ success: true, location: data });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
