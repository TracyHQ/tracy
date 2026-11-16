/**
 * The plan card says what the plan gives by a stable code in the card's own words (#609, `src/client/plan-codes.ts`):
 * the pictures estimate, the sources of the owner's photos (`fromKinds`), the logo's source and assumptions, a fact's
 * display form and opening hours, and a section by its `labelCode`. A code it does not know keeps the plan's text. The
 * last test pins each English sentence of the table to the sentence the plan step writes for the same code, so the two
 * cannot drift. Every business here is invented.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/plan-codes.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { STAGES, stageDocuments } from '../../../core/tracy-core/test/fixtures/build-chat/stages.mjs'
import { LOGO_SOURCE_NAMES } from '../../../wo/website-opportunities/domain/brand-before-site.mjs'
import { drawnLogoSaid } from '../../../wo/website-opportunities/domain/brand-logo-drawn.mjs'
import { SECTION_LABELS } from '../../../wo/website-opportunities/domain/plan-gate-fixes.mjs'
import { hoursDisplayOf } from '../../../wo/website-opportunities/domain/plan-hours-display.mjs'
import {
  galleryRoomReason,
  NEUTRAL_LEFT_OUT,
  NOTHING_TO_SHOW_REASON
} from '../../../wo/website-opportunities/domain/plan-left-out-plain.mjs'
import { DERIVED_LEFT_OUT_REASONS } from '../../../wo/website-opportunities/domain/plan-left-out-wording.mjs'
import { generatedOf } from '../../../wo/website-opportunities/domain/plan-look-pictures.mjs'
import { WITHHELD_REASON } from '../../../wo/website-opportunities/domain/plan-withheld.mjs'
import { bundleClient, translatorOf, viTablePath } from './bundle-client.mjs'

const viTable = JSON.parse(readFileSync(viTablePath, 'utf8'))
let lib
let done
before(async () => {
  ;({ lib, done } = await bundleClient(`
    import { createElement } from 'react'
    import { renderToStaticMarkup } from 'react-dom/server'
    import { PlanCard } from './PlanCard'
    export { english, en } from './strings'
    export * from './plan-codes'
    export const card = (props) => renderToStaticMarkup(createElement(PlanCard, props))`))
})
after(() => done?.())
const vi = (key, vars) => translatorOf(viTable, lib.en)(key, vars)
const plan = () => stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan
const draw = (props) =>
  lib.card({ t: lib.english, onEdit: async () => ({}), onUndo: async () => ({}), ...props })
const HOURS = 'Mo-Fr 06:00-21:00; Sa 08:00-16:00'
/** A weekday's name as `Intl` says it, 1 January 2024 being a Monday. */
const dayIn = (locale, at) =>
  new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, 1 + at))
  )

test('the pictures estimate is said by its count; a plan without the code keeps its sentence', () => {
  for (const n of [1, 4]) {
    const generated = generatedOf(n)
    const key = n === 1 ? 'plan.pictures.estimate.one' : 'plan.pictures.estimate.other'
    assert.equal(lib.picturesEstimateOf(vi, generated, generated.reason), vi(key, { count: n }))
    assert.notEqual(lib.picturesEstimateOf(vi, generated, generated.reason), generated.reason)
  }
  const stated = 'Two spots have no fitting photo.'
  assert.equal(lib.picturesEstimateOf(vi, { frames: 2 }, stated), stated)
  assert.equal(
    lib.picturesEstimateOf(vi, { code: 'pictures_generated_estimate', params: {} }, stated),
    stated
  )
})

test('the sources of the owner photos are said by their kinds, only when there is one kind per name', () => {
  const p = plan()
  p.pictures.own = { frames: 5, from: ['Website', 'Google Maps listing'], fromKinds: ['website', 'google'] }
  const html = draw({ plan: p, t: vi })
  for (const key of ['plan.source.website', 'plan.source.google']) assert.ok(html.includes(viTable[key]), key)
  assert.ok(!html.includes('Google Maps listing'))
  p.pictures.own.fromKinds = ['website']
  assert.ok(
    draw({ plan: p, t: vi }).includes('Google Maps listing'),
    'kinds that do not match keep the names'
  )
})

