import { getCurrentWindow } from "@tauri-apps/api/window";
import { useT } from "../i18n";
import type { Appearance } from "../theme";
import { applyCloseWindowAction, useCloseWindowChoice, useWindowCloseHandler } from "../hooks/useCloseWindowChoice";

interface TitleBarProps {
  appearance: Appearance;
  lang: string;
  onToggleAppearance: () => void;
  onOpenSettings: () => void;
  onOpenSites: () => void;
  onSetLang: (lang: "zh" | "en") => void;
}

function startWindowDrag(e: React.MouseEvent) {
  if (e.button !== 0) return;
  void getCurrentWindow().startDragging();
}

function TitlebarDragZone({ className = "" }: { className?: string }) {
  return (
    <div
      className={`titlebar-drag flex-1 min-w-8 ${className}`}
      data-tauri-drag-region
      onMouseDown={startWindowDrag}
    />
  );
}

function TrafficLights({ onClose }: { onClose: () => void }) {
  const win = getCurrentWindow();

  return (
    <div className="titlebar-no-drag flex items-center gap-2 shrink-0 pl-3">
      <button
        type="button"
        onClick={onClose}
        className="titlebar-traffic titlebar-traffic-close group"
        aria-label="Close"
      >
        <span className="titlebar-traffic-icon" aria-hidden>&#x2715;</span>
      </button>
      <button
        type="button"
        onClick={() => { void win.minimize(); }}
        className="titlebar-traffic titlebar-traffic-minimize group"
        aria-label="Minimize"
      >
        <span className="titlebar-traffic-icon" aria-hidden>&#x2212;</span>
      </button>
      <button
        type="button"
        onClick={() => { void win.toggleMaximize(); }}
        className="titlebar-traffic titlebar-traffic-maximize group"
        aria-label="Maximize"
      >
        <span className="titlebar-traffic-icon titlebar-traffic-icon-max" aria-hidden>&#x25FB;</span>
      </button>
    </div>
  );
}

export default function TitleBar({
  appearance,
  lang,
  onToggleAppearance,
  onOpenSettings,
  onOpenSites,
  onSetLang,
}: TitleBarProps) {
  const t = useT();
  const promptClose = useCloseWindowChoice();
  useWindowCloseHandler(promptClose);

  const handleClose = () => {
    void promptClose().then(applyCloseWindowAction);
  };

  const handleTitlebarMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, .titlebar-no-drag")) return;
    void getCurrentWindow().startDragging();
  };

  return (
    <header
      className="titlebar shrink-0"
      data-tauri-drag-region
      onMouseDown={handleTitlebarMouseDown}
    >
      <TrafficLights onClose={handleClose} />

      <TitlebarDragZone />

      <span
        className="titlebar-title text-[13px] font-semibold tracking-tight text-fg/90 px-1"
        data-tauri-drag-region
        onMouseDown={startWindowDrag}
      >
        {t("app.title")}
      </span>

      <nav className="titlebar-no-drag titlebar-segment shrink-0">
        <button type="button" className="titlebar-segment-btn titlebar-segment-btn-active">
          {t("app.files")}
        </button>
        <button type="button" className="titlebar-segment-btn" onClick={onOpenSites}>
          {t("app.sites")}
        </button>
      </nav>

      <TitlebarDragZone />

      <div className="titlebar-no-drag flex items-center gap-1 pr-3 shrink-0">
        <button
          type="button"
          onClick={onToggleAppearance}
          className="titlebar-tool-btn"
          title={appearance === "light" ? t("theme.switchToDark") : t("theme.switchToLight")}
          aria-label={appearance === "light" ? t("theme.switchToDark") : t("theme.switchToLight")}
        >
          {appearance === "light" ? (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="titlebar-tool-btn"
          title={t("settings.title")}
          aria-label={t("settings.title")}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <div className="titlebar-segment ml-0.5">
          <button
            type="button"
            onClick={() => onSetLang("zh")}
            className={`titlebar-segment-btn titlebar-segment-btn-sm ${lang === "zh" ? "titlebar-segment-btn-active" : ""}`}
          >
            {"\u4E2D"}
          </button>
          <button
            type="button"
            onClick={() => onSetLang("en")}
            className={`titlebar-segment-btn titlebar-segment-btn-sm ${lang === "en" ? "titlebar-segment-btn-active" : ""}`}
          >
            EN
          </button>
        </div>
      </div>
    </header>
  );
}
