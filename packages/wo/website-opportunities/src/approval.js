/**
 * The seller's approvals of one opportunity (#537): the Profile is approved before a Content brief is made, the latest
 * brief is approved before a demo is built. Stored on the opportunity row (migration 210, package `0013`):
 * `profile_approved_at`, `brief_approved_at` and `profile_changed_at` (the last Profile edit). The column
 * `sources_changed_at` of the same migration is no longer written or read: sources are fixed once research starts
 * (`seller-review-routes.js`), so a source change never resets research, the Profile or a brief.
 *
 * `approvalOf` derives the state the doors and the client read (a brief reads stale when a Profile edit or the Profile
 * approval came after it was made); the gates in the builder (`opportunities-build/route.js`)
 * read the same object, so the client never offers a step the server would refuse.
 */

const at = (v) => {
  if (!v) return null
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v))
  return Number.isNaN(t) ? null : t
}
const iso = (t) => (t === null ? null : new Date(t).toISOString())

/**
 * @param {{ opportunity: object, research?: { researchedAt?: string | null } | null, latestBriefAt?: string | Date | null }} input
 *   `opportunity` is the `wo_opportunity` row, `research` this card's own research (`research-state.js`), and
 *   `latestBriefAt` when the latest Content brief was made (the one a build uses), null before the first.
 * @returns {{
 *   profile: 'none' | 'needed' | 'approved', profileApprovedAt: string | null, profileChangedAt: string | null,
 *   brief: 'none' | 'needed' | 'approved' | 'stale', briefApprovedAt: string | null,
 *   briefStale: 'profile' | null
 * }}
 */
export function approvalOf({ opportunity, research, latestBriefAt }) {
  const o = opportunity ?? {}
  const researchedAt = at(research?.researchedAt)
  const profileApprovedAt = at(o.profile_approved_at)
  const profileChangedAt = at(o.profile_changed_at)
  const briefApprovedAt = at(o.brief_approved_at)
  const briefAt = at(latestBriefAt)
  const profile = researchedAt === null ? 'none' : profileApprovedAt !== null ? 'approved' : 'needed'
  let brief = 'none'
  let briefStale = null
  if (briefAt !== null) {
    if (profileChangedAt !== null && profileChangedAt > briefAt) briefStale = 'profile'
    // A brief made before the Profile was approved was made from Business facts nobody checked yet: it reads stale
    // until it is made again from the approved Profile.
    else if (profileApprovedAt !== null && profileApprovedAt > briefAt) briefStale = 'profile'
    brief = briefStale
      ? 'stale'
      : briefApprovedAt !== null && briefApprovedAt >= briefAt
        ? 'approved'
        : 'needed'
  }
  return {
    profile,
    profileApprovedAt: iso(profileApprovedAt),
    profileChangedAt: iso(profileChangedAt),
    brief,
    briefApprovedAt: iso(briefApprovedAt),
    briefStale
  }
}

/**
 * Why a Content brief may not be made now, or null: `PROFILE_NOT_APPROVED`. Research not done at all is the caller's own
 * earlier refusal (`RESEARCH_NOT_DONE`).
 */
export function briefGateOf(approval) {
  if (approval.profile !== 'approved') return 'PROFILE_NOT_APPROVED'
  return null
}

/** Why a demo may not be built now, or null: `PROFILE_NOT_APPROVED` or `BRIEF_NOT_APPROVED`. */
export function buildGateOf(approval) {
  if (approval.brief !== 'approved')
    return approval.profile === 'approved' ? 'BRIEF_NOT_APPROVED' : 'PROFILE_NOT_APPROVED'
  return null
}

/** The plain next step of each refusal, in the doors' `{code, next}` shape. */
export const APPROVAL_NEXT = Object.freeze({
  PROFILE_NOT_APPROVED: 'Approve the Profile first: open it, check every row, then approve.',
  BRIEF_NOT_APPROVED: 'Approve the latest Content brief first: open it, check every row, then approve.',
  NO_BRIEF: 'Make a Content brief first.',
  BRIEF_STALE: 'This brief was made from an older Profile: make the brief again, then approve it.',
  // Approved is final (#537 R23): a change after approval is a new card of the same place (`POST /`).
  PROFILE_APPROVED: 'The business facts are approved. To change them, add this business again as a new card.',
  BRIEF_APPROVED: 'The Site content brief is approved. To change it, add this business again as a new card.'
})

/**
 * A Profile edit (any row, or a photo the seller added) of a Profile not approved yet. The owner doors never reach it
 * once the Profile is approved (`approval-locks.js`), so `profile_changed_at` after an approval, and the brief's
 * `briefStale: 'profile'` it causes, are left only on rows made before that lock. Returns the updated row, or null when
 * it is not this account's.
 */
export async function markProfileChanged(db, accountId, id) {
  const { rows } = await db.query(
    `update wo_opportunity set profile_changed_at = now(), profile_approved_at = null, updated_at = now()
     where id = $1 and account_id = $2 returning *`,
    [id, accountId]
  )
  return rows[0] ?? null
}

/**
 * The Profile approved now. Approving it again without an edit between keeps the first time, so a brief made after the
 * first approval does not read stale. Returns the updated row, or null when it is not this account's.
 */
export async function approveProfile(db, accountId, id) {
  const { rows } = await db.query(
    `update wo_opportunity set profile_approved_at = coalesce(profile_approved_at, now()), updated_at = now()
     where id = $1 and account_id = $2 returning *`,
    [id, accountId]
  )
  return rows[0] ?? null
}

/** The latest brief approved now. Returns the updated row, or null when it is not this account's. */
export async function approveBrief(db, accountId, id) {
  const { rows } = await db.query(
    `update wo_opportunity set brief_approved_at = now(), updated_at = now()
     where id = $1 and account_id = $2 returning *`,
    [id, accountId]
  )
  return rows[0] ?? null
}

/**
 * The seller added or removed a source (only before research starts or after it failed, `seller-review-routes.js`):
 * the link list changes and nothing else. `candidate` is the changed candidate (`store.js candidateWithNewRefs`,
 * `candidateWithoutLink`).
 */
export async function saveSourceChange(db, accountId, id, candidate) {
  const { rows } = await db.query(
    `update wo_opportunity set candidate = $3::jsonb, updated_at = now()
     where id = $1 and account_id = $2 returning *`,
    [id, accountId, JSON.stringify(candidate)]
  )
  return rows[0] ?? null
}
