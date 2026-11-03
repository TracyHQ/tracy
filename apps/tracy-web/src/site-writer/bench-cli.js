// The site writer bench's command line (#329): the bench has no screen, so runs are started, read and cancelled from
// inside the tracy-web container (scripts/site-writer-bench.mjs). The worker in the server process picks the run up.
// Same command shape as the site planner bench. Exit codes: 0 done, 1 refused or not found, 2 wrong usage.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { turnOf } from '../lib/bench-turn.js'
import { balanceLine } from '../lib/provider-balance.js'
import { openKit } from '../lib/template-kit-source.js'
import { briefOfRevision, cancelWriterRun, startWriterRun } from './bench-control.js'
import { listLines, runFiles, standingLines, statusLines } from './bench-export.js'
import { listRuns, planOf, readRun } from './bench-store.js'

export const USAGE = `usage: node scripts/site-writer-bench.mjs <command>
  run --plan-file <path> --kit <ref> --brief-file <path>     queue a run on a plan and a brief JSON file
  run --plan-file <path> --kit <ref> --brief-revision <id>   queue a run on a plan and the brief of a WO revision
      [--by <label>]                      who started it (stored as cli:<label>)
      [--pages-per-turn <n|all>]          pages per writing turn, frozen with the run (default all: one turn)
  list [--limit <n>]                      the newest runs
  status <runId>                          state, step, turns, cost, balance, duration, checker summary
  get <runId> --out <dir>                 write every copy version, the corrections, check and failure list of each
                                          round, the failures still standing, run meta, plan, turns, the final
                                          site-copy.json and its Joomla contract mapping (mapping.json)
  cancel <runId>                          stop a run (a held run stops between model calls)
The model is the "Site writer" door in /ops > Model & AI: deepseek-flash on the deepseek provider by default.`

const LABEL = /^[A-Za-z0-9._@-]{1,64}$/

class Usage extends Error {}

/**
 * @param {string[]} argv the arguments after the script name
 * @param {{ pool: import('pg').Pool, secret: string, cwd?: string, out?: (line: string) => void,
 *   err?: (line: string) => void, index?: Map<string, object>, now?: () => number }} deps
 * @returns {Promise<number>} the exit code
 */
export async function runCli(argv, deps) {
  const io = { out: deps.out ?? console.log, err: deps.err ?? console.error }
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        kit: { type: 'string' },
        'plan-file': { type: 'string' },
        'brief-file': { type: 'string' },
        'brief-revision': { type: 'string' },
        by: { type: 'string' },
        'pages-per-turn': { type: 'string' },
        limit: { type: 'string' },
        out: { type: 'string' }
      }
    })
    const [command, runId] = positionals
    const command_ = COMMANDS[command]
    if (!command_) throw new Usage(command ? `unknown command "${command}"` : '')
    if (command_.needsId && !runId) throw new Usage(`${command} needs a run id`)
    return await command_.run({ ...deps, ...io }, values, runId)
  } catch (error) {
    if (error instanceof Usage || error?.code?.startsWith?.('ERR_PARSE_ARGS')) {
      if (error.message) io.err(error.message)
      io.err(USAGE)
      return 2
    }
    throw error
  }
}

const refused = (io, message) => {
  io.err(message)
  return 1
}

const COMMANDS = {
  run: { run: startRun },
  list: {
    run: async (d, values) => {
      for (const line of listLines(await listRuns(d.pool, { limit: values.limit }))) d.out(line)
      return 0
    }
  },
  status: {
    needsId: true,
    run: async (d, _values, runId) => {
      const run = await readRun(d.pool, runId)
      if (!run) return refused(d, `No run ${runId}.`)
      for (const line of statusLines(run, d.now?.() ?? Date.now())) d.out(line)
      return 0
    }
  },
  get: { needsId: true, run: getRun },
  cancel: {
    needsId: true,
    run: async (d, _values, runId) => {
      const cancelled = await cancelWriterRun(d.pool, runId)
      if (!cancelled.ok) return refused(d, cancelled.reason)
      const r = cancelled.run
      d.out(
        r.status === 'cancelled'
          ? `${r.id} cancelled`
          : `${r.id} asked to stop; it stops after the model call in flight`
      )
      return 0
    }
  }
}

