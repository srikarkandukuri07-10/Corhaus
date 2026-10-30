import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToRole } from "@/lib/push/service";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = getServiceClient();

    // Calculate tomorrow's date in IST
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const tomorrow = new Date(istNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateStr = tomorrow.toISOString().split("T")[0];

    // Check if tomorrow is marked as a studio holiday
    const { data: holiday } = await supabase
      .from("studio_holidays")
      .select("id, title")
      .eq("is_active", true)
      .lte("start_date", tomorrowDateStr)
      .gte("end_date", tomorrowDateStr)
      .maybeSingle();

    if (holiday) {
      // Tomorrow is a planned studio holiday, so no alert needed
      return NextResponse.json({
        hasClasses: false,
        isHoliday: true,
        message: `Tomorrow is marked as studio holiday: ${holiday.title}`,
      });
    }

    // Check count of scheduled classes for tomorrow
    const { count, error } = await supabase
      .from("classes")
      .select("id", { count: "exact", head: true })
      .eq("class_date", tomorrowDateStr)
      .neq("status", "Cancelled");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const classCount = count || 0;

    if (classCount === 0) {
      // Send push notification to Admins
      await sendPushToRole("admin", {
        title: "⚠️ No Classes Scheduled Tomorrow!",
        body: `Tomorrow (${tomorrowDateStr}) has 0 classes scheduled. Please set up or generate the schedule.`,
        url: "/admin/classes/new",
        tag: `no-class-${tomorrowDateStr}`,
      });

      return NextResponse.json({
        hasClasses: false,
        tomorrowDate: tomorrowDateStr,
        notified: true,
      });
    }

    return NextResponse.json({
      hasClasses: true,
      tomorrowDate: tomorrowDateStr,
      classCount,
    });
  } catch (err: any) {
    console.error("[CHECK TOMORROW CLASSES] Error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
