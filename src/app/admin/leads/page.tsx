"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/date-utils";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Lead {
  id: string;
  full_name: string;
  phone_number: string;
  email: string;
  source: string;
  source_detail: string | null;
  primary_location: string;
  interest: string | null;
  convertibility: string;
  pipeline_stage: string;
  assigned_to: string | null;
  follow_up_at: string | null;
  notes: string | null;
  preferred_time: string | null;
  message: string | null;
  converted_member_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface StaffOption {
  id: string;
  full_name: string;
  designation?: string | null;
}

// ---------------------------------------------------------------------------
// Constants – must match DB check constraints
// ---------------------------------------------------------------------------
const PIPELINE_STAGES = ["New", "Qualified", "Follow-up", "Trial Booked", "Trial Attended", "Negotiating", "Converted", "Lost"] as const;
const SOURCES = ["Walk-in", "Phone", "Instagram", "Website", "WhatsApp", "Referral", "Other"] as const;
const INTERESTS = [
  "General Membership",
  "Personal Training",
  "Group Classes",
  "Yoga",
  "Zumba",
  "CrossFit",
  "Kickboxing/MMA",
  "Trial Class",
  "Just Enquiring",
  "Other",
] as const;
const CONVERTIBILITY = ["Hot", "Warm", "Cold", "Others"] as const;

type Tab = "list" | "pipeline" | "enquiries";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  } catch {
    return false;
  }
}

function isWithinLast7Days(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const sevenAgo = new Date(now);
  sevenAgo.setDate(now.getDate() - 7);
  return d >= sevenAgo && d <= now;
}

function stageBadgeClasses(stage: string): string {
  switch (stage) {
    case "New":
      return "bg-slate-500/10 text-slate-600 border-slate-500/20";
    case "Qualified":
      return "bg-sky-500/10 text-sky-600 border-sky-500/20";
    case "Follow-up":
      return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    case "Trial Booked":
      return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
    case "Trial Attended":
      return "bg-cyan-500/10 text-cyan-600 border-cyan-500/20";
    case "Negotiating":
      return "bg-orange-500/10 text-orange-600 border-orange-500/20";
    case "Converted":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "Lost":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    default:
      return "bg-surface-2 text-fg-3 border-line-2";
  }
}

