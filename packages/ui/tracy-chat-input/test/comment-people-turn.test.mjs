/**
 * Stage 6 of "Comment → edit" (contract `tasks/evidence/comment-people/contract.md` §H3): a Send to Tracy
 * is ONE chat turn with one chip per item, in the block grammar every earlier turn used, so old turns
 * still read back. What changed:
 * - the numbers come from the server's request counter (`POST /requests`), one sequence for comments
 *   and requests, so a turn carries any whole number from 1 up: no 99 cap anywhere a turn is read;
 * - a v3 item names its author; the block's head says it last (`author="Lee"`), so the chat chip draws
 *   the author's bubble instead of a number (story ChatMessageFromPage);
 * - a v3 turn is always numbered, even with one item: the Apply door checks `comment: n` against the
 *   request the fork recorded, so the agent must see the number;
 * - a thread says who wrote each line, a name two people share gets the part of the email before its at
 *   sign, each earlier send is a `sent to Tracy by <name> (<when>)` line, and the sender is `(now)`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCommentTurn,
  commentTurnFold,
  pageTurnFold,
  parseCommentTurn
} from '../src/client/comment-turn.mjs'

const NOW = Date.UTC(2026, 8, 29, 21, 0, 0)
const MIN = 60_000
const ELEMENT = {
  url: 'https://northgate-ind.ru/',
  selector: 'nav a:nth-of-type(3)',
  label: 'Menu item "Services"',
  text: 'Services'
}
const LEE = { name: 'Lee', email: 'lee@example.com' }

/** Every fenced block of a turn, one string each. */
const blocksOf = (/** @type {string} */ turn) =>
  [...turn.matchAll(/```tracy-(?:element|page)\n[\s\S]*?\n```/g)].map((m) => m[0])

test('numbers above 99 are whole numbers like any other: built, parsed and folded', () => {
  const turn = buildCommentTurn({
    items: [
      { n: 137, text: 'Make only this menu item orange.', element: ELEMENT, author: LEE },
      {
        n: 1024,
        text: 'Say we also build cold storage.',
        element: { ...ELEMENT, selector: 'p.lead' },
        author: LEE
      }
    ],
    now: NOW
  })
  assert.match(
    turn,
    /^Make only this menu item orange\.\n\n```tracy-element\n<mentioned-element n="137" [\s\S]*\n```\n\nSay we also build cold storage\.\n\n```tracy-element\n<mentioned-element n="1024" /
  )
  const parsed = parseCommentTurn(turn)
  assert.deepEqual(
    parsed?.items.map((i) => [i.n, i.text]),
    [
      [137, 'Make only this menu item orange.'],
      [1024, 'Say we also build cold storage.']
    ]
  )
  const [first, second] = blocksOf(turn)
  const after = turn.slice(turn.indexOf(first) + first.length)
  assert.notEqual(commentTurnFold(first, after), null)
  assert.notEqual(commentTurnFold(second, turn.slice(turn.indexOf(second) + second.length)), null)
})

test('a page block with a number above 99 reads back and folds', () => {
  const turn = buildCommentTurn({
    items: [
      {
        n: 250,
        text: 'The phone number in the top bar is old.',
        element: null,
        url: 'https://northgate-ind.ru/',
        author: LEE
      }
    ],
    numbered: true,
    now: NOW
  })
  const parsed = parseCommentTurn(turn)
  assert.equal(parsed?.items[0].n, 250)
  assert.equal(parsed?.items[0].element, null)
  const [block] = blocksOf(turn)
  assert.equal(pageTurnFold(block, turn.slice(turn.indexOf(block) + block.length))?.label, '/')
})

test('the number is still a whole number from 1: zero, negatives, fractions and repeats are refused', () => {
  for (const n of [0, -3, 1.5, Number.NaN])
    assert.throws(
      () => buildCommentTurn({ items: [{ n, text: 'x', element: ELEMENT }], now: NOW }),
      RangeError
    )
  assert.throws(
    () =>
      buildCommentTurn({
        items: [
          { n: 140, text: 'a', element: ELEMENT },
          { n: 140, text: 'b', element: ELEMENT }
        ],
        now: NOW
      }),
    RangeError
  )
})

test('numbered: one item alone keeps its number, so the agent can name it to the Apply door', () => {
  const turn = buildCommentTurn({
    items: [{ n: 151, text: 'Make only this menu item orange.', element: ELEMENT, author: LEE }],
    numbered: true,
    now: NOW
  })
  assert.match(turn, /^Make only this menu item orange\.\n\n```tracy-element\n<mentioned-element n="151" /)
  // Without the option the one-item list is still the one-comment turn of every earlier stage.
  const plain = buildCommentTurn({
    items: [{ n: 151, text: 'Make only this menu item orange.', element: ELEMENT }]
  })
  assert.doesNotMatch(plain, /n="151"/)
})

