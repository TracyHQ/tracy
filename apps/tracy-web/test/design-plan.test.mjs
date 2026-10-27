/**
 * The resolver that decides which design a new Joomla site is actually built with.
 *
 * No database and no server: this is the one decision in the whole path, and it is a pure function
 * of the registry plus the id a customer picked. Everything downstream — the notice above the
 * button, the flag that reaches `provision.sh`, the profile the Claude Cowork plugin binds — is that answer
 * carried, so a test that only exercised the HTTP door would be testing the carrying.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  loadDesignRegistry,
  oneLanguageDesign,
  resolveDesignPlan,
  validateDesignRegistry
} from '../src/sites/design-plan.js'

/** A registry with the same shape as the shipped one, small enough to read in one screen. */
function registry(overrides = {}) {
  return {
    schemaVersion: 'tracy-design-templates/v1',
    version: '1.0.0',
    platform: 'joomla',
    defaultDesign: 'apple',
    library: { source: 'vendor/catalog.json', count: 3, ids: ['airbnb', 'apple', 'stripe'] },
    designs: {
      apple: {
        state: 'served',
        name: 'Apple',
        base: { quickstart: 'tracy-apple/j6', version: '1.1.0' },
        template: { element: 'tracy', version: '1.1.0', source: 'bundled' },
        contractProfile: 'tracy-apple/j6/1.1.0',
        contractFiles: {},
        coworkMinVersion: '0.14.0'
      },
      airbnb: {
        state: 'served',
        name: 'Airbnb',
        base: { quickstart: 'tracy-apple/j6', version: '1.1.0' },
        template: { element: 'tracy_airbnb', version: '1.0.0', source: 'artifact' },
        artifact: {
          file: 'tpl.zip',
          kind: 'joomla-extension',
          bytes: 10,
          sha256: 'a'.repeat(64),
          url: 'https://example.test/tpl.zip'
        },
        activation: {
          id: 'tracy-airbnb/j6/1.0.0',
          fromTemplate: 'tracy',
          styles: [{ sourceStyleId: 110, title: 'Home', params: {} }]
        },
        contractProfile: 'tracy-airbnb/j6/1.0.0',
        contractFiles: {},
        coworkMinVersion: '0.15.0'
      }
    },
    ...overrides
  }
}

const loaded = (r = registry()) => ({ registry: validateDesignRegistry(r), revision: 'r'.repeat(64) })

test('a served design is built with its own template', () => {
  const plan = resolveDesignPlan(loaded(), 'airbnb')
  assert.equal(plan.effectiveDesign, 'airbnb')
  assert.equal(plan.effectiveDesignName, 'Airbnb')
  // The design the site will wear, in the shape the site folder records (Lee, 29/09/2026).
  assert.deepEqual(plan.design, { id: 'airbnb', source: 'catalog' })
  assert.equal(plan.template.element, 'tracy_airbnb')
  assert.equal(plan.contractProfile, 'tracy-airbnb/j6/1.0.0')
  assert.equal(plan.fallback, false)
  assert.equal(plan.fallbackReason, undefined)
  // Every design comes off one base archive — that is the whole point of the change.
  assert.equal(plan.baseQuickstart, resolveDesignPlan(loaded(), 'apple').baseQuickstart)
})

test('a design in the library that nothing serves falls back, and says so', () => {
  const plan = resolveDesignPlan(loaded(), 'stripe')
  assert.equal(plan.requestedDesign, 'stripe')
  assert.equal(plan.effectiveDesign, 'apple')
  assert.equal(plan.effectiveDesignName, 'Apple')
  assert.deepEqual(
    plan.design,
    { id: 'apple', source: 'catalog' },
    'a fallback wears the design it falls back TO'
  )
  assert.equal(plan.template.element, 'tracy')
  assert.equal(plan.fallback, true)
  assert.equal(plan.fallbackReason, 'template_unavailable')
  // The ask survives the fallback: the agent must never claim it installed what was picked.
  assert.equal(plan.requestedDesign, 'stripe')
})

test('a design being finished falls back with its own reason, not a generic one', () => {
  const r = registry()
  r.designs.airbnb.state = 'pending'
  r.designs.airbnb.reason = 'profile_not_published'
  const plan = resolveDesignPlan(loaded(r), 'airbnb')
  assert.equal(plan.effectiveDesign, 'apple')
  assert.equal(plan.fallbackReason, 'profile_not_published')
})

