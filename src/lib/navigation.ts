export interface NavItem {
  href: string;
  label: string;
  icon: string;
  isActive: (pathname: string) => boolean;
}

/** MSc project scope — aligned with approved dissertation proposal only. */
export const MSC_NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "grid",
    isActive: (pathname) => pathname === "/" || pathname === "/dashboard",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "doc",
    isActive: (pathname) => pathname === "/reports",
  },
  {
    href: "/analysis",
    label: "Analysis",
    icon: "chart",
    isActive: (pathname) =>
      pathname === "/analysis" ||
      pathname.startsWith("/analysis/") ||
      pathname.startsWith("/incidents/"),
  },
  {
    href: "/crisis-map",
    label: "Crisis Map",
    icon: "map",
    isActive: (pathname) => pathname === "/crisis-map",
  },
  {
    href: "/alerts",
    label: "Alerts",
    icon: "bell",
    isActive: (pathname) => pathname === "/alerts",
  },
  {
    href: "/ingestion",
    label: "Ingestion",
    icon: "upload",
    isActive: (pathname) => pathname === "/ingestion",
  },
  {
    href: "/evaluation",
    label: "Evaluation",
    icon: "evaluate",
    isActive: (pathname) => pathname === "/evaluation",
  },
  {
    href: "/configuration",
    label: "System Configuration",
    icon: "config",
    isActive: (pathname) => pathname === "/configuration",
  },
];

/** Returns the href of the single active nav item, or null. */
export function getActiveNavHref(pathname: string): string | null {
  const matches = MSC_NAV_ITEMS.filter((item) => item.isActive(pathname));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].href;
  // Prefer the most specific (longest href) match if overlap ever occurs
  return matches.sort((a, b) => b.href.length - a.href.length)[0].href;
}
