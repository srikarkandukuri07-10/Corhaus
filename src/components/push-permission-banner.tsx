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
  const [testing, setTesting] = useState(false);
  const [testSent, setTestSent] = useState(false);

  // If push not supported or permanently blocked or dismissed
  if (!isSupported || permission === "denied" || dismissed) {
    return null;
  }

  const roleText =
    role === "admin"
      ? "billing payments, missing tomorrow schedule, and holiday alerts"
      : "class booking updates, session balance, and studio notices";

  const handleSendTest = async () => {
    setTesting(true);
    try {
      if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        // 1. Fire immediate device notification
        try {
          await registration.showNotification("🔔 Corhaus Pilates", {
            body: "Test notification received! App alerts are working on this device.",
            icon: "/corhaus-logo.png",
            badge: "/corhaus-logo.png",
            data: { url: "/" },
          });
        } catch (e) {
          console.warn("Direct notification failed:", e);
        }

        // 2. Also dispatch via backend server
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: sub.toJSON(),
              target: "single",
              title: "🔔 Test Notification",
              message: "Corhaus push notifications are active and working on this device!",
            }),
          });
        }
        setTestSent(true);
        setTimeout(() => setTestSent(false), 4000);
      }
    } catch (err) {
      console.error("Test alert error:", err);
    } finally {
      setTesting(false);
    }
  };

  // If already subscribed, show a compact testing banner
  if (isSubscribed) {
    return (
      <div
        className={`px-3 py-2 rounded-2xl bg-surface border border-line-2 flex items-center justify-between gap-3 shadow-2xs mb-4 ${className}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <p className="text-xs font-semibold text-fg truncate">
            App Notifications Active
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSendTest}
            disabled={testing}
            className="px-3 py-1 rounded-xl bg-accent text-white font-bold text-xs hover:bg-accent-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            {testing ? "Sending..." : testSent ? "Sent! 🔔" : "Send Test Alert"}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-fg-4 hover:text-fg p-1 cursor-pointer"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

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
          className="px-2.5 py-1.5 text-xs text-fg-4 hover:text-fg font-semibold transition-colors"
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
