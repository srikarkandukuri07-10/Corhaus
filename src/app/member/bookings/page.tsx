"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

interface BookingWithClass {
  id: string;
  class_id: string;
  booking_status: string;
  created_at: string;
  cancelled_at: string | null;
  isPT?: boolean;
  classes: {
    id: string;
    title: string;
    instructor: string;
    class_date: string;
    class_time: string;
  } | null;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<BookingWithClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  const fetchBookings = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Fetch approved member details
    const { data: amData } = await supabase
      .from("approved_members")
      .select("id")
      .eq("email", user.email || "")
      .maybeSingle();

    const approvedMemberId = amData?.id;

    // 2. Fetch class bookings
    let bookingsQuery = supabase
      .from("bookings")
      .select("*, classes(id, title, instructor, class_date, class_time)");

    if (approvedMemberId) {
      bookingsQuery = bookingsQuery.or(`member_id.eq.${user.id},member_id.eq.${approvedMemberId}`);
    } else {
      bookingsQuery = bookingsQuery.eq("member_id", user.id);
    }

    const { data: classBookings, error: bookingsError } = await bookingsQuery.order("created_at", { ascending: false });

    // 3. Fetch PT bookings if member is approved
    let ptBookings: BookingWithClass[] = [];
    if (approvedMemberId) {
      const { data: ptSessions, error: ptError } = await supabase
        .from("pt_sessions")
        .select("*")
        .eq("member_id", approvedMemberId)
        .order("session_date", { ascending: false });

      if (!ptError && ptSessions) {
        ptBookings = ptSessions.map((pt: any) => ({
          id: pt.id,
          class_id: pt.id,
          booking_status: pt.status === "no-show" ? "no_show" : pt.status,
          created_at: pt.created_at,
          cancelled_at: pt.status === "cancelled" ? pt.created_at : null,
          classes: {
            id: pt.id,
            title: `PT Session with ${pt.trainer_name}`,
            instructor: pt.trainer_name,
            class_date: pt.session_date,
            class_time: pt.session_time,
          },
          isPT: true,
        }));
      }
    }

