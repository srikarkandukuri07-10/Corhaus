"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useLockBody } from "@/lib/useLockBody";
import { createClient } from "@/lib/supabase/client";
import Pagination, { usePagination } from "@/components/pagination";
import { formatDate, formatTime } from "@/lib/date-utils";

import Link from "next/link";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { useRouter } from "next/navigation";
import { TrialSlot, TrialScheduleSettings, DEFAULT_TRIAL_SCHEDULE_SETTINGS } from "@/lib/trialSettings";

interface TrialMember {
  id: string;
  full_name: string;
  phone_number: string;
  email: string | null;
  trial_date: string;
  trial_time: string;
  class_id: string | null;
  class_name: string;
  instructor_id: string | null;
  instructor_name: string;
  status: "Scheduled" | "Attended" | "No Show" | "Converted";
  notes: string | null;
  converted_member_id: string | null;
  converted_at: string | null;
  invoice_id?: string | null;
  created_at: string;
  updated_at: string;
}

interface ClassOption {
  id: string;
  title: string;
  instructor: string;
}

interface StaffOption {
  id: string;
  full_name: string;
}

// Payment references now live in dedicated columns (razorpay_*, invoice_id).
// Older rows stored "Razorpay: pay_… / order_…" inside notes — strip that
// machine text at display time but keep any real staff notes.
function displayTrialNotes(notes: string | null): string | null {
  if (!notes) return null;
  const cleaned = notes
    .replace(/Razorpay:\s*pay_\S+\s*\/\s*order_\S+/g, "")
    .replace(/Trial booked via Razorpay:\s*pay_\S+/g, "")
    .trim();
  return cleaned || null;
}

