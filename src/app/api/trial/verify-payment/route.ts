import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import Razorpay from "razorpay";

export async function POST(req: Request) {
  try {
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
      if (existingByPayment) return NextResponse.json({ success: true, message: "Trial already booked", trialId: existingByPayment.id });
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
      return NextResponse.json({ success: true, message: "Trial already booked", trialId: recentTrial.id });
    }

    // Resolve class: existing class_id OR date+time slot (new trial slots like Morning/Evening Reformer)
    let cls: any = null;
    if (class_id) {
      const { data } = await service.from("classes").select("id, title, instructor, class_date, class_time, max_capacity").eq("id", class_id).maybeSingle();
      if (!data) return NextResponse.json({ error: "Class not found" }, { status: 404 });
      cls = data;
    } else {
      // Slot flow: find existing class for that date+time, else build a virtual one
      const timeWithSecs = (trial_date as string) && (trial_time as string).length === 5 ? `${trial_time}:00` : trial_time;
      const { data: slotClass } = await service.from("classes").select("id, title, instructor, class_date, class_time, max_capacity").eq("class_date", trial_date).eq("class_time", timeWithSecs).maybeSingle();
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
      notes: `Razorpay: ${razorpay_payment_id} / ${razorpay_order_id}`,
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
          notes: trialInsert.notes,
          status: trialInsert.status,
          created_at: trialInsert.created_at,
          updated_at: trialInsert.updated_at,
        };
        const retry = await service.from("trial_members").insert(minimal).select("*").single();
        if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 400 });
        trialRes = retry;
      } else {
        return NextResponse.json({ error: trialRes.error.message }, { status: 400 });
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

    // Create an invoice record for the trial payment (for reports)
    try {
      const { data: trialPlan } = await service.from("billing_plan_items").select("id, price").ilike("name", "%Trial Session%").eq("is_active", true).maybeSingle();
      const amount = trialPlan?.price ? Number(trialPlan.price) : 500;
      const invoiceNumber = `TRIAL-${Date.now()}-${cleanPhone.slice(-4)}`;
      // Find or create a customer
      let customerId: string | null = null;
      const { data: existingCustomer } = await service.from("customers").select("id").ilike("email", emailLower).maybeSingle();
      if (existingCustomer) customerId = existingCustomer.id;
      else {
        const { data: newCustomer } = await service.from("customers").insert({ name: full_name.trim(), email: emailLower, phone: cleanPhone }).select("id").maybeSingle();
        if (newCustomer) customerId = newCustomer.id;
      }
      if (customerId) {
        await service.from("invoices").insert({
          invoice_number: invoiceNumber,
          customer_id: customerId,
          customer_name: full_name.trim(),
          customer_email: emailLower,
          customer_phone: cleanPhone,
          subtotal: amount,
          grand_total: amount,
          amount_paid: amount,
          payment_status: "paid",
          payment_method: "Razorpay",
          transaction_reference: razorpay_payment_id,
          notes: `Trial booking for ${cls.title} on ${cls.class_date}`,
          created_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("Invoice creation failed:", e);
      // Don't fail the whole request if invoice fails
    }

    return NextResponse.json({ success: true, trialId: trialRes.data.id, message: "Trial booked successfully" });
  } catch (err: any) {
    console.error("verify-payment error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
