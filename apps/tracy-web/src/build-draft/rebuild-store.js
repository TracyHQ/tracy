/**
 * A rebuild after the build (#612): the owner changed the living plan in the site chat, and the site is updated from
 * the new plan revision by a revision run that writes only what the change touched (Part 3,
 * `docs/references/draft-revision-run.md`). Kept in the same `build_draft.build` the first build lives in, written
 * through `changeDraft` (one transaction holding the account's row).
 *
 * THE BUILD BECOMES THE LATEST RUN. Starting a revision replaces the build's plan, approval time and frozen snapshot
 * with the new revision's (the run reads that snapshot, `store.js draftPlanForBuild`), opens it again (`endedAt` null)
 * and names the run: `run: {kind: 'partial', id, edit, rebuildFrom}`. The run before it moves to `history`, so nothing
 * of it is lost. The build's `id` and `site` never change: one site per draft.
 *
 * 🔒 ONE RUN AT A TIME PER SITE. A revision starts only when the build has ended and no restore or abandon holds the
 * site (`busy`); the store's own unfinished mark (`deps.builds.begin`) stops a second run that would still slip past.
 *
 * 🔒 NOTHING HERE DELETES ANYTHING. The site, the chat and every earlier build stay; a restore and an abandon write the
 * site back through the build store (`rebuild-route.js`).
 */
import { randomUUID } from 'node:crypto'
import { changeDraft } from './store.js'

const samePlan = (a, b) => a?.id === b?.id && a?.revision === b?.revision

/** How long a restore or an abandon may hold the site before another ask may take it. */
export const BUSY_CLAIM_MS = 10 * 60_000

/** The run of a build as Contract B names it: the first build, or the partial re-run it became. */
export const runOfBuild = (build) =>
  build?.run?.kind === 'partial'
    ? { id: build.run.id, kind: 'partial', edit: build.run.edit }
    : { id: build?.id, kind: 'build' }

/** The edit a partial run applies, as Contract B names it: the plan's last edit, or the revision itself. */
const editNameOf = (row) =>
  typeof row.last_edit?.id === 'string' && row.last_edit.id.trim() !== ''
    ? row.last_edit.id
    : `revision-${row.plan.revision}`

const busyHeld = (build, now) => {
  const at = Date.parse(String(build?.busy?.at ?? ''))
  return Number.isFinite(at) && now - at < BUSY_CLAIM_MS
}

/**
 * Start the revision of the living plan `plan` from the build the site holds (`rebuildFrom`, the store's current ref).
 * Answers `{build}` (the build as it now stands, open) or a refusal: `NO_DRAFT`, `NOT_BUILT` (no site, or the site
 * holds no build yet), `BUILD_RUNNING` (the last run has not ended), `SITE_BUSY` (a restore or an abandon holds the
 * site), `STALE_PLAN`, `ENGINE_BUSY` (a step still works on the plan).
 * @param {{plan: {id: string, revision: number}, rebuildFrom: string | null, runId?: string, now?: () => number}} ask
 */
export async function reviseBuild(
  pool,
  accountId,
  { plan, rebuildFrom, runId = randomUUID(), now = Date.now }
) {
  let made = null
  const result = await changeDraft(pool, accountId, (row) => {
    const build = row.build
    if (!build?.site?.siteKey || !rebuildFrom) return { error: 'NOT_BUILT' }
    if (!build.endedAt) return { error: 'BUILD_RUNNING' }
    if (busyHeld(build, now())) return { error: 'SITE_BUSY' }
    if (!row.plan || !samePlan(row.plan, plan)) return { error: 'STALE_PLAN', revision: row.plan?.revision }
    if (row.engine?.state === 'running') return { error: 'ENGINE_BUSY' }
    const { history = [], ...rest } = build
    made = {
      ...rest,
      plan: { id: row.plan.id, revision: row.plan.revision },
      approvedAt: new Date(now()).toISOString(),
      snapshot: {
        plan: row.plan,
        lastEdit: row.last_edit ?? null,
        profile: row.needs_profile,
        research: row.plan_research ?? row.research
      },
      refusal: null,
      endedAt: null,
      result: null,
      run: { kind: 'partial', id: runId, edit: editNameOf(row), rebuildFrom },
      history: [
        ...history,
        {
          ...runOfBuild(build),
          plan: build.plan,
          approvedAt: build.approvedAt ?? null,
          endedAt: build.endedAt,
          result: build.result ?? null,
          ...(build.refusal ? { refusal: build.refusal } : {})
        }
      ]
    }
    return { build: made }
  })
  if (result.error) return result
  return { build: made }
}

/** Keep why the revision run could not start (`{code, status}`): the run ends stopped at once, nothing written. */
export function refuseRevision(pool, accountId, runId, refusal, now = Date.now) {
  return changeDraft(pool, accountId, (row) => {
    if (row.build?.run?.id !== runId) return { error: 'NOT_THIS_RUN' }
    return {
      build: { ...row.build, refusal, endedAt: new Date(now()).toISOString(), result: 'stopped' }
    }
  })
}

/**
 * Hold the site for a restore or an abandon (`kind`), so no revision starts and no second one runs at once. Answers
 * `{build}` or a refusal: `NOT_BUILT`, `BUILD_RUNNING`, `SITE_BUSY`.
 */
export async function claimSite(pool, accountId, kind, { id = randomUUID(), now = Date.now } = {}) {
  let build = null
  const result = await changeDraft(pool, accountId, (row) => {
    if (!row.build?.site?.siteKey) return { error: 'NOT_BUILT' }
    if (!row.build.endedAt) return { error: 'BUILD_RUNNING' }
    if (busyHeld(row.build, now())) return { error: 'SITE_BUSY' }
    build = { ...row.build, busy: { kind, id, at: new Date(now()).toISOString() } }
    return { build }
  })
  return result.error ? result : { build }
}

/**
 * End the hold of `id` and keep what the restore or abandon came to (none for a refused ask): `{kind, id, at, result: 'done' | 'stopped',
 * code?}` in `build.changes`, the newest last, so the chat can say it.
 */
export function releaseSite(pool, accountId, id, outcome, now = Date.now) {
  return changeDraft(pool, accountId, (row) => {
    if (row.build?.busy?.id !== id) return { error: 'NOT_THIS_CLAIM' }
    const { busy, ...build } = row.build
    // A refused ask (nothing to restore, nothing unfinished) changed nothing: only the hold ends.
    if (!outcome) return { build }
    const change = { kind: busy.kind, id, at: new Date(now()).toISOString(), ...outcome }
    return { build: { ...build, changes: [...(build.changes ?? []), change].slice(-20) } }
  })
}
