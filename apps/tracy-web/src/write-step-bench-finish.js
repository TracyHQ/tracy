// Wiring: the write step bench's `finish` command (#420, spec #418), which starts at the finisher on a site already
// written: the site of a run, its write report and its first site check result (the one `check` kept on the run, or a
// file). It calls the same finisher entry point as the live step 9 path (write-step/finisher/finisher.js) and runs the
// site check a final time through the same wiring as `check`. It sits beside app.js because it joins both domains.
// BENCH ONLY: it writes repairs to a site this bench made, never to a customer's.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { openKit } from './lib/template-kit-source.js'
import { checkLines } from './site-check/check-lines.js'
import { withReadBack } from './site-check/read-back.js'
import { isBenchSite } from './write-step/bench-site-creator.js'
import { runFinisher } from './write-step/finisher/finisher.js'
import { siteCheckOfRun } from './write-step-bench-site-check.js'

export const FINISH_USAGE = `  finish --run <runId> --account <email> --out <dir> [--check-file <path>]
                                              start at the finisher on the run's written site: shoot every page, find
                                              faults of the fault list, repair them through the write door, check each
                                              repair and undo the ones not better, then run the site check a final time.
                                              The first site check is the one check kept on the run, or --check-file.
                                              Writes repair-log.json and the crops into --out. Needs the finisher's three
                                              doors in /ops > Model & AI (deepseek-flash at max effort by default).`

/** The flags `finish` cannot run without, as the command line names them. */
export const FINISH_NEEDS = [
  ['run', '--run <runId>'],
  ['account', '--account'],
  ['out', '--out <dir>']
]

const refused = (d, message) => {
  d.err(message)
  return 1
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

/** @returns {Promise<number>} 0 when the finisher ran, 1 when it was refused or there is nothing to finish */
export async function finishRun(d, values) {
  const r = await d.runs.read(values.run)
  if (!r) return refused(d, `No run ${values.run}.`)
  if (r.status === 'running') return refused(d, `Run ${r.id} is still going.`)
  if (!r.report) return refused(d, `Run ${r.id} left no report.`)
  const sites = await d.store.list({ limit: 200 })
  const site = sites.find((s) => s.siteKey === r.report.site)
  if (!site || site.status !== 'ready' || !isBenchSite(site))
    return refused(d, `NOT_A_BENCH_SITE: ${r.report.site} is not a ready site this bench made.`)
  const cwd = d.cwd ?? process.cwd()
  let firstCheck = r.report.siteCheck ?? null
  if (values['check-file']) {
    try {
      firstCheck = await readJson(path.resolve(cwd, values['check-file']))
    } catch (error) {
      return refused(d, `--check-file cannot be read as JSON: ${error?.message ?? error}`)
    }
  }
  if (!firstCheck) return refused(d, `NO_FIRST_CHECK: run check --run ${r.id} first, or give --check-file.`)
  const kit = openKit(r.report.kit, d.index ? { index: d.index } : {})?.doc
  if (!kit) return refused(d, `No readable kit "${r.report.kit}".`)
  if (!d.makeFinisherDoors || !d.makeCapture)
    return refused(d, 'FINISHER_UNWIRED: this bench was given no finisher doors or no page capture.')

  const dir = path.resolve(cwd, values.out)
  await mkdir(dir, { recursive: true })
  const saveFile = async (name, data) => {
    const file = path.join(dir, name)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, data)
  }
  const baseline = d.baselines ? await d.baselines.read(r.report.contract) : null
  const finished = await runFinisher({
    door: d.makeDoor({ account: values.account, platform: 'joomla' }),
    siteKey: r.report.site,
    kit,
    report: r.report,
    firstCheck,
    doors: await d.makeFinisherDoors(),
    capture: await d.makeCapture(r.report.site),
    siteCheck: (report) => siteCheckOfRun(d, report, { account: values.account, baseline }),
    saveFile,
    ...(d.now ? { now: d.now } : {})
  })
  if (!finished.ok) return refused(d, `${finished.code}: ${finished.reason}`)
  // The build's site check is the final one, kept on the run with the repaired words as ordered.
  await d.runs.saveReport(r.id, withReadBack(finished.report, finished.finalCheck))
  await saveFile('site-check.json', `${JSON.stringify(finished.finalCheck, null, 2)}\n`)
  const { counts, records, costUsd, ms } = finished.log
  d.out(
    `finisher: ${counts.found} found, ${counts.kept} kept, ${counts.undone} undone, ${counts.dropped} dropped, ${counts.failed} failed, ${counts['logged-only']} logged only`
  )
  for (const record of records)
    d.out(
      `  ${record.outcome} page=${record.page ?? '-'} slot=${record.slot ?? '-'} kind=${record.faultKind ?? '-'}${record.reason ? `: ${record.reason}` : ''}${record.crops.by ? ` (crops: ${record.crops.by})` : ''}`
    )
  d.out(`repair log: repair-log.json, ${(ms / 1000).toFixed(1)} s, ${costUsd.toFixed(4)} USD`)
  for (const line of checkLines(finished.finalCheck)) d.out(line)
  const gained = finished.log.finalCheck.newBlocking.length
  d.out(
    `final site-check: ${finished.finalCheck.status}, ${gained ? `${gained} new blocking failure${gained === 1 ? '' : 's'}` : 'no new blocking failure'} since the first check`
  )
  return 0
}
