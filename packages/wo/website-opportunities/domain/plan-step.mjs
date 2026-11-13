// The plan step after research (ticket #593, #616): the brand step's record first, then the needs profile, then the
// plan. The brand record is settled before any model call of this step, so a run with no brand record (or a broken
// one) stops with `brand_missing` and spends nothing: the needs profile is never asked for a plan that cannot be
// composed. The brand step needs no site and no needs profile (it reads the stored research brief), so the caller may
// run it earlier and pass its record as `brand`.
import { isBrandLook } from './brand-before-site.mjs'
import { buildNeedsProfile } from './needs-profile.mjs'
import { PlanComposerError } from './plan-composer-error.mjs'
import { composePlan } from './plan-composer.mjs'
import { SITE_NAME_MISSING_MESSAGE, siteNameMissing, withWithheld } from './plan-withheld.mjs'

/** The brand record of the step: the one given, or the one `brandStep` resolves to. */
async function brandRecordOf({ brand, brandStep }) {
  if (brand === undefined && typeof brandStep !== 'function')
    throw new PlanComposerError('brand_step_missing', 'no brand step and no brand record were given')
  let record = brand
  if (record === undefined) {
    try {
      record = await brandStep()
    } catch (error) {
      // A brand step that already ran its own second attempt says so (`noRerun`): the step chain does not run it again.
      // A brand step the customer stopped keeps its own code (`brand_step_stopped`): a stop is no failure.
      throw new PlanComposerError(
        error?.code === 'brand_step_stopped' ? 'brand_step_stopped' : 'brand_step_failed',
        String(error?.message ?? error),
        { cause: error },
        { noRerun: Boolean(error?.noRerun) }
      )
    }
  }
  if (!isBrandLook(record))
    throw new PlanComposerError('brand_missing', 'the brand step gave no brand record', {}, { noRerun: true })
  return record
}

/**
 * The plan step after research.
 * @param {{research: object, model: Function, brand?: object, brandStep?: () => Promise<object | null>,
 *   answers?: object[] | ((profile: object) => object[] | Promise<object[]>)} & object} input `brand`: the brand step's
 *   record (`brandLookOf`), or `brandStep` that resolves to it; `answers` are the customer's answers, or a function that
 *   asks the profile's questions and resolves to them; the rest goes to `composePlan`
 */
export async function buildPlanStep({ research, model, brand, brandStep, answers = [], ...rest }) {
  // A site nothing may name stops before any model call: the customer is asked for a name to show.
  if (siteNameMissing(research?.withheld))
    throw new PlanComposerError('site_name_missing', SITE_NAME_MISSING_MESSAGE, {}, { noRerun: true })
  const record = await brandRecordOf({ brand, brandStep })
  // What the owner keeps off the site rides on the profile (`plan-withheld.mjs`).
  const built = await buildNeedsProfile({
    research,
    model,
    blockStore: rest.blockStore,
    library: rest.library
  })
  const profile = withWithheld(built, research)
  const given = typeof answers === 'function' ? await answers(profile) : answers
  const composed = await composePlan({ ...rest, profile, answers: given, brand: record, model })
  return { needsProfile: profile, brand: record, ...composed }
}
