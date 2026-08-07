"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/usePermissions";

function fmt(n: number) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

function formatDateDisplay(dStr: string | null | undefined) {
  if (!dStr) return "—";
  try {
    return new Date(dStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch (_) {
    return dStr;
  }
}

function exportToExcel(data: any[], filename: string) {
  if (!data || data.length === 0) return;
  const headers = [
    "Date",
    "Category",
    "Expense Title",
    "Paid To",
    "Amount",
    "Payment Method",
    "Is Recurring",
    "Recurring Frequency",
    "Description",
    "Created By",
  ];

  const tsvRows = [
    headers.join("\t"),
    ...data.map((item) =>
      [
        item.expense_date || "",
        item.category_name || "",
        item.title || "",
        item.paid_to || "",
        item.amount || 0,
        item.payment_method || "",
        item.is_recurring ? "Yes" : "No",
        item.recurring_frequency || "N/A",
        item.description || "",
        item.created_by_name || "",
      ]
        .map((val) => String(val).replace(/\t/g, " "))
        .join("\t")
    ),
  ];

  const blob = new Blob([tsvRows.join("\n")], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.xls`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

interface Expense {
  id: string;
  title: string;
  category_id?: string | null;
  category_name: string;
  amount: number;
  payment_method: string;
  paid_to?: string | null;
  expense_date: string;
  description?: string | null;
  is_recurring: boolean;
  recurring_frequency?: string | null;
  created_by_name?: string | null;
  created_at?: string;
}

const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Other"];
const RECURRING_FREQUENCIES = ["Daily", "Weekly", "Monthly"];
const DEFAULT_CATEGORIES = [
  "Rent",
  "Salaries",
  "Utilities",
  "Equipment",
  "Marketing",
  "Software",
  "Maintenance",
  "Miscellaneous",
];

const CATEGORY_COLORS = [
  "bg-amber-500",
  "bg-emerald-500",
  "bg-indigo-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-blue-500",
  "bg-teal-500",
  "bg-orange-500",
];

export default function ExpensesPage() {
  const supabase = createClient();
  const { hasPerm } = usePermissions();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<{ id: string; category_name: string }[]>([]);
  const [metrics, setMetrics] = useState<any>({});
  const [categoryBreakdown, setCategoryBreakdown] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("All");
  const [selectedRecurring, setSelectedRecurring] = useState("All");
  const [selectedMonth, setSelectedMonth] = useState("All");
  const [selectedYear, setSelectedYear] = useState("All");

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState("");
  const [formCategoryName, setFormCategoryName] = useState(DEFAULT_CATEGORIES[0]);
  const [formAmount, setFormAmount] = useState("");
  const [formPaymentMethod, setFormPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [formPaidTo, setFormPaidTo] = useState("");
  const [formExpenseDate, setFormExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [formDescription, setFormDescription] = useState("");
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formRecurringFreq, setFormRecurringFreq] = useState("Monthly");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch Categories & Expenses
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/expenses/categories");
      if (res.ok) {
        const data = await res.json();
        if (data.categories && data.categories.length > 0) {
          setCategories(data.categories);
        }
      }
    } catch (_) {}
  }, []);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (selectedCategory !== "All") params.set("category", selectedCategory);
      if (selectedPaymentMethod !== "All") params.set("paymentMethod", selectedPaymentMethod);
      if (selectedRecurring !== "All") params.set("recurring", selectedRecurring);
      if (selectedMonth !== "All") params.set("month", selectedMonth);
      if (selectedYear !== "All") params.set("year", selectedYear);

      const res = await fetch(`/api/admin/expenses?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to fetch expenses");
      }
      const data = await res.json();
      setExpenses(data.expenses || []);
      setMetrics(data.metrics || {});
      setCategoryBreakdown(data.categoryBreakdown || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedCategory, selectedPaymentMethod, selectedRecurring, selectedMonth, selectedYear]);

  useEffect(() => {
    fetchCategories();
    fetchExpenses();
  }, [fetchCategories, fetchExpenses]);

  // Handle Preset Date Change
  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const today = new Date();

    if (preset === "today") {
      const d = today.toISOString().split("T")[0];
      setStartDate(d);
      setEndDate(d);
    } else if (preset === "week") {
      const start = new Date(today);
      start.setDate(today.getDate() - 7);
      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(today.toISOString().split("T")[0]);
    } else if (preset === "month") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(today.toISOString().split("T")[0]);
    } else if (preset === "30days") {
      const start = new Date(today);
      start.setDate(today.getDate() - 30);
      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(today.toISOString().split("T")[0]);
    } else {
      setStartDate("");
      setEndDate("");
    }
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingExpense(null);
    setFormTitle("");
    setFormCategoryName(categories.length > 0 ? categories[0].category_name : DEFAULT_CATEGORIES[0]);
    setFormAmount("");
    setFormPaymentMethod(PAYMENT_METHODS[0]);
    setFormPaidTo("");
    setFormExpenseDate(new Date().toISOString().split("T")[0]);
    setFormDescription("");
    setFormIsRecurring(false);
    setFormRecurringFreq("Monthly");
    setFormError(null);
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (exp: Expense) => {
    setEditingExpense(exp);
    setFormTitle(exp.title);
    setFormCategoryName(exp.category_name);
    setFormAmount(String(exp.amount));
    setFormPaymentMethod(exp.payment_method || PAYMENT_METHODS[0]);
    setFormPaidTo(exp.paid_to || "");
    setFormExpenseDate(exp.expense_date);
    setFormDescription(exp.description || "");
    setFormIsRecurring(exp.is_recurring);
    setFormRecurringFreq(exp.recurring_frequency || "Monthly");
    setFormError(null);
    setIsAddModalOpen(true);
  };

  // Save Expense (Create or Update)
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formTitle.trim()) {
      setFormError("Expense title is required");
      return;
    }
    const amt = Number(formAmount);
    if (isNaN(amt) || amt <= 0) {
      setFormError("Amount must be greater than zero");
      return;
    }
    if (!formExpenseDate) {
      setFormError("Expense date is required");
      return;
    }
    if (formIsRecurring && !formRecurringFreq) {
      setFormError("Recurring frequency is required when recurring is enabled");
      return;
    }

    setFormSubmitting(true);
    try {
      const selectedCatObj = categories.find((c) => c.category_name === formCategoryName);
      const payload = {
        title: formTitle.trim(),
        category_name: formCategoryName,
        category_id: selectedCatObj ? selectedCatObj.id : null,
        amount: amt,
        payment_method: formPaymentMethod,
        paid_to: formPaidTo.trim() || null,
        expense_date: formExpenseDate,
        description: formDescription.trim() || null,
        is_recurring: formIsRecurring,
        recurring_frequency: formIsRecurring ? formRecurringFreq : null,
      };

      const url = editingExpense ? `/api/admin/expenses/${editingExpense.id}` : "/api/admin/expenses";
      const method = editingExpense ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Failed to save expense");
      }

      setIsAddModalOpen(false);
      fetchExpenses();
    } catch (err: any) {
      setFormError(err.message || "An error occurred while saving");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async () => {
    if (!deletingExpense) return;
    try {
      const res = await fetch(`/api/admin/expenses/${deletingExpense.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete expense");
      }
      setDeletingExpense(null);
      fetchExpenses();
    } catch (err: any) {
      alert(err.message || "Failed to delete expense");
    }
  };

  // Filtered Expenses List by Search Query
  const filteredExpenses = useMemo(() => {
    let result = [...expenses];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (exp) =>
          exp.title.toLowerCase().includes(q) ||
          (exp.paid_to && exp.paid_to.toLowerCase().includes(q)) ||
          exp.category_name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [expenses, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-2 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-fg-3 mb-1">
            <span>Sales &amp; Billing</span>
            <span>/</span>
            <span className="text-fg font-bold">Expenses</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-fg">Expenses Management</h1>
          <p className="text-xs text-fg-3 mt-1">
            Record, organize, and analyze all business operating expenses with direct Profit &amp; Loss integration.
          </p>
        </div>

        {/* Global Actions: Export Excel & Add Expense */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => exportToExcel(filteredExpenses, `corhaus_expenses_${new Date().toISOString().split("T")[0]}`)}
            className="px-3.5 py-2 rounded-xl bg-surface-2 border border-line-2 text-fg text-xs font-bold hover:bg-hover transition-colors shadow-xs flex items-center gap-1.5"
          >
            <span>📊</span> Export to Excel
          </button>
          <button
            onClick={handleOpenAddModal}
            disabled={!hasPerm("expenses.create")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 ${
              hasPerm("expenses.create")
                ? "bg-accent text-white hover:bg-accent-2 cursor-pointer"
                : "bg-accent/45 text-white/65 cursor-not-allowed opacity-60"
            }`}
            title={hasPerm("expenses.create") ? "" : "Requires expenses.create permission"}
          >
            <span>➕</span> Add Expense
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Expenses Summary Dashboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* YTD Expenses */}
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">Year-to-Date Expenses</p>
          <p className="text-xl font-bold text-fg mt-1">{fmt(metrics.ytdExpenses)}</p>
        </div>

        {/* This Month's Expenses */}
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">This Month's Expenses</p>
          <p className="text-xl font-bold text-amber-500 mt-1">{fmt(metrics.thisMonthExpenses)}</p>
        </div>

        {/* Average Daily Expense (Current Month) */}
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">Avg Daily Expense (Month)</p>
          <p className="text-xl font-bold text-indigo-400 mt-1">{fmt(metrics.avgDailyExpense)}</p>
        </div>

        {/* Top Expense Category */}
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">Top Category</p>
          <p className="text-base font-bold text-gold-fg mt-1 truncate">{metrics.topCategory || "N/A"}</p>
        </div>

        {/* MoM Comparison */}
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">vs Previous Month</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={`text-lg font-bold ${
                (metrics.momChangePct || 0) <= 0 ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {(metrics.momChangePct || 0) > 0 ? `+${metrics.momChangePct}%` : `${metrics.momChangePct || 0}%`}
            </span>
            <span className="text-[10px] text-fg-4">MoM</span>
          </div>
        </div>
      </div>

      {/* Expense Analytics: Category Breakdown Progress Bar */}
      <div className="p-5 rounded-2xl bg-surface border border-line-2 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-fg">Category-wise Expense Breakdown</h3>
          <span className="text-[11px] font-bold text-fg-3">Live Aggregation</span>
        </div>

        <div className="space-y-3">
          {categoryBreakdown.length === 0 ? (
            <p className="text-xs text-fg-4 italic">No expense data available yet.</p>
          ) : (
            categoryBreakdown.map((item, idx) => {
              const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
              return (
                <div key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-fg">{item.category}</span>
                    <span className="text-fg-3 font-mono">
                      {fmt(item.totalSpent)} ({item.percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-surface-2 rounded-full overflow-hidden border border-line-2">
                    <div
                      style={{ width: `${Math.max(2, item.percentage)}%` }}
                      className={`h-full ${color} rounded-full transition-all duration-500`}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Toolbar: Search & Multi-Filters */}
      <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Universal Search */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search expense title, paid to, category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg placeholder:text-fg-4 focus:ring-1 focus:ring-accent outline-none"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
          </div>

          {/* Date Presets */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="font-bold text-fg-3 uppercase text-[10px] tracking-wider">Date:</span>
            {["all", "today", "week", "month", "30days"].map((p) => (
              <button
                key={p}
                onClick={() => handleDatePresetChange(p)}
                className={`px-2.5 py-1 rounded-lg font-bold capitalize transition-all ${
                  datePreset === p
                    ? "bg-accent text-white shadow-xs"
                    : "bg-surface-2 text-fg-3 hover:text-fg hover:bg-hover"
                }`}
              >
                {p === "all" ? "All" : p === "30days" ? "30d" : p}
              </button>
            ))}

            <div className="flex items-center gap-1 border-l border-line-2 pl-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDatePreset("custom");
                }}
                className="px-2 py-1 rounded-lg border border-line-2 bg-surface-2 text-fg text-xs outline-none"
              />
              <span className="text-fg-3">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDatePreset("custom");
                }}
                className="px-2 py-1 rounded-lg border border-line-2 bg-surface-2 text-fg text-xs outline-none"
              />
            </div>
          </div>
        </div>

        {/* Dropdown Filters Row */}
        <div className="flex items-center gap-3 flex-wrap text-xs border-t border-line-2 pt-3">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-fg-3">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2.5 py-1 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none font-semibold"
            >
              <option value="All">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.category_name}>
                  {c.category_name}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-fg-3">Method:</span>
            <select
              value={selectedPaymentMethod}
              onChange={(e) => setSelectedPaymentMethod(e.target.value)}
              className="px-2.5 py-1 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none font-semibold"
            >
              <option value="All">All Methods</option>
              {PAYMENT_METHODS.map((pm) => (
                <option key={pm} value={pm}>
                  {pm}
                </option>
              ))}
            </select>
          </div>

          {/* Recurring Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-fg-3">Recurring:</span>
            <select
              value={selectedRecurring}
              onChange={(e) => setSelectedRecurring(e.target.value)}
              className="px-2.5 py-1 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none font-semibold"
            >
              <option value="All">All</option>
              <option value="Recurring">Recurring Only</option>
              <option value="One-time">One-time Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Expense List Table */}
      <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-fg-3">
            <div className="w-7 h-7 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-2" />
            <p className="text-xs font-semibold">Loading expenses...</p>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-3 text-fg-4 text-xl">
              💸
            </div>
            <p className="text-sm font-semibold text-fg">No expenses found</p>
            <p className="text-xs text-fg-3 mt-1">Try adjusting your filters or click Add Expense.</p>
          </div>
        ) : (
          <div className="w-full overflow-x-hidden">
            <table className="w-full text-[11px] text-left">
              <thead>
                <tr className="bg-surface-2 border-b border-line-2 text-fg-3 uppercase font-bold text-[10px]">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Expense Title</th>
                  <th className="py-3 px-3">Paid To</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">Payment Method</th>
                  <th className="py-3 px-3">Recurring</th>
                  <th className="py-3 px-3">Created By</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-2 text-fg">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-hover/50 transition-colors">
                    <td className="py-3 px-3 text-fg-3 whitespace-nowrap font-medium">{formatDateDisplay(exp.expense_date)}</td>
                    <td className="py-3 px-3">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-surface-2 text-fg font-semibold border border-line-2 text-[10px]">
                        {exp.category_name}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-fg">{exp.title}</td>
                    <td className="py-3 px-3 text-fg-2">{exp.paid_to || "—"}</td>
                    <td className="py-3 px-3 font-bold text-red-500">{fmt(exp.amount)}</td>
                    <td className="py-3 px-3 font-medium text-fg-2">{exp.payment_method}</td>
                    <td className="py-3 px-3">
                      {exp.is_recurring ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold text-[10px]">
                          {exp.recurring_frequency}
                        </span>
                      ) : (
                        <span className="text-fg-4 font-normal">One-time</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-fg-3">{exp.created_by_name || "Admin"}</td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setViewingExpense(exp)}
                          className="px-2 py-1 rounded-lg bg-surface-2 border border-line-2 text-fg font-semibold hover:bg-hover transition-colors"
                        >
                          View
                        </button>
                        {hasPerm("expenses.edit") && (
                          <button
                            onClick={() => handleOpenEditModal(exp)}
                            className="px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-semibold hover:bg-indigo-500/20 transition-colors"
                          >
                            Edit
                          </button>
                        )}
                        {hasPerm("expenses.delete") && (
                          <button
                            onClick={() => setDeletingExpense(exp)}
                            className="px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 font-semibold hover:bg-red-500/20 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Expense Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line-2 bg-surface-2">
              <h2 className="text-base font-serif font-bold text-fg">
                {editingExpense ? "Edit Expense Record" : "Record New Expense"}
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-fg-3 hover:bg-hover hover:text-fg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-semibold">
                  {formError}
                </div>
              )}

              {/* Expense Title */}
              <div>
                <label className="block font-bold text-fg mb-1">Expense Title *</label>
                <input
                  type="text"
                  placeholder="e.g., Studio Rent for August, Equipment Repairs"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none"
                />
              </div>

              {/* Category & Amount Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-fg mb-1">Category *</label>
                  <select
                    value={formCategoryName}
                    onChange={(e) => setFormCategoryName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none font-semibold"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.category_name}>
                        {c.category_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-fg mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none font-bold"
                  />
                </div>
              </div>

              {/* Payment Method & Expense Date Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-fg mb-1">Payment Method *</label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none font-semibold"
                  >
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-fg mb-1">Expense Date *</label>
                  <input
                    type="date"
                    value={formExpenseDate}
                    onChange={(e) => setFormExpenseDate(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none font-semibold"
                  />
                </div>
              </div>

              {/* Paid To */}
              <div>
                <label className="block font-bold text-fg mb-1">Paid To / Vendor Name</label>
                <input
                  type="text"
                  placeholder="e.g., Landlord Name, Vendor, Software Company"
                  value={formPaidTo}
                  onChange={(e) => setFormPaidTo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-fg mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Additional expense details, bill notes, reference number..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none resize-none"
                />
              </div>

              {/* Recurring Expense Section */}
              <div className="p-3.5 rounded-xl bg-surface-2 border border-line-2 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-fg">
                  <input
                    type="checkbox"
                    checked={formIsRecurring}
                    onChange={(e) => setFormIsRecurring(e.target.checked)}
                    className="w-4 h-4 rounded text-accent focus:ring-accent"
                  />
                  <span>Recurring Expense</span>
                </label>

                {formIsRecurring && (
                  <div className="pt-2 border-t border-line-2">
                    <label className="block font-semibold text-fg-3 mb-1">Recurrence Frequency:</label>
                    <div className="flex items-center gap-4">
                      {RECURRING_FREQUENCIES.map((freq) => (
                        <label key={freq} className="flex items-center gap-1.5 cursor-pointer font-semibold text-fg">
                          <input
                            type="radio"
                            name="recurring_frequency"
                            value={freq}
                            checked={formRecurringFreq === freq}
                            onChange={(e) => setFormRecurringFreq(e.target.value)}
                          />
                          <span>{freq}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-surface-2 border border-line-2 text-fg font-bold hover:bg-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-accent-2 transition-colors shadow-xs disabled:opacity-50"
                >
                  {formSubmitting ? "Saving..." : editingExpense ? "Update Expense" : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Expense Details Modal */}
      {viewingExpense && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-md shadow-xl overflow-hidden p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-line-2 pb-3">
              <h3 className="text-base font-serif font-bold text-fg">Expense Details</h3>
              <button onClick={() => setViewingExpense(null)} className="text-fg-3 hover:text-fg">✕</button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between py-1 border-b border-line-2/50">
                <span className="text-fg-3">Title</span>
                <span className="font-bold text-fg">{viewingExpense.title}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line-2/50">
                <span className="text-fg-3">Category</span>
                <span className="font-bold text-fg">{viewingExpense.category_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line-2/50">
                <span className="text-fg-3">Amount</span>
                <span className="font-bold text-red-500">{fmt(viewingExpense.amount)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line-2/50">
                <span className="text-fg-3">Payment Method</span>
                <span className="font-semibold text-fg">{viewingExpense.payment_method}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line-2/50">
                <span className="text-fg-3">Expense Date</span>
                <span className="font-semibold text-fg">{formatDateDisplay(viewingExpense.expense_date)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line-2/50">
                <span className="text-fg-3">Paid To</span>
                <span className="font-semibold text-fg">{viewingExpense.paid_to || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line-2/50">
                <span className="text-fg-3">Recurring</span>
                <span className="font-semibold text-fg">
                  {viewingExpense.is_recurring ? `Yes (${viewingExpense.recurring_frequency})` : "No"}
                </span>
              </div>
              {viewingExpense.description && (
                <div className="pt-2">
                  <span className="block text-fg-3 mb-0.5">Description</span>
                  <p className="p-2.5 rounded-xl bg-surface-2 border border-line-2 text-fg text-xs">{viewingExpense.description}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewingExpense(null)}
                className="px-4 py-2 rounded-xl bg-accent text-white font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingExpense && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-sm shadow-xl p-6 space-y-4 text-xs text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto text-xl font-bold">
              ⚠️
            </div>
            <div>
              <h3 className="text-sm font-bold text-fg">Delete Expense Record?</h3>
              <p className="text-fg-3 mt-1">
                Are you sure you want to delete <span className="font-bold text-fg">"{deletingExpense.title}"</span> ({fmt(deletingExpense.amount)})? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setDeletingExpense(null)}
                className="px-4 py-2 rounded-xl bg-surface-2 border border-line-2 text-fg font-bold hover:bg-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteExpense}
                className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 shadow-xs"
              >
                Delete Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
