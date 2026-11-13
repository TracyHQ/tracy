// Contract A keys of the icon and picture step (ticket #595, Contract A as finalised on 13/11): a network icon in a
// child list row stands for the `link` of that same row (`person.social_url` or `contact.social_url`) and is decided
// as the network the write step writes as the template font's class (`storage: "class-name"`), never a library pick;
// `for` narrows the words an item icon is matched against; light and dark pairs are read from `variantOf` and `theme`,
// for icons and pictures alike. An invented bakery, its copy written by the REAL page writer with a scripted writer,
// and a scripted fake build model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-icon-network-rows.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { iconCountsOf } from '../domain/icon-check.mjs'
import { selectIcons } from '../domain/icon-selection.mjs'
import { assignPictures } from '../domain/picture-policy.mjs'
import { blocksOf } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import {
  bakeryCopy,
  bakeryPlan,
  bakeryProfile,
  bakeryStore
} from './fixtures/icon-fields/invented-bakery.mjs'
import { firstCandidate, iconLibrary, scriptedModel } from './fixtures/icon-fields/invented-yoga.mjs'

const run = async ({ store = bakeryStore(), copy, model = scriptedModel(firstCandidate()) } = {}) =>
  selectIcons({
    plan: bakeryPlan(),
    data: planDataOf(bakeryProfile()),
    blocks: blocksOf(store),
    copy: copy ?? (await bakeryCopy()),
    iconLibrary: iconLibrary(),
    model
  })
const at = (result, id) => result.icons.find((i) => i.id === id)
const decision = (entry) => [entry.source, entry.network ?? null, entry.reason]

test('a team member with two network links: each row icon is the network of that row link, a class name', async () => {
  const model = scriptedModel(firstCandidate())
  const result = await run({ model })
  const rows = (item) =>
    [1, 2, 3].map((n) => decision(at(result, `home.b1.${item}.social.${n}.network-icon`)))
  assert.deepEqual(rows('person-wren'), [
    ['network', 'instagram', 'the instagram network of its link'],
    ['network', 'tiktok', 'the tiktok network of its link'],
    ['none', null, 'no_social_link']
  ])
  assert.deepEqual(rows('person-oskar'), [
    ['network', 'facebook', 'the facebook network of its link'],
    ['none', null, 'no_social_link'],
    ['none', null, 'no_social_link']
  ])
  const tiktok = at(result, 'home.b1.person-wren.social.2.network-icon')
  // No library mark is needed (the library has no tiktok mark): the write step writes the template font's class.
  assert.deepEqual(
    [tiktok.storage, tiktok.link, 'icon' in tiktok, 'variants' in tiktok],
    ['class-name', 'https://www.tiktok.com/@example.baker', false, false]
  )
  const asked = model.calls.flatMap((c) => JSON.parse(c.user).items.map((i) => i.id))
  assert.ok(!asked.some((id) => id.includes('.social.')), 'network icons are never ranked from the library')
  const counts = iconCountsOf(result)
  assert.equal(counts.fields, counts.library + counts.social + counts.network + counts.hidden)
  assert.equal(counts.unexplained, 0)
})

test('a block level list of the business links: each row reads its own rank, the rest hidden', async () => {
  const result = await run()
  assert.deepEqual(decision(at(result, 'home.b2.social.1.network-icon')).slice(0, 2), [
    'network',
    'pinterest'
  ])
  assert.deepEqual(decision(at(result, 'home.b2.social.2.network-icon')), ['none', null, 'no_social_link'])
})

test('the written link of a row wins over the plan data, so the icon always matches the link written beside it', async () => {
  const copy = await bakeryCopy()
  copy.pages[0].fields.push({
    key: 'b1/person-oskar/social.2/link',
    block: 'b1',
    item: 'person-oskar',
    row: 'social.2',
    field: 'link',
    kind: 'person.social_url',
    from: 'data',
    value: 'https://www.youtube.com/@example.oskar'
  })
  const result = await run({ copy })
  assert.deepEqual(decision(at(result, 'home.b1.person-oskar.social.2.network-icon')).slice(0, 2), [
    'network',
    'youtube'
  ])
})

test('for narrows an item icon to the text fields it names', async () => {
  const rye = at(await run(), 'home.b3.rye.item-icon')
  // The note ("Coffee corner and tea") would match the coffee icon: the icon is for the heading only.
  assert.ok(!rye.words.includes('Coffee corner and tea'), 'the note is not a field the icon is for')
  assert.ok(rye.words.includes('Rye loaf'))
  assert.deepEqual([rye.source, rye.reason], ['none', 'no_candidate_icon'])
})

test('an icon pair is read from variantOf and theme; a broken pair is a typed error', async () => {
  const result = await run()
  const dark = at(result, 'home.b3.rye.item-icon')
  const light = at(result, 'home.b3.rye.item-icon-2')
  assert.deepEqual([dark.theme, light.theme, light.variantOf], ['dark', 'light', 'item-icon'])
  assert.equal(dark.icon?.name, light.icon?.name)
  const same = bakeryStore()
  same.blocks[3].itemFields[3].theme = 'dark'
  await assert.rejects(run({ store: same }), { code: 'icon_variant_invalid' })
  const orphan = bakeryStore()
  orphan.blocks[3].itemFields[3].variantOf = 'no-such-field'
  await assert.rejects(run({ store: orphan }), { code: 'icon_variant_invalid' })
})

test('a picture pair takes one decision: the variant follows its base, counted once', () => {
  const result = assignPictures({
    pages: bakeryPlan().pages,
    blocks: blocksOf(bakeryStore()),
    data: planDataOf(bakeryProfile()),
    pictures: [],
    approved: { generated: { frames: 6 } }
  })
  const frame = (id) => result.frames.find((f) => f.id === id)
  assert.deepEqual(
    ['home.b0.logo', 'home.b0.logo-2'].map((id) => [frame(id).theme, frame(id).source, frame(id).reason]),
    [
      ['dark', 'none', 'logo_from_brand_step'],
      ['light', 'none', 'logo_from_brand_step']
    ]
  )
  const art = frame('home.b3.art')
  const art2 = frame('home.b3.art-2')
  assert.deepEqual(
    [art.source, art2.source, art2.sameAs, art2.variantOf],
    ['generated', 'generated', 'home.b3.art', 'art']
  )
  assert.equal(result.counts.generated, 1, 'one picture drawn for the pair')
})

test('a network icon kept as an image file takes the library mark of the network, or is hidden without one', async () => {
  const store = bakeryStore()
  store.blocks[1].itemLists[0].fields[1].storage = 'image-file'
  const result = await run({ store })
  const row = (n) => at(result, `home.b1.person-wren.social.${n}.network-icon`)
  assert.deepEqual([row(1).source, row(1).icon?.name], ['library', 'instagram-logo'])
  assert.deepEqual(
    [row(2).source, row(2).network, row(2).reason],
    ['none', 'tiktok', 'social_icon_not_in_library']
  )
})
