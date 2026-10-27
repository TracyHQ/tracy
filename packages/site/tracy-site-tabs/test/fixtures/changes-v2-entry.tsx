/**
 * Fixture for `../e2e/changes-v2.test.mjs`: the real Site changes tab over Site changes V2 answers
 * (`GET …/activity?version=2`, `…/undo-scope`, `POST …/restore`) and its backups (`/backups`).
 *
 * This plugin's own `apply()` registers the tabs into a context double; the test mounts the real
 * `tracy:changes` tab into `#panel`. Only `window.fetch` is mocked, and every request it sees is
 * logged in `window.__requests` so a test can say what was asked, in which order.
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
    /** Words of another language over the English ones, by key; null or absent = English. */
    __strings?: Record<string, string> | null
    /** `v2` (default), `floor` (counts incomplete), `emdash`, `reset`. */
    __server: 'v2' | 'floor' | 'emdash' | 'reset'
    __requests: { method: string; url: string; body: unknown }[]
    __restore: Answer
    __mount: () => void
    __backupRows?: unknown[] | null
    /** `/backups` `may` for this seat; absent = every verb offered. */
    __backupMay?: { restoreFiles: boolean; restoreEverything: boolean } | null
    /** A Source page that holds no event (counts unchanged): the backups' dividers must still show. */
    __dropFiltered?: boolean
    __mainSession?: string
    /** Sessions dsh lists besides the one on screen (an "Open chat" target must be listed). */
    __sessions?: string[]
    /** Services `ctx.get` answers (`uiWorkspace`, `conversation`); a test sets the ones it plays. */
    __services: Record<string, unknown>
    /** The folds registered with the fake `uiConversation.userTextFolds`. */
    __folds: { fence: string; fold: (block: string, after: string) => unknown }[]
    /** What `betterSidebar.openTab` was asked to open. */
    __openedTabs: unknown[]
    __commentDeleted?: boolean
    __chatNotMine?: boolean
    __loadOlder?: () => Promise<void> | void
    __hasMore?: boolean
    /** While true, `/activity` answers wait until `__releaseActivity()` (a hung Git read, L4 A20). */
    __holdActivity: boolean
    __releaseActivity: () => void
    /** While true, `/backups` answers wait until `__releaseBackups()` (a slow host, REG-018). */
    __holdBackups: boolean
    __releaseBackups: () => void
    /** `__holdBackups` for the next mount, which resets it (the backups are read after the list). */
    __nextHoldBackups?: boolean
    /** When set, `/backups` answers this status with `{code: 'FLEET_JOB_FAILED'}` (a failed read). */
    __backupsStatus?: number | null
    /** When set, `POST /backup` answers this instead of a made backup (#1403 item 9). */
    __backupPost?: { status: number; body: unknown } | null
    /** Events the server recorded since the tab opened: newest first, ahead of the fixed list. */
    __newItems: unknown[]
    /** Answer the whole list in two pages of this many events (a `nextCursor`), or not at all. */
    __pageSize: number | null
    /** The server records a chat turn `id` (in `__newItems`), ended just now. */
    __recordTurn: (id: string) => void
    /** The server records a Restore everything (`__recordRestoreEverything` below). */
    __recordRestoreEverything: (to: number, returnPoint: number | null, minutesAgo: number) => void
    /** Tell dsh's sessions list that it changed (the conversation on screen moved). */
    __listChanged: () => void
    /** Play `turn/end` arriving live in the event stream of the conversation on screen. */
    __turnEnd: () => void
  }
}

