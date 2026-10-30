import { NextResponse } from "next/server";
import { getTrialScheduleSettings, saveTrialScheduleSettings } from "@/lib/trialSettings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getTrialScheduleSettings();
    return NextResponse.json({ settings }, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load trial settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const updated = await saveTrialScheduleSettings(body);
    return NextResponse.json({ success: true, settings: updated }, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (err: any) {
    console.error("Failed to save trial settings:", err);
    return NextResponse.json({ error: err.message || "Failed to save trial settings" }, { status: 500 });
  }
}
