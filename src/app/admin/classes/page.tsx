"use client";

import { useEffect, useState, useCallback, useMemo, useTransition, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { usePermissions } from "@/lib/usePermissions";
import { formatDate, formatTime } from "@/lib/date-utils";


function Modal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface ClassType {
  id: string;
  name: string;
  category: string;
  description: string | null;
  difficulty: string;
  duration_minutes: number;
  max_capacity: number;
  trainer: string;
  location_room: string;
  allow_member_booking: boolean;
  booking_opens_before_hours: number;
  booking_closes_before_hours: number;
  waitlist_enabled: boolean;
  cancellation_window_hours: number;
  is_active: boolean;
}

interface ScheduledSession {
  id: string;
  class_type_id?: string | null;
  title: string;
  instructor: string;
  class_date: string;
  class_time: string;
  end_time?: string | null;
  buffer_minutes?: number | null;
  max_capacity: number;
  category: string;
  location_room: string;
  difficulty?: string | null;
  duration_minutes?: number | null;
  status: "scheduled" | "completed" | "cancelled";
  is_active: boolean;
  created_at: string;
}

interface BookingRecord {
  id: string;
  class_id: string;
  member_id: string;
  booking_status: "booked" | "confirmed" | "checked_in" | "completed" | "cancelled" | "no_show" | "waitlisted";
  attendance_status: "pending" | "present" | "no_show" | "late";
  purchased_plan_id: string | null;
  checked_in_at: string | null;
  created_at: string;
  classes?: ScheduledSession | null;
  approved_members?: {
    full_name: string;
    email: string;
    phone_number: string;
  } | null;
  member_purchased_plans?: {
    plan_name: string;
    category: string;
    sessions_remaining: number | null;
    status: string;
  } | null;
}

interface MemberOption {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  plans: {
    id: string;
    plan_name: string;
    category: string;
    sessions_remaining: number | null;
    sessions_total: number | null;
    valid_until: string | null;
    status: string;
  }[];
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function parseAsIst(dateStr: string, timeStr: string): number {
  const iso = `${dateStr}T${timeStr}`;
  const d = new Date(iso);
  const browserOffset = -d.getTimezoneOffset() * 60 * 1000;
  return d.getTime() + (IST_OFFSET_MS - browserOffset);
}

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

export default function AdminClassesModulePage() {
  const { hasPerm } = usePermissions();
  const [activeTab, setActiveTab] = useState<"class_types" | "schedule" | "sessions">("schedule");
  const [calendarView, setCalendarView] = useState<"day" | "week" | "month">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  
  // Realtime Supabase Data
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [membersList, setMembersList] = useState<MemberOption[]>([]);
  
  const [loading, setLoading] = useState(true);
  const isInitialLoadRef = useRef(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals state
  const [showCreateClassTypeModal, setShowCreateClassTypeModal] = useState(false);
  const [editingClassType, setEditingClassType] = useState<ClassType | null>(null);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSession, setEditingSession] = useState<ScheduledSession | null>(null);

  const [showAssignMemberModal, setShowAssignMemberModal] = useState(false);
  const [targetSessionForAssign, setTargetSessionForAssign] = useState<ScheduledSession | null>(null);
  const [selectedAssignMemberId, setSelectedAssignMemberId] = useState("");

  // Session Detail Modal State
  const [showSessionDetailModal, setShowSessionDetailModal] = useState(false);
  const [selectedSessionForDetail, setSelectedSessionForDetail] = useState<ScheduledSession | null>(null);

  // Class Type Form state
  const [ctName, setCtName] = useState("");
  const [ctCategory, setCtCategory] = useState("Reformer Pilates");
  const [ctDescription, setCtDescription] = useState("");
  const [ctDifficulty, setCtDifficulty] = useState("All Levels");
  const [ctDuration, setCtDuration] = useState(60);
  const [ctCapacity, setCtCapacity] = useState(10);
  const [ctTrainer, setCtTrainer] = useState("Rahul Sharma");
  const [ctRoom, setCtRoom] = useState("Studio Room A");
  const [ctAllowBooking, setCtAllowBooking] = useState(true);
  const [ctWaitlistEnabled, setCtWaitlistEnabled] = useState(true);
  const [ctOpensHours, setCtOpensHours] = useState(168);
  const [ctClosesHours, setCtClosesHours] = useState(2);
  const [ctCancelWindow, setCtCancelWindow] = useState(4);

  // Schedule Session Form state
  const [sessClassTypeId, setSessClassTypeId] = useState("");
  const [sessTitle, setSessTitle] = useState("");
  const [sessTrainer, setSessTrainer] = useState("Rahul Sharma");
  const [sessDate, setSessDate] = useState(getTodayIstString());
  const [sessTime, setSessTime] = useState("09:00");
  const [sessDuration, setSessDuration] = useState(60);
  const [sessBuffer, setSessBuffer] = useState(15);
  const [sessCapacity, setSessCapacity] = useState(10);
  const [sessRoom, setSessRoom] = useState("Studio Room A");
  const [isRecurring, setIsRecurring] = useState(false);
  // NEW: day-of-week toggles (0=Sun,1=Mon,...,6=Sat) + number of weeks
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringWeeks, setRecurringWeeks] = useState(4);
  // Sessions tab date filter (default today)
  const [selectedSessionDate, setSelectedSessionDate] = useState(getTodayIstString());

  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  // Helper: toggle a day in recurringDays
  const toggleRecurringDay = (day: number) => {
    setRecurringDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  // Prevent background scroll when any modal is open
  const isAnyModalOpen = showCreateClassTypeModal || showScheduleModal || showAssignMemberModal || showSessionDetailModal;
  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [isAnyModalOpen]);

  // ─── GOOGLE CALENDAR WEEK DAYS COMPUTATION ─────────────────────────────────
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

  // ─── LOAD DATA FROM SUPABASE ───────────────────────────────────────────────
  const fetchAllData = useCallback(async (silent = false) => {
    try {
      // Only show loading spinner on the very first load
      if (!silent && isInitialLoadRef.current) {
        setLoading(true);
      }

      const { data: ctData } = await supabase.from("class_types").select("*").order("name");
      const { data: sessData } = await supabase.from("classes").select("*").order("class_date", { ascending: true }).order("class_time", { ascending: true });
      const { data: memData } = await supabase.from("approved_members").select("id, full_name, email, phone_number").order("full_name");
      const { data: plansData } = await supabase.from("member_purchased_plans").select("id, approved_member_id, plan_name, category, sessions_remaining, sessions_total, valid_until, status");
      const { data: profilesList } = await supabase.from("profiles").select("id, email");

      // Build member lookup maps (used in both API-path and fallback-path)
      const memberById: Record<string, any> = {};
      const memberByEmail: Record<string, any> = {};
      (memData || []).forEach((m: any) => {
        memberById[m.id] = m;
        if (m.email) memberByEmail[m.email.toLowerCase()] = m;
      });
      const profileEmailById: Record<string, string> = {};
      (profilesList || []).forEach((p: any) => {
        if (p.email) profileEmailById[p.id] = p.email.toLowerCase();
      });

      const enrichMember = (b: any) => {
        let member = memberById[b.member_id] || null;
        if (!member) {
          const email = profileEmailById[b.member_id];
          if (email) member = memberByEmail[email] || null;
        }
        return { ...b, approved_members: member };
      };

      // Fetch bookings via service-role API to bypass RLS
      let enrichedBookings: any[] = [];
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }

        const bkRes = await fetch("/api/admin/bookings", { cache: "no-store", headers });
        const bkJson = await bkRes.json();
        if (bkRes.ok && Array.isArray(bkJson.bookings)) {
          enrichedBookings = bkJson.bookings;
          console.log("[Admin] Bookings loaded via API:", enrichedBookings.length);
        } else {
          // API failed — fall back to direct query
          console.warn("[Admin] API failed, falling back to direct query. Error:", bkJson?.error);
          const [bkRes, clsRes] = await Promise.all([
            supabase.from("bookings").select("*").order("created_at", { ascending: false }),
            supabase.from("classes").select("*"),
          ]);
          const clsMap: Record<string, any> = {};
          (clsRes.data || []).forEach((c: any) => { clsMap[c.id] = c; });
          enrichedBookings = (bkRes.data || []).map((b: any) => enrichMember({ ...b, classes: clsMap[b.class_id] || null }));
          console.log("[Admin] Bookings loaded via direct query:", enrichedBookings.length);
        }
      } catch (bkErr) {
        // Network error — fall back to direct query
        console.error("[Admin] API fetch failed, falling back:", bkErr);
        const [bkRes, clsRes] = await Promise.all([
          supabase.from("bookings").select("*").order("created_at", { ascending: false }),
          supabase.from("classes").select("*"),
        ]);
        const clsMap: Record<string, any> = {};
        (clsRes.data || []).forEach((c: any) => { clsMap[c.id] = c; });
        enrichedBookings = (bkRes.data || []).map((b: any) => enrichMember({ ...b, classes: clsMap[b.class_id] || null }));
      }

      const membersWithPlans = (memData || []).map((m: any) => {
        const userPlans = (plansData || []).filter((p: any) => p.approved_member_id === m.id);
        return { ...m, plans: userPlans };
      });

      startTransition(() => {
        if (ctData) setClassTypes(ctData as ClassType[]);
        if (sessData) setSessions(sessData as ScheduledSession[]);
        setBookings(enrichedBookings as BookingRecord[]);
        setMembersList(membersWithPlans as any[]);
        if (isInitialLoadRef.current) {
          setLoading(false);
          isInitialLoadRef.current = false;
        }
      });
    } catch (err) {
      console.error("Error fetching studio classes data:", err);
      if (isInitialLoadRef.current) setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    const channel = supabase
      .channel("studio-classes-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "classes" }, () => fetchAllData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchAllData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "class_types" }, () => fetchAllData(true))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchAllData]);

  // 5-second polling as safety net in case Realtime misses an event
  useEffect(() => {
    const interval = setInterval(() => fetchAllData(true), 5000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // ─── KPI METRICS ───────────────────────────────────────────────────────────
  const kpiMetrics = useMemo(() => {
    const activeClassTypes = classTypes.filter((c) => c.is_active).length || classTypes.length;
    const todayStr = getTodayIstString();
    const todaySessionsCount = sessions.filter((s) => s.class_date === todayStr && s.status !== "cancelled").length;
    const totalActiveBookings = bookings.filter((b) => b.booking_status !== "cancelled").length;
    
    const checkedInCount = bookings.filter((b) => b.booking_status === "checked_in" || b.attendance_status === "present").length;
    const avgAttendancePercent = totalActiveBookings > 0 ? Math.round((checkedInCount / totalActiveBookings) * 100) : 0;

    return {
      activeClassTypes,
      todaySessionsCount,
      totalActiveBookings,
      avgAttendancePercent,
    };
  }, [classTypes, sessions, bookings]);

  // ─── BOOKING COUNTS MAP PER SESSION ─────────────────────────────────────────
  const sessionBookingCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    bookings.forEach((b) => {
      if (b.booking_status !== "cancelled" && b.booking_status !== "waitlisted") {
        const cId = b.class_id || b.classes?.id;
        if (cId) map[cId] = (map[cId] || 0) + 1;
      }
    });
    return map;
  }, [bookings]);

  // ─── HANDLERS ──────────────────────────────────────────────────────────────
  const handleOpenCreateClassType = () => {
    setEditingClassType(null);
    setCtName("");
    setCtCategory("Reformer Pilates");
    setCtDescription("");
    setCtDifficulty("All Levels");
    setCtDuration(60);
    setCtCapacity(10);
    setCtTrainer("Rahul Sharma");
    setCtRoom("Studio Room A");
    setCtAllowBooking(true);
    setCtWaitlistEnabled(true);
    setCtOpensHours(168);
    setCtClosesHours(2);
    setCtCancelWindow(4);
    setShowCreateClassTypeModal(true);
  };

  const handleOpenEditClassType = (ct: ClassType) => {
    setEditingClassType(ct);
    setCtName(ct.name);
    setCtCategory(ct.category);
    setCtDescription(ct.description || "");
    setCtDifficulty(ct.difficulty);
    setCtDuration(ct.duration_minutes);
    setCtCapacity(ct.max_capacity);
    setCtTrainer(ct.trainer);
    setCtRoom(ct.location_room);
    setCtAllowBooking(ct.allow_member_booking);
    setCtWaitlistEnabled(ct.waitlist_enabled);
    setCtOpensHours(ct.booking_opens_before_hours);
    setCtClosesHours(ct.booking_closes_before_hours);
    setCtCancelWindow(ct.cancellation_window_hours);
    setShowCreateClassTypeModal(true);
  };

  const handleSaveClassType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ctName.trim() || !ctTrainer.trim() || ctCapacity <= 0 || ctDuration <= 0) {
      setActionError("Please complete all required fields with valid numbers.");
      return;
    }

    setActionLoading(true);
    setActionError(null);

    const payload: Record<string, unknown> = {
      name: ctName.trim(),
      category: ctCategory,
      description: ctDescription.trim() || null,
      difficulty: ctDifficulty,
      duration_minutes: ctDuration,
      max_capacity: ctCapacity,
      trainer: ctTrainer.trim(),
      location_room: ctRoom,
      allow_member_booking: ctAllowBooking,
      booking_opens_before_hours: ctOpensHours,
      booking_closes_before_hours: ctClosesHours,
      waitlist_enabled: ctWaitlistEnabled,
      cancellation_window_hours: ctCancelWindow,
      is_active: true,
    };

    const isMissingColumnError = (err: { code?: string; message?: string } | null) =>
      Boolean(err && err.code === "PGRST204" && err.message?.includes("class_types") && err.message?.includes("column"));

    const tryMinimalPayload = async (): Promise<{ error: { message: string } | null }> => {
      const minimal: Record<string, unknown> = {
        name: ctName.trim(),
        description: ctDescription.trim() || null,
      };
      if (editingClassType) {
        const key = (editingClassType as unknown as { id?: string })?.id ? "id" : "name";
        const val = (editingClassType as unknown as { id?: string; name: string })[key as "id" | "name"];
        const res = await supabase.from("class_types").update(minimal).eq(key, val as string);
        return { error: res.error as unknown as { message: string } | null };
      }
      const res = await supabase.from("class_types").insert(minimal);
      return { error: res.error as unknown as { message: string } | null };
    };

    let error: { code?: string; message: string } | null = null;
    if (editingClassType) {
      const key = (editingClassType as unknown as { id?: string })?.id ? "id" : "name";
      const val = (editingClassType as unknown as { id?: string; name: string })[key as "id" | "name"];
      const res = await supabase.from("class_types").update(payload).eq(key, val as string);
      error = res.error as unknown as { code?: string; message: string } | null;
      if (isMissingColumnError(error)) {
        const fallback = await tryMinimalPayload();
        error = fallback.error as unknown as { code?: string; message: string } | null;
        if (!error) {
          console.warn("[class_types] Full schema missing — saved with minimal columns. Apply migration 042_fix_class_types_schema.sql to restore full fields.");
        }
      }
    } else {
      const res = await supabase.from("class_types").insert(payload);
      error = res.error as unknown as { code?: string; message: string } | null;
      if (isMissingColumnError(error)) {
        const fallback = await tryMinimalPayload();
        error = fallback.error as unknown as { code?: string; message: string } | null;
        if (!error) {
          console.warn("[class_types] Full schema missing — saved with minimal columns. Apply migration 042_fix_class_types_schema.sql to restore full fields.");
        }
      }
    }

    setActionLoading(false);
    if (error) {
      setActionError("Failed to save class type: " + error.message);
    } else {
      setActionSuccess(editingClassType ? "Class type updated successfully!" : "Class type created successfully!");
      setShowCreateClassTypeModal(false);
      fetchAllData();
    }
  };

  const handleSelectClassTypeForSession = (ctId: string) => {
    setSessClassTypeId(ctId);
    const ct = classTypes.find((c) => c.id === ctId);
    if (ct) {
      setSessTitle(ct.name);
      setSessTrainer(ct.trainer);
      setSessDuration(ct.duration_minutes);
      setSessCapacity(ct.max_capacity);
      setSessRoom(ct.location_room);
    }
  };

  const handleSaveScheduledSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessTitle.trim() || !sessTrainer.trim() || !sessDate || !sessTime) {
      setActionError("Session Title, Trainer, Date, and Time are required.");
      return;
    }

    setActionLoading(true);
    setActionError(null);

    const [h, m] = sessTime.split(":").map(Number);
    const endMinutes = h * 60 + m + sessDuration;
    const endH = Math.floor(endMinutes / 60) % 24;
    const endM = endMinutes % 60;
    const endTimeStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

    const basePayload = {
      class_type_id: sessClassTypeId || null,
      title: sessTitle.trim(),
      instructor: sessTrainer.trim(),
      class_time: sessTime,
      end_time: endTimeStr,
      buffer_minutes: sessBuffer,
      max_capacity: sessCapacity,
      category: classTypes.find((c) => c.id === sessClassTypeId)?.category || "Reformer Pilates",
      location_room: sessRoom,
      duration_minutes: sessDuration,
      status: "scheduled",
      is_active: true,
    };

    const sessionInserts: any[] = [];

    if (isRecurring && recurringDays.length > 0) {
      // Generate sessions: for each selected day-of-week, find first occurrence >= sessDate
      // then repeat for recurringWeeks consecutive weeks
      const startDate = new Date(sessDate + "T00:00:00");
      const startDayOfWeek = startDate.getDay();

      recurringDays.slice().sort((a, b) => a - b).forEach((dayOfWeek) => {
        let daysUntil = (dayOfWeek - startDayOfWeek + 7) % 7;
        const firstOccurrence = new Date(startDate);
        firstOccurrence.setDate(startDate.getDate() + daysUntil);

        for (let week = 0; week < recurringWeeks; week++) {
          const sessionDate = new Date(firstOccurrence);
          sessionDate.setDate(firstOccurrence.getDate() + week * 7);
          sessionInserts.push({ ...basePayload, class_date: sessionDate.toISOString().split("T")[0] });
        }
      });
    } else {
      sessionInserts.push({ ...basePayload, class_date: sessDate });
    }

    if (editingSession) {
      try {
        const res = await fetch("/api/admin/classes/schedule", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingSession.id,
            class_type_id: sessClassTypeId || null,
            title: sessTitle.trim(),
            instructor: sessTrainer.trim(),
            class_date: sessDate,
            class_time: sessTime,
            end_time: endTimeStr,
            buffer_minutes: sessBuffer,
            max_capacity: sessCapacity,
            category: classTypes.find((c) => c.id === sessClassTypeId)?.category || "Reformer Pilates",
            location_room: sessRoom,
            duration_minutes: sessDuration,
          }),
        });
        const data = await res.json();
        setActionLoading(false);
        if (!res.ok || data.error) {
          setActionError("Failed to update session: " + (data.error || "Unknown error"));
        } else {
          setActionSuccess("Session updated successfully!");
          setShowScheduleModal(false);
          setEditingSession(null);
          fetchAllData();
        }
      } catch (err: any) {
        setActionLoading(false);
        setActionError("Failed to update session: " + (err.message || "Network error"));
      }
      return;
    }

    try {
      const res = await fetch("/api/admin/classes/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: sessionInserts }),
      });
      const data = await res.json();

      setActionLoading(false);
      if (!res.ok || data.error) {
        setActionError("Failed to schedule session: " + (data.error || "Unknown error"));
      } else {
        setActionSuccess(`Successfully scheduled ${sessionInserts.length} session(s)!`);
        setShowScheduleModal(false);
        fetchAllData();
      }
    } catch (err: any) {
      setActionLoading(false);
      setActionError("Failed to schedule session: " + (err.message || "Network error"));
    }
  };

  const handleOpenSessionDetail = (sess: ScheduledSession) => {
    setSelectedSessionForDetail(sess);
    setShowSessionDetailModal(true);
  };

  const handleOpenEditSession = (sess: ScheduledSession) => {
    setEditingSession(sess);
    setSessClassTypeId(sess.class_type_id || "");
    setSessTitle(sess.title);
    setSessTrainer(sess.instructor);
    setSessDate(sess.class_date);
    setSessTime(sess.class_time ? sess.class_time.substring(0, 5) : "09:00");
    setSessDuration(sess.duration_minutes || 60);
    setSessBuffer(sess.buffer_minutes || 15);
    setSessCapacity(sess.max_capacity);
    setSessRoom(sess.location_room);
    setIsRecurring(false);
    setShowScheduleModal(true);
    setShowSessionDetailModal(false);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm("Are you sure you want to permanently DELETE this session? This will also delete any bookings for this session.")) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/classes/schedule?id=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      setActionLoading(false);
      if (!res.ok || data.error) {
        setActionError("Failed to delete session: " + (data.error || "Unknown error"));
      } else {
        setActionSuccess("Session deleted successfully!");
        setShowSessionDetailModal(false);
        fetchAllData();
      }
    } catch (err: any) {
      setActionLoading(false);
      setActionError("Failed to delete session: " + (err.message || "Unknown error"));
    }
  };

  const handleCancelSession = async (sessionId: string) => {
    if (!confirm("Cancel this class session? Cancelled sessions remain on record.")) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/classes/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "cancel" }),
      });
      const data = await res.json();
      setActionLoading(false);
      if (!res.ok || data.error) {
        setActionError("Failed to cancel session: " + (data.error || "Unknown error"));
      } else {
        // If we cancelled from detail modal, close/update it
        if (selectedSessionForDetail && selectedSessionForDetail.id === sessionId) {
          setShowSessionDetailModal(false);
        }
        fetchAllData();
      }
    } catch (err: any) {
      setActionLoading(false);
      setActionError("Failed to cancel session: " + (err.message || "Network error"));
    }
  };

  const handleOpenAssignMember = (sess: ScheduledSession) => {
    setTargetSessionForAssign(sess);
    setSelectedAssignMemberId("");
    setShowAssignMemberModal(true);
  };

  const handleConfirmMemberAssignment = async () => {
    if (!targetSessionForAssign || !selectedAssignMemberId) return;

    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch("/api/admin/classes/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: selectedAssignMemberId,
          classId: targetSessionForAssign.id,
        }),
      });
      const data = await res.json();
      setActionLoading(false);

      if (!res.ok || data.error) {
        setActionError("Booking Failed: " + (data.error || "Unknown error"));
      } else {
        setActionSuccess(data.message || "Member assigned successfully!");
        setShowAssignMemberModal(false);
        fetchAllData();
      }
    } catch (err: any) {
      setActionLoading(false);
      setActionError("Booking Failed: " + (err.message || "Network error"));
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: string) => {
    setActionLoading(true);
    if (status === "cancelled") {
      const { error } = await supabase.rpc("cancel_member_class_booking", { p_booking_id: bookingId });
      if (error) setActionError("Failed to cancel booking: " + error.message);
    } else {
      const updateData: any = { booking_status: status };
      if (status === "checked_in" || status === "attended") {
        updateData.checked_in_at = new Date().toISOString();
        updateData.attendance_status = "present";

        // Sync with attendance table
        const { data: bkRecord } = await supabase.from("bookings").select("class_id, member_id").eq("id", bookingId).maybeSingle();
        if (bkRecord) {
          await supabase.from("attendance").insert({
            booking_id: bookingId,
            class_id: bkRecord.class_id,
            member_id: bkRecord.member_id,
            attendance_token: crypto.randomUUID(),
            attendance_status: "attended",
            scanned_at: new Date().toISOString(),
          });
        }
      }
      const { error } = await supabase.from("bookings").update(updateData).eq("id", bookingId);
      if (error) setActionError("Failed to update status: " + error.message);
    }
    setActionLoading(false);
    fetchAllData();
  };

  const handleUpdateAttendance = async (bookingId: string, attendanceStatus: string) => {
    setActionLoading(true);
    const updateObj: any = { attendance_status: attendanceStatus };
    if (attendanceStatus === "present" || attendanceStatus === "attended") {
      updateObj.booking_status = "checked_in";
      updateObj.checked_in_at = new Date().toISOString();

      const { data: bkRecord } = await supabase.from("bookings").select("class_id, member_id").eq("id", bookingId).maybeSingle();
      if (bkRecord) {
        await supabase.from("attendance").insert({
          booking_id: bookingId,
          class_id: bkRecord.class_id,
          member_id: bkRecord.member_id,
          attendance_token: crypto.randomUUID(),
          attendance_status: "attended",
          scanned_at: new Date().toISOString(),
        });
      }
    } else if (attendanceStatus === "no_show") {
      updateObj.booking_status = "no_show";
    }
    const { error } = await supabase.from("bookings").update(updateObj).eq("id", bookingId);
    setActionLoading(false);
    if (error) setActionError("Failed to update attendance: " + error.message);
    else fetchAllData();
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans pb-12">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-fg tracking-tight">
            Classes &amp; Studio <span className="text-accent">Management</span>
          </h1>
          <p className="text-sm text-fg-3 mt-1.5 font-medium">
            Manage class types, calendar schedule board, session bookings, and studio check-ins
          </p>
        </div>
        {hasPerm("classes.create") && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSessClassTypeId("");
                setSessTitle("");
                setShowScheduleModal(true);
              }}
              className="px-6 py-3 rounded-2xl bg-accent text-white text-xs font-bold hover:bg-accent-2 transition-all shadow-md shadow-accent/25 flex items-center gap-2"
            >
              <span className="text-base font-extrabold">+</span> Schedule Session
            </button>
          </div>
        )}
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

      {/* 4 REAL-TIME KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-surface rounded-3xl p-6 border border-line shadow-xs hover:shadow-md transition-all flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-fg-4 uppercase tracking-wider">Active Class Types</p>
            <p className="text-3xl font-black text-fg mt-1.5">{loading ? "..." : kpiMetrics.activeClassTypes}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shadow-xs">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" /></svg>
          </div>
        </div>

        <div className="bg-surface rounded-3xl p-6 border border-line shadow-xs hover:shadow-md transition-all flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-fg-4 uppercase tracking-wider">Today&apos;s Sessions</p>
            <p className="text-3xl font-black text-fg mt-1.5">{loading ? "..." : kpiMetrics.todaySessionsCount}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shadow-xs">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
        </div>

        <div className="bg-surface rounded-3xl p-6 border border-line shadow-xs hover:shadow-md transition-all flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-fg-4 uppercase tracking-wider">Total Active Bookings</p>
            <p className="text-3xl font-black text-fg mt-1.5">{loading ? "..." : kpiMetrics.totalActiveBookings}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center shadow-xs">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          </div>
        </div>

        <div className="bg-surface rounded-3xl p-6 border border-line shadow-xs hover:shadow-md transition-all flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-fg-4 uppercase tracking-wider">Attendance Rate</p>
            <p className="text-3xl font-black text-fg mt-1.5">{loading ? "..." : `${kpiMetrics.avgAttendancePercent}%`}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shadow-xs">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
        </div>
      </div>

      {/* 4 INDEPENDENT TABS NAVIGATION */}
      <div className="flex items-center gap-3 border-b border-line pb-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab("class_types")}
          className={`px-6 py-3 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap ${
            activeTab === "class_types"
              ? "bg-accent text-white shadow-lg shadow-accent/25"
              : "text-fg-3 hover:text-fg hover:bg-surface"
          }`}
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          Class Types ({classTypes.length})
        </button>

        <button
          onClick={() => setActiveTab("schedule")}
          className={`px-6 py-3 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap ${
            activeTab === "schedule"
              ? "bg-accent text-white shadow-lg shadow-accent/25"
              : "text-fg-3 hover:text-fg hover:bg-surface"
          }`}
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          Schedule Board ({sessions.length})
        </button>

        <button
          onClick={() => setActiveTab("sessions")}
          className={`px-6 py-3 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap ${
            activeTab === "sessions"
              ? "bg-accent text-white shadow-lg shadow-accent/25"
              : "text-fg-3 hover:text-fg hover:bg-surface"
          }`}
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Sessions
        </button>
      </div>

      {/* ─── TAB 1: CLASS TYPES ────────────────────────────────────────────── */}
      {activeTab === "class_types" && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-fg">Master Class Templates</h2>
            <button
              onClick={handleOpenCreateClassType}
              className="px-5 py-2.5 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-2 shadow-xs transition-all"
            >
              + Create Class Type
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classTypes.map((ct) => (
              <div key={ct.id} className="bg-surface rounded-3xl border border-line p-6 shadow-xs flex flex-col justify-between space-y-5 hover:shadow-md transition-all">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-accent uppercase tracking-wider bg-accent/10 px-3 py-1 rounded-lg inline-block mb-2">
                        {ct.category}
                      </span>
                      <h3 className="text-xl font-extrabold text-fg leading-tight">{ct.name}</h3>
                    </div>
                    <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 flex-shrink-0">
                      {ct.difficulty}
                    </span>
                  </div>
                  {ct.description && <p className="text-xs text-fg-3 mt-3 leading-relaxed line-clamp-2">{ct.description}</p>}
                </div>

                <div className="pt-4 border-t border-line space-y-2 text-xs text-fg-2">
                  <div className="flex justify-between">
                    <span className="font-semibold text-fg-4">Trainer:</span>
                    <span className="font-bold text-fg">{ct.trainer}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-fg-4">Duration &amp; Capacity:</span>
                    <span className="font-bold text-fg">{ct.duration_minutes} mins &bull; {ct.max_capacity} max</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-fg-4">Studio Room:</span>
                    <span className="font-bold text-fg">{ct.location_room}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-line">
                  <button
                    onClick={() => handleOpenEditClassType(ct)}
                    className="flex-1 py-2.5 bg-surface-2 border border-accent/20 text-accent rounded-xl text-xs font-bold hover:bg-accent/10 transition-colors"
                  >
                    Edit
                  </button>
                  {hasPerm("classes.create") && (
                    <button
                      onClick={() => {
                        setSessClassTypeId(ct.id);
                        setSessTitle(ct.name);
                        setSessTrainer(ct.trainer);
                        setSessDuration(ct.duration_minutes);
                        setSessCapacity(ct.max_capacity);
                        setSessRoom(ct.location_room);
                        setShowScheduleModal(true);
                      }}
                      className="flex-1 py-2.5 bg-accent text-white rounded-xl text-xs font-bold hover:bg-accent-2 transition-colors shadow-xs"
                    >
                      Schedule
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 2: SCHEDULE BOARD (GOOGLE CALENDAR INTERFACE) ─────────────── */}
      {activeTab === "schedule" && (
        <div className="space-y-6 animate-fade-in">
          {/* Calendar Toolbar Header */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-surface rounded-3xl border border-line p-5 gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setWeekOffset((prev) => prev - 1)}
                className="px-3.5 py-2 rounded-xl border border-line-2 bg-surface-2 hover:bg-accent/10 text-accent font-bold text-xs transition-colors"
              >
                &larr; Prev Week
              </button>
              <button
                onClick={() => setWeekOffset(0)}
                className="px-4 py-2 rounded-xl bg-accent text-white font-bold text-xs hover:bg-accent-2 transition-colors shadow-xs"
              >
                Today
              </button>
              <button
                onClick={() => setWeekOffset((prev) => prev + 1)}
                className="px-3.5 py-2 rounded-xl border border-line-2 bg-surface-2 hover:bg-accent/10 text-accent font-bold text-xs transition-colors"
              >
                Next Week &rarr;
              </button>
              <span className="text-base font-extrabold text-fg ml-3">{weekHeaderDateRange}</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-surface-2 p-1.5 rounded-2xl border border-line">
                {(["day", "week", "month"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setCalendarView(v)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${
                      calendarView === v
                        ? "bg-accent text-white shadow-xs"
                        : "text-fg-3 hover:text-fg"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {hasPerm("classes.create") && (
                <button
                  onClick={() => setShowScheduleModal(true)}
                  className="px-5 py-2.5 bg-accent text-white rounded-xl text-xs font-bold hover:bg-accent-2 shadow-xs"
                >
                  + Add Session
                </button>
              )}
            </div>
          </div>

          {/* ── GOOGLE CALENDAR WEEKLY TIME GRID ── */}
          <div className="bg-surface rounded-3xl border border-line shadow-md overflow-x-auto">
            <div className="min-w-[950px]">
              {/* Day Columns Header Row */}
              <div className="grid grid-cols-[90px_repeat(7,1fr)] border-b border-line bg-surface-2 text-center sticky top-0 z-10">
                <div className="p-4 text-xs font-bold text-fg-4 border-r border-line uppercase flex items-center justify-center">
                  Time
                </div>
                {currentWeekDays.map((day) => (
                  <div
                    key={day.isoDate}
                    className={`p-3.5 border-r border-line last:border-r-0 flex flex-col items-center justify-center transition-colors ${
                      day.isToday ? "bg-accent/10" : ""
                    }`}
                  >
                    <span className="text-xs font-bold text-fg-3 uppercase">{day.dayName}</span>
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black mt-1 ${
                        day.isToday
                          ? "bg-accent text-white shadow-md shadow-accent/30"
                          : "text-fg"
                      }`}
                    >
                      {day.dayNum}
                    </span>
                  </div>
                ))}
              </div>

              {/* Time Slot Rows */}
              <div className="divide-y divide-line">
                {TIME_SLOTS.map((slot) => {
                  const displayTimeLabel = formatSlotHour(slot);
                  const slotHourPrefix = slot.substring(0, 2);

                  return (
                    <div key={slot} className="grid grid-cols-[90px_repeat(7,1fr)] min-h-[95px]">
                      {/* Left Time Column */}
                      <div className="p-2 text-xs font-bold text-fg-4 border-r border-line bg-surface-2/60 text-center flex items-center justify-center">
                        {displayTimeLabel}
                      </div>

                      {/* 7 Day Grid Cells */}
                      {currentWeekDays.map((day) => {
                        const matchedSessions = sessions.filter(
                          (s) => s.class_date === day.isoDate && s.class_time.startsWith(slotHourPrefix)
                        );

                        return (
                          <div
                            key={day.isoDate}
                            onClick={() => {
                              if (matchedSessions.length === 0) {
                                setSessDate(day.isoDate);
                                setSessTime(slot);
                                setShowScheduleModal(true);
                              }
                            }}
                            className={`p-2 border-r border-line last:border-r-0 relative group transition-colors hover:bg-surface-2 ${
                              day.isToday ? "bg-accent/3" : ""
                            }`}
                          >
                            {matchedSessions.length === 0 ? (
                              <div className="w-full h-full min-h-[75px] rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[10px] font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-lg">
                                  + Add {slot}
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {matchedSessions.map((s) => {
                                  const booked = sessionBookingCountMap[s.id] || 0;
                                  const isFull = booked >= s.max_capacity;

                                  return (
                                    <div
                                      key={s.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenSessionDetail(s);
                                      }}
                                      className={`p-3 rounded-2xl text-white shadow-sm hover:scale-[1.02] transition-all cursor-pointer border border-white/20 ${
                                        s.status === "cancelled"
                                          ? "bg-red-500/80 line-through opacity-80"
                                          : isFull
                                          ? "bg-rail"
                                          : "bg-gradient-to-r from-accent to-accent-3"
                                      }`}
                                    >
                                      <p className="font-extrabold text-xs leading-tight line-clamp-1">
                                        {s.title}
                                      </p>
                                      <p className="text-[10px] text-white/80 mt-1 font-semibold">
                                        {s.class_time} &bull; {s.instructor}
                                      </p>
                                      <div className="mt-1.5 flex items-center justify-between text-[9px]">
                                        <span className="bg-surface/20 px-2 py-0.5 rounded-md font-bold">
                                          {booked}/{s.max_capacity}
                                        </span>
                                        {s.status === "cancelled" ? (
                                          <span className="font-bold text-red-200">CANCELLED</span>
                                        ) : isFull ? (
                                          <span className="font-bold text-amber-300">FULL</span>
                                        ) : (
                                          <span className="font-bold text-emerald-300">OPEN</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
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
      )}

      {/* ─── TAB 3: SESSIONS LIST ─────────────────────────────────────────── */}
      {activeTab === "sessions" && (
        <div className="bg-surface rounded-3xl border border-line overflow-hidden shadow-xs animate-fade-in">
          <div className="p-5 border-b border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-fg">Sessions</h2>
              <p className="text-xs text-fg-4 mt-0.5">Showing sessions for selected date</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={selectedSessionDate}
                onChange={(e) => setSelectedSessionDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs font-semibold text-fg focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <button
                onClick={() => setShowScheduleModal(true)}
                className="px-5 py-2.5 bg-accent text-white rounded-xl text-xs font-bold hover:bg-accent-2"
              >
                + Add Session
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-2 border-b border-line text-fg-3 uppercase font-bold text-[10px]">
                <tr>
                  <th className="py-4 px-6">Session Title</th>
                  <th className="py-4 px-6">Trainer</th>
                  <th className="py-4 px-6">Date &amp; Time</th>
                  <th className="py-4 px-6">Room</th>
                  <th className="py-4 px-6">Capacity / Booked</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sessions
                  .filter((s) => s.class_date === selectedSessionDate)
                  .map((s) => {
                  const booked = sessionBookingCountMap[s.id] || 0;
                  return (
                    <tr key={s.id} className="hover:bg-surface-2/60 transition-colors">
                      <td className="py-4 px-6 font-extrabold text-fg text-sm">{s.title}</td>
                      <td className="py-4 px-6 font-semibold text-fg-2">{s.instructor}</td>
                      <td className="py-4 px-6 font-bold text-fg">{formatDate(s.class_date)} @ {formatTime(s.class_time)}</td>
                      <td className="py-4 px-6 text-fg-2 font-medium">{s.location_room}</td>
                      <td className="py-4 px-6 font-extrabold text-accent">{booked} / {s.max_capacity}</td>
                      <td className="py-4 px-6">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          s.status === "cancelled" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => handleOpenAssignMember(s)}
                          disabled={s.status === "cancelled"}
                          className="px-4 py-2 bg-accent text-white rounded-xl text-xs font-bold hover:bg-accent-2 disabled:opacity-50 shadow-xs inline-block"
                        >
                          Assign Member
                        </button>
                        {s.status !== "cancelled" && (
                          <button
                            onClick={() => handleCancelSession(s.id)}
                            className="px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold hover:bg-red-100 shadow-xs inline-block"
                          >
                            Cancel Session
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── CREATE CLASS TYPE MODAL ─────────────────────────────────────── */}
      {showCreateClassTypeModal && (
        <Modal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6">
          <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-2xl w-full p-6 flex flex-col max-h-[90vh] animate-fade-in space-y-5 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-4 flex-shrink-0">
              <div>
                <h3 className="text-2xl font-extrabold text-fg">{editingClassType ? "Edit Class Type" : "Create Master Class Type"}</h3>
                <p className="text-xs text-fg-3 mt-0.5">Define master class template settings and booking policies</p>
              </div>
              <button onClick={() => setShowCreateClassTypeModal(false)} className="w-8 h-8 rounded-full bg-surface-2 hover:bg-accent/10 text-base font-bold text-fg-3 flex items-center justify-center transition-colors">✕</button>
            </div>

            <form onSubmit={handleSaveClassType} className="flex-1 overflow-y-auto pr-2 space-y-6 text-xs">
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-accent">Basic Information</p>
                
                <div>
                  <label className="block font-bold text-fg mb-1.5">Class Name *</label>
                  <input type="text" required value={ctName} onChange={(e) => setCtName(e.target.value)} placeholder="e.g. Reformer Basic" className="w-full p-3 rounded-2xl border border-line-2 bg-surface-2 text-sm text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-fg mb-1.5">Category</label>
                    <input type="text" value={ctCategory} onChange={(e) => setCtCategory(e.target.value)} className="w-full p-3 rounded-2xl border border-line-2 bg-surface-2 text-sm text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block font-bold text-fg mb-1.5">Trainer *</label>
                    <input type="text" required value={ctTrainer} onChange={(e) => setCtTrainer(e.target.value)} className="w-full p-3 rounded-2xl border border-line-2 bg-surface-2 text-sm text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-fg mb-1.5">Description</label>
                  <textarea rows={2} value={ctDescription} onChange={(e) => setCtDescription(e.target.value)} placeholder="Class details and overview..." className="w-full p-3 rounded-2xl border border-line-2 bg-surface-2 text-sm text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none resize-none" />
                </div>
              </div>

              <div className="space-y-4 pt-2 border-t border-line">
                <p className="text-xs font-bold uppercase tracking-wider text-accent">Class Capacity &amp; Location</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-bold text-fg mb-1.5">Duration (mins) *</label>
                    <input type="number" min="1" required value={ctDuration} onChange={(e) => setCtDuration(Number(e.target.value))} className="w-full p-3 rounded-2xl border border-line-2 bg-surface-2 text-sm text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block font-bold text-fg mb-1.5">Max Capacity *</label>
                    <input type="number" min="1" required value={ctCapacity} onChange={(e) => setCtCapacity(Number(e.target.value))} className="w-full p-3 rounded-2xl border border-line-2 bg-surface-2 text-sm text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block font-bold text-fg mb-1.5">Studio Room</label>
                    <input type="text" value={ctRoom} onChange={(e) => setCtRoom(e.target.value)} className="w-full p-3 rounded-2xl border border-line-2 bg-surface-2 text-sm text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-surface-2 rounded-2xl border border-line flex items-center justify-between gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={ctAllowBooking} onChange={(e) => setCtAllowBooking(e.target.checked)} className="w-4 h-4 accent-accent rounded-md" />
                  <span className="font-extrabold text-fg text-xs">Allow Member Self-Booking</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={ctWaitlistEnabled} onChange={(e) => setCtWaitlistEnabled(e.target.checked)} className="w-4 h-4 accent-accent rounded-md" />
                  <span className="font-extrabold text-fg text-xs">Enable Waitlist Queue</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line flex-shrink-0">
                <button type="button" onClick={() => setShowCreateClassTypeModal(false)} className="px-6 py-3 border border-line-2 rounded-2xl font-bold text-xs text-fg hover:bg-black/5 transition-all">Cancel</button>
                <button type="submit" disabled={actionLoading} className="px-7 py-3 bg-accent text-white font-extrabold text-xs rounded-2xl hover:bg-accent-2 transition-all shadow-md shadow-accent/20">Save Class Type</button>
              </div>
            </form>
          </div>
        </div>
        </Modal>
      )}

      {/* ─── SCHEDULE SESSION MODAL (COMPACT ZERO-SCROLL 2-COLUMN LAYOUT) ───── */}
      {showScheduleModal && (
        <Modal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-4">
          <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-3xl w-full p-5 flex flex-col animate-fade-in space-y-3.5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line pb-2.5 flex-shrink-0">
              <div>
                <h3 className="text-xl font-extrabold text-fg">{editingSession ? "Edit Class Session" : "Schedule Class Session"}</h3>
                <p className="text-[11px] text-fg-3 mt-0.5">{editingSession ? "Modify the session details below" : "Fill session details below — fits in a single view"}</p>
              </div>
              <button onClick={() => setShowScheduleModal(false)} className="w-7 h-7 rounded-full bg-surface-2 hover:bg-accent/10 text-xs font-bold text-fg-3 flex items-center justify-center transition-colors">✕</button>
            </div>

            {/* Form Body - Compact 2-Column Grid */}
            <form onSubmit={handleSaveScheduledSession} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
                {/* Left Column */}
                <div className="space-y-2.5">
                  <div>
                    <label className="block font-bold text-fg text-[11px] mb-1">Class Master Template (Optional)</label>
                    <select
                      value={sessClassTypeId}
                      onChange={(e) => handleSelectClassTypeForSession(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs font-semibold text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                    >
                      <option value="">-- Custom Session --</option>
                      {classTypes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.trainer})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-fg text-[11px] mb-1">Session Title *</label>
                    <input type="text" required value={sessTitle} onChange={(e) => setSessTitle(e.target.value)} placeholder="e.g. Morning Reformer Group Class" className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                  </div>

                  <div>
                    <label className="block font-bold text-fg text-[11px] mb-1">Trainer *</label>
                    <input type="text" required value={sessTrainer} onChange={(e) => setSessTrainer(e.target.value)} placeholder="Rahul Sharma" className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                  </div>

                  <div>
                    <label className="block font-bold text-fg text-[11px] mb-1">Max Capacity *</label>
                    <input type="number" min="1" required value={sessCapacity} onChange={(e) => setSessCapacity(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-2.5">
                  <div>
                    <label className="block font-bold text-fg text-[11px] mb-1">Date *</label>
                    <input type="date" required value={sessDate} onChange={(e) => setSessDate(e.target.value)} className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-fg text-[11px] mb-1">Start Time *</label>
                      <input type="time" required value={sessTime} onChange={(e) => setSessTime(e.target.value)} className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold text-fg text-[11px] mb-1">Duration (mins)</label>
                      <input type="number" min="1" value={sessDuration} onChange={(e) => setSessDuration(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-fg text-[11px] mb-1">Buffer Time (mins)</label>
                      <input type="number" min="0" value={sessBuffer} onChange={(e) => setSessBuffer(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold text-fg text-[11px] mb-1">Studio Room</label>
                      <input type="text" value={sessRoom} onChange={(e) => setSessRoom(e.target.value)} placeholder="Studio Room A" className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Recurring Rules Section */}
              <div className="p-3 bg-surface-2 rounded-2xl border border-line space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={isRecurring} onChange={(e) => { setIsRecurring(e.target.checked); if (!e.target.checked) setRecurringDays([]); }} className="w-3.5 h-3.5 accent-accent rounded-md" />
                  <span className="font-extrabold text-fg text-xs">Recurring Session Schedule</span>
                </label>

                {isRecurring && (
                  <div className="pt-2 border-t border-line space-y-3">
                    {/* Day of Week Toggles */}
                    <div>
                      <p className="text-[11px] font-bold text-fg-3 mb-2 uppercase tracking-wider">Repeat on</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleRecurringDay(i)}
                            className={`w-9 h-9 rounded-full text-[11px] font-extrabold transition-all ${
                              recurringDays.includes(i)
                                ? "bg-accent text-white shadow-md shadow-accent/30"
                                : "bg-surface border border-line/20 text-fg-3 hover:border-accent/50"
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Number of Weeks */}
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-bold text-fg-3 uppercase tracking-wider">Repeat for</span>
                      <input
                        type="number"
                        min="1"
                        max="52"
                        value={recurringWeeks}
                        onChange={(e) => setRecurringWeeks(Math.max(1, Number(e.target.value)))}
                        className="w-16 p-1.5 bg-surface border border-line-2 rounded-lg text-center font-extrabold text-xs text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                      />
                      <span className="text-[11px] font-bold text-fg-3">weeks</span>
                      {recurringDays.length > 0 && (
                        <span className="text-[10px] font-semibold text-accent bg-accent/10 px-2 py-1 rounded-lg">
                          = {recurringDays.length * recurringWeeks} sessions
                        </span>
                      )}
                    </div>

                    {recurringDays.length === 0 && (
                      <p className="text-[10px] text-amber-600 font-semibold">Select at least one day to enable recurrence.</p>
                    )}
                  </div>
                )}
              </div>

              {actionError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center justify-between">
                  <span>{actionError}</span>
                  <button type="button" onClick={() => setActionError(null)} className="text-red-500 hover:text-red-700 font-bold ml-2">✕</button>
                </div>
              )}

              {/* Footer Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button type="button" onClick={() => setShowScheduleModal(false)} className="px-5 py-2.5 border border-line-2 rounded-xl font-bold text-xs text-fg hover:bg-black/5 transition-all">Cancel</button>
                <button type="submit" disabled={actionLoading} className="px-6 py-2.5 bg-accent text-white font-extrabold text-xs rounded-xl hover:bg-accent-2 transition-all shadow-md shadow-accent/20">
                  {editingSession ? "Save Changes" : "Save Session(s)"}
                </button>
              </div>
            </form>
          </div>
        </div>
        </Modal>
      )}

      {/* ─── ASSIGN MEMBER MODAL ─────────────────────────────────────────── */}
      {showAssignMemberModal && targetSessionForAssign && (
        <Modal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6">
          <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-lg w-full p-7 flex flex-col animate-fade-in space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-4 flex-shrink-0">
              <h3 className="text-xl font-extrabold text-fg">Assign Member to Session</h3>
              <button onClick={() => setShowAssignMemberModal(false)} className="w-8 h-8 rounded-full bg-surface-2 hover:bg-accent/10 text-base font-bold text-fg-3 flex items-center justify-center transition-colors">✕</button>
            </div>

            <div className="bg-surface-2 p-4 rounded-2xl border border-line text-xs space-y-1">
              <p className="font-extrabold text-sm text-fg">{targetSessionForAssign.title}</p>
              <p className="text-fg-3 font-semibold">{formatDate(targetSessionForAssign.class_date)} @ {formatTime(targetSessionForAssign.class_time)} &bull; {targetSessionForAssign.instructor}</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-fg mb-2">Select Member *</label>
              <select
                value={selectedAssignMemberId}
                onChange={(e) => setSelectedAssignMemberId(e.target.value)}
                className="w-full p-3.5 rounded-2xl border border-line-2 bg-surface-2 text-xs font-semibold text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
              >
                <option value="">-- Choose Member --</option>
                {membersList.map((m) => {
                  const activePlan = m.plans && m.plans.find((p: any) => p.status === "active");
                  const planLabel = activePlan
                    ? `${activePlan.plan_name}${activePlan.sessions_remaining !== null && activePlan.sessions_remaining !== undefined ? ` (${activePlan.sessions_remaining} left)` : ""}`
                    : "No Active Plan";
                  return (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.phone_number || m.email}) — {planLabel}
                    </option>
                  );
                })}
              </select>
            </div>

            {actionError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center justify-between">
                <span>{actionError}</span>
                <button type="button" onClick={() => setActionError(null)} className="text-red-500 hover:text-red-700 font-bold ml-2">✕</button>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-line flex-shrink-0">
              <button onClick={() => setShowAssignMemberModal(false)} className="px-6 py-3 border border-line-2 rounded-2xl font-bold text-xs text-fg hover:bg-black/5 transition-all">Cancel</button>
              <button onClick={handleConfirmMemberAssignment} disabled={actionLoading || !selectedAssignMemberId} className="px-7 py-3 bg-accent text-white font-extrabold text-xs rounded-2xl hover:bg-accent-2 transition-all shadow-md shadow-accent/20">
                {actionLoading ? "Assigning..." : "Confirm Booking"}
              </button>
            </div>
          </div>
        </div>
        </Modal>
      )}

      {/* ─── SESSION DETAIL MODAL ─────────────────────────────────────────── */}
      {showSessionDetailModal && selectedSessionForDetail && (
        <Modal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6">
          <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-2xl w-full p-7 flex flex-col animate-fade-in space-y-5 max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-line pb-4 flex-shrink-0">
              <div>
                <h3 className="text-xl font-extrabold text-fg">Class Session Details</h3>
                <p className="text-xs text-fg-3 mt-0.5 font-medium">Manage session details, bookings, and operations</p>
              </div>
              <button onClick={() => setShowSessionDetailModal(false)} className="w-8 h-8 rounded-full bg-surface-2 hover:bg-accent/10 text-base font-bold text-fg-3 flex items-center justify-center transition-colors">✕</button>
            </div>

            {/* Session Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-surface-2 rounded-2xl border border-line text-xs flex-shrink-0">
              <div>
                <span className="block text-fg-4 font-bold uppercase text-[9px] tracking-wider">Class Title</span>
                <span className="font-extrabold text-fg text-sm">{selectedSessionForDetail.title}</span>
              </div>
              <div>
                <span className="block text-fg-4 font-bold uppercase text-[9px] tracking-wider">Trainer</span>
                <span className="font-bold text-fg">{selectedSessionForDetail.instructor}</span>
              </div>
              <div>
                <span className="block text-fg-4 font-bold uppercase text-[9px] tracking-wider">Date &amp; Time</span>
                <span className="font-bold text-fg">{formatDate(selectedSessionForDetail.class_date)} @ {formatTime(selectedSessionForDetail.class_time)}</span>
              </div>
              <div>
                <span className="block text-fg-4 font-bold uppercase text-[9px] tracking-wider">Room &amp; Capacity</span>
                <span className="font-bold text-fg">{selectedSessionForDetail.location_room} ({sessionBookingCountMap[selectedSessionForDetail.id] || 0} / {selectedSessionForDetail.max_capacity})</span>
              </div>
            </div>

            {/* Booked Members List */}
            <div className="flex-1 overflow-y-auto min-h-[150px] space-y-3">
              <h4 className="text-xs font-bold text-fg-2 uppercase tracking-wider">Booked Members ({bookings.filter(b => b.class_id === selectedSessionForDetail.id && b.booking_status !== 'cancelled').length})</h4>
              {(() => {
                const sessionBookings = bookings.filter(b => b.class_id === selectedSessionForDetail.id && b.booking_status !== 'cancelled');
                if (sessionBookings.length === 0) {
                  return (
                    <div className="py-8 text-center text-xs text-fg-4 bg-surface-2/50 border border-dashed border-line-2 rounded-2xl">
                      No members are booked for this session yet.
                    </div>
                  );
                }
                return (
                  <div className="space-y-2.5">
                    {sessionBookings.map(b => (
                      <div key={b.id} className="p-3 bg-surface border border-line rounded-2xl flex items-center justify-between text-xs shadow-2xs">
                        <div>
                          <p className="font-extrabold text-fg">{b.approved_members?.full_name || "Member"}</p>
                          <p className="text-[10px] text-fg-4 mt-0.5">{b.approved_members?.phone_number || b.approved_members?.email || "No contact info"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={b.booking_status}
                            onChange={(e) => handleUpdateBookingStatus(b.id, e.target.value)}
                            className="p-1.5 rounded-lg border border-line-2 bg-surface-2 text-[10px] font-bold text-accent focus:outline-none"
                          >
                            <option value="booked">Booked</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="checked_in">Checked In</option>
                            <option value="completed">Completed</option>
                            <option value="waitlisted">Waitlisted</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                          <select
                            value={b.attendance_status}
                            onChange={(e) => handleUpdateAttendance(b.id, e.target.value)}
                            className="p-1.5 rounded-lg border border-line-2 bg-surface-2 text-[10px] font-bold text-fg focus:outline-none"
                          >
                            <option value="pending">Pending</option>
                            <option value="present">Present</option>
                            <option value="no_show">No Show</option>
                            <option value="late">Late</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-line flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEditSession(selectedSessionForDetail)}
                  className="px-4.5 py-2.5 border border-accent/30 text-accent hover:bg-accent/5 rounded-xl font-bold text-xs transition-colors"
                >
                  Edit Session
                </button>
                <button
                  onClick={() => handleDeleteSession(selectedSessionForDetail.id)}
                  className="px-4.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold text-xs transition-colors"
                >
                  Delete Session
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    handleOpenAssignMember(selectedSessionForDetail);
                    setShowSessionDetailModal(false);
                  }}
                  disabled={selectedSessionForDetail.status === "cancelled"}
                  className="px-5 py-2.5 bg-accent text-white hover:bg-accent-2 rounded-xl font-extrabold text-xs transition-colors disabled:opacity-50"
                >
                  Assign Member
                </button>
                <button
                  onClick={() => setShowSessionDetailModal(false)}
                  className="px-5 py-2.5 border border-line-2 rounded-xl font-bold text-xs text-fg hover:bg-black/5 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
        </Modal>
      )}
    </div>
  );
}
