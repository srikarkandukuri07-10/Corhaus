"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

type CategoryKey =
  | "Membership Plans"
  | "PT Packages"
  | "Class Packages"
  | "Services"
  | "Combo Packages"
  | "Products"
  | "Other Charges";

const ALL_CATEGORIES: CategoryKey[] = [
  "Membership Plans",
  "PT Packages",
  "Class Packages",
  "Services",
  "Combo Packages",
  "Products",
  "Other Charges",
];

const EMPTY_FORM = {
  category: "Class Packages" as CategoryKey,
  name: "",
  description: "",
  price: "",
  original_price: "",
  sessions: "",
  validity_days: "",
  grants_member_dashboard_access: false,
  stock_quantity: "",
  subcategory: "",
  sort_order: "0",
};

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

// ─── Billing Sub-Nav ──────────────────────────────────────────────────────────

function BillingSubNav() {
  const pathname = usePathname();
  const subNav = [
    { href: "/admin/billing", label: "Create Bill", exact: true },
    { href: "/admin/billing/invoices", label: "Invoices", exact: true },
    { href: "/admin/billing/plan-items", label: "Plan Catalogue", exact: false },
  ];
  return (
    <div className="flex items-center gap-1 mb-5">
      {subNav.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              active
                ? "bg-brand-navy text-white shadow-sm"
                : "text-brand-navy/60 hover:text-brand-navy hover:bg-brand-beige"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PlanItemsPage() {
  const supabase = createClient();

  const [items, setItems] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("Class Packages");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirm
  const [deletingItem, setDeletingItem] = useState<PlanItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("billing_plan_items")
      .select("*")
      .order("category")
      .order("sort_order");
    if (!error && data) setItems(data as PlanItem[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const categoryItems = items.filter((i) => i.category === activeCategory);

  function openAddForm() {
    setEditingItem(null);
    setForm({ ...EMPTY_FORM, category: activeCategory });
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(item: PlanItem) {
    setEditingItem(item);
    setForm({
      category: item.category as CategoryKey,
      name: item.name,
      description: item.description || "",
      price: item.price.toString(),
      original_price: item.original_price?.toString() || "",
      sessions: item.sessions?.toString() || "",
      validity_days: item.validity_days?.toString() || "",
      grants_member_dashboard_access: item.grants_member_dashboard_access,
      stock_quantity: item.stock_quantity?.toString() || "",
      subcategory: item.subcategory || "",
      sort_order: item.sort_order.toString(),
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingItem(null);
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) {
      setFormError("Price must be a valid non-negative number.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }

    const payload = {
      category: form.category,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price,
      original_price: form.original_price ? parseFloat(form.original_price) : null,
      sessions: form.sessions ? parseInt(form.sessions) : null,
      validity_days: form.validity_days ? parseInt(form.validity_days) : null,
      grants_member_dashboard_access: form.grants_member_dashboard_access,
      stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity) : null,
      subcategory: form.subcategory.trim() || null,
      sort_order: parseInt(form.sort_order) || 0,
    };

    setFormLoading(true);
    try {
      if (editingItem) {
        const { error } = await supabase
          .from("billing_plan_items")
          .update(payload)
          .eq("id", editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("billing_plan_items")
          .insert({ ...payload, is_active: true });
        if (error) throw error;
      }
      await fetchItems();
      closeForm();
    } catch (err: unknown) {
      setFormError((err as { message?: string }).message || "Failed to save item.");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleToggleActive(item: PlanItem) {
    setActionError(null);
    const { error } = await supabase
      .from("billing_plan_items")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    if (error) {
      setActionError(error.message);
    } else {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, is_active: !item.is_active } : i
        )
      );
    }
  }

  async function handleDelete() {
    if (!deletingItem) return;
    setDeleteLoading(true);
    const { error } = await supabase
      .from("billing_plan_items")
      .delete()
      .eq("id", deletingItem.id);
    if (error) {
      setActionError(error.message);
    } else {
      setItems((prev) => prev.filter((i) => i.id !== deletingItem.id));
      setDeletingItem(null);
    }
    setDeleteLoading(false);
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-1">
        <h1 className="text-2xl font-light text-brand-navy">
          Plan <span className="font-medium">Catalogue</span>
        </h1>
        <p className="text-sm text-brand-navy/50 mt-0.5">
          Manage all billable plans, packages, products, and charges
        </p>
      </div>

      <BillingSubNav />

      {actionError && (
        <div className="mb-4 p-3 rounded-xl bg-brand-error/10 border border-brand-error/20 text-brand-error text-sm">
          {actionError}
        </div>
      )}

      <div className="flex gap-4">
        {/* ── Category sidebar ── */}
        <div className="w-56 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-brand-sand/50 p-3 space-y-0.5">
            <p className="text-[10px] font-semibold text-brand-navy/30 uppercase tracking-wider px-2 pb-2">
              Categories
            </p>
            {ALL_CATEGORIES.map((cat) => {
              const count = items.filter((i) => i.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    activeCategory === cat
                      ? "bg-brand-navy text-white"
                      : "text-brand-navy/60 hover:text-brand-navy hover:bg-brand-beige"
                  }`}
                >
                  <span className="text-left leading-tight">{cat}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      activeCategory === cat
                        ? "bg-white/20"
                        : "bg-brand-sand/60 text-brand-navy/50"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Items table ── */}
        <div className="flex-1 min-w-0">
          {/* Table header */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-brand-navy">{activeCategory}</h2>
            <button
              onClick={openAddForm}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-brown text-white text-sm font-medium hover:bg-brand-brown-dark transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Add Item
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 bg-white rounded-2xl border border-brand-sand/50">
              <div className="flex flex-col items-center gap-3">
                <div className="w-7 h-7 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
                <p className="text-sm text-brand-navy/40">Loading…</p>
              </div>
            </div>
          ) : categoryItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-brand-sand/50 p-12 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-sand/30 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-brand-navy/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-brand-navy/50 font-medium">
                No items in {activeCategory}
              </p>
              <p className="text-sm text-brand-navy/30 mt-1">
                Click &quot;Add Item&quot; to create the first one.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-brand-sand/50 overflow-hidden">
              {/* Table column headers */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-brand-sand/50 bg-brand-cream/30">
                {["Name", "Price", "Sessions / Validity", "Dashboard", ""].map((h) => (
                  <p key={h} className="text-xs font-semibold text-brand-navy/40 uppercase tracking-wide">
                    {h}
                  </p>
                ))}
              </div>

              <div className="divide-y divide-brand-sand/30">
                {categoryItems.map((item) => (
                  <div
                    key={item.id}
                    className={`grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-4 items-center transition-colors ${
                      item.is_active ? "hover:bg-brand-cream/20" : "opacity-50 bg-brand-sand/10"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-brand-navy">
                          {item.name}
                        </p>
                        {item.subcategory && (
                          <span className="text-[10px] bg-brand-brown/10 text-brand-brown px-2 py-0.5 rounded-full">
                            {item.subcategory}
                          </span>
                        )}
                        {!item.is_active && (
                          <span className="text-[10px] bg-brand-sand/60 text-brand-navy/40 px-2 py-0.5 rounded-full">
                            Inactive
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-brand-navy/40 mt-0.5 line-clamp-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-brand-brown">
                        {fmt(item.price)}
                      </p>
                      {item.original_price && (
                        <p className="text-xs text-brand-navy/30 line-through">
                          {fmt(item.original_price)}
                        </p>
                      )}
                    </div>
                    <div>
                      {item.sessions && (
                        <p className="text-xs text-brand-navy/70">
                          {item.sessions} sessions
                        </p>
                      )}
                      {item.validity_days && (
                        <p className="text-xs text-brand-navy/40">
                          {item.validity_days} days
                        </p>
                      )}
                      {item.stock_quantity !== null && item.stock_quantity !== undefined && (
                        <p className="text-xs text-brand-navy/50">
                          Stock: {item.stock_quantity}
                        </p>
                      )}
                      {!item.sessions && !item.validity_days && item.stock_quantity === null && (
                        <p className="text-xs text-brand-navy/20">—</p>
                      )}
                    </div>
                    <div>
                      {item.grants_member_dashboard_access ? (
                        <span className="text-xs bg-brand-success/10 text-brand-success px-2 py-1 rounded-full font-medium">
                          ✓ Yes
                        </span>
                      ) : (
                        <span className="text-xs text-brand-navy/25">No</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditForm(item)}
                        title="Edit"
                        className="w-8 h-8 rounded-lg text-brand-navy/40 hover:text-brand-navy hover:bg-brand-beige transition-colors flex items-center justify-center"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleToggleActive(item)}
                        title={item.is_active ? "Deactivate" : "Activate"}
                        className={`w-8 h-8 rounded-lg transition-colors flex items-center justify-center ${
                          item.is_active
                            ? "text-brand-navy/40 hover:text-amber-600 hover:bg-amber-50"
                            : "text-brand-success hover:bg-brand-success/10"
                        }`}
                      >
                        {item.is_active ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => setDeletingItem(item)}
                        title="Delete"
                        className="w-8 h-8 rounded-lg text-brand-navy/30 hover:text-brand-error hover:bg-brand-error/10 transition-colors flex items-center justify-center"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Add / Edit Form Modal ─────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div
            className="absolute inset-0 bg-brand-navy/20 backdrop-blur-sm"
            onClick={closeForm}
          />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto animate-slide-up">
            <div className="sticky top-0 bg-white border-b border-brand-sand/50 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="font-semibold text-brand-navy">
                {editingItem ? "Edit Item" : "Add New Item"}
              </h2>
              <button
                onClick={closeForm}
                className="w-8 h-8 rounded-lg text-brand-navy/40 hover:text-brand-navy hover:bg-brand-beige transition-colors flex items-center justify-center"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-brand-error/10 border border-brand-error/20 text-brand-error text-sm">
                  {formError}
                </div>
              )}

              <FormField label="Category">
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value as CategoryKey }))
                  }
                  className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-brown"
                >
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Name *">
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Reformer Group Class (5)"
                  className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                />
              </FormField>

              <FormField label="Description">
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="Short description shown on plan cards"
                  className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown resize-none"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Price (₹) *">
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="e.g. 1000"
                    className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                  />
                </FormField>
                <FormField label="MRP / Original (₹)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.original_price}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, original_price: e.target.value }))
                    }
                    placeholder="Strike-through price"
                    className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Sessions">
                  <input
                    type="number"
                    min="1"
                    value={form.sessions}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sessions: e.target.value }))
                    }
                    placeholder="e.g. 10"
                    className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                  />
                </FormField>
                <FormField label="Validity (days)">
                  <input
                    type="number"
                    min="1"
                    value={form.validity_days}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, validity_days: e.target.value }))
                    }
                    placeholder="e.g. 30"
                    className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Subcategory / Tag">
                  <input
                    type="text"
                    value={form.subcategory}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, subcategory: e.target.value }))
                    }
                    placeholder="e.g. Couple, Apparel"
                    className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                  />
                </FormField>
                <FormField label="Stock Qty">
                  <input
                    type="number"
                    min="0"
                    value={form.stock_quantity}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, stock_quantity: e.target.value }))
                    }
                    placeholder="Blank = unlimited"
                    className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                  />
                </FormField>
              </div>

              <FormField label="Sort Order">
                <input
                  type="number"
                  min="0"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sort_order: e.target.value }))
                  }
                  placeholder="Lower = shown first"
                  className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                />
              </FormField>

              {/* Dashboard access toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-brand-sand/60 bg-brand-cream/30">
                <div>
                  <p className="text-sm font-medium text-brand-navy">
                    Grants Member Dashboard Access
                  </p>
                  <p className="text-xs text-brand-navy/40 mt-0.5">
                    When purchased and payment is completed, the customer receives Member Dashboard access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      grants_member_dashboard_access:
                        !f.grants_member_dashboard_access,
                    }))
                  }
                  className={`ml-4 flex-shrink-0 w-12 h-6 rounded-full transition-colors relative ${
                    form.grants_member_dashboard_access
                      ? "bg-brand-success"
                      : "bg-brand-sand"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      form.grants_member_dashboard_access ? "translate-x-6" : ""
                    }`}
                  />
                </button>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 py-3 rounded-xl border border-brand-sand text-brand-navy/60 font-medium hover:bg-brand-beige transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 py-3 rounded-xl bg-brand-brown text-white font-medium hover:bg-brand-brown-dark transition-colors disabled:opacity-50"
                >
                  {formLoading
                    ? "Saving…"
                    : editingItem
                    ? "Save Changes"
                    : "Add Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Delete Confirm Modal ──────────────────────────────── */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-brand-navy/30 backdrop-blur-sm"
            onClick={() => setDeletingItem(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-brand-error/10 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-brand-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-brand-navy mb-1">Delete Item?</h3>
            <p className="text-sm text-brand-navy/50 mb-5">
              &ldquo;{deletingItem.name}&rdquo; will be permanently removed. This
              cannot be undone. Existing invoices that reference this item will not
              be affected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingItem(null)}
                className="flex-1 py-2.5 rounded-xl border border-brand-sand text-brand-navy/60 font-medium hover:bg-brand-beige transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 py-2.5 rounded-xl bg-brand-error text-white font-medium hover:bg-brand-error/90 transition-colors disabled:opacity-50"
              >
                {deleteLoading ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
