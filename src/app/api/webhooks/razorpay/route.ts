import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });

    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

    const expectedSignature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    if (expectedSignature !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    // Only handle order.paid or payment.captured
    if (event !== "order.paid" && event !== "payment.captured" && event !== "payment.authorized") {
      return NextResponse.json({ received: true });
    }

    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    // Extract order and payment
    const order = payload.payload?.order?.entity || payload.payload?.payment?.entity?.order_id ? payload.payload.order.entity : null;
    const payment = payload.payload?.payment?.entity || payload.payload?.order?.entity;

    // Try to find the order id
    let orderId: string | null = null;
    let paymentId: string | null = null;
    if (payload.payload?.payment?.entity) {
      paymentId = payload.payload.payment.entity.id;
      orderId = payload.payload.payment.entity.order_id;
    } else if (payload.payload?.order?.entity) {
      orderId = payload.payload.order.entity.id;
    }

    if (!orderId) return NextResponse.json({ received: true });

    // Idempotency: check if this order already processed (look for trial with this order id in notes)
    const { data: existing } = await service.from("trial_members").select("id").ilike("notes", `%${orderId}%`).maybeSingle();
    if (existing) {
      return NextResponse.json({ received: true, alreadyProcessed: true });
    }
    const { data: existing2 } = await service.from("trial_members").select("id").ilike("notes", `%${paymentId}%`).maybeSingle();
    if (existing2) {
      return NextResponse.json({ received: true, alreadyProcessed: true });
    }

    // If we have order notes, we can fulfill
    // For now, just log and return - the verify endpoint already handles fulfillment
    // The webhook is a backup - if the verify already created the trial, we do nothing
    // If not, we would need the original booking data, which is in the order notes
    // Since we don't have the booking data in the webhook payload's order notes for this simple implementation,
    // we just acknowledge

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("webhook error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
