"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// ── Types ───────────────────────────────────────────────────────────────────

interface InvoiceSettingsData {
  issue_tax_invoices: boolean;
  tax_pricing_mode: "inclusive" | "exclusive";
  gstin: string;
  legal_business_name: string;
  pan: string;
  state: string;
  invoice_prefix: string;
  next_invoice_number: number;
  default_payment_due_days: number;
  footer_note: string;
  terms_and_conditions: string;
  allow_flat_discount: boolean;
  max_staff_discount_pct: number;
  allow_otp_elevated_discount: boolean;
}

const STATE_CODES: Record<string, string> = {
  "01": "01 - Jammu and Kashmir",
  "02": "02 - Himachal Pradesh",
  "03": "03 - Punjab",
  "04": "04 - Chandigarh",
  "05": "05 - Uttarakhand",
  "06": "06 - Haryana",
  "07": "07 - Delhi",
  "08": "08 - Rajasthan",
  "09": "09 - Uttar Pradesh",
  "10": "10 - Bihar",
  "11": "11 - Sikkim",
  "12": "12 - Arunachal Pradesh",
  "13": "13 - Nagaland",
  "14": "14 - Manipur",
  "15": "15 - Mizoram",
  "16": "16 - Tripura",
  "17": "17 - Meghalaya",
  "18": "18 - Assam",
  "19": "19 - West Bengal",
  "20": "20 - Jharkhand",
  "21": "21 - Odisha",
  "22": "22 - Chhattisgarh",
  "23": "23 - Madhya Pradesh",
  "24": "24 - Gujarat",
  "27": "27 - Maharashtra",
  "29": "29 - Karnataka",
  "30": "30 - Goa",
  "32": "32 - Kerala",
  "33": "33 - Tamil Nadu",
  "36": "36 - Telangana",
  "37": "37 - Andhra Pradesh",
};

