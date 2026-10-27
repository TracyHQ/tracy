/**
 * Layout "option I": which notification lands in which section, in what order, with which colour
 * family, and how the Unread filter and empty sections behave. Plus the verb split of Team updates,
 * checked against the English baseline: every `verb.*` must sit inside its `act.*` phrase.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ANSWER_CAP, buildSections, capItems, categoryOf, targetIn } from '../src/client/sections.ts'
import { en } from '../src/client/strings.ts'

const LEE = { id: 'a1', email: 'lee@lab3.example', name: 'Lee' }
let seq = 0
const row = (kind, data = {}, extra = {}) => ({
  id: `n${++seq}`,
  kind,
  siteKey: 'kinetic.vn',
  actor: LEE,
  data,
  settledAt: null,
  createdAt: '2026-10-03T10:00:00.000Z',
  readAt: null,
  ...extra
})
const SETTLED = { settledAt: '2026-10-03T11:00:00.000Z' }
const READ = { readAt: '2026-10-03T11:00:00.000Z' }

/** Section id → the kinds in it, in order. */
const shape = (sections) => Object.fromEntries(sections.map((s) => [s.id, s.items.map((i) => i.row.kind)]))

test('open requests and invitations need an answer; settled ones are team updates', () => {
  const sections = buildSections([
    row('team.join_request'),
    row('team.invited', { role: 'editor' }),
    row('team.join_request', {}, SETTLED),
    row('team.invited', { role: 'editor' }, SETTLED)
  ])
  assert.deepEqual(shape(sections), {
    answer: ['team.join_request', 'team.invited'],
    team: ['team.join_request', 'team.invited']
  })
  assert.deepEqual(
    sections.map((s) => s.id),
    ['answer', 'team']
  )
})

test('every comment kind, a deleted one included, goes to Comments', () => {
  const sections = buildSections([
    row('comment.mention', { quote: '@akemi look' }),
    row('comment.reply', { yours: true, quote: 'Done' }),
    row('comment.resolved', { quote: 'Hero' }),
    row('comment.reopened', { quote: 'Footer' }),
    row('comment.mention', { deleted: true })
  ])
  assert.equal(sections.length, 1)
  assert.equal(sections[0].id, 'comments')
  assert.equal(sections[0].items.length, 5)
  assert.ok(sections[0].items.every((i) => i.category === 'comment'))
})

test('the fixed order is answer, comments, team, whatever order the rows arrive in', () => {
  const sections = buildSections([
    row('team.left'),
    row('comment.mention', { quote: 'hi' }),
    row('team.join_request')
  ])
  assert.deepEqual(
    sections.map((s) => s.id),
    ['answer', 'comments', 'team']
  )
})

test('each section is newest first', () => {
  const sections = buildSections([
    row('team.left', {}, { id: 'old', createdAt: '2026-10-01T10:00:00.000Z' }),
    row('team.joined', { role: 'editor' }, { id: 'new', createdAt: '2026-10-03T10:00:00.000Z' }),
    row('team.removed', {}, { id: 'mid', createdAt: '2026-10-02T10:00:00.000Z' })
  ])
  assert.deepEqual(
    sections[0].items.map((i) => i.row.id),
    ['new', 'mid', 'old']
  )
})

test('a section with no row is not returned; nothing at all gives no section', () => {
  assert.deepEqual(buildSections([]), [])
  assert.deepEqual(
    buildSections([row('comment.reply', { quote: 'x' })]).map((s) => s.id),
    ['comments']
  )
  // A kind this build does not know is skipped, so it opens no section either.
  assert.deepEqual(buildSections([row('team.unknown_kind')]), [])
})

test('Unread keeps the three sections but only unread rows, and hides the ones left empty', () => {
  const rows = [
    row('team.join_request'),
    row('comment.mention', { quote: 'x' }, READ),
    row('team.left'),
    row('team.removed', {}, READ)
  ]
  assert.deepEqual(shape(buildSections(rows, { unreadOnly: true })), {
    answer: ['team.join_request'],
    team: ['team.left']
  })
  assert.deepEqual(shape(buildSections(rows)), {
    answer: ['team.join_request'],
    comments: ['comment.mention'],
    team: ['team.left', 'team.removed']
  })
})

test('Unread keeps a row read on this screen until the list is read again', () => {
  const pressed = row('comment.mention', { quote: 'x' }, { id: 'pressed', ...READ })
  assert.deepEqual(buildSections([pressed], { unreadOnly: true }), [])
  assert.equal(buildSections([pressed], { unreadOnly: true, keep: new Set(['pressed']) }).length, 1)
})

