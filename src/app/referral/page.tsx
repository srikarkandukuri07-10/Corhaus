"use client";

import { useState } from "react";
import Link from "next/link";

export default function ReferralPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [code, setCode] = useState("");
  const [referrerName, setReferrerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/referral/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.toUpperCase() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Referral code not found.");
      } else {
        setReferrerName(data.referrerName);
        setStep(2);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (val: string) => {
    // Keep only numbers and max 10 digits
    const cleaned = val.replace(/\D/g, "").slice(0, 10);
    setPhone(cleaned);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !email.trim()) {
      setError("All fields are required.");
      return;
    }

    if (phone.length !== 10) {
      setError("Phone number must be exactly 10 digits.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/referral/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referral_code: code.toUpperCase(),
          applicant_name: name,
          applicant_email: email,
          applicant_phone: phone,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to submit request.");
      } else {
        setStep(4);
      }
    } catch {
      setError("Failed to submit request. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {step === 1 && (
        <div className="bg-surface rounded-2xl shadow-lg shadow-rail/5 p-8 border border-line animate-fade-in">
          <h2 className="text-xl font-medium text-fg mb-2 text-center">
            Have a Referral Code?
          </h2>
          <p className="text-sm text-fg-4 text-center mb-6">
            Enter your referral code to request membership.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-400/20 text-red-500 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-fg/70 uppercase tracking-wider mb-2">
                Referral Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                maxLength={8}
                className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg text-center font-mono text-lg tracking-[0.2em] uppercase placeholder:text-fg-5 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="ABC123XY"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.trim().length !== 8}
              className="w-full py-3 rounded-xl bg-rail text-white font-medium hover:bg-rail/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Verify Code"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-fg-4">
            Don't have a code?{" "}
            <Link
              href="/auth/signup"
              className="text-accent font-medium hover:text-accent-dark transition-colors"
            >
              Sign up here
            </Link>
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="bg-surface rounded-2xl shadow-lg shadow-rail/5 p-8 border border-line text-center animate-fade-in">
          <div className="mx-auto w-12 h-12 bg-green-500/10 text-green-600 rounded-full flex items-center justify-center mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="text-xl font-medium text-fg mb-1">
            Referral Found
          </h2>
          <p className="text-sm text-fg-4 mb-4">
            You were invited by
          </p>

          <div className="bg-surface-2/50 rounded-xl p-4 border border-line mb-6">
            <span className="text-lg font-semibold text-fg">{referrerName}</span>
          </div>

          <p className="text-sm text-fg/70 mb-6">
            Would you like this member to receive referral credit if you become a Corhaus member?
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => setStep(3)}
              className="w-full py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent-dark transition-colors"
            >
              Yes, Continue
            </button>
            <button
              onClick={() => {
                setCode("");
                setReferrerName("");
                setError(null);
                setStep(1);
              }}
              className="w-full py-3 rounded-xl border border-line bg-surface text-fg font-medium hover:bg-surface-2/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-surface rounded-2xl shadow-lg shadow-rail/5 p-8 border border-line animate-fade-in">
          <h2 className="text-xl font-medium text-fg mb-2 text-center">
            Membership Request
          </h2>
          <p className="text-sm text-fg-4 text-center mb-6">
            Referred by <span className="font-semibold text-fg">{referrerName}</span>
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-400/20 text-red-500 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmitRequest} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-fg/70 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 focus:outline-none focus:border-accent"
                placeholder="Enter your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-fg/70 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 focus:outline-none focus:border-accent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-fg/70 mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                required
                maxLength={10}
                className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 focus:outline-none focus:border-accent"
                placeholder="9876543210"
              />
              <p className="text-xs text-fg-5 mt-1">
                10-digit Indian mobile number
              </p>
            </div>

            <div className="bg-surface-2/50 border border-line rounded-xl p-4 text-xs text-fg/70 leading-relaxed mb-4">
              By clicking Send Request, your information will be sent to the Corhaus staff for review.
              <br />
              <br />
              You will receive access to your member account only after your membership has been approved.
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-rail text-white font-medium hover:bg-rail/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Send Request"
              )}
            </button>
          </form>
        </div>
      )}

      {step === 4 && (
        <div className="bg-surface rounded-2xl shadow-lg shadow-rail/5 p-8 border border-line text-center animate-fade-in">
          <div className="mx-auto w-12 h-12 bg-green-500/10 text-green-600 rounded-full flex items-center justify-center mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h2 className="text-xl font-medium text-fg mb-2">
            Request Submitted!
          </h2>
          <p className="text-sm text-fg-3 leading-relaxed mb-4">
            Your membership request has been sent to the Corhaus team for review. You will be notified once your membership has been approved.
          </p>

          <p className="text-xs text-fg-5 mb-6 italic">
            Referred by: {referrerName}
          </p>

          <Link
            href="/auth/login"
            className="block w-full py-3 rounded-xl bg-rail text-white font-medium hover:bg-rail/90 text-center transition-colors"
          >
            Go to Login
          </Link>
        </div>
      )}
    </div>
  );
}
