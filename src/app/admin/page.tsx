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
        .gte("scanned_at", startOfDayIso);

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
    });
  }

  const selectedClassData = classes.find((c) => c.id === selectedClass);

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Welcome Banner + Top Right Royal Purple New Class Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#1B0B38]">
            Good morning, Admin!
          </h1>
          <p className="text-sm text-[#1B0B38]/70 mt-1">
            Here&apos;s what&apos;s happening at Corhaus today.
          </p>
        </div>
        <Link
          href="/admin/classes"
          className="px-5 py-2.5 rounded-xl bg-[#7B3FE4] text-white text-sm font-semibold hover:bg-[#6A2FD3] transition-colors shadow-md flex items-center gap-1.5"
        >
          <span>+</span> New Class
        </Link>
      </div>

      {/* 4 Real Data KPI Cards matching exact mockup colors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Today's Classes */}
        <div className="bg-white rounded-[24px] p-6 border border-[#1B0B38]/10 shadow-xs flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-bold text-[#1B0B38]/60 tracking-wider uppercase">
              Today&apos;s Classes
            </p>
            <p className="text-3xl font-extrabold text-[#1B0B38] mt-2">
              {loading ? "..." : todaysClassesCount}
            </p>
            <Link
              href="/admin/classes"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#7B3FE4] hover:underline mt-3"
            >
              View all classes &rarr;
            </Link>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#F2EBFE] text-[#7B3FE4] flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        {/* Total Members */}
        <div className="bg-white rounded-[24px] p-6 border border-[#1B0B38]/10 shadow-xs flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-bold text-[#1B0B38]/60 tracking-wider uppercase">
              Total Members
            </p>
            <p className="text-3xl font-extrabold text-[#1B0B38] mt-2">
              {loading ? "..." : totalMembersCount}
            </p>
            <Link
              href="/admin/members"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] hover:underline mt-3"
            >
              View all members &rarr;
            </Link>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        </div>

        {/* Today's Revenue */}
        <div className="bg-white rounded-[24px] p-6 border border-[#1B0B38]/10 shadow-xs flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-bold text-[#1B0B38]/60 tracking-wider uppercase">
              Today&apos;s Revenue
            </p>
            <p className="text-3xl font-extrabold text-[#1B0B38] mt-2">
              {loading ? "..." : "₹" + todaysRevenue.toLocaleString("en-IN")}
            </p>
            <Link
              href="/admin/billing/invoices"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#D97706] hover:underline mt-3"
            >
              View details &rarr;
            </Link>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center flex-shrink-0 font-bold text-xl">
            ₹
          </div>
        </div>

        {/* Check-ins Today */}
        <div className="bg-white rounded-[24px] p-6 border border-[#1B0B38]/10 shadow-xs flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-bold text-[#1B0B38]/60 tracking-wider uppercase">
              Check-ins Today
            </p>
            <p className="text-3xl font-extrabold text-[#1B0B38] mt-2">
              {loading ? "..." : checkInsTodayCount}
            </p>
            <Link
              href="/admin/scanner"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#10B981] hover:underline mt-3"
            >
              View scanner &rarr;
            </Link>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#D1FAE5] text-[#10B981] flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Upcoming Classes Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#1B0B38]">Upcoming Classes</h2>
          <Link
            href="/admin/classes"
            className="text-xs font-bold text-[#7B3FE4] hover:underline"
          >
            + Create Class
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-[#7B3FE4]/30 border-t-[#7B3FE4] rounded-full animate-spin" />
          </div>
        ) : classes.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-[#1B0B38]/10 p-12 text-center shadow-xs space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#F2EBFE] text-[#7B3FE4] flex items-center justify-center mx-auto">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-[#1B0B38]">No upcoming classes scheduled</p>
            <Link
              href="/admin/classes"
              className="inline-block text-xs font-bold text-[#7B3FE4] hover:underline"
            >
              Create your first class
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((c) => {
              const bookedCount = bookingsCountMap[c.id] || 0;
              const isFull = bookedCount >= c.max_capacity;

              return (
                <div
                  key={c.id}
                  onClick={() => handleClassClick(c.id)}
                  className={`bg-white rounded-[24px] border p-5 cursor-pointer transition-all ${
                    selectedClass === c.id
                      ? "border-[#7B3FE4] ring-2 ring-[#7B3FE4]/20 shadow-md"
                      : "border-[#1B0B38]/10 hover:border-[#7B3FE4]"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-base text-[#1B0B38]">{c.title}</h3>
                      <p className="text-xs text-[#1B0B38]/60 mt-0.5">{c.instructor}</p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        isFull
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      }`}
                    >
                      {isFull ? "FULL" : `${c.max_capacity - bookedCount} left`}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#1B0B38]/10 flex items-center justify-between text-xs text-[#1B0B38]">
                    <span>
                      {formatDate(c.class_date)} @ {formatTime(c.class_time)}
                    </span>
                    <span className="font-bold">
                      {bookedCount} / {c.max_capacity}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Class Member Bookings & Attendance Details */}
      {selectedClass && selectedClassData && (
        <div className="bg-white rounded-[24px] border border-[#1B0B38]/10 p-6 shadow-md space-y-4 animate-slide-up">
          <div className="flex items-center justify-between border-b border-[#1B0B38]/10 pb-4">
            <div>
              <h3 className="text-lg font-bold text-[#1B0B38]">
                {selectedClassData.title} &mdash; Details
              </h3>
              <p className="text-xs text-[#1B0B38]/60 mt-0.5">
                Instructor: {selectedClassData.instructor} &bull; {formatDate(selectedClassData.class_date)} @ {formatTime(selectedClassData.class_time)}
              </p>
            </div>
            <button
              onClick={() => setSelectedClass(null)}
              className="text-xs font-bold text-[#1B0B38]/60 hover:text-[#1B0B38]"
            >
              ✕ Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bookings List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#1B0B38]/60 uppercase tracking-wider">
                Booked Members ({bookings.length})
              </h4>
              {bookingsLoading ? (
                <div className="py-6 text-center text-xs text-[#1B0B38]/50">Loading bookings...</div>
              ) : bookings.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#1B0B38]/50 bg-[#FAF9FC] rounded-xl">
                  No member bookings for this session yet
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {bookings.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-xl bg-[#FAF9FC] border border-[#1B0B38]/10 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-bold text-[#1B0B38]">{b.profiles?.full_name || "Member"}</p>
                        <p className="text-[11px] text-[#1B0B38]/60">{b.profiles?.phone_number || b.profiles?.email}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-[#7B3FE4]/10 text-[#7B3FE4] font-bold text-[10px]">
                        BOOKED
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Attendance Checked In List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#1B0B38]/60 uppercase tracking-wider">
                Checked In Attendance ({attended.length})
              </h4>
              {attendanceLoading ? (
                <div className="py-6 text-center text-xs text-[#1B0B38]/50">Loading attendance...</div>
              ) : attended.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#1B0B38]/50 bg-[#FAF9FC] rounded-xl">
                  No check-ins recorded yet for this session
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {attended.map((a) => (
                    <div
                      key={a.id}
                      className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-900"
                    >
                      <div>
                        <p className="font-bold">{a.profiles?.full_name || "Member"}</p>
                        <p className="text-[11px] text-emerald-700">{a.profiles?.email}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-bold text-[10px]">
                        ATTENDED
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
