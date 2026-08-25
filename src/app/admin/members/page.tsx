"use client";

import { useEffect, useState, useCallback, useMemo, useTransition, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

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

interface InvoiceItemDetail {
  id: string;
  invoice_id: string;
  name: string;
  category: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  validity_days: number | null;
  sessions: number | null;
}

interface FullInvoiceRecord {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  subtotal: number;
  discount_type: string | null;
  discount_value: number;
  discount_amount: number;
  grand_total: number;
  payment_status: "paid" | "due" | "partial" | string;
  payment_method: string | null;
  amount_paid: number;
  transaction_reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
  items?: InvoiceItemDetail[];
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
  billingHistory?: FullInvoiceRecord[];
  activeDiscount?: any;

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

function formatSessionsDisplay(plan: PurchasedPlan | null | undefined): { text: string; isSessions: boolean } {
  if (!plan) return { text: "No Sessions", isSessions: false };
  if (plan.sessions_total) {
    return {
      text: `${plan.sessions_remaining ?? plan.sessions_total} / ${plan.sessions_total} sessions`,
      isSessions: true,
    };
  }

  const pName = plan.plan_name.toLowerCase();
  if (pName.includes("monthly")) return { text: "Monthly (30 Days)", isSessions: false };
  if (pName.includes("quarterly")) return { text: "Quarterly (90 Days)", isSessions: false };
  if (pName.includes("half yearly") || pName.includes("half-yearly")) return { text: "Half-Yearly (180 Days)", isSessions: false };
  if (pName.includes("annually") || pName.includes("annual")) return { text: "Annually (365 Days)", isSessions: false };
  if (pName.includes("couple")) return { text: "Couple Package (60 Days)", isSessions: false };

  return { text: plan.plan_name, isSessions: false };
}

import { formatDate, formatTime, formatDateTime } from "@/lib/date-utils";


function fmt(n: number) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

function computeMemberStatus(
  memberStatus: string,
  plan: PurchasedPlan | null
): { status: "Active" | "Frozen" | "Expiring Soon" | "Expired" | "Exhausted" | "Cancelled"; daysLeft: number | null } {
  if (memberStatus === "cancelled" || plan?.status === "cancelled") {
    return { status: "Cancelled", daysLeft: null };
  }

  if (memberStatus === "frozen" || plan?.status === "frozen" || (plan as any)?.freeze_status === "frozen") {
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
    Active: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    paid: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    Frozen: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    "Expiring Soon": "bg-amber-500/10 text-amber-500 border-amber-500/20",
    due: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    Expired: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    Exhausted: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    Cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
  };

  const label = status === "paid" ? "Paid" : status === "due" ? "Payment Due" : status;

  return (
    <span
      className={`inline-block whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
        styles[status] || "bg-gray-500/10 text-gray-400 border-gray-500/20"
      }`}
    >
      {label}
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

  // Selected bill detail modal
  const [selectedInvoice, setSelectedInvoice] = useState<FullInvoiceRecord | null>(null);

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

  // Member History Modal states
  const [historyMember, setHistoryMember] = useState<ApprovedMember | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [historyClassFilter, setHistoryClassFilter] = useState("All");
  const [historyInstructorFilter, setHistoryInstructorFilter] = useState("All");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<"All" | "Attended" | "No Show" | "Cancelled" | "Booked">("All");

  // Trial member conversion state
  const [convertTrialId, setConvertTrialId] = useState<string | null>(null);

  const handleOpenHistory = async (member: ApprovedMember) => {
    setHistoryMember(member);
    setHistoryLoading(true);
    setHistoryStartDate("");
    setHistoryEndDate("");
    setHistoryClassFilter("All");
    setHistoryInstructorFilter("All");
    setHistoryStatusFilter("All");
    try {
      const res = await fetch(`/api/admin/members/${member.id}/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryLogs(data.history || []);
      } else {
        setHistoryLogs([]);
      }
    } catch (_) {
      setHistoryLogs([]);
    } finally {
      setHistoryLoading(false);
    }
  };


  // Fetch all members with purchased plans and profile info
  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/admin/members", { cache: "no-store", headers });
      const data = await res.json();
      if (res.ok && Array.isArray(data.members)) {
        startTransition(() => {
          setMembers(data.members);
          setLoading(false);
        });
        return;
      }
      console.warn("[Members] API failed, falling back to direct query:", data?.error);
    } catch (apiErr) {
      console.error("[Members] API fetch error, falling back:", apiErr);
    }

    try {
      const { data: approvedData } = await supabase
        .from("approved_members")
        .select("*")
        .order("created_at", { ascending: false });

      if (!approvedData) {
        setMembers([]);
        setLoading(false);
        return;
      }

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("email, avatar_url");
      const avatarMap = new Map(
        profilesData
          ?.filter((p) => p && p.email)
          .map((p) => [p.email.toLowerCase(), p.avatar_url]) || []
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

      const fullMembersList: ApprovedMember[] = approvedData.map((m) => {
        const mPlans = plansByMember.get(m.id) || [];
        const activeP = mPlans.find((p) => p.status === "active" || p.status === "frozen") || mPlans[0] || null;
        const computed = computeMemberStatus(m.membership_status, activeP);
        return {
          ...m,
          avatar_url: m.email ? avatarMap.get(m.email.toLowerCase()) || null : null,
          activePlan: activeP,
          allPlans: mPlans,
          latestInvoice: null,
          computedStatus: computed.status,
          daysLeft: computed.daysLeft,
        };
      });

      startTransition(() => {
        setMembers(fullMembersList);
        setLoading(false);
      });
    } catch (err) {
      console.error("fetchMembers fallback error:", err);
      setLoading(false);
    }
  }, [supabase]);

  // Initial load on mount
  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Booking History Modal State
  const [showBookingHistoryModal, setShowBookingHistoryModal] = useState(false);
  const [bookingHistoryLoading, setBookingHistoryLoading] = useState(false);
  const [allBookingsForHistory, setAllBookingsForHistory] = useState<any[]>([]);
  const [allClassesForHistory, setAllClassesForHistory] = useState<any[]>([]);
  const [allAttendanceForHistory, setAllAttendanceForHistory] = useState<any[]>([]);
  const [selectedClassIdForHistory, setSelectedClassIdForHistory] = useState<string>("ALL");
  const [bookingHistorySearch, setBookingHistorySearch] = useState<string>("");
  const [bookingHistoryStatusFilter, setBookingHistoryStatusFilter] = useState<string>("ALL");

  const openBookingHistoryModal = async () => {
    setShowBookingHistoryModal(true);
    setBookingHistoryLoading(true);
    try {
      const [bkRes, clsRes, attRes] = await Promise.all([
        fetch("/api/admin/bookings", { cache: "no-store" }),
        supabase.from("classes").select("*").order("class_date", { ascending: false }),
        supabase.from("attendance").select("*"),
      ]);

      const bkData = await bkRes.json();
      if (bkRes.ok && bkData?.bookings) {
        setAllBookingsForHistory(bkData.bookings);
      }
      if (clsRes.data) {
        setAllClassesForHistory(clsRes.data);
      }
      if (attRes.data) {
        setAllAttendanceForHistory(attRes.data);
      }
    } catch (err) {
      console.error("Failed to load booking history:", err);
    } finally {
      setBookingHistoryLoading(false);
    }
  };

  function computeBookingHistoryStatus(bk: any, attendanceList: any[]) {
    const memberEmail = (bk.approved_members?.email || bk.member_email || "").toLowerCase();
    const approvedId = bk.approved_members?.id;

    const isAttended =
      bk.booking_status === "checked_in" ||
      bk.booking_status === "attended" ||
      bk.attendance_status === "present" ||
      attendanceList.some((a) => {
        if (a.attendance_status !== "attended") return false;
        if (a.booking_id === bk.id) return true;
        if (a.class_id === bk.class_id || a.class_id === bk.classes?.id) {
          if (a.member_id === bk.member_id || a.member_id === approvedId) return true;
          if (memberEmail && (a.email || "").toLowerCase() === memberEmail) return true;
        }
        return false;
      });

    if (isAttended) {
      return {
        status: "Attended",
        color: "bg-green-500/10 text-green-600 border-green-500/20",
        creditStatus: "Credit Deducted (Attended)",
        creditColor: "text-amber-700 bg-amber-50 dark:bg-amber-950/30",
        icon: "✓",
      };
    }

    if (bk.booking_status === "cancelled") {
      return {
        status: "Cancelled",
        color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
        creditStatus: "Credit Restored (Cancelled)",
        creditColor: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30",
        icon: "↩",
      };
    }

    // Check if class passed + 1 hour without QR scan -> No Show
    let isPastClass = false;
    if (bk.classes?.class_date && bk.classes?.class_time) {
      const iso = `${bk.classes.class_date}T${bk.classes.class_time}`;
      const classStart = new Date(iso).getTime();
      if (Date.now() >= classStart + 60 * 60 * 1000) {
        isPastClass = true;
      }
    }

    if (isPastClass) {
      return {
        status: "No Show",
        color: "bg-red-500/10 text-red-600 border-red-500/20",
        creditStatus: "Credit Deducted (No Show)",
        creditColor: "text-red-700 bg-red-50 dark:bg-red-950/30",
        icon: "✕",
      };
    }

    return {
      status: "Booked",
      color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      creditStatus: "Credit Reserved (Booked)",
      creditColor: "text-blue-700 bg-blue-50 dark:bg-blue-950/30",
      icon: "📅",
    };
  }

  // Handle URL prefill params
  useEffect(() => {
    const prefillName = searchParams.get("prefill_name");
    const prefillEmail = searchParams.get("prefill_email");
    const prefillPhone = searchParams.get("prefill_phone");
    const trialId = searchParams.get("convert_trial_id") || searchParams.get("trial_id");
    const refCode = searchParams.get("referral_code");
    const refName = searchParams.get("referrer_name");
    const refEmail = searchParams.get("referrer_email");

    if (prefillName || prefillEmail || prefillPhone || trialId) {
      setFormName(prefillName || "");
      setFormEmail(prefillEmail || "");
      setFormPhone(prefillPhone || "");
      if (trialId) setConvertTrialId(trialId);
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
    setConvertTrialId(null);
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
        const matchesName = (m.full_name || "").toLowerCase().includes(q);
        const matchesEmail = (m.email || "").toLowerCase().includes(q);
        const matchesPhone = (m.phone_number || "").toLowerCase().includes(q);
        const matchesId = (m.id || "").toLowerCase().includes(q);

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

    const cleanEmail = formEmail.trim().toLowerCase();

    // Clean out any stale profiles or historical records if re-adding a previously deleted member
    try {
      await supabase.from("profiles").delete().ilike("email", cleanEmail);
      await supabase.from("approved_members").delete().ilike("email", cleanEmail);
      await supabase.from("member_purchased_plans").delete().ilike("email", cleanEmail);
      await supabase.from("membership_freezes").delete().ilike("member_email", cleanEmail);
      await supabase.from("freeze_requests").delete().ilike("member_email", cleanEmail);
      await supabase.from("bookings").delete().ilike("member_email", cleanEmail);
      await supabase.from("attendance").delete().ilike("email", cleanEmail);
      await supabase.from("referral_codes").delete().ilike("member_email", cleanEmail);
    } catch (_) {}

    const { data: insertedMember, error: insertError } = await supabase
      .from("approved_members")
      .insert({
        full_name: formName.trim(),
        email: cleanEmail,
        phone_number: formPhone.replace(/\D/g, ""),
        membership_status: formStatus,
        membership_level: formLevel,
      })
      .select("id")
      .single();

    if (insertError) {
      setFormError(insertError.message);
      setFormLoading(false);
      return;
    }

    if (convertTrialId && insertedMember?.id) {
      try {
        await fetch("/api/admin/trial-members/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trial_id: convertTrialId, member_id: insertedMember.id }),
        });
      } catch (err) {
        console.error("Failed to mark trial as converted:", err);
      }
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

    const updateObj: Record<string, any> = {
      freeze_status: newStatus === "frozen" ? "frozen" : "active",
    };

    let { error } = await supabase
      .from("approved_members")
      .update({ ...updateObj, membership_status: newStatus })
      .eq("id", member.id);

    if (error && error.message.includes("check constraint")) {
      // Fallback if legacy check constraint blocks setting membership_status to 'frozen'
      const fallbackRes = await supabase
        .from("approved_members")
        .update(updateObj)
        .eq("id", member.id);
      error = fallbackRes.error;
    }

    if (member.activePlan?.id && !member.activePlan.id.startsWith("assigned-")) {
      await supabase
        .from("member_purchased_plans")
        .update({
          status: newStatus === "frozen" ? "frozen" : "active",
          freeze_status: newStatus === "frozen" ? "frozen" : "active",
        })
        .eq("id", member.activePlan.id);
    }

    if (error) {
      setActionError(`Failed to update status: ${error.message}`);
    } else {
      await fetchMembers();
      if (selectedMember?.id === member.id) {
        setSelectedMember((prev) => (prev ? { ...prev, membership_status: newStatus, freeze_status: newStatus === "frozen" ? "frozen" : "active" } : null));
      }
    }
    setTogglingId(null);
  }

  // Open Drawer Details for Selected Member (loads session logs & relational billing history!)
  async function handleOpenDetails(member: ApprovedMember) {
    setSelectedMember(member);
    setSelectedReferral(null);

    // 1. Fetch attendance session logs
    const { data: logs } = await supabase
      .from("attendance")
      .select("id, scanned_at, attendance_status, classes(title)")
      .eq("member_id", member.id)
      .order("scanned_at", { ascending: false })
      .limit(10);

    // 2. Fetch referral info
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

    // 3. Relational query: fetch all completed bills for this member (newest first)
    const { data: custData } = await supabase
      .from("customers")
      .select("id")
      .eq("approved_member_id", member.id);

    const custIds = custData?.map((c) => c.id).filter(Boolean) || [];

    let fullBillingHistory: FullInvoiceRecord[] = [];

    if (custIds.length > 0) {
      const { data: invoicesData } = await supabase
        .from("invoices")
        .select("*")
        .in("customer_id", custIds)
        .order("created_at", { ascending: false });

      if (invoicesData && invoicesData.length > 0) {
      const invIds = invoicesData.map((inv) => inv.id);
      const createdByIds = [...new Set(invoicesData.map((inv) => inv.created_by).filter(Boolean))];

      // Fetch invoice line items
      const { data: itemsData } = await supabase
        .from("invoice_items")
        .select("*")
        .in("invoice_id", invIds);

      // Fetch staff member names who created the bills
      const profilesMap = new Map<string, string>();
      if (createdByIds.length > 0) {
        const { data: staffProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", createdByIds);
        if (staffProfiles) {
          staffProfiles.forEach((p) => {
            profilesMap.set(p.id, p.full_name || p.email);
          });
        }
      }

      const itemsByInvMap = new Map<string, InvoiceItemDetail[]>();
      if (itemsData) {
        itemsData.forEach((it) => {
          const list = itemsByInvMap.get(it.invoice_id) || [];
          list.push(it as InvoiceItemDetail);
          itemsByInvMap.set(it.invoice_id, list);
        });
      }

      fullBillingHistory = invoicesData.map((inv) => ({
        ...inv,
        created_by_name: inv.created_by ? profilesMap.get(inv.created_by) || "Super Admin" : "Super Admin",
        items: itemsByInvMap.get(inv.id) || [],
      }));
    }
  }

    // 4. Fetch active discount for member
    let activeDisc = null;
    try {
      const res = await fetch(`/api/admin/discounts?member_id=${member.id}`);
      const data = await res.json();
      activeDisc = data.activeDiscount || null;
    } catch (e) {
      console.error("Failed to load active discount in member details:", e);
    }

    setSelectedMember((prev) => (prev ? {
      ...prev,
      sessionLogs: formattedLogs,
      billingHistory: fullBillingHistory,
      activeDiscount: activeDisc,
    } : null));
  }

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Top Title & Add Member Trigger */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-text-primary">
            View <span className="font-semibold">Members</span>
          </h1>
          <p className="text-sm text-text-secondary/60 mt-0.5">
            Manage approved members, assigned packages, remaining sessions &amp; billing history
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openBookingHistoryModal}
            className="px-4 py-2.5 rounded-xl bg-surface-2 border border-line text-fg font-semibold text-sm hover:bg-hover transition-colors flex items-center gap-2"
          >
            <span>📊</span>
            <span>Booking History</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
            className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-2 transition-colors shadow-md"
          >
            {showForm ? "Cancel" : "+ Add Member"}
          </button>
        </div>
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
        <div className="bg-surface rounded-2xl p-4 border border-border-input shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-text-secondary/50 uppercase tracking-wide">
              Active Subscriptions
            </p>
            <p className="text-2xl font-bold text-text-primary mt-1">{metrics.activeSubs}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-base">
            ✓
          </div>
        </div>

        <div className="bg-surface rounded-2xl p-4 border border-border-input shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-text-secondary/50 uppercase tracking-wide">
              Expiring This Week
            </p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{metrics.expiringThisWeek}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-base">
            !
          </div>
        </div>

        <div className="bg-surface rounded-2xl p-4 border border-border-input shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-text-secondary/50 uppercase tracking-wide">
              Sessions Remaining
            </p>
            <p className="text-2xl font-bold text-indigo-700 mt-1">{metrics.sessionsRemainingTotal}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-base">
            ⌛
          </div>
        </div>

        <div className="bg-surface rounded-2xl p-4 border border-border-input shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-text-secondary/50 uppercase tracking-wide">
              Total Members
            </p>
            <p className="text-2xl font-bold text-text-primary mt-1">{metrics.totalMembers}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-surface-2 text-text-gold flex items-center justify-center font-bold text-base">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Add Member Form Collapsible */}
      {showForm && (
        <div className="bg-surface rounded-2xl border border-border-input p-6 shadow-sm animate-slide-up max-w-xl">
          <h3 className="text-base font-serif text-text-primary mb-4">Add New Member</h3>
          {formError && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg mb-3">{formError}</p>}
          <form onSubmit={handleAddMember} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary/70 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className="w-full px-4 py-2.5 rounded-xl border border-border-input bg-surface-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-text-gold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary/70 mb-1">Email Address *</label>
              <input
                type="email"
                required
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="priya@example.com"
                className="w-full px-4 py-2.5 rounded-xl border border-border-input bg-surface-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-text-gold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary/70 mb-1">Phone Number *</label>
              <input
                type="tel"
                required
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="9876543210"
                className="w-full px-4 py-2.5 rounded-xl border border-border-input bg-surface-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-text-gold"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 rounded-xl border border-border-input text-text-secondary/70 text-sm font-medium hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formLoading}
              >
                {formLoading ? "Saving..." : "Add Member"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Real-time Search & Status Filter Control Bar */}
      <div className="bg-surface rounded-2xl border border-border-input p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary/40"
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
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border-input bg-surface-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-1 focus:ring-text-gold"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary/40 hover:text-text-primary"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status Filter Dropdown */}
        <div className="relative flex-shrink-0 w-full sm:w-auto">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="w-full sm:w-56 px-4 py-2.5 rounded-xl border border-border-input bg-surface text-sm font-medium text-text-primary flex items-center justify-between shadow-sm hover:border-border-gold"
          >
            <span>{statusFilter}</span>
            <svg
              className={`w-4 h-4 text-text-secondary/40 transition-transform ${showFilterDropdown ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showFilterDropdown && (
            <div className="absolute right-0 mt-1 w-full sm:w-56 bg-surface rounded-xl border border-border-input shadow-xl z-30 py-1 overflow-hidden">
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
                      ? "bg-surface-2 text-text-gold font-bold"
                      : "text-text-secondary hover:bg-surface-2"
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
      <div className="bg-surface rounded-2xl border border-border-input overflow-hidden shadow-sm">
        {loading || isPending ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-border-gold/30 border-t-border-gold rounded-full animate-spin" />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-3 text-text-secondary/30 text-xl font-bold">
              🔍
            </div>
            <p className="text-sm font-semibold text-text-primary">No members found</p>
            <p className="text-xs text-text-secondary/50 mt-1">
              Try adjusting your search query or status filter.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-hidden">
            <table className="w-full text-[11px] text-left">
              <thead>
                <tr className="bg-surface-2 border-b border-border-input text-text-secondary/60 font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-2.5">Member</th>
                  <th className="py-2.5 px-2">Package / Plan</th>
                  <th className="py-2.5 px-2">Category</th>
                  <th className="py-2.5 px-2">Sessions</th>
                  <th className="py-2.5 px-2">Start Date</th>
                  <th className="py-2.5 px-2">End Date</th>
                  <th className="py-2.5 px-2">Days Left</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-input/50">
                {filteredMembers.map((m) => {
                  const plan = m.activePlan;

                  return (
                    <tr key={m.id} className="hover:bg-surface-2/50 transition-colors">
                      {/* Member column */}
                      <td className="py-2.5 px-2.5 font-medium text-text-primary">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full overflow-hidden border border-border-input bg-surface-2 flex-shrink-0 flex items-center justify-center font-bold text-text-secondary text-xs">
                            {m.avatar_url ? (
                              <img src={m.avatar_url} alt={m.full_name} className="w-full h-full object-cover" />
                            ) : (
                              m.full_name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-xs leading-tight text-text-primary truncate">{m.full_name}</p>
                            <p className="text-[10px] text-text-secondary/50 mt-0.5">{m.phone_number}</p>
                          </div>
                        </div>
                      </td>

                      {/* Package / Plan */}
                      <td className="py-2.5 px-2 font-semibold text-text-primary max-w-[140px] truncate">
                        {plan ? plan.plan_name : <span className="text-text-secondary/40 font-normal italic">No plan</span>}
                      </td>

                      {/* Category */}
                      <td className="py-2.5 px-2">
                        {plan ? (
                          <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full bg-surface-2 text-text-gold font-semibold text-[10px] border border-border-input">
                            {plan.category}
                          </span>
                        ) : (
                          <span className="text-text-secondary/30">—</span>
                        )}
                      </td>

                      {/* Classes / Sessions */}
                      <td className="py-2.5 px-2">
                        {plan ? (
                          (() => {
                            const sessInfo = formatSessionsDisplay(plan);
                            return (
                              <span
                                className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-lg font-semibold text-[10px] border ${
                                  sessInfo.isSessions
                                    ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                                    : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                }`}
                              >
                                {sessInfo.text}
                              </span>
                            );
                          })()
                        ) : (
                          <span className="text-text-secondary/30">—</span>
                        )}
                      </td>

                      {/* Start Date */}
                      <td className="py-2.5 px-2 text-text-secondary/80 font-sans font-medium text-[11px] whitespace-nowrap">
                        {plan?.valid_from ? formatDate(plan.valid_from) : "—"}
                      </td>

                      {/* End Date */}
                      <td className="py-2.5 px-2 text-text-secondary/80 font-sans font-medium text-[11px] whitespace-nowrap">
                        {plan?.valid_until ? formatDate(plan.valid_until) : "—"}
                      </td>

                      {/* Days Left & Classes Left */}
                      <td className="py-2.5 px-2">
                        {m.daysLeft !== null && m.daysLeft !== undefined ? (
                          <div className={`inline-flex flex-col items-center justify-center text-center px-2 py-1 rounded-xl font-semibold text-[10px] border ${
                            m.daysLeft <= 7
                              ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          }`}>
                            <div>{m.daysLeft}d left</div>
                            <div className="text-[9px] opacity-80 mt-0.5 font-bold border-t border-current/10 pt-0.5 w-full">
                              {plan ? (
                                plan.sessions_total !== null && plan.sessions_total !== undefined
                                  ? `${plan.sessions_remaining ?? 0} left`
                                  : "Unlimited"
                              ) : "0 left"}
                            </div>
                          </div>
                        ) : (
                          <span className="text-text-secondary/30">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-2">
                        <StatusBadge status={m.computedStatus || "Active"} />
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenDetails(m)}
                            className="px-2.5 py-1 rounded-xl bg-accent text-white font-bold text-[11px] hover:bg-accent-2 transition-colors shadow-xs"
                          >
                            Details
                          </button>
                          <button
                            onClick={() => handleOpenHistory(m)}
                            className="px-2.5 py-1 rounded-xl bg-surface-2 border border-line-2 text-fg font-bold text-[11px] hover:bg-hover transition-colors shadow-xs"
                          >
                            History
                          </button>
                        </div>
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
            className="w-full max-w-lg bg-surface h-full shadow-2xl overflow-y-auto p-6 space-y-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-input pb-4">
              <div>
                <h2 className="text-lg font-serif text-text-primary">Member Details</h2>
                <p className="text-xs text-text-secondary/50 font-mono">ID: {selectedMember.id.slice(0, 8)}</p>
              </div>
              <button
                onClick={() => setSelectedMember(null)}
                className="w-8 h-8 rounded-full bg-surface-2 text-text-secondary hover:bg-hover flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Member Profile Hero */}
            <div className="flex items-center gap-4 bg-surface-2 p-4 rounded-2xl border border-border-input">
              <div className="w-12 h-12 rounded-full overflow-hidden border border-border-input bg-surface flex items-center justify-center font-bold text-lg text-text-secondary">
                {selectedMember.avatar_url ? (
                  <img src={selectedMember.avatar_url} alt={selectedMember.full_name} className="w-full h-full object-cover" />
                ) : (
                  selectedMember.full_name.charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <h3 className="font-semibold text-text-primary text-base">{selectedMember.full_name}</h3>
                <p className="text-xs text-text-secondary/60">{selectedMember.phone_number}</p>
                <p className="text-xs text-text-secondary/60">{selectedMember.email}</p>
              </div>
            </div>

            {/* Package Info Card */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Package Info</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-2 p-3 rounded-xl border border-border-input">
                  <span className="text-[10px] text-text-secondary/50 block">Package</span>
                  <span className="text-xs font-bold text-text-primary">
                    {selectedMember.activePlan?.plan_name || <span className="font-normal italic text-text-secondary/50">No package selected</span>}
                  </span>
                </div>
                <div className="bg-surface-2 p-3 rounded-xl border border-border-input">
                  <span className="text-[10px] text-text-secondary/50 block">Classes / Sessions</span>
                  <span className="text-xs font-bold text-text-primary">
                    {selectedMember.activePlan ? formatSessionsDisplay(selectedMember.activePlan).text : "No Sessions"}
                  </span>
                </div>
                <div className="bg-surface-2 p-3 rounded-xl border border-border-input">
                  <span className="text-[10px] text-text-secondary/50 block">Start Date</span>
                  <span className="text-xs font-bold text-text-primary">
                    {selectedMember.activePlan?.valid_from ? formatDate(selectedMember.activePlan.valid_from) : "N/A"}
                  </span>
                </div>
                <div className="bg-surface-2 p-3 rounded-xl border border-border-input">
                  <span className="text-[10px] text-text-secondary/50 block">End Date</span>
                  <span className="text-xs font-bold text-text-primary">
                    {selectedMember.activePlan?.valid_until ? formatDate(selectedMember.activePlan.valid_until) : "N/A"}
                  </span>
                </div>
              </div>
            </div>

            {/* Validity Status Highlight */}
            <div className={`p-3.5 rounded-2xl flex items-center justify-between border ${
              selectedMember.activePlan
                ? "bg-emerald-500/10 border-emerald-500/20"
                : "bg-surface-2 border-border-input"
            }`}>
              <div>
                <span className="text-[11px] font-bold text-emerald-500 block uppercase tracking-wider">Validity Status</span>
                <span className="text-sm font-extrabold text-text-primary mt-0.5 block">
                  {selectedMember.activePlan
                    ? (selectedMember.daysLeft !== null && selectedMember.daysLeft !== undefined
                        ? `${selectedMember.daysLeft} days remaining`
                        : "Active Plan")
                    : "No Active Plan (Pending Billing)"}
                </span>
              </div>
              <StatusBadge status={selectedMember.activePlan ? (selectedMember.computedStatus || "Active") : "No Package"} />
            </div>

            {/* Active Member Discount Card */}
            {selectedMember.activeDiscount ? (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M17 17h.01M7 7l10 10M7 7a4 4 0 115.657 5.657M17 17a4 4 0 11-5.657-5.657" />
                    </svg>
                    Active Member Discount
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500 text-white shadow-xs">
                    {selectedMember.activeDiscount.discount_type === "percentage"
                      ? `${selectedMember.activeDiscount.discount_value}% OFF`
                      : `₹${selectedMember.activeDiscount.discount_value.toLocaleString("en-IN")} OFF`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-text-secondary/70 font-medium">
                    Reason: <strong className="text-text-primary">{selectedMember.activeDiscount.reason}</strong> ({selectedMember.activeDiscount.source})
                  </span>
                  <span className="text-[10px] text-emerald-500 font-bold">Auto-Applies on Next Bill</span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-surface-2 border border-border-input flex items-center justify-between text-xs text-text-secondary/70">
                <span>Active Discount: <span className="font-semibold text-text-secondary">No Active Discount</span></span>
                <Link
                  href="/admin/discounts"
                  className="text-xs text-text-gold font-bold hover:underline"
                >
                  + Add Discount
                </Link>
              </div>
            )}

            {/* ─── DEDICATED BILLING HISTORY SECTION ──────────────────────────── */}
            <div className="space-y-3 pt-2 border-t border-border-input">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  <span>Billing History</span>
                  {selectedMember.billingHistory && selectedMember.billingHistory.length > 0 && (
                    <span className="bg-bg-button text-white text-[10px] px-2 py-0.5 rounded-full font-sans">
                      {selectedMember.billingHistory.length}
                    </span>
                  )}
                </h4>
                <span className="text-[11px] text-text-secondary/40 font-medium">Newest first</span>
              </div>

              {selectedMember.billingHistory && selectedMember.billingHistory.length > 0 ? (
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {selectedMember.billingHistory.map((inv) => (
                    <div
                      key={inv.id}
                      onClick={() => setSelectedInvoice(inv)}
                      className="p-3.5 rounded-xl bg-surface-2 border border-border-input hover:border-border-gold transition-all cursor-pointer space-y-2 group shadow-2xs"
                    >
                      {/* Row Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-text-primary group-hover:text-text-gold transition-colors">
                            {inv.invoice_number}
                          </span>
                          <StatusBadge status={inv.payment_status} />
                        </div>
                        <span className="text-[11px] text-text-secondary/50">
                          {formatDate(inv.created_at)}
                        </span>
                      </div>

                      {/* Items Summary */}
                      <div className="space-y-1">
                        {inv.items && inv.items.length > 0 ? (
                          inv.items.map((it) => (
                            <div key={it.id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 truncate pr-2">
                                <span className="font-medium text-text-primary truncate">{it.name}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-text-gold border border-border-input font-semibold flex-shrink-0">
                                  {it.category}
                                </span>
                              </div>
                              <span className="font-semibold text-text-secondary flex-shrink-0">
                                x{it.quantity} • {fmt(it.total_price)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-text-primary">Pilates Plan</span>
                            <span className="font-semibold text-text-secondary">{fmt(inv.grand_total)}</span>
                          </div>
                        )}

                        {inv.discount_amount > 0 && (
                          <div className="flex items-center justify-between text-xs text-emerald-500 font-bold bg-emerald-500/10 px-2 py-1 rounded-lg mt-1">
                            <span>Discount Applied ({inv.discount_type === "percentage" ? `${inv.discount_value}% OFF` : fmt(inv.discount_value)})</span>
                            <span>− {fmt(inv.discount_amount)}</span>
                          </div>
                        )}
                      </div>

                      {/* Payment & Staff Info Footer */}
                      <div className="flex items-center justify-between text-[11px] text-text-secondary/60 pt-1.5 border-t border-border-input/60">
                        <div className="flex items-center gap-2">
                          <span>Paid via <strong className="text-text-primary">{inv.payment_method || "UPI"}</strong></span>
                          <span>•</span>
                          <span>Staff: <strong className="text-text-primary">{inv.created_by_name}</strong></span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-text-primary text-xs leading-none block">
                            {fmt(inv.grand_total)}
                          </span>
                          {inv.payment_status === "due" && (
                            <span className="text-[10px] text-amber-500 font-bold block mt-0.5">
                              Paid: {fmt(inv.amount_paid || 0)} • Due: {fmt(inv.grand_total - (inv.amount_paid || 0))}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 px-4 bg-surface-2 rounded-xl border border-border-input">
                  <p className="text-xs text-text-secondary/50">No completed bills recorded for this member yet</p>
                  <p className="text-[10px] text-text-secondary/40 mt-1">Completed bills from POS will automatically sync here</p>
                </div>
              )}
            </div>

            {/* Session Logs */}
            <div className="space-y-3 pt-2 border-t border-border-input">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Session Logs</h4>
              {selectedMember.sessionLogs && selectedMember.sessionLogs.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {selectedMember.sessionLogs.map((log) => (
                    <div key={log.id} className="text-xs p-2.5 rounded-xl bg-surface-2 border border-border-input flex justify-between">
                      <span className="font-semibold text-text-primary">{log.classes?.title || "Pilates Session"}</span>
                      <span className="text-text-secondary/50 font-mono">{new Date(log.scanned_at).toLocaleDateString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-secondary/40 bg-surface-2 p-3 rounded-xl border border-border-input text-center">
                  No session logs recorded yet
                </p>
              )}
            </div>

            {/* Actions Panel */}
            <div className="space-y-2 pt-2 border-t border-border-input">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Actions</h4>

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

      {/* ─── BILL DETAILS SUB-MODAL ────────────────────────────────────────────── */}
      {selectedInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in"
          onClick={() => setSelectedInvoice(null)}
        >
          <div
            className="bg-surface rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl border border-border-input max-h-[90vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border-input pb-4">
              <div>
                <span className="text-[10px] font-bold text-text-gold uppercase tracking-widest block">
                  Invoice Details
                </span>
                <h3 className="text-lg font-serif text-text-primary font-bold">
                  {selectedInvoice.invoice_number}
                </h3>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="w-8 h-8 rounded-full bg-surface-2 text-text-secondary hover:bg-hover flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Invoice Meta Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-surface-2 p-4 rounded-2xl border border-border-input">
              <div>
                <span className="text-[10px] text-text-secondary/50 block font-medium">Bill Date &amp; Time</span>
                <span className="font-semibold text-text-primary">
                  {formatDateTime(selectedInvoice.created_at)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-text-secondary/50 block font-medium">Created By Staff</span>
                <span className="font-semibold text-text-primary">
                  {selectedInvoice.created_by_name || "Super Admin"}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-text-secondary/50 block font-medium">Member Name</span>
                <span className="font-semibold text-text-primary">{selectedInvoice.customer_name}</span>
              </div>
              <div>
                <span className="text-[10px] text-text-secondary/50 block font-medium">Payment Status</span>
                <StatusBadge status={selectedInvoice.payment_status} />
              </div>
            </div>

            {/* Purchased Items List Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">
                Purchased Items ({selectedInvoice.items?.length || 0})
              </h4>
              <div className="border border-border-input rounded-2xl overflow-hidden bg-surface">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-surface-2 border-b border-border-input text-text-secondary/60 font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Item Name</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-input/50">
                    {selectedInvoice.items && selectedInvoice.items.length > 0 ? (
                      selectedInvoice.items.map((it) => (
                        <tr key={it.id}>
                          <td className="py-2.5 px-3 font-semibold text-text-primary">{it.name}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-surface-2 text-text-gold font-medium text-[10px] border border-border-input">
                              {it.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold">{it.quantity}</td>
                          <td className="py-2.5 px-3 text-right text-text-secondary/80">{fmt(it.unit_price)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-text-primary">{fmt(it.total_price)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-text-secondary/50 text-xs">
                          No line items found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="space-y-2 bg-surface-2 p-4 rounded-2xl border border-border-input text-xs">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                Payment Information
              </h4>
              <div className="flex justify-between text-text-secondary/70">
                <span>Subtotal</span>
                <span className="font-semibold text-text-primary">{fmt(selectedInvoice.subtotal)}</span>
              </div>
              {selectedInvoice.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Discount ({selectedInvoice.discount_type === "percentage" ? `${selectedInvoice.discount_value}%` : fmt(selectedInvoice.discount_value)})</span>
                  <span>− {fmt(selectedInvoice.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-text-secondary/70">
                <span>Tax / GST</span>
                <span>₹0 (Included)</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border-input font-bold text-sm text-text-primary">
                <span>Grand Total Paid</span>
                <span className="text-text-gold text-base">{fmt(selectedInvoice.grand_total)}</span>
              </div>

              <div className="pt-2 border-t border-border-input grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-text-secondary/50 block">Payment Method</span>
                  <span className="font-semibold text-text-primary">{selectedInvoice.payment_method || "UPI"}</span>
                </div>
                {selectedInvoice.transaction_reference && (
                  <div>
                    <span className="text-text-secondary/50 block">Transaction Ref / UTR</span>
                    <span className="font-mono font-semibold text-text-primary">{selectedInvoice.transaction_reference}</span>
                  </div>
                )}
              </div>

              {selectedInvoice.notes && (
                <div className="pt-2 border-t border-border-input text-[11px]">
                  <span className="text-text-secondary/50 block">Notes</span>
                  <p className="text-text-primary italic">{selectedInvoice.notes}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-5 py-2 rounded-xl bg-bg-button text-white text-xs font-semibold hover:bg-bg-button-hover"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {deletingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-surface rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-red-700">Delete Member?</h3>
            <p className="text-xs text-text-secondary/70">
              Type <span className="font-semibold">{deletingMember.email}</span> to confirm permanent deletion.
            </p>
            <input
              type="text"
              value={deleteConfirmEmail}
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
              placeholder={deletingMember.email}
              className="w-full px-3 py-2 rounded-xl border border-border-input bg-surface-2 text-xs font-mono text-text-primary"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setDeletingMember(null)}
                className="flex-1 py-2 rounded-xl border border-border-input text-xs font-semibold text-text-secondary"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (deleteConfirmEmail.trim().toLowerCase() !== deletingMember.email.trim().toLowerCase()) {
                    setActionError("Entered email does not match member email.");
                    return;
                  }

                  setDeleteLoading(true);
                  setActionError(null);
                  try {
                    const memId = deletingMember.id;
                    const memEmail = deletingMember.email.trim().toLowerCase();

                    // Note: Billing data (invoices, invoice_items, customers) is PERMANENTLY PRESERVED for financial accuracy & monthly revenue accounting.
                    
                    // 1. Delete member profiles, plans, freezes, freeze requests, bookings, attendance, PT, referrals, notifications
                    try { await supabase.from("profiles").delete().ilike("email", memEmail); } catch (e) {}
                    try { await supabase.from("member_purchased_plans").delete().or(`approved_member_id.eq.${memId},email.ilike.${memEmail}`); } catch (e) {}
                    try { await supabase.from("membership_freezes").delete().or(`member_id.eq.${memId},member_email.ilike.${memEmail}`); } catch (e) {}
                    try { await supabase.from("freeze_requests").delete().or(`member_id.eq.${memId},member_email.ilike.${memEmail}`); } catch (e) {}
                    try { await supabase.from("bookings").delete().or(`member_id.eq.${memId},member_email.ilike.${memEmail}`); } catch (e) {}
                    try { await supabase.from("attendance").delete().or(`member_id.eq.${memId},email.ilike.${memEmail}`); } catch (e) {}
                    try { await supabase.from("pt_sessions").delete().eq("member_id", memId); } catch (e) {}
                    try { await supabase.from("pt_assignments").delete().eq("member_id", memId); } catch (e) {}
                    try { await supabase.from("referral_codes").delete().ilike("member_email", memEmail); } catch (e) {}
                    try { await supabase.from("referral_requests").delete().or(`referrer_email.ilike.${memEmail},referee_email.ilike.${memEmail}`); } catch (e) {}
                    try { await supabase.from("admin_notifications").delete().ilike("email", memEmail); } catch (e) {}

                    // 2. Delete approved_members record
                    const { error: deleteErr } = await supabase.from("approved_members").delete().eq("id", memId);
                    if (deleteErr) {
                      await supabase.from("approved_members").delete().ilike("email", memEmail);
                    }

                    setDeletingMember(null);
                    setSelectedMember(null);
                    await fetchMembers();
                  } catch (err: any) {
                    setActionError(err.message || "Failed to delete member completely.");
                  } finally {
                    setDeleteLoading(false);
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

      {/* Member Check-in History Modal */}
      {historyMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-line-2 rounded-2xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line-2 pb-4">
              <div>
                <h3 className="text-lg font-serif font-bold text-fg">
                  Check-in History: {historyMember.full_name}
                </h3>
                <p className="text-xs text-fg-3 mt-0.5">
                  Phone: <span className="font-semibold text-fg-2">{historyMember.phone_number}</span> | Email:{" "}
                  <span className="font-semibold text-fg-2">{historyMember.email}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/members/${historyMember.id}/history`}
                  className="px-3 py-1.5 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-2 transition-colors shadow-xs"
                >
                  Full Page View
                </Link>
                <button
                  onClick={() => setHistoryMember(null)}
                  className="p-1.5 rounded-xl text-fg-3 hover:text-fg hover:bg-hover text-sm font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Filters bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3 rounded-xl bg-surface-2 border border-line-2 text-xs">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3 mb-1">Start Date</label>
                <input
                  type="date"
                  value={historyStartDate}
                  onChange={(e) => setHistoryStartDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-line-2 bg-surface text-fg focus:ring-1 focus:ring-accent outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3 mb-1">End Date</label>
                <input
                  type="date"
                  value={historyEndDate}
                  onChange={(e) => setHistoryEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-line-2 bg-surface text-fg focus:ring-1 focus:ring-accent outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3 mb-1">Class</label>
                <select
                  value={historyClassFilter}
                  onChange={(e) => setHistoryClassFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-line-2 bg-surface text-fg focus:ring-1 focus:ring-accent outline-none"
                >
                  <option value="All">All Classes</option>
                  {Array.from(new Set(historyLogs.map((h) => h.className).filter(Boolean)))
                    .sort()
                    .map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3 mb-1">Instructor</label>
                <select
                  value={historyInstructorFilter}
                  onChange={(e) => setHistoryInstructorFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-line-2 bg-surface text-fg focus:ring-1 focus:ring-accent outline-none"
                >
                  <option value="All">All Instructors</option>
                  {Array.from(new Set(historyLogs.map((h) => h.instructor).filter(Boolean)))
                    .sort()
                    .map((ins) => (
                      <option key={ins} value={ins}>
                        {ins}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3 mb-1">Attendance Status</label>
                <select
                  value={historyStatusFilter}
                  onChange={(e) => setHistoryStatusFilter(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-line-2 bg-surface text-fg focus:ring-1 focus:ring-accent outline-none"
                >
                  <option value="All">All</option>
                  <option value="Attended">Attended</option>
                  <option value="No Show">No Show</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Booked">Booked (Upcoming)</option>
                </select>
              </div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-y-auto min-h-[250px] border border-line-2 rounded-xl bg-surface">
              {historyLoading ? (
                <div className="p-8 flex flex-col items-center justify-center text-fg-3">
                  <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-2" />
                  <p className="text-xs font-semibold">Loading attendance records...</p>
                </div>
              ) : (
                (() => {
                  const filtered = historyLogs.filter((item) => {
                    if (historyStartDate && (!item.date || item.date < historyStartDate)) return false;
                    if (historyEndDate && (!item.date || item.date > historyEndDate)) return false;
                    if (historyClassFilter !== "All" && item.className !== historyClassFilter) return false;
                    if (historyInstructorFilter !== "All" && item.instructor !== historyInstructorFilter) return false;
                    if (historyStatusFilter !== "All" && item.status !== historyStatusFilter) return false;
                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="p-8 text-center text-fg-3 text-xs">
                        No check-in history records found matching filters.
                      </div>
                    );
                  }

                  return (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-line-2 bg-surface-2/60 text-fg-3 uppercase font-bold text-[10px] tracking-wider sticky top-0 bg-surface-2">
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Check-in Time</th>
                          <th className="py-2.5 px-3">Class Name</th>
                          <th className="py-2.5 px-3">Instructor</th>
                          <th className="py-2.5 px-3 text-right">Attendance Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-2 text-fg">
                        {filtered.map((row) => (
                          <tr key={row.id} className="hover:bg-hover/50 transition-colors">
                            <td className="py-2.5 px-3 font-semibold text-fg">{row.date}</td>
                            <td className="py-2.5 px-3 text-fg-2">{row.time}</td>
                            <td className="py-2.5 px-3 font-bold text-fg">{row.className}</td>
                            <td className="py-2.5 px-3 text-fg-2">{row.instructor}</td>
                            <td className="py-2.5 px-3 text-right">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                  row.status === "Attended"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    : row.status === "Cancelled"
                                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                    : row.status === "Booked"
                                    ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                    : "bg-red-500/10 text-red-500 border-red-500/20"
                                }`}
                              >
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setHistoryMember(null)}
                className="px-4 py-2 rounded-xl bg-surface-2 border border-line-2 text-fg text-xs font-bold hover:bg-hover transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ALL CLASSES BOOKING & ATTENDANCE HISTORY MODAL                            */}
      {/* ========================================================================= */}
      {showBookingHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-surface rounded-2xl border border-line p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto space-y-5 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-line pb-4">
              <div>
                <h3 className="text-xl font-bold text-fg flex items-center gap-2">
                  <span>📊</span> Class Booking & Attendance History
                </h3>
                <p className="text-xs text-fg-4 mt-0.5">
                  View full booking status, no-show credit deductions, cancellations, and QR check-ins per class.
                </p>
              </div>
              <button
                onClick={() => setShowBookingHistoryModal(false)}
                className="p-2 rounded-xl bg-surface-2 border border-line text-fg-3 hover:text-fg hover:bg-hover transition-colors"
              >
                ✕
              </button>
            </div>

            {bookingHistoryLoading ? (
              <div className="py-16 text-center">
                <div className="w-8 h-8 border-2 border-accent/30 border-t-text-gold rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs text-fg-4 font-medium">Loading class history & attendance logs…</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Controls Row: Class Selector Dropdown & Search & Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Class Dropdown */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-fg-4 uppercase tracking-wider mb-1">
                      Select Class to Filter
                    </label>
                    <select
                      value={selectedClassIdForHistory}
                      onChange={(e) => setSelectedClassIdForHistory(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-line bg-surface-2 text-sm font-semibold text-fg focus:outline-none focus:border-accent"
                    >
                      <option value="ALL">All Classes (Previous & Upcoming)</option>
                      {allClassesForHistory.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} — {formatDate(c.class_date)} at {formatTime(c.class_time)} ({c.instructor || "Staff"})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Search Member Name/Email */}
                  <div>
                    <label className="block text-xs font-semibold text-fg-4 uppercase tracking-wider mb-1">
                      Search Member
                    </label>
                    <input
                      type="text"
                      placeholder="Search member name or email..."
                      value={bookingHistorySearch}
                      onChange={(e) => setBookingHistorySearch(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-line bg-surface-2 text-sm text-fg focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                {/* Filter Pills & Summary KPIs */}
                {(() => {
                  // Filter bookings by class
                  const filteredByClass = allBookingsForHistory.filter((bk) => {
                    if (selectedClassIdForHistory === "ALL") return true;
                    return bk.class_id === selectedClassIdForHistory || bk.classes?.id === selectedClassIdForHistory;
                  });

                  // Compute details for each
                  const processedBookings = filteredByClass.map((bk) => {
                    const statusInfo = computeBookingHistoryStatus(bk, allAttendanceForHistory);
                    const memberName = bk.approved_members?.full_name || bk.member_email || "Member";
                    const memberEmail = bk.approved_members?.email || bk.member_email || "";
                    return {
                      ...bk,
                      statusInfo,
                      memberName,
                      memberEmail,
                    };
                  });

                  // Filter by status pill and search text
                  const finalBookings = processedBookings.filter((bk) => {
                    if (bookingHistoryStatusFilter !== "ALL" && bk.statusInfo.status !== bookingHistoryStatusFilter) {
                      return false;
                    }
                    if (bookingHistorySearch.trim()) {
                      const q = bookingHistorySearch.toLowerCase();
                      const nameMatch = bk.memberName.toLowerCase().includes(q);
                      const emailMatch = bk.memberEmail.toLowerCase().includes(q);
                      const titleMatch = (bk.classes?.title || "").toLowerCase().includes(q);
                      if (!nameMatch && !emailMatch && !titleMatch) return false;
                    }
                    return true;
                  });

                  // Counts
                  const countAttended = processedBookings.filter((b) => b.statusInfo.status === "Attended").length;
                  const countNoShow = processedBookings.filter((b) => b.statusInfo.status === "No Show").length;
                  const countCancelled = processedBookings.filter((b) => b.statusInfo.status === "Cancelled").length;
                  const countBooked = processedBookings.filter((b) => b.statusInfo.status === "Booked").length;

                  return (
                    <div className="space-y-4">
                      {/* KPI Summary Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <div className="bg-surface-2 p-3 rounded-xl border border-line text-center">
                          <p className="text-[10px] font-semibold text-fg-4 uppercase">Total Bookings</p>
                          <p className="text-xl font-bold text-fg mt-0.5">{processedBookings.length}</p>
                        </div>
                        <div className="bg-green-500/10 p-3 rounded-xl border border-green-500/20 text-center">
                          <p className="text-[10px] font-semibold text-green-600 uppercase">✓ Attended</p>
                          <p className="text-xl font-bold text-green-600 mt-0.5">{countAttended}</p>
                        </div>
                        <div className="bg-red-500/10 p-3 rounded-xl border border-red-500/20 text-center">
                          <p className="text-[10px] font-semibold text-red-600 uppercase">✕ No Show</p>
                          <p className="text-xl font-bold text-red-600 mt-0.5">{countNoShow}</p>
                        </div>
                        <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 text-center">
                          <p className="text-[10px] font-semibold text-amber-600 uppercase">↩ Cancelled</p>
                          <p className="text-xl font-bold text-amber-600 mt-0.5">{countCancelled}</p>
                        </div>
                        <div className="bg-blue-500/10 p-3 rounded-xl border border-blue-500/20 text-center">
                          <p className="text-[10px] font-semibold text-blue-600 uppercase">📅 Upcoming</p>
                          <p className="text-xl font-bold text-blue-600 mt-0.5">{countBooked}</p>
                        </div>
                      </div>

                      {/* Status Filter Buttons */}
                      <div className="flex items-center gap-2 pt-1 overflow-x-auto pb-1">
                        {[
                          { label: "All Status", val: "ALL" },
                          { label: `Attended (${countAttended})`, val: "Attended" },
                          { label: `No Show (${countNoShow})`, val: "No Show" },
                          { label: `Cancelled (${countCancelled})`, val: "Cancelled" },
                          { label: `Upcoming (${countBooked})`, val: "Booked" },
                        ].map((btn) => (
                          <button
                            key={btn.val}
                            onClick={() => setBookingHistoryStatusFilter(btn.val)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                              bookingHistoryStatusFilter === btn.val
                                ? "bg-accent text-white border-accent shadow-xs"
                                : "bg-surface-2 text-fg-3 border-line hover:text-fg"
                            }`}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>

                      {/* Table */}
                      <div className="border border-line rounded-xl overflow-hidden">
                        {finalBookings.length === 0 ? (
                          <div className="py-12 text-center text-fg-4 text-xs">
                            No booking records found for the selected criteria.
                          </div>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead className="bg-surface-2 text-fg-4 uppercase font-semibold border-b border-line">
                              <tr>
                                <th className="py-3 px-4">Member</th>
                                <th className="py-3 px-4">Class Details</th>
                                <th className="py-3 px-4 text-center">Attendance Status</th>
                                <th className="py-3 px-4 text-center">Credit Impact</th>
                                <th className="py-3 px-4 text-right">Date / Time</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line text-fg">
                              {finalBookings.map((bk) => (
                                <tr key={bk.id} className="hover:bg-hover/50 transition-colors">
                                  <td className="py-3 px-4 font-medium">
                                    <div className="font-semibold text-fg">{bk.memberName}</div>
                                    <div className="text-[11px] text-fg-4">{bk.memberEmail}</div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="font-semibold text-fg">{bk.classes?.title || "Class Session"}</div>
                                    <div className="text-[11px] text-fg-4">
                                      {bk.classes?.instructor ? `with ${bk.classes.instructor}` : ""}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${bk.statusInfo.color}`}
                                    >
                                      <span>{bk.statusInfo.icon}</span>
                                      <span>{bk.statusInfo.status}</span>
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span
                                      className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold ${bk.statusInfo.creditColor}`}
                                    >
                                      {bk.statusInfo.creditStatus}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-right text-fg-3 font-mono text-[11px]">
                                    {formatDate(bk.classes?.class_date || bk.created_at)} {formatTime(bk.classes?.class_time || bk.created_at)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-line">
              <button
                onClick={() => setShowBookingHistoryModal(false)}
                className="px-5 py-2 rounded-xl bg-surface-2 border border-line text-fg text-xs font-bold hover:bg-hover transition-colors"
              >
                Close
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
          <div className="w-6 h-6 border-2 border-border-gold/30 border-t-border-gold rounded-full animate-spin" />
        </div>
      }
    >
      <MembersPageContent />
    </Suspense>
  );
}
