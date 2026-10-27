/**
 * Fixture for `../e2e/site-publish-screen.test.mjs`: the site's Publish tab and its Settings tab as
 * this plugin registers them, opened from the real My Sites row menu.
 *
 * - this plugin's own `apply()`, over a side card double that keeps what it registers and, like
 *   dsh's right column, holds ONE tab of a type: a second `openTab` of that type is the same tab
 *   with new meta (the retarget `SiteTab` follows);
 * - the real `MoreMenu` of `@tracy/dsh-my-sites` in `#menu`, its presses carried by the real
 *   `runMoreAction` of My Sites (`site-actions.ts`), so "Export site as ZIP" and "Sync from live"
 *   reach the tab with the `publishEntry` My Sites gives them;
 * - the stylesheet `apply()` injects, so what is measured is what the build paints.
 *
 * Only `window.fetch` is mocked: a small server that answers the doors the two tabs use and keeps
 * its own state per site (`window.__server`), so the test decides role, publish state and the
 * site's own domain.
 */
import { createElement, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { MoreMenu, type MoreSite } from '../../../tracy-my-sites/src/client/more'
import { runMoreAction } from '../../../tracy-my-sites/src/client/site-actions'
import { en as mySitesEn } from '../../../tracy-my-sites/src/client/strings'
import { apply } from '../../src/client/index'
import { en } from '../../src/client/strings'

interface Tab {
  id: string
  type: string
  title: string
  meta: Record<string, unknown>
}
interface Descriptor {
  id: string
  hidden?: boolean
  title: () => string
  component: (props: { tab: Tab }) => unknown
}
interface SiteState {
  role: string
  publish: 'draft' | 'published'
  operation: Record<string, unknown> | null
  pending: Record<string, unknown> | null
}

declare global {
  interface Window {
    __tabs: Record<string, Descriptor>
    __open: Tab[]
    __opened: { type: string; meta: unknown }[]
    __calls: string[]
    __server: Record<string, SiteState>
    __row: (site: Partial<MoreSite>) => void
    __close: () => void
  }
}

const translate =
  (dictionary: Record<string, string>) =>
  (key: string, params?: Record<string, string | number>): string => {
    const raw = dictionary[key] ?? key
    if (!params) return raw
    return raw.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
  }
const t = translate(en as Record<string, string>)

// ── the server ──────────────────────────────────────────────────────────────────────────────────

window.__server = {}
window.__calls = []
const siteOf = (key: string): SiteState =>
  (window.__server[key] ??= { role: 'owner', publish: 'draft', operation: null, pending: null })
const publishing = (site: SiteState): Record<string, unknown> => ({
  publish: site.publish,
  mayPublish: site.role === 'owner' || site.role === 'admin',
  operation: site.operation
})
const reply = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

window.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const { pathname } = new URL(url, window.location.origin)
  const method = init.method ?? 'GET'
  window.__calls.push(`${method} ${pathname}`)
  if (pathname === '/auth/me') return reply({ email: 'owner@example.test' })
  if (pathname === '/api/sites')
    return reply({
      sites: Object.entries(window.__server).map(([siteKey, site]) => ({
        siteKey,
        role: site.role,
        status: 'accepted',
        platform: 'wordpress'
      }))
    })
  const door = /^\/api\/sites\/([^/]+)\/(settings|state|go-live)$/.exec(pathname)
  if (door === null) return reply({ code: 'NOT_FOUND' }, 404)
  const siteKey = decodeURIComponent(door[1])
  const site = siteOf(siteKey)
  if (door[2] === 'state') return reply({ plan: 'standard', ...publishing(site) })
  if (door[2] === 'go-live') {
    const { op } = JSON.parse(String(init.body)) as { op: 'live' | 'draft' }
    site.publish = op === 'live' ? 'published' : 'draft'
    return reply({ op, ...publishing(site) })
  }
  return reply({
    siteKey,
    siteUrl: `https://${siteKey}/`,
    adminUrl: `https://${siteKey}/wp-admin/`,
    platform: 'wordpress',
    role: site.role,
    state: 'ready',
    values: { title: `Title of ${siteKey}`, version: '7.0' },
    displayName: siteKey,
    addressChange: {
      allowed: site.role === 'owner',
      managedDomain: 'tracy.site',
      status: site.pending ? 'pending' : 'ready',
      ...(site.pending ? { pending: site.pending } : {})
    },
    publishing: publishing(site)
  })
}) as typeof fetch

