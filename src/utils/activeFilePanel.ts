import type { FilePanelType } from "../components/FilePanel";

/** 最近一次交互的文件面板（用于 Ctrl+A 等快捷键） */
export const activeFilePanelRef: { current: FilePanelType } = { current: "local" };

export function setActiveFilePanel(type: FilePanelType) {
  activeFilePanelRef.current = type;
}
