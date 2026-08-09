"use client";

import { useEffect, useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { isAdminEmail } from "@/lib/constants";

import Logo from "@/components/logo";

function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [emailReadOnly, setEmailReadOnly] = useState(false);

  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      const normalizedEmail = emailParam.trim().toLowerCase();
      setEmail(normalizedEmail);
      setEmailReadOnly(true);

      async function prefillFromApproval() {
        try {
          const { data, error } = await supabase
            .from("approved_members")
            .select("full_name, phone_number")
            .eq("email", normalizedEmail)
            .maybeSingle();

          if (!error && data) {
            setFullName(data.full_name);
            setPhoneNumber(data.phone_number);
          }
        } catch (e) {
          console.error("Failed to prefill from approved_members:", e);
        }
      }
      prefillFromApproval();
    }
  }, [searchParams, supabase]);

  function validatePhone(phone: string): boolean {
    const phoneRegex = /^\d{10}$/;
    return phoneRegex.test(phone);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (phoneNumber && !validatePhone(phoneNumber)) {
      setError("Phone number must be exactly 10 digits.");
      setLoading(false);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (isAdminEmail(normalizedEmail)) {
      setError("This email belongs to an administrator and cannot be registered as a member.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success || !data?.redirectUrl) {
        const safeErrorMessage = (await import("@/app/auth/login/page")).safeErrorMessage;
        setError(safeErrorMessage(data?.error || data || "Sign-up failed"));
        setLoading(false);
        return;
      }

      window.location.href = data.redirectUrl;
    } catch (err: any) {
      const safeErrorMessage = (await import("@/app/auth/login/page")).safeErrorMessage;
      setError(safeErrorMessage(err));
      setLoading(false);
    }
  }

  async function handleGoogleSignup() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        const safeErrorMessage = (await import("@/app/auth/login/page")).safeErrorMessage;
        setError(safeErrorMessage(error));
      }
    } catch (err: any) {
      const safeErrorMessage = (await import("@/app/auth/login/page")).safeErrorMessage;
      setError(safeErrorMessage(err));
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4 py-8">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center mb-8 flex flex-col items-center justify-center">
            <Logo href="/" variant="auto" size="lg" className="items-center text-center" />
          </div>
          <div className="bg-surface rounded-2xl shadow-lg shadow-rail/5 p-8 border border-line text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-accent/10 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-medium text-fg mb-2">Check your email</h2>
            <p className="text-sm text-fg-4 mb-6">
              We sent a sign-in link to<br />
              <span className="font-medium text-fg">{email.trim().toLowerCase()}</span>
            </p>
            <p className="text-xs text-fg-5 mb-6">
              Click the link in the email to access your dashboard. You can close this tab.
            </p>
            <button
              onClick={() => { setSent(false); setError(null); }}
              className="text-sm text-accent font-medium hover:text-accent-dark transition-colors"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4 py-8">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8 flex flex-col items-center justify-center">
          <Logo href="/" variant="auto" size="lg" className="items-center text-center" />
        </div>

        <div className="bg-surface rounded-2xl shadow-lg shadow-rail/5 p-8 border border-line">
          <h2 className="text-xl font-medium text-fg mb-6">
            Create your account
          </h2>

          {emailReadOnly && (
            <div className="mb-4 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-xs leading-relaxed">
              Your membership is approved! Enter your details below to get started.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-400/20 text-red-500 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="flex flex-col items-center justify-center pb-4 pt-2">
              <div className="relative group w-20 h-20 rounded-full overflow-hidden border border-line bg-surface-2/50 flex items-center justify-center shadow-inner">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Profile Preview" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-10 h-10 text-fg-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
                <label className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[9px] font-medium">
                  <svg className="w-4 h-4 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="text-[10px] text-fg-5 mt-1.5 font-medium">Profile Photo (Optional)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-fg/70 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 transition-all"
                placeholder="Enter your full name"
              />
            </div>

             <div>
              <label className="block text-sm font-medium text-fg/70 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
                readOnly={emailReadOnly}
                className={`w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 transition-all ${
                  emailReadOnly ? "opacity-70 cursor-not-allowed border-line bg-brand-sand/10" : ""
                }`}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-fg/70 mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) =>
                  setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                maxLength={10}
                className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 transition-all"
                placeholder="9876543210 (Optional)"
              />
              <p className="text-xs text-fg-5 mt-1">
                10-digit Indian mobile number
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-rail text-white font-medium hover:bg-rail/90 transition-colors disabled:opacity-50 [touch-action:manipulation]"
            >
              {loading ? "Sending link..." : "Send Sign-In Link"}
            </button>
          </form>

          <div className="mt-2">
            <Link
              href="/referral"
              className="block w-full py-3 rounded-xl border border-line bg-surface text-fg text-center font-medium hover:bg-surface-2/50 transition-colors [touch-action:manipulation]"
            >
              Have a Referral Code?
            </Link>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-surface px-3 text-fg-5">or</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignup}
            className="w-full py-3 rounded-xl border border-line bg-surface text-fg font-medium hover:bg-surface-2/50 transition-colors flex items-center justify-center gap-3 [touch-action:manipulation]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          <p className="mt-6 text-center text-sm text-fg-4">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="text-accent font-medium hover:text-accent-dark transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-surface-2">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-text-gold rounded-full animate-spin" />
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
