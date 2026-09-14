import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

interface LogoProps {
  href?: string;
  variant?: "white" | "dark" | "auto" | "gold";
  size?: "sm" | "md" | "lg";
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
  const imgSize = size === "lg" ? 44 : size === "sm" ? 32 : 38;

  if (logoUrl) {
    const imageEl = (
      <Image
        src={logoUrl}
        alt="Corhaus logo"
        width={imgSize}
        height={imgSize}
        className="object-cover rounded-xl shrink-0"
        style={{ width: imgSize, height: imgSize, borderRadius: "10px" }}
        unoptimized
        priority={false}
      />
    );
    if (href) {
      return (
        <Link href={href} className={`inline-flex items-center hover:opacity-90 transition-opacity ${className}`}>
          {imageEl}
        </Link>
      );
    }
    return <span className={`inline-flex items-center ${className}`}>{imageEl}</span>;
  }

  const titleSizeClass =
    size === "lg" ? "text-3xl" : size === "sm" ? "text-xl" : "text-2xl";
  const taglineSizeClass =
    size === "lg" ? "text-[11px]" : size === "sm" ? "text-[9px]" : "text-[10px]";

  const mainTextColor =
    variant === "white"
      ? "text-white"
      : variant === "gold"
      ? "text-amber-400"
      : variant === "dark"
      ? "text-fg"
      : "text-fg dark:text-white";

  const tagtextColor =
    variant === "white"
      ? "text-white/85"
      : variant === "gold"
      ? "text-amber-300/90"
      : variant === "dark"
      ? "text-fg-3"
      : "text-fg-3 dark:text-white/85";

  const content = (
    <div className={`inline-flex flex-col text-left leading-none select-none ${className}`}>
      <div className={`flex items-baseline ${mainTextColor}`}>
        <span
          className={`${titleSizeClass} font-normal tracking-tight`}
          style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif" }}
        >
          Cor
        </span>
        <span
          className={`${titleSizeClass} font-extralight tracking-tight`}
          style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", fontWeight: 300 }}
        >
          haus
        </span>
      </div>
      <p
        className={`${taglineSizeClass} tracking-[0.14em] font-serif lowercase mt-0.5 ${tagtextColor}`}
        style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif" }}
      >
        Pilates for everyone
      </p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
