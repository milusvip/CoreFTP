import { useEffect, useRef, useState } from "react";
import { useDialogStore } from "../stores/dialogStore";
import { useT } from "../i18n";
import { normalizeFolderName, validateFolderName } from "../utils/folderName";
import { ChoiceIconChevron, ChoiceIconMinimize, ChoiceIconQuit } from "./ChoiceDialogIcons";
import {
  DialogActionCard,
  DialogActionList,
  DialogBtn,
  DialogCancelLink,
  DialogFooterBar,
  DialogHint,
  DialogMessage,
} from "./ui/Dialog";
import { Modal, ModalPanel, ModalHeader, ModalBody } from "./ui/Modal";

export default function GlobalDialogs() {
  const t = useT();
  const confirm = useDialogStore((s) => s.confirm);
  const prompt = useDialogStore((s) => s.prompt);
  const choice = useDialogStore((s) => s.choice);
  const closeConfirm = useDialogStore((s) => s.closeConfirm);
  const closePrompt = useDialogStore((s) => s.closePrompt);
  const closeChoice = useDialogStore((s) => s.closeChoice);

  const [promptValue, setPromptValue] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isFolderPrompt = prompt?.mode === "folderName";

  useEffect(() => {
    if (prompt) {
      setPromptValue(prompt.defaultValue ?? "");
      setPromptError(null);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [prompt]);

  const submitPrompt = () => {
    if (!prompt) return;
    const raw = promptValue.trim();
    if (isFolderPrompt) {
      const err = validateFolderName(raw);
      if (err) {
        setPromptError(t(`dialog.folderNameError.${err}`));
        return;
      }
      closePrompt(normalizeFolderName(raw));
      return;
    }
    if (!raw) return;
    closePrompt(raw);
  };

  return (
    <>
      {confirm && (
        <Modal zIndex={70} dismissOnBackdrop={false}>
          <ModalPanel size="sm">
            <ModalHeader title={confirm.title} />
            <ModalBody className="!py-3">
              <DialogMessage>{confirm.message}</DialogMessage>
            </ModalBody>
            <DialogFooterBar>
              <DialogBtn variant="secondary" onClick={() => closeConfirm(false)}>
                {confirm.cancelLabel ?? t("dialog.cancel")}
              </DialogBtn>
              <DialogBtn
                variant={confirm.danger ? "danger" : "primary"}
                onClick={() => closeConfirm(true)}
              >
                {confirm.confirmLabel ?? t("dialog.confirm")}
              </DialogBtn>
            </DialogFooterBar>
          </ModalPanel>
        </Modal>
      )}

      {prompt && (
        <Modal zIndex={70} dismissOnBackdrop={false}>
          <ModalPanel size="sm">
            <ModalHeader title={prompt.title} subtitle={prompt.label} onClose={() => closePrompt(null)} />
            <ModalBody className="!py-3 space-y-3">
              {isFolderPrompt ? (
                <DialogHint>{t("dialog.newFolderOnlyHint")}</DialogHint>
              ) : null}
              <input
                ref={inputRef}
                type="text"
                value={promptValue}
                onChange={(e) => {
                  setPromptValue(e.target.value);
                  if (promptError) setPromptError(null);
                }}
                placeholder={prompt.placeholder ?? (isFolderPrompt ? t("filepanel.newFolderPrompt") : undefined)}
                className={`ui-dialog-input ${promptError ? "ring-1 ring-red-500/60" : ""}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitPrompt();
                  if (e.key === "Escape") closePrompt(null);
                }}
              />
              {promptError ? (
                <p className="text-xs text-red-400 leading-snug">{promptError}</p>
              ) : null}
            </ModalBody>
            <DialogFooterBar>
              <DialogBtn variant="secondary" onClick={() => closePrompt(null)}>
                {t("dialog.cancel")}
              </DialogBtn>
              <DialogBtn
                variant="primary"
                disabled={!promptValue.trim()}
                onClick={submitPrompt}
              >
                {prompt.confirmLabel ??
                  (isFolderPrompt ? t("dialog.createFolder") : t("dialog.confirm"))}
              </DialogBtn>
            </DialogFooterBar>
          </ModalPanel>
        </Modal>
      )}

      {choice && (
        <Modal zIndex={70} dismissOnBackdrop={false}>
          <ModalPanel size="sm">
            <ModalHeader title={choice.title} />
            <ModalBody className="!pt-1 !pb-4">
              <DialogMessage>{choice.message}</DialogMessage>
              <DialogActionList className="mt-4">
                {choice.choices.map((opt) => {
                  const meta = choice.choiceMeta?.[opt.id];
                  const Icon =
                    meta?.icon === "minimize"
                      ? ChoiceIconMinimize
                      : meta?.icon === "quit"
                        ? ChoiceIconQuit
                        : null;
                  return (
                    <DialogActionCard
                      key={opt.id}
                      label={opt.label}
                      description={meta?.description}
                      danger={opt.danger}
                      onClick={() => closeChoice(opt.id)}
                      icon={
                        Icon ? (
                          <Icon />
                        ) : opt.primary ? (
                          <span className="text-[10px] font-bold text-accent">✓</span>
                        ) : undefined
                      }
                      trailing={
                        <ChoiceIconChevron className="w-4 h-4 text-fg-faint shrink-0 group-hover:text-fg-subtle group-hover:translate-x-0.5 transition-all" />
                      }
                    />
                  );
                })}
              </DialogActionList>
            </ModalBody>
            <div className="px-5 pb-5 pt-0 flex justify-center">
              <DialogCancelLink onClick={() => closeChoice(null)}>
                {choice.cancelLabel ?? t("dialog.cancel")}
              </DialogCancelLink>
            </div>
          </ModalPanel>
        </Modal>
      )}
    </>
  );
}
