import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCommentTurn,
  chipLabel,
  COMMENT_IMAGE_WORDS,
  COMMENT_TURN_LIMIT,
  locateHint,
  locateHintMany,
  parseCommentTurn
} from '../src/client/comment-turn.mjs'

/**
 * A picked PICTURE (Browser tab, v2 wire: `comment-store.ts` `sendElementOf`). Its `label` is what the tab
 * calls the element, and for a `resolved` answer that is the label of the LAST level, the record
 * (`comment-model.ts` `resolvedLabel`) — never the field's own. So `readLocate` moves `[picked]` to the
 * record, a level no road writes, and the field level that holds the picture's slot (and the revision
 * `content.locate` read) used to stay in the levels list only. `comment-turn.test.mjs` 'a picture or a link
 * is one contract apply' passes the FIELD's label, which the tab never sends; this file does not.
 */
const RECORD_LABEL = 'page "Home"'

/** The two answer shapes `content.locate` gives a picked picture: WordPress (slot key) and Joomla (module). */
const SHAPES = {
  WordPress: {
    slot: 'home.banner.img',
    file: '/wp-content/uploads/2026/09/banner-old.png',
    record: 'c-home',
    revision: 'r-42',
    field: { id: 'c-home#b-banner/banner.img', label: 'Home › banner.img' },
    native: [{ kind: 'post', id: 42 }],
    nativeText: '(post #42)'
  },
  Joomla: {
    slot: 'module-441.8',
    file: 'images/brand/banner-old.jpg',
    record: 'content_3e38',
    revision: 'ad5b9ac9',
    field: { id: 'content_3e38#b-8/module-441.8', label: 'Home › image' },
    native: [{ kind: 'article', id: 7 }],
    nativeText: '(article #7)'
  }
}

/** The answer's levels, innermost first, as `levelsOf` writes them for a picture's own field. */
function levelsOf(shape) {
  return [
    {
      kind: 'field',
      id: shape.field.id,
      label: shape.field.label,
      value: shape.file,
      next: {
        tool: 'tracy_site',
        action: 'content.contract',
        operation: 'apply',
        changes: { [shape.slot]: null },
        expected_content_revisions: { [shape.record]: shape.revision }
      },
      writable: true
    },
    { kind: 'block', id: 'b-banner', label: 'Home › banner', writable: true },
    { kind: 'record', id: shape.record, label: RECORD_LABEL, native: shape.native, writable: true }
  ]
}

/** One picked picture: no words of its own, the picker's `image`, the record's label, a sure answer. */
function pick(shape, { image, text = '', locate } = {}) {
  return {
    text: 'Replace this picture with the team photo.',
    element: {
      url: 'https://site.test/',
      selector: 'main figure > img',
      label: RECORD_LABEL,
      text,
      tag: 'img',
      image:
        image === undefined
          ? { src: 'https://site.test/wp-content/uploads/2026/09/banner-old-300x187.png', alt: 'Banner' }
          : image,
      marks: ['post:42:home block:core/image']
    },
    locate: locate ?? {
      status: 'resolved',
      levels: levelsOf(shape),
      chosen: { level: 0, candidate: null, source: null }
    }
  }
}

/** The turn's lines without the two a picture pick gains and without the hint (the last line). */
const withoutWriteLines = (turn) =>
  turn
    .split('\n')
    .filter((line) => !line.startsWith('value: ') && !line.startsWith('write: '))
    .slice(0, -1)

/**
 * The turn without the image road's own lines (`image:`, `alt:`, `alt write:`) and without the hint: a
 * picture's block names its file and alt whatever it writes through (plan "comment thread", C3), and its
 * hint says what those lines mean, so a turn with and without `image` differ by exactly those.
 */
const withoutImageRoad = (turn) =>
  turn
    .split('\n')
    .filter((line) => !/^(image|alt|alt write): /.test(line))
    .slice(0, -1)

