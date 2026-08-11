"use client";

import { useEffect, useState, useMemo, use } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { formatDate } from "@/lib/date-utils";

interface HistoryRecord {
  id: string;
  date: string;
  time: string;
  className: string;
  instructor: string;
  status: "Attended" | "No Show";
  rawBookingStatus?: string;
  rawAttendanceStatus?: string;
  checkedInAt?: string | null;
}

interface MemberInfo {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
}

export default function MemberHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const memberId = resolvedParams.id;
  const supabase = createClient();

  const [member, setMember] = useState<MemberInfo | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [classFilter, setClassFilter] = useState<string>("All");
  const [instructorFilter, setInstructorFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "Attended" | "No Show">("All");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/members/${memberId}/history`);
        if (!res.ok) {
          const errBody = await res.json();
          throw new Error(errBody.error || "Failed to load member check-in history");
        }
        const data = await res.json();
        setMember(data.member);
        setHistory(data.history || []);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to fetch attendance history");
      } finally {
        setLoading(false);
      }
    }
    if (memberId) {
      loadData();
    }
  }, [memberId]);

  // Derive unique class names and instructors for dropdown filters
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    history.forEach((item) => {
      if (item.className) set.add(item.className);
    });
    return Array.from(set).sort();
  }, [history]);

  const availableInstructors = useMemo(() => {
    const set = new Set<string>();
    history.forEach((item) => {
      if (item.instructor) set.add(item.instructor);
    });
    return Array.from(set).sort();
  }, [history]);

  // Filtered history records
  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      // Date Range Filter
      if (startDate) {
        if (!item.date || item.date < startDate) return false;
      }
      if (endDate) {
        if (!item.date || item.date > endDate) return false;
      }

      // Class Filter
      if (classFilter !== "All" && item.className !== classFilter) {
        return false;
      }

      // Instructor Filter
      if (instructorFilter !== "All" && item.instructor !== instructorFilter) {
        return false;
      }

      // Attendance Status Filter
      if (statusFilter !== "All" && item.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [history, startDate, endDate, classFilter, instructorFilter, statusFilter]);

  // Statistics metrics
  const stats = useMemo(() => {
    const total = filteredHistory.length;
    const attended = filteredHistory.filter((h) => h.status === "Attended").length;
    const noShow = filteredHistory.filter((h) => h.status === "No Show").length;
    const attendanceRate = total > 0 ? Math.round((attended / total) * 100) : 0;

    return { total, attended, noShow, attendanceRate };
  }, [filteredHistory]);

  const formatDateDisplay = (dStr: string) => formatDate(dStr);

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-2 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-fg-3 mb-1">
            <Link href="/admin/members" className="hover:text-accent transition-colors">
              Members
            </Link>
            <span>/</span>
            <span className="text-fg font-bold">Attendance History</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-fg">
            Check-in History: {member?.full_name || "Member"}
          </h1>
          {member && (
            <p className="text-xs text-fg-3 mt-1">
              Phone: <span className="font-semibold text-fg-2">{member.phone_number}</span> | Email:{" "}
              <span className="font-semibold text-fg-2">{member.email}</span>
            </p>
          )}
        </div>

        <Link
          href="/admin/members"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-surface-2 border border-line-2 text-xs font-bold text-fg hover:bg-hover transition-colors shadow-xs"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Members
        </Link>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-fg-3">Total Classes</p>
          <p className="text-2xl font-bold text-fg mt-1">{stats.total}</p>
        </div>
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">Attended</p>
          <p className="text-2xl font-bold text-emerald-500 mt-1">{stats.attended}</p>
        </div>
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-red-500">No Show</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{stats.noShow}</p>
        </div>
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gold-fg">Attendance Rate</p>
          <p className="text-2xl font-bold text-gold-fg mt-1">{stats.attendanceRate}%</p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-fg-2">Filter Attendance Records</h3>
          {(startDate || endDate || classFilter !== "All" || instructorFilter !== "All" || statusFilter !== "All") && (
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setClassFilter("All");
                setInstructorFilter("All");
                setStatusFilter("All");
              }}
              className="text-xs text-accent hover:underline font-semibold"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Date Range Start */}
          <div>
            <label className="block text-[11px] font-bold text-fg-3 uppercase tracking-wider mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg focus:ring-1 focus:ring-accent outline-none"
            />
          </div>

          {/* Date Range End */}
          <div>
            <label className="block text-[11px] font-bold text-fg-3 uppercase tracking-wider mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg focus:ring-1 focus:ring-accent outline-none"
            />
          </div>

          {/* Class Filter */}
          <div>
            <label className="block text-[11px] font-bold text-fg-3 uppercase tracking-wider mb-1">
              Class
            </label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg focus:ring-1 focus:ring-accent outline-none"
            >
              <option value="All">All Classes</option>
              {availableClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Instructor Filter */}
          <div>
            <label className="block text-[11px] font-bold text-fg-3 uppercase tracking-wider mb-1">
              Instructor
            </label>
            <select
              value={instructorFilter}
              onChange={(e) => setInstructorFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg focus:ring-1 focus:ring-accent outline-none"
            >
              <option value="All">All Instructors</option>
              {availableInstructors.map((ins) => (
                <option key={ins} value={ins}>
                  {ins}
                </option>
              ))}
            </select>
          </div>

          {/* Attendance Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-fg-3 uppercase tracking-wider mb-1">
              Attendance Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg focus:ring-1 focus:ring-accent outline-none"
            >
              <option value="All">All</option>
              <option value="Attended">Attended</option>
              <option value="No Show">No Show</option>
            </select>
          </div>
        </div>
      </div>

      {/* History Data Table */}
      <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-fg-3">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-3" />
            <p className="text-xs font-semibold">Loading attendance history...</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="p-12 text-center text-fg-3">
            <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-bold text-fg-2">No attendance history found</p>
            <p className="text-xs text-fg-4 mt-1">No check-in records match the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-line-2 bg-surface-2/60 text-fg-3 uppercase font-bold text-[10px] tracking-wider">
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Check-in Time</th>
                  <th className="py-3.5 px-4">Class Name</th>
                  <th className="py-3.5 px-4">Instructor</th>
                  <th className="py-3.5 px-4 text-right">Attendance Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-2 text-fg">
                {filteredHistory.map((row) => (
                  <tr key={row.id} className="hover:bg-hover/50 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-fg">
                      {formatDateDisplay(row.date)}
                    </td>
                    <td className="py-3.5 px-4 text-fg-2 font-medium">
                      {row.time}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-fg">
                      {row.className}
                    </td>
                    <td className="py-3.5 px-4 text-fg-2">
                      {row.instructor}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold border ${
                          row.status === "Attended"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            : "bg-red-500/10 text-red-500 border-red-500/20"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
