"use client";

import { usePushNotifications } from "@/lib/push/usePushNotifications";
import { useState } from "react";

export default function PushPermissionBanner({
  role = "member",
  userId,
  className = "",
}: {
  role?: "admin" | "staff" | "member";
  userId?: string | null;
  className?: string;
}) {
  const { isSupported, permission, isSubscribed, loading, subscribe } = usePushNotifications({
    role,
    userId,
  });
  const [dismissed, setDismissed] = useState(false);

  // If push is not supported or user has blocked notifications or is already subscribed
  // The banner is removed ONLY once the user enables notifications (isSubscribed === true)
  if (!isSupported || isSubscribed || permission === "denied" || dismissed) {
    return null;
  }

  const roleText =
    role === "admin"
      ? "billing payments, missing tomorrow schedule, and holiday alerts"
      : "class booking updates, session balance, and studio notices";

  return (
    <div
      className={`p-3 sm:p-3.5 rounded-2xl bg-emerald-600/10 border border-emerald-600/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs mb-4 animate-fade-in ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 font-bold text-sm shadow-xs">
          🔔
        </div>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-bold text-fg leading-tight">
            Enable App Push Notifications
          </p>
          <p className="text-[11px] sm:text-xs text-fg-3 leading-snug">
            Get instant lock screen alerts for {roleText}.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
        <button
          onClick={() => setDismissed(true)}
          className="px-2.5 py-1.5 text-xs text-fg-4 hover:text-fg font-semibold transition-colors cursor-pointer"
        >
          Not now
        </button>
        <button
          onClick={subscribe}
          disabled={loading}
          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Enabling..." : "Enable Alerts"}
        </button>
      </div>
    </div>
  );
}
