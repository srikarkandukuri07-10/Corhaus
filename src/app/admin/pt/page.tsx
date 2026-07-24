"use client";

import { useEffect, useState, useCallback, useMemo, useTransition } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";

function Modal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface MemberOption {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  ptPlans: {
    id: string;
    plan_name: string;
    sessions_remaining: number;
    sessions_total: number;
    status: string;
  }[];
}

interface PtAssignment {
  id: string;
  member_id: string;
  trainer_name: string;
  start_date: string;
  duration_minutes: number;
  start_time: string;
  recurring_days: number[];
  approved_members?: {
    full_name: string;
    email: string;
    phone_number: string;
  } | null;
}

interface PtSession {
  id: string;
  member_id: string;
  trainer_name: string;
  session_date: string;
  session_time: string;
  duration_minutes: number;
  status: "scheduled" | "completed" | "no-show" | "cancelled";
  purchased_plan_id: string | null;
  approved_members?: {
    full_name: string;
    email: string;
    phone_number: string;
  } | null;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getTodayIstString(): string {
  const now = new Date();
  const istDate = new Date(now.getTime() + (IST_OFFSET_MS - (-now.getTimezoneOffset() * 60 * 1000)));
  return istDate.toISOString().split("T")[0];
}

const TIME_SLOTS = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", 
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"
];

