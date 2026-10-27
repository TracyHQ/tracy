/**
 * Where a link goes when the desktop app's window is asked to open it (target=_blank, `window.open`):
 * the page's half of the app's link routing (tasks/todo-desktop-window-shell.md, "Routing table").
 *
 * The app's main process asks; this answers with a DECISION and does nothing itself. The main
 * process checks the decision and carries it out exactly once (`tracy-desktop` src/open-requests.js),
 * so a slow answer can never open a browser tab and an in-app tab both.
 *
 * Pure, so `test/desktop-open.test.mjs` holds the table without a browser.
 *
 * @typedef {{ siteKey: string, copyUrl?: string | null, aliases?: string[] }} SiteRow
 *   one accepted `/api/sites` row, the part read here.
 * @typedef {{ origin: string, currentSite: string | null, sites: readonly SiteRow[] }} OpenContext
 *   `origin`: Tracy's own origin (`location.origin`); `currentSite`: the site the page shows, by
 *   its site key, or null off a site page; `sites`: the viewer's accepted sites.
 * @typedef {{ kind: 'external' }
 *   | { kind: 'navigate', url: string }
 *   | { kind: 'tab', url: string, siteKey: string }
 *   | { kind: 'window', url: string }} OpenDecision
 *   `external`: the system browser. `navigate`: this window goes to `url` (Tracy's origin).
 *   `tab`: the Browser tab of the side card opens `url` (a page of `siteKey`, the site on screen).
 *   `window`: a second app window opens on `url` (Tracy's origin) — the app opens it, not the page.
 * @typedef {{ disposition?: string }} OpenHow
 *   how the link was pressed, as Electron names it: `foreground-tab` is a plain click; anything else
 *   (Cmd/middle click `background-tab`, Shift+click `new-window`) asks for somewhere else
 *   (tasks/evidence/desktop-window-shell/spike-dispositions.json).
 */

import { HOST_PARAM, OPEN_BROWSER, OPEN_PARAM, PAGE_PARAM, sitePathKey } from './browser-link.mjs'

/** @type {OpenDecision} */
const EXTERNAL = { kind: 'external' }

/**
 * @param {unknown} value
 * @returns {URL | null} an http(s) address, or null.
 */
function httpUrl(value) {
  if (typeof value !== 'string' || value === '') return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/**
 * The admin of each CMS Tracy builds (`apps/tracy-web/src/sites/settings.js` `adminPaths`, plus the
 * WordPress sign-in page). Opened in the browser for now: the admin needs its sign-in cookie, which
 * a `SameSite=Lax` cookie does not carry into the side card's frame, nor through the host's
 * `/sidebar/frame` fallback (council 09/10, tasks/todo-desktop-window-shell.md).
 */
const ADMIN_PATH = /^\/(?:wp-admin|wp-login\.php|administrator|_emdash)(?:[/?#]|$)/i

/**
 * The screens of Tracy's own origin a link may move this window to: a site workspace (`/<siteKey>/…`,
 * its conversations `/<siteKey>/s/<id>` included), the creation workspace and `/ops`. Nothing else
 * on the origin: a download, a sign-in door or an auth callback is not a screen, and the main
 * process treats a redirect off the origin as a sign-in leaving (`tracy-desktop` main.js).
 * @param {URL} target - on Tracy's origin.
 */
function isScreen(target) {
  return sitePathKey(target.pathname) !== null || /^\/(?:new|ops)(?:\/|$)/.test(target.pathname)
}

/** @param {unknown} value */
const lower = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')

/**
 * The site an address is a page of, by its site key, or null.
 *
 * Matched on host AND port: `hostsOfSite` (site-reload.mjs) drops the port because a reload only
 * needs to know which tabs to refresh, but a link on another port of the same name is another
 * server. The served address (`copyUrl`) counts with its own port; the site key and each alias count
 * on the default port (a name on the web) or on the served address's port (the same server answers
 * every name of the site — on a laptop stand, all of them on :8080).
 * @param {URL} target
 * @param {readonly SiteRow[]} sites
 * @returns {string | null}
 */
function siteOf(target, sites) {
  const host = target.hostname.toLowerCase()
  for (const row of Array.isArray(sites) ? sites : []) {
    if (typeof row?.siteKey !== 'string') continue
    const served = httpUrl(row.copyUrl)
    if (served !== null && served.hostname.toLowerCase() === host) {
      if (served.port === target.port) return row.siteKey
      continue
    }
    const names = [row.siteKey, ...(Array.isArray(row.aliases) ? row.aliases : [])].map(lower)
    if ((target.port === '' || target.port === served?.port) && names.includes(host)) return row.siteKey
  }
  return null
}

/**
 * The Tracy address that opens `target` on its own site: `/<siteKey>/?open=browser&page=…`, the deep
 * link `browser-link.mjs` reads on arrival. The page keeps its query and hash. An address on an alias
 * keeps that alias (`host=`), so the Browser tab does not swap it for the served address — another
 * host is another cookie jar.
 * @param {URL} target
 * @param {string} siteKey
 * @param {OpenContext} ctx
 */
function siteSwitchOf(target, siteKey, ctx) {
  const row = ctx.sites.find((r) => r.siteKey === siteKey)
  const served = httpUrl(row?.copyUrl)
  const url = new URL(`/${siteKey}/`, ctx.origin)
  url.searchParams.set(OPEN_PARAM, OPEN_BROWSER)
  url.searchParams.set(PAGE_PARAM, `${target.pathname}${target.search}${target.hash}`)
  if (served === null || served.host !== target.host) url.searchParams.set(HOST_PARAM, target.host)
  return url.href
}

/**
 * Where a link goes in the app.
 *
 * A plain click (no `how`, or `foreground-tab`) follows the table. Anything else asks for somewhere
 * else: another site or a Tracy screen opens in a SECOND app window (tasks/todo-desktop-multi-window.md),
 * and whatever a plain click would keep in this window or its side card — a page of the site on
 * screen — keeps the old road to the browser, as does everything already going there.
 * @param {unknown} url - what the window was asked to open.
 * @param {OpenContext} ctx
 * @param {OpenHow} [how]
 * @returns {OpenDecision}
 */
export function routeDesktopOpen(url, ctx, how = {}) {
  const plain = how.disposition === undefined || how.disposition === 'foreground-tab'
  const here = routeHere(url, ctx)
  if (plain) return here
  return here.kind === 'navigate' ? { kind: 'window', url: here.url } : EXTERNAL
}

/**
 * The table, for a plain click.
 * @param {unknown} url
 * @param {OpenContext} ctx
 * @returns {OpenDecision}
 */
function routeHere(url, ctx) {
  const target = httpUrl(url)
  if (target === null) return EXTERNAL
  if (target.origin === ctx.origin)
    return isScreen(target) ? { kind: 'navigate', url: target.href } : EXTERNAL
  const siteKey = siteOf(target, ctx.sites)
  if (siteKey !== null) {
    if (ADMIN_PATH.test(target.pathname)) return EXTERNAL
    if (lower(siteKey) === lower(ctx.currentSite)) return { kind: 'tab', url: target.href, siteKey }
    return { kind: 'navigate', url: siteSwitchOf(target, siteKey, ctx) }
  }
  return EXTERNAL
}
