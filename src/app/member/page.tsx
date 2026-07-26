"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import QRCode from "qrcode";
interface ClassData {
  id: string;
  title: string;
  instructor: string;
  class_date: string;
  class_time: string;
  max_capacity: number;
}

interface BookingData {
  id: string;
  class_id: string;
  booking_status: string;
  notes?: string | null;
  classes?: {
    class_date: string;
  };
}

interface AttendanceData {
  id: string;
  booking_id: string;
  class_id: string;
  attendance_token: string;
  attendance_status: string;
  classes?: {
    class_date: string;
  };
}

interface PtSessionData {
  id: string;
  member_id: string;
  trainer_name: string;
  session_date: string;
  session_time: string;
  duration_minutes: number;
  status: string;
  purchased_plan_id: string | null;
}

// IST constant
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function parseAsIst(dateStr: string, timeStr: string): number {
  const iso = `${dateStr}T${timeStr}`;
  const d = new Date(iso);
  // new Date("YYYY-MM-DDTHH:MM:SS") parses as LOCAL time.
  // Convert to epoch: getTime() gives UTC epoch for that local time.
  // We want IST epoch. If browser is NOT IST, we need to adjust.
  // Detect browser offset and shift to IST.
  const browserOffset = -d.getTimezoneOffset() * 60 * 1000; // browser offset in ms (IST = +19800000)
  const istTime = d.getTime() + (IST_OFFSET_MS - browserOffset);
  return istTime;
}



function shouldShowQr(cls: ClassData, now: number): boolean {
  const classStart = parseAsIst(cls.class_date, cls.class_time);
  const qrRelease = classStart - 30 * 60 * 1000;
  return now >= qrRelease && now < classStart;
}

function isClassStarted(cls: ClassData, now: number): boolean {
  const classStart = parseAsIst(cls.class_date, cls.class_time);
  return now >= classStart;
}

function isClassOngoing(cls: ClassData, now: number): boolean {
  const classStart = parseAsIst(cls.class_date, cls.class_time);
  return now >= classStart && now < classStart + 60 * 60 * 1000;
}

function isClassOver(cls: ClassData, now: number): boolean {
  const classStart = parseAsIst(cls.class_date, cls.class_time);
  return now >= classStart + 60 * 60 * 1000;
}

