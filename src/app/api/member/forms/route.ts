import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const svc = getServiceClient();

    // Find member via approved_members or profiles
    const email = user.email?.toLowerCase() || "";
    let memberId = user.id;

    // Get all active forms
    const { data: forms } = await svc.from("forms").select("*").eq("is_active", true).order("created_at");
    const { data: allFields } = await svc.from("form_fields").select("*").order("sort_order");

    // Get member's submissions
    const { data: submissions } = await svc.from("form_submissions").select("form_id, form_version, signed_at").eq("member_id", user.id);

    const subMap = new Map((submissions||[]).map(s=> [s.form_id, s]));

    const enriched = (forms||[]).map((f:any)=>{
      const fields = (allFields||[]).filter((x:any)=> x.form_id===f.id);
      const sub = subMap.get(f.id);
      return {
        ...f,
        fields,
        field_count: fields.length,
        is_completed: !!sub,
        signed_at: sub?.signed_at || null,
        form_version_at_sign: (sub as any)?.form_version || null,
      };
    });

    const requiredPending = enriched.filter(f=> f.is_required && !f.is_completed);
    const hasPendingRequired = requiredPending.length > 0;

    return NextResponse.json({ forms: enriched, hasPendingRequired, requiredPending });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
