/**
 * A reply in a comment turn (plan `tasks/todo-comment-thread.md` § Design B and § "B addendum",
 * 29/09 13:30): the reply's `tracy-element` block carries `reply-to="<parent n>"` right after
 * `n`, then the WHOLE thread in time order, one `thread:` line each — the parent and every earlier
 * reply as `<author> (<when>): <words>`, Tracy's own step after each where known (`tracy: ✓ updated: …`
 * / `tracy: asked: …`) — at most `THREAD_MAX` characters (600 until TH-3, 30/09; now 24,000), the oldest
 * replies dropped first, never the root nor the newest.
 * A reply is always numbered (even alone): its number colours its pin, and `reply-to` names numbers.
 *
 * 🔒 Turns WITHOUT a reply keep their bytes: `fixtures/comment-turn-many-2909.json` was written by
 * the builder before replies existed (one-item turns are held by `comment-turn-v1-snapshot`).
 * One deliberate change since (29/09 late, quickstart smoke L1): every many-comments hint gained the
 * reply-language sentence (`COMMENT_REPLY_LANGUAGE`, +75 characters, right before the files sentence),
 * so the fixture's `turn` values were regenerated from the builder once — hint only, every block
 * unchanged. The turns as they were sent until then are kept in `comment-turn-many-2909-sent.json`:
 * they sit in people's chat history and must still read back as the same items. Once more since (29/09
 * late, stage-5 acceptance F4, F14): the per-comment language sentence, the plain-words sentence and a
 * ` lang="xx"` tag at the end of each head the heuristic is sure of — regenerated the same way; the
 * turns as sent until then are in `comment-turn-many-2909-lang.json`. Once more (29/09 night, stage 6,
 * plan `tasks/todo-comment-people.md` § Rule 7): the per-number `- n ✓ …` list left the hint for a
 * plain-words answer (`COMMENT_ANSWER_MANY`), with the language, files and look-scope sentences reworded
 * to match — regenerated the same way; the turns as sent until then are in
 * `comment-turn-many-2909-people.json`. Once more (30/09, acceptance v2 S16): the person's words left
 * the numbered lines at the top — each comment's words now stand, unnumbered, right above its own block,
 * and the hint's opening says so; the turns as sent until then are in
 * `comment-turn-many-2909-numbered.json` (every older fixture is compared with that one, since they
 * share its grammar), and they read back as the same items. Once more (30/09, V4S-8): the hint's example
 * `comment: [1, 2]` became the placeholder `comment: [<n>, …]` (Tracy had copied `1` for a request
 * numbered 38); the turns as sent until then are in `comment-turn-many-3009-example.json`.
 *
 * Stage 6 also changed the thread lines: Tracy's old step after an entry (`tracy: ✓ updated: …`,
 * F9/G3) is no longer printed — what Tracy said lives in the chat, and the comment status it came
 * from is retired; two people with one display name are told apart and earlier sends get their own
 * line (`comment-turn-people.test.mjs`).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  buildCommentTurn,
  COMMENT_ANSWER_MANY,
  COMMENT_LOOK_SCOPE,
  COMMENT_NAMED_BY_PAGE,
  COMMENT_REPLY_LANGUAGE,
  COMMENT_THREAD,
  commentTurnFold,
  LOCATE_HINT_MANY,
  parseCommentTurn,
  THREAD_MAX
} from '../src/client/comment-turn.mjs'

const NOW = Date.UTC(2026, 8, 29, 9, 0, 0)
const MIN = 60_000

const ELEMENT = {
  url: 'https://northgate-ind.ru/',
  selector: 'h1',
  label: 'Hero › heading',
  text: 'Industrial construction, from foundation to handover'
}
const LOCATE = {
  status: 'resolved',
  levels: [{ kind: 'field', id: 'content_12#block_3/heading', label: 'Hero › heading', writable: true }]
}

/** Reply 6 to comment 1 (story CommentsViewThread), with the thread the Browser tab sends. */
const REPLY = {
  n: 6,
  text: 'Shorter still — five words max.',
  element: ELEMENT,
  locate: LOCATE,
  replyTo: 1,
  thread: [
    {
      author: { name: 'Lee', email: 'lee@example.com' },
      at: NOW - 9 * MIN,
      text: "Change to 'Building the groundwork for Russia's industry'",
      status: 'done',
      answer: "the heading reads 'Building the groundwork for Russia's industry'"
    },
    {
      author: { email: 'akemi.sato@example.com' },
      at: NOW - 3 * MIN,
      text: 'Too long for the hero on a phone.',
      status: 'saved'
    }
  ]
}

