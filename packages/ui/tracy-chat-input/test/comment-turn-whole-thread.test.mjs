/**
 * TH-3 (stage-6 acceptance e2e v3, 30/09): Send to Tracy from a thread card on a 23-message thread
 * reached Tracy as the last 6 replies and the typed words — the comment itself and 16 replies were
 * dropped by a 600-character thread cap (`THREAD_MAX`), and every line was cut at 300 characters.
 * Rule 16 / contract H3: the WHOLE thread reaches Tracy. A thread now has {@link THREAD_MAX} characters
 * (24,000) and a turn {@link THREAD_TURN_MAX} for all its threads together; one line keeps a whole
 * comment (up to the 5,000-character comment limit). A thread that still does not fit keeps its ROOT
 * and its NEWEST lines and says in one line how many earlier replies it leaves out, so Tracy knows
 * the thread is not whole — and the chat bubble shows that line too.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCommentTurn,
  commentTurnFold,
  THREAD_MAX,
  THREAD_TURN_MAX
} from '../src/client/comment-turn.mjs'

const NOW = Date.UTC(2026, 8, 30, 4, 0, 0)
const MIN = 60_000
const ELEMENT = {
  url: 'https://r2e2308.tracy.test/',
  selector: 'h3',
  label: 'Services › heading',
  text: 'Maintenance & retrofit'
}
const A = { name: 'Sam Tester', email: 'e2e3-thread-a@example.test' }
const B = { name: 'Sam Tester', email: 'e2e3-thread-b@example.test' }

/** The acceptance thread: the comment and 22 replies of ~50 characters, A and B in turn. */
function thread(
  replies = 22,
  words = (i) => `R${String(i).padStart(2, '0')} reply words that fill about fifty chars`
) {
  return [
    { author: A, at: NOW - 60 * MIN, text: 'E2E3-T01 first note from A' },
    ...Array.from({ length: replies }, (_, i) => ({
      author: i % 2 === 0 ? B : A,
      at: NOW - (40 - i) * MIN,
      text: words(i + 1)
    }))
  ]
}

const cardSend = (t, extra = {}) => ({
  n: 140,
  url: ELEMENT.url,
  element: ELEMENT,
  locate: null,
  text: 'Please do what the thread agreed.',
  author: B,
  thread: t,
  ...extra
})

const threadLines = (turn) => turn.split('\n').filter((l) => l.startsWith('thread: '))

/** Split a turn into its fenced blocks and what follows each, as dsh hands them to a fold. */
function folds(turn) {
  const out = []
  const re = /```tracy-element\n[\s\S]*?\n```/g
  for (let m = re.exec(turn); m; m = re.exec(turn))
    out.push(commentTurnFold(m[0], turn.slice(m.index + m[0].length)))
  return out
}

test('TH-3: a 23-message thread sent from its card reaches Tracy whole — the comment, every reply, the typed words', () => {
  const turn = buildCommentTurn({ items: [cardSend(thread())], numbered: true, now: NOW })
  const lines = threadLines(turn)
  assert.equal(lines.length, 24, lines.join('\n'))
  assert.match(lines[0], /E2E3-T01 first note from A$/)
  for (let i = 1; i <= 22; i += 1)
    assert.ok(lines[i].includes(`R${String(i).padStart(2, '0')} `), `reply ${i}: ${lines[i]}`)
  assert.match(lines[23], /\(now\): Please do what the thread agreed\.$/)
  assert.ok(!turn.includes('not shown'))
})

test('a reply as long as the comment limit (5,000 characters) is one whole thread line', () => {
  const long = 'w'.repeat(5_000)
  const turn = buildCommentTurn({
    items: [cardSend([{ author: A, at: NOW - MIN, text: long }])],
    numbered: true,
    now: NOW
  })
  assert.ok(threadLines(turn)[0].endsWith(long))
})

test('a thread past its cap keeps the ROOT and the NEWEST replies, and says how many earlier replies are left out', () => {
  // 30 replies of 1,000 characters: 30,000+ characters, past the 24,000 cap.
  const t = thread(30, (i) => `R${String(i).padStart(2, '0')} ${'x'.repeat(996)}`)
  const turn = buildCommentTurn({ items: [cardSend(t)], numbered: true, now: NOW })
  const lines = threadLines(turn)
  assert.match(lines[0], /E2E3-T01 first note from A$/, 'the root stays first')
  const marker = /^thread: … (\d+) earlier replies not shown …$/.exec(lines[1])
  assert.ok(marker, `second line says what is left out: ${lines[1]}`)
  const kept = lines.slice(2, -1)
  assert.equal(Number(marker[1]) + kept.length, 30, 'every reply is either shown or counted')
  assert.ok(kept.at(-1)?.includes('R30 '), 'the newest reply stays')
  assert.ok(
    kept[0].includes(`R${String(Number(marker[1]) + 1).padStart(2, '0')} `),
    'the kept replies are the newest, in order'
  )
  assert.match(lines.at(-1), /\(now\): Please do what the thread agreed\.$/)
  const earlier = lines.slice(0, -1).join('\n')
  assert.ok(earlier.length <= THREAD_MAX, `thread is ${earlier.length} characters`)
})

test('the bubble shows the whole thread, and the left-out line when there is one', () => {
  const whole = folds(buildCommentTurn({ items: [cardSend(thread())], numbered: true, now: NOW }))[0]
  assert.equal(
    whole?.thread?.length,
    23,
    'the comment and its 22 replies (the (now) line is the bubble’s own)'
  )
  assert.equal(whole?.thread?.[0].text, 'E2E3-T01 first note from A')

  const t = thread(30, (i) => `R${String(i).padStart(2, '0')} ${'x'.repeat(996)}`)
  const cut = folds(buildCommentTurn({ items: [cardSend(t)], numbered: true, now: NOW }))[0]
  assert.equal(cut?.thread?.[0].text, 'E2E3-T01 first note from A')
  assert.deepEqual(cut?.thread?.[1], { who: '', text: cut?.thread?.[1].text })
  assert.match(cut?.thread?.[1].text ?? '', /^… \d+ earlier replies not shown …$/)
})

test('several long threads in one turn share the turn budget: each keeps its root and newest line, all of them fit', () => {
  const items = Array.from({ length: 6 }, (_, k) =>
    cardSend(
      thread(20, (i) => `T${k} R${String(i).padStart(2, '0')} ${'y'.repeat(990)}`),
      { n: 150 + k, element: { ...ELEMENT, selector: `section:nth-of-type(${k + 1}) h3` } }
    )
  )
  const turn = buildCommentTurn({ items, numbered: true, now: NOW })
  const all = threadLines(turn)
  assert.ok(
    all.join('\n').length <= THREAD_TURN_MAX + 6 * 5_300,
    `threads are ${all.join('\n').length} characters`
  )
  for (let k = 0; k < 6; k += 1) {
    assert.ok(
      all.some((l) => l.includes('E2E3-T01')),
      'roots stay'
    )
    assert.ok(
      all.some((l) => l.includes(`T${k} R20 `)),
      `thread ${k} keeps its newest reply`
    )
  }
  assert.ok(all.filter((l) => /earlier replies not shown/.test(l)).length === 6)
})
