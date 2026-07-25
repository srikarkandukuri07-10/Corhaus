"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Modal from "@/components/modal";

interface StaffMember {
  id: string;
  full_name: string;
  phone_number: string;
  email: string | null;
  role: string;
  designation: string;
  location: string;
  employment_status: "Active" | "Inactive";
  joining_date: string | null;
  specialization: string | null;
  experience_years: number;
  certifications: string | null;
  classes_assigned: string | null;
  pt_available: boolean;
  group_class_available: boolean;
  monthly_salary: number;
  pt_commission: number;
  group_class_commission: number;
  payment_type: "Salary" | "Commission" | "Salary + Commission";
  gender: string | null;
  date_of_birth: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  address: string | null;
  bank_name: string | null;
  account_holder_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  upi_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SummaryMetrics {
  totalStaff: number;
  totalTrainers: number;
  activeStaff: number;
  monthlyPayroll: number;
}

const ROLES = ["Trainer", "Front Desk", "Admin", "Operations", "Manager", "Other"];
const LOCATIONS = ["Main Studio", "Studio Room A", "Studio Room B", "All Locations"];

export default function StaffPage() {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [summary, setSummary] = useState<SummaryMetrics>({
    totalStaff: 0,
    totalTrainers: 0,
    activeStaff: 0,
    monthlyPayroll: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [locationFilter, setLocationFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"name" | "joinDate" | "role">("name");

  // Modals state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [selectedStaffProfile, setSelectedStaffProfile] = useState<StaffMember | null>(null);
  const [deactivatingStaff, setDeactivatingStaff] = useState<StaffMember | null>(null);

  // Form Wizard State (1: Basic, 2: Trainer (if trainer), 3: Compensation/Personal, 4: Bank)
  const [formStep, setFormStep] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Input Fields
  const [formData, setFormData] = useState({
    full_name: "",
    phone_number: "",
    email: "",
    role: "Trainer",
    designation: "Pilates Instructor",
    location: "Main Studio",
    joining_date: new Date().toISOString().split("T")[0],
    employment_status: "Active" as "Active" | "Inactive",
    // Trainer Details
    specialization: "",
    experience_years: 2,
    certifications: "",
    classes_assigned: "",
    pt_available: true,
    group_class_available: true,
    // Compensation
    monthly_salary: 35000,
    pt_commission: 15,
    group_class_commission: 10,
    payment_type: "Salary + Commission" as "Salary" | "Commission" | "Salary + Commission",
    // Personal Details
    gender: "Female",
    date_of_birth: "",
    emergency_contact_name: "",
    emergency_contact_number: "",
    address: "",
    // Bank Details
    bank_name: "",
    account_holder_name: "",
    account_number: "",
    ifsc_code: "",
    upi_id: "",
  });

  const fetchStaffData = useCallback(async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        search: searchQuery,
        role: roleFilter,
        status: statusFilter,
        location: locationFilter,
        sortBy: sortBy,
      });
      const res = await fetch(`/api/admin/staff?${queryParams.toString()}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setActionError(json.error || "Failed to load staff data.");
      } else {
        setStaffList(json.staff || []);
        if (json.summary) {
          setSummary(json.summary);
        }
      }
    } catch (err: any) {
      console.error("fetchStaffData error:", err);
      setActionError("Failed to fetch staff records: " + (err.message || "Network error"));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, roleFilter, statusFilter, locationFilter, sortBy]);

  useEffect(() => {
    fetchStaffData();
  }, [fetchStaffData]);

  // Open Form Modal for Create
  const handleOpenAddStaff = () => {
    setEditingStaff(null);
    setFormStep(1);
    setFormError(null);
    setFormData({
      full_name: "",
      phone_number: "",
      email: "",
      role: "Trainer",
      designation: "Pilates Instructor",
      location: "Main Studio",
      joining_date: new Date().toISOString().split("T")[0],
      employment_status: "Active",
      specialization: "Reformer Pilates",
      experience_years: 3,
      certifications: "Certified Pilates Trainer",
      classes_assigned: "",
      pt_available: true,
      group_class_available: true,
      monthly_salary: 35000,
      pt_commission: 15,
      group_class_commission: 10,
      payment_type: "Salary + Commission",
      gender: "Female",
      date_of_birth: "",
      emergency_contact_name: "",
      emergency_contact_number: "",
      address: "",
      bank_name: "",
      account_holder_name: "",
      account_number: "",
      ifsc_code: "",
      upi_id: "",
    });
    setShowFormModal(true);
  };

  // Open Form Modal for Edit
  const handleOpenEditStaff = (staff: StaffMember) => {
    setEditingStaff(staff);
    setFormStep(1);
    setFormError(null);
    setFormData({
      full_name: staff.full_name || "",
      phone_number: staff.phone_number || "",
      email: staff.email || "",
      role: staff.role || "Trainer",
      designation: staff.designation || "",
      location: staff.location || "Main Studio",
      joining_date: staff.joining_date || new Date().toISOString().split("T")[0],
      employment_status: staff.employment_status || "Active",
      specialization: staff.specialization || "",
      experience_years: staff.experience_years || 0,
      certifications: staff.certifications || "",
      classes_assigned: staff.classes_assigned || "",
      pt_available: staff.pt_available !== false,
      group_class_available: staff.group_class_available !== false,
      monthly_salary: staff.monthly_salary || 0,
      pt_commission: staff.pt_commission || 0,
      group_class_commission: staff.group_class_commission || 0,
      payment_type: staff.payment_type || "Salary",
      gender: staff.gender || "Female",
      date_of_birth: staff.date_of_birth || "",
      emergency_contact_name: staff.emergency_contact_name || "",
      emergency_contact_number: staff.emergency_contact_number || "",
      address: staff.address || "",
      bank_name: staff.bank_name || "",
      account_holder_name: staff.account_holder_name || "",
      account_number: staff.account_number || "",
      ifsc_code: staff.ifsc_code || "",
      upi_id: staff.upi_id || "",
    });
    setShowFormModal(true);
  };

  // Step Validation
  const validateStep = (step: number): boolean => {
    setFormError(null);
    if (step === 1) {
      if (!formData.full_name.trim()) {
        setFormError("Full Name is required.");
        return false;
      }
      if (!formData.phone_number.trim()) {
        setFormError("Phone Number is required.");
        return false;
      }
      if (!/^\d{10}$/.test(formData.phone_number.trim())) {
        setFormError("Phone Number must be exactly 10 digits.");
        return false;
      }
      if (!formData.role.trim()) {
        setFormError("Role is required.");
        return false;
      }
      if (!formData.designation.trim()) {
        setFormError("Designation is required.");
        return false;
      }
      if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
        setFormError("Invalid Email address format.");
        return false;
      }
    } else if (step === 3) {
      if (isNaN(Number(formData.monthly_salary)) || Number(formData.monthly_salary) < 0) {
        setFormError("Monthly Salary must be a valid positive number.");
        return false;
      }
      if (isNaN(Number(formData.pt_commission)) || Number(formData.pt_commission) < 0) {
        setFormError("PT Commission must be a valid positive number.");
        return false;
      }
      if (isNaN(Number(formData.group_class_commission)) || Number(formData.group_class_commission) < 0) {
        setFormError("Group Class Commission must be a valid positive number.");
        return false;
      }
    }
    return true;
  };

  const handleNextStep = () => {
    if (!validateStep(formStep)) return;
    if (formStep === 1 && formData.role !== "Trainer") {
      setFormStep(3); // Skip trainer step for non-trainers
    } else {
      setFormStep((prev) => Math.min(4, prev + 1));
    }
  };

  const handlePrevStep = () => {
    if (formStep === 3 && formData.role !== "Trainer") {
      setFormStep(1);
    } else {
      setFormStep((prev) => Math.max(1, prev - 1));
    }
  };

  // Submit Form
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(1) || !validateStep(3)) return;

    setActionLoading(true);
    setFormError(null);

    const endpoint = "/api/admin/staff";
    const method = editingStaff ? "PUT" : "POST";
    const payload = editingStaff ? { id: editingStaff.id, ...formData } : formData;

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setActionLoading(false);

      if (!res.ok || data.error) {
        setFormError(data.error || "Failed to save staff details.");
      } else {
        setActionSuccess(editingStaff ? "Staff member updated successfully!" : "New staff member added successfully!");
        setShowFormModal(false);
        fetchStaffData();
      }
    } catch (err: any) {
      setActionLoading(false);
      setFormError("Failed to save staff record: " + (err.message || "Network error"));
    }
  };

  // Handle Deactivate Staff
  const handleConfirmDeactivate = async () => {
    if (!deactivatingStaff) return;
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/admin/staff?id=${encodeURIComponent(deactivatingStaff.id)}`, {
        method: "PATCH",
      });
      const data = await res.json();
      setActionLoading(false);

      if (!res.ok || data.error) {
        setActionError(data.error || "Failed to deactivate staff.");
      } else {
        setActionSuccess(`Staff member ${deactivatingStaff.full_name} marked as Inactive. Historical records preserved.`);
        setDeactivatingStaff(null);
        if (selectedStaffProfile?.id === deactivatingStaff.id) {
          setSelectedStaffProfile(null);
        }
        fetchStaffData();
      }
    } catch (err: any) {
      setActionLoading(false);
      setActionError("Deactivation failed: " + (err.message || "Network error"));
    }
  };

  // Mask Account Number for security
  const formatMaskedAccount = (num?: string | null) => {
    if (!num) return "N/A";
    const clean = num.trim();
    if (clean.length <= 4) return clean;
    return `••••••••${clean.slice(-4)}`;
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ─── PAGE HEADER & ADD STAFF BUTTON ────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-fg tracking-tight">Staff &amp; Trainers Management</h1>
          <p className="text-xs text-fg-3 mt-1">Manage internal studio staff, trainer specializations, compensation &amp; profiles</p>
        </div>

        <button
          onClick={handleOpenAddStaff}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-accent hover:bg-accent-2 text-white font-extrabold text-xs rounded-2xl transition-all shadow-lg shadow-accent/25 flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Add Staff
        </button>
      </div>

      {/* Alert Notifications */}
      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-2xl flex items-center justify-between">
          <span>✓ {actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-600 font-bold ml-3">✕</button>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs font-semibold rounded-2xl flex items-center justify-between">
          <span>⚠️ {actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-600 font-bold ml-3">✕</button>
        </div>
      )}

      {/* ─── SUMMARY CARDS ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface p-5 rounded-3xl border border-line shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-fg-3 uppercase tracking-wider">Total Staff</span>
            <div className="w-9 h-9 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
          </div>
          <p className="text-2xl font-black text-fg mt-3">{summary.totalStaff}</p>
          <span className="text-[10px] text-fg-4 mt-1 font-semibold">Registered staff members</span>
        </div>

        <div className="bg-surface p-5 rounded-3xl border border-line shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-fg-3 uppercase tracking-wider">Total Trainers</span>
            <div className="w-9 h-9 rounded-2xl bg-gold/15 flex items-center justify-center text-gold">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
          </div>
          <p className="text-2xl font-black text-fg mt-3">{summary.totalTrainers}</p>
          <span className="text-[10px] text-fg-4 mt-1 font-semibold">Pilates &amp; PT instructors</span>
        </div>

        <div className="bg-surface p-5 rounded-3xl border border-line shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-fg-3 uppercase tracking-wider">Active Staff</span>
            <div className="w-9 h-9 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>
          <p className="text-2xl font-black text-fg mt-3">{summary.activeStaff}</p>
          <span className="text-[10px] text-emerald-600 mt-1 font-semibold">Currently employed</span>
        </div>

        <div className="bg-gradient-to-br from-rail to-rail text-white p-5 rounded-3xl shadow-md relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Monthly Payroll</span>
            <div className="w-9 h-9 rounded-2xl bg-surface/10 flex items-center justify-center text-amber-300">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>
          <p className="text-2xl font-black text-white mt-3">₹{summary.monthlyPayroll.toLocaleString("en-IN")}</p>
          <span className="text-[10px] text-white/50 mt-1 font-semibold">Total active monthly salary</span>
        </div>
      </div>

      {/* ─── FILTERS & SEARCH CONTROL BAR ─────────────────────────────────────── */}
      <div className="bg-surface p-4 rounded-3xl border border-line shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <svg className="w-4 h-4 absolute left-3.5 top-3.5 text-fg-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, phone number, or designation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-line-2 bg-surface-2 text-xs font-semibold text-fg placeholder:text-fg-5 focus:ring-2 focus:ring-accent/30 focus:outline-none"
            />
          </div>

          {/* Filter Controls */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="p-2.5 rounded-xl border border-line-2 bg-surface-2 font-bold text-fg focus:outline-none"
              >
                <option value="All">All Roles</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="p-2.5 rounded-xl border border-line-2 bg-surface-2 font-bold text-fg focus:outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active Only</option>
                <option value="Inactive">Inactive Only</option>
              </select>
            </div>

            <div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="p-2.5 rounded-xl border border-line-2 bg-surface-2 font-bold text-fg focus:outline-none"
              >
                <option value="name">Sort by Name</option>
                <option value="joinDate">Sort by Join Date</option>
                <option value="role">Sort by Role</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ─── STAFF LIST TABLE ─────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-3xl border border-line shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        ) : staffList.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <p className="text-fg font-bold text-sm">No staff records found</p>
            <p className="text-xs text-fg-4 mt-1">Try adjusting search filters or click "Add Staff" to register a team member.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-2 border-b border-line text-fg-2 font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="py-3.5 px-5">Staff Member</th>
                  <th className="py-3.5 px-4">Role &amp; Designation</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4">Phone Number</th>
                  <th className="py-3.5 px-4">Specialization</th>
                  <th className="py-3.5 px-4">Compensation</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Join Date</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-semibold text-fg">
                {staffList.map((staff) => (
                  <tr key={staff.id} className="hover:bg-surface-2/70 transition-colors">
                    {/* Full Name & Avatar */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-accent-3 text-white font-extrabold flex items-center justify-center text-sm shadow-sm flex-shrink-0">
                          {staff.full_name ? staff.full_name.charAt(0).toUpperCase() : "S"}
                        </div>
                        <div>
                          <p className="font-extrabold text-sm text-fg">{staff.full_name}</p>
                          <p className="text-[11px] text-fg-4">{staff.email || "No Email"}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role & Designation */}
                    <td className="py-4 px-4">
                      <div className="space-y-0.5">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          staff.role === "Trainer" ? "bg-amber-100 text-amber-800" :
                          staff.role === "Front Desk" ? "bg-blue-100 text-blue-800" :
                          staff.role === "Admin" ? "bg-purple-100 text-purple-800" : "bg-gray-100 text-gray-800"
                        }`}>
                          {staff.role}
                        </span>
                        <p className="text-xs font-semibold text-fg/80">{staff.designation}</p>
                      </div>
                    </td>

                    {/* Location */}
                    <td className="py-4 px-4 text-fg-2">{staff.location || "Main Studio"}</td>

                    {/* Phone Number */}
                    <td className="py-4 px-4 font-mono text-fg">{staff.phone_number}</td>

                    {/* Specialization */}
                    <td className="py-4 px-4 text-fg-2">
                      {staff.specialization ? (
                        <span className="truncate max-w-[140px] block">{staff.specialization}</span>
                      ) : (
                        <span className="text-fg-5">—</span>
                      )}
                    </td>

                    {/* Compensation */}
                    <td className="py-4 px-4">
                      <p className="font-bold text-fg">₹{Number(staff.monthly_salary || 0).toLocaleString("en-IN")}/mo</p>
                      <p className="text-[10px] text-fg-4">{staff.payment_type}</p>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                        staff.employment_status === "Active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-200 text-gray-600"
                      }`}>
                        {staff.employment_status}
                      </span>
                    </td>

                    {/* Join Date */}
                    <td className="py-4 px-4 text-fg-3">
                      {staff.joining_date ? new Date(staff.joining_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedStaffProfile(staff)}
                          title="View Profile"
                          className="p-1.5 rounded-lg text-fg-3 hover:text-accent hover:bg-accent/10 transition-colors"
                        >
                          👁️ Profile
                        </button>
                        <button
                          onClick={() => handleOpenEditStaff(staff)}
                          title="Edit Staff"
                          className="p-1.5 rounded-lg text-fg-3 hover:text-gold hover:bg-gold/10 transition-colors"
                        >
                          ✏️ Edit
                        </button>
                        {staff.employment_status === "Active" && (
                          <button
                            onClick={() => setDeactivatingStaff(staff)}
                            title="Deactivate Staff"
                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                          >
                            🚫 Deactivate
                          </button>
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

      {/* ─── ADD / EDIT STAFF MULTI-STEP MODAL ───────────────────────────────── */}
      {showFormModal && (
        <Modal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-5">
            <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-2xl w-full p-6 flex flex-col animate-fade-in space-y-4 max-h-[90vh] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-line pb-3 flex-shrink-0">
                <div>
                  <h3 className="text-xl font-extrabold text-fg">
                    {editingStaff ? "Edit Staff Member" : "Add New Staff Member"}
                  </h3>
                  <p className="text-[11px] text-fg-3 mt-0.5">
                    Step {formStep} of {formData.role === "Trainer" ? 4 : 3}: Fill required staff details below
                  </p>
                </div>
                <button
                  onClick={() => setShowFormModal(false)}
                  className="w-8 h-8 rounded-full bg-surface-2 hover:bg-accent/10 text-xs font-bold text-fg-3 flex items-center justify-center transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Progress Steps Indicator */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className={`h-1.5 flex-1 rounded-full transition-all ${formStep >= 1 ? "bg-accent" : "bg-gray-200"}`} />
                {formData.role === "Trainer" && (
                  <div className={`h-1.5 flex-1 rounded-full transition-all ${formStep >= 2 ? "bg-accent" : "bg-gray-200"}`} />
                )}
                <div className={`h-1.5 flex-1 rounded-full transition-all ${formStep >= 3 ? "bg-accent" : "bg-gray-200"}`} />
                <div className={`h-1.5 flex-1 rounded-full transition-all ${formStep >= 4 ? "bg-accent" : "bg-gray-200"}`} />
              </div>

              {/* Error Alert */}
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center justify-between flex-shrink-0">
                  <span>⚠️ {formError}</span>
                  <button onClick={() => setFormError(null)} className="text-red-500 font-bold ml-2">✕</button>
                </div>
              )}

              {/* Form Body - Scrollable Container */}
              <form onSubmit={handleSubmitForm} className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs min-h-0">
                {/* STEP 1: Basic Information */}
                {formStep === 1 && (
                  <div className="space-y-3.5">
                    <p className="font-extrabold text-xs text-fg uppercase tracking-wider border-b border-line pb-1">
                      1. Basic Information
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Full Name *</label>
                        <input
                          type="text"
                          required
                          value={formData.full_name}
                          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                          placeholder="e.g. Rahul Sharma"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 font-semibold text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Phone Number (10 digits) *</label>
                        <input
                          type="text"
                          required
                          maxLength={10}
                          value={formData.phone_number}
                          onChange={(e) => setFormData({ ...formData, phone_number: e.target.value.replace(/\D/g, "") })}
                          placeholder="9876543210"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 font-mono text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Email ID</label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="rahul@corhaus.fit"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Role *</label>
                        <select
                          value={formData.role}
                          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 font-bold text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Designation *</label>
                        <input
                          type="text"
                          required
                          value={formData.designation}
                          onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                          placeholder="Senior Pilates Trainer"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Location</label>
                        <input
                          type="text"
                          value={formData.location}
                          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                          placeholder="Main Studio"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Date of Joining</label>
                        <input
                          type="date"
                          value={formData.joining_date}
                          onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Employment Status</label>
                        <select
                          value={formData.employment_status}
                          onChange={(e) => setFormData({ ...formData, employment_status: e.target.value as any })}
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 font-bold text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: Trainer Details (Conditional if Role = Trainer) */}
                {formStep === 2 && formData.role === "Trainer" && (
                  <div className="space-y-3.5">
                    <p className="font-extrabold text-xs text-fg uppercase tracking-wider border-b border-line pb-1">
                      2. Trainer Specific Details
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Trainer Specialization</label>
                        <input
                          type="text"
                          value={formData.specialization}
                          onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                          placeholder="Reformer Pilates, Mat Pilates, Posture Correction"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Experience (Years)</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.experience_years}
                          onChange={(e) => setFormData({ ...formData, experience_years: Number(e.target.value) })}
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block font-bold text-fg text-[11px] mb-1">Certifications</label>
                        <input
                          type="text"
                          value={formData.certifications}
                          onChange={(e) => setFormData({ ...formData, certifications: e.target.value })}
                          placeholder="e.g. Stott Pilates Certified, PMA Certified"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block font-bold text-fg text-[11px] mb-1">Classes Assigned</label>
                        <input
                          type="text"
                          value={formData.classes_assigned}
                          onChange={(e) => setFormData({ ...formData, classes_assigned: e.target.value })}
                          placeholder="Morning Reformer Group Class, Evening Reformer Group Class"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <label className="flex items-center gap-2 p-3 bg-surface-2 rounded-xl border border-line cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.pt_available}
                          onChange={(e) => setFormData({ ...formData, pt_available: e.target.checked })}
                          className="w-4 h-4 accent-accent rounded-md"
                        />
                        <span className="font-extrabold text-fg text-xs">Available for 1-on-1 PT</span>
                      </label>

                      <label className="flex items-center gap-2 p-3 bg-surface-2 rounded-xl border border-line cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.group_class_available}
                          onChange={(e) => setFormData({ ...formData, group_class_available: e.target.checked })}
                          className="w-4 h-4 accent-accent rounded-md"
                        />
                        <span className="font-extrabold text-fg text-xs">Available for Group Classes</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* STEP 3: Compensation & Personal Details */}
                {formStep === 3 && (
                  <div className="space-y-3.5">
                    <p className="font-extrabold text-xs text-fg uppercase tracking-wider border-b border-line pb-1">
                      3. Compensation &amp; Personal Information
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Monthly Salary (₹)</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.monthly_salary}
                          onChange={(e) => setFormData({ ...formData, monthly_salary: Number(e.target.value) })}
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 font-bold text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">PT Commission (%)</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={formData.pt_commission}
                          onChange={(e) => setFormData({ ...formData, pt_commission: Number(e.target.value) })}
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 font-bold text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Group Class Comm (%)</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={formData.group_class_commission}
                          onChange={(e) => setFormData({ ...formData, group_class_commission: Number(e.target.value) })}
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 font-bold text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-fg text-[11px] mb-1">Payment Structure Type</label>
                      <select
                        value={formData.payment_type}
                        onChange={(e) => setFormData({ ...formData, payment_type: e.target.value as any })}
                        className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 font-bold text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                      >
                        <option value="Salary">Salary Only</option>
                        <option value="Commission">Commission Only</option>
                        <option value="Salary + Commission">Salary + Commission</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Gender</label>
                        <select
                          value={formData.gender}
                          onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        >
                          <option value="Female">Female</option>
                          <option value="Male">Male</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Date of Birth</label>
                        <input
                          type="date"
                          value={formData.date_of_birth}
                          onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Emergency Contact Name</label>
                        <input
                          type="text"
                          value={formData.emergency_contact_name}
                          onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                          placeholder="Parent / Spouse Name"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Emergency Contact Number</label>
                        <input
                          type="text"
                          value={formData.emergency_contact_number}
                          onChange={(e) => setFormData({ ...formData, emergency_contact_number: e.target.value })}
                          placeholder="10-digit number"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 font-mono text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block font-bold text-fg text-[11px] mb-1">Residential Address</label>
                        <textarea
                          rows={2}
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          placeholder="Street address, city, pin code..."
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 4: Bank Details */}
                {formStep === 4 && (
                  <div className="space-y-3.5">
                    <p className="font-extrabold text-xs text-fg uppercase tracking-wider border-b border-line pb-1">
                      4. Bank &amp; Payout Account Details
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Account Holder Name</label>
                        <input
                          type="text"
                          value={formData.account_holder_name}
                          onChange={(e) => setFormData({ ...formData, account_holder_name: e.target.value })}
                          placeholder="As per bank passbook"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 font-semibold text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Bank Name</label>
                        <input
                          type="text"
                          value={formData.bank_name}
                          onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                          placeholder="HDFC Bank, ICICI, SBI..."
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">Account Number</label>
                        <input
                          type="text"
                          value={formData.account_number}
                          onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                          placeholder="Bank account number"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 font-mono text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-fg text-[11px] mb-1">IFSC Code</label>
                        <input
                          type="text"
                          value={formData.ifsc_code}
                          onChange={(e) => setFormData({ ...formData, ifsc_code: e.target.value.toUpperCase() })}
                          placeholder="HDFC0001234"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 font-mono text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block font-bold text-fg text-[11px] mb-1">UPI ID (Optional)</label>
                        <input
                          type="text"
                          value={formData.upi_id}
                          onChange={(e) => setFormData({ ...formData, upi_id: e.target.value })}
                          placeholder="name@upi or mobile@okicici"
                          className="w-full p-2.5 rounded-xl border border-line-2 bg-surface-2 font-mono text-fg focus:ring-2 focus:ring-accent/30 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </form>

              {/* Form Navigation Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-line flex-shrink-0">
                <button
                  type="button"
                  onClick={handlePrevStep}
                  disabled={formStep === 1}
                  className="px-4 py-2 border border-line-2 rounded-xl font-bold text-xs text-fg hover:bg-black/5 transition-all disabled:opacity-30"
                >
                  ← Back
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    className="px-4 py-2 border border-line-2 rounded-xl font-bold text-xs text-fg hover:bg-black/5 transition-all"
                  >
                    Cancel
                  </button>

                  {formStep < 4 ? (
                    <button
                      type="button"
                      onClick={handleNextStep}
                      className="px-6 py-2 bg-accent text-white font-extrabold text-xs rounded-xl hover:bg-accent-2 transition-all shadow-md shadow-accent/20"
                    >
                      Next →
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubmitForm}
                      disabled={actionLoading}
                      className="px-6 py-2 bg-accent text-white font-extrabold text-xs rounded-xl hover:bg-accent-2 transition-all shadow-md shadow-accent/20 disabled:opacity-50"
                    >
                      {actionLoading ? "Saving..." : editingStaff ? "Save Changes" : "Save Staff Member"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── VIEW STAFF PROFILE DRAWER / MODAL ──────────────────────────────── */}
      {selectedStaffProfile && (
        <Modal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6">
            <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-2xl w-full p-6 flex flex-col animate-fade-in space-y-5 max-h-[90vh] overflow-hidden">
              {/* Profile Header Card */}
              <div className="flex items-start justify-between border-b border-line pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent-3 text-white font-black text-2xl flex items-center justify-center shadow-md">
                    {selectedStaffProfile.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-extrabold text-fg">{selectedStaffProfile.full_name}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        selectedStaffProfile.employment_status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-700"
                      }`}>
                        {selectedStaffProfile.employment_status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-fg-2 mt-0.5">
                      {selectedStaffProfile.designation} &bull; <span className="text-accent font-bold">{selectedStaffProfile.role}</span>
                    </p>
                    <p className="text-[11px] text-fg-4 mt-1">📍 {selectedStaffProfile.location} &bull; 📞 {selectedStaffProfile.phone_number}</p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedStaffProfile(null)}
                  className="w-8 h-8 rounded-full bg-surface-2 hover:bg-accent/10 text-xs font-bold text-fg-3 flex items-center justify-center transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Profile Details Content */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-5 text-xs min-h-0">
                {/* Basic Info */}
                <div className="bg-surface-2 p-4 rounded-2xl border border-line space-y-2">
                  <h4 className="font-extrabold text-xs text-fg uppercase tracking-wider text-accent">Basic Information</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">Email</span>
                      <span className="font-bold text-fg">{selectedStaffProfile.email || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">Phone</span>
                      <span className="font-mono font-bold text-fg">{selectedStaffProfile.phone_number}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">Date of Joining</span>
                      <span className="font-bold text-fg">
                        {selectedStaffProfile.joining_date ? new Date(selectedStaffProfile.joining_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Trainer Info (Trainer Only) */}
                {selectedStaffProfile.role === "Trainer" && (
                  <div className="bg-surface-2 p-4 rounded-2xl border border-line space-y-2">
                    <h4 className="font-extrabold text-xs text-fg uppercase tracking-wider text-accent">Trainer Specifications</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <span className="text-[10px] text-fg-4 block font-semibold">Specialization</span>
                        <span className="font-bold text-fg">{selectedStaffProfile.specialization || "Pilates"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-fg-4 block font-semibold">Experience</span>
                        <span className="font-bold text-fg">{selectedStaffProfile.experience_years} Years</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-fg-4 block font-semibold">Certifications</span>
                        <span className="font-bold text-fg">{selectedStaffProfile.certifications || "Certified Trainer"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-fg-4 block font-semibold">1-on-1 PT</span>
                        <span className="font-bold text-fg">{selectedStaffProfile.pt_available ? "✓ Available" : "✕ Not Available"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-fg-4 block font-semibold">Group Classes</span>
                        <span className="font-bold text-fg">{selectedStaffProfile.group_class_available ? "✓ Available" : "✕ Not Available"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-fg-4 block font-semibold">Assigned Classes</span>
                        <span className="font-bold text-fg">{selectedStaffProfile.classes_assigned || "Standard Classes"}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Compensation */}
                <div className="bg-surface-2 p-4 rounded-2xl border border-line space-y-2">
                  <h4 className="font-extrabold text-xs text-fg uppercase tracking-wider text-accent">Compensation &amp; Payroll</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">Monthly Salary</span>
                      <span className="font-extrabold text-fg">₹{Number(selectedStaffProfile.monthly_salary || 0).toLocaleString("en-IN")}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">PT Commission</span>
                      <span className="font-bold text-fg">{selectedStaffProfile.pt_commission}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">Group Class Comm</span>
                      <span className="font-bold text-fg">{selectedStaffProfile.group_class_commission}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">Payment Type</span>
                      <span className="font-bold text-fg">{selectedStaffProfile.payment_type}</span>
                    </div>
                  </div>
                </div>

                {/* Personal & Emergency Info */}
                <div className="bg-surface-2 p-4 rounded-2xl border border-line space-y-2">
                  <h4 className="font-extrabold text-xs text-fg uppercase tracking-wider text-accent">Personal &amp; Emergency Details</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">Gender</span>
                      <span className="font-bold text-fg">{selectedStaffProfile.gender || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">Date of Birth</span>
                      <span className="font-bold text-fg">
                        {selectedStaffProfile.date_of_birth ? new Date(selectedStaffProfile.date_of_birth).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">Emergency Contact</span>
                      <span className="font-bold text-fg">
                        {selectedStaffProfile.emergency_contact_name ? `${selectedStaffProfile.emergency_contact_name} (${selectedStaffProfile.emergency_contact_number || "N/A"})` : "N/A"}
                      </span>
                    </div>
                    <div className="sm:col-span-3">
                      <span className="text-[10px] text-fg-4 block font-semibold">Address</span>
                      <span className="font-bold text-fg">{selectedStaffProfile.address || "N/A"}</span>
                    </div>
                  </div>
                </div>

                {/* Bank Information */}
                <div className="bg-surface-2 p-4 rounded-2xl border border-line space-y-2">
                  <h4 className="font-extrabold text-xs text-fg uppercase tracking-wider text-accent">Bank Payout Details</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">Account Holder</span>
                      <span className="font-bold text-fg">{selectedStaffProfile.account_holder_name || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">Bank Name</span>
                      <span className="font-bold text-fg">{selectedStaffProfile.bank_name || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">Account Number</span>
                      <span className="font-mono font-bold text-fg">{formatMaskedAccount(selectedStaffProfile.account_number)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-fg-4 block font-semibold">IFSC Code / UPI</span>
                      <span className="font-mono font-bold text-fg">{selectedStaffProfile.ifsc_code || selectedStaffProfile.upi_id || "N/A"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Profile Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
                <button
                  onClick={() => {
                    const st = selectedStaffProfile;
                    setSelectedStaffProfile(null);
                    handleOpenEditStaff(st);
                  }}
                  className="px-5 py-2.5 bg-accent text-white font-extrabold text-xs rounded-xl hover:bg-accent-2 transition-all"
                >
                  ✏️ Edit Profile
                </button>
                {selectedStaffProfile.employment_status === "Active" && (
                  <button
                    onClick={() => setDeactivatingStaff(selectedStaffProfile)}
                    className="px-5 py-2.5 border border-red-200 bg-red-50 text-red-700 font-extrabold text-xs rounded-xl hover:bg-red-100 transition-all"
                  >
                    🚫 Deactivate Staff
                  </button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── DEACTIVATE STAFF CONFIRMATION DIALOG ──────────────────────────── */}
      {deactivatingStaff && (
        <Modal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6">
            <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-md w-full p-6 flex flex-col animate-fade-in space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-fg">Deactivate Staff Member?</h3>
                <p className="text-xs text-fg-3 mt-1">
                  Are you sure you want to deactivate <strong className="text-fg">{deactivatingStaff.full_name}</strong>?
                </p>
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold rounded-xl text-left">
                  ℹ️ Employment status will be set to <strong>Inactive</strong>. All historical records, classes, and payroll logs will be preserved in Supabase without deletion.
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setDeactivatingStaff(null)}
                  className="px-5 py-2.5 border border-line-2 rounded-xl font-bold text-xs text-fg hover:bg-black/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDeactivate}
                  disabled={actionLoading}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-red-600/20 disabled:opacity-50"
                >
                  {actionLoading ? "Deactivating..." : "Yes, Deactivate Staff"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
