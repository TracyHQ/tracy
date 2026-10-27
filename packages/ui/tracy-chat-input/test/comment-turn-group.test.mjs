/**
 * Round 3 (Brian 30/09): a send of several comments is one chip per comment — and comments pinned on the
 * SAME element (same page address and selector) are ONE chip, one block carrying all of them as a
 * thread: each comment with its author (and time when the Browser tab gives one), its replies right under
 * it, oldest first. The agent then sees they belong together and answers them with one write carrying
 * every number. Turns sent before still read back (`comment-turn-v1-snapshot.test.mjs` fixtures).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCommentTurn, commentTurnFold, parseCommentTurn } from '../src/client/comment-turn.mjs'
import { listenForComments, sentTurns } from '../src/client/comment-send.mjs'

const NOW = Date.UTC(2026, 8, 30, 9, 0, 0)
const MIN = 60_000
const HOME = 'https://northgate-ind.ru/'
const HEADING = { url: HOME, selector: 'h1', text: 'Industrial construction, from foundation to handover' }
const LEAD = { url: HOME, selector: 'p.lead', text: 'Plants, warehouses and heavy machine foundations' }
const LEE = { name: 'Lee', email: 'lee@example.com' }
const MAI = { name: 'Mai', email: 'mai@northgate.ru' }

/** Every fenced block of a turn, one string each. */
const blocksOf = (/** @type {string} */ turn) =>
  [...turn.matchAll(/```tracy-(?:element|page)\n[\s\S]*?\n```/g)].map((m) => m[0])
/** @param {string} turn @param {string} block */
const afterOf = (turn, block) => turn.slice(turn.indexOf(block) + block.length)

/** Mai's and Lee's comments on the heading (Lee replied to Mai's), and Lee's on the lead. */
const ITEMS = [
  {
    n: 120,
    text: 'Can we make this heading shorter? It wraps on phones.',
    element: HEADING,
    author: MAI,
    at: NOW - 30 * MIN,
    thread: [{ author: LEE, at: NOW - 20 * MIN, text: 'Agreed, keep it under 40 characters.' }]
  },
  { n: 121, text: 'Say we also build cold storage.', element: LEAD, author: LEE, at: NOW - 15 * MIN },
  { n: 122, text: 'And drop the word "Industrial".', element: HEADING, author: LEE, at: NOW - 10 * MIN }
]

