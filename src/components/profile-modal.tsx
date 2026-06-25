"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ProfileData {
  id: string;
  full_name: string;
  phone_number: string;
  email: string;
}

export default function ProfileModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [hasEmailProvider, setHasEmailProvider] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!open) return;

    async function load() {
      setEditing(false);
      setError(null);
      setSuccess(false);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setHasEmailProvider(user.app_metadata?.providers?.includes("email") || false);

      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, phone_number, email")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile(data);
        setFullName(data.full_name);
        setPhoneNumber(data.phone_number);
      }
    }

    load();
  }, [open, supabase]);

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone_number: phoneNumber })
      .eq("id", profile.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setProfile({ ...profile, full_name: fullName, phone_number: phoneNumber });
    setEditing(false);
    setSuccess(true);
    setSaving(false);
  }

  async function handlePasswordChange() {
    if (!newPassword || newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    setPasswordSuccess(false);
    setSuccess(false);

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setPasswordSuccess(true);
    setNewPassword("");
    setIsChangingPassword(false);
    setSaving(false);
    setHasEmailProvider(true); // they now have an email provider link
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-brand-navy">My Profile</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-brand-beige text-brand-navy/50 hover:text-brand-navy transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!profile ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {success && (
              <p className="text-sm text-brand-success bg-brand-success/10 px-3 py-2 rounded-lg">
                Profile updated successfully!
              </p>
            )}
            {error && (
              <p className="text-sm text-brand-error bg-brand-error/10 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-brand-navy/60 mb-1">Email</label>
              <p className="text-brand-navy bg-brand-cream/50 px-3 py-2.5 rounded-xl border border-brand-sand text-sm">
                {profile.email}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-navy/60 mb-1">Full Name</label>
              {editing ? (
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-brand-sand bg-white text-brand-navy text-sm transition-all"
                />
              ) : (
                <p className="text-brand-navy bg-brand-cream/50 px-3 py-2.5 rounded-xl border border-brand-sand text-sm">
                  {profile.full_name || "—"}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-navy/60 mb-1">Phone Number</label>
              {editing ? (
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-brand-sand bg-white text-brand-navy text-sm transition-all"
                />
              ) : (
                <p className="text-brand-navy bg-brand-cream/50 px-3 py-2.5 rounded-xl border border-brand-sand text-sm">
                  {profile.phone_number || "—"}
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              {editing ? (
                <>
                  <button
                    onClick={() => { setEditing(false); setFullName(profile.full_name); setPhoneNumber(profile.phone_number); }}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-brand-sand text-brand-navy/60 font-medium hover:bg-brand-beige transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-brand-brown text-white font-medium hover:bg-brand-brown-dark transition-colors disabled:opacity-50 text-sm"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="w-full px-4 py-2.5 rounded-xl bg-brand-navy text-white font-medium hover:bg-brand-navy/90 transition-colors text-sm"
                >
                  Edit Profile
                </button>
              )}
            </div>

            <div className="pt-4 border-t border-brand-sand/50 mt-4">
              <label className="block text-sm font-medium text-brand-navy/60 mb-2">Security</label>
              
              {passwordSuccess && (
                <p className="text-sm text-brand-success bg-brand-success/10 px-3 py-2 rounded-lg mb-3">
                  Password updated successfully!
                </p>
              )}

              {isChangingPassword ? (
                <div className="space-y-3">
                  <input
                    type="password"
                    placeholder="New password (min 6 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-brand-sand bg-white text-brand-navy text-sm transition-all"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setIsChangingPassword(false); setNewPassword(""); }}
                      className="flex-1 px-3 py-2 rounded-xl border border-brand-sand text-brand-navy/60 font-medium hover:bg-brand-beige transition-colors text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePasswordChange}
                      disabled={saving || newPassword.length < 6}
                      className="flex-1 px-3 py-2 rounded-xl bg-brand-navy text-white font-medium hover:bg-brand-navy/90 transition-colors disabled:opacity-50 text-sm"
                    >
                      {saving ? "Saving..." : "Save Password"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setIsChangingPassword(true); setSuccess(false); setPasswordSuccess(false); setError(null); }}
                  className="w-full px-4 py-2.5 rounded-xl border border-brand-sand text-brand-navy font-medium hover:bg-brand-beige transition-colors text-sm"
                >
                  {hasEmailProvider ? "Change Password" : "Set Password"}
                </button>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
