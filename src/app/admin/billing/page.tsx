"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApprovedMember {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  membership_status: string;
}

interface BillingPlanItem {
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

interface CartItem {
  cartId: string; // unique per cart entry
  id: string; // billing_plan_item id
  name: string;
  category: string;
  unit_price: number;
  quantity: number;
  grants_member_dashboard_access: boolean;
  validity_days: number | null;
  sessions: number | null;
  stock_quantity: number | null;
}

type PaymentStatus = "paid" | "due";
type PaymentMethod = "Cash" | "UPI" | "Card" | "Bank Transfer";
type DiscountType = "percentage" | "flat";

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "Membership Plans", label: "Membership Plans", icon: "📋" },
  { id: "PT Packages", label: "PT Packages", icon: "💪" },
  { id: "Class Packages", label: "Classes", icon: "🗓" },
  { id: "Services", label: "Services", icon: "✦" },
  { id: "Combo Packages", label: "Combos", icon: "📦" },
  { id: "Products", label: "Products", icon: "🛍" },
  { id: "Other Charges", label: "Other Charges", icon: "₹" },
];

// ─── Billing Sub-Nav ─────────────────────────────────────────────────────────

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
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
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

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CreateBillPage() {
  const supabase = createClient();

  // ── Customer state ──────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ApprovedMember[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ApprovedMember | null>(null);
  const [isWalkin, setIsWalkin] = useState(false);
  const [walkinName, setWalkinName] = useState("");
  const [walkinEmail, setWalkinEmail] = useState("");
  const [walkinPhone, setWalkinPhone] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);

  // ── Catalogue state ─────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState("Membership Plans");
  const [allItems, setAllItems] = useState<BillingPlanItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemSearch, setItemSearch] = useState("");
  const [activeSubcat, setActiveSubcat] = useState("All");

  // ── Cart state ──────────────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // ── Discount state ──────────────────────────────────────
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState("");

  // ── Payment state ───────────────────────────────────────
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [notes, setNotes] = useState("");

  // ── Completion state ────────────────────────────────────
  const [completing, setCompleting] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Load all plan items ─────────────────────────────────
  useEffect(() => {
    async function fetchItems() {
      setItemsLoading(true);
      const { data } = await supabase
        .from("billing_plan_items")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setAllItems((data as BillingPlanItem[]) || []);
      setItemsLoading(false);
    }
    fetchItems();
  }, [supabase]);

  // ── Customer search with debounce ───────────────────────
  useEffect(() => {
    if (!customerSearch.trim() || customerSearch.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      const q = customerSearch.trim();
      const { data } = await supabase
        .from("approved_members")
        .select("id, full_name, email, phone_number, membership_status")
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone_number.ilike.%${q}%`)
        .limit(8);
      setSearchResults((data as ApprovedMember[]) || []);
      setShowDropdown(true);
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, supabase]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Derived: filtered items for current category ────────
  const categoryItems = useMemo(
    () => allItems.filter((i) => i.category === activeCategory),
    [allItems, activeCategory]
  );

  const subcategories = useMemo(() => {
    const cats = Array.from(
      new Set(categoryItems.map((i) => i.subcategory).filter(Boolean))
    ) as string[];
    return cats.length > 0 ? ["All", ...cats] : [];
  }, [categoryItems]);

  const filteredItems = useMemo(() => {
    let items = categoryItems;
    if (activeSubcat !== "All" && subcategories.length > 0) {
      items = items.filter((i) => i.subcategory === activeSubcat);
    }
    if (itemSearch.trim()) {
      const q = itemSearch.toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.description || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [categoryItems, activeSubcat, itemSearch, subcategories]);

  // ── Computed totals ─────────────────────────────────────
  const subtotal = useMemo(
    () => cartItems.reduce((s, i) => s + i.unit_price * i.quantity, 0),
    [cartItems]
  );

  const discountAmount = useMemo(() => {
    const val = parseFloat(discountValue);
    if (!showDiscount || !discountValue || isNaN(val) || val <= 0) return 0;
    if (discountType === "percentage") {
      return Math.round((subtotal * Math.min(val, 100)) / 100 * 100) / 100;
    }
    return Math.min(val, subtotal);
  }, [subtotal, discountType, discountValue, showDiscount]);

  const grandTotal = subtotal - discountAmount;

  // ── Category change — reset sub-filters ────────────────
  function handleCategoryChange(cat: string) {
    setActiveCategory(cat);
    setActiveSubcat("All");
    setItemSearch("");
  }

  // ── Customer selection ──────────────────────────────────
  function handleSelectMember(member: ApprovedMember) {
    setSelectedMember(member);
    setIsWalkin(false);
    setCustomerSearch("");
    setShowDropdown(false);
    setWalkinName("");
    setWalkinEmail("");
    setWalkinPhone("");
  }

  function handleWalkin() {
    setIsWalkin(true);
    setSelectedMember(null);
    setCustomerSearch("");
    setShowDropdown(false);
  }

  function clearCustomer() {
    setSelectedMember(null);
    setIsWalkin(false);
    setWalkinName("");
    setWalkinEmail("");
    setWalkinPhone("");
    setCustomerSearch("");
  }

  // ── Cart operations ─────────────────────────────────────
  function addToCart(item: BillingPlanItem) {
    setCartItems((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          cartId: `${item.id}-${Date.now()}`,
          id: item.id,
          name: item.name,
          category: item.category,
          unit_price: item.price,
          quantity: 1,
          grants_member_dashboard_access: item.grants_member_dashboard_access,
          validity_days: item.validity_days,
          sessions: item.sessions,
          stock_quantity: item.stock_quantity,
        },
      ];
    });
  }

  function updateQty(cartId: string, delta: number) {
    setCartItems((prev) =>
      prev
        .map((c) =>
          c.cartId === cartId ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c
        )
    );
  }

  function removeFromCart(cartId: string) {
    setCartItems((prev) => prev.filter((c) => c.cartId !== cartId));
  }

  // ── Reset all state ─────────────────────────────────────
  const resetBill = useCallback(() => {
    setSelectedMember(null);
    setIsWalkin(false);
    setWalkinName("");
    setWalkinEmail("");
    setWalkinPhone("");
    setCustomerSearch("");
    setCartItems([]);
    setDiscountValue("");
    setShowDiscount(false);
    setDiscountType("percentage");
    setPaymentStatus("paid");
    setPaymentMethod("Cash");
    setAmountPaid("");
    setTransactionRef("");
    setNotes("");
    setError(null);
    setCompletedInvoice(null);
  }, []);

  // ── Complete Bill ────────────────────────────────────────
  async function handleCompleteBill() {
    setError(null);

    // Validate customer
    if (!selectedMember && !isWalkin) {
      setError("Please select a customer or choose Walk-in / Non-member.");
      return;
    }
    if (isWalkin && !walkinName.trim()) {
      setError("Please enter the walk-in customer's name.");
      return;
    }
    if (cartItems.length === 0) {
      setError("Please add at least one item to the bill.");
      return;
    }
    if (paymentStatus === "paid" && !amountPaid) {
      setError("Please enter the amount paid.");
      return;
    }

    setCompleting(true);

    try {
      // 1. Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // 2. Find or create customer record
      let customerId: string;
      let approvedMemberId: string | null = selectedMember?.id || null;

      if (selectedMember) {
        const { data: existingCust } = await supabase
          .from("customers")
          .select("id")
          .eq("approved_member_id", selectedMember.id)
          .maybeSingle();

        if (existingCust) {
          customerId = existingCust.id;
        } else {
          const { data: newCust, error: custErr } = await supabase
            .from("customers")
            .insert({
              full_name: selectedMember.full_name,
              email: selectedMember.email,
              phone_number: selectedMember.phone_number,
              is_walkin: false,
              approved_member_id: selectedMember.id,
            })
            .select("id")
            .single();
          if (custErr) throw new Error("Failed to create customer: " + custErr.message);
          customerId = newCust!.id;
        }
      } else {
        // Walk-in customer
        const { data: newCust, error: custErr } = await supabase
          .from("customers")
          .insert({
            full_name: walkinName.trim(),
            email: walkinEmail.trim() || null,
            phone_number: walkinPhone.trim() || null,
            is_walkin: true,
            approved_member_id: null,
          })
          .select("id")
          .single();
        if (custErr) throw new Error("Failed to create customer: " + custErr.message);
        customerId = newCust!.id;
      }

      // 3. Generate invoice number
      const { data: invNum, error: seqErr } = await supabase.rpc(
        "generate_invoice_number"
      );
      if (seqErr) throw new Error("Failed to generate invoice number: " + seqErr.message);

      // 4. Create invoice
      const paid = paymentStatus === "paid" ? grandTotal : 0;
      const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invNum,
          customer_id: customerId,
          customer_name: selectedMember?.full_name || walkinName.trim(),
          customer_email: selectedMember?.email || walkinEmail.trim() || null,
          customer_phone:
            selectedMember?.phone_number || walkinPhone.trim() || null,
          subtotal,
          discount_type:
            showDiscount && discountValue ? discountType : null,
          discount_value:
            showDiscount && discountValue ? parseFloat(discountValue) : 0,
          discount_amount: discountAmount,
          grand_total: grandTotal,
          payment_status: paymentStatus,
          payment_method: paymentStatus === "paid" ? paymentMethod : null,
          amount_paid: paid,
          transaction_reference: transactionRef.trim() || null,
          notes: notes.trim() || null,
          created_by: user?.id || null,
        })
        .select("id")
        .single();
      if (invErr) throw new Error("Failed to create invoice: " + invErr.message);

      const invoiceId = invoice!.id;

      // 5. Create invoice items (bulk)
      const itemsPayload = cartItems.map((item) => ({
        invoice_id: invoiceId,
        billing_plan_item_id: item.id,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.unit_price * item.quantity,
        grants_member_dashboard_access: item.grants_member_dashboard_access,
        validity_days: item.validity_days || null,
        sessions: item.sessions || null,
      }));
      const { error: itemsErr } = await supabase
        .from("invoice_items")
        .insert(itemsPayload);
      if (itemsErr)
        throw new Error("Failed to save invoice items: " + itemsErr.message);

      // 6. Decrement product stock
      for (const item of cartItems) {
        if (item.stock_quantity !== null && item.stock_quantity !== undefined) {
          await supabase
            .from("billing_plan_items")
            .update({
              stock_quantity: Math.max(0, item.stock_quantity - item.quantity),
            })
            .eq("id", item.id);
        }
      }

      // 7. Grant dashboard access — only on full payment
      if (paymentStatus === "paid") {
        const eligibleItems = cartItems.filter(
          (i) => i.grants_member_dashboard_access
        );

        if (eligibleItems.length > 0) {
          let targetMemberId = approvedMemberId;

          // Walk-in who bought a dashboard-eligible plan → upgrade to member
          if (!targetMemberId) {
            const email = walkinEmail.trim().toLowerCase();
            if (email) {
              // Check if already an approved_member
              const { data: existingAm } = await supabase
                .from("approved_members")
                .select("id")
                .eq("email", email)
                .maybeSingle();

              if (existingAm) {
                targetMemberId = existingAm.id;
                // Link customer → member
                await supabase
                  .from("customers")
                  .update({ approved_member_id: existingAm.id, is_walkin: false })
                  .eq("id", customerId);
              } else {
                // Create new approved_member
                const { data: newAm, error: amErr } = await supabase
                  .from("approved_members")
                  .insert({
                    full_name: walkinName.trim(),
                    email,
                    phone_number: walkinPhone.trim() || "",
                    membership_status: "active",
                    membership_level: "Beginner",
                  })
                  .select("id")
                  .single();
                if (!amErr && newAm) {
                  targetMemberId = newAm.id;
                  await supabase
                    .from("customers")
                    .update({
                      approved_member_id: newAm.id,
                      is_walkin: false,
                    })
                    .eq("id", customerId);
                }
              }
            }
          }

          if (targetMemberId) {
            // Fetch the invoice_items we just inserted
            const { data: savedItems } = await supabase
              .from("invoice_items")
              .select("id, name, category, validity_days, sessions, billing_plan_item_id")
              .eq("invoice_id", invoiceId)
              .eq("grants_member_dashboard_access", true);

            if (savedItems && savedItems.length > 0) {
              const today = new Date().toISOString().split("T")[0];
              const plansPayload = savedItems.map((si) => {
                const cartItem = cartItems.find((c) => c.id === si.billing_plan_item_id);
                const totalSessions =
                  si.sessions && cartItem ? si.sessions * cartItem.quantity : null;
                const validUntil =
                  si.validity_days
                    ? new Date(
                        Date.now() + si.validity_days * 24 * 60 * 60 * 1000
                      )
                        .toISOString()
                        .split("T")[0]
                    : null;
                return {
                  approved_member_id: targetMemberId,
                  invoice_id: invoiceId,
                  invoice_item_id: si.id,
                  plan_name: si.name,
                  category: si.category,
                  sessions_total: totalSessions,
                  sessions_remaining: totalSessions,
                  valid_from: today,
                  valid_until: validUntil,
                  status: "active",
                };
              });

              await supabase.from("member_purchased_plans").insert(plansPayload);

              // Activate dashboard access
              await supabase
                .from("approved_members")
                .update({ membership_status: "active" })
                .eq("id", targetMemberId);
            }
          }
        }
      }

      // Update local stock state
      setAllItems((prev) =>
        prev.map((item) => {
          const cartItem = cartItems.find((c) => c.id === item.id);
          if (cartItem && item.stock_quantity !== null) {
            return {
              ...item,
              stock_quantity: Math.max(0, item.stock_quantity - cartItem.quantity),
            };
          }
          return item;
        })
      );

      setCompletedInvoice(invNum);
    } catch (err: unknown) {
      setError(
        (err as Error).message || "Failed to complete bill. Please try again."
      );
    } finally {
      setCompleting(false);
    }
  }

  const customerName =
    selectedMember?.full_name || (isWalkin ? walkinName : null);
  const hasCustomer = !!selectedMember || (isWalkin && walkinName.trim());
  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <div className="mb-1">
        <h1 className="text-2xl font-light text-brand-navy">
          Billing <span className="font-medium">Point of Sale</span>
        </h1>
        <p className="text-sm text-brand-navy/50 mt-0.5">
          Create bills for members, new registrations, and walk-ins
        </p>
      </div>

      <BillingSubNav />

      {/* Success banner */}
      {completedInvoice && (
        <div className="mb-4 p-4 rounded-2xl bg-brand-success/10 border border-brand-success/20 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-success/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-brand-success"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium text-brand-success text-sm">
                Bill completed successfully!
              </p>
              <p className="text-xs text-brand-success/70">
                Invoice{" "}
                <span className="font-semibold font-mono">{completedInvoice}</span>{" "}
                has been generated.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/billing/invoices"
              className="text-xs text-brand-success underline hover:no-underline"
            >
              View Invoice
            </Link>
            <button
              onClick={resetBill}
              className="px-4 py-2 rounded-xl bg-brand-success text-white text-sm font-medium hover:bg-brand-success/80 transition-colors"
            >
              New Bill
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-brand-error/10 border border-brand-error/20 text-brand-error text-sm flex items-center gap-2">
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {error}
        </div>
      )}

      {/* 3-panel layout */}
      <div className="flex gap-3 overflow-hidden" style={{ height: "calc(100vh - 13rem)" }}>
        {/* ─── LEFT PANEL ─────────────────────────────────── */}
        <div className="w-[260px] flex-shrink-0 bg-white rounded-2xl border border-brand-sand/50 flex flex-col overflow-hidden">
          {/* Customer section */}
          <div className="p-4 border-b border-brand-sand/50 flex-shrink-0">
            <p className="text-xs font-semibold text-brand-navy/40 uppercase tracking-wider mb-3">
              Select Customer
            </p>

            {!selectedMember && !isWalkin && (
              <div ref={searchRef} className="relative">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-navy/30"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                    placeholder="Search by name, email, phone…"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown transition-all"
                  />
                  {searchLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
                  )}
                </div>

                {/* Autocomplete dropdown */}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-xl border border-brand-sand/50 shadow-lg shadow-brand-navy/10 overflow-hidden max-h-52 overflow-y-auto">
                    {searchResults.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => handleSelectMember(m)}
                        className="w-full text-left px-3 py-2.5 hover:bg-brand-cream/70 transition-colors border-b border-brand-sand/30 last:border-0"
                      >
                        <p className="text-sm font-medium text-brand-navy leading-tight">
                          {m.full_name}
                        </p>
                        <p className="text-xs text-brand-navy/40 mt-0.5">
                          {m.email} • {m.phone_number}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {showDropdown &&
                  !searchLoading &&
                  customerSearch.length >= 2 &&
                  searchResults.length === 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-xl border border-brand-sand/50 shadow-lg p-3 text-center text-xs text-brand-navy/40">
                      No members found
                    </div>
                  )}
              </div>
            )}

            {/* Selected member chip */}
            {selectedMember && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-brand-navy/5 border border-brand-navy/10">
                <div className="w-8 h-8 rounded-full bg-brand-navy text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {selectedMember.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-navy truncate">
                    {selectedMember.full_name}
                  </p>
                  <p className="text-xs text-brand-navy/40 truncate">
                    {selectedMember.phone_number}
                  </p>
                </div>
                <button
                  onClick={clearCustomer}
                  className="text-brand-navy/30 hover:text-brand-error transition-colors"
                  title="Clear"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Walk-in fields */}
            {isWalkin && (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-brand-navy/60">
                    Walk-in / Non-member
                  </span>
                  <button
                    onClick={clearCustomer}
                    className="text-xs text-brand-error hover:underline"
                  >
                    Cancel
                  </button>
                </div>
                <input
                  type="text"
                  value={walkinName}
                  onChange={(e) => setWalkinName(e.target.value)}
                  placeholder="Name *"
                  className="w-full px-3 py-2 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                />
                <input
                  type="email"
                  value={walkinEmail}
                  onChange={(e) => setWalkinEmail(e.target.value)}
                  placeholder="Email (optional)"
                  className="w-full px-3 py-2 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                />
                <input
                  type="tel"
                  value={walkinPhone}
                  onChange={(e) => setWalkinPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  className="w-full px-3 py-2 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                />
                <p className="text-[10px] text-brand-navy/30 leading-tight">
                  Add email if this person may purchase a plan — it enables dashboard access.
                </p>
              </div>
            )}

            {/* Walk-in button (shown when no customer selected) */}
            {!selectedMember && !isWalkin && (
              <button
                onClick={handleWalkin}
                className="mt-2 w-full py-2.5 rounded-xl border border-brand-sand/80 text-brand-navy/60 text-sm font-medium hover:bg-brand-beige hover:border-brand-sand transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Walk-in / Non-member
              </button>
            )}
          </div>

          {/* Categories */}
          <div className="flex-1 overflow-y-auto p-3">
            <p className="text-[10px] font-semibold text-brand-navy/30 uppercase tracking-wider px-2 mb-2">
              Categories
            </p>
            {CATEGORIES.map((cat) => {
              const count = allItems.filter((i) => i.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryChange(cat.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-0.5 ${
                    activeCategory === cat.id
                      ? "bg-brand-navy text-white"
                      : "text-brand-navy/60 hover:text-brand-navy hover:bg-brand-beige"
                  }`}
                >
                  <span className="text-base leading-none">{cat.icon}</span>
                  <span className="flex-1 text-left leading-tight">{cat.label}</span>
                  {count > 0 && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full ${
                        activeCategory === cat.id
                          ? "bg-white/20 text-white"
                          : "bg-brand-sand/60 text-brand-navy/50"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── MIDDLE PANEL ────────────────────────────────── */}
        <div className="flex-1 bg-white rounded-2xl border border-brand-sand/50 flex flex-col overflow-hidden min-w-0">
          {/* Header */}
          <div className="p-4 border-b border-brand-sand/50 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium text-brand-navy">
                {CATEGORIES.find((c) => c.id === activeCategory)?.label}
              </h2>
              <span className="text-xs text-brand-navy/40">
                {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-navy/30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
              <input
                type="text"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder={`Search ${CATEGORIES.find((c) => c.id === activeCategory)?.label.toLowerCase()}…`}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown transition-all"
              />
            </div>

            {/* Sub-category filter chips */}
            {subcategories.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                {subcategories.map((sc) => (
                  <button
                    key={sc}
                    onClick={() => setActiveSubcat(sc)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      activeSubcat === sc
                        ? "bg-brand-navy text-white"
                        : "bg-brand-sand/50 text-brand-navy/60 hover:bg-brand-sand"
                    }`}
                  >
                    {sc}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {itemsLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
                  <p className="text-xs text-brand-navy/40">Loading items…</p>
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-full bg-brand-sand/50 flex items-center justify-center mb-3">
                  <span className="text-2xl">
                    {CATEGORIES.find((c) => c.id === activeCategory)?.icon}
                  </span>
                </div>
                <p className="text-sm text-brand-navy/50">
                  {itemSearch
                    ? "No items match your search"
                    : "No items in this category yet"}
                </p>
                <Link
                  href="/admin/billing/plan-items"
                  className="text-xs text-brand-brown hover:underline mt-1"
                >
                  + Add items in Plan Catalogue
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredItems.map((item) => (
                  <PlanItemCard
                    key={item.id}
                    item={item}
                    onAdd={() => addToCart(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── RIGHT PANEL ─────────────────────────────────── */}
        <div className="w-[340px] flex-shrink-0 bg-white rounded-2xl border border-brand-sand/50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-brand-sand/50 flex-shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-navy/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="font-medium text-brand-navy text-sm">Current Bill</span>
            </div>
            {cartCount > 0 && (
              <span className="bg-brand-brown text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {cartCount}
              </span>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <div className="w-14 h-14 rounded-2xl bg-brand-sand/30 flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-brand-navy/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.4 7h12.8M7 13l-.4-2M17 21a2 2 0 100-4 2 2 0 000 4zm-10 0a2 2 0 100-4 2 2 0 000 4z" />
                  </svg>
                </div>
                <p className="text-sm text-brand-navy/40 font-medium">No items added</p>
                <p className="text-xs text-brand-navy/30 mt-0.5">
                  Select items to add to bill
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {cartItems.map((item) => (
                  <div
                    key={item.cartId}
                    className="flex items-start gap-2 p-2.5 rounded-xl bg-brand-cream/60 border border-brand-sand/40"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-brand-navy leading-tight">
                        {item.name}
                      </p>
                      <p className="text-xs text-brand-navy/40 mt-0.5">
                        {fmt(item.unit_price)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => updateQty(item.cartId, -1)}
                        className="w-6 h-6 rounded-lg bg-brand-sand/60 text-brand-navy text-sm flex items-center justify-center hover:bg-brand-sand transition-colors"
                      >
                        −
                      </button>
                      <span className="text-sm font-semibold text-brand-navy w-5 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(item.cartId, 1)}
                        className="w-6 h-6 rounded-lg bg-brand-sand/60 text-brand-navy text-sm flex items-center justify-center hover:bg-brand-sand transition-colors"
                      >
                        +
                      </button>
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                      <span className="text-xs font-bold text-brand-navy">
                        {fmt(item.unit_price * item.quantity)}
                      </span>
                      <button
                        onClick={() => removeFromCart(item.cartId)}
                        className="text-brand-error/50 hover:text-brand-error transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discount + Totals + Payment — fixed bottom */}
          <div className="border-t border-brand-sand/50 p-3 flex-shrink-0 space-y-3">
            {/* Discount */}
            <div className="rounded-xl border border-brand-sand/50 overflow-hidden">
              <button
                onClick={() => setShowDiscount(!showDiscount)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-brand-navy/60 hover:bg-brand-cream/50 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M17 17h.01M7 7l10 10M7 7a4 4 0 115.657 5.657M17 17a4 4 0 11-5.657-5.657" />
                  </svg>
                  Apply Discount
                </span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${showDiscount ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showDiscount && (
                <div className="px-3 pb-3 pt-2 border-t border-brand-sand/40 space-y-2 bg-brand-cream/30">
                  <div className="flex rounded-lg border border-brand-sand/50 overflow-hidden text-xs">
                    <button
                      onClick={() => setDiscountType("percentage")}
                      className={`flex-1 py-1.5 font-medium transition-colors ${discountType === "percentage" ? "bg-brand-navy text-white" : "bg-white text-brand-navy/60 hover:bg-brand-beige"}`}
                    >
                      Percentage %
                    </button>
                    <button
                      onClick={() => setDiscountType("flat")}
                      className={`flex-1 py-1.5 font-medium transition-colors ${discountType === "flat" ? "bg-brand-navy text-white" : "bg-white text-brand-navy/60 hover:bg-brand-beige"}`}
                    >
                      Flat ₹
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-brand-navy/40 font-medium">
                      {discountType === "percentage" ? "%" : "₹"}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountType === "percentage" ? "e.g. 10" : "e.g. 500"}
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-brand-sand bg-white text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="space-y-1.5 px-1">
              <div className="flex items-center justify-between text-xs text-brand-navy/50">
                <span>Subtotal</span>
                <span>{fmt(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-brand-success">
                  <span>
                    Discount ({discountType === "percentage" ? `${discountValue}%` : fmt(parseFloat(discountValue))})
                  </span>
                  <span>− {fmt(discountAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5 border-t border-brand-sand/50">
                <span className="font-semibold text-brand-navy text-sm">Grand Total</span>
                <span className="font-bold text-brand-brown text-base">
                  {fmt(grandTotal)}
                </span>
              </div>
            </div>

            {/* Payment */}
            <div className="space-y-2">
              {/* Manual / Payment Due toggle */}
              <div className="flex rounded-xl border border-brand-sand/50 overflow-hidden text-xs">
                <button
                  onClick={() => setPaymentStatus("paid")}
                  className={`flex-1 py-2 font-medium transition-colors ${paymentStatus === "paid" ? "bg-brand-navy text-white" : "bg-white text-brand-navy/60 hover:bg-brand-beige"}`}
                >
                  Manual
                </button>
                <button
                  onClick={() => setPaymentStatus("due")}
                  className={`flex-1 py-2 font-medium transition-colors ${paymentStatus === "due" ? "bg-brand-navy text-white" : "bg-white text-brand-navy/60 hover:bg-brand-beige"}`}
                >
                  Payment Due
                </button>
              </div>

              {paymentStatus === "paid" && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-brand-navy/40 font-medium">₹</span>
                      <input
                        type="number"
                        min="0"
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value)}
                        placeholder="0"
                        className="w-full pl-7 pr-2 py-2 rounded-xl border border-brand-sand bg-brand-cream/50 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                      />
                    </div>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="flex-1 px-2 py-2 rounded-xl border border-brand-sand bg-brand-cream/50 text-xs text-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-brown"
                    >
                      <option>Cash</option>
                      <option>UPI</option>
                      <option>Card</option>
                      <option>Bank Transfer</option>
                    </select>
                  </div>

                  {/* Quick chips */}
                  <div className="flex gap-1.5">
                    {[500, 1000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setAmountPaid(amt.toString())}
                        className="flex-1 py-1.5 rounded-lg border border-brand-sand/60 text-xs text-brand-navy/60 hover:bg-brand-beige transition-colors"
                      >
                        ₹{amt.toLocaleString("en-IN")}
                      </button>
                    ))}
                    <button
                      onClick={() => setAmountPaid(grandTotal.toString())}
                      className="flex-1 py-1.5 rounded-lg bg-brand-navy text-white text-xs font-medium hover:bg-brand-navy/90 transition-colors"
                    >
                      Exact
                    </button>
                  </div>

                  {/* Transaction ref for non-cash */}
                  {paymentMethod !== "Cash" && (
                    <input
                      type="text"
                      value={transactionRef}
                      onChange={(e) => setTransactionRef(e.target.value)}
                      placeholder="Transaction ref / UTR (optional)"
                      className="w-full px-3 py-2 rounded-xl border border-brand-sand bg-brand-cream/50 text-xs text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
                    />
                  )}
                </div>
              )}

              {paymentStatus === "due" && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
                  ⚠ Dashboard access will NOT be granted until payment is completed.
                </div>
              )}

              {/* Notes */}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={1}
                className="w-full px-3 py-2 rounded-xl border border-brand-sand bg-brand-cream/50 text-xs text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown resize-none"
              />

              {/* Complete button */}
              <button
                onClick={handleCompleteBill}
                disabled={completing || !!completedInvoice}
                className="w-full py-3 rounded-xl bg-brand-brown text-white font-semibold text-sm hover:bg-brand-brown-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {completing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Complete Bill
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Plan Item Card ───────────────────────────────────────────────────────────

function PlanItemCard({
  item,
  onAdd,
}: {
  item: BillingPlanItem;
  onAdd: () => void;
}) {
  const perSession =
    item.sessions && item.sessions > 0
      ? Math.round(item.price / item.sessions)
      : null;

  return (
    <div className="bg-brand-cream/40 rounded-xl p-3.5 border border-brand-sand/50 flex flex-col gap-2 hover:border-brand-sand transition-colors">
      {item.subcategory && (
        <span className="self-start text-[10px] bg-brand-brown/10 text-brand-brown px-2 py-0.5 rounded-full font-medium">
          {item.subcategory}
        </span>
      )}
      <div>
        <h3 className="text-sm font-semibold text-brand-navy leading-tight">
          {item.name}
        </h3>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-base font-bold text-brand-brown">
            {fmt(item.price)}
          </span>
          {item.original_price && (
            <span className="text-xs text-brand-navy/30 line-through">
              {fmt(item.original_price)}
            </span>
          )}
        </div>
        {item.stock_quantity !== null && item.stock_quantity !== undefined && (
          <span
            className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
              item.stock_quantity > 0
                ? "bg-brand-success/10 text-brand-success"
                : "bg-brand-error/10 text-brand-error"
            }`}
          >
            {item.stock_quantity > 0
              ? `${item.stock_quantity} in stock`
              : "Out of stock"}
          </span>
        )}
        {perSession && (
          <p className="text-[10px] text-brand-navy/40 mt-0.5">
            {item.sessions} sessions • {fmt(perSession)}/session
          </p>
        )}
        {item.validity_days && (
          <p className="text-[10px] text-brand-navy/35">
            Valid for {item.validity_days} day{item.validity_days !== 1 ? "s" : ""}
          </p>
        )}
      </div>
      <button
        onClick={onAdd}
        disabled={
          item.stock_quantity !== null &&
          item.stock_quantity !== undefined &&
          item.stock_quantity <= 0
        }
        className="mt-auto w-full py-2 rounded-xl bg-brand-navy text-white text-xs font-semibold hover:bg-brand-navy/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
        Add to Bill
      </button>
    </div>
  );
}
