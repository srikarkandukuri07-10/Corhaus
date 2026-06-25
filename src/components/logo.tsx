import Link from "next/link";

export default function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const textSize =
    size === "lg" ? "text-3xl" : size === "md" ? "text-2xl" : "text-xl";
  const subtextSize =
    size === "lg" ? "text-xs" : size === "md" ? "text-[11px]" : "text-[10px]";

  return (
    <Link href="/" className="inline-block">
      <span
        className={`${textSize} font-light tracking-tight text-brand-navy`}
      >
        Cor<span className="text-brand-brown font-medium">haus</span>
      </span>
      <p
        className={`${subtextSize} text-brand-brown-light tracking-[0.2em] uppercase -mt-1`}
      >
        Pilates for everyone
      </p>
    </Link>
  );
}
