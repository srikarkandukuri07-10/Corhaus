import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "").trim();
    if (token) {
      try {
        const supabaseAnon = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: { user } } = await supabaseAnon.auth.getUser(token);
        if (user) return user;
      } catch (e) {
        console.warn("[ADMIN BOOKINGS API] Token auth check error:", e);
      }
    }
  }

  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user) return user;
  } catch (e) {
    console.warn("[ADMIN BOOKINGS API] Cookie auth check error:", e);
  }

  return null;
}

export async function GET(req: Request) {
  try {
    // 1. Verify the requester is authenticated via Bearer token or Cookie
    const user = await getAuthenticatedUser(req);

    if (!user) {
      console.error("[ADMIN BOOKINGS] Unauthorized - No valid session found in cookie or token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1b. Verify granular permission or role
    const { getUserRolePermissions } = await import("@/lib/rbac");
    const userPerms = await getUserRolePermissions(user);
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdminByEmail = adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase();

    const isAuthorized =
      isAdminByEmail ||
      userPerms.role === "Owner" ||
      userPerms.role === "Manager" ||
      userPerms.permissions.includes("*") ||
      userPerms.permissions.includes("classes.manage") ||
      userPerms.permissions.includes("classes.view") ||
      userPerms.permissions.includes("classes.bookings") ||
      userPerms.permissions.includes("members.history");

    if (!isAuthorized) {
      console.warn("[ADMIN BOOKINGS] Unauthorized access attempt:", user.email);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Create service role client (bypasses all RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 4. Fetch ALL bookings & classes using service role (bypasses RLS entirely)
    const [bkRes, clsRes] = await Promise.all([
      supabase.from("bookings").select("*").order("created_at", { ascending: false }),
      supabase.from("classes").select("*"),
    ]);

    if (bkRes.error) {
      console.error("[ADMIN BOOKINGS] Bookings fetch error:", bkRes.error);
      return NextResponse.json({ error: bkRes.error.message }, { status: 500 });
    }

    const bookings = bkRes.data || [];
    const classes = clsRes.data || [];

    const classesById: Record<string, any> = {};
    classes.forEach((c: any) => {
      classesById[c.id] = c;
    });



    // 5. Fetch members and profiles for enrichment
    const [membersRes, profilesRes] = await Promise.all([
      supabase.from("approved_members").select("id, full_name, email, phone_number").order("full_name"),
      supabase.from("profiles").select("id, email, full_name, phone_number"),
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

    const profileById: Record<string, any> = {};
    const profileEmailById: Record<string, string> = {};
    profiles.forEach((p: any) => {
      profileById[p.id] = p;
      if (p.email) profileEmailById[p.id] = p.email.toLowerCase();
    });

    // Enrich each booking with member info
    const enrichedBookings = (bookings || []).map((b: any) => {
      // Path 1: booking.member_id == approved_members.id (admin-assigned old bookings)
      let member = memberById[b.member_id] || null;
      let prof = profileById[b.member_id] || null;

      // Path 2: booking.member_id == profiles.id (auth.uid - member self-bookings)
      if (!member) {
        const email = profileEmailById[b.member_id];
        if (email) member = memberByEmail[email] || null;
      }

      const email = prof?.email || member?.email || "";
      const fullName = (member?.full_name && member.full_name.trim() !== "" && member.full_name !== "N/A")
        ? member.full_name
        : ((prof?.full_name && prof.full_name.trim() !== "" && prof.full_name !== "N/A")
          ? prof.full_name
          : (email ? email.split("@")[0] : "Member"));

      const phoneNumber = (member?.phone_number && member.phone_number.trim() !== "" && member.phone_number !== "N/A")
        ? member.phone_number
        : ((prof?.phone_number && prof.phone_number.trim() !== "" && prof.phone_number !== "N/A")
          ? prof.phone_number
          : "N/A");

      const finalMember = {
        id: member?.id || prof?.id || b.member_id,
        full_name: fullName,
        email: email,
        phone_number: phoneNumber,
      };

      return { ...b, classes: classesById[b.class_id] || b.classes || null, approved_members: finalMember };
    });

    return NextResponse.json({ bookings: enrichedBookings, total: enrichedBookings.length });
  } catch (err: any) {
    console.error("[ADMIN BOOKINGS] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
