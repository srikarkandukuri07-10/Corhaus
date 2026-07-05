"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  message: string;
  time?: string;
  type?: string;
  email?: string;
}

interface NotificationsButtonProps {
  role: "admin" | "member";
}

export default function NotificationsButton({ role }: NotificationsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchNotifications() {
      if (role === "admin") {
        try {
          const res = await fetch("/api/admin/notifications");
          const json = await res.json();
          if (json.notifications) {
            setNotifications(
              json.notifications.map((n: any) => ({
                id: n.id,
                message: n.message,
                type: n.type,
                email: n.email,
                time: new Date(n.created_at).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              }))
            );
          }
        } catch (e) {
          console.error("[Admin Notifications] fetch error:", e);
        }
        return;
      }

      if (role === "member") {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        const today = new Date();
        const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(today.getDate()).padStart(2, '0');

        const { data, error } = await supabase
          .from("bookings")
          .select("id, classes!inner(id, title, class_date, class_time)")
          .eq("member_id", userData.user.id)
          .eq("booking_status", "booked")
          .eq("classes.class_date", todayStr);

        if (!error && data) {
          const newNotifications: Notification[] = [];
          const now = new Date();
          
          data.forEach((booking: any) => {
            const classTimeStr = booking.classes.class_time;
            if (!classTimeStr) return;
            
            const [hours, minutes] = classTimeStr.split(':').map(Number);
            const classDate = new Date();
            classDate.setHours(hours, minutes, 0, 0);

            const diffMs = classDate.getTime() - now.getTime();
            const diffMins = Math.floor(diffMs / 60000);

            if (diffMins > 0 && diffMins <= 45) {
              newNotifications.push({
                id: booking.id,
                message: `Reminder: Your class "${booking.classes.title}" starts in ${diffMins} minutes!`,
                time: classTimeStr.substring(0, 5)
              });
            }
          });
          
          setNotifications(newNotifications);
        }
      }
    }

    fetchNotifications();

    const interval = setInterval(fetchNotifications, role === "admin" ? 15000 : 60000);
    return () => clearInterval(interval);
  }, [role, supabase]);

  async function markAllRead() {
    if (role !== "admin") return;
    const unreadIds = notifications.map((n) => n.id);
    if (unreadIds.length === 0) return;
    try {
      await fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
      });
    } catch { }
    setNotifications([]);
    setIsOpen(false);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full text-brand-navy/60 hover:text-brand-navy hover:bg-brand-sand/30 transition-colors relative"
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {notifications.length > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-brand-sand/50 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-brand-sand/50 bg-brand-cream/30 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-navy">Notifications</h3>
            {role === "admin" && notifications.length > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand-brown hover:text-brand-brown-dark font-medium">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-brand-navy/50">
                No new notifications
              </div>
            ) : (
              notifications.map((notif) => {
                if (notif.type === "referral_request") {
                  return (
                    <ReferralRequestNotificationItem
                      key={notif.id}
                      notification={notif}
                      onResolved={() => {
                        setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
                      }}
                    />
                  );
                }
                return (
                  <div key={notif.id} className="px-4 py-3 border-b border-brand-sand/30 hover:bg-brand-cream/30 transition-colors last:border-0">
                    <p className="text-sm text-brand-navy">{notif.message}</p>
                    {notif.time && (
                      <span className="text-xs text-brand-navy/50 mt-1 block">{notif.time}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReferralRequestNotificationItem({
  notification,
  onResolved,
}: {
  notification: Notification;
  onResolved: () => void;
}) {
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function fetchDetails() {
      try {
        const { data, error } = await supabase
          .from("referral_requests")
          .select("*")
          .eq("applicant_email", notification.email)
          .eq("status", "pending")
          .maybeSingle();

        if (error) throw error;
        setRequest(data);
      } catch (err: any) {
        console.error("Failed to fetch referral request details:", err);
        setError("Failed to load details");
      } finally {
        setLoading(false);
      }
    }
    if (notification.email) {
      fetchDetails();
    } else {
      setLoading(false);
    }
  }, [notification.email, supabase]);

  const markNotificationRead = async () => {
    try {
      await fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [notification.id] }),
      });
    } catch (e) {
      console.error("Failed to mark notification read:", e);
    }
  };

  const handleResolve = async (action: "approve" | "reject") => {
    if (!request) return;
    setResolving(true);

    try {
      const res = await fetch("/api/referral/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id, action }),
      });
      const json = await res.json();

      if (!res.ok) {
        alert(json.error || `Failed to ${action} request.`);
      } else {
        await markNotificationRead();
        onResolved();

        if (action === "approve") {
          const params = new URLSearchParams({
            prefill_name: json.data.applicant_name,
            prefill_email: json.data.applicant_email,
            prefill_phone: json.data.applicant_phone,
            referral_code: json.data.referral_code,
            referrer_name: json.data.referrer_name,
            referrer_email: json.data.referrer_email,
          });
          router.push(`/admin/members?${params.toString()}`);
        }
      }
    } catch (err) {
      console.error(`Error resolving referral request:`, err);
      alert("Something went wrong.");
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-3 border-b border-brand-sand/30 text-xs text-brand-navy/50 flex items-center justify-center gap-2">
        <div className="w-3 h-3 border border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
        Loading request details...
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="px-4 py-3 border-b border-brand-sand/30 hover:bg-brand-cream/30 transition-colors">
        <p className="text-sm text-brand-navy">{notification.message}</p>
        <span className="text-xs text-brand-navy/40 mt-1 block">Referral Request (Details unavailable)</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 border-b border-brand-sand/30 bg-brand-cream/10 space-y-3">
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-semibold text-brand-brown uppercase tracking-wider bg-brand-brown/10 px-2 py-0.5 rounded-full">
          Referral Request
        </span>
        {notification.time && (
          <span className="text-xs text-brand-navy/40">{notification.time}</span>
        )}
      </div>

      <div className="space-y-1.5 text-xs text-brand-navy/80">
        <div>
          <span className="font-semibold text-brand-navy/60">Applicant:</span> {request.applicant_name}
        </div>
        <div>
          <span className="font-semibold text-brand-navy/60">Phone:</span> {request.applicant_phone}
        </div>
        <div>
          <span className="font-semibold text-brand-navy/60">Email:</span> {request.applicant_email}
        </div>
        <div>
          <span className="font-semibold text-brand-navy/60">Code:</span> {request.referral_code}
        </div>
        <div>
          <span className="font-semibold text-brand-navy/60">Referred by:</span> {request.referrer_name}
        </div>
        <div>
          <span className="font-semibold text-brand-navy/60">Date:</span> {new Date(request.created_at).toLocaleDateString("en-IN")}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => handleResolve("approve")}
          disabled={resolving}
          className="flex-1 py-1.5 rounded-lg bg-brand-success text-white font-medium text-xs hover:bg-brand-success/90 transition-colors disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => handleResolve("reject")}
          disabled={resolving}
          className="flex-1 py-1.5 rounded-lg border border-brand-error text-brand-error font-medium text-xs hover:bg-brand-error/5 transition-colors disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
