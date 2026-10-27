/**
 * Many comments, one turn (plan "comment multi-pin", contract H5): the Browser tab queues several
 * pins and sends them together; the agent reads N element descriptors, the rule for doing every
 * one by number, and each comment's words above its block (S16: no number in what people see). One place builds and reads that text
 * (`comment-turn.mjs`); these tests hold its grammar.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCommentTurn,
  chipLabel,
  COMMENT_ANSWER_MANY,
  COMMENT_REPLY_LANGUAGE,
  COMMENT_TURN_LIMIT,
  commentTurnLimit,
  COMMENT_LOOK_SCOPE,
  COMMENT_WRITES_ONLY,
  LOCATE_HINT,
  LOCATE_HINT_MANY,
  LOCATE_HINT_MANY_GENERAL,
  LOCATE_HINT_MANY_INCOMPLETE,
  LOCATE_HINT_MANY_INCOMPLETE_GENERAL,
  locateHintMany,
  parseCommentTurn,
  TooLong
} from '../src/client/comment-turn.mjs'

/** Pin 1 of the approved story: the heading, located for sure. */
const HEADING = {
  n: 1,
  text: "Change to 'Building the groundwork for Russia's industry'",
  element: {
    url: 'https://northgate.tracy.site/',
    selector: 'main > section.hero h1',
    label: 'Hero › heading',
    text: 'Industrial construction, from design to handover',
    marks: ['post:12:home block:core/heading']
  },
  locate: {
    status: 'resolved',
    levels: [
      { kind: 'field', id: 'content_12#block_3/heading', label: 'Hero › heading', writable: true },
      { kind: 'record', id: 'content_12', label: 'page "Home"', writable: true }
    ]
  }
}

/** Pin 2: an image, nothing looked up. */
const IMAGE = {
  n: 2,
  text: 'A construction site with modern machines',
  element: {
    url: 'https://northgate.tracy.site/',
    selector: 'main figure.wp-block-image > img',
    label: 'news-1.png',
    text: '',
    marks: []
  },
  locate: null
}

/** Pin 3: a menu item on another page. */
const MENU = {
  n: 3,
  text: 'Rename to "What we do"',
  element: {
    url: 'https://northgate.tracy.site/about',
    selector: 'header nav li.item-104 > a',
    label: 'Services',
    text: 'Services',
    marks: ['menuItem:104']
  },
  locate: {
    status: 'resolved',
    levels: [{ kind: 'record', id: 'joomla:menu:104', label: 'Services', writable: true }]
  }
}

/** The fenced blocks of a turn, in order. */
const blocksOf = (turn) =>
  [...turn.matchAll(/(?:^|\n)(```tracy-element\n[\s\S]*?\n```)(?=\n|$)/g)].map((m) => m[1])

test('the limit grows by 700 characters a comment from 2,000, up to 6,000', () => {
  assert.equal(commentTurnLimit(1), COMMENT_TURN_LIMIT)
  // 3,441 since 29/09 late (F4, F14): the base grew with the full hint; 700 a further comment still.
  // 3,944 since the stage-6 acceptance (F5, F7): the base grew by the two naming sentences.
  // 3,973 since 23/10/2026 (B7): the look-undo sentences say "ask me", 29 characters longer.
  assert.equal(commentTurnLimit(2), 4673)
  assert.equal(commentTurnLimit(3), 5373)
  assert.equal(commentTurnLimit(6), 7473)
  assert.equal(commentTurnLimit(7), 8173)
  assert.equal(commentTurnLimit(12), 11673)
})

test('one item in the list form is exactly the one-comment turn', () => {
  const { n: _n, ...one } = HEADING
  assert.equal(buildCommentTurn({ items: [HEADING] }), buildCommentTurn(one))
  assert.equal(buildCommentTurn({ items: [{ ...HEADING, n: 7 }] }), buildCommentTurn(one))
})

