/**
 * A comment with no element (plan "comment review", contract H4): "Add a comment…" in the Comments
 * view makes a comment about a whole page, which the Browser tab sends with `element: null` and the
 * page's `url`. In a list it travels as its numbered line and a `tracy-page` block
 * (`<page n="k" url="…" path="…">`, no body) in its number's place among the element blocks, so the
 * hint still follows the last block and dsh's fold hides it; the chip reads the page's path. Alone
 * it is the person's words and nothing else: there is nothing to hide and nothing to locate.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCommentTurn,
  LOCATE_HINT_MANY,
  LOCATE_HINT_MANY_GENERAL,
  LOCATE_HINT_MANY_INCOMPLETE,
  LOCATE_HINT_MANY_INCOMPLETE_GENERAL,
  PAGE_FENCE,
  pageTurnFold,
  parseCommentTurn,
  registerCommentFold
} from '../src/client/comment-turn.mjs'

const { userTextFoldRanges } = await import(
  new URL(
    '../../../../vendor/tracy/deepseek-harness/packages/client/ui-primitives/src/user-text-folds.ts',
    import.meta.url
  ).href
)

const HEADING = {
  n: 1,
  text: "Change to 'Building the groundwork for Russia's industry'",
  element: {
    url: 'https://northgate.tracy.site/',
    selector: 'main > section.hero h1',
    label: 'Hero › heading',
    text: 'Industrial construction, from design to handover',
    marks: []
  },
  locate: {
    status: 'resolved',
    levels: [{ kind: 'field', id: 'content_12#block_3/heading', label: 'Hero › heading', writable: true }]
  }
}

const IMAGE = {
  n: 2,
  text: 'A construction site with modern machines',
  element: {
    url: 'https://northgate.tracy.site/',
    selector: 'main img',
    label: 'news-1.png',
    text: '',
    marks: []
  },
  locate: null
}

const PHONE = {
  n: 6,
  text: 'The phone number in the top bar is old: use 8 800 550-67-91.',
  element: null,
  locate: null,
  url: 'https://northgate.tracy.site/'
}

const ADDRESS = {
  n: 7,
  text: 'Add our address\nand the map.',
  element: null,
  locate: null,
  url: 'https://northgate.tracy.site/about'
}

/** Every comment block of a turn, element or page, in order. */
const blocksOf = (turn) =>
  [...turn.matchAll(/(?:^|\n)(```tracy-(?:element|page)\n[\s\S]*?\n```)(?=\n|$)/g)].map((m) => m[1])

/** Tracy's registration of both folds, recording what the icon function is asked. */
function folds() {
  const registered = []
  const calls = []
  let disposed = 0
  const dispose = registerCommentFold(
    {
      register(f) {
        registered.push(f)
        return () => (disposed += 1)
      }
    },
    (n, hasWords, kind) => {
      calls.push([n, hasWords, kind])
      return { badge: n, kind }
    }
  )
  return { registered, calls, dispose, disposed: () => disposed }
}

test('one comment with no element is the words alone: no block, no hint', () => {
  assert.equal(buildCommentTurn({ items: [PHONE] }), PHONE.text)
  assert.equal(
    buildCommentTurn({ items: [{ ...PHONE, text: '  line one\nline two  ' }] }),
    'line one\nline two',
    'trimmed like any request'
  )
  assert.equal(
    parseCommentTurn(buildCommentTurn({ items: [PHONE] })),
    null,
    'plain words, drawn as any message'
  )
})

test('two comments about whole pages: the exact bytes', () => {
  assert.equal(PAGE_FENCE, 'tracy-page')
  assert.equal(
    buildCommentTurn({ items: [ADDRESS, PHONE] }),
    [
      'The phone number in the top bar is old: use 8 800 550-67-91.',
      '',
      '```tracy-page',
      '<page n="6" url="https://northgate.tracy.site/" path="/" lang="en">',
      '</page>',
      '```',
      '',
      'Add our address',
      'and the map.',
      '',
      '```tracy-page',
      '<page n="7" url="https://northgate.tracy.site/about" path="/about" lang="en">',
      '</page>',
      '```',
      LOCATE_HINT_MANY_GENERAL
    ].join('\n')
  )
})

