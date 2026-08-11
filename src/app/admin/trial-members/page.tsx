"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatTime } from "@/lib/date-utils";

import Link from "next/link";
import { useRouter } from "next/navigation";

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

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All Active");
  const [viewTab, setViewTab] = useState<"active" | "converted" | "all">("active");

  // Create Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
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

  // Edit Modal state
  const [editingTrial, setEditingTrial] = useState<TrialMember | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Reschedule Modal state
  const [reschedulingTrial, setReschedulingTrial] = useState<TrialMember | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("09:00");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

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
        const matchesName = item.full_name.toLowerCase().includes(q);
        const matchesPhone = item.phone_number.includes(q);
        const matchesEmail = (item.email || "").toLowerCase().includes(q);
        const matchesClass = item.class_name.toLowerCase().includes(q);
        const matchesInstructor = item.instructor_name.toLowerCase().includes(q);
        return matchesName || matchesPhone || matchesEmail || matchesClass || matchesInstructor;
      }

      return true;
    });
  }, [trialMembers, viewTab, statusFilter, searchQuery]);

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
          phone_number: formPhone.trim(),
          email: formEmail.trim() || null,
          trial_date: formDate,
          trial_time: formTime,
          class_id: formClassId || null,
          class_name: formClassName.trim(),
          instructor_id: formInstructorId || null,
          instructor_name: formInstructorName.trim(),
          notes: formNotes.trim() || null,
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

  // Quick Action: Update Status (Attended / No Show)
  const handleUpdateStatus = async (trialId: string, status: "Attended" | "No Show" | "Scheduled") => {
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
    <div className="space-y-6">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-2 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-fg-3 mb-1">
            <span>People &amp; Classes</span>
            <span>/</span>
            <span className="text-fg font-bold">Trial Members</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-fg">Trial Members Management</h1>
          <p className="text-xs text-fg-3 mt-1">
            Track prospective client trial bookings, attendance, and member conversions.
          </p>
        </div>

        <button
          onClick={() => {
            resetCreateForm();
            setShowCreateModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-accent text-white text-xs font-bold hover:bg-accent-2 transition-all shadow-md shadow-accent/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          + Create Trial Member
        </button>
      </div>

      {/* Error notification */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
      <div className="p-4 rounded-2xl bg-surface border border-line-2 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-2 pb-3">
          {/* View Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewTab("active")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                viewTab === "active"
                  ? "bg-accent text-white shadow-xs"
                  : "bg-surface-2 text-fg-3 hover:text-fg hover:bg-hover"
              }`}
            >
              Active Trials ({metrics.scheduled + metrics.attended + metrics.noShow})
            </button>
            <button
              onClick={() => setViewTab("converted")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                viewTab === "converted"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-surface-2 text-fg-3 hover:text-fg hover:bg-hover"
              }`}
            >
              Converted History ({metrics.converted})
            </button>
            <button
              onClick={() => setViewTab("all")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
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
              placeholder="Search name, phone, class..."
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
        <div className="flex items-center gap-3 text-xs">
          <span className="font-bold text-fg-3 uppercase text-[10px] tracking-wider">Status Filter:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none font-semibold"
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

      {/* Trial Members Dashboard Data Table */}
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
          <div className="overflow-x-auto">
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
                {filteredTrialMembers.map((item) => (
                  <tr key={item.id} className="hover:bg-hover/50 transition-colors">
                    {/* Full Name */}
                    <td className="py-3.5 px-4 font-bold text-fg">
                      {item.full_name}
                      {item.notes && (
                        <div className="text-[10px] text-fg-4 font-normal mt-0.5 max-w-xs truncate" title={item.notes}>
                          Note: {item.notes}
                        </div>
                      )}
                    </td>

                    {/* Phone Number */}
                    <td className="py-3.5 px-4 text-fg-2 font-medium">
                      {item.phone_number}
                    </td>

                    {/* Email */}
                    <td className="py-3.5 px-4 text-fg-3">
                      {item.email || "—"}
                    </td>

                    {/* Trial Date & Time */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-fg">{formatDateDisplay(item.trial_date)}</div>
                      <div className="text-[10px] text-fg-3">{formatTimeDisplay(item.trial_time)}</div>
                    </td>

                    {/* Assigned Class */}
                    <td className="py-3.5 px-4 font-semibold text-fg">
                      {item.class_name}
                    </td>

                    {/* Instructor */}
                    <td className="py-3.5 px-4 text-fg-2">
                      {item.instructor_name}
                    </td>

                    {/* Trial Status Badge */}
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

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {item.status !== "Converted" ? (
                          <>
                            {/* Convert to Member */}
                            <button
                              onClick={() => handleConvertToMember(item)}
                              title="Convert to regular member"
                              className="px-2.5 py-1 rounded-xl bg-purple-600 text-white font-bold text-[11px] hover:bg-purple-700 transition-colors shadow-xs"
                            >
                              Convert to Member
                            </button>

                            {/* Mark Attended & No Show (Only shown when Scheduled) */}
                            {item.status === "Scheduled" && (
                              <>
                                <button
                                  onClick={() => handleUpdateStatus(item.id, "Attended")}
                                  title="Mark Attended"
                                  className="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 font-bold text-[11px] hover:bg-emerald-500/20 transition-colors"
                                >
                                  Attended
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(item.id, "No Show")}
                                  title="Mark No Show"
                                  className="px-2.5 py-1 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 font-bold text-[11px] hover:bg-red-500/20 transition-colors"
                                >
                                  No Show
                                </button>
                              </>
                            )}


                            {/* Reschedule */}
                            <button
                              onClick={() => {
                                setReschedulingTrial(item);
                                setRescheduleDate(item.trial_date);
                                setRescheduleTime(item.trial_time);
                              }}
                              title="Reschedule Trial"
                              className="px-2.5 py-1 rounded-xl bg-surface-2 border border-line-2 text-fg font-semibold text-[11px] hover:bg-hover transition-colors"
                            >
                              Reschedule
                            </button>

                            {/* Edit */}
                            <button
                              onClick={() => setEditingTrial({ ...item })}
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
                              onClick={() => setEditingTrial({ ...item })}
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
        )}
      </div>

      {/* CREATE TRIAL MEMBER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-line-2 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
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
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. client@example.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent outline-none"
                  />
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
          <div className="bg-surface border border-line-2 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
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
                  <label className="block font-bold text-fg-3 uppercase tracking-wider text-[10px] mb-1">
                    Phone Number
                  </label>
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

      {/* RESCHEDULE TRIAL MODAL */}
      {reschedulingTrial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-line-2 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
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
