"use client";

import Image from "next/image";
import Link from "next/link";

type AppLogoProps = {
  href: string;
  name: string;
  tagline: string;
  theme?: "light" | "dark";
  compact?: boolean;
  mark?: "icon" | "full";
  showTagline?: boolean;
  fullWidthClass?: string;
};

export function AppLogo({
  href,
  name,
  tagline,
  theme = "dark",
  compact = false,
  mark = "icon",
  showTagline = true,
  fullWidthClass,
}: AppLogoProps) {
  const nameClasses = theme === "dark" ? "text-white" : "text-neutral-950";
  const tagClasses = theme === "dark" ? "text-zinc-300" : "text-neutral-900";
  const fullLogoSrc =
    theme === "dark" ? "/branding/logo-aplismart-dark-full.png" : "/branding/logo-aplismart-full.png";

  return (
    <Link
      href={href}
      onClick={() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      className="inline-flex items-center gap-3 rounded-lg transition hover:opacity-95"
    >
      {mark === "full" ? (
        <span className="inline-flex min-w-0 flex-col">
          <Image
            src={fullLogoSrc}
            alt={name}
            width={680}
            height={140}
            priority={false}
            className={`h-auto object-contain ${fullWidthClass ?? (compact ? "w-[182px]" : "w-[220px]")}`}
          />
          {showTagline && !compact ? (
            <span className={`mt-1 block text-[11px] ${tagClasses}`}>{tagline}</span>
          ) : null}
        </span>
      ) : (
        <>
          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg ring-1 ring-white/10">
            <Image
              src="/branding/favicon-aplismart.png"
              alt={name}
              width={44}
              height={44}
              className="h-11 w-11 object-cover"
            />
          </span>
          <span className="min-w-0">
            <span className={`block text-sm font-bold ${nameClasses}`}>{name}</span>
            {showTagline && !compact ? <span className={`block text-xs ${tagClasses}`}>{tagline}</span> : null}
          </span>
        </>
      )}
    </Link>
  );
}
