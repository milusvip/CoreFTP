import { useState } from "react";
import { useT } from "../i18n";
import { DialogBtn, DialogFooterBar, DialogLabel } from "./ui/Dialog";
import { Modal, ModalPanel, ModalHeader, ModalBody } from "./ui/Modal";
import type { ExtractOptions } from "../types";

interface ExtractDialogProps {
  fileName: string;
  archivePath: string;
  onConfirm: (opts: ExtractOptions) => void;
  onCancel: () => void;
}

export default function ExtractDialog({ fileName, archivePath, onConfirm, onCancel }: ExtractDialogProps) {
  const t = useT();
  const defaultTarget = archivePath.replace(/\\/g, "/").replace(/\/[^/]+$/, "") || "/";
  const [targetDir, setTargetDir] = useState(defaultTarget);
  const [deleteAfter, setDeleteAfter] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = () => {
    if (submitting) return;
    setSubmitting(true);
    onConfirm({ archivePath, targetDir, deleteAfter });
  };

  return (
    <Modal zIndex={55} onClose={onCancel}>
      <ModalPanel size="md">
        <ModalHeader title={t("extract.title")} subtitle={t("extract.description", { name: fileName })} onClose={onCancel} />

        <ModalBody className="space-y-3.5">
          <div>
            <DialogLabel>{t("extract.targetDir")}</DialogLabel>
            <input
              type="text"
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              className="ui-dialog-input font-mono text-xs"
            />
          </div>

          <label className="flex items-start gap-2.5 text-[13px] text-fg-muted cursor-pointer">
            <input
              type="checkbox"
              checked={deleteAfter}
              onChange={(e) => setDeleteAfter(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-accent rounded shrink-0"
            />
            <span>{t("extract.deleteAfter")}</span>
          </label>
        </ModalBody>

        <DialogFooterBar>
          <DialogBtn variant="secondary" onClick={onCancel} disabled={submitting}>
            {t("extract.cancel")}
          </DialogBtn>
          <DialogBtn variant="primary" onClick={handleConfirm} disabled={submitting}>
            {t("extract.confirm")}
          </DialogBtn>
        </DialogFooterBar>
      </ModalPanel>
    </Modal>
  );
}
