"use client";

import { useEffect, useState, useCallback, useMemo, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClassSession {
  id: string;
  title: string;
  instructor: string;
  class_date: string;
  class_time: string;
  end_time?: string | null;
  buffer_minutes?: number | null;
  category?: string | null;
  difficulty?: string | null;
  duration_minutes?: number | null;
  max_capacity: number;
  location_room?: string | null;
  equipment_required?: string | null;
  recurring_rule?: string | null;
  is_active?: boolean;
  created_at: string;

  // Computed availability counts
  booked_count?: number;
  waitlisted_count?: number;
}

interface BookingRecord {
  id: string;
  class_id: string;
  member_id: string;
  booking_status: string;
  purchased_plan_id?: string | null;
  created_at: string;
  checked_in_at?: string | null;
  notes?: string | null;

  // Joined relations
  classes?: ClassSession | null;
  approved_members?: {
    id: string;
    full_name: string;
    email: string;
    phone_number: string;
    membership_level?: string;
  } | null;
}

interface PurchasedPlan {
  id: string;
  plan_name: string;
  category: string;
  sessions_total: number | null;
  sessions_remaining: number | null;
  valid_from: string;
  valid_until: string | null;
  status: string;
}

interface ApprovedMember {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  membership_status: string;
  membership_level: string;
}

type TabType = "schedule" | "bookings" | "cancellations";

const PREDEFINED_INSTRUCTORS = [
  "Ragini (Head Trainer)",
  "Pooja Reddy",
  "Anjani Sharma",
  "Vikram Malhotra",
  "Siddharth Rao",
];

const PREDEFINED_ROOMS = [
  "Studio Room A (Reformer Bay)",
  "Studio Room B (Mat & Tower)",
  "Private Suite 1",
  "Private Suite 2",
];

// Helper formatting
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "N/A";
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const formattedHour = hour % 12 || 12;
  return `${formattedHour}:${m} ${ampm}`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    booked: "bg-blue-100 text-blue-800 border-blue-200",
    confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
    checked_in: "bg-indigo-100 text-indigo-800 border-indigo-200",
    completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
    cancelled: "bg-red-100 text-red-700 border-red-200",
    no_show: "bg-amber-100 text-amber-800 border-amber-200",
    waitlisted: "bg-orange-100 text-orange-800 border-orange-200",
  };

  const formattedLabel = status ? status.replace("_", " ").toUpperCase() : "BOOKED";

  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider border ${
        styles[status] || "bg-gray-100 text-gray-700 border-gray-200"
      }`}
    >
      {formattedLabel}
    </span>
  );
}

export default function ClassesManagementPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabType>("schedule");

  // Data states
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [members, setMembers] = useState<ApprovedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [cancellationSearchQuery, setCancellationSearchQuery] = useState("");
  const [selectedInstructor, setSelectedInstructor] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedDate, setSelectedDate] = useState("");

  // Modals & Action states
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showMemberBookingModal, setShowMemberBookingModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form states: New Class / Schedule Session
  const [formTitle, setFormTitle] = useState("");
  const [formDifficulty, setFormDifficulty] = useState("All Levels");
  const [formInstructor, setFormInstructor] = useState("Ragini (Head Trainer)");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formTime, setFormTime] = useState("09:00");
  const [formDuration, setFormDuration] = useState("60");
  const [formBuffer, setFormBuffer] = useState("15");
  const [formCapacity, setFormCapacity] = useState("10");
  const [formRoom, setFormRoom] = useState("Studio Room A (Reformer Bay)");
  const [formEquipment, setFormEquipment] = useState("Allegro 2 Reformers, Grip Socks");
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formRepeatInterval, setFormRepeatInterval] = useState("weekly"); // daily, weekly
  const [formRepeatCount, setFormRepeatCount] = useState("4");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Edit Class Modal state
  const [editingSession, setEditingSession] = useState<ClassSession | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDifficulty, setEditDifficulty] = useState("All Levels");
  const [editInstructor, setEditInstructor] = useState("Ragini (Head Trainer)");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("09:00");
  const [editDuration, setEditDuration] = useState("60");
  const [editBuffer, setEditBuffer] = useState("15");
  const [editCapacity, setEditCapacity] = useState("10");
  const [editRoom, setEditRoom] = useState("");
  const [editEquipment, setEditEquipment] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete Class Modal state
  const [deletingSession, setDeletingSession] = useState<ClassSession | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const handleOpenEditSession = (session: ClassSession) => {
    setEditingSession(session);
    setEditTitle(session.title);
    setEditDifficulty(session.difficulty || "All Levels");
    setEditInstructor(session.instructor);
    setEditDate(session.class_date);
    setEditTime(session.class_time);
    setEditDuration(String(session.duration_minutes || 60));
    setEditBuffer(String(session.buffer_minutes || 15));
    setEditCapacity(String(session.max_capacity));
    setEditRoom(session.location_room || "Studio Room A (Reformer Bay)");
    setEditEquipment(session.equipment_required || "Allegro 2 Reformers, Grip Socks");
  };

  const handleEditSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;
    setEditSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    const cap = parseInt(editCapacity, 10);
    const dur = parseInt(editDuration, 10);
    const buf = parseInt(editBuffer, 10);

    if (isNaN(cap) || cap <= 0) {
      setActionError("Capacity must be a positive number.");
      setEditSubmitting(false);
      return;
    }

    const [h, m] = editTime.split(":");
    const startMinutes = parseInt(h, 10) * 60 + parseInt(m, 10);
    const endMinutes = startMinutes + dur;
    const endH = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
    const endM = String(endMinutes % 60).padStart(2, "0");
    const computedEndTime = `${endH}:${endM}`;

    try {
      const { error } = await supabase
        .from("classes")
        .update({
          title: editTitle.trim(),
          difficulty: editDifficulty,
          instructor: editInstructor,
          class_date: editDate,
          class_time: editTime,
          end_time: computedEndTime,
          duration_minutes: dur,
          buffer_minutes: buf,
          max_capacity: cap,
          location_room: editRoom,
          equipment_required: editEquipment,
        })
        .eq("id", editingSession.id);

      if (error) {
        setActionError(error.message);
      } else {
        setActionSuccess(`Class session "${editTitle}" updated successfully!`);
        setEditingSession(null);
        loadData();
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleConfirmDeleteSession = async () => {
    if (!deletingSession) return;
    setDeleteSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      // Delete bookings for this session
      await supabase.from("bookings").delete().eq("class_id", deletingSession.id);
      
      // Delete attendance records for this session
      try {
        await supabase.from("attendance").delete().eq("class_id", deletingSession.id);
      } catch (e) {}

      // Delete class session
      const { error } = await supabase.from("classes").delete().eq("id", deletingSession.id);

      if (error) {
        setActionError(error.message);
      } else {
        setActionSuccess(`Class session "${deletingSession.title}" deleted successfully!`);
        setDeletingSession(null);
        loadData();
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Member Booking Workflow states
  const [bookMemberSearch, setBookMemberSearch] = useState("");
  const [selectedBookMember, setSelectedBookMember] = useState<ApprovedMember | null>(null);
  const [memberPlans, setMemberPlans] = useState<PurchasedPlan[]>([]);
  const [selectedBookSession, setSelectedBookSession] = useState<ClassSession | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingEligibilityMessage, setBookingEligibilityMessage] = useState<string | null>(null);

  // Fetch all classes & bookings
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch all class sessions
      const { data: classesData, error: classesError } = await supabase
        .from("classes")
        .select("*")
        .order("class_date", { ascending: true })
        .order("class_time", { ascending: true });

      if (classesError) {
        setActionError(classesError.message);
        setLoading(false);
        return;
      }

      // 2. Fetch all bookings with member profiles
      const { data: bookingsData } = await supabase
        .from("bookings")
        .select("*, classes(*), approved_members(id, full_name, email, phone_number, membership_level)")
        .order("created_at", { ascending: false });

      // 3. Compute availability per class session
      const bookingsCountMap = new Map<string, { booked: number; waitlisted: number }>();
      if (bookingsData) {
        bookingsData.forEach((b: any) => {
          const counts = bookingsCountMap.get(b.class_id) || { booked: 0, waitlisted: 0 };
          if (b.booking_status === "waitlisted") {
            counts.waitlisted += 1;
          } else if (b.booking_status !== "cancelled") {
            counts.booked += 1;
          }
          bookingsCountMap.set(b.class_id, counts);
        });
      }

      const formattedSessions: ClassSession[] = (classesData || []).map((c: any) => {
        const counts = bookingsCountMap.get(c.id) || { booked: 0, waitlisted: 0 };
        return {
          ...c,
          booked_count: counts.booked,
          waitlisted_count: counts.waitlisted,
        };
      });

      // 4. Fetch approved members list for admin booking dropdown
      const { data: approvedMembersData } = await supabase
        .from("approved_members")
        .select("id, full_name, email, phone_number, membership_status, membership_level")
        .eq("membership_status", "active")
        .order("full_name", { ascending: true });

      startTransition(() => {
        setSessions(formattedSessions);
        setBookings((bookingsData as BookingRecord[]) || []);
        setMembers((approvedMembersData as ApprovedMember[]) || []);
        setLoading(false);
      });
    } catch (err: any) {
      console.error("loadData error:", err);
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load plans for selected member in Admin Booking Modal
  const handleSelectMemberForBooking = async (member: ApprovedMember) => {
    setSelectedBookMember(member);
    setBookingEligibilityMessage(null);
    setPlansLoading(true);

    const { data: plans } = await supabase
      .from("member_purchased_plans")
      .select("*")
      .eq("approved_member_id", member.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    setMemberPlans((plans as PurchasedPlan[]) || []);
    setPlansLoading(false);
  };

  // Execute Server-Side Class Session Booking RPC
  const handleConfirmAdminBooking = async () => {
    if (!selectedBookMember || !selectedBookSession) {
      setActionError("Please select both a member and a class session.");
      return;
    }

    setBookingSubmitting(true);
    setActionError(null);
    setBookingEligibilityMessage(null);

    try {
      const { data: result, error: rpcError } = await supabase.rpc(
        "book_member_class_session",
        {
          p_member_id: selectedBookMember.id,
          p_class_id: selectedBookSession.id,
        }
      );

      if (rpcError) {
        setBookingEligibilityMessage(rpcError.message);
        setBookingSubmitting(false);
        return;
      }

      if (result && result.success) {
        setActionSuccess(`Booking confirmed! Status: ${result.status.toUpperCase()}. Sessions remaining: ${result.sessions_remaining ?? 'Unlimited'}`);
        setShowMemberBookingModal(false);
        setSelectedBookMember(null);
        setSelectedBookSession(null);
        loadData();
      }
    } catch (err: any) {
      setBookingEligibilityMessage(err.message || "Failed to complete booking.");
    } finally {
      setBookingSubmitting(false);
    }
  };

  // Handle Booking Status Updates (Checked In, Attendance, Cancel, Reschedule, No Show)
  const handleUpdateBookingStatus = async (bookingId: string, newStatus: string) => {
    setActionError(null);
    setActionSuccess(null);

    try {
      if (newStatus === "cancelled") {
        const { data: result, error: cancelError } = await supabase.rpc(
          "cancel_member_class_booking",
          { p_booking_id: bookingId }
        );

        if (cancelError) {
          setActionError(cancelError.message);
          return;
        }

        setActionSuccess("Booking cancelled and session restored successfully.");
      } else if (newStatus === "checked_in" || newStatus === "completed") {
        const { error } = await supabase
          .from("bookings")
          .update({
            booking_status: newStatus,
            checked_in_at: new Date().toISOString(),
          })
          .eq("id", bookingId);

        if (error) {
          setActionError(error.message);
          return;
        }

        const booking = bookings.find((b) => b.id === bookingId);
        if (booking) {
          await supabase.from("attendance").insert({
            member_id: booking.member_id,
            class_id: booking.class_id,
            attendance_status: "present",
            scanned_at: new Date().toISOString(),
          });
        }

        setActionSuccess(`Status updated to ${newStatus}. Attendance recorded!`);
      } else {
        const { error } = await supabase
          .from("bookings")
          .update({ booking_status: newStatus })
          .eq("id", bookingId);

        if (error) {
          setActionError(error.message);
          return;
        }

        setActionSuccess(`Booking status updated to ${newStatus}.`);
      }

      loadData();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  // Schedule Single or Recurring Sessions
  const handleScheduleSessionsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setActionError(null);

    const cap = parseInt(formCapacity, 10);
    const dur = parseInt(formDuration, 10);
    const buf = parseInt(formBuffer, 10);

    if (isNaN(cap) || cap <= 0) {
      setActionError("Capacity must be a positive number.");
      setFormSubmitting(false);
      return;
    }

    try {
      const datesToSchedule: string[] = [formDate];
      if (formIsRecurring) {
        const count = formRepeatInterval === "daily" ? 30 : 12;
        const baseDate = new Date(formDate);

        for (let i = 1; i < count; i++) {
          const nextDate = new Date(baseDate);
          if (formRepeatInterval === "daily") {
            nextDate.setDate(baseDate.getDate() + i);
          } else {
            nextDate.setDate(baseDate.getDate() + i * 7); // weekly
          }
          datesToSchedule.push(nextDate.toISOString().split("T")[0]);
        }
      }

      const [h, m] = formTime.split(":");
      const startMinutes = parseInt(h, 10) * 60 + parseInt(m, 10);
      const endMinutes = startMinutes + dur;
      const endH = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
      const endM = String(endMinutes % 60).padStart(2, "0");
      const computedEndTime = `${endH}:${endM}`;

      const insertRows = datesToSchedule.map((d) => ({
        title: formTitle.trim(),
        instructor: formInstructor,
        class_date: d,
        class_time: formTime,
        end_time: computedEndTime,
        duration_minutes: dur,
        buffer_minutes: buf,
        difficulty: formDifficulty,
        max_capacity: cap,
        location_room: formRoom,
        equipment_required: formEquipment,
        recurring_rule: formIsRecurring ? formRepeatInterval : null,
        is_active: true,
      }));

      const { error } = await supabase.from("classes").insert(insertRows);

      if (error) {
        setActionError(error.message);
        setFormSubmitting(false);
        return;
      }

      setActionSuccess(`Successfully scheduled ${datesToSchedule.length} session(s)!`);
      setShowScheduleModal(false);
      loadData();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Export Bookings to Excel (CSV)
  const handleExportBookingsToExcel = () => {
    if (filteredBookings.length === 0) return;

    const headers = ["Booking ID", "Member Name", "Phone", "Email", "Class Title", "Date", "Time", "Instructor", "Status", "Booked At"];
    const rows = filteredBookings.map((b) => [
      b.id.slice(0, 8),
      b.approved_members?.full_name || "Member",
      b.approved_members?.phone_number || "",
      b.approved_members?.email || "",
      b.classes?.title || "Class Session",
      formatDate(b.classes?.class_date),
      formatTime(b.classes?.class_time),
      b.classes?.instructor || "",
      b.booking_status,
      formatDate(b.created_at),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.map((val) => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Corhaus_Bookings_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Bookings List
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (selectedStatus !== "All" && b.booking_status !== selectedStatus) return false;
      if (selectedInstructor !== "All" && b.classes?.instructor !== selectedInstructor) return false;
      if (selectedDate && b.classes?.class_date !== selectedDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mName = b.approved_members?.full_name.toLowerCase() || "";
        const mEmail = b.approved_members?.email.toLowerCase() || "";
        const mPhone = b.approved_members?.phone_number || "";
        const mId = b.member_id.toLowerCase();
        const cTitle = b.classes?.title.toLowerCase() || "";

        return mName.includes(q) || mEmail.includes(q) || mPhone.includes(q) || mId.includes(q) || cTitle.includes(q);
      }

      return true;
    });
  }, [bookings, selectedStatus, selectedInstructor, selectedDate, searchQuery]);

  // Cancelled Bookings List (Tab 4)
  const cancelledBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (b.booking_status !== "cancelled") return false;
      if (cancellationSearchQuery.trim()) {
        const q = cancellationSearchQuery.toLowerCase().trim();
        const mName = b.approved_members?.full_name.toLowerCase() || "";
        const mEmail = b.approved_members?.email.toLowerCase() || "";
        const mPhone = b.approved_members?.phone_number || "";
        const cTitle = b.classes?.title.toLowerCase() || "";
        return mName.includes(q) || mEmail.includes(q) || mPhone.includes(q) || cTitle.includes(q);
      }
      return true;
    });
  }, [bookings, cancellationSearchQuery]);

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Top Header & Quick Action Triggers */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif text-[#362B24]">
            Classes <span className="font-semibold">&amp; Schedule Board</span>
          </h1>
          <p className="text-sm text-[#4A3B32]/60 mt-0.5">
            Manage reusable class types, schedule board, member bookings, and attendance integration
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedBookMember(null);
              setSelectedBookSession(null);
              setBookingEligibilityMessage(null);
              setShowMemberBookingModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-white border border-[#E5DDD0] text-[#362B24] font-semibold text-xs hover:border-[#B89368] transition-colors shadow-xs flex items-center gap-2"
          >
            <span>+ Book Member</span>
          </button>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="px-5 py-2.5 rounded-xl bg-[#B89368] text-white text-xs font-semibold hover:bg-[#A68B6B] transition-colors shadow-sm"
          >
            + Schedule Session
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-4 rounded-xl text-xs bg-red-50 border border-red-200 text-red-700 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="font-bold hover:underline">✕</button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 rounded-xl text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="font-bold hover:underline">✕</button>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-[#E5DDD0] pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("schedule")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === "schedule"
              ? "bg-[#4A3B32] text-white shadow-xs"
              : "text-[#4A3B32]/60 hover:text-[#362B24] hover:bg-[#FAF7F2]"
          }`}
        >
          📅 Schedule Board ({sessions.length})
        </button>
        <button
          onClick={() => setActiveTab("bookings")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === "bookings"
              ? "bg-[#4A3B32] text-white shadow-xs"
              : "text-[#4A3B32]/60 hover:text-[#362B24] hover:bg-[#FAF7F2]"
          }`}
        >
          📋 Bookings &amp; Attendance ({bookings.length})
        </button>
        <button
          onClick={() => setActiveTab("cancellations")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === "cancellations"
              ? "bg-red-800 text-white shadow-xs"
              : "text-[#4A3B32]/60 hover:text-[#362B24] hover:bg-[#FAF7F2]"
          }`}
        >
          🚫 Cancellations ({cancelledBookings.length})
        </button>
      </div>

      {/* ─── TAB 1: SCHEDULE BOARD (CALENDAR / SESSIONS GRID) ────────────────── */}
      {activeTab === "schedule" && (
        <div className="space-y-4">
          {/* Availability & Filter Bar */}
          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedInstructor}
                onChange={(e) => setSelectedInstructor(e.target.value)}
                className="px-3 py-2 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs font-medium text-[#362B24]"
              >
                <option value="All">All Instructors</option>
                {PREDEFINED_INSTRUCTORS.map((ins) => (
                  <option key={ins} value={ins}>{ins}</option>
                ))}
              </select>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs font-medium text-[#362B24]"
              />
              {selectedDate && (
                <button onClick={() => setSelectedDate("")} className="text-xs text-[#4A3B32]/50 hover:underline">
                  Clear Date
                </button>
              )}
            </div>

            <div className="text-xs font-semibold text-[#4A3B32]/60">
              Showing {sessions.length} upcoming &amp; active class sessions
            </div>
          </div>

          {/* Sessions Cards Grid */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#B89368]/30 border-t-[#B89368] rounded-full animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-12 text-center shadow-xs">
              <p className="text-sm font-semibold text-[#362B24]">No scheduled sessions found</p>
              <p className="text-xs text-[#4A3B32]/50 mt-1">Schedule a session or add class types to get started.</p>
              <button
                onClick={() => setShowScheduleModal(true)}
                className="mt-4 px-4 py-2 rounded-xl bg-[#B89368] text-white text-xs font-semibold"
              >
                + Schedule First Session
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessions.map((session) => {
                const booked = session.booked_count || 0;
                const capacity = session.max_capacity;
                const available = Math.max(0, capacity - booked);
                const isFull = available === 0;

                return (
                  <div
                    key={session.id}
                    className="bg-white rounded-2xl border border-[#E5DDD0] p-5 shadow-xs hover:border-[#B89368] transition-all space-y-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-serif font-bold text-base text-[#362B24]">
                          {session.title}
                        </h3>
                        <p className="text-xs text-[#4A3B32]/60 mt-0.5">
                          {session.instructor}
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        isFull ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      }`}>
                        {isFull ? "FULL" : `${available} seats left`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-[#FAF7F2] p-3 rounded-xl border border-[#E5DDD0]/60">
                      <div>
                        <span className="text-[10px] text-[#4A3B32]/50 block">Date &amp; Time</span>
                        <span className="font-semibold text-[#362B24]">
                          {formatDate(session.class_date)} @ {formatTime(session.class_time)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#4A3B32]/50 block">Room / Location</span>
                        <span className="font-semibold text-[#362B24]">
                          {session.location_room || "Studio Room A"}
                        </span>
                      </div>
                    </div>

                    {/* Capacity & Availability Progress */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-[#4A3B32]/70">Capacity &amp; Bookings</span>
                        <span className="font-bold text-[#362B24]">
                          {booked} / {capacity} Booked
                          {session.waitlisted_count ? ` (${session.waitlisted_count} Waitlisted)` : ""}
                        </span>
                      </div>
                      <div className="w-full bg-[#E5DDD0]/50 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isFull ? "bg-red-500" : "bg-[#B89368]"
                          }`}
                          style={{ width: `${Math.min(100, (booked / capacity) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#E5DDD0]/60 flex-wrap">
                      <button
                        onClick={() => {
                          setSelectedBookSession(session);
                          setShowMemberBookingModal(true);
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-[#4A3B32] text-white text-xs font-semibold hover:bg-[#362B24] transition-colors"
                      >
                        + Book Member
                      </button>
                      <button
                        onClick={() => handleOpenEditSession(session)}
                        className="py-2 px-3 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs font-semibold text-[#4A3B32] hover:bg-[#F4EFE6] transition-colors"
                        title="Edit Class Session"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => setDeletingSession(session)}
                        className="py-2 px-3 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                        title="Delete Class Session"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: BOOKINGS & ATTENDANCE MANAGEMENT ─────────────────────────── */}
      {activeTab === "bookings" && (
        <div className="space-y-4">
          {/* Controls & Export Header */}
          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bookings by member name, email, phone, or class title..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs text-[#362B24] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A3B32]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-[#E5DDD0] bg-white text-xs font-medium text-[#362B24]"
              >
                <option value="All">All Statuses</option>
                <option value="booked">Booked</option>
                <option value="confirmed">Confirmed</option>
                <option value="checked_in">Checked In</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="no_show">No Show</option>
                <option value="waitlisted">Waitlisted</option>
              </select>

              <button
                onClick={handleExportBookingsToExcel}
                className="px-4 py-2.5 rounded-xl bg-[#4A3B32] text-white font-semibold text-xs hover:bg-[#362B24] transition-colors flex items-center gap-2 shadow-xs"
              >
                📥 Export Excel
              </button>
            </div>
          </div>

          {/* Bookings Table */}
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-xs">
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 border-[#B89368]/30 border-t-[#B89368] rounded-full animate-spin" />
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="text-center py-16 px-4">
                <p className="text-sm font-semibold text-[#362B24]">No bookings found</p>
                <p className="text-xs text-[#4A3B32]/50 mt-1">Try adjusting search filters or book a member.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-[#FAF7F2] border-b border-[#E5DDD0] text-[#4A3B32]/60 font-semibold uppercase tracking-wider whitespace-nowrap">
                      <th className="py-3.5 px-4">Member</th>
                      <th className="py-3.5 px-4">Class Session</th>
                      <th className="py-3.5 px-4">Date &amp; Time</th>
                      <th className="py-3.5 px-4">Instructor</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Booked Date</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5DDD0]/50 whitespace-nowrap">
                    {filteredBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-[#FAF7F2]/50 transition-colors">
                        {/* Member */}
                        <td className="py-3.5 px-4 font-semibold text-[#362B24]">
                          <div>
                            <p className="font-bold text-sm leading-tight">{b.approved_members?.full_name || "Member"}</p>
                            <p className="text-[11px] text-[#4A3B32]/50 mt-0.5">{b.approved_members?.phone_number}</p>
                          </div>
                        </td>

                        {/* Class */}
                        <td className="py-3.5 px-4 font-semibold text-[#362B24]">
                          {b.classes?.title || "Pilates Session"}
                        </td>

                        {/* Date & Time */}
                        <td className="py-3.5 px-4 text-[#4A3B32]">
                          {formatDate(b.classes?.class_date)} @ {formatTime(b.classes?.class_time)}
                        </td>

                        {/* Instructor */}
                        <td className="py-3.5 px-4 text-[#4A3B32]/80 font-medium">
                          {b.classes?.instructor || "Staff"}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <StatusBadge status={b.booking_status} />
                        </td>

                        {/* Booked At */}
                        <td className="py-3.5 px-4 text-[#4A3B32]/60">
                          {formatDate(b.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {b.booking_status !== "checked_in" && b.booking_status !== "completed" && b.booking_status !== "cancelled" && (
                              <button
                                onClick={() => handleUpdateBookingStatus(b.id, "checked_in")}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[11px] hover:bg-emerald-100"
                              >
                                Check In
                              </button>
                            )}

                            {b.booking_status !== "cancelled" && (
                              <button
                                onClick={() => handleUpdateBookingStatus(b.id, "no_show")}
                                className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-semibold text-[11px] hover:bg-amber-100"
                              >
                                No Show
                              </button>
                            )}

                            {b.booking_status !== "cancelled" && (
                              <button
                                onClick={() => handleUpdateBookingStatus(b.id, "cancelled")}
                                className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 font-semibold text-[11px] hover:bg-red-100"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}



      {/* ─── TAB 4: CANCELLATIONS TAB ────────────────────────────────────────── */}
      {activeTab === "cancellations" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 shadow-xs flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={cancellationSearchQuery}
                onChange={(e) => setCancellationSearchQuery(e.target.value)}
                placeholder="Search cancelled bookings by member name, email, phone, or class title..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs text-[#362B24] focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A3B32]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
              {cancelledBookings.length} Cancelled Reservations
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-xs">
            {cancelledBookings.length === 0 ? (
              <div className="text-center py-16 px-4">
                <p className="text-sm font-semibold text-[#362B24]">No cancelled bookings</p>
                <p className="text-xs text-[#4A3B32]/50 mt-1">Cancelled class reservations will automatically appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-red-50/50 border-b border-[#E5DDD0] text-red-900 font-semibold uppercase tracking-wider whitespace-nowrap">
                      <th className="py-3.5 px-4">Member Name</th>
                      <th className="py-3.5 px-4">Phone / Email</th>
                      <th className="py-3.5 px-4">Class Session</th>
                      <th className="py-3.5 px-4">Session Date &amp; Time</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5DDD0]/50 whitespace-nowrap">
                    {cancelledBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-[#FAF7F2]/50 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-[#362B24]">
                          {b.approved_members?.full_name || "Member"}
                        </td>
                        <td className="py-3.5 px-4 text-[#4A3B32]/70">
                          {b.approved_members?.phone_number} • {b.approved_members?.email}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-[#362B24]">
                          {b.classes?.title || "Pilates Session"}
                        </td>
                        <td className="py-3.5 px-4 text-[#4A3B32]">
                          {formatDate(b.classes?.class_date)} @ {formatTime(b.classes?.class_time)}
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusBadge status="cancelled" />
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleUpdateBookingStatus(b.id, "booked")}
                            className="px-3 py-1.5 rounded-xl bg-[#4A3B32] text-white font-semibold text-xs hover:bg-[#362B24]"
                          >
                            Re-book Member
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL: SCHEDULE SESSION (SINGLE OR RECURRING) ────────────────── */}
      {showScheduleModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs animate-fade-in"
          onClick={() => setShowScheduleModal(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-xl w-full space-y-4 shadow-2xl border border-[#E5DDD0] max-h-[90vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5DDD0] pb-3">
              <h3 className="text-base font-serif font-bold text-[#362B24]">Schedule Class Session</h3>
              <button onClick={() => setShowScheduleModal(false)} className="text-xs font-bold text-[#4A3B32]">✕</button>
            </div>

            <form onSubmit={handleScheduleSessionsSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#4A3B32] mb-1">Class Name / Title *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Reformer Group Class, Mat Pilates, PT Session"
                  className="w-full px-3 py-2 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs text-[#362B24]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-[#4A3B32] mb-1">Instructor *</label>
                  <select
                    value={formInstructor}
                    onChange={(e) => setFormInstructor(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs text-[#362B24]"
                  >
                    {PREDEFINED_INSTRUCTORS.map((ins) => (
                      <option key={ins} value={ins}>{ins}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#4A3B32] mb-1">Difficulty Level</label>
                  <select
                    value={formDifficulty}
                    onChange={(e) => setFormDifficulty(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs text-[#362B24]"
                  >
                    <option value="All Levels">All Levels</option>
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-[#4A3B32] mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs text-[#362B24]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A3B32] mb-1">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs text-[#362B24]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#4A3B32] mb-1">Max Capacity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formCapacity}
                    onChange={(e) => setFormCapacity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs text-[#362B24]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-[#4A3B32] mb-1">Room / Location</label>
                  <select
                    value={formRoom}
                    onChange={(e) => setFormRoom(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs text-[#362B24]"
                  >
                    {PREDEFINED_ROOMS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#4A3B32] mb-1">Equipment Required</label>
                  <input
                    type="text"
                    value={formEquipment}
                    onChange={(e) => setFormEquipment(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs text-[#362B24]"
                  />
                </div>
              </div>

              {/* Recurring Checkbox */}
              <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E5DDD0] space-y-2">
                <label className="flex items-center gap-2 font-semibold text-[#362B24] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsRecurring}
                    onChange={(e) => setFormIsRecurring(e.target.checked)}
                    className="rounded text-[#B89368] focus:ring-[#B89368]"
                  />
                  <span>Schedule Recurring Session (Auto Repeat)</span>
                </label>

                {formIsRecurring && (
                  <div className="pt-2 border-t border-[#E5DDD0]/60">
                    <label className="block text-[10px] text-[#4A3B32]/70 mb-1 font-medium">Repeat Interval</label>
                    <select
                      value={formRepeatInterval}
                      onChange={(e) => setFormRepeatInterval(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#E5DDD0] bg-white text-xs text-[#362B24]"
                    >
                      <option value="daily">Daily (Repeats every day)</option>
                      <option value="weekly">Weekly (Repeats every week)</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#E5DDD0] text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-[#B89368] text-white text-xs font-semibold hover:bg-[#A68B6B] disabled:opacity-50"
                >
                  {formSubmitting ? "Scheduling..." : "Confirm Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: MEMBER BOOKING WORKFLOW (WITH PLAN ELIGIBILITY CHECK) ────── */}
      {showMemberBookingModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs animate-fade-in"
          onClick={() => setShowMemberBookingModal(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-xl w-full space-y-4 shadow-2xl border border-[#E5DDD0] max-h-[90vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5DDD0] pb-3">
              <div>
                <h3 className="text-base font-serif font-bold text-[#362B24]">Assign Member to Class</h3>
                <p className="text-xs text-[#4A3B32]/50">Verifies purchased plan eligibility server-side</p>
              </div>
              <button onClick={() => setShowMemberBookingModal(false)} className="text-xs font-bold text-[#4A3B32]">✕</button>
            </div>

            {/* Error Message for Failed Eligibility */}
            {bookingEligibilityMessage && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                <span>⚠️ {bookingEligibilityMessage}</span>
              </div>
            )}

            {/* Step 1: Select Member */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#8C7A6B] uppercase tracking-wider">
                Step 1: Select Member
              </label>
              <div className="grid grid-cols-1 max-h-36 overflow-y-auto border border-[#E5DDD0] rounded-xl bg-[#FAF7F2] divide-y divide-[#E5DDD0]/50">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectMemberForBooking(m)}
                    className={`p-2.5 text-left text-xs flex items-center justify-between transition-colors ${
                      selectedBookMember?.id === m.id ? "bg-[#4A3B32] text-white font-bold" : "hover:bg-white text-[#362B24]"
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{m.full_name}</p>
                      <p className={`text-[10px] ${selectedBookMember?.id === m.id ? "text-white/70" : "text-[#4A3B32]/50"}`}>
                        {m.phone_number} • {m.email}
                      </p>
                    </div>
                    {selectedBookMember?.id === m.id && <span>✓ Selected</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Display Purchased Active Plans */}
            {selectedBookMember && (
              <div className="space-y-2 pt-2 border-t border-[#E5DDD0]">
                <label className="block text-xs font-bold text-[#8C7A6B] uppercase tracking-wider">
                  Step 2: Active Purchased Plan Eligibility
                </label>
                {plansLoading ? (
                  <p className="text-xs text-[#4A3B32]/50">Loading active plans...</p>
                ) : memberPlans.length === 0 ? (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
                    ⚠️ This member does not have an active purchased plan. Booking will be blocked.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {memberPlans.map((plan) => (
                      <div key={plan.id} className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex justify-between items-center text-emerald-900">
                        <div>
                          <span className="font-bold">{plan.plan_name}</span>
                          <span className="text-[10px] block text-emerald-700">Category: {plan.category} • Valid until: {formatDate(plan.valid_until)}</span>
                        </div>
                        <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-emerald-200">
                          {plan.sessions_total ? `${plan.sessions_remaining} / ${plan.sessions_total} sessions` : "Unlimited Plan"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Select Available Session */}
            {selectedBookMember && (
              <div className="space-y-2 pt-2 border-t border-[#E5DDD0]">
                <label className="block text-xs font-bold text-[#8C7A6B] uppercase tracking-wider">
                  Step 3: Select Available Session
                </label>
                <div className="grid grid-cols-1 max-h-36 overflow-y-auto border border-[#E5DDD0] rounded-xl bg-[#FAF7F2] divide-y divide-[#E5DDD0]/50">
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedBookSession(s)}
                      className={`p-2.5 text-left text-xs flex items-center justify-between transition-colors ${
                        selectedBookSession?.id === s.id ? "bg-[#B89368] text-white font-bold" : "hover:bg-white text-[#362B24]"
                      }`}
                    >
                      <div>
                        <p className="font-semibold">{s.title} ({s.category})</p>
                        <p className={`text-[10px] ${selectedBookSession?.id === s.id ? "text-white/80" : "text-[#4A3B32]/50"}`}>
                          {formatDate(s.class_date)} @ {formatTime(s.class_time)} • {s.instructor}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono">
                        {s.booked_count} / {s.max_capacity}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Confirm Booking Action */}
            <div className="flex gap-2 pt-3 border-t border-[#E5DDD0]">
              <button
                type="button"
                onClick={() => setShowMemberBookingModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#E5DDD0] text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAdminBooking}
                disabled={bookingSubmitting || !selectedBookMember || !selectedBookSession}
                className="flex-1 py-2.5 rounded-xl bg-[#4A3B32] text-white text-xs font-semibold hover:bg-[#362B24] disabled:opacity-50"
              >
                {bookingSubmitting ? "Confirming..." : "Confirm & Deduct Session"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── EDIT CLASS SESSION MODAL ────────────────────────────────────── */}
      {editingSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in"
          onClick={() => setEditingSession(null)}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-xl w-full space-y-4 shadow-2xl border border-[#E5DDD0] max-h-[90vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5DDD0] pb-3">
              <div>
                <h3 className="text-base font-serif font-bold text-[#362B24]">Edit Class Session</h3>
                <p className="text-xs text-[#4A3B32]/50">Update session parameters, schedule, or capacity</p>
              </div>
              <button onClick={() => setEditingSession(null)} className="text-xs font-bold text-[#4A3B32]">✕</button>
            </div>

            <form onSubmit={handleEditSessionSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#4A3B32] mb-1">Class Title *</label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full p-2.5 bg-[#FAF7F2] border border-[#E5DDD0] rounded-xl text-xs text-[#362B24] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#4A3B32] mb-1">Instructor *</label>
                  <select
                    value={editInstructor}
                    onChange={(e) => setEditInstructor(e.target.value)}
                    className="w-full p-2.5 bg-[#FAF7F2] border border-[#E5DDD0] rounded-xl text-xs text-[#362B24] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
                  >
                    {PREDEFINED_INSTRUCTORS.map((ins) => (
                      <option key={ins} value={ins}>{ins}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#4A3B32] mb-1">Difficulty Level</label>
                  <select
                    value={editDifficulty}
                    onChange={(e) => setEditDifficulty(e.target.value)}
                    className="w-full p-2.5 bg-[#FAF7F2] border border-[#E5DDD0] rounded-xl text-xs text-[#362B24] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
                  >
                    <option value="All Levels">All Levels</option>
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#4A3B32] mb-1">Class Date *</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full p-2.5 bg-[#FAF7F2] border border-[#E5DDD0] rounded-xl text-xs text-[#362B24] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#4A3B32] mb-1">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-full p-2.5 bg-[#FAF7F2] border border-[#E5DDD0] rounded-xl text-xs text-[#362B24] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#4A3B32] mb-1">Duration (Mins) *</label>
                  <input
                    type="number"
                    required
                    min="15"
                    max="180"
                    value={editDuration}
                    onChange={(e) => setEditDuration(e.target.value)}
                    className="w-full p-2.5 bg-[#FAF7F2] border border-[#E5DDD0] rounded-xl text-xs text-[#362B24] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#4A3B32] mb-1">Max Capacity *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={editCapacity}
                    onChange={(e) => setEditCapacity(e.target.value)}
                    className="w-full p-2.5 bg-[#FAF7F2] border border-[#E5DDD0] rounded-xl text-xs text-[#362B24] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#4A3B32] mb-1">Room / Location</label>
                  <select
                    value={editRoom}
                    onChange={(e) => setEditRoom(e.target.value)}
                    className="w-full p-2.5 bg-[#FAF7F2] border border-[#E5DDD0] rounded-xl text-xs text-[#362B24] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
                  >
                    {PREDEFINED_ROOMS.map((rm) => (
                      <option key={rm} value={rm}>{rm}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#4A3B32] mb-1">Equipment Required</label>
                  <input
                    type="text"
                    value={editEquipment}
                    onChange={(e) => setEditEquipment(e.target.value)}
                    placeholder="e.g. Reformers, Grip Socks"
                    className="w-full p-2.5 bg-[#FAF7F2] border border-[#E5DDD0] rounded-xl text-xs text-[#362B24] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-[#E5DDD0]">
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  className="flex-1 py-2.5 rounded-xl border border-[#E5DDD0] text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-[#4A3B32] text-white text-xs font-semibold hover:bg-[#362B24] disabled:opacity-50"
                >
                  {editSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── DELETE CLASS SESSION MODAL ──────────────────────────────────── */}
      {deletingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-[#E5DDD0]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-base">
                🗑️
              </div>
              <div>
                <h3 className="text-base font-serif font-bold text-[#362B24]">Delete Class Session?</h3>
                <p className="text-xs text-[#4A3B32]/60">Permanent action</p>
              </div>
            </div>

            <p className="text-xs text-[#4A3B32]">
              Are you sure you want to delete <strong className="text-[#362B24]">{deletingSession.title}</strong> scheduled for{" "}
              <strong>{formatDate(deletingSession.class_date)} @ {formatTime(deletingSession.class_time)}</strong>?
            </p>

            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-800">
              ⚠️ This will permanently remove the class session and cancel all associated member bookings ({deletingSession.booked_count || 0} booked).
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#E5DDD0]">
              <button
                type="button"
                onClick={() => setDeletingSession(null)}
                className="flex-1 py-2.5 rounded-xl border border-[#E5DDD0] text-xs font-semibold text-[#4A3B32]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSession}
                disabled={deleteSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {deleteSubmitting ? "Deleting..." : "Delete Class"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