function convertibilityBadge(c: string): string {
  switch (c) {
    case "Hot":
      return "bg-red-500 text-white";
    case "Warm":
      return "bg-amber-500 text-white";
    case "Cold":
      return "bg-sky-500 text-white";
    default:
      return "bg-surface-2 text-fg-3 border border-line-2";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LeadsPage() {
  const supabase = createClient();
  const router = useRouter();

  // Data
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);

  // Tabs
  const [activeTab, setActiveTab] = useState<Tab>("list");

  // Search + Filters
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<string>(""); // YYYY-MM-DD for created_at
  const [stageFilter, setStageFilter] = useState<string>("All");
  const [sourceFilter, setSourceFilter] = useState<string>("All");
  const [followUpFilter, setFollowUpFilter] = useState<string>("All");
  const [convertibilityFilter, setConvertibilityFilter] = useState<string>("All");
  const [assignedFilter, setAssignedFilter] = useState<string>("All");

  // Add Lead modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formSource, setFormSource] = useState<string>("Website");
  const [formLocation, setFormLocation] = useState("CorhausPilates - Main Branch");
  const [formInterest, setFormInterest] = useState<string>("");
  const [formConvertibility, setFormConvertibility] = useState<string>("Others");
  const [formAssigned, setFormAssigned] = useState<string>("");
  const [formFollowUp, setFormFollowUp] = useState<string>("");
  const [formNotes, setFormNotes] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formPreferredTime, setFormPreferredTime] = useState("");

  // Pipeline manage modal
  const [showPipelineManage, setShowPipelineManage] = useState(false);

  // Detail drawer
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailNote, setDetailNote] = useState("");
  const [detailStage, setDetailStage] = useState("");
  const [detailAssigned, setDetailAssigned] = useState("");
  const [detailFollowUp, setDetailFollowUp] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);

  // Drag state for pipeline
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/leads");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to fetch leads");
      }
      const json = await res.json();
      setLeads(json.data || []);
    } catch (e: any) {
      setError(e.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStaff = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("staff_members").select("id, full_name, designation").order("full_name");
      if (!error && data) setStaffOptions(data as StaffOption[]);
    } catch (err) {
      console.error("staff fetch failed", err);
    }
  }, [supabase]);

  useEffect(() => {
    fetchLeads();
    fetchStaff();
  }, [fetchLeads, fetchStaff]);

  // map assigned_to -> name
  const staffMap = useMemo(() => {
    const m = new Map<string, string>();
    staffOptions.forEach((s) => m.set(s.id, s.full_name));
    return m;
  }, [staffOptions]);

  // Keep selectedLead in sync when leads refetch
  useEffect(() => {
    if (selectedLead) {
      const fresh = leads.find((l) => l.id === selectedLead.id);
      if (fresh) setSelectedLead(fresh);
      else setSelectedLead(null);
    }
  }, [leads, selectedLead]);

  // Sync detail controls when selected changes
  useEffect(() => {
    if (selectedLead) {
      setDetailStage(selectedLead.pipeline_stage);
      setDetailAssigned(selectedLead.assigned_to || "");
      setDetailFollowUp(selectedLead.follow_up_at ? selectedLead.follow_up_at.slice(0, 10) : "");
      setDetailNote(selectedLead.notes || "");
    }
  }, [selectedLead]);

  // -----------------------------------------------------------------------
  // KPIs – all from real Supabase leads
  // -----------------------------------------------------------------------
  const kpis = useMemo(() => {
    const total = leads.length;
    const newThisWeek = leads.filter((l) => isWithinLast7Days(l.created_at)).length;
    const followUpDueToday = leads.filter((l) => isToday(l.follow_up_at)).length;
    const converted = leads.filter((l) => l.pipeline_stage === "Converted").length;
    return { total, newThisWeek, followUpDueToday, converted };
  }, [leads]);

  // -----------------------------------------------------------------------
  // Filtering – List vs Enquiries share logic
  // -----------------------------------------------------------------------
  const baseFiltered = useMemo(() => {
    return leads.filter((lead) => {
      // Search (name/phone/email)
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const hay = `${lead.full_name} ${lead.phone_number} ${lead.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Date – created_at exact day
      if (dateFilter) {
        const createdDay = new Date(lead.created_at).toISOString().slice(0, 10);
        if (createdDay !== dateFilter) return false;
      }
      if (stageFilter !== "All" && lead.pipeline_stage !== stageFilter) return false;
      if (sourceFilter !== "All" && lead.source !== sourceFilter) return false;
      if (convertibilityFilter !== "All" && lead.convertibility !== convertibilityFilter) return false;
      if (followUpFilter === "has" && !lead.follow_up_at) return false;
      if (followUpFilter === "none" && lead.follow_up_at) return false;
      if (followUpFilter === "today" && !isToday(lead.follow_up_at)) return false;
      if (assignedFilter !== "All") {
        if (assignedFilter === "unassigned" && lead.assigned_to) return false;
        if (assignedFilter !== "unassigned" && lead.assigned_to !== assignedFilter) return false;
      }
      return true;
    });
  }, [leads, search, dateFilter, stageFilter, sourceFilter, convertibilityFilter, followUpFilter, assignedFilter]);

  // Tab-specific view
  const visibleLeads = useMemo(() => {
    if (activeTab === "enquiries") {
      return baseFiltered.filter((l) => l.source === "Website" || l.source === "Instagram");
    }
    return baseFiltered;
  }, [baseFiltered, activeTab]);

  // Pipeline grouping
  const pipelineGroups = useMemo(() => {
    const groups: Record<string, Lead[]> = {};
    PIPELINE_STAGES.forEach((s) => (groups[s] = []));
    visibleLeads.forEach((l) => {
      const key = PIPELINE_STAGES.includes(l.pipeline_stage as any) ? l.pipeline_stage : "New";
      groups[key].push(l);
    });
    return groups;
  }, [visibleLeads]);

  // -----------------------------------------------------------------------
  // Create / Edit helpers
  // -----------------------------------------------------------------------
  const resetAddForm = () => {
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    setFormSource("Website");
    setFormLocation("CorhausPilates - Main Branch");
    setFormInterest("");
    setFormConvertibility("Others");
    setFormAssigned("");
    setFormFollowUp("");
    setFormNotes("");
    setFormMessage("");
    setFormPreferredTime("");
    setAddError(null);
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!formName.trim()) return setAddError("Full Name is required.");
    const cleanPhone = formPhone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) return setAddError("Phone must be exactly 10 digits (Indian).");
    if (!formEmail.trim()) return setAddError("Email is required.");
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(formEmail.trim())) return setAddError("Invalid email format.");
    if (!SOURCES.includes(formSource as any)) return setAddError("Please select a valid Source.");
    setAddLoading(true);
    try {
      const res = await fetch("/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: formName.trim(),
          phone_number: cleanPhone,
          email: formEmail.trim(),
          source: formSource,
          primary_location: formLocation.trim() || "CorhausPilates - Main Branch",
          interest: formInterest || null,
          convertibility: formConvertibility,
          pipeline_stage: "New",
          assigned_to: formAssigned || null,
          follow_up_at: formFollowUp ? new Date(formFollowUp).toISOString() : null,
          notes: formNotes.trim() || null,
          message: formMessage.trim() || null,
          preferred_time: formPreferredTime.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to create lead");
      resetAddForm();
      setShowAddModal(false);
      fetchLeads();
    } catch (err: any) {
      setAddError(err.message || "Failed to create lead");
    } finally {
      setAddLoading(false);
    }
  };

  // Generic PUT
  const updateLead = async (id: string, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/leads/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || "Update failed");
    return j.data as Lead;
  };

  const handleStageChange = async (leadId: string, newStage: string) => {
    try {
      await updateLead(leadId, { pipeline_stage: newStage });
      fetchLeads();
      if (selectedLead?.id === leadId) setDetailStage(newStage);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDrop = async (stage: string) => {
    if (!draggedId) return;
    setDraggedId(null);
    const lead = leads.find((l) => l.id === draggedId);
    if (!lead || lead.pipeline_stage === stage) return;
    try {
      await updateLead(draggedId, { pipeline_stage: stage });
      fetchLeads();
    } catch (e) {
      console.error(e);
    }
  };

  // Export CSV
  const handleExport = () => {
    const rows = visibleLeads;
    const header = ["Full Name", "Phone", "Email", "Source", "Interest", "Stage", "Convertibility", "Assigned Staff", "Follow-up", "Created"];
    const csv = [
      header.join(","),
      ...rows.map((l) =>
        [
          `"${l.full_name.replace(/"/g, '""')}"`,
          l.phone_number,
          l.email,
          l.source,
          `"${(l.interest || "").replace(/"/g, '""')}"`,
          l.pipeline_stage,
          l.convertibility,
          `"${(staffMap.get(l.assigned_to || "") || "").replace(/"/g, '""')}"`,
          l.follow_up_at ? new Date(l.follow_up_at).toISOString().slice(0, 10) : "",
          new Date(l.created_at).toISOString().slice(0, 10),
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Detail actions
  const handleDetailSaveNote = async () => {
    if (!selectedLead) return;
    setDetailSaving(true);
    try {
      await updateLead(selectedLead.id, { notes: detailNote || null });
      fetchLeads();
    } catch (e: any) {
      console.error(e);
    } finally {
      setDetailSaving(false);
    }
  };

  const handleDetailSaveStage = async () => {
    if (!selectedLead || detailStage === selectedLead.pipeline_stage) return;
    setDetailSaving(true);
    try {
      await updateLead(selectedLead.id, { pipeline_stage: detailStage });
      fetchLeads();
    } catch (e: any) {
      console.error(e);
    } finally {
      setDetailSaving(false);
    }
  };

  const handleDetailAssign = async () => {
    if (!selectedLead) return;
    setDetailSaving(true);
    try {
      await updateLead(selectedLead.id, { assigned_to: detailAssigned || null });
      fetchLeads();
    } finally {
      setDetailSaving(false);
    }
  };

  const handleDetailFollowUp = async () => {
    if (!selectedLead) return;
    setDetailSaving(true);
    try {
      await updateLead(selectedLead.id, { follow_up_at: detailFollowUp ? new Date(detailFollowUp).toISOString() : null });
      fetchLeads();
    } finally {
      setDetailSaving(false);
    }
  };

  const handleMarkLost = async () => {
    if (!selectedLead) return;
    await handleStageChange(selectedLead.id, "Lost");
  };

  const handleConvert = (lead: Lead) => {
    const params = new URLSearchParams({
      convert_lead_id: lead.id,
      prefill_name: lead.full_name,
      prefill_phone: lead.phone_number,
      prefill_email: lead.email || "",
    });
    router.push(`/admin/members?${params.toString()}`);
  };

  const handleDelete = async () => {
    if (!selectedLead) return;
    if (!confirm(`Delete lead "${selectedLead.full_name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/leads/${selectedLead.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setSelectedLead(null);
      fetchLeads();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditLeadInline = async (lead: Lead, patch: Partial<Lead>) => {
    try {
      await updateLead(lead.id, patch);
      fetchLeads();
    } catch (e) {
      console.error(e);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header – dark Corhaus language, rounded-3xl aware */}
      <div className="flex flex-col gap-4 border-b border-line-2 pb-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-fg-3 mb-1">
              <span>People &amp; Classes</span>
              <span>/</span>
              <span className="text-fg font-bold">Leads & Enquiries</span>
            </div>
            <h1 className="text-2xl font-serif font-bold text-fg">Leads &amp; Enquiries</h1>
            <p className="text-xs text-fg-3 mt-1">Track and convert potential members</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-surface border border-line-2 text-fg text-xs font-bold hover:bg-hover transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" />
              </svg>
              Export
            </button>
            <button
              onClick={() => setShowPipelineManage(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-surface border border-line-2 text-fg text-xs font-bold hover:bg-hover transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Add/Edit Pipeline
            </button>
            <button
              onClick={() => {
                resetAddForm();
                setShowAddModal(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-accent text-white text-xs font-bold hover:bg-accent-2 transition-all shadow-md shadow-accent/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              + Add Lead
            </button>
          </div>
        </div>
      </div>

      {error && <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">{error}</div>}

      {/* KPI cards – 4 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-widest text-fg-3">Total Leads</p>
          <p className="text-3xl font-bold text-fg mt-2">{kpis.total}</p>
          <p className="text-[11px] text-fg-4 mt-1">All records in leads table</p>
        </div>
        <div className="p-5 rounded-3xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">New This Week</p>
          <p className="text-3xl font-bold text-sky-600 mt-2">{kpis.newThisWeek}</p>
          <p className="text-[11px] text-fg-4 mt-1">created_at within last 7 days</p>
        </div>
        <div className="p-5 rounded-3xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Follow-up Due Today</p>
          <p className="text-3xl font-bold text-amber-600 mt-2">{kpis.followUpDueToday}</p>
          <p className="text-[11px] text-fg-4 mt-1">follow_up_at = today</p>
        </div>
        <div className="p-5 rounded-3xl bg-surface border border-line-2 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Converted</p>
          <p className="text-3xl font-bold text-emerald-600 mt-2">{kpis.converted}</p>
          <p className="text-[11px] text-fg-4 mt-1">pipeline_stage = Converted</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-surface border border-line-2 w-fit">
        <button
          onClick={() => setActiveTab("list")}
          className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === "list" ? "bg-fg text-surface shadow" : "text-fg-3 hover:text-fg"}`}
        >
          List
        </button>
        <button
          onClick={() => setActiveTab("pipeline")}
          className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === "pipeline" ? "bg-fg text-surface shadow" : "text-fg-3 hover:text-fg"}`}
        >
          Pipeline
        </button>
        <button
          onClick={() => setActiveTab("enquiries")}
          className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === "enquiries" ? "bg-fg text-surface shadow" : "text-fg-3 hover:text-fg"}`}
        >
          Enquiries
          <span className="ml-2 text-[10px] opacity-60">Website/IG</span>
        </button>
      </div>

      {/* Search + Filters – visible in List & Enquiries */}
      {(activeTab === "list" || activeTab === "enquiries") && (
        <div className="p-4 rounded-3xl bg-surface border border-line-2 shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1 lg:max-w-sm">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone, email…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg placeholder:text-fg-4 focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
            </div>
            <div className="text-[11px] text-fg-4 font-semibold">
              Showing {visibleLeads.length} of {leads.length} leads {activeTab === "enquiries" && "— Website & Instagram only"}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3 mb-1">Date (Created)</label>
              <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-full px-2 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3 mb-1">Stage</label>
              <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="w-full px-2 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg outline-none font-semibold">
                <option value="All">All Stages</option>
                {PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3 mb-1">Source</label>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="w-full px-2 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg outline-none font-semibold">
                <option value="All">All Sources</option>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3 mb-1">Follow-up</label>
              <select value={followUpFilter} onChange={(e) => setFollowUpFilter(e.target.value)} className="w-full px-2 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg outline-none font-semibold">
                <option value="All">All</option>
                <option value="has">Has follow-up</option>
                <option value="none">No follow-up</option>
                <option value="today">Due Today</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3 mb-1">Convertibility</label>
              <select value={convertibilityFilter} onChange={(e) => setConvertibilityFilter(e.target.value)} className="w-full px-2 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg outline-none font-semibold">
                <option value="All">All</option>
                {CONVERTIBILITY.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3 mb-1">Assigned Staff</label>
              <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)} className="w-full px-2 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg outline-none font-semibold">
                <option value="All">All Staff</option>
                <option value="unassigned">Unassigned</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(search || dateFilter || stageFilter !== "All" || sourceFilter !== "All" || followUpFilter !== "All" || convertibilityFilter !== "All" || assignedFilter !== "All") && (
            <button
              onClick={() => {
                setSearch("");
                setDateFilter("");
                setStageFilter("All");
                setSourceFilter("All");
                setFollowUpFilter("All");
                setConvertibilityFilter("All");
                setAssignedFilter("All");
              }}
              className="text-xs font-bold text-accent hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* LIST / ENQUIRIES TABLE */}
      {(activeTab === "list" || activeTab === "enquiries") && (
        <div className="bg-surface rounded-3xl border border-line-2 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center text-fg-3">
              <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-3" />
              <p className="text-xs font-semibold">Loading leads…</p>
            </div>
          ) : visibleLeads.length === 0 ? (
            <div className="p-12 text-center text-fg-3">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm font-bold text-fg-2">No leads found</p>
              <p className="text-xs text-fg-4 mt-1">Try adjusting filters or add a new lead.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-line-2 bg-surface-2/60 text-fg-3 uppercase font-bold text-[10px] tracking-wider">
                    <th className="py-3.5 px-4 whitespace-nowrap">Lead</th>
                    <th className="py-3.5 px-4">Source</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Convertibility</th>
                    <th className="py-3.5 px-4">Assigned To</th>
                    <th className="py-3.5 px-4">Follow-up</th>
                    <th className="py-3.5 px-4">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-2 text-fg">
                  {visibleLeads.map((lead) => (
                    <tr key={lead.id} onClick={() => setSelectedLead(lead)} className="hover:bg-hover/60 transition-colors cursor-pointer group">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-fg group-hover:text-accent transition-colors">{lead.full_name}</div>
                        <div className="text-[11px] text-fg-2 font-medium">{lead.phone_number}</div>
                        <div className="text-[10px] text-fg-4 hidden sm:block">{lead.email}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex px-2.5 py-1 rounded-full bg-surface-2 border border-line-2 text-[11px] font-bold">{lead.source}</span>
                        {lead.interest && <div className="text-[10px] text-fg-4 mt-1">{lead.interest}</div>}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border ${stageBadgeClasses(lead.pipeline_stage)}`}>{lead.pipeline_stage}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${convertibilityBadge(lead.convertibility)}`}>{lead.convertibility}</span>
                      </td>
                      <td className="py-3.5 px-4 text-fg-2 font-medium">{lead.assigned_to ? staffMap.get(lead.assigned_to) || "—" : <span className="text-fg-4 italic">Unassigned</span>}</td>
                      <td className="py-3.5 px-4">
                        {lead.follow_up_at ? (
                          <span className={`font-semibold ${isToday(lead.follow_up_at) ? "text-amber-600" : "text-fg-2"}`}>{formatDate(lead.follow_up_at)}</span>
                        ) : (
                          <span className="text-fg-4">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-fg-3">{formatDate(lead.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PIPELINE BOARD */}
      {activeTab === "pipeline" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-fg-3">Drag cards between columns to change pipeline_stage — persists via PUT /api/admin/leads/[id]</p>
            <button
              onClick={fetchLeads}
              className="px-3 py-1.5 rounded-xl bg-surface border border-line-2 text-xs font-bold hover:bg-hover"
            >
              Refresh
            </button>
          </div>
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center text-fg-3 bg-surface rounded-3xl border border-line-2">
              <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-3" />
              <p className="text-xs font-semibold">Loading pipeline…</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
              {PIPELINE_STAGES.map((stage) => (
                <div
                  key={stage}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(stage)}
                  className={`rounded-3xl border border-line-2 bg-surface flex flex-col min-h-[320px] ${draggedId ? "ring-1 ring-accent/20" : ""}`}
                >
                  <div className="px-3 py-3 border-b border-line-2 flex items-center justify-between sticky top-0 bg-surface rounded-t-3xl">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-fg">{stage}</span>
                    <span className="text-[11px] font-bold bg-surface-2 border border-line-2 rounded-full px-2 py-0.5">{pipelineGroups[stage]?.length || 0}</span>
                  </div>
                  <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                    {(pipelineGroups[stage] || []).map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={() => setDraggedId(lead.id)}
                        onDragEnd={() => setDraggedId(null)}
                        onClick={() => setSelectedLead(lead)}
                        className={`p-3 rounded-2xl bg-surface-2 border border-line-2 hover:border-accent/30 cursor-grab active:cursor-grabbing transition-all ${draggedId === lead.id ? "opacity-50 scale-[0.98]" : "hover:shadow-xs"}`}
                      >
                        <div className="text-xs font-bold text-fg truncate">{lead.full_name}</div>
                        <div className="text-[11px] text-fg-3 font-medium">{lead.phone_number}</div>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-line-2 font-bold">{lead.source}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${convertibilityBadge(lead.convertibility)}`}>{lead.convertibility}</span>
                        </div>
                        {lead.follow_up_at && <div className="text-[10px] text-amber-600 font-semibold mt-1.5">Follow-up: {formatDate(lead.follow_up_at)}</div>}
                        <div className="text-[10px] text-fg-4 mt-1 truncate">{staffMap.get(lead.assigned_to || "") || "Unassigned"}</div>
                      </div>
                    ))}
                    {(!pipelineGroups[stage] || pipelineGroups[stage].length === 0) && <div className="text-[11px] text-fg-4 text-center py-8 italic">No leads</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ADD LEAD MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-line-2 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line-2">
              <h3 className="text-lg font-serif font-bold text-fg">+ Add Lead</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-xl text-fg-3 hover:text-fg text-sm font-bold">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateLead} className="overflow-y-auto px-6 py-5 space-y-4 text-xs flex-1">
              {addError && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">{addError}</div>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input required value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Ananya Sharma" className="w-full px-3 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none" />
                </div>
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Phone <span className="text-red-500">*</span> <span className="font-normal normal-case text-fg-4">10 digits</span>
                  </label>
                  <input required type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="9876543210" className="w-full px-3 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none" />
                </div>
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input required type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="client@example.com" className="w-full px-3 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Source <span className="text-red-500">*</span>
                  </label>
                  <select value={formSource} onChange={(e) => setFormSource(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none font-semibold">
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">Primary Location</label>
                  <input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">Interest</label>
                  <select value={formInterest} onChange={(e) => setFormInterest(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none">
                    <option value="">Select interest</option>
                    {INTERESTS.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">Convertibility</label>
                  <select value={formConvertibility} onChange={(e) => setFormConvertibility(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none">
                    {CONVERTIBILITY.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">Assigned Staff</label>
                  <select value={formAssigned} onChange={(e) => setFormAssigned(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none">
                    <option value="">Unassigned</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">Follow-up Date</label>
                  <input type="date" value={formFollowUp} onChange={(e) => setFormFollowUp(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none" />
                </div>
              </div>

              <div>
                <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">Preferred Time</label>
                <input value={formPreferredTime} onChange={(e) => setFormPreferredTime(e.target.value)} placeholder="e.g. Evening 6-8pm" className="w-full px-3 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none" />
              </div>

              <div>
                <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">Notes / Message</label>
                <textarea rows={2} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Notes (internal)" className="w-full px-3 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none mb-2" />
                <textarea rows={2} value={formMessage} onChange={(e) => setFormMessage(e.target.value)} placeholder="Message from lead (enquiry text)" className="w-full px-3 py-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none" />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-line-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2.5 rounded-xl bg-surface-2 border border-line-2 text-fg font-semibold hover:bg-hover">
                  Cancel
                </button>
                <button type="submit" disabled={addLoading} className="px-6 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-accent-2 disabled:opacity-50 shadow-xs">
                  {addLoading ? "Saving…" : "Save Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PIPELINE MANAGE MODAL */}
      {showPipelineManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-line-2 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line-2 pb-3">
              <h3 className="text-lg font-serif font-bold text-fg">Pipeline Stages</h3>
              <button onClick={() => setShowPipelineManage(false)} className="p-1.5 rounded-xl text-fg-3 hover:text-fg text-sm font-bold">
                ✕
              </button>
            </div>
            <p className="text-xs text-fg-3">8-stage lead lifecycle. Drag cards on the Pipeline tab to move leads between stages. Stages are fixed to match DB constraint.</p>
            <div className="grid grid-cols-2 gap-2">
              {PIPELINE_STAGES.map((s, idx) => (
                <div key={s} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-line-2">
                  <span className="w-6 h-6 rounded-full bg-fg text-surface flex items-center justify-center text-[11px] font-bold">{idx + 1}</span>
                  <span className="text-xs font-bold text-fg">{s}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowPipelineManage(false)} className="px-5 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-2">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LEAD DETAIL DRAWER / MODAL */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedLead(null)} />
          <div className="relative w-full max-w-xl bg-surface border-l border-line-2 h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="sticky top-0 bg-surface border-b border-line-2 px-6 py-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-serif font-bold text-fg">{selectedLead.full_name}</h3>
                <p className="text-xs text-fg-3">{selectedLead.phone_number} • {selectedLead.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border ${stageBadgeClasses(selectedLead.pipeline_stage)}`}>{selectedLead.pipeline_stage}</span>
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${convertibilityBadge(selectedLead.convertibility)}`}>{selectedLead.convertibility}</span>
                  <span className="text-[11px] px-2 py-1 rounded-full bg-surface-2 border border-line-2 font-bold">{selectedLead.source}</span>
                </div>
              </div>
              <button onClick={() => setSelectedLead(null)} className="p-2 rounded-xl bg-surface-2 border border-line-2 text-fg-3 hover:text-fg font-bold">
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6 text-xs flex-1">
              {/* Contact */}
              <div className="rounded-2xl bg-surface-2 border border-line-2 p-4 space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-fg-3">Contact</h4>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex justify-between"><span className="text-fg-3">Full Name</span><span className="font-bold text-fg">{selectedLead.full_name}</span></div>
                  <div className="flex justify-between"><span className="text-fg-3">Phone</span><a href={`tel:${selectedLead.phone_number}`} className="font-bold text-accent hover:underline">{selectedLead.phone_number}</a></div>
                  <div className="flex justify-between"><span className="text-fg-3">Email</span><a href={`mailto:${selectedLead.email}`} className="font-bold text-accent hover:underline truncate ml-4">{selectedLead.email}</a></div>
                </div>
              </div>

              {/* Lead Info */}
              <div className="rounded-2xl bg-surface-2 border border-line-2 p-4 space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-fg-3">Lead Info</h4>
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-fg-3">Source</span><span className="font-semibold text-fg">{selectedLead.source}</span></div>
                  <div className="flex justify-between"><span className="text-fg-3">Interest</span><span className="font-semibold text-fg">{selectedLead.interest || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-fg-3">Convertibility</span><span className="font-semibold text-fg">{selectedLead.convertibility}</span></div>
                  <div className="flex justify-between"><span className="text-fg-3">Pipeline</span><span className="font-semibold text-fg">{selectedLead.pipeline_stage}</span></div>
                  <div className="flex justify-between"><span className="text-fg-3">Assigned</span><span className="font-semibold text-fg">{selectedLead.assigned_to ? staffMap.get(selectedLead.assigned_to) || selectedLead.assigned_to : "Unassigned"}</span></div>
                  <div className="flex justify-between"><span className="text-fg-3">Follow-up</span><span className="font-semibold text-fg">{selectedLead.follow_up_at ? formatDate(selectedLead.follow_up_at) : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-fg-3">Preferred Time</span><span className="font-semibold text-fg">{selectedLead.preferred_time || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-fg-3">Created</span><span className="font-semibold text-fg">{formatDate(selectedLead.created_at)}</span></div>
                  <div className="flex justify-between"><span className="text-fg-3">Location</span><span className="font-semibold text-fg">{selectedLead.primary_location}</span></div>
                  {selectedLead.message && <div><span className="text-fg-3 block mb-1">Message</span><p className="p-2 rounded-xl bg-surface border border-line-2 text-fg">{selectedLead.message}</p></div>}
                  {selectedLead.notes && <div><span className="text-fg-3 block mb-1">Notes</span><p className="p-2 rounded-xl bg-surface border border-line-2 text-fg">{selectedLead.notes}</p></div>}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-4">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-fg-3">Actions</h4>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      // inline edit: reuse selectedLead for quick rename – open prompt style
                      const name = prompt("Full Name", selectedLead.full_name);
                      if (name && name.trim() && name !== selectedLead.full_name) handleEditLeadInline(selectedLead, { full_name: name.trim() });
                    }}
                    className="px-3 py-2.5 rounded-xl bg-surface border border-line-2 font-bold hover:bg-hover"
                  >
                    Edit
                  </button>
                  <button onClick={() => router.push("/admin/trial-members")} className="px-3 py-2.5 rounded-xl bg-surface border border-line-2 font-bold hover:bg-hover">
                    Book Trial
                  </button>
                  <button onClick={() => handleConvert(selectedLead)} className="px-3 py-2.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700">
                    Convert
                  </button>
                  <button onClick={handleMarkLost} className="px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 font-bold hover:bg-red-500/20">
                    Mark Lost
                  </button>
                </div>

                <div className="rounded-2xl border border-line-2 p-3 space-y-2 bg-surface-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3">Change Stage</label>
                  <div className="flex gap-2">
                    <select value={detailStage} onChange={(e) => setDetailStage(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border border-line-2 bg-surface text-fg outline-none font-semibold">
                      {PIPELINE_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button onClick={handleDetailSaveStage} disabled={detailSaving} className="px-4 py-2 rounded-xl bg-fg text-surface font-bold disabled:opacity-50">
                      Save
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-line-2 p-3 space-y-2 bg-surface-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3">Assign Staff</label>
                  <div className="flex gap-2">
                    <select value={detailAssigned} onChange={(e) => setDetailAssigned(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border border-line-2 bg-surface text-fg outline-none">
                      <option value="">Unassigned</option>
                      {staffOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name}
                        </option>
                      ))}
                    </select>
                    <button onClick={handleDetailAssign} disabled={detailSaving} className="px-4 py-2 rounded-xl bg-fg text-surface font-bold disabled:opacity-50">
                      Assign
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-line-2 p-3 space-y-2 bg-surface-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3">Schedule Follow-up</label>
                  <div className="flex gap-2">
                    <input type="date" value={detailFollowUp} onChange={(e) => setDetailFollowUp(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border border-line-2 bg-surface text-fg outline-none" />
                    <button onClick={handleDetailFollowUp} disabled={detailSaving} className="px-4 py-2 rounded-xl bg-fg text-surface font-bold disabled:opacity-50">
                      Save
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (!selectedLead) return;
                        handleEditLeadInline(selectedLead, { notes: `Call logged ${new Date().toLocaleString()}${detailNote ? ": " + detailNote : ""}` });
                      }}
                      className="flex-1 px-3 py-2 rounded-xl bg-surface border border-line-2 font-bold hover:bg-hover"
                    >
                      Log Call/Visit
                    </button>
                    <button onClick={() => setDetailFollowUp(new Date().toISOString().slice(0, 10))} className="flex-1 px-3 py-2 rounded-xl bg-surface border border-line-2 font-bold hover:bg-hover">
                      Today
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-line-2 p-3 space-y-2 bg-surface-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-3">Add Note</label>
                  <textarea rows={3} value={detailNote} onChange={(e) => setDetailNote(e.target.value)} placeholder="Add internal note…" className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface text-fg outline-none" />
                  <button onClick={handleDetailSaveNote} disabled={detailSaving} className="w-full px-4 py-2 rounded-xl bg-accent text-white font-bold disabled:opacity-50">
                    {detailSaving ? "Saving…" : "Add Note"}
                  </button>
                </div>

                <button onClick={handleDelete} className="w-full px-4 py-2.5 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600">
                  Delete Lead
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
