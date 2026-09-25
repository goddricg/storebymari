export function isStorefrontPrimaryLinkActive(pathname: string, href: string): boolean {
  if (href.includes("#")) return false;

  const targetPath = href || "/";
  if (targetPath === "/") return pathname === "/";

  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}
