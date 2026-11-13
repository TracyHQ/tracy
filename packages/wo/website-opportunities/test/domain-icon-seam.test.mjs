// The seam of the icon selection (ticket #595, review 13/11): needs profile -> composePlan -> writePages ->
// picturesStep, each the real step, on the invented club fixtures with scripted fake models. The ranking call must
// carry the heading the page writer WROTE for each item, so a later change of the writer's output shape breaks here
// instead of silently matching icons against the plan data alone. The club's services block is given a written item
// heading (and a frame for its icon) in this test only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-icon-seam.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePages } from '../domain/page-writer.mjs'
import { picturesStep } from '../domain/picture-step.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import * as F from './fixtures/plan-composer/invented-club.mjs'
import { iconLibrary, scriptedWriter } from './fixtures/icon-fields/invented-yoga.mjs'

/** The club's block store with a written heading per service item and a declared frame on its icon. */
function storeWithWrittenHeadings() {
  const store = F.blockStore()
  const services = store.blocks.find((b) => b.id === 'services-grid')
  // Stored in the places the item name is stored in, as Contract A asks of every item field.
  const { slots } = services.itemFields.find((f) => f.name === 'name')
  services.itemFields.unshift({ name: 'title', kind: 'editorial.heading', type: 'text', limit: 30, slots })
  services.itemFields.find((f) => f.type === 'icon').frame = { width: 64, height: 64 }
  return store
}
const WRITTEN = {
  'service-junior-coaching': 'Coffee with the juniors',
  'service-adult-group-lessons': 'Group sessions for adults',
  'service-court-hire': 'Bicycle racks by the courts',
  'service-cardio-tennis': 'Music and cardio'
}

async function seam() {
  const profile = F.clubProfile()
  const blockStore = storeWithWrittenHeadings()
  const { plan } = await composePlan({
    profile,
    blockStore,
    pageRecipes: F.pageRecipes(),
    library: F.library(),
    template: F.template(),
    brand: F.brand(),
    planId: 'plan-seam',
    model: F.scriptedModel(JSON.stringify(F.goodComposition()))
  })
  const writer = scriptedWriter((key) => {
    const item = key.split('/')[1]
    return key.endsWith('/title') && WRITTEN[item] ? WRITTEN[item] : 'Our club'
  })
  const copy = await writePages({ plan, profile, blockStore, library: F.library(), model: writer })
  return { plan, profile, blockStore, copy }
}

const ranker = () => {
  const calls = []
  const model = async (request) => {
    const user = JSON.parse(request.user)
    calls.push(user)
    return { icons: Object.fromEntries(user.items.map((i) => [i.id, i.candidates.slice(0, 1)])) }
  }
  return Object.assign(model, { calls })
}

test('the ranking call carries the heading the page writer wrote for each item', async () => {
  const { plan, profile, blockStore, copy } = await seam()
  const model = ranker()
  const result = await picturesStep({
    plan,
    profile,
    blockStore,
    library: F.library(),
    vision: F.scriptedModel(),
    model,
    copy,
    iconLibrary: iconLibrary()
  })
  const asked = model.calls[0].items
  for (const [item, heading] of Object.entries(WRITTEN)) {
    const entry = result.icons.find((i) => i.item === item)
    const words = asked.find((a) => a.id.endsWith(`.${item}`))?.words ?? entry.words
    console.log(`${item}: words ${JSON.stringify(words)} -> ${entry.icon?.name ?? entry.reason}`)
    assert.equal(words[0], heading, `${item}: the written heading leads its words`)
  }
  const coffee = result.icons.find((i) => i.item === 'service-junior-coaching')
  assert.equal(coffee.icon.name, 'coffee', 'chosen from the written heading, not the plan data')
  assert.deepEqual([coffee.variants.light.width, coffee.variants.dark.height], [64, 64])
})

test('a page of the plan with icon fields and no entry in the copy is icon_copy_missing', async () => {
  const { plan, profile, blockStore, copy } = await seam()
  const home = plan.pages.find((p) => p.blocks.some((b) => b.block === 'services-grid')).id
  const without = { ...copy, pages: copy.pages.filter((p) => p.id !== home) }
  await assert.rejects(
    picturesStep({
      plan,
      profile,
      blockStore,
      library: F.library(),
      vision: F.scriptedModel(),
      model: ranker(),
      copy: without,
      iconLibrary: iconLibrary()
    }),
    (error) => {
      assert.equal(error.code, 'icon_copy_missing')
      assert.deepEqual(error.details.pages, [home])
      return true
    }
  )
})
