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

    // Query bookings with joined classes
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
          class_time,
          category
        )
      `)
      .eq("member_id", memberId)
      .order("created_at", { ascending: false });

    // Query attendance records for QR scan verification
    const { data: attendanceData } = await client
      .from("attendance")
      .select("booking_id, attendance_status, scanned_at")
      .eq("member_id", memberId);

    const attendanceMap = new Map<string, any>();
    (attendanceData || []).forEach((a: any) => {
      if (a.booking_id) attendanceMap.set(a.booking_id, a);
    });

    // Format history records strictly according to specification:
    // Columns: Date, Check-in Time, Class Name, Instructor, Attendance Status ('Attended' | 'No Show')
    const history = (bookingsData || []).map((b: any) => {
      const cls = b.classes || {};
      const attRecord = attendanceMap.get(b.id);
      
      // Determine Attendance Status:
      // - If QR code was scanned OR status is checked_in / present / completed -> Attended
      // - If newly booked or not yet checked in / no show -> No Show
      let status: "Attended" | "No Show" = "No Show";
      if (
        b.booking_status === "checked_in" ||
        b.booking_status === "completed" ||
        b.attendance_status === "present" ||
        b.attendance_status === "attended" ||
        Boolean(b.checked_in_at) ||
        (attRecord && attRecord.attendance_status === "attended")
      ) {
        status = "Attended";
      } else {
        status = "No Show";
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
