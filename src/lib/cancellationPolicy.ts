import { createClient } from "@supabase/supabase-js";

export interface CancellationPolicyData {
  hours: number;
  minutes: number;
  total_minutes: number;
  is_active: boolean;
  allow_credit_refund: boolean;
  policy_note: string;
}

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicyData = {
  hours: 6,
  minutes: 0,
  total_minutes: 360,
  is_active: true,
  allow_credit_refund: true,
  policy_note: "Bookings can be cancelled up to 6 hours before class start time for a full credit refund.",
};

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

export async function getCancellationPolicy(): Promise<CancellationPolicyData> {
  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from("admin_notifications")
      .select("message")
      .eq("type", "cancellation_policy")
      .order("created_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0 && data[0].message) {
      const parsed = JSON.parse(data[0].message);
      const hours = Math.max(0, parseInt(parsed.hours ?? 6, 10));
      const minutes = Math.max(0, Math.min(59, parseInt(parsed.minutes ?? 0, 10)));
      const total_minutes = hours * 60 + minutes;

      return {
        hours,
        minutes,
        total_minutes: total_minutes > 0 ? total_minutes : 360,
        is_active: Boolean(parsed.is_active ?? true),
        allow_credit_refund: Boolean(parsed.allow_credit_refund ?? true),
        policy_note: (parsed.policy_note || "").trim() || DEFAULT_CANCELLATION_POLICY.policy_note,
      };
    }
  } catch (err) {
    console.error("Failed to fetch cancellation policy:", err);
  }
  return DEFAULT_CANCELLATION_POLICY;
}