test('a mixed batch: page blocks take their number’s place among the element blocks; the general hint follows the last', () => {
  const turn = buildCommentTurn({ items: [PHONE, IMAGE, HEADING] })
  const blocks = blocksOf(turn)
  assert.deepEqual(
    blocks.map((b) => b.split('\n')[1].slice(0, 24)),
    ['<mentioned-element n="1"', '<mentioned-element n="2"', '<page n="6" url="https:/']
  )
  assert.equal(
    turn,
    [
      HEADING.text,
      '',
      blocks[0],
      '',
      IMAGE.text,
      '',
      blocks[1],
      '',
      PHONE.text,
      '',
      blocks[2],
      LOCATE_HINT_MANY_INCOMPLETE_GENERAL
    ].join('\n')
  )
  assert.ok(LOCATE_HINT_MANY_GENERAL.startsWith(LOCATE_HINT_MANY.slice(0, 40)))
  assert.match(LOCATE_HINT_MANY_GENERAL, /A `<page>` block is a comment about that whole page/)
  assert.match(LOCATE_HINT_MANY_GENERAL, /`tracy_site`/, 'the hint names tracy_site, so every reader cuts it')
  assert.match(LOCATE_HINT_MANY_INCOMPLETE_GENERAL, /`<page>` block/)
  assert.ok(LOCATE_HINT_MANY_INCOMPLETE_GENERAL.includes('status="unchecked"'))
})

test('turns with no page comment keep their bytes (the old hints, not the general ones)', () => {
  const turn = buildCommentTurn({ items: [HEADING, IMAGE] })
  assert.ok(turn.endsWith(`\n${LOCATE_HINT_MANY_INCOMPLETE}`))
  assert.doesNotMatch(turn, /tracy-page/)
})

test('an address with markup is escaped; one that does not parse gives an empty path', () => {
  const turn = buildCommentTurn({
    items: [
      { ...PHONE, url: 'https://s.test/a"b?x=<1>' },
      { ...ADDRESS, url: 'not an address' }
    ]
  })
  assert.match(turn, /<page n="6" url="https:\/\/s\.test\/a&quot;b\?x=&lt;1&gt;" path="\/a%22b" lang="en">/)
  assert.match(turn, /<page n="7" url="not an address" path="" lang="en">/)
})

test('parse: page items have element null, url and path; element is the first element item', () => {
  const parsed = parseCommentTurn(buildCommentTurn({ items: [PHONE, HEADING, ADDRESS, IMAGE] }))
  assert.ok(parsed)
  assert.deepEqual(
    parsed.items.map((i) => [
      i.n,
      i.element === null ? null : i.element.selector,
      i.url ?? null,
      i.path ?? null,
      i.text
    ]),
    [
      [1, 'main > section.hero h1', null, null, HEADING.text],
      [2, 'main img', null, null, IMAGE.text],
      [6, null, 'https://northgate.tracy.site/', '/', PHONE.text],
      [7, null, 'https://northgate.tracy.site/about', '/about', 'Add our address\nand the map.']
    ]
  )
  assert.equal(parsed.element?.selector, 'main > section.hero h1')
  assert.equal(
    parsed.request,
    [HEADING.text, IMAGE.text, PHONE.text, 'Add our address\nand the map.'].join('\n\n'),
    'the request is every comment’s words, blocks and hint left out'
  )
})

test('parse of a page-only list: every item and element null', () => {
  const parsed = parseCommentTurn(buildCommentTurn({ items: [PHONE, ADDRESS] }))
  assert.ok(parsed)
  assert.equal(parsed.element, null)
  assert.deepEqual(
    parsed.items.map((i) => [i.n, i.element, i.path]),
    [
      [6, null, '/'],
      [7, null, '/about']
    ]
  )
})

