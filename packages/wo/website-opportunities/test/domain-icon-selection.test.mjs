// Icon typed fields of the AI quickstart build (ticket #595, owner decision 13/11): filled from the icon library by the
// written content of the item that holds them, a light and a dark version in colour roles at the declared frame, hidden
// when nothing matches, a typed failure when the ranking fails, social icons by their network. An invented yoga studio
// on an invented template whose demo icons are boxing ones; a scripted fake build model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-icon-selection.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { iconCountsOf, iconProblemsOf } from '../domain/icon-check.mjs'
import { IconSelectionError } from '../domain/icon-ranking.mjs'
import { selectIcons } from '../domain/icon-selection.mjs'
import { blocksOf, picturesStep } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import {
  blockStore,
  CLASSES,
  DEMO_ICONS,
  firstCandidate,
  HEADINGS,
  iconLibrary,
  scriptedModel,
  yogaCopy,
  yogaPlan,
  yogaProfile
} from './fixtures/icon-fields/invented-yoga.mjs'

// The copy is the REAL page writer's output (`yogaCopy` runs `writePages` with a scripted writer).
const select = async (input = {}) =>
  selectIcons({
    plan: yogaPlan(),
    data: planDataOf(yogaProfile()),
    blocks: blocksOf(blockStore()),
    iconLibrary: iconLibrary(),
    model: scriptedModel(firstCandidate()),
    ...input,
    copy: 'copy' in input ? await input.copy : await yogaCopy()
  })
const at = (result, id) => result.icons.find((i) => i.id === id)
const feature = (item, field = 'item-icon') => `home.home-b1.${item}.${field}`
const NAMES = iconLibrary().icons.map((i) => i.name)