// Phone numbers are stored inconsistently across this project — 10-digit,
// "917702355344" and "+91 98765 43210" all occur in real rows. A raw substring
// match silently fails across those formats, so compare digits only on both
// sides.
function digitsOnly(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

export default function TrialMembersPage() {
  const supabase = createClient();
  const router = useRouter();

  // Data states
  const [trialMembers, setTrialMembers] = useState<TrialMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Available options for dropdowns
  const [availableClasses, setAvailableClasses] = useState<ClassOption[]>([]);
  const [availableStaff, setAvailableStaff] = useState<StaffOption[]>([]);

  // Slot timings & customization modal states
  const [showSlotSettingsModal, setShowSlotSettingsModal] = useState(false);
  const [slotSettings, setSlotSettings] = useState<TrialScheduleSettings>(DEFAULT_TRIAL_SCHEDULE_SETTINGS);
  const [slotSettingsLoading, setSlotSettingsLoading] = useState(false);
  const [slotSettingsSaving, setSlotSettingsSaving] = useState(false);
  const [slotSettingsSuccess, setSlotSettingsSuccess] = useState<string | null>(null);
  const [slotSettingsError, setSlotSettingsError] = useState<string | null>(null);

  // New slot form state
  const [newSlotLabel, setNewSlotLabel] = useState("");
  const [newSlotValue, setNewSlotValue] = useState("06:00");
  const [newSlotPeriod, setNewSlotPeriod] = useState<"Morning" | "Evening">("Morning");

  async function handleOpenSlotSettings() {
    setShowSlotSettingsModal(true);
    setSlotSettingsLoading(true);
    setSlotSettingsSuccess(null);
    setSlotSettingsError(null);
    try {
      const res = await fetch("/api/admin/trial-settings");
      const json = await res.json();
      if (res.ok && json.settings) {
        setSlotSettings(json.settings);
      }
    } catch (e: any) {
      setSlotSettingsError(e.message || "Failed to load trial settings");
    } finally {
      setSlotSettingsLoading(false);
    }
  }

  async function handleSaveSlotSettings() {
    setSlotSettingsSaving(true);
    setSlotSettingsSuccess(null);
    setSlotSettingsError(null);
    try {
      const res = await fetch("/api/admin/trial-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slotSettings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save settings");
      setSlotSettings(json.settings);
      setSlotSettingsSuccess("Trial class slot timings updated successfully! Changes are immediately live on /book-trial.");
      setTimeout(() => setSlotSettingsSuccess(null), 4000);
    } catch (e: any) {
      setSlotSettingsError(e.message || "Failed to save settings");
    } finally {
      setSlotSettingsSaving(false);
    }
  }

  function handleAddSlot() {
    if (!newSlotLabel.trim() || !newSlotValue) return;
    const newSlot: TrialSlot = {
      id: "slot_" + Date.now(),
      label: newSlotLabel.trim(),
      value: newSlotValue,
      period: newSlotPeriod,
      capacity: 10,
      isActive: true,
    };
    setSlotSettings((prev) => ({
      ...prev,
      slots: [...prev.slots, newSlot],
    }));
    setNewSlotLabel("");
  }

  function handleRemoveSlot(id: string) {
    setSlotSettings((prev) => ({
      ...prev,
      slots: prev.slots.filter((s) => s.id !== id),
    }));
  }

  function handleToggleSlotActive(id: string) {
    setSlotSettings((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s)),
    }));
  }

  function handleToggleDayOfWeek(day: number) {
    setSlotSettings((prev) => {
      const exists = prev.enabledDaysOfWeek.includes(day);
      return {
        ...prev,
        enabledDaysOfWeek: exists
          ? prev.enabledDaysOfWeek.filter((d) => d !== day)
          : [...prev.enabledDaysOfWeek, day].sort(),
      };
    });
  }

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All Active");
  const [viewTab, setViewTab] = useState<"active" | "converted" | "all">("active");

  // Trial booking link copy feedback (no alert popup)
  const [linkCopied, setLinkCopied] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
    };
  }, []);

  async function handleCopyTrialLink() {
    const url = `${window.location.origin}/book-trial`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setLinkCopied(true);
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setLinkCopied(false), 4000);
  }

  // Create Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("09:00");
  const [formClassName, setFormClassName] = useState("");
  const [formClassId, setFormClassId] = useState("");
  const [formInstructorName, setFormInstructorName] = useState("");
  const [formInstructorId, setFormInstructorId] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSource, setFormSource] = useState("Website");
  const [formInterest, setFormInterest] = useState("");
  const [formConvertibility, setFormConvertibility] = useState("Warm");
  const [formAssignedStaff, setFormAssignedStaff] = useState("");

  // Edit Modal state
  const [editingTrial, setEditingTrial] = useState<TrialMember | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Reschedule Modal state
  const [reschedulingTrial, setReschedulingTrial] = useState<TrialMember | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("09:00");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  // Lock background scroll while any dialog is open
  useLockBody(showCreateModal || !!editingTrial || !!reschedulingTrial);

  // Fetch trial members and dropdown master data
  const fetchTrialMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/trial-members");
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to fetch trial members");
      }
      const json = await res.json();
      setTrialMembers(json.data || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load trial members");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMasterData = useCallback(async () => {
    try {
      // Fetch classes
      const { data: classesData } = await supabase
        .from("classes")
        .select("id, title, instructor")
        .eq("is_active", true)
        .order("title");

      if (classesData && classesData.length > 0) {
        setAvailableClasses(classesData as ClassOption[]);
      } else {
        // Fallback default classes
        setAvailableClasses([
          { id: "", title: "Reformer Pilates Basic", instructor: "Srikar" },
          { id: "", title: "Core Strength & Flow", instructor: "Priya" },
          { id: "", title: "Mat Pilates Flow", instructor: "Ananya" },
        ]);
      }

      // Fetch staff members
      const { data: staffData } = await supabase
        .from("staff_members")
        .select("id, full_name")
        .order("full_name");

      if (staffData && staffData.length > 0) {
        setAvailableStaff(staffData as StaffOption[]);
      } else {
        setAvailableStaff([
          { id: "", full_name: "Srikar" },
          { id: "", full_name: "Priya" },
          { id: "", full_name: "Rahul" },
          { id: "", full_name: "Ananya" },
        ]);
      }

    } catch (err) {
      console.error("Error loading master data:", err);
    }
  }, [supabase]);

  useEffect(() => {
    fetchTrialMembers();
    fetchMasterData();
  }, [fetchTrialMembers, fetchMasterData]);

  // Set initial form date to today
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setFormDate(today);
  }, []);

  // Filtered trial members
  const filteredTrialMembers = useMemo(() => {
    return trialMembers.filter((item) => {
      // View Tab filter
      if (viewTab === "active" && item.status === "Converted") return false;
      if (viewTab === "converted" && item.status !== "Converted") return false;

      // Status filter dropdown
      if (statusFilter === "All Active" && item.status === "Converted") return false;
      if (statusFilter !== "All" && statusFilter !== "All Active" && item.status !== statusFilter) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const qDigits = digitsOnly(q);

        // Legacy rows can carry nulls in fields the type declares as string, and
        // a throw inside this predicate blanks the whole list the moment
        // anything is typed. Treat every field as nullable.
        const text = (value: string | null | undefined) => (value || "").toLowerCase();

        const matchesPhone =
          qDigits.length > 0 && digitsOnly(item.phone_number).includes(qDigits);

        return (
          text(item.full_name).includes(q) ||
          matchesPhone ||
          text(item.email).includes(q) ||
          text(item.class_name).includes(q) ||
          text(item.instructor_name).includes(q)
        );
      }

      return true;
    });
  }, [trialMembers, viewTab, statusFilter, searchQuery]);

  // Paginate the filtered list (10 per page, reset on search/filter change)
  const trialsPage = usePagination(filteredTrialMembers, `${searchQuery}|${statusFilter}|${viewTab}`);

  // KPI Metrics
  const metrics = useMemo(() => {
    const total = trialMembers.length;
    const scheduled = trialMembers.filter((m) => m.status === "Scheduled").length;
    const attended = trialMembers.filter((m) => m.status === "Attended").length;
    const noShow = trialMembers.filter((m) => m.status === "No Show").length;
    const converted = trialMembers.filter((m) => m.status === "Converted").length;
    const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

    return { total, scheduled, attended, noShow, converted, conversionRate };
  }, [trialMembers]);

  // Reset Create Form
  const resetCreateForm = () => {
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    const today = new Date().toISOString().split("T")[0];
    setFormDate(today);
    setFormTime("09:00");
    setFormClassName("");
    setFormClassId("");
    setFormInstructorName("");
    setFormInstructorId("");
    setFormNotes("");
    setFormSource("Website");
    setFormInterest("");
    setFormConvertibility("Warm");
    setFormAssignedStaff("");
    setCreateError(null);
  };

  // Handle Create Trial Member
  const handleCreateTrialMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    if (!formName.trim()) {
      setCreateError("Full Name is required.");
      setCreateLoading(false);
      return;
    }
    if (!formPhone.trim()) {
      setCreateError("Phone Number is required.");
      setCreateLoading(false);
      return;
    }
    const cleanPhone = formPhone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      setCreateError("Phone Number must be exactly 10 digits.");
      setCreateLoading(false);
      return;
    }
    if (!formEmail.trim()) {
      setCreateError("Email is required.");
      setCreateLoading(false);
      return;
    }
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(formEmail.trim())) {
      setCreateError("Invalid email format.");
      setCreateLoading(false);
      return;
    }
    if (!formDate || !formTime) {
      setCreateError("Trial Date and Time are required.");
      setCreateLoading(false);
      return;
    }
    if (!formClassName.trim()) {
      setCreateError("Assigned Class is required.");
      setCreateLoading(false);
      return;
    }
    if (!formInstructorName.trim()) {
      setCreateError("Assigned Instructor is required.");
      setCreateLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/trial-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: formName.trim(),
          phone_number: cleanPhone,
          email: formEmail.trim(),
          trial_date: formDate,
          trial_time: formTime,
          class_id: formClassId || null,
          class_name: formClassName.trim(),
          instructor_id: formInstructorId || null,
          instructor_name: formInstructorName.trim(),
          notes: formNotes.trim() || null,
          source: formSource,
          interest: formInterest.trim() || null,
          convertibility: formConvertibility,
          assigned_staff_id: formAssignedStaff || null,
          primary_location: "CorhausPilates - Main Branch",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create trial member");
      }

      resetCreateForm();
      setShowCreateModal(false);
      fetchTrialMembers();
    } catch (err: any) {
      setCreateError(err.message || "Failed to create trial member");
    } finally {
      setCreateLoading(false);
    }
  };

  // Quick Action: Update Status (Attended / No Show) with confirmation
  const handleUpdateStatus = async (trialId: string, status: "Attended" | "No Show" | "Scheduled", memberName?: string) => {
    const label = memberName ? `"${memberName}"` : "this trial member";
    if (!confirm(`Are you sure that ${label} is ${status === "Attended" ? "attended" : "a no show"}?`)) return;
    try {
      const res = await fetch(`/api/admin/trial-members/${trialId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchTrialMembers();
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  // Handle Reschedule
  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingTrial || !rescheduleDate || !rescheduleTime) return;

    setRescheduleLoading(true);
    try {
      const res = await fetch(`/api/admin/trial-members/${reschedulingTrial.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trial_date: rescheduleDate,
          trial_time: rescheduleTime,
          status: "Scheduled",
        }),
      });

      if (res.ok) {
        setReschedulingTrial(null);
        fetchTrialMembers();
      }
    } catch (err) {
      console.error("Failed to reschedule trial:", err);
    } finally {
      setRescheduleLoading(false);
    }
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrial) return;

    setEditLoading(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/admin/trial-members/${editingTrial.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editingTrial.full_name,
          phone_number: editingTrial.phone_number,
          email: editingTrial.email,
          trial_date: editingTrial.trial_date,
          trial_time: editingTrial.trial_time,
          class_name: editingTrial.class_name,
          instructor_name: editingTrial.instructor_name,
          status: editingTrial.status,
          notes: editingTrial.notes,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update trial member");
      }

      setEditingTrial(null);
      fetchTrialMembers();
    } catch (err: any) {
      setEditError(err.message || "Failed to update trial member");
    } finally {
      setEditLoading(false);
    }
  };

  // Handle Convert to Member Action
  const handleConvertToMember = (item: TrialMember) => {
    const params = new URLSearchParams({
      convert_trial_id: item.id,
      prefill_name: item.full_name,
      prefill_phone: item.phone_number,
      prefill_email: item.email || "",
    });
    router.push(`/admin/members?${params.toString()}`);
  };

  const formatDateDisplay = (dStr: string) => formatDate(dStr);
  const formatTimeDisplay = (tStr: string) => formatTime(tStr);


  return (
    <div className="space-y-6 min-w-0 max-w-full overflow-hidden">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-2 pb-5 min-w-0 overflow-hidden">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-fg-3 mb-1 flex-wrap">
            <span>People &amp; Classes</span>
            <span>/</span>
            <span className="text-fg font-bold truncate">Trial Members</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-fg break-words leading-tight">Trial Members Management</h1>
          <p className="text-xs text-fg-3 mt-1 break-words">
            Track prospective client trial bookings, attendance, and member conversions.
          </p>
        </div>

        <button
          onClick={() => {
            resetCreateForm();
            setShowCreateModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-accent text-white text-xs font-bold hover:bg-accent-2 transition-all shadow-md shadow-accent/20 w-full sm:w-auto shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          + Create Trial Member
        </button>
      </div>

      {/* Public Trial Booking Link Card */}
      <div className="bg-surface border border-line rounded-3xl p-4 sm:p-5 space-y-3 min-w-0 overflow-hidden">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-fg">Public Trial Booking Link</h3>
          <p className="text-xs text-fg-3 mt-1 break-words">share this link to the trail member to book their trail session</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 min-w-0">
          <a
            href="/book-trial"
            target="_blank"
            className="text-xs bg-surface-2 border border-line-2 px-3 py-2.5 rounded-xl block w-full sm:w-auto sm:max-w-xs max-w-full overflow-hidden truncate text-accent font-mono hover:bg-hover"
          >
            {typeof window !== "undefined" ? window.location.origin : ""}/book-trial
          </a>
          <div className="flex gap-2">
            <button
              onClick={handleCopyTrialLink}
              title="Copy link"
              className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-white text-xs font-bold transition-colors ${
                linkCopied ? "bg-green-600 hover:bg-green-600" : "bg-accent hover:bg-accent-2"
              }`}
            >
              {linkCopied ? "Copied" : "Copy"}
            </button>
            <a
              href="/book-trial"
              target="_blank"
              className="flex-1 sm:flex-none text-center px-4 py-2.5 rounded-xl bg-surface-2 border border-line-2 text-fg text-xs font-bold hover:bg-hover transition-colors"
            >
              Open
            </a>
            <button
              onClick={handleOpenSlotSettings}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-2 border border-line-2 text-accent text-xs font-bold hover:bg-hover transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Customize Slot Timings
            </button>
          </div>
        </div>
      </div>

      {/* Error notification */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-fg-3">Total Trials</p>
          <p className="text-2xl font-bold text-fg mt-1">{metrics.total}</p>
        </div>
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Scheduled</p>
          <p className="text-2xl font-bold text-amber-500 mt-1">{metrics.scheduled}</p>
        </div>
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Attended</p>
          <p className="text-2xl font-bold text-emerald-500 mt-1">{metrics.attended}</p>
        </div>
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-500">No Show</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{metrics.noShow}</p>
        </div>
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500">Converted</p>
          <p className="text-2xl font-bold text-purple-500 mt-1">{metrics.converted}</p>
        </div>
        <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gold-fg">Conversion Rate</p>
          <p className="text-2xl font-bold text-gold-fg mt-1">{metrics.conversionRate}%</p>
        </div>
      </div>

      {/* Navigation Tabs & Search Toolbar */}
      <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs space-y-4 min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-2 pb-3 min-w-0">
          {/* View Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar shrink-0 max-w-full">
            <button
              onClick={() => setViewTab("active")}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                viewTab === "active"
                  ? "bg-accent text-white shadow-xs"
                  : "bg-surface-2 text-fg-3 hover:text-fg hover:bg-hover"
              }`}
            >
              Active Trials ({metrics.scheduled + metrics.attended + metrics.noShow})
            </button>
            <button
              onClick={() => setViewTab("converted")}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                viewTab === "converted"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-surface-2 text-fg-3 hover:text-fg hover:bg-hover"
              }`}
            >
              Converted History ({metrics.converted})
            </button>
            <button
              onClick={() => setViewTab("all")}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                viewTab === "all"
                  ? "bg-fg text-surface shadow-xs"
                  : "bg-surface-2 text-fg-3 hover:text-fg hover:bg-hover"
              }`}
            >
              All Trial History ({metrics.total})
            </button>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search name, phone, email, class, trainer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg placeholder:text-fg-4 focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
          </div>
        </div>

        {/* Dropdown Filters */}
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <span className="font-bold text-fg-3 uppercase text-[10px] tracking-wider">Status Filter:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none font-semibold text-xs"
          >
            <option value="All Active">All Active (Scheduled, Attended, No Show)</option>
            <option value="All">All Statuses (Including Converted)</option>
            <option value="Scheduled">Scheduled Only</option>
            <option value="Attended">Attended Only</option>
            <option value="No Show">No Show Only</option>
            <option value="Converted">Converted Only</option>
          </select>
        </div>
      </div>

      {/* Trial Members Dashboard Data Table & Mobile Cards */}
      <div className="bg-surface rounded-2xl border border-line-2 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-fg-3">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-3" />
            <p className="text-xs font-semibold">Loading trial members...</p>
          </div>
        ) : filteredTrialMembers.length === 0 ? (
          <div className="p-12 text-center text-fg-3">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <p className="text-sm font-bold text-fg-2">No trial members found</p>
            <p className="text-xs text-fg-4 mt-1">No prospective trial records match your current view.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-line-2 bg-surface-2/60 text-fg-3 uppercase font-bold text-[10px] tracking-wider">
                    <th className="py-3.5 px-4">Full Name</th>
                    <th className="py-3.5 px-4">Phone Number</th>
                    <th className="py-3.5 px-4">Email</th>
                    <th className="py-3.5 px-4">Trial Date &amp; Time</th>
                    <th className="py-3.5 px-4">Assigned Class</th>
                    <th className="py-3.5 px-4">Instructor</th>
                    <th className="py-3.5 px-4">Trial Status</th>
                    <th className="py-3.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-2 text-fg">
                  {trialsPage.pageItems.map((item) => (
                    <tr key={item.id} onClick={() => setEditingTrial(item)} className="hover:bg-hover/50 transition-colors cursor-pointer">
                      <td className="py-3.5 px-4 font-bold text-fg">
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          {item.full_name}
                          {item.invoice_id && (
                            <Link
                              href={`/admin/billing/invoices?invoice=${item.invoice_id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-green-600/40 text-green-700 dark:text-green-400 text-[11px] font-bold hover:bg-green-500/10 transition-colors"
                            >
                              View Invoice
                            </Link>
                          )}
                        </span>
                        {displayTrialNotes(item.notes) && (
                          <div className="text-[10px] text-fg-4 font-normal mt-0.5 max-w-xs truncate" title={displayTrialNotes(item.notes) || undefined}>
                            Note: {displayTrialNotes(item.notes)}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-fg-2 font-medium">
                        {item.phone_number}
                      </td>
                      <td className="py-3.5 px-4 text-fg-3">
                        {item.email || "—"}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-fg">{formatDateDisplay(item.trial_date)}</div>
                        <div className="text-[10px] text-fg-3">{formatTimeDisplay(item.trial_time)}</div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-fg">
                        {item.class_name}
                      </td>
                      <td className="py-3.5 px-4 text-fg-2">
                        {item.instructor_name}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold border ${
                            item.status === "Scheduled"
                              ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                              : item.status === "Attended"
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : item.status === "No Show"
                              ? "bg-red-500/10 text-red-500 border-red-500/20"
                              : "bg-purple-500/10 text-purple-500 border-purple-500/20"
                          }`}
                        >
                          {item.status}
                        </span>
                        {item.status === "Converted" && item.converted_at && (
                          <div className="text-[9px] text-fg-4 mt-0.5 font-semibold">
                            Converted: {formatDateDisplay(item.converted_at.split("T")[0])}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <Link
                            href={`/admin/inbox?phone=${encodeURIComponent(item.phone_number || "")}&name=${encodeURIComponent(item.full_name || "")}`}
                            onClick={(e) => e.stopPropagation()}
                            title={`Chat with ${item.full_name} on WhatsApp`}
                            className="w-7 h-7 rounded-xl bg-emerald-600/10 hover:bg-emerald-600 border border-emerald-600/30 hover:border-emerald-600 text-emerald-600 hover:text-white flex items-center justify-center transition-all shadow-xs"
                          >
                            <WhatsAppIcon className="w-3.5 h-3.5" />
                          </Link>
                          {item.status !== "Converted" ? (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleConvertToMember(item); }}
                                title="Convert to regular member"
                                className="px-2.5 py-1 rounded-xl bg-purple-600 text-white font-bold text-[11px] hover:bg-purple-700 transition-colors shadow-xs"
                              >
                                Convert to Member
                              </button>
                              {item.status === "Scheduled" && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUpdateStatus(item.id, "Attended", item.full_name); }}
                                    title="Mark Attended"
                                    className="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 font-bold text-[11px] hover:bg-emerald-500/20 transition-colors"
                                  >
                                    Attended
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUpdateStatus(item.id, "No Show", item.full_name); }}
                                    title="Mark No Show"
                                    className="px-2.5 py-1 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 font-bold text-[11px] hover:bg-red-500/20 transition-colors"
                                  >
                                    No Show
                                  </button>
                                </>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReschedulingTrial(item);
                                  setRescheduleDate(item.trial_date);
                                  setRescheduleTime(item.trial_time);
                                }}
                                title="Reschedule Trial"
                                className="px-2.5 py-1 rounded-xl bg-surface-2 border border-line-2 text-fg font-semibold text-[11px] hover:bg-hover transition-colors"
                              >
                                Reschedule
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingTrial({ ...item }); }}
                                title="Edit Trial Details"
                                className="px-2.5 py-1 rounded-xl bg-surface-2 border border-line-2 text-fg-3 hover:text-fg font-semibold text-[11px] hover:bg-hover transition-colors"
                              >
                                Edit
                              </button>
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-xl">
                                Converted Member
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingTrial({ ...item }); }}
                                title="Edit Trial Record"
                                className="px-2.5 py-1 rounded-xl bg-surface-2 border border-line-2 text-fg-3 hover:text-fg font-semibold text-[11px]"
                              >
                                Details
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-line-2 p-3 space-y-3">
              {trialsPage.pageItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setEditingTrial(item)}
                  className="p-4 rounded-xl bg-surface-2/60 border border-line-2 space-y-3 text-xs cursor-pointer hover:bg-hover/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-fg truncate">{item.full_name}</p>
                        <Link
                          href={`/admin/inbox?phone=${encodeURIComponent(item.phone_number || "")}&name=${encodeURIComponent(item.full_name || "")}`}
                          onClick={(e) => e.stopPropagation()}
                          title="Chat on WhatsApp"
                          className="w-6 h-6 rounded-lg bg-emerald-600/10 hover:bg-emerald-600 border border-emerald-600/30 text-emerald-600 hover:text-white flex items-center justify-center transition-all shrink-0"
                        >
                          <WhatsAppIcon className="w-3 h-3" />
                        </Link>
                      </div>
                      <p className="text-fg-3 text-[11px] mt-0.5">{item.phone_number} {item.email ? `• ${item.email}` : ""}</p>
                      {item.invoice_id && (
                        <Link
                          href={`/admin/billing/invoices?invoice=${item.invoice_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full border border-green-600/40 text-green-700 dark:text-green-400 text-[11px] font-bold"
                        >
                          View Invoice
                        </Link>
                      )}
                    </div>
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                        item.status === "Scheduled"
                          ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                          : item.status === "Attended"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : item.status === "No Show"
                          ? "bg-red-500/10 text-red-500 border-red-500/20"
                          : "bg-purple-500/10 text-purple-500 border-purple-500/20"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-surface/50 p-2.5 rounded-lg border border-line-2/50">
                    <div>
                      <span className="text-fg-4 font-medium block">Date & Time</span>
                      <span className="font-semibold text-fg">{formatDateDisplay(item.trial_date)} @ {formatTimeDisplay(item.trial_time)}</span>
                    </div>
                    <div>
                      <span className="text-fg-4 font-medium block">Class & Instructor</span>
                      <span className="font-semibold text-fg">{item.class_name} ({item.instructor_name})</span>
                    </div>
                  </div>

                  {displayTrialNotes(item.notes) && (
                    <p className="text-[11px] text-fg-3 bg-surface/30 p-2 rounded-lg italic">
                      Note: {displayTrialNotes(item.notes)}
                    </p>
                  )}

                  {/* Actions Bar */}
                  <div className="pt-2 border-t border-line-2 flex flex-wrap items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                    {item.status !== "Converted" ? (
                      <>
                        <button
                          onClick={() => handleConvertToMember(item)}
                          className="px-2.5 py-1 rounded-lg bg-purple-600 text-white font-bold text-[11px]"
                        >
                          Convert
                        </button>
                        {item.status === "Scheduled" && (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(item.id, "Attended", item.full_name)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 font-bold text-[11px]"
                            >
                              Attended
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(item.id, "No Show", item.full_name)}
                              className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 font-bold text-[11px]"
                            >
                              No Show
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => {
                            setReschedulingTrial(item);
                            setRescheduleDate(item.trial_date);
                            setRescheduleTime(item.trial_time);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-surface border border-line-2 text-fg font-semibold text-[11px]"
                        >
                          Reschedule
                        </button>
                        <button
                          onClick={() => setEditingTrial({ ...item })}
                          className="px-2.5 py-1 rounded-lg bg-surface border border-line-2 text-fg-3 font-semibold text-[11px]"
                        >
                          Edit
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg">
                        Converted Member
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={trialsPage.page} totalPages={trialsPage.totalPages} onChange={trialsPage.setPage} />
          </>
        )}
      </div>

      {/* CREATE TRIAL MEMBER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-line-2 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line-2 pb-3">
              <h3 className="text-lg font-serif font-bold text-fg">+ Create Trial Member</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-xl text-fg-3 hover:text-fg text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateTrialMember} className="space-y-3.5 text-xs">
              {/* Full Name */}
              <div>
                <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ananya Sharma"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none"
                />
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9876543210"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. client@example.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none"
                  />
                </div>
              </div>

              {/* Source, Interest, Convertibility, Assigned Staff */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Source <span className="text-red-500">*</span>
                  </label>
                  <select value={formSource} onChange={(e) => setFormSource(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none">
                    <option value="Website">Website</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Walk-in">Walk-in</option>
                    <option value="Phone">Phone</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Referral">Referral</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">Interest</label>
                  <input type="text" placeholder="e.g. Reformer Pilates" value={formInterest} onChange={(e) => setFormInterest(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">Convertibility</label>
                  <select value={formConvertibility} onChange={(e) => setFormConvertibility(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none">
                    <option value="Hot">Hot</option>
                    <option value="Warm">Warm</option>
                    <option value="Cold">Cold</option>
                    <option value="Others">Others</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">Assigned Staff</label>
                  <select value={formAssignedStaff} onChange={(e) => setFormAssignedStaff(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none">
                    <option value="">Unassigned</option>
                    {availableStaff.map((s: any) => <option key={s.id} value={s.id}>{s.full_name} ({s.designation})</option>)}
                  </select>
                </div>
              </div>

              {/* Trial Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Trial Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Trial Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none"
                  />
                </div>
              </div>

              {/* Assigned Class & Instructor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Assigned Class <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Reformer Pilates Basic"
                    value={formClassName}
                    onChange={(e) => setFormClassName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Assigned Instructor <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Trainer Name"
                    value={formInstructorName}
                    onChange={(e) => setFormInstructorName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none font-semibold"
                  />
                </div>
              </div>


              {/* Notes */}
              <div>
                <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional trial instructions or health notes..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none"
                />
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-line-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-surface-2 border border-line-2 text-fg font-semibold hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2 rounded-xl bg-accent text-white font-bold hover:bg-accent-2 disabled:opacity-50 shadow-xs"
                >
                  {createLoading ? "Saving..." : "Save Trial Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT TRIAL MEMBER MODAL */}
      {editingTrial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-line-2 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line-2 pb-3">
              <h3 className="text-lg font-serif font-bold text-fg">Edit Trial Member</h3>
              <button
                onClick={() => setEditingTrial(null)}
                className="p-1.5 rounded-xl text-fg-3 hover:text-fg text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editingTrial.full_name}
                  onChange={(e) => setEditingTrial({ ...editingTrial, full_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px]">
                      Phone Number
                    </label>
                    <Link
                      href={`/admin/inbox?phone=${encodeURIComponent(editingTrial.phone_number || "")}&name=${encodeURIComponent(editingTrial.full_name || "")}`}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-500"
                    >
                      <WhatsAppIcon className="w-3 h-3" />
                      <span>Chat on WhatsApp</span>
                    </Link>
                  </div>
                  <input
                    type="tel"
                    required
                    value={editingTrial.phone_number}
                    onChange={(e) => setEditingTrial({ ...editingTrial, phone_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={editingTrial.email || ""}
                    onChange={(e) => setEditingTrial({ ...editingTrial, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Trial Date
                  </label>
                  <input
                    type="date"
                    required
                    value={editingTrial.trial_date}
                    onChange={(e) => setEditingTrial({ ...editingTrial, trial_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Trial Time
                  </label>
                  <input
                    type="time"
                    required
                    value={editingTrial.trial_time}
                    onChange={(e) => setEditingTrial({ ...editingTrial, trial_time: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Assigned Class
                  </label>
                  <input
                    type="text"
                    required
                    value={editingTrial.class_name}
                    onChange={(e) => setEditingTrial({ ...editingTrial, class_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Assigned Instructor
                  </label>
                  <input
                    type="text"
                    required
                    value={editingTrial.instructor_name}
                    onChange={(e) => setEditingTrial({ ...editingTrial, instructor_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                  Trial Status
                </label>
                <select
                  value={editingTrial.status}
                  onChange={(e) => setEditingTrial({ ...editingTrial, status: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none font-bold"
                >
                  <option value="Scheduled">Scheduled</option>
                  <option value="Attended">Attended</option>
                  <option value="No Show">No Show</option>
                  <option value="Converted">Converted</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={editingTrial.notes || ""}
                  onChange={(e) => setEditingTrial({ ...editingTrial, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-line-2">
                <button
                  type="button"
                  onClick={() => setEditingTrial(null)}
                  className="px-4 py-2 rounded-xl bg-surface-2 border border-line-2 text-fg font-semibold hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-5 py-2 rounded-xl bg-accent text-white font-bold hover:bg-accent-2 disabled:opacity-50"
                >
                  {editLoading ? "Updating..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOMIZE TRIAL SLOTS & TIMINGS MODAL */}
      {showSlotSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface border border-line-2 rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-5 shadow-2xl max-h-[92dvh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line-2 pb-4">
              <div>
                <h3 className="text-lg font-serif font-bold text-fg">Customize Trial Class Timings &amp; Slots</h3>
                <p className="text-xs text-fg-3 mt-0.5">
                  Changes made here immediately reflect on the public trial booking page (/book-trial).
                </p>
              </div>
              <button
                onClick={() => setShowSlotSettingsModal(false)}
                className="w-8 h-8 rounded-full bg-surface-2 text-fg-3 hover:text-fg font-bold flex items-center justify-center flex-shrink-0"
              >
                ✕
              </button>
            </div>

            {slotSettingsSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs font-bold">
                ✓ {slotSettingsSuccess}
              </div>
            )}
            {slotSettingsError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 text-xs font-bold">
                ✕ {slotSettingsError}
              </div>
            )}

            {slotSettingsLoading ? (
              <div className="py-12 text-center text-xs text-fg-3">Loading settings...</div>
            ) : (
              <div className="space-y-6 text-xs">
                {/* 1. Date Availability Section */}
                <div className="bg-surface-2 p-4 rounded-2xl border border-line-2 space-y-3">
                  <h4 className="font-bold text-fg uppercase tracking-wider text-[11px] flex items-center gap-2">
                    <span>1. Date Availability &amp; Booking Window</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-fg-3 font-semibold mb-1">Days in Advance to Book</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={slotSettings.daysAhead}
                        onChange={(e) =>
                          setSlotSettings({ ...slotSettings, daysAhead: parseInt(e.target.value, 10) || 14 })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface text-fg focus:ring-1 focus:ring-accent outline-none font-mono"
                      />
                      <span className="text-[10px] text-fg-4 mt-0.5 block">e.g. 14 gives next 14 calendar days</span>
                    </div>

                    <div>
                      <label className="block text-fg-3 font-semibold mb-1">Available Days of Week</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {[
                          { day: 1, label: "Mon" },
                          { day: 2, label: "Tue" },
                          { day: 3, label: "Wed" },
                          { day: 4, label: "Thu" },
                          { day: 5, label: "Fri" },
                          { day: 6, label: "Sat" },
                          { day: 0, label: "Sun" },
                        ].map((d) => {
                          const active = slotSettings.enabledDaysOfWeek.includes(d.day);
                          return (
                            <button
                              key={d.day}
                              type="button"
                              onClick={() => handleToggleDayOfWeek(d.day)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                active
                                  ? "bg-accent text-white shadow-xs"
                                  : "bg-surface border border-line-2 text-fg-4 hover:text-fg"
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                      <span className="text-[10px] text-fg-4 mt-1 block">Toggle days when trial classes are held</span>
                    </div>
                  </div>
                </div>

                {/* 2. Morning Slots */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-fg uppercase tracking-wider text-[11px]">
                      2. Morning Reformer Slots ({slotSettings.slots.filter((s) => s.period === "Morning").length})
                    </h4>
                    <span className="text-[10px] text-fg-4">Active slots show on /book-trial</span>
                  </div>

                  <div className="space-y-2">
                    {slotSettings.slots
                      .filter((s) => s.period === "Morning")
                      .map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-2 border border-line-2"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-mono text-xs font-bold text-accent bg-surface px-2 py-0.5 rounded-md border border-line-2">
                              {slot.value}
                            </span>
                            <input
                              type="text"
                              value={slot.label}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSlotSettings((prev) => ({
                                  ...prev,
                                  slots: prev.slots.map((s) => (s.id === slot.id ? { ...s, label: val } : s)),
                                }));
                              }}
                              className="px-2 py-1 bg-surface border border-line-2 rounded-lg text-xs text-fg flex-1 min-w-[120px]"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleSlotActive(slot.id)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                slot.isActive
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                              }`}
                            >
                              {slot.isActive ? "Active" : "Disabled"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveSlot(slot.id)}
                              className="text-red-500 hover:text-red-700 p-1 font-bold"
                              title="Delete Slot"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* 3. Evening Slots */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-fg uppercase tracking-wider text-[11px]">
                      3. Evening Reformer Slots ({slotSettings.slots.filter((s) => s.period === "Evening").length})
                    </h4>
                    <span className="text-[10px] text-fg-4">Active slots show on /book-trial</span>
                  </div>

                  <div className="space-y-2">
                    {slotSettings.slots
                      .filter((s) => s.period === "Evening")
                      .map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-2 border border-line-2"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-mono text-xs font-bold text-accent bg-surface px-2 py-0.5 rounded-md border border-line-2">
                              {slot.value}
                            </span>
                            <input
                              type="text"
                              value={slot.label}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSlotSettings((prev) => ({
                                  ...prev,
                                  slots: prev.slots.map((s) => (s.id === slot.id ? { ...s, label: val } : s)),
                                }));
                              }}
                              className="px-2 py-1 bg-surface border border-line-2 rounded-lg text-xs text-fg flex-1 min-w-[120px]"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleSlotActive(slot.id)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                slot.isActive
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                              }`}
                            >
                              {slot.isActive ? "Active" : "Disabled"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveSlot(slot.id)}
                              className="text-red-500 hover:text-red-700 p-1 font-bold"
                              title="Delete Slot"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* 4. Add New Slot Panel */}
                <div className="p-3.5 rounded-2xl bg-surface border border-dashed border-line-2 space-y-2">
                  <h5 className="font-bold text-fg text-xs">+ Add New Slot</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-fg-3 block mb-0.5 font-semibold">Period</label>
                      <select
                        value={newSlotPeriod}
                        onChange={(e) => setNewSlotPeriod(e.target.value as "Morning" | "Evening")}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-line-2 bg-surface-2 text-fg text-xs"
                      >
                        <option value="Morning">Morning</option>
                        <option value="Evening">Evening</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-fg-3 block mb-0.5 font-semibold">Time (HH:MM)</label>
                      <input
                        type="time"
                        value={newSlotValue}
                        onChange={(e) => setNewSlotValue(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-line-2 bg-surface-2 text-fg text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-fg-3 block mb-0.5 font-semibold">Display Label</label>
                      <input
                        type="text"
                        placeholder="e.g. 10:00 - 11:00 AM"
                        value={newSlotLabel}
                        onChange={(e) => setNewSlotLabel(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-line-2 bg-surface-2 text-fg text-xs"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleAddSlot}
                        className="w-full py-1.5 rounded-lg bg-accent text-white font-bold hover:bg-accent-2 transition-colors text-xs"
                      >
                        Add Slot
                      </button>
                    </div>
                  </div>
                </div>

                {/* Modal Footer Controls */}
                <div className="flex items-center justify-between gap-3 pt-4 border-t border-line-2">
                  <button
                    type="button"
                    onClick={() => setSlotSettings(DEFAULT_TRIAL_SCHEDULE_SETTINGS)}
                    className="text-xs text-fg-4 hover:text-fg underline font-semibold"
                  >
                    Reset to Defaults
                  </button>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSlotSettingsModal(false)}
                      className="px-4 py-2 rounded-xl bg-surface-2 border border-line-2 text-fg font-semibold hover:bg-hover"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={slotSettingsSaving}
                      onClick={handleSaveSlotSettings}
                      className="px-5 py-2 rounded-xl bg-accent text-white font-bold hover:bg-accent-2 transition-all shadow-md shadow-accent/20 disabled:opacity-50"
                    >
                      {slotSettingsSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESCHEDULE TRIAL MODAL */}
      {reschedulingTrial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-line-2 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line-2 pb-3">
              <div>
                <h3 className="text-lg font-serif font-bold text-fg">Reschedule Trial</h3>
                <p className="text-xs text-fg-3">{reschedulingTrial.full_name}</p>
              </div>
              <button
                onClick={() => setReschedulingTrial(null)}
                className="p-1.5 rounded-xl text-fg-3 hover:text-fg text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReschedule} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                  New Trial Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                  New Trial Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-line-2">
                <button
                  type="button"
                  onClick={() => setReschedulingTrial(null)}
                  className="px-4 py-2 rounded-xl bg-surface-2 border border-line-2 text-fg font-semibold hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduleLoading}
                  className="px-5 py-2 rounded-xl bg-accent text-white font-bold hover:bg-accent-2 disabled:opacity-50"
                >
                  {rescheduleLoading ? "Saving..." : "Confirm Reschedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
