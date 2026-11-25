// The replay of a finished chain build's write: the build's own frozen inputs, written by the write step bench to a
// fresh trial site of the same template, then the site check. It sits beside app.js because it joins the step chain's
// bench runs (step-chain-steps.js) and the write step bench (write-step-bench-cli.js).
//
// The inputs are what the build's bench runs keep (ids on `site_brief.timings.chain.steps`):
// - the planner's last plan;
// - the writer's copy (`site-copy.json`);
// - the brand file;
// - the picture mapping and manifest, with their picture files;
// - the research revision the planner read.
// A step that made nothing gets the stand-in the chain itself writes from (write-step/stand-in-files.js), so a replay
// writes what the build wrote. No model runs: the same inputs give the same write, so a write step or site check change
// is measured in minutes, as often as needed, against inputs that do not move between two measures.
//
// Its write is the bench's `run` (the write step, no 9b repair pass), and its check the bench's `check`. The check is the
// site check the chain's final check runs, its result summed up as the chain's diagnostics (`stepNineDiagnostics`), so
// the same readers read both.
//
// 🔒 BENCH ONLY, ONE AT A TIME, ITS OWN TRIAL SITE. Staff start it in /ops/wo (ops/wo.js). The trial site is made by the
// bench's `create-site --keep-others`, which removes only the earlier replay site, never another bench line's. A replay
// lives in this process: a restart of tracy-web ends it, and its record is gone with it.
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { openContentMap } from './lib/content-map-source.js'
import { CURRENT_BRIEF } from './lib/site-brief-row.js'
import { openKit } from './lib/template-kit-source.js'
import { stepNineDiagnostics } from './step-chain-write-diagnostics.js'
import { runCli as writeBenchCli } from './write-step-bench-cli.js'
import { standInBrand, standInCopy, standInPlan } from './write-step/stand-in-files.js'

/** The bench label of every replay: its runs and its trial sites carry `cli:chain-replay`. */
export const REPLAY_BY = 'chain-replay'

/** How many finished replays the process keeps to be read. */
const KEEP = 20

const iso = (ms) => new Date(ms).toISOString()
const exists = (file) =>
  stat(file).then(
    (f) => f.isFile() && f.size > 0,
    () => false
  )
const replayError = (code, reason) => Object.assign(new Error(reason), { code })

/**
 * The local files a brand file or a picture mapping names under a `file` key (`spots[].file`, `uploads[].file`) that are
 * not beside it. A bench run's pictures live in tracy-web's own folders, which a redeploy empties (TRACY_READINESS_DIR,
 * TRACY_PICTURE_BENCH_DIR unset), so a build older than the last deploy has its documents but not its pictures.
 */
async function missingFilesOf(doc, base) {
  const named = new Set()
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v))
        if (k === 'file' && typeof x === 'string' && x && !/^([a-z]+:|\/)/i.test(x)) named.add(x)
        else walk(x)
  }
  walk(doc)
  const missing = []
  for (const file of named) if (!(await exists(path.join(base, file)))) missing.push(file)
  return missing
}

/**
 * @param {{ pool: import('pg').Pool, steps: { filesOf: (name: string, runId: string, dir: string) => Promise<unknown> },
 *   benchDeps: object | (() => object), runBench?: (argv: string[], deps: object) => Promise<number>, now?: () => number,
 *   log?: { warn?: Function, info?: Function }, keepFiles?: boolean, tmp?: string }} deps
 */
