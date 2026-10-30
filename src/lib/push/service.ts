import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, any>;
}

const DEFAULT_VAPID_PUBLIC_KEY = "BHoJHnPNCIOTSVgdT4KjMFKTZAJRl4Lu77BosYYzmymPGgDWsyHioP0wF01bkJZ9isYcdYTw8xgcihSUTqVr6ns";
const DEFAULT_VAPID_PRIVATE_KEY = "LDhMFzUCKEqiBrcVpSid2TX0b-GsUI88Hqde4v1J1o8";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

function ensureVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@corhaus.com";

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return true;
  } catch (err) {
    console.error("[PUSH] Error configuring VAPID details:", err);
    return false;
  }
}

/**
 * Sends a push notification to a specific subscription endpoint.
 * Automatically cleans up unsubscribed / expired endpoints (HTTP 404, 410).
 */
export async function sendPushNotification(
  sub: PushSubscriptionData,
  payload: NotificationPayload
): Promise<boolean> {
  if (!ensureVapidConfig()) return false;

  const pushSubscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };

  const formattedPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/corhaus-logo.png",
    badge: payload.badge || "/corhaus-logo.png",
    data: {
      url: payload.url || "/",
      ...payload.data,
    },
    tag: payload.tag || `corhaus-${Date.now()}`,
  });

  try {
    await webpush.sendNotification(pushSubscription, formattedPayload, {
      TTL: 60 * 60 * 24, // 24 hours
    });
    return true;
  } catch (err: any) {
    // 404 Not Found or 410 Gone means user unsubscribed or token expired
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.log(`[PUSH] Cleaning expired subscription: ${sub.endpoint.slice(0, 30)}...`);
      try {
        const supabase = getServiceClient();
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      } catch (dbErr) {
        console.warn("[PUSH] Could not delete expired subscription:", dbErr);
      }
    } else {
      console.error("[PUSH] Send error:", err.statusCode, err.message);
    }
    return false;
  }
}

/**
 * Sends a notification to all devices registered to a specific user (member or staff ID).
 */
export async function sendPushToUser(
  userId: string,
  payload: NotificationPayload
): Promise<number> {
  if (!userId) return 0;
  const supabase = getServiceClient();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return 0;

  let successCount = 0;
  await Promise.all(
    subs.map(async (s) => {
      const ok = await sendPushNotification(s, payload);
      if (ok) successCount++;
    })
  );

  return successCount;
}

/**
 * Sends a notification to all users with a specific role ('admin', 'staff', 'member').
 */
export async function sendPushToRole(
  role: "admin" | "staff" | "member",
  payload: NotificationPayload
): Promise<number> {
  const supabase = getServiceClient();
  const query = supabase.from("push_subscriptions").select("endpoint, p256dh, auth");

  if (role === "admin") {
    // Admins and staff both receive admin alerts
    query.in("role", ["admin", "staff", "owner", "manager"]);
  } else {
    query.eq("role", role);
  }

  const { data: subs, error } = await query;
  if (error || !subs || subs.length === 0) return 0;

  let successCount = 0;
  await Promise.all(
    subs.map(async (s) => {
      const ok = await sendPushNotification(s, payload);
      if (ok) successCount++;
    })
  );

  return successCount;
}

/**
 * Broadcasts a push notification to ALL registered devices (e.g. for Studio Holidays).
 */
export async function broadcastPush(payload: NotificationPayload): Promise<number> {
  const supabase = getServiceClient();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");

  if (error || !subs || subs.length === 0) return 0;

  let successCount = 0;
  await Promise.all(
    subs.map(async (s) => {
      const ok = await sendPushNotification(s, payload);
      if (ok) successCount++;
    })
  );

  return successCount;
}
