const authPaths = new Set(["/login", "/register"]);
const protectedPaths = new Set(["/account", "/favorites", "/searches"]);

export const isAuthEntryPath = (path) => authPaths.has(path) || protectedPaths.has(path);

export function resolveAuthRoute(path, fromPath, user, authLoading) {
  const authRoute = authPaths.has(path);
  const authBackgroundPath = typeof fromPath === "string" && fromPath.startsWith("/") && !fromPath.startsWith("//") && !isAuthEntryPath(fromPath) && !fromPath.startsWith("/orders/")
    ? fromPath : "/";
  const authModalOpen = !authLoading && !user && isAuthEntryPath(path);
  const contentPath = authRoute || authModalOpen ? authBackgroundPath : path;
  return { authRoute, authBackgroundPath, authModalOpen, contentPath };
}
