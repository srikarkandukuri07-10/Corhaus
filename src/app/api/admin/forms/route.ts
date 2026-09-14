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
  // Use service client to check staff role or is_admin
  const svc = getServiceClient();
  const { data: staff } = await svc.from("staff_members").select("role").ilike("email", user.email || "").maybeSingle();
  const isOwnerAdmin = user.email && (user.email.toLowerCase().includes("admin") || staff?.role === "Owner" || staff?.role === "Manager");
  // Fallback: check profiles role
  const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = staff?.role || profile?.role || "";
  const isAdmin = ["owner","manager","admin","developer"].includes(role.toLowerCase()) || !!isOwnerAdmin;
  if (!isAdmin) {
    return { error: "Forbidden", status: 403 };
  }
  return { user, svc };
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: (auth as any).status });
    const svc = (auth as any).svc as ReturnType<typeof getServiceClient>;

    const { data: forms, error } = await svc.from("forms").select("*").order("created_at", { ascending: true });
    if (error) throw error;

    // For each form, get field count and signed count
    const enriched = await Promise.all((forms || []).map(async (f: any) => {
      const { count: fieldCount } = await svc.from("form_fields").select("*", { count: "exact", head: true }).eq("form_id", f.id);
      const { count: signedCount } = await svc.from("form_submissions").select("*", { count: "exact", head: true }).eq("form_id", f.id);
      return { ...f, field_count: fieldCount || 0, signed_count: signedCount || 0 };
    }));

    return NextResponse.json({ forms: enriched });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: (auth as any).status });
    const svc = (auth as any).svc;
    const body = await request.json();
    const { name, description, is_active, is_required, fields } = body;

    if (!name || !name.trim()) return NextResponse.json({ error: "Form Name is required" }, { status: 400 });
    if (!Array.isArray(fields) || fields.length === 0) {
      // Allow empty but warn; still create
    }

    const { data: form, error } = await svc.from("forms").insert({
      name: name.trim(),
      description: (description || "").trim() || null,
      is_active: is_active !== undefined ? !!is_active : true,
      is_required: is_required !== undefined ? !!is_required : false,
      is_system_template: false,
      version: 1,
      created_by: (auth as any).user.id,
    }).select().single();

    if (error) throw error;

    if (Array.isArray(fields) && fields.length > 0) {
      const toInsert = fields.map((f: any, idx: number) => ({
        form_id: form.id,
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

    return NextResponse.json({ success: true, form });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
