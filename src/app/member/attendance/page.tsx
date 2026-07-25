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
    class_time?: string;
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
  const [startDate, setStartDate] = useState<string>("");
  const [membershipLevel, setMembershipLevel] = useState("Beginner");
  const [totalCredits, setTotalCredits] = useState(6);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const supabase = createClient();
  const userIdRef = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    userIdRef.current = user.id;

    const today = new Date(Date.now() + IST_OFFSET_MS).toISOString().split("T")[0];

    const [am, tiers] = await Promise.all([
      supabase.from("approved_members").select("id, created_at, membership_level").eq("email", user.email).maybeSingle(),
      supabase.from("membership_credit_tiers").select("*")
    ]);

    const approvedMemberId = am.data?.id;

    const joinedDate = am.data?.created_at 
      ? new Date(new Date(am.data.created_at).getTime() + IST_OFFSET_MS).toISOString().split("T")[0]
      : new Date(Date.now() + IST_OFFSET_MS - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const level = am.data?.membership_level || "Beginner";
    setMembershipLevel(level);

    const activeTier = tiers.data?.find((t: any) => t.level === level);
    const credits = activeTier ? activeTier.credits : 6;
    setTotalCredits(credits);

    let bookingsQuery = supabase.from("bookings").select("id, class_id, booking_status, classes(class_date, class_time)");
    if (approvedMemberId) {
      bookingsQuery = bookingsQuery.or(`member_id.eq.${user.id},member_id.eq.${approvedMemberId}`);
    } else {
      bookingsQuery = bookingsQuery.eq("member_id", user.id);
    }

    let attendanceQuery = supabase.from("attendance").select("id, booking_id, class_id, attendance_status, classes(class_date)");
    if (approvedMemberId) {
      attendanceQuery = attendanceQuery.or(`member_id.eq.${user.id},member_id.eq.${approvedMemberId}`);
    } else {
      attendanceQuery = attendanceQuery.eq("member_id", user.id);
    }

    const [br, ar, allCr] = await Promise.all([
      bookingsQuery,
      attendanceQuery,
      supabase.from("classes").select("class_date").gte("class_date", joinedDate).lte("class_date", today)
    ]);

    if (br.data) setBookings(br.data as unknown as BookingData[]);
    if (ar.data) setAttendanceRecords(ar.data as unknown as AttendanceData[]);
    if (allCr.data) setAllPastClasses(allCr.data as {class_date: string}[]);
    
    setStartDate(joinedDate);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface/50 backdrop-blur-sm">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-text-gold rounded-full animate-spin" />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-text-gold rounded-full animate-spin" />
        </div>
      ) : (
        <ConsistencyTracker 
          attendanceRecords={attendanceRecords}
          bookings={bookings}
          pastClasses={allPastClasses}
          currentTime={currentTime}
          startDate={startDate}
          membershipLevel={membershipLevel}
          totalCredits={totalCredits}
        />
      )}
    </div>
  );
}
