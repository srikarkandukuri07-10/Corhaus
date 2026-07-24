"use client";

import { useEffect, useState, useCallback } from "react";

interface FreezeRecord {
  id: string;
  package_type: string;
  freeze_start: string;
  freeze_end: string;
  resumed_at: string | null;
  freeze_days: number;
  reason: string | null;
  status: string;
  created_at: string;
}

interface PendingRequest {
  id: string;
  package_type: string;
  requested_start_date: string;
  requested_days: number;
  reason: string | null;
  status: string;
  requested_at: string;
}

interface FreezeData {
  member_name: string;
  membership_plan: string;
  package_type: string;
  freeze_remaining: number;
  freezes_used: number;
  freeze_status: "active" | "frozen" | "freeze_requested";
  active_freeze: FreezeRecord | null;
  pending_request: PendingRequest | null;
  latest_rejected: PendingRequest | null;
  history: FreezeRecord[];
}

export default function MembershipFreezeSection() {
  const [data, setData] = useState<FreezeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Form state
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [days, setDays] = useState<number>(7);
  const [reason, setReason] = useState<string>("Vacation");
  const [customReason, setCustomReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  const fetchMemberFreezeData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/member/freeze");
      const json = await res.json();
      if (res.ok) {
        setData(json);
      }
    } catch (e) {
      console.error("Error fetching member freeze status:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemberFreezeData();
  }, [fetchMemberFreezeData]);

  const handleOpenRequest = () => {
    setStartDate(new Date().toISOString().split("T")[0]);
    setDays(7);
    setReason("Vacation");
    setCustomReason("");
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowRequestModal(true);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (days < 2 || days > 15) {
      setErrorMessage("Freeze duration must be between 2 and 15 days.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const finalReason = reason === "Other" ? customReason : reason;

    try {
      const res = await fetch("/api/member/freeze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          days,
          reason: finalReason,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErrorMessage(json.error || "Failed to submit request.");
      } else {
        setSuccessMessage(json.message || "Your freeze request has been sent to Corhaus staff for approval.");
        setTimeout(async () => {
          setShowRequestModal(false);
          await fetchMemberFreezeData();
        }, 1500);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred submitting your request.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResumeEarly = async () => {
    if (!confirm("Are you sure you want to resume your membership immediately? Unused freeze days will not be credited back.")) {
      return;
    }

    setResuming(true);
    try {
      const res = await fetch("/api/member/freeze", { method: "PATCH" });
      const json = await res.json();
      if (res.ok) {
        alert(json.message || "Your membership is now active!");
        await fetchMemberFreezeData();
      } else {
        alert(json.error || "Failed to resume membership.");
      }
    } catch (e) {
      console.error("Resume error:", e);
    } finally {
      setResuming(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-brand-sand/50 p-6 shadow-xs animate-pulse">
        <div className="h-5 w-48 bg-brand-sand/40 rounded mb-3" />
        <div className="h-4 w-64 bg-brand-sand/20 rounded" />
      </div>
    );
  }

  if (!data) return null;

  const isFrozen = data.freeze_status === "frozen" || !!data.active_freeze;
  const isPending = !!data.pending_request;
  const noFreezesLeft = data.freeze_remaining <= 0;

  return (
    <div className="bg-white rounded-2xl border border-brand-sand/50 p-6 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-sand/40 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-brand-cream rounded-lg text-brand-brown">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
            <h2 className="font-serif text-xl font-bold text-brand-navy">Membership Freeze</h2>
          </div>
          <p className="text-xs text-brand-navy/60 mt-0.5">
            Freeze your membership when travelling or taking time off (Max 2 freezes per membership).
          </p>
        </div>

        <button
          onClick={() => setShowHistoryModal(true)}
          className="self-start sm:self-auto px-3.5 py-1.5 border border-brand-sand bg-brand-cream/50 hover:bg-brand-cream text-brand-navy rounded-xl text-xs font-medium transition-all"
        >
          View Freeze History ({data.history.length})
        </button>
      </div>

      {/* Grid Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Current Membership Info */}
        <div className="p-4 bg-brand-cream/40 rounded-xl border border-brand-sand/30 space-y-2">
          <span className="text-[10px] uppercase font-bold text-brand-navy/50 tracking-wider">
            Current Membership
          </span>
          <div className="flex items-baseline justify-between">
            <p className="text-base font-bold text-brand-navy">{data.membership_plan}</p>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-sand/40 text-brand-navy">
              {data.package_type}
            </span>
          </div>
          <div className="pt-2 border-t border-brand-sand/30 flex items-center justify-between text-xs">
            <span className="text-brand-navy/60">Membership Status:</span>
            <span
              className={`font-bold capitalize px-2 py-0.5 rounded-md ${
                isFrozen
                  ? "bg-blue-100 text-blue-800"
                  : isPending
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {isFrozen ? "Frozen" : isPending ? "Freeze Requested" : "Active"}
            </span>
          </div>
        </div>

        {/* Card 2: Freeze Remaining */}
        <div className="p-4 bg-brand-cream/40 rounded-xl border border-brand-sand/30 space-y-2">
          <span className="text-[10px] uppercase font-bold text-brand-navy/50 tracking-wider">
            Freeze Remaining
          </span>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-mono font-bold text-brand-navy">
              {data.freeze_remaining} / 2
            </p>
            <span className="text-xs text-brand-navy/60 font-medium">
              {data.freezes_used} used of 2 max
            </span>
          </div>
          <p className="text-[11px] text-brand-navy/60 pt-1 border-t border-brand-sand/30">
            {noFreezesLeft
              ? "You have used all available freezes for your current membership."
              : `Each freeze can be 2 to 15 days.`}
          </p>
        </div>
      </div>

      {/* Banner Messages */}
      {isFrozen && data.active_freeze && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
              <span>❄️ Membership Currently Frozen</span>
            </div>
            <button
              onClick={handleResumeEarly}
              disabled={resuming}
              className="px-3.5 py-1.5 bg-brand-navy hover:bg-brand-navy/90 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
            >
              {resuming ? "Resuming..." : "Resume Membership Early"}
            </button>
          </div>
          <p className="text-xs text-blue-800">
            Frozen from <strong>{data.active_freeze.freeze_start}</strong> until{" "}
            <strong>{data.active_freeze.freeze_end}</strong> ({data.active_freeze.freeze_days} days).
            {data.active_freeze.reason && <span> Reason: "{data.active_freeze.reason}"</span>}
          </p>
          <p className="text-[10px] text-blue-700 italic">
            Note: Resuming early ends your freeze immediately. Remaining unused days are permanently lost.
          </p>
        </div>
      )}

      {isPending && data.pending_request && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1">
          <p className="font-bold text-sm flex items-center gap-1.5">
            ⏳ Your freeze request is awaiting approval.
          </p>
          <p>
            Requested <strong>{data.pending_request.requested_days} days</strong> starting on{" "}
            <strong>{data.pending_request.requested_start_date}</strong>. Corhaus staff will review your request shortly.
          </p>
        </div>
      )}

      {!isPending && !isFrozen && data.latest_rejected && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
          ⚠️ Your previous freeze request was not approved.
        </div>
      )}

      {/* Request Button or Exhausted Notice */}
      <div className="pt-2">
        {isFrozen ? null : isPending ? (
          <button
            disabled
            className="w-full py-3 bg-brand-sand/40 text-brand-navy/50 rounded-xl text-xs font-semibold cursor-not-allowed border border-brand-sand/60"
          >
            Your freeze request is awaiting approval.
          </button>
        ) : noFreezesLeft ? (
          <div className="p-3 bg-brand-cream/60 border border-brand-sand/40 rounded-xl text-center text-xs text-brand-navy/60 font-medium">
            You have used all available freezes for your current membership.
          </div>
        ) : (
          <button
            onClick={handleOpenRequest}
            className="w-full py-3 bg-[#B89368] hover:bg-[#A37F55] text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Request Membership Freeze
          </button>
        )}
      </div>

      {/* ─── MEMBER REQUEST MODAL ────────────────────────────────────────────── */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-brand-sand/50 shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-brand-sand/50 pb-3">
              <div>
                <h3 className="font-serif text-lg font-bold text-brand-navy">Request Membership Freeze</h3>
                <p className="text-xs text-brand-navy/60">Choose your start date and duration (2-15 days)</p>
              </div>
              <button
                onClick={() => setShowRequestModal(false)}
                className="p-1 rounded-lg border border-brand-sand text-brand-navy/60 hover:text-brand-navy"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                ✓ {successMessage}
              </div>
            )}

            <form onSubmit={handleSubmitRequest} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-brand-navy mb-1">Preferred Freeze Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full p-2.5 bg-brand-cream/50 border border-brand-sand rounded-xl text-xs text-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-brown"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-bold text-brand-navy">Number of Days</label>
                  <span className="font-mono font-bold text-brand-brown text-sm">{days} days</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="15"
                  value={days}
                  onChange={(e) => setDays(parseInt(e.target.value, 10))}
                  className="w-full accent-brand-brown"
                />
                <div className="flex justify-between text-[10px] text-brand-navy/50 mt-1">
                  <span>2 Days</span>
                  <span>15 Days</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-brand-navy mb-1">Reason (Optional)</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full p-2.5 bg-brand-cream/50 border border-brand-sand rounded-xl text-xs text-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-brown"
                >
                  <option value="Vacation">Vacation</option>
                  <option value="Medical">Medical</option>
                  <option value="Personal">Personal</option>
                  <option value="Work Travel">Work Travel</option>
                  <option value="Other">Other</option>
                </select>

                {reason === "Other" && (
                  <input
                    type="text"
                    placeholder="Enter reason..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="w-full mt-2 p-2.5 bg-brand-cream/50 border border-brand-sand rounded-xl text-xs text-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-brown"
                  />
                )}
              </div>

              <div className="p-3 bg-brand-cream/60 rounded-xl border border-brand-sand/40 text-[11px] text-brand-navy/60">
                ℹ️ Your request will be sent to Corhaus staff for approval. There is no fee for requesting a freeze.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-brand-sand/50">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 border border-brand-sand text-brand-navy rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-brand-navy hover:bg-brand-navy/90 text-white rounded-xl text-xs font-semibold shadow-sm"
                >
                  {submitting ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── FREEZE HISTORY MODAL ──────────────────────────────────────────────── */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-brand-sand/50 shadow-xl max-w-xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-brand-sand/50 pb-3">
              <div>
                <h3 className="font-serif text-lg font-bold text-brand-navy">Freeze History</h3>
                <p className="text-xs text-brand-navy/60">Your past membership freezes</p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-1 rounded-lg border border-brand-sand text-brand-navy/60 hover:text-brand-navy"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {data.history.length === 0 ? (
                <p className="text-center py-8 text-xs text-brand-navy/50">
                  You have no past freeze records.
                </p>
              ) : (
                data.history.map((f) => (
                  <div
                    key={f.id}
                    className="p-4 bg-brand-cream/40 rounded-xl border border-brand-sand/40 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-brand-navy">{f.package_type}</span>
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

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-brand-navy/80 pt-1">
                      <div>
                        <span className="text-brand-navy/50 block">Period</span>
                        <span className="font-semibold">{f.freeze_start} to {f.freeze_end}</span>
                      </div>
                      <div>
                        <span className="text-brand-navy/50 block">Duration</span>
                        <span className="font-semibold">{f.freeze_days} Days</span>
                      </div>
                      <div>
                        <span className="text-brand-navy/50 block">Resumed Early</span>
                        <span className="font-semibold">
                          {f.resumed_at ? new Date(f.resumed_at).toLocaleDateString("en-IN") : "No"}
                        </span>
                      </div>
                    </div>

                    {f.reason && (
                      <p className="text-[11px] text-brand-navy/60 pt-1 border-t border-brand-sand/30">
                        <strong>Reason:</strong> {f.reason}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-brand-sand/50 text-right">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-brand-navy text-white text-xs font-semibold rounded-xl"
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
