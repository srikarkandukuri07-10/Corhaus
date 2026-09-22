// Fail-fast environment validation.
// Import this module at the top of server entry points (API routes, proxy,
// server components) so misconfiguration crashes on boot with a clear
// message instead of cryptic `undefined` runtime errors.
//
// Intentionally dependency-free (no zod) to avoid extra attack surface.

const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const OPTIONAL_GROUPS: Array<{ vars: string[]; label: string }> = [
  {
    vars: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
    label: "Razorpay (trial payments)",
  },
];

function isMissing(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((k) => isMissing(process.env[k]));
  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Refusing to boot with insecure defaults.`
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!/^https:\/\/.+\.supabase\.co$/.test(url.trim()) && !url.includes("localhost")) {
    throw new Error(
      `[env] NEXT_PUBLIC_SUPABASE_URL looks invalid: "${url}". Expected https://<project>.supabase.co`
    );
  }

  for (const group of OPTIONAL_GROUPS) {
    const absent = group.vars.filter((k) => isMissing(process.env[k]));
    if (absent.length > 0 && absent.length < group.vars.length) {
      // Partial config is almost always a mistake (e.g. key id without secret).
      // Warn loudly in production; payment routes return 500 if fully absent.
      console.warn(
        `[env] Partial ${group.label} config. Missing: ${absent.join(", ")}. Payment routes will return 500 until completed.`
      );
    }
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (webhookSecret && webhookSecret.trim().length < 16) {
    console.warn(
      "[env] RAZORPAY_WEBHOOK_SECRET is shorter than 16 chars. Rotate to `openssl rand -hex 32` and update the Razorpay dashboard."
    );
  }
}

// Validate eagerly on the server only. Client bundles skip this so
// NEXT_PUBLIC_ vars can be inlined by Next.js without throwing.
if (typeof window === "undefined") {
  validateEnv();
}