const SITE = 'demo.tracy.site'
const sitesAnswer = () => ({
  sites: [
    {
      siteKey: SITE,
      role: 'owner',
      status: 'accepted',
      platform: window.__server === 'emdash' ? 'emdash' : 'wordpress',
      // Where this deployment serves the site: the Browser tab opens on it (`openBrowserLink`).
      copyUrl: 'http://demo.localhost:8080/'
    }
  ]
})
const NOW = Date.now()
const ago = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString()
const MAI = { type: 'person', id: 'tracy:mai@example.test', name: 'Mai Tran', role: 'requester' }
const TRACY = { type: 'system', id: 'service:tracy', name: 'Tracy', role: 'executor' }
const group = (resources: unknown[] = [], operations = 0) => ({ resources, operations })
const noFiles = { count: null, sha: null, state: 'not-linked' }
const effects = (over: Record<string, unknown> = {}) => ({
  content: group(),
  settings: group(),
  files: noFiles,
  other: { operations: 0, actions: [] },
  coverage: { files: 'not-linked', content: 'recorded' },
  ...over
})
const base = {
  detectedAt: null,
  timeBasis: 'occurred',
  request: { state: 'none' },
  reversal: { state: 'none' },
  capabilities: { canDiff: false, canUndoFiles: false, reasons: ['no-files'] },
  evidence: {}
}

