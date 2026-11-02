/**
 * Which card a chat turn gets, from the turns door's answer (`turn-card.mjs`). One test per state
 * approved on 06/10/2026 (`plan-verified.html`, door d1), with the copy the state shows.
 *
 *   node --test packages/ui/tracy-chat-input/test/turn-card.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { en } from '../src/client/strings.ts'
import {
  askItemOf,
  askWhatOf,
  cardOf,
  continueWords,
  laterTurns,
  reasonWords,
  targetText,
  whatOf
} from '../src/client/turn-card.mjs'
import { readTurnsAnswer } from '../src/client/turn-undo.mjs'
import { revertMessageOf } from '../../../core/tracy-core/src/site-tabs/revert-prompt.ts'

const say = (key, params = {}) => {
  assert.ok(key in en, `unknown string key ${key}`)
  return en[key].replace(/\{(\w+)\}/g, (whole, name) => String(params[name] ?? whole))
}

/** One turn row as the contract writes it; `over` replaces fields. */
const row = (n, over = {}) => ({
  turnId: `session-1:${n}`,
  turn: n,
  title: `Request ${n}`,
  openedAt: '2026-10-06T13:20:00Z',
  closedAt: '2026-10-06T13:23:00Z',
  changed: true,
  files: { count: 0, commits: [], zones: {} },
  content: [],
  undo: { state: 'available', latest: false, reasons: [], needs: { code: false, content: false } },
  ...over
})
const answerOf = (turns, over = {}) =>
  readTurnsAnswer(200, { cms: 'wordpress', siteBusy: false, turns, ...over })
const POST42 = {
  applyId: 'replace-1',
  action: 'content.update',
  target: { kind: 'post', id: '42', title: null },
  at: '2026-10-06T13:22:00Z'
}

test('latest turn that changed the site: Undo, and the line names the change as recorded', () => {
  const a = answerOf([row(3, { content: [POST42], undo: { state: 'available', latest: true, reasons: [] } })])
  const card = cardOf(a, 3)
  assert.equal(card?.kind, 'ready')
  assert.equal(card.action, 'undo')
  assert.equal(whatOf(card.turn, say), 'Content · a page or post')
})

test('an older turn: Go back to here, counting the later turns it sweeps along', () => {
  const a = answerOf([
    row(1, { files: { count: 1, commits: ['a'.repeat(40)], zones: { design: 1 } } }),
    row(2, { changed: false, undo: { state: 'none', latest: false, reasons: [] } }),
    row(3, { content: [POST42], undo: { state: 'available', latest: true, reasons: [] } })
  ])
  const card = cardOf(a, 1)
  assert.deepEqual([card?.kind, card?.action, card?.later], ['ready', 'goBack', 1])
  assert.equal(whatOf(card.turn, say), 'Design · 1 file')
  assert.deepEqual(
    laterTurns(a, 1).map((t) => t.turn),
    [3]
  )
})

test('a turn that changed nothing, or one the door does not list, gets no card', () => {
  const a = answerOf([row(2, { changed: false, undo: { state: 'none', latest: false, reasons: [] } })])
  assert.equal(cardOf(a, 2), null)
  assert.equal(cardOf(a, 9), null)
})

test('undone: the Undone card, whatever else', () => {
  const a = answerOf([row(3, { undo: { state: 'undone', latest: false, reasons: [] } })])
  assert.equal(cardOf(a, 3)?.kind, 'undone')
})

test('Tracy working on the site (TURN_OPEN): Undo drawn but off, with the approved sentence', () => {
  const a = answerOf(
    [
      row(3, {
        content: [POST42],
        undo: { state: 'blocked', latest: true, reasons: [{ code: 'TURN_OPEN', by: 'a@b.c' }] }
      })
    ],
    { siteBusy: true }
  )
  const card = cardOf(a, 3)
  assert.deepEqual([card?.kind, card?.action], ['disabled', 'undo'])
  assert.equal(say(card.note.key), 'Tracy is working on this site. Undo is available when it finishes.')
})

test('missing toolset: the role sentence for files, another for page edits', () => {
  const files = answerOf([
    row(3, {
      undo: { state: 'blocked', latest: true, reasons: [{ code: 'MISSING_TOOLSET', toolset: 'code' }] }
    })
  ])
  assert.equal(say(cardOf(files, 3).note.key), 'Undoing file changes needs an Owner or an Editor.')
  const content = answerOf([
    row(3, {
      undo: { state: 'blocked', latest: true, reasons: [{ code: 'MISSING_TOOLSET', toolset: 'content' }] }
    })
  ])
  assert.equal(cardOf(content, 3).note.key, 'undo.needsContent')
})