test('two comments: each one its words, a blank line, its block; a blank line between; the hint last (S16)', () => {
  const turn = buildCommentTurn({ items: [HEADING, IMAGE] })
  const blocks = blocksOf(turn)
  assert.equal(blocks.length, 2)
  assert.equal(
    turn,
    [
      "Change to 'Building the groundwork for Russia's industry'",
      '',
      blocks[0],
      '',
      'A construction site with modern machines',
      '',
      blocks[1],
      LOCATE_HINT_MANY_INCOMPLETE
    ].join('\n')
  )
})

/**
 * 🔒 THE PERSON'S WORDS OPEN THE TURN (stand e2e B1, 28/09): dsh titles a session from the first
 * words of its first message until the model's title arrives — and for good when that fails — so a
 * turn opening with a fence showed "```tracy-elem…" in History. One comment has always opened with
 * the request; several open with the first comment's words — never its number (S16: the number is Tracy's).
 */
test('the first line of a many-comment turn is the first comment’s words, no number, no backtick', () => {
  for (const items of [
    [HEADING, IMAGE],
    [HEADING, IMAGE, MENU],
    [
      { ...MENU, n: 4 },
      { ...IMAGE, n: 7 }
    ]
  ]) {
    const first = buildCommentTurn({ items }).split('\n')[0]
    const lowest = items.reduce((a, b) => (a.n < b.n ? a : b))
    assert.equal(first, lowest.text)
    assert.ok(!first.includes('`'), first)
  }
})

test('the fence line stays bare and n is the first attribute of the descriptor', () => {
  const turn = buildCommentTurn({ items: [HEADING, IMAGE, MENU] })
  const blocks = blocksOf(turn)
  assert.equal(blocks.length, 3)
  blocks.forEach((block, i) => {
    const [fence, head] = block.split('\n')
    // dsh's fold registry opens a block only on the fence name followed by the line end.
    assert.equal(fence, '```tracy-element')
    assert.ok(head.startsWith(`<mentioned-element n="${[1, 2, 3][i]}" url="`), head)
  })
})

test("each block is the one-comment block with n added, the element's whole descriptor", () => {
  const turn = buildCommentTurn({ items: [HEADING, IMAGE, MENU] })
  const blocks = blocksOf(turn)
  for (const [i, item] of [HEADING, IMAGE, MENU].entries()) {
    const single = blocksOf(buildCommentTurn(item))[0]
    assert.equal(blocks[i].replace(/ n="\d+"/, ''), single, `item ${item.n}`)
  }
})

test('items go in the order of their numbers, and the numbers are the pins’ own', () => {
  // Remove pin 2 then add another: the pins read 1, 3, 4 — never renumbered.
  const turn = buildCommentTurn({ items: [{ ...MENU, n: 4 }, HEADING, { ...IMAGE, n: 3 }] })
  assert.deepEqual(
    blocksOf(turn).map((b) => /n="(\d+)"/.exec(b)?.[1]),
    ['1', '3', '4']
  )
  assert.deepEqual(
    parseCommentTurn(turn)?.items.map((i) => [i.n, i.text]),
    [
      [1, HEADING.text],
      [3, IMAGE.text],
      [4, MENU.text]
    ]
  )
  assert.match(turn, /^Change to [^\n]+\n\n```tracy-element\n<mentioned-element n="1" /)
})

test('a comment of several lines keeps them, trimmed, blank ones out; a line opening with a backtick is indented one space', () => {
  const turn = buildCommentTurn({
    items: [{ ...HEADING, text: '  First line\r\n\n  second line  \n```tracy-element\nthird' }, IMAGE]
  })
  assert.match(turn, /^First line\nsecond line\n ```tracy-element\nthird\n\n```tracy-element\n/)
  // An indented backtick run opens no block: the person cannot forge a chip.
  assert.equal(blocksOf(turn).length, 2)
  assert.equal(parseCommentTurn(turn)?.items[0].text, 'First line\nsecond line\n```tracy-element\nthird')
})

