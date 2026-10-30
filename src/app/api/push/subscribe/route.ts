import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { subscription, userId, role = "member" } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
    }

    const { endpoint, keys } = subscription;
    const { p256dh, auth } = keys;

    if (!p256dh || !auth) {
      return NextResponse.json({ error: "Missing subscription keys" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const userAgent = req.headers.get("user-agent") || "";

    // Upsert subscription
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        endpoint,
        p256dh,
        auth,
        user_id: userId || null,
        role: role.toLowerCase(),
        user_agent: userAgent.slice(0, 500),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      console.error("[PUSH SUBSCRIBE] Upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[PUSH SUBSCRIBE] Server error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ error: "Endpoint required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[PUSH UNSUBSCRIBE] Error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
