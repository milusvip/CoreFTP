import { useState } from "react";
import { useT } from "../i18n";
import {
  APPEARANCES,
  THEME_IDS,
  THEME_PREVIEW,
  type Appearance,
  type ThemeId,
} from "../theme";

interface ThemeSectionProps {
  appearance: Appearance;
  theme: ThemeId;
  onAppearanceChange: (a: Appearance) => void;
  onThemeChange: (t: ThemeId) => void;
  onThemePreview?: (theme: ThemeId | null) => void;
  compact?: boolean;
}

export default function ThemeSection({
  appearance,
  theme,
  onAppearanceChange,
  onThemeChange,
  onThemePreview,
  compact = false,
}: ThemeSectionProps) {
  const t = useT();
  const [hovered, setHovered] = useState<ThemeId | null>(null);
  const displayTheme = hovered ?? theme;

  const handleSwatchEnter = (id: ThemeId) => {
    setHovered(id);
    onThemePreview?.(id);
  };

  const handleSwatchLeave = () => {
    setHovered(null);
    onThemePreview?.(null);
  };

  return (
    <div
      className={`border-b border-surface-light/60 space-y-2.5 ${
        compact ? "pb-2" : "pb-3"
      }`}
    >
      <div>
        <label className={`block text-xs text-fg-muted ${compact ? "mb-1" : "mb-1.5"}`}>
          {t("settings.appearance")}
        </label>
        <div className="flex gap-2">
          {APPEARANCES.map((a) => (
            <button
              key={a}
              type="button"
              className={`appearance-btn ${appearance === a ? "appearance-btn-active" : "appearance-btn-idle"}`}
              onClick={() => onAppearanceChange(a)}
            >
              {t(`settings.appearance.${a}`)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={`block text-xs text-fg-muted ${compact ? "mb-1" : "mb-1.5"}`}>
          {t("settings.colorTheme")}
        </label>
        <div
          className="flex items-center gap-1.5 flex-wrap"
          onMouseLeave={handleSwatchLeave}
        >
          {THEME_IDS.map((id) => {
            const isSelected = theme === id;
            const isHovered = hovered === id;
            return (
              <button
                key={id}
                type="button"
                title={t(`settings.theme.${id}`)}
                className={`theme-swatch ${
                  isHovered
                    ? "theme-swatch-hover"
                    : isSelected && !hovered
                      ? "theme-swatch-active"
                      : ""
                }`}
                style={{ backgroundColor: THEME_PREVIEW[id] }}
                onMouseEnter={() => handleSwatchEnter(id)}
                onClick={() => onThemeChange(id)}
                aria-label={t(`settings.theme.${id}`)}
                aria-pressed={isSelected}
              />
            );
          })}
          <span className="text-[11px] text-fg-faint ml-0.5">
            {t(`settings.theme.${displayTheme}`)}
            {hovered && hovered !== theme && (
              <span className="text-fg-subtle"> · {t("settings.themePreview")}</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
