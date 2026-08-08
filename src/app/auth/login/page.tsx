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
        <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
          <div className="bg-surface rounded-2xl shadow-lg p-8 max-w-md text-center">
            <h2 className="text-xl font-medium text-fg mb-4">Something went wrong</h2>
            <p className="text-red-500 text-sm mb-6">{this.state.error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-xl bg-rail text-white font-medium"
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

export function safeErrorMessage(err: any): string {
  if (!err) return "An unexpected error occurred. Please try again.";
  if (typeof err === "string" && err.trim() !== "") return err;

  // 1. Error instance message or object message
  if (typeof err?.message === "string" && err.message.trim() !== "") {
    return err.message;
  }

  // 2. OAuth / Supabase error_description
  if (typeof err?.error_description === "string" && err.error_description.trim() !== "") {
    return err.error_description;
  }

  // 3. Nested error properties
  if (typeof err?.error === "string" && err.error.trim() !== "") {
    return err.error;
  }
  if (typeof err?.error?.message === "string" && err.error.message.trim() !== "") {
    return err.error.message;
  }
  if (typeof err?.error?.error_description === "string" && err.error.error_description.trim() !== "") {
    return err.error.error_description;
  }

  // 4. Details or msg
  if (typeof err?.details === "string" && err.details.trim() !== "") {
    return err.details;
  }
  if (typeof err?.msg === "string" && err.msg.trim() !== "") {
    return err.msg;
  }

  // 5. JSON stringify fallback, filtering out empty objects/arrays
  try {
    const str = JSON.stringify(err);
    if (str && str !== "{}" && str !== "[]" && str !== "null" && str !== "undefined") {
      return str;
    }
  } catch {}

  return "An unexpected error occurred while signing in. Please check your credentials and try again.";
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const searchParams = useSearchParams();

  const urlError = searchParams.get("error");
  const notApprovedError =
    urlError === "not_approved"
      ? "You do not currently have access to the Corhaus Member Portal. Please contact Corhaus staff to activate your membership."
      : null;

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Please enter your email address.");
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
        const errorMsg = safeErrorMessage(data?.error || data || "Sign-in failed");
        setError(errorMsg);
        setLoading(false);
        return;
      }

      // Instant sign in: navigate directly to authentication callback URL
      window.location.href = data.redirectUrl;
    } catch (err: any) {
      setError(safeErrorMessage(err));
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
        setError(safeErrorMessage(error));
        setLoading(false);
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setError("Failed to get Google sign-in URL. Please try again.");
        setLoading(false);
      }
    } catch (err) {
      setError(safeErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-light tracking-tight text-fg">
            Cor<span className="text-accent font-medium">haus</span>
          </h1>
          <p className="text-fg-3 mt-2 text-sm tracking-widest uppercase">
            Pilates for everyone
          </p>
        </div>

        <div className="bg-surface rounded-2xl shadow-lg shadow-rail/5 p-8 border border-line">
          <h2 className="text-xl font-medium text-fg mb-6">Welcome back</h2>

          {notApprovedError && (
            <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-400/20 text-red-500 text-sm leading-relaxed">
              {notApprovedError}
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-400/20 text-red-500 text-sm leading-relaxed break-words">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-fg/70 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 transition-all focus:outline-none focus:border-accent"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-rail text-white font-medium hover:bg-rail/90 transition-colors disabled:opacity-50 [touch-action:manipulation]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-surface px-3 text-fg-5">or</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 rounded-xl border border-line bg-surface text-fg font-medium hover:bg-surface-2/50 transition-colors flex items-center justify-center gap-3 disabled:opacity-50 [touch-action:manipulation]"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-fg/30 border-t-accent rounded-full animate-spin" />
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

          <p className="mt-6 text-center text-sm text-fg-4">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="text-accent font-medium hover:text-accent-dark transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <LoginErrorBoundary>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-surface-2">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-text-gold rounded-full animate-spin" />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </LoginErrorBoundary>
  );
}
