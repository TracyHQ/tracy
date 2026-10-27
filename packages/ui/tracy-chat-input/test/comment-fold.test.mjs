import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCommentTurn,
  chipLabel,
  COMMENT_FENCE,
  commentTurnFold,
  parseCommentTurn,
  registerCommentFold
} from '../src/client/comment-turn.mjs'

/**
 * Split a turn the way dsh's fold registry hands it to a fold (`userTextFoldRanges`,
 * `@deepseek-ai/dsh-client-ui-primitives` `user-text-folds.ts`): the block runs from the line
 * opening with three backticks and the fence name to the next line that is exactly three
 * backticks; `after` is everything after those closing backticks.
 * @param {string} text
 * @returns {{ before: string, block: string, after: string }}
 */
function split(text) {
  const open = text.indexOf(`\`\`\`${COMMENT_FENCE}\n`)
  assert.ok(open >= 0, 'the turn carries the block')
  const close = text.indexOf('\n```', open + 3) + 1
  const end = close + 3
  return { before: text.slice(0, open), block: text.slice(open, end), after: text.slice(end) }
}

const MENU_TURN = buildCommentTurn({
  text: 'Make only this menu item orange.',
  element: {
    url: 'https://northgate.tracy.site/services',
    selector: 'header nav li.item-104 > a',
    label: 'Services',
    text: 'Services',
    marks: ['menuItem:104']
  },
  locate: {
    status: 'resolved',
    levels: [{ kind: 'record', id: 'joomla:menu:104', label: 'Services', writable: true }]
  }
})

test('the chip carries the words of chipLabel and the element address as its tooltip', () => {
  const { block, after } = split(MENU_TURN)
  const chip = commentTurnFold(block, after)
  const parsed = parseCommentTurn(MENU_TURN)
  assert.ok(chip && parsed)
  assert.equal(chip.label, chipLabel(parsed.element))
  assert.equal(chip.label, 'Services')
  assert.equal(chip.title, 'https://northgate.tracy.site/services')
})

test('the fold hides the hint line after the block, and only that line', () => {
  const { block, after } = split(MENU_TURN)
  const chip = commentTurnFold(block, after)
  assert.ok(chip)
  assert.equal(after.slice(0, chip.trailing).includes('`tracy_site`'), true)
  assert.equal(after.slice(chip.trailing), '', 'nothing but the hint follows a built turn')
  // Text the person wrote after the block stays visible.
  const withMore = `${MENU_TURN}\nand keep the underline`
  const more = split(withMore)
  const moreChip = commentTurnFold(more.block, more.after)
  assert.ok(moreChip)
  assert.equal(more.after.slice(moreChip.trailing), '\nand keep the underline')
  // No hint line (a turn cut by hand): nothing after the block is hidden.
  assert.equal(commentTurnFold(more.block, '\nplain words')?.trailing, 0)
})

test('an image with an empty body folds to a chip too (the #513 case)', () => {
  const turn = buildCommentTurn({
    text: 'Swap this photo',
    element: {
      url: 'https://helloooo.tracy.site/',
      selector: 'main img',
      label: 'hero-site.webp',
      text: '',
      marks: []
    },
    locate: null
  })
  const { block, after } = split(turn)
  assert.deepEqual(commentTurnFold(block, after), {
    label: 'hero-site.webp',
    title: 'https://helloooo.tracy.site/',
    trailing: after.length
  })
})

test('a block this reader does not accept is left to dsh as it is', () => {
  assert.equal(commentTurnFold('```tracy-element\nnot a descriptor\n```', ''), null)
})

test("registration hands dsh the fence and a fold that leads with the icon; the disposer is the registry's", () => {
  /** @type {{ fence: string, fold(block: string, after: string): unknown }[]} */
  const registered = []
  let disposed = 0
  const folds = {
    register(fold) {
      registered.push(fold)
      return () => {
        disposed += 1
      }
    }
  }
  const icon = { glyph: 'pointer' }
  const dispose = registerCommentFold(folds, icon)
  assert.deepEqual(
    registered.map((f) => f.fence),
    ['tracy-element', 'tracy-page'],
    'the page fold (plan "comment review", H4) shares the registry'
  )
  const { block, after } = split(MENU_TURN)
  assert.deepEqual(registered[0].fold(block, after), { ...commentTurnFold(block, after), icon })
  assert.equal(registered[0].fold('```tracy-element\nx\n```', ''), null)
  dispose()
  assert.equal(disposed, 2, 'one disposer for both folds')
})

test('on a dsh without the fold registry, registering is a no-op', () => {
  const dispose = registerCommentFold(undefined, null)
  assert.equal(typeof dispose, 'function')
  dispose()
  assert.doesNotThrow(() => registerCommentFold(/** @type {never} */ ({}), null)())
})

// ── several comments in one turn (plan "comment multi-pin", contract H5) ───────────────────────

