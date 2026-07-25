export function isPublicPlatformRoute(pathname: string) {
  if (pathname === "/platform/login" || pathname === "/platform/login/") {
    return true;
  }
  return /^\/platform\/invite\/[^/]+\/?$/.test(pathname);
}
