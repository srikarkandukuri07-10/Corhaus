"use client";

import { useState, useEffect, Suspense, Component } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import Logo from "@/components/logo";

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

  if (typeof err?.message === "string" && err.message.trim() !== "") {
    return err.message;
  }

  if (typeof err?.error_description === "string" && err.error_description.trim() !== "") {
    return err.error_description;
  }

  if (typeof err?.error === "string" && err.error.trim() !== "") {
    return err.error;
  }
  if (typeof err?.error?.message === "string" && err.error.message.trim() !== "") {
    return err.error.message;
  }
  if (typeof err?.error?.error_description === "string" && err.error.error_description.trim() !== "") {
    return err.error.error_description;
  }

  if (typeof err?.details === "string" && err.details.trim() !== "") {
    return err.details;
  }
  if (typeof err?.msg === "string" && err.msg.trim() !== "") {
    return err.msg;
  }

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
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [step, setStep] = useState<"email" | "password" | "setup_password" | "forgot_password_request" | "forgot_password_verify">("email");
  const [staffInfo, setStaffInfo] = useState<{ role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const searchParams = useSearchParams();

  const urlError = searchParams.get("error");
  const notApprovedError =
    urlError === "not_approved"
      ? "You do not currently have access to the Corhaus Member Portal. Please contact Corhaus staff to activate your membership."
      : urlError === "staff_inactive"
      ? "Your staff account is currently inactive. Please contact your manager."
      : null;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && event === "SIGNED_IN") {
        window.location.href = `${window.location.origin}/`;
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleCheckEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfoMsg(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Please enter your email address.");
      setLoading(false);
      return;
    }

    try {
      const checkRes = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const checkData = await checkRes.json().catch(() => null);

      if (!checkRes.ok || !checkData?.approved) {
        setError(checkData?.error || "This email is not approved for access. Please contact Corhaus staff.");
        setLoading(false);
        return;
      }

      if (checkData.accountType === "staff" || checkData.accountType === "member" || checkData.accountType === "developer") {
        const roleName = checkData.accountType === "staff"
          ? (checkData.staffRole || "Staff")
          : checkData.accountType === "developer"
          ? "Developer"
          : "Member";
        
        setStaffInfo({ role: roleName });
        if (checkData.hasPassword) {
          setStep("password");
          setInfoMsg(`${roleName} Account — Enter your password to sign in.`);
        } else {
          setStep("setup_password");
          setInfoMsg(`Your ${roleName.toLowerCase()} account does not have a password set yet. Please establish your password below.`);
        }
        setLoading(false);
        return;
      }

      // Fallback
      setError("Unrecognized account type.");
      setLoading(false);
    } catch (err: any) {
      setError(safeErrorMessage(err));
      setLoading(false);
    }
  }

  async function handleStaffLoginWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!password) {
      setError("Please enter your password.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success || !data?.redirectUrl) {
        setError(data?.error || "Invalid password. Please try again.");
        setLoading(false);
        return;
      }

      window.location.href = data.redirectUrl;
    } catch (err: any) {
      setError(safeErrorMessage(err));
      setLoading(false);
    }
  }

  async function handleStaffPasswordSetup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters long.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please try again.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/staff-set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success || !data?.redirectUrl) {
        setError(data?.error || "Failed to set password. Please try again.");
        setLoading(false);
        return;
      }

      window.location.href = data.redirectUrl;
    } catch (err: any) {
      setError(safeErrorMessage(err));
      setLoading(false);
    }
  }

  async function handleRequestForgotCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfoMsg(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(data?.error || "Failed to request password reset code.");
        setLoading(false);
        return;
      }

      setStep("forgot_password_verify");
      setInfoMsg("A 5-digit verification code has been generated. Please obtain the code from your administrator or notifications and enter it below.");
      setLoading(false);
    } catch (err: any) {
      setError(safeErrorMessage(err));
      setLoading(false);
    }
  }

  async function handleVerifyForgotCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!forgotCode || forgotCode.trim().length !== 5) {
      setError("Please enter a valid 5-digit code.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/forgot-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: forgotCode.trim() }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.redirectUrl) {
        setError(data?.error || "Invalid code. Please try again.");
        setLoading(false);
        return;
      }

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
        <div className="text-center mb-10 flex flex-col items-center justify-center">
          <Logo href="/" variant="auto" size="lg" className="items-center text-center" />
        </div>

        <div className="bg-surface rounded-2xl shadow-lg shadow-rail/5 p-8 border border-line">
          <h2 className="text-xl font-medium text-fg mb-6">
            {step === "email"
              ? "Welcome back"
              : step === "password"
              ? `Sign In (${staffInfo?.role || "Account"})`
              : step === "setup_password"
              ? `First-Time Setup (${staffInfo?.role || "Account"})`
              : step === "forgot_password_request"
              ? "Forgot Password"
              : "Enter Verification Code"}
          </h2>

          {notApprovedError && (
            <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-400/20 text-red-500 text-sm leading-relaxed">
              {notApprovedError}
            </div>
          )}
          {infoMsg && (
            <div className="mb-4 p-3 rounded-lg bg-accent/10 border border-accent/20 text-accent text-sm leading-relaxed">
              {infoMsg}
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-400/20 text-red-500 text-sm leading-relaxed break-words">
              {error}
            </div>
          )}

          {step === "email" && (
            <form onSubmit={handleCheckEmail} className="space-y-4">
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
                    Checking email...
                  </span>
                ) : (
                  "Continue"
                )}
              </button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={handleStaffLoginWithPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg/70 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/30 text-fg/60 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg/70 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 transition-all focus:outline-none focus:border-accent"
                  placeholder="Enter your password"
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
                  "Sign In"
                )}
              </button>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep("forgot_password_request");
                    setError(null);
                    setInfoMsg(null);
                  }}
                  className="text-xs text-accent hover:text-accent-dark font-medium"
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  onClick={() => { setStep("email"); setError(null); setInfoMsg(null); }}
                  className="text-xs text-fg-4 hover:text-fg font-medium"
                >
                  &larr; Use a different email
                </button>
              </div>
            </form>
          )}

          {step === "setup_password" && (
            <form onSubmit={handleStaffPasswordSetup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg/70 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/30 text-fg/60 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg/70 mb-1.5">Set Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 transition-all focus:outline-none focus:border-accent"
                  placeholder="Create a strong password (min 6 chars)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg/70 mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 transition-all focus:outline-none focus:border-accent"
                  placeholder="Confirm password"
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
                    Setting password...
                  </span>
                ) : (
                  "Set Password & Access Portal"
                )}
              </button>

              <button
                type="button"
                onClick={() => { setStep("email"); setError(null); setInfoMsg(null); }}
                className="w-full text-xs text-center text-fg-4 hover:text-fg font-medium pt-1"
              >
                &larr; Use a different email
              </button>
            </form>
          )}

          {step === "forgot_password_request" && (
            <form onSubmit={handleRequestForgotCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg/70 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/30 text-fg/60 cursor-not-allowed"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-rail text-white font-medium hover:bg-rail/90 transition-colors disabled:opacity-50 [touch-action:manipulation]"
              >
                {loading ? "Requesting code..." : "Request 5-Digit Code"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("password"); setError(null); setInfoMsg(null); }}
                className="w-full text-xs text-center text-fg-4 hover:text-fg font-medium pt-1 block"
              >
                &larr; Back to password sign-in
              </button>
            </form>
          )}

          {step === "forgot_password_verify" && (
            <form onSubmit={handleVerifyForgotCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg/70 mb-1.5">Enter 5-Digit Code</label>
                <input
                  type="text"
                  maxLength={5}
                  value={forgotCode}
                  onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg text-center text-2xl tracking-widest placeholder:text-fg-5 transition-all focus:outline-none focus:border-accent"
                  placeholder="00000"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-rail text-white font-medium hover:bg-rail/90 transition-colors disabled:opacity-50 [touch-action:manipulation]"
              >
                {loading ? "Verifying..." : "Verify Code & Sign In"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("forgot_password_request"); setError(null); setInfoMsg(null); }}
                className="w-full text-xs text-center text-fg-4 hover:text-fg font-medium pt-1 block"
              >
                &larr; Request a new code
              </button>
            </form>
          )}

          {step === "email" && (
            <>
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
        <div className="min-h-screen flex items-center justify-center bg-surface-2">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-text-gold rounded-full animate-spin" />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </LoginErrorBoundary>
  );
}
