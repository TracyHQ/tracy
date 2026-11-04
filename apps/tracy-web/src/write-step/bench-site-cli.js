// BENCH ONLY. The write step bench's command line, site creator part (ADR 0044): the bench has no screen, so it runs
// from inside the tracy-web container (scripts/write-step-bench.mjs), in the shape of the other benches' commands.
// Exit codes: 0 done, 1 refused or not found, 2 wrong usage. Later tickets add the write itself.
import { parseArgs } from 'node:util'
import { openKit, readableKits } from '../lib/template-kit-source.js'
import { createBenchSite, specOfKit } from './bench-site-creator.js'

export const USAGE = `usage: node scripts/write-step-bench.mjs <command>
  create-site --kit <ref> --account <email>   create a trial site from the kit's quickstart by the customer's path,
      [--by <label>]                          prove its contract is the kit's, keep it as the bench's one site and
                                              delete the previous run's; prints the creation time
  status [id]                                 the latest (or the named) bench site record
  list [--limit <n>]                          the newest bench site records
The quickstart and the contract come from the kit. Only sites this bench made are ever deleted.`

const LABEL = /^[A-Za-z0-9._@-]{1,64}$/
class Usage extends Error {}

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`

/**
 * @param {string[]} argv
 * @param {{ store: object, makeDoor: (input: {account: string, platform: string}) => object, index?: Map<string, object>,
 *   out?: (line: string) => void, err?: (line: string) => void, now?: () => number, sleep?: (ms: number) => Promise<void>,
 *   pollMs?: number, timeoutMs?: number }} deps
 * @returns {Promise<number>}
 */
export async function runCli(argv, deps) {
  const io = { out: deps.out ?? console.log, err: deps.err ?? console.error }
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        kit: { type: 'string' },
        account: { type: 'string' },
        by: { type: 'string' },
        limit: { type: 'string' }
      }
    })
    const [command, id] = positionals
    const run = COMMANDS[command]
    if (!run) throw new Usage(command ? `unknown command "${command}"` : '')
    return await run({ ...deps, ...io }, values, id)
  } catch (error) {
    if (error instanceof Usage || error?.code?.startsWith?.('ERR_PARSE_ARGS')) {
      if (error.message) io.err(error.message)
      io.err(USAGE)
      return 2
    }
    throw error
  }
}

const COMMANDS = { 'create-site': createSite, status, list }

async function createSite(d, values) {
  if (!values.kit) throw new Usage('create-site needs --kit')
  if (!values.account) throw new Usage('create-site needs --account')
  if (values.by !== undefined && !LABEL.test(values.by))
    throw new Usage('--by takes letters, digits and . _ @ - only, up to 64')
  const where = d.index ? { index: d.index } : {}
  const kit = openKit(values.kit, where)
  const spec = specOfKit(kit)
  if (!spec) {
    const known = readableKits(where).map((k) => k.ref)
    d.err(`No readable kit "${values.kit}". Readable kits: ${known.join(', ') || 'none'}.`)
    return 1
  }
  const platform = readableKits(where).find((k) => k.ref === values.kit)?.platform || 'joomla'
  const door = d.makeDoor({ account: values.account, platform })
  const made = await createBenchSite({
    spec,
    door,
    store: d.store,
    startedBy: values.by ? `cli:${values.by}` : 'cli',
    ...(d.now ? { now: d.now } : {}),
    ...(d.sleep ? { sleep: d.sleep } : {}),
    ...(d.pollMs ? { pollMs: d.pollMs } : {}),
    ...(d.timeoutMs ? { timeoutMs: d.timeoutMs } : {})
  })
  if (!made.ok) {
    d.err(`${made.code}: ${made.reason}`)
    return 1
  }
  d.out(made.siteKey)
  d.out(
    `creation time ${seconds(made.createMs)} (create request to site job done), ${seconds(made.totalMs)} in all`
  )
  d.out(`contract ${made.contract} confirmed by content.contract inspect`)
  for (const key of made.removed) d.out(`removed the previous bench site ${key}`)
  for (const left of made.notRemoved) d.out(`not removed: ${left.siteKey} (${left.reason})`)
  return 0
}

const lineOf = (r) =>
  [
    r.id,
    r.status,
    r.siteKey ?? '-',
    r.contract,
    r.createMs == null ? '-' : seconds(r.createMs),
    r.code ? `${r.code}: ${r.reason}` : ''
  ]
    .join('  ')
    .trim()

async function status(d, _values, id) {
  const rows = await d.store.list({ limit: 200 })
  const row = id ? rows.find((r) => r.id === id) : rows[0]
  if (!row) {
    d.err(id ? `No bench site ${id}.` : 'No bench site yet.')
    return 1
  }
  d.out(lineOf(row))
  return 0
}

async function list(d, values) {
  const limit = values.limit === undefined ? 20 : Number(values.limit)
  if (!Number.isInteger(limit) || limit < 1) throw new Usage('--limit takes a positive whole number')
  for (const row of await d.store.list({ limit })) d.out(lineOf(row))
  return 0
}
