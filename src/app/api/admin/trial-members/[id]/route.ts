import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin" || user.email === process.env.ADMIN_EMAIL;
  if (!isAdmin) return { error: "Forbidden", status: 403 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (serviceKey) {
    const serviceClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return { client: serviceClient, user };
  }

  return { client: supabase, user };
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Missing trial member ID" }, { status: 400 });
    }

    const body = await req.json();
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.full_name !== undefined) updatePayload.full_name = body.full_name;
    if (body.phone_number !== undefined) updatePayload.phone_number = body.phone_number;
    if (body.email !== undefined) updatePayload.email = body.email;
    if (body.trial_date !== undefined) updatePayload.trial_date = body.trial_date;
    if (body.trial_time !== undefined) updatePayload.trial_time = body.trial_time;
    if (body.class_id !== undefined) updatePayload.class_id = body.class_id;
    if (body.class_name !== undefined) updatePayload.class_name = body.class_name;
    if (body.instructor_id !== undefined) updatePayload.instructor_id = body.instructor_id;
    if (body.instructor_name !== undefined) updatePayload.instructor_name = body.instructor_name;
    if (body.status !== undefined) {
      const allowedStatuses = ["Scheduled", "Attended", "No Show", "Converted"];
      if (!allowedStatuses.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
      }
      updatePayload.status = body.status;
    }
    if (body.notes !== undefined) updatePayload.notes = body.notes;

    const { data, error } = await client
      .from("trial_members")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;
    const { id } = await params;

    const { error } = await client.from("trial_members").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
