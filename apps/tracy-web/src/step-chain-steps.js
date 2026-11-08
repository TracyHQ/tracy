// Wiring: the real steps of the step chain engine (`sites/brief-engines/step-chain.js`, #483). It sits beside app.js because
// it joins the template kit, the brand step, the planner, the writer, the picture step and step 9, each a domain of its own.
//
// Every model step runs exactly as its bench runs it: a run queued through the bench's own command line (`run --kit
// <ref> --brief-revision <id>`), played by the bench worker this server already runs (server.js starts each queue), and
// its files taken out with the bench's own `get`. So the chain reads the research revision the benches read, with the
// same prompts, checkers and doors, and each step's USD is its run's own spend record. A bench holds one run at a time; a
// start that finds another run going waits for it. Step 9 is `runStepNine` whole, its writes through the setup door the
// engine hands it, its site check and 9b repair agent as the write step bench wires them.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runCli as brandCli } from './brand-step/brand-cli.js'
import { brandRunDir } from './brand-step/brand-wiring.js'
import { hostCall } from './host/client.js'
import { openContentMap } from './lib/content-map-source.js'
import { defaultContracts } from './lib/contracts.js'
import { readReleases, templateOfTag } from './lib/quickstart-releases.js'
import { openKit, readableKits } from './lib/template-kit-source.js'
import { demoSelfNames } from './ops/quickstarts.js'
import { contractBaselineStore } from './site-check/demo-baseline.js'
import { hostMeasure } from './site-check/host-measure.js'
import { runSiteCheck } from './site-check/site-check.js'
import { runCli as picturesCli } from './site-pictures/bench-cli.js'
import { runCli as plannerCli } from './site-planner/bench-cli.js'
import { runCli as writerCli } from './site-writer/bench-cli.js'
import { designSystemSiteReaders } from './sites/design-system-site-readers.js'
import { siteByKey } from './sites/store.js'
import { mintSeatSession } from './workspace/seat-door.js'
import { httpSiteDoor } from './write-step/bench-site-door.js'
import { siteFileReader } from './write-step/site-file.js'
import { sitePageReader, siteSheetsReader } from './write-step/site-sheets.js'
import { benchRepairAgent } from './write-step-bench-repair-agent.js'
import { runStepNine } from './write-step-nine.js'

const BY = 'step-chain'
const POLL_MS = 10_000
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const RUN_ACTIVE = /_RUN_ACTIVE|Only one run at a time/

/** A step error that carries the USD its run spent before it failed. */
const stepError = (message, usd = 0) => Object.assign(new Error(message), { usd })

/**
 * @param {{ pool: import('pg').Pool, config: any, secret: string, kitImages: { ensure: Function },
 *   brandWiring: Function, picturesStoreDir: string, fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>,
 *   log?: { warn?: Function, info?: Function }, port?: string | number, keepFiles?: boolean }} deps `keepFiles`: leave a
 *   run's files on disk after it ends
 */
