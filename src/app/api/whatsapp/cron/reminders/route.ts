/* eslint-disable @typescript-eslint/no-explicit-any */
// WhatsApp Class Reminders Cron Endpoint
//
// Finds bookings whose class starts within the configurable window (default 2 hours)
// and have not yet received a reminder (reminder_sent_at IS NULL).
// Protected by Authorization: Bearer CRON_SECRET.
// Callable by Vercel Cron or any external cron runner (e.g. cron-job.org, GitHub Actions).

import { NextResponse } from "next/server";
import { getServiceClient, sendTemplate } from "@/lib/whatsapp/service";
import { parseClassTimeAsIst } from "@/lib/date-utils";
import { formatIstDate, formatIstTime } from "@/lib/whatsapp/templates";
import { normalizeIndianPhone } from "@/lib/whatsapp/phone";

export async function GET(req: Request) {
  // 1. Verify Authorization Bearer token
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Resolve reminder window (default 2 hours, or configurable via query param)
  const { searchParams } = new URL(req.url);
  const hoursParam = searchParams.get("hours") || process.env.WHATSAPP_REMINDER_WINDOW_HOURS || "2";
  const windowHours = Math.max(0.5, Math.min(24, parseFloat(hoursParam) || 2));
  const windowMs = windowHours * 60 * 60 * 1000;

  const now = Date.now();
  const windowEnd = now + windowMs;

  const supabase: any = getServiceClient();

  try {
    // 3. Query candidate bookings that have not been reminded
    const { data: bookings, error: bkErr } = await supabase
      .from("bookings")
      .select(`
        id,
        booking_status,
        member_id,
        class_id,
        location_id,
        reminder_sent_at,
        classes (
          id,
          title,
          instructor,
          class_date,
          class_time,
          status,
          is_active,
          location_id
        ),
        approved_members (
          id,
          full_name,
          phone_number,
          membership_status
        )
      `)
      .is("reminder_sent_at", null)
      .in("booking_status", ["booked", "confirmed"]);

    if (bkErr) {
      console.error("[whatsapp:reminders] Error querying bookings:", bkErr);
      return NextResponse.json({ error: bkErr.message }, { status: 500 });
    }

    let checked = 0;
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const b of (bookings || []) as any[]) {
      checked++;
      const cls = Array.isArray(b.classes) ? b.classes[0] : b.classes;
      if (!cls) {
        skippedCount++;
        continue;
      }

      // Check class status
      if (cls.status === "cancelled" || cls.is_active === false) {
        skippedCount++;
        continue;
      }

      // Calculate class start epoch in Asia/Kolkata
      const classStartMs = parseClassTimeAsIst(cls.class_date, cls.class_time);
      if (!classStartMs) {
        skippedCount++;
        continue;
      }

      // Only remind classes starting in the upcoming window [now, now + windowMs]
      if (classStartMs < now || classStartMs > windowEnd) {
        skippedCount++;
        continue;
      }

      // Member resolution: check joined approved_members or fallback
      let member = Array.isArray(b.approved_members) ? b.approved_members[0] : b.approved_members;
      if (!member && b.member_id) {
        const { data: fallbackMember } = await supabase
          .from("approved_members")
          .select("id, full_name, phone_number, membership_status")
          .eq("id", b.member_id)
          .maybeSingle();
        member = fallbackMember;
      }

      if (!member || (member.membership_status && member.membership_status.toLowerCase() !== "active")) {
        skippedCount++;
        continue;
      }

      const phoneNorm = normalizeIndianPhone(member.phone_number);
      if (!phoneNorm.ok) {
        skippedCount++;
        continue;
      }

      // Resolve location name
      let locationName = "Corhaus Pilates";
      const locId = b.location_id || cls.location_id;
      if (locId) {
        const { data: loc } = await supabase
          .from("locations")
          .select("name")
          .eq("id", locId)
          .maybeSingle();
        if (loc?.name) locationName = loc.name;
      }

      // Format parameters in Asia/Kolkata
      const formattedDate = formatIstDate(cls.class_date);
      const formattedTime = formatIstTime(cls.class_time);

      const params: Record<string, string> = {
        member_name: member.full_name || "Member",
        class_name: cls.title || "Pilates Class",
        class_date: formattedDate,
        class_time: formattedTime,
        trainer_name: cls.instructor || "Trainer",
        location_name: locationName,
      };

      // Mark reminder_sent_at FIRST so concurrent calls don't double-send
      const sentTimestamp = new Date().toISOString();
      const { error: markErr } = await supabase
        .from("bookings")
        .update({ reminder_sent_at: sentTimestamp })
        .eq("id", b.id)
        .is("reminder_sent_at", null);

      if (markErr) {
        console.error(`[whatsapp:reminders] Failed to claim reminder for booking ${b.id}:`, markErr);
        continue;
      }

      // Send the template message
      const sendRes = await sendTemplate("class_reminder", phoneNorm.digits, params, undefined, supabase);

      if (sendRes.success) {
        sentCount++;
      } else {
        failedCount++;
        console.warn(`[whatsapp:reminders] Failed to send reminder to ${phoneNorm.digits}:`, sendRes.errorMessage);
      }
    }

    return NextResponse.json({
      success: true,
      windowHours,
      checked,
      sent: sentCount,
      skipped: skippedCount,
      failed: failedCount,
    });
  } catch (err: any) {
    console.error("[whatsapp:reminders] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