const CHAT_BOTH = {
  ...base,
  id: 's-1:1',
  kind: 'turn',
  origin: { source: 'chat', evidence: 'confirmed' },
  actor: MAI,
  executor: TRACY,
  description: { key: 'effects.summary', params: {}, isRequestOnly: false },
  occurredAt: ago(30),
  endedAt: ago(28),
  state: 'closed',
  flags: { unsealedStart: false, concurrent: false, steered: false },
  effects: effects({
    content: group([{ type: 'page', id: '12', title: null, ops: ['update'] }]),
    files: { count: 2, sha: '7c1e0a94d2b8aaaabbbbccccddddeeeeffff0000', state: 'recorded' },
    coverage: { files: 'recorded', content: 'recorded' }
  }),
  request: {
    text: 'Make the About us heading say “Baked fresh since 1998” and warm up the hero colours.',
    state: 'full'
  },
  capabilities: { canDiff: true, canUndoFiles: true, reasons: [] },
  evidence: { turnId: 's-1:1', commitSha: '7c1e0a94d2b8aaaabbbbccccddddeeeeffff0000' },
  // The viewer typed it: "Open conversation" opens it, scrolled to this message.
  conversation: {
    sessionId: 's-1',
    turn: 1,
    promptMessageId: 'd6bf0971-4d24-4919-8451-2d7519f0da7a',
    mine: true
  },
  // The turn stopped before Tracy finished: what it had said by then, kept with its line breaks.
  reply: { text: 'Updating the heading now.\nThen the hero', state: 'interrupted' }
}
const COMMENT = {
  ...base,
  id: 's-2:1',
  kind: 'turn',
  origin: { source: 'comment', evidence: 'confirmed' },
  actor: { type: 'person', id: 'tracy:sam@example.test', name: 'Sam Ortiz', role: 'requester' },
  executor: TRACY,
  description: {
    key: 'resource.op',
    params: { op: 'update', type: 'page', id: '31', title: null },
    isRequestOnly: false
  },
  occurredAt: ago(50),
  effects: effects({ content: group([{ type: 'page', id: '31', title: null, ops: ['update'] }]) }),
  request: { text: 'Fix the typo in the menu', state: 'truncated' },
  comment: {
    n: 4,
    url: 'https://demo.tracy.site/menu/?lang=vi&tracy_preview=t1',
    // `site_comment.id`: "Open comment" lands on this comment's thread.
    id: '6f1c2a3b-0000-4000-8000-00000000c0de',
    author: { type: 'person', id: 'tracy:jo@example.test', name: 'Jo Reyes' }
  },
  evidence: { turnId: 's-2:1' },
  // Sam typed it, not the viewer: dsh would not open it for them.
  conversation: { sessionId: 's-2', turn: 1, promptMessageId: null, mine: false },
  // What Tracy said: markup in it is text, and it was cut when saved.
  reply: {
    text: 'Fixed the typo <img src=x onerror="window.__xss=1"> in the menu & footer.',
    state: 'truncated'
  }
}
const CMS = {
  ...base,
  id: 'wordpress-tracy-log:91',
  kind: 'cms-change',
  origin: { source: 'cms-admin', evidence: 'confirmed', cms: 'wordpress', log: 'wordpress-tracy-log' },
  actor: { type: 'person', id: 'wordpress:7', name: 'minh', role: 'executor' },
  description: {
    key: 'resource.op',
    params: { op: 'update', type: 'option', id: 'blogdescription', title: 'Site tagline' },
    isRequestOnly: false
  },
  occurredAt: ago(70),
  effects: effects({
    settings: group([{ type: 'option', id: 'blogdescription', title: 'Site tagline', ops: ['update'] }])
  }),
  evidence: { cmsRecordRef: 'wordpress-tracy-log:91' }
}
const AUTO = {
  ...base,
  id: 'wordpress-tracy-log:92',
  kind: 'cms-change',
  origin: {
    source: 'automatic',
    evidence: 'confirmed',
    cms: 'wordpress',
    log: 'wordpress-tracy-log',
    service: 'wordpress-cron',
    basis: 'producer'
  },
  actor: { type: 'system', id: 'service:wordpress-cron', name: 'WordPress', role: 'executor' },
  description: {
    key: 'resource.op',
    params: { op: 'update', type: 'plugin', id: 'akismet', title: 'Akismet' },
    isRequestOnly: false
  },
  occurredAt: ago(90),
  effects: effects({
    settings: group([{ type: 'plugin', id: 'akismet', title: 'Akismet', ops: ['update'] }])
  })
}
const DEPLOY = {
  ...base,
  id: 'd3d3d3d3',
  kind: 'outside-files',
  origin: { source: 'deployment', evidence: 'confirmed', service: 'tracy-deploy' },
  actor: { type: 'system', id: 'service:tracy-deploy', name: 'Tracy deploy', role: 'executor' },
  // A Tracy update that replaced the WordPress connector (server key from b8c77e8cc).
  description: {
    key: 'deploy.updated',
    params: { component: 'connector', files: 3, tag: 'manual', owner: 'tracy' },
    isRequestOnly: false
  },
  occurredAt: ago(120),
  effects: effects({ files: { count: 3, sha: 'd3d3d3d3', state: 'recorded' } }),
  capabilities: { canDiff: true, canUndoFiles: false, reasons: ['outside'] },
  evidence: { commitSha: 'd3d3d3d3' }
}
const UNDO = {
  ...base,
  id: 'op-9',
  kind: 'operation',
  origin: { source: 'site-changes', evidence: 'confirmed' },
  actor: { type: 'person', id: 'tracy:sam@example.test', name: 'Sam Ortiz', role: 'requester' },
  executor: TRACY,
  description: { key: 'site-changes.undo', params: { target: 'b2b2b2b', files: 1 }, isRequestOnly: false },
  occurredAt: ago(140),
  effects: effects({ files: { count: 1, sha: 'f00df00d', state: 'recorded' } }),
  reversal: { state: 'not-applicable' },
  capabilities: { canDiff: true, canUndoFiles: false, reasons: ['restore'] },
  evidence: { operationId: 'op-9', commitSha: 'f00df00d', targetSha: 'b2b2b2b2b2b2b2b2' }
}
const PARTLY = {
  ...base,
  id: 's-3:1',
  kind: 'turn',
  origin: { source: 'chat', evidence: 'confirmed' },
  actor: MAI,
  executor: TRACY,
  description: { key: 'effects.summary', params: {}, isRequestOnly: false },
  occurredAt: ago(160),
  effects: effects({
    content: group([{ type: 'page', id: '8', title: null, ops: ['update'] }]),
    files: { count: 1, sha: 'b2b2b2b2b2b2b2b2', state: 'recorded' }
  }),
  request: { text: 'Use the darker brown', state: 'full' },
  reversal: {
    state: 'partially-undone',
    undoneBy: { type: 'person', id: 'tracy:sam@example.test', name: 'Sam Ortiz', role: 'requester' },
    link: { kind: 'operation', id: 'op-9' },
    partsNotReversed: ['content']
  },
  capabilities: { canDiff: true, canUndoFiles: false, reasons: ['undone'] },
  evidence: { turnId: 's-3:1', commitSha: 'b2b2b2b2b2b2b2b2' },
  conversation: null,
  reply: null
}
const SEAL = {
  ...base,
  id: 'e5e5e5e5',
  kind: 'outside-files',
  origin: { source: 'unknown', evidence: 'unknown' },
  actor: { type: 'unknown', role: 'executor' },
  description: { key: 'files.changed-source-unknown', params: { files: 2 }, isRequestOnly: false },
  occurredAt: null,
  detectedAt: ago(180),
  timeBasis: 'detected',
  effects: effects({ files: { count: 2, sha: 'e5e5e5e5', state: 'recorded' } }),
  capabilities: { canDiff: true, canUndoFiles: false, reasons: ['outside'] },
  evidence: { commitSha: 'e5e5e5e5' }
}
const LEGACY = {
  ...base,
  id: 's-0:1',
  kind: 'turn',
  origin: { source: 'unknown', evidence: 'conflicting' },
  actor: MAI,
  executor: TRACY,
  description: { key: 'request', params: {}, isRequestOnly: true },
  occurredAt: ago(60 * 26),
  effects: effects({ coverage: { files: 'recorded', content: 'not-recorded' } }),
  request: { text: 'Translate the footer into Vietnamese', state: 'unknown' },
  evidence: { turnId: 's-0:1' }
}
const ITEMS = [CHAT_BOTH, COMMENT, CMS, AUTO, DEPLOY, UNDO, PARTLY, SEAL, LEGACY]
/** A reset to backup v1's commit, and the event made at that commit — which it does NOT undo. */
const AT_RELEASE = {
  ...base,
  id: 's-r:1',
  kind: 'turn',
  origin: { source: 'chat', evidence: 'confirmed' },
  actor: MAI,
  executor: TRACY,
  description: { key: 'files.changed', params: { files: 1 }, isRequestOnly: false },
  occurredAt: ago(300),
  effects: effects({ files: { count: 1, sha: 'r1r1r1r1r1r1r1r1', state: 'recorded' } }),
  request: { text: 'Start the site', state: 'full' },
  capabilities: { canDiff: true, canUndoFiles: true, reasons: [] },
  evidence: { turnId: 's-r:1', commitSha: 'r1r1r1r1r1r1r1r1' }
}
const RESET = {
  ...base,
  id: 'op-r',
  kind: 'operation',
  origin: { source: 'site-changes', evidence: 'confirmed' },
  actor: { type: 'person', id: 'tracy:sam@example.test', name: 'Sam Ortiz', role: 'requester' },
  executor: TRACY,
  description: { key: 'site-changes.reset', params: { target: 'r1r1r1r', files: 1 }, isRequestOnly: false },
  occurredAt: ago(10),
  effects: effects({ files: { count: 1, sha: 'f1f1f1f1', state: 'recorded' } }),
  reversal: { state: 'not-applicable' },
  capabilities: { canDiff: true, canUndoFiles: false, reasons: ['restore'] },
  evidence: { operationId: 'op-r', commitSha: 'f1f1f1f1', targetSha: 'r1r1r1r1r1r1r1r1' }
}
const sourceOf = (i: { origin: { source: string } }): string => i.origin.source
const SOURCES = [
  'chat',
  'comment',
  'design-system',
  'setup',
  'api',
  'cms-admin',
  'automatic',
  'deployment',
  'site-changes',
  'unknown'
]
const countsOf = (items: { origin: { source: string } }[], complete = true, reasons: string[] = []) => ({
  all: items.length,
  ...Object.fromEntries(SOURCES.map((s) => [s, items.filter((i) => sourceOf(i) === s).length])),
  complete,
  reasons
})
const COVERAGE = {
  git: 'read',
  gitTruncated: false,
  since: ago(60 * 24 * 10),
  fileHistory: true,
  cmsLog: {
    source: 'wordpress-tracy-log',
    enabled: true,
    reason: null,
    lastPulledAt: ago(5),
    lastError: null
  }
}

