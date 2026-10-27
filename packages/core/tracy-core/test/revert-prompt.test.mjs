#!/usr/bin/env node
/**
 * "Ask Tracy to revert…" — `src/site-tabs/revert-prompt.ts`.
 *
 *   node --test packages/core/tracy-core/test/revert-prompt.test.mjs
 *
 * Quiet failures guarded here: the no-guess rule dropped from a message, a scope that invites the
 * agent to touch more than the record, a promise of an earlier value no platform keeps, and the
 * button offered on an undo itself or on a row with nothing left to put back.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  canAskRevert,
  REVERT_FENCE,
  revertBlockTitle,
  revertMessageOf,
  revertPromptOf
} from '../src/site-tabs/revert-prompt.ts'

const NO_GUESS =
  '**If you cannot find an earlier value in a revision, the Trash, the site’s Git history, or a value the Tracy plugin recorded when it made the change, ask me for it. Never guess an earlier value.**'
/** Wave r1 B3: a trace that makes the agent "fairly sure" (Polylang strings) is not a source. */
const MUST_ASK =
  'If the value does not come from a revision, the Trash, the site’s Git history, or a value the Tracy plugin itself recorded when it made the change, you MUST ask — even when another trace (translations, caches, theme strings) makes you fairly sure. Naming such a trace does not count as finding the value.'
const group = (resources = [], operations = 0) => ({ resources, operations })
const effects = (over = {}) => ({
  content: group(),
  settings: group(),
  files: { count: null, sha: null, state: 'not-linked' },
  other: { operations: 0, actions: [] },
  coverage: { files: 'not-linked', content: 'recorded' },
  ...over
})
const item = (over = {}) => ({
  id: 's-1:1',
  kind: 'turn',
  origin: { source: 'chat', evidence: 'confirmed' },
  actor: { type: 'person', id: 'tracy:mai@example.test', name: 'Mai Tran', role: 'requester' },
  description: { key: 'effects.summary', params: {}, isRequestOnly: false },
  occurredAt: '2026-10-02T09:00:00.000Z',
  detectedAt: null,
  timeBasis: 'occurred',
  effects: effects(),
  request: { state: 'none' },
  reversal: { state: 'none' },
  capabilities: { canDiff: false, canUndoFiles: false, reasons: [] },
  evidence: { turnId: 's-1:1' },
  conversation: null,
  ...over
})
const ctx = { siteKey: 'demo.tracy.site' }
const prompt = (over) => revertPromptOf(item(over), ctx)

test('WordPress content with revisions: the page by id and title, revisions and Trash named, the no-guess rule', () => {
  const p = prompt({
    origin: { source: 'cms-admin', evidence: 'confirmed', cms: 'wordpress', log: 'wordpress-tracy-log' },
    kind: 'cms-change',
    actor: { type: 'person', id: 'wordpress:7', name: 'minh', role: 'executor' },
    effects: effects({ content: group([{ type: 'page', id: '12', title: 'About us', ops: ['update'] }]) }),
    evidence: { cmsRecordRef: 'wordpress-tracy-log:91' }
  })
  assert.match(p, /^Please revert one recorded change on the site demo\.tracy\.site, and only that change\./)
  assert.match(p, /by WordPress account minh \(ID 7\)/)
  assert.match(p, /- Content:\n {2}- page 12 “About us” \(updated\)/)
  assert.match(p, /WordPress log record wordpress-tracy-log:91/)
  assert.match(p, /post or page revisions \(Revisions\), and the Trash/)
  assert.match(
    p,
    /Scope: only these items, back to their state just before 2026-10-02T09:00:00\.000Z\. Keep every other change/
  )
  assert.ok(p.includes(NO_GUESS))
})

test('files of one commit: the commit, the count, Git as the place to read the earlier state', () => {
  const p = prompt({
    effects: effects({ files: { count: 2, sha: '7c1e0a94d2b8aaaabbbb', state: 'recorded' } }),
    evidence: { turnId: 's-1:1', commitSha: '7c1e0a94d2b8aaaabbbb' },
    request: { text: 'Warm up the hero colours', state: 'full' }
  })
  assert.match(
    p,
    /- Files: 2 files in commit 7c1e0a94d2b8\. You cannot read the site’s Git history from here: ask me to open this change in Site changes and send you each file’s diff/
  )
  assert.match(p, /- Files: the diff of commit 7c1e0a94d2b8, which I can open for you in Site changes/)
  assert.doesNotMatch(p, /git show/, 'no command the agent cannot run')
  assert.match(p, /back to their state just before commit 7c1e0a94d2b8/)
  assert.match(p, /The request that made this change: “Warm up the hero colours”/)
  assert.ok(p.includes(NO_GUESS))
})

