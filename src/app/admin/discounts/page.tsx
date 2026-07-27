"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

interface MemberDiscount {
  id: string;
  approved_member_id: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  source: string;
  reason: string;
  status: "active" | "used" | "expired" | "deactivated";
  created_by: string;
  created_at: string;
  used_at: string | null;
  invoice_id: string | null;
}

interface MemberRecord {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  current_package?: string;
  active_discount?: MemberDiscount | null;
  discount_history?: MemberDiscount[];
}

const PRESET_REASONS = [
  "Goodwill",
  "Referral Reward",
  "Festival Offer",
  "Compensation",
  "Promotional Offer",
  "Staff Decision",
];

export default function DiscountsPage() {
  const supabase = createClient();

  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [sourceFilter, setSourceFilter] = useState<string>("All Sources");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedMemberForHistory, setSelectedMemberForHistory] = useState<MemberRecord | null>(null);
  const [editingDiscount, setEditingDiscount] = useState<MemberDiscount | null>(null);

  // Form State
  const [formMemberId, setFormMemberId] = useState("");
  const [formDiscountType, setFormDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [formDiscountValue, setFormDiscountValue] = useState("");
  const [formReason, setFormReason] = useState("Goodwill");
  const [formCustomReason, setFormCustomReason] = useState("");
  const [formSource, setFormSource] = useState("Manual");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load members and discounts data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/discounts");
      const data = await res.json();
      if (res.ok && data.members) {
        setMembers(data.members);
      } else {
        console.error("Failed to load discounts data:", data.error);
      }
    } catch (err) {
      console.error("Error fetching discounts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Open Add Modal
  const handleOpenAddModal = (member?: MemberRecord) => {
    setEditingDiscount(null);
    setFormMemberId(member?.id || (members[0]?.id || ""));
    setFormDiscountType("percentage");
    setFormDiscountValue("");
    setFormReason("Goodwill");
    setFormCustomReason("");
    setFormSource("Manual");
    setErrorMsg(null);
    setShowAddModal(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (member: MemberRecord, discount: MemberDiscount) => {
    setEditingDiscount(discount);
    setFormMemberId(member.id);
    setFormDiscountType(discount.discount_type);
    setFormDiscountValue(discount.discount_value.toString());
    if (PRESET_REASONS.includes(discount.reason)) {
      setFormReason(discount.reason);
      setFormCustomReason("");
    } else {
      setFormReason("Other");
      setFormCustomReason(discount.reason);
    }
    setFormSource(discount.source);
    setErrorMsg(null);
    setShowAddModal(true);
  };

  // Save Discount Handler
  const handleSaveDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMemberId || !formDiscountValue) {
      setErrorMsg("Please select a member and enter a discount value.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const finalReason = formReason === "Other" ? formCustomReason.trim() : formReason;

    try {
      if (editingDiscount) {
        // Edit existing discount
        const res = await fetch(`/api/admin/discounts/${editingDiscount.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discount_type: formDiscountType,
            discount_value: formDiscountValue,
            reason: finalReason,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update discount");
      } else {
        // Create new discount
        const res = await fetch("/api/admin/discounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approved_member_id: formMemberId,
            discount_type: formDiscountType,
            discount_value: formDiscountValue,
            source: formSource,
            reason: finalReason,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create discount");
      }

      setShowAddModal(false);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save discount.");
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle Deactivate / Activate Handler
  const handleToggleStatus = async (discount: MemberDiscount) => {
    const newStatus = discount.status === "active" ? "deactivated" : "active";
    try {
      const res = await fetch(`/api/admin/discounts/${discount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error("Failed to toggle discount status:", err);
    }
  };

  // Filter Members
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      // Search text
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = m.full_name?.toLowerCase().includes(q);
        const matchEmail = m.email?.toLowerCase().includes(q);
        const matchPhone = m.phone_number?.includes(q);
        if (!matchName && !matchEmail && !matchPhone) return false;
      }

      // Status filter
      if (statusFilter !== "All") {
        if (statusFilter === "No Discount" && m.active_discount) return false;
        if (statusFilter === "Active" && m.active_discount?.status !== "active") return false;
        if (statusFilter === "Used" && !m.discount_history?.some((d) => d.status === "used")) return false;
        if (statusFilter === "Deactivated" && !m.discount_history?.some((d) => d.status === "deactivated")) return false;
      }

      // Source filter
      if (sourceFilter !== "All Sources") {
        const hasSource = m.discount_history?.some((d) => d.source === sourceFilter);
        if (!hasSource) return false;
      }

      return true;
    });
  }, [members, searchQuery, statusFilter, sourceFilter]);

  // Compute Metrics
  const metrics = useMemo(() => {
    let activeCount = 0;
    let referralCount = 0;
    let usedCount = 0;

    members.forEach((m) => {
      if (m.active_discount) activeCount++;
      m.discount_history?.forEach((d) => {
        if (d.source === "Referral Reward") referralCount++;
        if (d.status === "used") usedCount++;
      });
    });

    return { activeCount, referralCount, usedCount, totalMembers: members.length };
  }, [members]);

  return (
    <div className="space-y-6 font-sans pb-12">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-fg tracking-tight">Discounts</h1>
          <p className="text-xs text-fg-3 mt-1 font-medium">
            Manage member-based discounts, referral rewards, and automatic billing incentives
          </p>
        </div>

        <button
          onClick={() => handleOpenAddModal()}
          className="px-5 py-2.5 rounded-2xl bg-accent text-white text-xs font-extrabold hover:bg-accent-2 shadow-md shadow-accent/20 flex items-center gap-2 transition-all"
        >
          <span className="text-base font-black">+</span>
          Add Discount
        </button>
      </div>

      {/* KPI Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-line rounded-3xl p-5 shadow-2xs space-y-1">
          <p className="text-[11px] font-bold text-fg-4 uppercase tracking-wider">Registered Members</p>
          <p className="text-2xl font-black text-fg">{metrics.totalMembers}</p>
        </div>

        <div className="bg-surface border border-line rounded-3xl p-5 shadow-2xs space-y-1">
          <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">Active Discounts</p>
          <p className="text-2xl font-black text-emerald-500">{metrics.activeCount}</p>
        </div>

        <div className="bg-surface border border-line rounded-3xl p-5 shadow-2xs space-y-1">
          <p className="text-[11px] font-bold text-purple-500 uppercase tracking-wider">Referral Rewards</p>
          <p className="text-2xl font-black text-purple-500">{metrics.referralCount}</p>
        </div>

        <div className="bg-surface border border-line rounded-3xl p-5 shadow-2xs space-y-1">
          <p className="text-[11px] font-bold text-blue-500 uppercase tracking-wider">Discounts Used</p>
          <p className="text-2xl font-black text-blue-500">{metrics.usedCount}</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface p-4 border border-line rounded-3xl shadow-2xs">
        <div className="flex items-center gap-3 w-full sm:w-auto flex-1 max-w-md">
          <div className="relative w-full">
            <input
              type="text"
              placeholder="Search member by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-2.5 pl-9 rounded-2xl border border-line-2 bg-surface-2 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <svg
              className="w-4 h-4 text-fg-4 absolute left-3 top-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs font-bold text-fg focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active Discount</option>
            <option value="Used">Used Discount</option>
            <option value="Deactivated">Deactivated</option>
            <option value="No Discount">No Discount</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs font-bold text-fg focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="All Sources">All Sources</option>
            <option value="Manual">Manual Staff Discount</option>
            <option value="Referral Reward">Referral Reward (3 Referrals)</option>
          </select>
        </div>
      </div>

      {/* Members & Discounts Table / List View */}
      {loading ? (
        <div className="py-16 text-center text-xs text-fg-4 font-semibold">Loading members &amp; discounts...</div>
      ) : filteredMembers.length === 0 ? (
        <div className="py-16 text-center bg-surface-2/40 border border-dashed border-line-2 rounded-3xl space-y-2">
          <p className="text-xs font-bold text-fg-3">No members match your search criteria</p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-3xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-2/60 border-b border-line text-[11px] font-extrabold text-fg-4 uppercase tracking-wider">
                  <th className="py-3.5 px-5">Member Name</th>
                  <th className="py-3.5 px-5">Contact</th>
                  <th className="py-3.5 px-5">Active Package</th>
                  <th className="py-3.5 px-5">Active Discount</th>
                  <th className="py-3.5 px-5">Source &amp; Reason</th>
                  <th className="py-3.5 px-5">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredMembers.map((member) => {
                  const activeDisc = member.active_discount;
                  const hasActive = !!activeDisc;

                  return (
                    <tr key={member.id} className="hover:bg-surface-2/30 transition-colors">
                      {/* Name */}
                      <td className="py-4 px-5">
                        <div className="font-extrabold text-fg text-sm">{member.full_name}</div>
                      </td>

                      {/* Contact */}
                      <td className="py-4 px-5 text-fg-3 font-medium">
                        <div>{member.phone_number || "No phone"}</div>
                        <div className="text-[10px] text-fg-4">{member.email}</div>
                      </td>

                      {/* Active Package */}
                      <td className="py-4 px-5 font-semibold text-fg-2">
                        {member.current_package}
                      </td>

                      {/* Active Discount */}
                      <td className="py-4 px-5">
                        {hasActive ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-black rounded-full text-xs">
                            <span>
                              {activeDisc.discount_type === "percentage"
                                ? `${activeDisc.discount_value}% OFF`
                                : `₹${activeDisc.discount_value.toLocaleString("en-IN")} OFF`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-fg-4 font-semibold text-[11px]">No Active Discount</span>
                        )}
                      </td>

                      {/* Source & Reason */}
                      <td className="py-4 px-5">
                        {hasActive ? (
                          <div>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                activeDisc.source === "Referral Reward"
                                  ? "bg-purple-500/10 text-purple-500 border border-purple-500/20"
                                  : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                              }`}
                            >
                              {activeDisc.source}
                            </span>
                            <p className="text-[11px] font-medium text-fg-3 mt-1">{activeDisc.reason}</p>
                          </div>
                        ) : (
                          <span className="text-fg-4">&mdash;</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-5">
                        {hasActive ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            Active
                          </span>
                        ) : member.discount_history && member.discount_history.length > 0 ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                            {member.discount_history[0].status}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20">
                            No Discount
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenAddModal(member)}
                            className="px-3 py-1.5 bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl text-xs font-bold transition-all"
                          >
                            + Add
                          </button>

                          {hasActive && (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(member, activeDisc!)}
                                className="p-1.5 bg-surface-2 hover:bg-surface-3 text-fg-3 rounded-xl transition-colors"
                                title="Edit Discount"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>

                              <button
                                onClick={() => handleToggleStatus(activeDisc!)}
                                className="p-1.5 bg-surface-2 hover:bg-red-500/10 text-fg-4 hover:text-red-400 rounded-xl transition-colors"
                                title="Deactivate Discount"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => {
                              setSelectedMemberForHistory(member);
                              setShowHistoryModal(true);
                            }}
                            className="p-1.5 bg-surface-2 hover:bg-surface-3 text-fg-3 rounded-xl transition-colors"
                            title="Discount History"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Discount Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-extrabold text-fg">
                {editingDiscount ? "Edit Member Discount" : "Add Discount to Member"}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-surface-2 hover:bg-accent/10 text-fg-3 font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold rounded-xl">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveDiscount} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-fg mb-1">Select Member *</label>
                <select
                  value={formMemberId}
                  onChange={(e) => setFormMemberId(e.target.value)}
                  disabled={!!editingDiscount}
                  className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none disabled:opacity-60"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.phone_number || m.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg mb-1">Discount Type *</label>
                  <select
                    value={formDiscountType}
                    onChange={(e) => setFormDiscountType(e.target.value as any)}
                    className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-fg mb-1">
                    Value ({formDiscountType === "percentage" ? "%" : "₹"}) *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="1"
                    max={formDiscountType === "percentage" ? "100" : undefined}
                    placeholder={formDiscountType === "percentage" ? "e.g. 15" : "e.g. 500"}
                    value={formDiscountValue}
                    onChange={(e) => setFormDiscountValue(e.target.value)}
                    className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-fg mb-1">Discount Reason *</label>
                <select
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none"
                >
                  {PRESET_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  <option value="Other">Custom Reason...</option>
                </select>
              </div>

              {formReason === "Other" && (
                <div>
                  <label className="block font-bold text-fg mb-1">Custom Reason Details *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter custom reason details..."
                    value={formCustomReason}
                    onChange={(e) => setFormCustomReason(e.target.value)}
                    className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-fg mb-1">Discount Source</label>
                <select
                  value={formSource}
                  onChange={(e) => setFormSource(e.target.value)}
                  className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none"
                >
                  <option value="Manual">Manual</option>
                  <option value="Referral Reward">Referral Reward</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 border border-line-2 rounded-xl font-bold text-fg hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 bg-emerald-600 text-white font-extrabold rounded-xl hover:bg-emerald-700 shadow-md shadow-emerald-600/20 disabled:opacity-50"
                >
                  {submitting ? "Applying..." : editingPlan ? "Update Discount" : "Apply Discount"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discount History Modal */}
      {showHistoryModal && selectedMemberForHistory && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-fg">
                  Discount History &bull; {selectedMemberForHistory.full_name}
                </h3>
                <p className="text-xs text-fg-3">{selectedMemberForHistory.email}</p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="w-8 h-8 rounded-full bg-surface-2 hover:bg-accent/10 text-fg-3 font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {!selectedMemberForHistory.discount_history ||
              selectedMemberForHistory.discount_history.length === 0 ? (
                <p className="text-xs text-fg-4 text-center py-6">No discount history recorded for this member.</p>
              ) : (
                selectedMemberForHistory.discount_history.map((disc) => (
                  <div
                    key={disc.id}
                    className="p-4 rounded-2xl border border-line bg-surface-2/40 flex items-start justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-fg">
                          {disc.discount_type === "percentage"
                            ? `${disc.discount_value}% OFF`
                            : `₹${disc.discount_value.toLocaleString("en-IN")} OFF`}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-surface border border-line text-[10px] font-bold text-fg-3">
                          {disc.source}
                        </span>
                      </div>
                      <p className="text-fg-3 font-medium">{disc.reason}</p>
                      <p className="text-[10px] text-fg-4">
                        Created by {disc.created_by} on {new Date(disc.created_at).toLocaleDateString("en-IN")}
                      </p>
                      {disc.used_at && (
                        <p className="text-[10px] text-emerald-500 font-bold">
                          Used on {new Date(disc.used_at).toLocaleDateString("en-IN")}
                        </p>
                      )}
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                        disc.status === "active"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : disc.status === "used"
                          ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                          : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                      }`}
                    >
                      {disc.status}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end border-t border-line pt-3">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-5 py-2 bg-surface-2 text-fg font-bold rounded-xl hover:bg-surface-3"
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
