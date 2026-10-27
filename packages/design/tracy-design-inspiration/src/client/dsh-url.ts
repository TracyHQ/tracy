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
 * The address that opens the creation workspace with a creation intent: what a press of "Create
 * with <platform>" navigates to from INSIDE a site's workspace, so a new site is never made
 * from — or into — the one in sight. tracy-web reads the two parameters (`buildIntentOf`) and
 * sends the browser on to the Add site wizard with the chosen template.
 *
 * The two parameter names are the wire, not the destination: they still read `inspiration` and
 * `platform` because `buildIntentOf` and the intent cookie spell them that way on both sides.
 * Renaming them is a four-file change for no behaviour, so the names stayed when the destination
 * moved (Akemi, 24/09/2026: one creation flow).
 * @param inspiration - the design inspiration's id.
 * @param platform - `joomla` or `wordpress`.
 * @returns a root-absolute address on this origin.
 */
export function onboardingBuildUrl(inspiration: string, platform: string): string {
  const query = new URLSearchParams({ inspiration, platform })
  return `${ONBOARDING_MOUNT}/?${query.toString()}`
}

/**
 * Write the chosen template onto the address, without navigating.
 *
 * A press inside the creation workspace opens the Add site tab through the side card's own API —
 * no navigation, so nothing touches the address. But the wizard reads its template from
 * `?design=` (`tracy-add-site`'s `chosenDesign`), which is the seam the OTHER way in already
 * uses: a press from inside a site's workspace navigates to `/new/?inspiration=…`, and tracy-web
 * redirects it to `…?tab=tracy:add-site&design=…`.
 *
 * Without this line the two ways in disagree: from a site's workspace the customer's pick
 * arrives, from the creation workspace it does not and the wizard falls back to its default
 * template — a customer who chose Tracy SaaS would be handed Tracy Business, with nothing on
 * screen saying so.
 *
 * `replaceState`, never `pushState`: this is the same address the customer is already on, with
 * one more thing said about it. Back must keep meaning the previous page, and `tracy-tab-link`'s
 * mirror keeps `design` (it strips only `inspiration`/`platform`, which are an intent spent on
 * arrival).
 *
 * @param design - the template id the press chose.
 */
export function markChosenDesign(design: string): void {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get('design') === design) return
    url.searchParams.set('design', design)
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    // An address this cannot read is one the wizard cannot read either: the fallback template is
    // then the honest outcome, and it is not worth breaking the press over.
  }
}
