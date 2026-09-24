import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/constants";
import { getLocationAccess } from "@/lib/location";

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireOwner() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { getUserRolePermissions } = await import("@/lib/rbac");
  const perms = await getUserRolePermissions(user);
  if (perms.role !== "Owner" && !isAdminEmail(user.email)) {
    return { error: NextResponse.json({ error: "Forbidden: Owner access required." }, { status: 403 }) };
  }
  return { user };
}

/** Authorized locations with details (owner sees all active; staff see own). */
export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await getLocationAccess(user);
    if (access.locationIds.length === 0) {
      return NextResponse.json({ locations: [] });
    }
    const { data } = await service()
      .from("locations")
      .select("id, name, slug, address, city, state, phone, status, created_at, updated_at")
      .in("id", access.locationIds)
      .order("name");
    return NextResponse.json({ locations: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Owner-only: create a location. */
export async function POST(req: Request) {
  try {
    const gate = await requireOwner();
    if ("error" in gate) return gate.error;

    const body = await req.json();
    const name = (body?.name || "").trim();
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    const slug =
      (body?.slug || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || null;

    const payload: Record<string, unknown> = {
      name,
      address: (body?.address || "").trim() || null,
      city: (body?.city || "").trim() || null,
      state: (body?.state || "").trim() || null,
      phone: (body?.phone || "").trim() || null,
      status: body?.status === "inactive" ? "inactive" : "active",
    };
    if (slug) payload.slug = slug;

    const { data, error } = await service().from("locations").insert(payload).select("*").single();
    if (error) {
      const msg = /duplicate|unique/i.test(error.message || "") ? "A location with this name or slug already exists." : "Failed to create location.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ success: true, location: data });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
