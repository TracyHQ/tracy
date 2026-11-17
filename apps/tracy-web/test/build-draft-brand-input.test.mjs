// What the build chat's brand step hands the step chain's brand bench, by the step chain's own "if this is missing, then
// that" branches (#575), checked against the bench's own input checks (`brand-control.js` `startBrandRun` stages a logo
// file only for a brief that names its logo; `brand-logo.js` `ensureLogo` loads the brief's logo or stops the run;
// `brand-input.js` fills a missing voice from the site language; `brand-brief-shape.js` refuses a brief without one).
//   - a draft researched before #575 names its logo by a draft picture id: the logo file is written again from that
//     stored copy, and when the copy is gone the brief goes without a logo, as the step chain's research did for a
//     logo it could not store (no file and no logo in the brief), never a run the bench stops;
//   - a logo file beside a brief that names no logo is not passed (the bench refuses it: `BRAND_LOGO_NO_ID`);
//   - a draft whose sources showed no language runs in the plan's own language (English, `plan-composer.mjs`).
// Fakes only: a fake pool and object store for the bench pieces, a fake brand run. Invented data.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-brand-input.test.mjs
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { draftBrandStep, kitRefOf } from '../src/build-draft-wiring.js'
import { brandRunOf } from '../src/build-draft/engine-steps.js'
import { briefWithSiteLanguage } from '../src/brand-step/brand-input.js'
import { brandBriefProblems } from '../src/brand-step/brand-brief-shape.js'
import { ensureLogo, logoIdOf, stageLogo } from '../src/brand-step/brand-logo.js'
import { memoryRunFiles } from '../src/brand-step/run-files.js'

const LOGO = '5b0e8c1a-6f2d-4e7a-9c3b-1d2e3f4a5b6c'
const ACCOUNT = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const template = { slug: 'example-court', version: '1.0.0' }
const kits = [{ ref: 'example-court/j6/1.0.0' }]
const record = { schema: 'tracy-brand-look/v1' }
const png = await sharp({ create: { width: 48, height: 24, channels: 4, background: '#2a6f97' } })
  .png()
  .toBuffer()
const briefWithLogo = () => ({
  brand: {
    name: 'Larkfen Racquets',
    voice: 'English; friendly',
    logo: LOGO,
    logoResearch: { status: 'found', chosen: { mediaId: LOGO, source: 'website' } }
  }
})
/** A pool that knows no account or place media: a draft picture id is in neither table the bench reads. */
const emptyPool = { query: async () => ({ rows: [] }) }

/** What the bench does with the input the step hands it: stage a given logo file, then load the brief's logo. */
async function benchLoads({ brief, logoFile }) {
  const files = memoryRunFiles()
  if (logoFile) {
    assert.ok(logoIdOf(brief), 'a logo file goes only with a brief that names its logo')
    assert.ok(await stageLogo(files, logoIdOf(brief), readFileSync(logoFile)))
  }
  return ensureLogo({ pool: emptyPool, files, brief, objects: null })
}

function stepWith({ openPicture, logoDir }) {
  const calls = []
  const step = draftBrandStep({
    pool: null,
    stepsOf: () => assert.fail('the fake run needs no steps'),
    brandBeforeSite: async (input) => (calls.push(input), { record, records: [] }),
    kitRefOf: (t) => kitRefOf(t, kits),
    openPicture,
    logoDir
  })
  return { step, calls }
}

test('the logo file of a draft researched before #575 is gone: it is written again from its stored copy', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'draft-brand-'))
  const asked = []
  const { step, calls } = stepWith({
    openPicture: async (id, opts) => (asked.push([id, opts]), { id, mime: 'image/png', bytes: png }),
    logoDir: dir
  })
  const research = { brief: briefWithLogo(), logoFile: path.join(dir, 'gone.png') }
  await step({ research, template, accountId: ACCOUNT })
  assert.deepEqual(asked, [[LOGO, { accountId: ACCOUNT }]], 'the stored copy of this account only')
  const [given] = calls
  assert.ok(path.isAbsolute(given.logoFile) && existsSync(given.logoFile))
  assert.deepEqual(readFileSync(given.logoFile), png)
  assert.deepEqual(await benchLoads(given), { ok: true, source: null }, 'the bench finds the staged logo')
  rmSync(dir, { recursive: true, force: true })
})

test('the stored copy is gone too: the brief goes without its logo and the bench runs with no logo', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'draft-brand-'))
  const { step, calls } = stepWith({ openPicture: async () => null, logoDir: dir })
  await step({ research: { brief: briefWithLogo() }, template, accountId: ACCOUNT })
  const [given] = calls
  assert.equal(given.logoFile, undefined)
  assert.equal(given.brief.brand.logo, null)
  // What research found stays: the card says the logo could not be used, never that none was found.
  assert.equal(given.brief.brand.logoResearch.chosen.mediaId, LOGO)
  assert.deepEqual(await benchLoads(given), { ok: true, source: null })
  assert.deepEqual(brandBriefProblems(given.brief), [])
  rmSync(dir, { recursive: true, force: true })
})

test('as it was: the draft picture id the brief names stops the bench, which the step chain never does', async () => {
  const stopped = await benchLoads({ brief: briefWithLogo() })
  assert.equal(stopped.ok, false)
  assert.match(stopped.reason, /does not exist/)
})

test('a logo file beside a brief that names no logo is not passed; the bench would refuse the run', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'draft-brand-'))
  const { step, calls } = stepWith({ openPicture: async () => assert.fail('nothing to open'), logoDir: dir })
  const file = path.join(dir, 'logo.png')
  await sharp(png).toFile(file)
  const brief = { brand: { name: 'Larkfen Racquets', voice: 'English' } }
  await step({ research: { brief, logoFile: file }, template, accountId: ACCOUNT })
  assert.deepEqual(calls, [{ brief, kitRef: 'example-court/j6/1.0.0', siteLanguage: 'en' }])
  rmSync(dir, { recursive: true, force: true })
})

test('no source showed its language: the brand voice is filled with the plan language, never a refused run', async () => {
  const { step, calls } = stepWith({ openPicture: async () => null })
  const brief = { brand: { name: 'Larkfen Racquets' } }
  // As it was: no site language and no voice, so the bench refuses the brief before any model call.
  assert.notDeepEqual(brandBriefProblems(brief), [])
  await step({ research: { brief, ids: { revisionId: 'r-1' }, profile: {} }, template })
  await step({ research: { brief, profile: { language: { value: 'de' } } }, template })
  assert.deepEqual(
    calls.map((c) => c.siteLanguage),
    ['en', 'de']
  )
  assert.deepEqual(brandBriefProblems(briefWithSiteLanguage(brief, calls[0].siteLanguage).brief), [])
})

test('the engine hands the brand step the account it runs for', async () => {
  const seen = []
  await brandRunOf(
    { research: { brief: {} }, template, accountId: ACCOUNT },
    { brandStep: async (input) => (seen.push(input.accountId), record), kit: {} }
  )
  assert.deepEqual(seen, [ACCOUNT])
})