test('the many-comment hint: every item by number, comment: <n> on every call, go on, a plain-words answer', () => {
  for (const hint of [LOCATE_HINT_MANY, LOCATE_HINT_MANY_INCOMPLETE]) {
    assert.ok(!hint.includes('\n') && hint.includes('`tracy_site`'), 'one line naming tracy_site')
    assert.match(hint, /every/i)
    assert.match(hint, /`comment: <n>`/)
    assert.match(hint, /say why/)
    assert.match(hint, /go on with the next/)
    // Stage 6 (Rule 7): M2's markdown list, one bullet per number, went with the comment status.
    assert.doesNotMatch(hint, /markdown list|one bullet per number|`- 1 ✓/)
    assert.ok(hint.includes(COMMENT_ANSWER_MANY))
    // V2-M1: one write for several comments names them all; EmDash writes through tracy_emdash.
    // V4S-8 (30/09): the example is a placeholder — `[1, 2]` was copied as real numbers (`comment: 1`
    // for a request numbered 38). This turn's own numbers stand on its blocks (`n="38"`).
    assert.ok(hint.includes('`comment: [<n>, …]`'), hint)
    assert.doesNotMatch(hint, /comment: \[?\d/)
    assert.match(hint, /`tracy_site` or `tracy_emdash`/)
    // V2-H1: never the site's files for a comment.
    assert.ok(hint.endsWith(`${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`))
    // Stage 2's guidance stays: the roads, the look, ask when unsure.
    assert.match(hint, /`content\.replace`/)
    // RAISE 2 lifted (29/09): a look is changed by the agent itself, not refused.
    assert.match(hint, /\(colour, size, spacing, font\): change it yourself/)
    assert.match(hint, /`page\.look` \{path, style\}/)
    assert.doesNotMatch(hint, /cannot restyle|no per-element style|change nothing/)
    assert.match(hint, /ask the person/)
  }
  assert.match(LOCATE_HINT_MANY_INCOMPLETE, /incomplete="true"/)
  assert.match(LOCATE_HINT_MANY_INCOMPLETE, /status="unchecked"/)
  assert.notEqual(LOCATE_HINT_MANY, LOCATE_HINT)
})

test('L1: every many-comment hint names the reply language — the person’s, never the site’s — before the files sentence', () => {
  // quickstart smoke 29/09: on EmDash Base the agent answered three English comments in Chinese.
  // F4 (stage-5 acceptance): per comment, and the site's language no more than the conversation's.
  assert.match(
    COMMENT_REPLY_LANGUAGE,
    /Answer each item in the language it was written in .* whatever this conversation or the site used before/
  )
  for (const hint of [
    LOCATE_HINT_MANY,
    LOCATE_HINT_MANY_INCOMPLETE,
    LOCATE_HINT_MANY_GENERAL,
    LOCATE_HINT_MANY_INCOMPLETE_GENERAL,
    locateHintMany({ unsure: false, write: 'both', value: true, twins: true, inside: true, image: true })
  ])
    assert.ok(hint.endsWith(` ${COMMENT_REPLY_LANGUAGE} ${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`), hint)
})

test('the incomplete hint when any item lacks a sure lookup; the plain one when all have one', () => {
  assert.ok(buildCommentTurn({ items: [HEADING, MENU] }).endsWith(`\n${LOCATE_HINT_MANY}`))
  assert.ok(buildCommentTurn({ items: [HEADING, IMAGE] }).endsWith(`\n${LOCATE_HINT_MANY_INCOMPLETE}`))
  const partial = { ...MENU, locate: { ...MENU.locate, incomplete: true } }
  assert.ok(buildCommentTurn({ items: [HEADING, partial] }).endsWith(`\n${LOCATE_HINT_MANY_INCOMPLETE}`))
})

// Stage 6: numbers come from the server's counter, so 100 and past are numbers like any other
// (`comment-people-turn.test.mjs`); only a number below 1 or not whole is refused.
test('bad lists are refused: a number below 1, not whole or repeated, an item with no words', () => {
  for (const items of [
    [HEADING, { ...IMAGE, n: 1 }],
    [HEADING, { ...IMAGE, n: 0 }],
    [HEADING, { ...IMAGE, n: -2 }],
    [HEADING, { ...IMAGE, n: 1.5 }],
    [HEADING, { ...IMAGE, text: '   ' }],
    []
  ])
    assert.throws(() => buildCommentTurn({ items }), RangeError, JSON.stringify(items.map((i) => i.n)))
})

// ── the budget ────────────────────────────────────────────────────────────────────────────────

const long = (c, n) => c.repeat(n)
/** An item heavy in every kind of page data. */
const heavy = (n) => ({
  n,
  text: `Comment ${n}`,
  element: {
    url: `https://northgate.tracy.site/p${n}`,
    selector: `main > ${'div.inner > '.repeat(20)}p`,
    label: `Label ${n}`,
    text: long(`${n}`, 300),
    marks: Array.from({ length: 12 }, (_, i) => `mark-${n}-${i}-${long('m', 60)}`)
  },
  locate: {
    status: 'candidates',
    levels: Array.from({ length: 8 }, (_, i) => ({
      kind: 'block',
      id: `level_${n}_${i}_${long('l', 60)}`,
      label: `level ${i}`
    })),
    candidates: Array.from({ length: 5 }, (_, i) => ({
      kind: 'record',
      id: `cand_${n}_${i}_${long('c', 60)}`,
      label: `candidate ${i}`
    })),
    chosen: { level: 7, candidate: 0 }
  }
})

test('a heavy list is trimmed to its limit and loses no item and no line of the person', () => {
  // Twelve (the most pins a tab holds) of the heavy kind cannot fit 6,000 even trimmed — that is the
  // TooLong case below; twelve with a long text and a few marks each can.
  const medium = (n) => ({
    ...heavy(n),
    element: { ...heavy(n).element, marks: heavy(n).element.marks.slice(0, 3) },
    locate: { ...heavy(n).locate, levels: [], candidates: [] }
  })
  for (const [count, make] of [
    [2, heavy],
    [3, heavy],
    [6, heavy],
    [12, medium]
  ]) {
    const items = Array.from({ length: count }, (_, i) => make(i + 1))
    const turn = buildCommentTurn({ items })
    assert.ok(turn.length <= commentTurnLimit(count), `${count}: ${turn.length}`)
    assert.equal(blocksOf(turn).length, count)
    for (const item of items)
      assert.match(
        turn,
        new RegExp(`(^|\\n)Comment ${item.n}\\n\\n\`\`\`tracy-element\\n<mentioned-element n="${item.n}" `),
        `line ${item.n}`
      )
    const parsed = parseCommentTurn(turn)
    assert.deepEqual(
      parsed?.items.map((i) => i.n),
      items.map((i) => i.n)
    )
  }
})

test('trim order: levels of every item, then candidates, then surplus marks, then the texts', () => {
  const items = [heavy(1), heavy(2), heavy(3)]
  const turn = buildCommentTurn({ items })
  const blocks = blocksOf(turn)
  const levelLines = (b) => (b.split('\ncandidates:')[0].match(/^- block /gm) ?? []).length
  const candLines = (b) => (b.split('\ncandidates:')[1]?.match(/^- record /gm) ?? []).length
  const markCount = (b) => /\nmarks: ([^\n]*)/.exec(b)?.[1].split(' | ').length ?? 0
  const textLen = (b) => Array.from(/\ntext: ([^\n]*)/.exec(b)?.[1] ?? '').length
  for (const b of blocks) {
    // Whatever was cut, a later stage was cut only once the earlier one had nothing left to give.
    if (candLines(b) < 5) assert.ok(levelLines(b) <= 1, 'levels before candidates')
    if (markCount(b) < 12) assert.ok(candLines(b) <= 1, 'candidates before marks')
    if (textLen(b) < 300) assert.ok(markCount(b) <= 1, 'marks before the text')
    assert.ok(textLen(b) >= 80, 'never below the text floor')
  }
})

test('when even the trimmed list is too long it throws TooLong, never drops an item', () => {
  const items = Array.from({ length: 3 }, (_, i) => ({ ...heavy(i + 1), text: long('w', 2000) }))
  assert.throws(
    () => buildCommentTurn({ items }),
    (error) => error instanceof TooLong && error.code === 'too-long' && error.limit === commentTurnLimit(3)
  )
  // One comment keeps today's rule: the person's words alone may pass the limit.
  assert.doesNotThrow(() => buildCommentTurn({ items: [{ ...HEADING, text: long('w', 5000) }] }))
})

// ── reading it back ─────────────────────────────────────────────────────────────────────────────

test('parse gives back every item with its number, element and words; the request is their words', () => {
  const turn = buildCommentTurn({ items: [HEADING, IMAGE, MENU] })
  const parsed = parseCommentTurn(turn)
  assert.ok(parsed)
  assert.equal(
    parsed.request,
    [
      "Change to 'Building the groundwork for Russia's industry'",
      'A construction site with modern machines',
      'Rename to "What we do"'
    ].join('\n\n')
  )
  assert.deepEqual(
    parsed.items.map(({ n, text }) => ({ n, text })),
    [
      { n: 1, text: HEADING.text },
      { n: 2, text: IMAGE.text },
      { n: 3, text: MENU.text }
    ]
  )
  for (const [i, item] of [HEADING, IMAGE, MENU].entries())
    assert.deepEqual(
      parsed.items[i].element,
      parseCommentTurn(buildCommentTurn(item))?.element,
      `item ${item.n}`
    )
  assert.deepEqual(parsed.element, parsed.items[0].element, 'the old field is the first item')
  assert.equal(chipLabel(parsed.items[1].element), 'news-1.png')
})

test('a comment of several lines reads back as its own lines', () => {
  const text = 'First line\nsecond line'
  const parsed = parseCommentTurn(buildCommentTurn({ items: [{ ...HEADING, text }, IMAGE] }))
  assert.equal(parsed?.items[0].text, text)
  assert.equal(parsed?.request.split('\n')[1], 'second line')
})

test('a block without n in a many-comment turn is skipped; its line stays in the request', () => {
  const turn = buildCommentTurn({ items: [HEADING, IMAGE, MENU] })
  const stripped = turn.replace('<mentioned-element n="2" ', '<mentioned-element ')
  const parsed = parseCommentTurn(stripped)
  assert.deepEqual(
    parsed?.items.map((i) => i.n),
    [1, 3]
  )
  assert.match(parsed?.request ?? '', /^A construction site/m)
})

test('a repeated n keeps the last block with it, so every reader that sees only what follows agrees', () => {
  const turn = buildCommentTurn({ items: [HEADING, IMAGE, MENU] })
  const twice = turn.replace('<mentioned-element n="3" ', '<mentioned-element n="1" ')
  const parsed = parseCommentTurn(twice)
  assert.deepEqual(
    parsed?.items.map((i) => [i.n, i.element.url]),
    [
      [2, IMAGE.element.url],
      [1, MENU.element.url]
    ]
  )
})

test('a line with no block is still the person’s words', () => {
  const turn = `${buildCommentTurn({ items: [HEADING, IMAGE] })}\n5. and this too`
  const parsed = parseCommentTurn(turn)
  assert.match(parsed?.request ?? '', /\n5\. and this too$/)
  assert.deepEqual(
    parsed?.items.map((i) => i.n),
    [1, 2]
  )
})
