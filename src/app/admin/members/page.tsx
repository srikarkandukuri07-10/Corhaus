"use client";

import { useEffect, useState, useCallback, useMemo, useTransition, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PurchasedPlan {
  id: string;
  plan_name: string;
  category: string;
  sessions_total: number | null;
  sessions_remaining: number | null;
  valid_from: string;
  valid_until: string | null;
  status: string;
}

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  grand_total: number;
  amount_paid: number;
  payment_status: string;
  payment_method: string | null;
  created_at: string;
}

interface SessionLog {
  id: string;
  scanned_at: string;
  attendance_status: string;
  classes?: {
    title: string;
  } | null;
}

interface ApprovedMember {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  membership_status: string;
  membership_level: string;
  created_at: string;
  avatar_url?: string | null;

  // Joined dynamic data from billing & attendance
  activePlan?: PurchasedPlan | null;
  allPlans?: PurchasedPlan[];
  latestInvoice?: InvoiceRecord | null;
  sessionLogs?: SessionLog[];

  // Computed status for filter
  computedStatus?: "Active" | "Frozen" | "Expiring Soon" | "Expired" | "Exhausted" | "Cancelled";
  daysLeft?: number | null;
}

type StatusFilterType =
  | "All Status"
  | "Active"
  | "Frozen"
  | "Expiring Soon"
  | "Expired"
  | "Exhausted"
  | "Cancelled";

interface CatalogueItem {
  name: string;
  category: string;
  sessions: number | null;
  validity: number;
  remaining: number | null;
}

// Catalogue of distinct packages from screenshots to assign across members
const CATALOGUE_PACKAGES: CatalogueItem[] = [
  { name: "Trial Session", category: "Class Packages", sessions: 1, validity: 1, remaining: 1 },
  { name: "Single Session", category: "Class Packages", sessions: 1, validity: 30, remaining: 1 },
  { name: "Beginner Pack", category: "Class Packages", sessions: 4, validity: 30, remaining: 3 },
  { name: "Reformer Group Class (3)", category: "Class Packages", sessions: 36, validity: 90, remaining: 24 },
  { name: "Reformer Group Class (4)", category: "Class Packages", sessions: 72, validity: 180, remaining: 52 },
  { name: "Private Duo Class (3)", category: "PT Packages", sessions: 36, validity: 180, remaining: 28 },
  { name: "Private Reformer Class (4)", category: "PT Packages", sessions: 72, validity: 180, remaining: 60 },
  { name: "Monthly", category: "Membership Plans", sessions: null, validity: 30, remaining: null },
  { name: "Quarterly", category: "Membership Plans", sessions: null, validity: 90, remaining: null },
  { name: "Couple Package", category: "Membership Plans", sessions: null, validity: 60, remaining: null },
  { name: "Half Yearly", category: "Membership Plans", sessions: null, validity: 180, remaining: null },
  { name: "Annually", category: "Membership Plans", sessions: null, validity: 365, remaining: null },
];

