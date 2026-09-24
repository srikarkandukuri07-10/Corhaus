import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { parseClassTimeAsIst } from "@/lib/date-utils";
import { isAdminEmail } from "@/lib/constants";

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
        console.warn("[MANUAL ATTENDANCE API] Token auth check error:", e);
      }
    }
  }

  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user) return user;
  } catch (e) {
    console.warn("[MANUAL ATTENDANCE API] Cookie auth check error:", e);
  }

  return null;
}

export async function POST(req: Request) {
  try {
    // 1. Verify user authentication
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Enforce server-side authorization
    const { getUserRolePermissions } = await import("@/lib/rbac");
    const userPerms = await getUserRolePermissions(user);
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdminByEmail = adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase();

    const isAuthorized =
      isAdminByEmail ||
      isAdminEmail(user.email) ||
      userPerms.role === "Owner" ||
      userPerms.role === "Manager" ||
      userPerms.permissions.includes("*") ||
      userPerms.permissions.includes("attendance.manual") ||
      userPerms.permissions.includes("attendance.scan") ||
      userPerms.permissions.includes("classes.bookings") ||
      userPerms.permissions.includes("classes.manage");

    if (!isAuthorized) {
      console.warn("[MANUAL ATTENDANCE] Forbidden attempt by:", user.email);
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
    }

    // 3. Validate request payload
    const body = await req.json().catch(() => ({}));
    const { bookingId, classId } = body;

    if (!bookingId || !classId) {
      return NextResponse.json({ error: "Missing required bookingId or classId" }, { status: 400 });
    }

    // 3b. Branch isolation: verified active location (never trust client input).
    const { getLocationAccess, resolveActiveLocation, locationDenied } = await import("@/lib/location");
    const locAccess = await getLocationAccess(user);
    const locationId = resolveActiveLocation(locAccess, req);
    if (!locationId) return locationDenied("No accessible location found for this account.");

    // 4. Create service role client for authoritative database operations
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 5. Fetch booking and verify existence and integrity
    const { data: booking, error: bkErr } = await service
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();

    if (bkErr || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.class_id !== classId) {
      return NextResponse.json({ error: "Booking does not belong to the selected class session" }, { status: 400 });
    }

    if ((booking as any).location_id && (booking as any).location_id !== locationId) {
      return locationDenied("This booking belongs to another location.");
    }

    if (booking.booking_status === "cancelled") {
      return NextResponse.json({ error: "Cancelled bookings cannot be marked as attended" }, { status: 400 });
    }

    // 6. Fetch class session and verify timing + branch
    const { data: cls, error: clsErr } = await service
      .from("classes")
      .select("id, title, class_date, class_time, location_id")
      .eq("id", classId)
      .maybeSingle();

    if (clsErr || !cls) {
      return NextResponse.json({ error: "Class session not found" }, { status: 404 });
    }

    if (cls.location_id !== locationId) {
      return locationDenied("This class belongs to another location.");
    }

    // Strictly verify class start time in IST
    const classStartMs = parseClassTimeAsIst(cls.class_date, cls.class_time);
    if (!classStartMs || Date.now() < classStartMs) {
      return NextResponse.json(
        { error: "Class has not started yet. Manual attendance is only permitted at or after class start time." },
        { status: 400 }
      );
    }

    // 7. Idempotency & Duplicate Protection:
    // Check if attendance is already recorded for this booking
    const { data: existingAtt } = await service
      .from("attendance")
      .select("id, attendance_status")
      .eq("booking_id", booking.id)
      .eq("attendance_status", "attended")
      .maybeSingle();

    const isAlreadyAttended =
      Boolean(existingAtt) ||
      booking.booking_status === "checked_in" ||
      booking.booking_status === "attended" ||
      booking.attendance_status === "present";

    const nowIso = new Date().toISOString();

    if (isAlreadyAttended) {
      // Ensure bookings table is consistently synced even if already recorded
      await service
        .from("bookings")
        .update({
          booking_status: "checked_in",
          attendance_status: "present",
          checked_in_at: booking.checked_in_at || nowIso,
        })
        .eq("id", booking.id);

      return NextResponse.json({
        success: true,
        message: "Attendance has already been recorded for this member",
        alreadyAttended: true,
        bookingId: booking.id,
      });
    }

    // 8. Resolve member_id for the attendance audit log (which references auth.users(id))
    let attendanceMemberId = booking.member_id;
    const { data: prof } = await service
      .from("profiles")
      .select("id")
      .eq("id", booking.member_id)
      .maybeSingle();

    if (!prof) {
      // If booking.member_id is approved_members.id, find matching profile by email
      const { data: am } = await service
        .from("approved_members")
        .select("email")
        .eq("id", booking.member_id)
        .maybeSingle();

      if (am?.email) {
        const { data: pByEmail } = await service
          .from("profiles")
          .select("id")
          .ilike("email", am.email.trim())
          .maybeSingle();

        if (pByEmail?.id) {
          attendanceMemberId = pByEmail.id;
        }
      }
    }

    // 9. Record attendance in public.attendance table
    const attendanceToken = `manual_${booking.id}_${Date.now()}`;
    const { error: insertError } = await service.from("attendance").insert({
      booking_id: booking.id,
      class_id: cls.id,
      member_id: attendanceMemberId,
      attendance_token: attendanceToken,
      attendance_status: "attended",
      scanned_at: nowIso,
      location_id: locationId,
    });

    if (insertError && insertError.code !== "23505") {
      console.warn("[MANUAL ATTENDANCE] Attendance table insert warning:", insertError.message);
    }

    // 10. Update booking status to checked_in / present
    const { error: bkUpdateErr } = await service
      .from("bookings")
      .update({
        booking_status: "checked_in",
        attendance_status: "present",
        checked_in_at: nowIso,
      })
      .eq("id", booking.id);

    if (bkUpdateErr) {
      console.error("[MANUAL ATTENDANCE] Booking update error:", bkUpdateErr);
      return NextResponse.json({ error: "Failed to update booking status" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Attendance marked successfully",
      bookingId: booking.id,
      checkedInAt: nowIso,
    });
  } catch (err: any) {
    console.error("[MANUAL ATTENDANCE] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
