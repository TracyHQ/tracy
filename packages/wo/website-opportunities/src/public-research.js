/**
 * What the sign-in-free `/find` research doors (`public/wo-find-page.js`) may do with places, wired in
 * `app.js` so the door stays domain-pure. Strangers name places by Google place id ONLY: the place is
 * made with no name (`resolvePlace(…, name: null)`) and every fact of it is the place job's own
 * server-side collection; nothing the browser says about a place is kept.
 */
import { findResearchOf, usableResearch } from './find-research.js'
import {
  admitPublicResearch,
  admitPublicResearchAgain,
  publicResearchProgress,
  publicResearchRefusal
} from './place-jobs.js'
import { againShape, placeAgainPlan } from './research-again.js'
import { resolvePlace } from './places.js'

const GOOGLE = 'google-places'

/** @param {import('pg').Pool} pool */
export function publicResearchDoor(pool) {
  /** The place a Google id already names (merges followed), or null: never made here. */
  async function knownPlace(providerId) {
    const row = (await findResearchOf(pool, [{ provider: GOOGLE, providerId }], null))[0]
    return row?.place_id ?? null
  }

  return {
    /**
     * One press for one place. A place nobody saw yet is made only when a new job could be queued for
     * it, so a refused press leaves nothing behind.
     */
    async admit({ providerId, ipBucket, now, limits }) {
      let placeId = await knownPlace(providerId)
      if (!placeId) {
        const refused = await publicResearchRefusal(pool, { ipBucket, now, limits })
        if (refused) return { refused }
        placeId = await resolvePlace(pool, { provider: GOOGLE, providerId, name: null })
        if (!placeId) return { refused: 'INVALID_PLACE_ID' }
      }
      return admitPublicResearch(pool, { placeId, providerId, ipBucket, now, limits })
    },

    progress: (receipts, { now }) => publicResearchProgress(pool, receipts, { now }),

    /** Research again, before the press: what would run on a researched place, cut to one job's cap. Read-only. */
    async againPreview({ providerId, now, keys, settings, domain, jobCapCents, onlyParts = null }) {
      const placeId = await knownPlace(providerId)
      const plan = placeId
        ? await placeAgainPlan(pool, placeId, {
            now,
            keys,
            settings,
            domain,
            capCents: jobCapCents,
            onlyParts
          })
        : null
      return plan?.researched ? againShape(plan) : null
    },

    /** Research again pressed by a stranger on a researched place (`admitPublicResearchAgain`). */
    async admitAgain({ providerId, ipBucket, now, limits, keys, settings, domain, onlyParts = null }) {
      const placeId = await knownPlace(providerId)
      if (!placeId) return { refused: 'NOT_RESEARCHED' }
      const out = await admitPublicResearchAgain(pool, {
        placeId,
        providerId,
        ipBucket,
        now,
        limits,
        keys,
        settings,
        domain,
        onlyParts
      })
      return { ...out, ...(out.plan ? { plan: againShape(out.plan) } : {}) }
    },

    /** Published shared research per Google id: `{researchedAt, canBuild}` or null. Read-only. */
    async researched(providerIds) {
      const rows = await findResearchOf(
        pool,
        providerIds.map((providerId) => ({ provider: GOOGLE, providerId })),
        null
      )
      return providerIds.map((_, i) => {
        const row = rows[i]
        return row?.snapshot_id && row.profile
          ? { researchedAt: row.published_at, canBuild: usableResearch(row) }
          : null
      })
    }
  }
}
