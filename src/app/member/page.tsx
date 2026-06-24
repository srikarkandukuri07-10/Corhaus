"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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

export default function MemberDashboard() {
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState<string | null>(null);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const supabase = createClient();
  const userIdRef = useRef<string | null>(null);
  const generatingRef = useRef<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState<Record<string, boolean>>({});
  const [currentTime, setCurrentTime] = useState(0);

  // Store latest data in refs for interval access
  const classesRef = useRef<ClassData[]>([]);
  const bookingsRef = useRef<BookingData[]>([]);
  const qrDataUrlsRef = useRef<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    userIdRef.current = user.id;

    const today = new Date(Date.now() + IST_OFFSET_MS).toISOString().split("T")[0];

    console.log("FETCH: today (IST) =", today);

    const [cr, br, ar] = await Promise.all([
      supabase.from("classes").select("*").gte("class_date", today).order("class_date", { ascending: true }).order("class_time", { ascending: true }),
      supabase.from("bookings").select("id, class_id, booking_status").eq("member_id", user.id).eq("booking_status", "booked"),
      supabase.from("attendance").select("*, classes(class_date)").eq("member_id", user.id),
    ]);

    if (cr.data) {
      setClasses(cr.data);
      classesRef.current = cr.data;
    }
    if (br.data) {
      setBookings(br.data);
      bookingsRef.current = br.data;
    }
    if (ar.data) setAttendanceRecords(ar.data as AttendanceData[]);
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
    return () => clearInterval(id);
  }, []);

  // Generate QR — reads from refs for latest data
  const generateQrForClass = useCallback(async (cls: ClassData) => {
    const booking = bookingsRef.current.find(b => b.class_id === cls.id && b.booking_status === "booked");
    const uid = userIdRef.current;
    if (!booking || !uid) return;
    if (qrDataUrlsRef.current[cls.id]) return;
    if (generatingRef.current.has(cls.id)) return;

    // Check existing attendance
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
      const res = await fetch("/api/attendance/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, classId: cls.id, memberId: uid }),
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

    const sameDate = bookings.some(b =>
      b.booking_status === "booked" && b.class_id !== cls.id &&
      classes.some(c => c.id === b.class_id && c.class_date === cls.class_date)
    );
    if (sameDate) {
      setMessage({ type: "error", text: "You already have a booking for this date. Only one class per day is allowed." });
      return;
    }

    const { count } = await supabase.from("bookings").select("*", { count: "exact", head: true }).eq("class_id", cls.id).eq("booking_status", "booked");
    if (count !== null && count >= cls.max_capacity) {
      setMessage({ type: "error", text: "Class is fully booked." });
      return;
    }

    setBookingLoading(cls.id);
    const cancelled = await supabase.from("bookings").select("id").eq("class_id", cls.id).eq("member_id", uid).eq("booking_status", "cancelled").maybeSingle();
    let error;
    if (cancelled.data) {
      ({ error } = await supabase.from("bookings").update({ booking_status: "booked" }).eq("id", cancelled.data.id));
    } else {
      ({ error } = await supabase.from("bookings").insert({ class_id: cls.id, member_id: uid, booking_status: "booked" }));
    }
    setBookingLoading(null);
    if (error) { setMessage({ type: "error", text: error.message }); return; }
    setMessage({ type: "success", text: "Class booked successfully!" });
    fetchData();
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
    const { error } = await supabase.from("bookings").update({ booking_status: "cancelled" }).eq("id", booking.id);
    setBookingLoading(null);
    if (error) { setMessage({ type: "error", text: error.message }); return; }
    setMessage({ type: "success", text: "Booking cancelled successfully!" });
    fetchData();
  }

  function formatTime(time: string) {
    const [h, m] = time.split(":");
    const hours = parseInt(h);
    return `${hours % 12 || 12}:${m} ${hours >= 12 ? "PM" : "AM"}`;
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  const currentMonthCount = attendanceRecords.filter(a => {
    if (a.attendance_status !== "attended") return false;
    if (!a.classes || !a.classes.class_date) return false;
    if (!currentTime) return false;
    const now = new Date(currentTime + IST_OFFSET_MS);
    const currentYearMonth = now.toISOString().substring(0, 7);
    return a.classes.class_date.startsWith(currentYearMonth);
  }).length;

  return (
    <div className="space-y-8 animate-fade-in">
      {!currentTime && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm">
          <div className="w-8 h-8 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
        </div>
      )}
      <div>
        <h1 className="text-2xl font-light text-brand-navy">Available <span className="font-medium">Classes</span></h1>
        <p className="text-sm text-brand-navy/50 mt-1">Book your next Pilates session</p>
      </div>

      {/* Monthly Attendance Card */}
      <div className="bg-white rounded-2xl border border-brand-sand/50 p-6 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-brand-navy/60 uppercase tracking-wide">Classes Attended This Month</h2>
          <p className="text-4xl font-light text-brand-navy mt-1">{currentMonthCount}</p>
        </div>
        <div className="w-12 h-12 bg-brand-brown/10 rounded-full flex items-center justify-center text-brand-brown">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-sm ${message.type === "success" ? "bg-brand-success/10 border border-brand-success/20 text-brand-success" : "bg-brand-error/10 border border-brand-error/20 text-brand-error"}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
        </div>
      ) : classes.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-brand-sand/50">
          <p className="text-brand-navy/40">No upcoming classes available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls) => {
            const booked = bookings.some(b => b.class_id === cls.id && b.booking_status === "booked");
            const attendance = attendanceRecords.find(a => a.class_id === cls.id);
            const showQr = booked && shouldShowQr(cls, currentTime) && !isClassStarted(cls, currentTime);
            const qrUrl = qrDataUrls[cls.id];
            const started = isClassStarted(cls, currentTime);

            return (
              <div key={cls.id} className="bg-white rounded-2xl border border-brand-sand/50 p-5 hover:shadow-md transition-all">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-brand-navy text-lg">{cls.title}</h3>
                    <p className="text-sm text-brand-navy/50 mt-1">{cls.instructor}</p>
                  </div>
                  {booked && <span className="text-xs font-medium text-brand-success bg-brand-success/10 px-2 py-1 rounded-full">Booked</span>}
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-brand-navy/60">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    {formatDate(cls.class_date)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-brand-navy/60">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {formatTime(cls.class_time)}
                  </div>
                </div>

                {/* Attendance QR */}
                {booked && !started && attendance?.attendance_status !== "attended" && (
                  <div className="mt-4">
                    {showQr && qrUrl ? (
                      <div className="flex flex-col items-center gap-2 p-4 bg-brand-cream rounded-xl border border-brand-sand/30">
                        <p className="text-xs font-medium text-brand-navy/60 uppercase tracking-wide">Corhaus Pilates</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrUrl} alt="Attendance QR" className="w-40 h-40 rounded-lg" />
                        <p className="text-xs text-brand-navy/40">Show this to the instructor at the studio</p>
                      </div>
                    ) : showQr && isGenerating[cls.id] ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="w-5 h-5 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
                      </div>
                    ) : (
                      <p className="text-xs text-brand-navy/40 text-center py-3 bg-brand-cream rounded-xl border border-brand-sand/30">
                        {showQr ? "Generating QR..." : "Attendance QR will be available 30 minutes before your class starts."}
                      </p>
                    )}
                  </div>
                )}

                {attendance?.attendance_status === "attended" && (
                  <div className="mt-4 p-3 bg-brand-success/10 border border-brand-success/20 rounded-xl text-center">
                    <p className="text-xs font-medium text-brand-success">✓ Attendance recorded</p>
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  <button onClick={() => handleBook(cls)} disabled={booked || bookingLoading === cls.id}
                    className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${booked ? "bg-brand-beige text-brand-navy/40 cursor-not-allowed" : "bg-brand-navy text-white hover:bg-brand-navy/90"} disabled:opacity-50`}>
                    {bookingLoading === cls.id ? "Booking..." : booked ? "Already Booked" : "Book Class"}
                  </button>
                  {booked && canCancel(cls, currentTime) && (
                    <button onClick={() => handleCancel(cls)} disabled={bookingLoading === cls.id}
                      className="w-full py-2.5 rounded-xl text-sm font-medium border border-brand-error/30 text-brand-error hover:bg-brand-error/5 transition-all disabled:opacity-50">
                      {bookingLoading === cls.id ? "Cancelling..." : "Cancel Booking"}
                    </button>
                  )}
                  {booked && !canCancel(cls, currentTime) && (
                    <p className="text-xs text-brand-navy/40 text-center">Cancellation closed (&lt; 6hr before class)</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <a
        href="https://www.instagram.com/corhaus_pilates?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw=="
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white px-5 py-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all text-sm font-medium"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
        Follow us on Instagram
      </a>
    </div>
  );
}
