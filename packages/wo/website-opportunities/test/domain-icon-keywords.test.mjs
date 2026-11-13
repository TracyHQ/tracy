// Icons of a site not written in English (ticket #595, review 13/11): the icon library speaks English, so the build
// model gives English keywords for every icon item in ONE call for the whole site, and candidates are filtered on them.
// An English site makes no such call. An invented French yoga studio and an invented German dental practice on the
// same invented template, their text written without accents (the repository keeps to plain letters), their copy
// written by the REAL page writer with a scripted writer; a scripted fake build model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-icon-keywords.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contentCatalog, iconCandidates, subjectOf } from '../domain/icon-candidates.mjs'
import { ICON_KEYWORDS_PROMPT } from '../domain/icon-keywords.mjs'
import { selectIcons } from '../domain/icon-selection.mjs'
import { blocksOf } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import {
  blockStore,
  CLASSES,
  iconLibrary,
  yogaCopy,
  yogaPlan,
  yogaProfile
} from './fixtures/icon-fields/invented-yoga.mjs'

const FRENCH = {
  'class-sunrise': ['Flux du lever du soleil', 'Des etirements doux pour commencer la journee.'],
  'class-breath': ['Cercle de respiration', 'Apprendre a ralentir chaque souffle.'],
  'class-lotus': ['Meditation du lotus', "S'asseoir et calmer l'esprit."],
  'class-passes': ['Cartes du studio', 'Dix visites, a partager.']
}
const GERMAN = {
  'class-sunrise': ['Zahnreinigung', 'Professionelle Reinigung Ihrer Zaehne.'],
  'class-breath': ['Kaffee im Wartezimmer', 'Frisch gebrueht, waehrend Sie warten.'],
  'class-lotus': ['Gruppentermine', 'Fuer die ganze Familie.'],
  'class-passes': ['Rechnungen', 'Bequem per Ueberweisung.']
}
/** English keywords a scripted model gives, per heading. */
const KEYWORDS = {
  'Flux du lever du soleil': ['sunrise', 'sun'],
  'Cercle de respiration': ['breath', 'air'],
  'Meditation du lotus': ['meditation', 'lotus'],
  'Cartes du studio': ['card'],
  Zahnreinigung: ['tooth', 'teeth'],
  'Kaffee im Wartezimmer': ['coffee', 'cup'],
  Gruppentermine: ['group'],
  Rechnungen: ['invoice'],
  'Evening wind down': ['evening']
}

/** A scripted build model answering the keywords call and the ranking call, recording both. */
function buildModel({
  keywords = (items) => ({
    keywords: Object.fromEntries(items.map((i) => [i.id, KEYWORDS[i.heading.split(' / ')[0]] ?? []]))
  })
} = {}) {
  const calls = { keywords: [], ranking: [] }
  const model = async (request) => {
    const user = JSON.parse(request.user)
    if (request.system === ICON_KEYWORDS_PROMPT) {
      calls.keywords.push(user)
      return keywords(user.items)
    }
    calls.ranking.push(user)
    return { icons: Object.fromEntries(user.items.map((i) => [i.id, i.candidates.slice(0, 1)])) }
  }
  return Object.assign(model, { calls })
}

async function build(language, headings, model) {
  const plan = { ...yogaPlan(), language }
  return selectIcons({
    plan,
    data: planDataOf(yogaProfile()),
    blocks: blocksOf(blockStore()),
    copy: await yogaCopy(headings, { plan }),
    iconLibrary: iconLibrary(),
    model
  })
}
const named = (result, item) => result.icons.find((i) => i.id === `home.home-b1.${item}.item-icon`)

test('without keywords, French and German copy find no English icon', () => {
  const catalog = contentCatalog(iconLibrary().icons)
  const items = [
    FRENCH['class-sunrise'],
    FRENCH['class-breath'],
    GERMAN['class-sunrise'],
    GERMAN['class-breath']
  ]
  for (const [heading, text] of items)
    assert.deepEqual(iconCandidates(subjectOf({ heading: [heading], text: [text] }), catalog), [], heading)
})

test('a French studio: one keywords call for the whole site, icons chosen from the English keywords', async () => {
  const model = buildModel()
  const result = await build('fr', FRENCH, model)
  assert.equal(model.calls.keywords.length, 1, 'one call for the whole site')
  assert.equal(model.calls.keywords[0].language, 'fr')
  const sunrise = model.calls.keywords[0].items.find((i) => i.id === `home.home-b1.${CLASSES[0]}`)
  assert.equal(sunrise.heading.split(' / ')[0], 'Flux du lever du soleil')
  assert.deepEqual(
    CLASSES.map((c) => named(result, c).icon?.name ?? named(result, c).reason),
    ['sun', 'wind', 'flower-lotus', 'no_candidate_icon']
  )
  assert.deepEqual(named(result, CLASSES[0]).keywords, ['sunrise', 'sun'])
  assert.match(result.keywordsPrompt.file, /icon-keywords-prompt\.md$/)
  assert.match(ICON_KEYWORDS_PROMPT, /^DRAFT, not approved\. .*#600/)
})

test('a German dental practice: tooth, coffee and group icons from the keywords', async () => {
  const result = await build('de-DE', GERMAN, buildModel())
  assert.deepEqual(
    CLASSES.map((c) => named(result, c).icon?.name ?? named(result, c).reason),
    ['tooth', 'coffee', 'users-three', 'no_candidate_icon']
  )
})

test('an English site makes no keywords call', async () => {
  const model = buildModel()
  await build('en-GB', undefined, model)
  assert.equal(model.calls.keywords.length, 0)
  assert.equal(model.calls.ranking.length, 1)
})

test('a bad keywords reply is the typed error icon_keywords_failed', async () => {
  const bad = {
    'not json': () => 'voici les mots',
    'no keywords object': () => ({ words: {} }),
    'an item left out': (items) => ({ keywords: { [items[0].id]: ['sun'] } }),
    'six keywords': (items) => ({
      keywords: Object.fromEntries(items.map((i) => [i.id, ['a', 'b', 'c', 'd', 'e', 'f']]))
    }),
    'not a list': (items) => ({ keywords: Object.fromEntries(items.map((i) => [i.id, 'sun'])) }),
    'a number': (items) => ({ keywords: Object.fromEntries(items.map((i) => [i.id, [7]])) }),
    'not english letters': (items) => ({
      keywords: Object.fromEntries(items.map((i) => [i.id, ['soleil!']]))
    })
  }
  for (const [label, keywords] of Object.entries(bad))
    await assert.rejects(
      build('fr', FRENCH, buildModel({ keywords })),
      { code: 'icon_keywords_failed' },
      label
    )
  const throws = buildModel({
    keywords: () => {
      throw new Error('model door timed out')
    }
  })
  await assert.rejects(build('fr', FRENCH, throws), { code: 'icon_keywords_failed' })
})
