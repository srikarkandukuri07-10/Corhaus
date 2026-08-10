"use client";

import { useState, useEffect } from "react";
import { SettingsSidebar } from "../invoice-settings/page";
import { CancellationPolicyData, DEFAULT_CANCELLATION_POLICY } from "@/lib/cancellationPolicy";

export default function CancellationPolicySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [hours, setHours] = useState(6);
  const [minutes, setMinutes] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [policyNote, setPolicyNote] = useState("");

  useEffect(() => {
    async function loadPolicy() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/settings/cancellation-policy");
        const data = await res.json();
        if (res.ok && data?.policy) {
          setHours(data.policy.hours ?? 6);
          setMinutes(data.policy.minutes ?? 0);
          setIsActive(data.policy.is_active ?? true);
          setPolicyNote(data.policy.policy_note || DEFAULT_CANCELLATION_POLICY.policy_note);
        }
      } catch (err) {
        console.error("Failed to load cancellation policy:", err);
      } finally {
        setLoading(false);
      }
    }

    loadPolicy();
  }, []);

  function applyPreset(presetHours: number, presetMinutes: number = 0) {
    setHours(presetHours);
    setMinutes(presetMinutes);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaveSuccess(null);

    const safeHours = Math.max(0, Math.min(72, Number(hours) || 0));
    const safeMinutes = Math.max(0, Math.min(59, Number(minutes) || 0));

    try {
      const res = await fetch("/api/admin/settings/cancellation-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours: safeHours,
          minutes: safeMinutes,
          is_active: isActive,
          policy_note: policyNote,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save cancellation policy.");
      }

      setSaveSuccess("Cancellation policy saved successfully! Changes are live immediately.");
      setTimeout(() => setSaveSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred while saving.");
    } finally {
      setSaving(false);
    }
  }

  const formatDuration = (h: number, m: number) => {
    if (h === 0 && m === 0) return "0 minutes";
    const parts = [];
    if (h > 0) parts.push(`${h} hour${h > 1 ? "s" : ""}`);
    if (m > 0) parts.push(`${m} minute${m > 1 ? "s" : ""}`);
    return parts.join(" ");
  };

  return (
    <div className="flex gap-8 items-start">
      <SettingsSidebar />

      <div className="flex-1 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg">Cancellation Policy Settings</h1>
            <p className="text-xs text-fg-4 mt-1">
              Customize class and PT booking cancellation rules. Changes apply to all members immediately.
            </p>
          </div>
        </div>

        {saveSuccess && (
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-sm font-medium animate-fade-in flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{saveSuccess}</span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-400/20 text-red-500 text-sm font-medium animate-fade-in">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-surface rounded-2xl border border-line p-12 text-center">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-text-gold rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-fg-5 font-medium">Loading cancellation policy…</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* CARD 1: CANCELLATION TIME BUFFER */}
            <div className="bg-surface rounded-2xl border border-line p-6 space-y-6 shadow-sm">
              <div className="border-b border-line pb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-fg">Cancellation Time Window</h3>
                  <p className="text-xs text-fg-4 mt-0.5">
                    Define how far in advance a member must cancel before class start time.
                  </p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-xs font-semibold text-fg-4 uppercase tracking-wider mb-2">
                  Quick Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "1 Hour", h: 1, m: 0 },
                    { label: "2 Hours", h: 2, m: 0 },
                    { label: "3 Hours", h: 3, m: 0 },
                    { label: "4 Hours", h: 4, m: 0 },
                    { label: "6 Hours (Default)", h: 6, m: 0 },
                    { label: "12 Hours", h: 12, m: 0 },
                    { label: "24 Hours", h: 24, m: 0 },
                    { label: "30 Mins", h: 0, m: 30 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset.h, preset.m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                        hours === preset.h && minutes === preset.m
                          ? "bg-accent text-white border-accent shadow-sm"
                          : "bg-surface-2 text-fg-3 border-line hover:text-fg hover:border-fg-4"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Hours & Minutes Input */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-fg-4 uppercase tracking-wider mb-1.5">
                    Hours Before Class
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={72}
                      value={hours}
                      onChange={(e) => setHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2 text-fg font-bold text-lg focus:outline-none focus:border-accent"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-fg-4">
                      Hours
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-4 uppercase tracking-wider mb-1.5">
                    Minutes Before Class
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={minutes}
                      onChange={(e) => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                      className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2 text-fg font-bold text-lg focus:outline-none focus:border-accent"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-fg-4">
                      Minutes
                    </span>
                  </div>
                </div>
              </div>

              {/* Policy Toggle */}
              <div className="space-y-4 pt-4 border-t border-line">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-fg">Enable Cancellation Policy Window</p>
                    <p className="text-xs text-fg-4">
                      When enabled, members cannot cancel bookings within the specified cutoff window.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${
                      isActive ? "bg-accent" : "bg-line"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                        isActive ? "translate-x-6" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Custom Policy Note */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-fg-4 uppercase tracking-wider mb-1.5">
                  Member Policy Explanation / Terms
                </label>
                <textarea
                  rows={3}
                  value={policyNote}
                  onChange={(e) => setPolicyNote(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2 text-fg text-sm placeholder:text-fg-5 focus:outline-none focus:border-accent resize-none"
                  placeholder="Enter policy terms shown to members..."
                />
              </div>
            </div>

            {/* CARD 2: LIVE MEMBER PREVIEW */}
            <div className="bg-surface-2 rounded-2xl border border-line p-6 space-y-3">
              <div className="flex items-center gap-2 text-fg">
                <span className="text-lg">👁️</span>
                <h4 className="text-sm font-bold uppercase tracking-wider">Member Experience Live Preview</h4>
              </div>

              <div className="bg-surface p-4 rounded-xl border border-line space-y-2">
                <p className="text-xs text-fg-4 font-semibold">
                  How this appears to members on their dashboard & bookings list:
                </p>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-600 text-xs font-medium">
                  📢 <strong>Cancellation Policy:</strong> Bookings can be cancelled up to{" "}
                  <strong className="underline">{formatDuration(hours, minutes)}</strong> before class start time. On-time cancellations return credit to member; late cancellations or no-shows forfeit credit.
                </div>

                <div className="pt-2 flex items-center justify-between text-xs text-fg-3 border-t border-line mt-2">
                  <span>Example Class: Pilates Reformer (10:00 AM)</span>
                  <span className="font-semibold text-red-500">
                    Cancel Cutoff: {hours > 0 || minutes > 0 ? `${formatDuration(hours, minutes)} prior` : "Immediate"}
                  </span>
                </div>
              </div>
            </div>

            {/* SAVE BUTTON */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent-dark transition-colors shadow-md shadow-accent/20 flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving Policy…</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Save Cancellation Policy</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
