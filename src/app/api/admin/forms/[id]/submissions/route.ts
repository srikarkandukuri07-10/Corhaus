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
    // Admin check
    const { data: staff } = await svc.from("staff_members").select("role").ilike("email", user.email || "").maybeSingle();
    const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = staff?.role || profile?.role || "";
    const isAdmin = ["owner","manager","admin","developer"].includes(role.toLowerCase());
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: subs, error } = await svc.from("form_submissions").select("*").eq("form_id", id).order("signed_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ submissions: subs || [] });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
