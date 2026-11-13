// Review findings on the icon typed fields (ticket #595, reopened 13/11): the icon step reads the page writer's real
// output, twin fields say their theme, social icons are the fields that declare `iconOf: "network"`, links of every
// common form find their network, the paint check is strict, frames follow Contract A exactly, the candidate scoring
// lets the heading lead, and a site whose content icons are all hidden says so. The invented yoga studio, its copy
// written by the REAL page writer with a scripted writer, and a scripted fake build model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-icon-review.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contentCatalog, iconCandidates, subjectOf } from '../domain/icon-candidates.mjs'
import { selectIcons } from '../domain/icon-selection.mjs'
import { networkOf, socialReasonOf } from '../domain/icon-social.mjs'
import { framesOfPlan } from '../domain/picture-frames.mjs'
import { blocksOf } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import {
  blockStore,
  CLASSES,
  firstCandidate,
  iconLibrary,
  scriptedModel,
  yogaCopy,
  yogaPlan,
  yogaProfile
} from './fixtures/icon-fields/invented-yoga.mjs'

const run = async ({ store = blockStore(), plan = yogaPlan(), copy, model, looks } = {}) =>
  selectIcons({
    plan,
    data: planDataOf(yogaProfile()),
    blocks: blocksOf(store),
    copy: copy === undefined ? await yogaCopy() : copy,
    iconLibrary: iconLibrary(),
    model: model ?? scriptedModel(firstCandidate()),
    looks
  })
const feature = (item, field = 'item-icon') => `home.home-b1.${item}.${field}`
const at = (result, id) => result.icons.find((i) => i.id === id)

test('the icon step reads the fields the page writer returns, and a page with icon fields but no copy is a typed error', async () => {
  const model = scriptedModel(firstCandidate())
  await run({ model })
  const asked = JSON.parse(model.calls[0].user).items
  const sunrise = asked.find((i) => i.id === `home.home-b1.${CLASSES[0]}`)
  assert.deepEqual(sunrise.words.slice(0, 2), ['Sunrise flow', 'Class 1'], 'the written heading leads')
  assert.ok(sunrise.words.includes('A slow practice as the day begins.'))
  const written = await yogaCopy()
  // The shape the step used to read (`pages[].copy`) is no copy at all.
  const old = { pages: written.pages.map((p) => ({ id: p.id, copy: p.fields })) }
  await assert.rejects(run({ copy: old }), { code: 'icon_copy_missing' })
  const noClassPage = { ...written, pages: written.pages.filter((p) => p.id !== 'class') }
  await assert.rejects(run({ copy: noClassPage }), (error) => {
    assert.equal(error.code, 'icon_copy_missing')
    assert.deepEqual(error.details.pages, ['class'])
    return true
  })
})

test('twin icon fields: a declared theme takes one version, undeclared twins keep both and are noted, both twins one icon', async () => {
  const undeclared = await run()
  const note = undeclared.notes.find((n) => n.code === 'icon_theme_undeclared')
  assert.ok(note.scopes.includes(`home.home-b1.${CLASSES[0]}`))
  assert.deepEqual(Object.keys(at(undeclared, feature(CLASSES[0])).variants), ['light', 'dark'])
  const store = blockStore()
  store.blocks[0].itemFields[2].theme = 'light'
  store.blocks[0].itemFields[3].theme = 'dark'
  const declared = await run({ store })
  const light = at(declared, feature(CLASSES[0]))
  const dark = at(declared, feature(CLASSES[0], 'item-icon-2'))
  assert.deepEqual([Object.keys(light.variants), light.theme], [['light'], 'light'])
  assert.deepEqual([Object.keys(dark.variants), dark.theme], [['dark'], 'dark'])
  assert.equal(light.icon.name, dark.icon.name, 'both twins of a row take the same icon')
  assert.ok(!declared.notes.find((n) => n.scopes?.includes(`home.home-b1.${CLASSES[0]}`)))
  store.blocks[0].itemFields[2].theme = 'blue'
  await assert.rejects(run({ store }), { code: 'icon_theme_invalid' })
})

test('a social icon is the field that declares iconOf network, whatever its name', async () => {
  const store = blockStore()
  store.blocks[2].fields.push({
    name: 'network-icon',
    kind: 'editorial.item_icon',
    type: 'icon',
    storage: 'class-name',
    iconOf: 'network'
  })
  delete store.blocks[2].fields.find((f) => f.name === 'social-2-item-icon').iconOf
  const result = await run({ store })
  const network = at(result, 'home.home-b2.network-icon')
  assert.deepEqual([network.case, network.reason], ['social', 'no_social_link'])
  const unmarked = at(result, 'home.home-b2.social-2-item-icon')
  assert.deepEqual([unmarked.case, unmarked.reason], ['content', 'icon_item_undeclared'])
})

test('networkOf: links without scheme, country domains and the networks own short hosts; look alikes refused', () => {
  const cases = {
    'instagram.com/example.studio': 'instagram',
    'HTTPS://WWW.INSTAGRAM.COM/x': 'instagram',
    'https://www.facebook.co.uk/example': 'facebook',
    'https://www.youtube.de/@example': 'youtube',
    'https://pinterest.com.au/example': 'pinterest',
    'https://lnkd.in/example': 'linkedin',
    'https://pin.it/example': 'pinterest',
    'https://fb.watch/example': 'facebook',
    'https://youtu.be/example': 'youtube',
    'https://vm.tiktok.com/example': 'tiktok',
    'https://instagram.com.example/x': null,
    'https://evilinstagram.com/x': null,
    'https://youtube.com.evil.example/': null,
    'https://x.com.br/x': null,
    'https://t.co/example': null,
    '@example.studio': null
  }
  for (const [url, network] of Object.entries(cases))
    assert.equal(networkOf(url)?.network ?? null, network, url)
  assert.equal(socialReasonOf('https://t.co/example'), 'social_link_shortened')
  assert.equal(socialReasonOf('https://bit.ly/example'), 'social_link_shortened')
  assert.equal(socialReasonOf('@example.studio'), 'social_handle_without_network')
  assert.equal(socialReasonOf('https://evilinstagram.com/x'), 'social_network_unknown')
  assert.equal(socialReasonOf(''), 'no_social_link')
})

