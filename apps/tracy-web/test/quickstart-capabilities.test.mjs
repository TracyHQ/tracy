/**
 * The capabilities reader, on the profiles this repository actually ships — two Joomla
 * quickstarts of different shape, one WordPress, one EmDash — and on the ways a source can be
 * missing. Nothing here is a fixture written for the test: every number comes from a file a
 * release is sealed by.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { loadStandardQuestions } from '../src/lib/build-questions.js'
import {
  capabilityKeys,
  readCapabilities,
  roleOf,
  summarizeForModel
} from '../src/lib/quickstart-capabilities.js'

const standard = loadStandardQuestions()
const CONTRACTS = [
  fileURLToPath(new URL('../../../packages/cms/tracy-joomla-quickstart/contracts', import.meta.url)),
  fileURLToPath(new URL('../../../packages/cms/tracy-wordpress-quickstart/contracts', import.meta.url))
]
const EMDASH = [
  fileURLToPath(new URL('../../../packages/cms', import.meta.url)),
  fileURLToPath(
    new URL(
      '../../../packages/fleet/tracy-fleet-operation/scripts/provision/emdash/personalize',
      import.meta.url
    )
  )
]

const release = (tag, platform, version, extra = {}) => ({
  tag,
  platform,
  setting: {
    schemaVersion: 'tracy-setting/v1',
    platform,
    version,
    cms: '6.1.1',
    install: { webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) } },
    ...extra
  }
})

const business = () =>
  readCapabilities({
    release: release('tracy-business/j6', 'joomla', '1.1.0', { template: 'tracy_business' }),
    standardDoc: standard.joomla,
    contracts: CONTRACTS,
    readAt: '2026-09-22T00:00:00.000Z'
  })

test('Joomla: a sealed quickstart declares its pages, blocks, slots and languages, each with a source', () => {
  const snap = business()
  assert.equal(snap.schemaVersion, 'tracy-capabilities/v1')
  assert.equal(snap.release.tag, 'tracy-business/j6')
  assert.equal(snap.release.parts.webroot, 'a'.repeat(64))
  assert.ok(snap.completeness.pages > 50, `pages: ${snap.completeness.pages}`)
  assert.ok(snap.completeness.slots > 1000, `slots: ${snap.completeness.slots}`)
  const kinds = snap.sources.map((s) => s.kind)
  assert.deepEqual(kinds.slice(0, 4), [
    'release-setting',
    'contract-manifest',
    'contract-content-map',
    'contract-multilingual'
  ])
  for (const s of snap.sources) assert.match(s.sha256, /^[0-9a-f]{64}$/)
  // Every capability points at a source row that exists.
  for (const c of snap.capabilities) assert.ok(snap.sources[c.source], `${c.key} has no source`)
  // Pages come from routes; blocks fold their slots; a slot names its block.
  const page = snap.capabilities.find((c) => c.kind === 'page')
  assert.match(page.key, /^page:/)
  const block = snap.capabilities.find((c) => c.kind === 'block' && c.meaning.role === 'hero')
  assert.ok(block, 'a hero block is recognised by rule')
  assert.equal(block.meaning.by, 'rule')
  assert.ok(block.slots.length > 0)
  assert.equal(block.works.backend, 'unknown', 'a block’s words are declared; what runs behind them is not')
  const slot = snap.capabilities.find((c) => c.key === block.slots[0])
  assert.equal(slot.block, block.key)
  // Languages come from the CMS set here (no released questionnaire was handed in), one per tag.
  const languages = snap.capabilities.filter((c) => c.kind === 'language')
  // 43 since the default sets dropped duplicate regional tags (07/10/2026, U10 of #1013).
  assert.ok(languages.length >= 40, `languages: ${languages.length}`)
  assert.equal(snap.sources[languages[0].source].kind, 'standard-questions')
  // Sealed: the seed stage does not add pages, and the reader says so rather than offering it.
  assert.equal(snap.consumers.find((c) => c.id === 'seed.pages').available, false)
  assert.equal(snap.consumers.find((c) => c.id === 'copy.about').available, true)
  assert.ok(snap.completeness.unresolved.some((u) => u.what.includes('viewport')))
})

test('Joomla: a sealed quickstart with no multilingual profile is built in ONE language — the one chosen', () => {
  // 🔒 MEASURED 23/09/2026 ON `ja_kinetic`: the panel offered 53 languages as if the site could carry
  // them all, while the contract has no `multilingual-map.json` and every row is `*` — one edition.
  // The first fix hid the question and kept en-GB only, which made Vietnamese impossible. Now the
  // build makes the chosen language the site's only one (Tracy Cowork `siteLanguage.set`), so the
  // question comes back — asking for exactly one, from the whole catalog.
  const snap = readCapabilities({
    release: release('quickstart/ja-kinetic/j6', 'joomla', '1.0.0'),
    standardDoc: standard.joomla,
    contracts: CONTRACTS
  })
  assert.ok(!snap.sources.some((s) => s.kind === 'contract-multilingual'))
  const languages = snap.consumers.find((c) => c.id === 'site.languages')
  assert.equal(languages.available, true)
  assert.match(languages.why, /one language/)
  const tags = snap.capabilities.filter((c) => c.kind === 'language').map((c) => c.key)
  assert.ok(
    tags.includes('language:vi-vn') && tags.includes('language:en-gb'),
    'the whole catalog is on offer'
  )
  assert.equal(snap.languagesMode, 'one')
  assert.equal(summarizeForModel(snap).languagesMode, 'one')
  // Business carries the profile, so it keeps both the consumer and the whole list.
  const biz = business()
  assert.equal(biz.consumers.find((c) => c.id === 'site.languages').available, true)
})

test('the hash is of the content: the same files hash the same, and readAt does not count', () => {
  const a = business()
  const b = readCapabilities({
    release: release('tracy-business/j6', 'joomla', '1.1.0', { template: 'tracy_business' }),
    standardDoc: standard.joomla,
    contracts: CONTRACTS,
    readAt: '2027-01-01T00:00:00.000Z'
  })
  assert.equal(a.hash, b.hash)
  assert.match(a.hash, /^[0-9a-f]{64}$/)
  // A different archive is a different snapshot, even under the same tag and version.
  const c = readCapabilities({
    release: release('tracy-business/j6', 'joomla', '1.1.0', { template: 'tracy_business' }),
    standardDoc: standard.joomla,
    contracts: CONTRACTS
  })
  c.release.parts.webroot = 'b'.repeat(64)
  assert.notEqual(
    readCapabilities({
      release: {
        ...release('tracy-business/j6', 'joomla', '1.1.0', { template: 'tracy_business' }),
        setting: {
          ...release('x', 'joomla', '1.1.0').setting,
          install: { webroot: { file: 'w', sha256: 'b'.repeat(64) } }
        }
      },
      standardDoc: standard.joomla,
      contracts: CONTRACTS
    }).hash,
    a.hash
  )
})

test('two Joomla quickstarts of different shape read differently — nothing is written for one template', () => {
  const apple = readCapabilities({
    release: release('tracy-apple/j6', 'joomla', '1.2.0', { template: 'tracy_apple' }),
    standardDoc: standard.joomla,
    contracts: CONTRACTS
  })
  const biz = business()
  assert.notEqual(apple.hash, biz.hash)
  assert.notEqual(apple.completeness.pages, biz.completeness.pages)
  assert.notEqual(apple.completeness.slots, biz.completeness.slots)
  const pagesA = new Set(apple.capabilities.filter((c) => c.kind === 'page').map((c) => c.key))
  const pagesB = new Set(biz.capabilities.filter((c) => c.kind === 'page').map((c) => c.key))
  assert.ok(
    [...pagesA].some((k) => !pagesB.has(k)),
    'apple has pages business does not'
  )
  assert.ok(
    [...pagesB].some((k) => !pagesA.has(k)),
    'business has pages apple does not'
  )
})

test('D11: the language list is the CMS standard set even when a released questionnaire lists others', () => {
  // A released tracy_site_question.json is no longer what a customer is asked (D11), so its
  // language list is no longer what the release is said to offer either.
  const releasedDoc = {
    schemaVersion: 'tracy-questions/v1',
    owner: 'tracy-business/j6',
    languages: ['en'],
    questions: [
      { id: 'name', kind: 'text', label: { en: 'Name' }, feeds: ['site.name'] },
      {
        id: 'languages',
        kind: 'languages',
        label: { en: 'Languages' },
        options: ['en-gb', 'xx-only-released'],
        feeds: ['site.languages']
      }
    ]
  }
  const snap = readCapabilities({
    release: release('tracy-business/j6', 'joomla', '1.1.0', { template: 'tracy_business' }),
    questionSets: [{ source: 'released', doc: releasedDoc }],
    standardDoc: standard.joomla,
    contracts: CONTRACTS,
    readAt: '2026-09-22T00:00:00.000Z'
  })
  const languages = snap.capabilities.filter((c) => c.kind === 'language')
  assert.deepEqual(
    languages.map((c) => c.label),
    standard.joomla.questions.find((q) => q.id === 'languages').options
  )
  assert.equal(snap.sources[languages[0].source].kind, 'standard-questions')
  assert.ok(!snap.sources.some((s) => s.kind === 'release-questions'), 'the released set is not read')
})

test('a Joomla release nothing seals reads as unsealed: core and languages only, the gap named', () => {
  const snap = readCapabilities({
    release: release('tracy-nowhere/j6', 'joomla', '9.9.9'),
    standardDoc: standard.joomla,
    contracts: CONTRACTS
  })
  assert.deepEqual([...new Set(snap.capabilities.map((c) => c.kind))].sort(), ['core', 'language'])
  assert.equal(snap.completeness.pages, null)
  assert.ok(snap.completeness.unresolved.some((u) => u.what === 'contract profile'))
  assert.equal(
    snap.consumers.find((c) => c.id === 'seed.pages').available,
    true,
    'unsealed: the seed stage may build pages'
  )
})

// 🔒 THIS TEST PINNED A DECISION THAT WAS OVERTURNED ON 23/09/2026, AND ITS OLD NAME IS THE
// EVIDENCE. It read "declares a few identity slots and says the rest is kept as-is" and held
// `slots.length < 20` — which was true, and was the whole problem: `planContractWrites` maps a
// slot to ONE customer answer, so a site with five answers could only ever change five things.
// Measured 22/09 on `site-cpdt5z`: 779 published pages and posts, 367 still naming the demo brand,
// zero carrying the customer's name, while the title (an option WITH an input) changed correctly.
//
// The contract now declares the pages too, and `plan-wordpress-contract.mjs` fills what no answer
// names from the customer's brief — the road Joomla has had all along. So the bound moves, and the
// thing worth holding is no longer "few": it is that the identity slots survived and the body came
// into reach, with the 41 Polylang editions still counted and only the chosen one ever planned.
test('WordPress: the content map declares the identity slots AND the pages a brief can fill', () => {
  const snap = readCapabilities({
    release: release('tracy-business/wp7', 'wordpress', '1.1.0', { template: 'wp-tracy-business' }),
    standardDoc: standard.wordpress,
    contracts: CONTRACTS
  })
  const slots = snap.capabilities.filter((c) => c.kind === 'slot')
  assert.ok(slots.length > 20, `the body must be in reach, not only the identity — slots: ${slots.length}`)
  // The identity slots are still the customer's own words, written exactly and never by a model.
  assert.ok(slots.some((s) => s.key === 'slot:site.name'))
  assert.ok(slots.some((s) => s.key === 'slot:site.tagline'))
  // And the pages: a slot addressed at a block inside a page, which is what was missing.
  assert.ok(
    slots.some((s) => s.key.startsWith('slot:home.')),
    `no page slot among ${slots.length}`
  )
  assert.equal(snap.completeness.pages, null)
  assert.ok(snap.completeness.unresolved.some((u) => u.what.includes('pages')))
  assert.equal(snap.consumers.find((c) => c.id === 'template').available, false)
  assert.ok(snap.capabilities.filter((c) => c.kind === 'language').length >= 40)
})

test('EmDash: the template’s personalize map, site model and artifact card are the declared sources', () => {
  const snap = readCapabilities({
    release: {
      tag: 'tracy-business/emdash-0.x',
      platform: 'emdash',
      setting: {
        schemaVersion: 'tracy-setting/v1',
        platform: 'emdash',
        version: '1.2.1',
        cms: '0.38.0',
        template: 'tracy-business',
        install: {
          source: { file: 's.tar.gz', sha256: 'c'.repeat(64) },
          state: { file: 'st.tar.gz', sha256: 'd'.repeat(64) }
        }
      }
    },
    standardDoc: standard.emdash,
    emdash: EMDASH
  })
  const kinds = new Set(snap.sources.map((s) => s.kind))
  for (const k of ['emdash-artifact', 'emdash-site-model', 'emdash-personalize']) assert.ok(kinds.has(k), k)
  assert.ok(
    snap.capabilities.some((c) => c.kind === 'field'),
    'personalize fields'
  )
  assert.ok(
    snap.capabilities.some((c) => c.kind === 'block'),
    'repeatable blocks'
  )
  assert.ok(
    snap.capabilities.some((c) => c.kind === 'form'),
    'a form'
  )
  assert.ok(
    snap.capabilities.some((c) => c.kind === 'fact' && c.can.length === 0),
    'a claim, never written'
  )
  assert.ok(
    snap.capabilities.some((c) => c.kind === 'page'),
    'pages from the site model'
  )
  assert.ok(snap.capabilities.some((c) => c.key === 'feature:forms'))
  // Languages here come from the artifact card, not the CMS set: the forty the template ships.
  const languages = snap.capabilities.filter((c) => c.kind === 'language')
  const card = JSON.parse(
    readFileSync(
      new URL('../../../packages/cms/tracy-emdash-theme-business/artifact.json', import.meta.url),
      'utf8'
    )
  )
  assert.deepEqual(
    languages.map((c) => c.label),
    card.locales.all
  )
  assert.equal(languages.length, 40)
  assert.equal(snap.consumers.find((c) => c.id === 'template').available, true)
  assert.equal(snap.consumers.find((c) => c.id === 'copy.about').available, false)
  // Since ADR 0022 the card no longer says `contentOnly` (the older template's key): nothing on the
  // site is locked, so the snapshot carries no seal and no such feature.
  assert.equal(snap.sealed, undefined)
  assert.ok(!snap.capabilities.some((c) => c.key === 'feature:content-only'))
})

test('EmDash: a release whose card does not say contentOnly is not sealed, and its snapshot carries no seal', () => {
  const snap = readCapabilities({
    release: {
      tag: 'tracy-base/emdash-0.x',
      platform: 'emdash',
      setting: {
        schemaVersion: 'tracy-setting/v1',
        platform: 'emdash',
        version: '0.2.0',
        template: 'tracy-base',
        install: {}
      }
    },
    standardDoc: standard.emdash,
    emdash: EMDASH
  })
  assert.equal(snap.sealed, undefined)
})

test('EmDash: a packed release with only a fleet-side map is read from that map, and says what it lacks', () => {
  const snap = readCapabilities({
    release: {
      tag: 'tracy-saas/emdash-0.x',
      platform: 'emdash',
      setting: {
        schemaVersion: 'tracy-setting/v1',
        platform: 'emdash',
        version: '0.1.0',
        template: 'tracy-saas',
        install: {}
      }
    },
    standardDoc: standard.emdash,
    emdash: EMDASH
  })
  assert.ok(snap.sources.some((s) => s.kind === 'emdash-personalize'))
  assert.ok(!snap.sources.some((s) => s.kind === 'emdash-artifact'))
  assert.ok(snap.completeness.unresolved.some((u) => u.what.includes('artifact')))
  assert.equal(snap.consumers.find((c) => c.id === 'template').available, true)
})

test('an EmDash template this server has no metadata for is unresolved, not invented', () => {
  const snap = readCapabilities({
    release: {
      tag: 'x/emdash-0.x',
      platform: 'emdash',
      setting: {
        schemaVersion: 'tracy-setting/v1',
        platform: 'emdash',
        version: '1.0.0',
        template: 'nowhere',
        install: {}
      }
    },
    standardDoc: standard.emdash,
    emdash: EMDASH
  })
  assert.ok(!snap.capabilities.some((c) => c.kind === 'field'))
  assert.ok(snap.completeness.unresolved.some((u) => u.what === 'template metadata'))
  assert.equal(snap.consumers.find((c) => c.id === 'template').available, false)
})

test('roles come from a rule on the label, or stay unknown', () => {
  assert.deepEqual(roleOf('[Tracy Business] Home - Hero (en)'), { role: 'hero', by: 'rule' })
  assert.deepEqual(roleOf('[Tracy Business] Pricing table'), { role: 'pricing', by: 'rule' })
  assert.deepEqual(roleOf('module-999'), { role: null, by: 'unknown' })
  assert.deepEqual(roleOf(undefined), { role: null, by: 'unknown' })
})

test('the model’s view is small, keeps the unknowns, and every key in it is a key of the snapshot', () => {
  const snap = business()
  const view = summarizeForModel(snap, { maxBlocks: 30 })
  const keys = capabilityKeys(snap)
  assert.equal(view.blocks.length, 30)
  assert.ok(view.blocksNotShown > 0)
  for (const b of view.blocks) assert.ok(keys.has(b.key), b.key)
  for (const p of view.pages) assert.ok(keys.has(p.key), p.key)
  assert.ok(view.unresolved.length > 0)
  assert.ok(view.consumersUnavailable.some((c) => c.id === 'seed.pages'))
  assert.ok(JSON.stringify(view).length < 60_000, `view bytes: ${JSON.stringify(view).length}`)
})
