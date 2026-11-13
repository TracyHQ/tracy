// The sentences of the plan about the logo and the colours stay true when the brand step ran out of review rounds
// and wrote its safe version (ticket #616). The safe version writes `material: null` and a lettermark even for a
// business whose logo the research found: "No logo was found" is said only when research found none. Invented data.
import assert from 'node:assert/strict'
import test from 'node:test'
import { brandLookOf, lookOfBrandRecord } from '../domain/brand-before-site.mjs'
import { lookProblemsOf } from '../domain/brand-look-problems.mjs'
import {
  fernAndFoxglove,
  harrowLaneBakery,
  inkwellBindery,
  lemonGroveCider,
  lightAndDarkKit,
  quaysidePianoCare,
  saltmarshKayaks
} from './fixtures/plan-composer/invented-brands.mjs'
import { template } from './fixtures/plan-composer/invented-club.mjs'

const NOT_FOUND = /^No logo was found, so a temporary one was made/
const NOT_USED = /^Your logo could not be used as it is, so a temporary one was made/

/** The safe version of the brand step: no logo material, a lettermark, the owner task for a temporary logo. */
const safe = (input) => {
  const out = structuredClone(input)
  out.brandFile.logo = { material: null, mark: { decision: 'lettermark' } }
  out.brandFile.ownerTasks = [{ kind: 'replace-temporary-logo' }]
  out.brandFile.colours = {
    ...out.brandFile.colours,
    decision: 'kept-template',
    accent: '#225588',
    brandColour: null,
    lift: null
  }
  return out
}
const withoutLogo = (input) => {
  const out = structuredClone(input)
  out.brief.brand.logo = null
  delete out.brief.brand.logoResearch
  return out
}
const kit = lightAndDarkKit()
const said = (input, field, extra = {}) => {
  const { assumptions } = lookOfBrandRecord(template(), brandLookOf({ ...input, kit, ...extra }))
  return assumptions.filter((a) => a.field === field).map((a) => a.said)
}

test('a found logo and a safe version with no material: "could not be used", never "No logo was found"', () => {
  for (const input of [safe(inkwellBindery()), safe(fernAndFoxglove()), safe(saltmarshKayaks())]) {
    const record = brandLookOf({ ...input, kit })
    assert.equal(record.logo.kind, 'made')
    assert.ok(record.logo.mediaId)
    assert.notEqual(record.accent.from, 'template-accent-no-logo')
    const [line] = said(input, 'look.logo')
    assert.match(line, NOT_USED)
    assert.doesNotMatch(line, /No logo was found/)
  }
})

test('a safe version whose logo id is only in the stored brand logo still counts as found', () => {
  const input = safe(inkwellBindery())
  delete input.brief.brand.logoResearch
  assert.match(said(input, 'look.logo')[0], NOT_USED)
})

test('no logo in the research: "No logo was found" and the template accent, safe version or not', () => {
  for (const input of [quaysidePianoCare(), safe(withoutLogo(inkwellBindery()))]) {
    const record = brandLookOf({ ...input, kit })
    assert.equal(record.logo.mediaId, null)
    assert.equal(record.accent.from, 'template-accent-no-logo')
    assert.match(said(input, 'look.logo')[0], NOT_FOUND)
  }
})

test('a used logo keeps its own look: an own logo and no logo sentence', () => {
  const record = brandLookOf({ ...harrowLaneBakery(), kit })
  assert.equal(record.logo.kind, 'own')
  assert.deepEqual(said(harrowLaneBakery(), 'look.logo'), [])
})

test('a safe version of a black and white logo says its buttons follow the logo, never the template', () => {
  const input = safe(inkwellBindery())
  const look = lookOfBrandRecord(template(), brandLookOf({ ...input, kit }))
  assert.equal(look.look.accent, '#000000')
  assert.equal(look.sources.accent.from, 'logo-without-hue')
  assert.deepEqual(
    lookProblemsOf({
      plan: { look: look.look, assumptions: look.assumptions },
      template: template(),
      lookSources: look.sources
    }),
    []
  )
})

const STRICT = { minRatio: 19 }
/** Every sentence the plan can say about the logo and the colours: a record that makes it true, one that does not. */
const TABLE = [
  ['No logo was found (made logo)', 'look.logo', NOT_FOUND, quaysidePianoCare(), safe(inkwellBindery())],
  [
    'Your logo could not be used (made logo)',
    'look.logo',
    NOT_USED,
    safe(inkwellBindery()),
    quaysidePianoCare()
  ],
  [
    'Your logo has no colour (black and white)',
    'look.accent',
    /^Your logo has no colour/,
    inkwellBindery(),
    saltmarshKayaks()
  ],
  [
    'Your logo has no colour, from a safe version',
    'look.accent',
    /^Your logo has no colour/,
    safe(inkwellBindery()),
    quaysidePianoCare()
  ],
  [
    'The colour of your logo does not stay readable',
    'look.accent',
    /^The colour of your logo does not stay readable/,
    lemonGroveCider(),
    inkwellBindery(),
    STRICT
  ],
  [
    'Your plum was made lighter (the step lifted it)',
    'look.accent',
    /^Your plum was made lighter/,
    harrowLaneBakery(),
    fernAndFoxglove()
  ],
  [
    'Buttons and links use the colour of your logo, made darker or lighter',
    'look.accent',
    /^Buttons and links use the colour of your logo/,
    saltmarshKayaks(),
    inkwellBindery()
  ]
]
for (const [name, field, pattern, yes, no, extra] of TABLE) {
  test(`sentence table: ${name}`, () => {
    assert.ok(
      said(yes, field, extra).some((line) => pattern.test(line)),
      'true case says it'
    )
    assert.ok(!said(no, field, extra).some((line) => pattern.test(line)), 'false case does not say it')
  })
}

test('sentence table: the accent source name says "as you have no logo" only for a business with none', () => {
  const name = (input) => {
    const { sources } = lookOfBrandRecord(template(), brandLookOf({ ...input, kit }))
    return sources.accent.name
  }
  assert.equal(name(quaysidePianoCare()), 'The template, as you have no logo')
  for (const input of [safe(inkwellBindery()), safe(saltmarshKayaks()), safe(lemonGroveCider())])
    assert.doesNotMatch(name(input), /no logo/)
})