test('colour families of team rows', () => {
  const cases = [
    ['team.approved', {}, 'in'],
    ['team.invite_accepted', {}, 'in'],
    ['team.joined', { role: 'editor' }, 'in'],
    ['team.join_answered', { decision: 'approved', requesterName: 'Sarah' }, 'in'],
    ['team.left', {}, 'out'],
    ['team.removed', {}, 'out'],
    ['team.declined', {}, 'out'],
    ['team.invite_declined', {}, 'out'],
    ['team.invite_cancelled', {}, 'out'],
    ['team.join_answered', { decision: 'declined', requesterName: 'Minh' }, 'out'],
    ['team.role_changed', { to: 'admin' }, 'role'],
    ['team.join_request', {}, 'request'],
    ['team.invited', { role: 'developer' }, 'request'],
    ['team.edit_access_request', {}, 'request'],
    ['team.edit_access_answered', { decision: 'approved', requesterName: 'Sarah' }, 'in'],
    ['team.edit_access_answered', { decision: 'declined', requesterName: 'Minh' }, 'out'],
    ['team.edit_access_approved', { role: 'editor' }, 'in'],
    ['team.edit_access_declined', {}, 'out']
  ]
  for (const [kind, data, want] of cases) assert.equal(categoryOf(row(kind, data)), want, kind)
})

test('every English verb sits inside its own act phrase', () => {
  for (const key of Object.keys(en).filter((k) => k.startsWith('verb.'))) {
    const phrase = en[`act.${key.slice('verb.'.length)}`]
    assert.ok(phrase, `${key} has an act phrase`)
    assert.ok(phrase.includes(en[key]), `${key}: "${en[key]}" in "${phrase}"`)
  }
})

test('in every interface language, each verb sits inside its own act phrase', async () => {
  const { readFileSync } = await import('node:fs')
  const root = new URL('../../../locale/', import.meta.url)
  const files = {
    vi: 'tracy-locale-vi/vi/tracy-inbox.json',
    ...Object.fromEntries(
      ['de', 'it', 'fr', 'nl', 'zh', 'es'].map((l) => [l, `tracy-locales/${l}/tracy-inbox.json`])
    )
  }
  for (const [lang, file] of Object.entries(files)) {
    const dict = JSON.parse(readFileSync(new URL(file, root), 'utf8'))
    for (const key of Object.keys(en).filter((k) => k.startsWith('verb.'))) {
      const phrase = dict[`act.${key.slice('verb.'.length)}`]
      assert.ok(typeof dict[key] === 'string' && phrase.includes(dict[key]), `${lang} ${key}`)
    }
  }
})

test('Team updates are news: a press goes nowhere; answers and comments keep their target', () => {
  const sections = buildSections([
    row('team.join_request', {}, { actor: { ...LEE, email: 'sarah@lab3.example' } }),
    row('team.invited', { role: 'editor' }),
    row('comment.mention', { quote: 'hi', commentId: 'c1', page: '/about' }),
    row('team.joined', { role: 'editor' }),
    row('team.join_request', {}, SETTLED),
    row('team.role_changed', { to: 'admin' })
  ])
  const byId = Object.fromEntries(sections.map((s) => [s.id, s.items]))
  assert.deepEqual(byId.answer[0].view.target, {
    kind: 'team',
    siteKey: 'kinetic.vn',
    member: 'sarah@lab3.example'
  })
  // An open invitation answers only through its buttons (04/10): no target for its body.
  assert.equal(byId.answer[1].view.target, null)
  assert.deepEqual(byId.comments[0].view.target, {
    kind: 'comments',
    siteKey: 'kinetic.vn',
    commentId: 'c1',
    page: '/about'
  })
  assert.equal(byId.team.length, 3)
  assert.ok(byId.team.every((i) => i.view.target === null))
  const view = { target: { kind: 'team', siteKey: 'kinetic.vn' } }
  assert.equal(targetIn('team', view), null)
  assert.equal(targetIn('answer', view), view.target)
  assert.equal(targetIn('comments', view), view.target)
  // A restore (T12) is the one Team row with somewhere to go: the site's Site changes tab.
  const restored = { target: { kind: 'changes', siteKey: 'kinetic.vn' } }
  assert.equal(targetIn('team', restored), restored.target)
})

