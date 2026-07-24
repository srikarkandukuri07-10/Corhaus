import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin" || user.email === process.env.ADMIN_EMAIL;
  if (!isAdmin) return { error: "Forbidden", status: 403 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { serviceClient, user };
}

export async function POST(req: Request) {
  try {
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    const body = await req.json();
    const sessions = body.sessions;

    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
      return NextResponse.json({ error: "No sessions provided for scheduling." }, { status: 400 });
    }

    let currentInserts: any[] = JSON.parse(JSON.stringify(sessions));
    let lastError: any = null;

    // Retry loop stripping un-cached schema columns if PostgREST cache has not reloaded
    for (let attempt = 0; attempt < 10; attempt++) {
      const { data, error } = await serviceClient.from("classes").insert(currentInserts).select();

      if (!error) {
        return NextResponse.json({ success: true, count: currentInserts.length, data });
      }

      lastError = error;
      const errMsg = error.message || "";

      // Extract un-cached column name from PostgREST error
      const match = errMsg.match(/Could not find the '([^']+)' column/i);
      if (match && match[1]) {
        const missingCol = match[1];
        console.warn(`[Schedule API] Stripping un-cached column '${missingCol}' and retrying...`);
        currentInserts = currentInserts.map((item) => {
          const clone = { ...item };
          delete clone[missingCol];
          return clone;
        });
      } else {
        // Fallback: strip optional non-core columns if schema is strictly basic
        console.warn(`[Schedule API] General insert error: ${errMsg}. Stripping extra fields.`);
        currentInserts = currentInserts.map(({ title, instructor, class_date, class_time, max_capacity, is_active }) => ({
          title,
          instructor,
          class_date,
          class_time,
          max_capacity: max_capacity || 10,
          is_active: is_active !== false,
        }));
      }
    }

    return NextResponse.json({ error: lastError?.message || "Failed to schedule sessions after retries." }, { status: 500 });
  } catch (err: any) {
    console.error("POST /api/admin/classes/schedule error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
