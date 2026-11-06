// Wiring: the site check of a write step bench run, shared by `check` and by `finish`'s final check, so both measure the
// site the same way. It sits beside app.js because it joins the site check and the bench's dependencies.
import { openKit } from './lib/template-kit-source.js'
import { runSiteCheck } from './site-check/site-check.js'

/**
 * @param {object} d the bench's dependencies (write-step-bench-cli.js)
 * @param {object} report the run's write report
 * @param {{ account: string, baseline: object | null, pictures?: object | null, allGroups?: boolean }} options
 */
export async function siteCheckOfRun(d, report, { account, baseline, pictures = null, allGroups = false }) {
  return runSiteCheck({
    door: d.makeDoor({ account, platform: 'joomla' }),
    report,
    // The page groups need the site's host and the demo baseline of the quickstart; both are optional (site-check.js).
    ...(d.makeHost ? { host: await d.makeHost(report.site) } : {}),
    // The pages as a visitor reads them, for `written-not-printed` (written-not-printed.js).
    ...(d.pageHtml ? { pageHtml: (path) => d.pageHtml({ siteKey: report.site, path }) } : {}),
    baseline,
    kit: openKit(report.kit, d.index ? { index: d.index } : {})?.doc ?? null,
    pictures,
    allGroups,
    ...(d.now ? { now: d.now } : {})
  })
}
