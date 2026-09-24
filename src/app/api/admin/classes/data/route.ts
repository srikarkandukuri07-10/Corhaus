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

    // Branch isolation: verified active location (class_types stay global catalogue).
    const { getLocationAccess, resolveActiveLocation, locationDenied } = await import("@/lib/location");
    const locAccess = await getLocationAccess(user);
    const locationId = resolveActiveLocation(locAccess, req);
    if (!locationId) return locationDenied("No accessible location found for this account.");

    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const [ctRes, sessRes, memRes, plansRes, profRes, bookingsRes] = await Promise.all([
      service.from("class_types").select("*").order("name"),
      service.from("classes").select("*").eq("location_id", locationId).order("class_date", { ascending: true }).order("class_time", { ascending: true }),
      service.from("approved_members").select("id, full_name, email, phone_number").eq("location_id", locationId).order("full_name"),
      service.from("member_purchased_plans").select("id, approved_member_id, plan_name, category, sessions_remaining, sessions_total, valid_until, status").eq("location_id", locationId),
      service.from("profiles").select("id, email"),
      service.from("bookings").select("*").eq("location_id", locationId).order("created_at", { ascending: false }),
    ]);

    if (ctRes.error) return NextResponse.json({ error: ctRes.error.message }, { status: 400 });
    if (sessRes.error) return NextResponse.json({ error: sessRes.error.message }, { status: 400 });

    return NextResponse.json({
      classTypes: ctRes.data || [],
      sessions: sessRes.data || [],
      members: memRes.data || [],
      plans: plansRes.data || [],
      profiles: profRes.data || [],
      bookings: bookingsRes.data || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
