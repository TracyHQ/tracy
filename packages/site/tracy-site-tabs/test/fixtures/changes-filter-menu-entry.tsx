/**
 * Fixture for `../e2e/changes-filter-menu.test.mjs`: the real Site changes tab over a fixed list.
 *
 * This plugin's own `apply()` registers the tabs into a context double, and the test mounts the real
 * `tracy:changes` tab into `#panel` (dsh's tab body) with the stylesheet `apply()` injects. Only
 * `window.fetch` is mocked: one chat turn and one edit made on the site, so the Source filter holds
 * All 2, Chat 1 and Unknown 1, every other Source 0.
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

declare global {
  interface Window {
    __tabs: Record<string, Descriptor>
    __mountChanges: () => void
  }
}

const SITE = 'demo.tracy.site'
const SITES = { sites: [{ siteKey: SITE, role: 'owner', status: 'accepted', platform: 'wordpress' }] }
const CHANGES = {
  since: { version: 1, sha: 'a1' },
  moments: [
    { sha: 'm2', at: 1_700_000_000, by: { kind: 'agent' }, kind: 'moment', title: 'Agent edit', files: 3 },
    { sha: 'm1', at: 1_699_000_000, by: { kind: 'outside' }, kind: 'outside', title: '', files: 2 }
  ],
  files: [
    {
      path: 'wp-content/themes/demo/style.css',
      status: 'modified',
      additions: 4,
      deletions: 1,
      zone: 'design',
      by: { kind: 'agent' }
    }
  ]
}

const none = { resources: [], operations: 0 }
const effects = (files: { count: number; sha: string }) => ({
  content: none,
  settings: none,
  files: { ...files, state: 'recorded' },
  other: { operations: 0, actions: [] },
  coverage: { files: 'recorded', content: 'recorded' }
})
/** What `GET …/activity?version=2` answers: one chat turn and one edit made on the site. */
const ACTIVITY = {
  schemaVersion: 2,
  items: [
    {
      id: 's-1:1',
      kind: 'turn',
      origin: { source: 'chat', evidence: 'confirmed' },
      actor: { type: 'person', id: 'tracy:owner@example.test', name: 'Owner Example', role: 'requester' },
      description: { key: 'files.changed', params: { files: 3 }, isRequestOnly: false },
      occurredAt: new Date(1_700_000_000 * 1000).toISOString(),
      detectedAt: null,
      timeBasis: 'occurred',
      endedAt: null,
      state: 'closed',
      flags: { unsealedStart: false, concurrent: false, steered: false },
      effects: effects({ count: 3, sha: 'm2' }),
      request: { text: 'Agent edit', state: 'full' },
      reversal: { state: 'none' },
      capabilities: { canDiff: true, canUndoFiles: true, reasons: [] },
      evidence: { turnId: 's-1:1', commitSha: 'm2' },
      reply: null,
      conversation: null
    },
    {
      id: 'm1',
      kind: 'outside-files',
      origin: { source: 'unknown', evidence: 'unknown' },
      actor: { type: 'unknown', role: 'executor' },
      description: { key: 'files.changed-source-unknown', params: { files: 2 }, isRequestOnly: false },
      occurredAt: null,
      detectedAt: new Date(1_699_000_000 * 1000).toISOString(),
      timeBasis: 'detected',
      effects: effects({ count: 2, sha: 'm1' }),
      request: { state: 'none' },
      reversal: { state: 'none' },
      capabilities: { canDiff: true, canUndoFiles: false, reasons: ['outside'] },
      evidence: { commitSha: 'm1' },
      reply: null,
      conversation: null
    }
  ],
  nextCursor: null,
  counts: {
    all: 2,
    chat: 1,
    comment: 0,
    'design-system': 0,
    setup: 0,
    api: 0,
    'cms-admin': 0,
    automatic: 0,
    deployment: 0,
    'site-changes': 0,
    unknown: 1,
    complete: true,
    reasons: []
  },
  coverage: { git: 'read', gitTruncated: false, since: null, fileHistory: true, cmsLog: null }
}
function answer(pathname: string): { status: number; body: unknown } {
  if (pathname === '/auth/me') return { status: 200, body: { email: 'owner@example.test' } }
  if (pathname === '/api/sites') return { status: 200, body: SITES }
  if (pathname.endsWith('/changes')) return { status: 200, body: CHANGES }
  if (pathname.endsWith('/activity')) return { status: 200, body: ACTIVITY }
  if (pathname.endsWith('/backups')) return { status: 200, body: { latest: null, rows: [] } }
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
  // Effects this fixture has no double for may throw; the tab registrations after them must still run.
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

const panel = document.getElementById('panel') as HTMLElement
let root: Root | null = null
window.__mountChanges = () => {
  const d = window.__tabs['tracy:changes']
  if (!d) throw new Error('no tab registered as tracy:changes')
  root?.unmount()
  root = createRoot(panel)
  const tab = { id: 't-changes', title: '', meta: { siteKey: SITE } }
  flushSync(() => root?.render(createElement(() => d.component({ tab }) as never)))
}
