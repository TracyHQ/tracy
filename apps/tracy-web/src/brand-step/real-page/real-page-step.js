// The real-page check as the brand worker runs it (brand bench, #322): after the gate accepts a brand file, or after
// the safe version, write it on the trial site, capture the real pages, judge them, keep the pictures in the run
// folder (`get` downloads the whole folder) and return the verdict the run stores in `real_page_verdict`.
//
// A write error (or a capture error) stops the check with its reason: the verdict is `stopped`, the run keeps its brand
// file and still succeeds, because the brand step's output is the brand file, not the trial site.
import { createSpend } from '../brand-spend.js'
import { setProgress } from '../brand-store.js'
import { judgeRealPage } from './real-page-judge.js'

/**
 * @param {{ pool: import('pg').Pool, realPage: { write: Function, capture: Function, palette?: string[] } }} deps
 *   `write({ brandFile, files, kit })` writes the trial site; `capture()` takes the real-page views of it
 * @param {{ row: any, ready: any, brandFile: object, leaseToken: string | null, must: (p: Promise<boolean>) => Promise<void> }} input
 */
export async function realPageCheck(deps, { row, ready, brandFile, leaseToken, must }) {
  const at = new Date().toISOString()
  const stopped = (stage, reason, extra = {}) => ({
    verdict: 'stopped',
    stage,
    reason: String(reason),
    ...extra,
    at
  })
  await must(setProgress(deps.pool, { runId: row.id, step: 'real-page-check', round: row.round, leaseToken }))
  const files = ready.ctx.files
  let wrote
  try {
    wrote = await deps.realPage.write({ brandFile, files, kit: ready.kit })
  } catch (error) {
    return stopped(error?.stage ?? 'write', error?.reason ?? error?.message ?? error)
  }
  let captures
  try {
    captures = await deps.realPage.capture({ site: wrote.site })
  } catch (error) {
    return stopped('capture', error?.reason ?? error?.message ?? error, { writes: wrote.written })
  }
  const saved = []
  for (const v of captures.views)
    if (v.png) saved.push(files.write(`real-page/${v.id}-${v.scheme}.png`, v.png))
  const spend = createSpend({
    pool: deps.pool,
    runId: row.id,
    capUsd: row.harness.capUsd,
    round: () => row.round,
    leaseToken
  })
  try {
    const judged = await judgeRealPage({
      captures,
      brandFile,
      kit: ready.kit,
      palette: deps.realPage.palette,
      review: ready.reviewFor({ spend, tool: () => 'real_page_look' })
    })
    const verdict = {
      ...judged,
      site: wrote.site.label,
      url: captures.url,
      writes: wrote.written,
      files: saved,
      views: captures.views.map((v) => ({
        id: v.id,
        scheme: v.scheme,
        ok: v.ok,
        error: v.error ?? null,
        facts: v.facts ?? null
      })),
      icons: captures.icons,
      at
    }
    files.write('real-page/verdict.json', Buffer.from(JSON.stringify(verdict, null, 2)))
    return verdict
  } catch (error) {
    return stopped('judge', error?.message ?? error, { writes: wrote.written, files: saved })
  }
}

/**
 * The run's `end` with the real-page check in front of a success that has a brand file: the verdict is stored in
 * `real_page_verdict`; any failure of the check itself is a `stopped` verdict, never a failed run.
 */
export const endWithRealPage =
  (deps, { row, ready, leaseToken, must, end, LeaseLost }) =>
  async (status, error = null, fields = {}) => {
    if (status !== 'succeeded' || !deps.realPage || !fields.brand_file) return end(status, error, fields)
    const verdict = await realPageCheck(deps, {
      row,
      ready,
      brandFile: JSON.parse(fields.brand_file),
      leaseToken,
      must
    }).catch((e) => {
      if (e instanceof LeaseLost) throw e
      return {
        verdict: 'stopped',
        stage: 'check',
        reason: String(e?.message ?? e),
        at: new Date().toISOString()
      }
    })
    return end(status, error, { ...fields, real_page_verdict: JSON.stringify(verdict) })
  }
