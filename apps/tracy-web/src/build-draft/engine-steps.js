/**
 * The two background steps of the build chat's engine (#609): research and compose. Each takes plain inputs (what the
 * rerun rule copies, `engine-rerun.js`) and its tools, and calls the build engine of the WO package; neither writes the
 * draft (`engine.js` does, once the step has finished).
 *
 * RESEARCH BEFORE A SITE EXISTS (#575). A research of links is the step chain's own (`place-research.js`): the owner's
 * business saved and researched as Build from my business does, and its content brief a `wo_revision`. A research of
 * the owner's words alone (`gather.js`) makes its brief in memory from those words. Both end in `researchRecordOf`,
 * the record `researchOf` and the needs profile read. The links set aside, each with a plain reason, are kept in the
 * research record (`setAside`).
 *
 * 🔒 THE PLAN NEVER SHOWS THE TEMPLATE'S LOOK (decision D40). Compose reads the business's brand from
 * `brandStep({research, template, kit})`: the pre site brand step of #616 (`brand-before-site.js`), which answers its
 * look record (`brandLookOf`). The rules of what that record allows are #616's and live in the WO package: the plan
 * composer refuses no record (`brand_missing`) and a kept template accent whose logo colours were never measured
 * (`brand_logo_colours_unmeasured`)
 * before any model call, and keeps the template accent only where the product owner's rule says so (no logo at all,
 * said to the customer). Nothing here re-decides them, and the composer is never asked for its test-only fallback.
 */
import { randomUUID } from 'node:crypto'
import {
  BUSINESS_TRADE_QUESTION_ID,
  buildNeedsProfile,
  composePlan,
  composerContextOf,
  HELD_HOURS_ID,
  PLACE_CHOICE_QUESTION_ID,
  researchOf,
  SITE_NAME_QUESTION_ID,
  withheldOfBrief,
  withWithheld
} from 'website-opportunities/domain'
import { TYPED_ID as HELD_HOURS_TYPED_ID } from './held-hours.js'

/** An error of a step, with the code and the rerun rule the WO package's errors carry. */
export class EngineStepError extends Error {
  constructor(code, message, { noRerun = false } = {}) {
    super(message)
    this.name = 'EngineStepError'
    this.code = code
    if (noRerun) this.noRerun = true
  }
}

