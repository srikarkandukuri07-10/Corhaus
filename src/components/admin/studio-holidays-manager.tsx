"use client";

import { useEffect, useState, useCallback } from "react";

interface StudioHoliday {
  id: string;
  start_date: string;
  end_date: string;
  title: string;
  message: string;
  is_active: boolean;
  notify_members: boolean;
  created_by?: string | null;
  created_at: string;
}

export default function StudioHolidaysManager() {
  const [holidays, setHolidays] = useState<StudioHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form fields
  const [quickDays, setQuickDays] = useState<1 | 2 | 3 | "custom">(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [notifyMembers, setNotifyMembers] = useState(true);
  const [cancelClasses, setCancelClasses] = useState(true);

  // Calculate default dates
  const initTomorrow = useCallback((daysCount: number) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const startStr = d.toISOString().split("T")[0];

    const endD = new Date(d);
    endD.setDate(endD.getDate() + (daysCount - 1));
    const endStr = endD.toISOString().split("T")[0];

    setStartDate(startStr);
    setEndDate(endStr);
  }, []);

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/holidays", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setHolidays(data.holidays || []);
      }
    } catch (e) {
      console.warn("Failed to fetch holidays:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHolidays();
    initTomorrow(1);
  }, [fetchHolidays, initTomorrow]);

  const handleQuickDaysSelect = (days: 1 | 2 | 3 | "custom") => {
    setQuickDays(days);
    if (days !== "custom") {
      initTomorrow(days);
      if (!title) {
        setTitle(days === 1 ? "Studio Holiday" : `${days}-Day Studio Closure`);
      }
      if (!message) {
        setMessage(`The studio will remain closed for ${days} day${days > 1 ? "s" : ""}. Scheduled classes are paused.`);
      }
    }
  };

  const handleOpenModal = () => {
    setFeedback(null);
    setQuickDays(1);
    initTomorrow(1);
    setTitle("Studio Holiday");
    setMessage("The studio will remain closed. All scheduled classes are paused.");
    setNotifyMembers(true);
    setCancelClasses(true);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate || !title.trim()) {
      setFeedback({ type: "error", text: "Please enter start date, end date, and title." });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate,
          title: title.trim(),
          message: message.trim(),
          notify_members: notifyMembers,
          cancel_scheduled_classes: cancelClasses,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setFeedback({ type: "error", text: data.error || "Failed to declare holiday." });
      } else {
        setShowModal(false);
        const cancelMsg = data.cancelledClassesCount > 0 ? ` (${data.cancelledClassesCount} scheduled classes cancelled)` : "";
        setFeedback({
          type: "success",
          text: `Holiday declared successfully! Member notification broadcast sent${cancelMsg}.`,
        });
        await fetchHolidays();
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Network error." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this studio holiday?")) return;
    try {
      const res = await fetch(`/api/admin/holidays?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setHolidays((prev) => prev.filter((h) => h.id !== id));
      }
    } catch (e) {
      console.warn("Delete holiday error:", e);
    }
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header Card */}
      <div className="bg-surface rounded-3xl border border-line p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🏖️</span>
            <h2 className="text-xl font-extrabold text-fg">Studio Holidays & Closures</h2>
          </div>
          <p className="text-xs text-fg-3 mt-1 leading-relaxed max-w-xl">
            Declare sudden studio holidays for 1, 2, or 3 days. Members receive an instant app push notification and see a prominent red closure banner when opening the app.
          </p>
        </div>

        <button
          onClick={handleOpenModal}
          className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <span>🚨</span>
          <span>Declare Studio Holiday</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 border ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600"
              : "bg-red-500/10 border-red-500/25 text-red-600"
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="font-bold p-1">✕</button>
        </div>
      )}

      {/* Holiday Records List */}
      <div className="bg-surface rounded-3xl border border-line p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-fg uppercase tracking-wider">Scheduled & Past Holidays</h3>

        {loading ? (
          <div className="py-12 text-center text-xs text-fg-4 space-y-2">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
            <p>Loading studio holidays...</p>
          </div>
        ) : holidays.length === 0 ? (
          <div className="py-12 text-center text-xs text-fg-4 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto text-xl">
              🏖️
            </div>
            <p className="font-semibold text-fg">No studio holidays declared</p>
            <p className="text-[11px] text-fg-4 max-w-sm mx-auto">
              Click &quot;Declare Studio Holiday&quot; if the studio needs to close for maintenance, public holidays, or unforeseen events.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line/60">
            {holidays.map((h) => {
              const isOngoingOrUpcoming = h.end_date >= today;

              return (
                <div key={h.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-fg">{h.title}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isOngoingOrUpcoming
                            ? "bg-red-500/10 text-red-500 border-red-500/25"
                            : "bg-surface-2 text-fg-4 border-line"
                        }`}
                      >
                        {isOngoingOrUpcoming ? "ACTIVE / UPCOMING" : "PAST"}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-fg-3">
                      📅 {h.start_date === h.end_date ? h.start_date : `${h.start_date} to ${h.end_date}`}
                    </p>

                    <p className="text-xs text-fg-4 leading-relaxed">{h.message}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleDelete(h.id)}
                      className="px-3 py-1.5 rounded-xl border border-line hover:bg-red-500/10 hover:text-red-600 text-fg-4 font-semibold text-xs transition-colors"
                      title="Remove holiday"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Declare Holiday Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-line rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl relative space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚨</span>
                <h3 className="text-base font-extrabold text-fg">Declare Studio Holiday</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-fg-4 hover:text-fg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* Quick Duration Buttons */}
              <div>
                <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-2">
                  Duration Preset
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "1 Day (Tomorrow)", value: 1 },
                    { label: "2 Days", value: 2 },
                    { label: "3 Days", value: 3 },
                    { label: "Custom Dates", value: "custom" },
                  ].map((btn) => (
                    <button
                      key={btn.value}
                      type="button"
                      onClick={() => handleQuickDaysSelect(btn.value as any)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold text-center border transition-all ${
                        quickDays === btn.value
                          ? "bg-red-600 text-white border-red-600 shadow-xs"
                          : "bg-surface-2 text-fg border-line hover:bg-hover"
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start & End Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setQuickDays("custom");
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none font-sans"
                  />
                </div>
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    min={startDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setQuickDays("custom");
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none font-sans"
                  />
                </div>
              </div>

              {/* Title / Reason */}
              <div>
                <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                  Holiday Title / Reason
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Studio Maintenance, Public Holiday, Emergency Closure"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none"
                />
              </div>

              {/* Message */}
              <div>
                <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                  Message for Members (Red Banner Text)
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain the closure details and when normal classes will resume..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Options Checkboxes */}
              <div className="space-y-2 pt-2 border-t border-line">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={notifyMembers}
                    onChange={(e) => setNotifyMembers(e.target.checked)}
                    className="w-4 h-4 rounded text-red-600 accent-red-600"
                  />
                  <span className="font-bold text-fg">
                    📢 Broadcast Push Notification to all members immediately
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={cancelClasses}
                    onChange={(e) => setCancelClasses(e.target.checked)}
                    className="w-4 h-4 rounded text-red-600 accent-red-600"
                  />
                  <span className="font-bold text-fg">
                    🛑 Automatically cancel already-scheduled classes on these dates
                  </span>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-line text-fg font-bold hover:bg-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all shadow-md disabled:opacity-50"
                >
                  {submitting ? "Declaring Holiday..." : "Declare & Broadcast Notice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
