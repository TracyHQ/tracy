/**
 * What the create door and the run frame read of an approved build of the build chat (#610, `build_draft.build`,
 * migration 219), kept in lib/ so `sites/` and `app.js` read it without importing the build draft domain
 * (module-graph rule). The build draft domain writes it (`build-draft/build-store.js`).
 */

const samePlan = (a, b) => a?.id === b?.id && a?.revision === b?.revision

/** The business name the approved plan shows (its `business.name` fact), for the site's name; null without one. */
export async function draftBuildName(pool, draftId) {
  const { rows } = await pool.query(
    `select build -> 'snapshot' -> 'plan' as plan from build_draft where id::text = $1`,
    [String(draftId)]
  )
  const facts = rows[0]?.plan?.facts
  const name = Array.isArray(facts) ? facts.find((f) => f?.kind === 'business.name')?.value : null
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null
}

/**
 * Whether the draft `draftId` is the caller's and holds an approved build of exactly `plan`: the create door's check
 * before it starts a step chain run from a draft (`sites/route.js`).
 */
export async function draftBuildApproved(pool, { draftId, accountId, plan }) {
  const { rows } = await pool.query(
    `select build -> 'plan' as plan from build_draft where id::text = $1 and account_id = $2 and build is not null`,
    [String(draftId), accountId]
  )
  return rows.length > 0 && samePlan(rows[0].plan, plan)
}
