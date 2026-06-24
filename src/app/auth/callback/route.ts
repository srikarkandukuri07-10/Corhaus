import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  console.log("=== AUTH CALLBACK (SERVER) ===");
  console.log("CODE PRESENT:", !!code);
  console.log("NEXT:", next);

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    console.log("EXCHANGE CODE ERROR:", exchangeError);

    if (!exchangeError) {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      console.log("GETUSER ERROR:", userError);

      if (user) {
        console.log("AUTH USER EMAIL:", user.email);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        console.log("PROFILE QUERY ERROR:", profileError);
        console.log("PROFILE FOUND:", !!profile);
        console.log("ROLE:", profile?.role);

        if (profile?.role === "admin") {
          console.log("DECISION: admin -> redirect to /admin");
          return NextResponse.redirect(`${origin}/admin`);
        }
        console.log("DECISION: member or no profile -> redirect to /member");
        return NextResponse.redirect(`${origin}/member`);
      }

      console.log("DECISION: no user -> redirect to", next);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  console.log("DECISION: no code or exchange error -> redirect to login with error");
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
