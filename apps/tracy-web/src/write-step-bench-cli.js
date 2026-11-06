// Wiring: its check and finish commands (write-step-bench-site-check.js, write-step-bench-finish.js) join the site check
// and the write step, so it sits beside app.js, outside the domain directories, which import only lib/ and db/
// (module-graph.test.mjs).
// BENCH ONLY. The write step bench's command line (ADR 0044), with the commands of the other benches. A run executes in
// this process and needs no worker in the server; other shells read it or stop it through its row (write-run-store.js).
// Exit codes: 0 done, 1 refused, stopped, cancelled or not found, 2 wrong usage.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { openKit, readableKits } from './lib/template-kit-source.js'
import { baselineOutcome, ensureBaseline } from './site-check/demo-baseline.js'
import { openContentMap } from './lib/content-map-source.js'
import { isBenchSite } from './write-step/bench-site-creator.js'
import { runCli as runSiteCli, SITE_COMMANDS, USAGE as SITE_USAGE } from './write-step/bench-site-cli.js'
import { runWriteStep } from './write-step/write-step.js'
import { CHECK_NEEDS, CHECK_USAGE, checkRun } from './write-step-bench-site-check.js'
import { FINISH_NEEDS, FINISH_USAGE, finishRun } from './write-step-bench-finish.js'

export const USAGE = `usage: node scripts/write-step-bench.mjs <command>
  run --site <key> --kit <ref> --plan-file <path> --copy-file <path> --account <email>
      [--brief-file <path>] [--brand-file <path>] [--pictures-file <path>] [--by <label>]    write the frozen files to a site this bench made; runs in this process,
                                              prints the run id first and the counts last. On a site written before, it
                                              compares with the last report and writes only what differs
  list [--limit <n>]                          the newest runs
  status <runId>                              state, phase, counts and the cause of a stop
  get <runId> --out <dir>                     write the run's site-write-report.json
  cancel <runId>                              stop a run between phases
${CHECK_USAGE}
${FINISH_USAGE}
${SITE_USAGE}`

const LABEL = /^[A-Za-z0-9._@-]{1,64}$/
class Usage extends Error {}

const refused = (d, message) => {
  d.err(message)
  return 1
}
const countsLine = (c) =>
  `${c.written} written, ${c.hidden} hidden, ${c.skipped} skipped, ${c.failed} failed${c.refused ? `, ${c.refused} refused` : ''}${c.unchanged ? `, ${c.unchanged} unchanged` : ''}`
const printedLine = ({ counts, viaFallback }) =>
  `printed: ${counts.printed} of ${counts.checked} printed, ${counts.viaFallback} via fallback${viaFallback.length ? ` (${viaFallback.map((f) => f.slot).join(', ')})` : ''}, ${counts.notPrinted} not printed, ${counts.writes} fallback writes`
const routesLine = (routes) => {
  const count = (outcome) => routes.filter((r) => r.outcome === outcome).length
  const refused = routes.filter((r) => r.outcome === 'refused')
  return `routes: ${count('written')} renamed, ${count('already')} already at their slug, ${refused.length} refused${refused.length ? ` (${refused.map((r) => `${r.pageId}: ${r.reason}`).join('; ')})` : ''}`
}
const causeOf = (r) => (r.code ? `${r.code}: ${r.reason}` : '')

/**
 * @param {string[]} argv
 * @param {{ runs: object, store: object, makeDoor: (input: {account: string, platform: string}) => object,
 *   index?: Map<string, object>, out?: (line: string) => void, err?: (line: string) => void, now?: () => number,
 *   sleep?: (ms: number) => Promise<void>, cwd?: string }} deps
 * @returns {Promise<number>}
 */