    if (!bookingsError) {
      const mergedBookings = [...(classBookings || []), ...ptBookings];
      // Sort merged bookings by class_date then class_time descending
      mergedBookings.sort((a, b) => {
        const dateA = a.classes?.class_date || "";
        const dateB = b.classes?.class_date || "";
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        const timeA = a.classes?.class_time || "";
        const timeB = b.classes?.class_time || "";
        return timeB.localeCompare(timeA);
      });

      startTransition(() => {
        setBookings(mergedBookings as BookingWithClass[]);
        setLoading(false);
      });
    }
  }, [supabase]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("my-bookings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          fetchBookings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchBookings]);

  function canCancel(booking: BookingWithClass): boolean {
    if (booking.isPT) return false;
    if (!booking.classes) return false;
    if (booking.booking_status !== "booked") return false;

    const classDateTime = new Date(
      `${booking.classes.class_date}T${booking.classes.class_time}`
    );
    const cutoffTime = new Date(classDateTime.getTime() - 6 * 60 * 60 * 1000);
    return new Date() <= cutoffTime;
  }

  async function handleCancel(bookingId: string) {
    setCancellingId(bookingId);
    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("bookings")
      .update({ booking_status: "cancelled" })
      .eq("id", bookingId)
      .eq("member_id", user.id);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Booking cancelled successfully." });
      fetchBookings();
    }

    setCancellingId(null);
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

  const now = new Date();

  const upcomingBookings = bookings.filter((b) => {
    if (b.booking_status !== "booked" || !b.classes) return false;
    const classDateTime = new Date(
      `${b.classes.class_date}T${b.classes.class_time}`
    );
    return classDateTime >= now;
  });

  const cancelledBookings = bookings.filter(
    (b) => b.booking_status === "cancelled"
  );

  const pastBookings = bookings.filter((b) => {
    if (b.booking_status !== "booked" || !b.classes) return false;
    const classDateTime = new Date(
      `${b.classes.class_date}T${b.classes.class_time}`
    );
    return classDateTime < now;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-light text-brand-navy">
          My <span className="font-medium">Bookings</span>
        </h1>
        <p className="text-sm text-brand-navy/50 mt-1">
          Manage your class reservations
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-sm flex items-center gap-2 ${
            message.type === "success"
              ? "bg-brand-success/10 border border-brand-success/20 text-brand-success"
              : "bg-brand-error/10 border border-brand-error/20 text-brand-error"
          }`}
        >
          {message.type === "success" ? (
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          )}
          {message.text}
        </div>
      )}

      {loading || isPending ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Upcoming */}
          <section>
            <h2 className="text-lg font-medium text-brand-navy mb-4">
              Upcoming Classes
            </h2>
            {upcomingBookings.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-2xl border border-brand-sand/50">
                <p className="text-brand-navy/40 text-sm">
                  No upcoming bookings
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="bg-white rounded-2xl border border-brand-sand/50 p-5 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-brand-navy">
                          {booking.classes?.title}
                        </h3>
                        {booking.isPT && (
                          <span className="text-[10px] font-bold text-brand-success bg-brand-success/15 px-2.5 py-0.5 rounded-full">
                            PT Session
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-brand-navy/50 mt-0.5">
                        {booking.classes?.instructor}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-brand-navy/60">
                        <span>
                          {booking.classes?.class_date
                            ? formatDate(booking.classes.class_date)
                            : ""}
                        </span>
                        <span>
                          {booking.classes?.class_time
                            ? formatTime(booking.classes.class_time)
                            : ""}
                        </span>
                      </div>
                    </div>
                    <div>
                      {booking.isPT ? (
                        <span className="text-xs text-brand-navy/40 bg-brand-beige px-3 py-1.5 rounded-full">
                          PT Appointment
                        </span>
                      ) : canCancel(booking) ? (
                        <button
                          onClick={() => handleCancel(booking.id)}
                          disabled={cancellingId === booking.id}
                          className="px-4 py-2 rounded-xl text-sm font-medium border border-brand-error/30 text-brand-error hover:bg-brand-error/5 transition-colors disabled:opacity-50"
                        >
                          {cancellingId === booking.id
                            ? "Cancelling..."
                            : "Cancel"}
                        </button>
                      ) : (
                        <span className="text-xs text-brand-navy/40 bg-brand-beige px-3 py-1.5 rounded-full">
                          Within 6hr window
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Cancelled */}
          {cancelledBookings.length > 0 && (
            <section>
              <h2 className="text-lg font-medium text-brand-navy mb-4">
                Cancelled Classes
              </h2>
              <div className="space-y-3">
                {cancelledBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="bg-white rounded-2xl border border-brand-sand/50 p-5 opacity-60"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-brand-navy line-through">
                            {booking.classes?.title}
                          </h3>
                          {booking.isPT && (
                            <span className="text-[10px] font-bold text-brand-success bg-brand-success/15 px-2.5 py-0.5 rounded-full">
                              PT Session
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-brand-navy/50 mt-0.5">
                          {booking.classes?.instructor}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-brand-navy/60">
                          <span>
                            {booking.classes?.class_date
                              ? formatDate(booking.classes.class_date)
                              : ""}
                          </span>
                          <span>
                            {booking.classes?.class_time
                              ? formatTime(booking.classes.class_time)
                              : ""}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className="text-xs font-medium text-brand-error bg-brand-error/10 px-2.5 py-1 rounded-full">
                          Cancelled
                        </span>
                        {booking.cancelled_at && (
                          <span className="text-[10px] text-brand-navy/40 mt-1">
                            on {new Date(booking.cancelled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Past */}
          {pastBookings.length > 0 && (
            <section>
              <h2 className="text-lg font-medium text-brand-navy mb-4">
                Past Classes
              </h2>
              <div className="space-y-3">
                {pastBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="bg-white rounded-2xl border border-brand-sand/50 p-5 opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-brand-navy">
                            {booking.classes?.title}
                          </h3>
                          {booking.isPT && (
                            <span className="text-[10px] font-bold text-brand-success bg-brand-success/15 px-2.5 py-0.5 rounded-full">
                              PT Session
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-brand-navy/50 mt-0.5">
                          {booking.classes?.instructor}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-brand-navy/60">
                          <span>
                            {booking.classes?.class_date
                              ? formatDate(booking.classes.class_date)
                              : ""}
                          </span>
                          <span>
                            {booking.classes?.class_time
                              ? formatTime(booking.classes.class_time)
                              : ""}
                          </span>
                        </div>
                      </div>
                       <span className="text-xs text-brand-navy/40 bg-brand-beige px-2.5 py-1 rounded-full">
                        {booking.isPT
                          ? booking.booking_status === "completed"
                            ? "Completed"
                            : booking.booking_status === "no_show"
                            ? "No-show"
                            : "Scheduled"
                          : "Attended"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