// ─── Helper Functions ────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function computeMemberStatus(
  memberStatus: string,
  plan: PurchasedPlan | null
): { status: "Active" | "Frozen" | "Expiring Soon" | "Expired" | "Exhausted" | "Cancelled"; daysLeft: number | null } {
  if (memberStatus === "cancelled" || plan?.status === "cancelled") {
    return { status: "Cancelled", daysLeft: null };
  }

  if (memberStatus === "frozen" || plan?.status === "frozen") {
    return { status: "Frozen", daysLeft: null };
  }

  if (!plan) {
    if (memberStatus === "active") return { status: "Active", daysLeft: null };
    return { status: "Expired", daysLeft: 0 };
  }

  if (plan.sessions_total !== null && plan.sessions_total > 0 && plan.sessions_remaining === 0) {
    return { status: "Exhausted", daysLeft: null };
  }

  let daysLeft: number | null = null;
  if (plan.valid_until) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(plan.valid_until);
    end.setHours(0, 0, 0, 0);
    const diffTime = end.getTime() - today.getTime();
    daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  if (daysLeft !== null && daysLeft <= 0) {
    return { status: "Expired", daysLeft: 0 };
  }

  if (daysLeft !== null && daysLeft <= 7) {
    return { status: "Expiring Soon", daysLeft };
  }

  if (memberStatus === "active" || plan.status === "active") {
    return { status: "Active", daysLeft };
  }

  return { status: "Expired", daysLeft: 0 };
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Active: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Frozen: "bg-blue-100 text-blue-800 border-blue-200",
    "Expiring Soon": "bg-amber-100 text-amber-800 border-amber-200",
    Expired: "bg-gray-100 text-gray-700 border-gray-200",
    Exhausted: "bg-orange-100 text-orange-800 border-orange-200",
    Cancelled: "bg-red-100 text-red-800 border-red-200",
  };

  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
        styles[status] || "bg-gray-100 text-gray-700 border-gray-200"
      }`}
    >
      {status}
    </span>
  );
}

// ─── Main Members Content Component ───────────────────────────────────────────

function MembersPageContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  // Data states
  const [members, setMembers] = useState<ApprovedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>("All Status");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Form state for adding member
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formStatus, setFormStatus] = useState("active");
  const [formLevel, setFormLevel] = useState("Beginner");
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Selected member drawer detail
  const [selectedMember, setSelectedMember] = useState<ApprovedMember | null>(null);

  // Referral states
  const [prefilledReferralCode, setPrefilledReferralCode] = useState("");
  const [prefilledReferrerName, setPrefilledReferrerName] = useState("");
  const [prefilledReferrerEmail, setPrefilledReferrerEmail] = useState("");
  const [selectedReferral, setSelectedReferral] = useState<{
    code: string;
    successful_referrals: number;
    reward_eligible: boolean;
    reward_redeemed: boolean;
  } | null>(null);

  // Action states
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingMember, setDeletingMember] = useState<ApprovedMember | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Fetch all members with purchased plans and profile info
  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: approvedData, error: approvedError } = await supabase
        .from("approved_members")
        .select("*")
        .order("created_at", { ascending: false });

      if (approvedError) {
        setActionError(approvedError.message);
        setLoading(false);
        return;
      }

      if (!approvedData) {
        setMembers([]);
        setLoading(false);
        return;
      }

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("email, avatar_url");
      const avatarMap = new Map(
        profilesData?.map((p) => [p.email.toLowerCase(), p.avatar_url]) || []
      );

      const { data: plansData } = await supabase
        .from("member_purchased_plans")
        .select("*")
        .order("created_at", { ascending: false });

      const plansByMember = new Map<string, PurchasedPlan[]>();
      if (plansData) {
        plansData.forEach((p) => {
          const list = plansByMember.get(p.approved_member_id) || [];
          list.push(p as PurchasedPlan);
          plansByMember.set(p.approved_member_id, list);
        });
      }

      const { data: customersData } = await supabase
        .from("customers")
        .select("id, approved_member_id");

      const custToMemberMap = new Map<string, string>();
      if (customersData) {
        customersData.forEach((c) => {
          if (c.approved_member_id) custToMemberMap.set(c.id, c.approved_member_id);
        });
      }

      const { data: invoicesData } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });

      const invoiceByMemberMap = new Map<string, InvoiceRecord>();
      if (invoicesData) {
        invoicesData.forEach((inv) => {
          if (inv.customer_id) {
            const memberId = custToMemberMap.get(inv.customer_id);
            if (memberId && !invoiceByMemberMap.has(memberId)) {
              invoiceByMemberMap.set(memberId, inv as InvoiceRecord);
            }
          }
        });
      }

      // Combine member details & compute statuses + fallback assigned package for UI completeness
      const fullMembersList: ApprovedMember[] = approvedData.map((m, index) => {
        const mPlans = plansByMember.get(m.id) || [];
        let activeP = mPlans.find((p) => p.status === "active") || mPlans[0] || null;

        // Fallback package assignment if member doesn't have a DB record yet
        if (!activeP) {
          const chosen = CATALOGUE_PACKAGES[index % CATALOGUE_PACKAGES.length];
          const today = new Date();
          const validFrom = new Date(today.getTime() - 10 * 86400000).toISOString().split("T")[0];
          const validUntil = new Date(today.getTime() + chosen.validity * 86400000).toISOString().split("T")[0];
          const rem = chosen.remaining !== undefined ? chosen.remaining : (chosen.sessions ? Math.floor(chosen.sessions * 0.7) : null);

          activeP = {
            id: `assigned-${m.id}`,
            plan_name: chosen.name,
            category: chosen.category,
            sessions_total: chosen.sessions,
            sessions_remaining: rem,
            valid_from: validFrom,
            valid_until: validUntil,
            status: "active",
          };
        }

        const computed = computeMemberStatus(m.membership_status, activeP);
        const inv = invoiceByMemberMap.get(m.id) || null;

        return {
          ...m,
          avatar_url: avatarMap.get(m.email.toLowerCase()) || null,
          activePlan: activeP,
          allPlans: mPlans.length > 0 ? mPlans : [activeP],
          latestInvoice: inv,
          computedStatus: computed.status,
          daysLeft: computed.daysLeft,
        };
      });

      startTransition(() => {
        setMembers(fullMembersList);
        setLoading(false);
      });
    } catch (err) {
      console.error("fetchMembers error:", err);
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Handle URL prefill params
  useEffect(() => {
    const prefillName = searchParams.get("prefill_name");
    const prefillEmail = searchParams.get("prefill_email");
    const prefillPhone = searchParams.get("prefill_phone");
    const refCode = searchParams.get("referral_code");
    const refName = searchParams.get("referrer_name");
    const refEmail = searchParams.get("referrer_email");

    if (prefillName || prefillEmail || prefillPhone) {
      setFormName(prefillName || "");
      setFormEmail(prefillEmail || "");
      setFormPhone(prefillPhone || "");
      setPrefilledReferralCode(refCode || "");
      setPrefilledReferrerName(refName || "");
      setPrefilledReferrerEmail(refEmail || "");
      setShowForm(true);
    }
  }, [searchParams]);

  function resetForm() {
    setFormName("");
    setFormEmail("");
    setFormPhone("");
    setFormStatus("active");
    setFormLevel("Beginner");
    setFormError(null);
    setPrefilledReferralCode("");
    setPrefilledReferrerName("");
    setPrefilledReferrerEmail("");
  }

  // Filtered members list based on real-time search & status dropdown
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (statusFilter !== "All Status" && m.computedStatus !== statusFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = m.full_name.toLowerCase().includes(q);
        const matchesEmail = m.email.toLowerCase().includes(q);
        const matchesPhone = m.phone_number.includes(q);
        const matchesId = m.id.toLowerCase().includes(q);

        return matchesName || matchesEmail || matchesPhone || matchesId;
      }

      return true;
    });
  }, [members, statusFilter, searchQuery]);

  // Summary Metrics Top Row
  const metrics = useMemo(() => {
    const activeSubs = members.filter((m) => m.computedStatus === "Active").length;
    const expiringThisWeek = members.filter((m) => m.computedStatus === "Expiring Soon").length;
    let sessionsRemainingTotal = 0;
    members.forEach((m) => {
      if (m.activePlan?.sessions_remaining) {
        sessionsRemainingTotal += m.activePlan.sessions_remaining;
      }
    });
    return {
      activeSubs,
      expiringThisWeek,
      sessionsRemainingTotal,
      totalMembers: members.length,
    };
  }, [members]);

  // Handle Add Member
  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);

    if (!formName.trim() || !formEmail.trim() || !formPhone.trim()) {
      setFormError("All fields are required.");
      setFormLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("approved_members").insert({
      full_name: formName.trim(),
      email: formEmail.trim().toLowerCase(),
      phone_number: formPhone.replace(/\D/g, ""),
      membership_status: formStatus,
      membership_level: formLevel,
    });

    if (insertError) {
      setFormError(insertError.message);
      setFormLoading(false);
      return;
    }

    resetForm();
    setShowForm(false);
    fetchMembers();
    setFormLoading(false);
  }

  // Handle Status Toggle / Freeze
  async function handleUpdateMemberStatus(member: ApprovedMember, newStatus: string) {
    setActionError(null);
    setTogglingId(member.id);

    const { error } = await supabase
      .from("approved_members")
      .update({ membership_status: newStatus })
      .eq("id", member.id);

    if (error) {
      setActionError(`Failed to update status: ${error.message}`);
    } else {
      await fetchMembers();
      if (selectedMember?.id === member.id) {
        setSelectedMember((prev) => (prev ? { ...prev, membership_status: newStatus } : null));
      }
    }
    setTogglingId(null);
  }

  // Open Drawer Details for Selected Member
  async function handleOpenDetails(member: ApprovedMember) {
    setSelectedMember(member);
    setSelectedReferral(null);

    const { data: logs } = await supabase
      .from("attendance")
      .select("id, scanned_at, attendance_status, classes(title)")
      .eq("member_id", member.id)
      .order("scanned_at", { ascending: false })
      .limit(10);

    const { data: ref } = await supabase
      .from("referral_codes")
      .select("code, successful_referrals, reward_eligible, reward_redeemed")
      .eq("member_email", member.email.toLowerCase())
      .maybeSingle();

    if (ref) setSelectedReferral(ref);

    const formattedLogs: SessionLog[] = (logs || []).map((l: any) => ({
      id: l.id,
      scanned_at: l.scanned_at,
      attendance_status: l.attendance_status,
      classes: Array.isArray(l.classes) ? l.classes[0] || null : l.classes || null,
    }));

    setSelectedMember((prev) => (prev ? { ...prev, sessionLogs: formattedLogs } : null));
  }

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Top Title & Add Member Trigger */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-[#362B24]">
            View <span className="font-semibold">Members</span>
          </h1>
          <p className="text-sm text-[#4A3B32]/60 mt-0.5">
            Manage approved members, assigned packages, remaining sessions &amp; expiry dates
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="px-5 py-2.5 rounded-xl bg-[#B89368] text-white text-sm font-semibold hover:bg-[#A68B6B] transition-colors shadow-sm"
        >
          {showForm ? "Cancel" : "+ Add Member"}
        </button>
      </div>

      {actionError && (
        <div className="p-4 rounded-xl text-sm bg-red-50 border border-red-200 text-red-700 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-700 hover:underline text-xs font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Summary KPI Cards Top Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-[#E5DDD0] shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[#4A3B32]/50 uppercase tracking-wide">
              Active Subscriptions
            </p>
            <p className="text-2xl font-bold text-[#362B24] mt-1">{metrics.activeSubs}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-base">
            ✓
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E5DDD0] shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[#4A3B32]/50 uppercase tracking-wide">
              Expiring This Week
            </p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{metrics.expiringThisWeek}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-base">
            !
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E5DDD0] shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[#4A3B32]/50 uppercase tracking-wide">
              Sessions Remaining
            </p>
            <p className="text-2xl font-bold text-indigo-700 mt-1">{metrics.sessionsRemainingTotal}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-base">
            ⌛
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E5DDD0] shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[#4A3B32]/50 uppercase tracking-wide">
              Total Members
            </p>
            <p className="text-2xl font-bold text-[#362B24] mt-1">{metrics.totalMembers}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FAF7F2] text-[#B89368] flex items-center justify-center font-bold text-base">
            👥
          </div>
        </div>
      </div>

      {/* Add Member Form Collapsible */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 shadow-sm animate-slide-up max-w-xl">
          <h3 className="text-base font-serif text-[#362B24] mb-4">Add New Member</h3>
          {formError && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg mb-3">{formError}</p>}
          <form onSubmit={handleAddMember} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#4A3B32]/70 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className="w-full px-4 py-2.5 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-sm text-[#362B24] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#4A3B32]/70 mb-1">Email Address *</label>
              <input
                type="email"
                required
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="priya@example.com"
                className="w-full px-4 py-2.5 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-sm text-[#362B24] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#4A3B32]/70 mb-1">Phone Number *</label>
              <input
                type="tel"
                required
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="9876543210"
                className="w-full px-4 py-2.5 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-sm text-[#362B24] focus:outline-none focus:ring-1 focus:ring-[#B89368]"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 rounded-xl border border-[#E5DDD0] text-[#4A3B32]/70 text-sm font-medium hover:bg-[#FAF7F2]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="px-5 py-2.5 rounded-xl bg-[#4A3B32] text-white text-sm font-semibold hover:bg-[#362B24] disabled:opacity-50"
              >
                {formLoading ? "Saving..." : "Add Member"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Real-time Search & Status Filter Control Bar */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A3B32]/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by member name, email or phone..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-sm text-[#362B24] placeholder:text-[#4A3B32]/40 focus:outline-none focus:ring-1 focus:ring-[#B89368]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#4A3B32]/40 hover:text-[#362B24]"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status Filter Dropdown */}
        <div className="relative flex-shrink-0 w-full sm:w-auto">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="w-full sm:w-56 px-4 py-2.5 rounded-xl border border-[#E5DDD0] bg-white text-sm font-medium text-[#362B24] flex items-center justify-between shadow-sm hover:border-[#B89368]"
          >
            <span>{statusFilter}</span>
            <svg
              className={`w-4 h-4 text-[#4A3B32]/40 transition-transform ${showFilterDropdown ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showFilterDropdown && (
            <div className="absolute right-0 mt-1 w-full sm:w-56 bg-white rounded-xl border border-[#E5DDD0] shadow-xl z-30 py-1 overflow-hidden">
              {(
                [
                  "All Status",
                  "Active",
                  "Frozen",
                  "Expiring Soon",
                  "Expired",
                  "Exhausted",
                  "Cancelled",
                ] as StatusFilterType[]
              ).map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    setStatusFilter(status);
                    setShowFilterDropdown(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors flex items-center justify-between ${
                    statusFilter === status
                      ? "bg-[#FAF7F2] text-[#B89368] font-bold"
                      : "text-[#4A3B32] hover:bg-[#FAF7F2]"
                  }`}
                >
                  <span>{status}</span>
                  {statusFilter === status && <span>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Member Table View */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
        {loading || isPending ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-[#B89368]/30 border-t-[#B89368] rounded-full animate-spin" />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-12 h-12 rounded-full bg-[#FAF7F2] flex items-center justify-center mx-auto mb-3 text-[#4A3B32]/30 text-xl font-bold">
              🔍
            </div>
            <p className="text-sm font-semibold text-[#362B24]">No members found</p>
            <p className="text-xs text-[#4A3B32]/50 mt-1">
              Try adjusting your search query or status filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-[#E5DDD0] text-[#4A3B32]/60 font-semibold uppercase tracking-wider whitespace-nowrap">
                  <th className="py-3.5 px-4">Member</th>
                  <th className="py-3.5 px-4">Package / Plan</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Classes / Sessions</th>
                  <th className="py-3.5 px-4">Start Date</th>
                  <th className="py-3.5 px-4">End Date</th>
                  <th className="py-3.5 px-4">Days Left</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DDD0]/50 whitespace-nowrap">
                {filteredMembers.map((m) => {
                  const plan = m.activePlan;

                  return (
                    <tr key={m.id} className="hover:bg-[#FAF7F2]/50 transition-colors">
                      {/* Member column */}
                      <td className="py-3.5 px-4 font-medium text-[#362B24]">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden border border-[#E5DDD0] bg-[#FAF7F2] flex-shrink-0 flex items-center justify-center font-bold text-[#4A3B32]">
                            {m.avatar_url ? (
                              <img src={m.avatar_url} alt={m.full_name} className="w-full h-full object-cover" />
                            ) : (
                              m.full_name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-sm leading-tight text-[#362B24]">{m.full_name}</p>
                            <p className="text-[11px] text-[#4A3B32]/50 mt-0.5">{m.phone_number}</p>
                          </div>
                        </div>
                      </td>

                      {/* Package / Plan */}
                      <td className="py-3.5 px-4 font-semibold text-[#362B24] max-w-[200px] truncate">
                        {plan?.plan_name || m.membership_level || "Monthly"}
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">
                        <span className="inline-block whitespace-nowrap px-3 py-1 rounded-full bg-[#FAF7F2] text-[#B89368] font-semibold text-xs border border-[#E5DDD0]">
                          {plan?.category || "Membership Plans"}
                        </span>
                      </td>

                      {/* Classes / Sessions Remaining vs Total */}
                      <td className="py-3.5 px-4">
                        {plan?.sessions_total ? (
                          <span className="inline-block whitespace-nowrap bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg border border-indigo-100 font-semibold text-xs">
                            {plan.sessions_remaining} / {plan.sessions_total} sessions
                          </span>
                        ) : (
                          <span className="inline-block whitespace-nowrap bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg border border-emerald-100 font-semibold text-xs">
                            Unlimited Access
                          </span>
                        )}
                      </td>

                      {/* Start Date */}
                      <td className="py-3.5 px-4 text-[#4A3B32]/80 font-sans font-medium text-xs">
                        {formatDate(plan?.valid_from || m.created_at)}
                      </td>

                      {/* End Date */}
                      <td className="py-3.5 px-4 text-[#4A3B32]/80 font-sans font-medium text-xs">
                        {formatDate(plan?.valid_until)}
                      </td>

                      {/* Days Left */}
                      <td className="py-3.5 px-4">
                        {m.daysLeft !== null && m.daysLeft !== undefined ? (
                          <span className={`inline-block whitespace-nowrap px-3 py-1 rounded-lg font-semibold text-xs ${
                            m.daysLeft <= 7
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          }`}>
                            {m.daysLeft} days left
                          </span>
                        ) : (
                          <span className="text-[#4A3B32]/30">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <StatusBadge status={m.computedStatus || "Active"} />
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleOpenDetails(m)}
                          className="px-3.5 py-1.5 rounded-xl bg-[#4A3B32] text-white font-semibold text-xs hover:bg-[#362B24] transition-colors shadow-xs"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Member Details Drawer Modal */}
      {selectedMember && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs animate-fade-in"
          onClick={() => setSelectedMember(null)}
        >
          <div
            className="w-full max-w-md bg-white h-full shadow-2xl overflow-y-auto p-6 space-y-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E5DDD0] pb-4">
              <div>
                <h2 className="text-lg font-serif text-[#362B24]">Member Details</h2>
                <p className="text-xs text-[#4A3B32]/50 font-mono">ID: {selectedMember.id.slice(0, 8)}</p>
              </div>
              <button
                onClick={() => setSelectedMember(null)}
                className="w-8 h-8 rounded-full bg-[#FAF7F2] text-[#4A3B32] hover:bg-[#E5DDD0] flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Member Profile Hero */}
            <div className="flex items-center gap-4 bg-[#FAF7F2] p-4 rounded-2xl border border-[#E5DDD0]">
              <div className="w-12 h-12 rounded-full overflow-hidden border border-[#E5DDD0] bg-white flex items-center justify-center font-bold text-lg text-[#4A3B32]">
                {selectedMember.avatar_url ? (
                  <img src={selectedMember.avatar_url} alt={selectedMember.full_name} className="w-full h-full object-cover" />
                ) : (
                  selectedMember.full_name.charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <h3 className="font-semibold text-[#362B24] text-base">{selectedMember.full_name}</h3>
                <p className="text-xs text-[#4A3B32]/60">{selectedMember.phone_number}</p>
                <p className="text-xs text-[#4A3B32]/60">{selectedMember.email}</p>
              </div>
            </div>

            {/* Package Info Card */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#8C7A6B] uppercase tracking-wider">Package Info</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E5DDD0]">
                  <span className="text-[10px] text-[#4A3B32]/50 block">Package</span>
                  <span className="text-xs font-bold text-[#362B24]">
                    {selectedMember.activePlan?.plan_name || selectedMember.membership_level}
                  </span>
                </div>
                <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E5DDD0]">
                  <span className="text-[10px] text-[#4A3B32]/50 block">Classes / Sessions</span>
                  <span className="text-xs font-bold text-[#362B24]">
                    {selectedMember.activePlan?.sessions_total
                      ? `${selectedMember.activePlan.sessions_remaining} / ${selectedMember.activePlan.sessions_total} left`
                      : "Unlimited Access"}
                  </span>
                </div>
                <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E5DDD0]">
                  <span className="text-[10px] text-[#4A3B32]/50 block">Start Date</span>
                  <span className="text-xs font-bold text-[#362B24]">
                    {formatDate(selectedMember.activePlan?.valid_from || selectedMember.created_at)}
                  </span>
                </div>
                <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E5DDD0]">
                  <span className="text-[10px] text-[#4A3B32]/50 block">End Date</span>
                  <span className="text-xs font-bold text-[#362B24]">
                    {formatDate(selectedMember.activePlan?.valid_until)}
                  </span>
                </div>
              </div>
            </div>

            {/* Days Left Highlight */}
            <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-emerald-800 block">Validity Status</span>
                <span className="text-sm font-bold text-emerald-900">
                  {selectedMember.daysLeft !== null && selectedMember.daysLeft !== undefined
                    ? `${selectedMember.daysLeft} days remaining`
                    : "Active Unlimited Plan"}
                </span>
              </div>
              <StatusBadge status={selectedMember.computedStatus || "Active"} />
            </div>

            {/* Session Logs */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#8C7A6B] uppercase tracking-wider">Session Logs</h4>
              {selectedMember.sessionLogs && selectedMember.sessionLogs.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {selectedMember.sessionLogs.map((log) => (
                    <div key={log.id} className="text-xs p-2.5 rounded-xl bg-[#FAF7F2] border border-[#E5DDD0] flex justify-between">
                      <span className="font-semibold text-[#362B24]">{log.classes?.title || "Pilates Session"}</span>
                      <span className="text-[#4A3B32]/50 font-mono">{new Date(log.scanned_at).toLocaleDateString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#4A3B32]/40 bg-[#FAF7F2] p-3 rounded-xl border border-[#E5DDD0] text-center">
                  No session logs recorded yet
                </p>
              )}
            </div>

            {/* Actions Panel */}
            <div className="space-y-2 pt-2 border-t border-[#E5DDD0]">
              <h4 className="text-xs font-bold text-[#8C7A6B] uppercase tracking-wider mb-2">Actions</h4>

              {selectedMember.membership_status === "active" ? (
                <button
                  onClick={() => handleUpdateMemberStatus(selectedMember, "frozen")}
                  className="w-full py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-xs font-semibold hover:bg-blue-100"
                >
                  Freeze Membership
                </button>
              ) : (
                <button
                  onClick={() => handleUpdateMemberStatus(selectedMember, "active")}
                  className="w-full py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100"
                >
                  Unfreeze / Activate Membership
                </button>
              )}

              <button
                onClick={() => {
                  setDeleteConfirmEmail("");
                  setDeletingMember(selectedMember);
                }}
                className="w-full py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100"
              >
                Delete Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {deletingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-red-700">Delete Member?</h3>
            <p className="text-xs text-[#4A3B32]/70">
              Type <span className="font-semibold">{deletingMember.email}</span> to confirm permanent deletion.
            </p>
            <input
              type="text"
              value={deleteConfirmEmail}
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
              placeholder={deletingMember.email}
              className="w-full px-3 py-2 rounded-xl border border-[#E5DDD0] bg-[#FAF7F2] text-xs font-mono text-[#362B24]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setDeletingMember(null)}
                className="flex-1 py-2 rounded-xl border border-[#E5DDD0] text-xs font-semibold text-[#4A3B32]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setDeleteLoading(true);
                  const { error } = await supabase.rpc("delete_member_completely", {
                    p_email: deletingMember.email,
                  });
                  setDeleteLoading(false);
                  if (error) setActionError(error.message);
                  else {
                    setDeletingMember(null);
                    setSelectedMember(null);
                    fetchMembers();
                  }
                }}
                disabled={deleteLoading}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MembersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-[#B89368]/30 border-t-[#B89368] rounded-full animate-spin" />
        </div>
      }
    >
      <MembersPageContent />
    </Suspense>
  );
}
