import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Razorpay from "razorpay";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { full_name, phone_number, email, class_id } = body;

    if (!full_name?.trim() || !phone_number?.trim() || !email?.trim() || !class_id?.trim()) {
      return NextResponse.json({ error: "Full Name, Phone, Email and Class are required" }, { status: 400 });
    }
    const cleanPhone = phone_number.replace(/\D/g, "");
    if (cleanPhone.length !== 10) return NextResponse.json({ error: "Phone must be 10 digits" }, { status: 400 });
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email.trim())) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    // Validate class exists and is eligible
    const { data: cls, error: clsErr } = await service.from("classes").select("id, title, class_date, class_time, max_capacity, is_active, status").eq("id", class_id).maybeSingle();
    if (clsErr || !cls) return NextResponse.json({ error: "Selected class not found" }, { status: 404 });
    if (cls.is_active === false || cls.status === "cancelled") return NextResponse.json({ error: "Selected class is not available" }, { status: 400 });

    // Check capacity
    const { data: bookings } = await service.from("bookings").select("id").eq("class_id", class_id).in("booking_status", ["booked", "confirmed", "checked_in", "completed"]);
    const bookedCount = bookings?.length || 0;
    const maxCap = cls.max_capacity ?? 10;
    if (bookedCount >= maxCap) return NextResponse.json({ error: "Class is full" }, { status: 400 });

    // Check duplicate booking (by email/phone)
    const emailLower = email.trim().toLowerCase();
    const { data: existing } = await service.from("trial_members").select("id").or(`email.eq.${emailLower},phone_number.eq.${cleanPhone}`).eq("class_id", class_id).maybeSingle();
    if (existing) {
      // Also check leads
      const { data: existingLead } = await service.from("leads").select("id").or(`email.eq.${emailLower},phone_number.eq.${cleanPhone}`).eq("interest", cls.title).maybeSingle();
      if (existingLead) return NextResponse.json({ error: "You have already booked this trial" }, { status: 409 });
    }

    // Determine trial fee server-side - look up Trial Session plan or use 500 INR
    let amountPaise = 50000; // default 500 INR
    const { data: trialPlan } = await service.from("billing_plan_items").select("price").ilike("name", "%Trial Session%").eq("is_active", true).maybeSingle();
    if (trialPlan && trialPlan.price) {
      amountPaise = Math.round(Number(trialPlan.price) * 100);
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return NextResponse.json({ error: "Payment not configured" }, { status: 500 });

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const receipt = `trial_${Date.now()}_${cleanPhone.slice(-4)}`;
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: { full_name: full_name.trim(), email: emailLower, phone: cleanPhone, class_id, class_title: cls.title },
    });

    // Store pending trial with order id for idempotency (optional - we can store in a separate table or just rely on verification)
    // For now, we don't create the trial yet - it will be created after verification

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
    });
  } catch (err: any) {
    console.error("create-order error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
