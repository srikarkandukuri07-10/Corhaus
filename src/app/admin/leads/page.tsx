"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Lead {
  id: string;
  full_name: string;
  phone_number: string;
  email: string;
  source: string;
  source_detail?: string | null;
  primary_location: string | null;
  interest: string | null;
  convertibility: string;
  pipeline_stage: string;
  assigned_to: string | null;
  follow_up_at: string | null;
  notes: string | null;
  preferred_time: string | null;
  message: string | null;
  converted_member_id?: string | null;
  converted_at?: string | null;
  created_at: string;
  updated_at?: string;
}

interface StaffOption {
  id: string;
  full_name: string;
  designation?: string | null;
}

type Tab = "list" | "pipeline" | "enquiries";

const STAGES = ["New", "Trial booked", "Trial attended", "Converted"] as const;
const SOURCES = ["Walk-in", "Phone", "Instagram", "Website", "WhatsApp", "Referral", "Facebook", "Google", "Other"] as const;
const INTERESTS = ["General Membership", "Personal Training", "Group Classes", "Yoga", "Zumba", "CrossFit", "Kickboxing/MMA", "Trial Class", "Just Enquiring", "Other", "Reformer Pilates", "Mat Pilates", "Private Session"] as const;
const CONVERT_OPTIONS = ["Hot", "Warm", "Cold"] as const;

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toDateTimeLocal(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function convertBadge(c: string): string {
  switch (c) {
    case "Hot":
      return "bg-red-500/10 text-red-500 border border-red-500/25";
    case "Warm":
      return "bg-orange-500/10 text-orange-500 border border-orange-500/25";
    case "Cold":
      return "bg-sky-500/10 text-sky-600 border border-sky-500/25";
    default:
      return "bg-surface-2 text-fg-3 border border-line";
  }
}

function followUpLabel(v: string | null | undefined): { text: string; cls: string; full: string } {
  if (!v) return { text: "-", cls: "text-fg-4", full: "No follow-up scheduled" };
  const d = new Date(v);
  if (isNaN(d.getTime())) return { text: "-", cls: "text-fg-4", full: "No follow-up scheduled" };
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((day - today) / 86400000);
  const full = fmtDateTime(v);
  if (diff < 0) return { text: "Overdue", cls: "text-xs font-bold text-red-500 bg-red-500/10 border border-red-500/25 px-2 py-1 rounded-full", full };
  if (diff === 0) return { text: "Today", cls: "text-xs font-bold text-amber-600 bg-amber-500/10 border border-amber-500/25 px-2 py-1 rounded-full", full };
  if (diff === 1) return { text: "Tomorrow", cls: "text-xs font-bold text-sky-600 bg-sky-500/10 border border-sky-500/25 px-2 py-1 rounded-full", full };
  return { text: fmtDate(v), cls: "text-fg-3 text-xs whitespace-nowrap", full };
}

const inputCls = "w-full px-3 py-2 rounded-xl border border-line bg-surface-2/50 text-fg text-sm placeholder:text-fg-5 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40";
const labelCls = "block text-xs font-semibold text-fg-3 mb-1";

const ENQUIRY_LINKS = [
  { label: "Instagram", path: "/trial?source=instagram", desc: "Use this link for enquiries coming from Instagram. This is the Instagram bio link." },
  { label: "WhatsApp", path: "/trial?source=whatsapp", desc: "Copy this link and send it directly to a lead through WhatsApp." },
  { label: "Facebook", path: "/trial?source=facebook", desc: "Use this link for enquiries coming from Facebook." },
  { label: "General Enquiry", path: "/trial", desc: "Use this link when the enquiry does not belong to a specific source." },
] as const;

function EnquiryLinks() {
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function copyLink(path: string) {
    const url = `${window.location.origin}${path}`;
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
    setCopied(path);
    setTimeout(() => setCopied((c) => (c === path ? null : c)), 2000);
  }

  return (
    <div className="bg-surface border border-line rounded-2xl">
      <button className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left" onClick={() => setOpen(!open)}>
        <span>
          <span className="text-base font-bold text-fg">Enquiry Links</span>
          <span className="block text-xs text-fg-4 mt-0.5">Share these links to collect enquiries. Every submission appears in Leads below.</span>
        </span>
        <span className={`text-fg-3 text-sm transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-4 pb-4 sm:px-5 sm:pb-5">
          {ENQUIRY_LINKS.map((l) => (
            <div key={l.label} className="border border-line rounded-xl p-3.5 bg-surface-2/40">
              <p className="text-sm font-bold text-fg">{l.label}</p>
              <p className="text-xs text-fg-4 mt-0.5">{l.desc}</p>
              <p className="text-xs font-mono text-fg-3 mt-2 truncate">{`${typeof window !== "undefined" ? window.location.origin : ""}${l.path}`}</p>
              <button
                onClick={() => copyLink(l.path)}
                className="mt-2.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-2 transition-colors"
              >
                {copied === l.path ? "Copied!" : "Copy Link"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
const btnPrimary = "px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors disabled:opacity-50";
const btnGhost = "px-4 py-2 rounded-xl border border-line bg-surface text-fg text-sm font-semibold hover:bg-hover transition-colors";
const selectCls = "px-3 py-2 rounded-xl border border-line bg-surface text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20";

const emptyForm = {
  full_name: "",
  phone_number: "",
  email: "",
  source: "",
  primary_location: "CorhausPilates - Main Branch",
  interest: "",
  convertibility: "",
  pipeline_stage: "",
  assigned_to: "",
  follow_up_at: "",
  notes: "",
  preferred_time: "",
  message: "",
};

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("list");
  const [dateFilter, setDateFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [fStage, setFStage] = useState("all");
  const [fSource, setFSource] = useState("all");
  const [fFollowup, setFFollowup] = useState("all");
  const [fConvert, setFConvert] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showPipelineInfo, setShowPipelineInfo] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [stageDraft, setStageDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [followDraft, setFollowDraft] = useState("");
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/leads");
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.error || "Failed to load leads");
        setLeads([]);
      } else {
        setLeads(Array.isArray(json.data) ? json.data : []);
      }
    } catch {
      setLoadError("Failed to load leads");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStaff = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase.from("staff_members").select("id, full_name, designation");
      if (Array.isArray(data)) setStaff(data as StaffOption[]);
    } catch {
      setStaff([]);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
    fetchStaff();
  }, [fetchLeads, fetchStaff]);

  const staffName = useCallback((id: string | null) => {
    if (!id) return "Unassigned";
    return staff.find((s) => s.id === id)?.full_name || "Unassigned";
  }, [staff]);

  const kpis = useMemo(() => {
    const now = new Date();
    const sevenAgo = new Date(now);
    sevenAgo.setDate(now.getDate() - 7);
    return {
      total: leads.length,
      newWeek: leads.filter((l) => {
        const d = new Date(l.created_at);
        return !isNaN(d.getTime()) && d >= sevenAgo && d <= now;
      }).length,
      dueToday: leads.filter((l) => {
        if (!l.follow_up_at) return false;
        const d = new Date(l.follow_up_at);
        return !isNaN(d.getTime()) && sameDay(d, now);
      }).length,
      converted: leads.filter((l) => l.pipeline_stage === "Converted").length,
    };
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    return leads.filter((l) => {
      if (tab === "enquiries" && !(l.source === "Website" || l.source === "Instagram")) return false;
      if (dateFilter !== "all") {
        const d = new Date(l.created_at);
        if (isNaN(d.getTime())) return false;
        if (dateFilter === "today" && !sameDay(d, now)) return false;
        if (dateFilter === "week") {
          const ago = new Date(now);
          ago.setDate(now.getDate() - 7);
          if (!(d >= ago && d <= now)) return false;
        }
        if (dateFilter === "month") {
          if (!(d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth())) return false;
        }
      }
      if (fStage !== "all" && l.pipeline_stage !== fStage) return false;
      if (fSource !== "all" && l.source !== fSource) return false;
      if (fConvert !== "all" && l.convertibility !== fConvert) return false;
      if (fFollowup === "has" && !l.follow_up_at) return false;
      if (fFollowup === "none" && l.follow_up_at) return false;
      if (fFollowup === "due") {
        if (!l.follow_up_at) return false;
        const d = new Date(l.follow_up_at);
        if (isNaN(d.getTime()) || !sameDay(d, now)) return false;
      }
      if (q) {
        const hay = `${l.full_name} ${l.phone_number} ${l.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, tab, dateFilter, search, fStage, fSource, fConvert, fFollowup]);

  const detail = useMemo(() => leads.find((l) => l.id === detailId) || null, [leads, detailId]);

  useEffect(() => {
    if (detail) {
      setStageDraft(detail.pipeline_stage);
      setFollowDraft(toDateTimeLocal(detail.follow_up_at));
      setNoteDraft("");
      setDrawerError("");
    }
  }, [detail]);

  async function inlineUpdate(id: string, patch: Record<string, string | null>) {
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...json.data } : l)));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }

  function validateLead(f: typeof emptyForm): string {
    if (!f.full_name.trim()) return "Full Name is required";
    if (f.phone_number.replace(/\D/g, "").length !== 10) return "Phone must be exactly 10 digits";
    if (!f.email.trim()) return "Email is required";
    if (!EMAIL_RE.test(f.email.trim().toLowerCase())) return "Invalid email";
    if (!(SOURCES as readonly string[]).includes(f.source)) return "Valid Source is required";
    if (!(CONVERT_OPTIONS as readonly string[]).includes(f.convertibility)) return "Convertibility (Hot, Warm or Cold) is required";
    if (!(STAGES as readonly string[]).includes(f.pipeline_stage)) return "Status is required";
    if (f.interest && !(INTERESTS as readonly string[]).includes(f.interest)) return "Invalid Interest";
    return "";
  }

  async function handleCreate() {
    const err = validateLead(form);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone_number: form.phone_number.replace(/\D/g, ""),
        email: form.email.trim().toLowerCase(),
        source: form.source,
        primary_location: form.primary_location || "CorhausPilates - Main Branch",
        interest: form.interest || null,
        convertibility: form.convertibility,
        pipeline_stage: form.pipeline_stage,
        assigned_to: form.assigned_to || null,
        follow_up_at: form.follow_up_at ? new Date(form.follow_up_at).toISOString() : null,
        notes: form.notes || null,
        preferred_time: form.preferred_time || null,
        message: form.message || null,
      };
      const res = await fetch("/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create lead");
      setForm({ ...emptyForm });
      setShowAdd(false);
      await fetchLeads();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to create lead");
    } finally {
      setSaving(false);
    }
  }

  function openEditFromDetail() {
    if (!detail) return;
    setEditForm({
      full_name: detail.full_name,
      phone_number: detail.phone_number,
      email: detail.email,
      source: detail.source,
      primary_location: detail.primary_location || "CorhausPilates - Main Branch",
      interest: detail.interest || "",
      convertibility: detail.convertibility,
      pipeline_stage: detail.pipeline_stage,
      assigned_to: detail.assigned_to || "",
      follow_up_at: toDateTimeLocal(detail.follow_up_at),
      notes: detail.notes || "",
      preferred_time: detail.preferred_time || "",
      message: detail.message || "",
    });
    setEditError("");
    setShowEdit(true);
  }

  async function handleEditSave() {
    if (!detail) return;
    const err = validateLead(editForm);
    if (err) {
      setEditError(err);
      return;
    }
    setEditError("");
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${detail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editForm.full_name.trim(),
          phone_number: editForm.phone_number.replace(/\D/g, ""),
          email: editForm.email.trim().toLowerCase(),
          source: editForm.source,
          primary_location: editForm.primary_location,
          interest: editForm.interest || null,
          convertibility: editForm.convertibility,
          pipeline_stage: editForm.pipeline_stage,
          assigned_to: editForm.assigned_to || null,
          follow_up_at: editForm.follow_up_at ? new Date(editForm.follow_up_at).toISOString() : null,
          notes: editForm.notes || null,
          preferred_time: editForm.preferred_time || null,
          message: editForm.message || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      setLeads((prev) => prev.map((l) => (l.id === detail.id ? { ...l, ...json.data } : l)));
      setShowEdit(false);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setEditSaving(false);
    }
  }

  async function drawerPatch(patch: Record<string, string | null>, successReset?: () => void) {
    if (!detail) return;
    setDrawerSaving(true);
    setDrawerError("");
    try {
      const res = await fetch(`/api/admin/leads/${detail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      setLeads((prev) => prev.map((l) => (l.id === detail.id ? { ...l, ...json.data } : l)));
      if (successReset) successReset();
    } catch (e: unknown) {
      setDrawerError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setDrawerSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this lead? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/admin/leads/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      setLeads((prev) => prev.filter((l) => l.id !== id));
      if (detailId === id) setDetailId(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleConvert(id: string) {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_stage: "Converted" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Convert failed");
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...json.data } : l)));
      const params = new URLSearchParams({
        prefill_name: lead.full_name,
        prefill_email: lead.email,
        prefill_phone: lead.phone_number,
      });
      router.push(`/admin/members?${params.toString()}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Convert failed");
    }
  }

  function exportCsv() {
    const header = ["Full Name", "Phone", "Email", "Source", "Interest", "Stage", "Convertibility", "Assigned Staff", "Follow-up", "Created"];
    const rows = filtered.map((l) => [
      l.full_name,
      l.phone_number,
      l.email,
      l.source,
      l.interest || "",
      l.pipeline_stage,
      l.convertibility,
      staffName(l.assigned_to),
      l.follow_up_at ? new Date(l.follow_up_at).toLocaleString("en-IN") : "",
      l.created_at ? new Date(l.created_at).toLocaleString("en-IN") : "",
    ]);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  }

  const kpiCards = [
    { label: "Total Leads", value: kpis.total, icon: "◉" },
    { label: "New This Week", value: kpis.newWeek, icon: "✦" },
    { label: "Follow-up Due Today", value: kpis.dueToday, icon: "◷" },
    { label: "Converted", value: kpis.converted, icon: "✔" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg">Leads &amp; Enquiries</h1>
          <p className="text-sm text-fg-4 mt-0.5">Track and convert potential members</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnGhost} onClick={() => setShowHelp(true)}>Help</button>
          <div className="relative">
            <button className={btnGhost} onClick={() => setShowExport((v) => !v)}>
              Export ▾
            </button>
            {showExport && (
              <div className="absolute right-0 mt-2 w-52 bg-surface border border-line rounded-xl shadow-xl p-2 z-40">
                <button className="w-full text-left px-3 py-2 rounded-lg text-sm text-fg hover:bg-hover" onClick={exportCsv}>
                  Download CSV ({filtered.length})
                </button>
              </div>
            )}
          </div>
          <button className={btnGhost} onClick={() => setShowPipelineInfo(true)}>Add/Edit Pipeline</button>
          <button className={btnPrimary} onClick={() => { setForm({ ...emptyForm }); setFormError(""); setShowAdd(true); }}>+ Add Lead</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((k) => (
          <div key={k.label} className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center text-lg font-bold">{k.icon}</div>
            <div>
              <p className="text-2xl font-bold text-fg leading-none">{k.value}</p>
              <p className="text-xs text-fg-4 mt-1">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      <EnquiryLinks />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <select className={selectCls} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="week">Last 7 Days</option>
          <option value="month">This Month</option>
        </select>
        <div className="flex bg-surface-2/60 border border-line rounded-xl p-1 gap-1 w-fit">
          {(["list", "pipeline", "enquiries"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${tab === t ? "bg-surface text-fg shadow-sm border border-line" : "text-fg-4 hover:text-fg"}`}
            >
              {t === "list" ? "List" : t === "pipeline" ? "Pipeline" : "Enquiries"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-2">
        <input
          className={inputCls + " lg:max-w-xs"}
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:flex gap-2 flex-1">
          <select className={selectCls} value={fStage} onChange={(e) => setFStage(e.target.value)}>
            <option value="all">All Stages</option>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={selectCls} value={fSource} onChange={(e) => setFSource(e.target.value)}>
            <option value="all">All Sources</option>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={selectCls} value={fFollowup} onChange={(e) => setFFollowup(e.target.value)}>
            <option value="all">All Follow-ups</option>
            <option value="has">Has Follow-up</option>
            <option value="none">No Follow-up</option>
            <option value="due">Due Today</option>
          </select>
          <select className={selectCls} value={fConvert} onChange={(e) => setFConvert(e.target.value)}>
            <option value="all">All Convertibility</option>
            {CONVERT_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {loadError && <div className="bg-red-500/10 border border-red-500/25 text-red-500 text-sm rounded-xl px-4 py-3">{loadError}</div>}

      {loading ? (
        <div className="bg-surface border border-line rounded-2xl py-16 text-center text-sm text-fg-4">Loading leads...</div>
      ) : tab === "pipeline" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {STAGES.map((stage) => {
            const cards = filtered.filter((l) => l.pipeline_stage === stage);
            return (
              <div
                key={stage}
                className="bg-surface border border-line rounded-2xl p-3 min-h-[240px]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault();
                  if (dragId) {
                    const id = dragId;
                    setDragId(null);
                    await inlineUpdate(id, { pipeline_stage: stage });
                    await fetchLeads();
                  }
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-fg">{stage}</p>
                  <span className="text-xs font-bold bg-surface-2 border border-line rounded-full px-2 py-0.5 text-fg-3">{cards.length}</span>
                </div>
                <div className="space-y-2">
                  {cards.map((l) => (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => setDragId(l.id)}
                      onClick={() => setDetailId(l.id)}
                      className="bg-surface-2/50 border border-line rounded-xl p-3 cursor-grab hover:border-accent/40 transition-colors"
                    >
                      <p className="text-sm font-semibold text-fg">{l.full_name}</p>
                      <p className="text-xs text-fg-4 mt-0.5">{l.phone_number}</p>
                      <div className="flex gap-1 mt-2">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${convertBadge(l.convertibility)}`}>{l.convertibility}</span>
                        <span className="text-[11px] text-fg-4 px-1 py-0.5">{l.source}</span>
                      </div>
                      <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                        <button className={btnPrimary + " flex-1 !py-1.5 !px-2 !text-[11px]"} onClick={() => handleConvert(l.id)}>Convert to Member</button>
                        <button className={btnGhost + " !py-1.5 !px-2 !text-[11px]"} onClick={() => { setDetailId(l.id); setTimeout(openEditFromDetail, 0); }}>Edit</button>
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && <p className="text-xs text-fg-5 text-center py-6">No leads</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          {tab === "enquiries" && (
            <div className="px-4 py-2.5 text-xs text-fg-3 bg-surface-2/50 border-b border-line">
              Showing enquiries from Website and Instagram sources only.
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-semibold text-fg-3">No leads yet</p>
              <p className="text-xs text-fg-5 mt-1">Add your first lead to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead>
                  <tr className="bg-surface-2/60 border-b border-line text-[11px] uppercase tracking-wider text-fg-4">
                    <th className="text-left p-3 font-semibold">Lead</th>
                    <th className="text-left p-3 font-semibold">Source</th>
                    <th className="text-left p-3 font-semibold">Status</th>
                    <th className="text-left p-3 font-semibold">Convertibility</th>
                    <th className="text-left p-3 font-semibold">Follow-up</th>
                    <th className="text-left p-3 font-semibold">Created</th>
                    <th className="text-right p-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.id} className="border-b border-line last:border-0 hover:bg-surface-2/30 cursor-pointer" onClick={() => setDetailId(l.id)}>
                      <td className="p-3">
                        <p className="font-semibold text-fg">{l.full_name}</p>
                        <p className="text-xs text-fg-4">{l.phone_number}</p>
                      </td>
                      <td className="p-3">
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-surface-2 border border-line text-fg-3">{l.source}</span>
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          className={selectCls + " text-xs py-1"}
                          value={l.pipeline_stage}
                          onChange={(e) => inlineUpdate(l.id, { pipeline_stage: e.target.value })}
                        >
                          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          className={selectCls + " text-xs py-1"}
                          value={l.convertibility}
                          onChange={(e) => inlineUpdate(l.id, { convertibility: e.target.value })}
                        >
                          {CONVERT_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        {l.follow_up_at ? (
                          <span className={followUpLabel(l.follow_up_at).cls} title={followUpLabel(l.follow_up_at).full}>{followUpLabel(l.follow_up_at).text}</span>
                        ) : (
                          <button
                            className="text-xs font-bold text-accent bg-accent/10 border border-accent/25 px-2.5 py-1 rounded-full hover:bg-accent/20"
                            onClick={() => setDetailId(l.id)}
                          >
                            + Schedule
                          </button>
                        )}
                      </td>
                      <td className="p-3 text-fg-3 text-xs whitespace-nowrap">{fmtDate(l.created_at)}</td>
                      <td className="p-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2 justify-end">
                          <button className={btnPrimary + " !py-1.5 !px-3 !text-xs"} onClick={() => handleConvert(l.id)}>Convert to Member</button>
                          <button className={btnGhost + " !py-1.5 !px-3 !text-xs"} onClick={() => { setDetailId(l.id); setTimeout(openEditFromDetail, 0); }}>Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailId(null)} />
          <div className="relative w-full max-w-md bg-surface border-l border-line h-full overflow-y-auto p-5 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-fg">{detail.full_name}</h2>
                <p className="text-xs text-fg-4">{detail.phone_number} · {detail.email}</p>
              </div>
              <button className="w-8 h-8 rounded-full bg-surface-2 text-fg-3 font-bold" onClick={() => setDetailId(null)}>×</button>
            </div>
            {drawerError && <div className="bg-red-500/10 border border-red-500/25 text-red-500 text-xs rounded-xl px-3 py-2">{drawerError}</div>}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-fg-4 mb-2">Contact</p>
              <div className="text-sm text-fg space-y-1">
                <p>{detail.full_name}</p>
                <p className="text-fg-3">{detail.phone_number}</p>
                <p className="text-fg-3">{detail.email}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-fg-4 mb-2">Lead Info</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-surface-2/50 border border-line rounded-xl p-2.5"><p className="text-fg-5">Source</p><p className="font-semibold text-fg mt-0.5">{detail.source}</p></div>
                <div className="bg-surface-2/50 border border-line rounded-xl p-2.5"><p className="text-fg-5">Interest</p><p className="font-semibold text-fg mt-0.5">{detail.interest || "-"}</p></div>
                <div className="bg-surface-2/50 border border-line rounded-xl p-2.5"><p className="text-fg-5">Convertibility</p><p className="font-semibold text-fg mt-0.5">{detail.convertibility}</p></div>
                <div className="bg-surface-2/50 border border-line rounded-xl p-2.5"><p className="text-fg-5">Status</p><p className="font-semibold text-fg mt-0.5">{detail.pipeline_stage}</p></div>
                <div className="bg-surface-2/50 border border-line rounded-xl p-2.5"><p className="text-fg-5">Follow-up</p><p className="font-semibold text-fg mt-0.5" title={detail.follow_up_at ? fmtDateTime(detail.follow_up_at) : undefined}>{detail.follow_up_at ? followUpLabel(detail.follow_up_at).text : "-"}</p></div>
                <div className="bg-surface-2/50 border border-line rounded-xl p-2.5"><p className="text-fg-5">Created</p><p className="font-semibold text-fg mt-0.5">{fmtDate(detail.created_at)}</p></div>
                <div className="bg-surface-2/50 border border-line rounded-xl p-2.5"><p className="text-fg-5">Location</p><p className="font-semibold text-fg mt-0.5">{detail.primary_location || "-"}</p></div>
              </div>
              {(detail.message || detail.notes) && (
                <div className="mt-2 text-xs bg-surface-2/50 border border-line rounded-xl p-2.5">
                  {detail.message && <p className="text-fg-3"><span className="text-fg-5">Message: </span>{detail.message}</p>}
                  {detail.notes && <p className="text-fg-3 mt-1 whitespace-pre-wrap"><span className="text-fg-5">Notes: </span>{detail.notes}</p>}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <select className={selectCls + " flex-1"} value={stageDraft} onChange={(e) => setStageDraft(e.target.value)}>
                  {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className={btnPrimary} disabled={drawerSaving} onClick={() => drawerPatch({ pipeline_stage: stageDraft })}>Save Stage</button>
              </div>
              <div className="flex gap-2">
                <input className={inputCls + " flex-1"} placeholder="Add a note..." value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
                <button
                  className={btnPrimary}
                  disabled={drawerSaving || !noteDraft.trim()}
                  onClick={() => drawerPatch({ notes: detail.notes ? `${detail.notes}\n${noteDraft.trim()}` : noteDraft.trim() }, () => setNoteDraft(""))}
                >
                  Add Note
                </button>
              </div>
              <div className="flex gap-2">
                <input type="datetime-local" className={inputCls + " flex-1"} value={followDraft} onChange={(e) => setFollowDraft(e.target.value)} />
                <button
                  className={btnPrimary}
                  disabled={drawerSaving}
                  onClick={() => drawerPatch({ follow_up_at: followDraft ? new Date(followDraft).toISOString() : null })}
                >
                  Save Follow-up
                </button>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button className={btnGhost} onClick={openEditFromDetail}>Edit</button>
                <button className={btnGhost} onClick={() => router.push("/admin/trial-members")}>Book Trial</button>
                <button className={btnPrimary} onClick={() => handleConvert(detail.id)}>Convert to Member</button>
                <button className="px-4 py-2 rounded-xl text-sm font-semibold text-red-500 border border-red-500/30 hover:bg-red-500/10" onClick={() => handleDelete(detail.id)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAdd(false)} />
          <div className="relative bg-surface border border-line rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-fg">Add Lead</h2>
              <button className="w-8 h-8 rounded-full bg-surface-2 text-fg-3 font-bold" onClick={() => setShowAdd(false)}>×</button>
            </div>
            {formError && <div className="bg-red-500/10 border border-red-500/25 text-red-500 text-xs rounded-xl px-3 py-2">{formError}</div>}
            <div>
              <label className={labelCls}>Full Name *</label>
              <input className={inputCls} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Phone *</label>
                <input className={inputCls} value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} placeholder="10 digits" />
              </div>
              <div>
                <label className={labelCls}>Email *</label>
                <input className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Source *</label>
                <select className={selectCls + " w-full"} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  <option value="">Select</option>
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Interest</label>
                <select className={selectCls + " w-full"} value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })}>
                  <option value="">Select</option>
                  {INTERESTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Primary Location</label>
              <input className={inputCls} value={form.primary_location} onChange={(e) => setForm({ ...form, primary_location: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Convertibility *</label>
                <select className={selectCls + " w-full"} value={form.convertibility} onChange={(e) => setForm({ ...form, convertibility: e.target.value })}>
                  <option value="">Select</option>
                  {CONVERT_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Status *</label>
                <select className={selectCls + " w-full"} value={form.pipeline_stage} onChange={(e) => setForm({ ...form, pipeline_stage: e.target.value })}>
                  <option value="">Select</option>
                  {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Assigned Staff</label>
                <select className={selectCls + " w-full"} value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
                  <option value="">Unassigned</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Follow-up</label>
                <input type="datetime-local" className={inputCls} value={form.follow_up_at} onChange={(e) => setForm({ ...form, follow_up_at: e.target.value })} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Preferred Time</label>
              <input className={inputCls} value={form.preferred_time} onChange={(e) => setForm({ ...form, preferred_time: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Message</label>
              <textarea className={inputCls} rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className={btnGhost} onClick={() => setShowAdd(false)}>Cancel</button>
              <button className={btnPrimary} disabled={saving} onClick={handleCreate}>{saving ? "Saving..." : "Add Lead"}</button>
            </div>
          </div>
        </div>
      )}

      {showEdit && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowEdit(false)} />
          <div className="relative bg-surface border border-line rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-fg">Edit Lead</h2>
              <button className="w-8 h-8 rounded-full bg-surface-2 text-fg-3 font-bold" onClick={() => setShowEdit(false)}>×</button>
            </div>
            {editError && <div className="bg-red-500/10 border border-red-500/25 text-red-500 text-xs rounded-xl px-3 py-2">{editError}</div>}
            <div>
              <label className={labelCls}>Full Name *</label>
              <input className={inputCls} value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Phone *</label>
                <input className={inputCls} value={editForm.phone_number} onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Email *</label>
                <input className={inputCls} value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Source *</label>
                <select className={selectCls + " w-full"} value={editForm.source} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })}>
                  <option value="">Select</option>
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Interest</label>
                <select className={selectCls + " w-full"} value={editForm.interest} onChange={(e) => setEditForm({ ...editForm, interest: e.target.value })}>
                  <option value="">Select</option>
                  {INTERESTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Primary Location</label>
              <input className={inputCls} value={editForm.primary_location} onChange={(e) => setEditForm({ ...editForm, primary_location: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Convertibility *</label>
                <select className={selectCls + " w-full"} value={editForm.convertibility} onChange={(e) => setEditForm({ ...editForm, convertibility: e.target.value })}>
                  <option value="">Select</option>
                  {CONVERT_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Status *</label>
                <select className={selectCls + " w-full"} value={editForm.pipeline_stage} onChange={(e) => setEditForm({ ...editForm, pipeline_stage: e.target.value })}>
                  <option value="">Select</option>
                  {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Assigned Staff</label>
                <select className={selectCls + " w-full"} value={editForm.assigned_to} onChange={(e) => setEditForm({ ...editForm, assigned_to: e.target.value })}>
                  <option value="">Unassigned</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Follow-up</label>
                <input type="datetime-local" className={inputCls} value={editForm.follow_up_at} onChange={(e) => setEditForm({ ...editForm, follow_up_at: e.target.value })} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Preferred Time</label>
              <input className={inputCls} value={editForm.preferred_time} onChange={(e) => setEditForm({ ...editForm, preferred_time: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea className={inputCls} rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Message</label>
              <textarea className={inputCls} rows={2} value={editForm.message} onChange={(e) => setEditForm({ ...editForm, message: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className={btnGhost} onClick={() => setShowEdit(false)}>Cancel</button>
              <button className={btnPrimary} disabled={editSaving} onClick={handleEditSave}>{editSaving ? "Saving..." : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {showPipelineInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPipelineInfo(false)} />
          <div className="relative bg-surface border border-line rounded-2xl w-full max-w-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-fg">Pipeline Stages</h2>
              <button className="w-8 h-8 rounded-full bg-surface-2 text-fg-3 font-bold" onClick={() => setShowPipelineInfo(false)}>×</button>
            </div>
            <div className="space-y-2">
              {STAGES.map((s, i) => (
                <div key={s} className="flex items-center gap-2 bg-surface-2/50 border border-line rounded-xl px-3 py-2">
                  <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="text-sm font-semibold text-fg">{s}</span>
                  <span className="ml-auto text-xs text-fg-4">{leads.filter((l) => l.pipeline_stage === s).length} leads</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-fg-4">Stages are fixed by business rules and cannot be added or renamed.</p>
            <div className="flex justify-end">
              <button className={btnPrimary} onClick={() => setShowPipelineInfo(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowHelp(false)} />
          <div className="relative bg-surface border border-line rounded-2xl w-full max-w-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-fg">Leads Workflow</h2>
              <button className="w-8 h-8 rounded-full bg-surface-2 text-fg-3 font-bold" onClick={() => setShowHelp(false)}>×</button>
            </div>
            <div className="text-sm text-fg-3 space-y-2">
              <p><span className="font-semibold text-fg">Manual Add:</span> use + Add Lead for walk-ins, phone calls, WhatsApp and referrals.</p>
              <p><span className="font-semibold text-fg">Instagram bio form:</span> website and Instagram enquiries appear under the Enquiries tab.</p>
              <p><span className="font-semibold text-fg">Stages:</span> New → Trial booked → Trial attended → Converted. Drag cards in Pipeline view or use Change Stage.</p>
              <p><span className="font-semibold text-fg">Follow-up:</span> schedule a follow-up date, then work the Follow-up Due Today KPI daily.</p>
            </div>
            <div className="flex justify-end">
              <button className={btnPrimary} onClick={() => setShowHelp(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
