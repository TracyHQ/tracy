/**
 * `tracy-inbox` — the Inbox of spec #809: notifications about the team of a site and its comments,
 * from every site the viewer holds a seat on, as one right-panel tab and one row in the left column.
 *
 * 🔒 THIS PLUGIN WRITES NO NOTIFICATION AND DECIDES NO RECIPIENT. The log is written by tracy-web at
 * the moment an event happens, and read here through the session-signed doors
 * (`apps/tracy-web/src/notifications/route.js`). Building a row from anything the browser saw would
 * be a second log that disagrees with the first.
 *
 * Modelled on `@tracy/dsh-my-sites`: a side-card tab not tied to a site (`single`), registered
 * through `seatOnlyTab`, because a guest on a public landing has no Inbox and the doors answer them
 * 401. The left-column row registers into `sidebar.nav`, a slot `@tracy/dsh-sidebar` declares, through
 * `slots.inject` (activation order between the two plugins is not bound).
 *
 * The operator's switch is `tab-inbox` (`@tracy/core/ui-switches`): off, the tab type does not exist
 * for customers (`followTabPolicy`, installed by `@tracy/dsh-site-tabs`) and the row is not drawn.
 */
import { type JSX, useSyncExternalStore } from 'react'
import { Inbox as InboxIcon } from 'lucide-react'
import { TabLoadingScope } from '@tracy/ui'
import { mayHoldSeatOnlyTab, readViewer, seatOnlyTab } from '@tracy/core/seat'
import { LIST_PANEL_WIDTH, type SidebarRight, openTabWithMeta, sidebarRightOf } from '@tracy/core/tab-link'
import { siteKeyHere } from '@tracy/core/site-key'
import { uiSwitches } from '@tracy/core/ui-switches'
// The face module alone: `@tracy/core/team` would pull `@tracy/ui`'s entry and its `tokens.css`.
import { TEAM_CHANGED_EVENT } from '@tracy/core/team/face'

import { readPage, readUnread } from './api'
import { InboxTab } from './inbox'
import { InboxNav } from './nav'
import { startUnreadPoller } from './poller'
import type { RowTarget } from './rows'
import { en, NS, type Translate } from './strings'
import { CSS, TAILWIND } from './styles'
import { createTeamNews, onUnreadRise } from './team-news'
import { unread } from './unread'

/** Id of the tab type. Package prefix, as better-sidebar recommends. */
const TAB_ID = 'tracy:inbox'
/** The Team tab of `@tracy/dsh-site-tabs`; its meta is `{ siteKey, member? }`. */
const TEAM_TAB = 'tracy:team'
/** The Site changes tab (`@tracy/dsh-site-tabs`), where a T12 restore row lands. */
const CHANGES_TAB = 'tracy:changes'
/** Heard by `@tracy/dsh-chat-input`: select the Comments view of a session (`comments-open.mjs`). */
const COMMENTS_OPEN_EVENT = 'tracy:comments-open'
/** The switch an operator presses on /ops › User Interface. */
const SWITCH = 'tab-inbox'

interface LocaleRuntime {
  bind: (ns: string) => Translate
  register: (ns: string, dicts: Record<string, Record<string, string>>) => void
}

interface BetterSidebar {
  registerTab: (descriptor: Record<string, unknown>) => () => void
  openTab: (seed: { type: string; title?: string; meta?: unknown }) => void
  updateTab?: (tabId: string, patch: { title?: string; meta?: unknown }) => void
  getSnapshot?: () => { sessionId?: string; state?: unknown }
  closeTab?: (tabId: string) => void
  subscribeState?: (listener: () => void) => () => void
  openTabsOf?: (type: string) => readonly { id: string; type: string; meta?: unknown }[]
}

/**
 * A `team.*` row new to this page tells the Team start card its site's book changed (`team-news.ts`).
 * One per page: the tab and the poll share which rows were already told.
 */
const teamNews = createTeamNews((siteKey) => {
  // The window's own `CustomEvent`: an event made in another realm is refused by its `dispatchEvent`.
  window.dispatchEvent(new window.CustomEvent(TEAM_CHANGED_EVENT, { detail: { siteKey } }))
})

/** Whether the operator left the Inbox on, re-read once `/api/ui` answers. */
function useInboxShown(): boolean {
  const ui = uiSwitches()
  return useSyncExternalStore(ui.subscribe, () => ui.isShown(SWITCH))
}

/** Whether this viewer may have an Inbox: answered once per page by `/auth/me`. */
let viewerAllowed = false
const viewerListeners = new Set<() => void>()
function useViewerAllowed(): boolean {
  return useSyncExternalStore(
    (listener) => {
      viewerListeners.add(listener)
      return () => viewerListeners.delete(listener)
    },
    () => viewerAllowed
  )
}

/**
 * Where a row goes once it is read.
 * - Team rows: the Team tab of that site, on the person the row names (`member`).
 * - A restore (T12): the Site changes tab of that site, where the restore row is lit as new.
 * - Comment rows on this page's site: the chat column's Comments view of the session on screen.
 * - Comment rows on another site: that site's workspace (a page load: each site is its own seat).
 */
