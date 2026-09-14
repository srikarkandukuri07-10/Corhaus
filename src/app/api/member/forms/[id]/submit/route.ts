import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: formId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const svc = getServiceClient();
    const body = await request.json();
    const { responses, signature_data } = body;

    // Fetch form and fields
    const { data: form } = await svc.from("forms").select("*").eq("id", formId).single();
    if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });
    if (!form.is_active) return NextResponse.json({ error: "Form is inactive" }, { status: 400 });

    const { data: fields } = await svc.from("form_fields").select("*").eq("form_id", formId).order("sort_order");

    // Validate required fields
    for (const f of (fields||[])) {
      if (f.is_required) {
        const val = responses?.[f.id];
        if (f.field_type === "checkbox") {
          if (!val) return NextResponse.json({ error: `Please acknowledge: ${f.label}` }, { status: 400 });
        } else if (f.field_type === "signature") {
          if (!signature_data) return NextResponse.json({ error: "Please provide your signature" }, { status: 400 });
        } else if (f.field_type === "info_text") {
          continue;
        } else {
          if (val === undefined || val === null || String(val).trim() === "") {
            return NextResponse.json({ error: `Please complete: ${f.label}` }, { status: 400 });
          }
        }
      }
    }

    // Check duplicate (unique constraint handles, but check first for friendly error)
    const { data: existing } = await svc.from("form_submissions").select("id").eq("form_id", formId).eq("member_id", user.id).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "You have already submitted this form." }, { status: 409 });
    }

    // Build snapshot of form at time of signing
    const snapshot = { form: { id: form.id, name: form.name, description: form.description, version: form.version }, fields };

    // Fetch member info for snapshot
    const email = user.email || "";
    const name = user.user_metadata?.full_name || email.split("@")[0] || "Member";

    const { data: inserted, error } = await svc.from("form_submissions").insert({
      form_id: formId,
      form_version: form.version,
      form_snapshot: snapshot,
      member_id: user.id,
      member_email: email.toLowerCase(),
      member_name: name,
      responses: responses || {},
      signature_data: signature_data || null,
      signed_at: new Date().toISOString(),
    }).select().single();

    if (error) {
      // Handle unique violation as duplicate
      if (error.code === "23505") {
        return NextResponse.json({ error: "You have already submitted this form." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, submission: inserted });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
