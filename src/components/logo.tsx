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
  // banner = rectangle that fills header (e.g. sidebar top), height ~40, width auto, object-contain
  const isBanner = size === "banner";
  const imgSize = isBanner ? 40 : size === "lg" ? 44 : size === "sm" ? 32 : 38;

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
          className={`flex flex-col items-center justify-center text-center leading-none select-none w-full ${className}`}
          style={{
            height: 40,
            background: "#F6EFE6",
            borderRadius: "10px",
            border: "1px solid rgba(107, 68, 42, 0.08)",
          }}
        >
          <span
            className="font-normal tracking-tight"
            style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
              fontSize: "14px",
              color: "#6B3A26",
              lineHeight: 1,
            }}
          >
            Corhaus
          </span>
          <span
            className="tracking-[0.14em] lowercase"
            style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
              fontSize: "6px",
              color: "#8B6A4F",
              marginTop: "1px",
            }}
          >
            pilates for everyone
          </span>
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
        className={`flex flex-col items-center justify-center text-center leading-none select-none shrink-0 ${className}`}
        style={{
          width: imgSize,
          height: imgSize,
          background: "#F6EFE6",
          borderRadius: "10px",
          border: "1px solid rgba(107, 68, 42, 0.08)",
        }}
      >
        <span
          className="font-normal tracking-tight"
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
            fontSize: size === "lg" ? "13px" : size === "sm" ? "10px" : "11.5px",
            color: "#6B3A26",
            lineHeight: 1,
          }}
        >
          Corhaus
        </span>
        <span
          className="tracking-[0.14em] lowercase"
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
            fontSize: size === "lg" ? "5.5px" : size === "sm" ? "4px" : "4.8px",
            color: "#8B6A4F",
            marginTop: "1px",
          }}
        >
          pilates for everyone
        </span>
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
