import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/constants";

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
        const normalizedEmail = user.email?.trim().toLowerCase() || "";

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const serviceClient = createServiceClient(supabaseUrl, supabaseServiceKey);

        // Check if developer
        if (normalizedEmail === "kandukurisrikar10@gmail.com") {
          debug("DECISION: developer -> redirect to /developer/support");
          return NextResponse.redirect(`${origin}/developer/support`);
        }

        // Check if staff
        let isStaff = isAdminEmail(normalizedEmail);
        if (!isStaff) {
          const { data: staff } = await serviceClient
            .from("staff_members")
            .select("employment_status")
            .eq("email", normalizedEmail)
            .maybeSingle();
          if (staff && staff.employment_status !== "Inactive") {
            isStaff = true;
          }
        }

        // Retrieve existing profile
        const { data: profile } = await serviceClient
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (isStaff) {
          debug("USER IS STAFF. Self-healing profile & permissions mapping...");
          
          if (!profile) {
            await serviceClient.from("profiles").insert({
              id: user.id,
              full_name: user.user_metadata?.full_name || "",
              phone_number: user.user_metadata?.phone_number || "",
              email: normalizedEmail,
              role: "admin",
            });
          } else if (profile.role !== "admin") {
            await serviceClient
              .from("profiles")
              .update({ role: "admin" })
              .eq("id", user.id);
          }

          // Trigger RBAC self-healing linkage (linking user_id to staff record and roles)
          try {
            const { getUserRolePermissions } = await import("@/lib/rbac");
            await getUserRolePermissions(user);
          } catch (rbacErr) {
            debug("RBAC LINKAGE ERROR:", rbacErr);
          }

          debug("DECISION: admin -> redirect to /admin");
          return NextResponse.redirect(`${origin}/admin`);
        } else {
          debug("USER IS NOT STAFF.");
          
          if (!profile) {
            await serviceClient.from("profiles").insert({
              id: user.id,
              full_name: user.user_metadata?.full_name || "",
              phone_number: user.user_metadata?.phone_number || "",
              email: normalizedEmail,
              role: "member",
            });
          }

          debug("DECISION: member -> redirect to /member");
          return NextResponse.redirect(`${origin}/member`);
        }
      }

      debug("DECISION: no user -> redirect to", next);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  debug("DECISION: no code or exchange error -> redirect to login with error");
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
