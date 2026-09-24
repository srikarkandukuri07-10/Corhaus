import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import Razorpay from "razorpay";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Guarantees the exact invoice for a paid trial exists in `invoices` and is
 * linked on the trial row. Find-or-create by payment id, so retries and
 * duplicate verify calls never produce duplicates or miss the invoice.
 * Never throws — returns the invoice id or null (booking still succeeds).
 */
async function ensureTrialInvoice(
  service: any,
  args: {
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
): Promise<string | null> {
  try {
    // 1. Already linked on the trial?
    let trial: any = null;
    try {
      const r = await service
        .from("trial_members")
        .select("id, invoice_id, class_name, trial_date, location_id")
        .eq("id", args.trialId)
        .maybeSingle();
      if (!r.error) trial = r.data;
    } catch {
      // invoice_id/location_id columns may not exist pre-migration — fall through
    }
    if (trial?.invoice_id) {
      const { data: inv } = await service.from("invoices").select("id").eq("id", trial.invoice_id).maybeSingle();
      if (inv) return inv.id;
    }

    // 2. Invoice already created for this payment (e.g. first attempt succeeded)?
    const { data: byRef } = await service
      .from("invoices")
      .select("id")
      .eq("transaction_reference", args.paymentId)
      .maybeSingle();
    if (byRef) {
      try {
        await service.from("trial_members").update({ invoice_id: byRef.id }).eq("id", args.trialId);
      } catch {}
      return byRef.id;
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
      const priceBranch = args.priceBranchId || (trial as any)?.location_id || null;
      if (priceBranch) planQuery = planQuery.eq("location_id", priceBranch);
      const { data: trialPlan } = await planQuery.maybeSingle();
      amount = trialPlan?.price ? Number(trialPlan.price) : 500;
    }
    const classTitle = args.classTitle || trial?.class_name || "Trial Class";
    const classDate = args.classDate || trial?.trial_date || new Date().toISOString().split("T")[0];
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
      console.error("Trial invoice: customer resolution failed for", args.email);
      return null;
    }

    const invoiceBranch = (args.branchId || (trial as any)?.location_id || null) as string | null;
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
    let invRes = await service.from("invoices").insert({ ...base, payment_method: "Razorpay" }).select("id").single();
    if (invRes.error && /payment_method|check/i.test(invRes.error.message || "")) {
      // Pre-migration DBs reject 'Razorpay' — fall back so the invoice still exists immediately
      console.warn("Trial invoice: 'Razorpay' method rejected, retrying as UPI:", invRes.error.message);
      invRes = await service.from("invoices").insert({ ...base, payment_method: "UPI" }).select("id").single();
    }
    if (invRes.error || !invRes.data) {
      console.error("Trial invoice creation failed:", invRes.error);
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
      console.error("Trial invoice item creation failed:", itemErr);
    }

    try {
      await service.from("trial_members").update({ invoice_id: invoiceId }).eq("id", args.trialId);
    } catch {
      // invoice_id column may not exist pre-migration — invoice itself still exists
    }
    return invoiceId;
  } catch (e) {
    console.error("ensureTrialInvoice failed:", e);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    // Rate limit billable payment verification (Razorpay API call): 10/min per IP
    const ip = getClientIp(req);
    const { success, retryAfter } = await rateLimit(ip, "trial_verify_payment", 10, 60 * 1000);
    if (!success) {
      return NextResponse.json(
        { error: `Too many requests. Please try again after ${retryAfter} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await req.json();
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, full_name, phone_number, email, class_id, trial_date, trial_time, class_name } = body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing payment verification data" }, { status: 400 });
    }
    if (!full_name || !phone_number || !email || (!class_id && (!trial_date || !trial_time))) {
      return NextResponse.json({ error: "Missing booking data" }, { status: 400 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const keyId = process.env.RAZORPAY_KEY_ID;
    if (!keySecret || !keyId) return NextResponse.json({ error: "Payment not configured" }, { status: 500 });

    // Verify signature
    const expectedSignature = crypto.createHmac("sha256", keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
    }

    // Verify payment status with Razorpay
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    let payment: any;
    try {
      payment = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (e: any) {
      return NextResponse.json({ error: "Failed to verify payment" }, { status: 400 });
    }
    if (payment.status !== "captured" && payment.status !== "authorized") {
      return NextResponse.json({ error: "Payment not captured" }, { status: 400 });
    }
    if (payment.order_id !== razorpay_order_id) {
      return NextResponse.json({ error: "Order mismatch" }, { status: 400 });
    }

    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    // Idempotency: check if this payment already created a trial
    try {
      const { data: existingByPayment } = await service.from("trial_members").select("id").eq("razorpay_payment_id", razorpay_payment_id).maybeSingle();
      if (existingByPayment) {
        // Trial exists — still guarantee its invoice exists (older rows predate invoicing)
        const invoiceId = await ensureTrialInvoice(service, {
          trialId: existingByPayment.id,
          fullName: (full_name as string).trim(),
          email: (email as string).trim().toLowerCase(),
          phone: (phone_number as string).replace(/\D/g, ""),
          amountRupees: payment.amount ? Number(payment.amount) / 100 : null,
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
        });
        return NextResponse.json({ success: true, message: "Trial already booked", trialId: existingByPayment.id, invoiceId });
      }
    } catch {}

    // Check by razorpay_payment_id if we store it (we will store in notes or a separate field - for now check trial_members with same email+class)
    // Also check leads
    const cleanPhoneEarly = (phone_number as string).replace(/\D/g, "");
    const emailLowerEarly = (email as string).trim().toLowerCase();
    const { data: existingLead } = await service.from("leads").select("id").eq("email", emailLowerEarly).maybeSingle();
    // Simplify idempotency: check if there's already a trial for this email from the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentTrial } = await service.from("trial_members").select("id").eq("email", emailLowerEarly).gte("created_at", oneHourAgo).maybeSingle();
    if (recentTrial) {
      const invoiceId = await ensureTrialInvoice(service, {
        trialId: recentTrial.id,
        fullName: (full_name as string).trim(),
        email: emailLowerEarly,
        phone: cleanPhoneEarly,
        classTitle: (class_name as string) || null,
        classDate: (trial_date as string) || null,
        amountRupees: payment.amount ? Number(payment.amount) / 100 : null,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
      });
      return NextResponse.json({ success: true, message: "Trial already booked", trialId: recentTrial.id, invoiceId });
    }

    // Resolve class: existing class_id OR date+time slot (new trial slots like Morning/Evening Reformer)
    let cls: any = null;
    if (class_id) {
      const { data } = await service.from("classes").select("id, title, instructor, class_date, class_time, max_capacity, location_id").eq("id", class_id).maybeSingle();
      if (!data) return NextResponse.json({ error: "Class not found" }, { status: 404 });
      cls = data;
    } else {
      // Slot flow: find existing class for that date+time, else build a virtual one
      const timeWithSecs = (trial_date as string) && (trial_time as string).length === 5 ? `${trial_time}:00` : trial_time;
      const { data: slotClass } = await service.from("classes").select("id, title, instructor, class_date, class_time, max_capacity, location_id").eq("class_date", trial_date).eq("class_time", timeWithSecs).maybeSingle();
      if (slotClass) {
        cls = slotClass;
      } else {
        const isEvening = ["16", "17", "18", "19"].some((h) => (trial_time as string).startsWith(h));
        const derivedTitle = (class_name as string) || (isEvening ? "Evening Reformer" : "Morning Reformer");
        const { data: staffRow } = await service.from("staff_members").select("id, full_name").ilike("role", "Trainer").eq("employment_status", "Active").limit(1).maybeSingle();
        cls = { id: null, title: derivedTitle, instructor: staffRow?.full_name || "Staff", instructor_id: staffRow?.id || null, class_date: trial_date, class_time: timeWithSecs, max_capacity: 10 };
      }
    }

    if (cls?.id) {
      const { data: bookings } = await service.from("bookings").select("id").eq("class_id", cls.id).in("booking_status", ["booked", "confirmed", "checked_in", "completed"]);
      if (bookings && bookings.length >= (cls.max_capacity ?? 10)) {
        return NextResponse.json({ error: "Class is now full" }, { status: 400 });
      }
    }

    // Fulfill: create trial member and booking
    const cleanPhone = phone_number.replace(/\D/g, "");
    const emailLower = email.trim().toLowerCase();

    // Find staff for instructor (cls may already carry instructor_id for slot flow)
    let staff: any = null;
    if ((cls as any)?.instructor_id) {
      staff = { id: (cls as any).instructor_id, full_name: cls.instructor };
    } else {
      const { data } = await service.from("staff_members").select("id, full_name").ilike("full_name", cls.instructor).maybeSingle();
      staff = data;
    }

    // Branch attribution: the selected CLASS's branch is authoritative.
    // Slot flow (no class row): validated ?branch slug, else Main branch.
    // Pre-migration DBs (no locations table) resolve null and omit the column.
    let trialBranchId: string | null = (cls as any)?.location_id || null;
    if (!trialBranchId) {
      try {
        const slug = typeof body.branch === "string" ? body.branch.trim().toLowerCase() : "";
        if (slug) {
          const { data: loc } = await service.from("locations").select("id").eq("slug", slug).eq("status", "active").maybeSingle();
          if (loc) trialBranchId = loc.id;
        }
        if (!trialBranchId) {
          const { data: main } = await service.from("locations").select("id").eq("slug", "main-studio").maybeSingle();
          if (main) trialBranchId = main.id;
        }
      } catch {}
    }

    const trialInsert: Record<string, unknown> = {
      full_name: full_name.trim(),
      phone_number: cleanPhone,
      email: emailLower,
      trial_date: cls.class_date,
      trial_time: cls.class_time,
      class_id: cls.id || null,
      class_name: cls.title,
      instructor_id: staff?.id || null,
      instructor_name: cls.instructor,
      // Payment references live in razorpay_* columns — keep notes for real staff notes
      status: "Scheduled",
      source: "Website",
      interest: cls.title,
      pipeline_stage: "New",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      razorpay_order_id: razorpay_order_id,
      razorpay_payment_id: razorpay_payment_id,
      razorpay_signature: razorpay_signature,
      payment_status: "paid",
      payment_amount: payment.amount,
      ...(trialBranchId ? { location_id: trialBranchId } : {}),
    };

    let trialRes = await service.from("trial_members").insert(trialInsert).select("*").single();
    if (trialRes.error) {
      // Fallback for old DB without new columns
      if (trialRes.error.code === "PGRST204") {
        const minimal: Record<string, unknown> = {
          full_name: trialInsert.full_name,
          phone_number: trialInsert.phone_number,
          email: trialInsert.email,
          trial_date: trialInsert.trial_date,
          trial_time: trialInsert.trial_time,
          class_id: trialInsert.class_id,
          class_name: trialInsert.class_name,
          instructor_id: trialInsert.instructor_id,
          instructor_name: trialInsert.instructor_name,
          status: trialInsert.status,
          created_at: trialInsert.created_at,
          updated_at: trialInsert.updated_at,
        };
        const retry = await service.from("trial_members").insert(minimal).select("*").single();
        if (retry.error) {
          console.error("Trial insert retry error:", retry.error);
          return NextResponse.json({ error: "Failed to book trial. Please try again." }, { status: 400 });
        }
        trialRes = retry;
      } else {
        console.error("Trial insert error:", trialRes.error);
        return NextResponse.json({ error: "Failed to book trial. Please try again." }, { status: 400 });
      }
    }

    // Also create a lead record for historical purposes (optional, but spec says leads should remain)
    try {
      await service.from("leads").insert({
        full_name: full_name.trim(),
        phone_number: cleanPhone,
        email: emailLower,
        source: "Website",
        interest: cls.title,
        pipeline_stage: "Trial Booked",
        primary_location: "CorhausPilates - Main Branch",
        notes: `Trial booked via Razorpay: ${razorpay_payment_id}`,
      });
    } catch {}

    // Create booking via the existing booking logic
    // Only possible when a real classes row exists and the user is an approved member
    const { data: approvedMember } = await service.from("approved_members").select("id").ilike("email", emailLower).maybeSingle();
    if (approvedMember && cls.id) {
      // Check capacity again and create booking
      const { data: existingBooking } = await service.from("bookings").select("id").eq("class_id", cls.id).eq("member_id", approvedMember.id).maybeSingle();
      if (!existingBooking) {
        const { data: bookingData } = await service.from("bookings").insert({
          class_id: cls.id,
          member_id: approvedMember.id,
          booking_status: "booked",
          created_at: new Date().toISOString(),
        }).select("*").single();
        // If booking fails due to duplicate or capacity, it's okay - trial is still booked
      }
    }

    // Create the exact invoice for this trial payment (find-or-create: immediate + idempotent)
    const invoiceId = await ensureTrialInvoice(service, {
      trialId: trialRes.data.id,
      fullName: full_name.trim(),
      email: emailLower,
      phone: cleanPhone,
      classTitle: cls.title,
      classDate: cls.class_date,
      amountRupees: payment.amount ? Number(payment.amount) / 100 : null,
      priceBranchId: trialBranchId,
      branchId: trialBranchId,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });

    return NextResponse.json({ success: true, trialId: trialRes.data.id, invoiceId, message: "Trial booked successfully" });
  } catch (err: any) {
    console.error("verify-payment error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
