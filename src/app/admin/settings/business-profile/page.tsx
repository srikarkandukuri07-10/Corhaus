"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { SettingsSidebar } from "../invoice-settings/page";
import type { BusinessProfileData } from "@/app/api/admin/settings/business-profile/route";

// ── Indian states list ────────────────────────────────────────────────────────

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman & Nicobar Islands", "Chandigarh", "Dadra & Nagar Haveli and Daman & Diu",
  "Delhi", "Jammu & Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

// ── Small reusable field components ──────────────────────────────────────────

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-bold text-fg mb-1.5">
      {children}
      {required && <span className="text-rose-500 ml-0.5">*</span>}
    </label>
  );
}

function InputField({
  label,
  required,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  required?: boolean;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        {...props}
        className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm text-fg placeholder:text-fg-5/60 focus:outline-none focus:ring-1 focus:ring-accent transition-shadow disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function TextareaField({
  label,
  required,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  required?: boolean;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <textarea
        {...props}
        className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm text-fg placeholder:text-fg-5/60 focus:outline-none focus:ring-1 focus:ring-accent transition-shadow resize-none"
      />
    </div>
  );
}

function SelectField({
  label,
  required,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  required?: boolean;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <select
        {...props}
        className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent transition-shadow appearance-none"
      >
        {children}
      </select>
    </div>
  );
}

// ── Card header shared pattern ────────────────────────────────────────────────

function CardHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-bold text-fg truncate">{title}</h3>
        <p className="text-xs text-fg-4 mt-0.5 break-words">{subtitle}</p>
      </div>
    </div>
  );
}

// ── Toast / alert banners ─────────────────────────────────────────────────────

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-600 font-semibold text-sm flex items-center gap-2 animate-fade-in">
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      {message}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 font-semibold text-sm flex items-center gap-2 animate-fade-in">
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
      {message}
    </div>
  );
}

// ── Default form state ────────────────────────────────────────────────────────

const EMPTY_FORM: BusinessProfileData = {
  logo_url: "",
  business_name: "",
  member_portal_url: "",
  email: "",
  phone: "",
  website: "",
  address_line_1: "",
  address_line_2: "",
  country: "India",
  city: "",
  state: "",
  pin_code: "",
  legal_trade_name: "",
  attention_to: "",
  billing_address: "",
  billing_city: "",
  billing_state: "",
  billing_pin_code: "",
  billing_email: "",
  billing_phone: "",
  gstin: "",
  pan: "",
  gst_number: "",
  business_registration_number: "",
  instagram_url: "",
  facebook_url: "",
  youtube_url: "",
};

// ── Main Page Component ───────────────────────────────────────────────────────

