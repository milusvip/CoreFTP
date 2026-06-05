import { useEffect, useMemo, useState } from "react";
import { useSiteStore } from "../stores/siteStore";
import { useDialogStore } from "../stores/dialogStore";
import { useT } from "../i18n";
import {
  categoryDisplayName,
  groupSitesByCategory,
  uniqueProtocols,
  type SiteCategoryGroup,
} from "../utils/siteCategories";
import { DialogBtn } from "./ui/Dialog";
import { Modal, ModalPanel, ModalHeader } from "./ui/Modal";
import ProtocolBadge from "./ProtocolBadge";
import ThemeSelect from "./ui/ThemeSelect";
import type { SiteConfig } from "../types";

interface SitesPanelProps {
  onEditSite: (site: SiteConfig) => void;
  onAddSite: (categoryId?: string) => void;
  onClose: () => void;
}

function siteStatusKey(siteId: string, sessions: ReturnType<typeof useSiteStore.getState>["sessions"]) {
  const s = sessions[siteId]?.status;
  if (s === "connected") return "connected";
  if (s === "connecting") return "connecting";
  if (s === "error") return "error";
  return "disconnected";
}

function EditIcon() {
  return (
    <svg className="ui-sitespanel-action-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg className="ui-sitespanel-action-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
      <path
        fillRule="evenodd"
        d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3h11V2h-11v1z"
      />
    </svg>
  );
}

