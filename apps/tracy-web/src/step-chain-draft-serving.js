// The after-write check of a draft build (#575): a build that wrote a site that does not serve is never "done". The
// step chain read the written pages back as a visitor before it ended a build (its printed check); the draft write lost
// that. After the write, the site's root and the page item of every written page of the main menu are read through
// the site reader the product uses (`siteReader` in `app.js`): a root that does not answer (200, or a redirect) stops the build
// (`site_not_serving`), any other page that does not is listed (`page_not_serving`). Plain reads, no model.
import { isMainItem } from 'website-opportunities/domain/draft-write-skip.mjs'
import { draftError } from './step-chain-draft-source.js'

/** A page that answers a visitor: 200, or a redirect the site makes (a language prefix, a canonical address). */
const serves = (status) => Number.isInteger(status) && status >= 200 && status < 400

/**
 * @param {((path: string) => Promise<number | null>) | null | undefined} pageStatus the status a page answers, or null
 * @param {{ops: object[], mainMenu: string}} plan the write plan
 * @param {{ids?: Record<string, number | string>}} state the run record's state (the site ids of what the write made)
 * @param {object} report the write report: the pages that do not serve are added to its `skippedItems`
 * @returns {Promise<{checked: boolean, home?: number | null, pages?: number}>}
 */
export async function servingCheck(pageStatus, plan, state, report) {
  if (typeof pageStatus !== 'function') return { checked: false }
  const home = await pageStatus('/')
  if (!serves(home))
    throw Object.assign(
      draftError('site_not_serving', `the written site answers ${home ?? 'nothing'} at its root`, {
        status: home ?? null
      }),
      { report: { ...report, status: 'failed', failed: { op: null, code: 'site_not_serving' } } }
    )
  const items = plan.ops.filter((op) => isMainItem(op, plan.mainMenu) && state?.ids?.[op.key] !== undefined)
  for (const op of items) {
    const status = await pageStatus(`index.php?Itemid=${state.ids[op.key]}`)
    if (!serves(status))
      report.skippedItems?.push({
        code: 'page_not_serving',
        op: op.key,
        place: null,
        reason: String(status ?? 'unread'),
        at: 'site'
      })
  }
  return { checked: true, home, pages: items.length }
}
