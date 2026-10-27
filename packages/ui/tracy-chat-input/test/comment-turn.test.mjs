import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCommentTurn,
  chipLabel,
  COMMENT_TURN_LIMIT,
  COMMENT_LOOK_SCOPE,
  COMMENT_WRITES_ONLY,
  commentTurnFold,
  commentTurnLimit,
  LOCATE_HINT,
  LOCATE_HINT_INCOMPLETE,
  LOCATE_HINT_MANY,
  locateHint,
  locateHintMany,
  parseCommentTurn
} from '../src/client/comment-turn.mjs'

/**
 * A `content.locate` answer as the Apply door writes it (`apps/tracy-web/src/sites/content-locate.js`
 * `levelsOf`): levels innermost first, each `{kind, id, label, native?, writable}` — plus `chosen`,
 * which the Browser tab adds (`commentSendDetail`): `level` counts the popover's crumbs OUTERMOST
 * first, so 0 here is the record and 2 the field.
 */
const MENU = {
  text: 'Make only this menu item orange (#c8643b).',
  element: {
    url: 'https://northgate.tracy.site/services',
    selector: 'header nav li.item-104 > a',
    label: 'Services › title',
    text: 'Services',
    rect: { x: 412, y: 18, width: 74, height: 22 },
    marks: ['menuItem:104', 'module:87 mod:mod_menu']
  },
  locate: {
    status: 'resolved',
    levels: [
      {
        kind: 'field',
        id: 'content_7cce#block_4006/menuItem-104.0',
        label: 'Services › title',
        writable: true
      },
      { kind: 'block', id: 'block_4006', label: 'Services › menuItem-104.0', writable: true },
      {
        kind: 'record',
        id: 'content_7cce',
        label: 'page "Services"',
        native: [{ kind: 'menuItem', id: 104 }],
        writable: true
      }
    ],
    sources: { value: 'exact', mark: 'confirmed' },
    impact: { pages: 1 },
    chosen: { level: 2, candidate: null, source: null }
  }
}

