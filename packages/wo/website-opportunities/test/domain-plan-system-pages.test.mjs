// The legal and not-found pages of a composed plan (#575): the step chain's "every site has a Privacy Policy page, the
// template's own or one you plan, resting only on facts; plan what the not-found page says", with its checks (R09,
// R10d) adapted to a plan composed before any site exists. Invented club, invented template, no model call.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composePlan, composerContextOf } from '../domain/plan-composer.mjs'
import { PLAN_COMPOSER_PROMPT } from '../domain/plan-composer-request.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { systemPagesCompositionOf } from '../domain/plan-system-pages.mjs'
import {
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'
import { answer, requestFor } from './fixtures/plan-composer/plan-request.mjs'

const context = () =>
  composerContextOf({
    profile: clubProfile(),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
const gate = (composition) => gatePlan(composition, context())
const codes = (result) => result.problems.map((p) => p.code)
const PRIVACY = {
  kind: 'privacy',
  use: 'create',
  id: 'legal:privacy',
  says: 'Who runs the club and how to reach it; what the email and the phone are used for.',
  factIds: ['business-name', 'contact-email', 'contact-phone']
}
const NOT_FOUND = {
  says: 'This page is not here; point back to the courts and the coaches.',
  leadsTo: ['home', 'team']
}
const withPages = (extra) => ({ ...goodComposition(), legalPages: [PRIVACY], notFound: NOT_FOUND, ...extra })

test('a planned Privacy page and not-found page reach the plan, with page ids, and pass Contract B', () => {
  const result = gate(withPages())
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.deepEqual(result.plan.legalPages, [PRIVACY])
  assert.deepEqual(result.plan.notFound, { says: NOT_FOUND.says, leadsTo: ['home', 'team'] })
  assert.deepEqual(checkBuildDocument(result.plan), { ok: true, problems: [] })
})

test('a created Privacy page is no page of the plan: no menu item, no left out line', () => {
  const { plan } = gate(withPages())
  assert.equal(
    plan.pages.some((p) => p.id === 'legal:privacy'),
    false
  )
  assert.equal(JSON.stringify(plan.leftOut).includes('privacy'), false)
})

test('when the model plans none, code plans a created Privacy page on the shown identity facts', () => {
  const result = gate(goodComposition())
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const [privacy] = result.plan.legalPages
  assert.equal(privacy.use, 'create')
  assert.equal(privacy.id, 'legal:privacy')
  assert.ok(privacy.says.length > 0)
  assert.ok(privacy.factIds.includes('business-name'))
  assert.ok(privacy.factIds.includes('contact-email'))
  assert.equal(privacy.factIds.includes('contact-hours'), false, 'opening hours are no contact channel')
  assert.deepEqual(result.plan.notFound.leadsTo, ['home'])
  assert.deepEqual(checkBuildDocument(result.plan), { ok: true, problems: [] })
})

test('a created Privacy page rests only on facts of the business (R09 adapted)', () => {
  const none = gate(withPages({ legalPages: [{ ...PRIVACY, factIds: [] }] }))
  assert.deepEqual(codes(none), ['privacy_page'])
  const invented = gate(withPages({ legalPages: [{ ...PRIVACY, factIds: ['fact-data-officer'] }] }))
  assert.deepEqual(codes(invented), ['privacy_page'])
  assert.equal(invented.problems[0].at, 'legalPages[0].factIds[0]')
  const noSays = gate(withPages({ legalPages: [{ ...PRIVACY, says: ' ' }] }))
  assert.deepEqual(codes(noSays), ['privacy_page'])
})

test('a created Privacy page has the fixed id legal:privacy, and exactly one privacy entry is planned', () => {
  assert.deepEqual(codes(gate(withPages({ legalPages: [{ ...PRIVACY, id: 'privacy' }] }))), ['privacy_page'])
  assert.deepEqual(codes(gate(withPages({ legalPages: [] }))), ['privacy_page'])
  assert.deepEqual(codes(gate(withPages({ legalPages: [PRIVACY, { ...PRIVACY, kind: 'terms' }] }))), [
    'privacy_page'
  ])
})

test("the template's own Privacy page is a page type the plan keeps, named the same", () => {
  const own = gate(withPages({ legalPages: [{ kind: 'privacy', use: 'contact', id: 'contact' }] }))
  assert.equal(own.ok, true, JSON.stringify(own.problems))
  assert.deepEqual(own.plan.legalPages, [{ kind: 'privacy', use: 'contact', id: 'contact' }])
  const missing = gate(
    withPages({ legalPages: [{ kind: 'privacy', use: 'privacy-policy', id: 'privacy-policy' }] })
  )
  assert.deepEqual(codes(missing), ['privacy_page'])
  assert.equal(missing.problems[0].at, 'legalPages[0].use')
})

test('the not-found page says something and leads to a kept page (R09, R10d)', () => {
  assert.deepEqual(codes(gate(withPages({ notFound: { says: '', leadsTo: ['home'] } }))), ['not_found_page'])
  assert.deepEqual(codes(gate(withPages({ notFound: { says: 'Not here.', leadsTo: [] } }))), [
    'not_found_page'
  ])
  const nowhere = gate(withPages({ notFound: { says: 'Not here.', leadsTo: ['blog'] } }))
  assert.deepEqual(codes(nowhere), ['not_found_page'])
  assert.equal(nowhere.problems[0].at, 'notFound.leadsTo[0]')
})

test('the reply shape of the legal and not-found pages is closed: no slug, no address', () => {
  const slug = gate(withPages({ legalPages: [{ ...PRIVACY, slug: 'privacy' }] }))
  assert.deepEqual(codes(slug), ['reply_shape'])
  assert.equal(slug.problems[0].at, 'legalPages[0].slug')
  assert.deepEqual(codes(gate(withPages({ notFound: 'Not here.' }))), ['reply_shape'])
})

test('a revision carries the planned pages back by page type, and drops what names a removed page', () => {
  const { plan } = gate(withPages())
  const kept = plan.pages.map((p) => ({ pageType: p.pageType }))
  assert.deepEqual(systemPagesCompositionOf(plan, kept), { legalPages: [PRIVACY], notFound: NOT_FOUND })
  const withoutTeam = kept.filter((p) => p.pageType !== 'team')
  assert.deepEqual(systemPagesCompositionOf(plan, withoutTeam).notFound.leadsTo, ['home'])
  const own = gate(withPages({ legalPages: [{ kind: 'privacy', use: 'contact', id: 'contact' }] })).plan
  const noContact = kept.filter((p) => p.pageType !== 'contact')
  assert.equal(systemPagesCompositionOf(own, noContact).legalPages, undefined)
})

test("the composer prompt carries the step chain's rule and reply names", () => {
  assert.ok(PLAN_COMPOSER_PROMPT.includes('Every site has a Privacy Policy page, the template'))
  for (const name of ['"legalPages"', '"notFound"', '`legal:privacy`', '"leadsTo"', '"says"'])
    assert.ok(PLAN_COMPOSER_PROMPT.includes(name), name)
})

test('a change request keeps the planned Privacy page and not-found page, and follows a removed page', async () => {
  const kit = {
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand()
  }
  const composed = await composePlan({
    ...kit,
    profile: clubProfile(),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(withPages()))
  })
  const start = { plan: composed.plan, profile: composed.profile }
  const revise = (text, change) =>
    revisePlan({
      ...kit,
      ...start,
      request: requestFor(start.plan, text),
      model: scriptedModel(answer([change]))
    })
  const renamed = await revise('Call the coaches page Our coaches.', {
    op: 'rename_page',
    page: 'team',
    name: 'Our coaches',
    request: 'coaches page Our coaches',
    said: 'Renamed.'
  })
  assert.ok(renamed.plan, JSON.stringify(renamed))
  assert.deepEqual(renamed.plan.legalPages, start.plan.legalPages)
  assert.deepEqual(renamed.plan.notFound, start.plan.notFound)
  const removed = await revise('Take the coaches page off.', {
    op: 'remove_page',
    page: 'team',
    request: 'coaches page off',
    said: 'Removed.'
  })
  assert.ok(removed.plan, JSON.stringify(removed))
  assert.deepEqual(removed.plan.notFound.leadsTo, ['home'])
  assert.deepEqual(checkBuildDocument(removed.plan), { ok: true, problems: [] })
})
