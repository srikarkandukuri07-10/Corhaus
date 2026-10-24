/* eslint-disable @typescript-eslint/no-explicit-any */
// WhatsApp Event Hooks
//
// Triggered on key business events: booking confirmation and payment receipt.
// Calls the server WhatsApp service non-blocking. Errors are swallowed and logged
// so bookings and payments always succeed even if WhatsApp fails.

import { getServiceClient, sendTemplate } from "./service";
import { normalizeIndianPhone } from "./phone";
import { formatIstDate, formatIstTime } from "./templates";

/**
 * Hook: Called when a class booking is confirmed.
 * Non-blocking, never throws.
 */
export async function handleBookingConfirmed(bookingId: string): Promise<void> {
  try {
    const supabase: any = getServiceClient();

    // Query booking details
    const { data: booking, error: bkErr } = await supabase
      .from("bookings")
      .select(`
        id,
        member_id,
        class_id,
        location_id,
        classes (
          id,
          title,
          instructor,
          class_date,
          class_time,
          location_id
        ),
        approved_members (
          id,
          full_name,
          phone_number,
          membership_status
        )
      `)
      .eq("id", bookingId)
      .maybeSingle();

    if (bkErr || !booking) {
      console.warn("[whatsapp:events] Booking not found for confirmation:", bookingId, bkErr);
      return;
    }

    const bk = booking as any;
    const cls = Array.isArray(bk.classes) ? bk.classes[0] : bk.classes;
    let member = Array.isArray(bk.approved_members)
      ? bk.approved_members[0]
      : bk.approved_members;

    // Fallback member lookup if not joined
    if (!member && bk.member_id) {
      const { data: m } = await supabase
        .from("approved_members")
        .select("id, full_name, phone_number, membership_status")
        .eq("id", bk.member_id)
        .maybeSingle();
      member = m;
    }

    if (!member?.phone_number) {
      return;
    }

    const normPhone = normalizeIndianPhone(member.phone_number);
    if (!normPhone.ok) {
      return;
    }

    // Resolve location name
    let locationName = "Corhaus Pilates";
    const locId = bk.location_id || cls?.location_id;
    if (locId) {
      const { data: loc } = await supabase
        .from("locations")
        .select("name")
        .eq("id", locId)
        .maybeSingle();
      if (loc?.name) locationName = loc.name;
    }

    const classDateFormatted = cls?.class_date ? formatIstDate(cls.class_date) : "";
    const classTimeFormatted = cls?.class_time ? formatIstTime(cls.class_time) : "";

    const params: Record<string, string> = {
      member_name: member.full_name || "Member",
      class_name: cls?.title || "Pilates Class",
      class_date: classDateFormatted,
      class_time: classTimeFormatted,
      trainer_name: cls?.instructor || "Trainer",
      location_name: locationName,
      booking_id: bk.id,
    };

    // Send template (or dry-run). Catches <FILL_IN> placeholders safely without throwing.
    await sendTemplate("booking_confirmed", normPhone.digits, params, undefined, supabase);
  } catch (err) {
    console.error("[whatsapp:events] handleBookingConfirmed error:", err);
  }
}

/**
 * Hook: Called when a payment is recorded.
 * Non-blocking, never throws.
 */
export async function handlePaymentReceipt(args: {
  invoiceId?: string;
  invoiceNumber?: string;
  customerPhone?: string;
  customerName?: string;
  amountRupees?: number;
  classTitle?: string;
  classDate?: string;
  classTime?: string;
  trainerName?: string;
  locationName?: string;
}): Promise<void> {
  try {
    const supabase: any = getServiceClient();

    let phone = args.customerPhone;
    let name = args.customerName || "Member";
    let amountStr = args.amountRupees != null ? String(args.amountRupees) : "";
    let invNum = args.invoiceNumber || "";
    let locationName = args.locationName || "Corhaus Pilates";
    const classTitle = args.classTitle || "Pilates Class";
    const classDate = args.classDate || "";
    const classTime = args.classTime || "";
    const trainerName = args.trainerName || "Trainer";

    // If invoiceId is provided, pull missing fields from database
    if (args.invoiceId) {
      const { data: invoice } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          customer_name,
          customer_phone,
          amount_paid,
          grand_total,
          location_id,
          locations (name)
        `)
        .eq("id", args.invoiceId)
        .maybeSingle();

      if (invoice) {
        const inv = invoice as any;
        if (!phone) phone = inv.customer_phone;
        if (!name || name === "Member") name = inv.customer_name || name;
        if (!amountStr) amountStr = String(inv.amount_paid || inv.grand_total || "");
        if (!invNum) invNum = inv.invoice_number || "";
        const loc = Array.isArray(inv.locations) ? inv.locations[0] : inv.locations;
        if (loc?.name) locationName = loc.name;
      }
    }

    if (!phone) {
      return;
    }

    const normPhone = normalizeIndianPhone(phone);
    if (!normPhone.ok) {
      return;
    }

    const params: Record<string, string> = {
      member_name: name,
      invoice_number: invNum,
      amount: amountStr,
      class_name: classTitle,
      class_date: classDate,
      class_time: classTime,
      trainer_name: trainerName,
      location_name: locationName,
    };

    // Send template (or dry-run). Catches <FILL_IN> placeholders safely without throwing.
    await sendTemplate("payment_receipt", normPhone.digits, params, undefined, supabase);
  } catch (err) {
    console.error("[whatsapp:events] handlePaymentReceipt error:", err);
  }
}
