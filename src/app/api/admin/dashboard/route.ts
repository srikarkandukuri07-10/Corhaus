import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { getUserRolePermissions } = await import("@/lib/rbac");
    const perms = await getUserRolePermissions(user);
    if (perms.role === "Member" || perms.role === "Guest") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const todayStr = new Date().toISOString().split("T")[0];
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

    const [classesRes, membersRes, invoicesRes, attendanceRes] = await Promise.all([
      service.from("classes").select("id, class_date").gte("class_date", todayStr),
      service.from("approved_members").select("id", { count: "exact", head: false }),
      service.from("invoices").select("grand_total, amount_paid, payment_status, created_at").gte("created_at", firstOfMonth),
      service.from("attendance").select("id, attendance_status, scanned_at, created_at").eq("attendance_status", "attended"),
    ]);

    const todaysClasses = (classesRes.data || []).filter((c: any) => c.class_date === todayStr).length;
    const totalMembers = membersRes.count ?? (membersRes.data?.length || 0);

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
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
