import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_CATEGORIES = [
  "Rent",
  "Salaries",
  "Utilities",
  "Equipment",
  "Marketing",
  "Software",
  "Maintenance",
  "Miscellaneous",
];

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const { getUserRolePermissions } = await import("@/lib/rbac");
  const userPerms = await getUserRolePermissions(user);
  if (userPerms.role === "Member" || userPerms.role === "Guest") {
    return { error: "Forbidden", status: 403 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { client: serviceClient, serviceClient, user, profile };
}

export async function GET() {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("expenses.view");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;

    const { data: categoriesData, error: catErr } = await client
      .from("expense_categories")
      .select("*")
      .order("category_name", { ascending: true });

    if (catErr || !categoriesData || categoriesData.length === 0) {
      return NextResponse.json({
        categories: DEFAULT_CATEGORIES.map((c, i) => ({ id: `default-${i}`, category_name: c })),
      });
    }

    return NextResponse.json({ categories: categoriesData });
  } catch (err: any) {
    return NextResponse.json({
      categories: DEFAULT_CATEGORIES.map((c, i) => ({ id: `default-${i}`, category_name: c })),
    });
  }
}
