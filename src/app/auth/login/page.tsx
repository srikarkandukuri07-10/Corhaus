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
  const [mode, setMode] = useState<"initial" | "subsequent">("initial");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [step, setStep] = useState<"email" | "password" | "setup_password" | "forgot_password_request" | "forgot_password_verify">("email");
  const [staffInfo, setStaffInfo] = useState<{ role: string; name?: string } | null>(null);
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
      : urlError === "session_missing"
      ? "Your sign-in didn't complete in this browser. Please sign in again — and if this keeps happening, reload the page to load the latest version before signing in."
      : null;

  // On mount, check if user has previously logged in on this browser
  useEffect(() => {
    try {
      const hasLoggedIn = localStorage.getItem("corhaus_has_logged_in") === "true";
      const savedEmail = localStorage.getItem("corhaus_saved_email") || "";
      if (hasLoggedIn) {
        setMode("subsequent");
        if (savedEmail) setEmail(savedEmail);
      } else {
        setMode("initial");
      }
    } catch (_) {}
  }, []);

  // ─── 1. INITIAL SIGN-IN HANDLER (Phone + Email) ─────────────────────────────
  async function handleInitialSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfoMsg(null);

    const cleanPhone = phone.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanPhone || cleanPhone.replace(/\D/g, "").length < 10) {
      setError("Please enter a valid 10-digit phone number.");
      setLoading(false);
      return;
    }

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      setLoading(false);
      return;
    }

    try {
      const checkRes = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanPhone,
          email: cleanEmail,
        }),
      });
      const checkData = await checkRes.json().catch(() => null);

      if (!checkRes.ok || !checkData?.approved) {
        setError(checkData?.error || "No active account found for this phone number. Please contact Corhaus staff to activate your membership.");
        return;
      }

      const roleName = checkData.accountType === "staff"
        ? (checkData.staffRole || "Staff")
        : checkData.accountType === "developer"
        ? "Developer"
        : "Member";

      setStaffInfo({ role: roleName, name: checkData.name });

      if (checkData.hasPassword) {
        // User already has an established password -> prompt for password
        setStep("password");
        setInfoMsg(`Welcome back${checkData.name ? `, ${checkData.name}` : ""}! Please enter your password to sign in.`);
      } else {
        // First-time login -> prompt to establish password
        setStep("setup_password");
        setInfoMsg(
          checkData.accountType === "staff"
            ? `First-Time Setup — Please set a password for your staff account (${checkData.email || cleanEmail}).`
            : `First-Time Setup — Welcome${checkData.name ? `, ${checkData.name}` : ""}! Please set a password for your account (${cleanEmail}).`
        );
      }
    } catch (err: any) {
      setError(safeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // ─── 2. SUBSEQUENT LOGIN HANDLER (Email + Password) ─────────────────────────
  async function handleSubsequentLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfoMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      setLoading(false);
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const data = await res.json().catch(() => null);

      if (data?.needsStaffPasswordSetup) {
        setStaffInfo({ role: data.staffRole || "Member" });
        setStep("setup_password");
        setInfoMsg("Your account does not have a password set yet. Please establish your password below.");
        setLoading(false);
        return;
      }

      if (!res.ok || !data?.success || !data?.redirectUrl) {
        setError(data?.error || "Invalid credentials. Please try again.");
        setLoading(false);
        return;
      }

      // Mark this browser as having logged in so future sessions default to email + password
      try {
        localStorage.setItem("corhaus_has_logged_in", "true");
        localStorage.setItem("corhaus_saved_email", cleanEmail);
      } catch (_) {}

      window.location.href = data.redirectUrl;
    } catch (err: any) {
      setError(safeErrorMessage(err));
      setLoading(false);
    }
  }

  // ─── 3. PASSWORD SUBMISSION HANDLER ─────────────────────────────────────────
  async function handlePasswordLogin(e: React.FormEvent) {
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
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          phone: phone.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success || !data?.redirectUrl) {
        setError(data?.error || "Invalid password. Please try again.");
        setLoading(false);
        return;
      }

      try {
        localStorage.setItem("corhaus_has_logged_in", "true");
        localStorage.setItem("corhaus_saved_email", email.trim().toLowerCase());
      } catch (_) {}

      window.location.href = data.redirectUrl;
    } catch (err: any) {
      setError(safeErrorMessage(err));
      setLoading(false);
    }
  }

  // ─── 4. FIRST-TIME PASSWORD SETUP HANDLER ──────────────────────────────────
  async function handlePasswordSetup(e: React.FormEvent) {
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
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          phone: phone.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success || !data?.redirectUrl) {
        setError(data?.error || "Failed to set password. Please try again.");
        setLoading(false);
        return;
      }

      try {
        localStorage.setItem("corhaus_has_logged_in", "true");
        localStorage.setItem("corhaus_saved_email", email.trim().toLowerCase());
      } catch (_) {}

      window.location.href = data.redirectUrl;
    } catch (err: any) {
      setError(safeErrorMessage(err));
      setLoading(false);
    }
  }

  // ─── 5. FORGOT PASSWORD HANDLERS ───────────────────────────────────────────
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
    <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4 py-6">
      <div className="w-full max-w-md mx-auto animate-fade-in max-w-[95vw] sm:max-w-md">
        <div className="text-center mb-6 sm:mb-10 flex flex-col items-center justify-center">
          <Logo href="/" variant="auto" size="lg" className="items-center text-center" />
        </div>

        <div className="bg-surface rounded-2xl shadow-lg shadow-rail/5 p-4 sm:p-8 border border-line w-full">
          <h2 className="text-xl font-medium text-fg mb-2">
            {step === "email"
              ? mode === "initial"
                ? "Sign In"
                : "Welcome Back"
              : step === "password"
              ? "Enter Your Password"
              : step === "setup_password"
              ? "Set Your Password"
              : step === "forgot_password_request"
              ? "Forgot Password"
              : "Enter Verification Code"}
          </h2>
          <p className="text-xs text-fg-4 mb-6">
            {step === "email"
              ? mode === "initial"
                ? "Enter your phone number and email ID to verify your account."
                : "Sign in with your email ID and password."
              : step === "password"
              ? "Enter your password to access your dashboard."
              : step === "setup_password"
              ? "Please establish a password for your account."
              : step === "forgot_password_request"
              ? "Request a verification code to reset your password."
              : "Enter the 5-digit code provided to continue."}
          </p>

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

          {/* ─── STEP: EMAIL (Initial vs Subsequent Mode) ────────────────────────── */}
          {step === "email" && mode === "initial" && (
            <form onSubmit={handleInitialSignIn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg/70 mb-1.5">
                  Phone Number <span className="text-accent">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, ""))}
                  required
                  autoFocus
                  autoComplete="tel"
                  className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 transition-all focus:outline-none focus:border-accent"
                  placeholder="Enter 10-digit phone number"
                />
                <p className="text-[11px] text-fg-5 mt-1">
                  We verify your membership or staff profile by this number.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg/70 mb-1.5">
                  Email ID <span className="text-accent">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 transition-all focus:outline-none focus:border-accent"
                  placeholder="you@example.com"
                />
                <p className="text-[11px] text-fg-5 mt-1">
                  This email will be registered to your profile for future logins.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-rail text-white font-medium hover:bg-rail/90 transition-colors disabled:opacity-50 [touch-action:manipulation]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Checking details...
                  </span>
                ) : (
                  "Continue"
                )}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode("subsequent");
                    setError(null);
                    setInfoMsg(null);
                  }}
                  className="text-xs text-accent hover:text-accent-dark font-medium transition-colors"
                >
                  Already set your password? Sign in with Email &amp; Password &rarr;
                </button>
              </div>
            </form>
          )}

          {step === "email" && mode === "subsequent" && (
            <form onSubmit={handleSubsequentLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg/70 mb-1.5">
                  Email ID <span className="text-accent">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  className="w-full px-4 py-3 rounded-xl border border-line bg-surface-2/50 text-fg placeholder:text-fg-5 transition-all focus:outline-none focus:border-accent"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg/70 mb-1.5">
                  Password <span className="text-accent">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
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
                  onClick={() => {
                    setMode("initial");
                    setPassword("");
                    setError(null);
                    setInfoMsg(null);
                  }}
                  className="text-xs text-fg-4 hover:text-fg font-medium"
                >
                  Sign in with Phone &rarr;
                </button>
              </div>
            </form>
          )}

          {/* ─── STEP: PASSWORD (After Phone/Email Verification) ────────────────── */}
          {step === "password" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
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
                  onClick={() => {
                    setStep("email");
                    setPassword("");
                    setError(null);
                    setInfoMsg(null);
                  }}
                  className="text-xs text-fg-4 hover:text-fg font-medium"
                >
                  &larr; Back
                </button>
              </div>
            </form>
          )}

          {/* ─── STEP: SETUP PASSWORD (First-Time Login) ───────────────────────── */}
          {step === "setup_password" && (
            <form onSubmit={handlePasswordSetup} className="space-y-4">
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
                <label className="block text-sm font-medium text-fg/70 mb-1.5">New Password</label>
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
                  placeholder="Confirm your password"
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
                  "Set Password & Enter Portal"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setPassword("");
                  setConfirmPassword("");
                  setError(null);
                  setInfoMsg(null);
                }}
                className="w-full text-xs text-center text-fg-4 hover:text-fg font-medium pt-1"
              >
                &larr; Back
              </button>
            </form>
          )}

          {/* ─── STEP: FORGOT PASSWORD REQUEST ──────────────────────────────────── */}
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
                onClick={() => {
                  setStep("email");
                  setError(null);
                  setInfoMsg(null);
                }}
                className="w-full text-xs text-center text-fg-4 hover:text-fg font-medium pt-1 block"
              >
                &larr; Back to sign-in
              </button>
            </form>
          )}

          {/* ─── STEP: FORGOT PASSWORD VERIFY ───────────────────────────────────── */}
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
                onClick={() => {
                  setStep("forgot_password_request");
                  setError(null);
                  setInfoMsg(null);
                }}
                className="w-full text-xs text-center text-fg-4 hover:text-fg font-medium pt-1 block"
              >
                &larr; Request a new code
              </button>
            </form>
          )}

          {/* ─── ALTERNATIVE SIGN-IN (GOOGLE & SIGNUP LINK) ────────────────────── */}
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