const EM_TURN = {
  ...base,
  id: 'em-1:1',
  kind: 'turn',
  origin: { source: 'chat', evidence: 'confirmed' },
  actor: MAI,
  executor: TRACY,
  description: {
    key: 'resource.op',
    params: { op: 'update', type: 'page', id: '4', title: null },
    isRequestOnly: false
  },
  occurredAt: ago(15),
  flags: { unsealedStart: false, concurrent: true, steered: false },
  effects: effects({
    content: group([{ type: 'page', id: '4', title: null, ops: ['update'] }]),
    files: { count: null, sha: null, state: 'not-tracked' },
    coverage: { files: 'not-tracked', content: 'recorded' }
  }),
  request: { text: 'Shorten the intro', state: 'full' },
  capabilities: { canDiff: false, canUndoFiles: false, reasons: ['no-file-history'] },
  evidence: { turnId: 'em-1:1' }
}

function activityAnswer(url: URL): Answer {
  const server = window.__server
  const filter = url.searchParams.get('filter') ?? 'all'
  if (server === 'emdash') {
    const items = [EM_TURN]
    return {
      status: 200,
      body: {
        schemaVersion: 2,
        items,
        nextCursor: null,
        counts: countsOf(items, false, ['no-file-history', 'cms-log-limits']),
        coverage: {
          ...COVERAGE,
          fileHistory: false,
          cmsLog: { ...COVERAGE.cmsLog, source: 'emdash-audit-log', limits: ['menus', 'settings', 'media'] }
        }
      }
    }
  }
  if (server === 'reset') {
    const items = [RESET, AT_RELEASE]
    return {
      status: 200,
      body: { schemaVersion: 2, items, nextCursor: null, counts: countsOf(items), coverage: COVERAGE }
    }
  }
  // A test plays the comment deleted since the turn: same row, `deleted: true`.
  const live = ITEMS.map((i) =>
    window.__commentDeleted && i === COMMENT
      ? { ...COMMENT, comment: { ...COMMENT.comment, deleted: true } }
      : window.__chatNotMine && i === CHAT_BOTH
        ? { ...CHAT_BOTH, conversation: { ...CHAT_BOTH.conversation, mine: false } }
        : i
  )
  const recorded = [...(window.__newItems as typeof live), ...live]
  // `people` (the tab's default since 06/10/2026) is every Source but `automatic`, as the door reads it.
  const all =
    filter === 'all'
      ? recorded
      : filter === 'people'
        ? recorded.filter((i) => sourceOf(i) !== 'automatic')
        : window.__dropFiltered
          ? []
          : recorded.filter((i) => sourceOf(i) === filter)
  // Two pages when a test asks: the cursor names the last event of the first (keyset, like the door).
  const size = window.__pageSize
  const cursor = url.searchParams.get('cursor')
  const from = cursor === null ? 0 : all.findIndex((i) => i.id === cursor) + 1
  const items = size === null ? all : all.slice(from, cursor === null ? size : undefined)
  const nextCursor = size !== null && cursor === null && all.length > size ? all[size - 1]!.id : null
  const counts =
    server === 'floor'
      ? { ...countsOf(ITEMS, false, ['git-truncated']), all: 226, chat: 182 }
      : countsOf(recorded)
  return {
    status: 200,
    body: {
      schemaVersion: 2,
      items,
      nextCursor,
      counts,
      coverage: server === 'floor' ? { ...COVERAGE, gitTruncated: true } : COVERAGE
    }
  }
}

