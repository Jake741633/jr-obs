const fieldJobWorkspacePath = /^\/jobs\/[^/]+\/workspace(?:\/|$)/;

export function sidebarNavigationItemMatches({ pathname, href, isElectrician = false }) {
  if (href === "/field/jobs") {
    return pathname === href
      || pathname.startsWith(`${href}/`)
      || (isElectrician && fieldJobWorkspacePath.test(pathname));
  }
  if (href === "/field") return pathname === href;
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function activeSidebarHref({ pathname, hrefs, isElectrician = false }) {
  let activeHref;
  for (const href of hrefs) {
    if (!sidebarNavigationItemMatches({ pathname, href, isElectrician })) continue;
    if (!activeHref || href.length > activeHref.length) activeHref = href;
  }
  return activeHref;
}
