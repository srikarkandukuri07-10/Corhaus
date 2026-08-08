import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export interface FreezePolicy {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  min_days: number;
  max_days: number;
  max_freezes_per_year: number;
  max_total_days_per_year: number;
  fee_label: string;
  applies_to: string;
  allowed_reasons: string[];
}

export const DEFAULT_FREEZE_POLICIES: FreezePolicy[] = [
  {
    id: "default-policy-1",
    name: "Default Freeze Policy",
    is_default: true,
    is_active: true,
    min_days: 2,
    max_days: 10,
    max_freezes_per_year: 1,
    max_total_days_per_year: 10,
    fee_label: "Free",
    applies_to: "Applies to all plans",
    allowed_reasons: [
      "Travel / Vacation",
      "Medical / Injury",
      "Work Commitment",
      "Family Emergency",
      "Financial Reasons",
      "Relocation (Temporary)",
      "Other",
    ],
  },
];

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// GET: Fetch all freeze policies
export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from("admin_notifications")
      .select("*")
      .eq("type", "freeze_policies")
      .order("created_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0 && data[0].message) {
      try {
        const parsed = JSON.parse(data[0].message);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return NextResponse.json({ policies: parsed });
        }
      } catch (e) {
        console.error("Failed to parse freeze policies JSON:", e);
      }
    }

    return NextResponse.json({ policies: DEFAULT_FREEZE_POLICIES });
  } catch (err: any) {
    console.error("GET /api/admin/settings/freeze-policies error:", err);
    return NextResponse.json({ policies: DEFAULT_FREEZE_POLICIES });
  }
}

// POST: Save/update full freeze policies list
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getServiceClient();

    let policies: FreezePolicy[] = Array.isArray(body.policies)
      ? body.policies
      : DEFAULT_FREEZE_POLICIES;

    // Ensure at least one policy exists
    if (policies.length === 0) {
      policies = DEFAULT_FREEZE_POLICIES;
    }

    const jsonString = JSON.stringify(policies);

    const { data: existing } = await supabase
      .from("admin_notifications")
      .select("id")
      .eq("type", "freeze_policies")
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("admin_notifications")
        .update({
          message: jsonString,
          is_read: true,
        })
        .eq("id", existing[0].id);
    } else {
      await supabase.from("admin_notifications").insert({
        type: "freeze_policies",
        email: "freeze_policies@system",
        message: jsonString,
        is_read: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Freeze policies saved successfully.",
      policies,
    });
  } catch (err: any) {
    console.error("POST /api/admin/settings/freeze-policies error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to save freeze policies." },
      { status: 500 }
    );
  }
}
