// Review findings on the Contract A keys of the icon and picture step (ticket #595, review of 13/11): written row links
// replace the plan's links for their whole list, a block level network pair shares one link, every content icon is
// matched on its own `for`, a row reads only links of its own kind, picture pairs are checked like icon pairs, pair
// counts follow one rule, and links that cannot fill a row are left out with a note. The invented bakery, its copy
// written by the REAL page writer with a scripted writer, and a scripted fake build model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-icon-keys-review.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectIcons } from '../domain/icon-selection.mjs'
import { writePages } from '../domain/page-writer.mjs'
import { assignPictures } from '../domain/picture-policy.mjs'
import { blocksOf } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import {
  BAKER_LINKS,
  bakeryCopy,
  bakeryPlan,
  bakeryProfile,
  bakeryStore
} from './fixtures/icon-fields/invented-bakery.mjs'
import {
  firstCandidate,
  iconLibrary,
  scriptedModel,
  scriptedWriter
} from './fixtures/icon-fields/invented-yoga.mjs'

const run = async ({ store = bakeryStore(), profile = bakeryProfile(), plan = bakeryPlan(), copy } = {}) =>
  selectIcons({
    plan,
    data: planDataOf(profile),
    blocks: blocksOf(store),
    copy:
      copy ?? (await writePages({ plan, profile, blockStore: store, model: scriptedWriter(writeBakery) })),
    iconLibrary: iconLibrary(),
    model: scriptedModel(firstCandidate())
  })
function writeBakery(key, slot) {
  if (key.endsWith('/heading-2')) return key.includes('/rye/') ? 'Rye loaf' : 'Cardamom buns'
  if (key.endsWith('/note')) return 'Coffee corner and tea'
  return /heading|name/.test(slot.kind ?? '') ? 'Fresh every morning' : 'Baked before dawn.'
}
const at = (result, id) => result.icons.find((i) => i.id === id)
const wren = (result) =>
  [1, 2, 3].map((n) => {
    const i = at(result, `home.b1.person-wren.social.${n}.network-icon`)
    return [i.source, i.network ?? null, i.source === 'none' ? i.reason : i.link]
  })
const rowEntry = (n, value) => ({
  key: `b1/person-wren/social.${n}/link`,
  block: 'b1',
  item: 'person-wren',
  row: `social.${n}`,
  field: 'link',
  kind: 'person.social_url',
  from: 'data',
  value
})
const withRows = async (...rows) => {
  const copy = await bakeryCopy()
  copy.pages[0].fields.push(...rows)
  return copy
}
const contentIcon = (name, extra = {}) => ({
  name,
  kind: 'editorial.item_icon',
  type: 'icon',
  storage: 'image-file',
  frame: { width: 64, height: 64 },
  ...extra
})
const twoIcons = (b) => {
  const store = bakeryStore()
  store.blocks[3].itemFields = [
    { name: 'heading-2', kind: 'editorial.heading', type: 'text', limit: 36 },
    { name: 'note', kind: 'editorial.paragraph', type: 'text', limit: 80 },
    contentIcon('a-icon', { for: ['heading-2'] }),
    contentIcon('b-icon', b)
  ]
  return store
}

test('1. once the copy writes a row link of a list, the unwritten rows of that list are empty', async () => {
  assert.deepEqual(wren(await run({ copy: await withRows(rowEntry(1, BAKER_LINKS[1])) })), [
    ['network', 'tiktok', BAKER_LINKS[1]],
    ['none', null, 'no_social_link'],
    ['none', null, 'no_social_link']
  ])
  assert.deepEqual(wren(await run({ copy: await withRows(rowEntry(1, BAKER_LINKS[0])) })), [
    ['network', 'instagram', BAKER_LINKS[0]],
    ['none', null, 'no_social_link'],
    ['none', null, 'no_social_link']
  ])
})

test('2. a block level network pair takes one link and uses up one rank', async () => {
  const store = bakeryStore()
  const net = (name, extra) => ({
    name,
    kind: 'editorial.item_icon',
    type: 'icon',
    storage: 'class-name',
    iconOf: 'network',
    frame: { width: 18, height: 18 },
    ...extra
  })
  store.blocks[2].fields.push(
    net('net', { theme: 'dark' }),
    net('net-2', { theme: 'light', variantOf: 'net' }),
    net('other')
  )
  const profile = bakeryProfile()
  profile.facts['contact.social_url'].push({
    value: 'https://www.tiktok.com/@example.shop',
    sources: ['site']
  })
  const plan = bakeryPlan()
  plan.pages[0].blocks[2].data = ['contact-social-url', 'contact-social-url-2']
  const result = await run({ store, profile, plan })
  assert.deepEqual(
    ['net', 'net-2', 'other'].map((f) => at(result, `home.b2.${f}`).network),
    ['pinterest', 'pinterest', 'tiktok']
  )
})

