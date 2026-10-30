"use client";

import { useEffect, useState } from "react";

interface ActiveHoliday {
  id: string;
  start_date: string;
  end_date: string;
  title: string;
  message: string;
}

export default function StudioHolidayBanner() {
  const [holidays, setHolidays] = useState<ActiveHoliday[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/holidays/active", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.activeHolidays) {
          setHolidays(data.activeHolidays);
        }
      })
      .catch((err) => console.warn("Failed to fetch active holidays:", err));
  }, []);

  const activeHolidays = holidays.filter((h) => !dismissedIds.includes(h.id));

  if (activeHolidays.length === 0) return null;

  return (
    <div className="w-full space-y-2 mb-4">
      {activeHolidays.map((h) => {
        const dateText =
          h.start_date === h.end_date
            ? h.start_date
            : `${h.start_date} to ${h.end_date}`;

        return (
          <div
            key={h.id}
            className="w-full bg-red-600 text-white p-3.5 sm:p-4 rounded-2xl shadow-lg border-2 border-red-700/50 flex items-start sm:items-center justify-between gap-3 animate-fade-in"
          >
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <span className="text-xl sm:text-2xl shrink-0">🚨</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold uppercase tracking-wider text-xs bg-black/20 px-2 py-0.5 rounded-md">
                    Studio Closed Notice
                  </span>
                  <span className="font-bold text-sm sm:text-base text-white">
                    {h.title} ({dateText})
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-red-50 mt-1 leading-relaxed">
                  {h.message}
                </p>
              </div>
            </div>

            <button
              onClick={() => setDismissedIds((prev) => [...prev, h.id])}
              className="text-white/80 hover:text-white p-1 text-lg font-bold shrink-0 leading-none"
              title="Dismiss banner"
              aria-label="Dismiss notice"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