test("dsh's real fold ranges: a mixed batch draws element chips and a page chip (number, page icon, path), the hint hidden", () => {
  const turn = buildCommentTurn({ items: [PHONE, HEADING, ADDRESS] })
  const f = folds()
  assert.deepEqual(
    f.registered.map((r) => r.fence),
    ['tracy-element', 'tracy-page']
  )
  const ranges = userTextFoldRanges(turn, f.registered)
  assert.deepEqual(
    ranges.map((r) => [r.fence, r.chip.label, r.chip.title, r.chip.icon.badge, r.chip.icon.kind]),
    [
      [
        'tracy-element',
        '"Industrial construction, from design to…"',
        'https://northgate.tracy.site/',
        1,
        'element'
      ],
      ['tracy-page', '/', 'https://northgate.tracy.site/', 6, 'page'],
      ['tracy-page', '/about', 'https://northgate.tracy.site/about', 7, 'page']
    ]
  )
  // S16: what shows between the chips is each comment's words, with no number.
  assert.equal(turn.slice(0, ranges[0].start), HEADING.text)
  assert.equal(turn.slice(ranges[0].end, ranges[1].start), `\n\n${PHONE.text}`)
  assert.equal(turn.slice(ranges[1].end, ranges[2].start), '\n\nAdd our address\nand the map.')
  assert.equal(ranges[2].end, turn.length, 'the hint after the last (page) block is hidden')
  f.dispose()
  assert.equal(f.disposed(), 2, 'one disposer for both folds')
})

test("dsh's real fold ranges: a page-only list is two page chips and nothing raw", () => {
  const turn = buildCommentTurn({ items: [PHONE, ADDRESS] })
  const f = folds()
  const ranges = userTextFoldRanges(turn, f.registered)
  assert.deepEqual(
    ranges.map((r) => r.chip.label),
    ['/', '/about']
  )
  assert.equal(ranges[1].end, turn.length)
  assert.deepEqual(f.calls, [
    [6, true, 'page'],
    [7, true, 'page']
  ])
})

test('the page fold refuses a malformed block and a number a later block repeats', () => {
  assert.equal(pageTurnFold('```tracy-page\n<page url="x">\n</page>\n```', ''), null)
  assert.equal(pageTurnFold('```tracy-page\n<page n="3" url="x" path="/">\nbody\n</page>\n```', ''), null)
  const repeated =
    '\n```tracy-element\n<mentioned-element n="3" url="u" selector="s" status="unchecked">\n</mentioned-element>\n```'
  assert.equal(pageTurnFold('```tracy-page\n<page n="3" url="x" path="/">\n</page>\n```', repeated), null)
  assert.deepEqual(pageTurnFold('```tracy-page\n<page n="3" url="x" path="/p">\n</page>\n```', '\nno hint'), {
    label: '/p',
    title: 'x',
    trailing: 0,
    n: 3
  })
})

test('a list still refuses an item with no words, and an element that is not an object', () => {
  assert.throws(() => buildCommentTurn({ items: [{ ...PHONE, text: ' ' }] }), RangeError)
  assert.throws(() => buildCommentTurn({ items: [{ ...PHONE, element: 'x' }] }), RangeError)
})

test('a mixed batch whose element carries an inside line: the general hint also says what inside means, and the fold still hides it', () => {
  // The merge of develop's line clauses (`hintExtra`, PR #545) and the page-wide comments (H4): the
  // hint opens with the general head AND carries the `inside:` clause, so neither reader loses it.
  const CARD = {
    n: 3,
    text: 'Make this card say Ana is our lead designer',
    element: {
      url: 'https://northgate.tracy.site/',
      selector: 'main .team .card',
      label: 'Team › card',
      text: '',
      inside: 'Ana Lopez Head of design',
      marks: []
    },
    locate: null
  }
  const turn = buildCommentTurn({ items: [CARD, PHONE] })
  assert.match(turn, /^inside: Ana Lopez Head of design$/m)
  const hint = turn.split('\n').at(-1)
  assert.ok(hint.startsWith(LOCATE_HINT_MANY_INCOMPLETE_GENERAL.split('`tracy_site`')[0]), 'general head')
  assert.match(hint, /inside line is the words in the picked block/)
  assert.notEqual(hint, LOCATE_HINT_MANY_INCOMPLETE_GENERAL, 'the inside clause is added')
  const f = folds()
  const ranges = userTextFoldRanges(turn, f.registered)
  assert.deepEqual(
    ranges.map((r) => r.fence),
    ['tracy-element', 'tracy-page']
  )
  assert.equal(ranges[1].end, turn.length, 'the hint after the last (page) block is hidden')
  f.dispose()
})
