"use client";

import { useState, useEffect, useCallback } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const DEFAULT_VAPID_PUBLIC_KEY =
  "BHoJHnPNCIOTSVgdT4KjMFKTZAJRl4Lu77BosYYzmymPGgDWsyHioP0wF01bkJZ9isYcdYTw8xgcihSUTqVr6ns";

export function usePushNotifications({
  role = "member",
  userId,
}: {
  role?: "admin" | "staff" | "member";
  userId?: string | null;
} = {}) {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      setPermission(Notification.permission);

      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then((subscription) => {
          setIsSubscribed(Boolean(subscription));
        });
      });
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported) return false;
    setLoading(true);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setLoading(false);
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;

      let sub = await registration.pushManager.getSubscription();
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      // Show instant device notification right away
      try {
        await registration.showNotification("🎉 Notifications Enabled!", {
          body: "You will now receive lock-screen alerts from Corhaus Pilates.",
          icon: "/corhaus-logo.png",
          badge: "/corhaus-logo.png",
          data: { url: "/" },
        });
      } catch (notifErr) {
        console.warn("Immediate notification error:", notifErr);
      }

      // Send subscription to server
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          userId: userId || null,
          role,
        }),
      });

      if (res.ok) {
        setIsSubscribed(true);
        setLoading(false);
        // Also trigger server-side push test
        fetch("/api/push/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            target: "single",
            title: "🎉 Notifications Enabled!",
            message: "You will now receive lock-screen alerts from Corhaus Pilates.",
          }),
        }).catch(() => {});
        return true;
      }
    } catch (err) {
      console.error("[PUSH] Subscription error:", err);
    } finally {
      setLoading(false);
    }
    return false;
  }, [isSupported, role, userId]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return false;
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error("[PUSH] Unsubscribe error:", err);
    } finally {
      setLoading(false);
    }
    return true;
  }, [isSupported]);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
  };
}
