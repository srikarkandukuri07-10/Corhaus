import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { rateLimit } from "@/lib/rateLimit";
import { isAdminEmail, isDeveloperEmail } from "@/lib/constants";

// Helper to get service role client
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";
    // Rate limit forgot password request requests: 5 per 15 minutes per IP
    const { success, retryAfter } = await rateLimit(ip, "forgot_password_request", 5, 15 * 60 * 1000);
    if (!success) {
      return NextResponse.json(
        { error: `Too many requests. Please try again after ${retryAfter} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { email } = await request.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const serviceClient = getServiceClient();

    // 1. Check if staff email
    const { data: staff } = await serviceClient
      .from("staff_members")
      .select("id, role, full_name, employment_status")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    const isStaff = !!staff || isAdminEmail(normalizedEmail) || normalizedEmail === "admin@corhaus.com";

    // 2. Check if developer
    const isDev = isDeveloperEmail(normalizedEmail);

    // 3. Check if approved member
    const { data: member } = await serviceClient
      .from("approved_members")
      .select("id, full_name, membership_status")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    const isMember = member && (member.membership_status || "").toLowerCase() === "active";

    // Standard generic response for defense against enumeration
    const genericResponse = {
      success: true,
      message: "If your email is registered, a 5-digit verification code has been sent. Please contact Corhaus support or check your dashboard.",
    };

    if (!isStaff && !isDev && !isMember) {
      // Return generic success to prevent email enumeration
      return NextResponse.json(genericResponse);
    }

    // Generate 5-digit random numeric code
    const code = Math.floor(10000 + Math.random() * 90000).toString(); // e.g. "57291"
    const hashedCode = crypto.createHash("sha256").update(code).digest("hex");

    // Insert request in forgot_login_requests with SHA-256 hashed code
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins expiry
    const { error: insertErr } = await serviceClient.from("forgot_login_requests").insert({
      email: normalizedEmail,
      code: hashedCode, // Securely hashed code
      expires_at: expiresAt,
      is_used: false,
      attempts: 0,
    });

    if (insertErr) {
      console.error("Failed to insert forgot password request:", insertErr);
      return NextResponse.json({ error: "Failed to request code. Please try again." }, { status: 500 });
    }

    // Add entry in admin_notifications so the admin can see it (simulates sending the code to the user)
    const name = staff?.full_name || member?.full_name || "Developer";
    await serviceClient.from("admin_notifications").insert({
      type: "forgot_password",
      email: normalizedEmail,
      message: `Password reset request for ${name} (${normalizedEmail}). Code: ${code}`,
      is_read: false,
    });

    // In development / testing, we print code to console so developer/user can find it easily
    console.log(`[FORGOT PASSWORD] Generated code for ${normalizedEmail}: ${code}`);

    return NextResponse.json(genericResponse);
  } catch (err: any) {
    console.error("POST /api/auth/forgot-password error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
