/**
 * The two background steps of the build chat's engine (#609): research and compose. Each takes plain inputs (what the
 * rerun rule copies, `engine-rerun.js`) and its tools, and calls the build engine of the WO package; neither writes the
 * draft (`engine.js` does, once the step has finished).
 *
 * RESEARCH BEFORE A SITE EXISTS. `gather({links, description})` produces the research brief and its asset manifest in
 * the shapes a website opportunity's revision stores (`wo_revision.brief`, `wo_revision.asset_manifest`), which is
 * what `researchOf` reads. It is injected: the default (`gather.js`, wired in `build-draft-gather-wiring.js`) reads the links
 * with the Website Opportunities collectors in memory and writes no `wo_*` row. The links it set aside, each with a
 * plain reason, are kept in the research record (`setAside`).
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
  SITE_NAME_QUESTION_ID,
  buildNeedsProfile,
  composePlan,
  researchOf,
  withheldOfBrief,
  withWithheld
} from 'website-opportunities/domain'

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
 * Research the business from the owner's links: the brief, the needs profile research made from it, and the needs
 * profile with its questions. `kit` (the chosen template's, when known) gives the main button's answer its real length.
 * @param {{links: string[], description?: string}} inputs
 * @param {{gather: Function, model: Function, kit?: {blockStore: object, library: object[]} | null,
 *   accountId?: string}} tools `accountId`: whose research it is (the gatherer counts paid reads per account)
 * @returns {Promise<{links: string[], description: string | null, trade: string | null, brief: object,
 *   manifest: object[], profile: object, setAside?: Array<{link: string, reason: string}>}>} the research record the
 *   draft keeps
 */
export async function researchStep({ links, description }, { gather, model, kit, accountId }) {
  const gathered = await gather({ links, description: description ?? null }, accountId ? { accountId } : {})
  if (!gathered?.brief || typeof gathered.brief !== 'object')
    throw new EngineStepError('research_empty', 'the research gave no brief')
  const manifest = Array.isArray(gathered.manifest) ? gathered.manifest : []
  // What the owner keeps off the site (a held business name, held people) rides on the record: compose reads it.
  const { sources, withheld } = researchOf(gathered.brief, { manifest })
  const profile = await buildNeedsProfile({
    research: { sources },
    model,
    ...(kit ? { blockStore: kit.blockStore, library: kit.library } : {})
  })
  return {
    links,
    description: description ?? null,
    trade: isText(gathered.brief.trade) ? gathered.brief.trade : null,
    brief: gathered.brief,
    manifest,
    profile,
    ...(withheld ? { withheld } : {}),
    ...(Array.isArray(gathered.setAside) && gathered.setAside.length ? { setAside: gathered.setAside } : {}),
    // The business logo the gatherer saved as a file (the brand step reads it); kept so a rerun reads the same file.
    ...(isText(gathered.logoFile) ? { logoFile: gathered.logoFile } : {}),
    // The research run its stored pictures belong to (`pictures.js`), and the pictures that were not stored, each with
    // its plain reason: they are not in the manifest.
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
export async function brandOf({ research, template }, { brandStep, kit }) {
  return (await brandStep({ research, template, kit })) ?? null
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
 * what `composePlan` answers (the plan passed the rules gate and its look check).
 *
 * 🔒 NOT `buildPlanStep`. That step builds the needs profile again (one more model call, and new question ids the
 * stored answers no longer name) and settles the brand record itself; here research already built the profile and the
 * brand step already ran (`engine.js`). So compose does the rest of it exactly as that step does: `withWithheld` on the
 * stored profile (with the kit, so the site name answer is held to the template's limit), then `composePlan` with the
 * stored brand record. `composePlan` itself stops a site nothing may name: `site_name_missing` while the site name
 * question is open, `site_name_too_long` when the answer is longer than the template holds, both before any model
 * call and `noRerun` (`engine-asking.js` turns them into a question for the owner).
 * @param {{research: object, answers: object[], template: object, brand: object | null}} inputs
 * @param {{model: Function, kit: object}} tools
 */
export async function composeStep({ research, answers, template, brand }, { model, kit }) {
  const profile = planProfileOf(research, kit)
  // An answer to a question the withheld profile drops (about the held name or a held person) settles nothing that is
  // shown, and `composePlan` would refuse it as no question of the profile (`answer_invalid`). So does a site name
  // answer kept from a research that held the name, once the research no longer does. Any other answer goes on as it
  // is, so a wrong one is still refused.
  const ids = (p) => new Set((Array.isArray(p?.questions) ? p.questions : []).map((q) => q?.id))
  const kept = ids(profile)
  const dropped = [...ids(research?.profile), SITE_NAME_QUESTION_ID].filter((id) => !kept.has(id))
  return composePlan({
    blockStore: kit.blockStore,
    pageRecipes: kit.pageRecipes,
    library: kit.library,
    template,
    brand,
    profile,
    answers: (Array.isArray(answers) ? answers : []).filter((a) => !dropped.includes(a?.question)),
    planId: `plan-${randomUUID()}`,
    model
  })
}
