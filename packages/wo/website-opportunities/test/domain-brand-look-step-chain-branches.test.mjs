// The brand step's look record follows the step chain's own branches (#575, governing rule of spec #575): where the
// step chain's Write step carries on with a brand file, the plan card is composed from it too, never stopped. The step
// chain writes the brand file's `colours.accent` when the step kept the template's accent, whatever the logo's colours
// say (`write-step/brand-stage.js`), and it writes a brand file whose safe version made no mark (a held name). The
// card also says what the build chat will really build: a temporary logo the step made is not written by the build
// chat yet, so the site prints the business name as text, and the card says exactly that. Invented brands and kits.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-brand-look-step-chain-branches.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { brandLookOf, lookOfBrandRecord } from '../domain/brand-before-site.mjs'
import { lookProblemsOf } from '../domain/brand-look-problems.mjs'
import {
  inkwellBindery,
  lemonGroveCider,
  lightAndDarkKit,
  quaysidePianoCare
} from './fixtures/plan-composer/invented-brands.mjs'
import { template } from './fixtures/plan-composer/invented-club.mjs'

const TEMPLATE_ACCENT = template().accent
const kit = lightAndDarkKit()
const lookOf = (input, extra = {}) => lookOfBrandRecord(template(), brandLookOf({ ...input, kit, ...extra }))
const problemsOf = ({ look, assumptions, sources }) =>
  lookProblemsOf({ plan: { look, assumptions }, template: template(), lookSources: sources })

test('a logo whose colours were never measured keeps the accent the step kept, said so, and the plan is composed', () => {
  const unmeasured = lemonGroveCider()
  delete unmeasured.brief.brand.colorsFrom
  const record = brandLookOf({ ...unmeasured, kit })
  assert.equal(record.accent.hex, TEMPLATE_ACCENT, 'the accent the step kept, as the step chain writes it')
  assert.equal(record.accent.from, 'logo-colours-unmeasured')
  const look = lookOfBrandRecord(template(), record)
  assert.equal(look.look.accent, TEMPLATE_ACCENT)
  assert.equal(look.sources.accent.from, 'logo-colours-unmeasured')
  const said = look.assumptions.find((a) => a.field === 'look.accent').said
  assert.match(said, /colours of your logo could not be read/)
  assert.deepEqual(problemsOf(look), [])
})

test('black and white that read on no ground of the template: the accent the step kept, never a stop', () => {
  // A light theme whose ground is too dark for black: the no hue rule has no accent that reads.
  const record = brandLookOf({ ...inkwellBindery(), kit: lightAndDarkKit({ lightGround: '#3a3a3a' }) })
  assert.equal(record.accent.hex, TEMPLATE_ACCENT)
  assert.equal(record.accent.from, 'template-accent-kept')
  assert.match(record.accent.why, /reads/)
  const look = lookOfBrandRecord(template(), record)
  assert.equal(look.look.accent, TEMPLATE_ACCENT)
  assert.match(look.assumptions.find((a) => a.field === 'look.accent').said, /design's main colour/)
  assert.deepEqual(problemsOf(look), [])
})

test('a safe version that made no mark (the name held back) is read as a made logo, never a stop', () => {
  const held = quaysidePianoCare()
  held.brandFile.logo = { material: null, mark: null, name: null, logos: {}, spots: [] }
  held.brandFile.safeVersion = { reason: 'gate' }
  const record = brandLookOf({ ...held, kit })
  assert.equal(record.logo.kind, 'made')
  assert.equal(record.logo.mediaId, null)
  const look = lookOfBrandRecord(template(), record)
  assert.deepEqual(look.look.logo, { kind: 'text' })
  assert.deepEqual(problemsOf(look), [])
})

test('a made logo: the card says the name is shown as text, as the build chat writes it, never an image it made', () => {
  for (const [input, found] of [
    [quaysidePianoCare(), false],
    [{ ...inkwellBindery(), brandFile: { ...inkwellBindery().brandFile, logo: lettermark() } }, true]
  ]) {
    const look = lookOf(input)
    assert.deepEqual(look.look.logo, { kind: 'text' })
    const line = look.assumptions.find((a) => a.field === 'look.logo')
    assert.match(line.said, /your business name is shown as text/)
    assert.doesNotMatch(line.said, /made a temporary|initials|icon|symbol|beside your business name/)
    assert.ok(line.said.length <= 200, line.said)
    // A code the plan card has no translation for yet: the card shows this English sentence, never the old wording.
    assert.equal(line.code, 'logo_name_as_text')
    assert.deepEqual(line.params, { found })
  }
})

/** A brand file logo the step made for a found logo it could not use: a lettermark, no material. */
function lettermark() {
  return { material: null, mark: { decision: 'lettermark' } }
}
