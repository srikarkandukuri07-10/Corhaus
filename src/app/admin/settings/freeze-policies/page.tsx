"use client";

import { useEffect, useState } from "react";
import { SettingsSidebar } from "../invoice-settings/page";

export interface FreezePolicy {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  min_days: number;
  max_days: number;
  max_freezes_per_year: number;
  max_total_days_per_year: number;
  fee_label: string;
  applies_to: string;
  allowed_reasons: string[];
}

const ALL_REASONS = [
  "Travel / Vacation",
  "Medical / Injury",
  "Work Commitment",
  "Family Emergency",
  "Financial Reasons",
  "Relocation (Temporary)",
  "Other",
];

export default function FreezePoliciesPage() {
  const [policies, setPolicies] = useState<FreezePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Drawer / Modal state
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<FreezePolicy | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formMinDays, setFormMinDays] = useState(7);
  const [formMaxDays, setFormMaxDays] = useState(30);
  const [formMaxFreezesYear, setFormMaxFreezesYear] = useState(2);
  const [formMaxTotalDaysYear, setFormMaxTotalDaysYear] = useState(60);
  const [formReasons, setFormReasons] = useState<string[]>([...ALL_REASONS]);

  // Load Policies from DB
  useEffect(() => {
    async function fetchPolicies() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/settings/freeze-policies");
        const data = await res.json();
        if (data && data.policies) {
          setPolicies(data.policies);
        }
      } catch (err) {
        console.error("Failed to load freeze policies:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPolicies();
  }, []);

  function handleOpenCreate() {
    setEditingPolicy(null);
    setFormName("");
    setFormMinDays(7);
    setFormMaxDays(30);
    setFormMaxFreezesYear(2);
    setFormMaxTotalDaysYear(60);
    setFormReasons([...ALL_REASONS]);
    setShowDrawer(true);
    setMenuOpenId(null);
  }

  function handleOpenEdit(policy: FreezePolicy) {
    setEditingPolicy(policy);
    setFormName(policy.name);
    setFormMinDays(policy.min_days);
    setFormMaxDays(policy.max_days);
    setFormMaxFreezesYear(policy.max_freezes_per_year);
    setFormMaxTotalDaysYear(policy.max_total_days_per_year);
    setFormReasons(policy.allowed_reasons || [...ALL_REASONS]);
    setShowDrawer(true);
    setMenuOpenId(null);
  }

  function toggleReason(reason: string) {
    setFormReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  }

  async function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) {
      setError("Please enter a policy name.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const updatedPolicy: FreezePolicy = {
      id: editingPolicy ? editingPolicy.id : `policy-${Date.now()}`,
      name: formName.trim(),
      is_default: editingPolicy ? editingPolicy.is_default : policies.length === 0,
      is_active: editingPolicy ? editingPolicy.is_active : true,
      min_days: Math.max(1, formMinDays),
      max_days: Math.max(formMinDays, formMaxDays),
      max_freezes_per_year: Math.max(1, formMaxFreezesYear),
      max_total_days_per_year: Math.max(1, formMaxTotalDaysYear),
      fee_label: editingPolicy ? editingPolicy.fee_label : "Free",
      applies_to: editingPolicy ? editingPolicy.applies_to : "Applies to all plans",
      allowed_reasons: formReasons,
    };

    let nextPolicies: FreezePolicy[];
    if (editingPolicy) {
      nextPolicies = policies.map((p) => (p.id === editingPolicy.id ? updatedPolicy : p));
    } else {
      nextPolicies = [...policies, updatedPolicy];
    }

    try {
      const res = await fetch("/api/admin/settings/freeze-policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policies: nextPolicies }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save policy.");
      }

      setPolicies(data.policies);
      setShowDrawer(false);
      setSuccess("Freeze policy saved successfully!");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || "Failed to save policy.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePolicy(id: string) {
    const policyToDelete = policies.find((p) => p.id === id);
    if (policyToDelete?.is_default) {
      alert("Default policy cannot be deleted.");
      return;
    }

    if (!confirm("Are you sure you want to delete this freeze policy?")) return;

    const nextPolicies = policies.filter((p) => p.id !== id);
    try {
      const res = await fetch("/api/admin/settings/freeze-policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policies: nextPolicies }),
      });
      const data = await res.json();
      if (res.ok && data.policies) {
        setPolicies(data.policies);
      }
    } catch (err) {
      console.error("Failed to delete policy:", err);
    }
    setMenuOpenId(null);
  }

  return (
    <div className="animate-fade-in flex flex-col md:flex-row gap-6">
      {/* Settings Left Navigation Sidebar */}
      <SettingsSidebar />

      {/* Main Content Area */}
      <main className="flex-1 space-y-6">
        {/* Top Header Row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg">Freeze Policies</h1>
            <p className="text-xs text-fg-4 mt-0.5">
              Configure membership freeze limits, duration rules, and allowed reasons
            </p>
          </div>

          <button
            onClick={handleOpenCreate}
            className="px-4 py-2.5 rounded-xl bg-accent text-white font-bold text-xs shadow-md shadow-accent/20 hover:opacity-90 transition-all flex items-center gap-1.5"
          >
            <span className="text-sm">+</span>
            <span>Create Policy</span>
          </button>
        </div>

        {/* Notifications */}
        {success && (
          <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-600 font-semibold text-sm flex items-center gap-2 animate-fade-in">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {success}
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

        {/* Policies Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24 bg-surface rounded-2xl border border-line">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <p className="text-xs text-fg-5 font-medium">Loading freeze policies…</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {policies.map((policy) => (
              <div
                key={policy.id}
                className="bg-surface rounded-2xl border border-line p-5 space-y-4 relative hover:border-accent/30 transition-all shadow-sm"
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-lg text-accent">❄</span>
                    <h3 className="text-base font-bold text-fg truncate">{policy.name}</h3>
                    {policy.is_default && (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 text-[10px] font-bold uppercase tracking-wider">
                        DEFAULT
                      </span>
                    )}
                    {policy.is_active && (
                      <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[10px] font-bold">
                        Active
                      </span>
                    )}
                  </div>

                  {/* Actions Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpenId(menuOpenId === policy.id ? null : policy.id)}
                      className="p-1 rounded-lg text-fg-4 hover:text-fg hover:bg-surface-2 transition-all"
                    >
                      ⋮
                    </button>
                    {menuOpenId === policy.id && (
                      <div className="absolute right-0 top-7 z-20 w-36 bg-surface border border-line rounded-xl shadow-xl py-1 text-xs font-semibold">
                        <button
                          onClick={() => handleOpenEdit(policy)}
                          className="w-full text-left px-3 py-2 text-fg hover:bg-surface-2 transition-colors flex items-center gap-2"
                        >
                          ✏ Edit Policy
                        </button>
                        {!policy.is_default && (
                          <button
                            onClick={() => handleDeletePolicy(policy.id)}
                            className="w-full text-left px-3 py-2 text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center gap-2"
                          >
                            🗑 Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs text-fg-3">
                  <div className="flex items-center gap-2">
                    <span className="text-fg-4">🕒</span>
                    <span>
                      Duration: <strong className="text-fg font-bold">{policy.min_days} - {policy.max_days} days</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-fg-4">📅</span>
                    <span>
                      Max/Year: <strong className="text-fg font-bold">{policy.max_freezes_per_year} freezes</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-fg-4">💲</span>
                    <span>
                      Freeze Fee: <strong className="text-fg font-bold">{policy.fee_label || "Free"}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-fg-4">❄</span>
                    <span>
                      Max Total Days/Year: <strong className="text-fg font-bold">{policy.max_total_days_per_year} days</strong>
                    </span>
                  </div>
                </div>

                {/* Footer Note */}
                <div className="border-t border-line pt-3 text-[11px] text-fg-5">
                  {policy.applies_to || "Applies to all plans"}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CREATE / EDIT DRAWER MODAL */}
        {showDrawer && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-fade-in">
            <div className="w-full max-w-lg bg-surface border-l border-line h-full flex flex-col shadow-2xl overflow-y-auto">
              {/* Drawer Header */}
              <div className="px-6 py-5 border-b border-line flex items-center justify-between bg-surface-2/30">
                <h3 className="text-lg font-bold text-fg">
                  {editingPolicy ? "Edit Freeze Policy" : "Create Freeze Policy"}
                </h3>
                <button
                  onClick={() => setShowDrawer(false)}
                  className="p-1.5 rounded-xl border border-line text-fg-4 hover:text-fg hover:bg-surface-2 transition-all"
                >
                  ✕
                </button>
              </div>

              {/* Drawer Form Body */}
              <form onSubmit={handleSavePolicy} className="p-6 space-y-6 flex-1">
                {/* Policy Name */}
                <div>
                  <label className="block text-xs font-bold text-fg mb-1.5">
                    Policy Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Standard Freeze Policy"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                {/* Duration Limits */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-fg uppercase tracking-wider">Duration Limits</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-fg-4 mb-1">Min Days</label>
                      <input
                        type="number"
                        min={1}
                        value={formMinDays}
                        onChange={(e) => setFormMinDays(parseInt(e.target.value, 10) || 1)}
                        className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2/40 text-sm font-semibold text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-fg-4 mb-1">Max Days</label>
                      <input
                        type="number"
                        min={1}
                        value={formMaxDays}
                        onChange={(e) => setFormMaxDays(parseInt(e.target.value, 10) || 1)}
                        className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2/40 text-sm font-semibold text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  </div>
                </div>

                {/* Usage Limits */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-fg uppercase tracking-wider">Usage Limits</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-fg-4 mb-1">Max Freezes/Year</label>
                      <input
                        type="number"
                        min={1}
                        value={formMaxFreezesYear}
                        onChange={(e) => setFormMaxFreezesYear(parseInt(e.target.value, 10) || 1)}
                        className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2/40 text-sm font-semibold text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-fg-4 mb-1">Max Total Days/Year</label>
                      <input
                        type="number"
                        min={1}
                        value={formMaxTotalDaysYear}
                        onChange={(e) => setFormMaxTotalDaysYear(parseInt(e.target.value, 10) || 1)}
                        className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2/40 text-sm font-semibold text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  </div>
                </div>

                {/* Yellow Informational Note */}
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 flex items-start gap-3">
                  <span className="text-base flex-shrink-0 mt-0.5">💳</span>
                  <p className="leading-relaxed">
                    Freeze fees are now configured under{" "}
                    <strong>Plans → Other Charges</strong> → Create a charge with trigger{" "}
                    <strong>"On freeze"</strong> — it applies to every freeze across all policies.
                  </p>
                </div>

                {/* Allowed Reasons Checkboxes */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-fg uppercase tracking-wider">Allowed Reasons</h4>
                    <span className="text-[11px] text-fg-5 font-semibold">
                      {formReasons.length === ALL_REASONS.length ? "All reasons allowed" : `${formReasons.length} selected`}
                    </span>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2 border border-line p-3 rounded-xl bg-surface-2/20">
                    {ALL_REASONS.map((reason) => (
                      <label key={reason} className="flex items-center gap-3 text-xs font-semibold text-fg cursor-pointer hover:text-accent transition-colors">
                        <input
                          type="checkbox"
                          checked={formReasons.includes(reason)}
                          onChange={() => toggleReason(reason)}
                          className="rounded text-accent focus:ring-accent w-4 h-4"
                        />
                        <span>{reason}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Drawer Footer Actions */}
                <div className="pt-4 border-t border-line flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDrawer(false)}
                    className="px-4 py-2.5 rounded-xl border border-line text-xs font-bold text-fg-4 hover:text-fg hover:bg-surface-2 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 rounded-xl bg-accent text-white text-xs font-bold shadow-md shadow-accent/20 hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Saving Policy…</span>
                      </>
                    ) : (
                      <span>Save Policy</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
