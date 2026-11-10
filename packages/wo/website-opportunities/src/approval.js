/**
 * The seller's approvals of one opportunity (#537): the Profile is approved before a Content brief is made, the latest
 * brief is approved before a demo is built. Stored on the opportunity row (migration 210, package `0013`):
 * `profile_approved_at`, `brief_approved_at`, `profile_changed_at` (the last Profile edit) and `sources_changed_at` (a
 * source the seller added or removed after research ran).
 *
 * `approvalOf` derives the state the doors and the client read (a brief reads stale when the sources, a Profile edit or
 * the Profile approval came after it was made); the gates in the builder (`opportunities-build/route.js`)
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
 *   research: 'ok' | 'sources_changed',
 *   profile: 'none' | 'needed' | 'approved', profileApprovedAt: string | null, profileChangedAt: string | null,
 *   brief: 'none' | 'needed' | 'approved' | 'stale', briefApprovedAt: string | null,
 *   briefStale: 'profile' | 'sources' | null, sourcesChangedAt: string | null
 * }}
 */
export function approvalOf({ opportunity, research, latestBriefAt }) {
  const o = opportunity ?? {}
  const researchedAt = at(research?.researchedAt)
  const sourcesChangedAt = at(o.sources_changed_at)
  const profileApprovedAt = at(o.profile_approved_at)
  const profileChangedAt = at(o.profile_changed_at)
  const briefApprovedAt = at(o.brief_approved_at)
  const briefAt = at(latestBriefAt)
  // A source added after research ran: research reads the business again before anything downstream counts.
  const researchNeeded =
    sourcesChangedAt !== null && (researchedAt === null || researchedAt < sourcesChangedAt)
  const profile =
    researchedAt === null || researchNeeded ? 'none' : profileApprovedAt !== null ? 'approved' : 'needed'
  let brief = 'none'
  let briefStale = null
  if (briefAt !== null) {
    if (sourcesChangedAt !== null && sourcesChangedAt > briefAt) briefStale = 'sources'
    else if (profileChangedAt !== null && profileChangedAt > briefAt) briefStale = 'profile'
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
    research: researchNeeded ? 'sources_changed' : 'ok',
    profile,
    profileApprovedAt: iso(profileApprovedAt),
    profileChangedAt: iso(profileChangedAt),
    brief,
    briefApprovedAt: iso(briefApprovedAt),
    briefStale,
    sourcesChangedAt: iso(sourcesChangedAt)
  }
}

/**
 * Why a Content brief may not be made now, or null: `RESEARCH_NEEDED` (a source was added after research) or
 * `PROFILE_NOT_APPROVED`. Research not done at all is the caller's own earlier refusal (`RESEARCH_NOT_DONE`).
 */
export function briefGateOf(approval) {
  if (approval.research === 'sources_changed') return 'RESEARCH_NEEDED'
  if (approval.profile !== 'approved') return 'PROFILE_NOT_APPROVED'
  return null
}

/** Why a demo may not be built now, or null: `RESEARCH_NEEDED`, `PROFILE_NOT_APPROVED` or `BRIEF_NOT_APPROVED`. */
export function buildGateOf(approval) {
  if (approval.research === 'sources_changed') return 'RESEARCH_NEEDED'
  if (approval.brief !== 'approved')
    return approval.profile === 'approved' ? 'BRIEF_NOT_APPROVED' : 'PROFILE_NOT_APPROVED'
  return null
}

/** The plain next step of each refusal, in the doors' `{code, next}` shape. */
export const APPROVAL_NEXT = Object.freeze({
  RESEARCH_NEEDED:
    'A source was added or removed after research: run Research again, then approve the new Profile.',
  PROFILE_NOT_APPROVED: 'Approve the Profile first: open it, check every row, then approve.',
  BRIEF_NOT_APPROVED: 'Approve the latest Content brief first: open it, check every row, then approve.',
  NO_BRIEF: 'Make a Content brief first.',
  BRIEF_STALE:
    'This brief was made from an older Profile or older sources: make the brief again, then approve it.'
})

/**
 * A Profile edit (any row, or a photo the seller added): the Profile needs review again, and a brief made before now
 * reads stale. Returns the updated row, or null when it is not this account's.
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
 * The seller added or removed a source. After research ran, research is needed again and the Profile approval is
 * cleared; before, the link list only changes. `candidate` is the changed candidate (`store.js candidateWithNewRefs`,
 * `candidateWithoutLink`).
 */
export async function saveSourceChange(db, accountId, id, candidate, { researched }) {
  const { rows } = await db.query(
    `update wo_opportunity set candidate = $3::jsonb, updated_at = now(),
       sources_changed_at = case when $4 then now() else sources_changed_at end,
       profile_approved_at = case when $4 then null else profile_approved_at end
     where id = $1 and account_id = $2 returning *`,
    [id, accountId, JSON.stringify(candidate), Boolean(researched)]
  )
  return rows[0] ?? null
}
