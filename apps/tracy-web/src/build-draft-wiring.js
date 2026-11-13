// Wiring: the steps the build chat's engine (`build-draft/engine.js`, #609) runs that belong to other domains. It sits
// beside app.js because the brand step before the site (`brand-before-site.js`, #616) joins the step chain's steps and
// the brand bench, and a domain directory imports only `lib/` and `db/`.
//
// THE BRAND STEP, AS #616 DEFINES IT. `createBrandBeforeSite` runs the step chain's own kit and brand steps on a
// research revision and a template kit (`{revisionId, kitRef, siteLanguage}`) and answers the look record. The brand
// bench reads its brief from that revision (`--brief-revision`, a `wo_revision` row) and spends its own doors
// (`brandAgent`, `brandReviewer`, `seedImage`), not the build model. A draft researched before any website opportunity
// holds no such revision, so until the research gatherer stores one (`research.revisionId`), the step answers
// `brand_input_missing` and compose stops: the plan never shows the template's look in its place.
import { createBrandBeforeSite } from './brand-before-site.js'
import { briefOfRevision } from './lib/bench-sql.js'
import { readableKits } from './lib/template-kit-source.js'

const fault = (code, message) => Object.assign(new Error(message), { code, noRerun: true })

/**
 * The research gatherer of the build chat before a site exists: none on this server yet. A website opportunity's
 * research (`wo_source`, `wo_media`, `wo_profile`) runs only on that opportunity's own rows, so the research door stops
 * with this fault (the team sees it; the owner reads one sentence) until a gatherer that needs no opportunity is
 * injected as `deps.buildEngine.gather`.
 */
export async function noPreSiteResearch() {
  throw fault('research_unavailable', 'no research gatherer runs before a website opportunity exists')
}

/** The step chain kit ref (`<slug>/<cms>/<version>`) of a chosen template, or null when the server has none. */
export function kitRefOf(template, kits = readableKits()) {
  const found = kits.find(
    (k) => k.ref.startsWith(`${template?.slug}/`) && k.ref.endsWith(`/${template?.version}`)
  )
  return found?.ref ?? null
}

/**
 * The engine's `brandStep({research, template})` over #616's step. `stepsOf()` makes the step chain's steps
 * (`createStepChainSteps`), only once a run can start, so a server whose drafts never reach it builds no bench wiring.
 * @param {{pool: import('pg').Pool, stepsOf: () => object, brandBeforeSite?: Function, kitRefOf?: Function}} deps
 */
export function draftBrandStep({ pool, stepsOf, brandBeforeSite, kitRefOf: refOf = kitRefOf }) {
  let run = brandBeforeSite ?? null
  return async ({ research, template }) => {
    const revisionId = research?.revisionId
    if (!revisionId)
      throw fault('brand_input_missing', 'the draft research holds no research revision for the brand step')
    const kitRef = refOf(template)
    if (!kitRef)
      throw fault('brand_input_missing', `no step chain kit for ${template?.slug} ${template?.version}`)
    run ??= createBrandBeforeSite({
      steps: stepsOf(),
      briefOf: async (id) => {
        const found = await briefOfRevision(pool, id)
        return found.ok ? found.brief : null
      }
    })
    const language = research.profile?.language?.value
    const { record } = await run({ revisionId, kitRef, ...(language ? { siteLanguage: language } : {}) })
    return record
  }
}
