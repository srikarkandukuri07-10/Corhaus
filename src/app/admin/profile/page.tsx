"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type StaffProfile = {
  id: string;
  full_name: string;
  phone_number: string;
  email: string | null;
  role: string;
  designation: string;
  location: string;
  employment_status: string;
  joining_date: string | null;
  specialization: string | null;
  experience_years: number | null;
  certifications: string | null;
  classes_assigned: string | null;
  pt_available: boolean | null;
  group_class_available: boolean | null;
  gender: string | null;
  date_of_birth: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  address: string | null;
  bank_name: string | null;
  account_holder_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  upi_id: string | null;
  isOwnerFallback?: boolean;
};

const inputCls =
  "w-full p-3 rounded-2xl border border-line-2 bg-surface-2 text-sm text-fg placeholder:text-fg-4 focus:ring-2 focus:ring-accent/30 focus:border-accent/40 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
const labelCls = "block font-bold text-fg text-[11px] mb-1.5";
const sectionTitleCls = "text-xs font-bold uppercase tracking-wider text-accent";

function getInitials(name: string): string {
  const t = (name || "").trim();
  if (!t) return "A";
  // Keep single-initial visual style but dynamic from actual name
  return t.charAt(0).toUpperCase();
}

export default function MyProfilePage() {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<StaffProfile>>({});

  async function fetchProfile() {
    setError(null);
    try {
      const res = await fetch("/api/admin/my-profile", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to load profile");
      setProfile(j.staff);
      setForm(j.staff);
    } catch (e: any) {
      setError(e.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProfile();
  }, []);

  function updateField(key: keyof StaffProfile, value: any) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(null);
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Client-side validation mirrors server
    if (!form.full_name?.trim()) {
      setError("Full Name is required.");
      return;
    }
    if (!form.phone_number?.trim()) {
      setError("Phone Number is required.");
      return;
    }
    if (!/^\d{10}$/.test((form.phone_number || "").trim())) {
      setError("Phone Number must be exactly 10 digits.");
      return;
    }
    if (!form.designation?.trim()) {
      setError("Designation is required.");
      return;
    }
    if (form.email && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Invalid Email address format.");
      return;
    }
    if (form.emergency_contact_number && (form.emergency_contact_number || "").trim() && !/^\d{10}$/.test((form.emergency_contact_number || "").trim())) {
      setError("Emergency Contact Number must be 10 digits.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/my-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name?.trim(),
          phone_number: form.phone_number?.trim(),
          email: (form.email || "").trim(),
          designation: form.designation?.trim(),
          location: (form.location || "Main Studio").trim(),
          gender: form.gender || null,
          date_of_birth: form.date_of_birth || null,
          emergency_contact_name: (form.emergency_contact_name || "").trim() || null,
          emergency_contact_number: (form.emergency_contact_number || "").trim() || null,
          address: (form.address || "").trim() || null,
          bank_name: (form.bank_name || "").trim() || null,
          account_holder_name: (form.account_holder_name || "").trim() || null,
          account_number: (form.account_number || "").trim() || null,
          ifsc_code: (form.ifsc_code || "").trim() || null,
          upi_id: (form.upi_id || "").trim() || null,
          specialization: (form.specialization || "").trim() || null,
          experience_years: form.experience_years,
          certifications: (form.certifications || "").trim() || null,
          classes_assigned: (form.classes_assigned || "").trim() || null,
          pt_available: form.pt_available,
          group_class_available: form.group_class_available,
          payment_type: (form as any).payment_type || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to update profile");

      setProfile(j.staff);
      setForm(j.staff);
      setSuccess("Profile updated successfully.");
      // Notify admin layout to refresh header
      window.dispatchEvent(new CustomEvent("corhaus:profile-updated"));
      // Also refresh via API so header reflects immediately
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Unable to update your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <p className="text-sm text-fg-3 font-medium">Loading your profile…</p>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchProfile} className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold">
            Retry
          </button>
        </div>
        <Link href="/admin" className="text-sm text-accent font-semibold hover:underline">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const isTrainer = (profile?.role || form.role) === "Trainer";
  const displayRole = profile?.role || form.role || "Staff";
  const joinDateLabel = profile?.joining_date ? new Date(profile.joining_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const staffIdShort = profile?.id ? profile.id.slice(0, 8).toUpperCase() : "—";

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in pb-10 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-fg-3">
            <Link href="/admin" className="hover:text-fg transition-colors">
              Dashboard
            </Link>{" "}
            <span className="text-fg-4">/</span> <span className="text-fg font-bold">My Profile</span>
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-fg tracking-tight mt-1">My Profile</h1>
          <p className="text-sm text-fg-3 mt-1.5">View and edit your staff details. This updates your record in Supabase.</p>
        </div>
      </div>

      {error && <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">{error}</div>}
      {success && <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center justify-between"><span>{success}</span><button onClick={() => setSuccess(null)} className="font-bold">✕</button></div>}

      {/* Avatar / Identity Card */}
      <div className="bg-surface rounded-3xl border border-line shadow-xs p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-accent text-white font-black flex items-center justify-center text-2xl sm:text-3xl shrink-0 shadow-md shadow-accent/20">
          {getInitials(form.full_name || profile?.full_name || "")}
        </div>
        <div className="text-center sm:text-left min-w-0">
          <p className="text-xl sm:text-2xl font-extrabold text-fg truncate">{form.full_name || "—"}</p>
          <p className="text-sm font-bold text-accent mt-1">{displayRole}</p>
          <p className="text-xs text-fg-3 mt-1 truncate">{form.email || "No email"}</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Personal Information */}
        <section className="bg-surface rounded-3xl border border-line shadow-xs p-4 sm:p-6 space-y-4 min-w-0">
          <p className={sectionTitleCls}>Personal Information</p>

          <div>
            <label className={labelCls}>Full Name *</label>
            <input required value={form.full_name || ""} onChange={(e) => updateField("full_name", e.target.value)} placeholder="e.g. John Smith" className={inputCls} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone Number *</label>
              <input required value={form.phone_number || ""} onChange={(e) => updateField("phone_number", e.target.value)} placeholder="10-digit number" inputMode="numeric" maxLength={10} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email || ""} onChange={(e) => updateField("email", e.target.value)} placeholder="john@example.com" className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Role</label>
            <input value={displayRole} disabled className={`${inputCls} bg-surface-2 cursor-not-allowed`} />
            <p className="text-[11px] text-fg-4 mt-1">Role is managed by an administrator and cannot be changed here.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Designation *</label>
              <input required value={form.designation || ""} onChange={(e) => updateField("designation", e.target.value)} placeholder="e.g. Business Owner, Receptionist" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <input value={form.location || ""} onChange={(e) => updateField("location", e.target.value)} placeholder="Main Studio" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Gender</label>
              <select value={form.gender || ""} onChange={(e) => updateField("gender", e.target.value)} className={inputCls}>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" value={form.date_of_birth || ""} onChange={(e) => updateField("date_of_birth", e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Address</label>
            <textarea rows={2} value={form.address || ""} onChange={(e) => updateField("address", e.target.value)} placeholder="Residential address" className={`${inputCls} resize-none`} />
          </div>
        </section>

        {/* Employment Information */}
        <section className="bg-surface rounded-3xl border border-line shadow-xs p-4 sm:p-6 space-y-4 min-w-0">
          <p className={sectionTitleCls}>Employment Information</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Join Date</label>
              <input value={joinDateLabel} disabled className={`${inputCls} bg-surface-2 cursor-not-allowed`} />
            </div>
            <div>
              <label className={labelCls}>Staff ID</label>
              <input value={staffIdShort} disabled className={`${inputCls} bg-surface-2 cursor-not-allowed font-mono text-xs`} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Employment Status</label>
              <input value={profile?.employment_status || "Active"} disabled className={`${inputCls} bg-surface-2 cursor-not-allowed`} />
            </div>
            <div>
              <label className={labelCls}>Emergency Contact Name</label>
              <input value={form.emergency_contact_name || ""} onChange={(e) => updateField("emergency_contact_name", e.target.value)} placeholder="Contact person" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Emergency Contact Number</label>
            <input value={form.emergency_contact_number || ""} onChange={(e) => updateField("emergency_contact_number", e.target.value)} placeholder="10-digit number" inputMode="numeric" maxLength={10} className={inputCls} />
          </div>
        </section>

        {/* Trainer Information — only for Trainer */}
        {isTrainer && (
          <section className="bg-surface rounded-3xl border border-line shadow-xs p-4 sm:p-6 space-y-4 min-w-0">
            <p className={sectionTitleCls}>Trainer Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Specialization</label>
                <input value={form.specialization || ""} onChange={(e) => updateField("specialization", e.target.value)} placeholder="e.g. Reformer Pilates" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Experience (years)</label>
                <input type="number" min={0} value={form.experience_years ?? 0} onChange={(e) => updateField("experience_years", e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Certifications</label>
              <textarea rows={2} value={form.certifications || ""} onChange={(e) => updateField("certifications", e.target.value)} placeholder="Certifications" className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className={labelCls}>Classes Assigned</label>
              <input value={form.classes_assigned || ""} onChange={(e) => updateField("classes_assigned", e.target.value)} placeholder="Class names" className={inputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-fg cursor-pointer">
                <input type="checkbox" checked={!!form.pt_available} onChange={(e) => updateField("pt_available", e.target.checked)} className="w-4 h-4 accent-accent" />
                PT Available
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-fg cursor-pointer">
                <input type="checkbox" checked={!!form.group_class_available} onChange={(e) => updateField("group_class_available", e.target.checked)} className="w-4 h-4 accent-accent" />
                Group Class Available
              </label>
            </div>
          </section>
        )}

        {/* Bank Information */}
        <section className="bg-surface rounded-3xl border border-line shadow-xs p-4 sm:p-6 space-y-4 min-w-0">
          <p className={sectionTitleCls}>Bank Information</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Bank Name</label>
              <input value={form.bank_name || ""} onChange={(e) => updateField("bank_name", e.target.value)} placeholder="Bank name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Account Holder Name</label>
              <input value={form.account_holder_name || ""} onChange={(e) => updateField("account_holder_name", e.target.value)} placeholder="As per bank" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Account Number</label>
              <input value={form.account_number || ""} onChange={(e) => updateField("account_number", e.target.value)} placeholder="Account number" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>IFSC Code</label>
              <input value={form.ifsc_code || ""} onChange={(e) => updateField("ifsc_code", e.target.value)} placeholder="IFSC" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>UPI ID</label>
            <input value={form.upi_id || ""} onChange={(e) => updateField("upi_id", e.target.value)} placeholder="name@upi" className={inputCls} />
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
          <Link href="/admin" className="px-6 py-3 rounded-2xl border border-line bg-surface text-fg text-sm font-bold hover:bg-hover text-center">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-3 rounded-2xl bg-accent text-white text-sm font-bold hover:bg-accent-2 disabled:opacity-50 shadow-md shadow-accent/20"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