function answer(method: string, url: URL): Answer {
  const p = url.pathname
  if (p === '/auth/me') return { status: 200, body: { email: 'sam@example.test' } }
  if (p === '/api/sites') return { status: 200, body: sitesAnswer() }
  if (p.endsWith('/backups')) {
    if (window.__backupsStatus) return { status: window.__backupsStatus, body: { code: 'FLEET_JOB_FAILED' } }
    // The Site changes list reads backups only when a test hands it some (`__backupRows`) —
    // otherwise no milestones, as on a host without them.
    if (window.__backupRows)
      return {
        status: 200,
        body: {
          latest: null,
          rows: window.__backupRows,
          ...(window.__backupMay ? { may: window.__backupMay } : {})
        }
      }
    return { status: 404, body: { code: 'NOT_FOUND' } }
  }
  if (p.endsWith('/activity')) return activityAnswer(url)
  // The turn undo engine (`GET …/turns`) lists no turn for this seat: every row here keeps the row
  // actions of before (Undo file changes, Ask Tracy to revert), so those flows stay covered. The
  // engine's own button is covered by `@tracy/core` `site-changes-undo-request.test.mjs`.
  if (p.endsWith('/turns')) return { status: 200, body: { cms: 'wordpress', siteBusy: false, turns: [] } }
  // The undo scope is the COMMIT's: 7 files, more than the turn's own count of 2.
  if (p.endsWith('/undo-scope'))
    return { status: 200, body: { files: 7, complete: true, truncatedList: false } }
  if (p.includes('/moments/') && p.endsWith('/files'))
    return {
      status: 200,
      body: {
        sha: '7c1e0a9',
        files: [
          {
            path: 'wp-content/themes/bluegum/style.css',
            status: 'modified',
            additions: 4,
            deletions: 1,
            zone: 'design'
          },
          {
            path: 'wp-content/themes/bluegum/assets/css/hero.css',
            status: 'modified',
            additions: 2,
            deletions: 2,
            zone: 'design'
          }
        ]
      }
    }
  if (p.endsWith('/restore') && method === 'POST') return window.__restore
  if (p.endsWith('/changes'))
    return {
      status: 200,
      body: {
        since: { version: 4, sha: 'a1' },
        moments: [
          { sha: 'm9', at: 1, by: { kind: 'agent' }, kind: 'moment', title: 'Warmer hero', files: 1 }
        ],
        // An upload: the `content` ZONE, which is files — labelled "Media & language files" (ADR §4).
        files: [
          {
            path: 'wp-content/uploads/2026/10/hero.jpg',
            status: 'added',
            additions: null,
            deletions: null,
            zone: 'content',
            by: { kind: 'outside' }
          }
        ]
      }
    }
  if (p.endsWith('/backup') && method === 'POST')
    return (
      window.__backupPost ?? {
        status: 200,
        body: { version: 6, title: 'x', sha: 'f6', database: { state: 'full' } }
      }
    )
  return { status: 404, body: { code: 'NOT_FOUND' } }
}

