"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

interface PlanItem {
  id: string;
  category: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  sessions: number | null;
  validity_days: number | null;
  grants_member_dashboard_access: boolean;
  stock_quantity: number | null;
  subcategory: string | null;
  is_active: boolean;
  sort_order: number;
  active_subscribers_count?: number;
}

type TabCategory = "Membership" | "Class Packages" | "PT" | "Combo" | "Other Charges";

const TABS: { key: TabCategory; label: string; icon: string; dbCategories: string[] }[] = [
  { key: "Membership", label: "Membership", icon: "💎", dbCategories: ["Membership Plans", "Membership"] },
  { key: "Class Packages", label: "Class Packages", icon: "📖", dbCategories: ["Class Packages"] },
  { key: "PT", label: "PT", icon: "🏷️", dbCategories: ["PT Packages", "PT"] },
  { key: "Combo", label: "Combo", icon: "📦", dbCategories: ["Combo Packages", "Combo"] },
  { key: "Other Charges", label: "Other Charges", icon: "💵", dbCategories: ["Other Charges", "Products", "Services"] },
];

export default function PackagesAndPlansPage() {
  const supabase = createClient();
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabCategory>("Class Packages");

  // Filters
  const [showInactive, setShowInactive] = useState(false);
  const [selectedClassType, setSelectedClassType] = useState("All Class Types");
  const [selectedType, setSelectedType] = useState("All Types");

  // Options Menu & Modal State
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanItem | null>(null);

  // Form State
  const [formCategory, setFormCategory] = useState<string>("Class Packages");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formSessions, setFormSessions] = useState("");
  const [formValidityDays, setFormValidityDays] = useState("");
  const [formSubcategory, setFormSubcategory] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Load plans & count active subscribers from member_purchased_plans
  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      const [plansRes, purchasedRes] = await Promise.all([
        supabase.from("billing_plan_items").select("*").order("sort_order", { ascending: true }),
        supabase.from("member_purchased_plans").select("plan_name, status"),
      ]);

      const rawPlans = plansRes.data || [];
      const purchased = purchasedRes.data || [];

      // Calculate active subscribers count for each plan by matching plan_name
      const activeCounts: Record<string, number> = {};
      purchased.forEach((p: any) => {
        if (p.status === "active" && p.plan_name) {
          activeCounts[p.plan_name] = (activeCounts[p.plan_name] || 0) + 1;
        }
      });

      const enriched = rawPlans.map((item: any) => ({
        ...item,
        active_subscribers_count: activeCounts[item.name] || 0,
      }));

      setPlans(enriched);
    } catch (err) {
      console.error("Error fetching packages & plans:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingPlan(null);
    const tabObj = TABS.find((t) => t.key === activeTab);
    setFormCategory(tabObj?.dbCategories[0] || "Class Packages");
    setFormName("");
    setFormDescription("");
    setFormPrice("");
    setFormSessions("");
    setFormValidityDays("");
    setFormSubcategory("");
    setFormIsActive(true);
    setShowCreateModal(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (plan: PlanItem) => {
    setEditingPlan(plan);
    setFormCategory(plan.category);
    setFormName(plan.name);
    setFormDescription(plan.description || "");
    setFormPrice(plan.price.toString());
    setFormSessions(plan.sessions?.toString() || "");
    setFormValidityDays(plan.validity_days?.toString() || "");
    setFormSubcategory(plan.subcategory || "");
    setFormIsActive(plan.is_active);
    setShowCreateModal(true);
    setMenuOpenId(null);
  };

  // Toggle Active Status
  const handleToggleActive = async (plan: PlanItem) => {
    try {
      const { error } = await supabase
        .from("billing_plan_items")
        .update({ is_active: !plan.is_active })
        .eq("id", plan.id);

      if (!error) {
        fetchPlans();
      }
    } catch (err) {
      console.error("Failed to toggle plan status:", err);
    } finally {
      setMenuOpenId(null);
    }
  };

  // Delete Plan
  const handleDeletePlan = async (planId: string) => {
    if (!confirm("Are you sure you want to delete this package/plan?")) return;
    try {
      const { error } = await supabase.from("billing_plan_items").delete().eq("id", planId);
      if (!error) fetchPlans();
    } catch (err) {
      console.error("Failed to delete plan:", err);
    } finally {
      setMenuOpenId(null);
    }
  };

  // Form Submit Handler
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPrice) return;

    setSubmitting(true);
    const priceNum = parseFloat(formPrice);
    const sessionsNum = formSessions ? parseInt(formSessions, 10) : null;
    const validityNum = formValidityDays ? parseInt(formValidityDays, 10) : null;

    const payload = {
      category: formCategory,
      name: formName,
      description: formDescription || null,
      price: priceNum,
      sessions: sessionsNum,
      validity_days: validityNum,
      subcategory: formSubcategory || null,
      is_active: formIsActive,
      grants_member_dashboard_access: true,
    };

    try {
      if (editingPlan) {
        await supabase.from("billing_plan_items").update(payload).eq("id", editingPlan.id);
      } else {
        await supabase.from("billing_plan_items").insert(payload);
      }
      setShowCreateModal(false);
      fetchPlans();
    } catch (err) {
      console.error("Error saving plan:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter plans based on activeTab, showInactive, selectedClassType, selectedType
  const filteredPlans = useMemo(() => {
    const currentTabObj = TABS.find((t) => t.key === activeTab);
    const allowedCategories = currentTabObj?.dbCategories || [];

    return plans.filter((p) => {
      // Category match
      if (!allowedCategories.includes(p.category)) return false;

      // Inactive filter
      if (!showInactive && !p.is_active) return false;

      // Subcategory / Type filter
      if (selectedType !== "All Types" && p.subcategory !== selectedType) return false;

      return true;
    });
  }, [plans, activeTab, showInactive, selectedType]);

  // Format currency helper
  const fmtCurrency = (n: number) => "₹" + n.toLocaleString("en-IN");

  // Calculate per session cost string
  const getPerSessionCost = (plan: PlanItem) => {
    if (!plan.sessions || plan.sessions === 0) return null;
    const cost = plan.price / plan.sessions;
    return `₹${cost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}/session`;
  };

  return (
    <div className="space-y-6 font-sans pb-12">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-fg tracking-tight">Plans</h1>
          <p className="text-xs text-fg-3 mt-1 font-medium">
            Manage membership, personal training, and class plans
          </p>
        </div>

        <button className="px-4 py-2 bg-indigo-600 text-white rounded-2xl text-xs font-bold shadow-md hover:bg-indigo-700 transition-all flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">?</span>
          Help
        </button>
      </div>

      {/* Main Tabs Navigation Bar */}
      <div className="flex items-center gap-2 p-1.5 bg-surface-2 rounded-2xl border border-line overflow-x-auto">
        {TABS.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key);
                setMenuOpenId(null);
              }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                isActive
                  ? "bg-accent text-white shadow-md shadow-accent/20"
                  : "text-fg-3 hover:text-fg hover:bg-surface"
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter & Create Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-xs font-semibold text-fg cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-4 h-4 rounded text-accent focus:ring-accent"
            />
            Show inactive
          </label>

          <select
            value={selectedClassType}
            onChange={(e) => setSelectedClassType(e.target.value)}
            className="p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs font-bold text-fg focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="All Class Types">All Class Types</option>
            <option value="Morning Reformer Group Class">Morning Reformer Group Class</option>
            <option value="Evening Reformer Group Class">Evening Reformer Group Class</option>
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs font-bold text-fg focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="All Types">All Types</option>
            <option value="Couple">Couple</option>
            <option value="Individual">Individual</option>
          </select>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="px-5 py-2.5 rounded-2xl bg-emerald-600 text-white text-xs font-extrabold hover:bg-emerald-700 shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all"
        >
          <span className="text-base">+</span>
          Create {activeTab === "PT" ? "PT Plan" : activeTab === "Class Packages" ? "Class Package" : "Plan"}
        </button>
      </div>

      {/* Packages Grid */}
      {loading ? (
        <div className="py-16 text-center text-xs text-fg-4 font-semibold">Loading packages &amp; plans...</div>
      ) : filteredPlans.length === 0 ? (
        <div className="py-16 text-center bg-surface-2/40 border border-dashed border-line-2 rounded-3xl space-y-2">
          <p className="text-xs font-bold text-fg-3">No plans found in {activeTab}</p>
          <p className="text-[11px] text-fg-4">Click the button above to add a new package.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPlans.map((plan) => {
            const isMenuOpen = menuOpenId === plan.id;
            const perSession = getPerSessionCost(plan);

            return (
              <div
                key={plan.id}
                className="bg-surface border border-line rounded-3xl p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 relative"
              >
                {/* Card Header: Title & Options Menu */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{activeTab === "PT" ? "🏷️" : "📖"}</span>
                    <h3 className="font-extrabold text-sm text-fg line-clamp-1">{plan.name}</h3>
                  </div>

                  <div className="relative">
                    <button
                      onClick={() => setMenuOpenId(isMenuOpen ? null : plan.id)}
                      className="p-1 rounded-lg text-fg-4 hover:text-fg hover:bg-surface-2 transition-colors font-bold text-sm"
                    >
                      •••
                    </button>

                    {/* Options Dropdown */}
                    {isMenuOpen && (
                      <div className="absolute right-0 top-7 z-20 w-36 bg-surface border border-line rounded-2xl shadow-xl py-1 text-xs font-semibold">
                        <button
                          onClick={() => handleOpenEditModal(plan)}
                          className="w-full text-left px-4 py-2 hover:bg-surface-2 text-fg flex items-center gap-2"
                        >
                          ✏️ Edit Plan
                        </button>
                        <button
                          onClick={() => handleToggleActive(plan)}
                          className="w-full text-left px-4 py-2 hover:bg-surface-2 text-fg flex items-center gap-2"
                        >
                          {plan.is_active ? "⏸️ Deactivate" : "▶️ Activate"}
                        </button>
                        <button
                          onClick={() => handleDeletePlan(plan.id)}
                          className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-red-500 flex items-center gap-2 font-bold"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Price & Session Rate */}
                <div>
                  <div className="text-2xl font-black text-indigo-600 tracking-tight">
                    {fmtCurrency(plan.price)}
                  </div>
                  {perSession && (
                    <div className="text-[11px] text-fg-4 font-semibold mt-0.5">{perSession}</div>
                  )}
                </div>

                {/* Tags Row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[11px] font-extrabold rounded-full">
                    {plan.sessions ? `${plan.sessions} Sessions` : "Unlimited"}{" "}
                    {plan.validity_days ? `• ${plan.validity_days}d` : ""}
                  </span>

                  {plan.subcategory === "Couple" && (
                    <span className="px-2.5 py-1 bg-purple-500/10 text-purple-500 border border-purple-500/20 text-[11px] font-extrabold rounded-full flex items-center gap-1">
                      👥 Couple
                    </span>
                  )}
                </div>

                {/* Applicable Classes (For Class Packages) */}
                {activeTab === "Class Packages" && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 bg-surface-2 border border-line text-[10px] font-medium text-fg-3 rounded-lg">
                      Morning Reformer Group Class
                    </span>
                    <span className="px-2 py-0.5 bg-surface-2 border border-line text-[10px] font-medium text-fg-3 rounded-lg">
                      Evening Reformer Group Class
                    </span>
                  </div>
                )}

                {/* Footer: Subscribers Count & Active Status */}
                <div className="flex items-center justify-between pt-3 border-t border-line text-[11px] font-semibold text-fg-4">
                  <div className="flex items-center gap-1">
                    <span>👥</span>
                    <span>
                      {plan.active_subscribers_count && plan.active_subscribers_count > 0
                        ? `${plan.active_subscribers_count} active`
                        : "No active subscribers"}
                    </span>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                      plan.is_active
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                        : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                    }`}
                  >
                    {plan.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Plan Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-extrabold text-fg">
                {editingPlan ? "Edit Package / Plan" : "Create New Package / Plan"}
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-full bg-surface-2 hover:bg-accent/10 text-fg-3 font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-fg mb-1">Category *</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none"
                >
                  <option value="Class Packages">Class Packages</option>
                  <option value="PT Packages">PT Packages</option>
                  <option value="Membership Plans">Membership Plans</option>
                  <option value="Combo Packages">Combo Packages</option>
                  <option value="Other Charges">Other Charges</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-fg mb-1">Plan Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Reformer Group Class (5), Beginner Pack"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg mb-1">Price (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="e.g. 48000"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-fg mb-1">Sessions Count</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 144"
                    value={formSessions}
                    onChange={(e) => setFormSessions(e.target.value)}
                    className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg mb-1">Validity (Days)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 365"
                    value={formValidityDays}
                    onChange={(e) => setFormValidityDays(e.target.value)}
                    className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-fg mb-1">Subcategory / Type</label>
                  <select
                    value={formSubcategory}
                    onChange={(e) => setFormSubcategory(e.target.value)}
                    className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none"
                  >
                    <option value="">Individual</option>
                    <option value="Couple">Couple</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-fg mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Optional plan details or breakdown..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none resize-none"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-fg cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-accent focus:ring-accent"
                />
                Active (available for purchase)
              </label>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2.5 border border-line-2 rounded-xl font-bold text-fg hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 bg-accent text-white font-extrabold rounded-xl hover:bg-accent-2 shadow-md shadow-accent/20 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : editingPlan ? "Update Plan" : "Create Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