export default function BusinessProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBilling, setSavingBilling] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [billingSuccess, setBillingSuccess] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const [form, setForm] = useState<BusinessProfileData>(EMPTY_FORM);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load on mount ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/settings/business-profile");
        const data = await res.json();
        if (data?.profile) {
          setForm({ ...EMPTY_FORM, ...data.profile });
        }
      } catch (err) {
        console.error("Failed to load business profile:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Helper: patch form fields ──────────────────────────────────────────────

  function patch(field: keyof BusinessProfileData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // ── Logo upload ────────────────────────────────────────────────────────────

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoError(null);
    setUploadingLogo(true);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/admin/settings/business-profile/logo", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setLogoError(data.error || "Failed to upload logo.");
        return;
      }

      setForm((prev) => ({ ...prev, logo_url: data.logo_url }));
    } catch (err: any) {
      setLogoError(err.message || "Failed to upload logo.");
    } finally {
      setUploadingLogo(false);
      // Reset the file input so the same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── Save general profile ───────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/settings/business-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          _section: "general",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save.");
      }

      setForm((prev) => ({ ...prev, ...data.profile }));
      setSuccessMsg("Business profile saved successfully!");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save business profile.");
    } finally {
      setSaving(false);
    }
  }

  // ── Save billing profile ───────────────────────────────────────────────────

  async function handleSaveBilling() {
    setSavingBilling(true);
    setBillingSuccess(null);
    setBillingError(null);

    try {
      const res = await fetch("/api/admin/settings/business-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legal_trade_name: form.legal_trade_name,
          attention_to: form.attention_to,
          billing_address: form.billing_address,
          billing_city: form.billing_city,
          billing_state: form.billing_state,
          billing_pin_code: form.billing_pin_code,
          billing_email: form.billing_email,
          billing_phone: form.billing_phone,
          gstin: form.gstin,
          pan: form.pan,
          _section: "billing",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save billing profile.");
      }

      setForm((prev) => ({ ...prev, ...data.profile }));
      setBillingSuccess("Billing profile saved successfully!");
      setTimeout(() => setBillingSuccess(null), 4000);
    } catch (err: any) {
      setBillingError(err.message || "Failed to save billing profile.");
    } finally {
      setSavingBilling(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in flex flex-col md:flex-row gap-6">
      {/* Settings Navigation Sidebar */}
      <SettingsSidebar />

      {/* Main Panel */}
      <main className="flex-1 space-y-6 min-w-0">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-fg truncate">Business Profile</h1>
            <p className="text-xs text-fg-4 mt-0.5 break-words">
              Manage your studio identity, address, billing details, and social links
            </p>
          </div>
        </div>

        {/* Global banners */}
        {successMsg && <SuccessBanner message={successMsg} />}
        {errorMsg && <ErrorBanner message={errorMsg} />}

        {loading ? (
          <div className="flex items-center justify-center py-24 bg-surface rounded-2xl border border-line">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <p className="text-xs text-fg-5 font-medium">Loading business profile…</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">

            {/* ── CARD 1: BUSINESS INFORMATION ────────────────────────────── */}
            <div className="bg-surface rounded-2xl border border-line p-3 sm:p-6 space-y-6">
              <CardHeader
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h6m-6 4h6m-2 5h2" />
                  </svg>
                }
                title="Business Information"
                subtitle="Public-facing studio identity and contact details"
              />

              {/* Logo upload — square with somewhat rounded corners, image fully fits without stretching */}
              <div className="flex flex-wrap items-center gap-5">
                <div
                  className="relative w-20 h-20 overflow-hidden border-2 border-line bg-surface-2/50 flex-shrink-0 flex items-center justify-center"
                  style={{ borderRadius: "12px" }}
                >
                  {form.logo_url ? (
                    <Image
                      src={form.logo_url}
                      alt="Business logo"
                      fill
                      className="object-contain p-1"
                      unoptimized
                    />
                  ) : (
                    /* Default Corhaus logo fallback — square, not circular */
                    <Image
                      src="/icon-192.jpg"
                      alt="Default logo"
                      fill
                      className="object-contain p-1"
                      unoptimized
                    />
                  )}
                  {uploadingLogo && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center" style={{ borderRadius: "12px" }}>
                      <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={uploadingLogo}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/20 transition-all disabled:opacity-50"
                  >
                    {uploadingLogo ? "Uploading…" : "Upload Logo"}
                  </button>
                  <p className="text-[11px] text-fg-5">JPG, PNG (max 2 MB)</p>
                  {logoError && (
                    <p className="text-[11px] text-rose-500 font-medium">{logoError}</p>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </div>

              {/* Row 1: Name | Portal URL | Email | Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <InputField
                  label="Business Name"
                  required
                  value={form.business_name}
                  onChange={(e) => patch("business_name", e.target.value)}
                  placeholder="Corhaus Pilates"
                />

                {/* Member Portal URL — shown with Request Change hint */}
                <div>
                  <FieldLabel>Member Portal URL</FieldLabel>
                  <div className="relative">
                    <input
                      type="url"
                      value={form.member_portal_url}
                      onChange={(e) => patch("member_portal_url", e.target.value)}
                      placeholder="https://members.yourstudio.com"
                      className="w-full px-3 py-2.5 pr-24 rounded-xl border border-line bg-surface-2/40 text-sm text-fg placeholder:text-fg-5/60 focus:outline-none focus:ring-1 focus:ring-accent transition-shadow"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-accent cursor-default select-none">
                      Request Change
                    </span>
                  </div>
                </div>

                <InputField
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => patch("email", e.target.value)}
                  placeholder="hello@yourstudio.com"
                />

                {/* Phone with +91 prefix */}
                <div>
                  <FieldLabel>Phone</FieldLabel>
                  <div className="flex">
                    <span className="flex items-center px-3 rounded-l-xl border border-r-0 border-line bg-surface-2/60 text-xs font-semibold text-fg-3 select-none whitespace-nowrap">
                      +91
                    </span>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => patch("phone", e.target.value.replace(/\D/g, ""))}
                      maxLength={10}
                      placeholder="98765 43210"
                      className="flex-1 px-3 py-2.5 rounded-r-xl border border-line bg-surface-2/40 text-sm text-fg placeholder:text-fg-5/60 focus:outline-none focus:ring-1 focus:ring-accent transition-shadow"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Website (full width) */}
              <InputField
                label="Website"
                type="url"
                value={form.website}
                onChange={(e) => patch("website", e.target.value)}
                placeholder="https://yourbusiness.com"
              />
            </div>

            {/* ── CARD 2: ADDRESS INFORMATION ─────────────────────────────── */}
            <div className="bg-surface rounded-2xl border border-line p-3 sm:p-6 space-y-6">
              <CardHeader
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
                title="Address Information"
                subtitle="Physical location of your studio or registered address"
              />

              <InputField
                label="Address Line 1"
                value={form.address_line_1}
                onChange={(e) => patch("address_line_1", e.target.value)}
                placeholder="Street address, building number"
              />

              <InputField
                label="Address Line 2"
                value={form.address_line_2}
                onChange={(e) => patch("address_line_2", e.target.value)}
                placeholder="Apartment, floor, landmark, etc."
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Country */}
                <SelectField
                  label="Country"
                  value={form.country}
                  onChange={(e) => patch("country", e.target.value)}
                >
                  <option value="India">🇮🇳 India</option>
                </SelectField>

                <InputField
                  label="City"
                  value={form.city}
                  onChange={(e) => patch("city", e.target.value)}
                  placeholder="Hyderabad"
                />

                <SelectField
                  label="State"
                  value={form.state}
                  onChange={(e) => patch("state", e.target.value)}
                >
                  <option value="">Select state…</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </SelectField>

                <InputField
                  label="PIN Code"
                  value={form.pin_code}
                  onChange={(e) => patch("pin_code", e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                  placeholder="500032"
                />
              </div>
            </div>

            {/* ── CARD 3: BILLING PROFILE ─────────────────────────────────── */}
            <div className="bg-surface rounded-2xl border border-line p-3 sm:p-6 space-y-6">
              <CardHeader
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                }
                title="Billing Profile"
                subtitle="Legal entity name and GST/tax details used on invoices"
              />

              {/* Billing banners */}
              {billingSuccess && <SuccessBanner message={billingSuccess} />}
              {billingError && <ErrorBanner message={billingError} />}

              {/* Legal Name + Attention To */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  label="Legal / Trade Name"
                  required
                  value={form.legal_trade_name}
                  onChange={(e) => patch("legal_trade_name", e.target.value)}
                  placeholder="Yuksha Health Private Limited"
                />
                <InputField
                  label="Attention To (Owner Name)"
                  value={form.attention_to}
                  onChange={(e) => patch("attention_to", e.target.value)}
                  placeholder="Vikram Oberoi"
                />
              </div>

              {/* Billing Address (textarea) */}
              <TextareaField
                label="Billing Address"
                rows={3}
                value={form.billing_address}
                onChange={(e) => patch("billing_address", e.target.value)}
                placeholder="Full billing / registered address"
              />

              {/* City | State | PIN */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <InputField
                  label="Billing City"
                  value={form.billing_city}
                  onChange={(e) => patch("billing_city", e.target.value)}
                  placeholder="Hyderabad"
                />
                <SelectField
                  label="Billing State"
                  value={form.billing_state}
                  onChange={(e) => patch("billing_state", e.target.value)}
                >
                  <option value="">Select state…</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </SelectField>
                <InputField
                  label="PIN Code"
                  value={form.billing_pin_code}
                  onChange={(e) => patch("billing_pin_code", e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                  placeholder="500032"
                />
              </div>

              {/* Email + Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  label="Billing Email"
                  type="email"
                  value={form.billing_email}
                  onChange={(e) => patch("billing_email", e.target.value)}
                  placeholder="billing@yourstudio.com"
                />
                <InputField
                  label="Billing Phone"
                  type="tel"
                  value={form.billing_phone}
                  onChange={(e) => patch("billing_phone", e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>

              {/* GSTIN + PAN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>GSTIN</FieldLabel>
                  <input
                    type="text"
                    maxLength={15}
                    value={form.gstin}
                    onChange={(e) => patch("gstin", e.target.value.toUpperCase())}
                    placeholder="36AACCY1441J1ZB"
                    className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm font-mono text-fg placeholder:text-fg-5/60 focus:outline-none focus:ring-1 focus:ring-accent transition-shadow uppercase"
                  />
                  <p className="text-[11px] text-fg-5 mt-1">15-digit GST Identification Number</p>
                </div>
                <div>
                  <FieldLabel>PAN</FieldLabel>
                  <input
                    type="text"
                    maxLength={10}
                    value={form.pan}
                    onChange={(e) => patch("pan", e.target.value.toUpperCase())}
                    placeholder="AAAAA0000A"
                    className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm font-mono text-fg placeholder:text-fg-5/60 focus:outline-none focus:ring-1 focus:ring-accent transition-shadow uppercase"
                  />
                </div>
              </div>

              {/* Independent Save Billing Profile button */}
              <div className="flex flex-wrap justify-end pt-2 gap-2">
                <button
                  type="button"
                  disabled={savingBilling}
                  onClick={handleSaveBilling}
                  className="w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl bg-accent text-white text-xs font-bold shadow-md shadow-accent/20 hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {savingBilling ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save Billing Profile"
                  )}
                </button>
              </div>
            </div>

            {/* ── CARD 4: BUSINESS DETAILS ─────────────────────────────────── */}
            <div className="bg-surface rounded-2xl border border-line p-3 sm:p-6 space-y-6">
              <CardHeader
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                }
                title="Business Details"
                subtitle="Government registration numbers for your studio"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>GST Number</FieldLabel>
                  <input
                    type="text"
                    maxLength={15}
                    value={form.gst_number}
                    onChange={(e) => patch("gst_number", e.target.value.toUpperCase())}
                    placeholder="36AACCY1441J1ZB"
                    className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm font-mono text-fg placeholder:text-fg-5/60 focus:outline-none focus:ring-1 focus:ring-accent transition-shadow uppercase"
                  />
                </div>
                <InputField
                  label="Business Registration Number"
                  value={form.business_registration_number}
                  onChange={(e) => patch("business_registration_number", e.target.value)}
                  placeholder="U85110TG2021PTC153453"
                />
              </div>
            </div>

            {/* ── CARD 5: SOCIAL MEDIA LINKS ───────────────────────────────── */}
            <div className="bg-surface rounded-2xl border border-line p-3 sm:p-6 space-y-6">
              <CardHeader
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                }
                title="Social Media Links"
                subtitle="Links to your studio's social profiles"
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Instagram */}
                <div>
                  <FieldLabel>Instagram</FieldLabel>
                  <div className="flex">
                    <span className="flex items-center px-2.5 rounded-l-xl border border-r-0 border-line bg-surface-2/60 select-none">
                      {/* Instagram icon */}
                      <svg className="w-4 h-4 text-fg-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                      </svg>
                    </span>
                    <input
                      type="url"
                      value={form.instagram_url}
                      onChange={(e) => patch("instagram_url", e.target.value)}
                      placeholder="https://instagram.com/yourstudio"
                      className="flex-1 px-3 py-2.5 rounded-r-xl border border-line bg-surface-2/40 text-sm text-fg placeholder:text-fg-5/60 focus:outline-none focus:ring-1 focus:ring-accent transition-shadow"
                    />
                  </div>
                </div>

                {/* Facebook */}
                <div>
                  <FieldLabel>Facebook</FieldLabel>
                  <div className="flex">
                    <span className="flex items-center px-2.5 rounded-l-xl border border-r-0 border-line bg-surface-2/60 select-none">
                      <svg className="w-4 h-4 text-fg-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                    </span>
                    <input
                      type="url"
                      value={form.facebook_url}
                      onChange={(e) => patch("facebook_url", e.target.value)}
                      placeholder="https://facebook.com/yourstudio"
                      className="flex-1 px-3 py-2.5 rounded-r-xl border border-line bg-surface-2/40 text-sm text-fg placeholder:text-fg-5/60 focus:outline-none focus:ring-1 focus:ring-accent transition-shadow"
                    />
                  </div>
                </div>

                {/* YouTube */}
                <div>
                  <FieldLabel>YouTube</FieldLabel>
                  <div className="flex">
                    <span className="flex items-center px-2.5 rounded-l-xl border border-r-0 border-line bg-surface-2/60 select-none">
                      <svg className="w-4 h-4 text-fg-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                      </svg>
                    </span>
                    <input
                      type="url"
                      value={form.youtube_url}
                      onChange={(e) => patch("youtube_url", e.target.value)}
                      placeholder="https://youtube.com/@yourstudio"
                      className="flex-1 px-3 py-2.5 rounded-r-xl border border-line bg-surface-2/40 text-sm text-fg placeholder:text-fg-5/60 focus:outline-none focus:ring-1 focus:ring-accent transition-shadow"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── SAVE CHANGES (general) ───────────────────────────────────── */}
            <div className="flex flex-wrap justify-end pt-1 gap-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto justify-center px-6 py-3 rounded-xl bg-accent text-white text-sm font-bold shadow-lg shadow-accent/20 hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
