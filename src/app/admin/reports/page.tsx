"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ─── Export Utilities ────────────────────────────────────────────────────────
function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((header) => {
          const val = row[header] === null || row[header] === undefined ? "" : String(row[header]);
          const escaped = val.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(",")
    ),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportToExcel(data: any[], filename: string) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const tsvRows = [
    headers.join("\t"),
    ...data.map((row) =>
      headers
        .map((header) => {
          const val = row[header] === null || row[header] === undefined ? "" : String(row[header]);
          return val.replace(/\t/g, " ");
        })
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

function fmt(n: number) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

function formatDate(dStr: string | null | undefined) {
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

type TabType =
  | "overview"
  | "payments"
  | "memberships"
  | "classes"
  | "trainers"
  | "products"
  | "pnl"
  | "invoices"
  | "freeze"
  | "referrals"
  | "discounts"
  | "trials"
  | "support";

export default function ReportsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Global Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRangePreset, setDateRangePreset] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [secondaryFilter, setSecondaryFilter] = useState("All");

  // Aggregated Report Data state from server API
  const [reportData, setReportData] = useState<any>(null);

  const fetchReportData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/admin/reports?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to fetch report analytics");
      }
      const data = await res.json();
      setReportData(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Handle Preset Date Range selection
  const handleDatePresetChange = (preset: string) => {
    setDateRangePreset(preset);
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

  const overview = reportData?.overview || {};
  const payments = reportData?.payments || [];
  const memberships = reportData?.memberships || [];
  const classes = reportData?.classes || [];
  const trainers = reportData?.trainers || [];
  const products = reportData?.products || [];
  const pnl = reportData?.pnl || {};
  const invoices = reportData?.invoices || [];
  const freezes = reportData?.freezes || { activeFreezes: [], requests: [] };
  const referrals = reportData?.referrals || { codes: [], requests: [] };
  const discounts = reportData?.discounts || [];
  const trials = reportData?.trials || [];
  const support = reportData?.support || [];

  // Tab definitions
  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "payments", label: "Payments", icon: "💳" },
    { id: "memberships", label: "Memberships", icon: "👥" },
    { id: "classes", label: "Classes & Attendance", icon: "🧘" },
    { id: "trainers", label: "Trainers & PT", icon: "🏋️" },
    { id: "products", label: "Products & Stock", icon: "🛍️" },
    { id: "pnl", label: "Profit & Loss", icon: "📈" },
    { id: "invoices", label: "Invoices", icon: "🧾" },
    { id: "freeze", label: "Freeze Management", icon: "❄️" },
    { id: "referrals", label: "Referrals", icon: "🎁" },
    { id: "discounts", label: "Discounts", icon: "🏷️" },
    { id: "trials", label: "Trial Members", icon: "⭐" },
    { id: "support", label: "Support Tickets", icon: "💬" },
  ];

  // Common Search Filter Helper
  const filterBySearch = (items: any[], fields: string[]) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) =>
      fields.some((field) => (item[field] ? String(item[field]).toLowerCase().includes(q) : false))
    );
  };

  return (
    <div className="space-y-6">
      {/* Module Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-2 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-fg-3 mb-1">
            <span>Analytics Hub</span>
            <span>/</span>
            <span className="text-fg font-bold">Reports &amp; Intelligence</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-fg">Central Reports Dashboard</h1>
          <p className="text-xs text-fg-3 mt-1">
            Real-time business performance analytics, financial metrics, and operational reports.
          </p>
        </div>

        {/* Global Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              let exportDataset = [];
              if (activeTab === "payments") exportDataset = payments;
              else if (activeTab === "memberships") exportDataset = memberships;
              else if (activeTab === "classes") exportDataset = classes;
              else if (activeTab === "trainers") exportDataset = trainers;
              else if (activeTab === "products") exportDataset = products;
              else if (activeTab === "invoices") exportDataset = invoices;
              else if (activeTab === "trials") exportDataset = trials;
              else if (activeTab === "support") exportDataset = support;
              else exportDataset = payments;

              exportToCSV(exportDataset, `corhaus_${activeTab}_report`);
            }}
            className="px-3 py-2 rounded-xl bg-surface-2 border border-line-2 text-fg text-xs font-bold hover:bg-hover transition-colors shadow-xs flex items-center gap-1.5"
          >
            <span>📥</span> Export CSV
          </button>

          <button
            onClick={() => {
              let exportDataset = [];
              if (activeTab === "payments") exportDataset = payments;
              else if (activeTab === "memberships") exportDataset = memberships;
              else if (activeTab === "classes") exportDataset = classes;
              else if (activeTab === "trainers") exportDataset = trainers;
              else if (activeTab === "products") exportDataset = products;
              else if (activeTab === "invoices") exportDataset = invoices;
              else if (activeTab === "trials") exportDataset = trials;
              else if (activeTab === "support") exportDataset = support;
              else exportDataset = payments;

              exportToExcel(exportDataset, `corhaus_${activeTab}_report`);
            }}
            className="px-3 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-2 transition-colors shadow-xs flex items-center gap-1.5"
          >
            <span>📊</span> Export Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Global Filter Bar */}
      <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Universal Search Bar */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search reports, members, invoices, trainers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg placeholder:text-fg-4 focus:ring-1 focus:ring-accent outline-none"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
          </div>

          {/* Date Range Controls */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-bold text-fg-3 uppercase text-[10px] tracking-wider">Date Range:</span>
            {["all", "today", "week", "month", "30days"].map((p) => (
              <button
                key={p}
                onClick={() => handleDatePresetChange(p)}
                className={`px-3 py-1.5 rounded-lg font-bold capitalize transition-all ${
                  dateRangePreset === p
                    ? "bg-accent text-white shadow-xs"
                    : "bg-surface-2 text-fg-3 hover:text-fg hover:bg-hover"
                }`}
              >
                {p === "all" ? "All Time" : p === "30days" ? "30 Days" : p}
              </button>
            ))}

            <div className="flex items-center gap-1.5 border-l border-line-2 pl-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDateRangePreset("custom");
                }}
                className="px-2 py-1.5 rounded-lg border border-line-2 bg-surface-2 text-fg text-xs outline-none"
              />
              <span className="text-fg-3">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDateRangePreset("custom");
                }}
                className="px-2 py-1.5 rounded-lg border border-line-2 bg-surface-2 text-fg text-xs outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 13 Secondary Navigation Section Tabs */}
      <div className="border-b border-line-2 overflow-x-auto">
        <nav className="flex items-center gap-1 min-w-max pb-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveTab(t.id);
                setSecondaryFilter("All");
              }}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                activeTab === t.id
                  ? "bg-accent text-white border-accent shadow-sm"
                  : "bg-surface/50 text-fg-3 border-transparent hover:bg-hover hover:text-fg"
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Loading Spinner */}
      {loading ? (
        <div className="p-16 flex flex-col items-center justify-center text-fg-3">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-3" />
          <p className="text-xs font-semibold">Generating report intelligence...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: OVERVIEW EXECUTIVE DASHBOARD */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Executive Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">Today's Revenue</p>
                  <p className="text-xl font-bold text-emerald-500 mt-1">{fmt(overview.todayRevenue)}</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">This Month Revenue</p>
                  <p className="text-xl font-bold text-fg mt-1">{fmt(overview.monthRevenue)}</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">Total Revenue</p>
                  <p className="text-xl font-bold text-gold-fg mt-1">{fmt(overview.totalRevenue)}</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">Active Members</p>
                  <p className="text-xl font-bold text-indigo-400 mt-1">{overview.activeMembersCount || 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">New Members (30d)</p>
                  <p className="text-xl font-bold text-purple-400 mt-1">{overview.newMembersCount || 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">Trial Members</p>
                  <p className="text-xl font-bold text-amber-500 mt-1">{overview.trialMembersCount || 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">Expiring Memberships</p>
                  <p className="text-xl font-bold text-orange-500 mt-1">{overview.expiringMembershipsCount || 0}</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">Pending Payments</p>
                  <p className="text-xl font-bold text-red-500 mt-1">{fmt(overview.pendingPaymentsTotal)}</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">Product Sales</p>
                  <p className="text-xl font-bold text-teal-400 mt-1">{fmt(overview.productSalesTotal)}</p>
                </div>
              </div>

              {/* Interactive Visual Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue Trend Chart */}
                <div className="p-5 rounded-2xl bg-surface border border-line-2 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-fg">Revenue Trend (Last 6 Months)</h3>
                    <span className="text-[11px] font-bold text-emerald-500">Live Supabase</span>
                  </div>
                  <div className="h-48 flex items-end justify-between gap-3 pt-6 px-2 border-b border-line-2">
                    {(overview.revenueTrend || []).map((item: any) => {
                      const maxRev = Math.max(...(overview.revenueTrend || []).map((r: any) => r.revenue), 1000);
                      const heightPct = Math.max(8, Math.round((item.revenue / maxRev) * 100));
                      return (
                        <div key={item.month} className="flex-1 flex flex-col items-center gap-1 group">
                          <div className="text-[10px] font-bold text-fg-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            {fmt(item.revenue)}
                          </div>
                          <div
                            style={{ height: `${heightPct}%` }}
                            className="w-full bg-gradient-to-t from-accent/80 to-accent rounded-t-lg transition-all group-hover:brightness-125"
                          />
                          <span className="text-[10px] font-bold text-fg-3 mt-2">{item.month}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Member Growth Chart */}
                <div className="p-5 rounded-2xl bg-surface border border-line-2 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-fg">Member Growth (Last 6 Months)</h3>
                    <span className="text-[11px] font-bold text-indigo-400">Live Supabase</span>
                  </div>
                  <div className="h-48 flex items-end justify-between gap-3 pt-6 px-2 border-b border-line-2">
                    {(overview.memberGrowth || []).map((item: any) => {
                      const maxM = Math.max(...(overview.memberGrowth || []).map((r: any) => r.members), 5);
                      const heightPct = Math.max(10, Math.round((item.members / maxM) * 100));
                      return (
                        <div key={item.month} className="flex-1 flex flex-col items-center gap-1 group">
                          <div className="text-[10px] font-bold text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            +{item.members}
                          </div>
                          <div
                            style={{ height: `${heightPct}%` }}
                            className="w-full bg-gradient-to-t from-indigo-500/80 to-indigo-400 rounded-t-lg transition-all group-hover:brightness-125"
                          />
                          <span className="text-[10px] font-bold text-fg-3 mt-2">{item.month}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PAYMENTS REPORT */}
          {activeTab === "payments" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase text-fg-3">Payment Status:</span>
                  {["All", "paid", "due", "partial"].map((st) => (
                    <button
                      key={st}
                      onClick={() => setSecondaryFilter(st)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold capitalize ${
                        secondaryFilter === st
                          ? "bg-accent text-white"
                          : "bg-surface-2 text-fg-3 hover:text-fg"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <Link
                  href="/admin/billing"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow-xs inline-flex items-center gap-1.5"
                >
                  <span>➕</span> Record Pending Payment
                </Link>
              </div>

              <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
                <div className="w-full overflow-x-hidden">
                  <table className="w-full text-[11px] text-left">
                    <thead>
                      <tr className="bg-surface-2 border-b border-line-2 text-fg-3 uppercase font-bold text-[10px]">
                        <th className="py-3 px-3">Invoice #</th>
                        <th className="py-3 px-3">Customer</th>
                        <th className="py-3 px-3">Grand Total</th>
                        <th className="py-3 px-3">Amount Paid</th>
                        <th className="py-3 px-3">Outstanding</th>
                        <th className="py-3 px-3">Method</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-2 text-fg">
                      {filterBySearch(payments, ["invoice_number", "customer_name", "customer_email", "payment_method"])
                        .filter((p: any) => secondaryFilter === "All" || p.payment_status.toLowerCase() === secondaryFilter.toLowerCase())
                        .map((p: any) => (
                          <tr key={p.id} className="hover:bg-hover/50 transition-colors">
                            <td className="py-3 px-3 font-bold text-fg">{p.invoice_number}</td>
                            <td className="py-3 px-3 font-medium">
                              <div>{p.customer_name}</div>
                              <div className="text-[10px] text-fg-4">{p.customer_phone}</div>
                            </td>
                            <td className="py-3 px-3 font-bold text-fg">{fmt(p.grand_total)}</td>
                            <td className="py-3 px-3 text-emerald-500 font-semibold">{fmt(p.amount_paid)}</td>
                            <td className="py-3 px-3 text-red-500 font-semibold">{fmt(p.outstanding)}</td>
                            <td className="py-3 px-3 text-fg-2">{p.payment_method}</td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                  p.payment_status === "paid" || p.payment_status === "Paid"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                }`}
                              >
                                {p.payment_status}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-fg-3">{formatDate(p.created_at)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MEMBERSHIPS REPORT */}
          {activeTab === "memberships" && (
            <div className="space-y-4">
              <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
                <div className="w-full overflow-x-hidden">
                  <table className="w-full text-[11px] text-left">
                    <thead>
                      <tr className="bg-surface-2 border-b border-line-2 text-fg-3 uppercase font-bold text-[10px]">
                        <th className="py-3 px-3">Plan Name</th>
                        <th className="py-3 px-3">Category</th>
                        <th className="py-3 px-3">Sessions Remaining</th>
                        <th className="py-3 px-3">Valid From</th>
                        <th className="py-3 px-3">Valid Until</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-2 text-fg">
                      {filterBySearch(memberships, ["plan_name", "category", "status"]).map((m: any) => (
                        <tr key={m.id} className="hover:bg-hover/50 transition-colors">
                          <td className="py-3 px-3 font-bold text-fg">{m.plan_name}</td>
                          <td className="py-3 px-3 text-fg-2">{m.category}</td>
                          <td className="py-3 px-3 font-semibold">
                            {m.sessions_total ? `${m.sessions_remaining ?? 0} / ${m.sessions_total}` : "Unlimited"}
                          </td>
                          <td className="py-3 px-3 text-fg-3">{formatDate(m.valid_from)}</td>
                          <td className="py-3 px-3 text-fg-3">{formatDate(m.valid_until)}</td>
                          <td className="py-3 px-3">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 capitalize">
                              {m.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => alert(`Reminder notification sent for plan ${m.plan_name}`)}
                              className="px-2.5 py-1 rounded-xl bg-accent text-white font-bold text-[10px]"
                            >
                              Send Reminder
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CLASSES & ATTENDANCE REPORT */}
          {activeTab === "classes" && (
            <div className="space-y-4">
              <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
                <div className="w-full overflow-x-hidden">
                  <table className="w-full text-[11px] text-left">
                    <thead>
                      <tr className="bg-surface-2 border-b border-line-2 text-fg-3 uppercase font-bold text-[10px]">
                        <th className="py-3 px-3">Class Title</th>
                        <th className="py-3 px-3">Instructor</th>
                        <th className="py-3 px-3">Date &amp; Time</th>
                        <th className="py-3 px-3">Bookings</th>
                        <th className="py-3 px-3">Attended</th>
                        <th className="py-3 px-3">No Shows</th>
                        <th className="py-3 px-3">Occupancy %</th>
                        <th className="py-3 px-3">Attendance %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-2 text-fg">
                      {filterBySearch(classes, ["title", "instructor", "category"]).map((c: any) => (
                        <tr key={c.id} className="hover:bg-hover/50 transition-colors">
                          <td className="py-3 px-3 font-bold text-fg">{c.title}</td>
                          <td className="py-3 px-3 text-fg-2">{c.instructor}</td>
                          <td className="py-3 px-3 text-fg-3">{formatDate(c.class_date)} {c.class_time}</td>
                          <td className="py-3 px-3 font-semibold">{c.total_bookings} / {c.max_capacity}</td>
                          <td className="py-3 px-3 text-emerald-500 font-bold">{c.attended}</td>
                          <td className="py-3 px-3 text-red-500 font-bold">{c.no_shows}</td>
                          <td className="py-3 px-3 font-bold text-indigo-400">{c.occupancy_pct}%</td>
                          <td className="py-3 px-3 font-bold text-gold-fg">{c.attendance_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: TRAINERS & PT REPORT */}
          {activeTab === "trainers" && (
            <div className="space-y-4">
              <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
                <div className="w-full overflow-x-hidden">
                  <table className="w-full text-[11px] text-left">
                    <thead>
                      <tr className="bg-surface-2 border-b border-line-2 text-fg-3 uppercase font-bold text-[10px]">
                        <th className="py-3 px-3">Trainer Name</th>
                        <th className="py-3 px-3">Role</th>
                        <th className="py-3 px-3">Classes Conducted</th>
                        <th className="py-3 px-3">PT Sessions</th>
                        <th className="py-3 px-3">Group Commission</th>
                        <th className="py-3 px-3">PT Commission</th>
                        <th className="py-3 px-3">Monthly Salary</th>
                        <th className="py-3 px-3">Total Payout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-2 text-fg">
                      {filterBySearch(trainers, ["full_name", "role"]).map((tr: any) => (
                        <tr key={tr.id} className="hover:bg-hover/50 transition-colors">
                          <td className="py-3 px-3 font-bold text-fg">{tr.full_name}</td>
                          <td className="py-3 px-3 text-fg-2">{tr.role}</td>
                          <td className="py-3 px-3 font-semibold">{tr.classes_conducted}</td>
                          <td className="py-3 px-3 font-semibold">{tr.pt_sessions_conducted}</td>
                          <td className="py-3 px-3 text-emerald-500">{fmt(tr.group_commission)}</td>
                          <td className="py-3 px-3 text-emerald-500">{fmt(tr.pt_commission)}</td>
                          <td className="py-3 px-3 font-semibold">{fmt(tr.monthly_salary)}</td>
                          <td className="py-3 px-3 font-bold text-gold-fg">{fmt(tr.total_payout)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: PRODUCTS & INVENTORY REPORT */}
          {activeTab === "products" && (
            <div className="space-y-4">
              <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
                <div className="w-full overflow-x-hidden">
                  <table className="w-full text-[11px] text-left">
                    <thead>
                      <tr className="bg-surface-2 border-b border-line-2 text-fg-3 uppercase font-bold text-[10px]">
                        <th className="py-3 px-3">Product Name</th>
                        <th className="py-3 px-3">Category</th>
                        <th className="py-3 px-3">Unit Price</th>
                        <th className="py-3 px-3">Stock Quantity</th>
                        <th className="py-3 px-3">Inventory Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-2 text-fg">
                      {filterBySearch(products, ["name", "category"]).map((pr: any) => (
                        <tr key={pr.id} className="hover:bg-hover/50 transition-colors">
                          <td className="py-3 px-3 font-bold text-fg">{pr.name}</td>
                          <td className="py-3 px-3 text-fg-2">{pr.category}</td>
                          <td className="py-3 px-3 font-bold text-emerald-500">{fmt(pr.price)}</td>
                          <td className="py-3 px-3 font-semibold">{pr.stock_quantity} units</td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                pr.stock_status === "In Stock"
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                  : pr.stock_status === "Low Stock"
                                  ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                  : "bg-red-500/10 text-red-500 border-red-500/20"
                              }`}
                            >
                              {pr.stock_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: PROFIT & LOSS REPORT */}
          {activeTab === "pnl" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-surface border border-line-2 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Total Revenue</p>
                  <p className="text-2xl font-bold text-emerald-500 mt-1">{fmt(pnl.totalRevenue)}</p>
                </div>
                <div className="p-5 rounded-2xl bg-surface border border-line-2 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-500">Total Expenses</p>
                  <p className="text-2xl font-bold text-red-500 mt-1">{fmt(pnl.totalExpenses)}</p>
                </div>
                <div className="p-5 rounded-2xl bg-surface border border-line-2 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gold-fg">Net Profit</p>
                  <p className="text-2xl font-bold text-gold-fg mt-1">{fmt(pnl.netProfit)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue Breakdown */}
                <div className="p-5 rounded-2xl bg-surface border border-line-2 shadow-xs space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-fg">Revenue Breakdown</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-2 border-b border-line-2">
                      <span className="text-fg-3">Membership Revenue</span>
                      <span className="font-bold text-fg">{fmt(pnl.membershipRevenue)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-line-2">
                      <span className="text-fg-3">Personal Training (PT) Revenue</span>
                      <span className="font-bold text-fg">{fmt(pnl.ptRevenue)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-line-2">
                      <span className="text-fg-3">Group Classes Revenue</span>
                      <span className="font-bold text-fg">{fmt(pnl.groupRevenue)}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-fg-3">Product Sales Revenue</span>
                      <span className="font-bold text-fg">{fmt(pnl.productRevenue)}</span>
                    </div>
                  </div>
                </div>

                {/* Expense Breakdown */}
                <div className="p-5 rounded-2xl bg-surface border border-line-2 shadow-xs space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-fg">Expense Breakdown</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-2 border-b border-line-2">
                      <span className="text-fg-3">Staff Monthly Salaries</span>
                      <span className="font-bold text-red-400">{fmt(pnl.salaries)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-line-2">
                      <span className="text-fg-3">Trainer Commissions Paid</span>
                      <span className="font-bold text-red-400">{fmt(pnl.commissions)}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-fg-3">Operational Expenses (Studio Utilities)</span>
                      <span className="font-bold text-red-400">{fmt(pnl.operationalExpenses)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: INVOICE REPORT */}
          {activeTab === "invoices" && (
            <div className="space-y-4">
              <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
                <div className="w-full overflow-x-hidden">
                  <table className="w-full text-[11px] text-left">
                    <thead>
                      <tr className="bg-surface-2 border-b border-line-2 text-fg-3 uppercase font-bold text-[10px]">
                        <th className="py-3 px-3">Invoice Number</th>
                        <th className="py-3 px-3">Customer</th>
                        <th className="py-3 px-3">Grand Total</th>
                        <th className="py-3 px-3">Amount Paid</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-2 text-fg">
                      {filterBySearch(invoices, ["invoice_number", "customer_name", "customer_email"]).map((inv: any) => (
                        <tr key={inv.id} className="hover:bg-hover/50 transition-colors">
                          <td className="py-3 px-3 font-bold text-fg">{inv.invoice_number}</td>
                          <td className="py-3 px-3 font-medium">{inv.customer_name}</td>
                          <td className="py-3 px-3 font-bold text-fg">{fmt(inv.grand_total)}</td>
                          <td className="py-3 px-3 font-semibold text-emerald-500">{fmt(inv.amount_paid)}</td>
                          <td className="py-3 px-3">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 capitalize">
                              {inv.payment_status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-fg-3">{formatDate(inv.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: FREEZE REPORT */}
          {activeTab === "freeze" && (
            <div className="space-y-4">
              <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
                <div className="w-full overflow-x-hidden">
                  <table className="w-full text-[11px] text-left">
                    <thead>
                      <tr className="bg-surface-2 border-b border-line-2 text-fg-3 uppercase font-bold text-[10px]">
                        <th className="py-3 px-3">Member ID / Email</th>
                        <th className="py-3 px-3">Reason</th>
                        <th className="py-3 px-3">Start Date</th>
                        <th className="py-3 px-3">End Date</th>
                        <th className="py-3 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-2 text-fg">
                      {(freezes.activeFreezes || []).map((fz: any) => (
                        <tr key={fz.id} className="hover:bg-hover/50 transition-colors">
                          <td className="py-3 px-3 font-bold text-fg">{fz.member_id || fz.email || "Member"}</td>
                          <td className="py-3 px-3 text-fg-2">{fz.reason || "Freeze Request"}</td>
                          <td className="py-3 px-3 text-fg-3">{formatDate(fz.start_date)}</td>
                          <td className="py-3 px-3 text-fg-3">{formatDate(fz.end_date)}</td>
                          <td className="py-3 px-3">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                              Active Freeze
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: REFERRALS REPORT */}
          {activeTab === "referrals" && (
            <div className="space-y-4">
              <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
                <div className="w-full overflow-x-hidden">
                  <table className="w-full text-[11px] text-left">
                    <thead>
                      <tr className="bg-surface-2 border-b border-line-2 text-fg-3 uppercase font-bold text-[10px]">
                        <th className="py-3 px-3">Member Email</th>
                        <th className="py-3 px-3">Referral Code</th>
                        <th className="py-3 px-3">Successful Referrals</th>
                        <th className="py-3 px-3">Reward Eligible</th>
                        <th className="py-3 px-3">Reward Redeemed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-2 text-fg">
                      {(referrals.codes || []).map((rf: any) => (
                        <tr key={rf.id} className="hover:bg-hover/50 transition-colors">
                          <td className="py-3 px-3 font-bold text-fg">{rf.member_email}</td>
                          <td className="py-3 px-3 font-mono text-gold-fg">{rf.code}</td>
                          <td className="py-3 px-3 font-bold">{rf.successful_referrals || 0}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${rf.reward_eligible ? "text-emerald-500 bg-emerald-500/10" : "text-fg-4"}`}>
                              {rf.reward_eligible ? "Eligible" : "Pending"}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${rf.reward_redeemed ? "text-purple-400 bg-purple-500/10" : "text-fg-4"}`}>
                              {rf.reward_redeemed ? "Redeemed" : "No"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 11: DISCOUNTS REPORT */}
          {activeTab === "discounts" && (
            <div className="space-y-4">
              <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
                <div className="w-full overflow-x-hidden">
                  <table className="w-full text-[11px] text-left">
                    <thead>
                      <tr className="bg-surface-2 border-b border-line-2 text-fg-3 uppercase font-bold text-[10px]">
                        <th className="py-3 px-3">Member Email</th>
                        <th className="py-3 px-3">Discount %</th>
                        <th className="py-3 px-3">Discount Amount</th>
                        <th className="py-3 px-3">Reason</th>
                        <th className="py-3 px-3">Valid Until</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-2 text-fg">
                      {discounts.map((dc: any) => (
                        <tr key={dc.id} className="hover:bg-hover/50 transition-colors">
                          <td className="py-3 px-3 font-bold text-fg">{dc.member_email}</td>
                          <td className="py-3 px-3 font-bold text-emerald-500">{dc.discount_percent}%</td>
                          <td className="py-3 px-3 font-bold text-gold-fg">{fmt(dc.discount_amount)}</td>
                          <td className="py-3 px-3 text-fg-2">{dc.reason || "Special Offer"}</td>
                          <td className="py-3 px-3 text-fg-3">{formatDate(dc.valid_until)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 12: TRIAL MEMBERS REPORT */}
          {activeTab === "trials" && (
            <div className="space-y-4">
              <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
                <div className="w-full overflow-x-hidden">
                  <table className="w-full text-[11px] text-left">
                    <thead>
                      <tr className="bg-surface-2 border-b border-line-2 text-fg-3 uppercase font-bold text-[10px]">
                        <th className="py-3 px-3">Full Name</th>
                        <th className="py-3 px-3">Phone</th>
                        <th className="py-3 px-3">Trial Date</th>
                        <th className="py-3 px-3">Assigned Class</th>
                        <th className="py-3 px-3">Instructor</th>
                        <th className="py-3 px-3">Trial Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-2 text-fg">
                      {filterBySearch(trials, ["full_name", "phone_number", "class_name", "instructor_name"]).map((tr: any) => (
                        <tr key={tr.id} className="hover:bg-hover/50 transition-colors">
                          <td className="py-3 px-3 font-bold text-fg">{tr.full_name}</td>
                          <td className="py-3 px-3 text-fg-2">{tr.phone_number}</td>
                          <td className="py-3 px-3 text-fg-3">{formatDate(tr.trial_date)} {tr.trial_time}</td>
                          <td className="py-3 px-3 font-semibold">{tr.class_name}</td>
                          <td className="py-3 px-3 text-fg-2">{tr.instructor_name}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                tr.status === "Scheduled"
                                  ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                  : tr.status === "Attended"
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                  : tr.status === "No Show"
                                  ? "bg-red-500/10 text-red-500 border-red-500/20"
                                  : "bg-purple-500/10 text-purple-500 border-purple-500/20"
                              }`}
                            >
                              {tr.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 13: SUPPORT TICKETS REPORT */}
          {activeTab === "support" && (
            <div className="space-y-4">
              <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
                <div className="w-full overflow-x-hidden">
                  <table className="w-full text-[11px] text-left">
                    <thead>
                      <tr className="bg-surface-2 border-b border-line-2 text-fg-3 uppercase font-bold text-[10px]">
                        <th className="py-3 px-3">Ticket #</th>
                        <th className="py-3 px-3">Subject</th>
                        <th className="py-3 px-3">User</th>
                        <th className="py-3 px-3">Category</th>
                        <th className="py-3 px-3">Priority</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Created Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-2 text-fg">
                      {filterBySearch(support, ["ticket_number", "subject", "user_name", "category"]).map((tk: any) => (
                        <tr key={tk.id} className="hover:bg-hover/50 transition-colors">
                          <td className="py-3 px-3 font-bold text-fg">{tk.ticket_number}</td>
                          <td className="py-3 px-3 font-semibold">{tk.subject}</td>
                          <td className="py-3 px-3 text-fg-2">{tk.user_name}</td>
                          <td className="py-3 px-3 text-fg-3">{tk.category}</td>
                          <td className="py-3 px-3 font-bold text-amber-500">{tk.priority}</td>
                          <td className="py-3 px-3">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 capitalize">
                              {tk.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-fg-3">{formatDate(tk.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