// ── the side card: one tab of a type, retargeted by a second open ───────────────────────────────

window.__tabs = {}
window.__open = []
window.__opened = []
const listeners = new Set<() => void>()
const changed = (): void => {
  window.__open = [...window.__open]
  for (const listener of listeners) listener()
}
const noop = (): (() => void) => () => undefined
const sidebar = {
  registerTab: (descriptor: unknown) => {
    const d = descriptor as Descriptor
    window.__tabs[d.id] = d
    return () => undefined
  },
  updateTab: (tabId: string, patch: { title?: string; meta?: Record<string, unknown> }) => {
    window.__open = window.__open.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab))
    changed()
  },
  openTab: (seed: { type: string; meta?: Record<string, unknown> }) => {
    window.__opened.push({ type: seed.type, meta: seed.meta })
    const meta = seed.meta ?? {}
    const held = window.__open.find((tab) => tab.type === seed.type)
    window.__open = held
      ? window.__open.map((tab) => (tab === held ? { ...tab, meta } : tab))
      : [...window.__open, { id: `t-${seed.type}`, type: seed.type, title: '', meta }]
    changed()
  }
}

apply({
  // An effect this fixture has no double for (the Browser link, turn ends, the tab policy) may throw;
  // it is not what is under test, and the tab registrations after it must still run.
  effect: (fn) => {
    try {
      fn()
    } catch {
      /* not under test */
    }
  },
  get: () => undefined,
  betterSidebar: sidebar as never,
  locale: { register: noop, bind: () => t as never } as never,
  sessions: { list: { getSnapshot: () => ({ byId: {} }), subscribe: noop } } as never
})

/** Every open tab, each in a pane of its own under its title, as the side card stacks them. */
function Panes(): unknown {
  const open = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => window.__open
  )
  return open.map((tab) => {
    const Body = window.__tabs[tab.type].component as (props: { tab: Tab }) => never
    return createElement(
      'section',
      { key: tab.id, 'data-pane': tab.type, 'data-pane-title': tab.title, className: 'pane' },
      createElement(Body, { tab })
    )
  })
}
flushSync(() =>
  createRoot(document.getElementById('panel') as HTMLElement).render(createElement(Panes as never))
)
window.__close = () => {
  window.__open = []
  window.__opened = []
  window.__calls = []
  changed()
}

// ── the My Sites row menu ───────────────────────────────────────────────────────────────────────

const menu = createRoot(document.getElementById('menu') as HTMLElement)
window.__row = (site) => {
  const row = {
    siteKey: 'acme.tracy.site',
    role: 'owner',
    status: 'accepted',
    liveUrl: 'https://acme.tracy.site/',
    adminUrl: 'https://acme.tracy.site/wp-admin/',
    lastOwner: false,
    ...site
  } as MoreSite
  flushSync(() =>
    menu.render(
      createElement(
        'div',
        { className: 'tracy-mysites', 'data-row': row.siteKey },
        createElement(MoreMenu, {
          key: JSON.stringify(row),
          site: row,
          onAction: (action) =>
            runMoreAction(
              { siteKey: row.siteKey, name: row.siteKey, liveUrl: row.liveUrl, platform: 'wordpress' },
              action,
              {
                sidebar: sidebar as never,
                right: () => undefined,
                copied: () => undefined,
                leave: () => undefined,
                remove: () => undefined
              }
            ),
          t: translate(mySitesEn as Record<string, string>) as never
        })
      )
    )
  )
}
