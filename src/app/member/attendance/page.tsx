"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import ConsistencyTracker from "@/components/consistency-tracker";

interface BookingData {
  id: string;
  class_id: string;
  booking_status: string;
  classes?: {
    class_date: string;
  };
}

interface AttendanceData {
  id: string;
  booking_id: string;
  class_id: string;
  attendance_status: string;
  classes?: {
    class_date: string;
  };
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export default function AttendancePage() {
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceData[]>([]);
  const [allPastClasses, setAllPastClasses] = useState<{class_date: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const supabase = createClient();
  const userIdRef = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    userIdRef.current = user.id;

    const today = new Date(Date.now() + IST_OFFSET_MS).toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() + IST_OFFSET_MS - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [br, ar, allCr] = await Promise.all([
      supabase.from("bookings").select("id, class_id, booking_status, classes(class_date)").eq("member_id", user.id),
      supabase.from("attendance").select("id, booking_id, class_id, attendance_status, classes(class_date)").eq("member_id", user.id),
      supabase.from("classes").select("class_date").gte("class_date", thirtyDaysAgo).lte("class_date", today)
    ]);

    if (br.data) setBookings(br.data as unknown as BookingData[]);
    if (ar.data) setAttendanceRecords(ar.data as unknown as AttendanceData[]);
    if (allCr.data) setAllPastClasses(allCr.data as {class_date: string}[]);
    
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("member-attendance-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchData]);

  // Current time interval
  useEffect(() => {
    setCurrentTime(Date.now());
    const id = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      {!currentTime && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm">
          <div className="w-8 h-8 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
        </div>
      ) : (
        <ConsistencyTracker 
          attendanceRecords={attendanceRecords}
          bookings={bookings}
          pastClasses={allPastClasses}
          currentTime={currentTime}
        />
      )}
    </div>
  );
}
