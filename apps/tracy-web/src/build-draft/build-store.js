/**
 * The build an approval starts (#610, migration 219): kept in the account's draft as `build`, written through
 * `changeDraft` (one transaction holding the account's row), so two approvals of the same draft can never both start.
 *
 * 🔒 ONE SITE PER DRAFT. The build's `id` is the site creation's `buildId`, a pure function of the account and the
 * draft (`draftBuildId`). The create door (`POST /api/sites`) is idempotent on it: approving twice, a retry after a lost
 * answer or a reload all reach the same site. An approval of the plan already approved answers the build it started;
 * an approval of another plan revision is refused (`BUILT_FROM_OTHER_PLAN`): building that plan on the same site is a
 * rebuild (#612), never a second site.
 *
 * 🔒 THE SNAPSHOT IS TAKEN HERE AND NEVER CHANGES. The approved plan, its last edit, the needs profile it was gated
 * with and the research record (brief, asset manifest, picture run) are copied into the build at approval. The run
 * reads that copy (`store.js` `draftPlanForBuild`, `readEngineDraft`), and the pictures of its research run stay stored
 * until the build ends (`pictures.js` `prune`).
 */
import { createHash } from 'node:crypto'
import { changeDraft } from './store.js'

/** A UUID shaped id that is a pure function of the account and the draft (sha256, version 4 layout bits). */
export function draftBuildId(accountId, draftId) {
  const h = createHash('sha256').update(`build-draft:${accountId}:${draftId}`).digest()
  h[6] = (h[6] & 0x0f) | 0x40
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

/** A plan reference `{id, revision}` as a body names it, or null. */
export function planRefOf(value) {
  return typeof value?.id === 'string' && value.id.trim() !== '' && Number.isInteger(value?.revision)
    ? { id: value.id, revision: value.revision }
    : null
}

const samePlan = (a, b) => a?.id === b?.id && a?.revision === b?.revision

/** The account's build, or null. */
export async function readBuild(pool, accountId) {
  const { rows } = await pool.query('select build from build_draft where account_id = $1', [accountId])
  return rows[0]?.build ?? null
}

/**
 * Approve the living plan `plan` (`{id, revision}`) and keep the build it starts, with the snapshot. Answers
 * `{build, created}`; `created` is false when this plan was approved already (nothing is written). Refusals:
 * `NO_DRAFT`, `NO_PLAN`, `STALE_PLAN` (the living plan is another revision), `ENGINE_BUSY` (a step still runs),
 * `BUILT_FROM_OTHER_PLAN` (the draft's build is of another plan revision).
 * @param {{plan: {id: string, revision: number}, now?: () => number}} approval
 */
export async function approveBuild(pool, accountId, { plan, now = Date.now }) {
  let found = null
  let made = null
  const result = await changeDraft(pool, accountId, (row) => {
    if (row.build) {
      if (samePlan(row.build.plan, plan)) {
        found = row.build
        return { error: 'APPROVED' }
      }
      return { error: 'BUILT_FROM_OTHER_PLAN', build: row.build }
    }
    if (!row.plan) return { error: 'NO_PLAN' }
    if (!samePlan(row.plan, plan)) return { error: 'STALE_PLAN', revision: row.plan.revision }
    if (row.engine?.state === 'running') return { error: 'ENGINE_BUSY' }
    made = {
      id: draftBuildId(accountId, row.id),
      plan: { id: row.plan.id, revision: row.plan.revision },
      approvedAt: new Date(now()).toISOString(),
      snapshot: {
        plan: row.plan,
        lastEdit: row.last_edit ?? null,
        profile: row.needs_profile,
        research: row.research
      },
      site: null,
      refusal: null,
      endedAt: null
    }
    return { build: made }
  })
  if (found) return { build: found, created: false }
  if (result.error) return result
  return { build: made, created: true }
}

/**
 * Keep what the create door answered for the build `buildId`: the site (`{siteKey, label, jobId, workspacePath}`), or
 * the refusal (`{code, status}`) when it made none. A build that is not this one changes nothing. The site's `siteKey`
 * names where the run's progress is read.
 */
export function saveBuildSite(pool, accountId, buildId, { site = null, refusal = null }) {
  return changeDraft(pool, accountId, (row) => {
    if (row.build?.id !== buildId) return { error: 'NOT_THIS_BUILD' }
    // A site made on a retry after a refusal reopens the build: its run starts now.
    const reopened = site && !row.build.site ? { endedAt: null, result: null } : {}
    return { build: { ...row.build, site: site ?? row.build.site ?? null, refusal, ...reopened } }
  })
}

/** Mark the build ended with its Contract B result, once; its snapshot's pictures may then go. */
export function endBuild(pool, accountId, buildId, result, now = Date.now) {
  return changeDraft(pool, accountId, (row) => {
    if (row.build?.id !== buildId) return { error: 'NOT_THIS_BUILD' }
    if (row.build.endedAt) return { error: 'ENDED' }
    return { build: { ...row.build, endedAt: new Date(now()).toISOString(), result } }
  })
}

/** Whether the account's build has not ended: no step may change the draft under it. */
export const buildOpen = (build) => Boolean(build) && !build.endedAt

/**
 * Keep the site label the build asks the create door for, once, before it asks: the create door hashes the label into
 * the build, so a retry must send the same one. Answers the label the build holds.
 */
export async function saveBuildLabel(pool, accountId, buildId, label) {
  let kept = null
  await changeDraft(pool, accountId, (row) => {
    if (row.build?.id !== buildId) return { error: 'NOT_THIS_BUILD' }
    kept = row.build.label ?? label
    return row.build.label ? { error: 'KEPT' } : { build: { ...row.build, label } }
  })
  return kept
}

/** How long one hand off may hold its claim before another ask may take it (#611). */
export const HANDOFF_CLAIM_MS = 30_000

/**
 * Claim the hand off of the done build `buildId` to its site's chat (#611), so two asks at once never open two chats.
 * Answers `{handoff}` (the hand off as it stands: `{sessionId?, promptedAt?}`) when this ask holds it, or the
 * refusal: `NOT_THIS_BUILD`, `HANDOFF_OPENING` (another ask holds a fresh claim). A hand off already prompted is
 * answered as it is, without a claim (`{handoff, done: true}`).
 */
export async function claimHandoff(pool, accountId, buildId, now = Date.now) {
  let found = null
  const result = await changeDraft(pool, accountId, (row) => {
    if (row.build?.id !== buildId) return { error: 'NOT_THIS_BUILD' }
    const handoff = row.build.handoff ?? {}
    if (handoff.promptedAt) {
      found = handoff
      return { error: 'PROMPTED' }
    }
    const held = Date.parse(String(handoff.claimedAt ?? ''))
    if (Number.isFinite(held) && now() - held < HANDOFF_CLAIM_MS) return { error: 'HANDOFF_OPENING' }
    found = { ...handoff, claimedAt: new Date(now()).toISOString() }
    return { build: { ...row.build, handoff: found } }
  })
  if (result.error === 'PROMPTED') return { handoff: found, done: true }
  if (result.error) return result
  return { handoff: found }
}

/**
 * Keep what the hand off reached: the chat made ahead (`sessionId`), then the first message it took (`promptedAt`).
 * `release` ends the claim, so the next ask may try again at once.
 */
export function saveHandoff(pool, accountId, buildId, changes, { release = false } = {}) {
  return changeDraft(pool, accountId, (row) => {
    if (row.build?.id !== buildId) return { error: 'NOT_THIS_BUILD' }
    const handoff = { ...row.build.handoff, ...changes }
    if (release) delete handoff.claimedAt
    return { build: { ...row.build, handoff } }
  })
}
