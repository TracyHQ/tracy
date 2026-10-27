/**
 * Where dsh's root is, as seen from this page: the served index carries a base tag naming the
 * mount a reverse proxy published dsh under (`https://host/<site>/`), and a URL built from the
 * origin would land on the host's bare root instead. Same rule as `pageBase`/`dshUrl` in
 * `@deepseek-ai/dsh-client-connection/client`, kept local: a plugin's client bundle may not import
 * another plugin's, and this one may run against a dsh that predates the helper.
 */

/**
 * The mount the page carries in its base tag, as an absolute URL ending in `/` — or '' when the
 * page has no base tag (the root, where a root-relative path is already right) or there is no
 * page at all (tests, non-browser callers).
 */
export function pageBase(): string {
  if (typeof document === 'undefined' || typeof location === 'undefined') return '';
  const href = document.querySelector?.('base[href]')?.getAttribute('href');
  if (href === null || href === undefined || href === '') return '';
  try {
    const root = new URL(href, location.href);
    if (!root.pathname.endsWith('/')) root.pathname += '/';
    return root.href;
  } catch {
    return '';
  }
}

/**
 * A root-relative dsh or gateway path (`/api/…`, `/gateway/…`) placed under the page's mount.
 * @param path - the path as the server registers it.
 * @returns the absolute URL under the mount, or `path` unchanged when there is no mount.
 */
export function dshUrl(path: string): string {
  const base = pageBase();
  return base === '' ? path : new URL(path.replace(/^\/+/, ''), base).href;
}

/**
 * The inverse of `dshUrl` for a pathname this page requested: the path as the server registers
 * it, with the page's mount taken off — the same thing the gateway does to `req.url` (H0) before
 * any route sees it. An exact comparison with a root path (`=== '/api/…'`) then holds under a mount.
 * @param pathname - a URL's pathname, already resolved against the page.
 * @returns the pathname without the mount; unchanged when the page has no mount or the pathname
 *   lies outside it.
 */
export function dshPathOf(pathname: string): string {
  const base = pageBase();
  if (base === '') return pathname;
  const mount = new URL(base).pathname.replace(/\/+$/, '');
  if (mount === '') return pathname;
  if (pathname === mount) return '/';
  return pathname.startsWith(`${mount}/`) ? pathname.slice(mount.length) : pathname;
}