const HINT_WITH_THREAD = `${LOCATE_HINT_MANY} ${COMMENT_THREAD}`

test('a lone reply: numbered, `reply-to` second, the thread in time order, then the hint', () => {
  const turn = buildCommentTurn({ items: [REPLY], now: NOW })
  assert.equal(
    turn,
    [
      'Shorter still — five words max.',
      '',
      '```tracy-element',
      '<mentioned-element n="6" reply-to="1" url="https://northgate-ind.ru/" selector="h1" status="resolved" kind="field" name="Hero › heading">',
      "thread: Lee (9m ago): Change to 'Building the groundwork for Russia's industry'",
      'thread: akemi.sato (3m ago): Too long for the hero on a phone.',
      'text: Industrial construction, from foundation to handover',
      'levels:',
      '- field "Hero › heading" id=content_12#block_3/heading [picked]',
      '</mentioned-element>',
      '```',
      HINT_WITH_THREAD
    ].join('\n')
  )
})

// The owner's sentence (13:30), plus one clause since the stage-5 stand E2E (F1): who wrote each line,
// which line is the reply being sent, and that different names are different people.
test('the thread sentence is the one the owner wrote (13:30), with the F1 clause, the round-2 N1 / N2 / N8 clauses and stage 6’s', () => {
  assert.equal(
    COMMENT_THREAD,
    'A comment with `thread:` lines is part of a conversation between people, not a list of orders (a reply also carries `reply-to`, the comment it continues on the same element): each line names who wrote it (two people with one name get the start of their e-mail after it), the line marked `now` is the comment being sent, a line marked `written after this one` came later, a `sent to Tracy by` line is an earlier time someone sent this thread to you, and different names are different people, never one person changing their mind; read them all and act on the LAST agreed intent — a later word nobody disputed wins over an older comment sent late; if two people disagree and nobody settled it, do not choose: ask with a question card, one question per item, opened with a few words of its element (the heading "…"), never its number, naming who said what (or, when asked for advice, recommend the best option with reasons); if that card is dismissed or comes back with no choice, change nothing for that item and say it waits for <names> to agree; when you act, say whose intent you followed, by the name its line gives, never by a role such as "the owner" or "the editor".'
  )
})

test('stage 6: an old status and answer on a thread entry print nothing — only the people’s lines', () => {
  const turn = buildCommentTurn({
    items: [
      {
        ...REPLY,
        thread: [
          {
            author: 'Lee',
            at: NOW - 70 * MIN,
            text: 'We have 14 subsidiaries now.',
            status: 'asked',
            answer: 'Home page only, or About too?'
          },
          {
            author: 'Lee',
            at: NOW - 30 * 60 * MIN,
            text: 'Both.',
            status: 'failed',
            answer: 'the About page is locked'
          },
          { author: 'Lee', at: NOW - 10_000, text: 'Try again.', status: 'working' }
        ]
      }
    ],
    now: NOW
  })
  const lines = turn.split('\n').filter((l) => l.startsWith('thread: '))
  assert.deepEqual(lines, [
    'thread: Lee (1h ago): We have 14 subsidiaries now.',
    'thread: Lee (1d ago): Both.',
    'thread: Lee (just now): Try again.'
  ])
})

test('no thread from the Browser tab: `reply-to` alone, no thread line (the sender adds the parent)', () => {
  const { thread: _t, ...bare } = REPLY
  const turn = buildCommentTurn({ items: [bare], now: NOW })
  assert.match(turn, /<mentioned-element n="6" reply-to="1" url=/)
  assert.ok(!turn.includes('\nthread: '))
})

