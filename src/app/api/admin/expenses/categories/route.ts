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
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { error: "Unauthorized", status: 401 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (serviceKey) {
    const serviceClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return { client: serviceClient, user };
  }

  return { client: supabase, user };
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
