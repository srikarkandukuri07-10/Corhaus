const { createClient } = require('@supabase/supabase-js');

const url = 'https://zmzevqorbdogwishiahw.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptemV2cW9yYmRvZ3dpc2hpYWh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzMzY0MSwiZXhwIjoyMDk3NjA5NjQxfQ.4aObXn7UphOIv-nKjTPalsVTAzwavHNjR1KuKRiXPeU';

const supabase = createClient(url, serviceKey);

function computeMemberStatus(memberStatus, plan) {
  if (memberStatus === "cancelled" || plan?.status === "cancelled") {
    return { status: "Cancelled", daysLeft: null };
  }
  if (memberStatus === "frozen" || plan?.status === "frozen" || plan?.freeze_status === "frozen") {
    return { status: "Frozen", daysLeft: null };
  }
  if (!plan) {
    if (memberStatus === "active") return { status: "Active", daysLeft: null };
    return { status: "Expired", daysLeft: 0 };
  }
  if (plan.sessions_total !== null && plan.sessions_total > 0 && plan.sessions_remaining === 0) {
    return { status: "Exhausted", daysLeft: null };
  }
  let daysLeft = null;
  if (plan.valid_until) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(plan.valid_until);
    end.setHours(0, 0, 0, 0);
    const diffTime = end.getTime() - today.getTime();
    daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  if (daysLeft !== null && daysLeft <= 0) return { status: "Expired", daysLeft: 0 };
  if (daysLeft !== null && daysLeft <= 7) return { status: "Expiring Soon", daysLeft };
  if (memberStatus === "active" || plan.status === "active") return { status: "Active", daysLeft };
  return { status: "Expired", daysLeft: 0 };
}

async function testApiMembersLogic() {
  const [approvedRes, profilesRes, plansRes, customersRes, invoicesRes] = await Promise.all([
    supabase.from("approved_members").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("email, avatar_url"),
    supabase.from("member_purchased_plans").select("*").order("created_at", { ascending: false }),
    supabase.from("customers").select("id, approved_member_id"),
    supabase.from("invoices").select("*, invoice_items(*)").order("created_at", { ascending: false }),
  ]);

  const approvedData = approvedRes.data || [];
  const profilesData = profilesRes.data || [];
  const plansData = plansRes.data || [];
  const customersData = customersRes.data || [];
  const invoicesData = invoicesRes.data || [];

  const avatarMap = new Map(
    profilesData.filter(p => p && p.email).map(p => [p.email.toLowerCase(), p.avatar_url])
  );

  const plansByMember = new Map();
  plansData.forEach(p => {
    const list = plansByMember.get(p.approved_member_id) || [];
    list.push(p);
    plansByMember.set(p.approved_member_id, list);
  });

  const custToMemberMap = new Map();
  customersData.forEach(c => {
    if (c.approved_member_id) custToMemberMap.set(c.id, c.approved_member_id);
  });

  const invoiceByMemberMap = new Map();
  invoicesData.forEach(inv => {
    if (inv.customer_id) {
      const memberId = custToMemberMap.get(inv.customer_id);
      if (memberId && !invoiceByMemberMap.has(memberId)) {
        invoiceByMemberMap.set(memberId, inv);
      }
    }
  });

  const fullMembersList = approvedData.map(m => {
    const mPlans = plansByMember.get(m.id) || [];
    let activeP = mPlans.find(p => p.status === "active" || p.status === "frozen") || mPlans[0] || null;

    if (!activeP) {
      const inv = invoiceByMemberMap.get(m.id);
      const isPaid = inv && (inv.payment_status === "paid" || inv.payment_status === "Paid" || inv.payment_status === "Completed");
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

  console.log('Total members compiled via Service Role API logic:', fullMembersList.length);
  console.log('Sample Member:', JSON.stringify(fullMembersList[0], null, 2));
}

testApiMembersLogic();
