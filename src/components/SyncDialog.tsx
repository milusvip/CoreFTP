import { useMemo, useState } from "react";
import { useT } from "../i18n";
import { DialogBtn, DialogFooterBar, DialogHint } from "./ui/Dialog";
import { Modal, ModalPanel, ModalHeader, ModalBody } from "./ui/Modal";

export interface SyncOptions {
  direction: "upload" | "download";
  deleteExtra: boolean;
}

interface SyncDialogProps {
  localPath: string;
  remotePath: string;
  onConfirm: (opts: SyncOptions) => void;
  onCancel: () => void;
}

export default function SyncDialog({ localPath, remotePath, onConfirm, onCancel }: SyncDialogProps) {
  const t = useT();
  const [direction, setDirection] = useState<"upload" | "download">("upload");
  const [deleteExtra, setDeleteExtra] = useState(false);

  const startHint = useMemo(() => {
    if (direction === "upload") {
      return deleteExtra ? t("sync.startHintUploadDelete") : t("sync.startHintUpload");
    }
    return deleteExtra ? t("sync.startHintDownloadDelete") : t("sync.startHintDownload");
  }, [direction, deleteExtra, t]);

  return (
    <Modal zIndex={55} onClose={onCancel}>
      <ModalPanel size="md">
        <ModalHeader title={t("sync.title")} subtitle={t("sync.description")} onClose={onCancel} />
        <ModalBody className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="ui-dialog-path-row">
              <span className="ui-dialog-path-label">{t("filepanel.local")}</span>
              <code className="text-[11px] text-fg-muted break-all">{localPath}</code>
            </div>
            <div className="ui-dialog-path-row">
              <span className="ui-dialog-path-label">{t("filepanel.remote")}</span>
              <code className="text-[11px] text-fg-muted break-all">{remotePath}</code>
            </div>
          </div>
          <div className="ui-dialog-segment" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={direction === "upload"}
              onClick={() => setDirection("upload")}
              className={`ui-dialog-segment-btn ${direction === "upload" ? "ui-dialog-segment-btn-active" : ""}`}
            >
              {t("sync.upload")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={direction === "download"}
              onClick={() => setDirection("download")}
              className={`ui-dialog-segment-btn ${direction === "download" ? "ui-dialog-segment-btn-active" : ""}`}
            >
              {t("sync.download")}
            </button>
          </div>
          <label className="flex items-start gap-2 text-[13px] text-fg-muted cursor-pointer">
            <input
              type="checkbox"
              checked={deleteExtra}
              onChange={(e) => setDeleteExtra(e.target.checked)}
              className="accent-accent mt-0.5 shrink-0"
            />
            <span>
              {t("sync.deleteExtra")}
              {deleteExtra && (
                <span className="block mt-1 text-[11px] text-amber-500/90 leading-snug">
                  {t("sync.deleteExtraHint")}
                </span>
              )}
            </span>
          </label>
          <DialogHint>{startHint}</DialogHint>
        </ModalBody>
        <DialogFooterBar>
          <DialogBtn variant="secondary" onClick={onCancel}>
            {t("dialog.cancel")}
          </DialogBtn>
          <DialogBtn variant="primary" onClick={() => onConfirm({ direction, deleteExtra })}>
            {t("sync.start")}
          </DialogBtn>
        </DialogFooterBar>
      </ModalPanel>
    </Modal>
  );
}
