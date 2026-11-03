// The picture bench's command line (#340): the bench has no screen, so runs are started, read and cancelled from
// inside the tracy-web container (scripts/site-pictures-bench.mjs). The worker in the server process picks the run up.
// Same command shape as the site planner and writer benches. Exit codes: 0 done, 1 refused or not found, 2 wrong usage.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { turnOf } from '../lib/bench-turn.js'
import { briefOfRevision, cancelPictureRun, startPictureRun } from './bench-control.js'
import { copyPictureFiles, listLines, runFiles, standingLines, statusLines } from './bench-export.js'
import { filesOf, inputsOf, listRuns, readRun } from './bench-store.js'
import { fileStore } from './file-store.js'

export const USAGE = `usage: node scripts/site-pictures-bench.mjs <command>
  run --plan-file <path> --kit <ref> --brief-file <path> --photos <dir>   queue a run on a plan, a brief JSON file
                                          and a folder of its owner photos, each file named by its sha256
  run --plan-file <path> --kit <ref> --brief-revision <id>   queue a run on a plan and the brief of a WO revision
      [--by <label>]                      who started it (stored as cli:<label>)
  list [--limit <n>]                      the newest runs
  status <runId>                          state, step, cost, duration, checker summary
  get <runId> --out <dir>                 write the manifest of each round and the final site-pictures.json, the
                                          picture files (files/), the file rows, the check and failure list of each
                                          round, the failures still standing, run meta, plan and turns
  cancel <runId>                          stop a run
A plan with frames that need a specific picture calls the picker through the "Picture picker" door (/ops, Model & AI);
one without calls no model. The drawer and the looker come later.`

const LABEL = /^[A-Za-z0-9._@-]{1,64}$/

class Usage extends Error {}

/**
 * @param {string[]} argv the arguments after the script name
 * @param {{ pool: import('pg').Pool, secret?: string, cwd?: string, storeDir?: string, out?: (line: string) => void,
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
        photos: { type: 'string' },
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
      const cancelled = await cancelPictureRun(d.pool, runId)
      if (!cancelled.ok) return refused(d, cancelled.reason)
      const r = cancelled.run
      d.out(
        r.status === 'cancelled'
          ? `${r.id} cancelled`
          : `${r.id} asked to stop; it stops after the step in flight`
      )
      return 0
    }
  }
}

const resolve = (d, file) => path.resolve(d.cwd ?? process.cwd(), file)

// A JSON file named on the command line; only its name is ever stored (a path would name the machine).
async function readJsonFile(d, file, what) {
  let text
  try {
    text = await readFile(resolve(d, file), 'utf8')
  } catch (error) {
    return { error: `Cannot read the ${what} file ${path.basename(file)} (${error.code ?? 'error'}).` }
  }
  try {
    return { value: JSON.parse(text), source: { kind: 'file', name: path.basename(file) } }
  } catch {
    return { error: `The ${what} file ${path.basename(file)} is not JSON.` }
  }
}

// The owner photo folder of a brief file: every regular file in it, by name. Only the folder's name is stored.
async function readPhotoFolder(d, dir) {
  try {
    const files = new Map()
    for (const entry of await readdir(resolve(d, dir), { withFileTypes: true }))
      if (entry.isFile() && !entry.name.startsWith('.'))
        files.set(entry.name, await readFile(path.join(resolve(d, dir), entry.name)))
    return { value: { name: path.basename(resolve(d, dir)), files } }
  } catch (error) {
    return { error: `Cannot read the photo folder ${path.basename(dir)} (${error.code ?? 'error'}).` }
  }
}

async function startRun(d, values) {
  const file = values['brief-file']
  const revision = values['brief-revision']
  if (!values['plan-file']) throw new Usage('run needs --plan-file')
  if (!values.kit) throw new Usage('run needs --kit')
  if (Boolean(file) === Boolean(revision))
    throw new Usage('run needs exactly one of --brief-file and --brief-revision')
  if (file && !values.photos) throw new Usage('run --brief-file needs --photos <dir>')
  if (revision && values.photos) throw new Usage('--photos goes with --brief-file only')
  if (values.by !== undefined && !LABEL.test(values.by))
    throw new Usage('--by takes letters, digits and . _ @ - only, up to 64')
  const plan = await readJsonFile(d, values['plan-file'], 'plan')
  if (plan.error) return refused(d, plan.error)
  let brief
  let photos = null
  if (file) {
    brief = await readJsonFile(d, file, 'brief')
    if (brief.error) return refused(d, brief.error)
    const folder = await readPhotoFolder(d, values.photos)
    if (folder.error) return refused(d, folder.error)
    photos = folder.value
  } else {
    const found = await briefOfRevision(d.pool, revision)
    if (!found.ok) return refused(d, `No WO revision ${revision}.`)
    brief = { value: found.brief, source: { kind: 'revision', revisionId: revision } }
  }
  const started = await startPictureRun({
    pool: d.pool,
    secret: d.secret,
    plan: plan.value,
    planSource: plan.source,
    brief: brief.value,
    briefSource: brief.source,
    kitRef: values.kit,
    startedBy: values.by ? `cli:${values.by}` : 'cli',
    photos,
    storeDir: d.storeDir,
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
  const run = { ...read, ...(await inputsOf(d.pool, read.id)) }
  const { rows } = await d.pool.query('select * from site_picture_turn where run_id = $1 order by n', [
    run.id
  ])
  const turns = rows.map((row) => ({ ...turnOf(row), round: row.round }))
  const fileRows = await filesOf(d.pool, run.id)
  const dir = resolve(d, values.out)
  await mkdir(dir, { recursive: true })
  const files = runFiles(run, turns, fileRows)
  for (const [name, text] of files) await writeFile(path.join(dir, name), text)
  const missing = await copyPictureFiles(fileStore(d.storeDir), fileRows, dir)
  d.out(`${files.length} files written: ${files.map(([name]) => name).join(', ')}`)
  d.out(`${fileRows.length - missing.length} picture files copied to files/`)
  if (missing.length)
    d.err(`${missing.length} picture files are no longer in the file store: ${missing.join(', ')}`)
  const standing = standingLines(run)
  if (!standing.length) d.out(run.status === 'queued' ? 'still running' : 'no failures standing')
  else {
    d.out(`${standing.length} failures still standing after round ${run.rounds.at(-1)?.round ?? 0}:`)
    for (const line of standing) d.out(line)
  }
  return missing.length ? 1 : 0
}