export default function SitesPanel({ onEditSite, onAddSite, onClose }: SitesPanelProps) {
  const t = useT();
  const showConfirm = useDialogStore((s) => s.showConfirm);
  const sites = useSiteStore((s) => s.sites);
  const categories = useSiteStore((s) => s.categories);
  const sessions = useSiteStore((s) => s.sessions);
  const deleteSite = useSiteStore((s) => s.deleteSite);
  const deleteCategory = useSiteStore((s) => s.deleteCategory);
  const disconnectSite = useSiteStore((s) => s.disconnectSite);
  const saveSite = useSiteStore((s) => s.saveSite);
  const connectSite = useSiteStore((s) => s.connectSite);

  const groups = useMemo(() => groupSitesByCategory(sites, categories), [sites, categories]);
  const allSiteIds = useMemo(() => sites.map((s) => s.id), [sites]);
  const emptyCategoryIds = useMemo(
    () => groups.filter((g) => g.category && g.sites.length === 0).map((g) => g.key),
    [groups],
  );

  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [batchCategoryId, setBatchCategoryId] = useState("");

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (next[g.key] === undefined) next[g.key] = true;
      }
      return next;
    });
  }, [groups]);

  const selectedCount = selectedIds.size + selectedCategoryIds.size;
  const allSitesSelected = sites.length === 0 || selectedIds.size === sites.length;
  const allEmptyCategoriesSelected =
    emptyCategoryIds.length === 0 || emptyCategoryIds.every((id) => selectedCategoryIds.has(id));
  const allSelected = allSitesSelected && allEmptyCategoriesSelected;
  const someSelected = selectedCount > 0 && !allSelected;

  const categoryOptions = [
    { value: "", label: categoryDisplayName(null, t) },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleGroup = (group: SiteCategoryGroup, checked: boolean) => {
    if (group.sites.length === 0 && group.category) {
      setSelectedCategoryIds((prev) => {
        const next = new Set(prev);
        if (checked) next.add(group.key);
        else next.delete(group.key);
        return next;
      });
      return;
    }
    const groupSiteIds = group.sites.map((s) => s.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of groupSiteIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(allSiteIds));
      setSelectedCategoryIds(new Set(emptyCategoryIds));
    } else {
      setSelectedIds(new Set());
      setSelectedCategoryIds(new Set());
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectedCategoryIds(new Set());
  };

  const exitBatchMode = () => {
    setBatchMode(false);
    clearSelection();
  };

  const selectedSites = sites.filter((s) => selectedIds.has(s.id));

  const handleDeleteOne = async (site: SiteConfig) => {
    const ok = await showConfirm({
      title: t("sidebar.delete"),
      message: t("sidebar.deleteConfirm", { name: site.name }),
      danger: true,
      confirmLabel: t("sidebar.delete"),
    });
    if (!ok) return;
    if (sessions[site.id]?.status === "connected") {
      await disconnectSite(site.id);
    }
    await deleteSite(site.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(site.id);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    if (selectedCount === 0) return;
    const categoriesPart =
      selectedCategoryIds.size > 0
        ? t("sitespanel.batchDeleteCategoriesPart", { count: String(selectedCategoryIds.size) })
        : "";
    const ok = await showConfirm({
      title: t("sitespanel.batchDelete"),
      message: t("sitespanel.batchDeleteConfirm", {
        sites: String(selectedIds.size),
        categories: categoriesPart,
      }),
      danger: true,
      confirmLabel: t("sidebar.delete"),
    });
    if (!ok) return;
    for (const site of selectedSites) {
      if (sessions[site.id]?.status === "connected") {
        await disconnectSite(site.id);
      }
      await deleteSite(site.id);
    }
    for (const categoryId of selectedCategoryIds) {
      await deleteCategory(categoryId);
    }
    clearSelection();
  };

  const handleBatchDisconnect = async () => {
    const connected = selectedSites.filter((s) => sessions[s.id]?.status === "connected");
    if (connected.length === 0) return;
    const ok = await showConfirm({
      title: t("sitespanel.batchDisconnect"),
      message: t("sitespanel.batchDisconnectConfirm", { count: String(connected.length) }),
      confirmLabel: t("sidebar.disconnect"),
    });
    if (!ok) return;
    for (const site of connected) {
      await disconnectSite(site.id);
    }
  };

  const handleBatchConnect = async () => {
    const targets = selectedSites.filter(
      (s) => sessions[s.id]?.status !== "connected" && sessions[s.id]?.status !== "connecting",
    );
    if (targets.length === 0) return;
    for (const site of targets) {
      await connectSite(site.id);
    }
  };

  const handleBatchMoveCategory = async () => {
    if (selectedCount === 0) return;
    for (const site of selectedSites) {
      const payload: SiteConfig = {
        ...site,
        categoryId: batchCategoryId || undefined,
      };
      if (!payload.categoryId) delete payload.categoryId;
      await saveSite(payload);
    }
    clearSelection();
  };

  const renderStatus = (siteId: string) => {
    const status = siteStatusKey(siteId, sessions);
    if (status === "connected") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-green-500" />
          {t("sidebar.connected")}
        </span>
      );
    }
    if (status === "connecting") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-yellow-400">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-yellow-400 animate-pulse" />
          {t("sidebar.connecting")}
        </span>
      );
    }
    if (status === "error") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-red-400 truncate" title={sessions[siteId]?.error}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-red-500" />
          {t("sidebar.error")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-fg-faint" />
        {t("sidebar.disconnected")}
      </span>
    );
  };

  const colCount = batchMode ? 6 : 5;

  return (
    <Modal zIndex={50} onClose={onClose}>
      <ModalPanel size="xl" className="!w-[min(920px,calc(100vw-48px))] flex flex-col max-h-[min(88vh,680px)] overflow-hidden">
        <ModalHeader title={t("app.sites")} onClose={onClose} />

        <div className="px-5 py-2.5 flex flex-wrap items-center gap-2 border-b border-surface-light/50 shrink-0">
          <DialogBtn variant="primary" onClick={() => onAddSite()} className="!py-1.5 !text-xs">
            + {t("sitemanager.titleAdd")}
          </DialogBtn>

          {!batchMode ? (
            (sites.length > 0 || categories.length > 0) && (
              <DialogBtn
                variant="ghost"
                className="!py-1.5 !px-2.5 !text-xs"
                onClick={() => setBatchMode(true)}
              >
                {t("sitespanel.batchMode")}
              </DialogBtn>
            )
          ) : (
            <>
              <span className="w-px h-5 bg-surface-light/60" />
              <label className="inline-flex items-center gap-2 text-xs text-fg-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="ui-sitespanel-checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
                {t("sitespanel.selectAll")}
              </label>
              {selectedCount > 0 && (
                <span className="text-xs text-fg-subtle tabular-nums">
                  {t("sitespanel.selected", { count: String(selectedCount) })}
                </span>
              )}
              <span className="w-px h-5 bg-surface-light/60" />
              <DialogBtn
                variant="ghost"
                className="!py-1 !px-2 !text-xs"
                disabled={selectedCount === 0}
                onClick={() => void handleBatchConnect()}
              >
                {t("sitespanel.batchConnect")}
              </DialogBtn>
              <DialogBtn
                variant="ghost"
                className="!py-1 !px-2 !text-xs"
                disabled={selectedCount === 0}
                onClick={() => void handleBatchDisconnect()}
              >
                {t("sitespanel.batchDisconnect")}
              </DialogBtn>
              <div className="flex items-center gap-1.5">
                <ThemeSelect
                  value={batchCategoryId}
                  onChange={setBatchCategoryId}
                  options={categoryOptions}
                  className="!w-[148px]"
                  aria-label={t("sitespanel.batchMoveCategory")}
                />
                <DialogBtn
                  variant="ghost"
                  className="!py-1 !px-2 !text-xs"
                  disabled={selectedCount === 0}
                  onClick={() => void handleBatchMoveCategory()}
                >
                  {t("sitespanel.batchMoveCategory")}
                </DialogBtn>
              </div>
              <DialogBtn
                variant="danger"
                className="!py-1 !px-2 !text-xs"
                disabled={selectedCount === 0}
                onClick={() => void handleBatchDelete()}
              >
                {t("sitespanel.batchDelete")}
              </DialogBtn>
              {selectedCount > 0 && (
                <DialogBtn variant="ghost" className="!py-1 !px-2 !text-xs" onClick={clearSelection}>
                  {t("sitespanel.clearSelection")}
                </DialogBtn>
              )}
              <DialogBtn
                variant="secondary"
                className="!py-1 !px-2.5 !text-xs ml-auto"
                onClick={exitBatchMode}
              >
                {t("sitespanel.exitBatchMode")}
              </DialogBtn>
            </>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-y-stable px-5 py-3">
          {sites.length === 0 && categories.length === 0 ? (
            <div className="text-center text-fg-faint py-16 text-sm">{t("sidebar.noSites")}</div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => {
                const isOpen = expanded[group.key] ?? true;
                const groupIds = group.sites.map((s) => s.id);
                const isEmptyCategory = groupIds.length === 0 && !!group.category;
                const groupSelected = isEmptyCategory
                  ? selectedCategoryIds.has(group.key)
                  : groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id));
                const groupPartial =
                  !isEmptyCategory && !groupSelected && groupIds.some((id) => selectedIds.has(id));
                const categoryChecked = batchMode && groupSelected;
                const protocols = uniqueProtocols(group.sites);
                const title = categoryDisplayName(group.category, t);

                return (
                  <section
                    key={group.key}
                    className={`rounded-xl border border-surface-light/55 overflow-hidden bg-surface/20 ${
                      categoryChecked ? "ring-1 ring-accent/25" : ""
                    }`}
                  >
                    <div
                      className={`ui-sitespanel-category-bar ${
                        categoryChecked ? "bg-accent/10" : ""
                      }`}
                    >
                      {batchMode && group.category && (
                        <input
                          type="checkbox"
                          className="ui-sitespanel-checkbox shrink-0"
                          checked={groupSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = groupPartial;
                          }}
                          onChange={(e) => toggleGroup(group, e.target.checked)}
                          aria-label={t("sitespanel.selectCategory", { name: title })}
                        />
                      )}
                      <button
                        type="button"
                        className="ui-sitespanel-category-toggle"
                        onClick={() => setExpanded((s) => ({ ...s, [group.key]: !isOpen }))}
                        aria-expanded={isOpen}
                      >
                        <svg
                          className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          aria-hidden
                        >
                          <path d="M4 6l4 4 4-4" />
                        </svg>
                        <span className="font-semibold text-fg truncate">{title}</span>
                        <span className="text-fg-faint tabular-nums text-[11px]">({group.sites.length})</span>
                        {protocols.map((p) => (
                          <ProtocolBadge key={p} protocol={p} />
                        ))}
                      </button>
                      {group.category && (
                        <button
                          type="button"
                          className="ui-toolbar-btn !text-[11px] !py-0.5 shrink-0"
                          onClick={() => onAddSite(group.category!.id)}
                        >
                          + {t("sitemanager.titleAdd")}
                        </button>
                      )}
                    </div>

                    {isOpen && (
                      <table className="w-full border-collapse text-sm table-fixed">
                        <thead>
                          <tr className="text-[11px] text-fg-subtle font-medium bg-surface-darker/40">
                            {batchMode && (
                              <th className="w-9 px-2 py-2 border-b border-surface-light/50" />
                            )}
                            <th className="text-left px-3 py-2 border-b border-surface-light/50 w-[20%]">
                              {t("sitemanager.name")}
                            </th>
                            <th className="text-left px-3 py-2 border-b border-surface-light/50 w-[26%]">
                              {t("sitemanager.host")}
                            </th>
                            <th className="text-left px-3 py-2 border-b border-surface-light/50 w-[12%]">
                              {t("sitemanager.protocol")}
                            </th>
                            <th className="text-left px-3 py-2 border-b border-surface-light/50 w-[14%]">
                              {t("sitespanel.status")}
                            </th>
                            <th className="text-right px-2 py-2 border-b border-surface-light/50 w-[72px]">
                              {t("sitespanel.actions")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.sites.length === 0 ? (
                            <tr>
                              <td colSpan={colCount} className="px-3 py-6 text-center text-xs text-fg-faint">
                                {t("sidebar.categoryEmpty")}
                              </td>
                            </tr>
                          ) : (
                            group.sites.map((site) => {
                              const checked = selectedIds.has(site.id);
                              return (
                                <tr
                                  key={site.id}
                                  className={`transition-colors ${
                                    batchMode && checked ? "bg-accent/10" : "hover:bg-surface-light/30"
                                  }`}
                                >
                                  {batchMode && (
                                    <td className="px-2 py-2.5 border-b border-surface-light/40 text-center">
                                      <input
                                        type="checkbox"
                                        className="ui-sitespanel-checkbox"
                                        checked={checked}
                                        onChange={(e) => toggleOne(site.id, e.target.checked)}
                                        aria-label={site.name}
                                      />
                                    </td>
                                  )}
                                  <td className="px-3 py-2.5 border-b border-surface-light/40 font-medium truncate">
                                    {site.name}
                                  </td>
                                  <td className="px-3 py-2.5 border-b border-surface-light/40 text-fg-muted tabular-nums truncate">
                                    {site.host}:{site.port}
                                  </td>
                                  <td className="px-3 py-2.5 border-b border-surface-light/40">
                                    <ProtocolBadge protocol={site.protocol} />
                                  </td>
                                  <td className="px-3 py-2.5 border-b border-surface-light/40">
                                    {renderStatus(site.id)}
                                  </td>
                                  <td className="px-2 py-2.5 border-b border-surface-light/40 text-right w-[72px]">
                                    <div className="ui-sitespanel-actions">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onEditSite(site);
                                          onClose();
                                        }}
                                        className="ui-sitespanel-action-btn ui-sitespanel-action-edit"
                                        title={t("sidebar.edit")}
                                        aria-label={t("sidebar.edit")}
                                      >
                                        <EditIcon />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteOne(site)}
                                        className="ui-sitespanel-action-btn ui-sitespanel-action-delete"
                                        title={t("sidebar.delete")}
                                        aria-label={t("sidebar.delete")}
                                      >
                                        <DeleteIcon />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </ModalPanel>
    </Modal>
  );
}
