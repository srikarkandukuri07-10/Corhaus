import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE } from "@/lib/siteConfig";

/**
 * Shared layout for the four public legal pages: /terms, /privacy,
 * /refund-policy and /contact.
 *
 * This is a route group, so the group name does not appear in the URL.
 *
 * These pages are public by default: src/lib/supabase/proxy.ts uses a
 * deny-list (`/admin`, `/member`, `/developer`, `/api/*`), so no proxy change
 * is required for anonymous access.
 *
 * Deliberately no `noindex`. These pages are meant to be indexed.
 */
export const metadata: Metadata = {
  title: {
    default: `${SITE.brandName} — Legal & Support`,
    template: `%s | ${SITE.brandName}`,
  },
  description: `Terms & Conditions, Privacy Policy, Refund & Cancellation Policy and contact details for ${SITE.brandName}.`,
  robots: {
    index: true,
    follow: true,
  },
};

export default function LegalLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}