/** The server records a chat turn `id`, ended just now: the next read of the list carries it. */
window.__recordTurn = (id: string) => {
  const at = new Date().toISOString()
  window.__newItems = [
    {
      ...CHAT_BOTH,
      id,
      occurredAt: at,
      endedAt: at,
      request: { text: `Recorded ${id}`, state: 'full' },
      evidence: { turnId: id, commitSha: CHAT_BOTH.evidence.commitSha },
      conversation: null,
      reply: null
    },
    ...window.__newItems
  ]
}
/**
 * The server records a Restore everything to Backup `to`, `minutesAgo` minutes ago, whose host made
 * Backup `returnPoint` first (null: a row settled before the link was kept).
 */
window.__recordRestoreEverything = (to: number, returnPoint: number | null, minutesAgo: number) => {
  window.__newItems = [
    {
      ...UNDO,
      id: `op-everything-${to}`,
      description: {
        key: 'site-changes.restore-everything',
        params: { target: 'c3c3c3c', version: to, files: 0, returnPoint },
        isRequestOnly: false
      },
      occurredAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      effects: effects({ files: { count: 0, sha: null, state: 'recorded' } }),
      evidence: { operationId: `op-everything-${to}`, targetSha: 'c3c3c3c3c3c3c3c3' }
    },
    ...window.__newItems
  ]
}
window.__requests = []
window.__newItems = []
window.__pageSize = null
window.__holdActivity = false
window.__releaseActivity = () => undefined
window.__holdBackups = false
window.__releaseBackups = () => undefined
window.__server = 'v2'
window.__restore = {
  status: 200,
  body: { ok: true, files: 7, head: 'abc', operationId: 'op-1', status: 'succeeded' }
}
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const url = new URL(raw, window.location.origin)
  const method = init?.method ?? 'GET'
  let body: unknown = null
  try {
    body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  } catch {
    body = init?.body ?? null
  }
  window.__requests.push({ method, url: url.pathname + url.search, body })
  const { status, body: out } = answer(method, url)
  const respond = (): Response =>
    new Response(JSON.stringify(out), { status, headers: { 'content-type': 'application/json' } })
  if (window.__holdActivity && url.pathname.endsWith('/activity'))
    return new Promise((resolve) => {
      const previous = window.__releaseActivity
      window.__releaseActivity = () => {
        previous()
        resolve(respond())
      }
    })
  if (window.__holdBackups && url.pathname.endsWith('/backups'))
    return new Promise((resolve) => {
      const previous = window.__releaseBackups
      window.__releaseBackups = () => {
        previous()
        resolve(respond())
      }
    })
  // Status 0 plays a dropped connection: the request left, no answer came back.
  if (status === 0) return Promise.reject(new TypeError('Failed to fetch'))
  return Promise.resolve(
    new Response(JSON.stringify(out), { status, headers: { 'content-type': 'application/json' } })
  )
}) as typeof fetch

