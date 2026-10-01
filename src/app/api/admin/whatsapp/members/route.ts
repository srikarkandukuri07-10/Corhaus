import { NextResponse } from "next/server";
import { requireWhatsapp } from "@/lib/whatsapp/admin";
import { normalizeIndianPhone } from "@/lib/whatsapp/phone";

// Real approved members for the test-message and preview pickers. Reads the
// production table - no seeded or synthetic records anywhere in this module.

export async function GET(req: Request) {
  const auth = await requireWhatsapp("whatsapp.view");
  if (!auth.ok) return auth.response;

  try {
    const { service } = auth.admin;
    const url = new URL(req.url);
    const search = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50)
    );

    let query = service
      .from("approved_members")
      .select("id, full_name, email, phone_number, membership_status, location_id")
      .eq("membership_status", "active")
      .order("full_name", { ascending: true })
      .limit(limit);

    if (search) {
      // Escape the PostgREST filter operators so a search string cannot alter
      // the query shape.
      const safe = search.replace(/[,()*%]/g, " ").trim();
      if (safe) {
        query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`);
      }
    }

    // Branch isolation, consistent with the jobs endpoint.
    const { getLocationAccess, resolveActiveLocation } = await import("@/lib/location");
    const locAccess = await getLocationAccess({ id: auth.admin.userId, email: auth.admin.email });
    const locationId = resolveActiveLocation(locAccess, req);
    if (locationId) {
      query = query.eq("location_id", locationId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[whatsapp] members read failed:", error.message);
      return NextResponse.json(
        { error: "Unable to load members." },
        { status: 500 }
      );
    }

    const members = (data ?? []).map((m) => {
      const norm = normalizeIndianPhone(m.phone_number as string);
      return {
        id: m.id,
        full_name: m.full_name,
        email: m.email,
        phone_raw: m.phone_number,
        phone_display: norm.ok ? `+91 ${norm.national.slice(0, 5)} ${norm.national.slice(5)}` : null,
        phone_valid: norm.ok,
        membership_status: m.membership_status,
      };
    });

    return NextResponse.json({ members });
  } catch (err) {
    console.error("[whatsapp] members route error:", err);
    return NextResponse.json(
      { error: "Unable to load members." },
      { status: 500 }
    );
  }
}
