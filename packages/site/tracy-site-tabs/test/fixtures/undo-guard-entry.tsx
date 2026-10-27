/**
 * Fixture for `../e2e/undo-guard.test.mjs`: the real Site changes and Diff tabs over a fixed list
 * (`/activity?version=2`), with the host's refusals answered the way tracy-web answers them (plan
 * todo-site-changes Q1).
 *
 * This plugin's own `apply()` registers the tabs into a context double; the test mounts one into
 * `#panel` (dsh's tab body) with the stylesheet `apply()` injects. Only `window.fetch` is mocked:
 * `window.__restore` is what `POST /restore` answers, `window.__diff` what `/file-diff` answers.
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
type Answer = { status: number; body: unknown }

declare global {
  interface Window {
    __tabs: Record<string, Descriptor>
    __restore: Answer
    /** What `/activity` and `/moments/:sha/files` answer; a test swaps them (dev round 02/10). */
    __activity: unknown
    __files: unknown
    __base: { activity: unknown; files: unknown }
    __diff: Answer
    __posts: unknown[]
    __mount: (id: string, meta: Record<string, unknown>) => void
  }
}

const SITE = 'demo.tracy.site'
const SITES = { sites: [{ siteKey: SITE, role: 'owner', status: 'accepted', platform: 'wordpress' }] }
const NOW = Math.floor(Date.now() / 1000)
const CHANGES = {
  since: { version: 1, sha: 'a1' },
  moments: [
    {
      sha: 'c3c3c3c',
      at: NOW - 60,
      by: { kind: 'outside' },
      kind: 'outside',
      title: 'changes made to the site outside Tracy',
      files: 1
    },
    {
      sha: 'b2b2b2b',
      at: NOW - 600,
      by: { kind: 'agent' },
      kind: 'moment',
      title: 'Use the darker brown',
      files: 1
    }
  ],
  files: [
    {
      path: 'wp-content/themes/x/style.css',
      status: 'modified',
      additions: 1,
      deletions: 1,
      zone: 'design',
      by: { kind: 'outside' }
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
/**
 * What `GET …/activity?version=2` answers: files changed on the site outside Tracy (no Undo, the
 * guard's `outside`), and a chat turn whose commit Tracy made (Undo file changes offered).
 */
const ACTIVITY = {
  schemaVersion: 2,
  items: [
    {
      id: 'c3c3c3c',
      kind: 'outside-files',
      origin: { source: 'unknown', evidence: 'unknown' },
      actor: { type: 'unknown', role: 'executor' },
      description: { key: 'files.changed-source-unknown', params: { files: 1 }, isRequestOnly: false },
      occurredAt: null,
      detectedAt: new Date((NOW - 60) * 1000).toISOString(),
      timeBasis: 'detected',
      effects: effects({ count: 1, sha: 'c3c3c3c' }),
      request: { state: 'none' },
      reversal: { state: 'none' },
      capabilities: { canDiff: true, canUndoFiles: false, reasons: ['outside'] },
      evidence: { commitSha: 'c3c3c3c' },
      reply: null,
      conversation: null
    },
    {
      id: 's-1:2',
      kind: 'turn',
      origin: { source: 'chat', evidence: 'confirmed' },
      actor: { type: 'person', id: 'tracy:owner@example.test', name: 'Owner Example', role: 'requester' },
      description: { key: 'request', params: {}, isRequestOnly: true },
      occurredAt: new Date((NOW - 600) * 1000).toISOString(),
      detectedAt: null,
      timeBasis: 'occurred',
      endedAt: null,
      state: 'closed',
      flags: { unsealedStart: false, concurrent: false, steered: false },
      effects: effects({ count: 1, sha: 'b2b2b2b' }),
      request: { text: 'Use the darker brown', state: 'full' },
      reversal: { state: 'none' },
      capabilities: { canDiff: true, canUndoFiles: true, reasons: [] },
      evidence: { turnId: 's-1:2', commitSha: 'b2b2b2b' },
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
const FILES = {
  sha: 'x',
  files: [{ path: 'wp-content/themes/x/style.css', status: 'modified', additions: 1, deletions: 1 }]
}

window.__base = { activity: ACTIVITY, files: FILES }
window.__activity = ACTIVITY
window.__files = FILES
window.__posts = []
window.__restore = { status: 200, body: { ok: true, files: 1, head: 'd4' } }
window.__diff = { status: 200, body: { path: 'x', diff: '', truncated: false } }

function answer(pathname: string, method: string, body: unknown): Answer {
  if (pathname === '/auth/me') return { status: 200, body: { email: 'owner@example.test' } }
  if (pathname === '/api/sites') return { status: 200, body: SITES }
  if (pathname.endsWith('/changes')) return { status: 200, body: CHANGES }
  if (pathname.endsWith('/activity')) return { status: 200, body: window.__activity }
  if (pathname.endsWith('/undo-scope'))
    return { status: 200, body: { files: 1, complete: true, truncatedList: false } }
  if (pathname.endsWith('/files')) return { status: 200, body: window.__files }
  if (pathname.endsWith('/backups')) return { status: 200, body: { latest: null, rows: [] } }
  if (pathname.endsWith('/file-diff')) return window.__diff
  if (pathname.endsWith('/restore') && method === 'POST') {
    window.__posts.push(body)
    return window.__restore
  }
  return { status: 404, body: { code: 'NOT_FOUND' } }
}

window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const sent = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  const { status, body } = answer(new URL(url, window.location.origin).pathname, init?.method ?? 'GET', sent)
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  )
}) as typeof fetch

const t = (key: string, params?: Record<string, string | number>): string => {
  const raw = (en as Record<string, string>)[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
}

window.__tabs = {}
const noop = (): (() => void) => () => undefined
apply({
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
window.__mount = (id, meta) => {
  const d = window.__tabs[id]
  if (!d) throw new Error(`no tab registered as ${id}`)
  root?.unmount()
  root = createRoot(panel)
  const tab = { id: `t-${id}`, title: '', meta }
  flushSync(() => root?.render(createElement(() => d.component({ tab }) as never)))
}
