"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

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

export default function PreviousClasses() {
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [bookings, setBookings] = useState<BookingWithProfile[]>([]);
  const [attended, setAttended] = useState<AttendanceWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  const loadClasses = useCallback(async () => {
    const { data, error } = await supabase
      .from("classes")
      .select("*")
      .order("class_date", { ascending: true })
      .order("class_time", { ascending: true });

    if (!error && data) {
      startTransition(() => {
        const now = Date.now();
        const previous = data.filter(c => parseAsIst(c.class_date, c.class_time) + 60 * 60 * 1000 <= now);
        previous.sort((a, b) => parseAsIst(b.class_date, b.class_time) - parseAsIst(a.class_date, a.class_time));
        setClasses(previous);
        setLoading(false);
      });
    }
  }, [supabase]);

  const loadBookings = useCallback(
    async (classId: string) => {
      setBookingsLoading(true);
      const { data, error } = await supabase
        .from("bookings")
        .select("*, profiles(full_name, email, phone_number, avatar_url)")
        .eq("class_id", classId)
        .eq("booking_status", "booked")
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
    loadClasses();
  }, [loadClasses]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("admin-bookings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          loadClasses();
          if (selectedClass) {
            loadBookings(selectedClass);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "classes" },
        () => {
          loadClasses();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance" },
        () => {
          if (selectedClass) {
            loadAttendance(selectedClass);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadClasses, loadBookings, loadAttendance, selectedClass]);

  function handleClassClick(classId: string) {
    setSelectedClass(classId);
    loadBookings(classId);
    loadAttendance(classId);
  }

  async function handleDeleteClass(e: React.MouseEvent, classId: string) {
    e.stopPropagation();
    if (!confirm("Remove this class? All bookings for it will also be cancelled.")) return;

    setDeletingId(classId);
    const { error } = await supabase.from("classes").delete().eq("id", classId);
    setDeletingId(null);

    if (error) {
      alert("Failed to remove class: " + error.message);
      return;
    }

    if (selectedClass === classId) {
      setSelectedClass(null);
      setBookings([]);
    }
    loadClasses();
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
      year: "numeric",
    });
  }

  const selectedClassData = classes.find((c) => c.id === selectedClass);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-light text-brand-navy">
            Previous <span className="font-medium">Classes</span>
          </h1>
          <p className="text-sm text-brand-navy/50 mt-1">
            View completed classes and attendance records
          </p>
        </div>
      </div>

      {/* Classes Grid */}
      <div>
        <h2 className="text-lg font-medium text-brand-navy mb-4">
          Past Classes
        </h2>
        {loading || isPending ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
          </div>
        ) : classes.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-brand-sand/50">
            <p className="text-brand-navy/40 mb-3">No past classes found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className={`relative p-5 rounded-2xl border transition-all ${
                  selectedClass === cls.id
                    ? "bg-brand-navy text-white border-brand-navy shadow-lg"
                    : "bg-white border-brand-sand/50 hover:border-brand-brown/30 hover:shadow-md"
                }`}
              >
                <button
                  onClick={() => handleClassClick(cls.id)}
                  className="text-left w-full"
                >
                <h3
                  className={`font-medium text-lg ${
                    selectedClass === cls.id ? "text-white" : "text-brand-navy"
                  }`}
                >
                  {cls.title}
                </h3>
                <p
                  className={`text-sm mt-1 ${
                    selectedClass === cls.id
                      ? "text-white/70"
                      : "text-brand-navy/50"
                  }`}
                >
                  {cls.instructor}
                </p>
                <div className="mt-3 flex items-center gap-4 text-sm">
                  <span
                    className={
                      selectedClass === cls.id
                        ? "text-white/80"
                        : "text-brand-navy/60"
                    }
                  >
                    {formatDate(cls.class_date)}
                  </span>
                  <span
                    className={
                      selectedClass === cls.id
                        ? "text-white/80"
                        : "text-brand-navy/60"
                    }
                  >
                    {formatTime(cls.class_time)}
                  </span>
                </div>
                <div className="mt-2">
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      selectedClass === cls.id
                        ? "bg-white/20 text-white"
                        : "bg-brand-beige text-brand-navy/60"
                    }`}
                  >
                    Max {cls.max_capacity} spots
                  </span>
                </div>
                </button>
                <button
                  onClick={(e) => handleDeleteClass(e, cls.id)}
                  disabled={deletingId === cls.id}
                  className={`absolute top-3 right-3 p-1.5 rounded-lg transition-colors ${
                    selectedClass === cls.id
                      ? "text-white/60 hover:text-white hover:bg-white/10"
                      : "text-brand-navy/30 hover:text-brand-error hover:bg-brand-error/10"
                  }`}
                  title="Remove class"
                >
                  {deletingId === cls.id ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enrolled Members Panel */}
      {selectedClass && selectedClassData && (
        <div className="bg-white rounded-2xl border border-brand-sand/50 p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-brand-navy">
                Enrolled Members
              </h3>
              <p className="text-sm text-brand-navy/50">
                {selectedClassData.title} - {selectedClassData.instructor}
              </p>
            </div>
            <span className="text-sm text-brand-navy/60">
              {bookings.length} / {selectedClassData.max_capacity} spots filled
            </span>
          </div>

          {bookingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
            </div>
          ) : bookings.length === 0 ? (
            <p className="text-center py-8 text-brand-navy/40 text-sm">
              No bookings yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-sand/50">
                    <th className="text-left py-3 px-4 font-medium text-brand-navy/60">Name</th>
                    <th className="text-left py-3 px-4 font-medium text-brand-navy/60">Email</th>
                    <th className="text-left py-3 px-4 font-medium text-brand-navy/60">Phone</th>
                    <th className="text-left py-3 px-4 font-medium text-brand-navy/60">Booked At</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="border-b border-brand-sand/30 last:border-0">
                      <td className="py-3 px-4 text-brand-navy font-medium">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full overflow-hidden border border-brand-sand/50 bg-brand-cream/50 flex-shrink-0 flex items-center justify-center">
                            {booking.profiles?.avatar_url ? (
                              <img src={booking.profiles.avatar_url} alt={booking.profiles.full_name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] font-semibold text-brand-navy/40">
                                {(booking.profiles?.full_name || "N").charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <span>{booking.profiles?.full_name || "N/A"}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-brand-navy/60">
                        {booking.profiles?.email || "N/A"}
                      </td>
                      <td className="py-3 px-4 text-brand-navy/60">
                        {booking.profiles?.phone_number || "N/A"}
                      </td>
                      <td className="py-3 px-4 text-brand-navy/50 text-xs">
                        {new Date(booking.created_at).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Attended Members */}
          <div className="mt-6 pt-6 border-t border-brand-sand/50">
            <h4 className="text-base font-medium text-brand-navy mb-3">Attended Members</h4>
            {(() => {
              const classStart = new Date(`${selectedClassData.class_date}T${selectedClassData.class_time}`);
              const now = new Date();
              if (now < classStart) {
                return (
                  <p className="text-center py-6 text-brand-navy/40 text-sm">
                    Attendance records will be available when the class begins.
                  </p>
                );
              }
              return attendanceLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
                </div>
              ) : attended.length === 0 ? (
                <p className="text-center py-6 text-brand-navy/40 text-sm">
                  No attendance recorded yet
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-brand-sand/50">
                        <th className="text-left py-3 px-4 font-medium text-brand-navy/60">Name</th>
                        <th className="text-left py-3 px-4 font-medium text-brand-navy/60">Email</th>
                        <th className="text-left py-3 px-4 font-medium text-brand-navy/60">Check-in Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attended.map((a) => (
                        <tr key={a.id} className="border-b border-brand-sand/30 last:border-0">
                          <td className="py-3 px-4 text-brand-navy font-medium">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full overflow-hidden border border-brand-sand/50 bg-brand-cream/50 flex-shrink-0 flex items-center justify-center">
                                {a.profiles?.avatar_url ? (
                                  <img src={a.profiles.avatar_url} alt={a.profiles.full_name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[10px] font-semibold text-brand-navy/40">
                                    {(a.profiles?.full_name || "N").charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <span>{a.profiles?.full_name || "N/A"}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-brand-navy/60">
                            {a.profiles?.email || "N/A"}
                          </td>
                          <td className="py-3 px-4 text-brand-navy/50 text-xs">
                            {a.scanned_at ? new Date(a.scanned_at).toLocaleString("en-IN") : "N/A"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