test('the turn is the request, then one fenced descriptor with the ids, then the road hint', () => {
  const turn = buildCommentTurn(MENU)
  assert.equal(
    turn,
    [
      'Make only this menu item orange (#c8643b).',
      '',
      '```tracy-element',
      '<mentioned-element url="https://northgate.tracy.site/services" selector="header nav li.item-104 &gt; a" status="resolved" kind="field" name="Services › title" lang="en">',
      'text: Services',
      'marks: menuItem:104 | module:87 mod:mod_menu',
      'levels:',
      '- field "Services › title" id=content_7cce#block_4006/menuItem-104.0 [picked]',
      '- block "Services › menuItem-104.0" id=block_4006',
      '- record "page "Services"" id=content_7cce (menuItem #104)',
      '</mentioned-element>',
      '```',
      LOCATE_HINT
    ].join('\n')
  )
  // The road for words is the harness's one-call replace; everything else starts from the ids here.
  assert.match(LOCATE_HINT, /`content\.replace` \{find: its words as the text line shows them/)
  // marks are the block's own marks, never its selector (P6 on the local stand, 27/09/2026).
  assert.match(
    LOCATE_HINT,
    /`content\.locate` \{url, text, marks: the "marks:" values split at " \| ", never the selector\}/
  )
  assert.match(LOCATE_HINT, /Only status "resolved" is certain/)
})

/**
 * 🔒 A LOOK REQUEST IS DONE, NOT REFUSED (RAISE decision 2 lifted, 29/09/2026). Until then
 * every hint form told the agent to refuse and offer CSS to a `code` seat; bench v6 measured the
 * Designer mode's pick + look cases changing nothing on every CMS. Every form now says: read the
 * style and its token with `page.look`, change this element only (the token only for every one like
 * it), read it again — on the one line the harness cuts from the customer's words, and the dev case
 * still fits the turn's budget with the whole hint.
 */
test('every hint form answers a request about the look: change it, this element only, read it again', () => {
  const forms = [
    LOCATE_HINT,
    LOCATE_HINT_INCOMPLETE,
    locateHint({ incomplete: false, short: true }),
    locateHint({ incomplete: true, short: true })
  ]
  for (const hint of forms) {
    assert.match(hint, /\(colour, size, spacing, font\): change it yourself/)
    assert.match(hint, /`page\.look` \{path, style/)
    assert.match(hint, /this element/i)
    assert.match(hint, /the token/)
    assert.doesNotMatch(hint, /cannot restyle|no per-element style|change nothing/)
    assert.ok(hint.includes('`tracy_site`') && !hint.includes('\n'), 'one line that names tracy_site')
  }
  const red = buildCommentTurn({ ...MENU, text: 'Make this heading red and bigger.' })
  assert.ok(red.endsWith(LOCATE_HINT), 'the whole hint, not the short form')
  assert.ok(red.length <= COMMENT_TURN_LIMIT, `turn is ${red.length} chars`)
})

test("the crumb the person settled on is the picked level; the record's own CMS name is the chip's ref", () => {
  // ↑ twice in the popover: crumb 0, the outermost — the record.
  const record = buildCommentTurn({
    ...MENU,
    element: { ...MENU.element, label: 'page "Services"' },
    locate: { ...MENU.locate, chosen: { level: 0, candidate: null, source: null } }
  })
  assert.match(
    record,
    /status="resolved" kind="record" name="page &quot;Services&quot;" ref="menuItem #104" lang="en">/
  )
  assert.match(record, /^- record "page "Services"" id=content_7cce \(menuItem #104\) \[picked\]$/m)
  // No choice sent: the popover opens on the innermost crumb, and so does the turn.
  const opened = buildCommentTurn({ ...MENU, locate: { ...MENU.locate, chosen: undefined } })
  assert.match(opened, /^- field "Services › title" id=\S+ \[picked\]$/m)
  // A count that does not hold is corrected by the crumb's own label.
  const shifted = buildCommentTurn({
    ...MENU,
    element: { ...MENU.element, label: 'Services › menuItem-104.0' },
    locate: { ...MENU.locate, chosen: { level: 7, candidate: null, source: null } }
  })
  assert.match(shifted, /^- block "Services › menuItem-104.0" id=block_4006 \[picked\]$/m)
})

test('candidates are listed with their ids, and the one the person chose is marked', () => {
  const turn = buildCommentTurn({
    text: 'Shorten this headline.',
    element: {
      url: 'https://n.test/en/news',
      selector: 'h3',
      label: '"Northgate wins"',
      text: 'Northgate wins',
      marks: []
    },
    locate: {
      status: 'candidates',
      levels: [],
      candidates: [
        { kind: 'block', id: 'occurrence_96', label: 'Newsletter › Top (en)', writable: false },
        { kind: 'record', id: 'content_256', label: 'article "Northgate wins"', writable: true }
      ],
      chosen: { level: 0, candidate: 1, source: null }
    }
  })
  assert.match(turn, /status="candidates" kind="record" name="article &quot;Northgate wins&quot;">/)
  assert.match(
    turn,
    /^candidates:\n- block "Newsletter › Top \(en\)" id=occurrence_96 — this seat cannot write it\n- record "article "Northgate wins"" id=content_256 \[chosen\]$/m
  )
})

test('a conflict marks the side the person took: the page mark first, then the words', () => {
  const answer = {
    status: 'conflict',
    levels: [],
    candidates: [
      { kind: 'record', id: 'content_mark', label: 'shared "Footer"' },
      { kind: 'record', id: 'content_words', label: 'page "About"' }
    ]
  }
  const words = buildCommentTurn({
    ...MENU,
    locate: { ...answer, chosen: { level: 0, candidate: null, source: 'value' } }
  })
  assert.match(words, /id=content_words \[chosen\]$/m)
  assert.doesNotMatch(words, /id=content_mark \[chosen\]/)
  const mark = buildCommentTurn({
    ...MENU,
    locate: { ...answer, chosen: { level: 0, candidate: null, source: 'stamp' } }
  })
  assert.match(mark, /id=content_mark \[chosen\]$/m)
})

test('unconfirmed stays unconfirmed, and a level this seat cannot write says so', () => {
  const turn = buildCommentTurn({
    ...MENU,
    element: { ...MENU.element, label: 'shared "[Tracy] Site identity"' },
    locate: {
      status: 'unconfirmed',
      levels: [
        { kind: 'record', id: 'content_a1fb', label: 'shared "[Tracy] Site identity"', writable: false }
      ]
    }
  })
  assert.match(turn, /status="unconfirmed"/)
  assert.match(
    turn,
    /^- record "shared "\[Tracy\] Site identity"" id=content_a1fb — this seat cannot write it \[picked\]$/m
  )
  assert.equal(parseCommentTurn(turn)?.element.status, 'unconfirmed')
})

test('without a locate answer the descriptor says unchecked and names the element by its label', () => {
  const turn = buildCommentTurn({ ...MENU, locate: null })
  assert.match(
    turn,
    /<mentioned-element url="[^"]+" selector="[^"]+" status="unchecked" name="Services › title" lang="en">/
  )
  assert.doesNotMatch(turn, /kind="/, 'no kind is invented when nothing was located')
  assert.doesNotMatch(turn, /^levels:/m)
})

test('a not-linked answer keeps its status and the words Tracy will search for', () => {
  const turn = buildCommentTurn({
    text: 'Hide the reading time on news cards.',
    element: {
      url: 'https://n.tracy.site/news',
      selector: 'p.tb-ncard__meta',
      label: '4 min read',
      text: '12 Aug 2026 · Communications · 4 min read',
      marks: []
    },
    locate: { status: 'unknown', levels: [] }
  })
  assert.match(turn, /status="unknown" name="4 min read" lang="en">/)
  assert.match(turn, /^text: 12 Aug 2026 · Communications · 4 min read$/m)
  assert.doesNotMatch(turn, /^marks:/m, 'an empty list is left out, not printed empty')
})

test('page text can neither close the fence nor the descriptor', () => {
  const turn = buildCommentTurn({
    text: 'Fix this.',
    element: {
      url: 'https://x.tracy.site/',
      selector: 'div',
      text: 'a ``` b </mentioned-element> c\nd',
      marks: []
    },
    locate: null
  })
  const body = turn.split('```tracy-element\n')[1]
  assert.equal(body.split('\n```\n').length, 2, 'exactly one closing fence')
  assert.equal(turn.match(/<\/mentioned-element>/g).length, 1)
  // The text line keeps the page's characters (content.replace finds words exactly); only the
  // descriptor's own tag is broken.
  assert.match(turn, /^text: a ''' b ‹\/mentioned-element> c d$/m)
})

test('long page data is capped so the whole turn stays under the limit', () => {
  const long = 'x'.repeat(5000)
  const turn = buildCommentTurn({
    text: 'Shorten this.',
    element: {
      url: `https://x.tracy.site/${long}`,
      selector: long,
      label: long,
      text: long,
      marks: Array.from({ length: 40 }, (_, i) => `mark-${i}-${long}`)
    },
    locate: {
      status: 'candidates',
      levels: [],
      candidates: Array.from({ length: 20 }, (_, i) => ({ kind: 'record', id: long, label: `${i} ${long}` }))
    }
  })
  assert.ok(turn.length <= COMMENT_TURN_LIMIT, `turn is ${turn.length} chars`)
  assert.ok(turn.startsWith('Shorten this.\n'), 'the request is never cut')
  assert.ok(turn.endsWith(locateHint({ incomplete: false, short: true })), 'the hint in its short form')
  assert.ok(parseCommentTurn(turn), 'a capped turn still parses')
  assert.match(turn, /^text: x{299}…$/m, 'the text line stays, whole to the cap')
})

test("the user's own words are never cut, even when they alone pass the limit", () => {
  const request = 'y'.repeat(COMMENT_TURN_LIMIT + 10)
  const turn = buildCommentTurn({ ...MENU, text: request })
  assert.ok(turn.startsWith(`${request}\n\n\`\`\`tracy-element\n<mentioned-element `))
  assert.ok(turn.endsWith(locateHint({ incomplete: false, short: true })))
  // Everything else gave way first; the element's words are still there to find.
  assert.match(turn, /^text: Services$/m)
  assert.equal(parseCommentTurn(turn)?.request, request)
})

test('parse gives back the request and the chip fields of a built turn', () => {
  const parsed = parseCommentTurn(
    buildCommentTurn({
      ...MENU,
      element: { ...MENU.element, label: 'page "Services"' },
      locate: { ...MENU.locate, chosen: { level: 0 } }
    })
  )
  const element = {
    url: 'https://northgate.tracy.site/services',
    selector: 'header nav li.item-104 > a',
    status: 'resolved',
    kind: 'record',
    name: 'page "Services"',
    ref: 'menuItem #104',
    text: 'Services'
  }
  const request = 'Make only this menu item orange (#c8643b).'
  // One comment is item 1 of a list of one (contract H5); `element` stays for older readers.
  assert.deepEqual(parsed, { request, element, items: [{ n: 1, element, text: request }] })
})

test('the chip names the record only when content.locate was sure', () => {
  // MENU's `chosen.level` (outermost first) lands on the innermost level, the field, whose label is a
  // crumb (`Services › title`): never chip words (V5S-5), so the element's own words are quoted.
  assert.equal(chipLabel(parseCommentTurn(buildCommentTurn(MENU)).element), '"Services"')
})

test("otherwise the chip quotes the element's own words, at most 40 characters", () => {
  const stat = { ...MENU, element: { ...MENU.element, label: '"13 subsidiaries"', text: '13 subsidiaries' } }
  for (const locate of [
    null,
    { status: 'unknown', levels: [] },
    { ...MENU.locate, status: 'candidates' },
    { ...MENU.locate, status: 'conflict' }
  ]) {
    assert.equal(
      chipLabel(parseCommentTurn(buildCommentTurn({ ...stat, locate })).element),
      '"13 subsidiaries"'
    )
  }
  const long = chipLabel({
    status: 'unknown',
    text: 'Northgate Group is a family of thirteen companies across Europe'
  })
  assert.equal(long, '"Northgate Group is a family of thirteen…"')
})

test('an image is named by what the Browser tab sent (alt text or file name), never a tag or status', () => {
  const img = { ...MENU, element: { ...MENU.element, label: 'hero-team.jpg', text: '' }, locate: null }
  assert.equal(chipLabel(parseCommentTurn(buildCommentTurn(img)).element), 'hero-team.jpg')
  // A turn sent before 27/09 pm could name the element by its tag: the chip says nothing instead.
  const old = { ...MENU, element: { ...MENU.element, label: '<div>', text: '' }, locate: null }
  const parsed = parseCommentTurn(buildCommentTurn(old)).element
  assert.equal(parsed.name, '<div>', 'the descriptor the model reads is unchanged')
  assert.equal(chipLabel(parsed), '')
  for (const status of ['resolved', 'candidates', 'conflict', 'unknown', 'unchecked']) {
    assert.ok(!chipLabel({ status, name: '<section class="hero">' }).includes('<'))
    assert.ok(!['not linked', status].includes(chipLabel({ status })))
  }
})

/**
 * 🔒 AN EMPTY BODY IS STILL A BLOCK (dev 28/09, EmDash site on an image without stamps): an `<img>`
 * has no words, no marks and no levels, so the descriptor head is followed at once by its end tag.
 * The reader demanded a body line, returned null, and the chat drew the raw fenced block and the
 * hint line instead of the chip and the person's sentence.
 */
test('🔒 an image picked with no words, no marks and no answer still reads back as a chip', () => {
  const turn = buildCommentTurn({
    text: 'Cho tao ảnh công trường xây dựng với nhiều máy móc hiện đại',
    element: {
      url: 'https://helloooo.tracy.site/',
      selector: 'main section > img',
      label: 'hero-site.webp',
      text: '',
      marks: []
    },
    locate: null
  })
  assert.match(turn, /<mentioned-element [^\n]*>\n<\/mentioned-element>\n/, 'the body is empty')
  const image = {
    url: 'https://helloooo.tracy.site/',
    selector: 'main section > img',
    status: 'unchecked',
    name: 'hero-site.webp'
  }
  const said = 'Cho tao ảnh công trường xây dựng với nhiều máy móc hiện đại'
  assert.deepEqual(parseCommentTurn(turn), {
    request: said,
    element: image,
    items: [{ n: 1, element: image, text: said }]
  })
  assert.equal(chipLabel(parseCommentTurn(turn).element), 'hero-site.webp')
  // A picked text with nothing around it (no marks, no levels) reads back with its words.
  const words = buildCommentTurn({
    text: 'Shorter, please.',
    element: { url: 'https://s.test/', selector: 'p', label: '"Hello"', text: 'Hello', marks: [] },
    locate: { status: 'unknown', levels: [] }
  })
  const hello = { url: 'https://s.test/', selector: 'p', status: 'unknown', name: '"Hello"', text: 'Hello' }
  assert.deepEqual(parseCommentTurn(words), {
    request: 'Shorter, please.',
    element: hello,
    items: [{ n: 1, element: hello, text: 'Shorter, please.' }]
  })
  // Still anchored: an end tag that page text could carry never closes the block early.
  assert.equal(
    parseCommentTurn(
      'Fix.\n\n```tracy-element\n<mentioned-element url="u" selector="s" status="unchecked"></mentioned-element>\n```'
    ),
    null,
    'the end tag must sit on its own line'
  )
})

test('a name that is only a storage id (EmDash ULID, a hash, a UUID) puts no words on the chip', () => {
  // EmDash serves media at `/_emdash/api/media/file/<ULID>.<ext>`: the file name the Browser tab
  // falls back to is that id, which tells the person nothing.
  for (const name of [
    '01K5Z8W3J9Q2M4N6P8R0T2V4X6.webp',
    '01K5Z8W3J9Q2M4N6P8R0T2V4X6',
    '01K5Z8W3J9Q2M4N6P8R0T2V4…',
    'd41d8cd98f00b204e9800998ecf8427e.jpg',
    '3f2b8c1e-9a4d-4f6b-8e2a-7c5d1b0a9e3f.png'
  ]) {
    assert.equal(chipLabel({ status: 'unchecked', name }), '', name)
    assert.equal(chipLabel({ status: 'resolved', name }), '', name)
  }
  // Names a person gave stay, digits and all.
  for (const name of [
    'hero-team.jpg',
    'IMG_20240512_101500.jpg',
    'Team photo 2024',
    'logo.svg',
    'Backgroundpatternsheet.png'
  ])
    assert.equal(chipLabel({ status: 'unchecked', name }), name)
  // The element's own words still win over an id.
  assert.equal(chipLabel({ status: 'unchecked', name: '01K5Z8W3J9Q2M4N6P8R0T2V4X6', text: 'Hi' }), '"Hi"')
})

test('parse leaves ordinary messages and broken blocks alone', () => {
  assert.equal(parseCommentTurn('Make the header orange.'), null)
  assert.equal(parseCommentTurn('```js\nconsole.log(1)\n```'), null)
  assert.equal(
    parseCommentTurn('Fix.\n\n```tracy-element\nno descriptor here\n```'),
    null,
    'a fence without a descriptor head'
  )
  assert.equal(
    parseCommentTurn(
      'Fix.\n\n```tracy-element\n<mentioned-element url="u" selector="s" status="unchecked">\n'
    ),
    null,
    'an unclosed fence'
  )
  assert.equal(parseCommentTurn(42), null)
})

test('text written after the block stays in the request; only the fixed hint line is hidden', () => {
  const turn = `${buildCommentTurn({ ...MENU, locate: null })}\nAlso keep the hover colour.`
  assert.equal(
    parseCommentTurn(turn)?.request,
    'Make only this menu item orange (#c8643b).\nAlso keep the hover colour.'
  )
})

// ── 28/09: incomplete answers, the budget's order, a text the picker cut ─────────────────────────

test('an answer read from part of the site says so: the status stays, the hint says to confirm by reading', () => {
  const partial = { ...MENU.locate, incomplete: true }
  const turn = buildCommentTurn({ ...MENU, locate: partial })
  assert.match(turn, /<mentioned-element [^>]*status="resolved" incomplete="true" kind="field"/)
  assert.ok(turn.endsWith(LOCATE_HINT_INCOMPLETE), 'the hint for a partial answer')
  assert.match(
    LOCATE_HINT_INCOMPLETE,
    /read the level \(`content\.read` \{id\}\) or call `content\.locate` again/
  )
  // The levels are still the best lead: every id travels.
  for (const level of partial.levels) assert.ok(turn.includes(`id=${level.id}`), level.id)
  const parsed = parseCommentTurn(turn)
  assert.equal(parsed?.element.status, 'resolved')
  assert.equal(parsed?.element.incomplete, true)
  assert.equal(parsed?.request, MENU.text, 'the partial hint is left out of the request too')
  // The chip does not name a record Tracy is not sure of: it quotes the element's words.
  assert.equal(chipLabel(parsed.element), '"Services"')
  // A complete answer is unchanged: no attribute, the plain hint, the record's name on the chip.
  const whole = buildCommentTurn(MENU)
  assert.doesNotMatch(whole, /incomplete=/)
  assert.ok(whole.endsWith(LOCATE_HINT))
  assert.equal(parseCommentTurn(whole)?.element.incomplete, undefined)
  // Every form of the hint is one line naming `tracy_site` — the rule the harness cuts it by.
  for (const incomplete of [false, true])
    for (const short of [false, true]) {
      const hint = locateHint({ incomplete, short })
      assert.ok(!hint.includes('\n') && hint.includes('`tracy_site`'), hint)
    }
})

test('a long request keeps the text line: the selector and the hint give way first', () => {
  // A pasted replacement paragraph, the case that lost the `find` string (28/09).
  const request = `Replace this paragraph with: ${'The new words the customer pasted in. '.repeat(28).trim()}`
  assert.ok(request.length > 1000)
  const words = `${'Northgate designs and builds heavy industrial plants across Russia. '.repeat(4)}`.trim()
  const element = {
    ...MENU.element,
    selector: `body > div.wp-site-blocks > main > ${'div.wp-block-group > '.repeat(8)}p.has-text`,
    text: words,
    marks: ['post:42:home block:core/paragraph', 'post:42:home block:core/group']
  }
  const turn = buildCommentTurn({ text: request, element, locate: MENU.locate })
  assert.ok(turn.length <= COMMENT_TURN_LIMIT, `turn is ${turn.length} chars`)
  assert.ok(turn.includes(`\ntext: ${words}\n`), 'the words to find, whole')
  assert.match(turn, /selector="…[^"]+p\.has-text"/, 'the selector was cut to its last steps, never emptied')
  assert.equal(parseCommentTurn(turn)?.request, request)
  // With room to spare nothing is cut: the selector whole, the plain hint.
  const roomy = buildCommentTurn({ text: 'Shorten this.', element, locate: MENU.locate })
  assert.ok(roomy.includes(`selector="${element.selector.replace(/>/g, '&gt;')}"`))
  assert.ok(roomy.endsWith(LOCATE_HINT))
})

test('the selector is the first to go: a turn that fits once it is shortened keeps every level', () => {
  const element = { ...MENU.element, selector: `main > ${'section.band > div.inner > '.repeat(9)}a.more` }
  const base = buildCommentTurn({ text: 'x', element, locate: MENU.locate })
  // A request that leaves the turn just over the limit with the whole selector.
  const request = 'y'.repeat(COMMENT_TURN_LIMIT - base.length + 2)
  const turn = buildCommentTurn({ text: request, element, locate: MENU.locate })
  assert.ok(turn.length <= COMMENT_TURN_LIMIT, `turn is ${turn.length} chars`)
  assert.match(turn, /selector="…[^"]+"/)
  assert.equal(turn.match(/^- (field|block|record) /gm)?.length, 3, 'no level dropped')
  assert.ok(turn.endsWith(LOCATE_HINT), 'nor the hint shortened')
})

test('a text the picker cut keeps its one "…"; a cut here never adds a second', () => {
  // The picker sends a text past 300 characters as 299 and "…" (tracy-cms-preview `capText`).
  const cut = `${'z'.repeat(299)}…`
  const turn = buildCommentTurn({ ...MENU, element: { ...MENU.element, text: cut }, locate: null })
  assert.ok(turn.includes(`\ntext: ${cut}\n`))
  assert.doesNotMatch(turn, /……/)
  // A cut that lands just after an ellipsis of the page's own ends in one "…", not two.
  const inner = `${'w'.repeat(298)}…${'v'.repeat(5)}`
  const capped = buildCommentTurn({ ...MENU, element: { ...MENU.element, text: inner }, locate: null })
  assert.match(capped, /^text: w{298}…$/m)
  // Shortened for a long request: still one.
  const long = buildCommentTurn({
    text: 'q'.repeat(1850),
    element: { ...MENU.element, text: cut },
    locate: null
  })
  const line = long.split('\n').find((one) => one.startsWith('text: '))
  assert.ok(line && line.endsWith('…') && !line.endsWith('……'), line)
  assert.ok(line.length - 'text: '.length >= 80, 'never below the floor')
})

// ── 28/09: the picked field's write target — `value:`, `write:`, `also in:` ─────────────────────

/** A sure answer on a field whose words the picker cut, with its write, value and twin. */
const LONG_WORDS =
  `${'Northgate designs and builds heavy industrial plants across Russia. '.repeat(6)}`.trim()
const CUT_TEXT = `${Array.from(LONG_WORDS).slice(0, 299).join('')}…`
const TARGET = {
  text: 'Rewrite this paragraph in two sentences.',
  element: {
    url: 'https://northgate.tracy.site/about',
    selector: 'main p.lead',
    label: 'About › intro.text',
    text: CUT_TEXT,
    marks: ['post:37:about block:core/paragraph']
  },
  locate: {
    status: 'resolved',
    levels: [
      {
        kind: 'field',
        id: 'c-about#b-1/intro.text',
        label: 'About › intro.text',
        value: LONG_WORDS,
        at: 'post:37#intro.text',
        next: { tool: 'tracy_site', action: 'content.replace', at: ['post:37#intro.text'] },
        writable: true
      },
      { kind: 'block', id: 'b-1', label: 'About › intro', writable: true },
      {
        kind: 'record',
        id: 'c-about',
        label: 'page "About"',
        native: [{ kind: 'post', id: 37 }],
        alternates: [{ locale: 'ru-RU', id: 'c-about-ru' }],
        writable: true
      }
    ]
  }
}

test('a sure answer prints the stored words, the one write and the twins; the hint says what each line is', () => {
  // A slot that prints a token: the page shows the number, the slot holds the token.
  const hotline = {
    text: 'Change the hotline to 8 800 100-20-30.',
    element: {
      url: 'https://northgate.tracy.site/en',
      selector: 'div.topbar p',
      label: 'Topbar › phone',
      text: 'Hotline: 8 800 550-67-90',
      marks: ['module:428 block:mod_custom']
    },
    locate: {
      status: 'resolved',
      levels: [
        {
          kind: 'field',
          id: 'c-top#b-428/module-428.1',
          label: 'Topbar › phone',
          value: 'Hotline: {contact.phone}',
          at: 'module-428.1',
          next: { tool: 'tracy_site', action: 'content.replace', at: ['module-428.1'] },
          writable: true
        },
        {
          kind: 'record',
          id: 'c-top',
          label: 'shared "Topbar"',
          alternates: [{ locale: 'ru-RU', id: 'c-top-ru' }],
          writable: true
        }
      ]
    }
  }
  const turn = buildCommentTurn(hotline)
  const lines = turn.split('\n')
  const at = (prefix) => lines.findIndex((line) => line.startsWith(prefix))
  assert.equal(lines[at('value: ')], 'value: Hotline: {contact.phone}', 'the stored words, token and all')
  assert.equal(lines[at('write: ')], 'write: content.replace {find, replace, path, at:["module-428.1"]}')
  assert.equal(lines[at('also in: ')], 'also in: ru-RU → c-top-ru')
  // In the block, in that order, right after the element's own text.
  assert.deepEqual(
    [at('text: '), at('value: '), at('write: '), at('also in: '), at('marks: ')].map((i) => i - at('text: ')),
    [0, 1, 2, 3, 4]
  )
  const hint = lines.at(-1)
  assert.equal(hint, locateHint({ incomplete: false, short: false, write: 'call', value: true, twins: true }))
  assert.ok(hint.startsWith(LOCATE_HINT.slice(0, 200)), 'the same roads first')
  assert.match(hint, /The write line is that one call for this field: send it as given, its at kept/)
  // With an at the replace job names no other place, so "every place" is all:true, never the at — and
  // only when the customer asked for every place, not offered for every place the words show.
  assert.match(hint, /all:true instead of at only if asked for every place\./)
  assert.doesNotMatch(hint, /for every place the words show/)
  assert.match(hint, /The value line is its stored words, whole\./)
  assert.match(hint, /a phone, e-mail, address or all:true reaches them in the same call/)
  assert.ok(hint.includes('`tracy_site`') && !hint.includes('\n'))
  assert.ok(turn.length <= COMMENT_TURN_LIMIT, `turn is ${turn.length} chars`)
  assert.equal(parseCommentTurn(turn)?.request, hotline.text)

  // A paragraph the picker cut: its words whole on the value line; the hint gives way to them. The
  // request is one sentence longer than TARGET's, so that the turn does not fit the full hint (with
  // TARGET's own request it sits at the 2,500 limit, give or take a sentence of the hint). Stage 6
  // (Rule 7) shrank the full hint by 190 characters, so the request grew by one more sentence.
  const asked = `${TARGET.text} Keep every number and name exactly as they are. Do not add anything else to it, and do not remove any of the sentences around it either; it should read as it does now, only with the words I asked for.`
  const long = buildCommentTurn({ ...TARGET, text: asked })
  assert.ok(long.length <= COMMENT_TURN_LIMIT, `turn is ${long.length} chars`)
  assert.ok(long.includes(`\nvalue: ${LONG_WORDS}\n`), 'the words the picker cut, whole')
  assert.ok(long.includes('\nwrite: content.replace {find, replace, path, at:["post:37#intro.text"]}\n'))
  assert.ok(long.includes('\nalso in: ru-RU → c-about-ru\n'))
  assert.equal(
    long.split('\n').at(-1),
    locateHint({ incomplete: false, short: true, write: 'call', value: true, twins: true })
  )
  assert.match(long.split('\n').at(-1), /facts and all:true reach them/)
  const parsed = parseCommentTurn(long)
  assert.equal(parsed?.request, asked)
  assert.equal(parsed?.element.text, CUT_TEXT)
})

test('a value equal to the element’s own words is not printed again', () => {
  const same = {
    ...TARGET,
    element: { ...TARGET.element, text: 'Careers' },
    locate: {
      ...TARGET.locate,
      levels: [{ ...TARGET.locate.levels[0], value: 'Careers' }, ...TARGET.locate.levels.slice(1)]
    }
  }
  const turn = buildCommentTurn(same)
  assert.doesNotMatch(turn, /^value/m)
  assert.match(turn, /^write: /m)
  assert.doesNotMatch(turn.split('\n').at(-1), /value line/)
})

test('a picture or a link is one contract apply, carrying the revision locate read', () => {
  const level = {
    kind: 'field',
    id: 'c-home#b-8/module-441.8',
    label: 'Home › image',
    value: 'images/northgate/hero.jpg',
    next: {
      tool: 'tracy_site',
      action: 'content.contract',
      operation: 'apply',
      changes: { 'module-441.8': null },
      expected_content_revisions: { content_3e38: 'ad5b9ac9' }
    },
    writable: true
  }
  const turn = buildCommentTurn({
    text: 'Swap this picture for the team photo.',
    element: { url: 'https://n.tracy.site/en', selector: 'img', label: 'Home › image', text: '', marks: [] },
    locate: { status: 'resolved', levels: [level] }
  })
  assert.match(
    turn,
    /^write: content\.contract \{operation:"apply", changes:\{"module-441\.8":"<new value>"\}, expected_content_revisions:\{"content_3e38":"ad5b9ac9"\}\}$/m
  )
  assert.match(turn, /^value: images\/northgate\/hero\.jpg$/m)
})

test('a language string or a template word: the file write; a core string: none, and why', () => {
  const turnFor = (level) =>
    buildCommentTurn({
      text: 'Call it "Pick a language".',
      element: { url: 'https://s.test/', selector: 'x', label: '', text: 'Choose your language', marks: [] },
      locate: { status: 'resolved', levels: [level] }
    })
  const override = turnFor({
    kind: 'string',
    id: 'language/en-GB/mod_languages.ini#MOD_LANGUAGES_PICK',
    label: 'MOD_LANGUAGES_PICK — override in language/overrides/en-GB.override.ini',
    next: { edit: 'language/overrides/en-GB.override.ini', write: 'MOD_LANGUAGES_PICK="<new words>"' },
    writable: true
  })
  assert.match(
    override,
    /^write: language\/overrides\/en-GB\.override\.ini: add the line MOD_LANGUAGES_PICK="<new words>"$/m
  )
  const ownLine = turnFor({
    kind: 'string',
    id: 'language/overrides/en-GB.override.ini#MOD_LANGUAGES_PICK',
    label: 'x',
    next: {
      edit: 'language/overrides/en-GB.override.ini',
      line: 2,
      write: 'MOD_LANGUAGES_PICK="<new words>"'
    },
    writable: true
  })
  assert.match(
    ownLine,
    /^write: language\/overrides\/en-GB\.override\.ini line 2: MOD_LANGUAGES_PICK="<new words>" \(the key's own line\)$/m
  )
  const emdash = turnFor({
    kind: 'file',
    id: '/app/src/components/site/Footer.astro:2',
    label: 'x',
    next: {
      edit: '/app/src/components/site/Footer.astro',
      line: 2,
      through: 'shell',
      after: 'tracy_site_build_emdash request site.rebuild'
    },
    writable: false,
    why: 'Template source in the site container (/app/src), outside the folder file tools reach.'
  })
  assert.match(
    emdash,
    /^write: in the site's shell \(file tools cannot reach it\), edit \/app\/src\/components\/site\/Footer\.astro line 2, then tracy_site_build_emdash request site\.rebuild$/m
  )
  const core = turnFor({
    kind: 'string',
    id: 'wp-includes/blocks/navigation.php:2#Open menu',
    label: 'x',
    writable: false,
    why: 'WordPress core prints it: the next WordPress update overwrites an edit to its file.'
  })
  assert.match(
    core,
    /^write: none — WordPress core prints it: the next WordPress update overwrites an edit to its file\.$/m
  )
  assert.match(
    core.split('\n').at(-1),
    /A write line "none" is the answer: say why; do not look for another way in\./
  )
})

test('only a sure answer prints them: unconfirmed, incomplete or unchecked turns stay as they were', () => {
  for (const locate of [
    { ...TARGET.locate, status: 'unconfirmed' },
    { ...TARGET.locate, incomplete: true },
    null
  ]) {
    const turn = buildCommentTurn({ ...TARGET, locate })
    assert.doesNotMatch(turn, /^(value|write|also in)/m)
    assert.ok(
      turn.endsWith(locate?.incomplete ? LOCATE_HINT_INCOMPLETE : LOCATE_HINT),
      'the plain hint, no clause for a line that is not there'
    )
  }
  // A candidate the person chose is theirs: its write is printed (it carries no record's twins).
  const chosen = buildCommentTurn({
    ...TARGET,
    locate: {
      status: 'candidates',
      levels: [],
      candidates: [
        TARGET.locate.levels[0],
        { kind: 'field', id: 'c-2#f', label: 'Other › f', writable: true }
      ],
      chosen: { candidate: 0 }
    }
  })
  assert.match(chosen, /^write: content\.replace/m)
  assert.doesNotMatch(chosen, /^also in:/m)
})

test('a write line never names a cut or spaced address: it is left out instead', () => {
  const at = `post:37#${'x'.repeat(260)}`
  const turn = buildCommentTurn({
    ...TARGET,
    locate: {
      status: 'resolved',
      levels: [
        { ...TARGET.locate.levels[0], next: { tool: 'tracy_site', action: 'content.replace', at: [at] } }
      ]
    }
  })
  assert.doesNotMatch(turn, /^write:/m)
  const spaced = buildCommentTurn({
    ...TARGET,
    locate: {
      status: 'resolved',
      levels: [
        { ...TARGET.locate.levels[0], next: { tool: 'tracy_site', action: 'content.replace', at: ['a b'] } }
      ]
    }
  })
  assert.doesNotMatch(spaced, /^write:/m)
})

test('the budget: the twins, then the stored words give way before the marks; the write line never', () => {
  // Sized to the limit: everything but the twins and part of the stored words fits (≈1,300
  // characters of the turn are not the request; 66 more since F4/F14: the short hint's clause, +56,
  // and the ` lang="en"` tag, +10).
  const pasted = 'The new words the customer pasted in. '
  const request = `Rewrite it: ${pasted.repeat(Math.round((COMMENT_TURN_LIMIT - 1366) / pasted.length)).trim()}`
  const turn = buildCommentTurn({ ...TARGET, text: request })
  assert.ok(turn.length <= COMMENT_TURN_LIMIT, `turn is ${turn.length} chars`)
  assert.match(turn, /^write: content\.replace \{find, replace, path, at:\["post:37#intro\.text"\]\}$/m)
  assert.doesNotMatch(turn, /^also in:/m, 'the twins went first')
  assert.match(turn, /^marks: post:37:about block:core\/paragraph$/m, 'the marks stayed')
  const value = turn.split('\n').find((line) => line.startsWith('value'))
  assert.ok(value?.startsWith('value (cut): '), value)
  assert.ok(Array.from(value.slice('value (cut): '.length)).length >= 80, 'never below the floor')
  assert.ok(turn.includes(`\ntext: ${CUT_TEXT}\n`), 'the text line whole')
  // The hint says only what the turn still carries.
  assert.doesNotMatch(turn.split('\n').at(-1), /also in/)
  assert.equal(parseCommentTurn(turn)?.request, request)
})

// ── inside: a picked container's words (bench v6 L5-02) ──────────────────────────────────────────

const CARD = {
  ...MENU.element,
  selector: 'main > section.team > div.card:nth-child(2)',
  label: '',
  text: '',
  inside: 'Ana Lopez Head of design',
  marks: []
}

test('a container with no text of its own prints an inside line and the hint says it is the picked block', () => {
  const turn = buildCommentTurn({ text: 'Add another person after this one.', element: CARD, locate: null })
  assert.match(turn, /^inside: Ana Lopez Head of design$/m)
  assert.doesNotMatch(turn, /^text:/m)
  const hint = turn.split('\n').at(-1)
  assert.match(hint, /inside line is the words in the picked block/)
  assert.match(hint, /new item goes after it/)
  assert.equal(parseCommentTurn(turn)?.request, 'Add another person after this one.')
})

test('a turn with text of its own, or no inside, keeps the hint it had', () => {
  const plain = buildCommentTurn({ text: 'Change it.', element: MENU.element, locate: MENU.locate })
  assert.doesNotMatch(plain, /^inside:/m)
  assert.ok(plain.endsWith(LOCATE_HINT))
  // The picker never sends both; if a caller does, the text line wins and inside is not printed.
  const both = buildCommentTurn({
    text: 'Change it.',
    element: { ...MENU.element, inside: 'x y' },
    locate: null
  })
  assert.doesNotMatch(both, /^inside:/m)
})

test('the inside line is capped, and is dropped after the marks when the turn is over its budget', () => {
  const words = 'w'.repeat(400)
  const capped = buildCommentTurn({ text: 'Add one.', element: { ...CARD, inside: words }, locate: null })
  assert.ok(
    capped.includes(`\ninside: ${'w'.repeat(199)}…\n`) || capped.includes(`\ninside: ${'w'.repeat(200)}\n`)
  )
  // Sized to the limit (the turn's fixed part is ≈1,900 characters here, the short hint included):
  // 50 characters over what the marks leave room for, the marks and then inside must both go.
  const element = { ...CARD, marks: ['post:42:team block:core/group'] }
  // The short hint's reply clause (stand E2E L7; since L8/L1 the line itself and the language) takes
  // its characters of the room the steps below were sized in (G3: and the answered line).
  // F4/F14: the clause names the comment's language and forbids tool names, codes and ids.
  // Stage 6 (Rule 7): the clause asks for plain words, without the reply line.
  const REPLY =
    " Answer in plain words, in its language (`lang`), never naming it; no tool names, codes, ids or numbers; name what changed as the write's result does."
      .length
  // Round 5 leftover (30/09): the selector is never emptied any more, so the room it used to give back
  // (its escaped length) is room the steps below no longer get.
  const SELECTOR = 'main &gt; section.team &gt; div.card:nth-child(2)'.length
  const ask = (/** @type {number} */ room) =>
    `Add another person: ${'x'.repeat(COMMENT_TURN_LIMIT - room - REPLY - SELECTOR)}`
  const long = buildCommentTurn({ text: ask(550), element, locate: null })
  assert.ok(long.length <= COMMENT_TURN_LIMIT, `turn is ${long.length} chars`)
  assert.doesNotMatch(long, /^marks:/m, 'the marks went first')
  assert.doesNotMatch(long, /^inside:/m, 'then inside')
  assert.doesNotMatch(long.split('\n').at(-1), /inside line/i, 'and the hint stopped naming it')
  // Just short of that, the marks alone make room: inside stays, and the hint still names it.
  const marksGone = buildCommentTurn({ text: ask(600), element, locate: null })
  assert.ok(marksGone.length <= COMMENT_TURN_LIMIT, `turn is ${marksGone.length} chars`)
  assert.doesNotMatch(marksGone, /^marks:/m)
  assert.match(marksGone, /^inside: /m, 'kept while the marks alone made room')
  assert.match(marksGone.split('\n').at(-1), /inside line/i)
  // Shorter still, nothing is dropped.
  const nearly = buildCommentTurn({ text: ask(650), element, locate: null })
  assert.match(nearly, /^inside: /m)
  assert.match(nearly, /^marks: /m)
  // With room to spare it is kept, marks and all.
  const roomy = buildCommentTurn({ text: 'Add one.', element, locate: null })
  assert.match(roomy, /^inside: Ana Lopez Head of design$/m)
  assert.match(roomy, /^marks: /m)
})

// ── several comments in one turn: each block carries its own lines, the hint is said once ───────

/** The blocks of a turn and what follows the last of them (its hint). */
function blocksAndHint(/** @type {string} */ turn) {
  const found = [...turn.matchAll(/```tracy-element\n[\s\S]*?\n```/g)]
  const last = found[found.length - 1]
  return {
    blocks: found.map((m) => ({ text: m[0], after: turn.slice(m.index + m[0].length) })),
    hint: turn.slice(last.index + last[0].length + 1)
  }
}

/** A hotline slot (a token behind the number), a core string no road writes, and a card with no words. */
const HOTLINE_PIN = {
  n: 1,
  text: 'Change the hotline to 8 800 100-20-30.',
  element: {
    url: 'https://northgate.tracy.site/en',
    selector: 'div.topbar p',
    label: 'Topbar › phone',
    text: 'Hotline: 8 800 550-67-90',
    marks: ['module:428 block:mod_custom']
  },
  locate: {
    status: 'resolved',
    levels: [
      {
        kind: 'field',
        id: 'c-top#b-428/module-428.1',
        label: 'Topbar › phone',
        value: 'Hotline: {contact.phone}',
        next: { tool: 'tracy_site', action: 'content.replace', at: ['module-428.1'] },
        writable: true
      },
      {
        kind: 'record',
        id: 'c-top',
        label: 'shared "Topbar"',
        alternates: [{ locale: 'ru-RU', id: 'c-top-ru' }],
        writable: true
      }
    ]
  }
}
const CORE_PIN = {
  n: 2,
  text: 'Call it "Menu".',
  element: {
    url: 'https://northgate.tracy.site/en',
    selector: 'button.open',
    label: '',
    text: 'Open menu',
    marks: []
  },
  locate: {
    status: 'resolved',
    levels: [
      {
        kind: 'string',
        id: 'wp-includes/blocks/navigation.php:2#Open menu',
        label: 'Open menu',
        writable: false,
        why: 'WordPress core prints it: the next WordPress update overwrites an edit to its file.'
      }
    ]
  }
}
const CARD_PIN = {
  n: 3,
  text: 'Add another person after this one.',
  element: { ...CARD, url: 'https://northgate.tracy.site/team' },
  locate: null
}

test('several comments: every block prints its own write, value, twins and inside; the hint says each kind once', () => {
  const turn = buildCommentTurn({ items: [HOTLINE_PIN, CORE_PIN, CARD_PIN] })
  assert.ok(turn.length <= commentTurnLimit(3), `turn is ${turn.length} chars`)
  const { blocks, hint } = blocksAndHint(turn)
  assert.equal(blocks.length, 3)
  const [first, second, third] = blocks.map((block) => block.text)
  assert.match(first, /^value: Hotline: \{contact\.phone\}$/m)
  assert.match(first, /^write: content\.replace \{find, replace, path, at:\["module-428\.1"\]\}$/m)
  assert.match(first, /^also in: ru-RU → c-top-ru$/m)
  assert.match(
    second,
    /^write: none — WordPress core prints it: the next WordPress update overwrites an edit to its file\.$/m
  )
  assert.doesNotMatch(second, /^(value|also in):/m)
  assert.match(third, /^inside: Ana Lopez Head of design$/m)
  assert.doesNotMatch(third, /^(value|write|also in):/m)
  // ONE hint, right after the last block: the many-comments form, then each clause a block needs.
  assert.equal(hint, locateHintMany({ unsure: true, write: 'both', value: true, twins: true, inside: true }))
  assert.ok(!hint.includes('\n') && hint.includes('`tracy_site`'))
  assert.ok(hint.startsWith("Each comment's words stand right above its element, which is numbered (n)"))
  assert.ok(hint.endsWith(`${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`))
  for (const clause of [
    /The write line is that one call for this field/,
    /A write line "none" is the answer/,
    /The value line is its stored words, whole/,
    /Other languages: a phone, e-mail, address or all:true reaches them/,
    /The inside line is the words in the picked block/,
    /status="unchecked"/
  ])
    assert.match(hint, clause)
  assert.equal(turn.split('The write line is that one call').length, 2, 'said once, not once per block')
  // The chips and the request read back as before: three items, the hint hidden after the last block.
  const parsed = parseCommentTurn(turn)
  assert.deepEqual(
    parsed?.items.map((item) => [item.n, item.text]),
    [HOTLINE_PIN, CORE_PIN, CARD_PIN].map((item) => [item.n, item.text])
  )
  const folds = blocks.map((block) => commentTurnFold(block.text, block.after))
  assert.ok(folds.every((fold) => fold !== null))
  assert.deepEqual(
    folds.map((fold) => fold?.trailing),
    [0, 0, hint.length + 1],
    'only the last block hides the hint line'
  )
})

/**
 * 🔒 A LOOK ASK IS NOT REFUSED BY THE FILES RULE (29/09 pm). `COMMENT_WRITES_ONLY` (V2-H1) forbids
 * editing theme, template, plugin or PHP/JS/CSS files for a comment; read alone it also forbids the
 * look change the LOOK sentence asks for, and the call a `write:` line gives, and the agent refused
 * a look again — the failure RAISE 2's lifting was meant to end. The rule names both exceptions, and
 * the LOOK sentence stands ABOVE it, where its "(above)" points.
 */
test('the hint of a look ask carries the look sentence and, below it, the exception to the files rule', () => {
  const exception = 'except a look change (above) or the call a `write:` line gives'
  assert.ok(COMMENT_WRITES_ONLY.includes(`for a comment, ${exception}; if the page prints no slot`))
  assert.ok(
    COMMENT_WRITES_ONLY.includes('never edit theme, template, plugin or PHP/JS/CSS files'),
    'V2-H1 stays'
  )
  const one =
    buildCommentTurn({ ...MENU, text: 'Make this heading red and bigger.' })
      .split('\n')
      .at(-1) ?? ''
  const many =
    buildCommentTurn({
      items: [
        { n: 1, ...MENU, text: 'Make this heading red and bigger.' },
        { ...HOTLINE_PIN, n: 2, text: 'Make the phone bigger.' }
      ]
    })
      .split('\n')
      .at(-1) ?? ''
  for (const hint of [one, many]) {
    const look = hint.indexOf('Its look (colour, size, spacing, font): change it yourself')
    assert.ok(look >= 0, 'the look sentence')
    assert.ok(hint.indexOf(exception) > look, 'the exception sits below the look sentence it points at')
    assert.ok(hint.endsWith(`${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`))
  }
})

test('several comments: a turn whose blocks carry none of them keeps the plain many-comments hint', () => {
  const plain = {
    ...HOTLINE_PIN,
    locate: {
      status: 'resolved',
      levels: [{ kind: 'field', id: 'f', label: 'Topbar › phone', writable: true }]
    }
  }
  const turn = buildCommentTurn({ items: [plain, { ...CORE_PIN, locate: plain.locate }] })
  assert.ok(turn.endsWith(`\n${LOCATE_HINT_MANY}`))
  assert.doesNotMatch(turn, /^(write|value|also in|inside):/m)
})

/**
 * Two pins on the same kind of field, the person asking `pad` more characters of words each. The
 * element's text is a shorter cut than TARGET's (200 characters) so that with `pad` 0 the turn is
 * over its budget by well under what the stored words can give (about 140 characters), not by a
 * hair: a sentence added to the hint must not tip it into dropping a whole line.
 */
const PIN_TEXT = `${Array.from(LONG_WORDS).slice(0, 199).join('')}…`
function twoPins(/** @type {number} */ pad) {
  const pin = (/** @type {number} */ n, /** @type {string} */ letter) => ({
    n,
    text: `Rewrite this. ${letter.repeat(pad)}`.trim(),
    element: {
      ...TARGET.element,
      // Two elements (round 3: comments on ONE element share one block).
      selector: `${TARGET.element.selector}:nth-of-type(${n})`,
      text: PIN_TEXT,
      marks: ['post:37:about block:core/paragraph', 'menuItem:104']
    },
    locate: {
      status: 'resolved',
      levels: [
        {
          ...TARGET.locate.levels[0],
          next: { tool: 'tracy_site', action: 'content.replace', at: [`post:37#intro.text${n}`] }
        },
        ...TARGET.locate.levels.slice(1)
      ]
    }
  })
  return [pin(1, 'p'), pin(2, 'q')]
}

test('several comments, over budget: the twins go, the stored words are cut to the floor, then go; write never', () => {
  const trimmed = (/** @type {number} */ pad) => {
    const turn = buildCommentTurn({ items: twoPins(pad) })
    assert.ok(turn.length <= commentTurnLimit(2), `turn is ${turn.length} chars`)
    return { turn, ...blocksAndHint(turn) }
  }
  const linesOf = (/** @type {string[]} */ blocks, /** @type {RegExp} */ line) =>
    blocks.map((block) => line.exec(block)?.[0]).filter(Boolean)

  // Room for the words of both, not for everything: the twins are gone, the stored words are cut but
  // stay (never below the floor), the marks and the texts are whole.
  const cut = trimmed(0)
  const cutBlocks = cut.blocks.map((block) => block.text)
  assert.equal(linesOf(cutBlocks, /^also in:.*$/m).length, 0, 'the twins went first')
  const values = linesOf(cutBlocks, /^value.*$/m)
  assert.equal(values.length, 2)
  for (const line of values) {
    assert.ok(line?.startsWith('value (cut): '), line)
    assert.ok(Array.from(line.slice('value (cut): '.length)).length >= 80, 'never below the floor')
  }
  assert.equal(linesOf(cutBlocks, /^write: .*$/m).length, 2)
  assert.ok(
    cutBlocks.every((block) => block.includes(`\ntext: ${PIN_TEXT}\n`)),
    'the texts whole'
  )
  assert.match(cut.hint, /The value line is its stored words, whole/)
  assert.doesNotMatch(cut.hint, /Other languages/, 'the hint stopped naming the twins')

  // Words of their own that leave no room: the stored words are gone too, and their clause with them;
  // both write lines are still whole, and each text keeps at least the floor.
  const gone = trimmed(300)
  const goneBlocks = gone.blocks.map((block) => block.text)
  assert.equal(linesOf(goneBlocks, /^value.*$/m).length, 0)
  for (const [i, block] of goneBlocks.entries())
    assert.ok(
      block.includes(`\nwrite: content.replace {find, replace, path, at:["post:37#intro.text${i + 1}"]}\n`)
    )
  for (const block of goneBlocks)
    assert.ok(Array.from(/^text: (.*)$/m.exec(block)?.[1] ?? '').length >= 80, 'text never below the floor')
  assert.doesNotMatch(gone.hint, /The value line/)
  assert.match(gone.hint, /The write line is that one call/)
})

test('a numbered-hint reader skips an unnumbered block whatever clauses the many-comments hint carries', () => {
  const single = buildCommentTurn({ text: 'Shorter, please.', element: MENU.element, locate: null })
  const block = /```tracy-element\n[\s\S]*?\n```/.exec(single)?.[0] ?? ''
  for (const hint of [
    LOCATE_HINT_MANY,
    locateHintMany({ unsure: false, write: 'call', value: true, twins: true }),
    locateHintMany({ unsure: true, write: 'both', inside: true })
  ])
    assert.equal(commentTurnFold(block, `\n${hint}`), null)
  // The one-comment hint, whatever it carries, still folds.
  const one = commentTurnFold(block, `\n${locateHint({ incomplete: false, short: false, write: 'call' })}`)
  assert.ok(one && one.trailing > 0)
})

test('G1: every full hint says a look change names its scope and gives its undo, after the files sentence', () => {
  // Stand E2E stage 5 round 2, G1 (decision, 29/09 ~17:00): a look change reached every card on
  // every page, and the reply said neither how far it went nor how to take it back.
  // Stage 6 (Rule 7): said in plain words, no longer inside a `✓ updated` line.
  assert.match(COMMENT_LOOK_SCOPE, /^A look change says in plain words how far it reaches/)
  assert.match(COMMENT_LOOK_SCOPE, /"every card heading on every page", "this page only"/)
  // B7 (23/10/2026): the undo in words, never the id customers saw as `Undo: look.revert <id>`.
  assert.match(
    COMMENT_LOOK_SCOPE,
    /Ask me and I will put them back\."\. The undo id .* never in the reply\.$/
  )
  assert.doesNotMatch(COMMENT_LOOK_SCOPE, /Undo: look\.revert/)
  assert.doesNotMatch(COMMENT_LOOK_SCOPE, /✓ updated/)
  const one =
    buildCommentTurn({ ...MENU, text: 'Make this heading lighter.' })
      .split('\n')
      .at(-1) ?? ''
  const many =
    buildCommentTurn({
      items: [
        { n: 1, ...MENU, text: 'Make this heading lighter.' },
        { ...HOTLINE_PIN, n: 2, text: 'Make the phone bigger.' }
      ]
    })
      .split('\n')
      .at(-1) ?? ''
  for (const hint of [one, many])
    assert.ok(hint.endsWith(`${COMMENT_WRITES_ONLY} ${COMMENT_LOOK_SCOPE}`), hint)
})
