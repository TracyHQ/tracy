#!/usr/bin/env node
/**
 * The pure half of Site changes V2 — `src/site-tabs/activity-v2.ts`.
 *
 *   node --test packages/core/tracy-core/test/activity-v2.test.mjs
 *
 * Quiet failures guarded here: a body of another shape read as V2 (A19), a CMS account drawn as a Tracy seat,
 * resources and files summed into one number, "0 files" for an area nobody tracks, a partly undone
 * event worded as fully undone, and an answer that proves nothing worded "nothing was changed".
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { en } from '../../../site/tracy-site-tabs/src/client/strings.ts'
import {
  badgeText,
  byName,
  byOf,
  describe,
  eventDays,
  isActivityV2,
  litKeys,
  newIdemKey,
  noUndoReason,
  resourceText,
  scopeLine,
  SOURCES,
  targetEventOf,
  timeOf,
  undoEventOf,
  undoOutcomeOf,
  undoStatus,
  undoTarget,
  unreadCount
} from '../src/site-tabs/activity-v2.ts'

const t = (key, params) => {
  const raw = en[key]
  if (raw === undefined) throw new Error(`no string ${key}`)
  return params
    ? raw.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
    : raw
}

const group = (resources = [], operations = 0) => ({ resources, operations })
const effects = (over = {}) => ({
  content: group(),
  settings: group(),
  files: { count: null, sha: null, state: 'not-linked' },
  other: { operations: 0, actions: [] },
  coverage: { files: 'not-linked', content: 'not-recorded' },
  ...over
})
const item = (over = {}) => ({
  id: 'e1',
  kind: 'turn',
  origin: { source: 'chat', evidence: 'confirmed' },
  actor: { type: 'person', id: 'tracy:mai@example.test', name: 'Mai Tran', role: 'requester' },
  description: { key: 'change.recorded', params: {}, isRequestOnly: false },
  occurredAt: '2026-10-02T09:00:00.000Z',
  detectedAt: null,
  timeBasis: 'occurred',
  effects: effects(),
  request: { state: 'none' },
  reversal: { state: 'none' },
  capabilities: { canDiff: false, canUndoFiles: false, reasons: ['no-files'] },
  evidence: {},
  ...over
})

test('a body without the V2 shape is never read as V2; a V2 answer is', () => {
  assert.equal(isActivityV2({ items: [], nextCursor: null, counts: { all: 0, chat: 0, outside: 0 } }), false)
  assert.equal(isActivityV2({ schemaVersion: 1, items: [], counts: { all: 0 } }), false)
  assert.equal(isActivityV2(null), false)
  assert.equal(
    isActivityV2({
      schemaVersion: 2,
      items: [],
      nextCursor: null,
      counts: { all: 0, complete: true, reasons: [] }
    }),
    true
  )
})

test('By: a Tracy seat, a CMS account, a service and Unknown stay four different things', () => {
  assert.deepEqual(byOf(item()), { kind: 'seat', name: 'Mai Tran', email: 'mai@example.test' })
  const cms = byOf(
    item({
      kind: 'cms-change',
      origin: { source: 'cms-admin', evidence: 'confirmed', cms: 'wordpress' },
      actor: { type: 'person', id: 'wordpress:7', name: 'minh', role: 'executor' }
    })
  )
  assert.deepEqual(cms, { kind: 'cms', cms: 'WordPress', name: 'minh', id: '7' })
  // A CMS account with no name says which CMS and which id — never "Unknown", never a seat.
  const idOnly = byOf(
    item({
      kind: 'cms-change',
      origin: { source: 'unknown', evidence: 'unknown', cms: 'joomla' },
      actor: { type: 'person', id: 'joomla:42', name: null, role: 'executor' }
    })
  )
  assert.equal(idOnly.kind, 'cms')
  assert.equal(byName(idOnly, t), 'Joomla user 42')
  assert.deepEqual(
    byOf(
      item({ actor: { type: 'system', id: 'service:tracy-deploy', name: 'Tracy deploy', role: 'executor' } })
    ),
    // A Tracy update is Tracy updating itself: By reads "Tracy".
    {
      kind: 'service',
      name: 'Tracy',
      id: 'service:tracy-deploy'
    }
  )
  assert.deepEqual(byOf(item({ actor: { type: 'unknown', role: 'requester' } })), { kind: 'unknown' })
  assert.equal(byName({ kind: 'unknown' }, t), 'Unknown')
})

test('By: a seat keeps the face the server sent; none or null leaves it out (the letter on grey)', () => {
  const face = { initial: 'M', color: '#db2777', avatarUrl: null }
  const seat = (extra) =>
    byOf(
      item({
        actor: { type: 'person', id: 'tracy:mai@example.test', name: 'Mai Tran', role: 'requester', ...extra }
      })
    )
  assert.deepEqual(seat({ face }), { kind: 'seat', name: 'Mai Tran', email: 'mai@example.test', face })
  assert.deepEqual(seat({ face: null }), { kind: 'seat', name: 'Mai Tran', email: 'mai@example.test' })
  assert.deepEqual(seat({}), { kind: 'seat', name: 'Mai Tran', email: 'mai@example.test' })
})

test('the scope line counts each unit apart and never draws 0 files for an untracked area', () => {
  const both = item({
    effects: effects({
      content: group([{ type: 'page', id: '12', title: 'About us', ops: ['update'] }]),
      files: { count: 2, sha: 'abc1234', state: 'recorded' }
    })
  })
  assert.equal(scopeLine(both, t), '1 page · 2 files')
  const em = item({
    effects: effects({
      content: group([], 1),
      files: { count: null, sha: null, state: 'not-tracked' }
    })
  })
  assert.equal(scopeLine(em, t), '1 content action')
  assert.doesNotMatch(scopeLine(em, t), /file/)
  const settings = item({
    effects: effects({
      settings: group([{ type: 'option', id: 'blogdescription', title: null, ops: ['update'] }])
    })
  })
  assert.equal(scopeLine(settings, t), '1 setting')
  assert.equal(scopeLine(item(), t), null)
})

test('the Description says the result from the recorded key, or the request labelled as such', () => {
  const titled = item({
    description: {
      key: 'resource.op',
      params: { op: 'update', type: 'page', id: '12', title: 'About us' },
      isRequestOnly: false
    }
  })
  assert.deepEqual(describe(titled, t), { text: 'Updated page “About us”', isRequest: false })
  // A Tracy write keeps kind + id only: no title is looked up and passed off as history.
  const byId = item({
    description: {
      key: 'resource.op',
      params: { op: 'batch', type: 'article', id: 551, title: null },
      isRequestOnly: false
    }
  })
  assert.equal(describe(byId, t).text, 'Updated article 551')
  // #257: the site's static front page reads as the home page, never by its record's (demo) title.
  const front = item({
    description: {
      key: 'resource.op',
      params: { op: 'update', type: 'post', id: '97', title: 'Read the latest News + Blog', front: true },
      isRequestOnly: false
    }
  })
  assert.equal(describe(front, t).text, 'Updated the home page')
  const summary = item({
    description: { key: 'effects.summary', params: {}, isRequestOnly: false },
    effects: effects({
      content: group([{ type: 'page', id: '12', title: null, ops: ['update'] }]),
      files: { count: 2, sha: 'abc', state: 'recorded' }
    })
  })
  assert.equal(describe(summary, t).text, 'Updated 1 page and 2 files')
  const request = item({
    description: { key: 'request', params: {}, isRequestOnly: true },
    request: { text: 'Make the hero warmer', state: 'unknown' }
  })
  assert.deepEqual(describe(request, t), { text: 'Make the hero warmer', isRequest: true })
  assert.equal(
    describe(
      item({
        description: { key: 'files.changed-source-unknown', params: { files: 3 }, isRequestOnly: false }
      }),
      t
    ).text,
    'Files changed; source unknown'
  )
  assert.equal(
    describe(
      item({
        description: {
          key: 'site-changes.undo',
          params: { target: 'abc1234', files: 2 },
          isRequestOnly: false
        }
      }),
      t
    ).text,
    'Undid changes to 2 files'
  )
  // A key a newer server adds never renders blank.
  assert.equal(
    describe(item({ description: { key: 'brand.new', params: {}, isRequestOnly: false } }), t).text,
    'Content change recorded'
  )
  assert.equal(resourceText({ op: 'frobnicate', type: null, id: null, title: null }, t), 'Changed')
})

test('undo status: a mixed event reads files undone, content not — never fully undone', () => {
  assert.equal(undoStatus(item({ reversal: { state: 'none' } }), t), null)
  assert.equal(undoStatus(item({ reversal: { state: 'undone' } }), t), 'File changes undone')
  assert.equal(
    undoStatus(item({ reversal: { state: 'partially-undone', partsNotReversed: ['content'] } }), t),
    'Files undone · Content changes not undone by this action'
  )
  // Only the last of two commits undone: not "Files undone".
  assert.equal(
    undoStatus(item({ reversal: { state: 'partially-undone', partsNotReversed: ['other-moments'] } }), t),
    'Some file changes undone · Other commits not undone by this action'
  )
})

test('undo status: a turn the undo engine took back reads Undone / Partly undone, one label only', () => {
  const at = '2026-10-06T08:00:00.000Z'
  // The engine's mark takes the place of the files status, never stands beside it.
  assert.equal(
    undoStatus(item({ reversal: { state: 'undone' }, undone: { at, complete: true } }), t),
    'Undone'
  )
  assert.equal(
    undoStatus(
      item({
        reversal: { state: 'partially-undone', partsNotReversed: ['content'] },
        undone: { at, complete: false }
      }),
      t
    ),
    'Partly undone'
  )
  // Content-only turn: no files moment was undone, the engine mark alone says it.
  assert.equal(undoStatus(item({ reversal: { state: 'none' }, undone: { at, complete: true } }), t), 'Undone')
  // An older server (no field) and a turn never undone keep the files status.
  assert.equal(undoStatus(item({ reversal: { state: 'undone' }, undone: null }), t), 'File changes undone')
})

test('Undo is offered only where the server allows it, and says why not', () => {
  const allowed = item({
    effects: effects({ files: { count: 2, sha: 'abc1234def', state: 'recorded' } }),
    capabilities: { canDiff: true, canUndoFiles: true, reasons: [] }
  })
  assert.equal(undoTarget(allowed), 'abc1234def')
  assert.equal(noUndoReason(allowed, 'WordPress', t), null)
  const contentOnly = item({
    effects: effects({ content: group([{ type: 'page', id: '1', title: null, ops: ['update'] }]) })
  })
  assert.equal(undoTarget(contentOnly), null)
  assert.equal(noUndoReason(contentOnly, 'WordPress', t), 'Content changes can’t be undone from here yet.')
  const em = item({ capabilities: { canDiff: false, canUndoFiles: false, reasons: ['no-file-history'] } })
  assert.match(noUndoReason(em, 'EmDash', t), /on EmDash/)
  const forbidden = item({
    effects: effects({ files: { count: 1, sha: 'abc1234', state: 'recorded' } }),
    capabilities: { canDiff: true, canUndoFiles: false, reasons: ['forbidden'] }
  })
  assert.equal(undoTarget(forbidden), null)
  assert.match(noUndoReason(forbidden, 'WordPress', t), /role/)
  // A Tracy update (Source deployment) is Tracy's own change: never "changes Tracy didn't make".
  const outsideReasons = { canDiff: true, canUndoFiles: false, reasons: ['outside'] }
  const tracyUpdate = item({
    origin: { source: 'deployment', evidence: 'confirmed', service: 'tracy-deploy' },
    effects: effects({ files: { count: 1, sha: 'abc1234', state: 'recorded' } }),
    capabilities: outsideReasons
  })
  assert.equal(
    noUndoReason(tracyUpdate, 'WordPress', t),
    'Undo isn’t offered for Tracy updates. Ask Tracy in the chat if you need the previous version back.'
  )
  const seal = item({
    origin: { source: 'unknown', evidence: 'unknown' },
    effects: effects({ files: { count: 1, sha: 'abc1234', state: 'recorded' } }),
    capabilities: outsideReasons
  })
  assert.match(noUndoReason(seal, 'WordPress', t), /changes Tracy didn’t make/)
})

test('POST /restore answers: only proof is success; a lost or unknown answer is never "nothing changed"', () => {
  assert.deepEqual(
    undoOutcomeOf(200, { ok: true, files: 2, head: 'h', operationId: 'op1', status: 'succeeded' }),
    {
      status: 'succeeded',
      operationId: 'op1',
      files: 2
    }
  )
  assert.equal(
    undoOutcomeOf(200, { ok: true, files: 0, status: 'succeeded_noop', operationId: 'op1' }).status,
    'succeeded_noop'
  )
  assert.equal(undoOutcomeOf(null, null).status, 'unknown')
  assert.equal(
    undoOutcomeOf(202, { code: 'OPERATION_UNKNOWN', status: 'unknown', operationId: 'op1' }).status,
    'unknown'
  )
  assert.equal(undoOutcomeOf(202, { code: 'OPERATION_PENDING', status: 'pending' }).status, 'unknown')
  assert.equal(
    undoOutcomeOf(502, { code: 'FLEET_JOB_FAILED', reason: 'timeout', status: 'unknown' }).status,
    'unknown'
  )
  assert.equal(
    undoOutcomeOf(502, { code: 'FLEET_JOB_FAILED', reason: 'refused', status: 'failed' }).status,
    'failed'
  )
  assert.equal(undoOutcomeOf(500, null).status, 'unknown')
  assert.deepEqual(undoOutcomeOf(409, { code: 'CONFLICT', files: ['a.css'] }), {
    status: 'conflict',
    files: ['a.css']
  })
  assert.equal(undoOutcomeOf(409, { code: 'NOT_UNDOABLE' }).status, 'not-undoable')
  assert.equal(undoOutcomeOf(403, { code: 'FORBIDDEN_WRITE' }).status, 'forbidden')
  assert.equal(undoOutcomeOf(429, { code: 'RATE_LIMITED' }).status, 'rate-limited')
  assert.equal(undoOutcomeOf(400, { code: 'INVALID_SHA' }).status, 'failed')
})

test('an idempotency key fits the server pattern', () => {
  const key = newIdemKey((b) => b.fill(171))
  assert.match(key, /^[A-Za-z0-9._:-]{8,128}$/)
})

test('an undo links to its target and back, by commit', () => {
  const target = item({
    id: 's:1',
    effects: effects({ files: { count: 2, sha: '7c1e0a94d2b8aaaa', state: 'recorded' } }),
    reversal: {
      state: 'partially-undone',
      link: { kind: 'operation', id: 'op-9' },
      partsNotReversed: ['content']
    }
  })
  const undo = item({
    id: 'op-9',
    kind: 'operation',
    origin: { source: 'site-changes', evidence: 'confirmed' },
    reversal: { state: 'not-applicable' },
    evidence: { operationId: 'op-9', targetSha: '7c1e0a94d2b8aaaa', commitSha: 'f00d' }
  })
  assert.equal(targetEventOf(undo, [undo, target]), target)
  assert.equal(undoEventOf(target, [undo, target]), undo)
})

test('time: a seal shows when it was detected; days split on the viewer clock', () => {
  const seal = item({ timeBasis: 'detected', occurredAt: null, detectedAt: '2026-10-02T08:00:00.000Z' })
  assert.deepEqual(timeOf(seal), { basis: 'detected', iso: '2026-10-02T08:00:00.000Z' })
  const days = eventDays(
    [
      item({ id: 'a' }),
      item({ id: 'b', occurredAt: '2026-10-02T08:30:00.000Z' }),
      item({ id: 'c', occurredAt: '2026-09-28T08:30:00.000Z' })
    ],
    (d) => d.toISOString().slice(0, 10)
  )
  assert.deepEqual(
    days.map((d) => d.items.map((i) => i.id)),
    [['a', 'b'], ['c']]
  )
})

test('no Undo, said by what the event changed first: EmDash content, settings only, both (EM-1, WP-3)', () => {
  const em = item({
    effects: effects({
      content: group([{ type: 'page', id: '4', title: null, ops: ['update'] }]),
      files: { count: null, sha: null, state: 'not-tracked' }
    }),
    capabilities: { canDiff: false, canUndoFiles: false, reasons: ['no-file-history'] }
  })
  assert.equal(noUndoReason(em, 'EmDash', t), 'Content changes can’t be undone from here yet.')
  const settingsOnly = item({
    effects: effects({ settings: group([{ type: 'option', id: 'x', title: null, ops: ['update'] }]) })
  })
  assert.equal(noUndoReason(settingsOnly, 'WordPress', t), 'Settings changes can’t be undone from here yet.')
  const both = item({
    effects: effects({
      content: group([{ type: 'page', id: '1', title: null, ops: ['update'] }]),
      settings: group([], 1)
    })
  })
  assert.equal(
    noUndoReason(both, 'WordPress', t),
    'Content and settings changes can’t be undone from here yet.'
  )
  // Nothing of its own changed on an EmDash row: the file sentence stands.
  const emEmpty = item({
    capabilities: { canDiff: false, canUndoFiles: false, reasons: ['no-file-history'] }
  })
  assert.match(noUndoReason(emEmpty, 'EmDash', t), /on EmDash/)
})

test('a reset reads as files put back, not as an undo', () => {
  assert.equal(
    describe(
      item({
        description: {
          key: 'site-changes.reset',
          params: { target: 'r1r1r1r1', files: 1 },
          isRequestOnly: false
        }
      }),
      t
    ).text,
    'Put the site files back to commit r1r1r1r'
  )
})

test('E6.5: a files-only restore to a backup names the backup, as the Everything row does; a moment keeps its commit', () => {
  const reset = (params) =>
    describe(item({ description: { key: 'site-changes.reset', params, isRequestOnly: false } }), t).text
  assert.equal(reset({ target: 'd7962b4', version: 2, files: 5 }), 'Put the site files back to Backup 2')
  // A reset to a moment that is no backup (or a server that did not say): the commit, as before.
  assert.equal(
    reset({ target: 'd7962b4', version: null, files: 5 }),
    'Put the site files back to commit d7962b4'
  )
  assert.equal(reset({ target: 'd7962b4', files: 5 }), 'Put the site files back to commit d7962b4')
})

test('E3.2: a resource is never named by a bare opaque id (EmDash ULID, UUID); its title when recorded', () => {
  const ulid = '01M3PJRBF0GQ7B4HVY1WVH70XN'
  assert.equal(resourceText({ op: 'update', type: 'home', id: ulid, title: null }, t), 'Updated home')
  // A titled record reads as the chat card names it (council D1, 20/10/2026): an EmDash collection
  // slug is not a word of the reader's language, so its title stands alone.
  assert.equal(resourceText({ op: 'update', type: 'home', id: ulid, title: 'Home' }, t), 'Updated “Home”')
  assert.equal(
    resourceText({ op: 'update', type: null, id: '80615f7b-14e3-4a19-878a-54b380d7c252', title: null }, t),
    'Updated item'
  )
  assert.equal(
    resourceText({ op: 'update', type: 'media', id: '01M3PJRPQKF2ARBKGSTW09N8TV', title: null }, t).includes(
      '01M3'
    ),
    false
  )
  assert.equal(
    resourceText({ op: 'update', type: 'plugin', id: ulid, title: null, owner: 'tracy' }, t).includes('01M3'),
    false
  )
  // A short id a person can find in the CMS stays, but only while no title was recorded.
  assert.equal(resourceText({ op: 'update', type: 'post', id: '42', title: null }, t), 'Updated post 42')
  assert.equal(
    resourceText({ op: 'update', type: 'article', id: '4', title: 'Yêu chính mình' }, t),
    'Updated article “Yêu chính mình”'
  )
  // WordPress's `post` holds pages, posts and menus: titled, the title alone, never "post 42 “Home”".
  assert.equal(resourceText({ op: 'update', type: 'post', id: '42', title: 'Home' }, t), 'Updated “Home”')
})

test('EmDash rows name their type in the singular (page, post): counted as pages and posts, not items', () => {
  const em = item({
    effects: effects({
      content: group([
        { type: 'page', id: '4', title: null, ops: ['update'] },
        { type: 'post', id: '9', title: null, ops: ['update'] }
      ]),
      files: { count: null, sha: null, state: 'not-tracked' }
    })
  })
  assert.equal(scopeLine(em, t), '1 page · 1 post')
  // An older server's collection name (plural) reads the same.
  const older = item({
    effects: effects({ content: group([{ type: 'posts', id: '9', title: null, ops: ['update'] }]) })
  })
  assert.equal(scopeLine(older, t), '1 post')
  assert.equal(resourceText({ op: 'update', type: 'post', id: '9', title: null }, t), 'Updated post 9')
})

test('settings.recorded and other.recorded: said as settings / a change, never as content; unknown keys never blank', () => {
  const d = (key, params = {}) => describe(item({ description: { key, params, isRequestOnly: false } }), t)
  assert.deepEqual(d('settings.recorded', { operations: 2 }), {
    text: 'Settings change recorded',
    isRequest: false
  })
  assert.deepEqual(d('settings.recorded', { op: 'update' }), {
    text: 'Settings change recorded',
    isRequest: false
  })
  assert.deepEqual(d('other.recorded', { operations: 1 }), { text: 'Change recorded', isRequest: false })
  assert.doesNotMatch(d('other.recorded').text, /Content/)
  const fallback = d('something.new')
  assert.ok(fallback.text.length > 0)
  assert.equal(fallback.text, 'Content change recorded')
})

test('a Tracy update and Tracy’s own components read as Tracy’s (option a)', () => {
  const d = (key, params) => describe(item({ description: { key, params, isRequestOnly: false } }), t)
  assert.equal(
    d('deploy.updated', { component: 'connector', files: 1, tag: 'v12', owner: 'tracy' }).text,
    'Tracy updated its connector on this site'
  )
  assert.equal(
    d('deploy.updated', { component: 'other', files: 1 }).text,
    'Tracy updated one of its components on this site'
  )
  assert.equal(d('deploy.files', { files: 4, tag: 'manual' }).text, 'Tracy updated its files on this site')
  // A server before `deploy.*` still reads.
  assert.equal(d('deployment', { files: 3, tag: 'manual' }).text, 'Changed 3 files')
  assert.equal(
    d('resource.op', {
      op: 'update',
      type: 'plugin',
      id: 'claude-cowork',
      title: 'Claude Cowork',
      owner: 'tracy'
    }).text,
    'Updated Tracy’s plugin “Claude Cowork”'
  )
  assert.equal(
    d('resource.op', { op: 'update', type: 'plugin', id: 'tracy-auth', title: null, owner: 'tracy' }).text,
    'Updated Tracy’s plugin tracy-auth'
  )
  assert.equal(
    d('settings.recorded', { owner: 'tracy' }).text,
    'Settings change to one of Tracy’s own components recorded'
  )
  assert.equal(
    d('change.recorded', { owner: 'tracy' }).text,
    'Change to one of Tracy’s own components recorded'
  )
  assert.equal(d('settings.recorded', {}).text, 'Settings change recorded')
})

test('a cut request that already ends in an ellipsis gets no second one', async () => {
  const { endsInEllipsis } = await import('../src/site-tabs/activity-v2.ts')
  assert.equal(endsInEllipsis('Make the hero warmer…'), true)
  assert.equal(endsInEllipsis('Make the hero warmer... '), true)
  assert.equal(endsInEllipsis('Make the hero warmer'), false)
})

test('Open conversation: only Chat and Comment turns with a session; the link scrolls when the id was kept', async () => {
  const { conversationLink, conversationOf, replyOf } = await import('../src/site-tabs/activity-v2.ts')
  const c = { sessionId: 'session-a b', turn: 2, promptMessageId: 'd6bf0971-4d24', mine: true }
  assert.equal(conversationOf(item({ conversation: c })), c)
  assert.equal(conversationOf(item({ conversation: null })), null)
  assert.equal(
    conversationOf(item({ origin: { source: 'cms-admin', evidence: 'confirmed' }, conversation: c })),
    null
  )
  assert.equal(
    conversationLink('demo.tracy.site', c),
    '/demo.tracy.site/s/session-a%20b?open=browser&mode=edit&tracy-msg=d6bf0971-4d24'
  )
  // A turn recorded before the prompt's id was kept: the conversation opens, without scrolling.
  assert.equal(
    conversationLink('demo.tracy.site', { ...c, promptMessageId: null }),
    '/demo.tracy.site/s/session-a%20b?open=browser&mode=edit'
  )
  assert.deepEqual(replyOf({ reply: { text: 'Done.', state: 'full' } }), { text: 'Done.', state: 'full' })
  assert.deepEqual(replyOf({ reply: { text: 'Long…', state: 'truncated' } }), {
    text: 'Long…',
    state: 'truncated'
  })
  assert.deepEqual(replyOf({ reply: { text: 'Half', state: 'interrupted' } }), {
    text: 'Half',
    state: 'interrupted'
  })
  assert.deepEqual(replyOf({ reply: { text: 'x', state: 'weird' } }), { text: 'x', state: 'full' })
  assert.equal(replyOf({ reply: null }), null)
  assert.equal(replyOf({}), null)
  assert.equal(replyOf({ reply: { text: '   ', state: 'full' } }), null)
  assert.equal(replyOf({ reply: { text: 42 } }), null)
})

test('Open comment: the Browser tab deep link to the comment; the page as before without an id; nothing once deleted', async () => {
  const { commentLink } = await import('../src/site-tabs/activity-v2.ts')
  const id = '6f1c2a3b-0000-4000-8000-00000000c0de'
  assert.equal(
    commentLink('demo.tracy.site', {
      url: 'https://demo.tracy.site/menu/?lang=vi&tracy_preview=t1&mode=edit',
      id
    }),
    `/demo.tracy.site/?open=browser&page=%2Fmenu%2F%3Flang%3Dvi&mode=edit&comment=${id}`
  )
  // An older server (no id), or a request sent with no comment row: the page itself.
  assert.equal(
    commentLink('demo.tracy.site', { url: 'https://demo.tracy.site/menu/' }),
    'https://demo.tracy.site/menu/'
  )
  assert.equal(
    commentLink('demo.tracy.site', { url: 'https://demo.tracy.site/menu/', id: null }),
    'https://demo.tracy.site/menu/'
  )
  // Deleted since: nothing to open.
  assert.equal(
    commentLink('demo.tracy.site', { url: 'https://demo.tracy.site/menu/', id, deleted: true }),
    null
  )
  assert.equal(commentLink('demo.tracy.site', { url: '', id }), null)
  // An address that does not parse is handed back as recorded, never thrown on.
  assert.equal(commentLink('demo.tracy.site', { url: 'not a url', id }), 'not a url')
})

test('quick-open arrow: own chat and a live comment only', async () => {
  const { quickOpenOf } = await import('../src/site-tabs/activity-v2.ts')
  const chat = (mine) => item({ conversation: { sessionId: 's-1', turn: 1, promptMessageId: 'm1', mine } })
  assert.deepEqual(quickOpenOf('demo.tracy.site', chat(true)), {
    kind: 'chat',
    href: '/demo.tracy.site/s/s-1?open=browser&mode=edit&tracy-msg=m1'
  })
  assert.equal(quickOpenOf('demo.tracy.site', chat(false)), null)
  assert.equal(quickOpenOf('demo.tracy.site', item({ conversation: null })), null)
  const comment = (over) =>
    item({
      origin: { source: 'comment', evidence: 'confirmed' },
      conversation: { sessionId: 's-2', turn: 1, promptMessageId: null, mine: true },
      comment: { n: 1, url: 'https://demo.tracy.site/menu/', id: 'c1', ...over }
    })
  assert.deepEqual(quickOpenOf('demo.tracy.site', comment({})), {
    kind: 'comment',
    href: '/demo.tracy.site/?open=browser&page=%2Fmenu%2F&mode=edit&comment=c1'
  })
  assert.equal(quickOpenOf('demo.tracy.site', comment({ deleted: true })), null)
  assert.equal(
    quickOpenOf('demo.tracy.site', item({ origin: { source: 'cms-admin', evidence: 'confirmed' } })),
    null
  )
})

test('a cut reply that already ends in an ellipsis gets no second one (wave r1 B2)', async () => {
  const { replyNeedsEllipsis } = await import('../src/site-tabs/activity-v2.ts')
  assert.equal(replyNeedsEllipsis({ text: 'The hero is…', state: 'truncated' }), false)
  assert.equal(replyNeedsEllipsis({ text: 'The hero is... ', state: 'truncated' }), false)
  assert.equal(replyNeedsEllipsis({ text: 'The hero is', state: 'truncated' }), true)
  assert.equal(replyNeedsEllipsis({ text: 'Done…', state: 'full' }), false)
  assert.equal(replyNeedsEllipsis({ text: 'Half', state: 'interrupted' }), false)
})

test('resourceText: each op is one template, so a language orders the words around the target', () => {
  // 02/10: the verb used to be glued in front of the type, so "Actualizado página" was all a
  // language could say. A language with its own template puts the target where it belongs.
  const de = {
    'event.line.update': '{target} aktualisiert',
    'event.line.trash': '{target} in den Papierkorb verschoben',
    'event.op.update': 'Aktualisiert',
    'event.type.page': 'Seite',
    'undo.named.page': 'Seite “{title}”'
  }
  const tDe = (key, params = {}) =>
    (de[key] ?? t(key)).replace(/\{(\w+)\}/g, (whole, name) => String(params[name] ?? whole))
  assert.equal(
    resourceText({ op: 'edit', type: 'page', id: '7', title: 'Über uns' }, tDe),
    'Seite “Über uns” aktualisiert'
  )
  assert.equal(
    resourceText({ op: 'trash', type: 'page', id: '7', title: null }, tDe),
    'Seite 7 in den Papierkorb verschoben'
  )
  // No type and no name: the bare verb, never a template with an empty slot.
  assert.equal(resourceText({ op: 'update', type: null, id: null, title: null }, tDe), 'Aktualisiert')
  // English reads as before.
  assert.equal(
    resourceText({ op: 'publish', type: 'page', id: null, title: 'About us' }, t),
    'Published page “About us”'
  )
})

test('a request recorded before the host cut mention markup reads, in its row, the element’s words', () => {
  const text =
    'thay ảnh này bằng ```tracy-element <mentioned-element url="http://s.test/" selector="#a &gt; div" status="resolved" incomplete="true"> text: Our bakery </mentioned-element> ```'
  const item = { description: { key: 'request', params: {} }, request: { text }, effects: {} }
  assert.deepEqual(describe(item, t), { text: 'thay ảnh này bằng "Our bakery"', isRequest: true })
  // A request with no block is left exactly as it was.
  const plain = { ...item, request: { text: 'Line one\n  line two' } }
  assert.deepEqual(describe(plain, t), { text: 'Line one\n  line two', isRequest: true })
})

// ── Site changes badge (plan `tasks/todo-site-changes-badge-count.md` §2) ────────────────────────

test('badge: litKeys lights the rows the server flagged unseen and keeps what was lit before', () => {
  const page1 = [
    { kind: 'turn', id: 's1:1', unseen: true },
    { kind: 'cms-change', id: 'wordpress-tracy-log:1@x', unseen: true },
    { kind: 'turn', id: 's2:1', unseen: false },
    { kind: 'git', id: 'abc' }
  ]
  const none = new Set()
  const lit = litKeys(page1, none)
  assert.deepEqual([...lit].sort(), ['cms-change:wordpress-tracy-log:1@x', 'turn:s1:1'])
  // A refresh after the watermark moved flags nothing: what was lit stays lit, and the set is the same object.
  const after = litKeys(
    page1.map((i) => ({ ...i, unseen: false })),
    lit
  )
  assert.equal(after, lit)
  // A page with nothing to add hands back the set it was given.
  assert.equal(litKeys([], none), none)
  assert.equal(unreadCount(page1, lit), 2)
  assert.equal(unreadCount(page1, none), 0)
})

test('badge: an older server (no flag) lights nothing', () => {
  const lit = litKeys(
    [
      { kind: 'turn', id: 's1:1' },
      { kind: 'turn', id: 's2:1' }
    ],
    new Set()
  )
  assert.equal(lit.size, 0)
})

test('badge: badgeText draws nothing at 0, the number to 9, and 9+ above', () => {
  assert.equal(badgeText(0), '')
  assert.equal(badgeText(-1), '')
  assert.equal(badgeText(1), '1')
  assert.equal(badgeText(9), '9')
  assert.equal(badgeText(10), '9+')
  assert.equal(badgeText(113), '9+')
})

test('a Design system row: apply, switch and undo read apart, with the system’s name, never "design-system"', () => {
  const ds = (key, params) => describe(item({ description: { key, params, isRequestOnly: false } }), t).text
  assert.equal(ds('design-system.apply', { name: 'Stripe' }), 'Applied the design system “Stripe”')
  assert.equal(
    ds('design-system.switch', { name: 'Spotify', from: 'Stripe' }),
    'Switched the design system from “Stripe” to “Spotify”'
  )
  assert.equal(ds('design-system.undo', { name: 'Spotify' }), 'Undid the design system “Spotify”')
  assert.match(ds('design-system.unsure', { name: 'Stripe' }), /^Tried to apply the design system “Stripe”/)
  // Type is the button's own name; the press is the person's, so By reads "Applied by <them>".
  assert.equal(t('event.source.design-system'), 'Design system')
  const pressed = item({
    kind: 'writes',
    origin: { source: 'design-system', evidence: 'confirmed' },
    actor: { type: 'person', id: 'tracy:mai@example.test', name: 'Mai Tran', role: 'executor' }
  })
  assert.equal(byName(byOf(pressed), t), 'Mai Tran')
})

test('sweep #4/#2: Tracy setup and API are Types of their own, listed after Design system; a lone revert says what it restored', () => {
  assert.deepEqual(SOURCES.slice(0, 5), ['chat', 'comment', 'design-system', 'setup', 'api'])
  assert.equal(t('event.source.setup'), 'Tracy setup')
  assert.equal(t('event.source.api'), 'API')
  const rev = (params) =>
    describe(item({ description: { key: 'apply.revert', params, isRequestOnly: false } }), t).text
  assert.equal(rev({ applyId: 'api-abc-1' }), 'Restored the content from before change api-abc-1')
  assert.equal(rev({ applyId: null }), 'Restored the content from before an earlier change')
})
