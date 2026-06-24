import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Check if table exists
  const { error } = await serviceClient.from("approved_members").select("id").limit(1);

  if (error && error.message.includes("Could not find the table")) {
    return NextResponse.json({ error: "approved_members table does not exist. Run the SQL migration in your Supabase SQL Editor." }, { status: 404 });
  }

  return NextResponse.json({ status: "table exists" });
}
