import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "").trim();
    if (token) {
      try {
        const supabaseAnon = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: { user } } = await supabaseAnon.auth.getUser(token);
        if (user) return user;
      } catch (e) {
        console.warn("[CLASS-TYPES API] Token auth error:", e);
      }
    }
  }
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user) return user;
  } catch (e) {
    console.warn("[CLASS-TYPES API] Cookie auth error:", e);
  }
  return null;
}

function isMissingColumnError(err: { code?: string; message?: string } | null) {
  return Boolean(err && err.code === "PGRST204" && err.message?.includes("class_types") && err.message?.includes("column"));
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("classes.create");
    // Fallback to broader check if verifyApiPermission not configured for this key
    if (!check.authorized) {
      const { getUserRolePermissions } = await import("@/lib/rbac");
      const perms = await getUserRolePermissions(user);
      const byEmail = process.env.ADMIN_EMAIL && user.email?.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();
      const ok = Boolean(byEmail || perms.role === "Owner" || perms.role === "Manager" || perms.permissions.includes("*") || perms.permissions.includes("classes.create") || perms.permissions.includes("classes.manage"));
      if (!ok) return check.response!;
    }

    const body = await req.json();
    const payload = body.payload || body;

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Try full payload first (service_role bypasses RLS)
    let res = await serviceClient.from("class_types").insert(payload).select().maybeSingle();
    let error = res.error as unknown as { code?: string; message: string } | null;

    if (isMissingColumnError(error)) {
      // Fallback to minimal schema (name, description) for DBs still on 018
      const minimal: Record<string, unknown> = {
        name: payload.name,
        description: payload.description ?? null,
      };
      const fb = await serviceClient.from("class_types").insert(minimal).select().maybeSingle();
      if (fb.error) {
        return NextResponse.json({ error: fb.error.message }, { status: 400 });
      }
      return NextResponse.json({ data: fb.data, fallback: true });
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data: res.data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("classes.create");
    if (!check.authorized) {
      const { getUserRolePermissions } = await import("@/lib/rbac");
      const perms = await getUserRolePermissions(user);
      const byEmail = process.env.ADMIN_EMAIL && user.email?.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();
      const ok = Boolean(byEmail || perms.role === "Owner" || perms.role === "Manager" || perms.permissions.includes("*") || perms.permissions.includes("classes.create") || perms.permissions.includes("classes.manage"));
      if (!ok) return check.response!;
    }

    const body = await req.json();
    const { id, name: nameKey, payload } = body as { id?: string; name?: string; payload: Record<string, unknown> };
    if (!payload) return NextResponse.json({ error: "Missing payload" }, { status: 400 });

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const key = id ? "id" : "name";
    const val = (id || nameKey) as string;
    if (!val) return NextResponse.json({ error: "Missing id or name for update" }, { status: 400 });

    let res = await serviceClient.from("class_types").update(payload).eq(key, val).select().maybeSingle();
    let error = res.error as unknown as { code?: string; message: string } | null;

    if (isMissingColumnError(error)) {
      const minimal: Record<string, unknown> = {
        name: payload["name"] as string,
        description: (payload["description"] as string) ?? null,
      };
      // If fallback payload has name change, use original key for eq, but update name via minimal
      const fb = await serviceClient.from("class_types").update(minimal).eq(key, val).select().maybeSingle();
      if (fb.error) {
        return NextResponse.json({ error: fb.error.message }, { status: 400 });
      }
      return NextResponse.json({ data: fb.data, fallback: true });
    }

    if (error) {
      // If id column doesn't exist, retry with name
      if (error.message?.includes("column") && error.message?.includes("id") && key === "id" && nameKey) {
        const retry = await serviceClient.from("class_types").update(payload).eq("name", nameKey).select().maybeSingle();
        if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 400 });
        return NextResponse.json({ data: retry.data });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data: res.data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
