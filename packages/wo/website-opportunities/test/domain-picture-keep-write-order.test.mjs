// The kept picture rules end to end through the write order (ticket #595 review): an initials frame reaches the order
// with the person's name as its alt text and the memory site writes the letters; a kept service whose frame has no
// picture keeps its text while the frame is recorded hidden, so a writer removes the demo picture. Invented florist on
// the JA Boxing block store, scripted fake models.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-keep-write-order.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWriteOrder } from '../domain/write-order.mjs'
import { checkWriteOrder, placesOfOrder } from '../domain/write-order-check.mjs'
import { memorySite } from '../domain/write-order-memory-site.mjs'
import {
  boxingComposition,
  boxingFloristBuild,
  boxingProfile
} from './fixtures/write-order/boxing-florist.mjs'

const value = (v) => ({ value: v, sources: ['site'], confidence: 'single-source' })
const PEOPLE = [
  ['person-mara-lind', 'Mara Lind'],
  ['person-oren-vale', 'Oren Vale']
]

/** The florist with two invented staff on the home page, every bouquet on home, and no picture generated. */
async function build() {
  const profile = boxingProfile()
  profile.items.person = PEOPLE.map(([id, name]) => ({
    id,
    kind: 'person',
    fields: { 'person.name': value(name), 'person.role': value('Florist') },
    sources: ['site'],
    confidence: 'single-source'
  }))
  const composition = boxingComposition(profile)
  composition.pages[0].blocks.splice(4, 0, {
    block: 'block-163',
    label: 'Team',
    data: PEOPLE.map(([id]) => id),
    reason: 'Shown.'
  })
  composition.pages[0].blocks.find((b) => b.block === 'block-160').data = profile.items.service.map(
    (s) => s.id
  )
  return boxingFloristBuild({ profile, composition, generated: 0 })
}
const saved = await build()

test('an initials frame goes through the order, the check and the memory site with the name as alt', async () => {
  const frame = saved.pictures.frames.find((f) => f.id === `home.home-b5.${PEOPLE[0][0]}.image`)
  assert.equal(frame.source, 'initials')
  const order = buildWriteOrder(saved)
  assert.deepEqual(checkWriteOrder(order), [])
  const picture = order.pictures.find((p) => p.frame === frame.id)
  assert.deepEqual(
    [picture.source, picture.alt, picture.person, picture.substitute.initials],
    ['initials', 'Mara Lind', PEOPLE[0][0], 'ML']
  )
  const { site } = await memorySite().apply(order)
  assert.deepEqual(site.pictures[frame.id], { initials: 'ML' })
  // A named person's frame without its substitute is refused by the order check.
  const broken = structuredClone(order)
  const bare = broken.pictures.find((p) => p.frame === frame.id)
  Object.assign(bare, { source: 'none', reason: 'no_generated_people' })
  delete bare.substitute
  assert.ok(checkWriteOrder(broken).some((p) => p.code === 'person_picture_empty'))
})

test('a kept service with no picture keeps its text, and its frame is recorded hidden for the writer', async () => {
  const id = 'home.home-b4.service-wedding-table-set.image'
  const frame = saved.pictures.frames.find((f) => f.id === id)
  assert.deepEqual([frame.source, frame.reason], ['none', 'over_approved_count'])
  const order = buildWriteOrder(saved)
  const item = placesOfOrder(order).find(({ place }) => place.at === 'home.home-b4.service-wedding-table-set')
  assert.equal(item.place.state, 'show')
  assert.equal(item.place.fields.find((e) => e.field === 'name').value, 'Wedding table set')
  const picture = order.pictures.find((p) => p.frame === id)
  assert.equal(picture.state, 'hidden')
  assert.ok(order.hidden.some((h) => h.at === id && h.reason === 'over_approved_count' && h.picture === true))
  assert.deepEqual(checkWriteOrder(order), [])
  const { site } = await memorySite().apply(order)
  assert.deepEqual(site.pictures[id], { hidden: true })
  const card = site.pages[0].blocks
    .find((b) => b.id === 'home-b4')
    .items.find((i) => i.id === 'service-wedding-table-set')
  assert.equal(card.fields.name, 'Wedding table set')
})
