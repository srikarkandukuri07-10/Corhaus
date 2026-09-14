import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };
  return { user, svc: getServiceClient() };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requireAdmin();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: (auth as any).status });
    const svc = (auth as any).svc;
    const { data: form } = await svc.from("forms").select("*").eq("id", id).single();
    if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { data: fields } = await svc.from("form_fields").select("*").eq("form_id", id).order("sort_order");
    const { count: signed } = await svc.from("form_submissions").select("*", { count: "exact", head: true }).eq("form_id", id);
    return NextResponse.json({ form: { ...form, fields: fields || [], signed_count: signed || 0 } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requireAdmin();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: (auth as any).status });
    const svc = (auth as any).svc;
    const body = await request.json();
    const { name, description, is_active, is_required, fields } = body;
    if (!name || !name.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

    // Fetch current form to check version
    const { data: current } = await svc.from("forms").select("*").eq("id", id).single();
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Check if fields changed: if yes, bump version and keep old submissions (they store version + snapshot)
    const { data: existingFields } = await svc.from("form_fields").select("*").eq("form_id", id);
    const fieldsChanged = JSON.stringify((existingFields||[]).map((f:any)=>({t:f.field_type,l:f.label,r:f.is_required})) ) !== JSON.stringify((fields||[]).map((f:any)=>({t:f.field_type,l:f.label,r:f.is_required})));

    const newVersion = fieldsChanged ? (current.version || 1) + 1 : current.version;

    const { data: updated, error } = await svc.from("forms").update({
      name: name.trim(),
      description: (description||"").trim() || null,
      is_active: is_active !== undefined ? !!is_active : current.is_active,
      is_required: is_required !== undefined ? !!is_required : current.is_required,
      version: newVersion,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) throw error;

    if (Array.isArray(fields)) {
      // Replace fields
      await svc.from("form_fields").delete().eq("form_id", id);
      if (fields.length > 0) {
        const toInsert = fields.map((f: any, idx: number) => ({
          form_id: id,
          field_type: f.field_type,
          label: f.label || "Untitled",
          placeholder: f.placeholder || null,
          description: f.description || null,
          help_text: f.help_text || null,
          is_required: !!f.is_required,
          options: f.options || null,
          sort_order: f.sort_order ?? idx,
        }));
        const { error: fe } = await svc.from("form_fields").insert(toInsert);
        if (fe) throw fe;
      }
    }

    return NextResponse.json({ success: true, form: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requireAdmin();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: (auth as any).status });
    const svc = (auth as any).svc;
    const body = await request.json();
    const updates: any = {};
    if (body.is_active !== undefined) updates.is_active = !!body.is_active;
    if (body.is_required !== undefined) updates.is_required = !!body.is_required;
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No updates" }, { status: 400 });
    updates.updated_at = new Date().toISOString();
    const { data, error } = await svc.from("forms").update(updates).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, form: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
