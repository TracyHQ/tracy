/**
 * Fixture for `../e2e/team-roster.test.mjs`: the real Team tab in a page, over a book the test sets.
 *
 * - this plugin's own `apply()`, over a context double that records every tab it registers, so the
 *   tab under test is the real `SiteTab` frame around the real `TeamView` and `Roster`;
 * - the stylesheet `apply()` injects (the build's Tailwind output, container queries included);
 * - `#panel` stands in for dsh's tab body; the test sets its width to try every tier;
 * - a second plugin's sheet loaded after ours, as in dsh's page (see `later` below).
 *
 * Only `window.fetch` is mocked: `/api/team` answers `window.__team.site`, `/auth/me` answers
 * `window.__team.me`, `/api/sites` lists the one site at the viewer's role.
 */
import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { apply } from '../../src/client/index'
import { en } from '../../src/client/strings'

interface Descriptor {
  id: string
  component: (props: {
    tab: { id: string; title: string; meta: Record<string, unknown> }
    visible?: boolean
  }) => unknown
}
interface TeamFixture {
  me: string
  site: { siteKey: string; myRole: string; seats: unknown[] }
}

declare global {
  interface Window {
    __team: TeamFixture
    __tabs: Record<string, Descriptor>
    __mountTeam: () => void
  }
}

function answer(pathname: string): { status: number; body: unknown } {
  const { me, site } = window.__team
  if (pathname === '/auth/me') return { status: 200, body: { email: me } }
  if (pathname === '/api/sites')
    return {
      status: 200,
      body: {
        sites: [{ siteKey: site.siteKey, role: site.myRole, status: 'accepted', platform: 'wordpress' }]
      }
    }
  if (pathname === '/api/team')
    return { status: 200, body: { sites: [{ platform: 'wordpress', status: 'accepted', ...site }] } }
  return { status: 404, body: { code: 'NOT_FOUND' } }
}

window.fetch = ((input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const { status, body } = answer(new URL(url, window.location.origin).pathname)
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  )
}) as typeof fetch

// The English strings the tabs ship with.
const t = (key: string, params?: Record<string, string | number>): string => {
  const raw = (en as Record<string, string>)[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
}

window.__tabs = {}
const noop = (): (() => void) => () => undefined
apply({
  // Effects this fixture has no double for may throw; they are not under test.
  effect: (fn) => {
    try {
      fn()
    } catch {
      /* not under test */
    }
  },
  get: () => undefined,
  betterSidebar: {
    registerTab: (descriptor: unknown) => {
      const d = descriptor as Descriptor
      window.__tabs[d.id] = d
      return () => undefined
    },
    updateTab: () => undefined,
    openTab: () => undefined
  } as never,
  locale: { register: noop, bind: () => t as never } as never,
  sessions: { list: { getSnapshot: () => ({ byId: {} }), subscribe: noop } } as never,
  // The composer's dock: not under test here.
  slots: { inject: () => undefined, register: () => () => undefined }
})

// Another plugin's Tailwind sheet, injected after ours as in dsh's page: same `utilities` layer, so
// its plain display utilities outrank any non-important rule of ours that toggles display.
const later = document.createElement('style')
later.textContent =
  '@layer theme, base, components, utilities; @layer utilities { .hidden { display: none } ' +
  '.block { display: block } .flex { display: flex } .inline-flex { display: inline-flex } }'
document.head.append(later)

const panel = document.getElementById('panel') as HTMLElement
let root: Root | null = null
window.__mountTeam = () => {
  const d = window.__tabs['tracy:team']
  if (!d) throw new Error('no tab registered as tracy:team')
  root?.unmount()
  root = createRoot(panel)
  const tab = { id: 't-team', title: '', meta: { siteKey: window.__team.site.siteKey } }
  const Body = () => d.component({ tab, visible: true }) as never
  flushSync(() => root?.render(createElement(Body)))
}
