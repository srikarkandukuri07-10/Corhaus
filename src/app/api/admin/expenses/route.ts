import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (serviceKey) {
    const serviceClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return { client: serviceClient, user, profile };
  }

  return { client: supabase, user, profile };
}

export async function GET(req: Request) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("expenses.view");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;

    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const category = url.searchParams.get("category");
    const paymentMethod = url.searchParams.get("paymentMethod");
    const recurringFilter = url.searchParams.get("recurring");
    const month = url.searchParams.get("month");
    const year = url.searchParams.get("year");

    let query = client.from("expenses").select("*").order("expense_date", { ascending: false });

    if (startDate) query = query.gte("expense_date", startDate);
    if (endDate) query = query.lte("expense_date", endDate);
    if (category && category !== "All") query = query.eq("category_name", category);
    if (paymentMethod && paymentMethod !== "All") query = query.eq("payment_method", paymentMethod);
    if (recurringFilter && recurringFilter !== "All") {
      if (recurringFilter === "Recurring") query = query.eq("is_recurring", true);
      if (recurringFilter === "One-time") query = query.eq("is_recurring", false);
    }

    const { data: expensesData, error: fetchErr } = await query;

    if (fetchErr) {
      return NextResponse.json({ expenses: [], metrics: {}, categoryBreakdown: [] });
    }

    const expensesList = (expensesData || []).filter((exp: any) => {
      if (month && month !== "All") {
        const m = new Date(exp.expense_date).getMonth() + 1;
        if (m !== Number(month)) return false;
      }
      if (year && year !== "All") {
        const y = new Date(exp.expense_date).getFullYear();
        if (y !== Number(year)) return false;
      }
      return true;
    });

    // Compute Summary Dashboard Metrics from all records
    const { data: allExpenses } = await client.from("expenses").select("*");
    const all = allExpenses || [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const dayOfMonth = now.getDate();

    let ytdExpenses = 0;
    let thisMonthExpenses = 0;
    let prevMonthExpenses = 0;
    const categoryTotals = new Map<string, number>();

    all.forEach((e: any) => {
      const amt = Number(e.amount || 0);
      const d = new Date(e.expense_date);
      const y = d.getFullYear();
      const m = d.getMonth();

      // Year-to-Date
      if (y === currentYear) {
        ytdExpenses += amt;
      }

      // Current Month
      if (y === currentYear && m === currentMonth) {
        thisMonthExpenses += amt;
      }

      // Previous Month
      const prevM = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevY = currentMonth === 0 ? currentYear - 1 : currentYear;
      if (y === prevY && m === prevM) {
        prevMonthExpenses += amt;
      }

      // Category aggregation
      const catName = e.category_name || "Miscellaneous";
      categoryTotals.set(catName, (categoryTotals.get(catName) || 0) + amt);
    });

    const avgDailyExpense = dayOfMonth > 0 ? Math.round(thisMonthExpenses / dayOfMonth) : 0;

    // Top Category
    let topCategory = "N/A";
    let maxCatSpent = 0;
    categoryTotals.forEach((spent, cat) => {
      if (spent > maxCatSpent) {
        maxCatSpent = spent;
        topCategory = cat;
      }
    });

    // MoM Percentage Comparison
    let momChangePct = 0;
    if (prevMonthExpenses > 0) {
      momChangePct = Math.round(((thisMonthExpenses - prevMonthExpenses) / prevMonthExpenses) * 100);
    } else if (thisMonthExpenses > 0) {
      momChangePct = 100;
    }

    // Category Breakdown Progress Bar data
    const totalAllSpent = Array.from(categoryTotals.values()).reduce((a, b) => a + b, 0);
    const categoryBreakdown = Array.from(categoryTotals.entries())
      .map(([catName, totalSpent]) => ({
        category: catName,
        totalSpent,
        percentage: totalAllSpent > 0 ? Math.round((totalSpent / totalAllSpent) * 100) : 0,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    return NextResponse.json({
      expenses: expensesList,
      metrics: {
        ytdExpenses,
        thisMonthExpenses,
        avgDailyExpense,
        topCategory,
        momChangePct,
        prevMonthExpenses,
      },
      categoryBreakdown,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("expenses.create");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client, user, profile } = auth;

    const body = await req.json();
    const {
      title,
      category_name,
      category_id,
      amount,
      payment_method,
      paid_to,
      expense_date,
      description,
      is_recurring,
      recurring_frequency,
    } = body;

    // Server-side validation
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Expense title is required" }, { status: 400 });
    }
    if (!category_name || typeof category_name !== "string" || !category_name.trim()) {
      return NextResponse.json({ error: "Expense category is required" }, { status: 400 });
    }
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }
    if (!payment_method || typeof payment_method !== "string" || !payment_method.trim()) {
      return NextResponse.json({ error: "Payment method is required" }, { status: 400 });
    }
    if (!expense_date) {
      return NextResponse.json({ error: "Expense date is required" }, { status: 400 });
    }
    if (is_recurring && (!recurring_frequency || !["Daily", "Weekly", "Monthly"].includes(recurring_frequency))) {
      return NextResponse.json({ error: "Recurring frequency (Daily, Weekly, Monthly) is required for recurring expenses" }, { status: 400 });
    }

    const newExpense = {
      title: title.trim(),
      category_name: category_name.trim(),
      category_id: category_id || null,
      amount: numAmount,
      payment_method: payment_method.trim(),
      paid_to: paid_to ? paid_to.trim() : null,
      expense_date,
      description: description ? description.trim() : null,
      is_recurring: Boolean(is_recurring),
      recurring_frequency: is_recurring ? recurring_frequency : null,
      created_by: user.id,
      created_by_name: profile?.full_name || user.email || "Admin",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: createdData, error: createErr } = await client
      .from("expenses")
      .insert([newExpense])
      .select()
      .single();

    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, expense: createdData });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
