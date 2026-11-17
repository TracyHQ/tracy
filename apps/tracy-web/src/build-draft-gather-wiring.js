// Wiring: the build chat's research of the owner's words alone (#609, `build-draft/gather.js`) over the step chain's
// own business reading and brief makers, and the draft pictures a research made before #575 stored
// (`build-draft/pictures.js`, table `build_draft_picture`). It sits beside app.js because it composes another domain's
// pieces, and a domain directory imports only `lib/` and `db/`. A research of links is the step chain's own
// (`build-draft/place-research.js`): nothing here reads a link.
import { createHash } from 'node:crypto'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { fromPlace, makeSiteBrief, opportunityOf } from 'website-opportunities/src/brief-research.js'
import { withNameDecision } from 'website-opportunities/src/business-name.js'
import { withHoursDecision } from 'website-opportunities/src/business-hours.js'
import { withPhoneDecision } from 'website-opportunities/src/business-phones.js'
import { withRatingDecision } from 'website-opportunities/src/business-rating.js'
import { mergePalettes, mergeProfile } from 'website-opportunities/src/executor.js'
import { withProfileEdits } from 'website-opportunities/src/profile-edits.js'
import {
  businessReadingDoorFor,
  ownerStatementRecordOf,
  readBusiness,
  readingInputOf
} from 'website-opportunities/src/business-reading.js'
import { BudgetExceededError } from 'website-opportunities/src/cost-ledger.js'
import { modelTokensOf } from 'website-opportunities/src/wo-model-tokens.js'
import { DEFAULT_WO_OPS_SETTINGS } from 'website-opportunities/src/wo-settings.js'
import { SOCIAL_SOURCES } from 'website-opportunities/src/sources.js'
import { cleanProfileLinks } from 'website-opportunities/domain/social-links.mjs'
import { createPreSiteGatherer } from './build-draft/gather.js'
import { createDraftPictures } from './build-draft/pictures.js'
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
  socialSources: SOCIAL_SOURCES,
  mergeProfile,
  mergePalettes,
  fromPlace,
  makeSiteBrief,
  opportunityOf,
  decideProfile,
  tradeOfWords,
  assetManifestOf,
  // The business reading of the place executor's profile stage (`gather-reading.js`), and what its cost is held to.
  readBusiness,
  readingInputOf,
  ownerStatementRecordOf,
  modelTokensOf,
  BudgetExceededError,
  defaultJobCapCents: DEFAULT_WO_OPS_SETTINGS.researchJobCapCents
})

/**
 * The draft pictures of this server (`build-draft/pictures.js`): the rows a research made before #575 stored, in
 * `objects` (the objects door Website Opportunities stores its pictures through, `app.js` `placeMediaObjectsFor`).
 * @param {{pool: import('pg').Pool, objects: object | null}} deps
 */
export function draftPictures({ pool, objects }) {
  return createDraftPictures({ pool, objects })
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
 * The research gatherer of the build chat for the owner's words alone (#609): the business is read by the model /ops
 * assigns to "WO editorial" (`businessReadingDoorFor`, door `woEditorial`), its call sent through the server's own
 * fetch as the executor's is; a server without a database has no door. `overrides` replaces any door (tests:
 * `loadDomain`, `runtime`, `readingDoor` and `readingFetch`).
 * @param {{pool: import('pg').Pool, config: object, fetchImpl?: typeof fetch, now?: () => number, log?: Console,
 *   overrides?: object}} deps
 */
export function preSiteGatherer({ pool, config, fetchImpl, now = Date.now, log, overrides = {} }) {
  let host = null
  return createPreSiteGatherer({
    loadDomain: overrides.loadDomain ?? websiteOpportunitiesDomain,
    runtime: overrides.runtime ?? (() => woRuntime(pool, config)),
    parts: preSiteParts,
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
    ...(log ? { log } : {}),
    ...(overrides.readingBudgetMs ? { readingBudgetMs: overrides.readingBudgetMs } : {})
  })
}
