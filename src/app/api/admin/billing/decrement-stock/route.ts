import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items: { id: string; quantity: number }[] = body.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: true, updated: [] });
    }

    const service = getServiceClient();
    const updated: { id: string; oldStock: number | null; newStock: number | null }[] = [];

    for (const item of items) {
      if (!item.id || !item.quantity) continue;

      const { data: current, error: getErr } = await service
        .from("billing_plan_items")
        .select("id, name, stock_quantity")
        .eq("id", item.id)
        .maybeSingle();

      if (getErr || !current) continue;

      if (current.stock_quantity !== null && current.stock_quantity !== undefined) {
        const newStock = Math.max(0, current.stock_quantity - item.quantity);
        const { error: updErr } = await service
          .from("billing_plan_items")
          .update({ stock_quantity: newStock })
          .eq("id", item.id);

        if (!updErr) {
          updated.push({ id: item.id, oldStock: current.stock_quantity, newStock });
        }
      }
    }

    return NextResponse.json({ success: true, updated });
  } catch (err: any) {
    console.error("Error in decrement-stock:", err);
    return NextResponse.json({ error: err.message || "Failed to update stock" }, { status: 500 });
  }
}
