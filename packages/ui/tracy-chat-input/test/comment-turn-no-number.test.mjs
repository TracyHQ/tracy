/**
 * 🔒 NO INTERNAL NUMBER IN WHAT PEOPLE SEE (acceptance v2 S16 / v1 F5, Rule 2 and 7). A request's
 * number `n` comes from the server's counter (`POST /requests`) and is for Tracy and the Apply door
 * only; the person never saw "41" anywhere. dsh draws a sent turn by folding each registered fenced
 * block (and the hint line after the last one) into a chip; every other byte of the turn is shown as
 * it is. So a number anywhere outside the blocks reaches the bubble: the turn's plain text carries the
 * person's words only, each comment's words right above its own block, and the number lives in the
 * block (`n="41"`), where the model still reads it.
 *
 * `bubbleOf` projects a turn through dsh's own `userTextFoldRanges` and the plugin's real registration.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCommentTurn, parseCommentTurn, registerCommentFold } from '../src/client/comment-turn.mjs'

const { userTextFoldRanges } = await import(
  new URL(
    '../../../../vendor/tracy/deepseek-harness/packages/client/ui-primitives/src/user-text-folds.ts',
    import.meta.url
  ).href
)

/** The folds this plugin registers, captured from a stand-in registry. */
function registeredFolds() {
  /** @type {{ fence: string, fold(block: string, after: string): any }[]} */
  const folds = []
  registerCommentFold(
    {
      register(fold) {
        folds.push(fold)
        return () => {}
      }
    },
    () => 'icon'
  )
  return folds
}

/**
 * What the bubble shows, through dsh's own fold ranges: plain runs as they are, each chip as `⟦label⟧`.
 * @param {string} text
 * @returns {{ plain: string, chips: number, shown: string }}
 */
function bubbleOf(text) {
  const ranges = userTextFoldRanges(text, registeredFolds())
  let shown = ''
  let plain = ''
  let cursor = 0
  for (const range of ranges) {
    const run = text.slice(cursor, range.start)
    plain += `${run}\n`
    shown += `${run}${range.lineBreak ? '\n' : ''}⟦${range.chip.label}⟧`
    cursor = range.end
  }
  plain += text.slice(cursor)
  shown += text.slice(cursor)
  return { plain, chips: ranges.length, shown }
}

/** A line of what people see that opens with a number and a dot — the leak S16 found. */
const NUMBERED = /(?:^|\n)\s*\d+\.\s/

const element = (path, selector, words) => ({
  url: `https://s.test${path}`,
  selector,
  label: 'heading',
  text: words,
  marks: []
})

const E01 = {
  n: 41,
  text: 'E2E2-E01 chỉ trả lời ok',
  element: element('/', 'main h2.a', 'Our services'),
  locate: null
}
const E05 = {
  n: 42,
  text: 'E2E2-E05 held\nsecond line',
  element: element('/', 'main p.b', 'We build'),
  locate: null
}
const E08 = { n: 43, text: 'E2E2-E08 the whole page', element: null, url: 'https://s.test/en/' }

test('S16: one comment from the page shows its words, not its request number', () => {
  const turn = buildCommentTurn({ items: [E01], numbered: true })
  const { plain, chips } = bubbleOf(turn)
  assert.equal(chips, 1)
  assert.doesNotMatch(plain, NUMBERED, plain)
  assert.match(plain, /E2E2-E01 chỉ trả lời ok/)
  // Tracy still reads the number, in the block.
  assert.match(turn, /<mentioned-element n="41" /)
  const parsed = parseCommentTurn(turn)
  assert.deepEqual(
    parsed?.items.map((i) => [i.n, i.text]),
    [[41, 'E2E2-E01 chỉ trả lời ok']]
  )
})