test('a setting with no history: said as such, never promised — and the agent must ask', () => {
  const p = prompt({
    origin: { source: 'unknown', evidence: 'unknown', cms: 'joomla', log: 'joomla-action-log' },
    kind: 'cms-change',
    actor: { type: 'person', id: 'joomla:42', name: null, role: 'executor' },
    effects: effects({ settings: group([{ type: 'config', id: 'sitename', title: null, ops: ['update'] }]) })
  })
  assert.match(p, /- Settings:\n {2}- config sitename \(updated\)/)
  assert.match(p, /Joomla keeps no history of earlier values/)
  assert.match(p, /by Joomla account \(ID 42\)/)
  assert.ok(p.includes(NO_GUESS))
})

test('mixed content, settings, files and an action with no id: every part listed, nothing else', () => {
  const p = prompt({
    origin: { source: 'chat', evidence: 'confirmed', cms: 'wordpress' },
    effects: effects({
      content: group([{ type: 'post', id: '9', title: null, ops: ['update', 'publish'] }], 1),
      settings: group([{ type: 'option', id: 'blogdescription', title: 'Site tagline', ops: ['update'] }]),
      files: { count: 1, sha: 'abcdef1234567890', state: 'recorded' },
      other: { operations: 1, actions: ['user.update'] }
    }),
    request: { text: 'Rename the blog and post the news', state: 'truncated' }
  })
  assert.match(p, /- post 9 \(updated, published\)/)
  assert.match(p, /1 action that named no item: find them from the time and the request below, and ask me/)
  assert.match(p, /- option blogdescription “Site tagline” \(updated\)/)
  assert.match(p, /- Files: 1 file in commit abcdef123456\./)
  assert.match(p, /- Other recorded actions: user\.update/)
  assert.match(p, /\(cut when it was saved\)/)
})

test('files changed outside Tracy, source unknown, detected: offered, with the detection time and Git', () => {
  const p = prompt({
    kind: 'outside-files',
    origin: { source: 'unknown', evidence: 'unknown' },
    actor: { type: 'unknown', role: 'executor' },
    timeBasis: 'detected',
    occurredAt: null,
    detectedAt: '2026-10-02T07:00:00.000Z',
    effects: effects({ files: { count: 3, sha: 'e5e5e5e5e5e5e5', state: 'recorded' } }),
    evidence: { commitSha: 'e5e5e5e5e5e5e5' }
  })
  assert.match(p, /Recorded: detected 2026-10-02T07:00:00\.000Z · source unknown · by unknown/)
  assert.match(p, /Content: the CMS’s own revisions or trash, if it keeps them\./)
  assert.ok(p.includes(NO_GUESS))
})

test('EmDash content: no file history said plainly, revisions only if the site keeps them', () => {
  const p = prompt({
    origin: { source: 'chat', evidence: 'confirmed', cms: 'emdash' },
    effects: effects({
      content: group([{ type: 'page', id: '4', title: null, ops: ['update'] }]),
      files: { count: null, sha: null, state: 'not-tracked' }
    })
  })
  assert.match(p, /- Files: EmDash keeps no file history, so no file list is recorded for this change\./)
  assert.match(p, /revisions, if this EmDash site keeps them/)
  assert.doesNotMatch(p, /git show/)
})

test('partly undone: the files are left as they are, the content is still asked for', () => {
  const p = prompt({
    effects: effects({
      content: group([{ type: 'page', id: '8', title: null, ops: ['update'] }]),
      files: { count: 1, sha: 'b2b2b2b2b2b2', state: 'recorded' }
    }),
    reversal: { state: 'partially-undone', partsNotReversed: ['content'] }
  })
  assert.match(p, /already undone from Site changes: leave the files as they are now/)
  assert.match(p, /- page 8 \(updated\)/)
})

test('not offered: an undo or restore itself, a row that changed nothing, files already undone', () => {
  const undo = item({
    kind: 'operation',
    origin: { source: 'site-changes', evidence: 'confirmed' },
    effects: effects({ files: { count: 1, sha: 'f00d', state: 'recorded' } }),
    reversal: { state: 'not-applicable' }
  })
  assert.equal(canAskRevert(undo), false)
  assert.equal(revertPromptOf(undo, ctx), null)
  assert.equal(canAskRevert(item()), false)
  assert.equal(
    canAskRevert(
      item({
        effects: effects({ files: { count: 2, sha: 'a1', state: 'recorded' } }),
        reversal: { state: 'undone' }
      })
    ),
    false
  )
  assert.equal(
    canAskRevert(item({ effects: effects({ files: { count: 2, sha: 'a1', state: 'recorded' } }) })),
    true
  )
})

