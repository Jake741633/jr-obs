export function sidebarNavigationItemMatches(input: {
  pathname: string;
  href: string;
  isElectrician?: boolean;
}): boolean;

export function activeSidebarHref(input: {
  pathname: string;
  hrefs: readonly string[];
  isElectrician?: boolean;
}): string | undefined;
