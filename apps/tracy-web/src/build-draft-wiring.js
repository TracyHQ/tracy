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
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { apifyDaySpent } from 'website-opportunities/src/apify-budget.js'
import { fromPlace, makeSiteBrief, opportunityOf } from 'website-opportunities/src/brief-research.js'
import { withNameDecision } from 'website-opportunities/src/business-name.js'
import { withHoursDecision } from 'website-opportunities/src/business-hours.js'
import { withPhoneDecision } from 'website-opportunities/src/business-phones.js'
import { withRatingDecision } from 'website-opportunities/src/business-rating.js'
import {
  EXT,
  IMAGE_MAX_BYTES,
  fairShare,
  mergeCollected,
  mergePalettes,
  mergeProfile
} from 'website-opportunities/src/executor.js'
import { withMediaAdmission } from 'website-opportunities/src/media-admission.js'
import { chooseLogo, logoHintsOf } from 'website-opportunities/src/place-logo.js'
import { createLinkFields, saveListingSource } from 'website-opportunities/src/link-fields.js'
import { createPinnedFetch } from 'website-opportunities/src/pinned-fetch.js'
import { withProfileEdits } from 'website-opportunities/src/profile-edits.js'
import { SOCIAL_SOURCES, SOURCES, refsOfCandidate, refsOfUrls } from 'website-opportunities/src/sources.js'
import { cleanProfileLinks } from 'website-opportunities/domain/social-links.mjs'
import { createPreSiteGatherer } from './build-draft/gather.js'
import { createLogoSaver } from './build-draft/logo-file.js'
import { kitImagesDirOf } from './lib/template-kit-images.js'
import { tradeOfWords } from './lib/wo-revision-choice.js'
import { woRuntime } from './lib/wo-ops.js'
import { assetManifestOf } from './opportunities-build/asset-manifest.js'
import { createTracyWoHost } from './wo-host.js'

const fault = (code, message) => Object.assign(new Error(message), { code, noRerun: true })

/**
 * The profile decisions a brief read applies to an opportunity's profile (`brief-research.js` `fromOpportunity`): the
 * name, hours, rating and phone decided, the links cleaned, the seller's typed edits on top.
 */
export function decideProfile(profile, opp, brand = null) {
  const decided = withPhoneDecision(
    withRatingDecision(
      withHoursDecision(withNameDecision(profile ?? {}, { opportunity: opp, brand }), { opportunity: opp }),
      { opportunity: opp }
    ),
    { opportunity: opp }
  )
  return withProfileEdits(cleanProfileLinks(decided), opp)
}

/** The Website Opportunities pieces the gatherer composes (`build-draft/gather.js` `parts`). */
export const preSiteParts = Object.freeze({
  sources: SOURCES,
  socialSources: SOCIAL_SOURCES,
  refsOfCandidate,
  refsOfUrls,
  mergeCollected,
  mergeProfile,
  mergePalettes,
  fairShare,
  fromPlace,
  makeSiteBrief,
  opportunityOf,
  decideProfile,
  tradeOfWords,
  assetManifestOf,
  logoHintsOf,
  chooseLogo
})

/**
 * Where the build chat's research keeps the business logo files: `build-draft-logos` beside the brand bench's run
 * folders (`brand-step/brand-wiring.js` `brandRunDir`: next to the kit image cache, under the configured readiness
 * directory, else the OS temp directory).
 */
export const draftLogoDir = (config) => path.join(path.dirname(kitImagesDirOf(config)), 'build-draft-logos')

/**
 * The fields of a Google place the link door matched, for `createLinkFields` (`candidateFields`): the identity and
 * the facts the find answered. Only the place id, name and its stated website and social pages are read further.
 */
export function placeCandidateFields(raw) {
  const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  const provider = text(raw?.provider, 40)
  const providerId = text(raw?.providerId, 200)
  const name = text(raw?.name, 200)
  if (!provider || !providerId || !name) return null
  const refs = refsOfUrls([raw.website, ...Object.values(raw.socials ?? {})])
  const socials = Object.fromEntries(Object.entries(refs).filter(([s]) => SOCIAL_SOURCES.includes(s)))
  const candidate = {
    provider,
    providerId,
    name,
    branch: null,
    address: text(raw.address, 500),
    phone: text(raw.phone, 60),
    website: refs.website ?? null,
    socials
  }
  return { name, branch: null, provider, providerId, candidate }
}

/**
 * The private `listing` source row of the listing pages read, made by Website Opportunities' own writer
 * (`saveListingSource`) into a row held in memory: the writer's `insert` is caught, nothing reaches a database.
 */
export async function listingRowOf(listings) {
  let held = null
  const memory = {
    async query(sql, params) {
      if (/^\s*select/i.test(sql)) return { rows: [] }
      const [, source, ref, status, reason, coverage, collected] = params
      held = {
        source,
        ref,
        status,
        reason,
        cursor: null,
        coverage: JSON.parse(coverage),
        collected: JSON.parse(collected)
      }
      return { rows: [] }
    }
  }
  await saveListingSource(memory, randomUUID(), listings)
  return held
}

/**
 * The default research gatherer of the build chat (#609): the owner's links read with the Website Opportunities
 * domain's own collectors, on this server's `/ops/wo` keys and settings, through the crawl fetch that refuses private
 * addresses at connect time (`pinned-fetch.js`). `overrides` replaces any door (tests: the domain's network doors).
 * @param {{pool: import('pg').Pool, config: object, fetchImpl?: typeof fetch, dnsResolve?: Function,
 *   now?: () => number, overrides?: object}} deps
 */
export function preSiteGatherer({ pool, config, fetchImpl, dnsResolve, now = Date.now, overrides = {} }) {
  const loadDomain = overrides.loadDomain ?? websiteOpportunitiesDomain
  const runtime = overrides.runtime ?? (() => woRuntime(pool, config))
  const fetch =
    overrides.fetch ??
    fetchImpl ??
    createPinnedFetch({ isBlockedAddress: async () => (await loadDomain()).isBlockedAddress })
  let host = null
  const resolve = overrides.resolve ?? dnsResolve
  const domainDeps = () => ({ fetch, ...(resolve ? { resolve } : {}), now })
  return createPreSiteGatherer({
    loadDomain,
    runtime,
    linkFields: createLinkFields({ domainDeps, runtime, candidateFields: placeCandidateFields }),
    listingRowOf,
    // The executor's daily count of paid runs per account (`apify-budget.js`); a run of no account is not paid for.
    paidRunAllowed:
      overrides.paidRunAllowed ??
      (async (accountId) => {
        if (!accountId) return false
        host ??= createTracyWoHost({ pool, config })
        return !(await apifyDaySpent(host, pool, accountId, now()))
      }),
    parts: preSiteParts,
    saveLogo:
      overrides.saveLogo ??
      createLogoSaver({
        dir: overrides.logoDir ?? draftLogoDir(config),
        admit: withMediaAdmission,
        maxBytes: IMAGE_MAX_BYTES,
        ext: EXT
      }),
    fetch,
    ...(resolve ? { resolve } : {}),
    now,
    ...(overrides.budgetMs ? { budgetMs: overrides.budgetMs } : {})
  })
}

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
