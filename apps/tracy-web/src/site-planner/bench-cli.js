// The site planner bench's command line (ADR 0041, #301): the bench has no screen, so runs are started, read and
// cancelled from inside the tracy-web container (scripts/site-planner-bench.mjs). The worker in the server process
// picks the run up. Exit codes: 0 done, 1 refused or not found, 2 wrong usage.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { briefOfRevision, cancelBenchRun, startBenchRun } from './bench-control.js'
import { listLines, runFiles, standingLines, statusLines } from './bench-export.js'
import { listRuns, readRun, turnOf } from './bench-store.js'
import { openKit, readableKits } from './kit-source.js'
import { balanceLine } from './provider-balance.js'

export const USAGE = `usage: node scripts/site-planner-bench.mjs <command>
  kits                                    list the kits the server can read, and whether their images are ready
  run --kit <ref> --brief-file <path>     queue a run on a brief JSON file
  run --kit <ref> --brief-revision <id>   queue a run on the brief of a WO revision
      [--by <label>]                      who started it (stored as cli:<label>)
  list [--limit <n>]                      the newest runs
  status <runId>                          state, step, turns, cost, duration, checker summary
  get <runId> --out <dir>                 write every plan version, the check and failure list of each round,
                                          the failures still standing, run meta and turns
  cancel <runId>                          stop a run (a held run stops between model calls)
The model is the "Site planner" door in /ops > Model & AI: deepseek-v4-pro on the deepseek provider by default
(text only: the kit needs a current look for every shot); anthropic/claude-sonnet-5.5 or anthropic/claude-opus-5.5
on the openrouter provider also run.`

const LABEL = /^[A-Za-z0-9._@-]{1,64}$/

class Usage extends Error {}

/**
 * @param {string[]} argv the arguments after the script name
 * @param {{ pool: import('pg').Pool, secret: string, kitImages: { ensure: Function }, cwd?: string,
 *   out?: (line: string) => void, err?: (line: string) => void, index?: Map<string, object>,
 *   now?: () => number }} deps `kitImages`: the kit images of this server (kit-images.js kitImagesFor)
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
        'brief-file': { type: 'string' },
        'brief-revision': { type: 'string' },
        by: { type: 'string' },
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
  kits: {
    run: async (d) => {
      const where = d.index ? { index: d.index } : {}
      const kits = readableKits(where)
      if (!kits.length) d.out('no readable kits')
      for (const k of kits) {
        // The first look at a kit version downloads and checks its image zip; later looks read the cache.
        const images = await d.kitImages.ensure(openKit(k.ref, where))
        const state = images.ok ? 'images ready' : `images not usable: ${images.code}: ${images.reason}`
        d.out(
          `${k.ref}  ${k.platform}  ${k.template.name} ${k.template.version}  ${k.images} images  ${state}`
        )
      }
      return 0
    }
  },
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
      const cancelled = await cancelBenchRun(d.pool, runId)
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

async function startRun(d, values) {
  const file = values['brief-file']
  const revision = values['brief-revision']
  if (!values.kit) throw new Usage('run needs --kit')
  if (Boolean(file) === Boolean(revision))
    throw new Usage('run needs exactly one of --brief-file and --brief-revision')
  if (values.by !== undefined && !LABEL.test(values.by))
    throw new Usage('--by takes letters, digits and . _ @ - only, up to 64')
  let brief
  let briefSource
  if (file) {
    let text
    try {
      text = await readFile(path.resolve(d.cwd ?? process.cwd(), file), 'utf8')
    } catch (error) {
      return refused(d, `Cannot read the brief file ${path.basename(file)} (${error.code ?? 'error'}).`)
    }
    try {
      brief = JSON.parse(text)
    } catch {
      return refused(d, `The brief file ${path.basename(file)} is not JSON.`)
    }
    // Only the file's name is stored: a path would name the machine it was run on.
    briefSource = { kind: 'file', name: path.basename(file) }
  } else {
    const found = await briefOfRevision(d.pool, revision)
    if (!found.ok) return refused(d, `No WO revision ${revision}.`)
    brief = found.brief
    briefSource = { kind: 'revision', revisionId: revision }
  }
  const started = await startBenchRun({
    pool: d.pool,
    secret: d.secret,
    brief,
    briefSource,
    kitRef: values.kit,
    startedBy: values.by ? `cli:${values.by}` : 'cli',
    kitImages: d.kitImages,
    ...(d.index ? { index: d.index } : {})
  })
  if (!started.ok) return refused(d, `${started.code}: ${started.reason}`)
  d.out(started.run.id)
  return 0
}

async function getRun(d, values, runId) {
  if (!values.out) throw new Usage('get needs --out <dir>')
  const run = await readRun(d.pool, runId)
  if (!run) return refused(d, `No run ${runId}.`)
  const { rows } = await d.pool.query('select * from site_planner_turn where run_id = $1 order by n', [
    run.id
  ])
  const turns = rows.map((row) => ({ ...turnOf(row), round: row.round }))
  const dir = path.resolve(d.cwd ?? process.cwd(), values.out)
  await mkdir(dir, { recursive: true })
  const files = runFiles(run, turns)
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
