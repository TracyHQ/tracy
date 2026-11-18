// Long values from the sources on the plan (#575): a booking link, a social link and a service description longer
// than a short fact must never stop the plan step. The step chain used a link as the sources gave it, whole
// (`brief.mjs` `primaryCta.href`, the place profile's link edits up to 2048 characters, `fact-value-kinds.mjs`), and
// kept one value where sources disagree on a detail, with a note that they differ (`priceNote`), never a pasted list.
// So a link is held to a link's limit (`facts[].url`), and a free text the plan cannot show whole is never offered as
// an alternative: the trust order's value stays, and no code cuts or rewrites it. Invented club, invented links.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-long-values.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { checkPlanEdit } from '../domain/build-contract-plan-edit.mjs'
import { TEXT_LIMITS } from '../domain/build-contract-shapes.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import {
  blockStore,
  brand,
  clubResearch,
  goodComposition,
  library,
  pageRecipes,
  template
} from './fixtures/plan-composer/invented-club.mjs'

/** An invented booking link of 266 characters, as booking providers write them with their tracking parameters. */
const LONG_BOOKING = `https://book.example/brindlewick/courts?utm_source=maps&utm_medium=listing&ref=${'k3'.repeat(93)}`
const LONG_SOCIAL = `https://social.example/profile.php?id=${'7'.repeat(30)}&ref=${'p'.repeat(180)}`
const LONG_DESCRIPTION =
  'Junior coaching for ages 6 to 15 on Saturday mornings, with small groups sorted by level, a coach for every ' +
  'six players, match play in the last half hour, a ball machine for footwork drills, and a short report for ' +
  'parents at the end of every term.'
const SHORT_DESCRIPTION = 'For ages 6 to 15, Saturdays'

/** The gate's result and context for the invented club after `edit(club)`. */
function planOf(edit) {
  const club = clubResearch()
  edit(club)
  const profile = needsProfileOf(club.research, club.reading)
  const context = composerContextOf({
    profile,
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
  return { profile, context, result: gatePlan(goodComposition(), context) }
}
const insta = (club) => club.research.sources.find((s) => s.id === 'insta')
const gmaps = (club) => club.research.sources.find((s) => s.id === 'gmaps')
/** The model's reading of a description of Junior coaching on the social profile, quoted from its caption. */
function socialDescription(club, description) {
  insta(club).captions.push(`Junior coaching: ${description}`)
  club.reading.items.push({
    source: 'insta',
    kind: 'service',
    fields: { 'offering.name': 'Junior coaching', 'offering.description': description },
    evidence: `Junior coaching: ${description}`
  })
}
const junior = (profile) =>
  profile.items.service.find((i) => i.fields['offering.name'].value === 'Junior coaching')

test('a long booking link that disagrees with the website is offered whole, and the plan passes the gate', () => {
  const { result } = planOf((club) => {
    gmaps(club).fields['contact.cta_url'] = LONG_BOOKING
  })
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const choice = result.plan.assumptions.find((a) => a.field === 'facts[contact-cta-url].value')
  assert.ok(choice, 'the disagreement is on the card')
  assert.ok(
    choice.alternatives.some((a) => a.value === LONG_BOOKING),
    'the link is offered as written'
  )
  assert.deepEqual(checkBuildDocument(result.plan), { ok: true, problems: [] })
})

test('a long social link is a fact as written, and the plan passes the gate', () => {
  const { result } = planOf((club) => {
    gmaps(club).fields['contact.social_url'] = [LONG_SOCIAL]
  })
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.ok(result.plan.facts.some((f) => f.kind === 'contact.social_url' && f.value === LONG_SOCIAL))
})

test('a long description that disagrees is never an alternative; the trust order value stays and the card says so', () => {
  const { profile, result } = planOf((club) => socialDescription(club, LONG_DESCRIPTION))
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const limit = TEXT_LIMITS['facts[].value']
  for (const a of result.plan.assumptions)
    for (const alt of a.alternatives ?? [])
      assert.ok(alt.value.length <= limit, `${a.id} offers ${alt.value}`)
  const id = `${junior(profile).id}-offering-description`
  assert.equal(result.plan.facts.find((f) => f.id === id)?.value, SHORT_DESCRIPTION)
  const line = result.plan.assumptions.find((a) => a.field === `facts[${id}].value`)
  assert.ok(line && line.alternatives === undefined, 'the disagreement is stated without the long text')
  assert.match(line.said, /your website/)
})

test('a description the plan cannot show whole is kept as the trust order gives it, never cut', () => {
  const { profile, result } = planOf((club) => {
    const site = club.research.sources.find((s) => s.id === 'site')
    site.text += ` Junior coaching: ${LONG_DESCRIPTION}`
    club.reading.items.find((i) => i.fields['offering.name'] === 'Junior coaching').fields[
      'offering.description'
    ] = LONG_DESCRIPTION
    club.reading.items.find((i) => i.fields['offering.name'] === 'Junior coaching').evidence =
      `Junior coaching: ${LONG_DESCRIPTION}`
    socialDescription(club, SHORT_DESCRIPTION)
  })
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.equal(junior(profile).fields['offering.description'].value, LONG_DESCRIPTION)
  assert.ok(!result.plan.facts.some((f) => f.id === `${junior(profile).id}-offering-description`))
})

test('the plan edit door takes a long link as the owner types it, within the link limit', () => {
  const { result } = planOf(() => {})
  const edit = (value) => ({
    schema: 'tracy-build-plan-edit/v1',
    id: 'edit-link',
    plan: { id: result.plan.id, revision: result.plan.revision },
    changes: [{ field: 'facts[contact-cta-url].value', value }]
  })
  assert.equal(checkPlanEdit(edit(LONG_BOOKING), result.plan).ok, true)
  const tooLong = `https://book.example/${'x'.repeat(TEXT_LIMITS['facts[].url'])}`
  assert.equal(checkPlanEdit(edit(tooLong), result.plan).ok, false)
  // A text fact keeps its own limit.
  const name = { ...edit('N'.repeat(TEXT_LIMITS['facts[].value'] + 1)) }
  name.changes = [{ field: 'facts[contact-address].value', value: name.changes[0].value }]
  assert.equal(checkPlanEdit(name, result.plan).ok, false)
})

test('a link longer than any plan can hold is left out with its reason, never cut, and the plan still passes', () => {
  const huge = `https://book.example/c?ref=${'q'.repeat(TEXT_LIMITS['facts[].url'])}`
  const { profile, result } = planOf((club) => {
    gmaps(club).fields['contact.cta_url'] = huge
  })
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.ok(profile.dropped.some((d) => d.code === 'link_too_long' && d.kind === 'contact.cta_url'))
  assert.ok(
    !(profile.facts['contact.cta_url'] ?? []).some((f) => f.value.startsWith('https://book.example/c?'))
  )
})
