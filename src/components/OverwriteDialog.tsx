import { useT } from "../i18n";
import { useTransferStore, type OverwriteAction } from "../stores/transferStore";
import { DialogBtn, DialogFooterBar, DialogHint } from "./ui/Dialog";
import { Modal, ModalPanel, ModalHeader, ModalBody } from "./ui/Modal";

function displayPath(path: string): string {
  return path.replace(/\\/g, "/");
}

export default function OverwriteDialog() {
  const t = useT();
  const dialog = useTransferStore((s) => s.overwriteDialog);
  const resolveOverwrite = useTransferStore((s) => s.resolveOverwrite);

  if (!dialog) return null;

  const choose = (action: OverwriteAction) => resolveOverwrite(action);
  const targetPath = displayPath(dialog.targetLabel);

  return (
    <Modal zIndex={65} dismissOnBackdrop={false}>
      <ModalPanel size="sm">
        <ModalHeader title={t("overwrite.title")} subtitle={dialog.fileName} />
        <ModalBody className="space-y-3">
          <DialogHint>{t("overwrite.hint")}</DialogHint>
          <div className="ui-dialog-path-row">
            <span className="ui-dialog-path-label">{t("overwrite.targetPath")}</span>
            <span className="text-[12px] text-fg-muted font-mono break-all leading-relaxed">{targetPath}</span>
          </div>
          <div className="ui-overwrite-actions">
            <DialogBtn variant="primary" className="!w-full" onClick={() => choose("overwrite")}>
              {t("overwrite.replace")}
            </DialogBtn>
            <DialogBtn variant="secondary" className="!w-full" onClick={() => choose("overwriteAll")}>
              {t("overwrite.replaceAll")}
            </DialogBtn>
            <DialogBtn variant="secondary" className="!w-full" onClick={() => choose("skip")}>
              {t("overwrite.skip")}
            </DialogBtn>
            <DialogBtn variant="ghost" className="!w-full" onClick={() => choose("skipAll")}>
              {t("overwrite.skipAll")}
            </DialogBtn>
          </div>
        </ModalBody>
        <DialogFooterBar align="center">
          <DialogBtn variant="ghost" onClick={() => choose("cancel")}>
            {t("overwrite.cancel")}
          </DialogBtn>
        </DialogFooterBar>
      </ModalPanel>
    </Modal>
  );
}
