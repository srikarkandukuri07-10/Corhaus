import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared trial fulfilment helpers used by BOTH payment paths:
 *
 *   1. POST /api/trial/verify-payment  — the customer's browser calls this
 *      immediately after the Razorpay checkout succeeds.
 *   2. POST /api/webhooks/razorpay      — Razorpay's servers call this,
 *      independently of the customer's browser.
 *
 * Both must produce identical outcomes and must be safe to run repeatedly for
 * the same payment, because either can fire first and the other will then find
 * the work already done. Idempotency therefore comes from real database
 * constraints, not from application-level "have I already done this?" flags:
 *
 *   - idx_trial_members_razorpay_payment (UNIQUE on razorpay_payment_id)
 *   - ensureTrialInvoice() finds-or-creates by transaction_reference
 *
 * Nothing here throws. A failure to invoice must never lose a paid booking, and
 * a failure to book must never prevent the caller from recording the invoice.
 */

export interface TrialInvoiceArgs {
  trialId: string;
  fullName: string;
  email: string;
  phone: string;
  classTitle?: string | null;
  classDate?: string | null;
  amountRupees?: number | null;
  priceBranchId?: string | null;
  branchId?: string | null;
  paymentId: string;
  orderId: string;
}

/**
 * Guarantees the exact invoice for a paid trial exists in `invoices` and is
 * linked on the trial row. Find-or-create by payment id, so retries and
 * duplicate verify calls never produce duplicates or miss the invoice.
 *
 * Moved verbatim from src/app/api/trial/verify-payment/route.ts so the webhook
 * can reuse it rather than reimplementing invoice creation.
 */
export async function ensureTrialInvoice(
  service: SupabaseClient,
  args: TrialInvoiceArgs
): Promise<string | null> {
  try {
    // 1. Already linked on the trial?
    let trial: Record<string, unknown> | null = null;
    try {
      const r = await service
        .from("trial_members")
        .select("id, invoice_id, class_name, trial_date, location_id")
        .eq("id", args.trialId)
        .maybeSingle();
      if (!r.error) trial = r.data as Record<string, unknown> | null;
    } catch {
      // invoice_id/location_id columns may not exist pre-migration — fall through
    }
    if (trial?.invoice_id) {
      const { data: inv } = await service
        .from("invoices")
        .select("id")
        .eq("id", trial.invoice_id as string)
        .maybeSingle();
      if (inv) return inv.id as string;
    }

    // 2. Invoice already created for this payment?
    const { data: byRef } = await service
      .from("invoices")
      .select("id")
      .eq("transaction_reference", args.paymentId)
      .maybeSingle();
    if (byRef) {
      try {
        await service
          .from("trial_members")
          .update({ invoice_id: byRef.id })
          .eq("id", args.trialId);
      } catch {
        /* invoice_id column may not exist pre-migration */
      }
      return byRef.id as string;
    }

    // 3. Create a fresh invoice
    let amount =
      args.amountRupees && args.amountRupees > 0 ? Math.round(args.amountRupees) : null;
    if (!amount) {
      let planQuery = service
        .from("billing_plan_items")
        .select("price")
        .ilike("name", "%Trial Session%")
        .eq("is_active", true);
      const priceBranch =
        args.priceBranchId || (trial?.location_id as string | null) || null;
      if (priceBranch) planQuery = planQuery.eq("location_id", priceBranch);
      const { data: trialPlan } = await planQuery.maybeSingle();
      amount = trialPlan?.price ? Number(trialPlan.price) : 500;
    }
    const classTitle = args.classTitle || (trial?.class_name as string) || "Trial Class";
    const classDate =
      args.classDate ||
      (trial?.trial_date as string) ||
      new Date().toISOString().split("T")[0];
    const invoiceNumber = `TRIAL-${Date.now()}-${args.phone.slice(-4)}`;

    let customerId: string | null = null;
    const { data: existingCustomer } = await service
      .from("customers")
      .select("id")
      .ilike("email", args.email)
      .maybeSingle();
    if (existingCustomer) customerId = existingCustomer.id;
    else {
      const { data: newCustomer } = await service
        .from("customers")
        .insert({ full_name: args.fullName, email: args.email, phone_number: args.phone })
        .select("id")
        .maybeSingle();
      if (newCustomer) customerId = newCustomer.id;
    }
    if (!customerId) {
      console.error("[razorpay] invoice: customer resolution failed for", args.email);
      return null;
    }

    const invoiceBranch = (args.branchId ||
      (trial?.location_id as string | null) ||
      null) as string | null;

    const base: Record<string, unknown> = {
      invoice_number: invoiceNumber,
      customer_id: customerId,
      customer_name: args.fullName,
      customer_email: args.email,
      customer_phone: args.phone,
      subtotal: amount,
      grand_total: amount,
      amount_paid: amount,
      payment_status: "paid",
      transaction_reference: args.paymentId,
      notes: `Trial booking for ${classTitle} on ${classDate} (Order ${args.orderId})`,
      created_at: new Date().toISOString(),
      ...(invoiceBranch ? { location_id: invoiceBranch } : {}),
    };

    let invRes = await service
      .from("invoices")
      .insert({ ...base, payment_method: "Razorpay" })
      .select("id")
      .single();
    if (invRes.error && /payment_method|check/i.test(invRes.error.message || "")) {
      // Pre-migration DBs reject 'Razorpay' — fall back so the invoice still exists
      console.warn(
        "[razorpay] invoice: 'Razorpay' method rejected, retrying as UPI:",
        invRes.error.message
      );
      invRes = await service
        .from("invoices")
        .insert({ ...base, payment_method: "UPI" })
        .select("id")
        .single();
    }
    if (invRes.error || !invRes.data) {
      console.error("[razorpay] invoice creation failed:", invRes.error);
      return null;
    }
    const invoiceId = invRes.data.id as string;

    try {
      await service.from("invoice_items").insert({
        invoice_id: invoiceId,
        name: `${classTitle} (Trial)`,
        category: "Services",
        quantity: 1,
        unit_price: amount,
        total_price: amount,
        ...(invoiceBranch ? { location_id: invoiceBranch } : {}),
      });
    } catch (itemErr) {
      console.error("[razorpay] invoice item creation failed:", itemErr);
    }

    try {
      await service
        .from("trial_members")
        .update({ invoice_id: invoiceId })
        .eq("id", args.trialId);
    } catch {
      /* invoice_id column may not exist pre-migration */
    }
    return invoiceId;
  } catch (e) {
    console.error("[razorpay] ensureTrialInvoice failed:", e);
    return null;
  }
}