test('same element → ONE block holding every comment on it; another element keeps its own', () => {
  const turn = buildCommentTurn({ items: ITEMS, now: NOW, numbered: true })
  const blocks = blocksOf(turn)
  assert.equal(blocks.length, 2, 'the heading once, the lead once')
  assert.match(
    blocks[0],
    /^```tracy-element\n<mentioned-element n="120" also-n="122" url="https:\/\/northgate-ind\.ru\/" selector="h1" /
  )
  assert.match(blocks[1], /^```tracy-element\n<mentioned-element n="121" url=/)
  // S16: each comment's words, unnumbered, above its chip — a group's every comment above the group's.
  assert.match(
    turn,
    /^Can we make this heading shorter\? It wraps on phones\.\n\nAnd drop the word "Industrial"\.\n\n```tracy-element\n<mentioned-element n="120" also-n="122" [\s\S]*\n```\n\nSay we also build cold storage\.\n\n```tracy-element\n<mentioned-element n="121" /
  )
})

test('the grouped block is a thread: each comment with author and time, its replies under it, oldest first', () => {
  const turn = buildCommentTurn({ items: ITEMS, now: NOW, numbered: true })
  const lines = [...blocksOf(turn)[0].matchAll(/\nthread: ([^\n]*)/g)].map((m) => m[1])
  assert.deepEqual(lines, [
    'Mai (30m ago, comment 120): Can we make this heading shorter? It wraps on phones.',
    'Lee (20m ago): Agreed, keep it under 40 characters.',
    'Lee (10m ago, comment 122): And drop the word "Industrial".'
  ])
})

test('the hint says a grouped block is one conversation answered together, with every number', () => {
  const turn = buildCommentTurn({ items: ITEMS, now: NOW, numbered: true })
  assert.match(turn, /`also-n`/)
  assert.match(turn, /comment: \[n, …\]/)
  const plain = buildCommentTurn({ items: [ITEMS[0], ITEMS[1]], now: NOW, numbered: true })
  assert.doesNotMatch(plain, /also-n/, 'a turn with no group keeps the hint it had')
})

test('the order of arrival does not matter: the comments of a group sit oldest first', () => {
  const turn = buildCommentTurn({ items: [ITEMS[2], ITEMS[1], ITEMS[0]], now: NOW, numbered: true })
  assert.match(blocksOf(turn)[0], /<mentioned-element n="120" also-n="122" /)
})

test('without times (the Browser tab gives none) the comments of a group follow their numbers', () => {
  const noTimes = ITEMS.map(({ at: _at, ...rest }) => rest)
  const turn = buildCommentTurn({ items: noTimes, now: NOW, numbered: true })
  const lines = [...blocksOf(turn)[0].matchAll(/\nthread: ([^\n]*)/g)].map((m) => m[1])
  assert.deepEqual(lines, [
    'Mai (comment 120): Can we make this heading shorter? It wraps on phones.',
    'Lee (20m ago): Agreed, keep it under 40 characters.',
    'Lee (comment 122): And drop the word "Industrial".'
  ])
})

test('it reads back: one item per COMMENT (a grouped one names its block), ONE chip with the whole thread', () => {
  const turn = buildCommentTurn({ items: ITEMS, now: NOW, numbered: true })
  const parsed = parseCommentTurn(turn)
  // Readers that count comments (the session's moment title "first +N") still see three.
  assert.deepEqual(
    parsed?.items.map((i) => [i.n, i.also ?? [], i.groupOf ?? null, i.text]),
    [
      [120, [122], null, 'Can we make this heading shorter? It wraps on phones.'],
      [122, [], 120, 'And drop the word "Industrial".'],
      [121, [], null, 'Say we also build cold storage.']
    ],
    'in block order, each grouped comment right after its block'
  )
  assert.equal(parsed?.items[1].element?.selector, 'h1')
  const [heading, lead] = blocksOf(turn)
  const chip = commentTurnFold(heading, afterOf(turn, heading))
  assert.equal(chip?.n, 120)
  assert.equal(chip?.author, 'Mai')
  assert.deepEqual(chip?.thread, [
    { who: 'Mai', text: 'Can we make this heading shorter? It wraps on phones.' },
    { who: 'Lee', text: 'Agreed, keep it under 40 characters.' },
    { who: 'Lee', text: 'And drop the word "Industrial".' }
  ])
  assert.equal(commentTurnFold(lead, afterOf(turn, lead))?.n, 121)
  const lastChip = commentTurnFold(lead, afterOf(turn, lead))
  assert.ok((lastChip?.trailing ?? 0) > 0, 'the hint after the last block stays hidden')
})

test('a page comment and a reply are never grouped', () => {
  const turn = buildCommentTurn({
    items: [
      { n: 1, text: 'The phone number is old.', element: null, url: HOME, author: LEE },
      { n: 2, text: 'The footer phone too.', element: null, url: HOME, author: MAI },
      { n: 3, text: 'Shorter please.', element: HEADING, author: MAI },
      { n: 4, text: 'Yes, 40 characters.', element: HEADING, author: LEE, replyTo: 3, thread: [] }
    ],
    now: NOW,
    numbered: true
  })
  assert.equal(blocksOf(turn).length, 4)
  assert.doesNotMatch(turn, /also-n/)
})

test('a v3 send from the checklist: the grouped turn goes out, and the group is recorded as `same`', async () => {
  const target = new EventTarget()
  /** @type {string[]} */
  const sent = []
  const session = { getSnapshot: () => ({ running: false, subagent: null }) }
  const stop = listenForComments({
    target,
    sessions: { binding: () => ({ session }) },
    conversation: {
      sendSession: async (_s, text) => {
        sent.push(text)
        return { kind: 'success' }
      }
    },
    siteKey: () => 'northgate',
    now: () => NOW
  })
  const answered = new Promise((resolve) =>
    target.addEventListener('tracy:comment-sent', resolve, { once: true })
  )
  target.dispatchEvent(
    new CustomEvent('tracy:comment-send', {
      detail: {
        v: 3,
        requestId: 'r3-group',
        sessionId: 's1',
        siteKey: 'northgate',
        items: ITEMS.map(({ n, text, element, author, at, thread }) => ({
          n,
          url: HOME,
          text,
          element,
          author,
          at,
          ...(thread ? { thread } : {})
        }))
      }
    })
  )
  await answered
  stop()
  assert.equal(sent.length, 1)
  assert.equal(blocksOf(sent[0]).length, 2)
  assert.match(sent[0], /n="120" also-n="122"/)
  assert.deepEqual(sentTurns.get('r3-group')?.same, [[120, 122]])
})
