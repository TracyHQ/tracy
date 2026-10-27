/**
 * Fixture for `../e2e/tab-loading.test.mjs`: the real site tabs in a page, answering slowly on purpose.
 *
 * - this plugin's own `apply()`, over a context double that records every tab it registers — so the
 *   tab under test is the real `SiteTab` frame (its `TabLoadingScope` included) around the real views;
 * - the stylesheet `apply()` injects (the build's Tailwind output, `tokens.css` and `--primary` with it);
 * - `#panel` stands in for dsh's tab body (`.tabHostBody`, `position: relative`), the box the bar is
 *   positioned against.
 *
 * Only `window.fetch` is mocked, and every answer waits `window.__delayMs` before it arrives: the
 * knob the test turns to make a tab load fast or slow. A MutationObserver writes down, against the
 * moment of the mount, when the bar appears, starts to fade and leaves.
 */
import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { apply } from '../../src/client/index'
import { en } from '../../src/client/strings'

interface Descriptor {
  id: string
  component: (props: { tab: { id: string; title: string; meta: Record<string, unknown> } }) => unknown
}
type BarEvent = { at: number; what: 'in' | 'leaving' | 'out'; label: string | null; role: string | null }

declare global {
  interface Window {
    __delayMs: number
    /** How many events `/activity` answers (default 1): a long list makes the card taller than the panel. */
    __activityItems: number
    __tabs: Record<string, Descriptor>
    __events: BarEvent[]
    __mount: (id: string, meta: Record<string, unknown>) => void
    __unmount: () => void
    __mountedAt: number
  }
}

