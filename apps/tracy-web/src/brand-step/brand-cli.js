// The brand bench's command line (brand step trial bench, #320): the bench has no screen, so runs are started, read and
// cancelled from inside the tracy-web container (scripts/brand-bench.mjs), the way the site planner bench is. The
// worker in the server process picks the run up. Exit codes: 0 done, 1 refused or not found, 2 wrong usage.
import { parseArgs } from 'node:util'
import { openKit, readableKits } from '../lib/template-kit-source.js'
import { callsOf } from './brand-call-store.js'
import { brandKitProblem, cancelBrandRun } from './brand-control.js'
import { listLines, statusLines } from './brand-export.js'
import { getRunCommand, refused, startRunCommand, Usage } from './brand-cli-run.js'
import { listRuns, readRun } from './brand-store.js'

export const USAGE = `usage: node scripts/brand-bench.mjs <command>
  kits                                    list the kits the brand step can use, and whether it can run on them
  run --kit <ref> --brief-file <path>     queue a run on a brief JSON file
  run --kit <ref> --brief-revision <id>   queue a run on the brief of a WO revision
      [--by <label>]                      who started it (stored as cli:<label>)
      [--agent-model <model> --agent-model-reason <text>]
                                          use another agent model for this run only; the reason is recorded
  list [--limit <n>]                      the newest runs
  status <runId>                          state, round, gate verdict, cost split, duration
  get <runId> --out <dir>                 write the brand file, its images, every rejected attempt, the gate results
                                          per round, run meta, the turns log and the cost split
  cancel <runId>                          stop a run (a held run stops between model calls)
The models are the "Brand agent" and "Brand reviewer" doors in /ops > Model & AI. They must be two different models and
never an Anthropic model.`

/**
 * @param {string[]} argv the arguments after the script name
 * @param {{ pool: import('pg').Pool, secret: string, kitImages: { ensure: Function }, wiring: Function,
 *   runDir: (runId: string) => string, cwd?: string, out?: (line: string) => void, err?: (line: string) => void,
 *   index?: Map<string, object>, now?: () => number }} deps
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
        out: { type: 'string' },
        'agent-model': { type: 'string' },
        'agent-model-reason': { type: 'string' }
      }
    })
    const [command, runId] = positionals
    const entry = COMMANDS[command]
    if (!entry) throw new Usage(command ? `unknown command "${command}"` : '')
    if (entry.needsId && !runId) throw new Usage(`${command} needs a run id`)
    return await entry.run({ ...deps, ...io }, values, runId)
  } catch (error) {
    if (error instanceof Usage || error?.code?.startsWith?.('ERR_PARSE_ARGS')) {
      if (error.message) io.err(error.message)
      io.err(USAGE)
      return 2
    }
    throw error
  }
}

const COMMANDS = {
  kits: {
    async run(d) {
      const where = d.index ? { index: d.index } : {}
      const kits = readableKits(where)
      if (!kits.length) d.out('no readable kits')
      for (const k of kits) {
        const kit = openKit(k.ref, where)
        const problem = brandKitProblem(kit.doc)
        const images = problem ? null : await d.kitImages.ensure(kit)
        const state = problem
          ? `brand step cannot run: ${problem}`
          : images.ok
            ? 'images ready'
            : `images not usable: ${images.code}: ${images.reason}`
        d.out(`${k.ref}  ${k.platform}  ${k.template.name} ${k.template.version}  ${state}`)
      }
      return 0
    }
  },
  run: { run: startRunCommand },
  list: {
    async run(d, values) {
      for (const line of listLines(await listRuns(d.pool, { limit: values.limit }))) d.out(line)
      return 0
    }
  },
  status: {
    needsId: true,
    async run(d, _values, runId) {
      const run = await readRun(d.pool, runId)
      if (!run) return refused(d, `No run ${runId}.`)
      for (const line of statusLines(run, await callsOf(d.pool, run.id), d.now?.() ?? Date.now())) d.out(line)
      return 0
    }
  },
  get: { needsId: true, run: getRunCommand },
  cancel: {
    needsId: true,
    async run(d, _values, runId) {
      const cancelled = await cancelBrandRun(d.pool, runId)
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
