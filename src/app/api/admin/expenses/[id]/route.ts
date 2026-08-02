import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin" || user.email === process.env.ADMIN_EMAIL;
  if (!isAdmin) return { error: "Forbidden", status: 403 };

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

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Missing expense ID" }, { status: 400 });
    }

    const body = await req.json();
    const {
      title,
      category_name,
      category_id,
      amount,
      payment_method,
      paid_to,
      expense_date,
      description,
      is_recurring,
      recurring_frequency,
    } = body;

    // Validation
    if (title && (!title.trim())) {
      return NextResponse.json({ error: "Expense title cannot be empty" }, { status: 400 });
    }
    if (amount !== undefined) {
      const numAmt = Number(amount);
      if (isNaN(numAmt) || numAmt <= 0) {
        return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
      }
    }
    if (is_recurring && (!recurring_frequency || !["Daily", "Weekly", "Monthly"].includes(recurring_frequency))) {
      return NextResponse.json({ error: "Recurring frequency (Daily, Weekly, Monthly) is required for recurring expenses" }, { status: 400 });
    }

    const updateFields: any = {
      updated_at: new Date().toISOString(),
    };

    if (title !== undefined) updateFields.title = title.trim();
    if (category_name !== undefined) updateFields.category_name = category_name.trim();
    if (category_id !== undefined) updateFields.category_id = category_id;
    if (amount !== undefined) updateFields.amount = Number(amount);
    if (payment_method !== undefined) updateFields.payment_method = payment_method.trim();
    if (paid_to !== undefined) updateFields.paid_to = paid_to ? paid_to.trim() : null;
    if (expense_date !== undefined) updateFields.expense_date = expense_date;
    if (description !== undefined) updateFields.description = description ? description.trim() : null;
    if (is_recurring !== undefined) updateFields.is_recurring = Boolean(is_recurring);
    if (is_recurring !== undefined) {
      updateFields.recurring_frequency = is_recurring ? recurring_frequency : null;
    }

    const { data: updatedData, error: updateErr } = await client
      .from("expenses")
      .update(updateFields)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, expense: updatedData });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Missing expense ID" }, { status: 400 });
    }

    const { error: deleteErr } = await client
      .from("expenses")
      .delete()
      .eq("id", id);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
