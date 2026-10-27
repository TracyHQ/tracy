/**
 * Which preset a site's workspace should start on, given the site's own CMS.
 *
 * 🔒 THE BUNDLE DEFAULT IS ONE PLATFORM FOR EVERY SITE. `default: designer-wordpress` is right for
 * most customers and wrong for the rest, and until 14/09 nothing re-picked it: an imported Joomla
 * site opened on "Designer · WordPress", so the agent brought WordPress tools into a Joomla
 * webroot. The site's platform is in the seat book (`GET /api/sites` → `platform`); the ROLE the
 * person chose is kept, only the platform half follows the site.
 */

import { readSites } from '../../../tracy-sidebar/src/client/sites.mjs'
import { siteRowFor } from '@tracy/core/site-key'

const PLATFORMS = ['wordpress', 'joomla', 'emdash']
const DEFAULT_ROLE = 'designer'

/**
 * @param {string} current - the preset the session is on, `designer-wordpress`.
 * @param {string|null|undefined} platform - the site's platform from the seat book.
 * @param {readonly string[]} roster - preset ids dsh can actually select.
 * @returns {string|null} the preset to switch to, or null when nothing should change.
 */
export function presetForSite(current, platform, roster) {
  if (!platform || !PLATFORMS.includes(platform)) return null
  let role = DEFAULT_ROLE
  for (const p of PLATFORMS) {
    if (current.endsWith(`-${p}`)) {
      if (p === platform) return null
      role = current.slice(0, -(p.length + 1))
      break
    }
  }
  const target = `${role}-${platform}`
  return roster.includes(target) ? target : null
}

/**
 * The site this page is on — the address first (`/<siteKey>/…`, a siteKey carries a dot), the
 * `tracy_site` pointer cookie second. Same rule as `currentSiteKey` in tracy-site-build-core.
 *
 * @param {string} pathname - `location.pathname`.
 * @param {string} cookie - `document.cookie`.
 * @param {string} [basePathname] - the `<base href>` pathname; the creation workspace (`/new/`)
 *   names no site, whatever pointer a previous page left behind.
 * @returns {string|null}
 */
export function siteKeyFrom(pathname, cookie, basePathname = '') {
  if (
    basePathname === '/new/' ||
    pathname === '/new' ||
    pathname.startsWith('/new/') ||
    basePathname === '/widget/native/' ||
    pathname === '/widget/native' ||
    pathname.startsWith('/widget/native/')
  )
    return null
  const fromPath = /^\/([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?:\/|$)/.exec(pathname)
  if (fromPath) return fromPath[1]
  const m = /(?:^|;\s*)tracy_site=([^;]+)/.exec(cookie)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Whether the site-platform follow should run now, for the current session.
 *
 * 🔒 ONCE PER SESSION, NOT ONCE PER PAGE — and that difference is an agent turn holding the wrong
 * tool set. Until 19/09 the caller kept a boolean `followed` flag set on the first run, so a second
 * chat opened on the same site in the same tab was never followed: it started on the bundle
 * default and kept it. Measured on `--site-demojlnam--` (a Joomla site, `site.platform = joomla`),
 * three sessions 20 seconds apart in one page:
 *
 *   session 1 (12:29:31.659) → `designer-joomla` after 179 ms
 *   session 2 (12:29:51.979) → NEVER changed; its turn: 19 steps · 127.3 s · 38,913 new
 *                              tokens, running WordPress tools on a Joomla webroot
 *   session 3 (12:29:51.397) → changed only at 12:32:18, when the page was reloaded
 *
 * No error, no log, no sign on screen.
 *
 * ⚠ A SET, NOT A VALUE — the 19/09 draft used a single value, so it switched the preset 7 TIMES
 * for one session. `null` (no session yet) is a valid identity too, and the page flips between
 * `null` ↔ `'<id>'` every time `sessions.list` changes: remembering only "the latest" makes every
 * flip a new follow, i.e. one more `GET /api/sites` plus one more `agentPresets.select` RPC. Measured on
 * `--site-demojjjj--` session `979571fd`: **7 `agent-preset/selected` calls in 1.5 s** for
 * a single session. The result was right but noisy, and the noise came from here. With a SET each
 * identity is followed exactly once in a page's life, and a page opens only a few sessions.
 *
 * @param {object} state
 * @param {ReadonlySet<string|null>} state.followed - identities already followed in this page.
 * @param {string|null} state.sessionId - the current session; `null` = no session yet.
 * @param {boolean} state.picked - the user picked a preset themselves; a person's choice is never overridden.
 * @param {boolean} state.locked - the session has run at least one turn; dsh refuses to change its preset.
 * @returns {boolean}
 */
export function shouldFollowSite({ followed, sessionId, picked, locked }) {
  if (picked || locked) return false
  return !followed.has(sessionId)
}

/**
 * Which CMS a site runs, from the page's one shared `GET /api/sites` answer (`tracy-sidebar`'s
 * `readSites`).
 *
 * 🔒 THE PICKER HEARS EVERY `sessions.list` CHANGE, AND A TURN IS DOZENS OF THEM. Until issue #340
 * each one asked `/api/sites` again: measured 24/09 on dev, 53 slow asks in one 10 s WordPress turn
 * and 140 in one 53 s EmDash turn, each queued behind the last (up to 7.9 s and 18.6 s). Reading
 * through the shared answer, asks made while one is on the wire share it and one answer serves
 * every change for `SITES_FRESH_MS`. Nothing is kept here: a site still being provisioned answers
 * `null` now and its CMS on a later read, and a site deleted and made again under the same key
 * (`tracy:sites-changed` drops the shared answer) is read afresh.
 *
 * @param {import('../../../tracy-sidebar/src/client/sites.mjs').SitesOptions} [options]
 * @returns {(siteKey: string) => Promise<string|null>}
 */
export function sitePlatformReader(options = {}) {
  return async (siteKey) => {
    const { status, body } = await readSites(options)
    if (status < 200 || status >= 300) return null
    const rows =
      /** @type {{ sites?: { siteKey?: unknown, aliases?: unknown, platform?: unknown }[] } | null} */ (body)
        ?.sites
    // By key or any name: the page's address carries the name a rename gave the site.
    const row = siteRowFor(rows, siteKey)
    return typeof row?.platform === 'string' ? row.platform : null
  }
}