const t = (key: string, params?: Record<string, string | number>): string => {
  // A test may play a language's words over the English ones (`__strings`, E10.2 long words).
  const raw = window.__strings?.[key] ?? (en as Record<string, string>)[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
}

window.__tabs = {}
window.__services = {}
window.__folds = []
window.__openedTabs = []
const noop = (): (() => void) => () => undefined
// dsh's sessions list and the event stream of the conversation on screen, played: `followTurnEnds`
// subscribes to both, and `__turnEnd` appends a live `turn/end` the way dsh's event window does.
const listListeners = new Set<() => void>()
window.__listChanged = () => {
  for (const on of listListeners) on()
}
const streamListeners = new Set<() => void>()
let stream = { revision: 0, change: undefined as unknown }
window.__turnEnd = () => {
  stream = {
    revision: stream.revision + 1,
    change: { kind: 'append', entries: [{ type: 'event', event: { type: 'turn/end' } }] }
  }
  for (const on of streamListeners) on()
}
apply({
  effect: (fn) => {
    try {
      fn()
    } catch {
      /* not under test */
    }
  },
  get: (name: string) => window.__services[name],
  // dsh's user-text folds, played: the `tracy-revert` chip registers here (`__folds`).
  inject: (deps: string[], callback: (scope: Record<string, unknown>) => void) => {
    if (!deps.includes('uiConversation')) return
    callback({
      effect: (fn: () => unknown) => fn(),
      uiConversation: {
        userTextFolds: {
          register: (fold: Window['__folds'][number]) => {
            window.__folds.push(fold)
            return () => undefined
          }
        }
      }
    })
  },
  betterSidebar: {
    registerTab: (descriptor: unknown) => {
      const d = descriptor as Descriptor
      window.__tabs[d.id] = d
      return () => undefined
    },
    updateTab: () => undefined,
    openTab: (seed: unknown) => {
      window.__openedTabs.push(seed)
    },
    // The side card follows the conversation on screen.
    getSnapshot: () => ({ sessionId: window.__mainSession })
  } as never,
  locale: { register: noop, bind: () => t as never } as never,
  sessions: {
    // `__mainSession` is the conversation on screen (dsh's main-view retainer), when a test sets one;
    // `__sessions` are the others dsh lists.
    list: {
      getSnapshot: () => ({
        byId: {
          ...Object.fromEntries((window.__sessions ?? []).map((id) => [id, { retainedBy: {} }])),
          ...(window.__mainSession ? { [window.__mainSession]: { retainedBy: { mainView: 1 } } } : {})
        }
      }),
      subscribe: (listener: () => void) => {
        listListeners.add(listener)
        return () => listListeners.delete(listener)
      }
    },
    // "Open conversation" pages older history in through the session; a test decides what it draws.
    binding: (id: string) => ({
      eventSource: {
        getSnapshot: () => stream,
        subscribe: (listener: () => void) => {
          streamListeners.add(listener)
          return () => streamListeners.delete(listener)
        }
      },
      session: {
        sessionId: id,
        loadOlder: () => window.__loadOlder?.(),
        getSnapshot: () => ({ hasMore: window.__hasMore !== false, subagent: null })
      }
    })
  } as never
})

const panel = document.getElementById('panel') as HTMLElement
let root: Root | null = null
window.__mount = () => {
  const d = window.__tabs['tracy:changes']
  if (!d) throw new Error('no tab registered as tracy:changes')
  root?.unmount()
  window.__requests = []
  root = createRoot(panel)
  const tab = { id: 't-changes', title: '', meta: { siteKey: SITE } }
  flushSync(() => root?.render(createElement(() => d.component({ tab }) as never)))
}
