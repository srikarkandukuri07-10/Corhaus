import { createClient } from "@supabase/supabase-js";

/**
 * Normalizes phone numbers to standard 10-digit format for reliable comparison.
 * Extracts only digits and takes the last 10 digits (handles +91, 0 prefix, spaces, dashes).
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

export interface CanonicalMemberRecord {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  membership_status: string;
  freeze_status?: string | null;
  membership_level?: string | null;
  location_id?: string | null;
}

export interface MemberAuthorizationResult {
  authorized: boolean;
  member: CanonicalMemberRecord | null;
  error?: string;
  errorCode?: "not_found" | "inactive" | "phone_mismatch" | "unauthorized" | "ambiguous" | "email_conflict";
  /** How the member was resolved: existing email match, or new phone link. */
  matchedOn?: "email" | "phone";
  /** True when this member was resolved (and so linked) by phone. */
  phoneLinked?: boolean;
}

/**
 * Single canonical member authorization check across the entire application.
 *
 * Requirements for a member to be authorized:
 * 1. User must be authenticated.
 * 2. Record must exist in `approved_members` with matching email (case-insensitive).
 * 3. Phone number must match `approved_members.phone_number` (normalized 10-digits),
 *    if phone number is available on the user identity or profile.
 * 4. `membership_status` must be strictly 'active'.
 *
 * Note: Historical rows in `profiles` alone NEVER grant member authorization.
 */
export async function verifyCanonicalMemberAuthorization(
  email: string | null | undefined,
  phoneToCheck?: string | null | undefined
): Promise<MemberAuthorizationResult> {
  if (!email || typeof email !== "string" || !email.trim()) {
    return {
      authorized: false,
      member: null,
      error: "Valid email address is required.",
      errorCode: "not_found",
    };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Query approved_members directly using service role client
  let member: CanonicalMemberRecord | null = null;
  let matchedOn: "email" | "phone" = "email";
  let phoneLinked = false;

  {
    const { data } = await serviceClient
      .from("approved_members")
      .select("id, full_name, email, phone_number, membership_status, freeze_status, membership_level, location_id")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();
    member = data as CanonicalMemberRecord | null;
  }

  // Fallback: members migrated without an email cannot match on email at all.
  // Resolve them by phone instead. src/lib/member-linking.ts owns the matching
  // rules (active-only, never ambiguous, never overwrite a different email).
  if (!member && phoneToCheck) {
    const { resolveMemberForAuth } = await import("@/lib/member-linking");
    const resolved = await resolveMemberForAuth(serviceClient, {
      email: normalizedEmail,
      phone: phoneToCheck,
    });
    if (resolved.status === "matched") {
      member = resolved.member as CanonicalMemberRecord;
      matchedOn = resolved.matchedOn;
      phoneLinked = resolved.matchedOn === "phone";
    }
  }

  if (!member) {
    return {
      authorized: false,
      member: null,
      error: "You do not currently have access to the Corhaus Member Portal. Please contact Corhaus staff to activate your membership.",
      errorCode: "not_found",
    };
  }

  // 1. Status Check: Must be 'active'
  const isStatusActive = (member.membership_status || "").trim().toLowerCase() === "active";
  if (!isStatusActive) {
    return {
      authorized: false,
      member,
      error: "Your membership is currently inactive. Please contact Corhaus staff to reactivate your membership.",
      errorCode: "inactive",
    };
  }

  // 2. Phone Match Check: If phoneToCheck is provided, enforce normalized matching
  if (phoneToCheck) {
    const normUserPhone = normalizePhoneNumber(phoneToCheck);
    const normApprovedPhone = normalizePhoneNumber(member.phone_number);

    if (normUserPhone && normApprovedPhone && normUserPhone !== normApprovedPhone) {
      return {
        authorized: false,
        member,
        error: "Your phone number does not match our approved membership records. Please contact Corhaus staff.",
        errorCode: "phone_mismatch",
      };
    }
  }

  return {
    authorized: true,
    member: {
      ...member,
      // Preserve whatever the email match found. When we matched by phone the
      // member row may still have a NULL email, and callers that seed
      // `profiles` (login, OAuth callback) need the auth email, not a null.
      email: (member.email as string) || normalizedEmail,
    },
    // Lets the OAuth callback require a password for phone-linked members, so a
    // Google-only sign-in cannot claim a membership with a password never set.
    matchedOn,
    phoneLinked,
  };
}
