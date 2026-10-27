/**
 * Which CMS the session in front of you is working on, so a Build plugin can tell whether the tabs
 * it registers belong to THIS site.
 *
 * 🔒 WHY THIS EXISTS. The image carries all three Build plugins, and each registers a Build tab and
 * a Live site tab unconditionally. A customer with one EmDash site therefore opens the + menu and
 * finds THREE tabs called Build and THREE called Live site, told apart only by a small platform
 * icon — and two of each are for a CMS their site does not run. Measured 19/09/2026 on
 * `demoemdasbh.tracy.test`: six rows for one site, and none said which one was its own.
 *
 * ⚠ THE MENU DISABLES, IT DOES NOT HIDE, and that is the sidebar's rule rather than a choice made
 * here: `TabDescriptor.hidden` is a static boolean read once at registration, while `available` is
 * the predicate the + menu re-asks (`buildNewTabOptions` → `disabled`). So the two foreign rows
 * stay visible and greyed. That is also the answer this repo already gives elsewhere — the Create
 * platform list keeps a platform visible when the fleet cannot install it yet, because hiding a
 * road makes it invisible to exactly the people who care.
 *
 * ⚠ THE NATIVE GUIDE HIDES (better-sidebar 0.21.1-tracy.1). DSH's right-column guide asks the same
 * `available` for the on-screen session and leaves an unavailable kind OFF the guide rather than
 * greyed — the guide has no disabled state. Measured 26/09/2026 on the native profile: before the
 * side card honoured `available` there, the guide listed Build ×3 and Live site ×3 on every page.
 *
 * ⚠ AND IT ANSWERS `true` WHILE IT DOES NOT KNOW. A predicate that guessed `false` before the
 * lookup lands would grey out the one tab the customer wants, for as long as the fetch takes. The
 * cache is filled once when the plugin activates, so by the time a menu opens it is warm; an
 * unknown site keeps every platform offerable, which is the state this code replaced anyway.
 */

import { readSites } from '../../../../ui/tracy-sidebar/src/client/sites.mjs'

/**
 * `/site/demowp` → `demowp`. `null` for the creation workspace and anything else.
 * @param {string|undefined|null} cwd
 * @returns {string|null}
 */
export function labelOfCwd(cwd) {
  if (typeof cwd !== 'string') return null
  const m = /^\/site\/([A-Za-z0-9][A-Za-z0-9._-]*)\/?$/.exec(cwd.trim())
  return m ? m[1] : null
}

/** label → { platform, address }, filled once per page by `loadPlatforms`. */
const known = new Map()

/**
 * Remember what the seat book said.
 *
 * ⚠ THE ROWS ARE KEYED BY `siteKey`, NOT BY `label`, and the first draft of this file read
 * `row.label` — a field `GET /api/sites` does not send. It stored nothing, `offersTabsFor` answered
 * `true` for every site because every site was unknown, and the tab filter filtered nothing while
 * looking exactly like it worked. Read straight off that door on 19/09/2026
 * (`apps/tracy-web/src/seats/route.js`): each row is `{ siteKey, platform, copyUrl, role, … }`.
 * The label is the first part of the siteKey — which is also the site's folder name.
 *
 * `copyUrl` comes along because the Live site tab needs it: it is the address the seat book computes
 * for THIS deployment, port included, and a tab with no build job has nowhere else to learn it.
 *
 * @param {{siteKey?: unknown, platform?: unknown, copyUrl?: unknown}[]} rows
 */
export function rememberPlatforms(rows) {
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = typeof row?.siteKey === 'string' ? row.siteKey : ''
    const label = key.split('.')[0]
    if (label === '') continue
    known.set(label, {
      platform: typeof row?.platform === 'string' ? row.platform : null,
      address: typeof row?.copyUrl === 'string' ? row.copyUrl : null
    })
  }
}

/**
 * The address the seat book holds for the site a session stands in, or `null`.
 * @param {string|undefined} cwd
 * @returns {string|null}
 */
export function addressOfSite(cwd) {
  const label = labelOfCwd(cwd)
  return label === null ? null : (known.get(label)?.address ?? null)
}

/**
 * Should a Build plugin for `platform` offer its tabs to the session standing in `cwd`?
 *
 * @param {string|undefined} cwd - the session's working directory.
 * @param {string} platform - the plugin's own platform.
 * @returns {boolean} `true` when it belongs, when no site is named, or when the site is unknown.
 */
export function offersTabsFor(cwd, platform) {
  const label = labelOfCwd(cwd)
  if (label === null) return true
  const found = known.get(label)?.platform
  return found === undefined || found === null ? true : found === platform
}

/**
 * Should a Build plugin for `platform` LIST its tabs (native guide, + menu) for the session in `cwd`?
 *
 * Stricter than {@link offersTabsFor} in one place: a session that names NO site lists nothing.
 * There is no site for Live site to show, and a site that does not exist yet is started from Add
 * site / Design inspirations — which choose the platform and open the Build tab themselves
 * (`openTab` ignores `available`) — so three look-alike "Build" rows, one per CMS, would offer a
 * choice the customer has no way to make there. An unknown site still lists (the rule above).
 *
 * @param {string|undefined} cwd - the session's working directory.
 * @param {string} platform - the plugin's own platform.
 * @returns {boolean} `true` when the session stands in a site that runs `platform`, or one not learned yet.
 */
export function listsTabsFor(cwd, platform) {
  return labelOfCwd(cwd) !== null && offersTabsFor(cwd, platform)
}

/**
 * Fill the cache from the page's one shared `/api/sites` answer (`readSites`): the three Build
 * plugins each warm on load, and every other plugin reads the same answer (#340). Failure is silent
 * and leaves every platform offerable.
 * @param {typeof fetch} [fetchImpl]
 */
export async function loadPlatforms(fetchImpl) {
  const { status, body } = await readSites(fetchImpl ? { fetch: fetchImpl } : {})
  // The menu keeps offering everything, exactly as it did before this file existed.
  if (status < 200 || status >= 300) return
  rememberPlatforms(/** @type {{ sites?: unknown[] } | null} */ (body)?.sites ?? [])
}