// TH-3 (30/09): the cap was 600 characters and 300 a line, which dropped the comment and 16 replies of
// a 23-message thread; `comment-turn-whole-thread.test.mjs` holds the new caps and the left-out line.
test(`the thread is at most ${THREAD_MAX} characters: the oldest replies go first, the root and the newest never`, () => {
  assert.equal(THREAD_MAX, 24_000)
  const long = (i) => `${'word '.repeat(400)}${i}`.trim()
  const thread = Array.from({ length: 16 }, (_, i) => ({
    author: 'Lee',
    at: NOW - (20 - i) * MIN,
    text: long(i),
    status: 'saved'
  }))
  const turn = buildCommentTurn({ items: [{ ...REPLY, thread }], now: NOW })
  const lines = turn.split('\n').filter((l) => l.startsWith('thread: '))
  assert.ok(lines.join('\n').length <= THREAD_MAX, `thread is ${lines.join('\n').length} characters`)
  assert.ok(lines[0].endsWith(' 0'), 'the root stays')
  assert.match(lines[1], /^thread: … \d+ earlier replies not shown …$/)
  assert.ok(lines.at(-1)?.endsWith(' 15'), 'the newest line stays')
  assert.ok(!lines.some((l) => l.endsWith(' 1')), 'the oldest reply went')
})

test('a full thread still fits: the budget of a turn with a reply grows by the thread and its sentence', () => {
  const thread = Array.from({ length: 4 }, (_, i) => ({
    author: 'Lee',
    at: NOW,
    text: 'y'.repeat(290),
    status: 'saved',
    i
  }))
  const long = { ...REPLY, text: 'z'.repeat(1200), thread }
  assert.doesNotThrow(() => buildCommentTurn({ items: [long], now: NOW }))
})

test('a reply beside other comments: `reply-to` only on the reply, the thread sentence once at the end', () => {
  const other = {
    n: 5,
    text: 'Say we also build cold storage.',
    element: { ...ELEMENT, selector: 'p.lead', text: 'Plants…' },
    locate: null
  }
  const turn = buildCommentTurn({ items: [REPLY, other], now: NOW })
  assert.match(turn, /<mentioned-element n="5" url=/)
  assert.match(turn, /<mentioned-element n="6" reply-to="1" url=/)
  assert.ok(turn.endsWith(` ${COMMENT_THREAD}`))
  assert.equal(turn.split(COMMENT_THREAD).length, 2)
})

test('parseCommentTurn gives `replyTo` and the thread lines back; the request is the person’s line', () => {
  const parsed = parseCommentTurn(buildCommentTurn({ items: [REPLY], now: NOW }))
  assert.ok(parsed)
  assert.equal(parsed.request, 'Shorter still — five words max.')
  assert.equal(parsed.items.length, 1)
  assert.equal(parsed.items[0].n, 6)
  assert.equal(parsed.items[0].replyTo, 1)
  assert.deepEqual(parsed.items[0].thread, [
    "Lee (9m ago): Change to 'Building the groundwork for Russia's industry'",
    'akemi.sato (3m ago): Too long for the hero on a phone.'
  ])
  assert.equal(parsed.items[0].element?.text, ELEMENT.text)
  assert.equal(parsed.items[0].text, 'Shorter still — five words max.')
})

test('the chip of a reply: its number, then ↩ and the element’s words; the hint stays hidden', () => {
  const turn = buildCommentTurn({ items: [REPLY], now: NOW })
  const start = turn.indexOf('```tracy-element')
  const end = turn.indexOf('\n```', start) + 4
  const chip = commentTurnFold(turn.slice(start, end), turn.slice(end))
  assert.deepEqual(chip, {
    label: '↩ "Industrial construction, from foundatio…"',
    title: ELEMENT.url,
    trailing: HINT_WITH_THREAD.length + 1,
    n: 6,
    // F6 (stage 6): the people lines of its thread, drawn under the chip; Tracy's step is not one.
    thread: [
      { who: 'Lee', text: "Change to 'Building the groundwork for Russia's industry'" },
      { who: 'akemi.sato', text: 'Too long for the hero on a phone.' }
    ]
  })
})

test('turns without a reply keep their bytes (fixture written before replies)', () => {
  const cases = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909.json', import.meta.url), 'utf8')
  )
  assert.ok(cases.length >= 5)
  for (const { items, turn } of cases) assert.equal(buildCommentTurn({ items }), turn)
})

test('S16: many-comment turns sent with numbered lines read back as the same items, words and elements', () => {
  const sent = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909-numbered.json', import.meta.url), 'utf8')
  )
  const now = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909.json', import.meta.url), 'utf8')
  )
  assert.equal(sent.length, now.length)
  for (const [i, { turn }] of sent.entries()) {
    const [old, current] = [parseCommentTurn(turn), parseCommentTurn(now[i].turn)]
    assert.ok(old && current, `case ${i}`)
    assert.deepEqual(old.items, current.items, `case ${i}`)
    assert.deepEqual(old.element, current.element, `case ${i}`)
    assert.match(turn, /^\d+\. /, `case ${i}: the old turn opens with a number`)
    assert.doesNotMatch(now[i].turn, /(^|\n)\d+\. /, `case ${i}: the new one has none outside its blocks`)
  }
})

