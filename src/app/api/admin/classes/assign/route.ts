import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin" || user.email === process.env.ADMIN_EMAIL;
  if (!isAdmin) return { error: "Forbidden", status: 403 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { serviceClient, user };
}

export async function POST(req: Request) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("classes.bookings");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    const body = await req.json();
    // memberId here is the approved_members.id sent from the admin UI dropdown
    const { memberId: approvedMemberId, classId } = body;

    if (!approvedMemberId || !classId) {
      return NextResponse.json({ error: "memberId and classId are required." }, { status: 400 });
    }

    // 1. Look up the approved_member record (get email for profile lookup)
    const { data: amRecord, error: amErr } = await serviceClient
      .from("approved_members")
      .select("id, email, full_name")
      .eq("id", approvedMemberId)
      .maybeSingle();

    if (amErr || !amRecord) {
      return NextResponse.json({ error: `Approved member not found: ${amErr?.message || ""}` }, { status: 404 });
    }

    // 2. Resolve the auth UUID (profiles.id = auth.uid) via email match.
    //    This is needed because bookings.member_id FK → profiles(id) = auth.uid().
    let authMemberId: string = approvedMemberId; // fallback if no profile found
    if (amRecord.email) {
      const { data: profileRecord } = await serviceClient
        .from("profiles")
        .select("id")
        .eq("email", amRecord.email)
        .maybeSingle();

      if (profileRecord?.id) {
        authMemberId = profileRecord.id;
      }
    }

    // 3. Check if booking already exists (check both UUIDs to be safe)
    const { data: existingBooking } = await serviceClient
      .from("bookings")
      .select("id, booking_status")
      .eq("class_id", classId)
      .or(`member_id.eq.${authMemberId},member_id.eq.${approvedMemberId}`)
      .maybeSingle();

    if (existingBooking) {
      if (existingBooking.booking_status === "booked" || existingBooking.booking_status === "confirmed") {
        return NextResponse.json({ success: true, message: "Member is already assigned to this class." });
      }

      let updatePayload: any = {
        booking_status: "booked",
        notes: "Corhaus invite u to this session",
        cancelled_at: null,
      };

      let { error: updateError } = await serviceClient
        .from("bookings")
        .update(updatePayload)
        .eq("id", existingBooking.id);

      if (updateError && (updateError.message?.includes("notes") || updateError.message?.includes("Could not find"))) {
        delete updatePayload.notes;
        const res = await serviceClient
          .from("bookings")
          .update(updatePayload)
          .eq("id", existingBooking.id);
        updateError = res.error;
      }

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "Member assigned successfully!" });
    }

    // 4. Insert new booking using the auth UUID as member_id (satisfies FK constraint)
    let insertPayload: any = {
      member_id: authMemberId,  // auth.uid() → satisfies bookings_member_id_fkey → profiles(id)
      class_id: classId,
      booking_status: "booked",
      notes: "Corhaus invite u to this session",
    };

    let { error: insertError } = await serviceClient
      .from("bookings")
      .insert(insertPayload);

    if (insertError && (insertError.message?.includes("notes") || insertError.message?.includes("Could not find"))) {
      delete insertPayload.notes;
      const res = await serviceClient
        .from("bookings")
        .insert(insertPayload);
      insertError = res.error;
    }

    // 5. If still failing, it might be because profiles table is missing this user.
    //    Fallback: try with approved_members.id (for DBs where FK was changed to approved_members).
    if (insertError && insertError.message?.includes("foreign key")) {
      console.warn("[ASSIGN] Auth UUID failed FK, falling back to approved_members.id:", approvedMemberId);
      insertPayload.member_id = approvedMemberId;
      const res = await serviceClient
        .from("bookings")
        .insert(insertPayload);
      insertError = res.error;
    }

    if (insertError) {
      console.error("[ASSIGN] Insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Member assigned successfully!" });
  } catch (err: any) {
    console.error("POST /api/admin/classes/assign error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
