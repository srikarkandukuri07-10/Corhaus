"use client";

import { useEffect, useState, useCallback, useTransition, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

interface ApprovedMember {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  membership_status: string;
  created_at: string;
  avatar_url?: string | null;
  membership_level: string;
}

function MembersPageContent() {
  const [members, setMembers] = useState<ApprovedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formStatus, setFormStatus] = useState("active");
  const [formLevel, setFormLevel] = useState("Beginner");
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ApprovedMember | null>(null);
  const [updatingLevelId, setUpdatingLevelId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deactivatingMember, setDeactivatingMember] = useState<ApprovedMember | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingMember, setDeletingMember] = useState<ApprovedMember | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  const [prefilledReferralCode, setPrefilledReferralCode] = useState("");
  const [prefilledReferrerName, setPrefilledReferrerName] = useState("");
  const [prefilledReferrerEmail, setPrefilledReferrerEmail] = useState("");
  const [selectedReferral, setSelectedReferral] = useState<{
    code: string;
    successful_referrals: number;
    reward_eligible: boolean;
    reward_redeemed: boolean;
  } | null>(null);
  const [redeemingReward, setRedeemingReward] = useState(false);

  const searchParams = useSearchParams();

  const fetchMembers = useCallback(async () => {
    const { data: approvedData, error: approvedError } = await supabase
      .from("approved_members")
      .select("*")
      .order("created_at", { ascending: false });

    if (approvedError) {
      setActionError(approvedError.message);
      return;
    }

    const { data: profilesData } = await supabase
      .from("profiles")
      .select("email, avatar_url");

    if (approvedData) {
      const avatarMap = new Map(profilesData?.map(p => [p.email.toLowerCase(), p.avatar_url]) || []);
      const membersWithAvatars = approvedData.map(m => ({
        ...m,
        avatar_url: avatarMap.get(m.email.toLowerCase()) || null
      }));
      startTransition(() => {
        setMembers(membersWithAvatars);
        setLoading(false);
      });
    }
  }, [supabase]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    const prefillName = searchParams.get("prefill_name");
    const prefillEmail = searchParams.get("prefill_email");
    const prefillPhone = searchParams.get("prefill_phone");
    const refCode = searchParams.get("referral_code");
    const refName = searchParams.get("referrer_name");
    const refEmail = searchParams.get("referrer_email");

    if (prefillName || prefillEmail || prefillPhone) {
      setFormName(prefillName || "");
      setFormEmail(prefillEmail || "");
      setFormPhone(prefillPhone || "");
      setPrefilledReferralCode(refCode || "");
      setPrefilledReferrerName(refName || "");
      setPrefilledReferrerEmail(refEmail || "");
      setShowForm(true);
    }
  }, [searchParams]);

  function resetForm() {
    setFormName("");
    setFormEmail("");
    setFormPhone("");
    setFormStatus("active");
    setFormLevel("Beginner");
    setFormError(null);
    setPrefilledReferralCode("");
    setPrefilledReferrerName("");
    setPrefilledReferrerEmail("");
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
    const normalizedEmail = formEmail.trim().toLowerCase();
    if (normalizedEmail === "srikarkandukuri07@gmail.com") {
      setFormError("This email belongs to an administrator and cannot be added as a member.");
      setFormLoading(false);
      return;
    }

    const { data: existingAdmin } = await supabase
      .from("profiles")
      .select("role")
      .eq("email", normalizedEmail)
      .eq("role", "admin")
      .maybeSingle();

    if (existingAdmin) {
      setFormError("This email belongs to an administrator and cannot be added as a member.");
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
        membership_level: formLevel,
      });

    if (insertError) {
      setFormError(insertError.message);
      setFormLoading(false);
      return;
    }

    if (prefilledReferralCode && prefilledReferrerEmail) {
      try {
        const { data: rc, error: rcError } = await supabase
          .from("referral_codes")
          .select("id, successful_referrals")
          .eq("member_email", prefilledReferrerEmail.toLowerCase())
          .maybeSingle();

        if (!rcError && rc) {
          const newCount = rc.successful_referrals + 1;
          await supabase
            .from("referral_codes")
            .update({
              successful_referrals: newCount,
              reward_eligible: newCount >= 3,
            })
            .eq("id", rc.id);
        }
      } catch (err) {
        console.error("Failed to update referral code count:", err);
      }
    }

    resetForm();
    setShowForm(false);
    fetchMembers();
    setFormLoading(false);
  }

  function handleToggleClick(member: ApprovedMember) {
    if (member.membership_status === "active") {
      setDeactivatingMember(member);
    } else {
      handleToggleStatus(member, "active");
    }
  }

  async function handleToggleStatus(member: ApprovedMember, targetStatus: "active" | "inactive") {
    setActionError(null);
    setTogglingId(member.id);
    setMembers((prev) =>
      prev.map((m) =>
        m.id === member.id ? { ...m, membership_status: targetStatus } : m
      )
    );

    const { error } = await supabase
      .from("approved_members")
      .update({ membership_status: targetStatus })
      .eq("id", member.id);

    if (error) {
      setActionError(`Failed to update membership: ${error.message}`);
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, membership_status: member.membership_status } : m
        )
      );
    }

    setTogglingId(null);
  }

  async function handleUpdateLevel(member: ApprovedMember, newLevel: string) {
    setActionError(null);
    setUpdatingLevelId(member.id);

    const { error } = await supabase
      .from("approved_members")
      .update({ membership_level: newLevel })
      .eq("id", member.id);

    if (error) {
      setActionError(`Failed to update membership level: ${error.message}`);
    } else {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, membership_level: newLevel } : m
        )
      );
      setSelectedMember((prev) =>
        prev && prev.id === member.id ? { ...prev, membership_level: newLevel } : prev
      );
    }
    setUpdatingLevelId(null);
  }

  async function handleDeleteMember(member: ApprovedMember) {
    if (deleteConfirmEmail.trim().toLowerCase() !== member.email.trim().toLowerCase()) {
      setActionError("Confirm email matches the member's email.");
      return;
    }

    setDeleteLoading(true);
    setActionError(null);

    const { error } = await supabase.rpc("delete_member_completely", {
      p_email: member.email,
    });

    setDeleteLoading(false);

    if (error) {
      setActionError(`Failed to delete member: ${error.message}`);
    } else {
      setDeletingMember(null);
      fetchMembers();
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  async function handleShowDetails(member: ApprovedMember) {
    setSelectedMember(member);
    setSelectedReferral(null);
    try {
      const { data, error } = await supabase
        .from("referral_codes")
        .select("code, successful_referrals, reward_eligible, reward_redeemed")
        .eq("member_email", member.email.toLowerCase())
        .maybeSingle();

      if (!error && data) {
        setSelectedReferral(data);
      }
    } catch (err) {
      console.error("Failed to load referral details:", err);
    }
  }

  async function handleRedeemReward(email: string) {
    setRedeemingReward(true);
    try {
      const { error } = await supabase
        .from("referral_codes")
        .update({ reward_redeemed: true })
        .eq("member_email", email.toLowerCase());

      if (error) {
        alert("Failed to redeem reward: " + error.message);
      } else {
        setSelectedReferral((prev) =>
          prev ? { ...prev, reward_redeemed: true } : null
        );
      }
    } catch (err: any) {
      alert("Failed to redeem reward: " + err.message);
    } finally {
      setRedeemingReward(false);
    }
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

      {actionError && (
        <div className="p-4 rounded-xl text-sm bg-brand-error/10 border border-brand-error/20 text-brand-error flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-brand-error hover:text-brand-error/80 font-medium text-xs">Dismiss</button>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl border border-brand-sand/50 p-6">
          <h3 className="text-lg font-medium text-brand-navy mb-4">Add New Member</h3>
          
          {prefilledReferralCode && (
            <div className="p-4 rounded-xl bg-brand-brown/10 border border-brand-brown/20 text-brand-brown mb-4 text-xs leading-relaxed max-w-lg">
              <div>
                <span className="font-semibold">Referred By:</span> {prefilledReferrerName} ({prefilledReferrerEmail})
              </div>
              <div className="mt-0.5">
                <span className="font-semibold">Referral Code:</span> {prefilledReferralCode}
              </div>
            </div>
          )}

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
              <p className="text-xs text-brand-navy/50 mt-1.5 leading-normal">
                <span className="text-brand-error font-medium">Important:</span> Ensure this email address is correct. The member must use this exact email address when logging in to avoid future authentication issues.
              </p>
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
            <div>
              <label className="block text-sm font-medium text-brand-navy/70 mb-1">Membership Level</label>
              <select
                value={formLevel}
                onChange={(e) => setFormLevel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy text-sm"
              >
                <option value="Beginner">Beginner (6 classes/month)</option>
                <option value="Intermediate">Intermediate (10 classes/month)</option>
                <option value="Advanced">Advanced (14 classes/month)</option>
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
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">Level</th>
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">Membership</th>
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">Date Added</th>
                  <th className="text-left py-3 px-5 font-medium text-brand-navy/60">Action</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-brand-sand/30 last:border-0 hover:bg-brand-cream/30 transition-colors">
                    <td className="py-3 px-5 font-medium text-brand-navy">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-brand-sand/50 bg-brand-cream/50 flex-shrink-0 flex items-center justify-center">
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt={m.full_name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-semibold text-brand-navy/40">
                              {m.full_name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span>{m.full_name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-brand-navy/60">{m.email}</td>
                    <td className="py-3 px-5 text-brand-navy/60">{m.phone_number}</td>
                    <td className="py-3 px-5 text-brand-navy/60 font-medium">{m.membership_level || "Beginner"}</td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        {togglingId === m.id ? (
                          <div className="w-5 h-5 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
                        ) : (
                          <button
                            onClick={() => handleToggleClick(m)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
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
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                          m.membership_status === "active"
                            ? "text-brand-success bg-brand-success/10"
                            : "text-brand-error bg-brand-error/10"
                        }`}>
                          {m.membership_status === "active" ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-brand-navy/50 text-xs">{formatDate(m.created_at)}</td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleShowDetails(m)}
                          className="text-xs font-medium text-brand-brown hover:text-brand-brown-dark underline underline-offset-2"
                        >
                          Details
                        </button>
                        <button
                          onClick={() => {
                            setDeleteConfirmEmail("");
                            setDeletingMember(m);
                          }}
                          className="text-xs font-medium text-brand-error hover:text-brand-error-dark underline underline-offset-2"
                        >
                          Delete
                        </button>
                      </div>
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
                <span className="text-brand-navy/50 block text-xs uppercase tracking-wide mb-1">Membership Level</span>
                {updatingLevelId === selectedMember.id ? (
                  <div className="w-5 h-5 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
                ) : (
                  <select
                    value={selectedMember.membership_level || "Beginner"}
                    onChange={(e) => handleUpdateLevel(selectedMember, e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-brand-sand bg-brand-cream/50 text-brand-navy text-sm focus:outline-none"
                  >
                    <option value="Beginner">Beginner (6 credits)</option>
                    <option value="Intermediate">Intermediate (10 credits)</option>
                    <option value="Advanced">Advanced (14 credits)</option>
                  </select>
                )}
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

              {/* Referral Details section */}
              {selectedReferral && (
                <div className="pt-4 border-t border-brand-sand/30 space-y-3">
                  <div>
                    <span className="text-brand-navy/50 block text-xs uppercase tracking-wide">Referral Code</span>
                    <span className="text-brand-navy font-mono font-medium">{selectedReferral.code}</span>
                  </div>
                  <div>
                    <span className="text-brand-navy/50 block text-xs uppercase tracking-wide">Referrals Made</span>
                    <span className="text-brand-navy">{selectedReferral.successful_referrals} / 3</span>
                  </div>
                  <div>
                    <span className="text-brand-navy/50 block text-xs uppercase tracking-wide">Reward Status</span>
                    {selectedReferral.reward_eligible && !selectedReferral.reward_redeemed ? (
                      <div className="mt-1 space-y-2">
                        <span className="inline-block text-xs font-semibold text-brand-success bg-brand-success/10 px-2 py-0.5 rounded-full">
                          🎉 15% Discount Eligible
                        </span>
                        <button
                          onClick={() => handleRedeemReward(selectedMember.email)}
                          disabled={redeemingReward}
                          className="block w-full py-1.5 px-3 rounded-lg bg-brand-brown text-white text-xs font-medium hover:bg-brand-brown-dark transition-colors disabled:opacity-50 text-center"
                        >
                          {redeemingReward ? "Redeeming..." : "Mark Discount Redeemed"}
                        </button>
                      </div>
                    ) : selectedReferral.reward_redeemed ? (
                      <span className="inline-block text-xs font-medium text-brand-navy/50 bg-brand-sand/30 px-2 py-0.5 rounded-full mt-1">
                        Discount Redeemed
                      </span>
                    ) : (
                      <span className="text-brand-navy/40 text-xs">Not eligible for discount yet</span>
                    )}
                  </div>
                </div>
              )}
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

      {deactivatingMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setDeactivatingMember(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4 border border-brand-sand/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-brand-error mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-error/10 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-brand-navy">Confirm Deactivation</h3>
            </div>
            
            <p className="text-sm text-brand-navy/70 mb-6 leading-relaxed">
              Are you sure you want to deactivate <span className="font-semibold text-brand-navy">{deactivatingMember.full_name}</span>? 
              They will be instantly logged out and blocked from accessing the member portal.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeactivatingMember(null)}
                className="flex-1 py-2.5 rounded-xl border border-brand-sand text-brand-navy/60 font-medium hover:bg-brand-beige transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleToggleStatus(deactivatingMember, "inactive");
                  setDeactivatingMember(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-brand-error text-white font-medium hover:bg-brand-error/90 transition-colors text-sm"
              >
                Deactivate Member
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => { if (!deleteLoading) setDeletingMember(null); }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4 border border-brand-sand/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-brand-error mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-error/10 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-brand-navy">Delete Member Completely</h3>
            </div>
            
            <p className="text-sm text-brand-navy/70 mb-4 leading-relaxed">
              This action will permanently delete <span className="font-semibold text-brand-navy">{deletingMember.full_name}</span>. 
              Their login account, profile, bookings, and attendance records will be removed forever.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-brand-navy/50 uppercase tracking-wide mb-1.5">
                  To confirm, type <span className="font-semibold select-all text-brand-navy">{deletingMember.email}</span> below:
                </label>
                <input
                  type="email"
                  value={deleteConfirmEmail}
                  onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy text-sm focus:outline-none focus:ring-1 focus:ring-brand-error"
                  placeholder="Enter email address"
                  disabled={deleteLoading}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeletingMember(null)}
                disabled={deleteLoading}
                className="flex-1 py-2.5 rounded-xl border border-brand-sand text-brand-navy/60 font-medium hover:bg-brand-beige transition-colors text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteMember(deletingMember)}
                disabled={deleteLoading || deleteConfirmEmail.trim().toLowerCase() !== deletingMember.email.trim().toLowerCase()}
                className="flex-1 py-2.5 rounded-xl bg-brand-error text-white font-medium hover:bg-brand-error/90 transition-colors text-sm disabled:opacity-50"
              >
                {deleteLoading ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MembersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="w-8 h-8 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
        </div>
      }
    >
      <MembersPageContent />
    </Suspense>
  );
}
