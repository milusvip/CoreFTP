import { useT } from "../i18n";
import { DialogBtn } from "./ui/Dialog";

interface EditSessionBarProps {
  fileName: string;
  onSave: () => void;
  onCancel: () => void;
}

export default function EditSessionBar({ fileName, onSave, onCancel }: EditSessionBarProps) {
  const t = useT();

  return (
    <div className="ui-edit-session-bar" role="status" aria-live="polite">
      <span className="ui-edit-session-badge shrink-0">
        <span className="ui-edit-session-dot" aria-hidden />
        {t("edit.badge")}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-fg truncate">
          <span className="text-fg-subtle">{t("edit.label")}</span>
          <span className="font-medium ml-1.5">{fileName}</span>
        </p>
        <p className="text-[11px] text-fg-faint mt-0.5 truncate">{t("edit.hint")}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <DialogBtn variant="primary" className="!py-1.5 !px-3.5 !text-xs" onClick={onSave}>
          {t("edit.save")}
        </DialogBtn>
        <DialogBtn variant="secondary" className="!py-1.5 !px-3 !text-xs" onClick={onCancel}>
          {t("edit.cancel")}
        </DialogBtn>
      </div>
    </div>
  );
}
