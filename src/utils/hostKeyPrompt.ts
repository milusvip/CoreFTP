import { useI18n } from "../i18n";
import { useDialogStore } from "../stores/dialogStore";
import type { HostKeyPrompt } from "./sshHostKey";

export async function promptHostKeyTrust(prompt: HostKeyPrompt): Promise<boolean> {
  const t = useI18n.getState().t;
  const mismatch = prompt.kind === "mismatch";
  return useDialogStore.getState().showConfirm({
    title: t(mismatch ? "hostKey.mismatchTitle" : "hostKey.unknownTitle"),
    message: t(mismatch ? "hostKey.mismatchMessage" : "hostKey.unknownMessage", {
      fingerprint: prompt.fingerprint,
    }),
    confirmLabel: t("hostKey.trust"),
    cancelLabel: t("dialog.cancel"),
    danger: mismatch,
  });
}
