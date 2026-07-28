import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ isDirect: false }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isAdminEmail(normalizedEmail)) {
      return NextResponse.json({ isDirect: false });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const serviceClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const origin = new URL(request.url).origin;

    // 1. Check if user already exists in auth.users
    const { data: listData } = await serviceClient.auth.admin.listUsers();
    const users = listData?.users || [];
    let existingUser = users.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    // 2. Try to generate a direct magic link if user exists or can be linked
    if (existingUser) {
      // Ensure profile has role = 'admin'
      await serviceClient.from("profiles").upsert(
        {
          id: existingUser.id,
          email: normalizedEmail,
          role: "admin",
        },
        { onConflict: "id" }
      );

      const { data: linkData } = await serviceClient.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      });

      if (linkData?.properties?.action_link) {
        return NextResponse.json({
          isDirect: true,
          redirectUrl: linkData.properties.action_link,
        });
      }
    }

    // 3. If user doesn't exist yet, try creating them silently
    const { data: created } = await serviceClient.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: { full_name: normalizedEmail.split("@")[0] },
    });

    if (created?.user) {
      await serviceClient.from("profiles").upsert(
        {
          id: created.user.id,
          email: normalizedEmail,
          role: "admin",
        },
        { onConflict: "id" }
      );

      const { data: linkData } = await serviceClient.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      });

      if (linkData?.properties?.action_link) {
        return NextResponse.json({
          isDirect: true,
          redirectUrl: linkData.properties.action_link,
        });
      }
    }

    // Fall back to standard auth flow gracefully without throwing 500
    return NextResponse.json({ isDirect: false });
  } catch (err) {
    console.error("Direct login API error:", err);
    return NextResponse.json({ isDirect: false });
  }
}
