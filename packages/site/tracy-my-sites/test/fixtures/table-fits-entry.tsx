/**
 * Fixture for `../e2e/table-fits-panel.test.mjs` and `../e2e/tab-loading.test.mjs`: the real My Sites plugin in a page, at the width
 * dsh's frame gives its right panel.
 *
 * - this plugin's `apply()`, over a context double that records the tab it registers — so the
 *   width the list is laid out for is the one the real descriptor declares (`preferredWidth`), not
 *   a copy;
 * - the descriptor's own `component()`, rendered into `#panel`, with the stylesheet `apply()`
 *   injects (the build's Tailwind output plus `styles.ts`);
 * - the frame rule itself, `columns.ts` of dsh's `ui-layout` (the fork this repo pins), which turns
 *   a viewport and a left sidebar into the panel's width. Since 14/10/2026 the frame no longer reads
 *   a tab's preferred width (`AppFrame.tsx` passes RIGHTBAR_PREFERRED): the conversation opens at
 *   CHAT_DEFAULT_MIN beside every tab and the panel takes the rest, so the fixture does the same.
 *
 * Only `window.fetch` is mocked: a seat book shaped like the dev one the bug was measured on (five
 * sites, hostnames around thirty characters, the site this page is on managed by the viewer, plus
 * one row for each other state the Site cell shows after the address), each seat-book answer
 * held `?delay=` ms when the address asks (`../e2e/tab-loading.test.mjs`).
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  CHAT_DEFAULT_MIN,
  chatDefault,
  computeColumns,
  RIGHTBAR_PREFERRED,
  SIDEBAR_COLLAPSED,
  SIDEBAR_DEFAULT
} from '../../../../../vendor/tracy/deepseek-harness/packages/client/ui-layout/src/client/columns'
import { apply } from '../../src/client/index'
import { en } from '../../src/client/strings'

interface Descriptor {
  id: string
  preferredWidth?: number
  component: () => unknown
}

declare global {
  interface Window {
    __harness: {
      registered: boolean
      /** Every path the page has fetched, in order: lets a test wait until a request was made. */
      asked: string[]
      preferredWidth: number | null
      /**
       * The frame's columns at one viewport, with the left sidebar open (280) or closed to its rail,
       * plus the conversation width the frame opens at before any drag (CHAT_DEFAULT_MIN).
       */
      columns: (
        viewport: number,
        sidebarOpen: boolean
      ) => { sidebar: number; center: number; rightbar: number; chatDefault: number }
    }
  }
}

const HOUR = 3_600_000
// One clock read for every row: two rows "12 hours ago" must be the same instant, so the table's
// newest-first order keeps them in book order. A clock read per row let the millisecond tick between
// them on a busy runner, and the later row then sorted first (CI flake, 04/10/2026).
const NOW = Date.now()
const created = (ago: number): string => new Date(NOW - ago).toISOString()
// Every CMS the column draws, WordPress (the widest name) included, plus a row the book has no
// platform for.
const ROWS = [
  {
    siteKey: 'acmedemo-wp1015-check.tracy.site',
    role: 'owner',
    platform: 'wordpress',
    createdAt: created(8 * 60_000)
  },
  { siteKey: 'northwind0929.tracy.site', role: 'owner', platform: 'wordpress', createdAt: created(6 * HOUR) },
  {
    siteKey: 'bakeryshop-joomla-a.tracy.site',
    role: 'owner',
    platform: 'joomla',
    createdAt: created(12 * HOUR)
  },
  {
    siteKey: 'studiodemo-wp-test.tracy.site',
    role: 'owner',
    platform: 'emdash',
    createdAt: created(12 * HOUR)
  },
  { siteKey: 'tracy.ai', role: 'admin', platform: null, createdAt: created(14 * 24 * HOUR) }
]
// One row per other state the Site cell carries after the address, oldest last so the rows above
// keep their order: an accepted seat with no agent yet ("Start the agent"), an invitation nobody has
// answered ("Accept" and "Decline"), and a request the viewer sent (the widest state, the asked badge).
// Long addresses on purpose: the state must stay on the address's line while the address truncates.
const STATES = [
  {
    siteKey: 'riverside-clinic-wp-staging.tracy.site',
    role: 'editor',
    platform: 'wordpress',
    createdAt: created(20 * 24 * HOUR),
    status: 'accepted',
    requestedAt: null,
    agent: null
  },
  {
    siteKey: 'harborlight-joomla-invited.tracy.site',
    role: 'developer',
    platform: 'joomla',
    createdAt: created(21 * 24 * HOUR),
    status: 'invited',
    requestedAt: null,
    agent: null
  },
  {
    siteKey: 'meadowfarm-emdash-asked.tracy.site',
    role: 'editor',
    platform: 'emdash',
    createdAt: created(22 * 24 * HOUR),
    status: 'requested',
    requestedAt: created(22 * 24 * HOUR),
    agent: null
  }
]
const SITES = [
  ...ROWS.map((row) => ({
    ...row,
    status: 'accepted',
    requestedAt: null,
    agent: '/',
    copyUrl: `https://${row.siteKey}`
  })),
  ...STATES.map((row) => ({ ...row, copyUrl: `https://${row.siteKey}` }))
]
const TEAM = ROWS.map((row) => ({
  siteKey: row.siteKey,
  platform: row.platform,
  myRole: row.role,
  status: 'accepted',
  seats: [
    {
      id: 'seat-1',
      email: 'owner@example.test',
      displayName: 'Owner Example',
      avatarUrl: null,
      role: row.role,
      status: 'active',
      grantedAt: null,
      grantedBy: null,
      revokedAt: null,
      requestedAt: null,
      scope: 'site'
    }
  ]
}))

