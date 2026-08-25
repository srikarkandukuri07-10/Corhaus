import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { formatTime } from "@/lib/date-utils";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const { getUserRolePermissions } = await import("@/lib/rbac");
  const userPerms = await getUserRolePermissions(user);
  if (userPerms.role === "Member" || userPerms.role === "Guest") {
    return { error: "Forbidden", status: 403 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { client: serviceClient, serviceClient, user, profile };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("members.history");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;
    const { id: memberId } = await params;

    if (!memberId) {
      return NextResponse.json({ error: "Missing member ID" }, { status: 400 });
    }

    // Query member details
    const { data: member, error: memberErr } = await client
      .from("approved_members")
      .select("id, full_name, email, phone_number")
      .eq("id", memberId)
      .single();

    if (memberErr || !member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Resolve dual-identity memberIds and emails: bookings may be stored under
    // approved_members.id OR auth uid (profiles.id) OR member email/phone.
    const memberIds: string[] = [memberId];
    const memberEmails: string[] = member.email ? [member.email.toLowerCase().trim()] : [];

    if (member.email) {
      try {
        const { data: profileRows } = await client
          .from("profiles")
          .select("id, email")
          .ilike("email", member.email.trim());

        (profileRows || []).forEach((p: any) => {
          if (p.id && !memberIds.includes(p.id)) memberIds.push(p.id);
          if (p.email && !memberEmails.includes(p.email.toLowerCase())) memberEmails.push(p.email.toLowerCase());
        });
      } catch (e) {
        console.warn("[MEMBER HISTORY] Profile email lookup failed:", e);
      }
    }

    if (member.phone_number) {
      try {
        const cleanPhone = member.phone_number.replace(/\D/g, "");
        if (cleanPhone) {
          const { data: phoneProfiles } = await client
            .from("profiles")
            .select("id, email, phone_number");

          (phoneProfiles || []).forEach((p: any) => {
            if (p.phone_number && p.phone_number.replace(/\D/g, "").includes(cleanPhone)) {
              if (p.id && !memberIds.includes(p.id)) memberIds.push(p.id);
              if (p.email && !memberEmails.includes(p.email.toLowerCase())) memberEmails.push(p.email.toLowerCase());
            }
          });
        }
      } catch (e) {
        console.warn("[MEMBER HISTORY] Profile phone lookup failed:", e);
      }
    }

    // Query bookings with joined classes for ALL linked member ids
    const { data: bookingsData, error: bookingsErr } = await client
      .from("bookings")
      .select(`
        id,
        booking_status,
        attendance_status,
        checked_in_at,
        created_at,
        classes (
          id,
          title,
          instructor,
          class_date,
          class_time
        )
      `)
      .in("member_id", memberIds)
      .order("created_at", { ascending: false });

    if (bookingsErr) {
      console.error("[MEMBER HISTORY] Bookings fetch error:", bookingsErr);
    }

    // Query attendance records for QR scan verification (attendance.member_id is auth uid)
    const { data: attendanceData } = await client
      .from("attendance")
      .select("booking_id, attendance_status, scanned_at")
      .in("member_id", memberIds);

    const attendanceMap = new Map<string, any>();
    (attendanceData || []).forEach((a: any) => {
      if (a.booking_id) attendanceMap.set(a.booking_id, a);
    });

    // Format history records: Date, Check-in Time, Class Name, Instructor, Attendance Status ('Attended' | 'No Show' | 'Cancelled' | 'Booked')
    // Uses existing bookings + attendance data only (no dummy data)
    const history = (bookingsData || []).map((b: any) => {
      const cls = b.classes || {};
      const attRecord = attendanceMap.get(b.id);

      // Determine Attendance Status from existing data:
      // - cancelled booking_status => Cancelled (takes precedence)
      // - QR scanned / checked_in / present / completed => Attended
      // - past class without check-in => No Show
      // - future class without check-in => Booked
      let status: "Attended" | "No Show" | "Cancelled" | "Booked" = "No Show";
      if (b.booking_status === "cancelled") {
        status = "Cancelled";
      } else if (
        b.booking_status === "checked_in" ||
        b.booking_status === "completed" ||
        b.attendance_status === "present" ||
        b.attendance_status === "attended" ||
        Boolean(b.checked_in_at) ||
        (attRecord && attRecord.attendance_status === "attended")
      ) {
        status = "Attended";
      } else {
        let isPastClass = true;
        if (cls.class_date && cls.class_time) {
          const iso = `${cls.class_date}T${cls.class_time}`;
          const classStart = new Date(iso).getTime();
          if (Date.now() < classStart) {
            isPastClass = false;
          }
        }
        status = isPastClass ? "No Show" : "Booked";
      }

      // Format time (shows scanned time if attended, otherwise class time)
      const scannedTimestamp = b.checked_in_at || (attRecord && attRecord.scanned_at);
      let checkInTime = "N/A";
      if (scannedTimestamp) {
        checkInTime = formatTime(scannedTimestamp);
      } else if (cls.class_time) {
        checkInTime = formatTime(cls.class_time);
      }

      return {
        id: b.id,
        date: cls.class_date || b.created_at?.split("T")[0],
        time: checkInTime,
        className: cls.title || "Class Session",
        instructor: cls.instructor || "Staff Instructor",
        status: status,
        rawBookingStatus: b.booking_status,
        rawAttendanceStatus: b.attendance_status,
        checkedInAt: b.checked_in_at,
      };
    });

    return NextResponse.json({
      member,
      history,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
