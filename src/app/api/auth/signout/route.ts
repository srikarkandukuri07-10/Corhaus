import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const isDeletion = (options as any)?.maxAge === 0 || (options as any)?.maxAge < 0 || !value;
              const customizedOptions: any = {
                ...options,
                ...(isDeletion ? {} : { maxAge: 60 * 60 * 24 * 365 }),
                secure: true,
                sameSite: "lax" as const,
                httpOnly: true,
              };
              cookieStore.set(name, value, customizedOptions);
            });
          } catch {}
        },
      },
    });
    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const isDeletion = (options as any)?.maxAge === 0 || (options as any)?.maxAge < 0 || !value;
              const customizedOptions: any = {
                ...options,
                ...(isDeletion ? {} : { maxAge: 60 * 60 * 24 * 365 }),
                secure: true,
                sameSite: "lax" as const,
                httpOnly: true,
              };
              cookieStore.set(name, value, customizedOptions);
            });
          } catch {}
        },
      },
    });
    await supabase.auth.signOut();
  } catch {}
  const url = new URL("/auth/login", request.url);
  return NextResponse.redirect(url);
}