test('many-comment turns sent before the reply-language sentence read back as the same items', () => {
  const sent = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909-sent.json', import.meta.url), 'utf8')
  )
  const now = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909-numbered.json', import.meta.url), 'utf8')
  )
  assert.equal(sent.length, now.length)
  for (const [i, { turn }] of sent.entries()) {
    const [old, current] = [parseCommentTurn(turn), parseCommentTurn(now[i].turn)]
    assert.ok(old && current, `case ${i}`)
    assert.deepEqual(old, current, `case ${i}`)
    assert.ok(!turn.includes(COMMENT_REPLY_LANGUAGE) && now[i].turn.includes(COMMENT_REPLY_LANGUAGE))
  }
})

/** The look-scope sentence as every full hint carried it from 29/09 (G1) until 23/10/2026 (B7). */
const LOOK_SCOPE_2909 =
  'A look change says in plain words how far it reaches ("every card heading on every page", "this page only") and ends with the undo its write\'s result gave, e.g. "Card headings are lighter now (weight 600 → 500) on every page and language. Undo: look.revert 7f3a9c".'

test('G1: many-comment turns sent before the look-scope sentence read back as the same items', () => {
  const sent = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909-lookundo.json', import.meta.url), 'utf8')
  )
  const now = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909-numbered.json', import.meta.url), 'utf8')
  )
  assert.equal(sent.length, now.length)
  for (const [i, { turn }] of sent.entries()) {
    assert.deepEqual(parseCommentTurn(turn), parseCommentTurn(now[i].turn), `case ${i}`)
    assert.ok(!turn.includes(LOOK_SCOPE_2909) && now[i].turn.endsWith(LOOK_SCOPE_2909), `case ${i}`)
  }
})

test('B7: many-comment turns sent until 23/10/2026, with `Undo: look.revert <id>`, read back as the same items', () => {
  const sent = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2310-undoline.json', import.meta.url), 'utf8')
  )
  const now = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909.json', import.meta.url), 'utf8')
  )
  assert.equal(sent.length, now.length)
  for (const [i, { turn }] of sent.entries()) {
    assert.deepEqual(parseCommentTurn(turn), parseCommentTurn(now[i].turn), `case ${i}`)
    assert.ok(turn.endsWith(LOOK_SCOPE_2909) && now[i].turn.endsWith(COMMENT_LOOK_SCOPE), `case ${i}`)
  }
})

test('F4: many-comment turns sent before the `lang` tag read back as the same items', () => {
  const sent = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909-lang.json', import.meta.url), 'utf8')
  )
  const now = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909-numbered.json', import.meta.url), 'utf8')
  )
  assert.equal(sent.length, now.length)
  let tagged = 0
  for (const [i, { turn }] of sent.entries()) {
    assert.deepEqual(parseCommentTurn(turn), parseCommentTurn(now[i].turn), `case ${i}`)
    assert.ok(!turn.includes(' lang="') && !turn.includes(COMMENT_REPLY_LANGUAGE), `case ${i}`)
    if (now[i].turn.includes(' lang="')) tagged += 1
  }
  assert.ok(tagged >= 1, 'the regenerated turns carry the tag')
})

test('stage 6: many-comment turns sent with the `- n ✓` list read back as the same items', () => {
  const sent = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909-people.json', import.meta.url), 'utf8')
  )
  const now = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909-numbered.json', import.meta.url), 'utf8')
  )
  assert.equal(sent.length, now.length)
  for (const [i, { turn }] of sent.entries()) {
    assert.deepEqual(parseCommentTurn(turn), parseCommentTurn(now[i].turn), `case ${i}`)
    assert.ok(
      turn.includes('one bullet per number') && !now[i].turn.includes('one bullet per number'),
      `case ${i}`
    )
    assert.ok(now[i].turn.includes(COMMENT_ANSWER_MANY), `case ${i}`)
  }
})

