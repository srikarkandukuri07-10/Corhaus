import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    // 1. Verify the requester is authenticated
    const supabaseServer = await createServerClient();
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser();

    if (authError || !user) {
      console.error("[ADMIN BOOKINGS] Auth error:", authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Create service role client (bypasses all RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 3. Verify admin — check by email first (most reliable), then profile role
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdminByEmail = adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase();

    let isAdmin = isAdminByEmail;
    if (!isAdmin) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      isAdmin = profile?.role === "admin";
    }

    if (!isAdmin) {
      console.warn("[ADMIN BOOKINGS] Non-admin access attempt:", user.email);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4. Fetch ALL bookings using service role (bypasses RLS entirely)
    const { data: bookings, error: bkError } = await supabase
      .from("bookings")
      .select("*, classes(id, title, instructor, class_date, class_time, max_capacity, location_room, category)")
      .order("created_at", { ascending: false });

    if (bkError) {
      console.error("[ADMIN BOOKINGS] Bookings fetch error:", bkError);
      return NextResponse.json({ error: bkError.message }, { status: 500 });
    }

    console.log("[ADMIN BOOKINGS] Total bookings fetched:", bookings?.length ?? 0);

    // 5. Fetch members and profiles for enrichment
    const [membersRes, profilesRes] = await Promise.all([
      supabase.from("approved_members").select("id, full_name, email, phone_number").order("full_name"),
      supabase.from("profiles").select("id, email"),
    ]);

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

    // Enrich each booking with member info
    const enrichedBookings = (bookings || []).map((b: any) => {
      // Path 1: booking.member_id == approved_members.id (admin-assigned old bookings)
      let member = memberById[b.member_id] || null;
      // Path 2: booking.member_id == profiles.id (auth.uid - member self-bookings)
      if (!member) {
        const email = profileEmailById[b.member_id];
        if (email) member = memberByEmail[email] || null;
      }
      return { ...b, approved_members: member };
    });

    return NextResponse.json({ bookings: enrichedBookings, total: enrichedBookings.length });
  } catch (err: any) {
    console.error("[ADMIN BOOKINGS] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
