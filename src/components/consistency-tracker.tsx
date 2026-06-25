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
  };
}

interface ConsistencyTrackerProps {
  attendanceRecords: AttendanceData[];
  bookings: BookingData[];
  pastClasses: { class_date: string }[];
  currentTime: number;
}

export default function ConsistencyTracker({
  attendanceRecords,
  bookings,
  pastClasses,
  currentTime,
}: ConsistencyTrackerProps) {
  const [tooltip, setTooltip] = useState<{
    date: string;
    status: string;
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
    if (!currentTime) return { currentStreak: 0, longestStreak: 0, attendedThisMonth: 0, rate: 0 };

    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const now = new Date(currentTime + IST_OFFSET_MS);
    const todayStr = now.toISOString().split("T")[0];
    const currentMonthPrefix = todayStr.substring(0, 7);

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

    // 3. This Month Attended
    const attendedThisMonth = attendedDates.filter((d) => d.startsWith(currentMonthPrefix)).length;

    // 4. Attendance Rate
    const uniqueBookedDatesThisMonth = new Set<string>();
    
    bookings.forEach(b => {
      if (b.booking_status === "booked" && b.classes?.class_date?.startsWith(currentMonthPrefix)) {
        uniqueBookedDatesThisMonth.add(b.classes.class_date);
      }
    });

    attendanceRecords.forEach(a => {
      if (a.attendance_status === "attended" && a.classes?.class_date?.startsWith(currentMonthPrefix)) {
        uniqueBookedDatesThisMonth.add(a.classes.class_date);
      }
    });

    const totalBookedThisMonth = uniqueBookedDatesThisMonth.size;
    const rate = totalBookedThisMonth === 0 ? (attendedThisMonth > 0 ? 100 : 0) : Math.round((attendedThisMonth / totalBookedThisMonth) * 100);

    return {
      currentStreak,
      longestStreak,
      attendedThisMonth,
      rate,
    };
  }, [attendanceRecords, bookings, currentTime]);

  const heatmapDays = useMemo(() => {
    if (!currentTime) return [];
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const now = new Date(currentTime + IST_OFFSET_MS);
    
    const days = [];
    const attendedDates = new Set(
      attendanceRecords
        .filter((a) => a.attendance_status === "attended" && a.classes?.class_date)
        .map((a) => a.classes!.class_date)
    );
    
    const classOfferedDates = new Set(pastClasses.map(c => c.class_date));

    // Last 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      
      let status: "attended" | "not-attended" | "no-class" = "no-class";
      
      if (attendedDates.has(dateStr)) {
        status = "attended";
      } else if (classOfferedDates.has(dateStr)) {
        status = "not-attended";
      }

      days.push({
        dateStr,
        displayDate: d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }),
        status,
      });
    }
    return days;
  }, [attendanceRecords, pastClasses, currentTime]);

  const getColor = (status: string) => {
    switch (status) {
      case "attended":
        return "bg-brand-success";
      case "not-attended":
        return "bg-brand-navy/10 border border-brand-sand";
      case "no-class":
      default:
        return "bg-white border border-brand-sand/50";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "attended": return "Attended";
      case "not-attended": return "Missed Class";
      case "no-class": return "No Class Scheduled";
      default: return "";
    }
  };

  if (!currentTime) return null;

  return (
    <div className="bg-white rounded-2xl border border-brand-sand/50 p-6 shadow-sm mb-8 animate-fade-in relative z-10">
      <div className="mb-6">
        <h2 className="text-xl font-medium text-brand-navy">Consistency Tracker</h2>
        <p className="text-sm text-brand-navy/50 mt-1">Your attendance journey</p>
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
          <p className="text-xs font-medium text-brand-navy/50 uppercase tracking-wider mb-1">Classes This Month</p>
          <p className="text-2xl font-light text-brand-navy">{stats.attendedThisMonth}</p>
        </div>
        <div className="p-4 rounded-xl bg-brand-cream/50 border border-brand-sand/50">
          <p className="text-xs font-medium text-brand-navy/50 uppercase tracking-wider mb-1">Attendance Rate</p>
          <p className="text-2xl font-light text-brand-navy">{stats.rate}%</p>
        </div>
      </div>

      <div className="relative">
        <div className="overflow-x-auto pb-4 -mx-2 px-2">
          <div className="flex gap-1.5 min-w-max">
            {heatmapDays.map((day, i) => (
              <div
                key={day.dateStr}
                className={`w-8 h-8 rounded-md cursor-pointer transition-transform hover:scale-110 ${getColor(day.status)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    date: day.displayDate,
                    status: getStatusText(day.status),
                    x: rect.left + rect.width / 2,
                    y: rect.top - 10,
                  });
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {tooltip && (
        <div 
          className="fixed z-[100] bg-brand-navy text-white px-3 py-2 rounded-lg text-xs shadow-lg transform -translate-x-1/2 -translate-y-full pointer-events-none whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="font-medium mb-0.5">{tooltip.date}</p>
          <p className="text-white/80">{tooltip.status}</p>
          <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-brand-navy"></div>
        </div>
      )}
    </div>
  );
}
