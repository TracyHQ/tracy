import { inCreationWorkspace } from '@tracy/core/site-key'
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

import { siteKeyHere } from '@tracy/core/site-key'

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
 * The site this page is on, by the one rule in `@tracy/core/site-key`: the address first, the
 * pointer cookie the Worker plants second, and NO site on the creation workspace (`/new/`), where
 * that cookie only names the last site visited (bug 01/10/2026).
 */
export function currentSiteKey(): string | null {
  return siteKeyHere()
}

/** The mount tracy-web serves a signed-in viewer's own CREATION workspace under (`apps/tracy-web/src/workspace/scope.js`). */
export const ONBOARDING_MOUNT = '/new'

/**
 * Whether this page is the viewer's creation workspace — the one under `/new/`, where a site is
 * made from and no site is mounted. Read off the page base rather than the address: dsh writes
 * the session to the path (`/new/s/<id>`), and the base is what stays.
 * @returns true under `/new/`.
 */
export function inOnboarding(): boolean {
  return inCreationWorkspace({ pathname: location.pathname, basePathname: new URL(pageBase()).pathname })
}

/**
 * The address that opens the creation workspace with a build intent: what a press of "Create
 * with <platform>" navigates to from INSIDE a site's workspace, so a new site is never built
 * from — or into — the one in sight. tracy-web reads the two parameters (`buildIntentOf`) and the
 * side card's `tracy-tab-link` opens the Build tab on arrival.
 * @param inspiration - the design inspiration's id.
 * @param platform - `joomla` or `wordpress`.
 * @returns a root-absolute address on this origin.
 */
export function onboardingBuildUrl(inspiration: string, platform: string): string {
  const query = new URLSearchParams({ inspiration, platform })
  return `${ONBOARDING_MOUNT}/?${query.toString()}`
}
