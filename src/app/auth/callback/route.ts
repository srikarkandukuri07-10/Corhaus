import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const debug = process.env.NODE_ENV === "development" ? console.log : () => {};

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  debug("=== AUTH CALLBACK (SERVER) ===");
  debug("CODE PRESENT:", !!code);
  debug("NEXT:", next);

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    debug("EXCHANGE CODE ERROR:", exchangeError);

    if (!exchangeError) {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      debug("GETUSER ERROR:", userError);

      if (user) {
        debug("AUTH USER EMAIL:", user.email);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        debug("PROFILE QUERY ERROR:", profileError);
        debug("PROFILE FOUND:", !!profile);
        debug("ROLE:", profile?.role);

        if (profile?.role === "admin") {
          debug("DECISION: admin -> redirect to /admin");
          return NextResponse.redirect(`${origin}/admin`);
        }
        debug("DECISION: member or no profile -> redirect to /member");
        return NextResponse.redirect(`${origin}/member`);
      }

      debug("DECISION: no user -> redirect to", next);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  debug("DECISION: no code or exchange error -> redirect to login with error");
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
