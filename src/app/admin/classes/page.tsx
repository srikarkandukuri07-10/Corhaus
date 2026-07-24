"use client";

import { useEffect, useState, useCallback, useMemo, useTransition } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

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
  const [activeTab, setActiveTab] = useState<"class_types" | "schedule" | "sessions" | "bookings">("schedule");
  const [calendarView, setCalendarView] = useState<"day" | "week" | "month">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  
  // Realtime Supabase Data
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [membersList, setMembersList] = useState<MemberOption[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState("All");
  const [filterTrainer, setFilterTrainer] = useState("All");
  const [filterBookingStatus, setFilterBookingStatus] = useState("All");
  const [filterAttendanceStatus, setFilterAttendanceStatus] = useState("All");
  const [selectedDateFilter, setSelectedDateFilter] = useState("");

  // Modals state
  const [showCreateClassTypeModal, setShowCreateClassTypeModal] = useState(false);
  const [editingClassType, setEditingClassType] = useState<ClassType | null>(null);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSession, setEditingSession] = useState<ScheduledSession | null>(null);

  const [showAssignMemberModal, setShowAssignMemberModal] = useState(false);
  const [targetSessionForAssign, setTargetSessionForAssign] = useState<ScheduledSession | null>(null);
  const [selectedAssignMemberId, setSelectedAssignMemberId] = useState("");

  const [rescheduleBookingTarget, setRescheduleBookingTarget] = useState<BookingRecord | null>(null);
  const [targetRescheduleSessionId, setTargetRescheduleSessionId] = useState("");

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
  const [recurringFrequency, setRecurringFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [recurringEndOption, setRecurringEndOption] = useState<"count" | "date">("count");
  const [recurringOccurrences, setRecurringOccurrences] = useState(4);
  const [recurringEndDate, setRecurringEndDate] = useState("");

  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  // Prevent background scroll when any modal is open
  const isAnyModalOpen = showCreateClassTypeModal || showScheduleModal || showAssignMemberModal || !!rescheduleBookingTarget;
  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
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
  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);

      const { data: ctData } = await supabase.from("class_types").select("*").order("name");
      const { data: sessData } = await supabase.from("classes").select("*").order("class_date", { ascending: true }).order("class_time", { ascending: true });
      const { data: bkData } = await supabase.from("bookings").select("*, classes(*), approved_members(full_name, email, phone_number), member_purchased_plans(plan_name, category, sessions_remaining, status)").order("created_at", { ascending: false });
      
      // Fetch approved members and purchased plans separately for reliable JS mapping
      const { data: memData } = await supabase.from("approved_members").select("id, full_name, email, phone_number").order("full_name");
      const { data: plansData } = await supabase.from("member_purchased_plans").select("id, approved_member_id, plan_name, category, sessions_remaining, sessions_total, valid_until, status");

      const membersWithPlans = (memData || []).map((m: any) => {
        const userPlans = (plansData || []).filter((p: any) => p.approved_member_id === m.id);
        return {
          ...m,
          plans: userPlans,
        };
      });

      startTransition(() => {
        if (ctData) setClassTypes(ctData as ClassType[]);
        if (sessData) setSessions(sessData as ScheduledSession[]);
        if (bkData) setBookings(bkData as BookingRecord[]);
        setMembersList(membersWithPlans as any[]);
        setLoading(false);
      });
    } catch (err) {
      console.error("Error fetching studio classes data:", err);
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    const channel = supabase
      .channel("studio-classes-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "classes" }, () => fetchAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "class_types" }, () => fetchAllData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchAllData]);

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
        map[b.class_id] = (map[b.class_id] || 0) + 1;
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

    const payload = {
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

    let error;
    if (editingClassType) {
      const res = await supabase.from("class_types").update(payload).eq("id", editingClassType.id);
      error = res.error;
    } else {
      const res = await supabase.from("class_types").insert(payload);
      error = res.error;
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

    const sessionInserts = [];

    if (isRecurring) {
      const dates: string[] = [];
      let currentDate = new Date(sessDate + "T00:00:00");
      let maxCount = recurringOccurrences;

      if (recurringEndOption === "date" && recurringEndDate) {
        const endDateObj = new Date(recurringEndDate + "T00:00:00");
        maxCount = 99;
        while (currentDate <= endDateObj && dates.length < 52) {
          dates.push(currentDate.toISOString().split("T")[0]);
          if (recurringFrequency === "daily") currentDate.setDate(currentDate.getDate() + 1);
          else if (recurringFrequency === "weekly") currentDate.setDate(currentDate.getDate() + 7);
          else if (recurringFrequency === "monthly") currentDate.setMonth(currentDate.getMonth() + 1);
        }
      } else {
        for (let i = 0; i < maxCount; i++) {
          dates.push(currentDate.toISOString().split("T")[0]);
          if (recurringFrequency === "daily") currentDate.setDate(currentDate.getDate() + 1);
          else if (recurringFrequency === "weekly") currentDate.setDate(currentDate.getDate() + 7);
          else if (recurringFrequency === "monthly") currentDate.setMonth(currentDate.getMonth() + 1);
        }
      }

      dates.forEach((d) => {
        sessionInserts.push({ ...basePayload, class_date: d });
      });
    } else {
      sessionInserts.push({ ...basePayload, class_date: sessDate });
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

    const { data, error } = await supabase.rpc("book_member_class_session", {
      p_member_id: selectedAssignMemberId,
      p_class_id: targetSessionForAssign.id,
    });

    setActionLoading(false);
    if (error) {
      setActionError("Booking Failed: " + error.message);
    } else {
      setActionSuccess(`Member assigned successfully! Status: ${data?.status || "Booked"}`);
      setShowAssignMemberModal(false);
      fetchAllData();
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: string) => {
    setActionLoading(true);
    if (status === "cancelled") {
      const { error } = await supabase.rpc("cancel_member_class_booking", { p_booking_id: bookingId });
      if (error) setActionError("Failed to cancel booking: " + error.message);
    } else {
      const updateData: any = { booking_status: status };
      if (status === "checked_in") {
        updateData.checked_in_at = new Date().toISOString();
        updateData.attendance_status = "present";
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
    if (attendanceStatus === "present") {
      updateObj.booking_status = "checked_in";
      updateObj.checked_in_at = new Date().toISOString();
    } else if (attendanceStatus === "no_show") {
      updateObj.booking_status = "no_show";
    }
    const { error } = await supabase.from("bookings").update(updateObj).eq("id", bookingId);
    setActionLoading(false);
    if (error) setActionError("Failed to update attendance: " + error.message);
    else fetchAllData();
  };

  const handleRescheduleBooking = async () => {
    if (!rescheduleBookingTarget || !targetRescheduleSessionId) return;

    setActionLoading(true);
    const { error } = await supabase.rpc("reschedule_member_class_booking", {
      p_booking_id: rescheduleBookingTarget.id,
      p_new_class_id: targetRescheduleSessionId,
    });

    setActionLoading(false);
    if (error) {
      setActionError("Failed to reschedule: " + error.message);
    } else {
      setActionSuccess("Booking rescheduled successfully!");
      setRescheduleBookingTarget(null);
      fetchAllData();
    }
  };

  const exportBookingsToCSV = () => {
    if (bookings.length === 0) return;
    const headers = ["Member Name", "Email", "Phone", "Class Title", "Trainer", "Date", "Time", "Booking Status", "Attendance", "Package"];
    const rows = filteredBookings.map((b) => [
      b.approved_members?.full_name || "N/A",
      b.approved_members?.email || "N/A",
      b.approved_members?.phone_number || "N/A",
      b.classes?.title || "N/A",
      b.classes?.instructor || "N/A",
      b.classes?.class_date || "N/A",
      b.classes?.class_time || "N/A",
      b.booking_status,
      b.attendance_status,
      b.member_purchased_plans?.plan_name || "Active Membership",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.map((x) => `"${x}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Corhaus_Bookings_Report_${getTodayIstString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (filterClass !== "All" && b.classes?.title !== filterClass) return false;
      if (filterTrainer !== "All" && b.classes?.instructor !== filterTrainer) return false;
      if (filterBookingStatus !== "All" && b.booking_status !== filterBookingStatus) return false;
      if (filterAttendanceStatus !== "All" && b.attendance_status !== filterAttendanceStatus) return false;
      if (selectedDateFilter && b.classes?.class_date !== selectedDateFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mName = b.approved_members?.full_name?.toLowerCase() || "";
        const mPhone = b.approved_members?.phone_number?.toLowerCase() || "";
        const cTitle = b.classes?.title?.toLowerCase() || "";
        return mName.includes(q) || mPhone.includes(q) || cTitle.includes(q);
      }
      return true;
    });
  }, [bookings, filterClass, filterTrainer, filterBookingStatus, filterAttendanceStatus, selectedDateFilter, searchQuery]);

  return (
    <div className="space-y-8 animate-fade-in font-sans pb-12">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1B0B38] tracking-tight">
            Classes &amp; Studio <span className="text-[#7B3FE4]">Management</span>
          </h1>
          <p className="text-sm text-[#1B0B38]/60 mt-1.5 font-medium">
            Manage class types, calendar schedule board, session bookings, and studio check-ins
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSessClassTypeId("");
              setSessTitle("");
              setShowScheduleModal(true);
            }}
            className="px-6 py-3 rounded-2xl bg-[#7B3FE4] text-white text-xs font-bold hover:bg-[#6A2FD3] transition-all shadow-md shadow-[#7B3FE4]/25 flex items-center gap-2"
          >
            <span className="text-base font-extrabold">+</span> Schedule Session
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

      {/* 4 REAL-TIME KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-[#1B0B38]/10 shadow-xs hover:shadow-md transition-all flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-[#1B0B38]/50 uppercase tracking-wider">Active Class Types</p>
            <p className="text-3xl font-black text-[#1B0B38] mt-1.5">{loading ? "..." : kpiMetrics.activeClassTypes}</p>
          </div>
          <div className="w-13 h-13 rounded-2xl bg-[#F2EBFE] text-[#7B3FE4] flex items-center justify-center font-bold text-2xl shadow-xs">
            🧘
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-[#1B0B38]/10 shadow-xs hover:shadow-md transition-all flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-[#1B0B38]/50 uppercase tracking-wider">Today&apos;s Sessions</p>
            <p className="text-3xl font-black text-[#1B0B38] mt-1.5">{loading ? "..." : kpiMetrics.todaySessionsCount}</p>
          </div>
          <div className="w-13 h-13 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-2xl shadow-xs">
            📅
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-[#1B0B38]/10 shadow-xs hover:shadow-md transition-all flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-[#1B0B38]/50 uppercase tracking-wider">Total Active Bookings</p>
            <p className="text-3xl font-black text-[#1B0B38] mt-1.5">{loading ? "..." : kpiMetrics.totalActiveBookings}</p>
          </div>
          <div className="w-13 h-13 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-2xl shadow-xs">
            📋
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-[#1B0B38]/10 shadow-xs hover:shadow-md transition-all flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-[#1B0B38]/50 uppercase tracking-wider">Attendance Rate</p>
            <p className="text-3xl font-black text-[#1B0B38] mt-1.5">{loading ? "..." : `${kpiMetrics.avgAttendancePercent}%`}</p>
          </div>
          <div className="w-13 h-13 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-2xl shadow-xs">
            ✓
          </div>
        </div>
      </div>

      {/* 4 INDEPENDENT TABS NAVIGATION */}
      <div className="flex items-center gap-3 border-b border-[#1B0B38]/10 pb-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab("class_types")}
          className={`px-6 py-3 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap ${
            activeTab === "class_types"
              ? "bg-[#7B3FE4] text-white shadow-lg shadow-[#7B3FE4]/25"
              : "text-[#1B0B38]/60 hover:text-[#1B0B38] hover:bg-white"
          }`}
        >
          🗂 Class Types ({classTypes.length})
        </button>

        <button
          onClick={() => setActiveTab("schedule")}
          className={`px-6 py-3 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap ${
            activeTab === "schedule"
              ? "bg-[#7B3FE4] text-white shadow-lg shadow-[#7B3FE4]/25"
              : "text-[#1B0B38]/60 hover:text-[#1B0B38] hover:bg-white"
          }`}
        >
          📅 Schedule Board ({sessions.length})
        </button>

        <button
          onClick={() => setActiveTab("sessions")}
          className={`px-6 py-3 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap ${
            activeTab === "sessions"
              ? "bg-[#7B3FE4] text-white shadow-lg shadow-[#7B3FE4]/25"
              : "text-[#1B0B38]/60 hover:text-[#1B0B38] hover:bg-white"
          }`}
        >
          ⏱ Sessions ({sessions.length})
        </button>

        <button
          onClick={() => setActiveTab("bookings")}
          className={`px-6 py-3 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap ${
            activeTab === "bookings"
              ? "bg-[#7B3FE4] text-white shadow-lg shadow-[#7B3FE4]/25"
              : "text-[#1B0B38]/60 hover:text-[#1B0B38] hover:bg-white"
          }`}
        >
          📋 Bookings ({bookings.length})
        </button>
      </div>

      {/* ─── TAB 1: CLASS TYPES ────────────────────────────────────────────── */}
      {activeTab === "class_types" && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-[#1B0B38]">Master Class Templates</h2>
            <button
              onClick={handleOpenCreateClassType}
              className="px-5 py-2.5 rounded-xl bg-[#7B3FE4] text-white text-xs font-bold hover:bg-[#6A2FD3] shadow-xs transition-all"
            >
              + Create Class Type
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classTypes.map((ct) => (
              <div key={ct.id} className="bg-white rounded-3xl border border-[#1B0B38]/10 p-6 shadow-xs flex flex-col justify-between space-y-5 hover:shadow-md transition-all">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-[#7B3FE4] uppercase tracking-wider bg-[#F2EBFE] px-3 py-1 rounded-lg inline-block mb-2">
                        {ct.category}
                      </span>
                      <h3 className="text-xl font-extrabold text-[#1B0B38] leading-tight">{ct.name}</h3>
                    </div>
                    <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 flex-shrink-0">
                      {ct.difficulty}
                    </span>
                  </div>
                  {ct.description && <p className="text-xs text-[#1B0B38]/60 mt-3 leading-relaxed line-clamp-2">{ct.description}</p>}
                </div>

                <div className="pt-4 border-t border-[#1B0B38]/10 space-y-2 text-xs text-[#1B0B38]/70">
                  <div className="flex justify-between">
                    <span className="font-semibold text-[#1B0B38]/50">Trainer:</span>
                    <span className="font-bold text-[#1B0B38]">{ct.trainer}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-[#1B0B38]/50">Duration &amp; Capacity:</span>
                    <span className="font-bold text-[#1B0B38]">{ct.duration_minutes} mins &bull; {ct.max_capacity} max</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-[#1B0B38]/50">Studio Room:</span>
                    <span className="font-bold text-[#1B0B38]">{ct.location_room}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-[#1B0B38]/10">
                  <button
                    onClick={() => handleOpenEditClassType(ct)}
                    className="flex-1 py-2.5 bg-[#FAF9FC] border border-[#7B3FE4]/20 text-[#7B3FE4] rounded-xl text-xs font-bold hover:bg-[#7B3FE4]/10 transition-colors"
                  >
                    Edit
                  </button>
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
                    className="flex-1 py-2.5 bg-[#7B3FE4] text-white rounded-xl text-xs font-bold hover:bg-[#6A2FD3] transition-colors shadow-xs"
                  >
                    Schedule
                  </button>
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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-white rounded-3xl border border-[#1B0B38]/10 p-5 gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setWeekOffset((prev) => prev - 1)}
                className="px-3.5 py-2 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] hover:bg-[#7B3FE4]/10 text-[#7B3FE4] font-bold text-xs transition-colors"
              >
                &larr; Prev Week
              </button>
              <button
                onClick={() => setWeekOffset(0)}
                className="px-4 py-2 rounded-xl bg-[#7B3FE4] text-white font-bold text-xs hover:bg-[#6A2FD3] transition-colors shadow-xs"
              >
                Today
              </button>
              <button
                onClick={() => setWeekOffset((prev) => prev + 1)}
                className="px-3.5 py-2 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] hover:bg-[#7B3FE4]/10 text-[#7B3FE4] font-bold text-xs transition-colors"
              >
                Next Week &rarr;
              </button>
              <span className="text-base font-extrabold text-[#1B0B38] ml-3">{weekHeaderDateRange}</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-[#FAF9FC] p-1.5 rounded-2xl border border-[#1B0B38]/10">
                {(["day", "week", "month"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setCalendarView(v)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${
                      calendarView === v
                        ? "bg-[#7B3FE4] text-white shadow-xs"
                        : "text-[#1B0B38]/60 hover:text-[#1B0B38]"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowScheduleModal(true)}
                className="px-5 py-2.5 bg-[#7B3FE4] text-white rounded-xl text-xs font-bold hover:bg-[#6A2FD3] shadow-xs"
              >
                + Add Session
              </button>
            </div>
          </div>

          {/* ── GOOGLE CALENDAR WEEKLY TIME GRID ── */}
          <div className="bg-white rounded-3xl border border-[#1B0B38]/10 shadow-md overflow-x-auto">
            <div className="min-w-[950px]">
              {/* Day Columns Header Row */}
              <div className="grid grid-cols-[90px_repeat(7,1fr)] border-b border-[#1B0B38]/10 bg-[#FAF9FC] text-center sticky top-0 z-10">
                <div className="p-4 text-xs font-bold text-[#1B0B38]/50 border-r border-[#1B0B38]/10 uppercase flex items-center justify-center">
                  Time
                </div>
                {currentWeekDays.map((day) => (
                  <div
                    key={day.isoDate}
                    className={`p-3.5 border-r border-[#1B0B38]/10 last:border-r-0 flex flex-col items-center justify-center transition-colors ${
                      day.isToday ? "bg-[#7B3FE4]/10" : ""
                    }`}
                  >
                    <span className="text-xs font-bold text-[#1B0B38]/60 uppercase">{day.dayName}</span>
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black mt-1 ${
                        day.isToday
                          ? "bg-[#7B3FE4] text-white shadow-md shadow-[#7B3FE4]/30"
                          : "text-[#1B0B38]"
                      }`}
                    >
                      {day.dayNum}
                    </span>
                  </div>
                ))}
              </div>

              {/* Time Slot Rows */}
              <div className="divide-y divide-[#1B0B38]/10">
                {TIME_SLOTS.map((slot) => {
                  const displayTimeLabel = formatSlotHour(slot);
                  const slotHourPrefix = slot.substring(0, 2);

                  return (
                    <div key={slot} className="grid grid-cols-[90px_repeat(7,1fr)] min-h-[95px]">
                      {/* Left Time Column */}
                      <div className="p-2 text-xs font-bold text-[#1B0B38]/50 border-r border-[#1B0B38]/10 bg-[#FAF9FC]/60 text-center flex items-center justify-center">
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
                            className={`p-2 border-r border-[#1B0B38]/10 last:border-r-0 relative group transition-colors hover:bg-[#FAF9FC] ${
                              day.isToday ? "bg-[#7B3FE4]/3" : ""
                            }`}
                          >
                            {matchedSessions.length === 0 ? (
                              <div className="w-full h-full min-h-[75px] rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[10px] font-bold text-[#7B3FE4] bg-[#F2EBFE] px-2.5 py-1 rounded-lg">
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
                                        handleOpenAssignMember(s);
                                      }}
                                      className={`p-3 rounded-2xl text-white shadow-sm hover:scale-[1.02] transition-all cursor-pointer border border-white/20 ${
                                        s.status === "cancelled"
                                          ? "bg-red-500/80 line-through opacity-80"
                                          : isFull
                                          ? "bg-[#1B0B38]"
                                          : "bg-gradient-to-r from-[#7B3FE4] to-[#5C24D4]"
                                      }`}
                                    >
                                      <p className="font-extrabold text-xs leading-tight line-clamp-1">
                                        {s.title}
                                      </p>
                                      <p className="text-[10px] text-white/80 mt-1 font-semibold">
                                        {s.class_time} &bull; {s.instructor}
                                      </p>
                                      <div className="mt-1.5 flex items-center justify-between text-[9px]">
                                        <span className="bg-white/20 px-2 py-0.5 rounded-md font-bold">
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
        <div className="bg-white rounded-3xl border border-[#1B0B38]/10 overflow-hidden shadow-xs animate-fade-in">
          <div className="p-5 border-b border-[#1B0B38]/10 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-[#1B0B38]">All Scheduled Sessions</h2>
            <button
              onClick={() => setShowScheduleModal(true)}
              className="px-5 py-2.5 bg-[#7B3FE4] text-white rounded-xl text-xs font-bold hover:bg-[#6A2FD3]"
            >
              + Add Session
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#FAF9FC] border-b border-[#1B0B38]/10 text-[#1B0B38]/60 uppercase font-bold text-[10px]">
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
              <tbody className="divide-y divide-[#1B0B38]/10">
                {sessions.map((s) => {
                  const booked = sessionBookingCountMap[s.id] || 0;
                  return (
                    <tr key={s.id} className="hover:bg-[#FAF9FC]/60 transition-colors">
                      <td className="py-4 px-6 font-extrabold text-[#1B0B38] text-sm">{s.title}</td>
                      <td className="py-4 px-6 font-semibold text-[#1B0B38]/70">{s.instructor}</td>
                      <td className="py-4 px-6 font-bold text-[#1B0B38]">{s.class_date} @ {s.class_time}</td>
                      <td className="py-4 px-6 text-[#1B0B38]/70 font-medium">{s.location_room}</td>
                      <td className="py-4 px-6 font-extrabold text-[#7B3FE4]">{booked} / {s.max_capacity}</td>
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
                          className="px-4 py-2 bg-[#7B3FE4] text-white rounded-xl text-xs font-bold hover:bg-[#6A2FD3] disabled:opacity-50 shadow-xs"
                        >
                          Assign Member
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 4: DEDICATED BOOKINGS MODULE ─────────────────────────────── */}
      {activeTab === "bookings" && (
        <div className="space-y-6 animate-fade-in font-sans">
          {/* Controls & Filters Bar */}
          <div className="bg-white rounded-3xl border border-[#1B0B38]/10 p-5 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search member name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[#FAF9FC] border border-[#1B0B38]/15 rounded-2xl text-xs text-[#1B0B38] focus:outline-none focus:ring-2 focus:ring-[#7B3FE4]/40"
              />
              <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#1B0B38]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={exportBookingsToCSV}
                className="px-5 py-3 rounded-2xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all"
              >
                📥 Export CSV / Excel
              </button>
            </div>
          </div>

          {/* Bookings Table */}
          <div className="bg-white rounded-3xl border border-[#1B0B38]/10 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#FAF9FC] border-b border-[#1B0B38]/10 text-[#1B0B38]/60 uppercase font-bold text-[10px]">
                  <tr>
                    <th className="py-4 px-6">Member</th>
                    <th className="py-4 px-6">Phone</th>
                    <th className="py-4 px-6">Class</th>
                    <th className="py-4 px-6">Session Date &amp; Time</th>
                    <th className="py-4 px-6">Booking Status</th>
                    <th className="py-4 px-6">Attendance</th>
                    <th className="py-4 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1B0B38]/10">
                  {filteredBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-[#FAF9FC]/60 transition-colors">
                      <td className="py-4 px-6 font-extrabold text-[#1B0B38] text-sm">
                        {b.approved_members?.full_name || "Member"}
                        <span className="block text-xs text-[#1B0B38]/50 font-medium">{b.approved_members?.email}</span>
                      </td>
                      <td className="py-4 px-6 font-semibold text-[#1B0B38]/70">{b.approved_members?.phone_number || "N/A"}</td>
                      <td className="py-4 px-6 font-bold text-[#1B0B38]">{b.classes?.title || "N/A"}</td>
                      <td className="py-4 px-6 font-semibold text-[#1B0B38]">{b.classes?.class_date} @ {b.classes?.class_time}</td>
                      <td className="py-4 px-6">
                        <select
                          value={b.booking_status}
                          onChange={(e) => handleUpdateBookingStatus(b.id, e.target.value)}
                          className="p-2 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs font-bold text-[#7B3FE4]"
                        >
                          <option value="booked">Booked</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="checked_in">Checked In</option>
                          <option value="completed">Completed</option>
                          <option value="waitlisted">Waitlisted</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="no_show">No Show</option>
                        </select>
                      </td>
                      <td className="py-4 px-6">
                        <select
                          value={b.attendance_status}
                          onChange={(e) => handleUpdateAttendance(b.id, e.target.value)}
                          className="p-2 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs font-bold text-[#1B0B38]"
                        >
                          <option value="pending">Pending</option>
                          <option value="present">Mark Present</option>
                          <option value="no_show">Mark No Show</option>
                          <option value="late">Late Check-In</option>
                        </select>
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => setRescheduleBookingTarget(b)}
                          className="px-4 py-2 bg-[#FAF9FC] border border-[#7B3FE4]/30 text-[#7B3FE4] rounded-xl text-xs font-bold hover:bg-[#7B3FE4]/10"
                        >
                          Reschedule
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── CREATE CLASS TYPE MODAL ─────────────────────────────────────── */}
      {showCreateClassTypeModal && (
        <Modal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6">
          <div className="bg-white rounded-3xl border border-[#1B0B38]/10 shadow-2xl max-w-2xl w-full p-6 flex flex-col max-h-[90vh] animate-fade-in space-y-5 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#1B0B38]/10 pb-4 flex-shrink-0">
              <div>
                <h3 className="text-2xl font-extrabold text-[#1B0B38]">{editingClassType ? "Edit Class Type" : "Create Master Class Type"}</h3>
                <p className="text-xs text-[#1B0B38]/60 mt-0.5">Define master class template settings and booking policies</p>
              </div>
              <button onClick={() => setShowCreateClassTypeModal(false)} className="w-8 h-8 rounded-full bg-[#FAF9FC] hover:bg-[#1B0B38]/10 text-base font-bold text-[#1B0B38]/60 flex items-center justify-center transition-colors">✕</button>
            </div>

            <form onSubmit={handleSaveClassType} className="flex-1 overflow-y-auto pr-2 space-y-6 text-xs">
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[#7B3FE4]">Basic Information</p>
                
                <div>
                  <label className="block font-bold text-[#1B0B38] mb-1.5">Class Name *</label>
                  <input type="text" required value={ctName} onChange={(e) => setCtName(e.target.value)} placeholder="e.g. Reformer Basic" className="w-full p-3 rounded-2xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-sm text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-[#1B0B38] mb-1.5">Category</label>
                    <input type="text" value={ctCategory} onChange={(e) => setCtCategory(e.target.value)} className="w-full p-3 rounded-2xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-sm text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block font-bold text-[#1B0B38] mb-1.5">Trainer *</label>
                    <input type="text" required value={ctTrainer} onChange={(e) => setCtTrainer(e.target.value)} className="w-full p-3 rounded-2xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-sm text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-[#1B0B38] mb-1.5">Description</label>
                  <textarea rows={2} value={ctDescription} onChange={(e) => setCtDescription(e.target.value)} placeholder="Class details and overview..." className="w-full p-3 rounded-2xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-sm text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none resize-none" />
                </div>
              </div>

              <div className="space-y-4 pt-2 border-t border-[#1B0B38]/10">
                <p className="text-xs font-bold uppercase tracking-wider text-[#7B3FE4]">Class Capacity &amp; Location</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-bold text-[#1B0B38] mb-1.5">Duration (mins) *</label>
                    <input type="number" min="1" required value={ctDuration} onChange={(e) => setCtDuration(Number(e.target.value))} className="w-full p-3 rounded-2xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-sm text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block font-bold text-[#1B0B38] mb-1.5">Max Capacity *</label>
                    <input type="number" min="1" required value={ctCapacity} onChange={(e) => setCtCapacity(Number(e.target.value))} className="w-full p-3 rounded-2xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-sm text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block font-bold text-[#1B0B38] mb-1.5">Studio Room</label>
                    <input type="text" value={ctRoom} onChange={(e) => setCtRoom(e.target.value)} className="w-full p-3 rounded-2xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-sm text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-[#FAF9FC] rounded-2xl border border-[#1B0B38]/10 flex items-center justify-between gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={ctAllowBooking} onChange={(e) => setCtAllowBooking(e.target.checked)} className="w-4 h-4 accent-[#7B3FE4] rounded-md" />
                  <span className="font-extrabold text-[#1B0B38] text-xs">Allow Member Self-Booking</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={ctWaitlistEnabled} onChange={(e) => setCtWaitlistEnabled(e.target.checked)} className="w-4 h-4 accent-[#7B3FE4] rounded-md" />
                  <span className="font-extrabold text-[#1B0B38] text-xs">Enable Waitlist Queue</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1B0B38]/10 flex-shrink-0">
                <button type="button" onClick={() => setShowCreateClassTypeModal(false)} className="px-6 py-3 border border-[#1B0B38]/15 rounded-2xl font-bold text-xs text-[#1B0B38] hover:bg-black/5 transition-all">Cancel</button>
                <button type="submit" disabled={actionLoading} className="px-7 py-3 bg-[#7B3FE4] text-white font-extrabold text-xs rounded-2xl hover:bg-[#6A2FD3] transition-all shadow-md shadow-[#7B3FE4]/20">Save Class Type</button>
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
          <div className="bg-white rounded-3xl border border-[#1B0B38]/10 shadow-2xl max-w-3xl w-full p-5 flex flex-col animate-fade-in space-y-3.5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#1B0B38]/10 pb-2.5 flex-shrink-0">
              <div>
                <h3 className="text-xl font-extrabold text-[#1B0B38]">Schedule Class Session</h3>
                <p className="text-[11px] text-[#1B0B38]/60 mt-0.5">Fill session details below — fits in a single view</p>
              </div>
              <button onClick={() => setShowScheduleModal(false)} className="w-7 h-7 rounded-full bg-[#FAF9FC] hover:bg-[#1B0B38]/10 text-xs font-bold text-[#1B0B38]/60 flex items-center justify-center transition-colors">✕</button>
            </div>

            {/* Form Body - Compact 2-Column Grid */}
            <form onSubmit={handleSaveScheduledSession} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
                {/* Left Column */}
                <div className="space-y-2.5">
                  <div>
                    <label className="block font-bold text-[#1B0B38] text-[11px] mb-1">Class Master Template (Optional)</label>
                    <select
                      value={sessClassTypeId}
                      onChange={(e) => handleSelectClassTypeForSession(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs font-semibold text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none"
                    >
                      <option value="">-- Custom Session --</option>
                      {classTypes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.trainer})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-[#1B0B38] text-[11px] mb-1">Session Title *</label>
                    <input type="text" required value={sessTitle} onChange={(e) => setSessTitle(e.target.value)} placeholder="e.g. Morning Reformer Group Class" className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                  </div>

                  <div>
                    <label className="block font-bold text-[#1B0B38] text-[11px] mb-1">Trainer *</label>
                    <input type="text" required value={sessTrainer} onChange={(e) => setSessTrainer(e.target.value)} placeholder="Rahul Sharma" className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                  </div>

                  <div>
                    <label className="block font-bold text-[#1B0B38] text-[11px] mb-1">Max Capacity *</label>
                    <input type="number" min="1" required value={sessCapacity} onChange={(e) => setSessCapacity(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-2.5">
                  <div>
                    <label className="block font-bold text-[#1B0B38] text-[11px] mb-1">Date *</label>
                    <input type="date" required value={sessDate} onChange={(e) => setSessDate(e.target.value)} className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-[#1B0B38] text-[11px] mb-1">Start Time *</label>
                      <input type="time" required value={sessTime} onChange={(e) => setSessTime(e.target.value)} className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold text-[#1B0B38] text-[11px] mb-1">Duration (mins)</label>
                      <input type="number" min="1" value={sessDuration} onChange={(e) => setSessDuration(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-[#1B0B38] text-[11px] mb-1">Buffer Time (mins)</label>
                      <input type="number" min="0" value={sessBuffer} onChange={(e) => setSessBuffer(Number(e.target.value))} className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold text-[#1B0B38] text-[11px] mb-1">Studio Room</label>
                      <input type="text" value={sessRoom} onChange={(e) => setSessRoom(e.target.value)} placeholder="Studio Room A" className="w-full p-2.5 rounded-xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Recurring Rules Section */}
              <div className="p-3 bg-[#FAF9FC] rounded-2xl border border-[#1B0B38]/10 space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="w-3.5 h-3.5 accent-[#7B3FE4] rounded-md" />
                  <span className="font-extrabold text-[#1B0B38] text-xs">Recurring Session Schedule</span>
                </label>

                {isRecurring && (
                  <div className="flex items-center justify-between pt-2 border-t border-[#1B0B38]/10 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#1B0B38]/70 text-[11px]">Frequency:</span>
                      <div className="flex gap-1.5">
                        {(["daily", "weekly", "monthly"] as const).map((freq) => (
                          <button
                            key={freq}
                            type="button"
                            onClick={() => setRecurringFrequency(freq)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                              recurringFrequency === freq ? "bg-[#7B3FE4] text-white shadow-xs" : "bg-white border border-[#1B0B38]/15 text-[#1B0B38]"
                            }`}
                          >
                            {freq}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#1B0B38]/70 text-[11px]">Occurrences:</span>
                      <input type="number" min="1" max="52" value={recurringOccurrences} onChange={(e) => setRecurringOccurrences(Number(e.target.value))} className="w-16 p-1.5 bg-white border border-[#1B0B38]/15 rounded-lg text-center font-extrabold text-xs text-[#1B0B38]" />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1B0B38]/10">
                <button type="button" onClick={() => setShowScheduleModal(false)} className="px-5 py-2.5 border border-[#1B0B38]/15 rounded-xl font-bold text-xs text-[#1B0B38] hover:bg-black/5 transition-all">Cancel</button>
                <button type="submit" disabled={actionLoading} className="px-6 py-2.5 bg-[#7B3FE4] text-white font-extrabold text-xs rounded-xl hover:bg-[#6A2FD3] transition-all shadow-md shadow-[#7B3FE4]/20">Save Session(s)</button>
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
          <div className="bg-white rounded-3xl border border-[#1B0B38]/10 shadow-2xl max-w-lg w-full p-7 flex flex-col animate-fade-in space-y-5">
            <div className="flex items-center justify-between border-b border-[#1B0B38]/10 pb-4 flex-shrink-0">
              <h3 className="text-xl font-extrabold text-[#1B0B38]">Assign Member to Session</h3>
              <button onClick={() => setShowAssignMemberModal(false)} className="w-8 h-8 rounded-full bg-[#FAF9FC] hover:bg-[#1B0B38]/10 text-base font-bold text-[#1B0B38]/60 flex items-center justify-center transition-colors">✕</button>
            </div>

            <div className="bg-[#FAF9FC] p-4 rounded-2xl border border-[#1B0B38]/10 text-xs space-y-1">
              <p className="font-extrabold text-sm text-[#1B0B38]">{targetSessionForAssign.title}</p>
              <p className="text-[#1B0B38]/60 font-semibold">{targetSessionForAssign.class_date} @ {targetSessionForAssign.class_time} &bull; {targetSessionForAssign.instructor}</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1B0B38] mb-2">Select Member *</label>
              <select
                value={selectedAssignMemberId}
                onChange={(e) => setSelectedAssignMemberId(e.target.value)}
                className="w-full p-3.5 rounded-2xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs font-semibold text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none"
              >
                <option value="">-- Choose Member --</option>
                {membersList.map((m) => {
                  const activePlan = m.plans && m.plans.find((p: any) => p.status === "active");
                  const planLabel = activePlan
                    ? `✓ ${activePlan.plan_name}${activePlan.sessions_remaining !== null && activePlan.sessions_remaining !== undefined ? ` (${activePlan.sessions_remaining} left)` : ""}`
                    : "⚠️ No Active Plan";
                  return (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.phone_number || m.email}) — {planLabel}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1B0B38]/10 flex-shrink-0">
              <button onClick={() => setShowAssignMemberModal(false)} className="px-6 py-3 border border-[#1B0B38]/15 rounded-2xl font-bold text-xs text-[#1B0B38] hover:bg-black/5 transition-all">Cancel</button>
              <button onClick={handleConfirmMemberAssignment} disabled={actionLoading || !selectedAssignMemberId} className="px-7 py-3 bg-[#7B3FE4] text-white font-extrabold text-xs rounded-2xl hover:bg-[#6A2FD3] transition-all shadow-md shadow-[#7B3FE4]/20">Confirm Booking</button>
            </div>
          </div>
        </div>
        </Modal>
      )}

      {/* ─── RESCHEDULE BOOKING MODAL ────────────────────────────────────── */}
      {rescheduleBookingTarget && (
        <Modal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6">
          <div className="bg-white rounded-3xl border border-[#1B0B38]/10 shadow-2xl max-w-lg w-full p-7 flex flex-col animate-fade-in space-y-5">
            <div className="flex items-center justify-between border-b border-[#1B0B38]/10 pb-4 flex-shrink-0">
              <h3 className="text-xl font-extrabold text-[#1B0B38]">Reschedule Member Booking</h3>
              <button onClick={() => setRescheduleBookingTarget(null)} className="w-8 h-8 rounded-full bg-[#FAF9FC] hover:bg-[#1B0B38]/10 text-base font-bold text-[#1B0B38]/60 flex items-center justify-center transition-colors">✕</button>
            </div>

            <p className="text-xs text-[#1B0B38] leading-relaxed">
              Rescheduling booking for <strong className="font-extrabold">{rescheduleBookingTarget.approved_members?.full_name}</strong> from <em>{rescheduleBookingTarget.classes?.title} ({rescheduleBookingTarget.classes?.class_date})</em>.
            </p>

            <div>
              <label className="block text-xs font-bold text-[#1B0B38] mb-2">Target Session *</label>
              <select
                value={targetRescheduleSessionId}
                onChange={(e) => setTargetRescheduleSessionId(e.target.value)}
                className="w-full p-3.5 rounded-2xl border border-[#1B0B38]/15 bg-[#FAF9FC] text-xs font-semibold text-[#1B0B38] focus:ring-2 focus:ring-[#7B3FE4]/30 focus:outline-none"
              >
                <option value="">-- Choose New Session --</option>
                {sessions.filter((s) => s.id !== rescheduleBookingTarget.class_id && s.status !== "cancelled").map((s) => (
                  <option key={s.id} value={s.id}>{s.title} ({s.class_date} @ {s.class_time})</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1B0B38]/10 flex-shrink-0">
              <button onClick={() => setRescheduleBookingTarget(null)} className="px-6 py-3 border border-[#1B0B38]/15 rounded-2xl font-bold text-xs text-[#1B0B38] hover:bg-black/5 transition-all">Cancel</button>
              <button onClick={handleRescheduleBooking} disabled={actionLoading || !targetRescheduleSessionId} className="px-7 py-3 bg-[#7B3FE4] text-white font-extrabold text-xs rounded-2xl hover:bg-[#6A2FD3] transition-all shadow-md shadow-[#7B3FE4]/20">Confirm Reschedule</button>
            </div>
          </div>
        </div>
        </Modal>
      )}
    </div>
  );
}
