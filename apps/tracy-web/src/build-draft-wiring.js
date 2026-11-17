// Wiring: the steps the build chat's engine (`build-draft/engine.js`, #609) runs that belong to other domains. It sits
// beside app.js because the brand step before the site (`brand-before-site.js`, #616) joins the step chain's steps and
// the brand bench, and a domain directory imports only `lib/` and `db/`.
//
// THE BRAND STEP, AS #616 DEFINES IT. `createBrandBeforeSite` runs the step chain's own kit and brand steps on a
// research revision and a template kit (`{revisionId, kitRef, siteLanguage}`) and answers the look record. The brand
// bench reads its brief from that revision (`--brief-revision`, a `wo_revision` row) and spends its own doors
// (`brandAgent`, `brandReviewer`, `seedImage`), not the build model. A draft researched before any website opportunity
// holds no such revision: a research of links makes one (#575, `build-draft/place-research.js`), and a research of the
// owner's words alone gives the step its brief instead (`--brief-file`, #616). A draft without a brief or a known kit
// answers `brand_input_missing`.
import { createBrandBeforeSite } from './brand-before-site.js'
import { aiQuickstartCatalogue } from './build-draft/ai-quickstarts.js'
import { briefOfRevision } from './lib/bench-sql.js'
import { readableKits } from './lib/template-kit-source.js'
import { shippedAiQuickstartPins } from './lib/ai-quickstart-pins.js'
import { fittingAiQuickstarts } from 'website-opportunities/domain'
import { existsSync } from 'node:fs'

export {
  decideProfile,
  draftPictureReader,
  draftPictures,
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
 * The AI quickstart catalogue the server offers (`build-draft/ai-quickstarts.js`): only the template versions the brand
 * step can resolve a kit for, by the brand step's own lookup (`kitRefOf`), so the owner never picks a template whose
 * build would stop with `brand_input_missing`.
 *
 * 🔒 ONLY A PINNED AI QUICKSTART THAT FITS THE TRADE IS OFFERED (#598): pinned as the pin reader of #588 says
 * (`lib/ai-quickstart-pins.js`), in the build path chooser's order (`website-opportunities/domain`
 * `fittingAiQuickstarts`: code point order of `<slug>/<cms>`). A trade nothing fits is offered nothing: the "no
 * template fits" answer, which leaves the owner on the current build path. With no pin written, nothing is offered.
 * Each template left out for its pin is logged once with the pin reader's codes, and `refused()` lists them.
 * @param {{kitRefOf?: Function, log?: {warn?: Function}, root?: string,
 *   aiQuickstartPins?: ReturnType<typeof shippedAiQuickstartPins>}} [deps] `aiQuickstartPins`: the pinned AI
 *   quickstarts and the refused ones (default: the ones this server ships)
 */
export function draftQuickstartCatalogue({
  kitRefOf: refOf = kitRefOf,
  log = console,
  root,
  aiQuickstartPins
} = {}) {
  const catalogue = aiQuickstartCatalogue({
    ...(root ? { root } : {}),
    log,
    kitFor: (template) => refOf(template) !== null
  })
  let logged = false
  const pins = () => {
    const read = aiQuickstartPins ?? shippedAiQuickstartPins()
    if (!logged) {
      logged = true
      for (const r of read.refused)
        log?.warn?.(
          `[build-draft] AI quickstart ${r.key} is not offered: ${r.problems.map((p) => p.code).join(', ')}`
        )
    }
    return read
  }
  return {
    ...catalogue,
    templatesFor(trade) {
      const offered = catalogue.templatesFor(trade)
      const fitting = fittingAiQuickstarts({ trade, quickstarts: pins().pinned })
      return fitting.flatMap((q) => offered.filter((t) => t.slug === q.slug && t.version === q.version))
    },
    /** The templates left out for their pin, with the pin reader's codes. */
    refused: () => pins().refused
  }
}

/**
 * The engine's `brandStep({research, template})` over #616's step, on the draft's own research: the step chain's content
 * brief revision of a research of links (`research.ids.revisionId`, #575), else the brief the words-only research made
 * (a draft researched before #575 may also hold the logo file it saved, `research.logoFile`).
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
    const language = research.profile?.language?.value
    // A research of links is the step chain's own (#575): its content brief is a revision, which the bench reads as
    // a Website Opportunities build does (`--brief-revision`), with the logo its place research chose.
    const revisionId = typeof research.ids?.revisionId === 'string' ? research.ids.revisionId : null
    const logoFile =
      !revisionId && typeof research.logoFile === 'string' && existsSync(research.logoFile)
        ? research.logoFile
        : null
    const { record, usd } = await run({
      ...(revisionId ? { revisionId } : { brief }),
      ...(logoFile ? { logoFile } : {}),
      kitRef,
      ...(language ? { siteLanguage: language } : {})
    })
    // The run's cost is known only when every one of its calls reported one (`spendOfRecord`: `usd` is null else). Then
    // the step answers it beside the record, so the ledger settles at it (`engine-steps.js` `brandRunOf`).
    return Number.isFinite(usd) && usd >= 0 && record ? { record, costCents: usd * 100 } : record
  }
}