for (const [name, shape] of Object.entries(SHAPES)) {
  test(`${name}: a picked picture is written through its own field while [picked] stays on the record`, () => {
    const comment = pick(shape)
    const turn = buildCommentTurn(comment)
    const lines = turn.split('\n')

    // The write is the picture's slot with the revision locate read; the stored file is its value.
    const slot = JSON.stringify(shape.slot)
    const based = `${JSON.stringify(shape.record)}:${JSON.stringify(shape.revision)}`
    assert.ok(
      lines.includes(
        `write: content.contract {operation:"apply", changes:{${slot}:"<new value>"}, expected_content_revisions:{${based}}}`
      ),
      `no write line in:\n${turn}`
    )
    assert.ok(lines.includes(`value: ${shape.file}`), 'the file the slot holds now')
    // The hint names both lines, and nothing else changed in it.
    assert.equal(
      lines.at(-1),
      locateHint({ incomplete: false, short: false, write: 'call', value: true, image: true })
    )
    // A picture's turn has the image road's sentence on top of the limit (`IMAGE_WORDS_ROOM`).
    assert.ok(
      turn.length <= COMMENT_TURN_LIMIT + COMMENT_IMAGE_WORDS.length + 1,
      `turn is ${turn.length} chars`
    )

    // The chip is what it was: the record stays the picked level, its kind and name the descriptor's.
    const picked = lines.filter((line) => line.endsWith(' [picked]'))
    assert.deepEqual(picked, [`- record "${RECORD_LABEL}" id=${shape.record} ${shape.nativeText} [picked]`])
    const head = lines.find((line) => line.startsWith('<mentioned-element '))
    assert.match(
      head,
      / status="resolved" kind="record" name="page &quot;Home&quot;" ref="[^"]*"( lang="[a-z-]+")?>$/
    )
    const before = buildCommentTurn(pick(shape, { image: null }))
    assert.doesNotMatch(before, /^(write|value): /m, 'what a picture pick printed before')
    assert.deepEqual(
      withoutImageRoad(withoutWriteLines(turn).join('\n') + '\n'),
      withoutWriteLines(before),
      'every other line, byte for byte'
    )
    const parsed = parseCommentTurn(turn)
    assert.equal(parsed?.request, comment.text)
    assert.equal(chipLabel(parsed.element), RECORD_LABEL)
    assert.equal(chipLabel(parsed.element), chipLabel(parseCommentTurn(before).element))
  })

  test(`${name}: the same answer for a text pick, or a picture that has words, gets no write line`, () => {
    // Words and no picture: a text pick, exactly as before.
    const text = buildCommentTurn(pick(shape, { image: null, text: 'Hello' }))
    assert.doesNotMatch(text, /^(write|value): /m)
    // A picture that also has words of its own is a text pick.
    const both = buildCommentTurn(pick(shape, { text: 'Hello' }))
    assert.doesNotMatch(both, /^(write|value): /m)
    assert.deepEqual(withoutImageRoad(both), withoutImageRoad(text))
    // An `image` with no address is no picture.
    assert.doesNotMatch(buildCommentTurn(pick(shape, { image: { src: '', alt: 'x' } })), /^(write|value): /m)
  })
}

