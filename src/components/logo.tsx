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

  // Fallback: cream square with brown text — matches the 2nd photo (Corhaus pilates for everyone)
  // Somewhat rounded (10px), not too rounded (not full, not 3xl)
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
