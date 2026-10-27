/**
 * Where dsh's root is, as seen from this page — for the few calls this plugin makes to its OWN
 * host half (`/api/tracy-add-site/…`), which dsh serves.
 *
 * dsh may be published under a path (`https://cowork.tracy.ai/<siteKey>/`); the served index
 * then carries a `<base href>` naming that mount, and a root-absolute `fetch('/api/…')` would
 * skip it and knock on the host's bare root, where nothing of dsh's listens. Calls to the
 * Worker's own doors (`/api/sites`, `/auth/me`, `/api/team`, `/login`) stay root-absolute on
 * purpose: the Worker IS the host's root.
 *
 * Same rule as `dshUrl` in `@deepseek-ai/dsh-client-connection/client` (the Tracy fork). Kept
 * local because a plugin's client bundle may not value-import another plugin's.
 */

/** The page's `<base href>` when it has one, else its origin — always ending in `/`. */
export function pageBase(): string {
  const base = document.querySelector('base[href]')?.getAttribute('href')
  if (base !== null && base !== undefined) {
    const root = new URL(base, location.href)
    if (!root.pathname.endsWith('/')) root.pathname += '/'
    return root.href
  }
  return `${location.origin}/`
}

/**
 * Resolve a root-relative dsh path against {@link pageBase}.
 * @param path - a path as dsh's host half registers it, `/api/tracy-add-site/start`.
 * @returns the absolute URL to call.
 */
export function dshUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ''), pageBase()).href
}

/**
 * The template the customer chose in Design inspiration, handed over in the address.
 *
 * The gallery's press lands here rather than in a Build tab of its own (Akemi, 24/09/2026: one
 * creation flow), and the only thing it has to carry is WHICH design was picked — the wizard
 * already knows how to ask for everything else.
 *
 * Read from the live location each time instead of being captured at mount: the tab is opened by
 * an address change on a page that is already running, so a value read once would be last press's.
 *
 * @param search - the query string to read; defaults to the live one.
 * @returns the template id, or `undefined` when the address names none.
 */
export function chosenDesign(search: string = window.location.search): string | undefined {
  try {
    const value = new URLSearchParams(search).get('design')?.trim()
    return value ? value : undefined
  } catch {
    return undefined
  }
}