test('the author closes the head, and a turn without authors keeps its bytes', () => {
  const withAuthor = buildCommentTurn({
    items: [{ n: 5, text: 'Make only this menu item orange.', element: ELEMENT, author: LEE }],
    numbered: true,
    now: NOW
  })
  const without = buildCommentTurn({
    items: [{ n: 5, text: 'Make only this menu item orange.', element: ELEMENT }],
    numbered: true,
    now: NOW
  })
  const head = /<mentioned-element [^\n]*>/.exec(withAuthor)?.[0] ?? ''
  assert.match(head, / author="Lee">$/)
  assert.equal(withAuthor.replace(' author="Lee"', ''), without)
  // A name with a quote in it stays one attribute.
  const quoted = buildCommentTurn({
    items: [{ n: 5, text: 'x', element: ELEMENT, author: { name: 'Anna "Ann" K' } }],
    numbered: true,
    now: NOW
  })
  assert.match(quoted, / author="Anna &quot;Ann&quot; K">/)
})

test('the chip hands its author to the icon: the name and nothing numbered', () => {
  const turn = buildCommentTurn({
    items: [
      { n: 5, text: 'Make only this menu item orange.', element: ELEMENT, author: LEE },
      {
        n: 6,
        text: 'Whole page note.',
        element: null,
        url: 'https://northgate-ind.ru/about',
        author: { name: 'Mai' }
      }
    ],
    now: NOW
  })
  const [el, page] = blocksOf(turn)
  const elChip = commentTurnFold(el, turn.slice(turn.indexOf(el) + el.length))
  const pageChip = pageTurnFold(page, turn.slice(turn.indexOf(page) + page.length))
  assert.equal(elChip?.author, 'Lee')
  assert.equal(pageChip?.author, 'Mai')
  assert.equal(pageChip?.label, '/about')
  // An old turn's block names nobody.
  const old = buildCommentTurn({
    items: [
      { n: 1, text: 'a', element: ELEMENT },
      { n: 2, text: 'b', element: { ...ELEMENT, selector: 'h1' } }
    ],
    now: NOW
  })
  const [oldBlock] = blocksOf(old)
  assert.equal(
    commentTurnFold(oldBlock, old.slice(old.indexOf(oldBlock) + oldBlock.length))?.author,
    undefined
  )
})

test('H3: a thread names who wrote each line; the sender is (now); an earlier send is its own line', () => {
  const turn = buildCommentTurn({
    items: [
      {
        n: 160,
        text: 'Update it on both pages, please.',
        element: ELEMENT,
        author: LEE,
        thread: [
          {
            author: { name: 'Mai', email: 'mai@northgate.ru' },
            at: NOW - 20 * MIN,
            text: 'We have 14 subsidiaries now.'
          },
          { author: { name: 'Mai', email: 'mai@northgate.ru' }, at: NOW - 12 * MIN, sent: true },
          { author: LEE, at: NOW - 6 * MIN, text: 'The About page says 13 as well.' }
        ]
      }
    ],
    numbered: true,
    now: NOW
  })
  const threadLines = turn.split('\n').filter((line) => line.startsWith('thread: '))
  assert.deepEqual(threadLines, [
    'thread: Mai (20m ago): We have 14 subsidiaries now.',
    'thread: sent to Tracy by Mai (12m ago)',
    'thread: Lee (6m ago): The About page says 13 as well.',
    'thread: Lee (now): Update it on both pages, please.'
  ])
  // No Tracy step lines: stage 6 comments carry no status.
  assert.doesNotMatch(turn, /\nthread: tracy:/)
})

test('H3: two people who share a name are told apart by the part of their email before its at sign', () => {
  const turn = buildCommentTurn({
    items: [
      {
        n: 161,
        text: 'Keep it short.',
        element: ELEMENT,
        author: { name: 'Anna', email: 'anna.k@northgate.ru' },
        thread: [
          {
            author: { name: 'Anna', email: 'anna.p@example.com' },
            at: NOW - 5 * MIN,
            text: 'Make it longer.'
          },
          { author: { name: 'Mai', email: 'mai@northgate.ru' }, at: NOW - 4 * MIN, text: 'Fine by me.' }
        ]
      }
    ],
    numbered: true,
    now: NOW
  })
  const lines = turn.split('\n').filter((line) => line.startsWith('thread: '))
  assert.deepEqual(lines, [
    'thread: Anna (anna.p) (5m ago): Make it longer.',
    'thread: Mai (4m ago): Fine by me.',
    'thread: Anna (anna.k) (now): Keep it short.'
  ])
  // The head names the sender the same way.
  assert.match(turn, / author="Anna \(anna\.k\)">/)
})

