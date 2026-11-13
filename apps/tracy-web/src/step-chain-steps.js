// Wiring: the real steps of the step chain engine (`sites/brief-engines/step-chain.js`, #483). It sits beside app.js because
// it joins the template kit, the brand step, the planner, the writer, the picture step and step 9, each a domain of its own.
//
// Every model step runs exactly as its bench runs it: a run queued through the bench's own command line (`run --kit
// <ref> --brief-revision <id>`), played by the bench worker this server already runs (server.js starts each queue), and
// its files taken out with the bench's own `get`. So the chain reads the research revision the benches read, with the
// same prompts, checkers and doors, and each step's USD is its run's own spend record. A bench holds one run at a time; a
// start that finds another run going waits for it. The Write step is the write step alone (`runWriteStep`), its writes
// through the setup door the engine hands it: no site check and no repair pass run inside a build (ADR 0047).
//
// A run's files live in its own folder under the step records folder (`defaultRecordsDir`), and stay there after the
// run, with the run's record (`step-records.json`) beside them, so every step's inputs and outputs outlive the run
// (ADR 0047, decision 5). Before any model work the chain asks whether every model door it needs can be answered
// (`doors`, `STEP_CHAIN_MODEL_DOORS`).
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runCli as brandCli } from './brand-step/brand-cli.js'
import { brandRunDir } from './brand-step/brand-wiring.js'
import { BRAND_AGENT_DOOR, BRAND_REVIEWER_DOOR } from './brand-step/brand-doors.js'
import { CHAIN_BENCH_CHECK_FAILED, chainBenchFailure } from './lib/chain-bench-verdict.js'
import { openContentMap } from './lib/content-map-source.js'
import { lookupDoor } from './lib/llm-store.js'
import { stepNineDiagnostics } from './step-chain-write-diagnostics.js'
import { readReleases, templateOfTag } from './lib/quickstart-releases.js'
import { openKit, readableKits } from './lib/template-kit-source.js'
import { PICTURE_PICKER_DOOR } from './site-pictures/door.js'
import { PICTURE_DRAWER_DOOR } from './site-pictures/drawer-door.js'
import { PICTURE_LOOKER_DOOR } from './site-pictures/looker-door.js'
import { runCli as picturesCli } from './site-pictures/bench-cli.js'
import { SITE_PLANNER_DOOR } from './site-planner/door.js'
import { runCli as plannerCli } from './site-planner/bench-cli.js'
import { runCli as writerCli } from './site-writer/bench-cli.js'
import { SITE_WRITER_DOOR } from './site-writer/door.js'
import { designSystemSiteReaders } from './sites/design-system-site-readers.js'
import { siteByKey } from './sites/store.js'
import { httpSiteDoor } from './write-step/bench-site-door.js'
import { siteFileReader } from './write-step/site-file.js'
import { probeSiteHome, runWithSiteRecovery } from './write-step/site-recovery.js'
import { sitePageReader, siteSheetsReader } from './write-step/site-sheets.js'
import { runWriteStep } from './write-step/write-step.js'

const BY = 'step-chain'

/**
 * The model doors a chain build spends, checked before any model work (ADR 0047): the brand agent and its reviewer, the
 * planner, the writer, and the picture step's picker, looker and drawer. The picture icon ranker is not among them: an
 * unset ranker door never stops a picture run, the shortlist order decides (lib/llm-catalog.js).
 */
export const STEP_CHAIN_MODEL_DOORS = Object.freeze([
  BRAND_AGENT_DOOR,
  BRAND_REVIEWER_DOOR,
  SITE_PLANNER_DOOR,
  SITE_WRITER_DOOR,
  PICTURE_PICKER_DOOR,
  PICTURE_LOOKER_DOOR,
  PICTURE_DRAWER_DOOR
])

/** The step records folder: TRACY_STEP_CHAIN_RECORDS_DIR, else a folder in the system's temporary directory. */
export const defaultRecordsDir = (env = process.env) =>
  env.TRACY_STEP_CHAIN_RECORDS_DIR || path.join(tmpdir(), 'tracy-step-chain-records')

/** The file a run's record is kept in, in the run's own folder. */
export const STEP_RECORDS_FILE = 'step-records.json'

/** What a chain build adds to a bench `run` so its step carries no USD cap (the bench's own default runs keep it). */
const NO_CAPS = ['--no-caps']
const POLL_MS = 10_000
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const RUN_ACTIVE = /_RUN_ACTIVE|Only one run at a time/

/** A step error that carries the USD its run spent before it failed. */
const stepError = (message, usd = 0) => Object.assign(new Error(message), { usd })

