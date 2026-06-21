import type { ReactNode } from "react";

export type CoachIconName =
  | "panel"
  | "panelOpen"
  | "play"
  | "pause"
  | "stop"
  | "restart"
  | "copy"
  | "check"
  | "mic"
  | "send"
  | "thumbsUp"
  | "thumbsDown"
  | "flag";

export function CoachIcon({ name }: { name: CoachIconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
  };

  const paths: Record<CoachIconName, ReactNode> = {
    panel: <><rect x="3" y="4" width="18" height="16" rx="2" {...common} /><path d="M9 4v16M5.5 9h1M5.5 12h1M5.5 15h1" {...common} /></>,
    panelOpen: <><rect x="3" y="4" width="18" height="16" rx="2" {...common} /><path d="M15 4v16M8 9l-3 3 3 3" {...common} /></>,
    play: <path d="M8 5v14l11-7z" fill="currentColor" />,
    pause: <><path d="M8 5v14" {...common} /><path d="M16 5v14" {...common} /></>,
    stop: <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" />,
    restart: <><path d="M4 12a8 8 0 1 0 2.34-5.66" {...common} /><path d="M4 4v6h6" {...common} /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" {...common} /><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" {...common} /></>,
    check: <path d="M20 6 9 17l-5-5" {...common} />,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" {...common} /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" {...common} /></>,
    send: <><path d="M12 19V5" {...common} /><path d="m5 12 7-7 7 7" {...common} /></>,
    thumbsUp: <><path d="M7 10v10" {...common} /><path d="M11 10V5a3 3 0 0 1 3 3v2h4.2a2 2 0 0 1 1.95 2.45l-1.15 5A2 2 0 0 1 17.05 19H7" {...common} /><path d="M3 10h4v10H3z" {...common} /></>,
    thumbsDown: <><path d="M7 14V4" {...common} /><path d="M11 14v5a3 3 0 0 0 3-3v-2h4.2a2 2 0 0 0 1.95-2.45l-1.15-5A2 2 0 0 0 17.05 5H7" {...common} /><path d="M3 4h4v10H3z" {...common} /></>,
    flag: <><path d="M6 21V5" {...common} /><path d="M6 5h10l-1.2 4L16 13H6" {...common} /></>,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true" className="coach-svg-icon">{paths[name]}</svg>;
}