test('stage 6: the chip still hides the pre-stage-6 many-comments hint after an unnumbered block', () => {
  const [{ turn }] = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909-people.json', import.meta.url), 'utf8')
  )
  const hint = turn.slice(turn.lastIndexOf('\n'))
  const one = buildCommentTurn({ text: 'Red', element: ELEMENT, locate: LOCATE })
  const block = one.slice(one.indexOf('```tracy-element'), one.lastIndexOf('```') + 3)
  // An unnumbered block followed by a many-comments hint is not a chip, old hint or new.
  assert.equal(commentTurnFold(block, hint), null)
  assert.equal(commentTurnFold(block, `\n${LOCATE_HINT_MANY}`), null)
})

test('F5 + F7: many-comment turns sent before the naming sentences read back as the same items', () => {
  const sent = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909-named.json', import.meta.url), 'utf8')
  )
  const now = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909-numbered.json', import.meta.url), 'utf8')
  )
  assert.equal(sent.length, now.length)
  for (const [i, { turn }] of sent.entries()) {
    assert.deepEqual(parseCommentTurn(turn), parseCommentTurn(now[i].turn), `case ${i}`)
    assert.ok(
      !turn.includes(COMMENT_NAMED_BY_PAGE) && now[i].turn.includes(COMMENT_NAMED_BY_PAGE),
      `case ${i}`
    )
  }
})

test('V4S-8: many-comment turns sent with the example `comment: [1, 2]` read back as the same items', () => {
  const sent = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-3009-example.json', import.meta.url), 'utf8')
  )
  const now = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-2909.json', import.meta.url), 'utf8')
  )
  assert.equal(sent.length, now.length)
  for (const [i, { turn }] of sent.entries()) {
    assert.deepEqual(parseCommentTurn(turn), parseCommentTurn(now[i].turn), `case ${i}`)
    assert.ok(turn.includes('`comment: [1, 2]`'), `case ${i}: the old turn carries the example`)
    assert.ok(!now[i].turn.includes('[1, 2]') && now[i].turn.includes('`comment: [<n>, …]`'), `case ${i}`)
  }
})

test('V4S-8: the chip still hides the many-comments hint with example numbers after an unnumbered block', () => {
  const [{ turn }] = JSON.parse(
    readFileSync(new URL('./fixtures/comment-turn-many-3009-example.json', import.meta.url), 'utf8')
  )
  const hint = turn.slice(turn.lastIndexOf('\n'))
  assert.ok(hint.includes('`comment: [1, 2]`'))
  const one = buildCommentTurn({ text: 'Red', element: ELEMENT, locate: LOCATE })
  const block = one.slice(one.indexOf('```tracy-element'), one.lastIndexOf('```') + 3)
  assert.equal(commentTurnFold(block, hint), null)
})

test('a bad `reply-to` number is refused like a bad comment number', () => {
  assert.throws(() => buildCommentTurn({ items: [{ ...REPLY, replyTo: 0 }] }), RangeError)
  assert.throws(() => buildCommentTurn({ items: [{ ...REPLY, replyTo: 6 }] }), RangeError)
})

/**
 * F1 (stand E2E stage 5, S6 variant 2, 2/2): the reply being sent named no author — its words were
 * only the numbered line — so the agent read owner A + editor B as one person correcting themselves
 * ("you first asked for A, then no, B") and wrote B instead of asking. The reply's own author now
 * closes the thread, in the same shape, `(now)` for its time, and the thread sentence says that lines
 * with different names are different people.
 */
const OWNER = { name: 'capi-e2e-owner', email: 'capi-e2e-owner@tracy.test' }
const EDITOR = { email: 'capi-e2e-editor@tracy.test' }
const DISPUTE = {
  n: 12,
  text: 'I still want Title A61, keep it',
  element: ELEMENT,
  locate: LOCATE,
  replyTo: 10,
  author: OWNER,
  thread: [
    { author: OWNER, at: NOW - MIN, text: 'Change this heading to: Title A61', status: 'done' },
    { author: EDITOR, at: NOW - 10_000, text: 'No, make it: Title B61', status: 'saved' }
  ]
}

