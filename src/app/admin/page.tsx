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
  status?: string;
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

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [rosterTab, setRosterTab] = useState<"bookings" | "attended">("bookings");
  const [rosterSearch, setRosterSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const supabase = createClient();
  const [, startTransition] = useTransition();

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
        upcomingClasses = classData.filter((c) => c.class_date === todayStr && c.status !== "cancelled");
        todayCount = upcomingClasses.length;
      }

      // 2. Fetch Booking Counts for all active classes
      const { data: allBookings } = await supabase
        .from("bookings")
        .select("class_id")
        .not("booking_status", "eq", "cancelled");

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

      // 4. Fetch This Month's Revenue from all Paid Invoices
      const istNow = new Date(new Date().getTime() + IST_OFFSET_MS - (-new Date().getTimezoneOffset() * 60 * 1000));
      const firstOfMonthIso = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, "0")}-01T00:00:00.000+05:30`;

      const { data: monthlyInvoices } = await supabase
        .from("invoices")
        .select("amount_paid, grand_total, payment_status, created_at")
        .gte("created_at", firstOfMonthIso);

      let revTotal = 0;
      if (monthlyInvoices) {
        revTotal = monthlyInvoices.reduce((sum, inv) => {
          const status = (inv.payment_status || "").toLowerCase();
          if (status === "paid" || status === "completed") {
            const paid = inv.amount_paid !== null && inv.amount_paid !== undefined && Number(inv.amount_paid) > 0
              ? Number(inv.amount_paid)
              : Number(inv.grand_total || 0);
            return sum + paid;
          }
          return sum;
        }, 0);
      }

      // 5. Fetch Check-ins Today
      const { data: checkInsData } = await supabase
        .from("attendance")
        .select("id, attendance_status, scanned_at, created_at");

      let checkInsCount = 0;
      if (checkInsData) {
        checkInsCount = checkInsData.filter((a: any) => {
          const status = (a.attendance_status || "").toLowerCase();
          const isAttended = status === "attended" || status === "present";
          if (!isAttended) return false;
          const dt = a.scanned_at || a.created_at;
          if (!dt) return false;
          return dt.startsWith(todayStr);
        }).length;
      }

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
      try {
        let allBookings: any[] = [];
        const bkRes = await fetch(`/api/admin/bookings`, { cache: "no-store" });
        const bkJson = await bkRes.json();
        if (bkRes.ok && bkJson?.bookings) {
          allBookings = bkJson.bookings;
        } else {
          const [bkDataRes, amDataRes] = await Promise.all([
            supabase.from("bookings").select("*, profiles(id, full_name, email, phone_number)").eq("class_id", classId),
            supabase.from("approved_members").select("id, full_name, email, phone_number"),
          ]);
          const rawBks = bkDataRes.data || [];
          const amList = amDataRes.data || [];
          const amByEmail: Record<string, any> = {};
          amList.forEach((m: any) => {
            if (m.email) amByEmail[m.email.toLowerCase()] = m;
          });

          allBookings = rawBks.map((b: any) => {
            const p = b.profiles || {};
            const email = p.email || "";
            const am = email ? amByEmail[email.toLowerCase()] : null;
            return {
              ...b,
              approved_members: {
                id: am?.id || p.id || b.member_id,
                full_name: am?.full_name || p.full_name || (email ? email.split("@")[0] : "Member"),
                email: email,
                phone_number: am?.phone_number || p.phone_number || "N/A",
              },
            };
          });
        }

        const classBookings = allBookings.filter(
          (b: any) =>
            (b.class_id === classId || b.classes?.id === classId) &&
            (b.booking_status === "booked" || b.booking_status === "confirmed" || b.booking_status === "waitlisted")
        );
        setBookings(classBookings);
      } catch (err) {
        console.error("loadBookings error:", err);
      } finally {
        setBookingsLoading(false);
      }
    },
    [supabase]
  );

  const loadAttendance = useCallback(
    async (classId: string) => {
      setAttendanceLoading(true);
      try {
        let allBookings: any[] = [];
        const [bkRes, attRes] = await Promise.all([
          fetch(`/api/admin/bookings`, { cache: "no-store" }),
          supabase.from("attendance").select("*").eq("class_id", classId).eq("attendance_status", "attended"),
        ]);

        const bkJson = await bkRes.json();
        const attData = attRes.data || [];

        if (bkRes.ok && bkJson?.bookings) {
          allBookings = bkJson.bookings;
        } else {
          const [bkDataRes, amDataRes] = await Promise.all([
            supabase.from("bookings").select("*, profiles(id, full_name, email, phone_number)").eq("class_id", classId),
            supabase.from("approved_members").select("id, full_name, email, phone_number"),
          ]);
          const rawBks = bkDataRes.data || [];
          const amList = amDataRes.data || [];
          const amByEmail: Record<string, any> = {};
          amList.forEach((m: any) => {
            if (m.email) amByEmail[m.email.toLowerCase()] = m;
          });

          allBookings = rawBks.map((b: any) => {
            const p = b.profiles || {};
            const email = p.email || "";
            const am = email ? amByEmail[email.toLowerCase()] : null;
            return {
              ...b,
              approved_members: {
                id: am?.id || p.id || b.member_id,
                full_name: am?.full_name || p.full_name || (email ? email.split("@")[0] : "Member"),
                email: email,
                phone_number: am?.phone_number || p.phone_number || "N/A",
              },
            };
          });
        }

        const checkedInBookings = allBookings.filter((b: any) => {
          if (b.class_id !== classId && b.classes?.id !== classId) return false;
          if (b.booking_status === "checked_in" || b.booking_status === "attended" || b.booking_status === "completed") return true;
          return attData.some(
            (a: any) => a.booking_id === b.id || (a.member_id === b.member_id && a.attendance_status === "attended")
          );
        });
        setAttended(checkedInBookings);
      } catch (err) {
        console.error("loadAttendance error:", err);
      } finally {
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

  const filteredClasses = classes.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.title.toLowerCase().includes(q) || c.instructor.toLowerCase().includes(q);
  });

  const filteredBookings = bookings.filter((b) => {
    if (!rosterSearch) return true;
    const q = rosterSearch.toLowerCase();
    const name = b.profiles?.full_name?.toLowerCase() || "";
    const email = b.profiles?.email?.toLowerCase() || "";
    const phone = b.profiles?.phone_number?.toLowerCase() || "";
    return name.includes(q) || email.includes(q) || phone.includes(q);
  });

  const filteredAttended = attended.filter((a) => {
    if (!rosterSearch) return true;
    const q = rosterSearch.toLowerCase();
    const name = a.profiles?.full_name?.toLowerCase() || "";
    const email = a.profiles?.email?.toLowerCase() || "";
    return name.includes(q) || email.includes(q);
  });

  const todayFormatted = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6 animate-fade-in font-sans pb-12">
      {/* Top Header & Quick Action Bar */}
      <div className="admin-card flex flex-col md:flex-row md:items-center justify-between gap-5 p-5 sm:p-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-[32px] font-semibold text-fg tracking-tight leading-tight">
              Studio Overview
            </h1>
            <span className="admin-badge bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
              LIVE
            </span>
          </div>
          <p className="text-sm text-fg-3 mt-1.5 font-medium leading-6">
            {todayFormatted} Â· Today&apos;s classes, bookings, check-ins, and paid revenue at Corhaus.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap md:justify-end">
          <Link
            href="/admin/scanner"
            className="admin-button admin-button-secondary"
          >
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <span>Scan QR</span>
          </Link>

          <Link
            href="/admin/members"
            className="admin-button admin-button-secondary"
          >
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span>Members</span>
          </Link>

          <Link
            href="/admin/classes"
            className="admin-button admin-button-primary"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Class</span>
          </Link>
        </div>
      </div>

      {/* 4 Premium Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Today's Classes */}
        <div className="admin-card admin-card-hover p-5 flex flex-col justify-between group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-fg-3 uppercase tracking-[0.08em]">
              Today&apos;s Classes
            </span>
            <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            {loading ? (
              <div className="h-8 w-16 bg-line/40 animate-pulse rounded-md" />
            ) : (
              <div className="text-[32px] font-semibold text-fg tracking-tight leading-none">
                {todaysClassesCount}
              </div>
            )}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-line/70">
              <span className="text-[11px] text-fg-4 font-medium">Scheduled Sessions</span>
              <Link href="/admin/classes" className="text-xs font-bold text-accent hover:underline flex items-center gap-1">
                View &rarr;
              </Link>
            </div>
          </div>
        </div>

        {/* Total Members */}
        <div className="admin-card admin-card-hover p-5 flex flex-col justify-between group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-fg-3 uppercase tracking-[0.08em]">
              Approved Members
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            {loading ? (
              <div className="h-8 w-16 bg-line/40 animate-pulse rounded-md" />
            ) : (
              <div className="text-[32px] font-semibold text-fg tracking-tight leading-none">
                {totalMembersCount}
              </div>
            )}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-line/70">
              <span className="text-[11px] text-fg-4 font-medium">Active Studio Roster</span>
              <Link href="/admin/members" className="text-xs font-bold text-blue-500 hover:underline flex items-center gap-1">
                Directory &rarr;
              </Link>
            </div>
          </div>
        </div>

        {/* This Month's Revenue */}
        <div className="admin-card admin-card-hover p-5 flex flex-col justify-between group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-fg-3 uppercase tracking-[0.08em]">
              Monthly Revenue
            </span>
            <div className="w-9 h-9 rounded-xl bg-gold/10 text-gold font-bold text-base flex items-center justify-center group-hover:scale-105 transition-transform">
              &#8377;
            </div>
          </div>
          <div className="mt-4">
            {loading ? (
              <div className="h-8 w-24 bg-line/40 animate-pulse rounded-md" />
            ) : (
              <div className="text-[32px] font-semibold text-fg tracking-tight leading-none">
                &#8377;{todaysRevenue.toLocaleString("en-IN")}
              </div>
            )}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-line/70">
              <span className="text-[11px] text-fg-4 font-medium">Paid Invoices</span>
              <Link href="/admin/billing/invoices" className="text-xs font-bold text-gold hover:underline flex items-center gap-1">
                Invoices &rarr;
              </Link>
            </div>
          </div>
        </div>

        {/* Check-ins Today */}
        <div className="admin-card admin-card-hover p-5 flex flex-col justify-between group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-fg-3 uppercase tracking-[0.08em]">
              Check-ins Today
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            {loading ? (
              <div className="h-8 w-16 bg-line/40 animate-pulse rounded-md" />
            ) : (
              <div className="text-[32px] font-semibold text-fg tracking-tight leading-none">
                {checkInsTodayCount}
              </div>
            )}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-line/70">
              <span className="text-[11px] text-fg-4 font-medium">Scanned Attendances</span>
              <Link href="/admin/scanner" className="text-xs font-bold text-green-500 hover:underline flex items-center gap-1">
                Scanner &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Schedule & Roster Control Grid */}
      <div className="space-y-4">
        {/* Header & Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-fg tracking-tight">Today&apos;s Schedule</h2>
            <p className="text-sm text-fg-3 mt-0.5">Select a session to inspect bookings and check-ins.</p>
          </div>

          {classes.length > 0 && (
            <div className="relative w-full sm:w-64">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by class or instructor..."
                className="admin-input w-full pl-9 pr-3 py-2 text-xs placeholder:text-fg-4 focus:border-accent"
              />
            </div>
          )}
        </div>

        {/* Loading Skeleton state */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="admin-card p-5 space-y-4 animate-pulse">
                <div className="flex justify-between">
                  <div className="h-5 w-32 bg-line/40 rounded-md" />
                  <div className="h-5 w-16 bg-line/40 rounded-md" />
                </div>
                <div className="h-4 w-24 bg-line/40 rounded-md" />
                <div className="h-2 w-full bg-line/40 rounded-full mt-4" />
              </div>
            ))}
          </div>
        ) : classes.length === 0 ? (
          <div className="admin-card p-10 sm:p-12 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mx-auto">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-fg">No classes scheduled for today</h3>
              <p className="text-sm text-fg-3 mt-1">Add a session to open booking slots for studio members.</p>
            </div>
            <Link
              href="/admin/classes"
              className="admin-button admin-button-primary"
            >
              <span>+</span> Create Today&apos;s First Class
            </Link>
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="admin-card p-8 text-center text-sm text-fg-3">
            No classes match &quot;{searchQuery}&quot;. Clear search to view all today&apos;s sessions.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClasses.map((c) => {
              const bookedCount = bookingsCountMap[c.id] || 0;
              const isFull = bookedCount >= c.max_capacity;
              const fillPct = Math.min(100, Math.round((bookedCount / c.max_capacity) * 100));
              const isSelected = selectedClass === c.id;

              return (
                <div
                  key={c.id}
                  onClick={() => handleClassClick(c.id)}
                  className={`admin-card p-5 cursor-pointer transition-all ${
                    isSelected
                      ? "border-accent ring-2 ring-accent/20 shadow-sm scale-[1.005]"
                      : "hover:border-accent/35 hover:shadow-xs"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-base text-fg tracking-tight leading-snug">{c.title}</h3>
                      <p className="text-xs text-fg-3 mt-0.5 font-medium">{c.instructor}</p>
                    </div>
                    <span
                      className={`admin-badge ${
                        isFull
                          ? "bg-red-500/10 text-red-500 border border-red-500/20"
                          : fillPct >= 80
                          ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                          : "bg-green-500/10 text-green-500 border border-green-500/20"
                      }`}
                    >
                      {isFull ? "FULL" : `${c.max_capacity - bookedCount} left`}
                    </span>
                  </div>

                  {/* Capacity Progress Bar */}
                  <div className="mt-4 space-y-1.5">
                    <div className="flex justify-between text-[11px] font-medium text-fg-3">
                      <span>Capacity</span>
                      <span className="font-bold text-fg">{bookedCount} / {c.max_capacity}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden border border-line/40">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isFull ? "bg-red-500" : fillPct >= 80 ? "bg-amber-500" : "bg-accent"
                        }`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-line/70 flex items-center justify-between text-xs text-fg">
                    <span className="text-fg-3 font-medium">
                      {formatDate(c.class_date)} @ {formatTime(c.class_time)}
                    </span>
                    <span className={`font-bold text-[11px] ${isSelected ? "text-accent" : "text-fg-4"}`}>
                      {isSelected ? "Selected \u2713" : "Tap to inspect"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Class Member Bookings & Attendance Roster Drawer/Panel */}
      {selectedClass && selectedClassData && (
        <div className="admin-card p-5 sm:p-6 space-y-5 animate-slide-up ring-1 ring-accent/15">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="admin-badge bg-accent/10 text-accent border border-accent/20">
                  SESSION ROSTER
                </span>
                <h3 className="text-xl font-semibold text-fg tracking-tight">
                  {selectedClassData.title}
                </h3>
              </div>
              <p className="text-sm text-fg-3 mt-1">
                Instructor: <strong className="text-fg">{selectedClassData.instructor}</strong> · {formatDate(selectedClassData.class_date)} at {formatTime(selectedClassData.class_time)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/admin/scanner"
                className="admin-button bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 hover:bg-emerald-500/15"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                Launch QR Scanner
              </Link>
              <button
                onClick={() => setSelectedClass(null)}
                className="w-8 h-8 rounded-xl bg-surface hover:bg-hover text-fg-3 hover:text-fg border border-line flex items-center justify-center transition-colors text-sm font-bold"
              >
                ×
              </button>
            </div>
          </div>

          {/* Roster Controls: Tabs + Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-surface-2 rounded-xl border border-line self-start overflow-x-auto">
              <button
                onClick={() => setRosterTab("bookings")}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  rosterTab === "bookings"
                    ? "bg-accent text-white shadow-xs"
                    : "text-fg-3 hover:text-fg"
                }`}
              >
                Booked Roster ({bookings.length})
              </button>
              <button
                onClick={() => setRosterTab("attended")}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  rosterTab === "attended"
                    ? "bg-green-600 text-white shadow-xs"
                    : "text-fg-3 hover:text-fg"
                }`}
              >
                Checked In ({attended.length})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="Search roster..."
                className="admin-input w-full px-3 py-1.5 text-xs placeholder:text-fg-4 focus:border-accent"
              />
            </div>
          </div>

          {/* Tab Content */}
          {rosterTab === "bookings" ? (
            <div className="space-y-3">
              {bookingsLoading ? (
                <div className="py-8 text-center text-sm text-fg-4 animate-pulse">
                  Loading booked member roster...
                </div>
              ) : filteredBookings.length === 0 ? (
                <div className="py-10 text-center text-sm text-fg-4 bg-surface-2 rounded-2xl border border-line/60 space-y-1">
                  <p className="font-bold text-fg-3">No members match your roster search</p>
                  <p className="text-[11px] text-fg-4">Members who book this class will appear here automatically in real time.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                  {filteredBookings.map((b: any) => {
                    const memberName = b.approved_members?.full_name || b.profiles?.full_name || "Member";
                    const memberEmail = b.approved_members?.email || b.profiles?.email || "";
                    const initial = memberName ? memberName.charAt(0).toUpperCase() : "M";

                    return (
                      <div
                        key={b.id}
                        className="p-3.5 rounded-xl bg-surface-2 border border-line flex items-center justify-between text-xs hover:border-line-2 hover:bg-hover/35 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center text-xs border border-accent/30">
                            {initial}
                          </div>
                          <div>
                            <p className="font-bold text-fg">{memberName}</p>
                            <p className="text-[11px] text-fg-3">{memberEmail || "No email"}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="admin-badge bg-accent/10 text-accent border border-accent/20">
                            BOOKED
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {attendanceLoading ? (
                <div className="py-8 text-center text-sm text-fg-4 animate-pulse">
                  Loading attendance check-ins...
                </div>
              ) : filteredAttended.length === 0 ? (
                <div className="py-10 text-center text-sm text-fg-4 bg-surface-2 rounded-2xl border border-line/60 space-y-1">
                  <p className="font-bold text-fg-3">No check-ins recorded yet</p>
                  <p className="text-[11px] text-fg-4">Members who scan their attendance QR code will show up here instantly.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                  {filteredAttended.map((a) => (
                    <div
                      key={a.id}
                      className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-600 font-bold flex items-center justify-center text-xs border border-emerald-500/30">
                          &#10003;
                        </div>
                        <div>
                          <p className="font-bold text-fg">{a.profiles?.full_name || "Member"}</p>
                          <p className="text-[11px] text-fg-3">{a.profiles?.email}</p>
                        </div>
                      </div>
                      <span className="admin-badge bg-emerald-500/20 text-emerald-700 border border-emerald-500/30">
                        ATTENDED
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
