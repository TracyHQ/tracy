// The plans the composer's gate accepts in this package's tests, one per kind of part the composer adds beyond the
// needs profile (#575): brief channels (a WhatsApp link, a second phone), a section kept on trade basis, reviews placed
// from the library, a planned privacy page and not-found page, item field facts of open conflicts. Every later stage of
// the build must accept each as it is (`domain-plan-later-stages.test.mjs`, tracy-web `step-chain-draft-plan-composed`).
// Invented club, invented template, scripted fake model.
import assert from 'node:assert/strict'
import { composePlan, composerContextOf } from '../../../domain/plan-composer.mjs'
import { gatePlan } from '../../../domain/plan-gate.mjs'
import {
  answer,
  blockStore,
  brand,
  clubProfile,
  conflictedClubProfile,
  goodComposition,
  library,
  pageRecipes,
  template,
  PHONE_QUESTION,
  scriptedModel,
  withIntentNotes
} from './invented-club.mjs'
import { brief, inputs, reply, richerKit } from './intent-kit.mjs'
import { tradeComposition, tradeRecipes, tradeStore } from './trade-blocks.mjs'

/** The invented club composed with a WhatsApp number and a second phone from the brief, each on the contact page. */
export async function composedWithChannels() {
  const kit = richerKit()
  const composition = withIntentNotes(goodComposition(), ['km-1', 'km-2'])
  const contact = composition.pages.find((p) => p.pageType === 'contact')
  contact.blocks[0].data.push('contact-phone-2')
  contact.blocks.push({
    block: 'social-row',
    label: 'Social links',
    data: ['contact-whatsapp'],
    reason: 'r',
    message: 'm'
  })
  const input = inputs(scriptedModel(reply(composition)), {
    ...kit,
    brief: brief({
      contact: { whatsapp: { number: '+1 555 0142 790', href: 'https://wa.me/15550142790', verified: true } },
      facts: [{ id: 'w1', field: 'whatsapp', value: '+1 555 0142 790', evidence: [{ source: 'google' }] }]
    }),
    answers: [answer(PHONE_QUESTION, { text: 'Show both numbers please' })],
    answerReadings: new Map([
      [
        PHONE_QUESTION,
        {
          facts: [
            { kind: 'contact.phone', value: '+1 555 0142 778', primary: true },
            { kind: 'contact.phone', value: '+1 555 0142 779', primary: false }
          ]
        }
      ]
    ])
  })
  const composed = await composePlan(input)
  const shown = composed.plan.pages.flatMap((p) => p.blocks.flatMap((b) => b.data))
  assert.ok(
    shown.includes('contact-whatsapp') && shown.includes('contact-phone-2'),
    'the fixture places both'
  )
  return {
    plan: composed.plan,
    profile: composed.profile,
    kit: { blockStore: input.blockStore, pageRecipes: input.pageRecipes, library: input.library }
  }
}

/** A plan the composer's gate accepted, from `composition` on `profile` and the invented kit. */
export function gated(
  composition,
  profile = clubProfile(),
  kit = { blockStore: blockStore(), pageRecipes: pageRecipes(), library: library() }
) {
  const context = composerContextOf({
    profile,
    ...kit,
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
  const result = gatePlan(composition, context)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  return { plan: result.plan, profile: context.profile, kit }
}

const PRIVACY = {
  kind: 'privacy',
  use: 'create',
  id: 'legal:privacy',
  says: 'Who runs the club and how to reach it; what the email and the phone are used for.',
  factIds: ['business-name', 'contact-email', 'contact-phone']
}
/** Every plan the package composes in its tests, in the kinds the composer adds beyond the profile. */
export const COMPOSED_PLANS = {
  'the invented club, reviews placed by the gate from the library, a privacy page planned by code': () =>
    gated(goodComposition()),
  'a planned privacy page and not-found page': () =>
    gated({
      ...goodComposition(),
      legalPages: [PRIVACY],
      notFound: { says: 'This page is not here; point back to the courts.', leadsTo: ['home'] }
    }),
  'item field facts of open conflicts (a price, a role)': () =>
    gated(goodComposition(), conflictedClubProfile()),
  'a WhatsApp link and a second phone from the brief': composedWithChannels,
  'a repeating section kept on trade basis with no item of its own': tradePlan
}

/** The invented club with a services type section kept on trade basis: its copy is written from the trade, no item. */
export function tradePlan() {
  const out = gated(tradeComposition(), clubProfile(), {
    blockStore: tradeStore(),
    pageRecipes: tradeRecipes(),
    library: library()
  })
  const trade = out.plan.pages.flatMap((p) => p.blocks).filter((b) => b.basis === 'trade')
  assert.equal(trade.length, 1, 'the plan keeps the trade section')
  assert.deepEqual(trade[0].data, [], 'with no item of its own')
  return out
}
