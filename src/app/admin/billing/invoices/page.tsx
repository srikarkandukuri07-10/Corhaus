"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InvoiceItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  grants_member_dashboard_access: boolean;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  subtotal: number;
  discount_type: string | null;
  discount_value: number;
  discount_amount: number;
  grand_total: number;
  payment_status: "paid" | "due" | "partial";
  payment_method: string | null;
  amount_paid: number;
  transaction_reference: string | null;
  notes: string | null;
  created_at: string;
  invoice_items?: InvoiceItem[];
}

type FilterStatus = "all" | "paid" | "due" | "partial";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-brand-success/10 text-brand-success",
  due: "bg-amber-100 text-amber-700",
  partial: "bg-blue-100 text-blue-700",
};

// ─── Billing Sub-Nav ─────────────────────────────────────────────────────────

function BillingSubNav() {
  const pathname = usePathname();
  const subNav = [
    { href: "/admin/billing", label: "Create Bill", exact: true },
    { href: "/admin/billing/plan-items", label: "Plan Catalogue", exact: false },
    { href: "/admin/billing/invoices", label: "Invoices", exact: true },
  ];
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {subNav.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              active
                ? "bg-[#7B3FE4] text-white shadow-md shadow-[#7B3FE4]/20"
                : "text-[#1B0B38]/60 hover:text-[#1B0B38] hover:bg-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const supabase = createClient();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<string, InvoiceItem[]>>({});
  const [itemsLoading, setItemsLoading] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setInvoices(data as Invoice[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  async function handleExpand(invoiceId: string) {
    if (expandedId === invoiceId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(invoiceId);
    if (itemsMap[invoiceId]) return;

    setItemsLoading(invoiceId);
    const { data } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: true });

    setItemsMap((prev) => ({ ...prev, [invoiceId]: (data as InvoiceItem[]) || [] }));
    setItemsLoading(null);
  }

  // Filter + search
  const filtered = invoices.filter((inv) => {
    const statusOk =
      filterStatus === "all" || inv.payment_status === filterStatus;
    const q = search.toLowerCase().trim();
    const searchOk =
      !q ||
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.customer_name.toLowerCase().includes(q) ||
      (inv.customer_email || "").toLowerCase().includes(q) ||
      (inv.customer_phone || "").includes(q);
    return statusOk && searchOk;
  });

  const stats = {
    total: invoices.length,
    paid: invoices.filter((i) => i.payment_status === "paid").length,
    due: invoices.filter((i) => i.payment_status === "due").length,
    revenue: invoices
      .filter((i) => i.payment_status === "paid")
      .reduce((s, i) => s + i.amount_paid, 0),
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-1">
        <h1 className="text-2xl font-light text-brand-navy">
          Billing <span className="font-medium">Invoices</span>
        </h1>
        <p className="text-sm text-brand-navy/50 mt-0.5">
          View and manage all billing transactions
        </p>
      </div>

      <BillingSubNav />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Invoices", value: stats.total, color: "text-brand-navy" },
          { label: "Paid", value: stats.paid, color: "text-brand-success" },
          { label: "Payment Due", value: stats.due, color: "text-amber-600" },
          { label: "Revenue Collected", value: fmt(stats.revenue), color: "text-brand-brown" },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-2xl border border-brand-sand/50 p-4"
          >
            <p className="text-xs text-brand-navy/40 mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="bg-white rounded-2xl border border-brand-sand/50 p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-navy/30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice number, customer name, email…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown transition-all"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-brand-sand/50 overflow-hidden p-0.5 bg-brand-cream/30">
          {(["all", "paid", "due", "partial"] as FilterStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                filterStatus === s
                  ? "bg-white text-brand-navy shadow-sm"
                  : "text-brand-navy/50 hover:text-brand-navy"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice table */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
            <p className="text-sm text-brand-navy/40">Loading invoices…</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-brand-sand/50 p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-sand/30 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-brand-navy/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-brand-navy/50 font-medium">
            {search || filterStatus !== "all"
              ? "No invoices match your filters"
              : "No invoices yet"}
          </p>
          <p className="text-sm text-brand-navy/30 mt-1">
            {!search && filterStatus === "all" && (
              <>
                Create your first bill from the{" "}
                <Link href="/admin/billing" className="text-brand-brown hover:underline">
                  Create Bill
                </Link>{" "}
                screen.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-brand-sand/50 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-brand-sand/50 bg-brand-cream/30">
            {["Invoice #", "Customer", "Date", "Amount", "Status", ""].map(
              (h) => (
                <p key={h} className="text-xs font-semibold text-brand-navy/40 uppercase tracking-wide">
                  {h}
                </p>
              )
            )}
          </div>

          {/* Rows */}
          <div className="divide-y divide-brand-sand/30">
            {filtered.map((inv) => (
              <div key={inv.id}>
                {/* Main row */}
                <button
                  onClick={() => handleExpand(inv.id)}
                  className="w-full grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-5 py-4 hover:bg-brand-cream/30 transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-mono font-semibold text-brand-navy">
                      {inv.invoice_number}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-navy truncate">
                      {inv.customer_name}
                    </p>
                    {inv.customer_phone && (
                      <p className="text-xs text-brand-navy/40 truncate">
                        {inv.customer_phone}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-brand-navy/70">
                      {formatDate(inv.created_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-brand-navy">
                      {fmt(inv.grand_total)}
                    </p>
                    {inv.discount_amount > 0 && (
                      <p className="text-xs text-brand-success">
                        −{fmt(inv.discount_amount)} off
                      </p>
                    )}
                  </div>
                  <div>
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                        STATUS_COLORS[inv.payment_status]
                      }`}
                    >
                      {inv.payment_status}
                    </span>
                  </div>
                  <div>
                    <svg
                      className={`w-4 h-4 text-brand-navy/40 transition-transform ${
                        expandedId === inv.id ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded detail */}
                {expandedId === inv.id && (
                  <div className="px-5 pb-5 border-t border-brand-sand/30 bg-brand-cream/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                      {/* Invoice items */}
                      <div>
                        <p className="text-xs font-semibold text-brand-navy/40 uppercase tracking-wide mb-3">
                          Items
                        </p>
                        {itemsLoading === inv.id ? (
                          <div className="flex items-center gap-2 py-4 text-sm text-brand-navy/40">
                            <div className="w-4 h-4 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
                            Loading items…
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {(itemsMap[inv.id] || []).map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between py-2 border-b border-brand-sand/30 last:border-0"
                              >
                                <div>
                                  <p className="text-sm font-medium text-brand-navy">
                                    {item.name}
                                  </p>
                                  <p className="text-xs text-brand-navy/40">
                                    {item.category} •{" "}
                                    {fmt(item.unit_price)} × {item.quantity}
                                    {item.grants_member_dashboard_access && (
                                      <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full bg-brand-success/10 text-brand-success text-[10px] font-medium">
                                        Dashboard Access
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <p className="text-sm font-bold text-brand-navy">
                                  {fmt(item.total_price)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Invoice details */}
                      <div>
                        <p className="text-xs font-semibold text-brand-navy/40 uppercase tracking-wide mb-3">
                          Payment Details
                        </p>
                        <div className="space-y-2">
                          <DetailRow label="Invoice #" value={inv.invoice_number} mono />
                          <DetailRow label="Date & Time" value={formatDateTime(inv.created_at)} />
                          <DetailRow label="Customer" value={inv.customer_name} />
                          {inv.customer_email && (
                            <DetailRow label="Email" value={inv.customer_email} />
                          )}
                          {inv.customer_phone && (
                            <DetailRow label="Phone" value={inv.customer_phone} />
                          )}
                          <div className="border-t border-brand-sand/40 pt-2 mt-2" />
                          <DetailRow label="Subtotal" value={fmt(inv.subtotal)} />
                          {inv.discount_amount > 0 && (
                            <DetailRow
                              label={`Discount (${
                                inv.discount_type === "percentage"
                                  ? inv.discount_value + "%"
                                  : fmt(inv.discount_value)
                              })`}
                              value={"− " + fmt(inv.discount_amount)}
                              valueClass="text-brand-success"
                            />
                          )}
                          <DetailRow
                            label="Grand Total"
                            value={fmt(inv.grand_total)}
                            bold
                          />
                          <DetailRow
                            label="Payment Status"
                            value={inv.payment_status.charAt(0).toUpperCase() + inv.payment_status.slice(1)}
                            valueClass={
                              inv.payment_status === "paid"
                                ? "text-brand-success font-semibold"
                                : "text-amber-600 font-semibold"
                            }
                          />
                          {inv.payment_method && (
                            <DetailRow label="Method" value={inv.payment_method} />
                          )}
                          {inv.amount_paid > 0 && (
                            <DetailRow label="Amount Paid" value={fmt(inv.amount_paid)} />
                          )}
                          {inv.transaction_reference && (
                            <DetailRow label="Reference" value={inv.transaction_reference} mono />
                          )}
                          {inv.notes && (
                            <DetailRow label="Notes" value={inv.notes} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  bold,
  mono,
  valueClass,
}: {
  label: string;
  value: string;
  bold?: boolean;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-brand-navy/40 flex-shrink-0">{label}</span>
      <span
        className={`text-xs text-right break-all ${
          bold ? "font-bold text-brand-navy" : "text-brand-navy/80"
        } ${mono ? "font-mono" : ""} ${valueClass || ""}`}
      >
        {value}
      </span>
    </div>
  );
}
