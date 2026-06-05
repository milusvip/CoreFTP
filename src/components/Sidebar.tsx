import { useEffect, useMemo, useState } from "react";
import { useSiteStore } from "../stores/siteStore";
import { useDialogStore } from "../stores/dialogStore";
import { useT } from "../i18n";
import {
  categoryDisplayName,
  groupSitesByCategory,
  uniqueProtocols,
} from "../utils/siteCategories";
import ContextMenu, { type ContextMenuItem } from "./ui/ContextMenu";
import ProtocolBadge from "./ProtocolBadge";
import SiteListItem from "./SiteListItem";
import CategoryAddIcon from "./icons/CategoryAddIcon";
import { usesSshTransport } from "../utils/protocol";
import type { SiteCategory, SiteConfig } from "../types";

interface SidebarProps {
  onEditSite: (site: SiteConfig) => void;
  onAddSite: (categoryId?: string) => void;
  onOpenSshTerminal?: (site: SiteConfig) => void;
}

function genCategoryId() {
  return Math.random().toString(36).substring(2, 11);
}

export default function Sidebar({ onEditSite, onAddSite, onOpenSshTerminal }: SidebarProps) {
  const t = useT();
  const showConfirm = useDialogStore((s) => s.showConfirm);
  const showPrompt = useDialogStore((s) => s.showPrompt);
  const sites = useSiteStore((s) => s.sites);
  const categories = useSiteStore((s) => s.categories);
  const saveCategory = useSiteStore((s) => s.saveCategory);
  const deleteCategory = useSiteStore((s) => s.deleteCategory);
  const sessions = useSiteStore((s) => s.sessions);
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const setActiveSite = useSiteStore((s) => s.setActiveSite);
  const connectSite = useSiteStore((s) => s.connectSite);
  const disconnectSite = useSiteStore((s) => s.disconnectSite);
  const deleteSite = useSiteStore((s) => s.deleteSite);

  const groups = useMemo(() => groupSitesByCategory(sites, categories), [sites, categories]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<
    | { kind: "site"; site: SiteConfig; x: number; y: number }
    | { kind: "category"; category: SiteCategory; x: number; y: number }
    | null
  >(null);

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const group of groups) {
        if (next[group.key] === undefined) next[group.key] = true;
      }
      return next;
    });
  }, [groups]);

  const handleSiteSelect = (site: SiteConfig) => {
    setActiveSite(site.id);
  };

  const handleSiteConnect = (site: SiteConfig) => {
    setActiveSite(site.id);
    const session = sessions[site.id];
    if (session?.status === "connected" || session?.status === "connecting") return;
    void connectSite(site.id);
  };

  const confirmDisconnect = async (site: SiteConfig) => {
    const ok = await showConfirm({
      title: t("sidebar.disconnect"),
      message: t("sidebar.disconnectConfirm", { name: site.name }),
      confirmLabel: t("sidebar.disconnect"),
    });
    if (ok) await disconnectSite(site.id);
  };

  const handleDisconnect = (e: React.MouseEvent, site: SiteConfig) => {
    e.stopPropagation();
    void confirmDisconnect(site);
  };

  const handleAddCategory = async () => {
    const name = await showPrompt({
      title: t("sidebar.addCategory"),
      label: t("sidebar.categoryName"),
      defaultValue: "",
      confirmLabel: t("sidebar.createCategory"),
    });
    if (!name?.trim()) return;
    await saveCategory({
      id: genCategoryId(),
      name: name.trim(),
      sortOrder: categories.length + 1,
    });
  };

  const handleRenameCategory = async (category: SiteCategory) => {
    const name = await showPrompt({
      title: t("sidebar.renameCategory"),
      label: t("sidebar.categoryName"),
      defaultValue: category.name,
      confirmLabel: t("dialog.confirm"),
    });
    if (!name?.trim() || name.trim() === category.name) return;
    await saveCategory({ ...category, name: name.trim() });
  };

  const handleDeleteCategory = async (category: SiteCategory) => {
    const count = sites.filter((s) => s.categoryId === category.id).length;
    const ok = await showConfirm({
      title: t("sidebar.deleteCategory"),
      message: t("sidebar.deleteCategoryConfirm", { name: category.name, count: String(count) }),
      danger: true,
      confirmLabel: t("sidebar.deleteCategory"),
    });
    if (!ok) return;
    await deleteCategory(category.id);
  };

  const buildSiteMenuItems = (site: SiteConfig): ContextMenuItem[] => {
    const session = sessions[site.id];
    const items: ContextMenuItem[] = [];

    if (session?.status === "connected") {
      items.push({
        id: "disconnect",
        label: t("sidebar.disconnect"),
        onClick: () => void confirmDisconnect(site),
      });
    } else if (session?.status !== "connecting") {
      items.push({
        id: "connect",
        label: t("sidebar.connect"),
        onClick: () => handleSiteConnect(site),
      });
    }

    if (usesSshTransport(site.protocol) && onOpenSshTerminal) {
      items.push({
        id: "ssh-detached",
        label: t("sidebar.openSshDetached"),
        onClick: () => onOpenSshTerminal(site),
      });
    }

    items.push({
      id: "edit",
      label: t("sidebar.edit"),
      onClick: () => onEditSite(site),
    });
    items.push({
      id: "delete",
      label: t("sidebar.delete"),
      danger: true,
      separatorBefore: true,
      onClick: async () => {
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
      },
    });
    return items;
  };

  const buildCategoryMenuItems = (category: SiteCategory): ContextMenuItem[] => [
    {
      id: "add-site",
      label: t("sidebar.addSiteInCategory"),
      onClick: () => onAddSite(category.id),
    },
    {
      id: "rename",
      label: t("sidebar.renameCategory"),
      onClick: () => void handleRenameCategory(category),
    },
    {
      id: "delete",
      label: t("sidebar.deleteCategory"),
      danger: true,
      separatorBefore: true,
      onClick: () => void handleDeleteCategory(category),
    },
  ];

  return (
    <div className="ui-sidebar">
      <div className="ui-sidebar-header">
        <span className="ui-sidebar-title">{t("sidebar.mySites")}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void handleAddCategory()}
            className="ui-sidebar-action-btn ui-sidebar-category-add"
            title={t("sidebar.addCategory")}
          >
            <CategoryAddIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onAddSite()}
            className="ui-sidebar-action-btn"
            title={t("sitemanager.titleAdd")}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 scroll-y-stable min-h-0 px-2 py-2 space-y-2">
        {sites.length === 0 && categories.length === 0 && (
          <div className="ui-sidebar-empty">
            {t("sidebar.noSites")}
            <button
              type="button"
              onClick={() => onAddSite()}
              className="block w-full mt-3 text-accent hover:underline font-medium"
            >
              {t("sidebar.addSite")}
            </button>
          </div>
        )}

        {groups.map((group) => {
          const isOpen = expanded[group.key] ?? true;
          const protocols = uniqueProtocols(group.sites);
          const title = categoryDisplayName(group.category, t);

          return (
            <section key={group.key} className="group/cat ui-sidebar-category">
              <div
                role="button"
                tabIndex={0}
                className="ui-sidebar-category-bar"
                onClick={() => setExpanded((s) => ({ ...s, [group.key]: !isOpen }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpanded((s) => ({ ...s, [group.key]: !isOpen }));
                  }
                }}
                onContextMenu={(e) => {
                  if (!group.category) return;
                  e.preventDefault();
                  setMenu({ kind: "category", category: group.category, x: e.clientX, y: e.clientY });
                }}
              >
                <svg
                  className={`ui-sidebar-category-chevron ${isOpen ? "" : "-rotate-90"}`}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M4 6l4 4 4-4" />
                </svg>
                <span className="ui-sidebar-category-title">
                  {title}
                </span>
                <span className="ui-sidebar-category-count">{group.sites.length}</span>
                {protocols.length > 0 && (
                  <span className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {protocols.map((p) => (
                      <ProtocolBadge key={p} protocol={p} />
                    ))}
                  </span>
                )}
                {group.category && (
                  <button
                    type="button"
                    className="ui-icon-btn !w-6 !h-6 shrink-0 opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover/cat:opacity-100"
                    title={t("sidebar.addSiteInCategory")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddSite(group.category!.id);
                    }}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="px-1.5 pb-1.5 space-y-1">
                  {group.sites.length === 0 ? (
                    <p className="text-[10px] text-fg-subtle text-center py-3 px-2">{t("sidebar.categoryEmpty")}</p>
                  ) : (
                    group.sites.map((site) => {
                      const session = sessions[site.id];
                      const isActive = activeSiteId === site.id;
                      return (
                        <SiteListItem
                          key={site.id}
                          site={site}
                          isActive={isActive}
                          session={session}
                          onClick={() => handleSiteSelect(site)}
                          onDoubleClick={() => handleSiteConnect(site)}
                          onDisconnect={
                            session?.status === "connected"
                              ? (e) => handleDisconnect(e, site)
                              : undefined
                          }
                          onContextMenu={(e) => {
                            e.preventDefault();
                            handleSiteSelect(site);
                            setMenu({ kind: "site", site, x: e.clientX, y: e.clientY });
                          }}
                        />
                      );
                    })
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {menu?.kind === "site" && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          header={menu.site.name}
          items={buildSiteMenuItems(menu.site)}
          onClose={() => setMenu(null)}
        />
      )}
      {menu?.kind === "category" && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          header={menu.category.name}
          items={buildCategoryMenuItems(menu.category)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