export function createStepChainSteps(deps) {
  const { pool, config, secret, kitImages, brandWiring, picturesStoreDir } = deps
  const { fetchImpl = fetch, sleep = realSleep, log = console } = deps
  const benches = {
    brand: {
      cli: brandCli,
      table: 'brand_run',
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
    const code = await benches[name].cli(argv, {
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
      let row
      for (;;) {
        const { rows } = await pool.query(
          `select status, error, cost_usd from ${benches[name].table} where id = $1`,
          [runId]
        )
        row = rows[0]
        if (!row) throw stepError(`the ${name} run ${runId} is gone`)
        if (row.status !== 'queued') break
        if (signal.aborted) throw signal.reason ?? new Error('stopped')
        await sleep(POLL_MS)
      }
      const usd = Number(row.cost_usd ?? 0)
      if (row.status !== 'succeeded')
        throw stepError(
          `the ${name} run ${runId} ended ${row.status}: ${String(row.error ?? '').slice(0, 200)}`,
          usd
        )
      await mkdir(dir, { recursive: true })
      const got = await command(name, ['get', runId, '--out', dir])
      if (got.code !== 0)
        throw stepError(`the ${name} run ${runId} files: ${got.err.join(' ').slice(0, 200)}`, usd)
      log.info?.(`[step-chain] ${name} run ${runId} succeeded, ${usd} USD`)
      return { runId, usd }
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  }

  const readers = designSystemSiteReaders({ config, fetchImpl })
  const siteOf = (siteKey) => siteByKey(pool, siteKey)
  const pageHtml = sitePageReader({ siteOf, readers, fetchImpl })
  const folders = new Map()
  /** This run's own folder, made once. */
  async function folderOf(ctx) {
    if (!folders.has(ctx.runId))
      folders.set(ctx.runId, await mkdtemp(path.join(tmpdir(), 'tracy-step-chain-')))
    return folders.get(ctx.runId)
  }
  const revisionOf = (ctx) => String(ctx.brief?.researchRevisionId ?? '')

  return {
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
      const { usd } = await benchRun(
        'brand',
        ['--kit', kit.ref, '--brief-revision', revisionOf(ctx)],
        dir,
        signal
      )
      return { value: { file: path.join(dir, 'brand-file.json') }, usd }
    },

    async plan(ctx, { kit }, { signal }) {
      const dir = path.join(await folderOf(ctx), 'plan')
      const { runId, usd } = await benchRun(
        'plan',
        ['--kit', kit.ref, '--brief-revision', revisionOf(ctx)],
        dir,
        signal
      )
      // The plan the run ended with: the last round that has one, as `get` writes it (plan-vN.json).
      const { rows } = await pool.query(
        'select plan from site_planner_round where run_id = $1 and plan is not null order by round desc limit 1',
        [runId]
      )
      if (!rows[0]?.plan) throw stepError(`the planner run ${runId} left no plan`, usd)
      const file = path.join(dir, 'plan.json')
      await writeFile(file, `${JSON.stringify(rows[0].plan, null, 2)}\n`)
      return { value: { file }, usd }
    },

    async copy(ctx, { kit, plan }, { signal }) {
      const dir = path.join(await folderOf(ctx), 'copy')
      const argv = ['--plan-file', plan.file, '--kit', kit.ref, '--brief-revision', revisionOf(ctx)]
      const { usd } = await benchRun('copy', argv, dir, signal)
      return { value: { file: path.join(dir, 'site-copy.json') }, usd }
    },

    async pictures(ctx, { kit, plan }, { signal }) {
      const dir = path.join(await folderOf(ctx), 'pictures')
      const argv = ['--plan-file', plan.file, '--kit', kit.ref, '--brief-revision', revisionOf(ctx)]
      const { usd } = await benchRun('pictures', argv, dir, signal)
      return {
        value: { file: path.join(dir, 'mapping.json'), manifest: path.join(dir, 'site-pictures.json') },
        usd
      }
    },

    // Step 9 whole: write, Site check, 9b repair pass, recheck, hand-over (write-step-nine.js).
    async write(ctx, inputs, { door }) {
      const dir = await folderOf(ctx)
      const { rows } = await pool.query('select brief from wo_revision where id = $1', [revisionOf(ctx)])
      if (!rows[0]) throw stepError(`no research revision ${revisionOf(ctx)}`)
      const brief = path.join(dir, 'brief.json')
      await writeFile(brief, `${JSON.stringify(rows[0].brief, null, 2)}\n`)
      const site = await siteOf(ctx.siteKey)
      if (!site) throw stepError(`no site ${ctx.siteKey}`)
      // The comment requests and turn undo of 9b go through the web app's own doors as the site owner; every Apply call of
      // the step, the write and the site check's reads, goes through the setup door under this run's id.
      const http = httpSiteDoor({
        baseUrl: `http://localhost:${deps.port ?? process.env.PORT ?? 8080}`,
        ...(config.tracyOrigin ? { hostHeader: new URL(config.tracyOrigin).host } : {}),
        secret,
        email: ctx.email,
        platform: site.platform,
        templateOf: async (quickstart) => templateOfTag(await readReleases(pool), quickstart),
        fetchImpl
      })
      const siteDoor = { ...http, apply: door.apply }
      const manifest = inputs.pictures
        ? JSON.parse(await readFile(inputs.pictures.manifest, 'utf8').catch(() => 'null'))
        : null
      const host = hostMeasure({ hostCall, config, site, selfNames: demoSelfNames, fetchImpl })
      const write = {
        door: siteDoor,
        siteKey: ctx.siteKey,
        kit: { ref: inputs.kit.ref, doc: inputs.kit.doc },
        contentMap: inputs.kit.contentMap,
        files: {
          plan: inputs.plan.file,
          copy: inputs.copy.file,
          brief,
          ...(inputs.brand ? { brand: inputs.brand.file } : {}),
          ...(inputs.pictures ? { pictures: inputs.pictures.file } : {})
        },
        templateSheets: siteSheetsReader({ siteOf, readers, fetchImpl }),
        templateFiles: siteFileReader({ siteOf, readers, fetchImpl }),
        pageHtml
      }
      const checkSite = (report, { baseline, allGroups = false, pages = null }) =>
        runSiteCheck({
          door: siteDoor,
          report,
          host,
          pageHtml: (page) => pageHtml({ siteKey: ctx.siteKey, path: page }),
          baseline,
          kit: inputs.kit.doc,
          pictures: manifest,
          allGroups,
          ...(pages ? { pages } : {})
        })
      const agent = benchRepairAgent({
        pool,
        config,
        seatDoor: { mintSeatSession },
        door: siteDoor,
        siteKey: ctx.siteKey,
        email: ctx.email,
        fetchImpl
      })
      const out = path.join(dir, 'step-9')
      await mkdir(out, { recursive: true })
      const step = await runStepNine({
        write,
        checkSite,
        agent,
        baselines: contractBaselineStore({ index: defaultContracts() }),
        pageHtml: (page) => pageHtml({ siteKey: ctx.siteKey, path: page }),
        saveFile: (name, data) => writeFile(path.join(out, name), data),
        log: { warn: (line) => log.warn?.(`[step-chain] ${ctx.siteKey}: ${line}`) }
      })
      const usd = Number(step.repair?.costUsd?.agent ?? 0)
      return { value: { report: step.report, siteCheck: step.siteCheck?.status ?? null }, usd }
    },

    // What the run left on disk goes with it (unless `keepFiles`: a stand that reads them after); the bench runs keep their
    // own rows and files.
    async dispose(prepared) {
      const dir = folders.get(prepared?.runId)
      if (!dir) return
      folders.delete(prepared.runId)
      if (deps.keepFiles) log.info?.(`[step-chain] run ${prepared.runId}: files kept`)
      else await rm(dir, { recursive: true, force: true })
    }
  }
}
