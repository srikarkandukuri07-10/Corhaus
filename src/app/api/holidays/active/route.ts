import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = getServiceClient();

    // Check holidays where end_date >= today
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("studio_holidays")
      .select("id, start_date, end_date, title, message, is_active")
      .eq("is_active", true)
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .limit(5);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      activeHolidays: data || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