export default function MemberDashboard() {
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceData[]>([]);
  const [ptSessions, setPtSessions] = useState<PtSessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState<string | null>(null);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const supabase = createClient();
  const userIdRef = useRef<string | null>(null);
  const generatingRef = useRef<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState<Record<string, boolean>>({});
  const [currentTime, setCurrentTime] = useState(0);
  const [mounted, setMounted] = useState(false);

  const [membershipLevel, setMembershipLevel] = useState("Beginner");
  const [totalCredits, setTotalCredits] = useState(6);
  const [usedCredits, setUsedCredits] = useState(0);
  const [classTypes, setClassTypes] = useState<Record<string, string>>({});
  const [showBookConfirm, setShowBookConfirm] = useState(false);
  const [bookConfirmClass, setBookConfirmClass] = useState<ClassData | null>(null);

  // Store latest data in refs for interval access
  const classesRef = useRef<ClassData[]>([]);
  const bookingsRef = useRef<BookingData[]>([]);
  const qrDataUrlsRef = useRef<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    userIdRef.current = user.id;

    const today = new Date(Date.now() + IST_OFFSET_MS).toISOString().split("T")[0];

    const { data: amData } = await supabase
      .from("approved_members")
      .select("id, membership_level, created_at")
      .eq("email", user.email || "")
      .maybeSingle();

    const approvedMemberId = amData?.id;

    let bookingsQuery = supabase.from("bookings").select("id, class_id, booking_status, notes, classes(class_date)");
    if (approvedMemberId) {
      bookingsQuery = bookingsQuery.or(`member_id.eq.${user.id},member_id.eq.${approvedMemberId}`);
    } else {
      bookingsQuery = bookingsQuery.eq("member_id", user.id);
    }

    let attendanceQuery = supabase.from("attendance").select("*, classes(class_date)");
    if (approvedMemberId) {
      attendanceQuery = attendanceQuery.or(`member_id.eq.${user.id},member_id.eq.${approvedMemberId}`);
    } else {
      attendanceQuery = attendanceQuery.eq("member_id", user.id);
    }

    let planQuery = supabase.from("member_purchased_plans").select("*").order("created_at", { ascending: false });
    if (approvedMemberId) {
      planQuery = planQuery.or(`approved_member_id.eq.${approvedMemberId},approved_member_id.eq.${user.id}`);
    } else {
      planQuery = planQuery.eq("approved_member_id", user.id);
    }

    const [cr, br, ar, ct, tiers, plans, ptData] = await Promise.all([
      supabase.from("classes").select("*").gte("class_date", today).order("class_date", { ascending: true }).order("class_time", { ascending: true }),
      bookingsQuery,
      attendanceQuery,
      supabase.from("class_types").select("*"),
      supabase.from("membership_credit_tiers").select("*"),
      planQuery,
      approvedMemberId
        ? supabase.from("pt_sessions").select("*").eq("member_id", approvedMemberId).in("status", ["scheduled", "completed"]).order("session_date", { ascending: true }).order("session_time", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    // Map class types to descriptions
    if (ct.data) {
      const descMap: Record<string, string> = {};
      ct.data.forEach((t: any) => {
        descMap[t.name] = t.description;
      });
      setClassTypes(descMap);
    }

    // Determine membership tier and level
    let level = "Beginner";
    if (amData) {
      level = amData.membership_level || "Beginner";
    }

    if (cr.data) {
      setClasses(cr.data);
      classesRef.current = cr.data;
    }

    const ptSessionsList = (ptData.data || []) as PtSessionData[];
    setPtSessions(ptSessionsList);

    const ptAsClasses: ClassData[] = ptSessionsList
      .filter(pt => pt.status === "scheduled")
      .map(pt => ({
        id: `pt_${pt.id}`,
        title: `PT Session with ${pt.trainer_name}`,
        instructor: pt.trainer_name,
        class_date: pt.session_date,
        class_time: pt.session_time,
        max_capacity: 1,
      }));
    const allClasses = [...(cr.data || []), ...ptAsClasses];
    setClasses(allClasses);
    classesRef.current = allClasses;

    let userBookings: BookingData[] = [];
    if (br.data) {
      userBookings = br.data as unknown as BookingData[];
    }
    const ptBookings: BookingData[] = ptSessionsList
      .filter(pt => pt.status === "scheduled")
      .map(pt => ({
        id: pt.id,
        class_id: `pt_${pt.id}`,
        booking_status: "booked",
        notes: null,
        classes: { class_date: pt.session_date },
      }));
    const allBookings = [...userBookings, ...ptBookings];
    setBookings(allBookings);
    bookingsRef.current = allBookings;

    if (ar.data) setAttendanceRecords(ar.data as AttendanceData[]);

    // Find active purchased plan
    const activePurchasedPlan = plans.data?.find((p: any) => p.status === "active") || plans.data?.[0];

    if (activePurchasedPlan) {
      setMembershipLevel(activePurchasedPlan.plan_name || level);
      const total = activePurchasedPlan.sessions_total ?? 180;
      const remaining = activePurchasedPlan.sessions_remaining !== null && activePurchasedPlan.sessions_remaining !== undefined
        ? activePurchasedPlan.sessions_remaining
        : Math.max(0, total - userBookings.filter(b => b.booking_status === "booked").length);
      const used = Math.max(0, total - remaining);

      setTotalCredits(total);
      setUsedCredits(used);
    } else {
      setMembershipLevel(level);
      const activeTier = tiers.data?.find((t: any) => t.level === level);
      const credits = activeTier ? activeTier.credits : 6;
      setTotalCredits(credits);

      const activeBookingsCount = userBookings.filter((b) => b.booking_status === "booked").length;
      setUsedCredits(activeBookingsCount);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("member-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "classes" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "pt_sessions" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchData]);

  // Poll every 3s
  useEffect(() => {
    const id = setInterval(fetchData, 3000);
    return () => clearInterval(id);
  }, [fetchData]);

  // Re-fetch when tab becomes visible (user returns to dashboard after scan)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") fetchData(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchData]);

  // Current time interval
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentTime(Date.now());
    const id = setInterval(() => setCurrentTime(Date.now()), 1000);
    setMounted(true);
    return () => clearInterval(id);
  }, []);

  // Generate QR — reads from refs for latest data
  const generateQrForClass = useCallback(async (cls: ClassData) => {
    const isPt = cls.id.startsWith("pt_");
    const booking = bookingsRef.current.find(b => b.class_id === cls.id && b.booking_status === "booked");
    const uid = userIdRef.current;
    if (!booking || !uid) return;
    if (qrDataUrlsRef.current[cls.id]) return;
    if (generatingRef.current.has(cls.id)) return;

    const existing = attendanceRecords.find(a => a.class_id === cls.id);
    if (existing) {
      const dataUrl = await QRCode.toDataURL(
        JSON.stringify({ bookingId: booking.id, token: existing.attendance_token }),
        { width: 200, margin: 2, color: { dark: "#1C1C2E", light: "#FAF7F2" } }
      );
      setQrDataUrls(prev => ({ ...prev, [cls.id]: dataUrl }));
      qrDataUrlsRef.current[cls.id] = dataUrl;
      return;
    }

    generatingRef.current.add(cls.id);
    setIsGenerating(prev => ({ ...prev, [cls.id]: true }));

    try {
      const realClassId = isPt ? cls.id.replace("pt_", "") : cls.id;
      const res = await fetch("/api/attendance/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, classId: realClassId, memberId: uid, isPtSession: isPt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const dataUrl = await QRCode.toDataURL(
        JSON.stringify({ bookingId: booking.id, token: data.token }),
        { width: 200, margin: 2, color: { dark: "#1C1C2E", light: "#FAF7F2" } }
      );
      setQrDataUrls(prev => ({ ...prev, [cls.id]: dataUrl }));
      qrDataUrlsRef.current[cls.id] = dataUrl;

      const { data: fresh } = await supabase.from("attendance").select("*").eq("member_id", uid);
      if (fresh) setAttendanceRecords(fresh as AttendanceData[]);
    } catch (err: unknown) {
      console.error("QR ERROR:", err);
    } finally {
      generatingRef.current.delete(cls.id);
      setIsGenerating(prev => ({ ...prev, [cls.id]: false }));
    }
  }, [attendanceRecords, supabase]);

  // Main QR check interval — runs every 3s using refs (no closure staleness)
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      for (const cls of classesRef.current) {
        if (!bookingsRef.current.some(b => b.class_id === cls.id && b.booking_status === "booked")) continue;
        const classStart = parseAsIst(cls.class_date, cls.class_time);
        const qrRelease = classStart - 30 * 60 * 1000;
        if (now < qrRelease || now >= classStart) continue;
        if (qrDataUrlsRef.current[cls.id]) continue;
        if (generatingRef.current.has(cls.id)) continue;

        generateQrForClass(cls);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [generateQrForClass]);

  // Also check on every render for immediate response
  const renderCheckCount = useRef(0);
  useEffect(() => {
    renderCheckCount.current++;
    const now = Date.now();
    for (const cls of classes) {
      if (!bookings.some(b => b.class_id === cls.id && b.booking_status === "booked")) continue;
      const classStart = parseAsIst(cls.class_date, cls.class_time);
      const qrRelease = classStart - 30 * 60 * 1000;
      if (now < qrRelease || now >= classStart) continue;
      if (qrDataUrls[cls.id]) continue;
      if (generatingRef.current.has(cls.id)) continue;
      generateQrForClass(cls);
    }
  });

  async function handleBook(cls: ClassData) {
    const uid = userIdRef.current;
    if (!uid) return;

    if (isClassStarted(cls, currentTime)) {
      setMessage({ type: "error", text: "Cannot book — class has already started." });
      return;
    }

    const { data: count } = await supabase.rpc("get_booking_count", { p_class_id: cls.id });
    if (count !== null && count >= cls.max_capacity) {
      setMessage({ type: "error", text: "Class is fully booked." });
      return;
    }

    setBookConfirmClass(cls);
    setShowBookConfirm(true);
  }

  async function confirmBook() {
    const cls = bookConfirmClass;
    if (!cls) return;
    const uid = userIdRef.current;
    if (!uid) return;

    setShowBookConfirm(false);
    setBookingLoading(cls.id);

    const { data: existing } = await supabase.from("bookings").select("id, booking_status")
      .eq("class_id", cls.id).eq("member_id", uid).maybeSingle();

    let error;
    if (existing) {
      if (existing.booking_status === "booked") {
        setBookingLoading(null);
        setBookConfirmClass(null);
        setMessage({ type: "error", text: "You already have a booking for this class." });
        fetchData();
        return;
      }
      if (existing.booking_status === "cancelled") {
        ({ error } = await supabase.from("bookings").update({ booking_status: "booked" }).eq("id", existing.id));
      }
    } else {
      ({ error } = await supabase.from("bookings").insert({ class_id: cls.id, member_id: uid, booking_status: "booked" }));
    }
    setBookingLoading(null);
    setBookConfirmClass(null);
    if (error) { setMessage({ type: "error", text: error.message }); return; }
    setMessage({ type: "success", text: "Class booked successfully!" });

    const newBooking: BookingData = { id: crypto.randomUUID(), class_id: cls.id, booking_status: "booked", notes: null, classes: { class_date: cls.class_date } };
    setBookings(prev => [...prev, newBooking]);
    bookingsRef.current = [...bookingsRef.current, newBooking];
  }

  function canCancel(cls: ClassData, now: number) {
    return parseAsIst(cls.class_date, cls.class_time) - now > 6 * 60 * 60 * 1000;
  }

  async function handleCancel(cls: ClassData) {
    const uid = userIdRef.current;
    if (!uid) return;
    if (!canCancel(cls, Date.now())) { setMessage({ type: "error", text: "Cannot cancel \u2014 less than 6 hours before class starts." }); return; }
    const booking = bookings.find(b => b.class_id === cls.id && b.booking_status === "booked");
    if (!booking) return;
    setBookingLoading(cls.id);
    const { error } = await supabase.from("bookings").update({ booking_status: "cancelled" }).eq("id", booking.id).eq("member_id", uid);
    setBookingLoading(null);
    if (error) { setMessage({ type: "error", text: error.message }); return; }
    setMessage({ type: "success", text: "Booking cancelled successfully!" });
    setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, booking_status: "cancelled" } : b));
    bookingsRef.current = bookingsRef.current.map(b => b.id === booking.id ? { ...b, booking_status: "cancelled" } : b);
  }

  function formatTime(time: string) {
    const [h, m] = time.split(":");
    const hours = parseInt(h);
    return `${hours % 12 || 12}:${m} ${hours >= 12 ? "PM" : "AM"}`;
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }


  return (
    <>
      <div className="space-y-8 animate-fade-in">
        {!currentTime && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface/50 backdrop-blur-sm">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-text-gold rounded-full animate-spin" />
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-fg">Available <span className="font-medium">Classes</span></h1>
          <p className="text-sm text-fg-4 mt-1">Book your next Pilates session</p>
        </div>
        
        {!loading && (
          <div className="w-full md:w-80 bg-gradient-to-br from-rail to-accent/90 text-white rounded-2xl p-5 shadow-lg relative overflow-hidden flex-shrink-0">
            <div className="absolute top-0 right-0 w-24 h-24 bg-accent/20 rounded-full blur-xl -mr-6 -mt-6" />
            <div className="flex items-center justify-between mb-3 relative z-10">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">Monthly Plan</span>
                <h4 className="text-base font-medium mt-0.5">{membershipLevel}</h4>
              </div>
              <div className="w-8 h-8 rounded-full bg-surface/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-gold-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 relative z-10 text-center">
              <div>
                <span className="text-[10px] text-white/50 block">Total</span>
                <span className="text-lg font-medium text-gold-fg">{totalCredits}</span>
              </div>
              <div>
                <span className="text-[10px] text-white/50 block">Used</span>
                <span className="text-lg font-medium text-green-600">{usedCredits}</span>
              </div>
              <div>
                <span className="text-[10px] text-white/50 block">Remaining</span>
                <span className="text-lg font-medium text-white">{Math.max(0, totalCredits - usedCredits)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-sm ${message.type === "success" ? "bg-green-500/10 border border-green-500/20 text-green-600" : "bg-red-500/10 border border-red-400/20 text-red-500"}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-text-gold rounded-full animate-spin" />
        </div>
      ) : classes.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-2xl border border-line">
          <p className="text-fg-5">No upcoming classes available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.filter(cls => !isClassOver(cls, currentTime)).map((cls) => {
            const isPt = cls.id.startsWith("pt_");
            const booked = bookings.some(b => b.class_id === cls.id && b.booking_status === "booked");
            const attendance = attendanceRecords.find(a => a.class_id === cls.id);
            const showQr = booked && shouldShowQr(cls, currentTime) && !isClassStarted(cls, currentTime);
            const qrUrl = qrDataUrls[cls.id];
            const started = isClassStarted(cls, currentTime);
            const ongoing = isClassOngoing(cls, currentTime);

            return (
              <div key={cls.id} className="bg-surface rounded-2xl border border-line p-5 hover:shadow-md transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-fg text-lg">{cls.title}</h3>
                        {isPt && <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full uppercase tracking-wider">PT</span>}
                      </div>
                      <p className="text-sm text-fg-4 mt-1">{cls.instructor}</p>
                      {classTypes[cls.title] && (
                        <p className="text-xs text-fg-3 mt-2 italic leading-relaxed">
                          "{classTypes[cls.title]}"
                        </p>
                      )}
                      {(() => {
                        const matchedBk = bookings.find(b => b.class_id === cls.id && b.booking_status === "booked");
                        if (matchedBk) {
                          const noteText = matchedBk.notes || "Corhaus invite u to this session";
                          return (
                            <div className="mt-2 text-[11px] font-semibold text-accent bg-accent/10 px-2.5 py-1 rounded-lg flex items-center gap-1.5 inline-flex">
                              <span>✨</span> {noteText}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div className="flex-shrink-0 ml-2">
                      {ongoing && booked && <span className="text-xs font-medium text-text-gold bg-text-gold/10 px-2 py-1 rounded-full">Ongoing</span>}
                      {!ongoing && booked && <span className="text-xs font-medium text-green-600 bg-green-500/10 px-2 py-1 rounded-full">Booked</span>}
                    </div>
                  </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-fg-3">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    {formatDate(cls.class_date)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-fg-3">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {formatTime(cls.class_time)}
                  </div>
                </div>

                {/* Attendance QR */}
                {booked && !started && attendance?.attendance_status !== "attended" && (
                  <div className="mt-4">
                    {showQr && qrUrl ? (
                      <div className="flex flex-col items-center gap-2 p-4 bg-surface-2 rounded-xl border border-line">
                        <p className="text-xs font-medium text-fg-3 uppercase tracking-wide">Corhaus Pilates</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrUrl} alt="Attendance QR" className="w-40 h-40 rounded-lg" />
                        <p className="text-xs text-fg-5">Show this to the instructor at the studio</p>
                      </div>
                    ) : showQr && isGenerating[cls.id] ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="w-5 h-5 border-2 border-accent/30 border-t-text-gold rounded-full animate-spin" />
                      </div>
                    ) : (
                      <p className="text-xs text-fg-5 text-center py-3 bg-surface-2 rounded-xl border border-line">
                        {showQr ? "Generating QR..." : "Attendance QR will be available 30 minutes before your class starts."}
                      </p>
                    )}
                  </div>
                )}

                {attendance?.attendance_status === "attended" && (
                  <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
                    <p className="text-xs font-medium text-green-600">✓ Attendance recorded</p>
                  </div>
                )}
                </div>

                <div className="mt-4 space-y-2">
                  {isPt && booked && !started ? (
                    <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center bg-accent/10 text-accent border border-accent/20">
                      Personal Training Session
                    </div>
                  ) : ongoing && booked ? (
                    <div className="w-full py-2.5 rounded-xl text-sm font-medium text-center bg-text-gold/10 text-text-gold border border-text-gold/20">
                      Ongoing Class
                    </div>
                  ) : !started ? (
                    <>
                      <button onClick={() => handleBook(cls)} disabled={booked || bookingLoading === cls.id}
                        className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${booked ? "bg-hover text-fg-5 cursor-not-allowed" : "bg-rail text-white hover:bg-rail/90"} disabled:opacity-50`}>
                        {bookingLoading === cls.id ? "Booking..." : booked ? "Already Booked" : "Book Class"}
                      </button>
                      {booked && canCancel(cls, currentTime) && (
                        <button onClick={() => handleCancel(cls)} disabled={bookingLoading === cls.id}
                          className="w-full py-2.5 rounded-xl text-sm font-medium border border-red-400/30 text-red-500 hover:bg-red-500/5 transition-all disabled:opacity-50">
                          {bookingLoading === cls.id ? "Cancelling..." : "Cancel Booking"}
                        </button>
                      )}
                      {booked && !canCancel(cls, currentTime) && (
                        <p className="text-xs text-fg-5 text-center">Cancellation closed (&lt; 6hr before class)</p>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {showBookConfirm && bookConfirmClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-2xl border border-line shadow-xl max-w-md w-full p-6 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-lg font-bold text-fg">Confirm Booking</h3>
                <p className="text-xs text-fg-3">You are about to book this class</p>
              </div>
              <button onClick={() => { setShowBookConfirm(false); setBookConfirmClass(null); }} className="p-1.5 rounded-lg border border-line text-fg-3 hover:text-fg transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-surface-2 rounded-xl border border-line">
                <h4 className="text-sm font-bold text-fg">{bookConfirmClass.title}</h4>
                <p className="text-xs text-fg-3 mt-1">Instructor: {bookConfirmClass.instructor}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-surface-2 rounded-xl border border-line text-center">
                  <p className="text-[10px] text-fg-5 uppercase tracking-wider font-semibold">Date</p>
                  <p className="text-xs font-bold text-fg mt-1">{formatDate(bookConfirmClass.class_date)}</p>
                </div>
                <div className="p-3 bg-surface-2 rounded-xl border border-line text-center">
                  <p className="text-[10px] text-fg-5 uppercase tracking-wider font-semibold">Time</p>
                  <p className="text-xs font-bold text-fg mt-1">{formatTime(bookConfirmClass.class_time)}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              <button onClick={() => { setShowBookConfirm(false); setBookConfirmClass(null); }}
                className="px-5 py-2.5 border border-line rounded-xl text-xs font-semibold text-fg hover:bg-surface-2 transition-colors">
                Cancel
              </button>
              <button onClick={confirmBook} disabled={bookingLoading === bookConfirmClass.id}
                className="px-5 py-2.5 bg-rail text-white rounded-xl text-xs font-semibold hover:bg-rail/90 disabled:opacity-50 transition-colors">
                {bookingLoading === bookConfirmClass.id ? "Booking..." : "Confirm Booking"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mounted && createPortal(
        <a
          href="https://www.instagram.com/corhaus_pilates?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw=="
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white px-5 py-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all text-sm font-medium"
          style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 99999 }}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
          </svg>
          Follow us on Instagram
        </a>,
        document.body
      )}
    </>
  );
}
