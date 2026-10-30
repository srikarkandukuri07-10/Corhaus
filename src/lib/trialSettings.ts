import { createClient } from "@supabase/supabase-js";

export interface TrialSlot {
  id: string;
  label: string;
  value: string; // e.g. "06:00" or "06:30"
  period: "Morning" | "Evening";
  capacity?: number;
  isActive: boolean;
}

export interface TrialScheduleSettings {
  slots: TrialSlot[];
  daysAhead: number; // default 14
  enabledDaysOfWeek: number[]; // 0=Sunday, 1=Monday ... 6=Saturday
  blockedDates: string[]; // "YYYY-MM-DD"
}

export const DEFAULT_TRIAL_SLOTS: TrialSlot[] = [
  { id: "m_0600", label: "6:00 - 7:00 AM", value: "06:00", period: "Morning", capacity: 10, isActive: true },
  { id: "m_0700", label: "7:00 - 8:00 AM", value: "07:00", period: "Morning", capacity: 10, isActive: true },
  { id: "m_0800", label: "8:00 - 9:00 AM", value: "08:00", period: "Morning", capacity: 10, isActive: true },
  { id: "m_0900", label: "9:00 - 10:00 AM", value: "09:00", period: "Morning", capacity: 10, isActive: true },
  { id: "e_1600", label: "4:00 - 5:00 PM", value: "16:00", period: "Evening", capacity: 10, isActive: true },
  { id: "e_1700", label: "5:00 - 6:00 PM", value: "17:00", period: "Evening", capacity: 10, isActive: true },
  { id: "e_1800", label: "6:00 - 7:00 PM", value: "18:00", period: "Evening", capacity: 10, isActive: true },
  { id: "e_1900", label: "7:00 - 8:00 PM", value: "19:00", period: "Evening", capacity: 10, isActive: true },
];

export const DEFAULT_TRIAL_SCHEDULE_SETTINGS: TrialScheduleSettings = {
  slots: DEFAULT_TRIAL_SLOTS,
  daysAhead: 14,
  enabledDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  blockedDates: [],
};

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function getTrialScheduleSettings(): Promise<TrialScheduleSettings> {
  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from("admin_notifications")
      .select("message")
      .eq("type", "trial_slot_settings")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data?.message) return DEFAULT_TRIAL_SCHEDULE_SETTINGS;

    const parsed = JSON.parse(data.message);
    if (!parsed || !Array.isArray(parsed.slots)) return DEFAULT_TRIAL_SCHEDULE_SETTINGS;

    return {
      slots: parsed.slots.length > 0 ? parsed.slots : DEFAULT_TRIAL_SLOTS,
      daysAhead: typeof parsed.daysAhead === "number" ? parsed.daysAhead : 14,
      enabledDaysOfWeek: Array.isArray(parsed.enabledDaysOfWeek) ? parsed.enabledDaysOfWeek : [0, 1, 2, 3, 4, 5, 6],
      blockedDates: Array.isArray(parsed.blockedDates) ? parsed.blockedDates : [],
    };
  } catch (err) {
    console.error("Error reading trial schedule settings:", err);
    return DEFAULT_TRIAL_SCHEDULE_SETTINGS;
  }
}

export async function saveTrialScheduleSettings(settings: Partial<TrialScheduleSettings>): Promise<TrialScheduleSettings> {
  const supabase = getServiceClient();
  const current = await getTrialScheduleSettings();

  const updated: TrialScheduleSettings = {
    slots: settings.slots && settings.slots.length > 0 ? settings.slots : current.slots,
    daysAhead: typeof settings.daysAhead === "number" ? Math.max(1, Math.min(60, settings.daysAhead)) : current.daysAhead,
    enabledDaysOfWeek: Array.isArray(settings.enabledDaysOfWeek) ? settings.enabledDaysOfWeek : current.enabledDaysOfWeek,
    blockedDates: Array.isArray(settings.blockedDates) ? settings.blockedDates : current.blockedDates,
  };

  const jsonString = JSON.stringify(updated);

  const { data: existing } = await supabase
    .from("admin_notifications")
    .select("id")
    .eq("type", "trial_slot_settings")
    .limit(1);

  if (existing && existing.length > 0) {
    await supabase
      .from("admin_notifications")
      .update({ message: jsonString, is_read: true })
      .eq("id", existing[0].id);
  } else {
    await supabase.from("admin_notifications").insert({
      type: "trial_slot_settings",
      title: "Trial Slot Settings",
      message: jsonString,
      is_read: true,
    });
  }

  return updated;
}
