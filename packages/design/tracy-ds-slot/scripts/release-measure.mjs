#!/usr/bin/env node
/**
 * Measure a list of released quickstart versions for /ops Design system, several at once, each on a stand of
 * its own (its own containers, port, work folder and probe servers), the same steps per release as the
 * command /ops prints (`apps/tracy-web/src/lib/template-design-system-readiness/rules/measure-command.js`):
 *
 *   1. `stand.mjs up` — the release restored from its own files;
 *   2. `flow.mjs --snap` (the baseline) and `flow.mjs --measure-*` under the 15 featured systems, which writes
 *      design-system-measurement.json into the contract folder of the version;
 *   3. `preview-check.mjs --scheme light,dark --pages all --write` under the two preview systems;
 *   4. `preview-parity.mjs --write` (Joomla), the popup against Try on;
 *   4b. `brand-facts.mjs` (WordPress): the brand facts a template-profiles.json row holds, into brand-facts.json
 *      beside the measurement (a patch release carries the previous row only when these are equal);
 *   5. `stand.mjs down`, whatever happened before it.
 *
 *   node packages/design/tracy-ds-slot/scripts/release-measure.mjs [--jobs 2] [--concurrency 4]
 *        [--port 52900] [--stand <prefix>] [--work <dir>] [--preview-only] [--no-parity] [--brand-only]
 *        <tag>@<version>[=<release dir>] ...
 *
 *   e.g. release-measure.mjs quickstart/ja-sensei/j6@1.0.6 quickstart/ja-prodex/j6@1.0.4
 *
 * =<release dir>: a version not yet published, restored from its local build (stand.mjs --from-dir).
 *
 * --jobs: releases measured at once (default 2). --concurrency: pages each preview step reads at once, each in a
 * Chrome of its own (passed to preview-check.mjs and preview-parity.mjs). Chromes alive at once ≈ jobs ×
 * concurrency; the tdsr skill (§3) says what one Mac holds. --port: the base every port comes from: release i
 * takes port + 3i (its stand), port + 3i + 1 (preview-check's probe server) and port + 3i + 2 (preview-parity's),
 * each checked free before its stand goes up.
 * --stand: the stands' name prefix (default `dsm`), so a batch beside other agents' stands is told apart by
 * name as well as by port: release i's stand is `<prefix>-<port + 3i>-<slug>-<version digits>`.
 * --preview-only: steps 1, 3, 4, 5 (the file of the version is there, only its preview is older than the probe).
 * --no-parity: leaves out step 4.
 * --brand-only: steps 1, 4b, 5 (a database-only patch whose design-system numbers are inherited still has its
 * brand facts measured on its own release).
 *
 * Each release's output goes to <work>/<name>.log; a table of each step's seconds is printed at the end, and
 * the exit code is 1 when any release failed, its teardown included (stand.mjs down failed, or a container of
 * the stand is still there after it). Nothing is committed: the measurement files are left in the tree.
 */
import { execFile, spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PREVIEW_SYSTEMS } from '../../../../apps/tracy-web/src/lib/template-design-system-readiness/rules/measure-command.js'
import { FEATURED_REFERO_SYSTEMS, quickstartContractOf } from '../../../../apps/tracy-web/src/lib/ds-slot.js'
import { concurrencyOf, inPool } from '../src/measure-pool.mjs'
import { previewLineOf } from '../src/measurement.mjs'

const ROOT = resolve(import.meta.dirname, '../../../..')
const args = process.argv.slice(2)
const opt = (/** @type {string} */ n) => {
  const i = args.indexOf(n)
  return i === -1 ? null : args.splice(i, 2)[1]
}
const flag = (/** @type {string} */ n) => (args.includes(n) ? (args.splice(args.indexOf(n), 1), true) : false)
const JOBS = concurrencyOf(opt('--jobs'), 2)
const CONCURRENCY = opt('--concurrency')
if (CONCURRENCY !== null) concurrencyOf(CONCURRENCY, 1)
const BASE_PORT = Number(opt('--port') ?? 52900)
const STAND = opt('--stand') ?? 'dsm'
const WORK = resolve(opt('--work') ?? join(tmpdir(), 'ds-release-measure'))
const PREVIEW_ONLY = flag('--preview-only')
const NO_PARITY = flag('--no-parity')
const BRAND_ONLY = flag('--brand-only')

