"use client";

import { useState, Suspense, Component } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

class LoginErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error) {
    console.error("LOGIN_PAGE_ERROR", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-brand-cream px-4">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
            <h2 className="text-xl font-medium text-brand-navy mb-4">Something went wrong</h2>
            <p className="text-brand-error text-sm mb-6">{this.state.error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-xl bg-brand-navy text-white font-medium"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot" | "code">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [code, setCode] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const supabase = createClient();
  const searchParams = useSearchParams();

  const urlError = searchParams.get("error");
  const notApprovedError = urlError === "not_approved" ? "You do not currently have access to the Corhaus Member Portal. Please contact Corhaus staff to activate your membership." : null;

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      window.location.href = "/member";
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setError("Failed to get OAuth URL. Please try again.");
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }
      setSuccessMsg("If the email is registered with an active membership, a confirmation code has been sent to the admin.");
      setMode("code");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code");
        setLoading(false);
        return;
      }
      window.location.href = data.redirectUrl;
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-cream px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-light tracking-tight text-brand-navy">
            Cor<span className="text-brand-brown font-medium">haus</span>
          </h1>
          <p className="text-brand-brown-light mt-2 text-sm tracking-widest uppercase">
            Pilates for everyone
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg shadow-brand-navy/5 p-8 border border-brand-sand/50">
          {mode === "login" && (
            <>
              <h2 className="text-xl font-medium text-brand-navy mb-6">Welcome back</h2>

              {notApprovedError && (
                <div className="mb-4 p-4 rounded-xl bg-brand-error/10 border border-brand-error/20 text-brand-error text-sm leading-relaxed">
                  {notApprovedError}
                </div>
              )}
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-brand-error/10 border border-brand-error/20 text-brand-error text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">Email</label>
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
                  <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy placeholder:text-brand-navy/30 transition-all"
                    placeholder="Enter your password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-brand-navy text-white font-medium hover:bg-brand-navy/90 transition-colors disabled:opacity-50 [touch-action:manipulation]"
                >
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>

              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setError(null); }}
                  className="text-sm text-brand-brown hover:text-brand-brown-dark font-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-brand-sand" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-3 text-brand-navy/40">or</span>
                </div>
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full py-3 rounded-xl border border-brand-sand bg-white text-brand-navy font-medium hover:bg-brand-cream/50 transition-colors flex items-center justify-center gap-3 disabled:opacity-50 [touch-action:manipulation]"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-brand-navy/30 border-t-brand-navy rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Continue with Google
                  </span>
                )}
              </button>

              <p className="mt-6 text-center text-sm text-brand-navy/50">
                Don&apos;t have an account?{" "}
                <Link href="/auth/signup" className="text-brand-brown font-medium hover:text-brand-brown-dark transition-colors">
                  Sign up
                </Link>
              </p>
            </>
          )}

          {mode === "forgot" && (
            <>
              <h2 className="text-xl font-medium text-brand-navy mb-2">Forgot password</h2>
              <p className="text-sm text-brand-navy/50 mb-6">Enter your email below. The admin will provide a confirmation code.</p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-brand-error/10 border border-brand-error/20 text-brand-error text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={(e) => { e.preventDefault(); handleForgotPassword(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy placeholder:text-brand-navy/30 transition-all"
                    placeholder="you@example.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-brand-navy text-white font-medium hover:bg-brand-navy/90 transition-colors disabled:opacity-50"
                >
                  {loading ? "Checking..." : "Send Request"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => { setMode("login"); setError(null); }}
                className="mt-4 w-full text-center text-sm text-brand-navy/50 hover:text-brand-navy transition-colors"
              >
                Back to login
              </button>
            </>
          )}

          {mode === "code" && (
            <>
              <h2 className="text-xl font-medium text-brand-navy mb-2">Enter confirmation code</h2>
              {successMsg && (
                <div className="mb-4 p-3 rounded-xl bg-brand-success/10 border border-brand-success/20 text-brand-success text-sm">
                  {successMsg}
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-brand-error/10 border border-brand-error/20 text-brand-error text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={(e) => { e.preventDefault(); handleVerifyCode(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">
                    2-digit confirmation code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    required
                    maxLength={2}
                    className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy placeholder:text-brand-navy/30 transition-all text-center text-2xl tracking-widest"
                    placeholder="00"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || code.length !== 2}
                  className="w-full py-3 rounded-xl bg-brand-navy text-white font-medium hover:bg-brand-navy/90 transition-colors disabled:opacity-50"
                >
                  {loading ? "Verifying..." : "Sign In"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => { setMode("forgot"); setError(null); setSuccessMsg(null); }}
                className="mt-3 w-full text-center text-sm text-brand-navy/50 hover:text-brand-navy transition-colors"
              >
                Resend request
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <LoginErrorBoundary>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-brand-cream">
          <div className="w-8 h-8 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </LoginErrorBoundary>
  );
}
