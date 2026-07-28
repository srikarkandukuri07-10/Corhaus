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
    const { data: { users } } = await serviceClient.auth.admin.listUsers();
    let existingUser = users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    // 2. If user doesn't exist, create user in auth.users directly
    if (!existingUser) {
      const { data: created, error: createError } =
        await serviceClient.auth.admin.createUser({
          email: normalizedEmail,
          email_confirm: true,
          user_metadata: { full_name: normalizedEmail.split("@")[0] },
        });

      if (createError || !created.user) {
        console.error("Failed to create direct admin user:", createError);
        return NextResponse.json(
          { error: "Failed to initialize admin session." },
          { status: 500 }
        );
      }
      existingUser = created.user;
    }

    // 3. Ensure profile has role = 'admin'
    await serviceClient.from("profiles").upsert(
      {
        id: existingUser.id,
        email: normalizedEmail,
        role: "admin",
      },
      { onConflict: "id" }
    );

    // 4. Generate magic link URL to log in instantly without sending email
    const { data: linkData, error: linkError } =
      await serviceClient.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Failed to generate direct action link:", linkError);
      return NextResponse.json(
        { error: "Failed to generate direct login link." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      isDirect: true,
      redirectUrl: linkData.properties.action_link,
    });
  } catch (err: any) {
    console.error("Direct login API error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
