import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import {
  ensureTrialInvoice,
  fulfilTrialFromOrder,
  type OrderNotes,
} from "@/lib/razorpay/trialFulfilment";
import { markInvoicePaidFromLink } from "@/lib/razorpay/invoicePayment";

/**
 * Razorpay webhook.
 *
 * Why this exists: the browser round-trip through /api/trial/verify-payment is
 * the normal fulfilment path, but it depends on the customer's device. If they
 * pay and then close the tab, lose signal, or the verify request fails, their
 * money is captured and no booking exists. Razorpay's servers call THIS route
 * independently, so a successful payment always produces a booking.
 *
 * Idempotency
 * -----------
 * Razorpay retries webhooks, so this handler must be safe to run many times for
 * one payment. Three layers, in order:
 *   1. match on trial_members.razorpay_order_id (the dedicated column added by
 *      migration 046 — NOT the notes column, which verify-payment deliberately
 *      stopped writing to)
 *   2. the unique index idx_trial_members_razorpay_payment on
 *      razorpay_payment_id
 *   3. ensureTrialInvoice() finds-or-creates by transaction_reference
 *
 * Always returns 200 for a valid signature, even when it cannot fulfil, so
 * Razorpay does not retry forever on data we cannot act on. Genuinely
 * retryable work stays visible in logs and the audit table.
 */
export async function POST(req: Request) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    // Constant-time compare: a plain !== leaks timing information about the
    // expected signature.
    const a = Buffer.from(expectedSignature, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    if (
      event !== "order.paid" &&
      event !== "payment.captured" &&
      event !== "payment.authorized"
    ) {
      // Includes refund.processed and payment.dispute.created, which we do not
      // act on yet. Acknowledged so Razorpay stops retrying them.
      return NextResponse.json({ received: true, handled: false, event });
    }

    const order = payload.payload?.order?.entity ?? null;
    const payment = payload.payload?.payment?.entity ?? null;

    // Created up front: both the payment-link branch and the trial branch below
    // need it.
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── 0. Payment Links (invoice collection) ──────────────────────────────
    // A payment-link payment carries notes.reference_id, which we set to the
    // invoice id when creating the link. That is the only correlation used -
    // never amount or timing heuristics, which could settle the wrong invoice.
    const referenceId: string | null =
      payment?.notes?.reference_id ?? order?.notes?.reference_id ?? null;

    if (referenceId) {
      const invoiceId = String(referenceId);
      // Guard against a stray notes field colliding with an unrelated payment.
      const { data: invExists } = await service
        .from("invoices")
        .select("id")
        .eq("id", invoiceId)
        .maybeSingle();

      if (invExists) {
        const amountRupees = payment?.amount
          ? Number(payment.amount) / 100
          : order?.amount
            ? Number(order.amount) / 100
            : 0;

        const settled = await markInvoicePaidFromLink(service, {
          invoiceId,
          paymentId: payment?.id ?? order?.id ?? "unknown",
          amountRupees,
          paymentMethod: "Razorpay",
        });

        return NextResponse.json({
          received: true,
          handled: true,
          outcome: settled.ok ? "invoice_settled" : "invoice_rejected",
          invoiceId,
          alreadyPaid: settled.alreadyPaid ?? false,
          ...(settled.reason ? { detail: settled.reason } : {}),
        });
      }
    }

    const orderId: string | null = payment?.order_id ?? order?.id ?? null;
    const paymentId: string | null = payment?.id ?? null;

    if (!orderId) {
      return NextResponse.json({ received: true, handled: false });
    }

    // ── 1. Already fulfilled by the browser path? ──────────────────────────
    // Query the dedicated columns. The previous version searched `notes` for the
    // order id, which could never match, so this check always missed.
    const { data: existingTrials } = await service
      .from("trial_members")
      .select("id, invoice_id, class_name, trial_date, location_id, full_name, email, phone_number")
      .or(`razorpay_order_id.eq.${orderId}${paymentId ? `,razorpay_payment_id.eq.${paymentId}` : ""}`)
      .limit(1);

    const existing = (existingTrials ?? [])[0] as
      | Record<string, unknown>
      | undefined;

    if (existing) {
      // Guarantee the invoice exists even if the browser path predates
      // invoicing, then stop.
      const invoiceId = await ensureTrialInvoice(service, {
        trialId: existing.id as string,
        fullName: (existing.full_name as string) ?? "",
        email: (existing.email as string) ?? "",
        phone: (existing.phone_number as string) ?? "",
        classTitle: (existing.class_name as string) ?? null,
        classDate: (existing.trial_date as string) ?? null,
        amountRupees: payment?.amount ? Number(payment.amount) / 100 : null,
        priceBranchId: (existing.location_id as string | null) ?? null,
        branchId: (existing.location_id as string | null) ?? null,
        paymentId: paymentId ?? orderId,
        orderId,
      });
      return NextResponse.json({
        received: true,
        handled: true,
        outcome: "already_done",
        trialId: existing.id,
        invoiceId,
      });
    }

    // ── 2. Not fulfilled. Build it from the order notes. ──────────────────
    const notes: OrderNotes = (order?.notes ?? payment?.notes ?? {}) as OrderNotes;

    const result = await fulfilTrialFromOrder(service, {
      orderId,
      paymentId: paymentId ?? orderId,
      notes,
      amountRupees: payment?.amount ? Number(payment.amount) / 100 : null,
    });

    // Record the outcome so a failed fulfilment is visible to staff rather than
    // only in server logs. Uses admin_notifications because it already exists
    // in every deployment and needs no new table.
    try {
      await service.from("admin_notifications").insert({
        type: "razorpay_webhook",
        email: "razorpay@system",
        message: `${event} order=${orderId} payment=${paymentId ?? "-"} outcome=${result.outcome}${
          result.reason ? ` reason=${result.reason}` : ""
        }`,
        is_read: result.outcome !== "rejected",
      });
    } catch (auditErr) {
      console.error("[webhook] audit write failed:", auditErr);
    }

    if (result.outcome === "rejected") {
      // Logged, but acknowledged: the money is captured either way, and staff
      // reconcile from the invoice. Retrying cannot fix missing order notes.
      console.error(
        `[webhook] could not fulfil order ${orderId}: ${result.reason}`
      );
    }

    return NextResponse.json({
      received: true,
      handled: true,
      outcome: result.outcome,
      trialId: result.trialId ?? null,
      invoiceId: result.invoiceId ?? null,
      ...(result.reason ? { detail: result.reason } : {}),
    });
  } catch (e) {
    console.error("[webhook] error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}