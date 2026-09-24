import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { getUserRolePermissions } = await import("@/lib/rbac");
    const perms = await getUserRolePermissions(user);
    if (perms.role === "Member" || perms.role === "Guest") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Branch isolation: verified active location (never trust client input).
    const { getLocationAccess, resolveActiveLocation, locationDenied } = await import("@/lib/location");
    const locAccess = await getLocationAccess(user);
    const locationId = resolveActiveLocation(locAccess, req);
    if (!locationId) return locationDenied("No accessible location found for this account.");

    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data, error } = await service.from("classes").select("*").eq("location_id", locationId).order("class_date", { ascending: true }).order("class_time", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