export async function runCli(argv, deps) {
  const io = { out: deps.out ?? console.log, err: deps.err ?? console.error }
  if (SITE_COMMANDS.has(argv[0])) return runSiteCli(argv, { ensureBaseline, baselineOutcome, ...deps })
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        site: { type: 'string' },
        kit: { type: 'string' },
        'plan-file': { type: 'string' },
        'copy-file': { type: 'string' },
        'brief-file': { type: 'string' },
        'brand-file': { type: 'string' },
        'pictures-file': { type: 'string' },
        account: { type: 'string' },
        by: { type: 'string' },
        limit: { type: 'string' },
        out: { type: 'string' },
        run: { type: 'string' },
        'all-groups': { type: 'boolean' },
        'site-pictures-file': { type: 'string' },
        'check-file': { type: 'string' },
        'check-now': { type: 'boolean' }
      }
    })
    const [command, runId] = positionals
    const found = COMMANDS[command]
    if (!found) throw new Usage(command ? `unknown command "${command}"` : '')
    if (found.needsId && !runId) throw new Usage(`${command} needs a run id`)
    for (const [flag, name] of found.needs ?? [])
      if (!values[flag]) throw new Usage(`${command} needs ${name}`)
    return await found.run({ ...deps, ...io }, values, runId)
  } catch (error) {
    if (error instanceof Usage || error?.code?.startsWith?.('ERR_PARSE_ARGS')) {
      if (error.message) io.err(error.message)
      io.err(USAGE)
      return 2
    }
    throw error
  }
}

/** The flags `run` cannot run without, as the command line names them. */
const RUN_NEEDS = [
  ['site', '--site'],
  ['kit', '--kit'],
  ['plan-file', '--plan-file'],
  ['copy-file', '--copy-file'],
  ['account', '--account']
]

const COMMANDS = {
  run: { needs: RUN_NEEDS, run: startRun },
  list: { run: listRuns },
  status: { needsId: true, run: statusOf },
  get: { needsId: true, run: getReport },
  cancel: { needsId: true, run: cancelRun },
  check: { needs: CHECK_NEEDS, run: checkRun },
  finish: { needs: FINISH_NEEDS, run: finishRun }
}

async function startRun(d, values) {
  if (values.by !== undefined && !LABEL.test(values.by))
    throw new Usage('--by takes letters, digits and . _ @ - only, up to 64')
  const where = d.index ? { index: d.index } : {}
  const kits = readableKits(where)
  const listed = kits.find((k) => k.ref === values.kit)
  const opened = listed ? openKit(values.kit, where) : null
  if (!opened)
    return refused(
      d,
      `No readable kit "${values.kit}". Readable kits: ${kits.map((k) => k.ref).join(', ') || 'none'}.`
    )
  if (listed.platform && listed.platform !== 'joomla')
    return refused(
      d,
      `KIT_PLATFORM: the write step writes Joomla sites only; ${values.kit} is ${listed.platform}.`
    )
  const map = openContentMap(values.kit, where)
  if (map?.invalid) return refused(d, `KIT_CONTENT_MAP: ${map.invalid}.`)
  // The write step does not care how its site was made; this command only ever writes a site the bench made itself.
  const sites = await d.store.list({ limit: 200 })
  const site = sites.find((r) => r.siteKey === values.site)
  if (!site || site.status !== 'ready' || !isBenchSite(site))
    return refused(d, `NOT_A_BENCH_SITE: ${values.site} is not a ready site this bench made.`)

  // What the last run on this site left is what this one compares with. A run that left no report wrote nobody knows what.
  const lastRun = await d.runs.latestEnded(values.site)
  if (lastRun && !lastRun.report)
    return refused(
      d,
      `NEEDS_NEW_SITE: run ${lastRun.id} on ${values.site} ended ${lastRun.status} with no report, so what the site holds is not known. This needs a new site.`
    )
  const begun = await d.runs.begin({
    siteKey: values.site,
    kit: values.kit,
    startedBy: values.by ? `cli:${values.by}` : 'cli'
  })
  if (!begun.run)
    return refused(d, `RUN_ACTIVE: ${values.site} already has run ${begun.active?.id ?? '(unknown)'} going.`)
  const { id } = begun.run
  d.out(id)
  const inCwd = (file) => path.resolve(d.cwd ?? process.cwd(), file)
  let report
  try {
    report = await runWriteStep({
      door: d.makeDoor({ account: values.account, platform: 'joomla' }),
      siteKey: values.site,
      kit: { ref: values.kit, doc: opened.doc },
      contentMap: map?.doc ?? null,
      last: lastRun?.report ?? null,
      lastRun: lastRun?.id ?? null,
      files: {
        plan: inCwd(values['plan-file']),
        copy: inCwd(values['copy-file']),
        ...(values['brief-file'] ? { brief: inCwd(values['brief-file']) } : {}),
        ...(values['brand-file'] ? { brand: inCwd(values['brand-file']) } : {}),
        ...(values['pictures-file'] ? { pictures: inCwd(values['pictures-file']) } : {})
      },
      ...(d.templateSheets ? { templateSheets: d.templateSheets } : {}),
      ...(d.templateFiles ? { templateFiles: d.templateFiles } : {}),
      ...(d.pageHtml ? { pageHtml: d.pageHtml } : {}),
      onPhase: (phase) => d.runs.phase(id, phase),
      onNoWayOut: async (named) => {
        if (named.length) d.out(`no way to leave: ${named.map((n) => `${n.slot}: ${n.reason}`).join('; ')}`)
      },
      isCancelled: () => d.runs.cancelRequested(id),
      ...(d.now ? { now: d.now } : {}),
      ...(d.sleep ? { sleep: d.sleep } : {})
    })
  } catch (error) {
    const reason = String(error?.message ?? error)
    await d.runs.finish(id, { status: 'stopped', code: 'CRASHED', reason })
    return refused(d, `stopped CRASHED: ${reason}`)
  }
  await d.runs.finish(id, {
    status: report.status,
    code: report.cause?.code ?? null,
    reason: report.cause?.reason ?? null,
    report
  })
  if (report.status === 'done') {
    if (report.printed) d.out(printedLine(report.printed))
    if (report.routes?.length) d.out(routesLine(report.routes))
    d.out(`done: ${countsLine(report.counts)}${report.rewrite ? ` in ${report.timings.total} ms` : ''}`)
    return 0
  }
  return refused(
    d,
    report.status === 'cancelled'
      ? `cancelled: ${countsLine(report.counts)}`
      : `stopped ${report.cause.code}: ${report.cause.reason}`
  )
}