test('an own logo names its source by kind, and the logo assumptions are said by their code', () => {
  const p = plan()
  p.look.logo = { kind: 'own', source: 'Instagram profile', code: 'logo_source_own', sourceKind: 'instagram' }
  assert.ok(draw({ plan: p, t: vi }).includes(viTable['plan.logoSource.instagram']))
  assert.equal(
    lib.logoSourceOf(vi, { code: 'logo_source_own', sourceKind: 'myspace' }, 'Old page'),
    'Old page'
  )
  assert.equal(lib.logoSourceOf(vi, { sourceKind: 'instagram' }, 'Instagram profile'), 'Instagram profile')
  for (const reason of ['new-symbol-drawn', 'symbol-cut-from-logo', 'name-set-in-template-font'])
    assert.equal(
      lib.assumptionOf(vi, { code: 'logo_drawn', params: { reason } }, 'x'),
      viTable[`plan.assumption.logo_drawn.${reason}`]
    )
  for (const found of [true, false])
    for (const mark of ['icon', 'lettermark', 'mark'])
      assert.equal(
        lib.assumptionOf(vi, { code: 'logo_made', params: { found, mark } }, 'x'),
        viTable[`plan.assumption.logo_made.${found ? 'found' : 'none'}.${mark}`]
      )
  assert.equal(
    lib.assumptionOf(vi, { code: 'logo_made', params: { found: 'yes', mark: 'icon' } }, 'kept'),
    'kept'
  )
})

test('a fact shows its display form, and opening hours say the day names in the interface language', () => {
  const shown = hoursDisplayOf(HOURS)
  const fact = { value: HOURS, ...shown }
  const said = lib.factShownOf(vi, fact, 'vi')
  for (const at of [0, 4, 5]) assert.ok(said.includes(dayIn('vi', at)), dayIn('vi', at))
  assert.equal(lib.factShownOf(vi, { value: HOURS, display: 'Weekdays only' }, 'vi'), 'Weekdays only')
  assert.equal(lib.factShownOf(vi, { value: HOURS }, 'vi'), HOURS)
  // On the card: the hours fact reads its days in Vietnamese, never the machine form.
  const p = plan()
  // The disputed hours of the invented plan would show both values to pick from: settle them first.
  p.assumptions = p.assumptions.filter((a) => a.field !== 'facts[hours].value')
  Object.assign(
    p.facts.find((f) => f.id === 'hours'),
    { value: HOURS, ...shown }
  )
  const html = draw({ plan: p, t: vi, locale: 'vi' })
  assert.ok(html.includes(said), said)
  assert.ok(!html.includes(`>${HOURS}<`))
})

test('a section is named by its labelCode in another language; English and an unknown code keep the label', () => {
  const p = plan()
  p.pages[0].blocks[0].labelCode = 'hero'
  assert.ok(draw({ plan: p, t: vi }).includes(viTable['plan.section.hero']))
  assert.ok(draw({ plan: p }).includes('Top banner'))
  assert.equal(lib.sectionLabelOf(vi, 'not_a_section', 'Top banner'), 'Top banner')
  assert.equal(lib.sectionLabelOf(lib.english, 'hero', 'Top banner'), 'Top banner')
})

test('every English sentence of the table is the sentence the plan step writes for the same code', () => {
  const en = lib.english
  for (const [code, reason] of Object.entries(DERIVED_LEFT_OUT_REASONS))
    assert.equal(lib.leftOutReasonOf(en, { code }, 'x'), reason, code)
  for (const [kind, reason] of Object.entries(NEUTRAL_LEFT_OUT))
    assert.equal(lib.leftOutReasonOf(en, { code: 'left_out_neutral', kind }, 'x'), reason, kind)
  for (const n of [1, 3])
    assert.equal(
      lib.leftOutReasonOf(en, { code: 'no_gallery_room', params: { count: n } }, 'x'),
      galleryRoomReason(n)
    )
  assert.equal(lib.leftOutReasonOf(en, { code: 'owner_withheld' }, 'x'), WITHHELD_REASON)
  assert.equal(lib.leftOutReasonOf(en, { code: 'no_items_to_show' }, 'x'), NOTHING_TO_SHOW_REASON)
  for (const n of [1, 4]) assert.equal(lib.picturesEstimateOf(en, generatedOf(n), 'x'), generatedOf(n).reason)
  for (const [kind, name] of Object.entries(LOGO_SOURCE_NAMES))
    assert.equal(lib.logoSourceOf(en, { code: 'logo_source_own', sourceKind: kind }, 'x'), name, kind)
  for (const reason of ['new-symbol-drawn', 'symbol-cut-from-logo', 'name-set-in-template-font'])
    assert.equal(lib.assumptionOf(en, { code: 'logo_drawn', params: { reason } }, 'x'), drawnLogoSaid(reason))
  for (const [code, label] of Object.entries(SECTION_LABELS))
    assert.equal(lib.sectionNameOf(en, code), label, code)
  assert.equal(lib.sectionNameOf(en, 'page_header'), 'Page header')
  const shown = hoursDisplayOf(HOURS)
  assert.equal(lib.openingHoursOf(en, shown.params, 'en'), shown.display)
})
