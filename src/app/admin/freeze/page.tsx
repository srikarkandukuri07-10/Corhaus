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
  plan_id: string | null;
  current_status: "Active" | "Frozen" | "Freeze Requested";
  freezes_used: number;
  freeze_remaining: number;
  active_freeze: FreezeRecord | null;
  pending_request: PendingRequest | null;
  freeze_history: FreezeRecord[];
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
          memberId: freezeModalMember.id,
          planId: freezeModalMember.plan_id,
          freezeStart: startDate,
          freezeDays,
          reason: finalReason,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setFreezeError(json.error || "Failed to process freeze.");
      } else {
        setFreezeModalMember(null);
        await fetchFreezeData();
      }
    } catch (e: any) {
      setFreezeError(e.message || "An unexpected error occurred.");
    } finally {
      setSubmittingFreeze(false);
    }
  };

  const handleConfirmResume = async () => {
    if (!resumeModalMember) return;
    setSubmittingResume(true);

    try {
      const res = await fetch("/api/admin/freeze/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: resumeModalMember.id,
          planId: resumeModalMember.plan_id,
          freezeId: resumeModalMember.active_freeze?.id,
        }),
      });

      if (res.ok) {
        setResumeModalMember(null);
        await fetchFreezeData();
      } else {
        const json = await res.json();
        alert(json.error || "Failed to resume membership.");
      }
    } catch (e) {
      console.error("Resume error:", e);
    } finally {
      setSubmittingResume(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-[#E5DDD0] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 bg-[#F4EFE6] rounded-xl text-[#B89368]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
            <h1 className="text-2xl font-serif font-bold text-[#362B24]">Freeze Management</h1>
          </div>
          <p className="text-xs text-[#8C7A6B]">
            Manage membership freezes, process freeze requests, and view full freeze history across all package types.
          </p>
        </div>

        {/* Stats summary */}
        <div className="flex items-center gap-3">
          <div className="bg-[#FAF7F2] border border-[#E5DDD0] rounded-xl px-4 py-2 text-center">
            <span className="text-[10px] uppercase font-bold text-[#8C7A6B]">Total Members</span>
            <p className="text-lg font-bold text-[#4A3B32]">{members.length}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-center">
            <span className="text-[10px] uppercase font-bold text-blue-700">Currently Frozen</span>
            <p className="text-lg font-bold text-blue-900">
              {members.filter((m) => m.current_status === "Frozen").length}
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-center">
            <span className="text-[10px] uppercase font-bold text-amber-700">Requests Pending</span>
            <p className="text-lg font-bold text-amber-900">
              {members.filter((m) => m.current_status === "Freeze Requested").length}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-[#F4EFE6] rounded-xl border border-[#E5DDD0] overflow-x-auto">
          {(["All", "Active", "Frozen", "Freeze Requested"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                filter === tab
                  ? "bg-[#4A3B32] text-white shadow-sm"
                  : "text-[#4A3B32]/70 hover:text-[#4A3B32] hover:bg-[#EAE2D5]"
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
        <div className="relative min-w-[260px]">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#4A3B32]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by member name, email, package..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white rounded-xl border border-[#E5DDD0] text-xs text-[#4A3B32] placeholder:text-[#4A3B32]/40 focus:outline-none focus:ring-1 focus:ring-[#B89368]"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-2 border-[#B89368]/30 border-t-[#B89368] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-[#8C7A6B]">Loading customer freeze records...</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="py-16 text-center text-[#8C7A6B]">
            <p className="text-sm font-medium">No members found</p>
            <p className="text-xs mt-1 text-[#8C7A6B]/70">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF7F2] border-b border-[#E5DDD0] text-[#8C7A6B] uppercase font-bold tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Member Name</th>
                  <th className="py-3.5 px-4">Package Type</th>
                  <th className="py-3.5 px-4">Current Status</th>
                  <th className="py-3.5 px-4">Freeze Remaining</th>
                  <th className="py-3.5 px-4">Current Freeze Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DDD0]/60">
                {filteredMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-[#FAF7F2]/50 transition-colors">
                    {/* Member Name */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[#362B24]">{m.member_name}</div>
                      <div className="text-[10px] text-[#8C7A6B]">{m.email}</div>
                    </td>

                    {/* Package Type (Exact package name matching View Members) */}
                    <td className="py-3.5 px-4 font-semibold text-[#4A3B32]">
                      <span className="inline-block px-3 py-1 rounded-md bg-[#F4EFE6] text-[#4A3B32] text-[11px] font-bold">
                        {m.package_type}
                      </span>
                    </td>

                    {/* Current Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${
                          m.current_status === "Active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : m.current_status === "Frozen"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {m.current_status}
                      </span>
                    </td>

                    {/* Freeze Remaining */}
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-[#4A3B32]">
                        {m.freeze_remaining} / 2
                      </span>
                      <span className="text-[10px] text-[#8C7A6B] block">
                        ({m.freezes_used} used)
                      </span>
                    </td>

                    {/* Current Freeze Status */}
                    <td className="py-3.5 px-4 text-[#4A3B32]">
                      {m.active_freeze ? (
                        <div>
                          <p className="font-semibold text-blue-800 text-[11px]">
                            Frozen ({m.active_freeze.freeze_days} days)
                          </p>
                          <p className="text-[10px] text-[#8C7A6B]">
                            {m.active_freeze.freeze_start} to {m.active_freeze.freeze_end}
                          </p>
                          {m.active_freeze.reason && (
                            <p className="text-[10px] text-[#8C7A6B]/80 italic">
                              "{m.active_freeze.reason}"
                            </p>
                          )}
                        </div>
                      ) : m.pending_request ? (
                        <div>
                          <p className="font-semibold text-amber-800 text-[11px]">
                            Pending Approval ({m.pending_request.requested_days} days)
                          </p>
                          <p className="text-[10px] text-[#8C7A6B]">
                            Start: {m.pending_request.requested_start_date}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[#8C7A6B] text-[11px]">No Active Freeze</span>
                      )}
                    </td>

                    {/* Action buttons */}
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {m.current_status === "Frozen" ? (
                        <button
                          onClick={() => setResumeModalMember(m)}
                          className="px-3 py-1.5 bg-[#4A3B32] hover:bg-[#362B24] text-white rounded-lg text-xs font-semibold transition-all shadow-sm"
                        >
                          Resume
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOpenFreeze(m)}
                          disabled={m.freeze_remaining <= 0}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                            m.freeze_remaining <= 0
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                              : "bg-[#B89368] hover:bg-[#A37F55] text-white"
                          }`}
                        >
                          Freeze
                        </button>
                      )}

                      <button
                        onClick={() => setHistoryModalMember(m)}
                        className="px-3 py-1.5 border border-[#E5DDD0] bg-[#FAF7F2] hover:bg-[#F4EFE6] text-[#4A3B32] rounded-lg text-xs font-medium transition-all"
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
          <div className="bg-white rounded-2xl border border-[#E5DDD0] shadow-xl max-w-md w-full p-6 space-y-5">
            {freezeStep === "confirm" ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg">
                    !
                  </div>
                  <div>
                    <h3 className="text-base font-serif font-bold text-[#362B24]">Freeze Membership</h3>
                    <p className="text-xs text-[#8C7A6B]">Confirmation required</p>
                  </div>
                </div>

                <p className="text-sm text-[#4A3B32]">
                  Are you sure you want to freeze this membership for{" "}
                  <strong className="text-[#362B24]">{freezeModalMember.member_name}</strong>?
                </p>

                <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E5DDD0] text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#8C7A6B]">Package Type:</span>
                    <span className="font-semibold text-[#4A3B32]">{freezeModalMember.package_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8C7A6B]">Freezes Remaining:</span>
                    <span className="font-semibold text-[#4A3B32]">{freezeModalMember.freeze_remaining} / 2</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setFreezeModalMember(null)}
                    className="px-4 py-2 border border-[#E5DDD0] text-[#4A3B32] hover:bg-[#FAF7F2] rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setFreezeStep("form")}
                    className="px-4 py-2 bg-[#B89368] hover:bg-[#A37F55] text-white rounded-xl text-xs font-semibold shadow-sm"
                  >
                    Proceed to Form
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-[#E5DDD0] pb-3">
                  <h3 className="text-base font-serif font-bold text-[#362B24]">
                    Freeze Form: {freezeModalMember.member_name}
                  </h3>
                  <p className="text-xs text-[#8C7A6B]">
                    Specify freeze parameters (Minimum 2 days, Maximum 15 days).
                  </p>
                </div>

                {freezeError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                    {freezeError}
                  </div>
                )}

                <div className="space-y-4 text-xs">
                  {/* Freeze Start Date */}
                  <div>
                    <label className="block font-bold text-[#4A3B32] mb-1">Freeze Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full p-2.5 bg-[#FAF7F2] border border-[#E5DDD0] rounded-xl text-xs text-[#4A3B32] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
                    />
                  </div>

                  {/* Number of Freeze Days */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="font-bold text-[#4A3B32]">Number of Freeze Days</label>
                      <span className="font-mono font-bold text-[#B89368] text-sm">{freezeDays} days</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="15"
                      value={freezeDays}
                      onChange={(e) => setFreezeDays(parseInt(e.target.value, 10))}
                      className="w-full accent-[#B89368]"
                    />
                    <div className="flex justify-between text-[10px] text-[#8C7A6B] mt-1">
                      <span>2 Days (Min)</span>
                      <span>15 Days (Max)</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[11px] text-[#8C7A6B]">Custom Value:</span>
                      <input
                        type="number"
                        min="2"
                        max="15"
                        value={freezeDays}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) setFreezeDays(val);
                        }}
                        className="w-20 p-1.5 bg-[#FAF7F2] border border-[#E5DDD0] rounded-lg text-xs font-mono font-bold text-[#4A3B32] text-center"
                      />
                    </div>
                  </div>

                  {/* Freeze Reason */}
                  <div>
                    <label className="block font-bold text-[#4A3B32] mb-1">Freeze Reason (Optional)</label>
                    <select
                      value={freezeReason}
                      onChange={(e) => setFreezeReason(e.target.value)}
                      className="w-full p-2.5 bg-[#FAF7F2] border border-[#E5DDD0] rounded-xl text-xs text-[#4A3B32] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
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
                        className="w-full mt-2 p-2.5 bg-[#FAF7F2] border border-[#E5DDD0] rounded-xl text-xs text-[#4A3B32] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
                      />
                    )}
                  </div>

                  <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E5DDD0] text-[11px] text-[#8C7A6B]">
                    ℹ️ Freeze fee: <strong className="text-[#4A3B32]">₹0 (Free)</strong>. Membership will be frozen immediately upon confirmation.
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5DDD0]">
                  <button
                    onClick={() => setFreezeStep("confirm")}
                    className="px-4 py-2 border border-[#E5DDD0] text-[#4A3B32] hover:bg-[#FAF7F2] rounded-xl text-xs font-semibold"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleConfirmDirectFreeze}
                    disabled={submittingFreeze}
                    className="px-4 py-2 bg-[#4A3B32] hover:bg-[#362B24] text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-2"
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
          <div className="bg-white rounded-2xl border border-[#E5DDD0] shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-lg">
                ✓
              </div>
              <div>
                <h3 className="text-base font-serif font-bold text-[#362B24]">Resume Membership</h3>
                <p className="text-xs text-[#8C7A6B]">End active freeze</p>
              </div>
            </div>

            <p className="text-sm text-[#4A3B32]">
              Are you sure you want to resume membership for{" "}
              <strong className="text-[#362B24]">{resumeModalMember.member_name}</strong> immediately?
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
              <p className="font-bold">Important Business Rule:</p>
              <p>
                Remaining unused freeze days will <strong>NOT</strong> be credited back or added to the membership expiration date. They are permanently lost.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5DDD0]">
              <button
                onClick={() => setResumeModalMember(null)}
                className="px-4 py-2 border border-[#E5DDD0] text-[#4A3B32] hover:bg-[#FAF7F2] rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmResume}
                disabled={submittingResume}
                className="px-4 py-2 bg-[#4A3B32] hover:bg-[#362B24] text-white rounded-xl text-xs font-semibold shadow-sm"
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
          <div className="bg-white rounded-2xl border border-[#E5DDD0] shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#E5DDD0] pb-3">
              <div>
                <h3 className="text-base font-serif font-bold text-[#362B24]">
                  Freeze History: {historyModalMember.member_name}
                </h3>
                <p className="text-xs text-[#8C7A6B]">
                  Permanent record of all membership freezes
                </p>
              </div>
              <button
                onClick={() => setHistoryModalMember(null)}
                className="p-1 rounded-lg border border-[#E5DDD0] hover:bg-[#FAF7F2] text-[#4A3B32]"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {historyModalMember.freeze_history.length === 0 ? (
                <p className="text-center py-8 text-xs text-[#8C7A6B]">
                  No past freeze history found for this member.
                </p>
              ) : (
                historyModalMember.freeze_history.map((f) => (
                  <div
                    key={f.id}
                    className="p-4 bg-[#FAF7F2] rounded-xl border border-[#E5DDD0] text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#4A3B32]">{f.package_type}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
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

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-[#4A3B32]">
                      <div>
                        <span className="text-[#8C7A6B] block">Start Date</span>
                        <span className="font-semibold">{f.freeze_start}</span>
                      </div>
                      <div>
                        <span className="text-[#8C7A6B] block">End Date</span>
                        <span className="font-semibold">{f.freeze_end}</span>
                      </div>
                      <div>
                        <span className="text-[#8C7A6B] block">Duration</span>
                        <span className="font-semibold">{f.freeze_days} Days</span>
                      </div>
                      <div>
                        <span className="text-[#8C7A6B] block">Resume Date</span>
                        <span className="font-semibold">
                          {f.resumed_at ? new Date(f.resumed_at).toLocaleDateString("en-IN") : "N/A (Normal Exp)"}
                        </span>
                      </div>
                    </div>

                    {f.reason && (
                      <p className="text-[11px] text-[#8C7A6B] pt-1 border-t border-[#E5DDD0]/60">
                        <strong>Reason:</strong> {f.reason}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#E5DDD0] text-right">
              <button
                onClick={() => setHistoryModalMember(null)}
                className="px-4 py-2 bg-[#4A3B32] text-white text-xs font-semibold rounded-xl"
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