test('the paint check refuses a named colour, extra keys on the glyph paint or the plate, and an unknown weight', async () => {
  const look = (over) => ({
    'features-row': {
      weight: 'regular',
      light: { glyph: 'accent', plate: null },
      dark: { glyph: 'accent', plate: null },
      ...over
    }
  })
  const codes = async (looks) => {
    try {
      await run({ looks })
      return []
    } catch (error) {
      assert.equal(error.code, 'icon_policy_broken')
      return [...new Set(error.details.problems.map((p) => p.code))]
    }
  }
  assert.deepEqual(await codes(look({})), [])
  assert.deepEqual(await codes(look({ light: { glyph: 'red', plate: null } })), ['icon_paint_role_unknown'])
  assert.deepEqual(
    await codes(look({ light: { glyph: 'accent', plate: { role: 'surface', colour: 'red' } } })),
    ['icon_paint_shape']
  )
  assert.deepEqual(await codes(look({ dark: { glyph: 'accent', tint: 'white', plate: null } })), [
    'icon_paint_shape'
  ])
  assert.deepEqual(await codes(look({ weight: 'neon' })), ['icon_weight_unknown'])
})

test('frames follow Contract A exactly: anything but whole {width, height} is reported, never read as no frame', async () => {
  const withFrame = (frame) => {
    const store = blockStore()
    store.blocks[0].itemFields[2].frame = frame
    return store
  }
  for (const frame of [
    { w: 64, h: 64 },
    { width: '100', height: '100' },
    { width: 64 },
    { width: 0, height: 4 }
  ])
    await assert.rejects(
      run({ store: withFrame(frame) }),
      { code: 'icon_frame_invalid' },
      JSON.stringify(frame)
    )
  const store = blockStore()
  delete store.blocks[0].itemFields[2].frame
  const free = at(await run({ store }), feature(CLASSES[0]))
  assert.deepEqual([free.frame, free.variants.light.width], [null, null])
  assert.match(free.sizeFrom, /no frame declared/)
  // The picture frames read the same rule.
  const pictures = {
    blocks: [
      {
        id: 'banner',
        type: 'hero',
        fields: [{ name: 'photo', kind: 'business.hero_image', type: 'image', frame: { w: 10, h: 10 } }]
      }
    ]
  }
  const pages = [{ id: 'home', blocks: [{ id: 'b1', type: 'hero', block: 'banner', data: [] }] }]
  assert.throws(() => framesOfPlan(pages, blocksOf(pictures), planDataOf(yogaProfile())), {
    code: 'picture_frame_invalid'
  })
  pictures.blocks[0].fields[0].frame = { width: 10, height: 10 }
  pictures.blocks[0].fields.push({ ...pictures.blocks[0].fields[0] })
  assert.throws(() => framesOfPlan(pages, blocksOf(pictures), planDataOf(yogaProfile())), {
    code: 'picture_field_repeated'
  })
})

test('two icon fields of one name in one place are a typed error, never two entries of one id', async () => {
  const store = blockStore()
  store.blocks[0].itemFields[3].name = 'item-icon'
  await assert.rejects(run({ store }), { code: 'icon_field_repeated' })
})

test('a field hidden for no candidate records the words it was matched against', async () => {
  const passes = at(await run(), feature(CLASSES[3]))
  assert.equal(passes.reason, 'no_candidate_icon')
  assert.deepEqual(passes.words.slice(0, 1), ['Studio passes'])
})

test('candidate scoring: the heading outranks stray body words, number and stop words call no icon', () => {
  const catalog = contentCatalog(iconLibrary().icons)
  const of = (heading, text) => iconCandidates(subjectOf({ heading: [heading], text: [text] }), catalog)
  const dental = of('Teeth cleaning', 'A gentle clean every six months.')
  console.log('Teeth cleaning:', dental.join(', '))
  assert.equal(dental[0], 'tooth')
  assert.ok(!dental.includes('dice-six'), 'every six months never calls dice-six')
  const group = of('Group training', 'Train with friends.')
  console.log('Group training:', group.join(', '))
  assert.equal(group[0], 'users-three', 'the heading word leads')
  assert.ok(group.indexOf('train') > group.indexOf('users-three'))
  const private_ = of('Private training', 'One to one sessions.')
  assert.ok(!private_.includes('number-one'), 'one to one never calls number-one')
})

test('a site whose content icons all come back empty is noted icons_all_hidden; each item stays hidden', async () => {
  const empty = scriptedModel((request) => ({
    icons: Object.fromEntries(JSON.parse(request.user).items.map((i) => [i.id, []]))
  }))
  const hidden = await run({ model: empty })
  const note = hidden.notes.find((n) => n.code === 'icons_all_hidden')
  console.log('icons_all_hidden note:', JSON.stringify(note))
  assert.equal(note.items, 5)
  assert.deepEqual(note.reasons, { no_matching_icon: 4, no_candidate_icon: 1 })
  assert.ok(hidden.icons.filter((i) => i.case === 'content').every((i) => i.source === 'none'))
  const fine = await run()
  assert.ok(!fine.notes.some((n) => n.code === 'icons_all_hidden'))
})
