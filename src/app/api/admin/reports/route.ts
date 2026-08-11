import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { error: "Unauthorized", status: 401 };

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
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("reports.view");
    if (!check.authorized) return check.response!;

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
      expensesRes,
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
      client.from("expenses").select("*").order("expense_date", { ascending: false }),
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
    const expensesList = expensesRes.data || [];
    const memberMapById = new Map<string, any>();

    members.forEach((m: any) => {
      memberMapById.set(m.id, m);
    });

    const invoiceMapById = new Map<string, any>();
    invoices.forEach((inv: any) => {
      invoiceMapById.set(inv.id, inv);
    });

    const enrichedPurchasedPlans = purchasedPlans.map((p: any) => {
      const m = memberMapById.get(p.approved_member_id);
      const inv = invoiceMapById.get(p.invoice_id);
      const memberName = m?.full_name || inv?.customer_name || "Member";
      const memberEmail = m?.email || inv?.customer_email || "";
      return {
        ...p,
        member_name: memberName,
        member_email: memberEmail,
      };
    });

    const todayStr = new Date().toISOString().split("T")[0];

    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    // Filter datasets by date range for period-based calculations
    const filteredInvoices = invoices.filter((inv: any) => {
      if (!inv.created_at) return true;
      const d = inv.created_at.split("T")[0];
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });

    const filteredExpenses = expensesList.filter((e: any) => {
      if (!e.expense_date) return true;
      const d = e.expense_date.split("T")[0];
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });

    const filteredPurchasedPlans = enrichedPurchasedPlans.filter((p: any) => {
      const d = p.created_at ? p.created_at.split("T")[0] : p.valid_from;
      if (!d) return true;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });


    const filteredClasses = classes.filter((c: any) => {
      if (!c.class_date) return true;
      if (startDate && c.class_date < startDate) return false;
      if (endDate && c.class_date > endDate) return false;
      return true;
    });

    const filteredPtSessions = ptSessions.filter((pt: any) => {
      if (!pt.session_date) return true;
      if (startDate && pt.session_date < startDate) return false;
      if (endDate && pt.session_date > endDate) return false;
      return true;
    });

    // 1. Overview Metrics
    let todayRevenue = 0;
    let monthRevenue = 0;
    let totalRevenue = 0;
    let pendingPaymentsTotal = 0;

    // Use filteredInvoices for totalRevenue when a date filter is selected
    const targetInvoices = (startDate || endDate) ? filteredInvoices : invoices;

    targetInvoices.forEach((inv: any) => {
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

    // Product Sales Volume (period-filtered)
    let productSalesTotal = 0;
    const targetInvoiceItems = (startDate || endDate)
      ? invoiceItems.filter((item: any) => {
          const parentInv = invoices.find((inv: any) => inv.id === item.invoice_id);
          if (!parentInv || !parentInv.created_at) return true;
          const d = parentInv.created_at.split("T")[0];
          if (startDate && d < startDate) return false;
          if (endDate && d > endDate) return false;
          return true;
        })
      : invoiceItems;

    targetInvoiceItems.forEach((item: any) => {
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
    const targetPlans = (startDate || endDate) ? filteredPurchasedPlans : enrichedPurchasedPlans;

    targetPlans.forEach((p: any) => {
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
    const paymentsList = targetInvoices.map((inv: any) => ({
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
    const targetClassesList = (startDate || endDate) ? filteredClasses : classes;
    const classAttendanceAnalytics = targetClassesList.map((c: any) => {
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

    // 4. Trainer Performance & Commissions Calculation
    const targetPtSessions = (startDate || endDate) ? filteredPtSessions : ptSessions;
    const trainerPerformance = staff.map((tr: any) => {
      const trName = tr.full_name;
      const trainerClasses = targetClassesList.filter((c: any) => c.instructor === trName);
      
      // Filter PT sessions: must be for this trainer AND not cancelled / not no-show
      const validTrainerPTSessions = targetPtSessions.filter((pt: any) => 
        pt.trainer_name === trName &&
        pt.status !== "cancelled" &&
        pt.status !== "no-show"
      );
      
      let attendedGroupBookingsCount = 0;
      trainerClasses.forEach((c: any) => {
        // Exclude cancelled AND no-show bookings from commission eligibility
        const attendedBookings = bookings.filter((b: any) => 
          b.class_id === c.id &&
          b.booking_status !== "cancelled" &&
          b.booking_status !== "no_show" &&
          b.attendance_status !== "no_show" &&
          (b.booking_status === "checked_in" || b.booking_status === "completed" || b.attendance_status === "present" || b.checked_in_at)
        );
        attendedGroupBookingsCount += attendedBookings.length;
      });

      const ptRevenue = validTrainerPTSessions.length * 1500;
      const groupClassCommission = attendedGroupBookingsCount * Number(tr.group_class_commission || 150);
      const ptCommission = validTrainerPTSessions.length * Number(tr.pt_commission || 300);
      const totalCommission = groupClassCommission + ptCommission;
      const totalSalary = Number(tr.monthly_salary || 0);

      return {
        id: tr.id,
        full_name: trName,
        role: tr.role || "Instructor",
        classes_conducted: trainerClasses.length,
        pt_sessions_conducted: validTrainerPTSessions.length,
        total_sessions: trainerClasses.length + validTrainerPTSessions.length,
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

    // 6. Profit & Loss Financial Breakdown (Period-scoped)
    let membershipRevenue = 0;
    let ptRevenueTotal = 0;
    let groupRevenueTotal = 0;

    targetPlans.forEach((p: any) => {
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

    // Period-filtered expenses for P&L
    const targetExpenses = (startDate || endDate) ? filteredExpenses : expensesList;
    let totalRecordedExpenses = 0;
    targetExpenses.forEach((e: any) => {
      totalRecordedExpenses += Number(e.amount || 0);
    });

    const totalExpenses = totalStaffSalaries + totalCommissionsPaid + totalRecordedExpenses;
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
      memberships: targetPlans,
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
        recordedExpenses: totalRecordedExpenses,
        netProfit,
      },
      invoices: targetInvoices,
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
