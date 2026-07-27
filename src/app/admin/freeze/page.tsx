"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

interface FreezeRecord {
  id: string;
  member_id: string;
  plan_id: string | null;
  package_type: string;
  freeze_start: string;
  freeze_end: string;
  resumed_at: string | null;
  freeze_days: number;
  reason: string | null;
  status: "active" | "resumed" | "expired" | string;
  created_by: string | null;
  created_at: string;
}

interface PendingRequest {
  id: string;
  member_id: string;
  plan_id: string | null;
  package_type: string;
  requested_start_date: string;
  requested_days: number;
  reason: string | null;
  status: string;
  requested_at: string;
}

interface MemberFreezeData {
  id: string;
  member_name: string;
  email: string;
  phone_number: string;
  package_type: string;
  package_category?: string;
  valid_from?: string | null;
  valid_until?: string | null;
  plan_id: string | null;
  current_status: "Active" | "Frozen" | "Freeze Requested";
  freezes_used: number;
  freeze_remaining: number;
  active_freeze: FreezeRecord | null;
  pending_request: PendingRequest | null;
  freeze_history: FreezeRecord[];
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AdminFreezeManagementPage() {
  const [members, setMembers] = useState<MemberFreezeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"All" | "Active" | "Frozen" | "Freeze Requested">("All");
  const [search, setSearch] = useState("");

  // Modals state
  const [freezeModalMember, setFreezeModalMember] = useState<MemberFreezeData | null>(null);
  const [freezeStep, setFreezeStep] = useState<"confirm" | "form">("confirm");
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [freezeDays, setFreezeDays] = useState<number>(7);
  const [freezeReason, setFreezeReason] = useState<string>("Vacation");
  const [customReason, setCustomReason] = useState<string>("");
  const [submittingFreeze, setSubmittingFreeze] = useState(false);
  const [freezeError, setFreezeError] = useState<string | null>(null);

  const [resumeModalMember, setResumeModalMember] = useState<MemberFreezeData | null>(null);
  const [submittingResume, setSubmittingResume] = useState(false);

  const [historyModalMember, setHistoryModalMember] = useState<MemberFreezeData | null>(null);

  const supabase = createClient();

  const fetchFreezeData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/freeze");
      const data = await res.json();
      if (res.ok && data.members) {
        setMembers(data.members);
      } else {
        console.error("Failed to fetch freeze data:", data.error);
      }
    } catch (e) {
      console.error("Error loading freeze management data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFreezeData();
  }, [fetchFreezeData]);

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (filter === "Active" && m.current_status !== "Active") return false;
      if (filter === "Frozen" && m.current_status !== "Frozen") return false;
      if (filter === "Freeze Requested" && m.current_status !== "Freeze Requested") return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          m.member_name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          m.package_type.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [members, filter, search]);

  const handleOpenFreeze = (member: MemberFreezeData) => {
    setFreezeModalMember(member);
    setFreezeStep("confirm");
    setStartDate(new Date().toISOString().split("T")[0]);
    setFreezeDays(7);
    setFreezeReason("Vacation");
    setCustomReason("");
    setFreezeError(null);
  };

  const handleConfirmDirectFreeze = async () => {
    if (!freezeModalMember) return;

    if (freezeDays < 2 || freezeDays > 15) {
      setFreezeError("Freeze duration must be between 2 and 15 days.");
      return;
    }

    setSubmittingFreeze(true);
    setFreezeError(null);

    const finalReason = freezeReason === "Other" ? customReason : freezeReason;

    try {
      const res = await fetch("/api/admin/freeze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: freezeModalMember.id,
          plan_id: freezeModalMember.plan_id,
          package_type: freezeModalMember.package_type,
          start_date: startDate,
          freeze_days: freezeDays,
          reason: finalReason,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFreezeError(data.error || "Failed to process freeze.");
      } else {
        setFreezeModalMember(null);
        fetchFreezeData();
      }
    } catch (e: any) {
      setFreezeError(e.message || "Failed to process freeze.");
    } finally {
      setSubmittingFreeze(false);
    }
  };

  const handleConfirmResume = async () => {
    if (!resumeModalMember || !resumeModalMember.active_freeze) return;

    setSubmittingResume(true);
    try {
      const res = await fetch("/api/admin/freeze", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeze_id: resumeModalMember.active_freeze.id,
        }),
      });

      if (res.ok) {
        setResumeModalMember(null);
        fetchFreezeData();
      } else {
        const data = await res.json();
        alert("Failed to resume: " + data.error);
      }
    } catch (e: any) {
      alert("Failed to resume: " + e.message);
    } finally {
      setSubmittingResume(false);
    }
  };

  const totalMembersCount = members.length;
  const currentlyFrozenCount = members.filter((m) => m.current_status === "Frozen").length;
  const requestsPendingCount = members.filter((m) => m.current_status === "Freeze Requested").length;

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Top Banner Header */}
      <div className="bg-surface rounded-3xl p-6 border border-line shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-accent/10 text-accent flex items-center justify-center font-bold">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-serif font-bold text-fg">
              Freeze Management
            </h1>
          </div>
          <p className="text-xs text-fg-3 mt-1">
            Manage membership freezes, process freeze requests, and view full freeze history across all package types.
          </p>
        </div>

        {/* Top KPI Metrics Pill Row */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="bg-surface-2 px-4 py-2.5 rounded-2xl border border-line text-center flex-1 md:flex-initial min-w-[100px]">
            <span className="text-[10px] font-bold text-fg-4 uppercase tracking-wider block">Total Members</span>
            <span className="text-lg font-extrabold text-fg">{totalMembersCount}</span>
          </div>

          <div className="bg-blue-50 px-4 py-2.5 rounded-2xl border border-blue-200 text-center flex-1 md:flex-initial min-w-[100px]">
            <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">Currently Frozen</span>
            <span className="text-lg font-extrabold text-blue-900">{currentlyFrozenCount}</span>
          </div>

          <div className="bg-amber-50 px-4 py-2.5 rounded-2xl border border-amber-200 text-center flex-1 md:flex-initial min-w-[100px]">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Requests Pending</span>
            <span className="text-lg font-extrabold text-amber-900">{requestsPendingCount}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-surface-2 rounded-2xl border border-line overflow-x-auto">
          {(["All", "Active", "Frozen", "Freeze Requested"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filter === tab
                  ? "bg-accent text-white shadow-md shadow-accent/20"
                  : "text-fg-3 hover:text-fg hover:bg-surface"
              }`}
            >
              {tab}
              {tab === "Freeze Requested" && members.some((m) => m.current_status === "Freeze Requested") && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-amber-500 text-white rounded-full">
                  {members.filter((m) => m.current_status === "Freeze Requested").length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[280px]">
          <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by member name, email, package..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-surface rounded-2xl border border-line-2 text-xs text-fg placeholder:text-fg-5 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-surface rounded-3xl border border-line shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-fg-4">Loading customer freeze records...</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="py-16 text-center text-fg-4">
            <p className="text-sm font-semibold">No members found</p>
            <p className="text-xs mt-1">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 border-b border-line text-fg-3 uppercase font-bold tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Member Name</th>
                  <th className="py-3.5 px-4">Package Type</th>
                  <th className="py-3.5 px-4">Current Duration</th>
                  <th className="py-3.5 px-4">Current Status</th>
                  <th className="py-3.5 px-4">Freeze Remaining</th>
                  <th className="py-3.5 px-4">Current Freeze Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-2/50 transition-colors">
                    {/* Member Name */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-fg">{m.member_name}</div>
                      <div className="text-[10px] text-fg-4">{m.email}</div>
                    </td>

                    {/* Package Type */}
                    <td className="py-3.5 px-4 font-bold text-fg">
                      {m.package_type === "No package selected" ? (
                        <span className="inline-block px-3 py-1 rounded-lg bg-gray-100 text-gray-500 text-[11px] font-normal italic">
                          No package selected
                        </span>
                      ) : (
                        <span className="inline-block px-3 py-1 rounded-lg bg-surface-2 text-accent border border-accent/20 text-[11px] font-bold">
                          {m.package_type}
                        </span>
                      )}
                    </td>

                    {/* Current Duration */}
                    <td className="py-3.5 px-4 text-fg/80 font-medium">
                      {formatDate(m.valid_from)} &ndash; {formatDate(m.valid_until)}
                    </td>

                    {/* Current Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                          m.current_status === "Active"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : m.current_status === "Frozen"
                            ? "bg-blue-100 text-blue-800 border-blue-200"
                            : "bg-amber-100 text-amber-800 border-amber-200"
                        }`}
                      >
                        {m.current_status}
                      </span>
                    </td>

                    {/* Freeze Remaining */}
                    <td className="py-3.5 px-4 font-bold text-fg">
                      {m.freeze_remaining} / 2
                      <span className="text-[10px] text-fg-5 block font-normal">
                        ({m.freezes_used} used)
                      </span>
                    </td>

                    {/* Current Freeze Status */}
                    <td className="py-3.5 px-4 text-fg">
                      {m.active_freeze ? (
                        <div>
                          <p className="font-bold text-blue-800 text-[11px]">
                            Frozen ({m.active_freeze.freeze_days} days)
                          </p>
                          <p className="text-[10px] text-fg-4">
                            {m.active_freeze.freeze_start} to {m.active_freeze.freeze_end}
                          </p>
                          {m.active_freeze.reason && (
                            <p className="text-[10px] text-fg-3 italic">
                              &quot;{m.active_freeze.reason}&quot;
                            </p>
                          )}
                        </div>
                      ) : m.pending_request ? (
                        <div>
                          <p className="font-bold text-amber-800 text-[11px]">
                            Pending Approval ({m.pending_request.requested_days} days)
                          </p>
                          <p className="text-[10px] text-fg-4">
                            Start: {m.pending_request.requested_start_date}
                          </p>
                        </div>
                      ) : (
                        <span className="text-fg-5 text-[11px]">No Active Freeze</span>
                      )}
                    </td>

                    {/* Action buttons */}
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {m.current_status === "Frozen" ? (
                        <button
                          onClick={() => setResumeModalMember(m)}
                          className="px-3.5 py-1.5 bg-accent hover:bg-accent-2 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                        >
                          Resume
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOpenFreeze(m)}
                          disabled={m.freeze_remaining <= 0 || m.package_type === "No package selected"}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
                            m.freeze_remaining <= 0 || m.package_type === "No package selected"
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                              : "bg-accent hover:bg-accent-2 text-white"
                          }`}
                        >
                          Freeze
                        </button>
                      )}

                      <button
                        onClick={() => setHistoryModalMember(m)}
                        className="px-3.5 py-1.5 border border-accent/20 bg-surface-2 hover:bg-accent/10 text-accent rounded-xl text-xs font-bold transition-all"
                      >
                        View History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── DIRECT FREEZE MODAL ────────────────────────────────────────────── */}
      {freezeModalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-md w-full p-6 space-y-5">
            {freezeStep === "confirm" ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg">
                    !
                  </div>
                  <div>
                    <h3 className="text-base font-serif font-bold text-fg">Freeze Membership</h3>
                    <p className="text-xs text-fg-4">Confirmation required</p>
                  </div>
                </div>

                <p className="text-sm text-fg">
                  Are you sure you want to freeze this membership for{" "}
                  <strong className="text-accent">{freezeModalMember.member_name}</strong>?
                </p>

                <div className="bg-surface-2 p-3.5 rounded-2xl border border-line text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-fg-3">Package Type:</span>
                    <span className="font-bold text-fg">{freezeModalMember.package_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-3">Current Duration:</span>
                    <span className="font-semibold text-fg">
                      {formatDate(freezeModalMember.valid_from)} – {formatDate(freezeModalMember.valid_until)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-3">Freezes Remaining:</span>
                    <span className="font-bold text-accent">{freezeModalMember.freeze_remaining} / 2</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setFreezeModalMember(null)}
                    className="px-4 py-2 border border-line-2 text-fg hover:bg-surface-2 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setFreezeStep("form")}
                    className="px-4 py-2 bg-accent hover:bg-accent-2 text-white rounded-xl text-xs font-bold shadow-xs"
                  >
                    Proceed to Form
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-line pb-3">
                  <h3 className="text-base font-serif font-bold text-fg">
                    Freeze Form: {freezeModalMember.member_name}
                  </h3>
                  <p className="text-xs text-fg-4">
                    Specify freeze parameters (Minimum 2 days, Maximum 15 days).
                  </p>
                </div>

                {freezeError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">
                    {freezeError}
                  </div>
                )}

                <div className="space-y-4 text-xs">
                  {/* Freeze Start Date */}
                  <div>
                    <label className="block font-bold text-fg mb-1">Freeze Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full p-2.5 bg-surface-2 border border-line-2 rounded-xl text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  {/* Number of Freeze Days */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="font-bold text-fg">Number of Freeze Days</label>
                      <span className="font-mono font-bold text-accent text-sm">{freezeDays} days</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="15"
                      value={freezeDays}
                      onChange={(e) => setFreezeDays(parseInt(e.target.value, 10))}
                      className="w-full accent-accent"
                    />
                    <div className="flex justify-between text-[10px] text-fg-4 mt-1 font-medium">
                      <span>2 Days (Min)</span>
                      <span>15 Days (Max)</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[11px] text-fg-3">Custom Value:</span>
                      <input
                        type="number"
                        min="2"
                        max="15"
                        value={freezeDays}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) setFreezeDays(val);
                        }}
                        className="w-20 p-1.5 bg-surface-2 border border-line-2 rounded-lg text-xs font-mono font-bold text-fg text-center"
                      />
                    </div>
                  </div>

                  {/* Freeze Reason */}
                  <div>
                    <label className="block font-bold text-fg mb-1">Freeze Reason (Optional)</label>
                    <select
                      value={freezeReason}
                      onChange={(e) => setFreezeReason(e.target.value)}
                      className="w-full p-2.5 bg-surface-2 border border-line-2 rounded-xl text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="Vacation">Vacation</option>
                      <option value="Medical">Medical</option>
                      <option value="Personal">Personal</option>
                      <option value="Work Travel">Work Travel</option>
                      <option value="Other">Other</option>
                    </select>

                    {freezeReason === "Other" && (
                      <input
                        type="text"
                        placeholder="Please specify custom reason..."
                        value={customReason}
                        onChange={(e) => setCustomReason(e.target.value)}
                        className="w-full mt-2 p-2.5 bg-surface-2 border border-line-2 rounded-xl text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    )}
                  </div>

                  <div className="p-3 bg-surface-2 rounded-xl border border-line text-[11px] text-fg-3">
                    ℹ️ Freeze fee: <strong className="text-accent">₹0 (Free)</strong>. Membership will be frozen immediately upon confirmation.
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                  <button
                    onClick={() => setFreezeStep("confirm")}
                    className="px-4 py-2 border border-line-2 text-fg hover:bg-surface-2 rounded-xl text-xs font-semibold"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleConfirmDirectFreeze}
                    disabled={submittingFreeze}
                    className="px-4 py-2 bg-accent hover:bg-accent-2 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2"
                  >
                    {submittingFreeze ? "Freezing..." : "Confirm & Freeze"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── RESUME CONFIRMATION MODAL ─────────────────────────────────────────── */}
      {resumeModalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-lg">
                ✓
              </div>
              <div>
                <h3 className="text-base font-serif font-bold text-fg">Resume Membership</h3>
                <p className="text-xs text-fg-4">End active freeze</p>
              </div>
            </div>

            <p className="text-sm text-fg">
              Are you sure you want to resume membership for{" "}
              <strong className="text-accent">{resumeModalMember.member_name}</strong> immediately?
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
              <p className="font-bold">Important Business Rule:</p>
              <p>
                Remaining unused freeze days will <strong>NOT</strong> be credited back or added to the membership expiration date. They are permanently lost.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                onClick={() => setResumeModalMember(null)}
                className="px-4 py-2 border border-line-2 text-fg hover:bg-surface-2 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmResume}
                disabled={submittingResume}
                className="px-4 py-2 bg-accent hover:bg-accent-2 text-white rounded-xl text-xs font-bold shadow-xs"
              >
                {submittingResume ? "Resuming..." : "Confirm & Resume"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── FREEZE HISTORY MODAL ──────────────────────────────────────────────── */}
      {historyModalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-serif font-bold text-fg">
                  Freeze History: {historyModalMember.member_name}
                </h3>
                <p className="text-xs text-fg-4">
                  Permanent record of all membership freezes
                </p>
              </div>
              <button
                onClick={() => setHistoryModalMember(null)}
                className="p-1.5 rounded-xl border border-line-2 hover:bg-surface-2 text-fg"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {historyModalMember.freeze_history.length === 0 ? (
                <p className="text-center py-8 text-xs text-fg-4">
                  No past freeze history found for this member.
                </p>
              ) : (
                historyModalMember.freeze_history.map((f) => (
                  <div
                    key={f.id}
                    className="p-4 bg-surface-2 rounded-2xl border border-line text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-fg">{f.package_type}</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          f.status === "active"
                            ? "bg-blue-100 text-blue-800"
                            : f.status === "resumed"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {f.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-fg">
                      <div>
                        <span className="text-fg-4 block">Start Date</span>
                        <span className="font-semibold">{f.freeze_start}</span>
                      </div>
                      <div>
                        <span className="text-fg-4 block">End Date</span>
                        <span className="font-semibold">{f.freeze_end}</span>
                      </div>
                      <div>
                        <span className="text-fg-4 block">Duration</span>
                        <span className="font-semibold">{f.freeze_days} Days</span>
                      </div>
                      <div>
                        <span className="text-fg-4 block">Resume Date</span>
                        <span className="font-semibold">
                          {f.resumed_at ? new Date(f.resumed_at).toLocaleDateString("en-IN") : "N/A (Normal Exp)"}
                        </span>
                      </div>
                    </div>

                    {f.reason && (
                      <p className="text-[11px] text-fg-3 pt-1 border-t border-line">
                        <strong>Reason:</strong> {f.reason}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-line text-right">
              <button
                onClick={() => setHistoryModalMember(null)}
                className="px-5 py-2 bg-accent text-white text-xs font-bold rounded-xl hover:bg-accent-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
