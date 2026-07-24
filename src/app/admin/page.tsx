"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface ClassData {
  id: string;
  title: string;
  instructor: string;
  class_date: string;
  class_time: string;
  max_capacity: number;
  created_at: string;
}

interface BookingWithProfile {
  id: string;
  booking_status: string;
  created_at: string;
  member_id: string;
  cancelled_at?: string | null;
  profiles: {
    full_name: string;
    email: string;
    phone_number: string;
    avatar_url: string | null;
  } | null;
}

interface AttendanceWithProfile {
  id: string;
  scanned_at: string;
  member_id: string;
  profiles: {
    full_name: string;
    email: string;
    avatar_url: string | null;
  } | null;
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

export default function AdminDashboard() {
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [bookings, setBookings] = useState<BookingWithProfile[]>([]);
  const [attended, setAttended] = useState<AttendanceWithProfile[]>([]);
  const [bookingsCountMap, setBookingsCountMap] = useState<Record<string, number>>({});
  
  // Real KPI Metrics
  const [todaysClassesCount, setTodaysClassesCount] = useState<number>(0);
  const [totalMembersCount, setTotalMembersCount] = useState<number>(0);
  const [todaysRevenue, setTodaysRevenue] = useState<number>(0);
  const [checkInsTodayCount, setCheckInsTodayCount] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  // Load KPI metrics and classes dynamically from Supabase
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const todayStr = getTodayIstString();

      // 1. Fetch Classes
      const { data: classData, error: classError } = await supabase
        .from("classes")
        .select("*")
        .order("class_date", { ascending: true })
        .order("class_time", { ascending: true });

      if (classError) {
        console.error("Failed to load classes:", classError);
      }

      let upcomingClasses: ClassData[] = [];
      let todayCount = 0;

      if (classData) {
        const now = Date.now();
        upcomingClasses = classData.filter(
          (c) => parseAsIst(c.class_date, c.class_time) + 60 * 60 * 1000 > now
        );
        todayCount = classData.filter((c) => c.class_date === todayStr).length;
      }

      // 2. Fetch Booking Counts for all active classes
      const { data: allBookings } = await supabase
        .from("bookings")
        .select("class_id")
        .eq("booking_status", "booked");

      const bMap: Record<string, number> = {};
      if (allBookings) {
        allBookings.forEach((b) => {
          bMap[b.class_id] = (bMap[b.class_id] || 0) + 1;
        });
      }

      // 3. Fetch Total Members
      const { count: membersCount } = await supabase
        .from("approved_members")
        .select("*", { count: "exact", head: true });

      // 4. Fetch Today's Revenue from Paid Invoices (using exact local IST start-of-day)
      const nowIST = new Date();
      nowIST.setHours(0, 0, 0, 0);
      const startOfDayIso = `${todayStr}T00:00:00.000+05:30`;

      const { data: todaysInvoices } = await supabase
        .from("invoices")
        .select("amount_paid, grand_total, created_at")
        .eq("payment_status", "paid")
        .gte("created_at", startOfDayIso);

      let revTotal = 0;
      if (todaysInvoices) {
        revTotal = todaysInvoices.reduce((sum, inv) => {
          const paid = inv.amount_paid !== null && inv.amount_paid !== undefined && Number(inv.amount_paid) > 0
            ? Number(inv.amount_paid)
            : Number(inv.grand_total || 0);
          return sum + paid;
        }, 0);
      }

      // 5. Fetch Check-ins Today
      const { count: checkInsCount } = await supabase
        .from("attendance")
        .select("*", { count: "exact", head: true })
        .eq("attendance_status", "attended")
        .gte("scanned_at", `${todayStr}T00:00:00.000Z`);

      startTransition(() => {
        setClasses(upcomingClasses);
        setTodaysClassesCount(todayCount);
        setBookingsCountMap(bMap);
        setTotalMembersCount(membersCount || 0);
        setTodaysRevenue(revTotal);
        setCheckInsTodayCount(checkInsCount || 0);
        setLoading(false);
      });
    } catch (err) {
      console.error("loadDashboardData exception:", err);
      setLoading(false);
    }
  }, [supabase]);

  const loadBookings = useCallback(
    async (classId: string) => {
      setBookingsLoading(true);
      const { data, error } = await supabase
        .from("bookings")
        .select("*, profiles(full_name, email, phone_number, avatar_url)")
        .eq("class_id", classId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        startTransition(() => {
          setBookings(data as BookingWithProfile[]);
          setBookingsLoading(false);
        });
      } else {
        setBookingsLoading(false);
      }
    },
    [supabase]
  );

  const loadAttendance = useCallback(
    async (classId: string) => {
      setAttendanceLoading(true);
      const { data, error } = await supabase
        .from("attendance")
        .select("*, profiles!inner(full_name, email, avatar_url)")
        .eq("class_id", classId)
        .eq("attendance_status", "attended")
        .order("scanned_at", { ascending: true });

      if (!error && data) {
        startTransition(() => {
          setAttended(data as AttendanceWithProfile[]);
          setAttendanceLoading(false);
        });
      } else {
        setAttendanceLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          loadDashboardData();
          if (selectedClass) loadBookings(selectedClass);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "classes" },
        () => {
          loadDashboardData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance" },
        () => {
          loadDashboardData();
          if (selectedClass) loadAttendance(selectedClass);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        () => {
          loadDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadDashboardData, loadBookings, loadAttendance, selectedClass]);

  function handleClassClick(classId: string) {
    if (selectedClass === classId) {
      setSelectedClass(null);
      setBookings([]);
      setAttended([]);
    } else {
      setSelectedClass(classId);
      loadBookings(classId);
      loadAttendance(classId);
    }
  }

  async function handleDeleteClass(e: React.MouseEvent, classId: string) {
    e.stopPropagation();
    if (!confirm("Remove this class? All bookings for it will also be cancelled.")) return;

    setDeletingId(classId);
    const { error } = await supabase.from("classes").delete().eq("id", classId);
    setDeletingId(null);

    if (error) {
      alert("Failed to remove class: " + error.message);
      return;
    }

    if (selectedClass === classId) {
      setSelectedClass(null);
      setBookings([]);
    }
    loadDashboardData();
  }

  function formatTime(time: string) {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 || 12;
    return `${displayH}:${minutes} ${ampm}`;
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const selectedClassData = classes.find((c) => c.id === selectedClass);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Banner + Top Right New Class Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-[#362B24]">
            Good morning, Admin!
          </h1>
          <p className="text-sm text-[#4A3B32]/60 mt-1 font-sans">
            Here&apos;s what&apos;s happening at Corhaus today.
          </p>
        </div>
        <Link
          href="/admin/classes/new"
          className="px-5 py-2.5 rounded-xl bg-[#B89368] text-white text-sm font-semibold hover:bg-[#A68B6B] transition-colors shadow-sm flex items-center gap-1.5"
        >
          <span>+</span> New Class
        </Link>
      </div>

      {/* 4 Real Data KPI Cards matching exact mockup colors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Today's Classes */}
        <div className="bg-white rounded-[20px] p-5 border border-[#E5DDD0] shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-semibold text-[#4A3B32]/50 tracking-wide uppercase">
              Today&apos;s Classes
            </p>
            <p className="text-3xl font-bold text-[#362B24] mt-2">
              {loading ? "..." : todaysClassesCount}
            </p>
            <Link
              href="/admin/classes/new"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#B89368] hover:underline mt-3"
            >
              View all classes &rarr;
            </Link>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FDF2F0] text-[#D97762] flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        {/* Total Members */}
        <div className="bg-white rounded-[20px] p-5 border border-[#E5DDD0] shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-semibold text-[#4A3B32]/50 tracking-wide uppercase">
              Total Members
            </p>
            <p className="text-3xl font-bold text-[#362B24] mt-2">
              {loading ? "..." : totalMembersCount}
            </p>
            <Link
              href="/admin/members"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#8B5CF6] hover:underline mt-3"
            >
              View all members &rarr;
            </Link>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#F5F0FB] text-[#8B5CF6] flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        </div>

        {/* Today's Revenue */}
        <div className="bg-white rounded-[20px] p-5 border border-[#E5DDD0] shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-semibold text-[#4A3B32]/50 tracking-wide uppercase">
              Today&apos;s Revenue
            </p>
            <p className="text-3xl font-bold text-[#362B24] mt-2">
              {loading ? "..." : `₹${todaysRevenue.toLocaleString("en-IN")}`}
            </p>
            <Link
              href="/admin/billing/invoices"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#D97706] hover:underline mt-3"
            >
              View details &rarr;
            </Link>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FFF9EE] text-[#D97706] flex items-center justify-center flex-shrink-0 font-bold text-xl">
            ₹
          </div>
        </div>

        {/* Check-ins Today */}
        <div className="bg-white rounded-[20px] p-5 border border-[#E5DDD0] shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-semibold text-[#4A3B32]/50 tracking-wide uppercase">
              Check-ins Today
            </p>
            <p className="text-3xl font-bold text-[#362B24] mt-2">
              {loading ? "..." : checkInsTodayCount}
            </p>
            <Link
              href="/admin/scanner"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#16A34A] hover:underline mt-3"
            >
              View scanner &rarr;
            </Link>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#F0FDF4] text-[#16A34A] flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Full-width Upcoming Classes Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-serif text-[#362B24]">
            Upcoming Classes
          </h2>
          <Link
            href="/admin/classes/new"
            className="text-xs font-semibold text-[#B89368] hover:underline flex items-center gap-1"
          >
            + Create Class
          </Link>
        </div>

        {loading || isPending ? (
          <div className="flex items-center justify-center py-16 bg-white rounded-[20px] border border-[#E5DDD0]">
            <div className="w-6 h-6 border-2 border-[#B89368]/30 border-t-[#B89368] rounded-full animate-spin" />
          </div>
        ) : classes.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-[20px] border border-[#E5DDD0]">
            <p className="text-[#4A3B32]/40 mb-3 text-sm">No upcoming classes scheduled</p>
            <Link
              href="/admin/classes/new"
              className="text-sm text-[#B89368] font-medium hover:underline"
            >
              Create your first class
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-[20px] border border-[#E5DDD0] overflow-hidden shadow-sm">
            <div className="divide-y divide-[#E5DDD0]/60">
              {classes.map((cls) => {
                const spotsFilled = bookingsCountMap[cls.id] || 0;
                const isSelected = selectedClass === cls.id;

                return (
                  <div
                    key={cls.id}
                    onClick={() => handleClassClick(cls.id)}
                    className={`p-4.5 transition-colors cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? "bg-[#4A3B32]/5 border-l-4 border-l-[#B89368]"
                        : "hover:bg-[#FAF7F2]"
                    }`}
                  >
                    <div className="flex items-center gap-5">
                      <div className="text-xs font-semibold text-[#4A3B32] bg-[#F4EFE6] px-3.5 py-2 rounded-xl border border-[#E5DDD0]">
                        {formatTime(cls.class_time)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-[#362B24] text-base">
                          {cls.title}
                        </h3>
                        <p className="text-xs text-[#4A3B32]/50 mt-0.5">
                          with {cls.instructor} &bull; {formatDate(cls.class_date)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <span className="text-sm font-bold text-[#362B24]">
                          {spotsFilled} / {cls.max_capacity}
                        </span>
                        <span className="text-[11px] text-[#4A3B32]/40 block">
                          spots filled
                        </span>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Upcoming
                      </span>
                      <button
                        onClick={(e) => handleDeleteClass(e, cls.id)}
                        disabled={deletingId === cls.id}
                        className="p-2 rounded-lg text-[#4A3B32]/30 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove class"
                      >
                        {deletingId === cls.id ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Enrolled Members Details Panel */}
      {selectedClass && selectedClassData && (
        <div className="bg-white rounded-[20px] border border-[#E5DDD0] p-6 animate-slide-up shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-serif text-[#362B24]">
                Enrolled Members
              </h3>
              <p className="text-sm text-[#4A3B32]/50 font-sans">
                {selectedClassData.title} &bull; with {selectedClassData.instructor}
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#FAF7F2] text-[#4A3B32] border border-[#E5DDD0]">
              {bookings.filter((b) => b.booking_status === "booked").length} / {selectedClassData.max_capacity} spots filled
            </span>
          </div>

          {bookingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-[#B89368]/30 border-t-[#B89368] rounded-full animate-spin" />
            </div>
          ) : bookings.filter((b) => b.booking_status === "booked").length === 0 ? (
            <p className="text-center py-8 text-[#4A3B32]/40 text-sm font-sans">
              No active bookings yet for this class
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="border-b border-[#E5DDD0] text-xs font-semibold text-[#4A3B32]/50 uppercase">
                    <th className="text-left py-3 px-4">Name</th>
                    <th className="text-left py-3 px-4">Email</th>
                    <th className="text-left py-3 px-4">Phone</th>
                    <th className="text-left py-3 px-4">Booked At</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings
                    .filter((b) => b.booking_status === "booked")
                    .map((booking) => (
                      <tr key={booking.id} className="border-b border-[#E5DDD0]/50 last:border-0 hover:bg-[#FAF7F2]">
                        <td className="py-3 px-4 text-[#362B24] font-medium">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full overflow-hidden border border-[#E5DDD0] bg-[#FAF7F2] flex-shrink-0 flex items-center justify-center">
                              {booking.profiles?.avatar_url ? (
                                <img src={booking.profiles.avatar_url} alt={booking.profiles.full_name} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[10px] font-semibold text-[#4A3B32]/50">
                                  {(booking.profiles?.full_name || "N").charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <span>{booking.profiles?.full_name || "N/A"}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#4A3B32]/60">
                          {booking.profiles?.email || "N/A"}
                        </td>
                        <td className="py-3 px-4 text-[#4A3B32]/60">
                          {booking.profiles?.phone_number || "N/A"}
                        </td>
                        <td className="py-3 px-4 text-[#4A3B32]/50 text-xs">
                          {new Date(booking.created_at).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Cancelled Bookings */}
          {!bookingsLoading && bookings.filter((b) => b.booking_status === "cancelled").length > 0 && (
            <div className="mt-6 pt-6 border-t border-[#E5DDD0]">
              <h4 className="text-base font-serif text-[#362B24] mb-3">Cancelled Bookings</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="border-b border-[#E5DDD0] text-xs font-semibold text-[#4A3B32]/50 uppercase">
                      <th className="text-left py-3 px-4">Name</th>
                      <th className="text-left py-3 px-4">Email</th>
                      <th className="text-left py-3 px-4">Phone</th>
                      <th className="text-left py-3 px-4">Cancelled At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings
                      .filter((b) => b.booking_status === "cancelled")
                      .map((booking) => (
                        <tr key={booking.id} className="border-b border-[#E5DDD0]/50 last:border-0 hover:bg-[#FAF7F2]">
                          <td className="py-3 px-4 text-[#4A3B32]/60 font-medium">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full overflow-hidden border border-[#E5DDD0] bg-[#FAF7F2] flex-shrink-0 flex items-center justify-center opacity-70">
                                {booking.profiles?.avatar_url ? (
                                  <img src={booking.profiles.avatar_url} alt={booking.profiles.full_name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[10px] font-semibold text-[#4A3B32]/50">
                                    {(booking.profiles?.full_name || "N").charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <span className="line-through">{booking.profiles?.full_name || "N/A"}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-[#4A3B32]/40">
                            {booking.profiles?.email || "N/A"}
                          </td>
                          <td className="py-3 px-4 text-[#4A3B32]/40">
                            {booking.profiles?.phone_number || "N/A"}
                          </td>
                          <td className="py-3 px-4 text-[#4A3B32]/40 text-xs">
                            {booking.cancelled_at ? new Date(booking.cancelled_at).toLocaleString("en-IN") : new Date(booking.created_at).toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Attended Members */}
          <div className="mt-6 pt-6 border-t border-[#E5DDD0]">
            <h4 className="text-base font-serif text-[#362B24] mb-3">Attended Members</h4>
            {(() => {
              const classStart = new Date(`${selectedClassData.class_date}T${selectedClassData.class_time}`);
              const now = new Date();
              if (now < classStart) {
                return (
                  <p className="text-center py-6 text-[#4A3B32]/40 text-sm font-sans">
                    Attendance records will be available when the class begins.
                  </p>
                );
              }
              return attendanceLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-[#B89368]/30 border-t-[#B89368] rounded-full animate-spin" />
                </div>
              ) : attended.length === 0 ? (
                <p className="text-center py-6 text-[#4A3B32]/40 text-sm font-sans">
                  No attendance recorded yet
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-sans">
                    <thead>
                      <tr className="border-b border-[#E5DDD0] text-xs font-semibold text-[#4A3B32]/50 uppercase">
                        <th className="text-left py-3 px-4">Name</th>
                        <th className="text-left py-3 px-4">Email</th>
                        <th className="text-left py-3 px-4">Check-in Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attended.map((a) => (
                        <tr key={a.id} className="border-b border-[#E5DDD0]/50 last:border-0">
                          <td className="py-3 px-4 text-[#362B24] font-medium">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full overflow-hidden border border-[#E5DDD0] bg-[#FAF7F2] flex-shrink-0 flex items-center justify-center">
                                {a.profiles?.avatar_url ? (
                                  <img src={a.profiles.avatar_url} alt={a.profiles.full_name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[10px] font-semibold text-[#4A3B32]/50">
                                    {(a.profiles?.full_name || "N").charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <span>{a.profiles?.full_name || "N/A"}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-[#4A3B32]/60">
                            {a.profiles?.email || "N/A"}
                          </td>
                          <td className="py-3 px-4 text-[#4A3B32]/50 text-xs">
                            {a.scanned_at ? new Date(a.scanned_at).toLocaleString("en-IN") : "N/A"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