const isText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * Research the business from the owner's own words, with no link (`gather.js`): the brief, the needs profile research
 * made from it, and the needs profile with its questions. `kit` (the chosen template's, when known) gives the main
 * button's answer its real length. A research of links runs the step chain's place research instead
 * (`place-research.js`) and ends in `researchRecordOf` the same way.
 * @param {{links: string[], description?: string, name?: string}} inputs `name`: the business name the owner typed,
 *   which names a business researched from its owner's words alone
 * @param {{gather: Function, model: Function, kit?: {blockStore: object, library: object[]} | null,
 *   accountId?: string, withheld?: object | null, place?: object | 'none'}} tools `accountId`: whose research it is;
 *   `withheld`: what the draft's earlier research kept off the site
 */
export async function researchStep(
  { links, description, name },
  { gather, model, kit, accountId, withheld: kept, place }
) {
  // What the owner already keeps off the site (a research made before) is told to the gatherer, so the business reading
  // never sends a held name or person to the model, not even in the owner's own description.
  const gathered = await gather(
    {
      links,
      description: description ?? null,
      ...(name ? { name } : {}),
      ...(kept ? { withheld: kept } : {}),
      ...(place ? { place } : {})
    },
    accountId ? { accountId } : {}
  )
  return researchRecordOf(gathered, { links, description }, { model, kit })
}

/** The owner's description as the needs profile's `owner-statement` source (D46), when no source of it is there yet. */
function withOwnerStatement(sources, statement) {
  if (!isText(statement) || sources.some((s) => s.id === 'owner-statement')) return sources
  return [...sources, { id: 'owner-statement', origin: 'answer', text: statement }]
}

/**
 * The research record the draft keeps, from what research gathered: the brief, the needs profile research made from it
 * (`researchOf`, with the brief's own fact decisions) and the needs profile with its questions.
 * @param {object} gathered `{brief, manifest, setAside?, reading?, descriptionFacts?, descriptionKeptOut?, logoFile?,
 *   pictureRun?, picturesSetAside?, placeProfile?, ids?, googleLink?, ownerStatement?}`
 * @param {{links: string[], description?: string | null}} inputs
 * @param {{model: Function, kit?: object | null}} tools
 */
export async function researchRecordOf(gathered, { links, description }, { model, kit }) {
  if (!gathered?.brief || typeof gathered.brief !== 'object')
    throw new EngineStepError('research_empty', 'the research gave no brief')
  const manifest = Array.isArray(gathered.manifest) ? gathered.manifest : []
  // What the owner keeps off the site (a held business name, held people) rides on the record: compose reads it.
  const { sources, withheld, assessed, videos, heldBack } = researchOf(gathered.brief, { manifest })
  const profile = await buildNeedsProfile({
    research: {
      sources: withOwnerStatement(sources, gathered.ownerStatement),
      ...(assessed ? { assessed } : {}),
      // The owner's own videos (counted on the profile, #575 P10) and what the brief holds back, by code.
      ...(videos?.length ? { videos } : {}),
      ...(heldBack ? { heldBack } : {})
    },
    model,
    ...(kit ? { blockStore: kit.blockStore, library: kit.library } : {})
  })
  const has = (key) => gathered[key] !== undefined && gathered[key] !== null
  return {
    links,
    description: description ?? null,
    trade: isText(gathered.brief.trade) ? gathered.brief.trade : null,
    brief: gathered.brief,
    manifest,
    profile,
    ...(withheld ? { withheld } : {}),
    ...(Array.isArray(gathered.setAside) && gathered.setAside.length ? { setAside: gathered.setAside } : {}),
    // How the business was read (`gather-reading.js`): by the model or the rules, why, its calls, tokens and cost.
    ...(gathered.reading && typeof gathered.reading === 'object' ? { reading: gathered.reading } : {}),
    // What became of the owner's description (D46): the description itself stays under its own key (`description`);
    // whether its facts were read, and the sentences kept out of the brief word for word.
    ...(gathered.descriptionFacts && typeof gathered.descriptionFacts === 'object'
      ? { descriptionFacts: gathered.descriptionFacts }
      : {}),
    ...(Array.isArray(gathered.descriptionKeptOut) && gathered.descriptionKeptOut.length
      ? { descriptionKeptOut: gathered.descriptionKeptOut }
      : {}),
    // A research of links (`place-research.js`): the step chain's place profile, the ids of the saved business, its
    // place and its content brief (the brand step and a build read the revision), and the Google link the place
    // was chosen for.
    ...(has('placeProfile') ? { placeProfile: gathered.placeProfile } : {}),
    ...(has('ids') ? { ids: gathered.ids } : {}),
    ...(isText(gathered.googleLink) ? { googleLink: gathered.googleLink } : {}),
    // A research of the owner's words (`owner-research.js`): what to ask next, and what the owner said and was asked.
    ...(Array.isArray(gathered.gapQuestions) ? { gapQuestions: gathered.gapQuestions } : {}),
    ...(gathered.owner && typeof gathered.owner === 'object' ? { owner: gathered.owner } : {}),
    // A record made before #575 kept a logo file and its draft picture run; kept as they were when present.
    ...(isText(gathered.logoFile) ? { logoFile: gathered.logoFile } : {}),
    ...(isText(gathered.pictureRun) ? { pictureRun: gathered.pictureRun } : {}),
    ...(Array.isArray(gathered.picturesSetAside) && gathered.picturesSetAside.length
      ? { picturesSetAside: gathered.picturesSetAside }
      : {})
  }
}

/**
 * The business's look record for the chosen template, from the pre site brand step (#616). It runs as the engine's own
 * `brand` step, once research and a template are in the draft; the step keeps its own attempts, so nothing reruns it.
 * @returns {Promise<object | null>} the look record, or null when the step has none
 */
export async function brandOf({ research, template, accountId }, { brandStep, kit }) {
  return (await brandRunOf({ research, template, accountId }, { brandStep, kit })).record
}

/**
 * The brand step's look record and, when the step knew it, what the whole step cost (`costCents`) and the whole brand
 * file it kept (`file`). The step answers its look record, or `{record, costCents?, file?}` (`draftBrandStep`); a look
 * record is never that shape (it carries its `schema`).
 * @returns {Promise<{record: object | null, costCents?: number, file?: object}>}
 */
export async function brandRunOf({ research, template, accountId = null }, { brandStep, kit }) {
  const answer = (await brandStep({ research, template, kit, accountId })) ?? null
  if (answer && typeof answer === 'object' && !('schema' in answer) && 'record' in answer)
    return {
      record: answer.record ?? null,
      ...(Number.isFinite(answer.costCents) && answer.costCents >= 0 ? { costCents: answer.costCents } : {}),
      // The whole brand file with its stored pictures (`draftBrandStep`), kept beside the record (P1 of the audit).
      ...(answer.file && typeof answer.file === 'object' ? { file: answer.file } : {})
    }
  return { record: answer }
}

/**
 * What the owner keeps off the site, for a research record (`researchOf`'s `withheld`): the one the record holds, or,
 * for a record researched before research kept it, the one its stored brief gives (`withheldOfBrief`). Null when
 * nothing is held.
 * @param {{withheld?: object, brief?: object} | null | undefined} research
 */
export function withheldOfResearch(research) {
  return research?.withheld ?? withheldOfBrief(research?.brief).withheld ?? null
}

/**
 * The needs profile as the plan step reads it (`plan-step.mjs` `buildPlanStep`): with what the owner keeps off the site
 * attached by `withWithheld` (the held name goes by the neutral identity, held people and what names them are
 * withheld, questions about either are dropped). While the name is held and nothing neutral names the site, the site
 * name question comes first among its questions, its free text held to the kit's business name limit when a kit is
 * known (120 characters without one). The stored profile as it is when nothing is held. Applied once, to the profile
 * research stored: applying it twice would hold the neutral name itself.
 * @param {{profile?: object, withheld?: object, brief?: object} | null | undefined} research
 * @param {{blockStore?: object, library?: object[]} | null} [kit] the chosen template's kit, when known
 */
export function planProfileOf(research, kit = null) {
  const withheld = withheldOfResearch(research)
  if (!withheld) return research?.profile
  const template = kit?.blockStore ? { blockStore: kit.blockStore, library: kit.library ?? [] } : {}
  return withWithheld(research?.profile, { withheld }, template)
}

/**
 * Compose the plan for the chosen template from the needs profile, the owner's answers and the brand record. Answers
 * what `composePlan` answers (the plan passed the rules gate and its look check), with the whole settled profile.
 *
 * 🔒 NOT `buildPlanStep`. That step builds the needs profile again (one more model call, and new question ids the
 * stored answers no longer name) and settles the brand record itself; here research already built the profile and the
 * brand step already ran (`engine.js`). So compose does the rest of it exactly as that step does: `withWithheld` on the
 * stored profile (with the kit, so the site name answer is held to the template's limit), then `composePlan` with the
 * stored brand record. `composePlan` itself stops a site nothing may name: `site_name_missing` while the site name
 * question is open, `site_name_too_long` when the answer is longer than the template holds, both before any model
 * call and `noRerun` (`engine-asking.js` turns them into a question for the owner).
 * @param {{research: object, answers: object[], answerReadings?: Map<string, object> | null, template: object,
 *   brand: object | null, ownerLanguage?: string}} inputs
 * @param {{model: Function, kit: object}} tools
 */
export async function composeStep(
  { research, answers, answerReadings, template, brand, ownerLanguage },
  { model, kit }
) {
  const profile = planProfileOf(research, kit)
  // An answer to a question the withheld profile drops (about the held name or a held person) settles nothing that is
  // shown, and `composePlan` would refuse it as no question of the profile (`answer_invalid`). So does a site name
  // answer kept from a research that held the name, once the research no longer does. Any other answer goes on as it
  // is, so a wrong one is still refused.
  const ids = (p) => new Set((Array.isArray(p?.questions) ? p.questions : []).map((q) => q?.id))
  const kept = ids(profile)
  // The place choice and the business trade are research's own questions (`gather-place.js`, `trade-question.js`):
  // never one of the plan's.
  const dropped = [
    ...ids(research?.profile),
    SITE_NAME_QUESTION_ID,
    PLACE_CHOICE_QUESTION_ID,
    BUSINESS_TRADE_QUESTION_ID,
    // The held opening hours are research's too (`held-hours.js`): settled into the brief before compose, whether the
    // answer gave a pick or not.
    HELD_HOURS_ID,
    HELD_HOURS_TYPED_ID,
    // The brief questions of a research of the owner's words: answered into the brief, never the plan's.
    ...(Array.isArray(research?.gapQuestions) ? research.gapQuestions.map((q) => q?.id) : [])
  ].filter((id) => !kept.has(id))
  const input = {
    blockStore: kit.blockStore,
    pageRecipes: kit.pageRecipes,
    library: kit.library,
    template,
    brand,
    profile,
    answers: (Array.isArray(answers) ? answers : []).filter((a) => !dropped.includes(a?.question)),
    // What the answer reading kept of the owner's typed answers (`answer-readings.js`), null without one.
    answerReadings: answerReadings ?? null,
    // The content brief research stored: its key messages, audience, voice and held fields reach the composer, and
    // what no block can show is listed as left out (`plan-composer-brief.mjs`).
    brief: research?.brief ?? null,
    planId: `plan-${randomUUID()}`,
    // The language the owner chats in, when the chat named it (`composerContextOf`).
    ...(ownerLanguage ? { ownerLanguage } : {})
  }
  const composed = await composePlan({ ...input, model })
  // `composePlan` hands on the profile without what the owner keeps off the site (for the page writer). The draft keeps
  // the settled profile whole, with the `withheld` marker: the edit gate and a change request read it, and a card edit
  // that shows the held name again must find it. The same pure settling `composePlan` did, no model call.
  return { ...composed, profile: composerContextOf(input).profile }
}
