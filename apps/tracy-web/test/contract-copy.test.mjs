/**
 * The copy a template declares beside its contract (`src/lib/contract-copy.js`, D6 + D7, #1013):
 * the shape and ids the contracts gate holds it to, and how the readiness rules read it.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  contractCopyProblems,
  copyShapeProblems,
  declaredCopy,
  emdashCopyProblems,
  isKeptBy,
  splitKept
} from '../src/lib/contract-copy.js'
import { defaultEntries } from '../src/lib/template-customization-question-readiness/readers/emdash-personalize-coverage.js'
import { renameDemoCompany } from '../src/sites/brief-engines/joomla-demo-names.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..', '..', '..')
const ESSENCE_J6 = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts/ja-essence/j6/1.0.2')
const ESSENCE_WP = path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts/ja-essence/wp7/1.0.9')
const JOOMLA_CONTRACTS = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
/** The demo company names a shipped profile declares. */
const listOfNames = (dir) => declaredCopy(dir).demoCompanyNames ?? []

const BUSINESS_SEED = path.join(ROOT, 'packages/cms/tracy-emdash-theme-business/seed')

/** A profile directory with one content map, and its copy file beside it. */
function profileWith(copy, map = { entities: [{ key: 'page-home' }], slots: [{ key: 'home.hero.title' }] }) {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), 'contract-copy-')), '1.0.0')
  mkdirSync(dir)
  writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify(map))
  if (copy !== undefined)
    writeFileSync(`${dir}.copy.json`, typeof copy === 'string' ? copy : JSON.stringify(copy))
  return dir
}

test('the three golden contracts and the Tracy Business EmDash seed declare sound copy', () => {
  assert.deepEqual(contractCopyProblems(ESSENCE_J6, 'joomla'), [])
  assert.deepEqual(contractCopyProblems(ESSENCE_WP, 'wordpress'), [])
  assert.deepEqual(declaredCopy(ESSENCE_J6).demoCompanyNames, ['JA Essence'])
  const read = (f) => JSON.parse(readFileSync(path.join(BUSINESS_SEED, f), 'utf8'))
  assert.deepEqual(emdashCopyProblems(read('personalize.json'), read('seed.json'), defaultEntries), [])
})

// A demo name that is also an ordinary word renames the word in a customer's kept text: bare "Fresco" turned
// "Enjoy al fresco dining." into "Enjoy al Cafe Nova dining.". Such a spelling stays unrenamed rather than listed.
test('the JA Fresco and JA Diner names rename the demo company and never an ordinary word', () => {
  const names = (slug) => listOfNames(path.join(JOOMLA_CONTRACTS, slug, 'j6/1.0.2'))
  const fresco = names('ja-fresco')
  assert.equal(
    renameDemoCompany('Discover JA Fresco today.', fresco, 'Cafe Nova'),
    'Discover Cafe Nova today.'
  )
  assert.equal(renameDemoCompany('Restaurant & Fresco', fresco, 'Cafe Nova'), 'Cafe Nova')
  for (const ordinary of ['Enjoy al fresco dining.', 'An Al Fresco terrace.', 'A fresco on the wall.'])
    assert.equal(renameDemoCompany(ordinary, fresco, 'Cafe Nova'), ordinary)
  const diner = names('ja-diner')
  assert.equal(
    renameDemoCompany('Welcome to JA Diner. Ja Diner opens at noon.', diner, 'Cafe Nova'),
    'Welcome to Cafe Nova. Cafe Nova opens at noon.'
  )
  for (const ordinary of ['Menu for Diner', 'Moments for every diner.'])
    assert.equal(renameDemoCompany(ordinary, diner, 'Cafe Nova'), ordinary)
})

test('no copy file is no problem for the gate, and nothing declared for a rule', () => {
  const dir = profileWith(undefined)
  assert.deepEqual(contractCopyProblems(dir, 'wordpress'), [])
  assert.deepEqual(declaredCopy(dir), {})
})

test('the gate refuses a missing key, an unknown key, a short name and a repeat', () => {
  assert.match(copyShapeProblems({ keptText: [] }).join(), /"demoCompanyNames" is missing/)
  assert.match(
    copyShapeProblems({ keptText: [], demoCompanyNames: [], extra: 1 }).join(),
    /unknown key "extra"/
  )
  assert.match(copyShapeProblems({ keptText: [], demoCompanyNames: ['JA'] }).join(), /shorter than 3/)
  assert.match(copyShapeProblems({ keptText: ['a', 'a'], demoCompanyNames: [] }).join(), /repeats/)
  assert.match(copyShapeProblems({ keptText: [' a'], demoCompanyNames: [] }).join(), /not trimmed/)
  assert.match(contractCopyProblems(profileWith('{'), 'joomla').join(), /is not JSON/)
})

test('a keptText id must name an entity, an entity field, a slot or a WordPress part', () => {
  const ok = {
    keptText: ['page-home', 'home.hero.title', 'part-footer.footer.copyright'],
    demoCompanyNames: []
  }
  assert.deepEqual(contractCopyProblems(profileWith(ok), 'wordpress'), [])
  const bad = { keptText: ['page-gone', 'part-footer'], demoCompanyNames: [] }
  const problems = contractCopyProblems(profileWith(bad), 'joomla')
  assert.equal(problems.length, 2, problems.join('\n'))
  assert.match(problems[0], /keptText "page-gone" names no entity/)
  // A Joomla field must be a column ABOUT-2 reads.
  const map = { entities: [{ key: 'module-1' }], slots: [] }
  const column = { keptText: ['module-1.params', 'module-1.nope'], demoCompanyNames: [] }
  assert.deepEqual(
    contractCopyProblems(profileWith(column, map), 'joomla').map((p) => p.replace(/^.*keptText /, '')),
    ['"module-1.nope" names no entity, field or slot of this contract']
  )
})

test('an EmDash keptText id must name a default-locale entry or one of its fields', () => {
  const seed = { defaultLocale: 'en', content: { pages: [{ slug: 'terms', data: { lede: 'x' } }] } }
  const p = (keptText) =>
    emdashCopyProblems({ keptText, demoCompanyNames: ['Northgate'] }, seed, defaultEntries)
  assert.deepEqual(p(['pages/terms', 'pages/terms.lede']), [])
  assert.match(p(['pages/terms.body']).join(), /"pages\/terms\.body" names no default-locale entry/)
  assert.match(p(['pages/privacy']).join(), /"pages\/privacy"/)
})

test('a piece is kept by its entity or its entity and field, and a declared id nothing sits in is reported', () => {
  const kept = isKeptBy(['pages/terms', 'part-footer.footer.copyright'])
  assert.equal(kept('pages/terms', 'lede'), true)
  assert.equal(kept('part-footer', 'footer.copyright'), true)
  assert.equal(kept('part-footer', 'footer.tagline'), false)
  const out = splitKept(
    [
      { entity: 'part-footer', field: 'footer.copyright' },
      { entity: 'part-footer', field: 'footer.note' }
    ],
    ['part-footer.footer.copyright', 'page-home']
  )
  assert.deepEqual(out.counted, [{ entity: 'part-footer', field: 'footer.note' }])
  assert.equal(out.kept.length, 1)
  assert.deepEqual(out.unused, ['page-home'])
})