test('H3: the thread reads back as its lines, the earlier-send line included', () => {
  const turn = buildCommentTurn({
    items: [
      {
        n: 162,
        text: 'Both pages.',
        element: ELEMENT,
        author: LEE,
        thread: [
          { author: { name: 'Mai' }, at: NOW - 3 * MIN, text: 'We have 14 now.' },
          { author: { name: 'Mai' }, at: NOW - 2 * MIN, sent: true }
        ]
      }
    ],
    numbered: true,
    now: NOW
  })
  const parsed = parseCommentTurn(turn)
  assert.equal(parsed?.items[0].n, 162)
  assert.equal(parsed?.items[0].text, 'Both pages.')
})

test('F6: a thread card send folds with its thread — people lines only, "Name: words", the sender’s (now) line left out', () => {
  const turn = buildCommentTurn({
    items: [
      {
        n: 163,
        text: 'Update it on both pages, please.',
        element: ELEMENT,
        author: LEE,
        thread: [
          {
            author: { name: 'Mai', email: 'mai@n.ru' },
            at: NOW - 20 * MIN,
            text: 'We have 14 subsidiaries now.'
          },
          { author: { name: 'Mai', email: 'mai@n.ru' }, at: NOW - 12 * MIN, sent: true },
          { author: LEE, at: NOW - 6 * MIN, text: 'The About page says 13 as well.' },
          { author: { name: 'Anna', email: 'anna@x.ru' }, at: NOW - 5 * MIN, text: 'Also: here (really).' }
        ]
      }
    ],
    numbered: true,
    now: NOW
  })
  const [block] = blocksOf(turn)
  const chip = commentTurnFold(block, turn.slice(turn.indexOf(block) + block.length))
  assert.deepEqual(chip?.thread, [
    { who: 'Mai', text: 'We have 14 subsidiaries now.' },
    { who: 'Lee', text: 'The About page says 13 as well.' },
    { who: 'Anna', text: 'Also: here (really).' }
  ])
  // No thread, no `thread` field; an old reply's Tracy lines are not people lines.
  const plain = buildCommentTurn({
    items: [{ n: 5, text: 'x', element: ELEMENT, author: LEE }],
    numbered: true,
    now: NOW
  })
  const [p] = blocksOf(plain)
  assert.equal(commentTurnFold(p, plain.slice(plain.indexOf(p) + p.length))?.thread, undefined)
  const old = buildCommentTurn({
    items: [
      {
        n: 6,
        text: 'Shorter.',
        element: ELEMENT,
        replyTo: 1,
        thread: [
          {
            author: { name: 'Lee' },
            at: NOW - 9 * MIN,
            text: 'Change it',
            status: 'done',
            answer: 'updated: done'
          }
        ]
      }
    ],
    now: NOW
  })
  const [o] = blocksOf(old)
  assert.deepEqual(commentTurnFold(o, old.slice(old.indexOf(o) + o.length))?.thread, [
    { who: 'Lee', text: 'Change it' }
  ])
})

// ── F10 (stage-6 acceptance): a page-only locate answer says WHERE, not WHAT ──────────────────

const HOME_ONLY = {
  status: 'resolved',
  levels: [{ kind: 'record', id: 'post:2', label: 'page "Home"', writable: true }]
}
const ARTICLE_ONLY = {
  status: 'resolved',
  levels: [{ kind: 'record', id: 'content:9', label: 'article "Home"', writable: true }]
}
/** The chip of the first block of a turn. */
const firstChip = (turn) => {
  const [b] = blocksOf(turn)
  return commentTurnFold(b, turn.slice(turn.indexOf(b) + b.length))
}

test('F10: a logo whose locate names only its page chips as the fork’s own label (the file), alone or among others', () => {
  const logo = {
    url: ELEMENT.url,
    selector: 'header .logo img',
    label: 'northgate-logo.svg',
    text: '',
    image: { src: '/images/northgate-logo.svg', alt: '' }
  }
  const one = buildCommentTurn({
    items: [{ n: 170, text: 'Bigger logo.', element: logo, locate: HOME_ONLY, author: LEE }],
    numbered: true,
    now: NOW
  })
  // An image says its kind first since 01/10 (Akemi, option a; `comment-chip-image-label.test.mjs`).
  assert.equal(firstChip(one)?.label, 'Image · northgate-logo.svg')
  assert.match(one, / name="page &quot;Home&quot;" label="northgate-logo\.svg"/)
  const single = buildCommentTurn({ text: 'Bigger logo.', element: logo, locate: HOME_ONLY })
  const [b] = blocksOf(single)
  assert.equal(
    commentTurnFold(b, single.slice(single.indexOf(b) + b.length))?.label,
    'Image · northgate-logo.svg'
  )
})

