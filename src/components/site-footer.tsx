import Link from "next/link";
import { SITE } from "@/lib/siteConfig";

export const LEGAL_LINKS = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund & Cancellation Policy" },
  { href: "/contact", label: "Contact & Support" },
] as const;

/**
 * Shared public footer.
 *
 * No React hooks, so this stays a server component and can be rendered from
 * both server and client pages without turning them into client components.
 *
 * Token-based (bg-bar / border-line / text-fg-*) rather than hard-coded hex, so
 * it follows the site's light/dark theme. `border-t` sits flush under the page
 * content and the negative margin keeps it full-bleed.
 *
 * `tone="dark"` is for the pages that hard-code a near-black background
 * (/book-trial, /trial) where the light tokens would render as a jarring white
 * band. It matches that page's existing palette instead.
 */
export default function SiteFooter({
  className = "",
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";

  const shell = dark
    ? "border-white/10 bg-black text-white/70"
    : "border-line bg-bar text-fg-3";
  const divider = dark ? "border-white/10" : "border-line";
  const strong = dark ? "text-white" : "text-fg";
  const muted = dark ? "text-white/50" : "text-fg-4";
  const bodyMuted = dark ? "text-white/60" : "text-fg-3";
  const linkHover = dark ? "hover:text-white" : "hover:text-fg";

  return (
    <footer className={`mt-auto border-t ${shell} ${className}`}>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${strong}`}>{SITE.brandName}</p>
            <p className={`mt-1 text-xs ${muted}`}>{SITE.tagline}</p>
            {String(SITE.legalEntity.name) !== String(SITE.brandName) && (
              <p className="mt-2 text-[11px] leading-relaxed opacity-80">
                Operated by {SITE.legalEntity.name}
              </p>
            )}
          </div>

          <nav aria-label="Legal and support" className="min-w-0">
            <p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>
              Legal
            </p>
            <ul className="mt-2 space-y-1.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`text-xs underline-offset-2 transition-colors ${bodyMuted} ${linkHover} hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className={`mt-8 border-t ${divider} pt-5 text-[11px] ${muted}`}>
          © {new Date().getFullYear()} {SITE.brandName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}