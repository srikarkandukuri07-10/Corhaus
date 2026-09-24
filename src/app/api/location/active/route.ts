import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  LOCATION_COOKIE,
  getLocationAccess,
  resolveActiveLocation,
  locationCookieOptions,
  locationDenied,
} from "@/lib/location";

/** Active branch for the caller + branches they may switch to. */
export async function GET(req: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await getLocationAccess(user);
    const locationId = resolveActiveLocation(access, req);
    if (!locationId) {
      return NextResponse.json({ activeLocationId: null, locations: [] });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: locations } = await service
      .from("locations")
      .select("id, name, slug, status")
      .in("id", access.locationIds)
      .eq("status", "active")
      .order("name");

    return NextResponse.json({ activeLocationId: locationId, locations: locations || [] });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Switch active branch. The id is verified against the caller's access set. */
export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const locationId = typeof body?.locationId === "string" ? body.locationId.trim() : "";
    if (!locationId) {
      return NextResponse.json({ error: "locationId is required" }, { status: 400 });
    }

    const access = await getLocationAccess(user);
    if (!access.locationIds.includes(locationId)) {
      return locationDenied();
    }

    const response = NextResponse.json({ success: true, activeLocationId: locationId });
    response.cookies.set(LOCATION_COOKIE, locationId, locationCookieOptions());
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
