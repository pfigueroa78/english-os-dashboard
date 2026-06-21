"use client";

import { type ReactNode } from "react";
import { EnglishOsLogo } from "@/components/EnglishOsLogo";
import type { CoachTopBarModel } from "@/modules/coach-session/viewModels";

type CoachTheme = "slate" | "paper" | "sage" | "sand" | "blue";
type CoachTextSize = "compact" | "normal" | "large";

type CoachTopBarProps = {
  model: CoachTopBarModel;
  sidebarOpen: boolean;
  theme: CoachTheme;
  textSize: CoachTextSize;
  panelIcon: ReactNode;
  userMenu?: ReactNode;
  onToggleSidebar: () => void;
  onThemeChange: (theme: CoachTheme) => void;
  onDecreaseText: () => void;
  onIncreaseText: () => void;
};

export function CoachTopBar({
  model,
  sidebarOpen,
  theme,
  textSize,
  panelIcon,
  userMenu,
  onToggleSidebar,
  onThemeChange,
  onDecreaseText,
  onIncreaseText,
}: CoachTopBarProps) {
  return (
    <div className="coach-toolbar mb-2 flex min-h-10 items-center gap-2 rounded-xl border px-2 py-1.5">
      <button
        type="button"
        className="coach-icon-button coach-panel-toggle"
        onClick={onToggleSidebar}
        aria-expanded={sidebarOpen}
        aria-controls="coach-sidebar"
        aria-label={sidebarOpen ? "Ocultar panel" : "Mostrar panel"}
        title={sidebarOpen ? "Ocultar panel" : "Mostrar panel"}
      >
        {panelIcon}
      </button>
      <div className="coach-font-controls" aria-label="Tamaño de texto">
        <button
          type="button"
          className="coach-font-button"
          onClick={onDecreaseText}
          disabled={textSize === "compact"}
          aria-label="Disminuir tamaño de texto"
          title="Texto más pequeño"
        >
          A−
        </button>
        <button
          type="button"
          className="coach-font-button"
          onClick={onIncreaseText}
          disabled={textSize === "large"}
          aria-label="Aumentar tamaño de texto"
          title="Texto más grande"
        >
          A+
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs font-medium">
        <span className="hidden sm:inline">Tema</span>
        <select
          value={theme}
          onChange={(event) => onThemeChange(event.target.value as CoachTheme)}
          className="coach-theme-select rounded-lg border px-2 py-1.5"
        >
          <option value="paper">Papel</option>
          <option value="sage">Salvia</option>
          <option value="sand">Arena</option>
          <option value="blue">Azul</option>
          <option value="slate">Pizarra</option>
        </select>
      </label>
      <span className="coach-status ml-auto truncate">
        <EnglishOsLogo size="sm" showText={false} markClassName="coach-status-logo" />
        <span className="coach-status-brand">English OS</span>
        <span className="coach-status-separator">—</span>
        <span className="coach-status-mode">{model.modeLabel}</span>
        <span className="coach-status-separator">—</span>
        <span className="coach-status-location">{model.locationLabel}</span>
        <span className="coach-status-separator">—</span>
        <span className="coach-status-pulse">{model.progressLabel}</span>
        <span className="coach-status-detail">{model.detailLabel}</span>
      </span>
      {userMenu}
    </div>
  );
}