// A JSON file named on the command line; only its name is ever stored (a path would name the machine).
async function readJsonFile(d, file, what) {
  let text
  try {
    text = await readFile(path.resolve(d.cwd ?? process.cwd(), file), 'utf8')
  } catch (error) {
    return { error: `Cannot read the ${what} file ${path.basename(file)} (${error.code ?? 'error'}).` }
  }
  try {
    return { value: JSON.parse(text), source: { kind: 'file', name: path.basename(file) } }
  } catch {
    return { error: `The ${what} file ${path.basename(file)} is not JSON.` }
  }
}

async function startRun(d, values) {
  const file = values['brief-file']
  const revision = values['brief-revision']
  if (!values['plan-file']) throw new Usage('run needs --plan-file')
  if (!values.kit) throw new Usage('run needs --kit')
  if (Boolean(file) === Boolean(revision))
    throw new Usage('run needs exactly one of --brief-file and --brief-revision')
  if (values.by !== undefined && !LABEL.test(values.by))
    throw new Usage('--by takes letters, digits and . _ @ - only, up to 64')
  const perTurn = values['pages-per-turn']
  if (perTurn !== undefined && perTurn !== 'all' && !/^[1-9][0-9]{0,3}$/.test(perTurn))
    throw new Usage('--pages-per-turn takes a positive whole number or "all"')
  const plan = await readJsonFile(d, values['plan-file'], 'plan')
  if (plan.error) return refused(d, plan.error)
  let brief
  if (file) {
    brief = await readJsonFile(d, file, 'brief')
    if (brief.error) return refused(d, brief.error)
  } else {
    const found = await briefOfRevision(d.pool, revision)
    if (!found.ok) return refused(d, `No WO revision ${revision}.`)
    brief = { value: found.brief, source: { kind: 'revision', revisionId: revision } }
  }
  const started = await startWriterRun({
    pool: d.pool,
    secret: d.secret,
    plan: plan.value,
    planSource: plan.source,
    brief: brief.value,
    briefSource: brief.source,
    kitRef: values.kit,
    startedBy: values.by ? `cli:${values.by}` : 'cli',
    ...(perTurn !== undefined ? { pagesPerTurn: perTurn === 'all' ? 'all' : Number(perTurn) } : {}),
    ...(d.index ? { index: d.index } : {})
  })
  if (!started.ok) return refused(d, `${started.code}: ${started.reason}`)
  d.out(started.run.id)
  return 0
}

async function getRun(d, values, runId) {
  if (!values.out) throw new Usage('get needs --out <dir>')
  const read = await readRun(d.pool, runId)
  if (!read) return refused(d, `No run ${runId}.`)
  const run = { ...read, ...(await planOf(d.pool, read.id)) }
  const { rows } = await d.pool.query('select * from site_writer_turn where run_id = $1 order by n', [run.id])
  const turns = rows.map((row) => ({ ...turnOf(row), round: row.round }))
  const kit = openKit(run.kitRef, d.index ? { index: d.index } : {})
  const dir = path.resolve(d.cwd ?? process.cwd(), values.out)
  await mkdir(dir, { recursive: true })
  const files = runFiles(run, turns, kit?.doc ?? null)
  for (const [name, text] of files) await writeFile(path.join(dir, name), text)
  d.out(`${files.length} files written: ${files.map(([name]) => name).join(', ')}`)
  if (run.balance) d.out(`balance ${balanceLine(run.balance)}`)
  const standing = standingLines(run)
  if (!standing.length) d.out(run.status === 'queued' ? 'still running' : 'no failures standing')
  else {
    d.out(`${standing.length} failures still standing after round ${run.rounds.at(-1)?.round ?? 0}:`)
    for (const line of standing) d.out(line)
  }
  return 0
}
