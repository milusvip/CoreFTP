import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useSettingsStore, type AppSettings } from "../stores/settingsStore";
import {
  applyTheme,
  normalizeAppearance,
  normalizeThemeId,
  type Appearance,
  type ThemeId,
} from "../theme";
import ThemeSection from "./ThemeSection";
import { DialogBtn, DialogFooterBar } from "./ui/Dialog";
import { Modal, ModalPanel, ModalHeader, ModalBody } from "./ui/Modal";

interface SettingsDialogProps {
  onClose: () => void;
}

export default function SettingsDialog({ onClose }: SettingsDialogProps) {
  const t = useT();
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const [form, setForm] = useState<AppSettings>(settings);
  const [previewThemeId, setPreviewThemeId] = useState<ThemeId | null>(null);

  const appearance = normalizeAppearance(form.appearance);
  const themeId = normalizeThemeId(form.theme);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    applyTheme(appearance, previewThemeId ?? themeId);
  }, [appearance, themeId, previewThemeId]);

  useEffect(() => {
    return () => {
      const s = useSettingsStore.getState().settings;
      applyTheme(normalizeAppearance(s.appearance), normalizeThemeId(s.theme));
    };
  }, []);

  const handleSave = async () => {
    await saveSettings({
      ...form,
      appearance,
      theme: themeId,
    });
    onClose();
  };

  return (
    <Modal zIndex={56} onClose={onClose}>
      <ModalPanel
        size="lg"
        className="!w-[720px] !h-[440px] flex flex-col overflow-hidden"
      >
        <ModalHeader title={t("settings.title")} onClose={onClose} />
        <ModalBody className="flex-1 overflow-hidden !py-2 space-y-2">
          <ThemeSection
            appearance={appearance}
            theme={themeId}
            onAppearanceChange={(a: Appearance) => setForm({ ...form, appearance: a })}
            onThemeChange={(id: ThemeId) => setForm({ ...form, theme: id })}
            onThemePreview={setPreviewThemeId}
            compact
          />
          <div>
            <label className="block text-xs text-fg-muted mb-0.5">{t("settings.defaultLocalPath")}</label>
            <input
              type="text"
              value={form.defaultLocalPath || ""}
              onChange={(e) => setForm({ ...form, defaultLocalPath: e.target.value })}
              className="ui-input w-full py-1.5 text-sm"
              placeholder={t("settings.defaultLocalPathHint")}
            />
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
            <div>
              <label className="block text-xs text-fg-muted mb-0.5">{t("settings.connectTimeout")}</label>
              <input
                type="number"
                min={5}
                max={120}
                value={form.connectTimeoutSecs}
                onChange={(e) => setForm({ ...form, connectTimeoutSecs: parseInt(e.target.value) || 30 })}
                className="ui-input w-full py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-fg-muted mb-0.5">{t("settings.ftpEncoding")}</label>
              <select
                value={form.ftpEncoding}
                onChange={(e) => setForm({ ...form, ftpEncoding: e.target.value })}
                className="ui-input w-full py-1.5 text-sm"
              >
                <option value="utf8">UTF-8</option>
                <option value="gbk">GBK</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer">
              <input
                type="checkbox"
                checked={form.ftpPassive}
                onChange={(e) => setForm({ ...form, ftpPassive: e.target.checked })}
                className="accent-accent shrink-0"
              />
              {t("settings.ftpPassive")}
            </label>
            <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer">
              <input
                type="checkbox"
                checked={form.persistTransferQueue}
                onChange={(e) => setForm({ ...form, persistTransferQueue: e.target.checked })}
                className="accent-accent shrink-0"
              />
              {t("settings.persistQueue")}
            </label>
          </div>
        </ModalBody>
        <DialogFooterBar className="!py-2.5">
          <DialogBtn variant="secondary" onClick={onClose}>{t("dialog.cancel")}</DialogBtn>
          <DialogBtn variant="primary" onClick={handleSave}>{t("dialog.confirm")}</DialogBtn>
        </DialogFooterBar>
      </ModalPanel>
    </Modal>
  );
}
