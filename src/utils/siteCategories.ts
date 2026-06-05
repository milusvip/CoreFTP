import type { Protocol, SiteCategory, SiteConfig } from "../types";

export const UNCategorized_KEY = "__uncategorized__";

export interface SiteCategoryGroup {
  key: string;
  category: SiteCategory | null;
  sites: SiteConfig[];
}

export function sortCategories(categories: SiteCategory[]): SiteCategory[] {
  return [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh"),
  );
}

export function groupSitesByCategory(
  sites: SiteConfig[],
  categories: SiteCategory[],
): SiteCategoryGroup[] {
  const sorted = sortCategories(categories);
  const groups: SiteCategoryGroup[] = sorted.map((category) => ({
    key: category.id,
    category,
    sites: sites.filter((s) => s.categoryId === category.id),
  }));

  const uncategorized = sites.filter(
    (s) => !s.categoryId || !categories.some((c) => c.id === s.categoryId),
  );
  groups.push({
    key: UNCategorized_KEY,
    category: null,
    sites: uncategorized,
  });

  return groups.filter((g) => g.category !== null || g.sites.length > 0);
}

export function uniqueProtocols(sites: SiteConfig[]): Protocol[] {
  const order: Protocol[] = ["FTP", "FTPS", "SFTP", "SSH"];
  const set = new Set(sites.map((s) => s.protocol));
  return order.filter((p) => set.has(p));
}

export function categoryDisplayName(category: SiteCategory | null, t: (key: string) => string): string {
  return category?.name ?? t("sidebar.uncategorized");
}
