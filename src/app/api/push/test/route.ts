import { NextResponse } from "next/server";
import { sendPushNotification, sendPushToRole, broadcastPush } from "@/lib/push/service";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { subscription, target = "single", role = "admin", title, message } = body;

    const payload = {
      title: title || "Corhaus Pilates",
      body: message || "This is a test notification from Corhaus Pilates.",
      icon: "/corhaus-logo.png",
      url: "/",
    };

    if (target === "single" && subscription) {
      const ok = await sendPushNotification(
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        payload
      );
      return NextResponse.json({ success: ok });
    }

    if (target === "role") {
      const count = await sendPushToRole(role, payload);
      return NextResponse.json({ success: true, count });
    }

    if (target === "broadcast") {
      const count = await broadcastPush(payload);
      return NextResponse.json({ success: true, count });
    }

    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  } catch (err: any) {
    console.error("[PUSH TEST] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