test('a chat turn names no CMS: the site’s CMS from the list is used for where to look', () => {
  const p = revertPromptOf(
    item({
      effects: effects({ content: group([{ type: 'article', id: '551', title: null, ops: ['update'] }]) })
    }),
    { siteKey: 'demo.tracy.site', cms: 'joomla' }
  )
  assert.match(p, /the item’s Versions \(com_contenthistory\)/)
  assert.match(p, /- article 551 \(updated\)/)
})

test('every message: the trace rule and the Tracy plugin’s own record as a source (wave r1 B3)', () => {
  for (const over of [
    {
      effects: effects({
        settings: group([{ type: 'option', id: 'blogname', title: null, ops: ['update'] }])
      })
    },
    { effects: effects({ files: { count: 1, sha: 'abc1234567', state: 'recorded' } }) },
    { effects: effects({ content: group([{ type: 'page', id: '1', title: null, ops: ['update'] }]) }) }
  ]) {
    const p = prompt(over)
    assert.ok(p.includes(NO_GUESS), 'the bold rule names the four sources')
    assert.ok(p.includes(MUST_ASK), 'the trace rule, word for word')
    assert.match(
      p,
      /- A change Tracy made: the earlier value the Tracy plugin recorded when it made the change, if it recorded one\./
    )
  }
})

/** Wave 22:2x: "NORTHGATE SCV2-wave-4t" from an earlier round offered instead of "Northgate". */
const NO_STALE =
  'When you ask me for an earlier value, suggest one only if one of those sources records a change whose new value is exactly what the site holds now: then suggest the value from just before that change. Otherwise ask without suggesting any value — an older value from an earlier change may be stale.'

test('every message: a value suggested while asking must come from the transition that ends at today’s value', () => {
  for (const over of [
    {
      effects: effects({
        settings: group([{ type: 'option', id: 'blogname', title: null, ops: ['update'] }])
      })
    },
    { effects: effects({ content: group([{ type: 'page', id: '1', title: null, ops: ['update'] }]) }) }
  ]) {
    const p = prompt(over)
    assert.ok(p.includes(NO_STALE), 'the stale-suggestion rule, word for word')
    // After the no-guess rules, so the agent reads "ask" before "what you may suggest".
    assert.ok(p.indexOf(NO_STALE) > p.indexOf(MUST_ASK))
    assert.match(p, /Start your reply with one sentence naming exactly what you are about to put back/)
  }
})

test('the message sent: the person’s sentence, then ONE tracy-revert block holding the whole record', () => {
  const it = item({
    effects: effects({ content: group([{ type: 'page', id: '12', title: 'About us', ops: ['update'] }]) })
  })
  const body = revertPromptOf(it, ctx)
  const m = revertMessageOf(it, ctx, '  Revert “Updated page About us” — only this change. ')
  assert.equal(REVERT_FENCE, 'tracy-revert')
  assert.equal(m, `Revert “Updated page About us” — only this change.\n\n\`\`\`tracy-revert\n${body}\n\`\`\``)
  // dsh's fold contract: the block opens with the fence line and ends at the next bare ``` line.
  const lines = m.split('\n')
  assert.equal(lines.filter((l) => l === '```').length, 1, 'one closing fence, at the end')
  assert.equal(
    revertBlockTitle(m.slice(m.indexOf('```'))),
    lines.find((l) => l.startsWith('Recorded: '))
  )
  // Nothing to revert: no message at all.
  assert.equal(revertMessageOf(item(), ctx, 'Revert'), null)
})

test('a recorded title or request holding ``` cannot close the block early', () => {
  const it = item({
    effects: effects({ content: group([{ type: 'page', id: '3', title: 'x\n```\ny', ops: ['update'] }]) }),
    request: { state: 'full', text: 'make it\n```\ncode' }
  })
  const m = revertMessageOf(it, ctx, 'Revert it')
  const block = m.slice(m.indexOf('```tracy-revert'))
  const inner = block.split('\n').slice(1, -1)
  assert.ok(
    inner.every((l) => !l.trimStart().startsWith('```')),
    'no line inside the block opens or closes a fence'
  )
  assert.match(block, /\n```$/)
})

test('revertBlockTitle: null for any other block, so dsh leaves it as text', () => {
  assert.equal(revertBlockTitle('```tracy-element\n<x>\n```'), null)
  assert.equal(revertBlockTitle('```tracy-revert\nRecorded: made now\n'), null)
  assert.equal(
    revertBlockTitle('```tracy-revert\nPlease\nRecorded: made now · source chat\n```'),
    'Recorded: made now · source chat'
  )
})
