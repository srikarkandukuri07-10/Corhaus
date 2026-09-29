import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/constants";

async function getAdminUser() {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    // 1. Authenticate user
    const user = await getAdminUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Authorize admin/manager role or members.delete permission
    const { getUserRolePermissions } = await import("@/lib/rbac");
    const userPerms = await getUserRolePermissions(user);
    const isSuperAdmin = isAdminEmail(user.email);

    const isAuthorized =
      isSuperAdmin ||
      userPerms.role === "Owner" ||
      userPerms.role === "Manager" ||
      userPerms.permissions.includes("*") ||
      userPerms.permissions.includes("members.delete") ||
      userPerms.permissions.includes("members.manage");

    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden: You lack permission to delete members." }, { status: 403 });
    }

    const { memberId, email } = await req.json();
    if (!memberId || !email) {
      return NextResponse.json({ error: "Member ID and email are required." }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 3. Branch isolation check
    const { getLocationAccess, resolveActiveLocation, locationDenied } = await import("@/lib/location");
    const locAccess = await getLocationAccess(user);
    const activeLocationId = resolveActiveLocation(locAccess, req);
    if (!activeLocationId) {
      return locationDenied("No active location found for this account.");
    }

    // 4. Service role client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 5. Remove from approved_members
    let delQuery = supabase.from("approved_members").delete().eq("id", memberId);
    if (activeLocationId) {
      delQuery = delQuery.eq("location_id", activeLocationId);
    }
    const { error: delError } = await delQuery;

    if (delError) {
      console.error("[ADMIN DELETE MEMBER] approved_members delete error:", delError);
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }

    // 6. Demote profile role so stale member sessions cannot claim member authorization
    try {
      await supabase
        .from("profiles")
        .update({ role: "inactive" })
        .ilike("email", cleanEmail);
    } catch (profErr) {
      console.warn("[ADMIN DELETE MEMBER] profile role update warning:", profErr);
    }

    // 7. Note: Historical financial (invoices, customers) and historical attendance/bookings
    // are PERMANENTLY PRESERVED for audit and accounting integrity.
    return NextResponse.json({
      success: true,
      message: "Member removed from approved list successfully.",
    });
  } catch (err: any) {
    console.error("[ADMIN DELETE MEMBER] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
