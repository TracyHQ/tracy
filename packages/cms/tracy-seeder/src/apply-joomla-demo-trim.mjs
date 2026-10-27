import { doorRefusal } from './apply-joomla-contract.mjs'

/** The Claude Cowork plugin release that first carries `demoTrim.*`. Named in the sentence an older site gets. */
export const DEMO_TRIM_COWORK = '0.16.8'

/** Calls one trim may take — batches plus retried lost answers — before it is a failure, not a wait. */
const MAX_CALLS = 20
/** Answers that are silence: the site never said yes or no, so the same request is asked again. */
const SILENT = new Set([
  'COMPONENT_BAD_RESPONSE',
  'COMPONENT_UNREACHABLE',
  'COWORK_WEB_BAD_RESPONSE',
  'COWORK_WEB_UNREACHABLE'
])

/**
 * Hide a sealed quickstart's own demo rows, through the contract door, before the copy is planned.
 *
 * The Claude Cowork plugin decides WHICH rows (its reviewed `demo-trim-map.json`); this only asks, one batch
 * per call, until it says there is nothing left. The request id is fixed per site, so a rerun or a
 * lost answer continues the same trim instead of starting a second one.
 *
 * Three outcomes that are not errors, because the customer's words still have to be written:
 * - `hidden`  — the demo is gone; `hidden` counts the rows this run moved.
 * - `none`    — the quickstart ships no demo-trim profile; nothing to hide.
 * - `skipped` — the site's Claude Cowork plugin predates the operation; the demo stays and the card says so.
 *
 * @returns {Promise<{status:'hidden',hidden:number}|{status:'none'}|{status:'skipped',reason:string}>}
 */
export async function trimJoomlaDemo({ apply, siteKey }) {
  const params = { operation: 'demoTrim.apply', apply_id: 'dtrim-seed', request_id: 'seed' }
  let hidden = 0
  for (let call = 0; call < MAX_CALLS; call++) {
    const result = await apply({ siteKey, action: 'content.contract', params })
    if (result?.ok) {
      hidden += Number(result.moved ?? 0)
      if (result.status === 'completed') return { status: 'hidden', hidden }
      continue
    }
    if (result?.error === 'unsupported') return { status: 'none' }
    const said = String(result?.message ?? result?.error ?? '')
    // Both shapes an older Claude Cowork plugin answers with: no operation, or no contract door at all.
    if (/Unknown contract operation|unknown action: content\.contract/.test(said))
      return {
        status: 'skipped',
        reason: `the site's Tracy component is older than ${DEMO_TRIM_COWORK}, so the demo posts stay visible`
      }
    if (typeof result?.code === 'string' && SILENT.has(result.code)) continue
    // 🔒 A TRIM FINISHED BEFORE THE SECOND LANGUAGE IS STILL FINISHED. The Claude Cowork plugin refuses to trim a
    // translated site before it looks whether anything is left to trim, so a site trimmed on its
    // first seed and then given es-ES could never be seeded again — measured 25/09/2026 on
    // `j-56xke6`. Only then is the (whole-site) plan read; a trim that is not complete still stops.
    if (/already has a second language/i.test(said)) {
      const plan = await apply({
        siteKey,
        action: 'content.contract',
        params: { operation: 'demoTrim.plan' }
      })
      if (plan?.ok && plan.status === 'complete' && Number(plan.remaining ?? 0) === 0)
        return { status: 'hidden', hidden }
    }
    throw new Error(doorRefusal(result, { writing: true }))
  }
  throw new Error(`Hiding the demo did not finish in ${MAX_CALLS} calls; run this step again to continue it`)
}
