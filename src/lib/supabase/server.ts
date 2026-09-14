import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
              const customizedOptions = {
                ...options,
                ...(isDeletion ? {} : { maxAge: 60 * 60 * 24 * 365 }),
                secure: true,
                sameSite: "lax" as const,
                httpOnly: true,
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
