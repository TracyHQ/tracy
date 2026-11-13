// Shared inputs of the change request tests (ticket #617): the invented club's first plan, composed with the scripted
// fake model, the kit of the invented template with one more page recipe (a services page), and builders for a
// Contract B change request and for the fake model's answers. Nothing here is a real business, template or model.
import { composePlan } from '../../../domain/plan-composer.mjs'
import {
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './invented-club.mjs'

/** The invented recipes plus a services page: a page type a request may add. */
export function requestRecipes() {
  const recipes = pageRecipes()
  recipes.recipes.push({
    pageType: 'services',
    mainBlock: 'services-grid',
    blocks: ['header-main', 'services-grid', 'footer-main']
  })
  return recipes
}

export const kit = () => ({
  blockStore: blockStore(),
  pageRecipes: requestRecipes(),
  library: library(),
  template: template(),
  brand: brand()
})

/** The first plan of the invented club and its settled profile, as the draft keeps them. */
export async function firstPlan(composition = goodComposition(), profile = clubProfile(), answers = []) {
  const composed = await composePlan({
    ...kit(),
    profile,
    answers,
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(composition))
  })
  return { plan: composed.plan, profile: composed.profile }
}

/** A Contract B change request for `plan`. */
export const requestFor = (plan, text, id = 'request-1') => ({
  schema: 'tracy-build-plan-request/v1',
  id,
  plan: { id: plan.id, revision: plan.revision },
  text
})

/** The fake model's answer: changes and not done entries. */
export const answer = (changes = [], notDone = []) => JSON.stringify({ changes, notDone })

/** The input of `revisePlan` for a plan, a profile, a request text and the fake model's replies. */
export function revision({ plan, profile }, text, ...replies) {
  const model = scriptedModel(...replies)
  return { input: { ...kit(), plan, profile, request: requestFor(plan, text), model }, model }
}

export { scriptedModel }
