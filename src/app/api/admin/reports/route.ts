import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin" || user.email === process.env.ADMIN_EMAIL;
  if (!isAdmin) return { error: "Forbidden", status: 403 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (serviceKey) {
    const serviceClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return { client: serviceClient, user };
  }

  return { client: supabase, user };
}

export async function GET(req: Request) {
  try {
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;

    // Parse query params for date filtering if provided
    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    // Execute queries in parallel for optimal performance
    const [
      invoicesRes,
      invoiceItemsRes,
      membersRes,
      plansRes,
      classesRes,
      bookingsRes,
      attendanceRes,
      staffRes,
      ptSessionsRes,
      productsRes,
      freezesRes,
      freezeRequestsRes,
      referralCodesRes,
      referralRequestsRes,
      discountsRes,
      trialsRes,
      ticketsRes,
    ] = await Promise.all([
      client.from("invoices").select("*").order("created_at", { ascending: false }),
      client.from("invoice_items").select("*"),
      client.from("approved_members").select("*").order("created_at", { ascending: false }),
      client.from("member_purchased_plans").select("*").order("created_at", { ascending: false }),
      client.from("classes").select("*").order("class_date", { ascending: false }),
      client.from("bookings").select("*").order("created_at", { ascending: false }),
      client.from("attendance").select("*"),
      client.from("staff_members").select("*"),
      client.from("pt_sessions").select("*").order("session_date", { ascending: false }),
      client.from("billing_plan_items").select("*"),
      client.from("membership_freezes").select("*"),
      client.from("freeze_requests").select("*"),
      client.from("referral_codes").select("*"),
      client.from("referral_requests").select("*"),
      client.from("member_discounts").select("*"),
      client.from("trial_members").select("*").order("created_at", { ascending: false }),
      client.from("support_tickets").select("*").order("created_at", { ascending: false }),
    ]);

    const invoices = invoicesRes.data || [];
    const invoiceItems = invoiceItemsRes.data || [];
    const members = membersRes.data || [];
    const purchasedPlans = plansRes.data || [];
    const classes = classesRes.data || [];
    const bookings = bookingsRes.data || [];
    const attendance = attendanceRes.data || [];
    const staff = staffRes.data || [];
    const ptSessions = ptSessionsRes.data || [];
    const products = productsRes.data || [];
    const freezes = freezesRes.data || [];
    const freezeRequests = freezeRequestsRes.data || [];
    const referralCodes = referralCodesRes.data || [];
    const referralRequests = referralRequestsRes.data || [];
    const discounts = discountsRes.data || [];
    const trialMembers = trialsRes.data || [];
    const tickets = ticketsRes.data || [];

    const todayStr = new Date().toISOString().split("T")[0];
    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    // 1. Overview Metrics
    let todayRevenue = 0;
    let monthRevenue = 0;
    let totalRevenue = 0;
    let pendingPaymentsTotal = 0;

    invoices.forEach((inv: any) => {
      const invDate = inv.created_at ? inv.created_at.split("T")[0] : "";
      const isPaid = inv.payment_status === "paid" || inv.payment_status === "Paid" || inv.payment_status === "Completed";
      
      if (isPaid) {
        const amt = Number(inv.grand_total || inv.amount_paid || 0);
        totalRevenue += amt;
        if (invDate === todayStr) todayRevenue += amt;
        if (inv.created_at && inv.created_at >= firstDayOfMonth) monthRevenue += amt;
      } else if (inv.payment_status === "due" || inv.payment_status === "partial" || inv.payment_status === "Payment Due") {
        const due = Number(inv.grand_total || 0) - Number(inv.amount_paid || 0);
        pendingPaymentsTotal += Math.max(0, due);
      }
    });

    const activeMembersCount = members.filter((m: any) => m.membership_status === "active").length;
    
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const newMembersCount = members.filter((m: any) => m.created_at >= thirtyDaysAgo).length;

    const trialMembersCount = trialMembers.length;

    // Expiring memberships in next 30 days
    const next30DaysStr = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const expiringMembershipsCount = purchasedPlans.filter((p: any) => {
      if (!p.valid_until) return false;
      return p.valid_until >= todayStr && p.valid_until <= next30DaysStr;
    }).length;

    // Product Sales Volume
    let productSalesTotal = 0;
    invoiceItems.forEach((item: any) => {
      if (item.category === "Products" || (item.name && item.name.toLowerCase().includes("product"))) {
        productSalesTotal += Number(item.total_price || 0);
      }
    });

    // Monthly Revenue Trend (Last 6 Months)
    const monthsMap = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleString("en-US", { month: "short" });
      monthsMap.set(key, 0);
    }
    invoices.forEach((inv: any) => {
      if (inv.payment_status === "paid" || inv.payment_status === "Paid") {
        const d = new Date(inv.created_at);
        const key = d.toLocaleString("en-US", { month: "short" });
        if (monthsMap.has(key)) {
          monthsMap.set(key, (monthsMap.get(key) || 0) + Number(inv.grand_total || 0));
        }
      }
    });
    const revenueTrend = Array.from(monthsMap.entries()).map(([month, revenue]) => ({ month, revenue }));

    // Member Growth Trend (Last 6 Months)
    const memberGrowthMap = new Map<string, number>();
    monthsMap.forEach((_, key) => memberGrowthMap.set(key, 0));
    members.forEach((m: any) => {
      const d = new Date(m.created_at);
      const key = d.toLocaleString("en-US", { month: "short" });
      if (memberGrowthMap.has(key)) {
        memberGrowthMap.set(key, (memberGrowthMap.get(key) || 0) + 1);
      }
    });
    const memberGrowth = Array.from(memberGrowthMap.entries()).map(([month, members]) => ({ month, members }));

    // Revenue by Plan Category
    const planRevenueMap = new Map<string, number>();
    purchasedPlans.forEach((p: any) => {
      const cat = p.category || "Membership Plans";
      planRevenueMap.set(cat, (planRevenueMap.get(cat) || 0) + Number(p.price || 0));
    });
    const revenueByPlan = Array.from(planRevenueMap.entries()).map(([category, amount]) => ({ category, amount }));

    // Membership Status Distribution
    const statusCounts = {
      Active: activeMembersCount,
      Frozen: members.filter((m: any) => m.membership_status === "frozen" || m.freeze_status === "frozen").length,
      ExpiringSoon: expiringMembershipsCount,
      Expired: members.filter((m: any) => m.membership_status === "inactive" || m.membership_status === "expired").length,
      Cancelled: members.filter((m: any) => m.membership_status === "cancelled").length,
    };

    // 2. Payments & Financial Breakdowns
    const paymentsList = invoices.map((inv: any) => ({
      id: inv.id,
      invoice_number: inv.invoice_number || `INV-${inv.id.slice(0, 6)}`,
      customer_name: inv.customer_name || "Client",
      customer_email: inv.customer_email || "N/A",
      customer_phone: inv.customer_phone || "N/A",
      subtotal: Number(inv.subtotal || 0),
      discount_amount: Number(inv.discount_amount || 0),
      grand_total: Number(inv.grand_total || 0),
      amount_paid: Number(inv.amount_paid || 0),
      outstanding: Math.max(0, Number(inv.grand_total || 0) - Number(inv.amount_paid || 0)),
      payment_status: inv.payment_status || "due",
      payment_method: inv.payment_method || "UPI",
      created_at: inv.created_at,
    }));

    // 3. Classes & Attendance Analytics
    const classAttendanceAnalytics = classes.map((c: any) => {
      const classBookings = bookings.filter((b: any) => b.class_id === c.id && b.booking_status !== "cancelled");
      const attendedCount = classBookings.filter((b: any) => 
        b.booking_status === "checked_in" || b.booking_status === "completed" || b.attendance_status === "present" || b.checked_in_at
      ).length;
      const noShowCount = classBookings.filter((b: any) => b.booking_status === "no_show" || b.attendance_status === "no_show").length;
      const maxCap = Number(c.max_capacity || 10);
      const occupancyPct = maxCap > 0 ? Math.min(100, Math.round((classBookings.length / maxCap) * 100)) : 0;
      const attendancePct = classBookings.length > 0 ? Math.round((attendedCount / classBookings.length) * 100) : 0;

      return {
        id: c.id,
        title: c.title,
        instructor: c.instructor,
        class_date: c.class_date,
        class_time: c.class_time,
        category: c.category || "Reformer Pilates",
        max_capacity: maxCap,
        total_bookings: classBookings.length,
        attended: attendedCount,
        no_shows: noShowCount,
        occupancy_pct: occupancyPct,
        attendance_pct: attendancePct,
      };
    });

    // 4. Trainer Performance
    const trainerPerformance = staff.map((tr: any) => {
      const trName = tr.full_name;
      const trainerClasses = classes.filter((c: any) => c.instructor === trName);
      const trainerPTSessions = ptSessions.filter((pt: any) => pt.trainer_name === trName);
      
      let groupClassBookingsCount = 0;
      trainerClasses.forEach((c: any) => {
        const bks = bookings.filter((b: any) => b.class_id === c.id && b.booking_status !== "cancelled");
        groupClassBookingsCount += bks.length;
      });

      const ptRevenue = trainerPTSessions.length * 1500; // Estimated or package revenue
      const groupClassCommission = groupClassBookingsCount * Number(tr.group_class_commission || 150);
      const ptCommission = trainerPTSessions.length * Number(tr.pt_commission || 300);
      const totalCommission = groupClassCommission + ptCommission;
      const totalSalary = Number(tr.monthly_salary || 0);

      return {
        id: tr.id,
        full_name: trName,
        role: tr.role || "Instructor",
        classes_conducted: trainerClasses.length,
        pt_sessions_conducted: trainerPTSessions.length,
        total_sessions: trainerClasses.length + trainerPTSessions.length,
        pt_revenue: ptRevenue,
        pt_commission: ptCommission,
        group_commission: groupClassCommission,
        total_commission: totalCommission,
        monthly_salary: totalSalary,
        total_payout: totalSalary + totalCommission,
      };
    });

    // 5. Products & Inventory
    const productCatalog = products.map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: Number(p.price || 0),
      sessions: p.sessions,
      stock_quantity: Number(p.stock_quantity ?? 15),
      stock_status: (p.stock_quantity ?? 15) === 0 ? "Out of Stock" : (p.stock_quantity ?? 15) <= 5 ? "Low Stock" : "In Stock",
    }));

    // 6. Profit & Loss Financial Breakdown
    let membershipRevenue = 0;
    let ptRevenueTotal = 0;
    let groupRevenueTotal = 0;

    purchasedPlans.forEach((p: any) => {
      const amt = Number(p.price || 0);
      const cat = (p.category || "").toLowerCase();
      if (cat.includes("pt")) ptRevenueTotal += amt;
      else if (cat.includes("class")) groupRevenueTotal += amt;
      else membershipRevenue += amt;
    });

    let totalStaffSalaries = 0;
    let totalCommissionsPaid = 0;
    trainerPerformance.forEach((tp: any) => {
      totalStaffSalaries += tp.monthly_salary;
      totalCommissionsPaid += tp.total_commission;
    });
    const estimatedOperationalExpenses = 25000; // Utilities, studio maintenance
    const totalExpenses = totalStaffSalaries + totalCommissionsPaid + estimatedOperationalExpenses;
    const netProfit = totalRevenue - totalExpenses;

    // Return combined analytics response
    return NextResponse.json({
      overview: {
        todayRevenue,
        monthRevenue,
        totalRevenue,
        activeMembersCount,
        newMembersCount,
        trialMembersCount,
        expiringMembershipsCount,
        pendingPaymentsTotal,
        productSalesTotal,
        revenueTrend,
        memberGrowth,
        revenueByPlan,
        statusCounts,
      },
      payments: paymentsList,
      memberships: purchasedPlans,
      classes: classAttendanceAnalytics,
      trainers: trainerPerformance,
      products: productCatalog,
      pnl: {
        totalRevenue,
        membershipRevenue,
        ptRevenue: ptRevenueTotal,
        groupRevenue: groupRevenueTotal,
        productRevenue: productSalesTotal,
        totalExpenses,
        salaries: totalStaffSalaries,
        commissions: totalCommissionsPaid,
        operationalExpenses: estimatedOperationalExpenses,
        netProfit,
      },
      invoices,
      freezes: {
        activeFreezes: freezes,
        requests: freezeRequests,
      },
      referrals: {
        codes: referralCodes,
        requests: referralRequests,
      },
      discounts,
      trials: trialMembers,
      support: tickets,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
