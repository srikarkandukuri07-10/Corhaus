"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatTime, formatDateTime } from "@/lib/date-utils";


interface CancelledBooking {

  id: string;
  created_at: string;
  cancelled_at: string | null;
  class_id: string;
  member_id: string;
  classes: {
    title: string;
    class_date: string;
    class_time: string;
  } | null;
  profiles: {
    full_name: string;
    email: string;
  } | null;
}

export default function CancelledBookingsPage() {
  const [cancelled, setCancelled] = useState<CancelledBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  const fetchCancelled = useCallback(async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "*, classes(title, class_date, class_time), profiles(full_name, email)"
      )
      .eq("booking_status", "cancelled")
      .order("created_at", { ascending: false });

    if (!error && data) {
      startTransition(() => {
        setCancelled(data as CancelledBooking[]);
        setLoading(false);
      });
    }
  }, [supabase]);

  useEffect(() => {
    fetchCancelled();
  }, [fetchCancelled]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("cancelled-bookings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          fetchCancelled();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchCancelled]);




  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-light text-fg">
          Cancelled <span className="font-medium">Bookings</span>
        </h1>
        <p className="text-sm text-fg-4 mt-1">
          All cancelled class reservations
        </p>
      </div>

      <div className="bg-surface rounded-2xl border border-line overflow-hidden">
        {loading || isPending ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent/30 border-t-text-gold rounded-full animate-spin" />
          </div>
        ) : cancelled.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-fg-5">No cancelled bookings</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2/50 border-b border-line">
                  <th className="text-left py-3 px-5 font-medium text-fg-3">
                    Member
                  </th>
                  <th className="text-left py-3 px-5 font-medium text-fg-3">
                    Class
                  </th>
                  <th className="text-left py-3 px-5 font-medium text-fg-3">
                    Class Date
                  </th>
                  <th className="text-left py-3 px-5 font-medium text-fg-3">
                    Class Time
                  </th>
                  <th className="text-left py-3 px-5 font-medium text-fg-3">
                    Cancelled At
                  </th>
                </tr>
              </thead>
              <tbody>
                {cancelled.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-line last:border-0 hover:bg-surface-2/30 transition-colors"
                  >
                    <td className="py-3 px-5">
                      <p className="font-medium text-fg">
                        {item.profiles?.full_name || "N/A"}
                      </p>
                      <p className="text-xs text-fg-4">
                        {item.profiles?.email || "N/A"}
                      </p>
                    </td>
                    <td className="py-3 px-5 text-fg">
                      {item.classes?.title || "N/A"}
                    </td>
                    <td className="py-3 px-5 text-fg-3">
                      {formatDate(item.classes?.class_date)}
                    </td>
                    <td className="py-3 px-5 text-fg-3">
                      {formatTime(item.classes?.class_time)}
                    </td>
                    <td className="py-3 px-5 text-fg-4 text-xs">
                      {formatDateTime(item.cancelled_at || item.created_at)}
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