test('a yoga studio on a boxing template keeps no demo icon; each icon follows its item heading', async () => {
  const model = scriptedModel(firstCandidate())
  const result = await select({ model })
  assert.deepEqual(iconProblemsOf(result, { names: NAMES, demo: DEMO_ICONS }), [])
  const chosen = CLASSES.map((c) => at(result, feature(c)).icon?.name ?? null)
  assert.deepEqual(chosen, ['sun', 'wind', 'flower-lotus', null])
  for (const c of CLASSES)
    assert.deepEqual(
      at(result, feature(c, 'item-icon-2')).icon,
      at(result, feature(c)).icon,
      'twin files, one icon'
    )
  // The model read the written headings, never the plan labels ("Class 1").
  const asked = JSON.parse(model.calls[0].user).items
  assert.equal(model.calls.length, 1, 'one ranking call for the whole site')
  assert.equal(asked.find((i) => i.id === `home.home-b1.${CLASSES[0]}`).words[0], 'Sunrise flow')
  assert.match(model.calls[0].system, /^DRAFT, not approved\. .*#600/)
  const counts = iconCountsOf(result)
  console.log(
    `icon fields: ${counts.fields} = ${counts.library} from the library + ${counts.social} social marks + ${counts.network} network classes + ${counts.hidden} hidden with a reason, ${counts.unexplained} unexplained`
  )
  assert.equal(counts.fields, counts.library + counts.social + counts.network + counts.hidden)
  assert.equal(counts.unexplained, 0)
})

test('the icon follows the written copy of the item, not the plan or the trade', async () => {
  const rewritten = { ...HEADINGS, 'class-sunrise': ['Evening stillness', 'Unwind before sleep.'] }
  const result = await select({ copy: yogaCopy(rewritten) })
  assert.equal(at(result, feature(CLASSES[0])).icon.name, 'moon')
  assert.deepEqual(at(result, feature(CLASSES[0])).words.slice(0, 1), ['Evening stillness'])
})

test('when no library icon matches, the icon is hidden with the reason, never a demo icon', async () => {
  const result = await select({
    model: scriptedModel(firstCandidate({ [`home.home-b1.${CLASSES[1]}`]: [] }))
  })
  const none = at(result, feature(CLASSES[3]))
  assert.deepEqual([none.source, none.reason], ['none', 'no_candidate_icon'])
  assert.equal(at(result, feature(CLASSES[1])).reason, 'no_matching_icon')
  assert.ok(!result.icons.some((i) => DEMO_ICONS.names.includes(i.icon?.name)))
  assert.equal(at(result, 'class.class-b1.item-icon-2').reason, 'icon_item_undeclared')
  assert.equal(
    at(result, 'class.class-b1.item-icon').icon.name,
    'wind',
    'a declared block icon reads its heading'
  )
})

test('a ranking failure is a typed error: a name outside the candidates, no model, an unreadable reply', async () => {
  const outside = scriptedModel(firstCandidate({ [`home.home-b1.${CLASSES[0]}`]: ['boxing-glove'] }))
  await assert.rejects(select({ model: outside }), (error) => {
    assert.ok(error instanceof IconSelectionError)
    assert.equal(error.code, 'icon_name_outside_candidates')
    assert.equal(error.details.step, 'pictures')
    assert.deepEqual(error.details.outside[0].names, ['boxing-glove'])
    return true
  })
  await assert.rejects(select({ model: undefined }), { code: 'icon_ranker_missing' })
  await assert.rejects(select({ model: scriptedModel('not json') }), { code: 'icon_ranking_failed' })
  await assert.rejects(select({ model: scriptedModel({ icons: {} }) }), { code: 'icon_ranking_failed' })
  const throws = scriptedModel(() => {
    throw new Error('model door timed out')
  })
  await assert.rejects(select({ model: throws }), { code: 'icon_ranking_failed' })
  await assert.rejects(select({ copy: undefined }), { code: 'icon_copy_missing' })
  await assert.rejects(select({ iconLibrary: { set: 'x', icons: [] } }), { code: 'icon_library_missing' })
})

test('each icon has a light and a dark version in colour roles, drawn at the declared frame', async () => {
  const result = await select()
  // The pair's dark file and its light file: one icon, each in its own theme.
  for (const [field, theme] of [
    ['item-icon', 'dark'],
    ['item-icon-2', 'light']
  ]) {
    const sun = at(result, feature(CLASSES[0], field))
    assert.deepEqual(Object.keys(sun.variants), [theme])
    assert.equal(sun.variants[theme].icon, 'sun')
    assert.deepEqual([sun.variants[theme].width, sun.variants[theme].height], [100, 100])
    assert.equal(sun.variants[theme].paint.glyph, 'accent')
  }
  assert.doesNotMatch(JSON.stringify(result.icons), /#[0-9a-f]{3,8}\b|rgb\(/i)
  // A look carrying a colour value instead of a role is refused.
  await assert.rejects(
    select({
      looks: { 'features-row': { weight: 'regular', light: { glyph: '#cc2200' }, dark: { glyph: 'text' } } }
    }),
    { code: 'icon_policy_broken' }
  )
  // A field with no declared theme holds both versions: the check cases below start from one.
  const { theme: _theme, variantOf: _variantOf, ...dark } = at(result, feature(CLASSES[0]))
  const sun = {
    ...dark,
    variants: { light: { ...dark.variants.dark, theme: 'light' }, dark: dark.variants.dark }
  }
  assert.deepEqual(iconProblemsOf({ icons: [sun] }, { names: NAMES, demo: DEMO_ICONS }), [])
  const bad = (over) =>
    iconProblemsOf({ icons: [{ ...sun, ...over }] }, { names: NAMES, demo: DEMO_ICONS })[0]?.code
  assert.equal(bad({ source: 'own', picture: 'p1' }), 'icon_holds_picture')
  assert.equal(bad({ source: 'generated' }), 'icon_holds_picture')
  assert.equal(bad({ icon: { ...sun.icon, name: 'boxing-glove' } }), 'icon_demo_left')
  assert.equal(
    bad({ variants: { ...sun.variants, light: { ...sun.variants.light, file: DEMO_ICONS.refs[0] } } }),
    'icon_holds_picture'
  )
  assert.equal(
    bad({ variants: { ...sun.variants, dark: { ...sun.variants.dark, paint: { glyph: 'rgb(0,0,0)' } } } }),
    'icon_colour_literal'
  )
  assert.equal(bad({ variants: { light: sun.variants.light } }), 'icon_variant_missing')
})

test('social icons are the network of their link, a class name of the template font, never ranked by content', async () => {
  const model = scriptedModel(firstCandidate())
  const result = await select({ model })
  const footer = result.icons.filter((i) => i.block === 'home-b3')
  assert.deepEqual(
    footer.map((i) => [i.source, i.reason, i.network, 'icon' in i]),
    [
      ['network', 'the instagram network of its link', 'instagram', false],
      ['none', 'social_network_unknown', null, false]
    ]
  )
  assert.deepEqual(
    [
      at(result, 'home.home-b2.social-1-item-icon').source,
      at(result, 'home.home-b2.social-1-item-icon').network
    ],
    ['network', 'instagram']
  )
  assert.equal(at(result, 'home.home-b2.social-2-item-icon').reason, 'no_social_link')
  const asked = JSON.parse(model.calls[0].user).items.map((i) => i.id)
  assert.ok(
    !asked.some((id) => id.includes('home-b3') || id.includes('home-b2')),
    'social icons are not ranked'
  )
  for (const i of JSON.parse(model.calls[0].user).items)
    assert.ok(!i.candidates.some((n) => n.endsWith('-logo')))
})

test('the pictures step selects the icons from the written copy, and refuses to run without it', async () => {
  const input = {
    plan: yogaPlan(),
    profile: yogaProfile(),
    blockStore: blockStore(),
    vision: scriptedModel(firstCandidate()),
    iconLibrary: iconLibrary()
  }
  const result = await picturesStep({
    ...input,
    copy: await yogaCopy(),
    model: scriptedModel(firstCandidate())
  })
  assert.equal(result.icons.find((i) => i.id === feature(CLASSES[2])).icon.name, 'flower-lotus')
  assert.equal(result.iconCounts.unexplained, 0)
  await assert.rejects(picturesStep({ ...input, vision: scriptedModel() }), { code: 'icon_copy_missing' })
  // The ranking is a text call: the vision door is never used in its place.
  await assert.rejects(picturesStep({ ...input, copy: await yogaCopy() }), { code: 'icon_ranker_missing' })
})