function formatSlotHour(time24: string): string {
  const [hStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  return `${displayH}:00 ${ampm}`;
}

const TRAINERS = ["Rahul Sharma", "Sneha Reddy", "Amit Patel"];

export default function PtSchedulerPage() {
  const [selectedTrainer, setSelectedTrainer] = useState("Rahul Sharma");
  const [weekOffset, setWeekOffset] = useState(0);

  // Data States
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [assignments, setAssignments] = useState<PtAssignment[]>([]);
  const [sessions, setSessions] = useState<PtSession[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<PtSession | null>(null);

  // Assign Form state
  const [assignMemberId, setAssignMemberId] = useState("");
  const [assignTrainerName, setAssignTrainerName] = useState("Rahul Sharma");
  const [assignStartDate, setAssignStartDate] = useState(getTodayIstString());
  const [assignDuration, setAssignDuration] = useState(60);
  const [assignStartTime, setAssignStartTime] = useState("09:00");
  const [assignDays, setAssignDays] = useState<number[]>([]);
  const [assignWeeks, setAssignWeeks] = useState(4);

  // Book Form state
  const [bookMemberId, setBookMemberId] = useState("");
  const [bookOption, setBookOption] = useState<"one" | "all">("one");
  const [bookDate, setBookDate] = useState(getTodayIstString());
  const [bookTime, setBookTime] = useState("10:00");
  const [bookDuration, setBookDuration] = useState(60);

  // Reschedule Form state
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [reschedDate, setReschedDate] = useState("");
  const [reschedTime, setReschedTime] = useState("");

  // Reassign Form state
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassignTrainer, setReassignTrainer] = useState("Sneha Reddy");
  const [reassignScope, setReassignScope] = useState<"only" | "all">("only");

  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  // Scroll lock when modal is open
  const isAnyModalOpen = showAssignModal || showBookModal || showDetailModal;
  useEffect(() => {
    document.body.style.overflow = isAnyModalOpen ? "hidden" : "unset";
    return () => { document.body.style.overflow = "unset"; };
  }, [isAnyModalOpen]);

  // ─── LOAD DATA ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch approved members and plans
      const { data: memData } = await supabase.from("approved_members").select("id, full_name, email, phone_number").order("full_name");
      const { data: plansData } = await supabase.from("member_purchased_plans").select("id, approved_member_id, plan_name, sessions_remaining, sessions_total, status").eq("category", "PT Packages").eq("status", "active");
      
      const { data: assignData } = await supabase.from("pt_assignments").select("*");
      const { data: sessData } = await supabase.from("pt_sessions").select("*").order("session_date").order("session_time");
      const { data: profilesList } = await supabase.from("profiles").select("id, email");

      // Lookup maps
      const memberMap: Record<string, any> = {};
      (memData || []).forEach(m => { memberMap[m.id] = m; });

      const profileEmailById: Record<string, string> = {};
      (profilesList || []).forEach(p => {
        if (p.email) profileEmailById[p.id] = p.email.toLowerCase();
      });

      const memberByEmail: Record<string, any> = {};
      (memData || []).forEach(m => {
        if (m.email) memberByEmail[m.email.toLowerCase()] = m;
      });

      // Enrich function for member resolving
      const resolveMember = (id: string) => {
        if (memberMap[id]) return memberMap[id];
        const email = profileEmailById[id];
        if (email) return memberByEmail[email] || null;
        return null;
      };

      const enrichedAssignments = (assignData || []).map(a => ({
        ...a,
        approved_members: resolveMember(a.member_id)
      }));

      const enrichedSessions = (sessData || []).map(s => ({
        ...s,
        approved_members: resolveMember(s.member_id)
      }));

      const membersWithOptions = (memData || []).map(m => {
        const plans = (plansData || []).filter(p => p.approved_member_id === m.id);
        return {
          ...m,
          ptPlans: plans
        };
      });

      startTransition(() => {
        setMembers(membersWithOptions as MemberOption[]);
        setAssignments(enrichedAssignments as PtAssignment[]);
        setSessions(enrichedSessions as PtSession[]);
        setLoading(false);
      });
    } catch (err) {
      console.error("loadData error:", err);
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("pt-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pt_assignments" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "pt_sessions" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "member_purchased_plans" }, () => loadData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, loadData]);

  // ─── WEEK DAYS COMPUTATION ───────────────────────────────────────────
  const currentWeekDays = useMemo(() => {
    const today = new Date();
    today.setDate(today.getDate() + weekOffset * 7);
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    const monday = new Date(today.setDate(diff));

    const days = [];
    const todayIso = getTodayIstString();

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const isoDate = d.toISOString().split("T")[0];
      const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      const dayNum = d.getDate();
      const isToday = isoDate === todayIso;
      days.push({ isoDate, dayName, dayNum, isToday, fullDate: d });
    }
    return days;
  }, [weekOffset]);

  const weekHeaderDateRange = useMemo(() => {
    if (currentWeekDays.length === 0) return "";
    const start = currentWeekDays[0].fullDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    const end = currentWeekDays[6].fullDate.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
    return `${start} – ${end}`;
  }, [currentWeekDays]);

  // ─── ACTIONS ───────────────────────────────────────────────────────────────

  const toggleAssignDay = (day: number) => {
    setAssignDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleAssignTrainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignMemberId || assignDays.length === 0) {
      setActionError("Please select a member and at least one recurring day.");
      return;
    }

    const member = members.find(m => m.id === assignMemberId);
    const activePlan = member?.ptPlans[0];
    if (!activePlan) {
      setActionError("Selected member does not have an active PT Package.");
      return;
    }

    setActionLoading(true);
    setActionError(null);

    // Calculate recurring session dates
    const sessionInserts: any[] = [];
    const startDate = new Date(assignStartDate + "T00:00:00");
    const startDayOfWeek = startDate.getDay();

    assignDays.slice().sort((a, b) => a - b).forEach((dayOfWeek) => {
      let daysUntil = (dayOfWeek - startDayOfWeek + 7) % 7;
      const firstOccurrence = new Date(startDate);
      firstOccurrence.setDate(startDate.getDate() + daysUntil);

      for (let week = 0; week < assignWeeks; week++) {
        const sessionDate = new Date(firstOccurrence);
        sessionDate.setDate(firstOccurrence.getDate() + week * 7);
        sessionInserts.push({
          member_id: assignMemberId,
          trainer_name: assignTrainerName,
          session_date: sessionDate.toISOString().split("T")[0],
          session_time: assignStartTime,
          duration_minutes: assignDuration,
          status: "scheduled",
          purchased_plan_id: activePlan.id
        });
      }
    });

    const totalToGenerate = sessionInserts.length;
    if (activePlan.sessions_remaining < totalToGenerate) {
      setActionError(`Member only has ${activePlan.sessions_remaining} sessions left in their plan, but this schedule tries to generate ${totalToGenerate} sessions.`);
      setActionLoading(false);
      return;
    }

    // 1. Create or Update Assignment
    const { error: assignErr } = await supabase.from("pt_assignments").upsert({
      member_id: assignMemberId,
      trainer_name: assignTrainerName,
      start_date: assignStartDate,
      duration_minutes: assignDuration,
      start_time: assignStartTime,
      recurring_days: assignDays
    });

    if (assignErr) {
      setActionError("Failed to save assignment: " + assignErr.message);
      setActionLoading(false);
      return;
    }

    // 2. Insert Sessions
    const { error: sessErr } = await supabase.from("pt_sessions").insert(sessionInserts);
    if (sessErr) {
      setActionError("Failed to generate sessions: " + sessErr.message);
      setActionLoading(false);
      return;
    }

    // 3. Deduct Remaining Sessions
    const { error: planErr } = await supabase.from("member_purchased_plans")
      .update({ sessions_remaining: Math.max(0, activePlan.sessions_remaining - totalToGenerate) })
      .eq("id", activePlan.id);

    setActionLoading(false);
    if (planErr) {
      setActionError("Generated sessions, but failed to deduct sessions remaining: " + planErr.message);
    } else {
      setActionSuccess(`Successfully assigned member and generated ${totalToGenerate} sessions!`);
      setShowAssignModal(false);
      loadData();
    }
  };

  const handleBookIndividualSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookMemberId) {
      setActionError("Please select a member.");
      return;
    }

    const member = members.find(m => m.id === bookMemberId);
    const activePlan = member?.ptPlans[0];
    if (!activePlan || activePlan.sessions_remaining <= 0) {
      setActionError("Member does not have an active PT Package or remaining sessions.");
      return;
    }

    setActionLoading(true);
    setActionError(null);

    const sessionsToBook = bookOption === "one" ? 1 : activePlan.sessions_remaining;
    const sessionInserts = [];

    // For simplicity, multiple bookings are scheduled on consecutive weeks on the same selected day
    const baseDate = new Date(bookDate + "T00:00:00");
    for (let i = 0; i < sessionsToBook; i++) {
      const sessDateObj = new Date(baseDate);
      sessDateObj.setDate(baseDate.getDate() + i * 7);
      sessionInserts.push({
        member_id: bookMemberId,
        trainer_name: selectedTrainer,
        session_date: sessDateObj.toISOString().split("T")[0],
        session_time: bookTime,
        duration_minutes: bookDuration,
        status: "scheduled",
        purchased_plan_id: activePlan.id
      });
    }

    const { error: sessErr } = await supabase.from("pt_sessions").insert(sessionInserts);
    if (sessErr) {
      setActionError("Failed to book session: " + sessErr.message);
      setActionLoading(false);
      return;
    }

    // Deduct count
    const { error: planErr } = await supabase.from("member_purchased_plans")
      .update({ sessions_remaining: Math.max(0, activePlan.sessions_remaining - sessionsToBook) })
      .eq("id", activePlan.id);

    setActionLoading(false);
    if (planErr) {
      setActionError("Booked session, but failed to deduct sessions remaining: " + planErr.message);
    } else {
      setActionSuccess(`Successfully booked ${sessionsToBook} session(s)!`);
      setShowBookModal(false);
      loadData();
    }
  };

  const handleUpdateStatus = async (status: "completed" | "no-show" | "cancelled") => {
    if (!selectedSession) return;
    setActionLoading(true);
    setActionError(null);

    const { error } = await supabase.from("pt_sessions").update({ status }).eq("id", selectedSession.id);
    
    // If cancelled, return session credit
    if (!error && status === "cancelled" && selectedSession.purchased_plan_id) {
      const plan = members.flatMap(m => m.ptPlans).find(p => p.id === selectedSession.purchased_plan_id);
      if (plan) {
        await supabase.from("member_purchased_plans")
          .update({ sessions_remaining: plan.sessions_remaining + 1 })
          .eq("id", plan.id);
      }
    }

    setActionLoading(false);
    if (error) {
      setActionError("Failed to update status: " + error.message);
    } else {
      setActionSuccess(`Session marked as ${status}!`);
      setShowDetailModal(false);
      loadData();
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || !reschedDate || !reschedTime) return;

    setActionLoading(true);
    setActionError(null);

    const { error } = await supabase.from("pt_sessions").update({
      session_date: reschedDate,
      session_time: reschedTime
    }).eq("id", selectedSession.id);

    setActionLoading(false);
    if (error) {
      setActionError("Failed to reschedule: " + error.message);
    } else {
      setActionSuccess("Session rescheduled successfully!");
      setIsRescheduling(false);
      setShowDetailModal(false);
      loadData();
    }
  };

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession) return;

    setActionLoading(true);
    setActionError(null);

    if (reassignScope === "only") {
      const { error } = await supabase.from("pt_sessions").update({
        trainer_name: reassignTrainer
      }).eq("id", selectedSession.id);

      setActionLoading(false);
      if (error) {
        setActionError("Failed to reassign: " + error.message);
      } else {
        setActionSuccess("Session reassigned successfully!");
        setIsReassigning(false);
        setShowDetailModal(false);
        loadData();
      }
    } else {
      // This and all upcoming sessions for this member with this trainer
      const { error } = await supabase.from("pt_sessions").update({
        trainer_name: reassignTrainer
      })
      .eq("member_id", selectedSession.member_id)
      .eq("trainer_name", selectedSession.trainer_name)
      .gte("session_date", selectedSession.session_date);

      // Also update the master trainer assignment
      await supabase.from("pt_assignments").update({
        trainer_name: reassignTrainer
      }).eq("member_id", selectedSession.member_id);

      setActionLoading(false);
      if (error) {
        setActionError("Failed to reassign sessions: " + error.message);
      } else {
        setActionSuccess("All upcoming sessions reassigned successfully!");
        setIsReassigning(false);
        setShowDetailModal(false);
        loadData();
      }
    }
  };

  // Filter sessions for selected trainer
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => s.trainer_name === selectedTrainer);
  }, [sessions, selectedTrainer]);

  return (
    <div className="space-y-8 animate-fade-in font-sans pb-12">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1B0B38] tracking-tight">
            PT <span className="text-[#7B3FE4]">Scheduler</span>
          </h1>
          <p className="text-sm text-[#1B0B38]/60 mt-1.5 font-medium">
            Manage personal training trainer calendars, recurring assignments, and status tracking
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Trainer Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#1B0B38]/60 uppercase tracking-wider">Trainer:</span>
            <select
              value={selectedTrainer}
              onChange={(e) => setSelectedTrainer(e.target.value)}
              className="p-2.5 rounded-xl border border-[#1B0B38]/15 bg-white text-xs font-bold text-[#7B3FE4] focus:outline-none"
            >
              {TRAINERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <button
            onClick={() => {
              setAssignMemberId("");
              setAssignDays([]);
              setShowAssignModal(true);
            }}
            className="px-5 py-3 rounded-2xl bg-[#7B3FE4] text-white text-xs font-bold hover:bg-[#6A2FD3] shadow-md shadow-[#7B3FE4]/25 flex items-center gap-1.5"
          >
            <span>+</span> Assign Trainer
          </button>

          <button
            onClick={() => {
              setBookMemberId("");
              setShowBookModal(true);
            }}
            className="px-5 py-3 rounded-2xl bg-white border border-[#7B3FE4]/30 text-[#7B3FE4] hover:bg-[#7B3FE4]/5 text-xs font-bold shadow-xs"
          >
            Book Session
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-between shadow-xs">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="font-bold hover:text-red-900">✕</button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-xs">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="font-bold hover:text-emerald-950">✕</button>
        </div>
      )}

      {/* Weekly Calendar View */}
      <div className="bg-white rounded-3xl border border-[#1B0B38]/10 shadow-md">
        <div className="flex items-center justify-between p-5 border-b border-[#1B0B38]/10 bg-[#FAF9FC]/60 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setWeekOffset(prev => prev - 1)}
              className="px-3 py-2 rounded-xl border border-[#1B0B38]/15 bg-white text-xs font-bold text-[#1B0B38] hover:bg-gray-50"
            >
              &larr; Prev Week
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="px-4 py-2 rounded-xl bg-[#7B3FE4] text-white font-bold text-xs hover:bg-[#6A2FD3]"
            >
              Today
            </button>
            <button
              onClick={() => setWeekOffset(prev => prev + 1)}
              className="px-3 py-2 rounded-xl border border-[#1B0B38]/15 bg-white text-xs font-bold text-[#1B0B38] hover:bg-gray-50"
            >
              Next Week &rarr;
            </button>
            <span className="text-sm font-extrabold text-[#1B0B38] ml-2">{weekHeaderDateRange}</span>
          </div>
          <span className="text-xs font-bold text-[#7B3FE4] bg-[#F2EBFE] px-3 py-1 rounded-lg">
            Active Schedule for {selectedTrainer}
          </span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Week Header */}
            <div className="grid grid-cols-[90px_repeat(7,1fr)] border-b border-[#1B0B38]/10 text-center text-xs font-bold bg-[#FAF9FC]/30">
              <div className="p-3.5 border-r border-[#1B0B38]/10 text-[#1B0B38]/50">Time</div>
              {currentWeekDays.map(day => (
                <div key={day.isoDate} className={`p-3.5 border-r border-[#1B0B38]/10 last:border-r-0 flex flex-col items-center justify-center ${day.isToday ? "bg-[#7B3FE4]/5 text-[#7B3FE4]" : "text-[#1B0B38]"}`}>
                  <span className="uppercase text-[10px] text-opacity-65 tracking-wider">{day.dayName}</span>
                  <span className="text-base font-black mt-0.5">{day.dayNum}</span>
                </div>
              ))}
            </div>

            {/* Time Slot Rows */}
            <div className="divide-y divide-[#1B0B38]/10">
              {TIME_SLOTS.map(slot => {
                const hourPrefix = slot.substring(0, 2);
                return (
                  <div key={slot} className="grid grid-cols-[90px_repeat(7,1fr)] min-h-[90px]">
                    <div className="p-3 text-[11px] font-bold text-[#1B0B38]/40 border-r border-[#1B0B38]/10 bg-[#FAF9FC]/30 text-center flex items-center justify-center">
                      {formatSlotHour(slot)}
                    </div>

                    {currentWeekDays.map(day => {
                      const matched = filteredSessions.filter(s => s.session_date === day.isoDate && s.session_time.startsWith(hourPrefix));
                      return (
                        <div key={day.isoDate} className="p-2 border-r border-[#1B0B38]/10 last:border-r-0 relative hover:bg-[#FAF9FC]/50 transition-colors">
                          <div className="space-y-1.5 h-full">
                            {matched.map(s => {
                              let statusColor = "bg-[#7B3FE4] text-white border-white/20";
                              if (s.status === "completed") statusColor = "bg-emerald-600 text-white border-white/20";
                              if (s.status === "no-show") statusColor = "bg-amber-600 text-white border-white/20";
                              if (s.status === "cancelled") statusColor = "bg-red-500/80 line-through opacity-85 text-white border-white/20";

                              return (
                                <div
                                  key={s.id}
                                  onClick={() => {
                                    setSelectedSession(s);
                                    setIsRescheduling(false);
                                    setIsReassigning(false);
                                    setShowDetailModal(true);
                                  }}
                                  className={`p-2.5 rounded-2xl text-[10px] font-extrabold shadow-sm border cursor-pointer hover:scale-[1.02] transition-transform ${statusColor}`}
                                >
                                  <p className="line-clamp-1">{s.approved_members?.full_name || "Member"}</p>
                                  <p className="opacity-75 mt-0.5">{s.session_time.substring(0, 5)} ({s.duration_minutes}m)</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ─── ASSIGN TRAINER MODAL ─────────────────────────────────────────── */}
      {showAssignModal && (
        <Modal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6">
          <div className="bg-white rounded-3xl border border-[#1B0B38]/10 shadow-2xl max-w-xl w-full p-7 flex flex-col animate-fade-in space-y-4">
            <div className="flex items-center justify-between border-b border-[#1B0B38]/10 pb-4">
              <div>
                <h3 className="text-xl font-extrabold text-[#1B0B38]">Assign Trainer &amp; Recurring Schedule</h3>
                <p className="text-xs text-[#1B0B38]/50 mt-0.5">Assign a trainer to a member and pre-generate training blocks</p>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="w-8 h-8 rounded-full bg-[#FAF9FC] hover:bg-[#1B0B38]/10 text-base font-bold text-[#1B0B38]/60 flex items-center justify-center transition-colors">✕</button>
            </div>

            <form onSubmit={handleAssignTrainer} className="space-y-4">
              {/* Member Selection */}
              <div>
                <label className="block text-[11px] font-bold text-[#1B0B38]/60 uppercase tracking-wider mb-1.5">Select Member (Must have active PT Package) *</label>
                <select
                  required
                  value={assignMemberId}
                  onChange={(e) => setAssignMemberId(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs font-semibold text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none"
                >
                  <option value="">-- Choose Member --</option>
                  {members.map(m => {
                    const plan = m.ptPlans[0];
                    const label = plan ? `✓ ${plan.plan_name} (${plan.sessions_remaining} sessions left)` : "⚠️ No PT Package";
                    return (
                      <option key={m.id} value={m.id} disabled={!plan}>
                        {m.full_name} — {label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Trainer Select */}
              <div>
                <label className="block text-[11px] font-bold text-[#1B0B38]/60 uppercase tracking-wider mb-1.5">Trainer *</label>
                <select
                  value={assignTrainerName}
                  onChange={(e) => setAssignTrainerName(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs font-semibold text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none"
                >
                  {TRAINERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Start Date, Time & Duration */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#1B0B38]/60 uppercase tracking-wider mb-1.5">Start Date *</label>
                  <input type="date" required value={assignStartDate} onChange={(e) => setAssignStartDate(e.target.value)} className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs font-semibold text-[#1B0B38]" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#1B0B38]/60 uppercase tracking-wider mb-1.5">Start Time *</label>
                  <input type="time" required value={assignStartTime} onChange={(e) => setAssignStartTime(e.target.value)} className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs font-semibold text-[#1B0B38]" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#1B0B38]/60 uppercase tracking-wider mb-1.5">Duration (mins)</label>
                  <input type="number" min="15" step="15" value={assignDuration} onChange={(e) => setAssignDuration(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs font-semibold text-[#1B0B38]" />
                </div>
              </div>

              {/* Day of Week Selector */}
              <div>
                <label className="block text-[11px] font-bold text-[#1B0B38]/60 uppercase tracking-wider mb-2">Recurring Days *</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleAssignDay(i)}
                      className={`w-10 h-10 rounded-full text-xs font-extrabold transition-all ${
                        assignDays.includes(i)
                          ? "bg-[#7B3FE4] text-white shadow-md shadow-[#7B3FE4]/30"
                          : "bg-white border border-[#1B0B38]/20 text-[#1B0B38]/60 hover:border-[#7B3FE4]/50"
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {/* Number of Weeks */}
              <div className="flex items-center gap-3 pt-2">
                <span className="text-[11px] font-bold text-[#1B0B38]/60 uppercase tracking-wider">Repeat for</span>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={assignWeeks}
                  onChange={(e) => setAssignWeeks(Math.max(1, Number(e.target.value)))}
                  className="w-16 p-2 bg-[#FAF9FC] border border-[#1B0B38]/15 rounded-lg text-center font-extrabold text-xs text-[#1B0B38] focus:outline-none"
                />
                <span className="text-[11px] font-bold text-[#1B0B38]/60">weeks</span>
                {assignDays.length > 0 && (
                  <span className="text-[10px] font-bold text-[#7B3FE4] bg-[#F2EBFE] px-2 py-1.5 rounded-lg">
                    = {assignDays.length * assignWeeks} sessions
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1B0B38]/10">
                <button type="button" onClick={() => setShowAssignModal(false)} className="px-5 py-2.5 border border-[#1B0B38]/15 rounded-xl font-bold text-xs text-[#1B0B38] hover:bg-black/5">Cancel</button>
                <button type="submit" disabled={actionLoading || assignDays.length === 0 || !assignMemberId} className="px-6 py-2.5 bg-[#7B3FE4] text-white font-extrabold text-xs rounded-xl hover:bg-[#6A2FD3] disabled:opacity-50">Assign &amp; Generate Sessions</button>
              </div>
            </form>
          </div>
        </div>
        </Modal>
      )}

      {/* ─── BOOK INDIVIDUAL SESSION MODAL ────────────────────────────────── */}
      {showBookModal && (
        <Modal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6">
          <div className="bg-white rounded-3xl border border-[#1B0B38]/10 shadow-2xl max-w-lg w-full p-7 flex flex-col animate-fade-in space-y-4">
            <div className="flex items-center justify-between border-b border-[#1B0B38]/10 pb-4">
              <div>
                <h3 className="text-xl font-extrabold text-[#1B0B38]">Book Individual Session</h3>
                <p className="text-xs text-[#1B0B38]/50 mt-0.5">Schedule a single PT appointment for a trainer</p>
              </div>
              <button onClick={() => setShowBookModal(false)} className="w-8 h-8 rounded-full bg-[#FAF9FC] hover:bg-[#1B0B38]/10 text-base font-bold text-[#1B0B38]/60 flex items-center justify-center transition-colors">✕</button>
            </div>

            <form onSubmit={handleBookIndividualSession} className="space-y-4">
              {/* Member Selector */}
              <div>
                <label className="block text-[11px] font-bold text-[#1B0B38]/60 uppercase tracking-wider mb-1.5">Select Member *</label>
                <select
                  required
                  value={bookMemberId}
                  onChange={(e) => setBookMemberId(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs font-semibold text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none"
                >
                  <option value="">-- Choose Member --</option>
                  {members.map(m => {
                    const plan = m.ptPlans[0];
                    const label = plan ? `✓ ${plan.plan_name} (${plan.sessions_remaining} left)` : "⚠️ No PT Package";
                    return (
                      <option key={m.id} value={m.id} disabled={!plan || plan.sessions_remaining <= 0}>
                        {m.full_name} — {label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Book Option Choice */}
              <div>
                <label className="block text-[11px] font-bold text-[#1B0B38]/60 uppercase tracking-wider mb-2">Booking Option *</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-bold text-[#1B0B38] cursor-pointer">
                    <input type="radio" name="bookOption" checked={bookOption === "one"} onChange={() => setBookOption("one")} className="w-4 h-4 accent-[#7B3FE4]" />
                    Book One Session
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold text-[#1B0B38] cursor-pointer">
                    <input type="radio" name="bookOption" checked={bookOption === "all"} onChange={() => setBookOption("all")} className="w-4 h-4 accent-[#7B3FE4]" />
                    Book All Remaining Sessions
                  </label>
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-[#1B0B38]/60 uppercase tracking-wider mb-1.5">Date *</label>
                  <input type="date" required value={bookDate} onChange={(e) => setBookDate(e.target.value)} className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs font-semibold text-[#1B0B38]" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#1B0B38]/60 uppercase tracking-wider mb-1.5">Time *</label>
                  <input type="time" required value={bookTime} onChange={(e) => setBookTime(e.target.value)} className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs font-semibold text-[#1B0B38]" />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1B0B38]/10">
                <button type="button" onClick={() => setShowBookModal(false)} className="px-5 py-2.5 border border-[#1B0B38]/15 rounded-xl font-bold text-xs text-[#1B0B38] hover:bg-black/5">Cancel</button>
                <button type="submit" disabled={actionLoading || !bookMemberId} className="px-6 py-2.5 bg-[#7B3FE4] text-white font-extrabold text-xs rounded-xl hover:bg-[#6A2FD3] disabled:opacity-50">Book Session</button>
              </div>
            </form>
          </div>
        </div>
        </Modal>
      )}

      {/* ─── SESSION DETAIL MODAL (UPDATE/REASSIGN/RESCHEDULE) ───────────── */}
      {showDetailModal && selectedSession && (
        <Modal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6">
          <div className="bg-white rounded-3xl border border-[#1B0B38]/10 shadow-2xl max-w-lg w-full p-7 flex flex-col animate-fade-in space-y-5">
            <div className="flex items-center justify-between border-b border-[#1B0B38]/10 pb-4 flex-shrink-0">
              <div>
                <h3 className="text-xl font-extrabold text-[#1B0B38]">PT Session Details</h3>
                <p className="text-xs text-[#1B0B38]/60 mt-0.5 font-medium">Manage this personal training session appointment</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="w-8 h-8 rounded-full bg-[#FAF9FC] hover:bg-[#1B0B38]/10 text-base font-bold text-[#1B0B38]/60 flex items-center justify-center transition-colors">✕</button>
            </div>

            {/* Session Info card */}
            <div className="bg-[#FAF9FC] p-4 rounded-2xl border border-[#1B0B38]/10 text-xs space-y-1.5">
              <p className="font-extrabold text-base text-[#1B0B38]">{selectedSession.approved_members?.full_name || "Member"}</p>
              <p className="text-[#1B0B38]/70 font-semibold">Trainer: {selectedSession.trainer_name}</p>
              <p className="text-[#1B0B38]/70 font-semibold">Date &amp; Time: {selectedSession.session_date} @ {selectedSession.session_time.substring(0, 5)} ({selectedSession.duration_minutes} mins)</p>
              <p className="font-bold">
                Status: 
                <span className={`ml-1.5 px-2 py-0.5 rounded-lg text-[10px] uppercase font-black ${
                  selectedSession.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                  selectedSession.status === "no-show" ? "bg-amber-100 text-amber-800" :
                  selectedSession.status === "cancelled" ? "bg-red-100 text-red-800" :
                  "bg-purple-100 text-purple-800"
                }`}>
                  {selectedSession.status}
                </span>
              </p>
            </div>

            {/* Reschedule Subsection */}
            {isRescheduling ? (
              <form onSubmit={handleReschedule} className="p-4 bg-[#FAF9FC] rounded-2xl border border-[#7B3FE4]/20 space-y-3">
                <h4 className="text-xs font-bold text-[#7B3FE4] uppercase tracking-wider">Reschedule Appointment</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#1B0B38]/50 uppercase tracking-wider mb-1">New Date *</label>
                    <input type="date" required value={reschedDate} onChange={(e) => setReschedDate(e.target.value)} className="w-full p-2 bg-white border border-[#1B0B38]/15 rounded-xl text-xs" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#1B0B38]/50 uppercase tracking-wider mb-1">New Time *</label>
                    <input type="time" required value={reschedTime} onChange={(e) => setReschedTime(e.target.value)} className="w-full p-2 bg-white border border-[#1B0B38]/15 rounded-xl text-xs" />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setIsRescheduling(false)} className="px-3.5 py-1.5 border border-[#1B0B38]/15 rounded-lg text-[10px] font-bold">Cancel</button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-1.5 bg-[#7B3FE4] text-white rounded-lg text-[10px] font-bold">Save Change</button>
                </div>
              </form>
            ) : isReassigning ? (
              <form onSubmit={handleReassign} className="p-4 bg-[#FAF9FC] rounded-2xl border border-[#7B3FE4]/20 space-y-3">
                <h4 className="text-xs font-bold text-[#7B3FE4] uppercase tracking-wider">Reassign Trainer</h4>
                <div>
                  <label className="block text-[10px] font-bold text-[#1B0B38]/50 uppercase tracking-wider mb-1">Choose New Trainer *</label>
                  <select
                    value={reassignTrainer}
                    onChange={(e) => setReassignTrainer(e.target.value)}
                    className="w-full p-2 bg-white border border-[#1B0B38]/15 rounded-xl text-xs font-bold text-[#7B3FE4]"
                  >
                    {TRAINERS.filter(t => t !== selectedSession.trainer_name).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#1B0B38]/50 uppercase tracking-wider mb-2">Scope of Reassignment</label>
                  <div className="flex items-center gap-4 text-[11px] font-bold text-[#1B0B38]">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="reassignScope" checked={reassignScope === "only"} onChange={() => setReassignScope("only")} className="w-3.5 h-3.5 accent-[#7B3FE4]" />
                      Only this session
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="reassignScope" checked={reassignScope === "all"} onChange={() => setReassignScope("all")} className="w-3.5 h-3.5 accent-[#7B3FE4]" />
                      This &amp; all upcoming
                    </label>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setIsReassigning(false)} className="px-3.5 py-1.5 border border-[#1B0B38]/15 rounded-lg text-[10px] font-bold">Cancel</button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-1.5 bg-[#7B3FE4] text-white rounded-lg text-[10px] font-bold">Confirm Reassign</button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2 justify-center py-2 bg-[#FAF9FC] border border-[#1B0B38]/10 rounded-2xl">
                {selectedSession.status === "scheduled" && (
                  <>
                    <button
                      onClick={() => handleUpdateStatus("completed")}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-xs"
                    >
                      Mark Complete
                    </button>
                    <button
                      onClick={() => handleUpdateStatus("no-show")}
                      className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 shadow-xs"
                    >
                      Mark No-show
                    </button>
                    <button
                      onClick={() => {
                        setReschedDate(selectedSession.session_date);
                        setReschedTime(selectedSession.session_time);
                        setIsRescheduling(true);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-xs"
                    >
                      Reschedule
                    </button>
                    <button
                      onClick={() => {
                        setReassignTrainer(TRAINERS.find(t => t !== selectedSession.trainer_name) || "");
                        setReassignScope("only");
                        setIsReassigning(true);
                      }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-xs"
                    >
                      Change Trainer
                    </button>
                    <button
                      onClick={() => handleUpdateStatus("cancelled")}
                      className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 shadow-xs"
                    >
                      Cancel Session
                    </button>
                  </>
                )}
                {selectedSession.status !== "scheduled" && (
                  <p className="text-xs text-[#1B0B38]/60 font-semibold py-2">
                    Cannot modify a session that is already {selectedSession.status}.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end pt-3 border-t border-[#1B0B38]/10">
              <button onClick={() => setShowDetailModal(false)} className="px-5 py-2.5 border border-[#1B0B38]/15 rounded-xl font-bold text-xs text-[#1B0B38] hover:bg-black/5">Close</button>
            </div>
          </div>
        </div>
        </Modal>
      )}
    </div>
  );
}