// ── Shared Settings Sidebar Component ────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  disabled?: boolean;
  active?: boolean;
  icon?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export function SettingsSidebar() {
  const pathname = usePathname();

  const navSections: NavSection[] = [
    {
      title: "BUSINESS",
      items: [
        { label: "Invoice Settings", href: "/admin/settings/invoice-settings", active: pathname.includes("invoice-settings") || pathname === "/admin/settings" },
      ],
    },
    {
      title: "OPERATIONS",
      items: [
        { label: "Cancellation Policy", href: "/admin/settings/cancellation-policy", active: pathname.includes("cancellation-policy"), icon: "⏰" },
        { label: "Freeze Policies", href: "/admin/settings/freeze-policies", active: pathname.includes("freeze-policies"), icon: "❄" },
        { label: "Class Attendance", href: "/admin/classes", icon: "📋" },
        { label: "PT Settings", href: "/admin/pt", icon: "🏋" },
      ],
    },
    {
      title: "TEAM & ACCESS",
      items: [
        { label: "Roles & Permissions", href: "/admin/settings/roles", active: pathname.includes("roles") },
      ],
    },
  ];

  return (
    <aside className="w-64 flex-shrink-0 bg-surface rounded-2xl border border-line p-4 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-fg">Settings</h2>
        <p className="text-xs text-fg-4 mt-0.5">Manage your business and account preferences</p>
      </div>

      {navSections.map((section) => (
        <div key={section.title}>
          <p className="text-[10px] font-bold text-fg-5 uppercase tracking-wider px-3 mb-2">
            {section.title}
          </p>
          <div className="space-y-1">
            {section.items.map((item) => {
              if (item.disabled) {
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-fg-5/60 cursor-not-allowed opacity-70"
                  >
                    {item.icon && <span className="text-sm">{item.icon}</span>}
                    <span>{item.label}</span>
                  </div>
                );
              }

              const isActive = item.active;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-accent text-white shadow-md shadow-accent/20"
                      : "text-fg-3 hover:text-fg hover:bg-surface-2"
                  }`}
                >
                  {item.label === "Invoice Settings" && (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  {item.icon && <span className="text-sm">{item.icon}</span>}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}

// ── Main Invoice Settings Page Component ─────────────────────────────────────

export default function InvoiceSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<InvoiceSettingsData>({
    issue_tax_invoices: true,
    tax_pricing_mode: "inclusive",
    gstin: "36AACCY1441J1ZB",
    legal_business_name: "Yuksha Health Private Limited",
    pan: "AACCY1441J",
    state: "36 - Telangana",
    invoice_prefix: "INV",
    next_invoice_number: 226,
    default_payment_due_days: 15,
    footer_note: "Thank you for being a valued member!",
    terms_and_conditions:
      "1. Membership fees are non-refundable.\n2. This invoice is valid for the period mentioned.\n3. For queries, please contact the business.",
    allow_flat_discount: true,
    max_staff_discount_pct: 20,
    allow_otp_elevated_discount: false,
  });

  // Fetch persisted settings on page mount
  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/settings/invoice");
        const data = await res.json();
        if (data && data.settings) {
          setForm(data.settings);
        }
      } catch (err) {
        console.error("Failed to load invoice settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  // Handle GSTIN change with state/PAN auto-derivation
  function handleGstinChange(val: string) {
    const clean = val.toUpperCase();
    let derivedState = form.state;
    let derivedPan = form.pan;

    if (clean.length >= 2) {
      const code = clean.substring(0, 2);
      if (STATE_CODES[code]) {
        derivedState = STATE_CODES[code];
      }
    }

    if (clean.length >= 12) {
      derivedPan = clean.substring(2, 12);
    }

    setForm((prev) => ({
      ...prev,
      gstin: clean,
      state: derivedState,
      pan: derivedPan,
    }));
  }

  // Preview formatting
  const previewInvoiceNumber = useMemo(() => {
    const year = new Date().getFullYear();
    const prefix = (form.invoice_prefix || "INV").toUpperCase().trim();
    const num = Math.max(1, form.next_invoice_number || 1);
    const padded = String(num).padStart(5, "0");
    return `${prefix}-${year}-${padded}`;
  }, [form.invoice_prefix, form.next_invoice_number]);

  // Save Settings handler
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/settings/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save settings.");
      }

      setForm(data.settings);
      setSaveSuccess("Invoice settings saved successfully!");
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || "Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in flex flex-col md:flex-row gap-6">
      {/* Settings Navigation Sidebar */}
      <SettingsSidebar />

      {/* Main Settings Panel */}
      <main className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg">Invoice Settings</h1>
            <p className="text-xs text-fg-4 mt-0.5">
              Configure GST, invoice numbering, payment terms, appearance, and discount policy
            </p>
          </div>
          <button
            type="button"
            className="px-3.5 py-1.5 rounded-xl bg-accent/10 text-accent font-semibold text-xs flex items-center gap-1.5 hover:bg-accent/20 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Help
          </button>
        </div>

        {/* Notifications */}
        {saveSuccess && (
          <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-600 font-semibold text-sm flex items-center gap-2 animate-fade-in">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {saveSuccess}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 font-semibold text-sm flex items-center gap-2 animate-fade-in">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 bg-surface rounded-2xl border border-line">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <p className="text-xs text-fg-5 font-medium">Loading invoice settings…</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* CARD 1: TAX INVOICE SETTINGS */}
            <div className="bg-surface rounded-2xl border border-line p-6 space-y-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h6m-6 4h6m-6 4h6" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-fg">Tax Invoice Settings</h3>
                  <p className="text-xs text-fg-4 mt-0.5">
                    Enable this if your business is registered under GST
                  </p>
                </div>
              </div>

              {/* Issue Tax Invoices Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-surface-2/40 border border-line">
                <div>
                  <p className="text-sm font-semibold text-fg">Issue Tax Invoices</p>
                  <p className="text-xs text-fg-4 mt-0.5">
                    Toggle this if your business has a GST registration
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.issue_tax_invoices}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, issue_tax_invoices: e.target.checked }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-brand-sand/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                </label>
              </div>

              {/* Tax Pricing Mode */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-fg">Tax Pricing Mode</p>
                  <p className="text-xs text-fg-4 mt-0.5">Choose how prices are displayed and calculated</p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {/* Inclusive Radio */}
                  <label
                    className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                      form.tax_pricing_mode === "inclusive"
                        ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                        : "border-line bg-surface-2/20 hover:bg-surface-2/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="tax_pricing_mode"
                      value="inclusive"
                      checked={form.tax_pricing_mode === "inclusive"}
                      onChange={() =>
                        setForm((prev) => ({ ...prev, tax_pricing_mode: "inclusive" }))
                      }
                      className="mt-1 text-accent focus:ring-accent"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-fg">Inclusive of GST</span>
                        <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-bold">
                          Recommended
                        </span>
                      </div>
                      <p className="text-xs text-fg-4 mt-1">
                        Prices include GST. e.g., ₹1,000 includes GST (extracted from the displayed total).
                      </p>
                    </div>
                  </label>

                  {/* Exclusive Radio */}
                  <label
                    className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                      form.tax_pricing_mode === "exclusive"
                        ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                        : "border-line bg-surface-2/20 hover:bg-surface-2/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="tax_pricing_mode"
                      value="exclusive"
                      checked={form.tax_pricing_mode === "exclusive"}
                      onChange={() =>
                        setForm((prev) => ({ ...prev, tax_pricing_mode: "exclusive" }))
                      }
                      className="mt-1 text-accent focus:ring-accent"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-bold text-fg">Exclusive of GST</span>
                      <p className="text-xs text-fg-4 mt-1">
                        GST is added on top of the displayed price at checkout.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* GSTIN, Legal Name, PAN, State Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-fg mb-1.5">
                    GSTIN <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    value={form.gstin}
                    onChange={(e) => handleGstinChange(e.target.value)}
                    placeholder="36AACCY1441J1ZB"
                    className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm font-mono text-fg focus:outline-none focus:ring-1 focus:ring-accent uppercase"
                  />
                  <p className="text-[11px] text-fg-5 mt-1">Enter your 15-digit GST Identification Number</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg mb-1.5">
                    Legal Business Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.legal_business_name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, legal_business_name: e.target.value }))
                    }
                    placeholder="Yuksha Health Private Limited"
                    className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg mb-1.5">PAN</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={form.pan}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, pan: e.target.value.toUpperCase() }))
                    }
                    placeholder="AACCY1441J"
                    className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm font-mono text-fg focus:outline-none focus:ring-1 focus:ring-accent uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg mb-1.5">State</label>
                  <input
                    type="text"
                    value={form.state}
                    readOnly
                    className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/60 text-sm text-fg-3 font-medium focus:outline-none cursor-not-allowed"
                  />
                  <p className="text-[11px] text-fg-5 mt-1">State is determined from your GSTIN</p>
                </div>
              </div>

              {/* Informational Banner */}
              <div className="p-4 rounded-xl bg-accent/5 border border-accent/15 flex items-center gap-3 text-xs text-accent font-medium">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  {form.tax_pricing_mode === "inclusive"
                    ? "Invoices will show GST breakdown extracted from the inclusive price."
                    : "Invoices will show GST added on top of the subtotal at checkout."}
                </span>
              </div>
            </div>

            {/* CARD 2: INVOICE NUMBERING */}
            <div className="bg-surface rounded-2xl border border-line p-6 space-y-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent font-mono font-bold text-lg flex-shrink-0 mt-0.5">
                  #
                </div>
                <div>
                  <h3 className="text-base font-bold text-fg">Invoice Numbering</h3>
                  <p className="text-xs text-fg-4 mt-0.5">Configure how invoice numbers are generated</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-fg mb-1.5">Invoice Prefix</label>
                  <input
                    type="text"
                    value={form.invoice_prefix}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, invoice_prefix: e.target.value.toUpperCase() }))
                    }
                    placeholder="INV"
                    className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm font-mono text-fg focus:outline-none focus:ring-1 focus:ring-accent uppercase"
                  />
                  <p className="text-[11px] text-fg-5 mt-1">This appears before the invoice number</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg mb-1.5">Next Invoice Number</label>
                  <input
                    type="number"
                    min={1}
                    value={form.next_invoice_number}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        next_invoice_number: parseInt(e.target.value, 10) || 1,
                      }))
                    }
                    placeholder="226"
                    className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm font-mono text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>

              {/* Preview Box */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-2/30 border border-line">
                <span className="px-2.5 py-1 rounded-md bg-surface border border-line text-[11px] font-bold text-fg">
                  Preview
                </span>
                <span className="text-sm font-mono font-bold text-fg tracking-wider">
                  {previewInvoiceNumber}
                </span>
              </div>
            </div>

            {/* CARD 3: PAYMENT TERMS */}
            <div className="bg-surface rounded-2xl border border-line p-6 space-y-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-fg">Payment Terms</h3>
                  <p className="text-xs text-fg-4 mt-0.5">
                    Default due date for new bills. You can still set a custom due date per bill at billing time.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-surface-2/40 border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <label className="block text-sm font-bold text-fg">Default Payment Due Days</label>
                  <p className="text-xs text-fg-4 mt-0.5">
                    Bills are due this many days after creation (e.g. 15 = bill on Jan 1 → due Jan 16)
                  </p>
                </div>
                <select
                  value={form.default_payment_due_days}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      default_payment_due_days: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  className="px-4 py-2.5 rounded-xl border border-line bg-surface text-sm font-semibold text-fg focus:outline-none focus:ring-1 focus:ring-accent min-w-[140px]"
                >
                  <option value={0}>0 days (Due on Receipt)</option>
                  <option value={7}>7 days</option>
                  <option value={15}>15 days</option>
                  <option value={30}>30 days</option>
                  <option value={45}>45 days</option>
                  <option value={60}>60 days</option>
                </select>
              </div>
            </div>

            {/* CARD 4: INVOICE APPEARANCE */}
            <div className="bg-surface rounded-2xl border border-line p-6 space-y-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-fg">Invoice Appearance</h3>
                  <p className="text-xs text-fg-4 mt-0.5">Customize how your invoices look</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-fg mb-1.5">
                    Footer Note / Thank You Message
                  </label>
                  <input
                    type="text"
                    value={form.footer_note}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, footer_note: e.target.value }))
                    }
                    placeholder='e.g., "Thank you for being a valued member!"'
                    className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <p className="text-[11px] text-fg-5 mt-1">Appears at the bottom of printed and downloaded invoices</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-fg mb-1.5">Terms &amp; Conditions</label>
                  <textarea
                    rows={4}
                    value={form.terms_and_conditions}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, terms_and_conditions: e.target.value }))
                    }
                    placeholder="Enter invoice terms & conditions..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent font-sans"
                  />
                </div>
              </div>
            </div>

            {/* CARD 5: BILLING DISCOUNT POLICY */}
            <div className="bg-surface rounded-2xl border border-line p-6 space-y-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent font-bold text-base flex-shrink-0 mt-0.5">
                  %
                </div>
                <div>
                  <h3 className="text-base font-bold text-fg">Billing Discount Policy</h3>
                  <p className="text-xs text-fg-4 mt-0.5">
                    Control whether staff can apply manual discounts at billing
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Allow Flat Discount Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-surface-2/40 border border-line">
                  <div>
                    <p className="text-sm font-semibold text-fg">Allow Flat Discount During Billing</p>
                    <p className="text-xs text-fg-4 mt-0.5">
                      When enabled, staff can apply a % or ₹ discount manually during checkout without needing a coupon code.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.allow_flat_discount}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, allow_flat_discount: e.target.checked }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-brand-sand/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                  </label>
                </div>

                {/* Maximum Discount % for Staff */}
                <div className="p-4 rounded-xl bg-surface-2/40 border border-line space-y-2">
                  <label className="block text-xs font-bold text-fg">Maximum Discount % for Staff</label>
                  <div className="flex items-center gap-2 max-w-xs">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.max_staff_discount_pct}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          max_staff_discount_pct: Math.min(
                            100,
                            Math.max(0, parseFloat(e.target.value) || 0)
                          ),
                        }))
                      }
                      className="w-24 px-3 py-2 rounded-xl border border-line bg-surface text-sm font-bold text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <span className="text-sm font-bold text-fg-4">%</span>
                  </div>
                  <p className="text-[11px] text-fg-5">
                    Staff will not be able to apply more than this percentage. Owners are not subject to this limit.
                  </p>
                </div>
              </div>
            </div>

            {/* SAVE BUTTON */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-bold shadow-lg shadow-accent/20 hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving Settings…</span>
                  </>
                ) : (
                  <span>Save Invoice Settings</span>
                )}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
