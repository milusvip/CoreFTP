export type Appearance = "dark" | "light" | "system";
export type ThemeId =
  | "default"
  | "ocean"
  | "forest"
  | "sunset"
  | "rose"
  | "mono"
  | "lavender"
  | "midnight"
  | "amber"
  | "cherry"
  | "slate"
  | "mint"
  | "indigo"
  | "coral"
  | "sand"
  | "grape"
  | "cyber"
  | "azure";

export const THEME_IDS: ThemeId[] = [
  "default",
  "ocean",
  "forest",
  "sunset",
  "rose",
  "mono",
  "lavender",
  "midnight",
  "amber",
  "cherry",
  "slate",
  "mint",
  "indigo",
  "coral",
  "sand",
  "grape",
  "cyber",
  "azure",
];

export const APPEARANCES: Appearance[] = ["dark", "light", "system"];

/** Preview swatch (accent) for settings grid */
export const THEME_PREVIEW: Record<ThemeId, string> = {
  default: "#6c8cff",
  ocean: "#2dd4bf",
  forest: "#4ade80",
  sunset: "#fb923c",
  rose: "#f472b6",
  mono: "#9ca3af",
  lavender: "#a78bfa",
  midnight: "#88c0d0",
  amber: "#fbbf24",
  cherry: "#f87171",
  slate: "#94a3b8",
  mint: "#5eead4",
  indigo: "#818cf8",
  coral: "#fb7185",
  sand: "#d4a574",
  grape: "#c084fc",
  cyber: "#39ff14",
  azure: "#38bdf8",
};

const CACHE_KEY = "coreftp-theme";

export interface ThemeSettings {
  appearance: Appearance;
  theme: ThemeId;
}

function resolveAppearance(appearance: Appearance): "dark" | "light" {
  if (appearance === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return appearance;
}

export function applyTheme(appearance: Appearance, theme: ThemeId): void {
  const root = document.documentElement;
  const resolved = resolveAppearance(appearance);
  root.dataset.appearance = resolved;
  root.dataset.theme = theme;
  root.dataset.appearancePref = appearance;
  root.style.colorScheme = resolved;
}

export function cacheTheme(settings: ThemeSettings): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function readCachedTheme(): ThemeSettings | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ThemeSettings;
    if (!THEME_IDS.includes(parsed.theme)) return null;
    if (!APPEARANCES.includes(parsed.appearance)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function applyCachedTheme(): void {
  const cached = readCachedTheme();
  if (cached) applyTheme(cached.appearance, cached.theme);
}

let systemListener: (() => void) | null = null;

export function watchSystemAppearance(
  appearance: Appearance,
  theme: ThemeId,
  onChange: () => void,
): () => void {
  if (systemListener) {
    systemListener();
    systemListener = null;
  }
  if (appearance !== "system") return () => {};

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    applyTheme("system", theme);
    onChange();
  };
  mq.addEventListener("change", handler);
  systemListener = () => mq.removeEventListener("change", handler);
  return systemListener;
}

export function normalizeThemeId(value: string | undefined): ThemeId {
  if (value && THEME_IDS.includes(value as ThemeId)) return value as ThemeId;
  return "default";
}

export function normalizeAppearance(value: string | undefined): Appearance {
  if (value && APPEARANCES.includes(value as Appearance)) return value as Appearance;
  return "dark";
}
