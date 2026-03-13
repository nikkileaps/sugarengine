/**
 * Normalize a content base path for runtime asset resolution.
 * Examples:
 * - "" -> ""
 * - "games/rackwick-city" -> "games/rackwick-city/"
 * - "/games/rackwick-city/" -> "games/rackwick-city/"
 */
export function normalizeContentBasePath(contentBasePath?: string): string {
  const raw = (contentBasePath ?? '').trim();
  if (!raw) return '';
  const withoutLeading = raw.replace(/^\/+/, '');
  const withoutTrailing = withoutLeading.replace(/\/+$/, '');
  return withoutTrailing ? `${withoutTrailing}/` : '';
}

/**
 * Resolve a project-relative asset path against BASE_URL + content base path.
 * Absolute URLs/paths are returned unchanged.
 */
export function resolveContentUrl(contentBasePath: string, assetPath: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(assetPath) || assetPath.startsWith('/')) {
    return assetPath;
  }
  const cleanPath = assetPath.replace(/^\/+/, '');
  return `${import.meta.env.BASE_URL}${contentBasePath}${cleanPath}`;
}
