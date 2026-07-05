"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ProfileData {
  id: string;
  full_name: string;
  phone_number: string;
  email: string;
  avatar_url?: string | null;
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
  const [showPassword, setShowPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [hasEmailProvider, setHasEmailProvider] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
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
        .select("id, full_name, phone_number, email, avatar_url")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile(data);
        setFullName(data.full_name);
        setPhoneNumber(data.phone_number);
        setAvatarUrl(data.avatar_url || null);
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

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!profile || !e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const file = e.target.files[0];
      const fileExt = file.name.split(".").pop();
      const filePath = `${profile.id}/photo.${fileExt}`;

      // Upload file to Supabase storage profile-photos bucket
      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      if (uploadError) {
        setError(`Failed to upload photo: ${uploadError.message}`);
        setUploading(false);
        return;
      }

      // Get public URL of the uploaded image
      const { data: { publicUrl } } = supabase.storage
        .from("profile-photos")
        .getPublicUrl(filePath);

      // Update avatar_url in profiles table
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id);

      if (updateError) {
        setError(`Failed to update profile photo: ${updateError.message}`);
        setUploading(false);
        return;
      }

      // Add cache buster query parameter to force image reload
      const newAvatarUrl = `${publicUrl}?t=${Date.now()}`;
      setAvatarUrl(newAvatarUrl);
      setProfile({ ...profile, avatar_url: newAvatarUrl });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setUploading(false);
    }
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

            <div className="flex flex-col items-center justify-center pb-4 pt-2">
              <div className="relative group w-24 h-24 rounded-full overflow-hidden border-2 border-brand-sand/50 bg-brand-cream/50 flex items-center justify-center shadow-inner">
                {uploading ? (
                  <div className="w-6 h-6 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
                ) : avatarUrl ? (
                  <img src={avatarUrl} alt="Profile Photo" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-12 h-12 text-brand-navy/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
                
                {!uploading && (
                  <label className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px] font-medium">
                    <svg className="w-5 h-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>Change</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
              <p className="text-[10px] text-brand-navy/40 mt-1.5 font-medium">Click photo to update</p>
            </div>

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
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="New password (min 6 chars)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      className="w-full px-3 py-2.5 rounded-xl border border-brand-sand bg-white text-brand-navy text-sm transition-all pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-navy/40 hover:text-brand-navy/60 transition-colors"
                    >
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
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
