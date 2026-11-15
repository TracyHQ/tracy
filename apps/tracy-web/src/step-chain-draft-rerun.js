// `startRun` of the rebuild wiring (#612, `build-draft-rebuild-wiring.js`): start a step chain run on a site that is
// already built, with the brief the update door made (`{workflow, draftId, plan, rebuildFrom, buildRun}`,
// `build-draft/rebuild-progress.js revisionBriefOf`). The run goes through the SAME run frame as a first build
// (`sites/brief-build.js`, its `rerun`): the same setup-run hold of the webroot opened before the first write and
// closed after the last (one "Tracy setup" moment), every write under `applyFor(email, runId)`, the same progress on
// the site's brief row (`timings.chain`, which the build doors read back as Contract B), and the run's typed stops
// (docs/references/draft-revision-run.md, "Typed stops") kept on that row unchanged.
//
// 🔒 ONE RUN PER SITE AT A TIME. Three locks, each a compare and set: the build store's unfinished mark
// (`builds.unfinished` here, `builds.begin` by the run right before its first door call), the brief row put back to
// `queued` only from an ended state (`step-chain-draft-rerun-row.js`), and the frame's own run of the site. A site
// whose unfinished run is another one is refused `previous_run_unfinished`; the same run id again is its resume.
//
// The run's id is the update's own (`brief.buildRun`): its run record (`step-chain-draft-run-records.js`), its
// unfinished mark and its apply ids all carry it, so a resume after a crash reads back what the run saved.
import { builtSiteOf } from './step-chain-draft-rerun-row.js'

const refusal = (code, status) => ({ refusal: { code, status } })

/**
 * @param {{pool: import('pg').Pool, briefs: () => ({rerun?: Function} | null | undefined), builds: object,
 *   contractOf: (quickstart: string, version: string | null) => object | null, siteOf?: Function}} deps `briefs`: the
 *   run frame, read when a run starts (`app.siteBriefBuilds`); `builds`: the build store; `siteOf`: replaces the row read
 * @returns {(input: {accountId: string, email: string, siteKey: string, draftId: string, build: object,
 *   brief: object}) => Promise<{started: true} | {refusal: {code: string, status: number}}>}
 */
export function draftRunStarter({ pool, briefs, builds, contractOf, siteOf = builtSiteOf }) {
  return async function startRun({ accountId, email, siteKey, brief }) {
    const frame = briefs?.()
    if (typeof frame?.rerun !== 'function') return refusal('REVISION_RUN_UNAVAILABLE', 503)
    if (!brief?.rebuildFrom || typeof brief.buildRun !== 'string' || brief.buildRun === '')
      return refusal('REVISION_BRIEF_INVALID', 400)
    if (typeof builds?.unfinished !== 'function') return refusal('previous_build_doors_missing', 503)
    const ctx = { siteKey, accountId }
    const unfinished = await builds.unfinished(ctx)
    if (unfinished && unfinished.runId !== brief.buildRun) return refusal('previous_run_unfinished', 409)
    const site = await siteOf(pool, siteKey)
    if (!site) return refusal('NOT_BUILT', 409)
    if (String(site.account_id ?? '') !== String(accountId ?? '')) return refusal('NOT_THIS_ACCOUNT', 403)
    const started = await frame.rerun({
      siteKey,
      accountId,
      email,
      label: site.label,
      platform: site.platform,
      quickstart: site.quickstart,
      contract: contractOf?.(site.quickstart, site.quickstart_version ?? null) ?? null,
      brief,
      runId: brief.buildRun
    })
    if (started?.started === true) return { started: true }
    return refusal(String(started?.code ?? 'RUN_IN_PROGRESS').slice(0, 80), 409)
  }
}
