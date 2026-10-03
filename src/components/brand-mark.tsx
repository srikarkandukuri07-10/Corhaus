"use client";

import Logo from "@/components/logo";

/**
 * Brand mark for server-rendered public pages.
 *
 * `src/components/logo.tsx` uses React state and effects but does not declare
 * `"use client"`, so a server component cannot import it directly. This thin
 * client wrapper bridges that without touching the shared Logo component.
 *
 * `logoUrl={null}` is deliberate: Logo otherwise fetches
 * `/api/admin/settings/business-profile`, which sits behind the `/api/admin`
 * proxy gate and would return 401 for an anonymous visitor — a wasted request
 * on every public page view.
 */
export default function BrandMark({
  href,
  size = "md",
  className = "",
}: {
  href?: string;
  size?: "sm" | "md" | "lg" | "banner";
  className?: string;
}) {
  return (
    <Logo
      href={href}
      logoUrl={null}
      variant="auto"
      size={size}
      className={className}
    />
  );
}