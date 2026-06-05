import { useState, useEffect } from "react";
import { useT } from "../i18n";
import { DialogBtn, DialogFooterBar } from "./ui/Dialog";
import { Modal, ModalPanel, ModalHeader, ModalBody } from "./ui/Modal";
import ThemeSelect from "./ui/ThemeSelect";
import CategoryAddIcon from "./icons/CategoryAddIcon";
import type { SiteConfig, Protocol } from "../types";
import { useSiteStore } from "../stores/siteStore";
import { categoryDisplayName } from "../utils/siteCategories";
import { useDialogStore } from "../stores/dialogStore";

interface SiteManagerDialogProps {
  site?: SiteConfig | null;
  defaultCategoryId?: string;
  onSave: (site: SiteConfig) => void;
  onCancel: () => void;
}

const PROTOCOLS: { value: Protocol; label: string; defaultPort: number }[] = [
  { value: "FTP", label: "FTP", defaultPort: 21 },
  { value: "FTPS", label: "FTPS (TLS)", defaultPort: 21 },
  { value: "SFTP", label: "SFTP", defaultPort: 22 },
  { value: "SSH", label: "SSH", defaultPort: 22 },
];

function genId() {
  return Math.random().toString(36).substring(2, 9);
}

export default function SiteManagerDialog({
  site,
  defaultCategoryId,
  onSave,
  onCancel,
}: SiteManagerDialogProps) {
  const t = useT();
  const showPrompt = useDialogStore((s) => s.showPrompt);
  const categories = useSiteStore((s) => s.categories);
  const saveCategory = useSiteStore((s) => s.saveCategory);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState<SiteConfig>({
    id: "",
    name: "",
    host: "",
    port: 21,
    protocol: "FTP",
    username: "",
    password: "",
    privateKey: "",
    privateKeyPassphrase: "",
    defaultRemotePath: "/www/wwwroot",
    webOwner: "www",
    webGroup: "www",
    categoryId: defaultCategoryId,
  });

  const isSftp = form.protocol === "SFTP" || form.protocol === "SSH";

  useEffect(() => {
    if (site) {
      setForm(site);
    } else {
      setForm({
        id: genId(),
        name: "",
        host: "",
        port: 21,
        protocol: "FTP",
        username: "",
        password: "",
        privateKey: "",
        privateKeyPassphrase: "",
        defaultRemotePath: "/www/wwwroot",
        webOwner: "www",
        webGroup: "www",
        categoryId: defaultCategoryId,
      });
    }
  }, [site, defaultCategoryId]);

  const handleNewCategory = async () => {
    const name = await showPrompt({
      title: t("sidebar.addCategory"),
      label: t("sidebar.categoryName"),
      confirmLabel: t("sidebar.createCategory"),
    });
    if (!name?.trim()) return;
    const saved = await saveCategory({
      id: genId(),
      name: name.trim(),
      sortOrder: categories.length + 1,
    });
    setForm((f) => ({ ...f, categoryId: saved.id }));
  };

  const handleProtocolChange = (protocol: Protocol) => {
    const p = PROTOCOLS.find((x) => x.value === protocol);
    setForm({ ...form, protocol, port: p?.defaultPort ?? 21 });
  };

  const handleSave = () => {
    if (!form.name || !form.host) return;
    const payload: SiteConfig = { ...form, id: form.id || genId() };
    if (!payload.categoryId) delete payload.categoryId;
    if (site && !form.password?.trim()) delete payload.password;
    if (site && !form.privateKeyPassphrase?.trim()) delete payload.privateKeyPassphrase;
    onSave(payload);
  };

  const categoryOptions = [
    { value: "", label: categoryDisplayName(null, t) },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <Modal zIndex={55} onClose={onCancel}>
      <ModalPanel
        size="lg"
        className="!w-[720px] !max-h-[min(92vh,680px)] flex flex-col overflow-hidden"
      >
        <ModalHeader
          title={site ? t("sitemanager.titleEdit") : t("sitemanager.titleAdd")}
          onClose={onCancel}
        />
        <ModalBody className="flex-1 min-h-0 overflow-y-auto scroll-y-stable !py-3 px-5">
          <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 pb-1">
            <div className="col-span-2">
              <label className="block text-xs text-fg-muted mb-0.5">{t("sitemanager.name")}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("sitemanager.namePlaceholder")}
                className="ui-input w-full py-1.5 text-sm"
              />
            </div>

            <div className="col-span-2">
              <div className="flex items-end gap-2.5">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs text-fg-muted mb-0.5">{t("sitemanager.category")}</label>
                  <ThemeSelect
                    value={form.categoryId ?? ""}
                    onChange={(categoryId) =>
                      setForm({ ...form, categoryId: categoryId || undefined })
                    }
                    options={categoryOptions}
                    aria-label={t("sitemanager.category")}
                  />
                </div>
                <button
                  type="button"
                  className="ui-sitemanager-category-add"
                  onClick={() => void handleNewCategory()}
                >
                  <CategoryAddIcon />
                  {t("sitemanager.newCategory")}
                </button>
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-fg-muted mb-0.5">{t("sitemanager.protocol")}</label>
              <div className="flex flex-wrap gap-2">
                {PROTOCOLS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => handleProtocolChange(p.value)}
                    className={`flex-1 px-3 py-1 rounded-lg text-sm border transition-colors ${
                      form.protocol === p.value
                        ? "bg-accent text-white border-accent"
                        : "bg-surface-darker text-fg-muted border-surface-light hover:border-surface-hover"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {form.protocol === "SSH" && (
                <p className="text-[10px] text-fg-faint leading-snug mt-1">{t("sitemanager.sshProtocolHint")}</p>
              )}
            </div>

            <div>
              <label className="block text-xs text-fg-muted mb-0.5">{t("sitemanager.host")}</label>
              <input
                type="text"
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder={t("sitemanager.hostPlaceholder")}
                className="ui-input w-full py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-fg-muted mb-0.5">{t("sitemanager.port")}</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 21 })}
                className="ui-input w-full py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-fg-muted mb-0.5">{t("sitemanager.username")}</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder={t("sitemanager.usernamePlaceholder")}
                className="ui-input w-full py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-fg-muted mb-0.5 truncate" title={isSftp ? `${t("sitemanager.password")} ${t("sitemanager.passwordSftp")}` : t("sitemanager.password")}>
                {t("sitemanager.password")}
                {isSftp && (
                  <span className="text-fg-faint ml-1">{t("sitemanager.passwordSftp")}</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={form.password || ""}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={site ? t("sitemanager.passwordKeep") : t("sitemanager.passwordPlaceholder")}
                  className="ui-input w-full py-1.5 text-sm pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 ui-icon-btn"
                  tabIndex={-1}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {showPw ? (
                      <>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </>
                    ) : (
                      <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* SFTP / SSH 扩展字段 */}
            <div className="col-span-2">
              {isSftp ? (
                <div className="grid grid-cols-2 gap-x-5 gap-y-2">
                  <div>
                    <label className="block text-xs text-fg-muted mb-0.5">{t("sitemanager.privateKey")}</label>
                    <input
                      type="text"
                      value={form.privateKey || ""}
                      onChange={(e) => setForm({ ...form, privateKey: e.target.value })}
                      placeholder={t("sitemanager.privateKeyPlaceholder")}
                      className="ui-input w-full py-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-fg-muted mb-0.5">{t("sitemanager.keyPassphrase")}</label>
                    <input
                      type="password"
                      value={form.privateKeyPassphrase || ""}
                      onChange={(e) => setForm({ ...form, privateKeyPassphrase: e.target.value })}
                      placeholder={site ? t("sitemanager.passwordKeep") : t("sitemanager.keyPassphrasePlaceholder")}
                      className="ui-input w-full py-1.5 text-sm"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-fg-faint leading-snug pt-0.5">{t("sitemanager.sftpFieldsHint")}</p>
              )}
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-fg-muted mb-0.5">{t("sitemanager.defaultPath")}</label>
              <input
                type="text"
                value={form.defaultRemotePath || "/"}
                onChange={(e) => setForm({ ...form, defaultRemotePath: e.target.value })}
                className="ui-input w-full py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-fg-muted mb-0.5">{t("sitemanager.webOwner")}</label>
              <input
                type="text"
                value={form.webOwner || "www"}
                onChange={(e) => setForm({ ...form, webOwner: e.target.value })}
                className="ui-input w-full py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-fg-muted mb-0.5">{t("sitemanager.webGroup")}</label>
              <input
                type="text"
                value={form.webGroup || "www"}
                onChange={(e) => setForm({ ...form, webGroup: e.target.value })}
                className="ui-input w-full py-1.5 text-sm"
              />
            </div>
            <p className="col-span-2 text-[10px] text-fg-faint leading-snug">{t("sitemanager.webPermHint")}</p>
          </div>
        </ModalBody>

        <DialogFooterBar className="!py-2.5 shrink-0">
          <DialogBtn variant="secondary" onClick={onCancel}>
            {t("sitemanager.cancel")}
          </DialogBtn>
          <DialogBtn variant="primary" onClick={handleSave} disabled={!form.name || !form.host}>
            {t("sitemanager.save")}
          </DialogBtn>
        </DialogFooterBar>
      </ModalPanel>
    </Modal>
  );
}