test('F10: a Joomla section whose locate names only its article chips as its inner words', () => {
  const section = {
    url: ELEMENT.url,
    selector: 'section.t4-section-3',
    label: '"Plants, warehouses and heavy machine fo…"',
    text: '',
    inside: 'Plants, warehouses and heavy machine foundations for manufacturers across Russia.'
  }
  const turn = buildCommentTurn({
    items: [{ n: 171, text: 'Say cold storage too.', element: section, locate: ARTICLE_ONLY, author: LEE }],
    numbered: true,
    now: NOW
  })
  assert.equal(firstChip(turn)?.label, '"Plants, warehouses and heavy machine fo…"')
})

test('F10: any other record keeps its name; a label that is only a storage id is not used', () => {
  const menu = buildCommentTurn({
    text: 'Orange.',
    element: { ...ELEMENT, label: 'Services' },
    locate: {
      status: 'resolved',
      levels: [{ kind: 'record', id: 'menuItem:104', label: 'Menu item "Services"', writable: true }]
    }
  })
  const [m] = blocksOf(menu)
  assert.equal(commentTurnFold(m, menu.slice(menu.indexOf(m) + m.length))?.label, 'Menu item "Services"')
  assert.doesNotMatch(menu, / label="/)
  const idOnly = buildCommentTurn({
    items: [
      {
        n: 172,
        text: 'x',
        element: { url: ELEMENT.url, selector: 'img', label: '01K5Z8W3J9Q2M4N6P8R0T2V4X6.webp', text: '' },
        locate: HOME_ONLY
      }
    ],
    numbered: true,
    now: NOW
  })
  assert.equal(firstChip(idOnly)?.label, 'page "Home"')
})

test('F10: a turn sent before the fix (no label on its head) keeps the chip it had', () => {
  const old = [
    '1. Bigger logo.',
    '2. Say cold storage too.',
    '',
    '```tracy-element',
    '<mentioned-element n="1" url="https://northgate-ind.ru/" selector="header .logo img" status="resolved" kind="record" name="page &quot;Home&quot;">',
    'image: /images/northgate-logo.svg',
    '</mentioned-element>',
    '```',
    '```tracy-element',
    '<mentioned-element n="2" url="https://northgate-ind.ru/" selector="h1" status="resolved" kind="record" name="page &quot;Home&quot;">',
    'text: Industrial construction',
    '</mentioned-element>',
    '```'
  ].join('\n')
  const blocks = blocksOf(old)
  const chips = blocks.map((b) => commentTurnFold(b, old.slice(old.indexOf(b) + b.length))?.label)
  assert.deepEqual(chips, ['page "Home"', '"Industrial construction"'])
})

test('the author’s colour from the server rides the head as `author-color`, and the chip reads it back', () => {
  const MAI = { accountId: 'acc-mai', name: 'Mai', email: 'mai@example.com', initial: 'M', color: '#DB2777' }
  const turn = buildCommentTurn({
    items: [
      {
        n: 5,
        text: 'Make only this menu item orange.',
        element: ELEMENT,
        author: { ...LEE, color: '#4f46e5' }
      },
      { n: 6, text: 'And this page', element: null, url: 'https://northgate-ind.ru/about', author: MAI }
    ],
    now: NOW
  })
  const [element, page] = blocksOf(turn)
  assert.match(element, / author="Lee" author-color="#4f46e5">\n/)
  assert.match(page, / author="Mai" author-color="#DB2777">\n/)
  const chip = commentTurnFold(element, turn.slice(turn.indexOf(element) + element.length))
  assert.equal(chip?.author, 'Lee')
  assert.equal(chip?.authorColor, '#4f46e5')
  const pageChip = pageTurnFold(page, turn.slice(turn.indexOf(page) + page.length))
  assert.equal(pageChip?.author, 'Mai')
  assert.equal(pageChip?.authorColor, '#DB2777')
})

test('no colour, or anything that is not a plain hex, writes no `author-color`: the turn keeps its bytes', () => {
  const build = (author) =>
    buildCommentTurn({
      items: [{ n: 5, text: 'Make only this menu item orange.', element: ELEMENT, author }],
      numbered: true,
      now: NOW
    })
  const plain = build(LEE)
  for (const color of [undefined, null, '', 'red', '#fff', '#4f46e5;background:url(x)', 42]) {
    assert.equal(build({ ...LEE, color }), plain, String(color))
  }
  // A turn sent before turns carried a colour reads back with none.
  const [block] = blocksOf(plain)
  assert.equal(commentTurnFold(block, '')?.authorColor, undefined)
  // A forged attribute on a head is read only when it is a plain hex.
  const forged = block.replace(' author="Lee"', ' author="Lee" author-color="url(x)"')
  assert.equal(commentTurnFold(forged, '')?.authorColor, undefined)
})