test('words that are only spaces are no words: the picture is still written through its field', () => {
  const turn = buildCommentTurn(pick(SHAPES.WordPress, { text: '  ' }))
  assert.match(turn, /^write: content\.contract \{operation:"apply", changes:\{"home\.banner\.img":/m)
  assert.doesNotMatch(turn, /^text: /m)
})

test('a picture answer that is not sure, or whose level the person chose, is not rewritten', () => {
  const shape = SHAPES.WordPress
  // Read from part of the site: no write line, for a picture as for words.
  const partial = buildCommentTurn(
    pick(shape, { locate: { status: 'resolved', incomplete: true, levels: levelsOf(shape) } })
  )
  assert.doesNotMatch(partial, /^(write|value): /m)
  // The record alone, no field level: nothing to write through.
  const recordOnly = buildCommentTurn(
    pick(shape, { locate: { status: 'resolved', levels: levelsOf(shape).slice(2) } })
  )
  assert.doesNotMatch(recordOnly, /^(write|value): /m)
  // Several candidates and the person chose one: its own write, never the levels' field.
  const chosen = buildCommentTurn(
    pick(shape, {
      locate: {
        status: 'candidates',
        levels: levelsOf(shape),
        candidates: [
          {
            kind: 'field',
            id: 'c-other#b-1/side.img',
            label: 'Other › side.img',
            value: '/wp-content/uploads/2026/09/side-old.png',
            next: { tool: 'tracy_site', action: 'content.replace', at: ['post:9#side.img'] },
            writable: true
          }
        ],
        chosen: { level: null, candidate: 0, source: null }
      }
    })
  )
  assert.match(chosen, /^write: content\.replace \{find, replace, path, at:\["post:9#side\.img"\]\}$/m)
  assert.match(chosen, /^value: \/wp-content\/uploads\/2026\/09\/side-old\.png$/m)
  assert.doesNotMatch(chosen, /^write: .*home\.banner\.img/m, 'never the field the levels list holds')
})

test('a picture whose field hands the agent no write adds no line: the turn is what it was', () => {
  const shape = SHAPES.WordPress
  const noNext = (field) => ({ status: 'resolved', levels: [field, ...levelsOf(shape).slice(1)] })
  const [field] = levelsOf(shape)
  const { next, ...bare } = field
  for (const locate of [
    // EmDash has no slot: its image field is `field, record`, the file it holds and nothing to call.
    noNext({
      ...bare,
      id: 'e-home#hero_image',
      value: 'https://site.test/_emdash/api/media/file/01A.01B.png'
    }),
    // A field no slot names, or one this seat may not write (`levelsOf` gives it `writable: false` and no why).
    noNext({ ...bare, id: 'c-home#b-2/url' }),
    noNext({ ...bare, writable: false })
  ]) {
    assert.ok(next, 'the fixture drops a write it had')
    const turn = buildCommentTurn(pick(shape, { locate }))
    assert.doesNotMatch(turn, /^(write|value): /m)
    assert.deepEqual(
      withoutImageRoad(turn),
      withoutImageRoad(buildCommentTurn(pick(shape, { image: null, locate }))),
      'byte for byte but the image road'
    )
  }
})

test('a picture whose field this seat cannot write says none and why; a cut stored file says so', () => {
  const shape = SHAPES.Joomla
  const [field, ...rest] = levelsOf(shape)
  const locked = buildCommentTurn(
    pick(shape, {
      locate: {
        status: 'resolved',
        levels: [
          { ...field, next: undefined, writable: false, why: 'this seat holds no content write' },
          ...rest
        ]
      }
    })
  )
  assert.match(locked, /^write: none — this seat holds no content write$/m)
  assert.equal(
    locked.split('\n').at(-1),
    locateHint({ incomplete: false, short: false, write: 'none', value: true, image: true })
  )
  // The level says the stored words were cut: the `value` line says it too, from the picture's level.
  const cut = buildCommentTurn(
    pick(shape, { locate: { status: 'resolved', levels: [{ ...field, valueCut: true }, ...rest] } })
  )
  assert.match(cut, /^value \(cut\): images\/brand\/banner-old\.jpg$/m)
})

test('in a turn of several comments each picture block carries its own write; the hint names the lines', () => {
  const shape = SHAPES.WordPress
  const picture = pick(shape)
  const words = {
    text: 'Shorter, please.',
    element: {
      url: 'https://site.test/about',
      selector: 'main h1',
      label: 'About',
      text: 'About us',
      tag: 'h1',
      image: null,
      marks: []
    },
    locate: null
  }
  const turn = buildCommentTurn({
    items: [
      { n: 1, ...picture },
      { n: 2, ...words }
    ]
  })
  const blocks = turn.split('```tracy-element')
  assert.equal(blocks.length, 3, 'two blocks')
  assert.match(blocks[1], /^write: content\.contract \{operation:"apply", changes:\{"home\.banner\.img":/m)
  assert.match(blocks[1], /^value: \/wp-content\/uploads\/2026\/09\/banner-old\.png$/m)
  assert.doesNotMatch(blocks[2], /^(write|value): /m)
  assert.equal(
    turn.split('\n').at(-1),
    locateHintMany({ unsure: true, write: 'call', value: true, image: true })
  )
})
