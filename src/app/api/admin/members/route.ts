import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function computeMemberStatus(memberStatus: string, plan: any) {
  if (memberStatus === "cancelled" || plan?.status === "cancelled") {
    return { status: "Cancelled", daysLeft: null };
  }

  if (memberStatus === "frozen" || plan?.status === "frozen" || (plan as any)?.freeze_status === "frozen") {
    return { status: "Frozen", daysLeft: null };
  }

  if (!plan) {
    if (memberStatus === "active") return { status: "Active", daysLeft: null };
    return { status: "Expired", daysLeft: 0 };
  }

  if (plan.sessions_total !== null && plan.sessions_total > 0 && plan.sessions_remaining === 0) {
    return { status: "Exhausted", daysLeft: null };
  }

  let daysLeft: number | null = null;
  if (plan.valid_until) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(plan.valid_until);
    end.setHours(0, 0, 0, 0);
    const diffTime = end.getTime() - today.getTime();
    daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  if (daysLeft !== null && daysLeft <= 0) {
    return { status: "Expired", daysLeft: 0 };
  }

  if (daysLeft !== null && daysLeft <= 7) {
    return { status: "Expiring Soon", daysLeft };
  }

  if (memberStatus === "active" || plan.status === "active") {
    return { status: "Active", daysLeft };
  }

  return { status: "Expired", daysLeft: 0 };
}

export async function GET() {
  try {
    // 1. Verify authenticated user
    const supabaseServer = await createServerClient();
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Verify admin/staff role or permission
    const { getUserRolePermissions } = await import("@/lib/rbac");
    const userPerms = await getUserRolePermissions(user);
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdminByEmail = adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase();

    const isAuthorized =
      isAdminByEmail ||
      userPerms.role === "Manager" ||
      userPerms.role === "Admin" ||
      userPerms.role === "Staff" ||
      userPerms.permissions.includes("*") ||
      userPerms.permissions.includes("members.view") ||
      userPerms.permissions.includes("members.manage") ||
      userPerms.permissions.length > 0;

    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Create service role client (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 4. Fetch all necessary data concurrently
    const [approvedRes, profilesRes, plansRes, customersRes, invoicesRes] = await Promise.all([
      supabase.from("approved_members").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("email, avatar_url"),
      supabase.from("member_purchased_plans").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, approved_member_id"),
      supabase.from("invoices").select("*, invoice_items(*)").order("created_at", { ascending: false }),
    ]);

    if (approvedRes.error) {
      return NextResponse.json({ error: approvedRes.error.message }, { status: 500 });
    }

    const approvedData = approvedRes.data || [];
    const profilesData = profilesRes.data || [];
    const plansData = plansRes.data || [];
    const customersData = customersRes.data || [];
    const invoicesData = invoicesRes.data || [];

    const avatarMap = new Map(
      profilesData
        .filter((p) => p && p.email)
        .map((p) => [p.email.toLowerCase(), p.avatar_url])
    );

    const plansByMember = new Map<string, any[]>();
    plansData.forEach((p: any) => {
      const list = plansByMember.get(p.approved_member_id) || [];
      list.push(p);
      plansByMember.set(p.approved_member_id, list);
    });

    const custToMemberMap = new Map<string, string>();
    customersData.forEach((c: any) => {
      if (c.approved_member_id) custToMemberMap.set(c.id, c.approved_member_id);
    });

    const invoiceByMemberMap = new Map<string, any>();
    invoicesData.forEach((inv: any) => {
      if (inv.customer_id) {
        const memberId = custToMemberMap.get(inv.customer_id);
        if (memberId && !invoiceByMemberMap.has(memberId)) {
          invoiceByMemberMap.set(memberId, inv);
        }
      }
    });

    const fullMembersList = approvedData.map((m: any) => {
      const mPlans = plansByMember.get(m.id) || [];
      let activeP = mPlans.find((p) => p.status === "active" || p.status === "frozen") || mPlans[0] || null;

      if (!activeP) {
        const inv = invoiceByMemberMap.get(m.id);
        const isPaid = inv && (
          inv.payment_status === "paid" ||
          inv.payment_status === "Paid" ||
          inv.payment_status === "Completed"
        );

        if (isPaid) {
          const invItems = inv.invoice_items || inv.items || [];
          const item = invItems[0] || null;
          const planName = item?.name || inv.plan_name || null;

          if (planName) {
            const category = item?.category || "Membership Plans";
            const invDate = inv.created_at ? new Date(inv.created_at) : new Date();
            const validFrom = invDate.toISOString().split("T")[0];

            let validityDays = 30;
            const lower = planName.toLowerCase();
            if (lower.includes("quarterly")) validityDays = 90;
            else if (lower.includes("half")) validityDays = 180;
            else if (lower.includes("annual")) validityDays = 365;
            else if (lower.includes("couple")) validityDays = 60;
            else if (lower.includes("group class (4)") || lower.includes("pt")) validityDays = 180;

            const validUntil = new Date(invDate.getTime() + validityDays * 86400000).toISOString().split("T")[0];

            activeP = {
              id: `inv-${inv.id}`,
              plan_name: planName,
              category: category,
              sessions_total: item?.sessions || null,
              sessions_remaining: item?.sessions || null,
              valid_from: validFrom,
              valid_until: validUntil,
              status: "active",
            };
          }
        }
      }

      const computed = computeMemberStatus(m.membership_status, activeP);
      const inv = invoiceByMemberMap.get(m.id) || null;

      return {
        ...m,
        avatar_url: m.email ? avatarMap.get(m.email.toLowerCase()) || null : null,
        activePlan: activeP,
        allPlans: mPlans.length > 0 ? mPlans : (activeP ? [activeP] : []),
        latestInvoice: inv,
        computedStatus: computed.status,
        daysLeft: computed.daysLeft,
      };
    });

    return NextResponse.json({ members: fullMembersList, total: fullMembersList.length });
  } catch (err: any) {
    console.error("[ADMIN MEMBERS API] Error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