export interface OrderNotes {
  full_name?: string;
  email?: string;
  phone?: string;
  class_id?: string;
  class_title?: string;
  branch_id?: string;
  trial_date?: string;
  trial_time?: string;
}

export interface FulfilResult {
  outcome: "fulfilled" | "already_done" | "rejected";
  trialId?: string;
  invoiceId?: string | null;
  reason?: string;
}

/**
 * Fallback fulfilment for a payment that Razorpay confirmed but the
 * customer's browser never reported — the customer closed the tab, lost signal,
 * or the verify request failed after the money was taken.
 *
 * Everything needed is carried in the order's `notes`, written by
 * POST /api/trial/create-order. If the notes are incomplete the payment is
 * still acknowledged, but nothing is fabricated and staff can reconcile from
 * the invoice.
 */
export async function fulfilTrialFromOrder(
  service: SupabaseClient,
  args: {
    orderId: string;
    paymentId: string;
    notes: OrderNotes;
    amountRupees: number | null;
  }
): Promise<FulfilResult> {
  try {
    const n = args.notes || {};
    const fullName = (n.full_name || "").trim();
    const email = (n.email || "").trim().toLowerCase();
    const phone = (n.phone || "").replace(/\D/g, "");
    const classId = (n.class_id || "").trim();
    const trialDate = (n.trial_date || "").trim();
    const trialTime = (n.trial_time || "").trim();

    if (!fullName || !email || phone.length !== 10) {
      return {
        outcome: "rejected",
        reason: "Order notes missing full_name/email/phone.",
      };
    }
    if (!classId && !(trialDate && trialTime)) {
      return {
        outcome: "rejected",
        reason:
          "Order notes contain neither class_id nor trial_date/trial_time; cannot determine the booked slot.",
      };
    }

    // Resolve the class the same way verify-payment does.
    let cls: Record<string, unknown> | null = null;
    if (classId) {
      const { data } = await service
        .from("classes")
        .select("id, title, instructor, class_date, class_time, max_capacity, location_id")
        .eq("id", classId)
        .maybeSingle();
      if (!data) {
        return { outcome: "rejected", reason: "Class from the order no longer exists." };
      }
      cls = data as Record<string, unknown>;
    } else {
      const timeWithSecs = trialTime.length === 5 ? `${trialTime}:00` : trialTime;
      const { data: slotClass } = await service
        .from("classes")
        .select("id, title, instructor, class_date, class_time, max_capacity, location_id")
        .eq("class_date", trialDate)
        .eq("class_time", timeWithSecs)
        .maybeSingle();
      if (slotClass) {
        cls = slotClass as Record<string, unknown>;
      } else {
        const isEvening = ["16", "17", "18", "19"].some((h) => trialTime.startsWith(h));
        const derivedTitle =
          n.class_title || (isEvening ? "Evening Reformer" : "Morning Reformer");
        const { data: staffRow } = await service
          .from("staff_members")
          .select("id, full_name")
          .ilike("role", "Trainer")
          .eq("employment_status", "Active")
          .limit(1)
          .maybeSingle();
        cls = {
          id: null,
          title: derivedTitle,
          instructor: staffRow?.full_name || "Staff",
          instructor_id: staffRow?.id || null,
          class_date: trialDate,
          class_time: timeWithSecs,
          max_capacity: 10,
        };
      }
    }

    // Capacity, re-checked at fulfilment time.
    if (cls?.id) {
      const { data: bookings } = await service
        .from("bookings")
        .select("id")
        .eq("class_id", cls.id)
        .in("booking_status", ["booked", "confirmed", "checked_in", "completed"]);
      if (bookings && bookings.length >= ((cls.max_capacity as number) ?? 10)) {
        return {
          outcome: "rejected",
          reason: "Class is full; paid booking needs manual reconciliation.",
        };
      }
    }

    // Branch: the order notes recorded the branch at checkout.
    const notesBranch = (n.branch_id || "").trim();
    const trialBranchId: string | null =
      (cls?.location_id as string | null) || notesBranch || null;

    let instructorId = (cls?.instructor_id as string | null) ?? null;
    if (!instructorId && cls?.instructor) {
      const { data: byName } = await service
        .from("staff_members")
        .select("id, full_name")
        .ilike("full_name", cls.instructor as string)
        .maybeSingle();
      instructorId = byName?.id ?? null;
    }

    const insert: Record<string, unknown> = {
      full_name: fullName,
      phone_number: phone,
      email,
      trial_date: cls?.class_date as string,
      trial_time: cls?.class_time as string,
      class_id: (cls?.id as string | null) ?? null,
      class_name: (cls?.title as string) || n.class_title || "Trial Class",
      instructor_id: instructorId,
      instructor_name: (cls?.instructor as string) || "Staff",
      status: "Scheduled",
      source: "Website",
      interest: (cls?.title as string) || n.class_title || "Trial Class",
      pipeline_stage: "New",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      razorpay_order_id: args.orderId,
      razorpay_payment_id: args.paymentId,
      payment_status: "paid",
      ...(args.amountRupees ? { payment_amount: Math.round(args.amountRupees * 100) } : {}),
      ...(trialBranchId ? { location_id: trialBranchId } : {}),
    };

    const { data: inserted, error: insErr } = await service
      .from("trial_members")
      .insert(insert)
      .select("id")
      .single();

    if (insErr || !inserted) {
      // 23505 = the unique index on razorpay_payment_id fired: the browser path
      // won the race. That is success, not failure.
      const code = (insErr as { code?: string } | null)?.code;
      if (code === "23505" || /duplicate key/i.test(insErr?.message || "")) {
        const { data: existing } = await service
          .from("trial_members")
          .select("id")
          .eq("razorpay_payment_id", args.paymentId)
          .maybeSingle();
        if (existing) {
          const invoiceId = await ensureTrialInvoice(service, {
            trialId: existing.id as string,
            fullName,
            email,
            phone,
            classTitle: insert.class_name as string,
            classDate: insert.trial_date as string,
            amountRupees: args.amountRupees,
            priceBranchId: trialBranchId,
            branchId: trialBranchId,
            paymentId: args.paymentId,
            orderId: args.orderId,
          });
          return { outcome: "already_done", trialId: existing.id as string, invoiceId };
        }
      }
      console.error("[razorpay] webhook fulfilment insert failed:", insErr);
      return {
        outcome: "rejected",
        reason: `Could not create the trial record: ${insErr?.message ?? "unknown error"}`,
      };
    }

    const trialId = inserted.id as string;
    console.log(`[webhook] fulfilled trial ${trialId} from order ${args.orderId}`);

    // Lead, for the pipeline.
    try {
      await service.from("leads").insert({
        full_name: fullName,
        phone_number: phone,
        email,
        source: "Website",
        interest: insert.class_name as string,
        pipeline_stage: "Trial Booked",
        primary_location: "CorhausPilates - Main Branch",
        notes: `Trial booked via Razorpay: ${args.paymentId}`,
      });
    } catch {
      /* non-fatal */
    }

    // Booking row only exists for an already-approved member; prospects do not
    // have an approved_members record, so most trials legitimately skip this.
    try {
      const { data: approvedMember } = await service
        .from("approved_members")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (approvedMember && cls?.id) {
        const { data: existingBooking } = await service
          .from("bookings")
          .select("id")
          .eq("class_id", cls.id)
          .eq("member_id", approvedMember.id)
          .maybeSingle();
        if (!existingBooking) {
          await service.from("bookings").insert({
            class_id: cls.id,
            member_id: approvedMember.id,
            booking_status: "booked",
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch {
      /* non-fatal */
    }

    const invoiceId = await ensureTrialInvoice(service, {
      trialId,
      fullName,
      email,
      phone,
      classTitle: insert.class_name as string,
      classDate: insert.trial_date as string,
      amountRupees: args.amountRupees,
      priceBranchId: trialBranchId,
      branchId: trialBranchId,
      paymentId: args.paymentId,
      orderId: args.orderId,
    });

    return { outcome: "fulfilled", trialId, invoiceId };
  } catch (e) {
    console.error("[razorpay] fulfilTrialFromOrder threw:", e);
    return {
      outcome: "rejected",
      reason: e instanceof Error ? e.message : "Unknown fulfilment error",
    };
  }
}