/**
 * @param {{ pool: import('pg').Pool, config: any, secret: string, kitImages: { ensure: Function },
 *   brandWiring: Function, picturesStoreDir: string, fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>,
 *   log?: { warn?: Function, info?: Function }, port?: string | number, recordsDir?: string,
 *   benchCli?: Partial<Record<'brand' | 'plan' | 'copy' | 'pictures', Function>> }} deps `recordsDir`: where each
 *   run's folder, and the record kept in it, live (`defaultRecordsDir`)
 */
export function createStepChainSteps(deps) {
  const { pool, config, secret, kitImages, brandWiring, picturesStoreDir } = deps
  const { fetchImpl = fetch, sleep = realSleep, log = console } = deps
  const recordsDir = deps.recordsDir ?? defaultRecordsDir()
  const benches = {
    brand: {
      cli: brandCli,
      table: 'brand_run',
      cost: 'coalesce(cost_agent_usd, 0) + coalesce(cost_drawing_usd, 0) + coalesce(cost_reviewer_usd, 0)',
      deps: { pool, secret, kitImages, wiring: brandWiring, runDir: (id) => brandRunDir(config, id) }
    },
    plan: { cli: plannerCli, table: 'site_planner_run', deps: { pool, secret, kitImages } },
    copy: { cli: writerCli, table: 'site_writer_run', deps: { pool, secret } },
    pictures: {
      cli: picturesCli,
      table: 'site_picture_run',
      deps: { pool, secret, storeDir: picturesStoreDir }
    }
  }

  /** One command of a bench, its output lines kept. */
  async function command(name, argv) {
    const lines = { out: [], err: [] }
    const code = await (deps.benchCli?.[name] ?? benches[name].cli)(argv, {
      ...benches[name].deps,
      out: (l) => lines.out.push(String(l)),
      err: (l) => lines.err.push(String(l))
    })
    return { code, ...lines }
  }

  /**
   * A bench run of one step, from its start to its files in `dir`: started (waiting while the bench holds another run),
   * followed on its row until it ends, its files taken out. Cancelled when the chain no longer needs it.
   */
  async function benchRun(name, argv, dir, signal) {
    let runId = null
    for (;;) {
      if (signal.aborted) throw signal.reason ?? new Error('stopped')
      const started = await command(name, ['run', ...argv, '--by', BY])
      if (started.code === 0) {
        runId = started.out[0]?.trim()
        break
      }
      const said = started.err.join(' ')
      if (!RUN_ACTIVE.test(said)) throw stepError(`the ${name} run could not start: ${said.slice(0, 240)}`)
      await sleep(POLL_MS)
    }
    const cancel = () => void command(name, ['cancel', runId]).catch(() => {})
    signal.addEventListener('abort', cancel, { once: true })
    try {
      // Starting a run can outlive the chain: an abort before listener registration must still cancel its row.
      if (signal.aborted) {
        cancel()
        throw signal.reason ?? new Error('stopped')
      }
      let row
      for (;;) {
        const { rows } = await pool.query(
          `select status, error, ${name !== 'brand' ? 'standing_failures,' : ''} ${benches[name].cost ?? 'cost_usd'} as cost_usd from ${benches[name].table} where id = $1`,
          [runId]
        )
        row = rows[0]
        if (!row) throw stepError(`the ${name} run ${runId} is gone`)
        if (row.status !== 'queued') break
        if (signal.aborted) throw signal.reason ?? new Error('stopped')
        await sleep(POLL_MS)
      }
      const usd = Number(row.cost_usd ?? 0)
      // A run that failed may still have made versions the checks rejected: its files are taken out all the same, so the
      // best version it made can be used (the write never falls back to demo content).
      await mkdir(dir, { recursive: true })
      const got = await command(name, ['get', runId, '--out', dir])
      const failure = chainBenchFailure(name, runId, row, got)
      log.info?.(`[step-chain] ${name} run ${runId} ${failure ?? 'succeeded'}, ${usd} USD`)
      return { runId, usd, failure, checkFailures: Boolean(String(row.standing_failures ?? '').trim()) }
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  }

  const readers = designSystemSiteReaders({ config, fetchImpl })
  const siteOf = (siteKey) => siteByKey(pool, siteKey)
  const pageHtml = sitePageReader({ siteOf, readers, fetchImpl })
  const folders = new Map()
  /** This run's own folder under the step records folder, named by the run's id, made once. */
  async function folderOf(ctx) {
    if (!folders.has(ctx.runId)) {
      // Brand and Planner start together: publish the allocation before yielding, so disposal owns both exports.
      const dir = path.join(recordsDir, `run-${String(ctx.runId).replace(/[^A-Za-z0-9-]/g, '_')}`)
      const pending = mkdir(dir, { recursive: true }).then(() => dir)
      folders.set(ctx.runId, pending)
      pending.catch(() => {
        if (folders.get(ctx.runId) === pending) folders.delete(ctx.runId)
      })
    }
    return folders.get(ctx.runId)
  }
  const revisionOf = (ctx) => String(ctx.brief?.researchRevisionId ?? '')
  const exists = (file) =>
    stat(file).then(
      (f) => f.isFile() && f.size > 0,
      () => false
    )
  /**
   * A bench step's answer: its output when the run succeeded; when it failed, an error that still carries the output it
   * made (if any), so the chain uses the best version rather than nothing.
   */
  async function answerOf({ usd, failure, checkFailures }, value, made) {
    if (!failure) return { value, usd }
    throw Object.assign(
      stepError(failure, usd),
      checkFailures ? { code: CHAIN_BENCH_CHECK_FAILED } : {},
      (await made) ? { value } : {}
    )
  }

  function ownerSiteDoor(ctx, site) {
    return httpSiteDoor({
      baseUrl: `http://localhost:${deps.port ?? process.env.PORT ?? 8080}`,
      ...(config.tracyOrigin ? { hostHeader: new URL(config.tracyOrigin).host } : {}),
      secret,
      email: ctx.email,
      platform: site.platform,
      templateOf: async (quickstart) => templateOfTag(await readReleases(pool), quickstart),
      fetchImpl
    })
  }

  return {
    async validateBase(ctx) {
      const site = await siteByKey(pool, ctx.siteKey)
      const point = site
        ? await ownerSiteDoor(ctx, site).recoveryPoint(ctx.siteKey, { signal: ctx.signal })
        : null
      if (!point)
        throw Object.assign(
          new Error(
            'SITE_RECOVERY_POINT_UNAVAILABLE: the host has no verified full backup for this WO base site.'
          ),
          { code: 'SITE_RECOVERY_POINT_UNAVAILABLE' }
        )
      return point
    },
    // The template kit (the template profile the release is sealed with), fetched and checked before anything forks.
    async kit(ctx) {
      const ref = ctx.contract?.id
      if (!ref || !readableKits().some((k) => k.ref === ref))
        throw stepError(`no readable template kit for ${ref ?? ctx.quickstart}`)
      const kit = openKit(ref)
      const images = await kitImages.ensure(kit)
      if (!images.ok) throw stepError(`the kit ${ref} images: ${images.code}: ${images.reason}`)
      const map = openContentMap(ref)
      if (map?.invalid) throw stepError(`the kit ${ref} content map: ${map.invalid}`)
      return { value: { ref, doc: kit.doc, contentMap: map?.doc ?? null }, usd: 0 }
    },

    async brand(ctx, { kit }, { signal }) {
      const dir = path.join(await folderOf(ctx), 'brand')
      const ran = await benchRun(
        'brand',
        [
          '--kit',
          kit.ref,
          '--brief-revision',
          revisionOf(ctx),
          ...(ctx.normalized?.languages?.[0] ? ['--site-language', ctx.normalized.languages[0]] : []),
          ...NO_CAPS
        ],
        dir,
        signal
      )
      const file = path.join(dir, 'brand-file.json')
      return answerOf(ran, { file }, exists(file))
    },

    async plan(ctx, { kit }, { signal }) {
      const dir = path.join(await folderOf(ctx), 'plan')
      const ran = await benchRun(
        'plan',
        ['--kit', kit.ref, '--brief-revision', revisionOf(ctx), '--require-visual-review', ...NO_CAPS],
        dir,
        signal
      )
      // The plan the run ended with: the last round that has one, as `get` writes it (plan-vN.json).
      const { rows } = await pool.query(
        'select plan from site_planner_round where run_id = $1 and plan is not null order by round desc limit 1',
        [ran.runId]
      )
      if (!rows[0]?.plan) throw stepError(ran.failure ?? `the planner run ${ran.runId} left no plan`, ran.usd)
      const file = path.join(dir, 'plan.json')
      await writeFile(file, `${JSON.stringify(rows[0].plan, null, 2)}\n`)
      return answerOf(ran, { file }, true)
    },

    async copy(ctx, { kit, plan }, { signal }) {
      const dir = path.join(await folderOf(ctx), 'copy')
      const argv = [
        '--plan-file',
        plan.file,
        '--kit',
        kit.ref,
        '--brief-revision',
        revisionOf(ctx),
        '--require-visual-review',
        ...NO_CAPS
      ]
      const ran = await benchRun('copy', argv, dir, signal)
      const file = path.join(dir, 'site-copy.json')
      return answerOf(ran, { file }, exists(file))
    },

    async pictures(ctx, { kit, plan }, { signal }) {
      const dir = path.join(await folderOf(ctx), 'pictures')
      const argv = [
        '--plan-file',
        plan.file,
        '--kit',
        kit.ref,
        '--brief-revision',
        revisionOf(ctx),
        ...NO_CAPS
      ]
      const ran = await benchRun('pictures', argv, dir, signal)
      const value = { file: path.join(dir, 'mapping.json'), manifest: path.join(dir, 'site-pictures.json') }
      return answerOf(ran, value, exists(value.file))
    },

    // The Write step: the write step alone (write-step/write-step.js), inside the site recovery guard. No site check and
    // no repair pass run inside a build (ADR 0047, decisions 1 and 3); its report `done` is the step completing.
    async write(ctx, inputs, { door }) {
      for (const input of ['plan', 'copy', 'brand', 'pictures'])
        if (!inputs[input]?.file) throw stepError(`the write step has no ${input} file`)
      const dir = await folderOf(ctx)
      const { rows } = await pool.query('select brief from wo_revision where id = $1', [revisionOf(ctx)])
      if (!rows[0]) throw stepError(`no research revision ${revisionOf(ctx)}`)
      const brief = path.join(dir, 'brief.json')
      await writeFile(brief, `${JSON.stringify(rows[0].brief, null, 2)}\n`)
      const site = await siteOf(ctx.siteKey)
      if (!site) throw stepError(`no site ${ctx.siteKey}`)
      // Every Apply call of the step goes through the setup door under this run's id; the site's own reads and its
      // recovery point go through the web app's doors as the site owner.
      const http = ownerSiteDoor(ctx, site)
      const siteDoor = { ...http, apply: door.apply }
      const write = {
        door: siteDoor,
        siteKey: ctx.siteKey,
        kit: { ref: inputs.kit.ref, doc: inputs.kit.doc },
        contentMap: inputs.kit.contentMap,
        files: {
          plan: inputs.plan.file,
          copy: inputs.copy.file,
          brief,
          brand: inputs.brand.file,
          pictures: inputs.pictures.file
        },
        templateSheets: siteSheetsReader({ siteOf, readers, fetchImpl }),
        templateFiles: siteFileReader({ siteOf, readers, fetchImpl }),
        pageHtml
      }
      const out = path.join(dir, 'write')
      await mkdir(out, { recursive: true })
      const step = await runWithSiteRecovery({
        signal: ctx.signal,
        door: siteDoor,
        siteKey: ctx.siteKey,
        runId: ctx.runId,
        probe: () => probeSiteHome({ site, readers, fetchImpl }),
        sleep,
        run: async () => ({ report: await runWriteStep({ sleep, ...write }) })
      })
      await writeFile(path.join(out, 'site-recovery.json'), JSON.stringify(step.recovery, null, 2))
      await writeFile(path.join(out, 'site-write-report.json'), JSON.stringify(step.report, null, 2))
      return {
        value: {
          report: step.report,
          reportFile: path.join(out, 'site-write-report.json'),
          diagnostics: stepNineDiagnostics(step)
        },
        usd: 0
      }
    },

    // Before any model work: the doors of STEP_CHAIN_MODEL_DOORS that cannot be answered (unset, switched off, a key that
    // will not open, no model named). None means every door the chain spends is ready.
    async doors() {
      const empty = []
      for (const door of STEP_CHAIN_MODEL_DOORS) {
        const found = await lookupDoor(pool, door, secret)
        if (found.state !== 'ok') empty.push({ door, state: found.state })
        else if (!found.credential?.model) empty.push({ door, state: 'no-model' })
      }
      return empty
    },

    // What the run left on disk stays, with the run's record beside it (ADR 0047, decision 5): no flag, whatever became
    // of the run. The bench runs keep their own rows and files too.
    async dispose(prepared) {
      const pending = folders.get(prepared?.runId)
      folders.delete(prepared?.runId)
      const dir = pending
        ? await pending
        : prepared?.runId
          ? await folderOf({ runId: prepared.runId }).finally(() => folders.delete(prepared.runId))
          : null
      if (!dir) return
      if (prepared.chain)
        await writeFile(
          path.join(dir, STEP_RECORDS_FILE),
          `${JSON.stringify({ runId: prepared.runId, chain: prepared.chain }, null, 2)}\n`
        )
      log.info?.(`[step-chain] run ${prepared.runId}: record kept`)
    }
  }
}
