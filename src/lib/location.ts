// Branch location context — server side.
//
// SECURITY MODEL (never trust the client for branch identity):
//   1. The browser holds only a *preference* cookie (corhaus-location).
//   2. Every API route resolves the user, loads the branches they may access
//      (owners/admins: all active; staff: primary + mapped; members: own),
//      then validates the requested cookie value against that set.
//   3. Queries are filtered by the verified location id. A forged cookie,
//      body field, or query param can only ever select from branches the
//      caller is already authorized for — anything else 403s.
// Members have no switcher: their active branch is always their own record's.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/constants";

export const LOCATION_COOKIE = "corhaus-location";

const SUPER_ADMINS = [
  "srikarkandukuri07@gmail.com",
  "vkalladi@gmail.com",
  "kandukurisrikar10@gmail.com",
];

export type LocationKind = "owner" | "staff" | "member" | "none";

export interface LocationAccess {
  userId: string | null;
  email: string;
  kind: LocationKind;
  /** Active branches the user may access. */
  locationIds: string[];
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function isSuperAdmin(email: string): boolean {
  const e = email.trim().toLowerCase();
  return SUPER_ADMINS.includes(e) || isAdminEmail(e);
}

/** Load the branch access set for an authenticated user. Never throws. */
export async function getLocationAccess(user: { id: string; email?: string | null } | null): Promise<LocationAccess> {
  const email = (user?.email || "").trim().toLowerCase();
  if (!user || !email) {
    return { userId: null, email, kind: "none", locationIds: [] };
  }
  const service = serviceClient();

  // Super-admins / Owners: every active branch (mirrors user_location_ids()).
  if (isSuperAdmin(email)) {
    const { data } = await service.from("locations").select("id").eq("status", "active");
    return { userId: user.id, email, kind: "owner", locationIds: (data || []).map((l: any) => l.id) };
  }

  // Staff (incl. Owner-role staff): primary branch + explicit mappings.
  try {
    const { data: staff } = await service
      .from("staff_members")
      .select("id, role, employment_status, location_id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (staff && staff.employment_status !== "Inactive") {
      if ((staff.role || "") === "Owner") {
        const { data } = await service.from("locations").select("id").eq("status", "active");
        return { userId: user.id, email, kind: "owner", locationIds: (data || []).map((l: any) => l.id) };
      }
      const ids = new Set<string>();
      if (staff.location_id) {
        const { data: loc } = await service.from("locations").select("id").eq("id", staff.location_id).eq("status", "active").maybeSingle();
        if (loc) ids.add(loc.id);
      }
      const { data: mapped } = await service
        .from("staff_locations")
        .select("location_id, locations!inner(id, status)")
        .eq("staff_id", staff.id);
      for (const m of mapped || []) {
        const st = (m as any)?.locations?.status;
        if (st === "active" && (m as any).location_id) ids.add((m as any).location_id);
      }
      if (ids.size > 0) {
        return { userId: user.id, email, kind: "staff", locationIds: [...ids] };
      }
    }
  } catch {}

  // Members: exactly their own branch (any membership status).
  try {
    const { data: member } = await service
      .from("approved_members")
      .select("location_id, locations!inner(id, status)")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    const locId = (member as any)?.location_id as string | undefined;
    if (locId) {
      return { userId: user.id, email, kind: "member", locationIds: [locId] };
    }
  } catch {}

  return { userId: user.id, email, kind: "none", locationIds: [] };
}

/** Read the raw location preference cookie (untrusted until verified). */
export function getRequestedLocationId(req: Request): string | null {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)corhaus-location=([^;]+)/);
  const v = m ? decodeURIComponent(m[1].trim()) : "";
  return v || null;
}

/**
 * Resolve the verified active branch: requested cookie value if authorized,
 * otherwise the first authorized branch. Members always resolve to their own.
 * Returns null when the user may access nothing (caller must 403).
 */
export function resolveActiveLocation(access: LocationAccess, req: Request): string | null {
  if (access.locationIds.length === 0) return null;
  if (access.kind === "member") return access.locationIds[0];
  const requested = getRequestedLocationId(req);
  if (requested && access.locationIds.includes(requested)) return requested;
  return access.locationIds[0];
}

export function locationCookieOptions(maxAge = 60 * 60 * 24 * 365) {
  return {
    httpOnly: true as const,
    secure: true as const,
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge,
  };
}

/** 403 helper for unauthorized branch access. */
export function locationDenied(message = "You do not have access to this location.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * One-call guard for branch-scoped API routes. Authenticates via the
 * request's session cookies (same pattern as existing getAdminClient
 * helpers), resolves + verifies the active branch, and returns everything
 * the handler needs. Sends the right error response otherwise.
 */
export async function requireLocation(req: Request): Promise<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { ok: true; user: any; access: LocationAccess; locationId: string; service: any }
  | { ok: false; response: NextResponse }
> {
  const { createClient: createServerClient } = await import("@/lib/supabase/server");
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const access = await getLocationAccess(user);
  const locationId = resolveActiveLocation(access, req);
  if (!locationId) {
    return { ok: false, response: locationDenied("No accessible location found for this account.") };
  }
  return { ok: true, user, access, locationId, service: serviceClient() };
}
