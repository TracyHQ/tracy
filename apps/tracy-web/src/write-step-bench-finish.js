// Wiring: the write step bench's `finish` command (#420, spec #418), which starts at the finisher on a site already
// written: the site of a run, its write report and its first site check result (the one `check` kept on the run, or a
// file). It calls the same finisher entry point as the live step 9 path (write-step/finisher/finisher.js) and runs the
// site check a final time through the same wiring as `check`. It sits beside app.js because it joins both domains.
// BENCH ONLY: it writes repairs to a site this bench made, never to a customer's.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { openContentMap } from './lib/content-map-source.js'
import { joomlaAddresses } from './lib/quickstart-releases.js'
import { openKit } from './lib/template-kit-source.js'
import { checkLines } from './site-check/check-lines.js'
import { withReadBack } from './site-check/read-back.js'
import { isBenchSite } from './write-step/bench-site-creator.js'
import { runFinisher } from './write-step/finisher/finisher.js'
import { firstCheckNow, finisherSources, mergeLine } from './write-step-bench-finish-sources.js'
import { siteCheckOfRun } from './write-step-bench-site-check.js'

export const FINISH_USAGE = `  finish --run <runId> --account <email> --out <dir> [--check-file <path> | --check-now [--all-groups]] [--site-pictures-file <path>]
         [--brief-file <path>] [--copy-file <path>]
                                              start at the finisher on the run's written site: shoot every page, find
                                              faults of the fault list, repair them through the write door, check each
                                              repair and undo the ones not better, then run the site check a final time.
                                              The first site check is the one check kept on the run, or --check-file;
                                              the final one runs with its options (every group when it ran every group).
                                              --check-now: run the first site check now, alongside the finder, and
                                              write it as first-site-check.json; its failures merge with the finder's
                                              --site-pictures-file: step 8's site-pictures.json, as the first check had it
                                              --brief-file, --copy-file: the run's brief and site copy, the only places a
                                              repair takes new words from (with step 8's picture descriptions)
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
  const checkNow = values['check-now'] === true
  if (!firstCheck && !checkNow)
    return refused(d, `NO_FIRST_CHECK: run check --run ${r.id} first, or give --check-file or --check-now.`)
  const files = {}
  for (const [flag, name] of [
    ['site-pictures-file', 'pictures'],
    ['brief-file', 'brief'],
    ['copy-file', 'copy']
  ]) {
    if (!values[flag]) continue
    try {
      files[name] = await readJson(path.resolve(cwd, values[flag]))
    } catch (error) {
      return refused(d, `--${flag} cannot be read as JSON: ${error?.message ?? error}`)
    }
  }
  const pictures = files.pictures ?? null
  // The final check measures as the first did, so the two can be compared group by group.
  const allGroups = checkNow ? values['all-groups'] === true : firstCheck.allGroups === true
  const kit = openKit(r.report.kit, d.index ? { index: d.index } : {})?.doc
  const contentMap = openContentMap(r.report.kit, d.index ? { index: d.index } : {})?.doc ?? null
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
  // A bench site is Joomla with rewriting off: a page answers at /index.php/<path>, so each layout carries that address and
  // the host still names its frames by the path (lib/quickstart-releases.js).
  const shoot = await d.makeCapture(r.report.site)
  const capture = (layouts, opts) => shoot(joomlaAddresses(layouts, 'joomla'), opts)
  // The first check started now runs beside the finder; the template demo's block shots and the live page reader feed the
  // merge of its failures with the finder's faults (write-step-bench-finish-sources.js).
  const first = checkNow
    ? firstCheckNow(() =>
        siteCheckOfRun(d, r.report, { account: values.account, baseline, pictures, allGroups })
      )
    : null
  const sources = await finisherSources(d, { report: r.report, kitRef: r.report.kit })
  const finished = await runFinisher({
    door: d.makeDoor({ account: values.account, platform: 'joomla' }),
    siteKey: r.report.site,
    kit,
    report: r.report,
    firstCheck: first ? first.check : firstCheck,
    ...sources.input,
    doors: await d.makeFinisherDoors(),
    capture,
    siteCheck: (report) =>
      siteCheckOfRun(d, report, { account: values.account, baseline, pictures, allGroups }),
    saveFile,
    contentMap,
    facts: files,
    ...(d.now ? { now: d.now } : {})
  })
  if (!finished.ok) return refused(d, `${finished.code}: ${finished.reason}`)
  if (first) await first.report(d, finished.firstCheck, saveFile)
  for (const line of sources.lines) d.out(line)
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
  if (finished.log.merge) d.out(mergeLine(finished.log.merge))
  d.out(`repair log: repair-log.json, ${(ms / 1000).toFixed(1)} s, ${costUsd.toFixed(4)} USD`)
  for (const line of checkLines(finished.finalCheck)) d.out(line)
  d.out(
    `final site-check options: ${allGroups ? 'all groups (as the first check)' : 'stops at a red group (as the first check)'}, ${pictures ? 'with' : 'without'} site pictures`
  )
  const { newBlocking, compared, notCompared } = finished.log.finalCheck
  const gained = newBlocking.length
  d.out(
    `final site-check: ${finished.finalCheck.status}, ${gained ? `${gained} new blocking failure${gained === 1 ? '' : 's'}` : 'no new blocking failure'} in the ${compared.length} groups both checks ran${notCompared.length ? `; not compared: ${notCompared.join(', ')}` : ''}`
  )
  return 0
}