/** Ports a release takes from the base: its stand, preview-check's probe server, preview-parity's. */
const PORTS_PER_RELEASE = 3

/**
 * `<tag>@<version>[=<release dir>]` → the release, its line, its slot contract and the ports of the `index`th release, or why
 * it cannot be measured here. Every port comes from `basePort`, so no two ports of any release are the same.
 */
export function releaseOf(
  /** @type {string} */ spec,
  /** @type {number} */ index,
  basePort = BASE_PORT,
  stand = STAND
) {
  const m = /^(quickstart\/[a-z0-9-]+\/[a-z0-9-]+)@(\d+\.\d+\.\d+)(?:=(.+))?$/.exec(spec)
  if (!m) return { spec, error: 'not <quickstart/template/line>@<x.y.z>[=<release dir>]' }
  const [, tag, version, fromDir] = m
  const platform = /\/wp[^/]*$/.test(tag) ? 'wordpress' : 'joomla'
  const line = previewLineOf({ platform, tag })
  if (!line) return { spec, error: 'names no template line' }
  const fit = quickstartContractOf({ platform, tag, version })
  if (!('contract' in fit)) return { spec, error: `no slot contract (${fit.reason})` }
  // a stand's containers are <name>-web and <name>-db, and the name is cut at 40: a long prefix would cut the slug
  if (!/^[a-z0-9][a-z0-9-]{0,19}$/.test(stand))
    return { spec, error: `--stand ${stand}: lower-case letters, digits and dashes, at most 20` }
  const slug = `${tag.split('/')[1]}-${version.replace(/\./g, '')}`
  const port = basePort + index * PORTS_PER_RELEASE
  if (!Number.isInteger(port) || port < 1024 || port + PORTS_PER_RELEASE - 1 > 65535)
    return { spec, error: `port base ${basePort} puts release ${index} outside 1024–65535` }
  return {
    spec,
    tag,
    version,
    platform,
    template: line.template,
    contract: fit.contract,
    fromDir: fromDir ?? null,
    // the port in the name: two batches on one machine (other bases) never take each other's stand down
    name: `${stand}-${port}-${slug}`.slice(0, 40).replace(/-+$/, ''),
    port,
    // the probe servers of preview-check.mjs and preview-parity.mjs
    probePort: port + 1,
    parityPort: port + 2
  }
}

const slotDir = join(ROOT, 'packages/design/tracy-ds-slot')
/** One command of a release, its output appended to the release's log; rejects on a non-zero exit. */
const run = (/** @type {import('node:fs').WriteStream} */ log, /** @type {string[]} */ argv) =>
  new Promise((ok, no) => {
    log.write(`\n$ node ${argv.join(' ')}\n`)
    const child = spawn(process.execPath, argv, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (b) => {
      out += b
      log.write(b)
    })
    child.stderr.on('data', (b) => log.write(b))
    child.on('error', no)
    child.on('close', (code) =>
      code === 0 ? ok(out) : no(new Error(`${argv[0].split('/').pop()} exited ${code}`))
    )
  })

/** The ports of `ports` something already listens on (127.0.0.1, where a stand publishes its site). */
const takenOf = async (/** @type {number[]} */ ports) =>
  (
    await Promise.all(
      ports.map(
        (port) =>
          new Promise((ok) => {
            const server = createServer()
            server.once('error', () => ok(port))
            server.listen(port, '127.0.0.1', () => server.close(() => ok(null)))
          })
      )
    )
  ).filter((p) => p !== null)

/** The containers of stand `name` still there (stand.mjs down ignores what docker says). */
const leftOf = (/** @type {string} */ name) =>
  new Promise((ok, no) =>
    execFile(
      'docker',
      ['ps', '-a', '--format', '{{.Names}}', '--filter', `name=^${name}-(web|db)$`],
      (e, out) => (e ? no(e) : ok(out.split('\n').filter(Boolean)))
    )
  )

