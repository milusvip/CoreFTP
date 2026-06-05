import { create } from "zustand";
import { isArchiveFileName } from "../utils/archives";

/** 与 CSS 动画时长一致：3 次呼吸 × ~1.05s */
export const UPLOAD_HIGHLIGHT_MS = 3200;

interface UploadHighlightStore {
  /** path → 标记序号（越大越靠前） */
  remoteHighlights: Record<string, number>;
  markRemote: (path: string) => void;
  clearRemote: (path: string) => void;
}

let highlightSeq = 0;

export const useUploadHighlightStore = create<UploadHighlightStore>((set, get) => ({
  remoteHighlights: {},

  markRemote: (path) => {
    const normalized = path.replace(/\\/g, "/");
    highlightSeq += 1;
    const order = highlightSeq;
    set((s) => ({
      remoteHighlights: { ...s.remoteHighlights, [normalized]: order },
    }));
    window.setTimeout(() => {
      get().clearRemote(normalized);
    }, UPLOAD_HIGHLIGHT_MS);
  },

  clearRemote: (path) => {
    const normalized = path.replace(/\\/g, "/");
    set((s) => {
      if (!(normalized in s.remoteHighlights)) return s;
      const next = { ...s.remoteHighlights };
      delete next[normalized];
      return { remoteHighlights: next };
    });
  },
}));

export function markRemoteArchiveUpload(remotePath: string, fileName: string): void {
  if (!isArchiveFileName(fileName)) return;
  useUploadHighlightStore.getState().markRemote(remotePath);
}
