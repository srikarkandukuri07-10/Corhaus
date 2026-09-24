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

    // Branch isolation: every statistic computed from the active branch only.
    const { getLocationAccess, resolveActiveLocation, locationDenied } = await import("@/lib/location");
    const locAccess = await getLocationAccess(user);
    const locationId = resolveActiveLocation(locAccess, req);
    if (!locationId) return locationDenied("No accessible location found for this account.");

    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const todayStr = new Date().toISOString().split("T")[0];
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

    const [classesRes, membersRes, invoicesRes, attendanceRes, bookingsRes] = await Promise.all([
      service.from("classes").select("id, class_date").eq("location_id", locationId).gte("class_date", todayStr),
      service.from("approved_members").select("id", { count: "exact", head: false }).eq("location_id", locationId),
      service.from("invoices").select("grand_total, amount_paid, payment_status, created_at").eq("location_id", locationId).gte("created_at", firstOfMonth),
      service.from("attendance").select("id, attendance_status, scanned_at, created_at").eq("location_id", locationId).eq("attendance_status", "attended"),
      service.from("bookings").select("class_id, booking_status").eq("location_id", locationId).neq("booking_status", "cancelled"),
    ]);

    const todaysClasses = (classesRes.data || []).filter((c: any) => c.class_date === todayStr).length;
    const totalMembers = membersRes.count ?? (membersRes.data?.length || 0);

    const bookingsCountMap: Record<string, number> = {};
    if (bookingsRes.data) {
      bookingsRes.data.forEach((b: any) => {
        if (b.class_id) {
          bookingsCountMap[b.class_id] = (bookingsCountMap[b.class_id] || 0) + 1;
        }
      });
    }

    let revenue = 0;
    if (invoicesRes.data) {
      for (const inv of invoicesRes.data) {
        const status = (inv.payment_status || "").toLowerCase();
        if (status === "paid" || status === "completed") {
          const paid = inv.amount_paid != null && Number(inv.amount_paid) > 0 ? Number(inv.amount_paid) : Number(inv.grand_total || 0);
          revenue += paid;
        }
      }
    }

    let checkIns = 0;
    if (attendanceRes.data) {
      checkIns = attendanceRes.data.filter((a: any) => {
        const dt = a.scanned_at || a.created_at;
        return dt && dt.startsWith(todayStr);
      }).length;
    }

    return NextResponse.json({
      todaysClasses,
      totalMembers,
      monthlyRevenue: revenue,
      checkInsToday: checkIns,
      bookingsCountMap,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
