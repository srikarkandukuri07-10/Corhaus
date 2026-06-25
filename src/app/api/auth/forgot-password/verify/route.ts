import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const { email, code } = await request.json();
  if (!email || !code) {
    return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: requestRow } = await serviceClient
    .from("forgot_login_requests")
    .select("id, expires_at")
    .eq("email", email.toLowerCase().trim())
    .eq("code", code)
    .eq("is_used", false)
    .gte("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!requestRow) {
    return NextResponse.json(
      { error: "Invalid or expired code. Please request a new one." },
      { status: 401 }
    );
  }

  await serviceClient
    .from("forgot_login_requests")
    .update({ is_used: true })
    .eq("id", requestRow.id);

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: email.toLowerCase().trim(),
    options: { redirectTo: `${request.headers.get("origin")}/auth/forgot-callback` },
  });

  if (linkError || !linkData?.properties?.action_link) {
    return NextResponse.json(
      { error: "Failed to generate login link. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ redirectUrl: linkData.properties.action_link });
}