test('EmDash: only Ask Tracy to revert, even when the server also says a turn is open', () => {
  const a = answerOf(
    [
      row(3, {
        content: [{ ...POST42, target: { kind: 'page', id: '7', title: 'About' } }],
        undo: {
          state: 'blocked',
          latest: true,
          reasons: [{ code: 'TURN_OPEN' }, { code: 'NO_UNDO_ON_EMDASH' }]
        }
      })
    ],
    { cms: 'emdash' }
  )
  const card = cardOf(a, 3)
  assert.equal(card?.kind, 'emdash')
  assert.equal(whatOf(card.turn, say), 'Content · page “About”')
})

test('blocked by an admin edit: who, what and when in one sentence, as approved', () => {
  const reason = {
    code: 'CONTENT_CHANGED_AFTER',
    via: 'cms-admin',
    by: 'kimdesigner@example.com',
    at: '2026-10-06T13:26:00Z',
    target: { kind: 'page', id: '12', title: 'Home' }
  }
  const a = answerOf([row(3, { undo: { state: 'blocked', latest: true, reasons: [reason] } })])
  const card = cardOf(a, 3)
  assert.equal(card?.kind, 'blocked')
  const words = reasonWords(reason, 'wordpress', say, () => '17:26')
  assert.equal(
    say(words.key, words.params),
    "The site's content was edited after it: page “Home” in WordPress admin by kimdesigner@example.com at 17:26."
  )
})

test('a reason missing who, what or when says less, never a guess', () => {
  const noBy = reasonWords(
    {
      code: 'CONTENT_CHANGED_AFTER',
      via: 'cms-admin',
      at: '2026-10-06T13:26:00Z',
      target: { kind: 'article', id: 42 }
    },
    'joomla',
    say,
    () => 'T'
  )
  assert.equal(
    say(noBy.key, noBy.params),
    "The site's content was edited after it: an article in Joomla admin at T."
  )
  assert.equal(
    reasonWords({ code: 'CONTENT_CHANGED_AFTER', via: 'cms-admin', at: 'nope' }, 'wordpress', say).key,
    'undo.blocked.content'
  )
  assert.equal(
    reasonWords(
      {
        code: 'CONTENT_CHANGED_AFTER',
        via: 'cms-admin',
        at: '2026-10-06T13:26:00Z',
        target: { kind: 'post', id: '1' }
      },
      null,
      say
    ).key,
    'undo.blocked.content'
  )
  const tracy = reasonWords(
    {
      code: 'CONTENT_CHANGED_AFTER',
      via: 'tracy',
      by: 'x@y.z',
      at: '2026-10-06T13:26:00Z',
      target: { kind: 'post', id: '1', title: null }
    },
    'wordpress',
    say,
    () => 'T'
  )
  assert.equal(
    say(tracy.key, tracy.params),
    "The site's content was changed after it: a page or post, by Tracy for x@y.z at T."
  )
  // A reason whose target names nothing at all keeps the plain sentence, never "an item was edited".
  assert.equal(
    reasonWords(
      { code: 'CONTENT_CHANGED_AFTER', via: 'tracy', at: '2026-10-06T13:26:00Z', target: {} },
      'wordpress',
      say,
      () => 'T'
    ).key,
    'undo.blocked.content'
  )
})

test('every other reason has its own sentence; an unknown code is named, not explained', () => {
  const words = (r) => reasonWords(r, 'wordpress', say, () => 'T')
  assert.equal(
    words({ code: 'FILES_CHANGED_AFTER', files: ['a.css', 'b.css', 'c.css', 'd.css'] }).params.files,
    'a.css, b.css, c.css +1'
  )
  assert.equal(words({ code: 'FILES_CHANGED_AFTER' }).key, 'undo.blocked.filesNoList')
  assert.equal(words({ code: 'RESTORED_AFTER', at: '2026-10-06T13:26:00Z' }).key, 'undo.blocked.restored')
  assert.equal(words({ code: 'RESTORED_AFTER' }).key, 'undo.blocked.restoredNoTime')
  assert.equal(words({ code: 'NOT_RECORDED', part: 'content' }).key, 'undo.blocked.notRecordedContent')
  assert.equal(words({ code: 'NOT_RECORDED', part: 'files' }).key, 'undo.blocked.notRecordedFiles')
  assert.equal(words({ code: 'LATER_TURN_BLOCKED' }).key, 'undo.blocked.later')
  assert.deepEqual(words({ code: 'SOMETHING_NEW' }), {
    key: 'undo.blocked.other',
    params: { code: 'SOMETHING_NEW' }
  })
  assert.deepEqual(words(undefined), { key: 'undo.blocked.other', params: { code: 'UNKNOWN' } })
})

