import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const { email } = await request.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: member } = await serviceClient
    .from("approved_members")
    .select("id, full_name")
    .eq("email", email.toLowerCase().trim())
    .eq("membership_status", "active")
    .maybeSingle();

  if (!member) {
    return NextResponse.json(
      { error: "No active member found with this email address." },
      { status: 404 }
    );
  }

  const code = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  const normalizedEmail = email.toLowerCase().trim();
  console.log("[ForgotPassword] generating code for:", normalizedEmail, "code:", code);

  const { error: insertError } = await serviceClient.from("forgot_login_requests").insert({
    email: normalizedEmail,
    code,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  if (insertError) {
    console.error("[ForgotPassword] insert request error:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: notifError } = await serviceClient.from("admin_notifications").insert({
    type: "forgot_password",
    email: normalizedEmail,
    message: `${code} is the confirmation code for login to ${normalizedEmail}`,
  });
  if (notifError) {
    console.error("[ForgotPassword] insert notification error:", notifError);
    return NextResponse.json({ error: notifError.message }, { status: 500 });
  }

  console.log("[ForgotPassword] success for:", normalizedEmail);
  return NextResponse.json({ success: true });
}
