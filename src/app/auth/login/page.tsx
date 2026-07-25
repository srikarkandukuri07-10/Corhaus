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

function LoginForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const supabase = createClient();
  const searchParams = useSearchParams();

  const urlError = searchParams.get("error");
  const notApprovedError = urlError === "not_approved" ? "You do not currently have access to the Corhaus Member Portal. Please contact Corhaus staff to activate your membership." : null;

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const { data: member } = await supabase
        .from("approved_members")
        .select("membership_status")
        .eq("email", normalizedEmail)
        .maybeSingle();

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if ((!member || member.membership_status !== "active") && !profile) {
        setError("This email is not approved for access. Please contact Corhaus staff to activate your membership.");
        setLoading(false);
        return;
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (otpError) {
        setError(otpError.message);
        setLoading(false);
        return;
      }

      setSent(true);
      setLoading(false);
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

  if (sent) {
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
              Click the link in the email to sign in. You can close this tab.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); setError(null); }}
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
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-400/20 text-red-500 text-sm">
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
                autoComplete="off"
                className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 transition-all"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-rail text-white font-medium hover:bg-rail/90 transition-colors disabled:opacity-50 [touch-action:manipulation]"
            >
              {loading ? "Sending link..." : "Send Sign-In Link"}
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
