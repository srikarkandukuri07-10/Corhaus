"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface LocationRow {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  status: "active" | "inactive";
}

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-line bg-surface-2/50 text-fg text-sm placeholder:text-fg-5 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40";

export default function LocationsSettingsPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", address: "", city: "", state: "", phone: "", status: "active" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const permRes = await fetch("/api/admin/my-permissions");
      const permData = await permRes.json().catch(() => null);
      // Owner-only page (the API enforces this too).
      if (!permRes.ok || (permData?.role !== "Owner" && !permData?.permissions?.includes("*"))) {
        setDenied(true);
        setLoading(false);
        return;
      }
      const res = await fetch("/api/admin/locations", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 403) setDenied(true);
        else setLocations([]);
      } else {
        setLocations(Array.isArray(json.locations) ? json.locations : []);
      }
    } catch {
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", slug: "", address: "", city: "", state: "", phone: "", status: "active" });
    setFormError("");
    setShowForm(true);
  }

  function openEdit(loc: LocationRow) {
    setEditing(loc);
    setForm({
      name: loc.name,
      slug: loc.slug,
      address: loc.address || "",
      city: loc.city || "",
      state: loc.state || "",
      phone: loc.phone || "",
      status: loc.status,
    });
    setFormError("");
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const url = editing ? `/api/admin/locations/${editing.id}` : "/api/admin/locations";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          phone: form.phone.trim(),
          status: form.status,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Save failed.");
      setShowForm(false);
      await fetchLocations();
    } catch (err: any) {
      setFormError(err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (denied) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-lg font-bold text-fg">Access denied</p>
        <p className="text-sm text-fg-4 mt-1">Location management is Owner-only.</p>
        <button
          onClick={() => router.push("/admin")}
          className="mt-4 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg">Locations</h1>
          <p className="text-sm text-fg-4 mt-0.5">Branches are fully isolated — data never mixes between them.</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors w-fit"
        >
          + Add Location
        </button>
      </div>

      {loading ? (
        <div className="bg-surface border border-line rounded-2xl py-16 text-center text-sm text-fg-4">Loading locations...</div>
      ) : locations.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl py-16 text-center">
          <p className="text-sm font-semibold text-fg-3">No locations yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {locations.map((l) => (
            <div key={l.id} className="bg-surface border border-line rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-fg truncate">{l.name}</p>
                  <p className="text-xs text-fg-4 font-mono truncate">/{l.slug}</p>
                </div>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                    l.status === "active"
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25"
                      : "bg-surface-2 text-fg-4 border-line"
                  }`}
                >
                  {l.status}
                </span>
              </div>
              {(l.address || l.city || l.phone) && (
                <p className="text-xs text-fg-4 mt-2 break-words">
                  {[l.address, l.city, l.state].filter(Boolean).join(", ")}
                  {l.phone ? ` · ${l.phone}` : ""}
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => openEdit(l)}
                  className="px-3 py-1.5 rounded-xl border border-line bg-surface-2 text-fg text-xs font-bold hover:bg-hover"
                >
                  Edit
                </button>
                {l.status === "active" ? (
                  <button
                    onClick={async () => {
                      if (!confirm(`Deactivate ${l.name}? Its data stays intact but becomes inaccessible.`)) return;
                      const res = await fetch(`/api/admin/locations/${l.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "inactive" }),
                      });
                      const json = await res.json().catch(() => null);
                      if (!res.ok) alert(json?.error || "Failed.");
                      else fetchLocations();
                    }}
                    className="px-3 py-1.5 rounded-xl border border-amber-500/30 text-amber-600 text-xs font-bold hover:bg-amber-500/10"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      const res = await fetch(`/api/admin/locations/${l.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "active" }),
                      });
                      if (res.ok) fetchLocations();
                    }}
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/30 text-emerald-600 text-xs font-bold hover:bg-emerald-500/10"
                  >
                    Activate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex overflow-y-auto p-4 bg-black/60">
          <div className="m-auto bg-surface border border-line rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-fg">{editing ? "Edit Location" : "Add Location"}</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-surface-2 text-fg-3 font-bold">×</button>
            </div>
            {formError && <div className="bg-red-500/10 border border-red-500/25 text-red-500 text-xs rounded-xl px-3 py-2">{formError}</div>}
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-fg-3 mb-1">Name *</label>
                <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Corhaus — Banjara Hills" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-fg-3 mb-1">Slug (URL id, auto if empty)</label>
                <input className={inputCls} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="banjara-hills" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-fg-3 mb-1">City</label>
                  <input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-fg-3 mb-1">State</label>
                  <input className={inputCls} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-fg-3 mb-1">Address</label>
                <input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-fg-3 mb-1">Phone</label>
                <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-line bg-surface text-fg text-sm font-semibold">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? "Saving..." : editing ? "Save" : "Add Location"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
