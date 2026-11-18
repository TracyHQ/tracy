/**
 * Approved is final (#537 R23): once the owner approved the Business facts, no owner door changes them any more, and a
 * change after approval is a new card of the same place (`POST /api/website-opportunities`, which accepts a place the
 * account already has). Every door that writes the Profile answers 409 `PROFILE_APPROVED` with `APPROVAL_NEXT`'s
 * sentence, and so does Research (Research again, Try again, Retry of one part), which would rewrite the facts, unless
 * this card's research is `failed` or `not_started`. The Content brief's own lock (`BRIEF_APPROVED`) sits on its two
 * doors in the builder (`opportunities-build/route.js`).
 *
 * One guard, registered before the doors it covers: it answers only when the caller's own card is approved and passes
 * every other request on to the door, which still answers 401, 404 and 400 as before.
 */
import { APPROVAL_NEXT, approvalOf } from './approval.js'
import { researchStateOf } from './research-state.js'

/** Every owner door that writes the Business facts of one card, as `[method, path under BASE]`. */
export const PROFILE_DOORS = Object.freeze([
  ['PUT', '/:id/name'],
  ['PUT', '/:id/profile'],
  ['PUT', '/:id/hours'],
  ['PUT', '/:id/rating'],
  ['PUT', '/:id/reading'],
  ['PUT', '/:id/facts'],
  ['PUT', '/:id/key-messages'],
  ['PUT', '/:id/team'],
  ['PUT', '/:id/socials'],
  ['PUT', '/:id/media/:mediaId/visibility'],
  ['PUT', '/:id/reviews/visibility'],
  ['POST', '/:id/media'],
  ['POST', '/:id/research']
])

/** The doors that start work: with the feature switched off they answer `FEATURE_OFF` first, as before. */
const WORK_DOORS = new Set(['/:id/media', '/:id/research'])

/** Research states in which nothing was approved yet: Research may run again on them. */
const OPEN_RESEARCH = new Set(['failed', 'not_started'])

/**
 * Whether this card's Business facts are approved (`approval.js approvalOf`), so `path` may not change them. A
 * Research press is let through while the card's research is `failed` or `not_started`.
 */
export async function profileLocked(db, opp, { research: isResearch = false } = {}) {
  if (!opp?.profile_approved_at) return false
  const research = await researchStateOf(db, opp.id)
  if (approvalOf({ opportunity: opp, research, latestBriefAt: null }).profile !== 'approved') return false
  return !(isResearch && OPEN_RESEARCH.has(research.state))
}

/**
 * @param {import('hono').Hono} app
 * @param {{pool: any, caller: Function, refuse: Function, opportunityOf: Function, featureOn: Function, UUID: RegExp,
 *   BASE: string}} ctx
 */
export function lockApprovedProfile(app, { pool, caller, refuse, opportunityOf, featureOn, UUID, BASE }) {
  for (const [method, path] of PROFILE_DOORS)
    app.on(method, `${BASE}${path}`, async (c, next) => {
      if (WORK_DOORS.has(path) && !(await featureOn())) return next()
      const who = await caller(c)
      const id = c.req.param('id')
      const opp =
        !(who instanceof Response) && who.accountId && UUID.test(id)
          ? await opportunityOf(pool, who.accountId, id)
          : null
      if (opp && (await profileLocked(pool, opp, { research: path === '/:id/research' })))
        return refuse(c, 409, 'PROFILE_APPROVED', APPROVAL_NEXT.PROFILE_APPROVED)
      await next()
    })
}