const { userTextFoldRanges } = await import(
  new URL(
    '../../../../vendor/tracy/deepseek-harness/packages/client/ui-primitives/src/user-text-folds.ts',
    import.meta.url
  ).href
)

const PINS = [
  {
    n: 1,
    text: "Change to 'Building the groundwork for Russia's industry'",
    element: {
      url: 'https://northgate.tracy.site/',
      selector: 'main h1',
      label: 'Hero › heading',
      text: 'Industrial construction, from design to handover',
      marks: []
    },
    locate: { status: 'unknown', levels: [] }
  },
  {
    n: 2,
    text: 'A construction site with modern machines',
    element: { url: 'https://northgate.tracy.site/', selector: 'main img', label: '', text: '', marks: [] },
    locate: null
  },
  {
    n: 4,
    text: 'Rename to "What we do"\nand keep the dropdown',
    element: {
      url: 'https://northgate.tracy.site/about',
      selector: 'nav li.item-104 > a',
      label: 'Services',
      text: 'Services',
      marks: ['menuItem:104']
    },
    locate: { status: 'resolved', levels: [{ kind: 'record', id: 'joomla:menu:104', label: 'Services' }] }
  }
]

/** Tracy's registration, recording what the icon function is asked for. */
function registered() {
  const calls = []
  let fold
  registerCommentFold(
    {
      register(f) {
        // The element fold is registered first; the page fold after it is not read here.
        fold ??= f
        return () => {}
      }
    },
    (n, hasWords) => {
      calls.push([n, hasWords])
      return { badge: n }
    }
  )
  return { fold, calls }
}

test('several comments: each comment’s words, then its chip — no number, no block, no hint (S16)', () => {
  const turn = buildCommentTurn({ items: PINS })
  const { fold, calls } = registered()
  const ranges = userTextFoldRanges(turn, [fold])
  // In a turn of several, a chip with words quotes them even when the record was found (stand e2e
  // L-c: on WordPress three chips all read `page "Home"`); an element with none keeps its name.
  assert.deepEqual(
    ranges.map((r) => [r.chip.label, r.chip.icon.badge, r.chip.title]),
    [
      ['"Industrial construction, from design to…"', 1, 'https://northgate.tracy.site/'],
      ['', 2, 'https://northgate.tracy.site/'],
      ['"Services"', 4, 'https://northgate.tracy.site/about']
    ]
  )
  assert.deepEqual(calls, [
    [1, true],
    [2, false],
    [4, true]
  ])
  // Each comment's words, unnumbered, right above its chip; the last chip covers everything to the end (the hint).
  assert.equal(turn.slice(0, ranges[0].start), "Change to 'Building the groundwork for Russia's industry'")
  assert.equal(turn.slice(ranges[0].end, ranges[1].start), '\n\nA construction site with modern machines')
  assert.equal(
    turn.slice(ranges[1].end, ranges[2].start),
    '\n\nRename to "What we do"\nand keep the dropdown'
  )
  assert.equal(ranges[2].end, turn.length, 'the hint is hidden')
  assert.ok(ranges.every((r) => r.lineBreak))
  for (const r of ranges) assert.equal('n' in r.chip, false, 'dsh gets the chip shape only')
})

test('a one-comment turn asks the icon for no number, so its chip is drawn as before', () => {
  const { fold, calls } = registered()
  const ranges = userTextFoldRanges(MENU_TURN, [fold])
  assert.equal(ranges.length, 1)
  assert.deepEqual(calls, [[undefined, true]])
  assert.equal(MENU_TURN.slice(0, ranges[0].start), 'Make only this menu item orange.')
  assert.equal(ranges[0].end, MENU_TURN.length, 'the hint is hidden')
})

test('the fold skips exactly the blocks parse skips: an unnumbered one and an earlier repeat', () => {
  const turn = buildCommentTurn({ items: PINS })
  const noNumber = turn.replace('<mentioned-element n="2" ', '<mentioned-element ')
  const repeated = turn.replace('<mentioned-element n="4" ', '<mentioned-element n="1" ')
  for (const [text, shown] of [
    [noNumber, [1, 4]],
    [repeated, [2, 1]]
  ]) {
    const { fold } = registered()
    assert.deepEqual(
      userTextFoldRanges(text, [fold]).map((r) => r.chip.icon.badge),
      shown
    )
    assert.deepEqual(
      parseCommentTurn(text)?.items.map((i) => i.n),
      shown
    )
  }
})

test('a numbered block alone reads as its own chip, number included', () => {
  const turn = buildCommentTurn({ items: PINS })
  const { block, after } = split(turn)
  assert.deepEqual(commentTurnFold(block, after), {
    label: '"Industrial construction, from design to…"',
    title: 'https://northgate.tracy.site/',
    trailing: 0,
    n: 1
  })
})
