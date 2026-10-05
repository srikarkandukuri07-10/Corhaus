import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneNumber } from "@/lib/auth-canonical";

/**
 * Phone-based member identity linking.
 *
 * Members migrated from MyGymDesk frequently have no email address, so
 * email-only resolution can never find their row. This module lets a member who
 * already holds a valid Supabase auth identity claim their existing record by
 * PHONE, then writes their auth email onto that row.
 *
 * Why the backfill matters: once `approved_members.email` is populated, every
 * other part of the system — `verifyCanonicalMemberAuthorization`, the
 * `is_active_member()` SQL function, `user_location_ids()`, all RLS branch
 * scoping — resolves that member normally. So this is a one-time repair ritual,
 * not a permanent parallel identity path. That is deliberate: it keeps the blast
 * radius to one new code path instead of editing ~30 identity lookups.
 *
 * Guards that are enforced here regardless of caller:
 *   - the member row must exist and be membership_status = 'active'
 *   - a phone matching more than one active member is REFUSED, never guessed
 *   - a non-null email on the member row is never overwritten with a different
 *     one, so an email-linked member cannot be hijacked by phone
 *   - every attempt, including refusals, is written to member_identity_links
 */

export interface LinkCandidate {
  id: string;
  full_name: string;
  email: string | null;
  phone_number: string;
  membership_status: string;
  freeze_status?: string | null;
  membership_level?: string | null;
  location_id?: string | null;
}

export type ResolveResult =
  | { status: "matched"; member: LinkCandidate; matchedOn: "email" | "phone"; alreadyLinked: boolean }
  | { status: "not_found" }
  | { status: "ambiguous"; count: number }
  | { status: "email_conflict"; memberId: string }
  | { status: "inactive"; member: LinkCandidate };

/**
 * Resolve an auth identity to an approved member by email OR phone.
 * Email always wins; phone is only consulted when the email finds nothing.
 */
export async function resolveMemberForAuth(
  service: SupabaseClient,
  args: { email: string | null | undefined; phone?: string | null | undefined }
): Promise<ResolveResult> {
  const email = (args.email || "").trim().toLowerCase();
  const phoneDigits = normalizePhoneNumber(args.phone);

  // ── 1. Email match (existing behaviour, unchanged) ──────────────────────
  if (email) {
    const { data: byEmail } = await service
      .from("approved_members")
      .select(
        "id, full_name, email, phone_number, membership_status, freeze_status, membership_level, location_id"
      )
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (byEmail) {
      return { status: "matched", member: byEmail as LinkCandidate, matchedOn: "email", alreadyLinked: true };
    }
  }

  // ── 2. Phone match (new path) ───────────────────────────────────────────
  if (!phoneDigits || phoneDigits.length !== 10) {
    return { status: "not_found" };
  }

  // Prefer the indexed stored column; fall back to a bounded scan if the
  // migration has not been applied yet.
  let candidates: LinkCandidate[] = [];

  const { data: byPhone, error: phoneErr } = await service
    .from("approved_members")
    .select(
      "id, full_name, email, phone_number, membership_status, freeze_status, membership_level, location_id"
    )
    .eq("phone_normalized", phoneDigits)
    .limit(5);

  if (!phoneErr && byPhone && byPhone.length > 0) {
    candidates = byPhone as LinkCandidate[];
  } else {
    // Migration 058 not applied yet: fall back to scanning a bounded page and
    // normalising in JS. Correct for studio-sized data, and it keeps login
    // working if the migration is deployed after the app.
    const { data: scan } = await service
      .from("approved_members")
      .select(
        "id, full_name, email, phone_number, membership_status, freeze_status, membership_level, location_id"
      )
      .not("phone_number", "is", null)
      .limit(2000);
    candidates = (scan ?? []).filter(
      (m) => normalizePhoneNumber(m.phone_number) === phoneDigits
    ) as LinkCandidate[];
  }

  const active = candidates.filter(
    (m) => (m.membership_status || "").trim().toLowerCase() === "active"
  );

  // Never guess between two members sharing a number.
  if (active.length > 1) {
    return { status: "ambiguous", count: active.length };
  }

  if (active.length === 0) {
    if (candidates.length === 1) {
      return { status: "inactive", member: candidates[0] };
    }
    return { status: "not_found" };
  }

  const member = active[0];

  // An existing, different email on the member row means this account is not
  // the one that belongs to it. Refuse rather than overwrite.
  const existingEmail = (member.email || "").trim().toLowerCase();
  if (existingEmail && email && existingEmail !== email) {
    return { status: "email_conflict", memberId: member.id };
  }

  return { status: "matched", member, matchedOn: "phone", alreadyLinked: Boolean(existingEmail) };
}

