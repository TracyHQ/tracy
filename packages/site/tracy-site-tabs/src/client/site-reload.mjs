/**
 * Which Browser tabs a finished turn may reload — the page's half of "the site changed, so show it".
 *
 * The host decides THAT a turn changed a site (`src/host/turn.mjs`); this decides WHICH open tabs
 * are showing it. Both halves are needed and neither can do the other's job: the log knows the tools
 * that ran and nothing about the layout, the layout knows the addresses and nothing about the tools.
 *
 * 🔒 WHOSE TABS. Only the tabs in THIS browser's side card, and only in the conversation that went
 * idle — the sidebar's layout is per viewer (it lives in their own localStorage) and its tab ids are
 * per-session counters, so `tab:3` names a different tab in every conversation. Two people with the
 * same site open therefore reload independently, each when their own conversation finishes a turn,
 * and a tab belonging to another conversation is never named because it is not in this state.
 *
 * 🔒 WHICH SITE. A tab matches on the HOSTNAME of the address it holds, against the addresses the
 * site answers at. A tab on another site keeps its page: that site's own turn will reload it.
 *
 * Pure, so `test/turn.test.mjs` can hold these rules without a browser.
 */
import { mainSessionOf } from '@tracy/core/session'

/**
 * @typedef {{ readonly kind?: string, readonly entries?: readonly ({ readonly type?: string, readonly event?: { readonly type?: string } } | undefined)[] }} EventChange
 *   one change of a session's event window — dsh's `SessionEventChange`, the fields read here.
 * @typedef {{ getSnapshot(): { readonly revision?: number, readonly change?: EventChange }, subscribe(listener: () => void): () => void }} EventSourceLike
 *   a session binding's `eventSource`.
 * @typedef {{
 *   readonly list: {
 *     getSnapshot(): { readonly byId: Readonly<Record<string, { readonly retainedBy?: Readonly<Partial<Record<string, number>>> } | undefined>> },
 *     subscribe(listener: () => void): () => void
 *   },
 *   binding?(id: string): { readonly eventSource?: EventSourceLike } | undefined
 * }} SessionsLike
 *   the slice of dsh's `ctx.sessions` this reads.
 */

/**
 * Whether one change of a session's event window is a turn ending as it happens.
 *
 * Only an APPEND counts: that is an event arriving live. A `replace` (the history the page loads on
 * arrival, or reads again after a reconnect) and a `prepend` (older history scrolled into view)
 * carry the `turn/end` of turns long over, and answering those would reload the preview every time
 * the conversation opens. `turn/end` is written once per turn whatever ended it — the answer, a
 * stop, an error — and it is the same event the host's `turn.mjs` reads the turn back from.
 * @param {EventChange | undefined} change - the event window's latest change.
 * @returns {boolean}
 */
export function turnEndedIn(change) {
  if (change?.kind !== 'append' || !Array.isArray(change.entries)) return false
  return change.entries.some((entry) => entry?.type === 'event' && entry.event?.type === 'turn/end')
}

/**
 * Follow the conversation on screen and call `onEnd` each time one of its turns ends.
 *
 * Only the conversation the main view SHOWS is followed, because a tab id means nothing outside the
 * conversation that minted it — a turn finishing out of sight is left alone rather than reloaded by
 * guesswork. A switch moves the subscription to the conversation now on screen.
 *
 * 🔒 THE TURN'S END IS READ FROM ITS OWN LOG, NOT FROM A `running` FLAG. On dsh 0.1.6-alpha.2 no
 * running flag reaches a seat: every one of them follows the host's `api-session/status` event, and
 * the login gateway (`dsh-passwords`) forwards no `emit` frame of `$events` to a non-admin — so the
 * sessions list, `uiSession.sessionStatus` and the session face all say `running: false` from the
 * first step to the last. Measured 23/09 on an EmDash site whose heading the agent had just
 * rewritten: 0 of 214 snapshots said `true`, the turn door was never asked, the preview never
 * reloaded. The session's own event stream is the one live feed a seat receives.
 *
 * 🔒 WHICH CONVERSATION IS ON SCREEN is `mainSessionOf`, never `list.current` — that field left the
 * sessions list in 0.1.6-alpha.2, and reading it yields `undefined` on every snapshot.
 * @param {SessionsLike} sessions - `ctx.sessions`.
 * @param {(sessionId: string) => void} onEnd - called once per ended turn, with that conversation's id.
 * @returns {() => void} stop following.
 */
export function followTurnEnds(sessions, onEnd) {
  /** @type {{ id: string, stop: () => void } | undefined} */
  let followed
  const follow = () => {
    const id = mainSessionOf(sessions.list.getSnapshot())
    if (followed !== undefined && followed.id === id) return
    followed?.stop()
    followed = undefined
    if (id === undefined) return
    // The main view retains what it shows, so its binding exists; when it does not yet, the next
    // list change tries again.
    const source = sessions.binding?.(id)?.eventSource
    if (source === undefined) return
    /** @type {number | undefined} */
    let seen = source.getSnapshot().revision
    const stop = source.subscribe(() => {
      const snapshot = source.getSnapshot()
      if (snapshot.revision !== undefined && snapshot.revision === seen) return
      seen = snapshot.revision
      if (turnEndedIn(snapshot.change)) onEnd(id)
    })
    followed = { id, stop }
  }
  follow()
  const stopList = sessions.list.subscribe(follow)
  return () => {
    stopList()
    followed?.stop()
    followed = undefined
  }
}