/**
 * Every step of one release; `steps` gets each step's seconds as it ends. The job is ok only when every step
 * passed and its stand is gone. `exec` and `left` are the command runner and the leftover check (tests pass
 * their own).
 */
export async function measureRelease(
  /** @type {any} */ r,
  {
    work = WORK,
    previewOnly = PREVIEW_ONLY,
    parity = !NO_PARITY,
    brandOnly = BRAND_ONLY,
    concurrency = CONCURRENCY,
    quiet = false,
    exec = run,
    left = leftOf
  } = {}
) {
  // beside the stand's folder (<work>/<name>), never in it: stand.mjs down removes that folder, and with it the
  // preview's summary.json and per-page preview.json that --preview-only leaves as its only result while the
  // version has no measurement file yet (TEXT-1 batch 2, 21/10/2026)
  const dir = join(work, `${r.name}.out`)
  mkdirSync(dir, { recursive: true })
  const log = createWriteStream(join(work, `${r.name}.log`))
  /** @type {Record<string, number>} */
  const steps = {}
  const step = async (/** @type {string} */ name, /** @type {string[]} */ argv) => {
    const t = Date.now()
    try {
      return await exec(log, argv)
    } finally {
      steps[name] = Math.round((Date.now() - t) / 1000)
      if (!quiet) console.log(`${r.spec.padEnd(36)} ${name.padEnd(14)} ${steps[name]} s`)
    }
  }
  const site = `http://127.0.0.1:${r.port}`
  const started = Date.now()
  /** @type {string | null} */
  let error = null
  // stand.mjs up was started: from then on the stand goes down whatever happens
  let touched = false
  try {
    const taken = await takenOf([r.port, r.probePort, r.parityPort])
    if (taken.length) throw new Error(`port ${taken.join(', ')} already in use: pick another --port`)
    touched = true
    const said = await step('stand up', [
      join(slotDir, 'scripts/stand.mjs'),
      'up',
      r.tag,
      '--version',
      r.version,
      '--port',
      String(r.port),
      '--name',
      r.name,
      '--dir',
      work,
      ...(r.fromDir ? ['--from-dir', r.fromDir] : [])
    ])
    const stand = JSON.parse(said.trim().split('\n').pop() ?? '{}')
    const cms =
      r.platform === 'joomla'
        ? [
            '--joomla-db',
            stand.db,
            '--joomla-prefix',
            stand.prefix ?? prefixOf(join(work, r.name)),
            '--joomla-login',
            'site'
          ]
        : ['--wp-container', stand.web]
    if (!previewOnly && !brandOnly) {
      const flow = join(slotDir, 'scripts/flow.mjs')
      await step('flow baseline', [
        flow,
        '--cms',
        r.platform,
        '--template',
        r.contract,
        '--site',
        site,
        '--out',
        join(dir, 'flow/baseline'),
        '--snap'
      ])
      await step('flow measure', [
        flow,
        '--cms',
        r.platform,
        '--template',
        r.contract,
        ...cms,
        '--site',
        site,
        '--out',
        join(dir, 'flow/final'),
        '--baseline',
        join(dir, 'flow/baseline/default.json'),
        '--measure-version',
        r.version,
        '--measure-tag',
        r.tag,
        '--measure-template',
        r.template,
        ...FEATURED_REFERO_SYSTEMS.map((id) => `refero:${id}`)
      ])
    }
    if (!brandOnly) await previewSteps(cms)
    if (r.platform === 'wordpress')
      await step('brand facts', [
        join(slotDir, 'scripts/brand-facts.mjs'),
        '--site',
        site,
        '--wp-container',
        stand.web,
        '--tag',
        r.tag,
        '--version',
        r.version,
        // preview-parity's port: that step is Joomla's, so a WordPress release's third port is free here
        '--cdp',
        String(r.parityPort)
      ])
  } catch (e) {
    error = String(e?.message ?? e)
  }
  /** Steps 3 and 4; `cms` is how the stand's CMS is reached (preview-parity reads Joomla's database). */
  async function previewSteps(/** @type {string[]} */ cms) {
    const demos = join(dir, 'demos.json')
    writeFileSync(
      demos,
      JSON.stringify([{ tag: r.tag, platform: r.platform, version: r.version, address: `${site}/` }])
    )
    const pool = concurrency === null ? [] : ['--concurrency', concurrency]
    await step('preview-check', [
      join(ROOT, 'apps/tracy-web/scripts/preview-check.mjs'),
      '--demos',
      demos,
      '--out',
      join(dir, 'preview'),
      '--only',
      r.tag,
      '--systems',
      PREVIEW_SYSTEMS.join(','),
      '--scheme',
      'light,dark',
      '--pages',
      'all',
      '--port',
      String(r.probePort),
      ...pool,
      '--write'
    ])
    if (r.platform === 'joomla' && parity)
      await step('preview-parity', [
        join(ROOT, 'apps/tracy-web/scripts/preview-parity.mjs'),
        '--site',
        site,
        '--tag',
        r.tag,
        '--version',
        r.version,
        ...cms,
        '--out',
        join(dir, 'parity'),
        '--port',
        String(r.parityPort),
        ...pool,
        '--write'
      ])
  }
  // the stand goes whether or not a step failed (stand.mjs up may have half-built it: down cleans either), and
  // a teardown that failed fails the job: a stand left running holds its ports and the machine's memory
  if (touched)
    try {
      await step('stand down', [join(slotDir, 'scripts/stand.mjs'), 'down', '--name', r.name, '--dir', work])
      const still = await left(r.name)
      if (still.length) throw new Error(`still there: ${still.join(', ')}`)
    } catch (e) {
      const down = `stand down failed: ${String(e?.message ?? e)}`
      error = error ? `${error}; ${down}` : down
    }
  await new Promise((ok) => log.end(ok))
  const seconds = Math.round((Date.now() - started) / 1000)
  return error
    ? { ...r, ok: false, error, steps, seconds, out: dir }
    : { ...r, ok: true, steps, seconds, out: dir }
}

