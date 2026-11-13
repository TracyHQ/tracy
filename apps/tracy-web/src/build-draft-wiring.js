// Wiring: the steps the build chat's engine (`build-draft/engine.js`, #609) runs that belong to other domains. It sits
// beside app.js because the brand step before the site (`brand-before-site.js`, #616) joins the step chain's steps and
// the brand bench, and a domain directory imports only `lib/` and `db/`.
//
// THE BRAND STEP, AS #616 DEFINES IT. `createBrandBeforeSite` runs the step chain's own kit and brand steps on a
// research revision and a template kit (`{revisionId, kitRef, siteLanguage}`) and answers the look record. The brand
// bench reads its brief from that revision (`--brief-revision`, a `wo_revision` row) and spends its own doors
// (`brandAgent`, `brandReviewer`, `seedImage`), not the build model. A draft researched before any website opportunity
// holds no such revision: the step takes the draft's research brief instead (`--brief-file`, #616) with the logo file
// the gatherer saved, and a draft without a brief or a known kit answers `brand_input_missing`.
import { createBrandBeforeSite } from './brand-before-site.js'
import { briefOfRevision } from './lib/bench-sql.js'
import { readableKits } from './lib/template-kit-source.js'
import { existsSync } from 'node:fs'

export {
  decideProfile,
  draftLogoDir,
  draftPictureReader,
  draftPictures,
  listingRowOf,
  placeCandidateFields,
  preSiteGatherer,
  preSiteParts
} from './build-draft-gather-wiring.js'

const fault = (code, message) => Object.assign(new Error(message), { code, noRerun: true })

/** The step chain kit ref (`<slug>/<cms>/<version>`) of a chosen template, or null when the server has none. */
export function kitRefOf(template, kits = readableKits()) {
  const found = kits.find(
    (k) => k.ref.startsWith(`${template?.slug}/`) && k.ref.endsWith(`/${template?.version}`)
  )
  return found?.ref ?? null
}

/**
 * The engine's `brandStep({research, template})` over #616's step, on the draft's own research: the brief the gatherer
 * made and, when one was found, the business logo file it saved (`research.logoFile`), never a research revision.
 * `stepsOf()` makes the step chain's steps (`createStepChainSteps`), only once a run can start, so a server whose
 * drafts never reach it builds no bench wiring. A logo file gone from the disk is not passed: the step then follows
 * its own rule for a business without a logo.
 * @param {{pool: import('pg').Pool, stepsOf: () => object, brandBeforeSite?: Function, kitRefOf?: Function}} deps
 */
export function draftBrandStep({ pool, stepsOf, brandBeforeSite, kitRefOf: refOf = kitRefOf }) {
  let run = brandBeforeSite ?? null
  return async ({ research, template }) => {
    const brief = research?.brief
    if (!brief || typeof brief !== 'object')
      throw fault('brand_input_missing', 'the draft research holds no brief for the brand step')
    const kitRef = refOf(template)
    if (!kitRef)
      throw fault(
        'brand_input_missing',
        `no template kit on this server for ${template?.slug ?? 'the template'} ${template?.version ?? ''}`.trim()
      )
    run ??= createBrandBeforeSite({
      steps: stepsOf(),
      briefOf: async (id) => {
        const found = await briefOfRevision(pool, id)
        return found.ok ? found.brief : null
      }
    })
    const logoFile =
      typeof research.logoFile === 'string' && existsSync(research.logoFile) ? research.logoFile : null
    const language = research.profile?.language?.value
    const { record } = await run({
      brief,
      ...(logoFile ? { logoFile } : {}),
      kitRef,
      ...(language ? { siteLanguage: language } : {})
    })
    return record
  }
}
