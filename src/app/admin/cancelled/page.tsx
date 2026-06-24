"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

interface CancelledBooking {
  id: string;
  created_at: string;
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

  function formatTime(time: string) {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 || 12;
    return `${displayH}:${minutes} ${ampm}`;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-light text-brand-navy">
          Cancelled <span className="font-medium">Bookings</span>
        </h1>
        <p className="text-sm text-brand-navy/50 mt-1">
          All cancelled class reservations
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-brand-sand/50 overflow-hidden">
        {loading || isPending ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
          </div>
        ) : cancelled.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-brand-navy/40">No cancelled bookings</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-cream/50 border-b border-brand-sand/50">
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">
                    Member
                  </th>
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">
                    Class
                  </th>
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">
                    Class Date
                  </th>
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">
                    Class Time
                  </th>
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">
                    Cancelled At
                  </th>
                </tr>
              </thead>
              <tbody>
                {cancelled.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-brand-sand/30 last:border-0 hover:bg-brand-cream/30 transition-colors"
                  >
                    <td className="py-3 px-5">
                      <p className="font-medium text-brand-navy">
                        {item.profiles?.full_name || "N/A"}
                      </p>
                      <p className="text-xs text-brand-navy/50">
                        {item.profiles?.email || "N/A"}
                      </p>
                    </td>
                    <td className="py-3 px-5 text-brand-navy">
                      {item.classes?.title || "N/A"}
                    </td>
                    <td className="py-3 px-5 text-brand-navy/60">
                      {item.classes?.class_date
                        ? new Date(
                            item.classes.class_date + "T00:00:00"
                          ).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "N/A"}
                    </td>
                    <td className="py-3 px-5 text-brand-navy/60">
                      {item.classes?.class_time
                        ? formatTime(item.classes.class_time)
                        : "N/A"}
                    </td>
                    <td className="py-3 px-5 text-brand-navy/50 text-xs">
                      {new Date(item.created_at).toLocaleString("en-IN")}
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