test('F1: the reply’s own author closes the thread — three attributed lines, two distinct names', () => {
  const turn = buildCommentTurn({ items: [DISPUTE], now: NOW })
  const lines = turn.split('\n').filter((l) => l.startsWith('thread: '))
  assert.deepEqual(lines, [
    'thread: capi-e2e-owner (1m ago): Change this heading to: Title A61',
    'thread: capi-e2e-editor (just now): No, make it: Title B61',
    'thread: capi-e2e-owner (now): I still want Title A61, keep it'
  ])
  const people = lines.map((l) => /^thread: ([^:(]+?) \(/.exec(l)?.[1]).filter((who) => who !== undefined)
  assert.equal(people.length, 3)
  assert.equal(new Set(people).size, 2)
  // Right after the head, before the element's own lines.
  assert.match(turn, /reply-to="10" [^\n]*>\nthread: capi-e2e-owner \(1m ago\)/)
})

test('F1: the editor’s reply to the owner is attributed to the editor, not left for "the person"', () => {
  const turn = buildCommentTurn({
    items: [
      {
        ...DISPUTE,
        text: 'No, make it: Title B63',
        author: EDITOR,
        thread: [{ author: OWNER, at: NOW - MIN, text: 'Change this heading to: Title A63', status: 'done' }]
      }
    ],
    now: NOW
  })
  const lines = turn.split('\n').filter((l) => l.startsWith('thread: '))
  assert.deepEqual(lines, [
    'thread: capi-e2e-owner (1m ago): Change this heading to: Title A63',
    'thread: capi-e2e-editor (now): No, make it: Title B63'
  ])
})

test('F1: parse round-trips the reply’s own line as the last thread line', () => {
  const parsed = parseCommentTurn(buildCommentTurn({ items: [DISPUTE], now: NOW }))
  assert.ok(parsed)
  assert.equal(parsed.request, 'I still want Title A61, keep it')
  assert.deepEqual(parsed.items[0].thread, [
    'capi-e2e-owner (1m ago): Change this heading to: Title A61',
    'capi-e2e-editor (just now): No, make it: Title B61',
    'capi-e2e-owner (now): I still want Title A61, keep it'
  ])
  assert.equal(parsed.items[0].text, 'I still want Title A61, keep it')
})

test('F1: a disputed thread ends with the thread sentence', () => {
  assert.ok(buildCommentTurn({ items: [DISPUTE], now: NOW }).endsWith(` ${COMMENT_THREAD}`))
})

test('F1: a reply whose author is unknown gets no invented line of its own', () => {
  const { author: _a, ...anonymous } = DISPUTE
  const lines = buildCommentTurn({ items: [anonymous], now: NOW })
    .split('\n')
    .filter((l) => l.startsWith('thread: '))
  assert.equal(lines.length, 2)
  assert.ok(!lines.some((l) => l.includes('(now)')))
})

test('F1: the reply’s own line survives a full thread, and a full thread with a long reply still fits', () => {
  const thread = Array.from({ length: 16 }, (_, i) => ({
    author: 'Lee',
    at: NOW - (20 - i) * MIN,
    text: `${'word '.repeat(400)}${i}`.trim(),
    status: 'saved'
  }))
  const turn = buildCommentTurn({
    items: [{ ...DISPUTE, text: 'z'.repeat(1200), thread }],
    now: NOW
  })
  const lines = turn.split('\n').filter((l) => l.startsWith('thread: '))
  assert.ok(lines.at(-1)?.startsWith('thread: capi-e2e-owner (now): zzz'))
  assert.ok(lines.at(-1)?.endsWith('z'.repeat(1200)), 'the reply’s own words whole (TH-3)')
  // The earlier thread keeps its own cap.
  assert.ok(lines.slice(0, -1).join('\n').length <= THREAD_MAX)
})

/**
 * F9 / G3 (stand E2E stage 5) put what Tracy answered for an earlier comment on a thread line
 * (`tracy: ✓ updated: …`, `tracy: ✓ answered: …`). Stage 6 (Rule 7) retired the comment status those
 * lines came from: Tracy's answers are in the chat, and the thread is the people's. An entry that
 * still carries a stage-5 status and answer prints its person's line alone.
 */
test('F9 / G3 retired: an entry’s old answer is never a thread line, whatever its status', () => {
  const turn = buildCommentTurn({
    items: [
      {
        ...DISPUTE,
        thread: [
          { author: OWNER, at: NOW - MIN, text: 'Change it', status: 'done', answer: 'updated: it reads X' },
          { author: EDITOR, at: NOW - 10_000, text: 'Is it bold?', status: 'failed', answer: 'theme weight' },
          { author: EDITOR, at: NOW - 5000, text: 'What does it say?', status: 'done', answer: 'answered: X' }
        ]
      }
    ],
    now: NOW
  })
  const lines = turn.split('\n').filter((l) => l.startsWith('thread: '))
  assert.equal(lines.length, 4)
  assert.ok(!lines.some((l) => /tracy:|✓|✗|it reads X|theme weight/.test(l)), lines.join('\n'))
})

test('G2: a parent its author removed stays in the thread as who and when, never its words', () => {
  const turn = buildCommentTurn({
    items: [
      {
        ...REPLY,
        thread: [{ author: 'Lee', at: NOW - 5 * MIN, text: '', status: 'removed' }]
      }
    ],
    now: NOW
  })
  const lines = turn.split('\n').filter((l) => l.startsWith('thread: '))
  assert.equal(lines[0], 'thread: Lee (5m ago): [comment removed by its author]')
  assert.equal(lines.length, REPLY.author === undefined ? 1 : 2)
})

/**
 * N1 (stage-5 acceptance round 2, 29/09): the owner's "EST. CHARLIE" updated; the editor's reply
 * "No, make it: EST. DELTA" waited unsent; the owner's later reply "I still want EST. CHARLIE, keep
 * it" was answered. The editor then sent the old reply — its block showed only the thread BEFORE it,
 * and Tracy wrote DELTA over the owner's decision. Now the block carries the whole thread: the lines
 * written after the reply come after its own line, each marked `written after this one`.
 */
const LATE_REPLY = {
  n: 54,
  text: 'No, make it: EST. DELTA',
  element: ELEMENT,
  locate: LOCATE,
  replyTo: 53,
  author: EDITOR,
  thread: [
    {
      author: OWNER,
      at: NOW - 30 * MIN,
      text: 'Change this label to: EST. CHARLIE',
      status: 'done',
      answer: 'updated: the label reads EST. CHARLIE'
    },
    {
      author: OWNER,
      at: NOW - 10 * MIN,
      text: 'I still want EST. CHARLIE, keep it',
      status: 'done',
      answer: 'answered: it already reads EST. CHARLIE',
      later: true
    }
  ]
}

test('N1: an old reply sent late shows the thread written after it — after its own line, marked later', () => {
  const lines = buildCommentTurn({ items: [LATE_REPLY], now: NOW })
    .split('\n')
    .filter((l) => l.startsWith('thread: '))
  assert.deepEqual(lines, [
    'thread: capi-e2e-owner (30m ago): Change this label to: EST. CHARLIE',
    'thread: capi-e2e-editor (now, written before the lines after it): No, make it: EST. DELTA',
    'thread: capi-e2e-owner (10m ago, written after this one): I still want EST. CHARLIE, keep it'
  ])
})

test('N1: the latest word is never trimmed away — a full earlier thread loses its oldest lines, not the later ones', () => {
  const earlier = Array.from({ length: 16 }, (_, i) => ({
    author: 'Hano',
    at: NOW - (60 - i) * MIN,
    text: `${'word '.repeat(400)}${i}`.trim(),
    status: 'saved'
  }))
  const turn = buildCommentTurn({
    items: [{ ...LATE_REPLY, thread: [...earlier, LATE_REPLY.thread[1]] }],
    now: NOW
  })
  const lines = turn.split('\n').filter((l) => l.startsWith('thread: '))
  assert.equal(
    lines.at(-1),
    'thread: capi-e2e-owner (10m ago, written after this one): I still want EST. CHARLIE, keep it'
  )
  assert.ok(lines[0].endsWith(' 0'), 'the root stays (TH-3)')
  assert.ok(!lines.some((l) => l.endsWith(' 1')), 'the oldest earlier reply went first')
})

test('N1: a top-level comment sent after replies stood under it carries them as later thread lines, no reply-to', () => {
  const turn = buildCommentTurn({
    items: [
      {
        n: 53,
        text: 'Change this label to: EST. CHARLIE',
        element: ELEMENT,
        locate: LOCATE,
        author: OWNER,
        thread: [
          {
            author: EDITOR,
            at: NOW - 2 * MIN,
            text: 'No, make it: EST. DELTA',
            status: 'pending',
            later: true
          }
        ]
      }
    ],
    now: NOW
  })
  assert.ok(!turn.includes('reply-to='))
  assert.match(turn, /<mentioned-element n="53" url=/)
  assert.deepEqual(
    turn.split('\n').filter((l) => l.startsWith('thread: ')),
    [
      'thread: capi-e2e-owner (now, written before the lines after it): Change this label to: EST. CHARLIE',
      'thread: capi-e2e-editor (2m ago, written after this one): No, make it: EST. DELTA'
    ]
  )
  assert.ok(turn.endsWith(` ${COMMENT_THREAD}`))
})
