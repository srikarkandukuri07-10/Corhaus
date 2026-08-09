import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCancellationPolicy, DEFAULT_CANCELLATION_POLICY, CancellationPolicyData } from "@/lib/cancellationPolicy";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// GET: Fetch cancellation policy
export async function GET() {
  try {
    const policy = await getCancellationPolicy();
    return NextResponse.json({ policy });
  } catch (err: any) {
    console.error("GET /api/admin/settings/cancellation-policy error:", err);
    return NextResponse.json({ policy: DEFAULT_CANCELLATION_POLICY });
  }
}

// POST: Save/update cancellation policy
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getServiceClient();

    const hours = Math.max(0, parseInt(body.hours ?? 6, 10));
    const minutes = Math.max(0, Math.min(59, parseInt(body.minutes ?? 0, 10)));
    const total_minutes = hours * 60 + minutes;

    const updatedPolicy: CancellationPolicyData = {
      hours,
      minutes,
      total_minutes: total_minutes > 0 ? total_minutes : 360,
      is_active: Boolean(body.is_active ?? true),
      policy_note: (body.policy_note || "").trim() || `Bookings can be cancelled up to ${hours}h ${minutes}m before class start time.`,
    };

    const jsonString = JSON.stringify(updatedPolicy);

    const { data: existing } = await supabase
      .from("admin_notifications")
      .select("id")
      .eq("type", "cancellation_policy")
      .limit(1);

    if (existing && existing.length > 0) {
      const { error: updErr } = await supabase
        .from("admin_notifications")
        .update({
          message: jsonString,
          is_read: true,
        })
        .eq("id", existing[0].id);

      if (updErr) {
        console.error("Failed to update cancellation policy:", updErr);
        return NextResponse.json(
          { error: "Failed to save cancellation policy." },
          { status: 500 }
        );
      }
    } else {
      const { error: insErr } = await supabase
        .from("admin_notifications")
        .insert({
          type: "cancellation_policy",
          email: "cancellation_policy@system",
          message: jsonString,
          is_read: true,
        });

      if (insErr) {
        console.error("Failed to insert cancellation policy:", insErr);
        return NextResponse.json(
          { error: "Failed to create cancellation policy record." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Cancellation policy updated successfully.",
      policy: updatedPolicy,
    });
  } catch (err: any) {
    console.error("POST /api/admin/settings/cancellation-policy error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to save cancellation policy." },
      { status: 500 }
    );
  }
}
