// Wiring: the research gatherer of the build chat before a site exists (#609, `build-draft/gather.js`) over the Website
// Opportunities domain's own collectors and media rules, and the draft pictures it stores (`build-draft/pictures.js`,
// table `build_draft_picture`). It sits beside app.js because it composes another domain's pieces, and a domain
// directory imports only `lib/` and `db/`.
import { createHash, randomUUID } from 'node:crypto'
import { lookup as dnsLookup } from 'node:dns/promises'
import path from 'node:path'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { apifyDaySpent } from 'website-opportunities/src/apify-budget.js'
import { fromPlace, makeSiteBrief, opportunityOf } from 'website-opportunities/src/brief-research.js'
import { withNameDecision } from 'website-opportunities/src/business-name.js'
import { withHoursDecision } from 'website-opportunities/src/business-hours.js'
import { withPhoneDecision } from 'website-opportunities/src/business-phones.js'
import { withRatingDecision } from 'website-opportunities/src/business-rating.js'
import { fairShare, mergeCollected, mergePalettes, mergeProfile } from 'website-opportunities/src/executor.js'
import { EXT, createMediaStore } from 'website-opportunities/src/media-store.js'
import { imageInfoWith, logoPaletteOf } from 'website-opportunities/src/media-info.js'
import { chooseLogo, logoHintsOf } from 'website-opportunities/src/place-logo.js'
import { createLinkFields, saveListingSource } from 'website-opportunities/src/link-fields.js'
import { createPinnedFetch } from 'website-opportunities/src/pinned-fetch.js'
import { withProfileEdits } from 'website-opportunities/src/profile-edits.js'
import {
  businessReadingDoorFor,
  readBusiness,
  readingInputOf
} from 'website-opportunities/src/business-reading.js'
import { BudgetExceededError } from 'website-opportunities/src/cost-ledger.js'
import { modelTokensOf } from 'website-opportunities/src/wo-model-tokens.js'
import { DEFAULT_WO_OPS_SETTINGS } from 'website-opportunities/src/wo-settings.js'
import { SOCIAL_SOURCES, SOURCES, refsOfCandidate, refsOfUrls } from 'website-opportunities/src/sources.js'
import { cleanProfileLinks } from 'website-opportunities/domain/social-links.mjs'
import { createPreSiteGatherer } from './build-draft/gather.js'
import { withinTime } from './build-draft/gather-sources.js'
import { createLogoWriter } from './build-draft/logo-file.js'
import { createDraftPictures } from './build-draft/pictures.js'
import { kitImagesDirOf } from './lib/template-kit-images.js'
import { tradeOfWords } from './lib/wo-revision-choice.js'
import { woRuntime } from './lib/wo-ops.js'
import { assetManifestOf } from './opportunities-build/asset-manifest.js'
import { createTracyWoHost } from './wo-host.js'

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
  chooseLogo,
  // The chosen logo's own colours, read finer than a photo's (the executor's brand stage, `logoPaletteOfStored`).
  logoPaletteOf,
  // The business reading of the place executor's profile stage (`gather-reading.js`), and what its cost is held to.
  readBusiness,
  readingInputOf,
  modelTokensOf,
  BudgetExceededError,
  defaultJobCapCents: DEFAULT_WO_OPS_SETTINGS.researchJobCapCents
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
 * The draft pictures of this server (`build-draft/pictures.js`): stored through `objects` (the same objects door
 * Website Opportunities stores its pictures through, `app.js` `placeMediaObjectsFor`; a draft key goes to this
 * deployment's artifact store) by the executor's own media rules (`media-store.js`), measured by `imageInfo`.
 * @param {{pool: import('pg').Pool, config?: object, objects: object | null, imageInfo?: Function}} deps
 */
export function draftPictures({ pool, config = null, objects, imageInfo }) {
  let measure = imageInfo ?? null
  const measured = (bytes) => (measure ??= imageInfoWith(createTracyWoHost({ pool, config })))(bytes)
  return createDraftPictures({
    pool,
    objects,
    mediaStoreOf: (domainDeps) => createMediaStore({ objects, imageInfo: measured, domainDeps }),
    withinTime
  })
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * `openDraftPicture(id)`: the stored bytes of one draft picture (a manifest entry of origin `draft`), checked against
 * its sha256, as `{id, sha256, mime, width, height, kind, bytes}`; null when the picture is gone or changed.
 * `accountId` narrows it to one account's draft.
 */
export const draftPictureReader =
  (pictures) =>
  (id, { accountId = null } = {}) =>
    pictures.open(id, { accountId, hash: sha256 })

/**
 * The default research gatherer of the build chat (#609): the owner's links read with the Website Opportunities
 * domain's own collectors, on this server's `/ops/wo` keys and settings, through the crawl fetch that refuses private
 * addresses at connect time (`pinned-fetch.js`); the pictures stored as draft pictures (`pictures`, `draftPictures`).
 * The business is read by the model /ops assigns to "WO editorial" (`businessReadingDoorFor`, door `woEditorial`), its
 * call sent through the server's own fetch as the executor's is (`apiFetch`); a server without a database has no door.
 * `overrides` replaces any door (tests: the domain's network doors, the objects, the measuring, `readingDoor` and
 * `readingFetch` for the reading's model).
 * @param {{pool: import('pg').Pool, config: object, pictures?: object | null, fetchImpl?: typeof fetch,
 *   dnsResolve?: Function, now?: () => number, overrides?: object}} deps
 */
export function preSiteGatherer({
  pool,
  config,
  pictures = null,
  fetchImpl,
  dnsResolve,
  now = Date.now,
  overrides = {}
}) {
  const loadDomain = overrides.loadDomain ?? websiteOpportunitiesDomain
  const runtime = overrides.runtime ?? (() => woRuntime(pool, config))
  const fetch =
    overrides.fetch ??
    fetchImpl ??
    createPinnedFetch({ isBlockedAddress: async () => (await loadDomain()).isBlockedAddress })
  let host = null
  // Same fallback as the Website Opportunities doors (`app.js`): the link guard refuses every host it cannot
  // resolve, so with no resolver every owner link would be set aside as a private address.
  const resolve =
    overrides.resolve ?? dnsResolve ?? ((name) => dnsLookup(name, { all: true, verbatim: true }))
  const domainDeps = () => ({ fetch, ...(resolve ? { resolve } : {}), now })
  const stored =
    overrides.objects !== undefined
      ? draftPictures({ pool, config, objects: overrides.objects, imageInfo: overrides.imageInfo })
      : pictures
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
    pictures: stored,
    writeLogo: createLogoWriter({ dir: overrides.logoDir ?? draftLogoDir(config), ext: EXT }),
    fetch,
    ...(resolve ? { resolve } : {}),
    readingDoor:
      overrides.readingDoor ??
      (pool
        ? () =>
            businessReadingDoorFor(
              pool,
              config?.sessionSecret,
              (host ??= createTracyWoHost({ pool, config }))
            )
        : null),
    readingFetch: overrides.readingFetch ?? fetchImpl ?? globalThis.fetch,
    now,
    ...(overrides.budgetMs ? { budgetMs: overrides.budgetMs } : {}),
    ...(overrides.readingBudgetMs ? { readingBudgetMs: overrides.readingBudgetMs } : {})
  })
}
