import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "").trim();
    if (token) {
      try {
        const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
        const { data: { user } } = await anon.auth.getUser(token);
        if (user) return user;
      } catch {}
    }
  }
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return user;
  } catch {}
  return null;
}

export async function GET(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  const [plansRes, purchasedRes] = await Promise.all([
    service.from("billing_plan_items").select("*").order("sort_order", { ascending: true }),
    service.from("member_purchased_plans").select("plan_name, status"),
  ]);

  if (plansRes.error) return NextResponse.json({ error: plansRes.error.message }, { status: 500 });

  const rawPlans = plansRes.data || [];
  const purchased = purchasedRes.data || [];
  const activeCounts: Record<string, number> = {};
  purchased.forEach((p: any) => {
    if (p.status === "active" && p.plan_name) activeCounts[p.plan_name] = (activeCounts[p.plan_name] || 0) + 1;
  });
  const enriched = rawPlans.map((item: any) => ({ ...item, active_subscribers_count: activeCounts[item.name] || 0 }));
  return NextResponse.json({ plans: enriched });
}
