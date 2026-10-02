import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import {
  getPeriodRange,
  computeRevenue,
  computePendingPaymentsTotal,
  computeProductSalesTotal,
  computeActiveMembersCount,
  computeNewMembersCount,
  computeExpiringMembershipsCount,
  computeRenewalRate,
  computeAvgRevenuePerMember,
  isDateInRange,
  type PeriodKey,
} from "@/lib/reportMetrics";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const { getUserRolePermissions } = await import("@/lib/rbac");
  const userPerms = await getUserRolePermissions(user);
  if (userPerms.role === "Member" || userPerms.role === "Guest") {
    return { error: "Forbidden", status: 403 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { client: serviceClient, serviceClient, user, profile };
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

    // Branch isolation: every number below is computed from the active branch only.
    const { getLocationAccess, resolveActiveLocation, locationDenied } = await import("@/lib/location");
    const locAccess = await getLocationAccess(auth.user);
    const locationId = resolveActiveLocation(locAccess, req);
    if (!locationId) return locationDenied("No accessible location found for this account.");

    // Parse query params for date filtering if provided
    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const periodParam = url.searchParams.get("period") as PeriodKey | null;

    // Single source of truth for every period-based card on this page — the
    // same function the admin dashboard's "This Month" card uses, so the two
    // pages can never disagree again. A legacy startDate/endDate pair (from
    // the old custom-range inputs) is treated as a custom period; otherwise
    // the named period param is used, defaulting to All Time.
    const now = new Date();
    const activeRange =
      startDate || endDate
        ? getPeriodRange("custom", now, { startDate: startDate || "1970-01-01", endDate: endDate || now.toISOString().split("T")[0] })
        : getPeriodRange(periodParam || "allTime", now);

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
      staffLocRes,
    ] = await Promise.all([
      client.from("invoices").select("*").eq("location_id", locationId).order("created_at", { ascending: false }),
      client.from("invoice_items").select("*").eq("location_id", locationId),
      client.from("approved_members").select("*").eq("location_id", locationId).order("created_at", { ascending: false }),
      client.from("member_purchased_plans").select("*").eq("location_id", locationId).order("created_at", { ascending: false }),
      client.from("classes").select("*").eq("location_id", locationId).order("class_date", { ascending: false }),
      client.from("bookings").select("*").eq("location_id", locationId).order("created_at", { ascending: false }),
      client.from("attendance").select("*").eq("location_id", locationId),
      client.from("staff_members").select("*"),
      client.from("pt_sessions").select("*").eq("location_id", locationId).order("session_date", { ascending: false }),
      client.from("billing_plan_items").select("*").eq("location_id", locationId),
      client.from("membership_freezes").select("*").eq("location_id", locationId),
      client.from("freeze_requests").select("*").eq("location_id", locationId),
      client.from("referral_codes").select("*").eq("location_id", locationId),
      client.from("referral_requests").select("*").eq("location_id", locationId),
      client.from("member_discounts").select("*").eq("location_id", locationId),
      client.from("trial_members").select("*").eq("location_id", locationId).order("created_at", { ascending: false }),
      client.from("support_tickets").select("*").eq("location_id", locationId).order("created_at", { ascending: false }),
      client.from("expenses").select("*").eq("location_id", locationId).order("expense_date", { ascending: false }),
      client.from("staff_locations").select("staff_id").eq("location_id", locationId),
    ]);

    const invoices = invoicesRes.data || [];
    const invoiceItems = invoiceItemsRes.data || [];
    const members = membersRes.data || [];
    const purchasedPlans = plansRes.data || [];
    const classes = classesRes.data || [];
    const bookings = bookingsRes.data || [];
    const attendance = attendanceRes.data || [];
    // Staff directory scoped to the active branch (primary or mapped).
    // Sessions/classes are already branch-filtered, so cross-branch trainers
    // can't leak in through performance calculations either.
    const branchStaffIds = new Set((staffLocRes.data || []).map((s: any) => s.staff_id));
    const staff = (staffRes.data || []).filter(
      (tr: any) => tr.location_id === locationId || branchStaffIds.has(tr.id)
    );
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

    // "Today" is always its own fixed 1-day window (IST), regardless of the
    // selected period. Derived from last7days' end boundary (not a plain
    // `new Date().toISOString()` UTC date string, which can land a calendar
    // day off from IST near midnight).
    const last7 = getPeriodRange("last7days", now);
    const todayRangeFinal = { ...last7, key: "custom" as const, label: "Today", start: new Date(last7.end.getTime() - 86400000) };

    // Filter datasets by the single active period for every period-based calculation on this page.
    const filteredInvoices = invoices.filter((inv: any) => isDateInRange(inv.created_at, activeRange));
    const filteredExpenses = expensesList.filter((e: any) => isDateInRange(e.expense_date, activeRange));
    const filteredPurchasedPlans = enrichedPurchasedPlans.filter((p: any) =>
      isDateInRange(p.created_at || p.valid_from, activeRange)
    );
    const filteredClasses = classes.filter((c: any) => isDateInRange(c.class_date, activeRange));
    const filteredPtSessions = ptSessions.filter((pt: any) => isDateInRange(pt.session_date, activeRange));

    // 1. Overview Metrics — all computed via the shared reportMetrics engine
    // (src/lib/reportMetrics.ts), the same module the admin dashboard uses.
    const targetInvoices = activeRange.key === "allTime" ? invoices : filteredInvoices;

    const revenueForActiveRange = computeRevenue(invoices, activeRange);
    const monthRevenue = computeRevenue(invoices, getPeriodRange("thisMonth", now));
    const todayRevenue = computeRevenue(invoices, todayRangeFinal);
    // "Total Revenue" card: honors the selected period (matches MyGymDesk,
    // where every overview card moves together with the one period picker).
    const totalRevenue = revenueForActiveRange;
    // True all-time total, independent of the selected period — used only
    // for the reference "Total Revenue (All Time)" card.
    const totalRevenueAllTime = computeRevenue(invoices, getPeriodRange("allTime", now));
    const pendingPaymentsTotal = computePendingPaymentsTotal(invoices);

    const activeMembersCount = computeActiveMembersCount(members);
    const newMembersCount = computeNewMembersCount(members, activeRange.key === "allTime" ? getPeriodRange("last30days", now) : activeRange);

    const trialMembersCount = trialMembers.length;

    // Expiring memberships — fixed 7-day lookahead (matches MyGymDesk's "Expiring ≤7D" card); not period-scoped.
    const expiringMembershipsCount = computeExpiringMembershipsCount(purchasedPlans, 7, now);

    const renewalRate = computeRenewalRate(enrichedPurchasedPlans as any, activeRange);
    const avgRevenuePerMember = computeAvgRevenuePerMember(revenueForActiveRange, activeMembersCount);

    // Product Sales Volume (period-filtered)
    const invoiceDateById = new Map<string, string | null | undefined>();
    invoices.forEach((inv: any) => invoiceDateById.set(inv.id, inv.created_at));
    const productSalesTotal = computeProductSalesTotal(invoiceItems, invoiceDateById, activeRange);

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
    const targetPlans = activeRange.key === "allTime" ? enrichedPurchasedPlans : filteredPurchasedPlans;

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
    const targetClassesList = activeRange.key === "allTime" ? classes : filteredClasses;
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
    const targetPtSessions = activeRange.key === "allTime" ? ptSessions : filteredPtSessions;
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
    const targetExpenses = activeRange.key === "allTime" ? expensesList : filteredExpenses;
    let totalRecordedExpenses = 0;
    targetExpenses.forEach((e: any) => {
      totalRecordedExpenses += Number(e.amount || 0);
    });

    const totalExpenses = totalStaffSalaries + totalCommissionsPaid + totalRecordedExpenses;
    const netProfit = totalRevenue - totalExpenses;

    // Return combined analytics response
    return NextResponse.json({
      period: { key: activeRange.key, label: activeRange.label, start: activeRange.start?.toISOString() ?? null, end: activeRange.end.toISOString() },
      overview: {
        // Revenue for the selected period — the single figure every card below should agree with.
        revenue: revenueForActiveRange,
        todayRevenue,
        monthRevenue,
        totalRevenue,
        totalRevenueAllTime,
        activeMembersCount,
        newMembersCount,
        renewalRate,
        avgRevenuePerMember,
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
