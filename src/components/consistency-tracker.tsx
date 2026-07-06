"use client";

import { useMemo, useState, useEffect } from "react";

interface AttendanceData {
  id: string;
  booking_id: string;
  class_id: string;
  attendance_status: string;
  classes?: {
    class_date: string;
  };
}

interface BookingData {
  id: string;
  class_id: string;
  booking_status: string;
  classes?: {
    class_date: string;
    class_time?: string;
  };
}

interface ConsistencyTrackerProps {
  attendanceRecords: AttendanceData[];
  bookings: BookingData[];
  pastClasses: { class_date: string }[];
  currentTime: number;
  startDate: string;
  membershipLevel: string;
  totalCredits: number;
}

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hours = parseInt(h);
  return `${hours % 12 || 12}:${m} ${hours >= 12 ? "PM" : "AM"}`;
}

export default function ConsistencyTracker({
  attendanceRecords,
  bookings,
  pastClasses,
  currentTime,
  startDate,
  membershipLevel,
  totalCredits,
}: ConsistencyTrackerProps) {
  const [tooltip, setTooltip] = useState<{
    date: string;
    status: string;
    time: string;
    x: number;
    y: number;
  } | null>(null);

  // Close tooltip when clicking outside or scrolling
  useEffect(() => {
    const closeTooltip = () => setTooltip(null);
    window.addEventListener("scroll", closeTooltip, true);
    window.addEventListener("click", closeTooltip);
    return () => {
      window.removeEventListener("scroll", closeTooltip, true);
      window.removeEventListener("click", closeTooltip);
    };
  }, []);

  const stats = useMemo(() => {
    if (!currentTime || !startDate) return { currentStreak: 0, longestStreak: 0, attendedLifetime: 0, rate: 0 };

    const joinDate = new Date(startDate + "T00:00:00");

    // Get all unique attended dates (historical)
    const attendedDates = Array.from(
      new Set(
        attendanceRecords
          .filter((a) => a.attendance_status === "attended" && a.classes?.class_date)
          .map((a) => a.classes!.class_date)
      )
    ).sort();

    // 1. Calculate Longest Streak
    let longestStreak = 0;
    let currentStreakCounter = 0;
    for (let i = 0; i < attendedDates.length; i++) {
      if (i === 0) {
        currentStreakCounter = 1;
      } else {
        const prevDate = new Date(attendedDates[i - 1]);
        const currDate = new Date(attendedDates[i]);
        const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 3600 * 24));
        if (diffDays === 1) {
          currentStreakCounter++;
        } else {
          currentStreakCounter = 1;
        }
      }
      if (currentStreakCounter > longestStreak) {
        longestStreak = currentStreakCounter;
      }
    }

    // 2. Calculate Current Streak (counting backwards from today or yesterday)
    let currentStreak = 0;
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const now = new Date(currentTime + IST_OFFSET_MS);
    const todayStr = now.toISOString().split("T")[0];
    let checkDate = new Date(todayStr);
    
    // If today is not attended, we check if yesterday was.
    if (!attendedDates.includes(todayStr)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
      const dateStr = checkDate.toISOString().split("T")[0];
      if (attendedDates.includes(dateStr)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // 3. Lifetime Attended
    const attendedLifetime = attendedDates.length;

    // 4. Attendance Rate = Attended Classes / Eligible Booked Classes since Membership Start Date
    // Eligible Booked Classes are those active bookings that have already occurred.
    const eligibleBookings = bookings.filter((b) => {
      if (b.booking_status !== "booked" || !b.classes?.class_date) return false;
      const classDate = new Date(b.classes.class_date + "T00:00:00");
      
      const classStart = new Date(`${b.classes.class_date}T${b.classes.class_time || "00:00:00"}`).getTime();
      const isPast = currentTime > classStart;

      return classDate >= joinDate && isPast;
    });

    const attendedEligibleCount = eligibleBookings.filter((b) => {
      return attendanceRecords.some((a) => a.booking_id === b.id && a.attendance_status === "attended");
    }).length;

    const rate = eligibleBookings.length === 0 
      ? (attendedLifetime > 0 ? 100 : 0) 
      : Math.round((attendedEligibleCount / eligibleBookings.length) * 100);

    return {
      currentStreak,
      longestStreak,
      attendedLifetime,
      rate,
    };
  }, [attendanceRecords, bookings, currentTime, startDate]);

  // Current membership month range calculation
  const currentMonthRange = useMemo(() => {
    if (!startDate || !currentTime) return null;
    const joinDate = new Date(startDate + "T00:00:00");
    const currentDate = new Date(currentTime);
    
    let monthStart = new Date(joinDate);
    let monthEnd = new Date(joinDate);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    
    while (currentDate >= monthEnd) {
      monthStart = new Date(monthEnd);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
    }
    
    return { start: monthStart, end: monthEnd };
  }, [startDate, currentTime]);

  // Tracker boxes representing monthly class credits
  const trackerBoxes = useMemo(() => {
    if (!currentMonthRange) return [];
    
    // Find active bookings in the current membership month
    const activeBookings = bookings.filter((b) => {
      if (b.booking_status !== "booked" || !b.classes?.class_date) return false;
      const classDate = new Date(b.classes.class_date + "T00:00:00");
      return classDate >= currentMonthRange.start && classDate < currentMonthRange.end;
    });

    // Sort active bookings chronologically
    const sortedBookings = [...activeBookings].sort((a, b) => {
      const timeA = new Date(`${a.classes!.class_date}T${a.classes!.class_time || "00:00:00"}`).getTime();
      const timeB = new Date(`${b.classes!.class_date}T${b.classes!.class_time || "00:00:00"}`).getTime();
      return timeA - timeB;
    });

    const boxes = [];
    
    for (let i = 0; i < totalCredits; i++) {
      if (i < sortedBookings.length) {
        const booking = sortedBookings[i];
        const classStart = new Date(`${booking.classes!.class_date}T${booking.classes!.class_time || "00:00:00"}`).getTime();
        const isPast = currentTime > classStart;
        
        const isAttended = attendanceRecords.some(
          (a) => a.booking_id === booking.id && a.attendance_status === "attended"
        );
        
        let status: "attended" | "missed" | "upcoming" = "upcoming";
        if (isAttended) {
          status = "attended";
        } else if (isPast) {
          status = "missed";
        }
        
        boxes.push({
          key: booking.id,
          displayDate: new Date(booking.classes!.class_date + "T00:00:00").toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }),
          classTime: booking.classes!.class_time ? formatTime(booking.classes!.class_time) : "",
          status,
        });
      } else {
        boxes.push({
          key: `unused-${i}`,
          displayDate: "Unused Credit",
          classTime: "",
          status: "unused" as const,
        });
      }
    }
    
    return boxes;
  }, [currentMonthRange, bookings, totalCredits, currentTime, attendanceRecords]);

  const getColorClass = (status: string) => {
    switch (status) {
      case "attended":
        return "bg-brand-success border border-brand-success";
      case "missed":
        return "bg-brand-error border border-brand-error";
      case "upcoming":
        return "bg-white border-2 border-dashed border-brand-success/50 hover:border-brand-success";
      case "unused":
      default:
        return "bg-white border border-brand-sand/50";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "attended": return "Attended";
      case "missed": return "Missed class (no check-in)";
      case "upcoming": return "Booked (Upcoming)";
      case "unused": return "Unused class credit";
      default: return "";
    }
  };

  if (!currentTime) return null;

  return (
    <div className="bg-white rounded-2xl border border-brand-sand/50 p-6 shadow-sm mb-8 animate-fade-in relative z-10">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-medium text-brand-navy">Consistency Tracker</h2>
          <p className="text-sm text-brand-navy/50 mt-1">Your attendance journey — Level: <span className="font-semibold">{membershipLevel}</span></p>
        </div>
        {currentMonthRange && (
          <div className="px-3 py-1 rounded-full bg-brand-cream/80 border border-brand-sand/30 text-xs text-brand-navy/60 font-medium">
            Renewal: {currentMonthRange.end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="p-4 rounded-xl bg-brand-cream/50 border border-brand-sand/50">
          <p className="text-xs font-medium text-brand-navy/50 uppercase tracking-wider mb-1">Current Streak</p>
          <p className="text-2xl font-light text-brand-navy">{stats.currentStreak} <span className="text-sm font-medium text-brand-navy/60">Days</span></p>
        </div>
        <div className="p-4 rounded-xl bg-brand-cream/50 border border-brand-sand/50">
          <p className="text-xs font-medium text-brand-navy/50 uppercase tracking-wider mb-1">Best Streak</p>
          <p className="text-2xl font-light text-brand-navy">{stats.longestStreak} <span className="text-sm font-medium text-brand-navy/60">Days</span></p>
        </div>
        <div className="p-4 rounded-xl bg-brand-cream/50 border border-brand-sand/50">
          <p className="text-xs font-medium text-brand-navy/50 uppercase tracking-wider mb-1">Total Classes</p>
          <p className="text-2xl font-light text-brand-navy">{stats.attendedLifetime}</p>
        </div>
        <div className="p-4 rounded-xl bg-brand-cream/50 border border-brand-sand/50">
          <p className="text-xs font-medium text-brand-navy/50 uppercase tracking-wider mb-1 font-semibold">Attendance Rate</p>
          <p className="text-2xl font-light text-brand-navy">{stats.rate}%</p>
        </div>
      </div>

      <div className="relative">
        <p className="text-xs font-medium text-brand-navy/40 uppercase tracking-wide mb-3">Monthly Credits & Status</p>
        <div className="overflow-x-auto pb-4 -mx-2 px-2">
          <div className="flex gap-2 min-w-max">
            {trackerBoxes.map((box, i) => (
              <div
                key={box.key}
                className={`w-9 h-9 rounded-lg cursor-pointer transition-all hover:scale-105 flex items-center justify-center ${getColorClass(box.status)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    date: box.displayDate,
                    status: getStatusText(box.status),
                    time: box.classTime,
                    x: rect.left + rect.width / 2,
                    y: rect.top - 10,
                  });
                }}
              >
                <span className={`text-[10px] font-semibold ${
                  box.status === "attended" || box.status === "missed"
                    ? "text-white"
                    : "text-brand-navy/40"
                }`}>
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {tooltip && (
        <div 
          className="fixed z-[100] bg-brand-navy text-white px-3 py-2 rounded-lg text-xs shadow-lg transform -translate-x-1/2 -translate-y-full pointer-events-none whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="font-semibold mb-0.5">{tooltip.date}</p>
          <p className="text-white/80">{tooltip.status}</p>
          {tooltip.time && <p className="text-brand-beige/90 mt-0.5 text-[10px]">Time: {tooltip.time}</p>}
          <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-brand-navy"></div>
        </div>
      )}
    </div>
  );
}
