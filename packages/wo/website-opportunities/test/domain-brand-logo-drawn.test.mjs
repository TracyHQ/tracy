// A logo the brand step hands over is never the business's own file: the locked step always builds the site's logo
// as a mark (cut out of the found logo, an icon an image model drew, or a lettermark) beside the business name set in
// the template's heading font by code, and no brand tool writes the found logo file as a logo. So the look record
// never says `own` for it and nothing downstream labels it "Your logo, from <source>": it is a logo Tracy drew, based
// on the business's logo, with the reason recorded. Invented businesses only; no model is called.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { LOGO_DRAWN, brandLookOf, lookOfBrandRecord } from '../domain/brand-before-site.mjs'
import { lookProblemsOf } from '../domain/brand-look-problems.mjs'
import { drawnLogoSaid } from '../domain/brand-logo-drawn.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import {
  fernAndFoxglove,
  harrowLaneBakery,
  inkwellBindery,
  lightAndDarkKit
} from './fixtures/plan-composer/invented-brands.mjs'
import {
  blockStore,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const DRAWN_NAME = 'A logo Tracy drew, based on your logo'
const look = (record) => lookOfBrandRecord(template(), record)
const logoSaid = (record) =>
  look(record)
    .assumptions.filter((a) => a.field === 'look.logo')
    .map((a) => a.said)

test('a words only logo with an icon the step drew is a drawn logo, never own', () => {
  const record = brandLookOf(fernAndFoxglove())
  assert.deepEqual(record.logo, {
    kind: 'drawn',
    reason: 'new-symbol-drawn',
    from: 'instagram',
    source: 'Instagram profile',
    mediaId: 'logo-ff',
    mark: 'icon'
  })
  const { look: planLook, sources } = look(record)
  assert.deepEqual(planLook.logo, {
    kind: 'own',
    source: 'Tracy, based on the logo on your Instagram profile',
    code: 'logo_source_drawn',
    sourceKind: 'instagram'
  })
  assert.deepEqual(sources.logo, { from: LOGO_DRAWN, name: DRAWN_NAME, reason: 'new-symbol-drawn' })
  assert.deepEqual(logoSaid(record), [
    "Tracy drew a logo based on your logo: a new symbol of your trade beside your business name, set in the template's font. It is not your logo file. Approve it, or send us your logo to replace it."
  ])
})

test('a cut mark beside the name set by code is a drawn logo too, with its own reason', () => {
  const record = brandLookOf(harrowLaneBakery())
  assert.equal(record.logo.kind, 'drawn')
  assert.equal(record.logo.reason, 'symbol-cut-from-logo')
  const { look: planLook, sources } = look(record)
  assert.equal(planLook.logo.source, 'Tracy, based on the logo on your website')
  assert.equal(sources.logo.name, DRAWN_NAME)
  assert.match(
    logoSaid(record)[0],
    /^Tracy drew a logo based on your logo: the symbol cut from your logo beside/
  )
})

test('nothing the brand file says makes a logo own: owner tasks, a kind or an origin written in the file are ignored', () => {
  for (const make of [fernAndFoxglove, harrowLaneBakery, inkwellBindery]) {
    const input = make()
    input.brandFile.logo.kind = 'own'
    input.brandFile.logo.origin = 'own'
    input.brandFile.ownerTasks = []
    assert.equal(brandLookOf({ ...input, kit: lightAndDarkKit() }).logo.kind, 'drawn', make.name)
  }
})

test('a stored record of an earlier version that says own is read and labelled as a drawn logo', () => {
  const stored = brandLookOf(fernAndFoxglove())
  stored.logo = {
    kind: 'own',
    from: 'instagram',
    source: 'Instagram profile',
    mediaId: 'logo-ff',
    mark: 'icon'
  }
  const { look: planLook, sources } = look(stored)
  assert.equal(sources.logo.from, LOGO_DRAWN)
  assert.equal(sources.logo.name, DRAWN_NAME)
  assert.notEqual(planLook.logo.source, 'Instagram profile')
  assert.match(logoSaid(stored)[0], /^Tracy drew a logo based on your logo/)
})

test('no label of a drawn logo calls it the business own logo', () => {
  for (const make of [fernAndFoxglove, harrowLaneBakery]) {
    const { look: planLook, sources, assumptions } = look(brandLookOf(make()))
    assert.doesNotMatch(sources.logo.name, /^Your logo/)
    assert.doesNotMatch(planLook.logo.source, /^(Website|Instagram profile)$/)
    for (const a of assumptions) assert.doesNotMatch(a.said, /[\u2013\u2014]/)
  }
  for (const reason of ['new-symbol-drawn', 'symbol-cut-from-logo', 'name-set-in-template-font', 'unknown'])
    assert.ok(drawnLogoSaid(reason).length <= 200, `Contract B said limit: ${reason}`)
})

test('a plan with a drawn logo passes the contract and the look rules, and keeps the drawn file as an image logo', async () => {
  const record = brandLookOf(fernAndFoxglove())
  const { plan, lookSources } = await composePlan({
    profile: clubProfile(),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: record,
    model: scriptedModel(JSON.stringify(goodComposition()))
  })
  assert.equal(
    plan.look.logo.kind,
    'own',
    'Contract B: an image logo, so the write step still places the file'
  )
  assert.equal(lookSources.logo.from, LOGO_DRAWN)
  assert.equal(checkBuildDocument(plan).ok, true)
  assert.deepEqual(lookProblemsOf({ plan, template: template(), lookSources }), [])
  assert.ok(plan.assumptions.some((a) => a.field === 'look.logo' && a.said.startsWith('Tracy drew a logo')))
})
