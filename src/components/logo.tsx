import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

interface LogoProps {
  href?: string;
  variant?: "white" | "dark" | "auto" | "gold";
  size?: "sm" | "md" | "lg" | "banner";
  className?: string;
  /** Override logo url (e.g. from business profile). If omitted, auto-fetches from API. */
  logoUrl?: string | null;
}

export default function Logo({
  href,
  variant = "white",
  size = "md",
  className = "",
  logoUrl: logoUrlProp,
}: LogoProps) {
  const [fetchedLogoUrl, setFetchedLogoUrl] = useState<string | null>(null);

  // Auto-fetch business profile logo if not explicitly provided
  useEffect(() => {
    if (logoUrlProp !== undefined) return; // controlled via prop
    let cancelled = false;
    fetch("/api/admin/settings/business-profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.profile?.logo_url) setFetchedLogoUrl(j.profile.logo_url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [logoUrlProp]);

  const logoUrl = logoUrlProp !== undefined ? logoUrlProp : fetchedLogoUrl;

  // Square logo image — somewhat rounded, not too rounded
  // banner = rectangle that fills header, taller for clear text (increased per feedback)
  const isBanner = size === "banner";
  const imgSize = isBanner ? 52 : size === "lg" ? 44 : size === "sm" ? 32 : 38;

  if (logoUrl) {
    // Use object-contain so rectangular logos fully fit without stretching text
    if (isBanner) {
      const bannerEl = (
        <span
          className={`inline-flex items-center justify-center overflow-hidden ${className}`}
          style={{ width: "100%", height: imgSize, borderRadius: "10px", background: "transparent" }}
        >
          <Image
            src={logoUrl}
            alt="Corhaus logo"
            width={320}
            height={80}
            className="object-contain"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            unoptimized
            priority={false}
          />
        </span>
      );
      if (href) {
        return (
          <Link href={href} className="flex items-center w-full hover:opacity-90 transition-opacity">
            {bannerEl}
          </Link>
        );
      }
      return bannerEl;
    }
    const imageEl = (
      <span
        className="inline-flex items-center justify-center overflow-hidden shrink-0"
        style={{ width: imgSize, height: imgSize, borderRadius: "10px", background: "transparent" }}
      >
        <Image
          src={logoUrl}
          alt="Corhaus logo"
          width={imgSize}
          height={imgSize}
          className="object-contain"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          unoptimized
          priority={false}
        />
      </span>
    );
    if (href) {
      return (
        <Link href={href} className={`inline-flex items-center hover:opacity-90 transition-opacity ${className}`}>
          {imageEl}
        </Link>
      );
    }
    return imageEl;
  }

  // Fallback: for admin rail (variant white) show cream square/rectangle matching 2nd photo;
  // for other variants (auto/dark) keep original text logo to avoid breaking light pages
  const isWhiteVariant = variant === "white";
  if (isBanner) {
    if (isWhiteVariant) {
      const bannerFallback = (
        <div
          className={`flex items-center justify-center w-full overflow-hidden select-none ${className}`}
          style={{
            height: 56,
            minHeight: 56,
            background: "#EFE7DD",
            borderRadius: "12px",
            border: "1px solid rgba(107, 68, 42, 0.08)",
            padding: "6px 14px",
          }}
        >
          <img
            src="/corhaus-logo-banner.png"
            alt="Corhaus - Pilates for everyone"
            className="h-full w-auto object-contain"
            style={{ maxHeight: 44, width: "auto", objectFit: "contain" }}
          />
        </div>
      );
      if (href) {
        return (
          <Link href={href} className="flex items-center w-full hover:opacity-90 transition-opacity">
            {bannerFallback}
          </Link>
        );
      }
      return bannerFallback;
    }
    // non-white banner fallback: keep text
  }

  if (isWhiteVariant) {
    const fallbackCream = (
      <div
        className={`flex items-center justify-center overflow-hidden select-none shrink-0 ${className}`}
        style={{
          width: imgSize + 12,
          height: imgSize + 12,
          background: "#EFE7DD",
          borderRadius: "12px",
          border: "1px solid rgba(107, 68, 42, 0.08)",
          padding: "4px",
        }}
      >
        <img
          src="/corhaus-logo.png"
          alt="Corhaus"
          className="w-full h-full object-contain"
        />
      </div>
    );
    if (href) {
      return (
        <Link href={href} className="inline-flex items-center hover:opacity-90 transition-opacity">
          {fallbackCream}
        </Link>
      );
    }
    return fallbackCream;
  }

  // Non-white variants: original text logo (for login/member light pages)
  const titleSizeClass = size === "lg" ? "text-3xl" : size === "sm" ? "text-xl" : "text-2xl";
  const taglineSizeClass = size === "lg" ? "text-[11px]" : size === "sm" ? "text-[9px]" : "text-[10px]";
  const mainTextColor = variant === "gold" ? "text-amber-400" : variant === "dark" ? "text-fg" : "text-fg dark:text-white";
  const tagtextColor = variant === "gold" ? "text-amber-300/90" : variant === "dark" ? "text-fg-3" : "text-fg-3 dark:text-white/85";
  const textContent = (
    <div className={`inline-flex flex-col text-left leading-none select-none ${className}`}>
      <div className={`flex items-baseline ${mainTextColor}`}>
        <span className={`${titleSizeClass} font-normal tracking-tight`} style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif" }}>
          Cor
        </span>
        <span className={`${titleSizeClass} font-extralight tracking-tight`} style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", fontWeight: 300 }}>
          haus
        </span>
      </div>
      <p className={`${taglineSizeClass} tracking-[0.14em] font-serif lowercase mt-0.5 ${tagtextColor}`} style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif" }}>
        Pilates for everyone
      </p>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="inline-block hover:opacity-90 transition-opacity">
        {textContent}
      </Link>
    );
  }
  return textContent;
}
