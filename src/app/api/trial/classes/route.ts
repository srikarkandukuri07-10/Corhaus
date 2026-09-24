import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  try {
    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    // Public storefront: optional ?branch=<slug> scopes to one active branch.
    // Without it, upcoming classes across active branches are listed (class
    // schedules are public info); downstream trial/invoice records always
    // inherit the selected CLASS's branch server-side.
    let branchId: string | null = null;
    try {
      const slug = new URL(req.url).searchParams.get("branch")?.trim().toLowerCase() || "";
      if (slug) {
        const { data: loc } = await service.from("locations").select("id").eq("slug", slug).eq("status", "active").maybeSingle();
        if (loc) branchId = loc.id;
      }
    } catch {}

    const today = new Date().toISOString().split("T")[0];

    // Fetch upcoming classes that are active and not cancelled
    let query = service
      .from("classes")
      .select("id, title, instructor, class_date, class_time, max_capacity, is_active, status, location_id")
      .gte("class_date", today)
      .eq("is_active", true)
      .neq("status", "cancelled")
      .order("class_date", { ascending: true })
      .order("class_time", { ascending: true })
      .limit(50);
    if (branchId) query = query.eq("location_id", branchId);
    const { data: classes, error } = await query;

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