/** The Joomla table prefix the stand restored (its manifest's, as measure-command.js reads it). */
function prefixOf(/** @type {string} */ standDir) {
  try {
    return JSON.parse(readFileSync(join(standDir, 'dl/manifest.json'), 'utf8')).prefix || 'tr_'
  } catch {
    return 'tr_'
  }
}

if (import.meta.main) {
  const specs = args.filter((a) => !a.startsWith('--'))
  if (!specs.length) {
    console.error(
      'usage: release-measure.mjs [--jobs 2] [--concurrency 4] [--port 52900] [--work <dir>] [--preview-only] [--no-parity] [--brand-only] <tag>@<version>[=<release dir>] ...'
    )
    process.exit(2)
  }
  const releases = specs.map((s, i) => releaseOf(s, i))
  const bad = releases.filter((r) => 'error' in r)
  if (bad.length) {
    for (const r of bad) console.error(`${r.spec}: ${r.error}`)
    process.exit(2)
  }
  mkdirSync(WORK, { recursive: true })
  const started = Date.now()
  console.log(`${releases.length} releases, ${Math.min(JOBS, releases.length)} at a time, logs in ${WORK}`)
  const results = await inPool(releases, JOBS, (r) => measureRelease(r))
  console.log('\nrelease                              result  seconds  steps')
  for (const r of results)
    console.log(
      `${r.spec.padEnd(36)} ${(r.ok ? 'ok' : 'FAILED').padEnd(7)} ${String(r.seconds).padStart(7)}  ${Object.entries(
        r.steps
      )
        .map(([k, s]) => `${k} ${s}`)
        .join(', ')}${r.ok ? '' : `\n${''.padEnd(37)}${r.error} (log: ${join(WORK, `${r.name}.log`)})`}`
    )
  console.log(`all: ${Math.round((Date.now() - started) / 1000)} s`)
  process.exit(results.every((r) => r.ok) ? 0 : 1)
}
