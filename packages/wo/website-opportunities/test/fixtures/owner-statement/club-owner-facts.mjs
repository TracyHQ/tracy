// The invented tennis club of the plan composer tests with an owner's chat statement (decision D46, #609): the reading
// of the statement, the brief's owner facts, the research, the needs profile, the composed plan and the writer, each
// step the build's own code, no model but scripted fakes. Nothing here is a real business or person.
import { checkBusinessReading, readingSourcesOf } from '../../../domain/business-reading.mjs'
import { needsProfileOf } from '../../../domain/needs-profile.mjs'
import { researchOf } from '../../../domain/needs-research.mjs'
import { readingWithoutOwnerQuotes } from '../../../domain/owner-statement.mjs'
import { writePages } from '../../../domain/page-writer.mjs'
import { composePlan } from '../../../domain/plan-composer.mjs'
import { withWithheld, withoutWithheld } from '../../../domain/plan-withheld.mjs'
import {
  blockStore,
  brand,
  clubResearch,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from '../plan-composer/invented-club.mjs'

/** A seven word service taken whole from the owner's words: the reading moves it to the owner's facts. */
export const FITTING = 'free racket fitting before the first lesson'
export const FITTING_SENTENCE = `Every new member gets a ${FITTING}.`
export const HELD = 'Odalys Brenwick'
export const STORY = 'tennis on four courts since 1998'
export const STATEMENT = `We have coached tennis on our four courts since 1998. ${FITTING_SENTENCE} ${HELD} runs the junior squad on Saturdays. Find us at 14 Quillmoor Lane, Fernhollow.`
const ANSWER = {
  services: [{ name: FITTING, quote: FITTING_SENTENCE.slice(0, -1), ref: 'owner' }],
  story: [{ text: STORY, quote: 'We have coached tennis on our four courts since 1998', ref: 'owner' }]
}

/** The brief part the research reads: the reading's owner facts (`brief.reading.ownerFacts`), the held people. */
export function ownerBrief({ held = false, extra = [] } = {}) {
  const sources = readingSourcesOf({
    bio: 'Tennis club with four courts.',
    ownerStatement: STATEMENT,
    ...(held ? { heldTexts: [HELD], heldPeople: [HELD] } : {})
  })
  const reading = readingWithoutOwnerQuotes({
    method: 'model',
    ...checkBusinessReading(ANSWER, sources, { trade: 'fitness' })
  })
  return {
    facts: [],
    reading: { ownerFacts: [...(reading.ownerFacts ?? []), ...extra] },
    ...(held ? { missing: [{ field: 'team', withheld: [{ values: [HELD] }] }] } : {})
  }
}

/** The club's research with the owner's source the brief gives, its needs profile and the plan composed from it. */
export async function ownerPlan(brief) {
  const research = researchOf(brief)
  const club = clubResearch()
  const owner = research.sources.find((s) => s.id === 'owner-statement')
  if (owner) club.research.sources.push(owner)
  const gated = withWithheld(needsProfileOf(club.research, club.reading), research)
  const { plan } = await composePlan({
    profile: gated,
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(goodComposition()))
  })
  return { research, profile: gated, plan }
}

/** A value that fits a field: short, never padded. */
export const fitting = (field) => `${field.name} ok`.slice(0, field.limit)

/**
 * A fake writer: each field gets a fitting value, but a field of a block holding an owner's fact gets `say(fact,
 * field, user)` for its first fact, when it gives one. Records every request.
 */
export function factWriter(say = () => undefined) {
  const calls = []
  const model = async (request) => {
    calls.push(request)
    const user = JSON.parse(request.user)
    const fields = {}
    for (const block of user.blocks) {
      const fact = block.data.find((d) => d.kind === 'owner.fact')
      for (const field of block.fields) fields[field.key] = (fact && say(fact, field, user)) ?? fitting(field)
    }
    return JSON.stringify({ fields })
  }
  return Object.assign(model, { calls })
}

/** The writer step as the step chain calls it: the profile without what is held, the owner's statement. */
export const writeOwnerPlan = ({ plan, profile }, model, ownerStatement = STATEMENT) =>
  writePages({
    plan,
    profile: withoutWithheld(profile),
    blockStore: blockStore(),
    library: library(),
    model,
    ownerStatement
  })