test('S16: several comments (Send all) — one chip each, each under its own words, no number', () => {
  const turn = buildCommentTurn({ items: [E05, E01, E08] })
  const { plain, chips, shown } = bubbleOf(turn)
  assert.equal(chips, 3)
  assert.doesNotMatch(plain, NUMBERED, shown)
  // Every comment's words, in number order, each right above its chip.
  assert.match(
    shown,
    /^E2E2-E01 chỉ trả lời ok\n⟦[^⟧]*⟧\n+E2E2-E05 held\nsecond line\n⟦[^⟧]*⟧\n+E2E2-E08 the whole page\n⟦\/en\/⟧$/u,
    shown
  )
  // The turn still opens with the person's words (dsh titles a session from them).
  assert.ok(turn.startsWith('E2E2-E01 chỉ trả lời ok\n'), turn.slice(0, 60))
  assert.match(turn, /n="41" /)
  assert.match(turn, /n="42" /)
  assert.match(turn, /<page n="43" /)
  const parsed = parseCommentTurn(turn)
  assert.deepEqual(
    parsed?.items.map((i) => [i.n, i.text]),
    [
      [41, 'E2E2-E01 chỉ trả lời ok'],
      [42, 'E2E2-E05 held\nsecond line'],
      [43, 'E2E2-E08 the whole page']
    ]
  )
})

test('S16: comments on one element travel as one chip; every one of their words shows, unnumbered', () => {
  const same = element('/', 'main h2.a', 'Our services')
  const a = { n: 7, text: 'Make it shorter', element: same, locate: null, author: 'Mai', at: 1000 }
  const b = { n: 9, text: 'No, keep it long', element: same, locate: null, author: 'Lee', at: 2000 }
  const other = { n: 8, text: 'Bolder please', element: element('/', 'main p.b', 'We build'), locate: null }
  const turn = buildCommentTurn({ items: [a, b, other], now: 5000 })
  const { plain, chips, shown } = bubbleOf(turn)
  assert.equal(chips, 2)
  assert.doesNotMatch(plain, NUMBERED, shown)
  for (const words of ['Make it shorter', 'No, keep it long', 'Bolder please'])
    assert.ok(plain.includes(words), shown)
  const parsed = parseCommentTurn(turn)
  assert.deepEqual(
    parsed?.items.map((i) => [i.n, i.text]).sort((x, y) => x[0] - y[0]),
    [
      [7, 'Make it shorter'],
      [8, 'Bolder please'],
      [9, 'No, keep it long']
    ]
  )
})

test('S16: a reply alone (always numbered) and a thread-card send show no number', () => {
  const heading = element('/', 'main h2.a', 'Our services')
  const reply = {
    n: 12,
    text: 'Shorter still',
    element: heading,
    locate: null,
    replyTo: 11,
    thread: [{ n: 11, text: 'Make it shorter', author: 'Mai' }],
    author: 'Lee'
  }
  const turn = buildCommentTurn({ items: [reply], now: 5000 })
  const { plain, chips } = bubbleOf(turn)
  assert.equal(chips, 1)
  assert.doesNotMatch(plain, NUMBERED, plain)
  assert.match(plain, /Shorter still/)
  assert.deepEqual(
    parseCommentTurn(turn)?.items.map((i) => [i.n, i.text]),
    [[12, 'Shorter still']]
  )
  // A thread card's Send to Tracy: the typed words and the whole thread, sent by someone else.
  const card = {
    n: 20,
    text: 'Update it on both pages, please.',
    element: heading,
    locate: null,
    author: 'Mai',
    sender: 'Lee',
    thread: [{ text: 'Agreed, shorter.', author: 'Lee', at: 4000 }]
  }
  const sent = bubbleOf(buildCommentTurn({ items: [card], now: 5000 }))
  assert.equal(sent.chips, 1)
  assert.doesNotMatch(sent.plain, NUMBERED, sent.shown)
  assert.match(sent.plain, /^Update it on both pages, please\./)
})

test('words that open with a number of their own are kept, and read back whole', () => {
  const turn = buildCommentTurn({
    items: [
      { ...E01, text: '2. rename the heading' },
      { ...E05, text: '1. first\n2. second' }
    ]
  })
  assert.deepEqual(
    parseCommentTurn(turn)?.items.map((i) => [i.n, i.text]),
    [
      [41, '2. rename the heading'],
      [42, '1. first\n2. second']
    ]
  )
})