function openTarget(target: RowTarget, sidebar: BetterSidebar, right: SidebarRight | undefined): void {
  if (target === null) return
  if (target.kind === 'team') {
    openTabWithMeta(sidebar, right, {
      type: TEAM_TAB,
      meta: target.member ? { siteKey: target.siteKey, member: target.member } : { siteKey: target.siteKey }
    })
    return
  }
  if (target.kind === 'changes') {
    openTabWithMeta(sidebar, right, { type: CHANGES_TAB, meta: { siteKey: target.siteKey } })
    return
  }
  // A comment with its id: the comment's own deep link (the Browser tab opens its page in Edit
  // and takes the card to that comment, `commentDeepLink` in the better-sidebar fork). Same link
  // the comment's ⋮ Copy link hands out, so the Inbox and a pasted link land in the same place.
  if (target.commentId) {
    window.location.assign(commentLink(target.siteKey, target.page ?? '/', target.commentId))
    return
  }
  if (siteKeyHere() === target.siteKey) {
    let sessionId: string | undefined
    try {
      sessionId = right?.mounted?.getSnapshot() ?? sidebar.getSnapshot?.().sessionId
    } catch {
      sessionId = undefined
    }
    if (sessionId) window.dispatchEvent(new CustomEvent(COMMENTS_OPEN_EVENT, { detail: { sessionId } }))
    return
  }
  // A row without a comment id (a deleted comment): the site, and the person opens Comments there.
  window.location.assign(`/${target.siteKey}/`)
}

/** `/<site>/?open=browser&page=<path>&mode=edit&comment=<id>`: the comment deep link's own shape. */
export function commentLink(siteKey: string, page: string, commentId: string): string {
  const path = page.startsWith('/') ? page : `/${page}`
  const query = new URLSearchParams({ open: 'browser', page: path, mode: 'edit', comment: commentId })
  return `/${encodeURIComponent(siteKey)}/?${query.toString().replace(/%2F/gi, '/')}`
}

export const inject = ['betterSidebar', 'locale', 'slots']

export function apply(ctx: {
  effect: (fn: () => (() => void) | void, label?: string) => void
  /** dsh's right column is probed through it, not injected (`sidebarRightOf`). */
  get?: (name: string) => unknown
  betterSidebar: BetterSidebar
  locale: LocaleRuntime
  slots: {
    inject: (name: string, fn: () => unknown) => void
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
}): void {
  ctx.effect(() => {
    if (document.querySelector('style[data-tracy-inbox="1"]')) return
    const el = document.createElement('style')
    el.dataset.tracyInbox = '1'
    // Tailwind first, the hand-written rules after: source order decides when both match.
    el.textContent = `${TAILWIND}\n${CSS}`
    document.head.appendChild(el)
    return () => el.remove()
  }, 'tracy-inbox: styles')

  ctx.effect(() => ctx.locale.register(NS, { en }), 'tracy-inbox: dictionaries')
  const t = ctx.locale.bind(NS)
  const open = (target: RowTarget): void => openTarget(target, ctx.betterSidebar, sidebarRightOf(ctx))
  const openInbox = (): void => {
    if (typeof ctx.betterSidebar.openTab === 'function') ctx.betterSidebar.openTab({ type: TAB_ID })
  }

  // The count: one poller for the page, only for a viewer who may have an Inbox (a guest would only
  // collect a 401 every 30 seconds), and only while the page is in sight (`poller.ts`).
  ctx.effect(() => {
    let stop: (() => void) | undefined
    let disposed = false
    void readViewer().then((viewer) => {
      if (disposed || !mayHoldSeatOnlyTab(viewer, location.hostname)) return
      viewerAllowed = true
      for (const listener of viewerListeners) listener()
      // A count that rose: read the first unread page to see whether a team row arrived — unless the
      // Inbox tab is open, whose own re-read of that page already reaches `teamNews.see`.
      const rise = onUnreadRise({
        readRows: async () => (await readPage('unread', null))?.notifications ?? null,
        see: teamNews.see,
        tabOpen: teamNews.tabOpen
      })
      const poller = startUnreadPoller({
        read: readUnread,
        onCount: (count) => {
          unread.set(count)
          rise(count)
        },
        doc: document,
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (handle) => window.clearTimeout(handle as number)
      })
      unread.setPoke(poller.poke)
      stop = poller.stop
    })
    return () => {
      disposed = true
      stop?.()
      unread.setPoke(() => undefined)
    }
  }, 'tracy-inbox: unread count')

  // 🔒 `seatOnlyTab`, never `registerTab` straight: a guest must not meet a tab whose doors refuse
  // them. Wrapped in `ctx.effect` so a plugin reload disposes the registration.
  ctx.effect(
    () =>
      seatOnlyTab(
        ctx.betterSidebar,
        TAB_ID,
        () => ({
          id: TAB_ID,
          title: () => t('tab.title'),
          icon: (size: number) => <InboxIcon size={size} strokeWidth={1.8} aria-hidden="true" />,
          // After Add site (1) and My Sites (2).
          order: 3,
          single: true,
          preferredWidth: LIST_PANEL_WIDTH,
          component: () => (
            <TabLoadingScope label={t('loading.label')}>
              <InboxTab t={t} open={open} onRows={teamNews.see} onOpen={teamNews.openTab} />
            </TabLoadingScope>
          )
        }),
        { nativeSidebar: () => sidebarRightOf(ctx) }
      ),
    'tracy-inbox: tab'
  )

  // The row below New session. `slots.inject`, because `sidebar.nav` is declared by
  // `@tracy/dsh-sidebar` and the order the two plugins activate in is not bound.
  ctx.slots.inject('sidebar.nav', () =>
    ctx.slots.register(
      {
        name: 'sidebar.nav',
        id: 'tracy-inbox',
        order: 10,
        inject: () => ({ t, openInbox })
      },
      InboxNavSlot
    )
  )
}

/** The slot occupant: drawn only for a viewer who may have an Inbox, and while the switch is on. */
function InboxNavSlot({
  wide,
  t,
  openInbox
}: {
  wide: boolean
  t: Translate
  openInbox: () => void
}): JSX.Element | null {
  const shown = useInboxShown()
  const allowed = useViewerAllowed()
  if (!shown || !allowed) return null
  return <InboxNav wide={wide} t={t} openInbox={openInbox} />
}