async function listRuns(d, values) {
  const limit = values.limit === undefined ? 20 : Number(values.limit)
  if (!Number.isInteger(limit) || limit < 1) throw new Usage('--limit takes a positive whole number')
  for (const r of await d.runs.list({ limit }))
    d.out(
      [r.id, r.status, r.siteKey, r.kit, r.report ? countsLine(r.report.counts) : r.phase, causeOf(r)]
        .join('  ')
        .trim()
    )
  return 0
}

async function statusOf(d, _values, id) {
  const r = await d.runs.read(id)
  if (!r) return refused(d, `No run ${id}.`)
  d.out(`run ${r.id}`)
  d.out(`status ${r.status}`)
  d.out(`phase ${r.phase}`)
  d.out(`site ${r.siteKey}`)
  d.out(`kit ${r.kit}`)
  if (r.cancelRequested) d.out('cancel requested')
  if (r.report) d.out(`slots ${countsLine(r.report.counts)}`)
  if (r.code) d.out(`cause ${causeOf(r)}`)
  return 0
}

async function getReport(d, values, id) {
  if (!values.out) throw new Usage('get needs --out <dir>')
  const r = await d.runs.read(id)
  if (!r) return refused(d, `No run ${id}.`)
  if (!r.report)
    return refused(d, r.status === 'running' ? `Run ${id} is still going.` : `Run ${id} left no report.`)
  const dir = path.resolve(d.cwd ?? process.cwd(), values.out)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'site-write-report.json'), `${JSON.stringify(r.report, null, 2)}\n`)
  d.out('1 file written: site-write-report.json')
  return 0
}

async function cancelRun(d, _values, id) {
  const r = await d.runs.requestCancel(id)
  if (!r) return refused(d, `No run ${id}.`)
  if (r.status === 'running') {
    d.out(`${r.id} asked to stop; it stops at its next phase`)
    return 0
  }
  if (r.status === 'cancelled' && r.report === null && r.phase === 'done') {
    d.out(`${r.id} had gone silent and is now cancelled`)
    return 0
  }
  return refused(d, `Run ${id} has already ended (${r.status}).`)
}
