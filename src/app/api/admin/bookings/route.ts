import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    // 1. Verify the requester is an admin
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = profile?.role === "admin" || user.email === process.env.ADMIN_EMAIL;
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Use service role to bypass RLS and fetch ALL bookings
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const [bookingsRes, membersRes, profilesRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("*, classes(id, title, instructor, class_date, class_time, max_capacity, location_room, category)")
        .order("created_at", { ascending: false }),
      supabase
        .from("approved_members")
        .select("id, full_name, email, phone_number")
        .order("full_name"),
      supabase
        .from("profiles")
        .select("id, email"),
    ]);

    const bookings = bookingsRes.data || [];
    const members = membersRes.data || [];
    const profiles = profilesRes.data || [];

    // Build lookup maps
    const memberById: Record<string, any> = {};
    const memberByEmail: Record<string, any> = {};
    members.forEach((m: any) => {
      memberById[m.id] = m;
      if (m.email) memberByEmail[m.email.toLowerCase()] = m;
    });

    const profileEmailById: Record<string, string> = {};
    profiles.forEach((p: any) => {
      if (p.email) profileEmailById[p.id] = p.email.toLowerCase();
    });

    // Enrich bookings with member info using both UUID lookup paths
    const enrichedBookings = bookings.map((b: any) => {
      // Path 1: booking.member_id == approved_members.id (old bookings)
      let member = memberById[b.member_id] || null;
      // Path 2: booking.member_id == profiles.id (auth.uid) → resolve via email
      if (!member) {
        const email = profileEmailById[b.member_id];
        if (email) member = memberByEmail[email] || null;
      }
      return { ...b, approved_members: member };
    });

    return NextResponse.json({ bookings: enrichedBookings });
  } catch (err: any) {
    console.error("GET /api/admin/bookings error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
