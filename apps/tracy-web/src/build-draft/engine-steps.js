/**
 * The two background steps of the build chat's engine (#609): research and compose. Each takes plain inputs (what the
 * rerun rule copies, `engine-rerun.js`) and its tools, and calls the build engine of the WO package; neither writes the
 * draft (`engine.js` does, once the step has finished).
 *
 * RESEARCH BEFORE A SITE EXISTS. `gather({links, description})` produces the research brief and its asset manifest in
 * the shapes a website opportunity's revision stores (`wo_revision.brief`, `wo_revision.asset_manifest`), which is
 * what `researchOf` reads. It is injected: the research of a website opportunity runs only on its own rows
 * (`wo_source`, `wo_media`, `wo_profile` keyed by the opportunity), so the pre site path stops at this seam until a
 * gatherer that needs no opportunity exists.
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
import { buildNeedsProfile, composePlan, researchOf } from 'website-opportunities/domain'

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
 * @param {{gather: Function, model: Function, kit?: {blockStore: object, library: object[]} | null}} tools
 * @returns {Promise<{links: string[], description: string | null, trade: string | null, brief: object,
 *   manifest: object[], profile: object}>} the research record the draft keeps
 */
export async function researchStep({ links, description }, { gather, model, kit }) {
  const gathered = await gather({ links, description: description ?? null })
  if (!gathered?.brief || typeof gathered.brief !== 'object')
    throw new EngineStepError('research_empty', 'the research gave no brief')
  const manifest = Array.isArray(gathered.manifest) ? gathered.manifest : []
  const { sources } = researchOf(gathered.brief, { manifest })
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
    profile
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
 * Compose the plan for the chosen template from the needs profile, the owner's answers and the brand record. Answers
 * what `composePlan` answers (the plan passed the rules gate and its look check).
 * @param {{research: object, answers: object[], template: object, brand: object | null}} inputs
 * @param {{model: Function, kit: object}} tools
 */
export async function composeStep({ research, answers, template, brand }, { model, kit }) {
  return composePlan({
    blockStore: kit.blockStore,
    pageRecipes: kit.pageRecipes,
    library: kit.library,
    template,
    brand,
    profile: research.profile,
    answers,
    planId: `plan-${randomUUID()}`,
    model
  })
}
