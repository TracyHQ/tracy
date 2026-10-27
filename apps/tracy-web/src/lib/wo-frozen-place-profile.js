/**
 * The place profile an opportunity's latest brief revision froze (#1791), for the Profile card: the card judges the
 * facts the brief states, with the same profile, time and dates the revision's assessment used, so a fact has one id
 * and one decision on the card, in the brief, in the agent prompt and in QA. The open layer asks for it through its
 * host seam (`frozenPlaceProfileOf`, `website-opportunities/src/host.js`); it never reads `wo_revision` itself.
 */
import { createHash } from 'node:crypto'
import { canonicalJson } from 'website-opportunities/src/canonical-json.js'
import { nameHeldOf, siteNameOf } from 'website-opportunities/domain/held-name.mjs'

/**
 * @param {any} pool
 * @param {{accountId: string, opportunityId: string}} args
 * @returns {Promise<{revisionId: string, profile: any, origin: string, at: string | null, seenAt: Record<string, string>,
 *   factIds: string[] | null, siteName?: string} | null>} null when no revision froze a profile that still matches its hash
 */
export async function frozenPlaceProfileOf(pool, { accountId, opportunityId }) {
  const row = (
    await pool.query(
      `select id, place_profile, brief from wo_revision
        where opportunity_id = $1 and account_id = $2 and place_profile is not null
        order by n desc limit 1`,
      [opportunityId, accountId]
    )
  ).rows[0]
  const frozen = row?.place_profile
  if (!frozen?.profile || typeof frozen.profile !== 'object') return null
  const hash = createHash('sha256').update(canonicalJson(frozen.profile)).digest('hex')
  if (hash !== frozen.profileHash || frozen.assessment?.profileHash !== frozen.profileHash) return null
  return {
    revisionId: row.id,
    profile: frozen.profile,
    origin: frozen.origin ?? 'research',
    at: frozen.assessment.evaluatedAt ?? null,
    seenAt: frozen.assessment.seenAt ?? {},
    // The facts the brief states (schema 2); an older brief states none of its own, so the card judges them all.
    factIds: Array.isArray(row.brief?.facts) ? row.brief.facts.map((f) => f.id) : null,
    // While that brief holds the business name, the neutral identity the site goes by instead (`siteNameOf`).
    ...(nameHeldOf(row.brief) && siteNameOf(row.brief) ? { siteName: siteNameOf(row.brief) } : {})
  }
}