test('an id outside the library is refused rather than turned into the default', () => {
  // The difference this test protects: a fallback that accepts anything is an open door with a
  // friendly notice on it. Only ids the library really carries may become a site.
  for (const bad of ['nope', '../etc', '', 'Apple', 'apple/j6', null, 42, {}])
    assert.equal(resolveDesignPlan(loaded(), bad), null, `expected ${JSON.stringify(bad)} to be refused`)
})

test('the revision travels with every plan, so the two halves can notice they disagree', () => {
  const l = loaded()
  assert.equal(resolveDesignPlan(l, 'apple').registryRevision, l.revision)
  assert.equal(resolveDesignPlan(l, 'stripe').registryRevision, l.revision)
})

test('a registry that cannot produce a plan is refused at load, not at the first customer', () => {
  const cases = [
    ['schemaVersion', (r) => (r.schemaVersion = 'other/v9')],
    ['a design outside the library', (r) => (r.designs.ghost = r.designs.apple)],
    ['a pending design with no reason', (r) => (r.designs.airbnb.state = 'pending')],
    ['a design with no display name', (r) => delete r.designs.apple.name],
    ['a package with no activation recipe', (r) => delete r.designs.airbnb.activation],
    [
      'a recipe that rewrites some other template',
      (r) => (r.designs.airbnb.activation.fromTemplate = 'cassiopeia')
    ],
    ['a package with no checksum', (r) => (r.designs.airbnb.artifact.sha256 = 'short')],
    [
      'a package fetched over plain http',
      (r) => (r.designs.airbnb.artifact.url = 'http://example.test/x.zip')
    ],
    [
      'a bundled design that downloads something',
      (r) => (r.designs.apple.artifact = r.designs.airbnb.artifact)
    ],
    [
      'a default design that is not served',
      (r) => ((r.designs.apple.state = 'pending'), (r.designs.apple.reason = 'x'))
    ],
    ['a default design that needs a download', (r) => (r.designs.apple.template.source = 'artifact')],
    ['a library count that disagrees with its own list', (r) => (r.library.count = 99)]
  ]
  for (const [label, breakIt] of cases) {
    const r = registry()
    breakIt(r)
    assert.throws(() => validateDesignRegistry(r), `expected ${label} to be refused`)
  }
})

test('the registry this process actually ships resolves the designs it claims to serve', () => {
  // Not a fixture: the file `apps/tracy-web/Dockerfile` copies and `check-design-templates.ts`
  // keeps equal to the fleet's own copy. A schema this file accepts but the shipped registry fails
  // is the failure nothing else here would see.
  const l = loadDesignRegistry()
  for (const [id, design] of Object.entries(l.registry.designs)) {
    const plan = resolveDesignPlan(l, id)
    assert.equal(plan.fallback, design.state !== 'served', `${id} resolved against its own state`)
    if (design.state === 'served') assert.equal(plan.effectiveDesign, id)
  }
  assert.equal(resolveDesignPlan(l, l.registry.defaultDesign).fallback, false)
})

test('the revision is the file, so an edit of any size moves it', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-registry-'))
  try {
    const file = path.join(dir, 'design-templates.json')
    writeFileSync(file, `${JSON.stringify(registry(), null, 2)}\n`)
    const first = loadDesignRegistry(file).revision
    const edited = registry()
    edited.designs.airbnb.state = 'pending'
    edited.designs.airbnb.reason = 'profile_not_published'
    writeFileSync(file, `${JSON.stringify(edited, null, 2)}\n`)
    assert.notEqual(loadDesignRegistry(file).revision, first)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a design with no second edition says so on EVERY road a plan takes, the template card included', () => {
  // Measured 23/09/2026 on the local stand: ja-kinetic is served as a template card, so the plan the
  // Build form carried was the card's hand-made one — `workflow: 'template'`, no `multilingual` — and
  // the one-language build never happened. The registry is asked by id, whichever road built the plan.
  const loaded = loadDesignRegistry()
  assert.equal(oneLanguageDesign(loaded.registry, 'ja-kinetic'), true)
  assert.equal(oneLanguageDesign(loaded.registry, 'apple'), false)
  assert.equal(oneLanguageDesign(loaded.registry, 'tracy-business'), false, 'not a registry design at all')
  assert.equal(oneLanguageDesign(loaded.registry, 'no-such-design'), false)
})
