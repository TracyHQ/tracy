// The options write safety and the structure measurement pass to the marker build (ticket #586), on the invented
// florist kit: `textOf` gives the writer's text of a field, `factOf` a profile value, `shape: 'min'` composes every
// item block at its least items and leaves the rest out, `pages` keeps some pages. Left out, the marker test is the
// same build (its own tests stay as they are).
import assert from 'node:assert/strict'
import test from 'node:test'
import { markerBuild, markerText } from '../ai-quickstart/gate/marker-plan.mjs'
import { floristKit } from './fixtures/ai-quickstart-gate/florist-kit.mjs'

const icons = { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] }
const values = (built) =>
  built.order.pages.flatMap((p) => p.blocks.flatMap((b) => (b.fields ?? []).map((f) => f.value)))

test('textOf writes the text it gives, with the field it is asked for', async () => {
  const asked = []
  const built = await markerBuild(floristKit(), {
    iconLibrary: icons,
    textOf: (f) => {
      asked.push(f)
      return f.key === 'home-b3/heading' ? 'Qx' + f.code + ' with a quote "' : markerText(f)
    }
  })
  const hero = asked.find((f) => f.key === 'home-b3/heading')
  assert.deepEqual([hero.page, hero.kind, hero.limit, hero.rewrite], ['home', 'business.tagline', 42, false])
  assert.ok(values(built).some((v) => String(v).includes('with a quote')))
})

test('factOf gives a profile value, and the marker by default', async () => {
  const kinds = []
  const built = await markerBuild(floristKit(), {
    iconLibrary: icons,
    factOf: (v) => {
      kinds.push(v.what + ' ' + v.kind)
      return v.kind === 'contact.hours' ? v.value + ' late on Fridays' : v.value
    }
  })
  assert.ok(kinds.includes('fact contact.hours'))
  assert.ok(kinds.some((k) => k.startsWith('item ')))
  assert.equal(built.profile.facts['contact.hours'][0].value.endsWith('late on Fridays'), true)
})

test('shape min composes every item block at its least items and leaves the rest out', async () => {
  const built = await markerBuild(floristKit(), { iconLibrary: icons, shape: 'min' })
  const home = built.composition.pages.find((p) => p.pageType === 'home')
  const counts = Object.fromEntries(home.blocks.map((b) => [b.block, b.data.length]))
  assert.equal(counts.bouquets, 2)
  assert.equal(counts['gallery-strip'], 3)
  assert.ok(built.composition.leftOut.length > 0)
  const max = await markerBuild(floristKit(), { iconLibrary: icons })
  const homeMax = max.composition.pages.find((p) => p.pageType === 'home')
  assert.equal(homeMax.blocks.find((b) => b.block === 'bouquets').data.length, 4)
  assert.deepEqual(max.composition.leftOut, [])
})

test('pages keeps only the pages it accepts', async () => {
  const built = await markerBuild(floristKit(), {
    iconLibrary: icons,
    pages: (p) => p.pageType !== 'contact'
  })
  assert.deepEqual(
    built.composition.pages.map((p) => p.pageType),
    ['home', 'bouquet']
  )
})