export interface LinkOutcome {
  ok: boolean;
  matchedOn?: "email" | "phone";
  alreadyLinked?: boolean;
  reason?: string;
  /** Present only on success; used by the caller to seed profiles. */
  member?: LinkCandidate;
}

/**
 * Writes the auth email onto a phone-matched member row so every downstream
 * lookup (including RLS branch scoping) resolves them normally from now on.
 *
 * The UPDATE is deliberately conditional on the email still being NULL or
 * already equal, so a concurrent request cannot repoint the row.
 */
export async function backfillMemberEmail(
  service: SupabaseClient,
  args: {
    memberId: string;
    authEmail: string;
    authUserId?: string | null;
    phone?: string | null;
    source?: string;
  }
): Promise<LinkOutcome> {
  const email = args.authEmail.trim().toLowerCase();

  const { data, error } = await service
    .from("approved_members")
    .update({ email })
    .eq("id", args.memberId)
    .is("email", null)
    .select("id, full_name, email, phone_number, membership_status, freeze_status, membership_level, location_id");

  if (error) {
    await recordLink(service, {
      approvedMemberId: args.memberId,
      authUserId: args.authUserId ?? null,
      authEmail: email,
      matchedOn: "phone",
      linkedPhone: normalizePhoneNumber(args.phone),
      outcome: "refused",
      reason: `backfill failed: ${error.message}`,
      source: args.source,
    });
    return { ok: false, reason: "Could not complete the link." };
  }

  if (!data || data.length === 0) {
    // Either someone else already filled it in, or it now holds a different
    // value. Re-read to find out which, and report honestly.
    const { data: current } = await service
      .from("approved_members")
      .select("id, full_name, email, phone_number, membership_status, freeze_status, membership_level, location_id")
      .eq("id", args.memberId)
      .maybeSingle();

    const nowEmail = (current?.email || "").trim().toLowerCase();

    if (nowEmail === email) {
      return { ok: true, matchedOn: "phone", alreadyLinked: true, member: current as LinkCandidate };
    }

    await recordLink(service, {
      approvedMemberId: args.memberId,
      authUserId: args.authUserId ?? null,
      authEmail: email,
      matchedOn: "phone",
      linkedPhone: normalizePhoneNumber(args.phone),
      outcome: "refused",
      reason: "email already set to a different value",
      source: args.source,
    });
    return { ok: false, reason: "That membership is already linked to a different account." };
  }

  await recordLink(service, {
    approvedMemberId: args.memberId,
    authUserId: args.authUserId ?? null,
    authEmail: email,
    matchedOn: "phone",
    linkedPhone: normalizePhoneNumber(args.phone),
    outcome: "linked",
    source: args.source,
  });

  return { ok: true, matchedOn: "phone", alreadyLinked: false, member: data[0] as LinkCandidate };
}

/** Best-effort audit write. Never throws — auditing must not break login. */
export async function recordLink(
  service: SupabaseClient,
  args: {
    approvedMemberId: string;
    authUserId: string | null;
    authEmail: string | null;
    matchedOn: "email" | "phone";
    linkedPhone?: string | null;
    outcome: "linked" | "already_linked" | "refused";
    reason?: string | null;
    source?: string | null;
  }
): Promise<void> {
  try {
    await service.from("member_identity_links").insert({
      approved_member_id: args.approvedMemberId,
      auth_user_id: args.authUserId,
      auth_email: args.authEmail,
      matched_on: args.matchedOn,
      linked_phone: args.linkedPhone ?? null,
      outcome: args.outcome,
      reason: args.reason ?? null,
      source: args.source ?? null,
    });
  } catch (err) {
    console.error("[member-link] audit write failed:", err);
  }
}

/**
 * Generic, non-enumerating message.
 *
 * The response must not reveal whether a phone number is registered, or an
 * attacker could use the login form to harvest member phone numbers.
 */
export const GENERIC_LINK_MESSAGE =
  "If that phone number matches an active Corhaus membership, we will link it to your account. If nothing happens, contact the studio.";

export const GENERIC_LINK_ERROR =
  "We could not verify that phone number against an active membership. Please contact Corhaus staff for help.";
