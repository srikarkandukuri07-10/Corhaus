import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ approved: false }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Super admin emails
    if (isAdminEmail(normalizedEmail) || normalizedEmail === "kandukurisrikar10@gmail.com" || normalizedEmail === "admin@corhaus.com") {
      return NextResponse.json({ approved: true });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(url, key);

    // 2. Check if active staff member
    const { data: staff } = await supabase
      .from("staff_members")
      .select("employment_status")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (staff && staff.employment_status !== "Inactive") {
      return NextResponse.json({ approved: true });
    }

    // 3. Check if active member
    const { data: member } = await supabase
      .from("approved_members")
      .select("membership_status")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (member && member.membership_status === "active") {
      return NextResponse.json({ approved: true });
    }

    // 4. Fallback: check if existing profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (profile) {
      return NextResponse.json({ approved: true });
    }

    return NextResponse.json({ approved: false });
  } catch {
    return NextResponse.json({ approved: false }, { status: 500 });
  }
}