test('Needs your answer shows at most three cards until expanded', () => {
  assert.equal(ANSWER_CAP, 3)
  const items = ['a', 'b', 'c', 'd', 'e']
  assert.deepEqual(capItems(items, false), { shown: ['a', 'b', 'c'], hidden: 2, cappable: true })
  assert.deepEqual(capItems(items, true), { shown: items, hidden: 0, cappable: true })
  // At or under the cap: everything, and no toggle to offer either way.
  assert.deepEqual(capItems(['a', 'b', 'c'], false), { shown: ['a', 'b', 'c'], hidden: 0, cappable: false })
  assert.deepEqual(capItems(['a'], true), { shown: ['a'], hidden: 0, cappable: false })
  assert.deepEqual(capItems([], false), { shown: [], hidden: 0, cappable: false })
})

test('the capped cards are the newest three', () => {
  const at = (d) => ({ createdAt: `2026-10-0${d}T10:00:00.000Z` })
  const sections = buildSections([
    row('team.join_request', {}, { id: 'd1', ...at(1) }),
    row('team.join_request', {}, { id: 'd4', ...at(4) }),
    row('team.invited', { role: 'editor' }, { id: 'd2', ...at(2) }),
    row('team.join_request', {}, { id: 'd3', ...at(3) })
  ])
  const { shown, hidden } = capItems(sections[0].items, false)
  assert.deepEqual(
    shown.map((i) => i.row.id),
    ['d4', 'd3', 'd2']
  )
  assert.equal(hidden, 1)
})

test('an open invitation card answers only through its buttons: the body has no target and is not pressable', () => {
  const [answer] = buildSections([row('team.invited', { role: 'editor' }), row('team.join_request')])
  const invite = answer.items.find((i) => i.row.kind === 'team.invited')
  const request = answer.items.find((i) => i.row.kind === 'team.join_request')
  // Measured 04/10: pressing the body opened Team ("Could not read this site's team") and marked
  // the invitation read without answering it.
  assert.equal(invite.view.target, null)
  assert.equal(invite.pressable, false)
  // A join request card still opens Team on the requester, like its Review button.
  assert.notEqual(request.view.target, null)
  assert.equal(request.pressable, true)
  // Team updates stay pressable: a press marks them read.
  const [team] = buildSections([row('team.joined', { role: 'editor' })])
  assert.equal(team.items[0].pressable, true)
})

test('an answered invitation reads its outcome and takes its colour; a cancelled one stays a request', () => {
  const sections = buildSections([
    row('team.invited', { role: 'editor', outcome: 'accepted' }, SETTLED),
    row('team.invited', { role: 'editor', outcome: 'declined' }, SETTLED),
    row('team.invited', { role: 'editor' }, SETTLED)
  ])
  const team = sections.find((s) => s.id === 'team').items
  assert.deepEqual(
    team.map((i) => [i.view.outcome, i.category]),
    [
      ['accepted', 'in'],
      ['declined', 'out'],
      [null, 'request']
    ]
  )
  // Still open: no outcome, a request card.
  const [answer] = buildSections([row('team.invited', { role: 'editor', outcome: 'accepted' })])
  assert.equal(answer.id, 'answer')
  assert.equal(answer.items[0].view.outcome, null)
  assert.equal(answer.items[0].category, 'request')
  assert.equal(en['outcome.accepted'], 'Accepted')
  assert.equal(en['outcome.declined'], 'Declined')
})

test('a request or invitation still waiting stays in Unread after it was read (pressing Review), until settled', () => {
  const sections = buildSections(
    [
      row('team.join_request', {}, READ),
      row('team.invited', { role: 'editor' }, READ),
      row('team.join_request', {}, { ...READ, ...SETTLED }),
      row('team.joined', { role: 'editor' }, READ)
    ],
    { unreadOnly: true }
  )
  assert.deepEqual(shape(sections), { answer: ['team.join_request', 'team.invited'] })
})

test('an answered join request reads its outcome and takes its colour, like an answered invitation', () => {
  const sections = buildSections([
    row('team.join_request', { outcome: 'approved' }, SETTLED),
    row('team.join_request', { outcome: 'declined' }, SETTLED),
    row('team.join_request', {}, SETTLED)
  ])
  const team = sections.find((s) => s.id === 'team').items
  assert.deepEqual(
    team.map((i) => [i.view.outcome, i.category]),
    [
      ['approved', 'in'],
      ['declined', 'out'],
      [null, 'request']
    ]
  )
  assert.equal(en['outcome.approved'], 'Approved')
})