test('3. each content icon of an item is matched on its own for; only a variantOf pair shares one', async () => {
  const split = await run({ store: twoIcons({ for: ['note'] }) })
  const a = at(split, 'home.b3.rye.a-icon')
  const b = at(split, 'home.b3.rye.b-icon')
  assert.deepEqual([a.words, a.source, a.reason], [['Rye loaf'], 'none', 'no_candidate_icon'])
  assert.deepEqual([b.words, b.icon?.name], [['Coffee corner and tea'], 'coffee'])
  assert.ok(!split.notes.some((n) => n.code === 'icon_theme_undeclared'))
  const open = await run({ store: twoIcons({}) })
  assert.deepEqual(at(open, 'home.b3.rye.b-icon').words, ['Rye loaf', 'Coffee corner and tea'])
  assert.deepEqual(at(open, 'home.b3.rye.a-icon').words, ['Rye loaf'])
})

test('4. a block level list of business links never takes a team member links', async () => {
  const plan = bakeryPlan()
  plan.pages[0].blocks[2].data = ['person-wren', 'contact-social-url']
  const result = await run({ plan })
  assert.deepEqual(
    [1, 2].map((n) => at(result, `home.b2.social.${n}.network-icon`)).map((i) => [i.network, i.reason]),
    [
      ['pinterest', 'the pinterest network of its link'],
      [null, 'no_social_link']
    ]
  )
})

const pictures = (store) =>
  assignPictures({
    pages: bakeryPlan().pages,
    blocks: blocksOf(store),
    data: planDataOf(bakeryProfile()),
    pictures: [],
    approved: { generated: { frames: 6 } }
  })

test('5. a picture pair holds like an icon pair: two different themes, a base that is no variant', () => {
  const broken = {
    'same theme': (art) => {
      art[1].theme = 'dark'
    },
    'no themes': (art) => {
      delete art[0].theme
      delete art[1].theme
    },
    'names itself': (art) => {
      art[1].variantOf = 'art-2'
    },
    chain: (art) => art.push({ ...art[1], name: 'art-3', theme: 'dark', variantOf: 'art-2' })
  }
  for (const [label, edit] of Object.entries(broken)) {
    const store = bakeryStore()
    edit(store.blocks[3].fields)
    assert.throws(() => pictures(store), { code: 'picture_variant_invalid' }, label)
  }
})

test('6. pair counts follow one rule: one count per picture, a variant counted apart', () => {
  const result = pictures(bakeryStore())
  // The logo pair (left to the brand step) and the illustration pair (generated): one decision each, two variants.
  assert.deepEqual(result.counts, { own: 0, generated: 1, none: 1, variants: 2 })
  assert.equal(result.frames.length, 4)
})

test('8. links that cannot fill a row are left out with a note, and the rows take the usable ones', async () => {
  const profile = bakeryProfile()
  profile.items.person[0].fields['person.social_url'].value = [
    'https://bit.ly/example',
    'https://www.instagram.com/example.a',
    'https://instagram.com/example.b',
    'https://forum.example/a',
    'https://www.youtube.com/@example',
    'https://x.com/example',
    'https://www.linkedin.com/in/example'
  ]
  const result = await run({ profile })
  assert.deepEqual(wren(result), [
    ['network', 'instagram', 'https://www.instagram.com/example.a'],
    ['network', 'youtube', 'https://www.youtube.com/@example'],
    ['network', 'x', 'https://x.com/example']
  ])
  const note = result.notes.find((n) => n.code === 'social_links_left_out')
  assert.deepEqual(
    note.links.map((l) => [l.list, l.link, l.reason]),
    [
      ['home.b1.person-wren.social', 'https://bit.ly/example', 'social_link_shortened'],
      ['home.b1.person-wren.social', 'https://instagram.com/example.b', 'social_network_repeated'],
      ['home.b1.person-wren.social', 'https://forum.example/a', 'social_network_unknown'],
      ['home.b1.person-wren.social', 'https://www.linkedin.com/in/example', 'social_link_over_rows']
    ]
  )
})
