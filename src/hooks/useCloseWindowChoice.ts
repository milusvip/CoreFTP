import { useCallback, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useDialogStore } from "../stores/dialogStore";
import { useT } from "../i18n";

export type CloseWindowAction = "minimize" | "quit" | null;

export function useCloseWindowChoice() {
  const t = useT();
  const showChoice = useDialogStore((s) => s.showChoice);

  return useCallback(async (): Promise<CloseWindowAction> => {
    const id = await showChoice({
      title: t("window.closeTitle"),
      message: t("window.closeMessage"),
      layout: "action-cards",
      choiceMeta: {
        minimize: { description: t("window.minimizeHint"), icon: "minimize" },
        quit: { description: t("window.quitHint"), icon: "quit" },
      },
      choices: [
        { id: "minimize", label: t("window.minimize"), primary: true },
        { id: "quit", label: t("window.quit"), danger: true },
      ],
    });
    if (id === "minimize" || id === "quit") return id;
    return null;
  }, [showChoice, t]);
}

/** 拦截系统关闭（Alt+F4 等），与标题栏红叉共用同一对话框 */
export function useWindowCloseHandler(promptClose: () => Promise<CloseWindowAction>) {
  useEffect(() => {
    const win = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void win.onCloseRequested(async (event) => {
      event.preventDefault();
      const action = await promptClose();
      if (disposed) return;
      if (action === "minimize") await win.minimize();
      else if (action === "quit") await win.destroy();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [promptClose]);
}

export async function applyCloseWindowAction(action: CloseWindowAction) {
  const win = getCurrentWindow();
  if (action === "minimize") await win.minimize();
  else if (action === "quit") await win.destroy();
}
