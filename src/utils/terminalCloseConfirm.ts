import { useDialogStore } from "../stores/dialogStore";
import { useI18n } from "../i18n";

function t(key: string, params?: Record<string, string>) {
  return useI18n.getState().t(key, params);
}

export async function confirmCloseTerminalTab(siteName: string): Promise<boolean> {
  return useDialogStore.getState().showConfirm({
    title: t("sshTerminal.closeConfirmTitle"),
    message: t("sshTerminal.closeTabConfirm", { name: siteName }),
    confirmLabel: t("sshTerminal.closeTab"),
    danger: true,
  });
}

export async function confirmCloseAllTerminals(count: number): Promise<boolean> {
  return useDialogStore.getState().showConfirm({
    title: t("sshTerminal.closeConfirmTitle"),
    message: t("sshTerminal.closeAllConfirm", { count: String(count) }),
    confirmLabel: t("sshTerminal.dockCloseAll"),
    danger: true,
  });
}

export async function confirmCloseTerminalWindow(): Promise<boolean> {
  return useDialogStore.getState().showConfirm({
    title: t("sshTerminal.closeConfirmTitle"),
    message: t("sshTerminal.closeWindowConfirm"),
    confirmLabel: t("sshTerminal.closeWindow"),
    danger: true,
  });
}