const SITE = 'demo.tracy.site'
const SITES = { sites: [{ siteKey: SITE, role: 'owner', status: 'accepted', platform: 'wordpress' }] }
const PERSON = { kind: 'person', name: 'Owner Example', email: 'owner@example.test' }
const CHANGES = {
  since: { version: 1, sha: 'a1' },
  moments: [
    {
      sha: 'b2',
      at: 1_700_000_000,
      by: { kind: 'agent' },
      kind: 'moment',
      title: 'Edited the header',
      files: 1
    }
  ],
  files: [
    {
      path: 'wp-content/themes/x/header.php',
      status: 'modified',
      additions: 2,
      deletions: 1,
      zone: 'design',
      by: { kind: 'agent' }
    }
  ]
}
/** What `GET …/activity?version=2` answers: one chat turn, its request the only words recorded. */
const ACTIVITY = {
  schemaVersion: 2,
  items: [
    {
      id: 's-1:1',
      kind: 'turn',
      origin: { source: 'chat', evidence: 'confirmed' },
      actor: { type: 'person', id: 'tracy:owner@example.test', name: 'Owner Example', role: 'requester' },
      description: { key: 'request', params: {}, isRequestOnly: true },
      occurredAt: new Date(1_700_000_000 * 1000).toISOString(),
      detectedAt: null,
      timeBasis: 'occurred',
      endedAt: null,
      state: 'closed',
      flags: { unsealedStart: false, concurrent: false, steered: false },
      effects: {
        content: { resources: [], operations: 0 },
        settings: { resources: [], operations: 0 },
        files: { count: 1, sha: 'b2', state: 'recorded' },
        other: { operations: 0, actions: [] },
        coverage: { files: 'recorded', content: 'recorded' }
      },
      request: { text: 'Edited the header', state: 'full' },
      reversal: { state: 'none' },
      capabilities: { canDiff: true, canUndoFiles: true, reasons: [] },
      evidence: { turnId: 's-1:1', commitSha: 'b2' },
      reply: null,
      conversation: null
    }
  ],
  nextCursor: null,
  counts: {
    all: 1,
    chat: 1,
    comment: 0,
    'design-system': 0,
    setup: 0,
    api: 0,
    'cms-admin': 0,
    automatic: 0,
    deployment: 0,
    'site-changes': 0,
    unknown: 0,
    complete: true,
    reasons: []
  },
  coverage: { git: 'read', gitTruncated: false, since: null, fileHistory: true, cmsLog: null }
}
/** What `GET …/backups` answers: the first backup, made when the site was built. */
const BACKUPS = {
  latest: { version: 1, sha: 'a1' },
  rows: [
    {
      kind: 'backup',
      version: 1,
      sha: 'a1',
      title: 'Initial backup',
      notes: null,
      at: 1_690_000_000,
      by: PERSON,
      files: 3
    }
  ]
}
const TEAM = {
  sites: [
    {
      siteKey: SITE,
      platform: 'wordpress',
      myRole: 'owner',
      status: 'accepted',
      seats: [
        {
          id: 'seat-1',
          email: 'owner@example.test',
          displayName: 'Owner Example',
          avatarUrl: null,
          role: 'owner',
          status: 'active',
          grantedAt: null,
          grantedBy: null,
          revokedAt: null,
          requestedAt: null,
          scope: 'site'
        }
      ]
    }
  ]
}
const SETTINGS = {
  platform: 'wordpress',
  state: 'ready',
  siteUrl: `https://${SITE}`,
  adminUrl: null,
  values: {}
}
const DIFF = { diff: 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n', truncated: false }

/** The one-event answer repeated `count` times, each event with its own id and an hour apart. */
function activity(count: number): typeof ACTIVITY {
  if (count <= 1) return ACTIVITY
  const [first] = ACTIVITY.items
  const items = Array.from({ length: count }, (_, n) => ({
    ...first,
    id: `s-1:${n + 1}`,
    occurredAt: new Date((1_700_000_000 - n * 3600) * 1000).toISOString()
  }))
  return { ...ACTIVITY, items, counts: { ...ACTIVITY.counts, all: count, chat: count } }
}

function answer(pathname: string): { status: number; body: unknown } {
  if (pathname === '/auth/me') return { status: 200, body: { email: 'owner@example.test' } }
  if (pathname === '/api/sites') return { status: 200, body: SITES }
  if (pathname === '/api/team') return { status: 200, body: TEAM }
  if (pathname.endsWith('/changes')) return { status: 200, body: CHANGES }
  if (pathname.endsWith('/activity')) return { status: 200, body: activity(window.__activityItems) }
  if (pathname.endsWith('/backups')) return { status: 200, body: BACKUPS }
  if (pathname.endsWith('/settings')) return { status: 200, body: SETTINGS }
  if (pathname.endsWith('/file-diff')) return { status: 200, body: DIFF }
  return { status: 404, body: { code: 'NOT_FOUND' } }
}

window.__delayMs = 0
window.__activityItems = 1
window.fetch = ((input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const { status, body } = answer(new URL(url, window.location.origin).pathname)
  return new Promise((resolve) =>
    window.setTimeout(
      () =>
        resolve(
          new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
        ),
      window.__delayMs
    )
  )
}) as typeof fetch

// The bar's life, stamped against the mount.
window.__events = []
const panel = document.getElementById('panel') as HTMLElement
let last: string | null = null
new MutationObserver(() => {
  const bar = panel.querySelector<HTMLElement>('[data-tab-loading-bar]')
  const now = bar === null ? 'out' : bar.dataset.phase === 'leaving' ? 'leaving' : 'in'
  if (now === last) return
  last = now
  window.__events.push({
    at: Math.round(performance.now() - window.__mountedAt),
    what: now,
    label: bar?.getAttribute('aria-label') ?? null,
    role: bar?.getAttribute('role') ?? null
  })
}).observe(panel, { subtree: true, childList: true, attributes: true })

// The English strings the tabs ship with.
const t = (key: string, params?: Record<string, string | number>): string => {
  const raw = (en as Record<string, string>)[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
}

window.__tabs = {}
const noop = (): (() => void) => () => undefined
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

let root: Root | null = null
window.__mount = (id, meta) => {
  const d = window.__tabs[id]
  if (!d) throw new Error(`no tab registered as ${id}`)
  root?.unmount()
  root = createRoot(panel)
  last = 'out'
  window.__events = []
  window.__mountedAt = performance.now()
  const tab = { id: `t-${id}`, title: '', meta }
  flushSync(() => root?.render(createElement(() => d.component({ tab }) as never)))
}
window.__unmount = () => {
  root?.unmount()
  root = null
}
