/**
 * Stage 6 of "Comment → edit" (plan `tasks/todo-comment-people.md` § Rule 7, contract H3): comments are
 * people talking to people, and "Send to Tracy" hands work to Tracy in the chat. So Tracy answers a
 * turn sent from the page the way it answers anyone in the chat — no `- n ✓ updated: …` / `- n ✗ …`
 * line grammar, no "updated / replied / answered" verbs (the Comments view no longer reads them); with
 * several comments it says in plain words which were done and which were not (a ✓ or ✗ at a line's
 * start is allowed, not required).
 *
 * What stays: the thread is a conversation between people (last agreed intent; an unsettled
 * disagreement → a question card naming who said what; a dismissed card → no write), the reply in each
 * comment's language, plain words (the look change's `Undo: look.revert <id>` and scope), the words in
 * an image → ✗ + a question card, the site-files fence, and `comment: <n>` on every write.
 *
 * New in the thread lines: two people with one display name are told apart by the start of their
 * e-mail, and each earlier send of the thread is one `thread: sent to Tracy by <name> (<ago>)` line.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as turnModule from '../src/client/comment-turn.mjs'
import {
  buildCommentTurn,
  COMMENT_ANSWER_MANY,
  COMMENT_ANSWER_ONE,
  COMMENT_IMAGE_WORDS,
  COMMENT_LOOK_SCOPE,
  COMMENT_NAMED_BY_PAGE,
  COMMENT_REPLY_LANGUAGE,
  COMMENT_WHAT_CHANGED,
  COMMENT_THREAD,
  COMMENT_TURN_LIMIT,
  COMMENT_WRITES_ONLY,
  LOCATE_HINT,
  LOCATE_HINT_INCOMPLETE,
  LOCATE_HINT_MANY,
  LOCATE_HINT_MANY_GENERAL,
  LOCATE_HINT_MANY_INCOMPLETE,
  LOCATE_HINT_MANY_INCOMPLETE_GENERAL,
  locateHint,
  parseCommentTurn
} from '../src/client/comment-turn.mjs'

const NOW = Date.UTC(2026, 8, 29, 22, 0, 0)
const MIN = 60_000
const ELEMENT = { url: 'https://s.test/', selector: 'h1', label: 'heading', text: 'Groundwork', marks: [] }

/** The line grammar Rule 7 drops, in every shape the hints and rules used to carry it. */
const LINE_GRAMMAR = [
  /`- (?:\d+ )?[✓✗]/u,
  /✓ updated/u,
  /✓ answered/u,
  /✓ replied/u,
  /the word updated/u,
  /never changed/u,
  /End with one line/u,
  /markdown list/u,
  /one bullet per number/u,
  /✗ waiting for/u,
  /shows as Failed/u
]

/** @param {string} text @param {string} name */
function noLineGrammar(text, name) {
  for (const pattern of LINE_GRAMMAR) assert.doesNotMatch(text, pattern, `${name}: ${pattern}`)
}

const EVERY_HINT = {
  LOCATE_HINT,
  LOCATE_HINT_INCOMPLETE,
  LOCATE_HINT_MANY,
  LOCATE_HINT_MANY_INCOMPLETE,
  LOCATE_HINT_MANY_GENERAL,
  LOCATE_HINT_MANY_INCOMPLETE_GENERAL,
  short: locateHint({ incomplete: false, short: true }),
  shortIncomplete: locateHint({ incomplete: true, short: true }),
  COMMENT_THREAD,
  COMMENT_LOOK_SCOPE,
  COMMENT_REPLY_LANGUAGE,
  COMMENT_WRITES_ONLY
}

test('Rule 7: no hint and no shared sentence carries the dropped `- n ✓/✗` line grammar or its verbs', () => {
  for (const [name, text] of Object.entries(EVERY_HINT)) noLineGrammar(text, name)
  // The sentences built only on that grammar are gone from the module, not just unused.
  assert.equal('COMMENT_ANSWERED' in turnModule, false)
  assert.equal('COMMENT_LINE_IS_REPLY' in turnModule, false)
})

test('Rule 7: one comment is answered naturally in the chat, in plain words', () => {
  assert.match(COMMENT_ANSWER_ONE, /^Answer in the chat as you would answer a person, in plain words/)
  assert.match(COMMENT_ANSWER_ONE, /what you could not do and why/)
  for (const hint of [LOCATE_HINT, LOCATE_HINT_INCOMPLETE]) assert.ok(hint.includes(COMMENT_ANSWER_ONE))
  assert.ok(!LOCATE_HINT.includes(COMMENT_ANSWER_MANY))
  // The short form keeps the language and plain-words clause, without a line to end with.
  const short = locateHint({ incomplete: false, short: true })
  assert.match(short, /Answer in plain words, in its language \(`lang`\), never naming it;/)
  assert.ok(!short.includes(COMMENT_ANSWER_ONE), 'the short form has no line to end with')
})

test('Rule 7: several comments — say in plain words which were done and which not; ✓/✗ allowed, not required', () => {
  assert.match(COMMENT_ANSWER_MANY, /^Answer in the chat as you would answer a person, in plain words/)
  assert.match(COMMENT_ANSWER_MANY, /which you did and which you could not, and why/)
  assert.match(COMMENT_ANSWER_MANY, /a ✓ or ✗ at the start of a line is fine, never required/u)
  for (const hint of [
    LOCATE_HINT_MANY,
    LOCATE_HINT_MANY_INCOMPLETE,
    LOCATE_HINT_MANY_GENERAL,
    LOCATE_HINT_MANY_INCOMPLETE_GENERAL
  ]) {
    assert.ok(hint.includes(COMMENT_ANSWER_MANY), hint)
    assert.ok(!hint.includes(COMMENT_ANSWER_ONE), hint)
    // The server still checks the number on every write (contract H1): it stays.
    assert.ok(hint.includes('pass `comment: <n>` on every `tracy_site` or `tracy_emdash` call'), hint)
    assert.ok(hint.includes('`comment: [<n>, …]`'), hint)
    assert.doesNotMatch(hint, /comment: \[?\d/, hint)
    assert.ok(hint.includes('say why and go on with the next'), hint)
  }
})

test('Rule 7 keeps: the reply in each comment’s language, plain words, the look scope and its undo', () => {
  assert.match(
    COMMENT_REPLY_LANGUAGE,
    /Answer each item in the language it was written in \(its block's `lang`/
  )
  assert.match(COMMENT_REPLY_LANGUAGE, /the rest of your answer in the last item's/)
  assert.match(COMMENT_REPLY_LANGUAGE, /never say which language you use or why/)
  assert.match(COMMENT_WRITES_ONLY, /never edit theme, template, plugin or PHP\/JS\/CSS files/)
  assert.match(
    COMMENT_WRITES_ONLY,
    /never a selector, id, mark, tool or action name, error code or receipt id/
  )
  assert.match(COMMENT_WRITES_ONLY, /a look change too, is undone by asking you, so say that/)
  assert.match(COMMENT_LOOK_SCOPE, /how far it reaches/)
  // B7 (23/10/2026): the undo is said in words; the id never reaches the reply.
  assert.match(COMMENT_LOOK_SCOPE, /Ask me and I will put them back/)
  assert.doesNotMatch(`${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`, /Undo: look\.revert/)
  // Words drawn inside a picture: still ✗ and a question card offering a new image.
  assert.match(COMMENT_IMAGE_WORDS, /✗ the words are part of the image file <file>/)
  assert.match(COMMENT_IMAGE_WORDS, /question card whether the person wants to replace the image/)
  for (const hint of [LOCATE_HINT, LOCATE_HINT_MANY])
    assert.ok(
      hint.endsWith(
        `${COMMENT_NAMED_BY_PAGE} ${COMMENT_WHAT_CHANGED} ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`
      ),
      hint
    )
})

test('Rule 7 keeps the thread as people talking: last agreed intent, ask on a dispute, a dismissed card writes nothing, names not roles', () => {
  assert.match(COMMENT_THREAD, /conversation between people, not a list of orders/)
  assert.match(COMMENT_THREAD, /act on the LAST agreed intent/)
  assert.match(COMMENT_THREAD, /do not choose: ask with a question card/)
  assert.match(COMMENT_THREAD, /naming who said what/)
  assert.match(
    COMMENT_THREAD,
    /if that card is dismissed or comes back with no choice, change nothing for that item and say it waits for <names> to agree/
  )
  assert.match(COMMENT_THREAD, /by the name its line gives, never by a role/)
  // The two new kinds of line are said too.
  assert.match(COMMENT_THREAD, /two people with one name get the start of their e-mail after it/)
  assert.match(COMMENT_THREAD, /a `sent to Tracy by` line is an earlier time someone sent this thread to you/)
})

/** A top-level comment sent from its thread card, with the thread under it. */
const THREADED = {
  n: 12,
  text: 'Keep it short',
  element: ELEMENT,
  author: { name: 'Lee', email: 'lee@example.com' },
  thread: [
    { author: { name: 'Minh', email: 'minh.tran@example.org' }, at: NOW - 30 * MIN, text: 'Title A' },
    { author: { name: 'Minh', email: 'minh.le@example.com' }, at: NOW - 20 * MIN, text: 'No, title B' },
    { author: { name: 'Akemi', email: 'akemi@example.com' }, at: NOW - 10 * MIN, text: 'B is fine' }
  ]
}

/** @param {string} turn @returns {string[]} the thread lines of the first block, without their prefix. */
const threadOf = (turn) =>
  parseCommentTurn(turn)?.items[0].thread ?? [...turn.matchAll(/\nthread: ([^\n]*)/g)].map((m) => m[1])

test('two people with one display name are told apart by the start of their e-mail; a unique name is left alone', () => {
  const lines = threadOf(buildCommentTurn({ items: [THREADED], now: NOW }))
  assert.deepEqual(lines, [
    'Minh (minh.tran) (30m ago): Title A',
    'Minh (minh.le) (20m ago): No, title B',
    'Akemi (10m ago): B is fine',
    'Lee (now): Keep it short'
  ])
})

test('the sender counts as one of the people: a name they share with someone in the thread is told apart too', () => {
  const lines = threadOf(
    buildCommentTurn({
      items: [{ ...THREADED, author: { name: 'Akemi', email: 'akemi.sato@example.org' } }],
      now: NOW
    })
  )
  assert.equal(lines[2], 'Akemi (akemi) (10m ago): B is fine')
  assert.equal(lines[3], 'Akemi (akemi.sato) (now): Keep it short')
  // The same person twice (same e-mail) is one person, whatever case the address arrives in.
  const same = threadOf(
    buildCommentTurn({
      items: [{ ...THREADED, author: { name: 'Akemi', email: 'AKEMI@example.com' } }],
      now: NOW
    })
  )
  assert.equal(same[2], 'Akemi (10m ago): B is fine')
  assert.equal(same[3], 'Akemi (now): Keep it short')
})

test('each earlier send of the thread is one `sent to Tracy by <name> (<ago>)` line, in time order among the others', () => {
  const lines = threadOf(
    buildCommentTurn({
      items: [
        {
          ...THREADED,
          sends: [
            { author: { name: 'Akemi', email: 'akemi@example.com' }, at: NOW - 5 * MIN },
            { author: 'Lee', at: NOW - 25 * MIN }
          ]
        }
      ],
      now: NOW
    })
  )
  assert.deepEqual(lines, [
    'Minh (minh.tran) (30m ago): Title A',
    'sent to Tracy by Lee (25m ago)',
    'Minh (minh.le) (20m ago): No, title B',
    'Akemi (10m ago): B is fine',
    'sent to Tracy by Akemi (5m ago)',
    'Lee (now): Keep it short'
  ])
})

test("a thread entry with `sent: true` (the fork's shape) reads exactly like an item of `sends`", () => {
  const sends = [
    { author: { name: 'Akemi', email: 'akemi@example.com' }, at: NOW - 5 * MIN },
    { author: 'Lee', at: NOW - 25 * MIN }
  ]
  const viaSends = buildCommentTurn({ items: [{ ...THREADED, sends }], now: NOW })
  const viaThread = buildCommentTurn({
    items: [{ ...THREADED, thread: [...sends.map((s) => ({ ...s, sent: true })), ...THREADED.thread] }],
    now: NOW
  })
  assert.equal(viaThread, viaSends)
  assert.match(viaThread, /\nthread: sent to Tracy by Lee \(25m ago\)\nthread: Minh \(minh\.le\)/)
})

test('no `sends` is no send line; a comment with only earlier sends still carries them, numbered, with the thread sentence', () => {
  const plain = buildCommentTurn({ items: [THREADED], now: NOW })
  assert.doesNotMatch(plain, /\nthread: sent to Tracy by/)
  const again = buildCommentTurn({
    items: [
      {
        n: 7,
        text: 'Make it red',
        element: ELEMENT,
        author: 'Lee',
        sends: [{ author: { email: 'akemi@example.com' }, at: NOW - 2 * 60 * MIN }]
      }
    ],
    now: NOW
  })
  assert.match(again, /\nthread: sent to Tracy by akemi \(2h ago\)\n/)
  assert.match(again, /\nthread: Lee \(now\): Make it red\n/)
  assert.ok(again.endsWith(` ${COMMENT_THREAD}`))
  assert.equal(parseCommentTurn(again)?.items[0].n, 7)
})

test('a thread line no longer carries Tracy’s old step (`tracy: ✓ updated: …`): the chat holds what Tracy said', () => {
  const turn = buildCommentTurn({
    items: [
      {
        ...THREADED,
        thread: [{ ...THREADED.thread[0], status: 'done', answer: 'updated: the heading reads Title A' }]
      }
    ],
    now: NOW
  })
  assert.doesNotMatch(turn, /\nthread: tracy:/)
  noLineGrammar(turn, 'a turn whose thread entry carries an old status')
})

test('the budget: the page data keeps exactly the room stage 5 gave it, whatever the hint weighs now', () => {
  // 2,066: the full one-comment hint of stage 5 (F4 + F14); 3,441: its limit; 10: one ` lang="en"`.
  // The limit moves with the hint, so the room left for the page data stays what stage 5 gave it.
  assert.equal(COMMENT_TURN_LIMIT - LOCATE_HINT.length - 10, 3441 - 2066 - 10)
})

/**
 * Stage-6 acceptance F5 (`tasks/evidence/comment-people/acceptance.md`, S3/S12): Tracy answered
 * "Đã làm xong bình luận 20.", "Xong bình luận 39." and titled a question card "Comment 107" — a number
 * the person never saw (the server's counter), and "comment" for a page send, which creates none.
 * F7 (S1): Tracy said it changed "the Vietnamese version" of the home page; the post it wrote was `en`.
 */
test('F5: the number is for calls only; each item is named by its words on the page; a page send is a request', () => {
  assert.match(
    COMMENT_NAMED_BY_PAGE,
    /never write one, nor "comment <n>", in your answer or in a question card/
  )
  assert.match(COMMENT_NAMED_BY_PAGE, /name each item by what it is on the page, quoting a few of its words/)
  assert.match(COMMENT_NAMED_BY_PAGE, /what the person sent from the page is a request, not a comment/)
  for (const [name, hint] of Object.entries({
    LOCATE_HINT,
    LOCATE_HINT_INCOMPLETE,
    LOCATE_HINT_MANY,
    LOCATE_HINT_MANY_INCOMPLETE,
    LOCATE_HINT_MANY_GENERAL,
    LOCATE_HINT_MANY_INCOMPLETE_GENERAL
  }))
    assert.ok(hint.includes(COMMENT_NAMED_BY_PAGE), name)
  // The question card: one question per item, labelled by its element's words, never `Comment <n>:`.
  assert.doesNotMatch(COMMENT_THREAD, /`Comment <n>:`/)
  assert.match(
    COMMENT_THREAD,
    /one question per item, opened with a few words of its element \(the heading "…"\), never its number/
  )
  // The answer sentences speak of requests, not comments.
  assert.doesNotMatch(COMMENT_ANSWER_MANY, /comments/)
  assert.doesNotMatch(COMMENT_REPLY_LANGUAGE, /comment/)
})

test('F7: the page and language changed are named only from the write’s result, never guessed', () => {
  assert.match(
    COMMENT_WHAT_CHANGED,
    /Name the page and language you changed only as the write's result names them/
  )
  assert.match(COMMENT_WHAT_CHANGED, /never from the language the request was written in/)
  assert.match(COMMENT_WHAT_CHANGED, /when the result names none, name no language/)
  for (const hint of [LOCATE_HINT, LOCATE_HINT_MANY, LOCATE_HINT_MANY_INCOMPLETE_GENERAL])
    assert.ok(hint.includes(COMMENT_WHAT_CHANGED), hint)
  const short = locateHint({ incomplete: false, short: true })
  assert.match(short, /name what changed as the write's result does\.$/, short)
})
