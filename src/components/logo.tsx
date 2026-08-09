import Link from "next/link";

interface LogoProps {
  href?: string;
  variant?: "white" | "dark" | "auto";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function Logo({
  href,
  variant = "white",
  size = "md",
  className = "",
}: LogoProps) {
  const titleSizeClass =
    size === "lg" ? "text-3xl" : size === "sm" ? "text-xl" : "text-2xl";
  const taglineSizeClass =
    size === "lg" ? "text-[11px]" : size === "sm" ? "text-[9px]" : "text-[10px]";

  const mainTextColor =
    variant === "white"
      ? "text-white"
      : variant === "dark"
      ? "text-fg"
      : "text-fg dark:text-white";

  const tagtextColor =
    variant === "white"
      ? "text-white/85"
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
