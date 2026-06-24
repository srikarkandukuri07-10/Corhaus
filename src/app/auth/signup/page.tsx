"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  function validatePhone(phone: string): boolean {
    const phoneRegex = /^\d{10}$/;
    return phoneRegex.test(phone);
  }

  async function handleSignup(e: React.FormEvent) {
    console.log("BUTTON_CLICKED");
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!validatePhone(phoneNumber)) {
      setError("Phone number must be exactly 10 digits.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone_number: phoneNumber,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.href = "/member";
  }

  async function handleGoogleSignup() {
    console.log("GOOGLE_BUTTON_CLICKED");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-cream px-4 py-8">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-light tracking-tight text-brand-navy">
            Cor<span className="text-brand-brown font-medium">haus</span>
          </h1>
          <p className="text-brand-brown-light mt-2 text-sm tracking-widest uppercase">
            Pilates for everyone
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg shadow-brand-navy/5 p-8 border border-brand-sand/50">
          <h2 className="text-xl font-medium text-brand-navy mb-6">
            Create your account
          </h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-brand-error/10 border border-brand-error/20 text-brand-error text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy placeholder:text-brand-navy/30 transition-all"
                placeholder="Enter your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy placeholder:text-brand-navy/30 transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) =>
                  setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                required
                maxLength={10}
                pattern="\d{10}"
                className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy placeholder:text-brand-navy/30 transition-all"
                placeholder="9876543210"
              />
              <p className="text-xs text-brand-navy/40 mt-1">
                10-digit Indian mobile number
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy placeholder:text-brand-navy/30 transition-all"
                placeholder="At least 6 characters"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              onClick={() => console.log("CREATE_ACCOUNT_CLICKED")}
              className="w-full py-3 rounded-xl bg-brand-navy text-white font-medium hover:bg-brand-navy/90 transition-colors disabled:opacity-50 [touch-action:manipulation]"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-brand-sand" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-3 text-brand-navy/40">or</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignup}
            className="w-full py-3 rounded-xl border border-brand-sand bg-white text-brand-navy font-medium hover:bg-brand-cream/50 transition-colors flex items-center justify-center gap-3 [touch-action:manipulation]"
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

          <p className="mt-6 text-center text-sm text-brand-navy/50">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              onClick={() => console.log("SIGNIN_LINK_CLICKED")}
              className="text-brand-brown font-medium hover:text-brand-brown-dark transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
