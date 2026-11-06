// The site check's guard on the brand style (#378). What the host answers is invented here; the in-page read has its own test.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { brandAccentGroup, factsOf, judgeBrandStyle } from '../src/site-check/brand-accent.js'
import { stepName } from '../src/lib/site-build-steps.js'

const HEAD =
  '/* tracy-ds-slot: brand:accent-only-0a7d6e */\n/* accent-only: replaces=#7a3ff2 accent=#0a7d6e light-text=#0a6f62 dark-text=#12a892 family=#7a3ff2,#6530d0 */'
const PURPLE = 'rgb(122, 63, 242)'
const change = (prop, worn, without, sample = 'a.x') => ({
  prop,
  with: worn,
  without,
  sample,
  seen: true,
  count: 1
})
const page = (sides) => ({ worn: true, head: HEAD, sides })
const side = (changes = [], colours = []) => ({ elements: 10, truncated: false, changes, colours })

test('the facts are read from the style, and a style without them has none', () => {
  assert.deepEqual(factsOf(HEAD).family, ['#7a3ff2', '#6530d0'])
  assert.equal(factsOf('/* tracy-ds-slot: brand:121111-ffffff-0f884d */'), null)
})

test('the accent moving to the brand accent passes, in rgb, alpha, oklab and in a shadow', () => {
  const { changed, left } = judgeBrandStyle(
    page({
      dark: side([
        change('color', 'rgb(18, 168, 146)', PURPLE),
        change('background-color', 'rgba(10, 125, 110, 0.25)', 'rgba(122, 63, 242, 0.25)'),
        change('box-shadow', 'rgb(10, 125, 110) 0px 0px 4px 0px', `${PURPLE} 0px 0px 4px 0px`),
        change('fill', 'oklab(0.5 -0.09 0.01)', PURPLE),
        change('outline-color', 'color(srgb 0.04 0.49 0.43 / 0.1)', 'color(srgb 0.478 0.247 0.949 / 0.1)')
      ])
    })
  )
  assert.deepEqual(changed, [])
  assert.deepEqual(left, [])
})

test('anything that is not a colour blocks', () => {
  const { changed } = judgeBrandStyle(
    page({
      light: side([
        change('border-top-left-radius', '18px', '0px', 'a.btn'),
        change('font-family', 'Space Grotesk', 'Bebas Neue', 'h3'),
        change('font-weight', '600', '400', 'h1'),
        change('box-shadow', 'rgb(10, 125, 110) 0px 0px 8px 0px', `${PURPLE} 0px 0px 4px 0px`)
      ])
    })
  )
  assert.deepEqual(
    changed.map((c) => c.prop),
    ['border-top-left-radius', 'font-family', 'font-weight', 'box-shadow']
  )
})

test('a colour outside the family moving blocks: a border, body text, a button ground', () => {
  const { changed } = judgeBrandStyle(
    page({
      dark: side([
        change('border-top-color', 'rgb(80, 79, 79)', 'rgb(31, 30, 30)', '.row'),
        change('color', 'rgb(139, 139, 139)', 'rgb(108, 117, 125)', 'p'),
        change('background-color', 'rgb(37, 36, 36)', 'rgb(33, 37, 41)', 'a.btn')
      ])
    })
  )
  assert.equal(changed.length, 3)
})

test('the accent moving to something that is not the brand accent blocks, and so does a changed alpha', () => {
  const { changed } = judgeBrandStyle(
    page({
      dark: side([
        change('color', 'rgb(200, 30, 30)', PURPLE),
        change('background-color', 'rgba(10, 125, 110, 0.9)', 'rgba(122, 63, 242, 0.25)')
      ])
    })
  )
  assert.equal(changed.length, 2)
})

test('the template accent still painted blocks, a near colour of the danger kind does not', () => {
  const { left } = judgeBrandStyle(
    page({
      dark: side(
        [],
        [
          { colour: PURPLE, prop: 'color', sample: 'a', count: 3 },
          { colour: 'rgba(122, 63, 242, 0)', prop: 'color', sample: 'b', count: 1 },
          { colour: 'rgb(120, 40, 180)', prop: 'color', sample: 'c', count: 1 },
          { colour: 'rgb(255, 255, 255)', prop: 'color', sample: 'd', count: 1 }
        ]
      )
    })
  )
  assert.deepEqual(
    left.map((c) => c.sample),
    ['a']
  )
})

test('a whole design-system style has no family, so all it changes blocks', () => {
  const { changed } = judgeBrandStyle({
    worn: true,
    head: '/* tracy-ds-slot: brand:121111-ffffff-0f884d */',
    sides: { dark: side([change('color', 'rgb(18, 168, 146)', PURPLE)]) }
  })
  assert.equal(changed.length, 1)
})

const context = (measures, written = true) => ({
  report: { slots: written ? [{ part: 'brand-accent', status: 'written' }] : [] },
  read: async () => ({ pages: [{ route: 'home' }] }),
  host: async () => ({ checks: [], visited: [], pageMeasures: measures })
})

test('the group blocks by page, stays green on a clean page, and says when it could not tell', async () => {
  const clean = page({ dark: side([change('color', 'rgb(18, 168, 146)', PURPLE)]) })
  const dirty = page({
    dark: side(
      [change('font-weight', '600', '400', 'h1')],
      [{ colour: PURPLE, prop: 'color', sample: 'a', count: 1 }]
    )
  })
  const got = await brandAccentGroup.run(
    context([
      { path: '/', width: 1440, brandStyle: clean, links: [] },
      { path: '/about', width: 1440, brandStyle: dirty, links: [] },
      { path: '/', width: 390, links: [] }
    ])
  )
  assert.equal(got.checked, 2)
  assert.deepEqual(
    got.failures.map((f) => [f.page, f.width, f.reason.slice(0, 40)]),
    [
      ['/about', 1440, 'The brand style changes something other '],
      ['/about', 1440, "The template's accent is still painted w"]
    ]
  )
  assert.equal(stepName(brandAccentGroup.causingStep), 'brand')
})

test('the group: no read at all is unmeasured after a brand write, and nothing to check without one', async () => {
  await assert.rejects(brandAccentGroup.run(context([{ path: '/', width: 1440, links: [] }])), /brandStyle/)
  const none = await brandAccentGroup.run(context([{ path: '/', width: 1440, links: [] }], false))
  assert.deepEqual(none, {
    checked: 0,
    notApplicable: 'no brand accent was written and no page reads a brand style',
    failures: []
  })
})

test('the group: a brand write that a page does not wear blocks, and a truncated read warns', async () => {
  const got = await brandAccentGroup.run(
    context([
      { path: '/', width: 1440, brandStyle: { worn: false }, links: [] },
      {
        path: '/big',
        width: 1440,
        brandStyle: { ...page({ dark: { ...side(), truncated: true } }) },
        links: []
      }
    ])
  )
  assert.deepEqual(
    got.failures.map((f) => [f.page, f.level ?? 'block']),
    [
      ['/', 'block'],
      ['/big', 'warn']
    ]
  )
})
