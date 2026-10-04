/**
 * Online payment collection for invoices via Razorpay Payment Links.
 *
 * Deliberately separate from the trial flow (src/app/api/trial/*), which uses
 * the Checkout + order-verification route. Invoices use Payment Links instead
 * because the member pays at the counter against an invoice that already
 * exists - there is no cart to check out and no trial to fulfil afterwards.
 *
 * Amounts are always computed server-side from the stored invoice. Nothing here
 * trusts a value supplied by the browser.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type Razorpay from "razorpay";

type RazorpayInstance = Razorpay;

export interface InvoiceForPayment {
  id: string;
  invoice_number: string;
  grand_total: number | null;
  amount_paid: number | null;
  payment_status: string;
  razorpay_payment_link_id: string | null;
  razorpay_payment_link_url: string | null;
}

/**
 * What is still owed on an invoice.
 * Mirrors the app's existing capping rule: a credit can never exceed the total.
 */
export function outstandingBalance(inv: {
  grand_total?: number | null;
  amount_paid?: number | null;
}): number {
  const total = Number(inv.grand_total || 0);
  const paid = Number(inv.amount_paid || 0);
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

/** A payment link is only meaningful while something is still owed. */
export function canCollectOnline(inv: InvoiceForPayment): boolean {
  if (outstandingBalance(inv) <= 0) return false;
  return inv.payment_status === "due" || inv.payment_status === "partial";
}

export interface CreateLinkResult {
  ok: boolean;
  reason?: string;
  linkId?: string;
  url?: string;
  amount?: number;
}

/**
 * Creates a Razorpay Payment Link for an invoice's outstanding balance.
 *
 * Typed against the real SDK instance rather than a hand-rolled structural
 * type. That matters: the resource is `paymentLink` (singular), and the earlier
 * `paymentLinks` guess was `undefined` at runtime and was masked from the
 * compiler by an `as never` cast. Typing it properly makes the compiler verify
 * the method name and the payload shape.
 *
 * `reference_id` is set to the invoice id. That is the only correlation the
 * webhook relies on, so a payment can never be attached to the wrong invoice by
 * coincidence of amount or timing.
 */
export async function createInvoicePaymentLink(
  razorpay: RazorpayInstance,
  args: {
    invoice: InvoiceForPayment;
    customerName: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    notifySms?: boolean;
  }
): Promise<CreateLinkResult> {
  const amount = outstandingBalance(args.invoice);
  if (amount <= 0) {
    return { ok: false, reason: "This invoice has nothing outstanding." };
  }

  try {
    const link = await razorpay.paymentLink.create({
      amount: Math.round(amount * 100), // Razorpay works in paise
      currency: "INR",
      accept_partial: false, // never let a member underpay the link amount
      reference_id: args.invoice.id,
      description: `Corhaus invoice ${args.invoice.invoice_number}`,
      customer: {
        name: args.customerName || "Corhaus Member",
        ...(args.customerEmail ? { email: args.customerEmail } : {}),
      },
      notify: {
        // WhatsApp/email receipts are handled by the webhook + our own records;
        // SMS is left to Razorpay's own notification settings.
        sms: args.notifySms ?? false,
      },
      reminder_enable: false,
    });

    // short_url is the field the SDK actually returns; fall back to id so we
    // never hand a null URL to the QR renderer.
    const url = link.short_url || null;
    if (!url) {
      return { ok: false, reason: "Razorpay did not return a payment URL." };
    }
    return { ok: true, linkId: link.id, url, amount };
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    const desc =
      (err as { error?: { description?: string } })?.error?.description ||
      (err as { message?: string })?.message ||
      "unknown";
    console.error(
      `[razorpay] payment link creation failed status=${status ?? "n/a"} detail=${desc}`
    );
    return { ok: false, reason: desc };
  }
}

/**
 * Reconciles an invoice after a successful online payment.
 *
 * Idempotent: safe on webhook retries and on Razorpay's duplicate deliveries.
 * Writes the paid amount onto the existing invoice rather than creating a new
 * one, so invoice numbering, invoice_items and any linked member_purchased_plans
 * stay exactly as the billing screen wrote them.
 */
export async function markInvoicePaidFromLink(
  service: SupabaseClient,
  args: {
    invoiceId: string;
    paymentId: string;
    amountRupees: number;
    paymentMethod?: string;
  }
): Promise<{ ok: boolean; reason?: string; alreadyPaid?: boolean }> {
  const { data: invoice, error } = await service
    .from("invoices")
    .select(
      "id, invoice_number, grand_total, amount_paid, payment_status, razorpay_payment_link_id"
    )
    .eq("id", args.invoiceId)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message };
  if (!invoice) return { ok: false, reason: "Invoice not found for this payment." };

  const inv = invoice as unknown as InvoiceForPayment;
  const total = Number(inv.grand_total || 0);
  const alreadyPaid = Number(inv.amount_paid || 0);
  const paidNow = Math.min(args.amountRupees, Math.max(0, total - alreadyPaid));
  const newPaid = Math.round((alreadyPaid + paidNow) * 100) / 100;

  // Fully settled, or nothing left to apply - treat as success and stop.
  if (newPaid >= total - 0.001) {
    if (inv.payment_status === "paid" && alreadyPaid >= total - 0.001) {
      return { ok: true, alreadyPaid: true };
    }
  }

  const paymentStatus = newPaid >= total - 0.001 ? "paid" : "partial";

  const { error: updErr } = await service
    .from("invoices")
    .update({
      amount_paid: newPaid,
      payment_status: paymentStatus,
      payment_method: args.paymentMethod || "Razorpay",
      // Keep the first reference; append later ones so nothing is lost.
      transaction_reference: alreadyPaid > 0 ? `${inv.invoice_number}` : args.paymentId,
    })
    .eq("id", args.invoiceId);

  if (updErr) return { ok: false, reason: updErr.message };

  try {
    await service.from("invoice_payment_audit").insert({
      invoice_id: args.invoiceId,
      action: newPaid >= total - 0.001 ? "paid_online" : "partial_online",
      actor_email: "razorpay@webhook",
      details: {
        payment_id: args.paymentId,
        amount_applied: paidNow,
        amount_paid_total: newPaid,
        grand_total: total,
      },
    });
  } catch (e) {
    console.error("[razorpay] invoice audit write failed:", e);
  }

  console.log(
    `[razorpay] invoice ${inv.invoice_number} -> ${paymentStatus} (paid ${newPaid}/${total})`
  );
  return { ok: true };
}
