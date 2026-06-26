import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json();
    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
    }

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get the most recent active request for this email
    const { data: requestRow } = await serviceClient
      .from("forgot_login_requests")
      .select("id, code, expires_at, attempts")
      .eq("email", email.toLowerCase().trim())
      .eq("is_used", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!requestRow) {
      return NextResponse.json(
        { error: "Invalid or expired code. Please request a new one." },
        { status: 401 }
      );
    }

    // Check if locked
    if (requestRow.attempts >= 3) {
      await serviceClient
        .from("forgot_login_requests")
        .update({ is_used: true })
        .eq("id", requestRow.id);

      return NextResponse.json(
        { error: "This request has been locked due to too many failed attempts. Please request a new code." },
        { status: 429 }
      );
    }

    // Verify code match
    if (requestRow.code !== code) {
      const newAttempts = requestRow.attempts + 1;
      
      // Update attempts in DB
      await serviceClient
        .from("forgot_login_requests")
        .update({ attempts: newAttempts })
        .eq("id", requestRow.id);

      const remaining = 3 - newAttempts;

      // If it reached the limit, mark as used (locked)
      if (newAttempts >= 3) {
        await serviceClient
          .from("forgot_login_requests")
          .update({ is_used: true })
          .eq("id", requestRow.id);
        
        return NextResponse.json(
          { error: "Invalid code. This request has been locked due to too many failed attempts." },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: `Invalid code. ${remaining} attempts remaining.` },
        { status: 401 }
      );
    }

    // Code matches, consume it
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
  } catch (e: any) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