test('the what line: zones in a fixed order, a count of files, titles quoted, at most three targets', () => {
  const t = readTurnsAnswer(200, {
    turns: [
      row(1, {
        files: { count: 3, commits: ['x'], zones: { function: 1, design: 2, weird: 1 } },
        content: [
          POST42,
          POST42,
          { applyId: 'b', action: 'content.update', target: { kind: 'page', id: '1', title: 'Home' } },
          { applyId: 'c', action: 'content.update', target: { kind: 'menu_item', id: '9' } },
          { applyId: 'd', action: 'content.update', target: { kind: 'post', id: '5' } }
        ]
      })
    ]
  }).turns[0]
  assert.equal(
    whatOf(t, say),
    'Design, Function, Other files · 3 files; Content · a page or post, page “Home”, a menu item, +1 more'
  )
  assert.equal(targetText({ kind: null, id: null, title: 'X' }, say), '“X”')
  // #257: the site's static front page is the home page, whatever title its record keeps.
  assert.equal(
    targetText({ kind: 'post', id: '97', title: 'Read the latest News + Blog', front: true }, say),
    'the home page'
  )
})

/**
 * 🔒 Council D1 (20/10/2026): the card under a reply said "Content · article 4" — the CMS's raw
 * kind and a record id. A record reads as its kind in words and its title, or its kind alone.
 */
test('a changed record is named by its kind in words and its title, never by its id', () => {
  const named = (kind, title = null, action = null) => targetText({ kind, id: '4', title }, say, action)
  // The kinds the three CMS's writes carry: WordPress, Joomla, then EmDash collections.
  assert.equal(named('article'), 'an article')
  assert.equal(named('article', 'Yêu chính mình'), 'article “Yêu chính mình”')
  assert.equal(named('menuItem'), 'a menu item')
  assert.equal(named('module', 'Footer'), 'module “Footer”')
  assert.equal(named('category'), 'a category')
  assert.equal(named('templateStyle'), 'a setting')
  assert.equal(named('option'), 'a setting')
  assert.equal(named('templatePart', 'Header'), 'template part “Header”')
  assert.equal(named('postmeta'), 'a custom field')
  assert.equal(named('posts'), 'a post')
  assert.equal(named('pages', 'About'), 'page “About”')
  assert.equal(named('media'), 'a media file')
  // WordPress keeps pages, posts and menus under one `post`, categories and tags under one `term`:
  // a word that says so, and a title alone rather than a kind that may be wrong.
  assert.equal(named('post'), 'a page or post')
  assert.equal(named('post', 'Home'), '“Home”')
  assert.equal(named('term'), 'a category or tag')
  // A kind nobody listed (an EmDash site's own collection) is "an item", its title alone.
  assert.equal(named('services'), 'an item')
  assert.equal(named('services', 'Consulting'), '“Consulting”')
  assert.equal(named('constructor'), 'an item', 'a kind is data: never a key of Object')
  assert.equal(targetText({ kind: null, id: '01M3Z45EZRYDF85GHERTM1PAF7', title: null }, say), 'an item')
  // A write that names no kind is named by what its action reaches.
  assert.equal(targetText({ kind: null, id: '17', title: null }, say, 'media.delete'), 'a media file')
  for (const words of [named('article'), named('post'), named('services'), named('menu_item')])
    assert.doesNotMatch(words, /\d/, words)
})

test('two records that read the same are said once, the rest counted; one record written twice is one', () => {
  const article = (id, applyId) => ({
    applyId,
    action: 'content.update',
    target: { kind: 'article', id, title: null },
    at: '2026-10-06T13:22:00Z'
  })
  const turn = row(1, { content: [article('4', 'a'), article('4', 'b'), article('5', 'c')] })
  assert.equal(whatOf(turn, say), 'Content · an article, +1 more')
  assert.equal(
    whatOf(row(1, { content: [article('4', 'a'), article('4', 'b')] }), say),
    'Content · an article'
  )
})

test('Ask Tracy to revert sends the same message as Site changes, built only from what the door gave', () => {
  const turn = readTurnsAnswer(200, {
    turns: [
      row(3, { files: { count: 2, commits: ['c'.repeat(40)], zones: { design: 2 } }, content: [POST42] })
    ]
  }).turns[0]
  const item = askItemOf(turn, { cms: 'wordpress', sessionId: 'session-1' })
  const message = revertMessageOf(
    item,
    { siteKey: 'demo.tracy.site', cms: 'wordpress' },
    say('undo.askMessage', { what: askWhatOf(turn) })
  )
  assert.ok(message?.startsWith('Revert “Request 3”: only this change.\n\n```tracy-revert\n'))
  assert.match(message, /post 42 \(updated\)/)
  assert.match(message, /2 files in commit cccccccccccc/)
  assert.match(message, /chat turn session-1:3/)
  const long = { ...turn, title: 'x '.repeat(80) }
  assert.ok(askWhatOf(long).endsWith('…') && askWhatOf(long).length <= 60)
  assert.equal(askWhatOf({ ...turn, title: null }), null)
})

