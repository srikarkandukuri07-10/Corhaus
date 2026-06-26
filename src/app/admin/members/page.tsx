"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

interface ApprovedMember {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  membership_status: string;
  created_at: string;
}

export default function MembersPage() {
  const [members, setMembers] = useState<ApprovedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formStatus, setFormStatus] = useState("active");
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ApprovedMember | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  const fetchMembers = useCallback(async () => {
    const { data, error } = await supabase
      .from("approved_members")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      startTransition(() => {
        setMembers(data);
        setLoading(false);
      });
    }
  }, [supabase]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  function resetForm() {
    setFormName("");
    setFormEmail("");
    setFormPhone("");
    setFormStatus("active");
    setFormError(null);
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);

    if (!formName.trim()) {
      setFormError("Full name is required.");
      setFormLoading(false);
      return;
    }
    if (!formEmail.trim()) {
      setFormError("Email is required.");
      setFormLoading(false);
      return;
    }
    const phoneDigits = formPhone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      setFormError("Phone number must be exactly 10 digits.");
      setFormLoading(false);
      return;
    }

    const { data: existingEmail } = await supabase
      .from("approved_members")
      .select("id")
      .eq("email", formEmail.trim())
      .maybeSingle();

    if (existingEmail) {
      setFormError("A member with this email already exists.");
      setFormLoading(false);
      return;
    }

    const { data: existingPhone } = await supabase
      .from("approved_members")
      .select("id")
      .eq("phone_number", phoneDigits)
      .maybeSingle();

    if (existingPhone) {
      setFormError("A member with this phone number already exists.");
      setFormLoading(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("approved_members")
      .insert({
        full_name: formName.trim(),
        email: formEmail.trim(),
        phone_number: phoneDigits,
        membership_status: formStatus,
      });

    if (insertError) {
      setFormError(insertError.message);
      setFormLoading(false);
      return;
    }

    resetForm();
    setShowForm(false);
    fetchMembers();
    setFormLoading(false);
  }

  async function handleToggleStatus(member: ApprovedMember) {
    const newStatus = member.membership_status === "active" ? "inactive" : "active";

    if (newStatus === "inactive") {
      const confirmed = window.confirm(
        `Deactivate ${member.full_name}? They will lose access to the member portal until reactivated.`
      );
      if (!confirmed) return;
    }

    setTogglingId(member.id);
    setMembers((prev) =>
      prev.map((m) =>
        m.id === member.id ? { ...m, membership_status: newStatus } : m
      )
    );

    const { error } = await supabase
      .from("approved_members")
      .update({ membership_status: newStatus })
      .eq("id", member.id);

    if (error) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, membership_status: member.membership_status } : m
        )
      );
    }

    setTogglingId(null);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-light text-brand-navy">
            View <span className="font-medium">Members</span>
          </h1>
          <p className="text-sm text-brand-navy/50 mt-1">
            Manage approved Corhaus members
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="px-5 py-2.5 rounded-xl bg-brand-brown text-white text-sm font-medium hover:bg-brand-brown-dark transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Member"}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-brand-sand/50 p-6">
          <h3 className="text-lg font-medium text-brand-navy mb-4">Add New Member</h3>
          <form onSubmit={handleAddMember} className="space-y-4 max-w-lg">
            {formError && (
              <p className="text-sm text-brand-error bg-brand-error/10 px-3 py-2 rounded-lg">{formError}</p>
            )}
            <div>
              <label className="block text-sm font-medium text-brand-navy/70 mb-1">Full Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy text-sm"
                placeholder="Member name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-navy/70 mb-1">Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy text-sm"
                placeholder="member@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-navy/70 mb-1">Phone Number</label>
              <input
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                required
                maxLength={10}
                className="w-full px-4 py-2.5 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy text-sm"
                placeholder="9876543210"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-navy/70 mb-1">Membership Status</label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={formLoading}
              className="px-6 py-2.5 rounded-xl bg-brand-navy text-white font-medium hover:bg-brand-navy/90 transition-colors disabled:opacity-50 text-sm"
            >
              {formLoading ? "Adding..." : "Add Member"}
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-brand-sand/50 overflow-hidden">
        {loading || isPending ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
          </div>
        ) : members.length === 0 && !showForm ? (
          <div className="text-center py-12">
            <p className="text-brand-navy/40">No members added yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-cream/50 border-b border-brand-sand/50">
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">Full Name</th>
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">Email</th>
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">Phone Number</th>
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">Membership</th>
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">Date Added</th>
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">Action</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-brand-sand/30 last:border-0 hover:bg-brand-cream/30 transition-colors">
                    <td className="py-3 px-5 font-medium text-brand-navy">{m.full_name}</td>
                    <td className="py-3 px-5 text-brand-navy/60">{m.email}</td>
                    <td className="py-3 px-5 text-brand-navy/60">{m.phone_number}</td>
                    <td className="py-3 px-5">
                      {togglingId === m.id ? (
                        <div className="w-5 h-5 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
                      ) : (
                        <button
                          onClick={() => handleToggleStatus(m)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            m.membership_status === "active"
                              ? "bg-brand-success"
                              : "bg-brand-navy/20"
                          }`}
                          title={
                            m.membership_status === "active"
                              ? "Active — click to deactivate"
                              : "Inactive — click to activate"
                          }
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              m.membership_status === "active"
                                ? "translate-x-6"
                                : "translate-x-1"
                            }`}
                          />
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-5 text-brand-navy/50 text-xs">{formatDate(m.created_at)}</td>
                    <td className="py-3 px-5">
                      <button
                        onClick={() => setSelectedMember(m)}
                        className="text-xs font-medium text-brand-brown hover:text-brand-brown-dark underline underline-offset-2"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedMember(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium text-brand-navy mb-2">Membership Details</h3>
            <p className="text-sm text-brand-navy/50 mb-6">{selectedMember.full_name}</p>

            <div className="space-y-4 text-sm">
              <div>
                <span className="text-brand-navy/50 block text-xs uppercase tracking-wide">Email</span>
                <span className="text-brand-navy">{selectedMember.email}</span>
              </div>
              <div>
                <span className="text-brand-navy/50 block text-xs uppercase tracking-wide">Phone</span>
                <span className="text-brand-navy">{selectedMember.phone_number}</span>
              </div>
              <div>
                <span className="text-brand-navy/50 block text-xs uppercase tracking-wide">Status</span>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  selectedMember.membership_status === "active"
                    ? "text-brand-success bg-brand-success/10"
                    : "text-brand-error bg-brand-error/10"
                }`}>
                  {selectedMember.membership_status}
                </span>
              </div>
              <div>
                <span className="text-brand-navy/50 block text-xs uppercase tracking-wide">Membership Start</span>
                <span className="text-brand-navy">{formatDate(selectedMember.created_at)}</span>
              </div>
              <div>
                <span className="text-brand-navy/50 block text-xs uppercase tracking-wide">Membership End (1 month)</span>
                <span className="text-brand-navy">
                  {(() => {
                    const d = new Date(selectedMember.created_at);
                    d.setMonth(d.getMonth() + 1);
                    return formatDate(d.toISOString());
                  })()}
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedMember(null)}
              className="mt-6 w-full py-2.5 rounded-xl bg-brand-navy text-white text-sm font-medium hover:bg-brand-navy/90 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
