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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [prefillEmail, setPrefillEmail] = useState<string | null>(null);
  const supabase = createClient();
  const searchParams = useSearchParams();

  const urlError = searchParams.get("error");
  const notApprovedError = urlError === "not_approved" ? "You do not currently have access to the Corhaus Member Portal. Please contact Corhaus staff to activate your membership." : null;

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPrefillEmail(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        const normalizedEmail = email.trim().toLowerCase();
        try {
          const { data: member } = await supabase
            .from("approved_members")
            .select("membership_status")
            .eq("email", normalizedEmail)
            .maybeSingle();

          if (member && member.membership_status === "active") {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id")
              .eq("email", normalizedEmail)
              .maybeSingle();

            if (!profile) {
              setPrefillEmail(normalizedEmail);
              setError("Your membership is approved! However, you haven't created a login account yet. Please complete registration to set your password.");
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          console.error("Error checking login pre-approval:", e);
        }

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

              {prefillEmail && (
                <div className="mb-4 p-4 rounded-xl bg-brand-brown/10 border border-brand-brown/20 text-center space-y-3">
                  <p className="text-sm text-brand-navy">
                    Set up your password now to activate your dashboard.
                  </p>
                  <Link
                    href={`/auth/signup?email=${encodeURIComponent(prefillEmail)}`}
                    className="inline-block px-5 py-2.5 rounded-xl bg-brand-brown text-white text-xs font-medium hover:bg-brand-brown-dark transition-colors"
                  >
                    Set Password & Activate
                  </Link>
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
                    autoComplete="off"
                    className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy placeholder:text-brand-navy/30 transition-all"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy placeholder:text-brand-navy/30 transition-all pr-12"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-navy/40 hover:text-brand-navy/60 transition-colors"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-brand-navy text-white font-medium hover:bg-brand-navy/90 transition-colors disabled:opacity-50 [touch-action:manipulation]"
                >
                  {loading ? "Signing in..." : "Sign In"}
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
