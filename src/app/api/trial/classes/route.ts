import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const today = new Date().toISOString().split("T")[0];

    // Fetch upcoming classes that are active and not cancelled
    const { data: classes, error } = await service
      .from("classes")
      .select("id, title, instructor, class_date, class_time, max_capacity, is_active, status")
      .gte("class_date", today)
      .eq("is_active", true)
      .neq("status", "cancelled")
      .order("class_date", { ascending: true })
      .order("class_time", { ascending: true })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Get booking counts for capacity
    const classIds = (classes || []).map((c: any) => c.id);
    let bookedMap: Record<string, number> = {};
    if (classIds.length > 0) {
      const { data: bookings } = await service
        .from("bookings")
        .select("class_id")
        .in("class_id", classIds)
        .in("booking_status", ["booked", "confirmed", "checked_in", "completed"]);
      if (bookings) {
        bookings.forEach((b: any) => { bookedMap[b.class_id] = (bookedMap[b.class_id] || 0) + 1; });
      }
    }

    const enriched = (classes || []).map((c: any) => ({
      ...c,
      booked_count: bookedMap[c.id] || 0,
    }));

    // Filter to only include classes that are not full (or show full as disabled)
    return NextResponse.json({ classes: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
