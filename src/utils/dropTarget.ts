import type { PhysicalPosition } from "@tauri-apps/api/dpi";

/** Tauri 拖放坐标相对窗口（含标题栏），需换算为与 getBoundingClientRect 一致的视口坐标 */
export function physicalDropToViewport(
  pos: PhysicalPosition,
  scaleFactor: number,
): { x: number; y: number } {
  let x = pos.x / scaleFactor;
  let y = pos.y / scaleFactor;
  const chromeH = window.outerHeight - window.innerHeight;
  if (chromeH > 0 && chromeH < 120) {
    y += chromeH;
  }
  return { x, y };
}

export function resolveDropPanel(x: number, y: number): "local" | "remote" | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const panel = el.closest("[data-panel]");
  const type = panel?.getAttribute("data-panel");
  if (type === "local" || type === "remote") return type;
  return null;
}
