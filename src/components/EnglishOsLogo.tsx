import { useId } from "react";

type EnglishOsLogoProps = {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
};

export function EnglishOsLogo({ className = "", markClassName = "", textClassName = "", showText = true, size = "md" }: EnglishOsLogoProps) {
  const id = useId().replace(/:/g, "");
  const mainGradientId = `english-os-logo-gradient-${id}`;
  const lightGradientId = `english-os-logo-light-${id}`;
  const markSize = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const textSize = size === "lg" ? "text-xl" : size === "sm" ? "text-sm" : "text-base";

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="English OS">
      <svg className={`${markSize} shrink-0 ${markClassName}`} viewBox="0 0 64 64" role="img" aria-hidden={showText ? "true" : undefined}>
        <defs>
          <linearGradient id={mainGradientId} x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#6F8F76" />
            <stop offset="0.55" stopColor="#506A58" />
            <stop offset="1" stopColor="#273C32" />
          </linearGradient>
          <linearGradient id={lightGradientId} x1="22" y1="18" x2="46" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#F8FFF8" />
            <stop offset="1" stopColor="#DDEBDD" />
          </linearGradient>
        </defs>
        <path
          d="M32 7c14.1 0 24.5 9 24.5 21.3S46.1 49.7 32 49.7c-2.2 0-4.3-.2-6.3-.7l-10.2 6.1c-1.8 1.1-4-.7-3.2-2.7l3.4-8.5C10.5 40 7.5 34.5 7.5 28.3 7.5 16 17.9 7 32 7Z"
          fill={`url(#${mainGradientId})`}
        />
        <path d="M21.8 33.5c2.3 3.1 5.9 5 10.2 5s7.9-1.9 10.2-5" fill="none" stroke="#F8FFF8" strokeLinecap="round" strokeWidth="3.2" />
        <path d="M21.6 26.7h.1M29.4 23.4c1.8-1.9 4.9-1.9 6.7 0M42.3 26.7h.1" fill="none" stroke="#F8FFF8" strokeLinecap="round" strokeWidth="4.2" />
        <circle cx="45.5" cy="18.5" r="5.2" fill={`url(#${lightGradientId})`} />
        <path d="M45.5 15.7v5.6M42.7 18.5h5.6" stroke="#506A58" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M18 21.5c2.2-2.5 5.1-4.2 8.4-5" fill="none" stroke="#CFE0CF" strokeLinecap="round" strokeWidth="2" opacity="0.75" />
      </svg>
      {showText && (
        <span className={`leading-none ${textClassName}`}>
          <span className={`block font-black tracking-[-0.03em] ${textSize}`}>English OS</span>
          {size === "lg" && <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.18em] opacity-60">AI Speaking Coach</span>}
        </span>
      )}
    </span>
  );
}