export function createChainReplays(deps) {
  const { pool, steps, runBench = writeBenchCli, now = Date.now, log = console } = deps
  // The write step bench's wiring, made at the first replay when it is given as a function (app.js).
  let wired = null
  const benchDeps = () => (wired ??= typeof deps.benchDeps === 'function' ? deps.benchDeps() : deps.benchDeps)
  /** @type {Map<string, object>} newest last */
  const replays = new Map()
  let running = null

  const view = (r) => ({
    id: r.id,
    siteKey: r.siteKey,
    state: r.state,
    phase: r.phase,
    startedAt: r.startedAt,
    endedAt: r.endedAt ?? null,
    minutes: r.minutes,
    inputs: r.inputs ?? null,
    trialSite: r.trialSite ?? null,
    writeRun: r.writeRun ?? null,
    diagnostics: r.diagnostics ?? null,
    error: r.error ?? null,
    lines: r.lines.slice(-60)
  })

  /** One bench command, its lines kept on the replay. */
  async function bench(r, argv) {
    const out = []
    const err = []
    const code = await runBench(argv, {
      ...benchDeps(),
      out: (line) => out.push(String(line)),
      err: (line) => err.push(String(line))
    })
    for (const line of out) r.lines.push(`${argv[0]}: ${line}`)
    for (const line of err) r.lines.push(`${argv[0]} (err): ${line}`)
    return { code, out, err }
  }

  /** The chain record of a site's current build, or null. */
  async function chainOf(siteKey) {
    const { rows } = await pool.query(
      `select b.timings -> 'chain' as chain
         from site_brief b left join site s on s.site_key = b.site_key
        where b.site_key = $1 and b.timings ? 'chain' and ${CURRENT_BRIEF}
        order by b.created_at desc
        limit 1`,
      [siteKey]
    )
    return rows[0]?.chain ?? null
  }

  /** The build's frozen inputs as files in `dir`, and what they are. */
  async function gather(r, chain, dir) {
    const runIds = Object.fromEntries(
      (Array.isArray(chain.steps) ? chain.steps : [])
        .filter((s) => typeof s?.runId === 'string' && s.runId)
        .map((s) => [s.step, s.runId])
    )
    if (!runIds.plan)
      throw replayError(
        'REPLAY_NO_PLAN_RUN',
        `the build of ${r.siteKey} names no planner run: its kit and research are not known`
      )
    const { rows: planRuns } = await pool.query(
      `select kit ->> 'ref' as kit_ref, brief_source ->> 'revisionId' as revision_id from site_planner_run where id = $1`,
      [runIds.plan]
    )
    const kitRef = planRuns[0]?.kit_ref
    const revisionId = planRuns[0]?.revision_id
    if (!kitRef || !revisionId)
      throw replayError(
        'REPLAY_NO_PLAN_RUN',
        `the planner run ${runIds.plan} is gone or names no kit and research`
      )
    const opened = openKit(kitRef)
    if (!opened) throw replayError('REPLAY_NO_KIT', `the kit ${kitRef} is not readable on this server`)
    const kit = {
      ref: kitRef,
      platform: opened.platform,
      doc: opened.doc,
      contentMap: openContentMap(kitRef)?.doc ?? null
    }
    const { rows: revisions } = await pool.query('select brief from wo_revision where id = $1', [revisionId])
    if (!revisions[0]) throw replayError('REPLAY_NO_RESEARCH', `no research revision ${revisionId}`)
    const briefText = `${JSON.stringify(revisions[0].brief, null, 2)}\n`
    const files = { brief: path.join(dir, 'brief.json') }
    await writeFile(files.brief, briefText)
    const made = {}
    const gone = {}

    const { rows: rounds } = await pool.query(
      'select plan from site_planner_round where run_id = $1 and plan is not null order by round desc limit 1',
      [runIds.plan]
    )
    files.plan = path.join(dir, 'plan.json')
    made.plan = Boolean(rounds[0]?.plan)
    await writeFile(files.plan, JSON.stringify(rounds[0]?.plan ?? standInPlan(kit), null, 2))

    // The copy, brand and pictures as their runs keep them; a run that is gone or made nothing gets the chain's stand-in.
    const taken = async (name, file) => {
      if (!runIds[name]) return null
      const out = path.join(dir, name)
      try {
        const got = await steps.filesOf(name, runIds[name], out)
        if (got?.code)
          r.lines.push(`${name}: get ended ${got.code}: ${(got.err ?? []).join(' ').slice(0, 300)}`)
      } catch (error) {
        r.lines.push(`${name}: ${String(error?.message ?? error)}`)
        return null
      }
      const at = path.join(out, file)
      if (!(await exists(at))) return null
      // A document whose pictures are gone is not what the build wrote: it is set aside, never written half.
      const missing =
        name === 'copy' ? [] : await missingFilesOf(JSON.parse(await readFile(at, 'utf8')), path.dirname(at))
      if (missing.length) {
        gone[name] = missing.length
        r.lines.push(
          `${name}: ${missing.length} of its pictures are gone (${missing.slice(0, 3).join(', ')}): the run is older than tracy-web's last deploy`
        )
        return null
      }
      return at
    }
    files.copy = await taken('copy', 'site-copy.json')
    made.copy = Boolean(files.copy)
    if (!files.copy) {
      files.copy = path.join(dir, 'site-copy-stand-in.json')
      const planText = await readFile(files.plan, 'utf8')
      await writeFile(files.copy, JSON.stringify(standInCopy(kit, { planText, briefText }), null, 2))
    }
    files.brand = await taken('brand', 'brand-file.json')
    made.brand = Boolean(files.brand)
    if (!files.brand) {
      files.brand = path.join(dir, 'brand-stand-in.json')
      await writeFile(files.brand, JSON.stringify(standInBrand(kit, revisions[0].brief), null, 2))
    }
    files.pictures = await taken('pictures', 'mapping.json')
    made.pictures = Boolean(files.pictures)
    const manifest = files.pictures ? path.join(path.dirname(files.pictures), 'site-pictures.json') : null
    files.manifest = manifest && (await exists(manifest)) ? manifest : null
    return { kitRef, revisionId, runIds, made, gone, files }
  }

  /** The replay itself: inputs, trial site, write, check, each phase timed. */
  async function play(r, chain, { allGroups }) {
    let dir = null
    let ended = { state: 'failed' }
    const timed = async (phase, fn) => {
      r.phase = phase
      const began = now()
      try {
        return await fn()
      } finally {
        r.minutes[phase] = Math.round((now() - began) / 600) / 100
      }
    }
    try {
      dir = await mkdtemp(path.join(deps.tmp ?? tmpdir(), 'tracy-chain-replay-'))
      const inputs = await timed('inputs', () => gather(r, chain, dir))
      r.inputs = {
        kit: inputs.kitRef,
        revisionId: inputs.revisionId,
        runIds: inputs.runIds,
        made: inputs.made,
        ...(Object.keys(inputs.gone).length ? { gone: inputs.gone } : {})
      }
      const site = await timed('site', () =>
        bench(r, [
          'create-site',
          '--kit',
          inputs.kitRef,
          '--account',
          r.account,
          '--by',
          REPLAY_BY,
          '--keep-others'
        ])
      )
      const siteKey = site.out[0]?.trim()
      if (site.code !== 0 || !siteKey)
        throw replayError(
          'REPLAY_SITE_FAILED',
          site.err.join(' ').slice(0, 400) || 'the trial site was not made'
        )
      r.trialSite = siteKey
      const { files } = inputs
      const wrote = await timed('write', () =>
        bench(r, [
          'run',
          '--site',
          siteKey,
          '--kit',
          inputs.kitRef,
          '--plan-file',
          files.plan,
          '--copy-file',
          files.copy,
          '--brief-file',
          files.brief,
          '--brand-file',
          files.brand,
          ...(files.pictures ? ['--pictures-file', files.pictures] : []),
          '--account',
          r.account,
          '--by',
          REPLAY_BY
        ])
      )
      const writeRun = wrote.out[0]?.trim()
      if (!writeRun)
        throw replayError(
          'REPLAY_WRITE_FAILED',
          wrote.err.join(' ').slice(0, 400) || 'the write did not start'
        )
      r.writeRun = writeRun
      const checkDir = path.join(dir, 'check')
      await timed('check', () =>
        bench(r, [
          'check',
          '--run',
          writeRun,
          '--account',
          r.account,
          '--out',
          checkDir,
          ...(files.manifest ? ['--site-pictures-file', files.manifest] : []),
          ...(allGroups ? ['--all-groups'] : [])
        ])
      )
      // The write report and the check, summed up as the chain's diagnostics.
      const reportDir = path.join(dir, 'write')
      await bench(r, ['get', writeRun, '--out', reportDir])
      const read = (file) =>
        readFile(file, 'utf8').then(
          (text) => JSON.parse(text),
          () => null
        )
      const report = await read(path.join(reportDir, 'site-write-report.json'))
      const siteCheck = await read(path.join(checkDir, 'site-check.json'))
      r.diagnostics = stepNineDiagnostics({ report, siteCheck })
      ended = { state: 'done' }
    } catch (error) {
      ended.error = {
        // The replay's own codes; any other error (a file system one, a bench throw) is REPLAY_FAILED with its words.
        code: /^REPLAY_[A-Z_]+$/.test(String(error?.code ?? '')) ? error.code : 'REPLAY_FAILED',
        reason: String(error?.message ?? error).slice(0, 400)
      }
      log.warn?.(`[chain-replay] ${r.siteKey}: ${ended.error.code}: ${ended.error.reason}`)
    } finally {
      if (dir && deps.keepFiles) log.info?.(`[chain-replay] ${r.id}: files kept in ${dir}`)
      else if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
      // Its files gone, it ends in one step with no wait between: a replay that reads done or failed is over, and the next
      // one can start at once.
      Object.assign(r, ended, { phase: null, endedAt: iso(now()) })
      if (running === r) running = null
    }
  }

  return {
    /**
     * Starts the replay of a site's chain build, or says why not. It runs on after this answers.
     * @param {{ siteKey: string, account: string, allGroups?: boolean }} input
     */
    async start({ siteKey, account, allGroups = false }) {
      if (running)
        return {
          ok: false,
          code: 'REPLAY_BUSY',
          reason: `the replay ${running.id} of ${running.siteKey} is still going; one replay runs at a time`
        }
      if (typeof account !== 'string' || !account.includes('@'))
        return {
          ok: false,
          code: 'REPLAY_NO_ACCOUNT',
          reason: 'a replay writes as a signed-in staff account'
        }
      const chain = await chainOf(siteKey)
      if (!chain)
        return { ok: false, code: 'NO_CHAIN_BUILD', reason: `${siteKey} has no chain build to replay` }
      const r = {
        id: randomUUID(),
        siteKey,
        account,
        state: 'running',
        phase: 'inputs',
        startedAt: iso(now()),
        minutes: {},
        lines: []
      }
      replays.set(r.id, r)
      while (replays.size > KEEP) replays.delete(replays.keys().next().value)
      running = r
      void play(r, chain, { allGroups })
      return { ok: true, replay: view(r) }
    },
    /** One replay as it stands, or null. */
    get(id) {
      const r = replays.get(id)
      return r ? view(r) : null
    },
    /** The replays this process keeps, newest first. */
    list() {
      return [...replays.values()].reverse().map(view)
    }
  }
}
