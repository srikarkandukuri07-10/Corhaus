import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const isDeletion = (options as any)?.maxAge === 0 || (options as any)?.maxAge < 0 || !value;
              // NOTE: no httpOnly override here on purpose. The browser client
              // (layouts, RLS reads) must be able to read the session cookies —
              // exactly like the Google callback route sets them. Forcing
              // httpOnly blinds the browser and breaks password logins.
              const customizedOptions = {
                ...options,
                ...(isDeletion ? {} : { maxAge: 604800 }), // 1 week
                secure: true,
                sameSite: "lax" as const,
              };
              cookieStore.set(name, value, customizedOptions);
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