test('Continue after an interrupted turn names what is still on the site, or that it was all undone', () => {
  const turn = readTurnsAnswer(200, {
    turns: [row(3, { files: { count: 1, commits: ['d'.repeat(40)], zones: {} }, content: [POST42] })]
  }).turns[0]
  assert.deepEqual(continueWords(turn), {
    key: 'interrupted.continueMessage',
    params: { applied: 'replace-1, commit dddddddddddd' }
  })
  assert.equal(
    continueWords({ ...turn, undo: { ...turn.undo, state: 'undone' } }).key,
    'interrupted.continueUndone'
  )
  // Local stand and dev 24/10/2026: a whole-site build sent forty apply ids, most repeated, as the person's message.
  const many = {
    ...turn,
    content: [
      ...Array.from({ length: 30 }, (_, n) => ({ applyId: `fix-${n % 10}` })),
      { applyId: 'brand-1' }
    ],
    files: { ...turn.files, commits: [] }
  }
  assert.equal(continueWords(many).params.applied, 'fix-5, fix-6, fix-7, fix-8, fix-9, brand-1 … (+5)')
})

test('a change shared with another request: one sentence for both causes, and Ask Tracy to revert', () => {
  for (const cause of ['apply-id', 'concurrent']) {
    const reason = { code: 'SHARED_CHANGE', cause }
    const a = answerOf([
      row(3, { content: [POST42], undo: { state: 'blocked', latest: true, reasons: [reason] } })
    ])
    const card = cardOf(a, 3)
    assert.deepEqual([card?.kind, card?.ask], ['blocked', true])
    assert.equal(
      say(reasonWords(reason, 'wordpress').key),
      "This request's changes are mixed with another request's, so it can't be undone on its own."
    )
  }
})

test('a turn whose start was not recorded in time says so, not that another request is mixed in', () => {
  // dskeepjo 09/10/2026: the Joomla seal outlived the door's wait; no other request was involved.
  const reason = { code: 'SHARED_CHANGE', cause: 'unsealed', turnId: 's:3' }
  const a = answerOf([
    row(3, { content: [POST42], undo: { state: 'blocked', latest: true, reasons: [reason] } })
  ])
  assert.deepEqual([cardOf(a, 3)?.kind, cardOf(a, 3)?.ask], ['blocked', true])
  assert.equal(
    say(reasonWords(reason, 'joomla').key),
    "When this request started, Tracy couldn't record the site in time, so it can't tell this request's file changes apart from earlier ones."
  )
})

test('the first turn of a whole-site build says it built the site, not that its start was not recorded', () => {
  // Local stand 24/10/2026: every A–Z build ended on "Tracy couldn't record the site in time".
  assert.match(
    say(reasonWords({ code: 'SHARED_CHANGE', cause: 'built', turnId: 'wo-demo-a:1' }, 'wordpress').key),
    /^This request built the site from nothing[\s\S]*delete the site in My sites\.$/
  )
})

test('files not checked by the server: Undo still shows, the POST checks again', () => {
  const a = answerOf(
    [row(3, { content: [POST42], undo: { state: 'available', latest: true, reasons: [] } })],
    { filesChecked: false }
  )
  assert.equal(cardOf(a, 3)?.kind, 'ready')
})

test('a WordPress look (the site’s Additional CSS): named on the line, its own sentences when blocked', () => {
  const look = [{ undo: 'abc123', at: '2026-10-06T13:22:00Z' }]
  const a = answerOf([row(3, { look, undo: { state: 'available', latest: true, reasons: [] } })])
  const card = cardOf(a, 3)
  assert.equal(card?.kind, 'ready')
  assert.deepEqual(card.turn.look, look)
  assert.equal(whatOf(card.turn, say), 'Design · Additional CSS')
  assert.equal(
    whatOf({ ...card.turn, content: [POST42] }, say),
    'Content · a page or post; Design · Additional CSS'
  )
  const words = (r) => say(reasonWords(r, 'wordpress', say).key)
  assert.equal(
    words({ code: 'LOOK_CHANGED_AFTER', via: 'outside' }),
    "The site's Additional CSS was changed after this request."
  )
  assert.equal(
    words({ code: 'NOT_RECORDED', part: 'look' }),
    "Tracy has no record of the Additional CSS it changed, so it can't put it back."
  )
  // A server from before looks: no `look` field reads as none.
  assert.deepEqual(answerOf([row(4)]).turns[0].look, [])
})