/**
 * The hostname of an address, lowercased, or null when it is not one.
 * @param {unknown} value - an address, or anything else.
 * @returns {string | null}
 */
function hostOf(value) {
  try {
    return typeof value === 'string' && value !== '' ? new URL(value).hostname.toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * The hostnames one site answers at.
 *
 * Two sources, because they disagree on purpose: the site key is the name the seat book and the
 * agent use, while `copyUrl` is the address this deployment actually serves the site at — the same
 * string `tracy-add-site` opens a tab with. On production they are the same host; on a laptop the
 * key is `demo.tracy.site` and the address is `http://demo.localhost:8080/`. Matching either is what
 * makes the reload work on both without the page knowing which deployment it is.
 * @param {string} siteKey - the site the turn changed.
 * @param {readonly { siteKey?: string, copyUrl?: string | null, aliases?: string[] }[]} rows - `/api/sites` rows.
 * @returns {Set<string>} lowercased hostnames; empty when the site names none.
 */
export function hostsOfSite(siteKey, rows) {
  const hosts = new Set()
  const key = typeof siteKey === 'string' ? siteKey.trim().toLowerCase() : ''
  // A site key is a hostname (`fijitrips.example`), so it is an address in its own right.
  if (key.includes('.')) hosts.add(key)
  for (const row of Array.isArray(rows) ? rows : []) {
    const names = [row?.siteKey, ...(Array.isArray(row?.aliases) ? row.aliases : [])]
    if (!names.some((name) => typeof name === 'string' && name.trim().toLowerCase() === key)) continue
    const host = hostOf(row.copyUrl)
    if (host !== null) hosts.add(host)
    for (const alias of row.aliases ?? []) {
      const aliasHost = hostOf(`https://${alias}`)
      if (aliasHost !== null) hosts.add(aliasHost)
    }
  }
  return hosts
}

/**
 * Every open preview (`tracy:browser`) showing one of `hosts`.
 *
 * The side card answers the open previews itself (`openTabsOf`, better-sidebar 0.21.1-tracy.1):
 * the native tabs of dsh's right column — whatever pane or floating panel holds them — followed by
 * its own bottom panel's, so no layout is walked here. A native preview keeps its address in
 * `meta.url` and follows its navigation there; a bottom-panel one, or a record written before, in
 * `path`.
 * @param {readonly { id?: unknown, type?: unknown, path?: unknown, meta?: unknown }[] | undefined} tabs -
 *   `openTabsOf('tracy:browser')`.
 * @param {ReadonlySet<string>} hosts - lowercased hostnames the site answers at.
 * @returns {string[]} tab ids, in the order given, without repeats.
 */
export function browserTabsOn(tabs, hosts) {
  /** @type {string[]} */
  const found = []
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    if (!tab || tab.type !== 'tracy:browser' || typeof tab.id !== 'string') continue
    const url = /** @type {{ url?: unknown } | undefined} */ (tab.meta)?.url
    const host = hostOf(typeof url === 'string' && url !== '' ? url : tab.path)
    if (host === null || !hosts.has(host) || found.includes(tab.id)) continue
    found.push(tab.id)
  }
  return found
}

/**
 * @typedef {{
 *   getSnapshot(): { readonly sessionId?: string },
 *   openTabsOf(type: string): readonly { id?: unknown, type?: unknown, path?: unknown, meta?: unknown }[],
 *   reloadTab(tabId: string, mode?: string): void
 * }} ReloadingSidebar
 *   the slice of the side card service a reload reads.
 */

/**
 * Ask every open Browser tab on a changed site to reload, once per change, across the passes a
 * turn's end makes (the site key alone first, then the served addresses `/api/sites` names).
 *
 * 🔒 ASKED, NOT DONE: ONE OWNER PER TAB (30/09/2026, `fix/comment-reload-once`). This names every tab
 * on the site — a change can span pages, so a tab on another page is asked too — and each tab is
 * asked exactly once. Whether the tab reloads is the tab's own call (the better-sidebar fork's
 * `BrowserView`, `refreshStep` 'reload-request', 0.21.1-tracy.22+): the tab a comment was sent from
 * has already reloaded for this change from its own turn events, and a tab with a comment box open
 * holds with "New version ready" instead of losing what the person typed. Only the tab knows either
 * fact, so the rule lives there and not here.
 *
 * The tabs are read AFTER the turn door answered, never before: the person can switch conversation
 * while the question is in flight, and the previews open then are the new conversation's. Reloading
 * what was open before the answer would refresh a stranger's page in the new one.
 * @param {ReloadingSidebar} sidebar - the side card service.
 * @param {string} sessionId - the conversation whose turn ended.
 * @param {string | undefined} mode - the turn door's refresh mode (`style` spares the document).
 * @returns {(hosts: ReadonlySet<string>) => void} one pass over the tabs on these hosts.
 */
export function siteTabReloader(sidebar, sessionId, mode) {
  /** @type {Set<string>} */
  const asked = new Set()
  return (hosts) => {
    if (sidebar.getSnapshot().sessionId !== sessionId) return
    for (const tabId of browserTabsOn(sidebar.openTabsOf('tracy:browser'), hosts)) {
      if (asked.has(tabId)) continue
      asked.add(tabId)
      sidebar.reloadTab(tabId, mode)
    }
  }
}