// `?delay=<ms>` holds the seat book's answers that long: how the loading test makes the tab slow or
// fast. `/auth/me` stays instant: it decides whether the tab registers at all (`seatOnlyTab`).
const DELAY_MS = Number(new URLSearchParams(window.location.search).get('delay') ?? 0)
const json = (body: unknown, delay = DELAY_MS): Promise<Response> =>
  new Promise((resolve) =>
    window.setTimeout(
      () => resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })),
      delay
    )
  )
window.fetch = ((input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const pathname = new URL(url, window.location.origin).pathname
  harness.asked.push(pathname)
  if (pathname === '/auth/me') return json({ email: 'owner@example.test', defaultSite: null }, 0)
  if (pathname === '/api/sites') return json({ sites: SITES })
  if (pathname === '/api/team') return json({ sites: TEAM })
  return Promise.resolve(new Response('not found', { status: 404 }))
}) as typeof fetch

const harness: Window['__harness'] = {
  registered: false,
  asked: [],
  preferredWidth: null,
  columns: (viewport, sidebarOpen) => {
    // What AppFrame does since 14/10/2026: the tab's preferredWidth is not passed, so the default
    // RIGHTBAR_PREFERRED applies and the panel takes all the conversation's default leaves.
    const sidebar = sidebarOpen ? SIDEBAR_DEFAULT : 0
    const track = sidebarOpen ? SIDEBAR_DEFAULT : SIDEBAR_COLLAPSED
    const cols = computeColumns(
      viewport,
      sidebar,
      chatDefault(viewport, track, RIGHTBAR_PREFERRED),
      SIDEBAR_COLLAPSED,
      RIGHTBAR_PREFERRED
    )
    return { ...cols, chatDefault: CHAT_DEFAULT_MIN }
  }
}
window.__harness = harness

// The English strings the tab ships with: column widths depend on the words in them.
const t = (key: string, params?: Record<string, string | number>): string => {
  const raw = (en as Record<string, string>)[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
}
apply({
  effect: (fn) => {
    fn()
  },
  betterSidebar: {
    registerTab: (descriptor) => {
      const tab = descriptor as unknown as Descriptor
      if (tab.id !== 'tracy:my-sites') return () => undefined
      harness.preferredWidth = tab.preferredWidth ?? null
      createRoot(document.getElementById('panel')!).render(createElement(() => tab.component() as never))
      harness.registered = true
      return () => undefined
    }
  } as never,
  locale: {
    register: () => undefined,
    bind: () => t as never
  },
  slots: {
    inject: () => undefined,
    register: () => undefined
  }
})
