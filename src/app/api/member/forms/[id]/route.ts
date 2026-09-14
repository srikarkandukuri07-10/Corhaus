import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const svc = getServiceClient();
    const { data: form } = await svc.from("forms").select("*").eq("id", id).single();
    if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { data: fields } = await svc.from("form_fields").select("*").eq("form_id", id).order("sort_order");
    const { data: existing } = await svc.from("form_submissions").select("*").eq("form_id", id).eq("member_id", user.id).maybeSingle();
    return NextResponse.json({ form: { ...form, fields: fields || [] }, alreadySubmitted: !!existing, submission: existing || null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
