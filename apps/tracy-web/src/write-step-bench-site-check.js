// Wiring: the write step bench's `check` command, and the site check of a run it shares with `finish`'s final check, so
// both measure the site the same way. It sits beside app.js because it joins the site check and the bench's dependencies.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { openKit } from './lib/template-kit-source.js'
import { checkLines } from './site-check/check-lines.js'
import { baselineOutcome } from './site-check/demo-baseline.js'
import { withReadBack } from './site-check/read-back.js'
import { runSiteCheck } from './site-check/site-check.js'

export const CHECK_USAGE = `  check --run <runId> --account <email> [--out <dir>] [--all-groups] [--site-pictures-file <path>]
                                              measure the run's site against its report (site-check/1): reads only,
                                              runs in this process, keeps the result on the run's report; --out also
                                              writes site-check.json. Exit 0 green, 1 red or unmeasured.
                                              --all-groups runs the page groups even when read-back is red (never green)
                                              --site-pictures-file: step 8's site-pictures.json, for alt-matches-picture
                                              (each printed alt against what the picture shows)`

/** The flags `check` cannot run without, as the command line names them. */
export const CHECK_NEEDS = [
  ['run', '--run <runId>'],
  ['account', '--account']
]

const refused = (d, message) => {
  d.err(message)
  return 1
}

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

/** @returns {Promise<number>} 0 green, 1 red or unmeasured, or refused */
export async function checkRun(d, values) {
  const r = await d.runs.read(values.run)
  if (!r) return refused(d, `No run ${values.run}.`)
  if (r.status === 'running') return refused(d, `Run ${r.id} is still going.`)
  if (!r.report) return refused(d, `Run ${r.id} left no report.`)
  // Step 8's manifest, whose seen sentences `alt-matches-picture` compares with the printed alts (alt-matches-picture.js).
  let pictures = null
  if (values['site-pictures-file']) {
    const file = path.resolve(d.cwd ?? process.cwd(), values['site-pictures-file'])
    try {
      pictures = JSON.parse(await readFile(file, 'utf8'))
    } catch (error) {
      return refused(d, `--site-pictures-file cannot be read as JSON: ${error?.message ?? error}`)
    }
  }
  // The demo baseline create-site settled for the quickstart version: a check never measures one, as the site is written.
  const baseline = d.baselines ? await d.baselines.read(r.report.contract) : null
  if (d.makeHost)
    d.out(
      baseline
        ? `baseline ${baselineOutcome({ measured: false })} for ${r.report.contract}`
        : `baseline: none stored for ${r.report.contract}, so the demo groups stay unmeasured (create-site measures it on an untouched site)`
    )
  const check = await siteCheckOfRun(d, r.report, {
    account: values.account,
    baseline,
    pictures,
    allGroups: values['all-groups'] === true
  })
  await d.runs.saveReport(r.id, withReadBack(r.report, check))
  if (values.out) {
    const dir = path.resolve(d.cwd ?? process.cwd(), values.out)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'site-check.json'), `${JSON.stringify(check, null, 2)}\n`)
  }
  for (const line of checkLines(check)) d.out(line)
  return check.status === 'green' ? 0 : 1
}
