// One shape for the sibling texts of one list (COO rule 30/10/2026, spec TracyHQ/tracy#189). Fictional businesses of two
// trades: a dental clinic (four treatment cards, an owner's line shouting with an exclamation mark) and a bakery (a list of
// 150 pastries, and four "what to expect" item cards).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acceptsSiblingRewrite,
  alignSpelling,
  bandOf,
  fitsBand,
  shapeDrift,
  linesOf,
  shapeOf,
  siblingLists,
  spellingVariants
} from '../domain/sibling-copy-shape.mjs'

const DEMO_LONG =
  'A calm first visit where the whole mouth is checked with care. You leave with a clear plan for the months ahead.'
const DEMO_SHORT = 'A gentle cleaning that keeps gums healthy between visits, done at an easy pace.'

/** Four treatment posts of a dental clinic, each its own entity with one summary slot (a blog list of offerings). */
const clinicSlots = ['Check-up', 'Cleaning', 'Whitening', 'Braces'].flatMap((name, i) => [
  {
    key: `post-${i + 1}.0`,
    entity: `post-${i + 1}`,
    type: 'text',
    role: 'offering.summary',
    group: { id: `post-${i + 1}.offering`, kind: 'service' },
    sample: i % 2 ? DEMO_SHORT : DEMO_LONG
  },
  {
    key: `post-${i + 1}.1`,
    entity: `post-${i + 1}`,
    type: 'text',
    role: 'offering.name',
    group: { id: `post-${i + 1}.offering`, kind: 'service' },
    sample: name
  }
])

test('the sibling summaries of sibling posts are one list with the band of their demo text', () => {
  const lists = siblingLists(clinicSlots)
  assert.equal(lists.length, 1)
  const [list] = lists
  assert.equal(list.role, 'offering.summary')
  assert.equal(list.siblings.length, 4)
  assert.deepEqual(list.band.sentences, [1, 2])
  assert.ok(list.band.characters[0] <= shapeOf(DEMO_SHORT).characters)
  assert.ok(list.band.characters[1] >= shapeOf(DEMO_LONG).characters)
  assert.equal(list.siblings[2].title.sample, 'Whitening')
})

test('an owner line with an exclamation mark, or far shorter than the band, does not fit it', () => {
  const band = bandOf([DEMO_LONG, DEMO_SHORT])
  assert.equal(fitsBand('Book your whitening in Riverton today!', band), false)
  assert.equal(fitsBand('Whitening.', band), false)
  assert.equal(fitsBand(DEMO_SHORT, band), true)
})

test('a rewrite keeps the figures and names of the owner words and adds none', () => {
  const band = bandOf([DEMO_LONG, DEMO_SHORT])
  const original = 'Book your whitening in Riverton today!'
  const context = { original, sourceText: 'Riverton Smile Studio', band, title: 'Whitening' }
  assert.equal(
    acceptsSiblingRewrite(
      'Whitening sessions at our Riverton studio brighten teeth gently, at a pace that suits each patient.',
      context
    ),
    true
  )
  // Drops the place the owner named.
  assert.equal(
    acceptsSiblingRewrite(
      'Whitening sessions brighten teeth gently, at a pace that suits each patient well.',
      context
    ),
    false
  )
  // Adds a price and a name nobody gave.
  assert.equal(
    acceptsSiblingRewrite(
      'Whitening in Riverton from 90 a session with Doctor Hale, gentle and quick.',
      context
    ),
    false
  )
  // An exclamation mark never stands.
  assert.equal(
    acceptsSiblingRewrite('Whitening in Riverton brightens teeth gently, at a pace that suits you!', context),
    false
  )
})

test('the band keeps the demo line count of a measured box: never a short line beside a full one', () => {
  // A box holding 40 characters a line on desktop and 25 on phone; the demo text takes 2 and 3 lines.
  const fit = { measured: true, lines: { desktop: 2, phone: 3 }, maxChars: { desktop: 80, phone: 75 } }
  const demo = 'Fresh loaves shaped by hand each dawn, baked slow for a deep crust.'
  const band = bandOf([
    { sample: demo, fit },
    { sample: demo, fit }
  ])
  assert.deepEqual(band.lines, { desktop: { lines: 2, perLine: 40 }, phone: { lines: 3, perLine: 25 } })
  assert.deepEqual(linesOf(demo, band), { desktop: 2, phone: 3 })
  assert.equal(fitsBand(demo, band), true)
  assert.equal(fitsBand('Rye bread.', band), false)
  assert.equal(fitsBand(`${demo} ${demo}`, band), false)
})

test('a list of 150 pastries is one list, judged as one', () => {
  const slots = Array.from({ length: 150 }, (_, i) => [
    {
      key: `module-7.${i}.name`,
      entity: 'module-7',
      type: 'text',
      role: 'offering.name',
      group: { id: `module-7.item.${i}`, kind: 'menu_item' },
      sample: `Pastry ${i}`
    },
    {
      key: `module-7.${i}.desc`,
      entity: 'module-7',
      type: 'text',
      role: 'offering.description',
      group: { id: `module-7.item.${i}`, kind: 'menu_item' },
      sample: 'Butter layers folded by hand and baked until golden.'
    }
  ]).flat()
  const lists = siblingLists(slots)
  assert.equal(lists.length, 1)
  assert.equal(lists[0].siblings.length, 150)
})

test('drift: three lines beside one line, one body of four, an exclamation mark, a body off its title', () => {
  const offerings = [
    { title: 'Check-up', body: `${DEMO_LONG} ${DEMO_SHORT}` },
    { title: 'Whitening', body: 'Book your whitening today!' }
  ]
  const reasons = shapeDrift(offerings).map((d) => d.reason)
  assert.ok(reasons.includes('sentence-spread'))
  assert.ok(reasons.includes('length-spread'))
  assert.ok(reasons.includes('exclamation'))
  const items = [
    { title: 'Apron', body: '' },
    { title: 'Hair net', body: '' },
    {
      title: 'Closed shoes',
      body: 'The head baker sets the pace, and every guest works at a rhythm that feels right.'
    },
    { title: 'Notebook', body: '' }
  ]
  const itemReasons = shapeDrift(items, { items: true }).map((d) => d.reason)
  assert.ok(itemReasons.includes('mixed-empty'))
  assert.ok(itemReasons.includes('off-title'))
  assert.deepEqual(
    shapeDrift(
      [
        { title: 'Apron', body: 'An apron keeps flour off your clothes while you work.' },
        { title: 'Notebook', body: 'A notebook holds the recipes you want to bake again.' }
      ],
      { items: true }
    ),
    []
  )
})

test('one spelling per site: a body follows its title', () => {
  assert.equal(
    alignSpelling('Personalised plans and a favourite colour for every smile.', 'Personalized Color Plans'),
    'Personalized plans and a favourite color for every smile.'
  )
  assert.deepEqual(spellingVariants(['Personalized Care', 'Our personalised care plans']), [
    ['personalised', 'personalized']
  ])
  assert.deepEqual(spellingVariants(['Opening hours', 'Our hours are long']), [])
})
