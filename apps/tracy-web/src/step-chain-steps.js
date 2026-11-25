// Wiring: the real steps of the step chain engine (`sites/brief-engines/step-chain.js`, #483). It sits beside app.js because
// it joins the template kit, the brand step, the planner, the writer, the picture step and step 9, each a domain of its own.
//
// Every model step runs exactly as its bench runs it: a run queued through the bench's own command line (`run --kit
// <ref> --brief-revision <id>`), played by the bench worker this server already runs (server.js starts each queue), and
// its files taken out with the bench's own `get`. So the chain reads the research revision the benches read, with the
// same prompts, checkers and doors, and each step's USD is its run's own spend record. A bench holds up to
// BENCH_RUNS_AT_ONCE runs (lib/bench-sql.js, #633), so builds started together run their steps side by side; a start
// that finds the bench full waits for a free place. Step 9 is `runStepNine` whole, its writes through the setup door the
// engine hands it, its site check and 9b repair agent as the write step bench wires them.
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { runCli as brandCli } from './brand-step/brand-cli.js'
import { brandRunDir } from './brand-step/brand-wiring.js'
import { hostCall } from './host/client.js'
import { CHAIN_BENCH_CHECK_FAILED, chainBenchFailure } from './lib/chain-bench-verdict.js'
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
import { stepNineDiagnostics } from './step-chain-write-diagnostics.js'
import { mintSeatSession } from './workspace/seat-door.js'
import { httpSiteDoor } from './write-step/bench-site-door.js'
import { siteFileReader } from './write-step/site-file.js'
import { probeSiteHome, runWithSiteRecovery } from './write-step/site-recovery.js'
import { sitePageReader, siteSheetsReader } from './write-step/site-sheets.js'
import { standInBrand, standInCopy, standInPlan } from './write-step/stand-in-files.js'
import { benchRepairAgent } from './write-step-bench-repair-agent.js'
import { runStepNine } from './write-step-nine.js'

const BY = 'step-chain'

/** What a chain build adds to a bench `run` so its step carries no USD cap (the bench's own default runs keep it). */
const NO_CAPS = ['--no-caps']
const POLL_MS = 10_000
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const RUN_ACTIVE = /_RUN_ACTIVE|runs? at a time/

/** A step error that carries the USD its run spent before it failed. */
const stepError = (message, usd = 0) => Object.assign(new Error(message), { usd })

/**
 * @param {{ pool: import('pg').Pool, config: any, secret: string, kitImages: { ensure: Function },
 *   brandWiring: Function, picturesStoreDir: string, fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>,
 *   log?: { warn?: Function, info?: Function }, port?: string | number, keepFiles?: boolean,
 *   benchCli?: Partial<Record<'brand' | 'plan' | 'copy' | 'pictures', Function>> }} deps `keepFiles`: leave a
 *   run's files on disk after it ends
 */
/**
 * How many parts the copy step's first draft is written in at once (site-writer/writer-parts.js). Five: eight (#710,
 * dev lat20, 20/11/2026) waited 331 s against 370 s at BXR London and 269 s against 222 s at Arabian Tea House, at
 * about four times the spend (0.83 against 0.22 USD), since every part reads the kit and reasons from the start.
 */
export const COPY_PARTS = 5

/**
 * The draft copy's parts under the staff switch `sevenParts` (trial). Each page reasons about as much whatever its
 * size (Arabian Tea House, lat21 to lat27, 21–22/11/2026: 15k to 72k reasoning tokens a page, home with 143 slots and
 * reservation with 18 alike), and "shared" about as much as two pages. With five parts, splitting "shared" puts two
 * pages in one part: reservation with contact was the slowest part of three split drafts (42k to 72k tokens, 161 to
 * 452 s). Seven give each Arabian Tea House page a part of its own beside the two halves of "shared".
 */
export const COPY_PARTS_TRIAL = 7

/**
 * The chain's planner run arguments, without the budget flag: round 0 in one conversation, at the run's effort (max).
 *
 * - Not `--parallel-pages`: planned in parts (#708, #710), round 0 was no faster and the plan was worse. Each part
 *   reasoned 30k to 75k tokens, about what one conversation reasons for the whole site, so the parts reasoned about
 *   four times as much in all, and the part with the whole site's fields read the kit for 307 s. Round 0 (dev):
 *   Arabian Tea House 398 s in one conversation (lat18), 451 s in three parts (lat19), 421 s in five (lat20); BXR
 *   London 588 s, 509 s, 502 s. The parts' decisions did not agree: a page path one part renamed was still linked by
 *   another's button (a 404), more pages were kept (22 against 8), BXR's plan still had 238 failures after its first
 *   fix round (11 in one conversation), and the final site check found unreachable pages in every build planned in
 *   parts (none in lat18). The planner bench still plans in parts when a run asks for it.
 * - Not `--framed-parts` (#713, plan-frame.js): a frame first, then the kept pages in four parts from it, was slower
 *   and worse too (dev lat22 against lat21, 20/11/2026). The frame alone took 379 s at BXR London and reasoned 58k
 *   tokens, about what one conversation reasons for the whole plan, and the parts added their own: round 0 reasoned
 *   126k against 63k at Arabian Tea House and 216k against 68k at BXR, took 487 s against 463 s and 666 s against
 *   568 s, and the plan step ended with failures standing where lat21's ended clean. The final site check found 84
 *   blocks against 34 at ATH (template words and pictures left on pages the frame kept and no part filled) and 131
 *   against 69 at BXR (six of ten pages unreachable). The planner bench keeps the framed plan for runs that ask.
 * - Not `--first-draft-effort`: round 0 at high (#713) did not think less (the frame alone reasoned 58k tokens at high)
 *   and was measured only together with the framed plan; round 0 keeps the run's max.
 * - Not `--kit-in-first-message`: with the whole kit in its first message the planner put all its reasoning into the
 *   turn that writes the plan, and on the local stand (run15, 15/11/2026) that turn hit the 128k output cap (104k of
 *   reasoning) and the build lost its plan; read part by part, the reasoning is spread over turns.
 * - Not `--kit-index-in-first-message` (#713): with the kit's site, page groups and pages in the first message, the
 *   planner did not read less; it moved its thinking into the reading turns. Dev lat23 against lat21 (21/11/2026, one
 *   conversation at max both): round 0 546 s against 463 s at Arabian Tea House (reading 347 s against 264 s, 82k
 *   reasoning against 63k) and 621 s against 568 s at BXR London (eight reading turns, 490 s). The planner bench keeps
 *   it for runs that ask.
 */
export const planArgs = (kitRef, revisionId) => [
  '--kit',
  kitRef,
  '--brief-revision',
  revisionId,
  '--require-visual-review'
]

/**
 * The bench flags a chain step adds for the staff measurement switches that are on (`chainTrials` of the WO settings,
 * `CHAIN_TRIALS`), and the names of those switches for the step's record. `planTurns` plans round 0 in writing turns
 * of one conversation (site-planner/plan-turns.js), stage 1 of ADR 0045 (measured slower and worse on dev, trial t1,
 * 21/11/2026); `wholeShared` keeps the draft copy's "shared" one part, as before the split of a heavy "shared" into
 * shared block parts became the default (writer-parts.js writingUnits, copyArgs). With a switch, a build with it and one without can be measured side by side on dev, where a merge and a revert per setting gave one build each and the spread of one setting between two
 * builds (BXR London round 0: 546 s and 761 s on the same prompt, lat24b and lat25) was larger than what was measured.
 * @param {'plan' | 'copy' | 'pictures'} step @param {Record<string, boolean> | null | undefined} trials
 * @returns {{ argv: string[], names: string[] }}
 */
export function trialArgs(step, trials) {
  const on = (name) => trials?.[name] === true
  if (step === 'plan' && on('planTurns')) return { argv: ['--plan-turns'], names: ['planTurns'] }
  // `wholeShared` takes away the default `--split-shared`, and `sevenParts` writes the draft in seven parts
  // (COPY_PARTS_TRIAL): copyArgs reads both switches itself, so neither adds a flag of its own.
  const copyNames = ['wholeShared', 'sevenParts'].filter(on)
  if (step === 'copy' && copyNames.length) return { argv: [], names: copyNames }
  return { argv: [], names: [] }
}

export function createStepChainSteps(deps) {
  const { pool, config, secret, kitImages, brandWiring, picturesStoreDir } = deps
  const { fetchImpl = fetch, sleep = realSleep, log = console } = deps
  // The staff measurement switches a build runs with (trialArgs): read once, when its first step starts, and kept for
  // every later step of the same build. Each step read them when it started before 21/11/2026, so a switch turned off
  // after a build's plan step had started was off again for its draft copy minutes later, and a side-by-side trial of a
  // copy switch (trial s1) measured the switch off in both arms.
  const trialsOfBuild = new WeakMap()
  const trialsOf = async (ctx) => {
    if (!trialsOfBuild.has(ctx)) trialsOfBuild.set(ctx, (await readWoOpsSettings(pool)).settings.chainTrials)
    return trialsOfBuild.get(ctx)
  }
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
   * The run of this bench that a chain already started on the same inputs and that is still going, or null. A chain
   * started again after a restart (the action's resume, #574) finds the run its lost attempt queued, which the bench
   * worker carries on: it takes that run over instead of waiting for it to end and then starting the same work again
   * (13/11/2026, local stand: a restart during the plan step waited 18 minutes for the old planner run, threw its plan
   * away and planned again for 13 minutes). The same inputs: started by the chain, the same research revision and kit,
   * and for the copy and pictures steps the same plan; among several active runs (#633) only such a run is taken, the
   * newest, never another build's, and never one asked to stop (it ends cancelled, whatever the step waits for). A run
   * of another build, or of other inputs, is waited for as before.
   * @param {string} name a bench of `benches`
   * @param {{ revisionId: string, kitRef: string, plan?: unknown } | null} same
   */
  async function ownActiveRun(name, same) {
    if (!same?.revisionId || !same.kitRef) return null
    // A step that runs on a plan adopts only a run on the same plan; with its plan unreadable it adopts nothing.
    const withPlan = 'plan' in same
    if (withPlan && same.plan == null) return null
    const { rows } = await pool.query(
      `select id from ${benches[name].table}
        where status = 'queued' and started_by = $1 and brief_source ->> 'revisionId' = $2 and kit ->> 'ref' = $3
              and cancel_requested_at is null ${withPlan ? 'and plan = $4::jsonb' : ''}
        order by created_at desc
        limit 1`,
      [`cli:${BY}`, same.revisionId, same.kitRef, ...(withPlan ? [JSON.stringify(same.plan)] : [])]
    )
    return rows[0]?.id ?? null
  }

  /**
   * A bench run of one step, from its start to its files in `dir`: this build's own run taken over when one is still
   * going, else started (waiting while the bench is full), followed on its row until it ends, its files taken out.
   * Cancelled when the chain no longer needs it.
   */
  async function benchRun(name, argv, dir, signal, same = null, { onPoll = null } = {}) {
    let runId = null
    for (;;) {
      if (signal.aborted) throw signal.reason ?? new Error('stopped')
      // Looked up before every start: with room on the bench a start is no longer refused while the build's own run
      // goes on, so asking only after a refusal would start the same work a second time beside it (#633).
      runId = await ownActiveRun(name, same)
      if (runId) {
        log.info?.(
          `[step-chain] ${name}: took over the run ${runId} this build already started on the same inputs`
        )
        break
      }
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
        // A look at the run while it goes on (the plan step hands on its checked first draft); never stops the wait.
        if (onPoll) await onPoll(runId).catch(() => {})
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
  /** This run's own folder, made once. */
  async function folderOf(ctx) {
    if (!folders.has(ctx.runId)) {
      // Brand and Planner start together: publish the allocation before yielding, so disposal owns both exports.
      const pending = mkdtemp(path.join(tmpdir(), 'tracy-step-chain-'))
      folders.set(ctx.runId, pending)
      pending.catch(() => {
        if (folders.get(ctx.runId) === pending) folders.delete(ctx.runId)
      })
    }
    return folders.get(ctx.runId)
  }
  const revisionOf = (ctx) => String(ctx.brief?.researchRevisionId ?? '')
  // The plan a copy or pictures run is given, as its row keeps it (`plan`): an unreadable file is null and matches no run.
  const planOf = (file) =>
    readFile(file, 'utf8').then(
      (text) => JSON.parse(text),
      () => null
    )
  const exists = (file) =>
    stat(file).then(
      (f) => f.isFile() && f.size > 0,
      () => false
    )
  /** The copy step's writer run arguments on a plan file, without the budget flag. */
  function copyArgs(ctx, kit, plan, trials = null) {
    return [
      '--plan-file',
      plan.file,
      '--kit',
      kit.ref,
      '--brief-revision',
      revisionOf(ctx),
      '--require-visual-review',
      // The first draft in five parts written at once (site-writer/writer-parts.js). Local stand, run13's plan
      // (15/11/2026), three parts: 509 s against 594 s, 27 first-draft failures against 79 (repeats 18 against 66), 3
      // standing against 11; the copy step's spend doubles (0.19 against 0.09 USD). Five since 19/11/2026: on dev the
      // copy step became BXR London's longest (8.9 to 10.2 minutes) and its round 0 waited on its heaviest of three
      // parts (367 s against 177 s for the lightest); each part's first message is the same cached fixed part.
      // Eight were tried on 20/11/2026 and were no faster at four times the spend (COPY_PARTS).
      '--parallel-pages',
      String(trials?.sevenParts === true ? COPY_PARTS_TRIAL : COPY_PARTS),
      // A heavy "shared" gives up its heaviest shared blocks as parts of their own (writer-parts.js writingUnits), unless
      // the build's staff switch `wholeShared` keeps it whole. "shared" led every draft measured before (Arabian Tea
      // House: 228 to 509 s alone against 28 to 225 s for the other parts, lat21 to s1, 21/11/2026). Side by side on dev
      // (s2, s3, s4; 22/11/2026), split against whole, the heaviest part wrote about 15% fewer tokens (41k to 49k against
      // 39k to 76k), the draft took 178 against 350 s, 366 against 172 s (one slow provider call) and 245 against 419 s,
      // and the final check found 49 against 47 and 46 against 62 blocks.
      ...(trials?.wholeShared === true ? [] : ['--split-shared'])
    ]
  }

  /**
   * A bench step's answer: its output when the run succeeded; when it failed, an error that still carries the output it
   * made (if any), so the chain uses the best version rather than nothing.
   */
  async function answerOf({ usd, failure, checkFailures, runId, draftRunId, trials }, value, made) {
    // The bench run ids go on the chain's step record, so staff can read where a step's time went
    // (GET /api/ops/wo/bench-runs/:bench/:runId), and so do the measurement switches the step ran with.
    const ids = {
      ...(runId ? { runId } : {}),
      ...(draftRunId ? { draftRunId } : {}),
      ...(trials?.length ? { trials } : {})
    }
    if (!failure) return { value, usd, ...ids }
    throw Object.assign(
      stepError(failure, usd),
      ids,
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
    /**
     * A finished bench run's files, taken out the way the chain takes them (`get`). The chain build replay
     * (step-chain-replay.js) reads a past build's inputs so, and writes exactly what that build wrote. Like the chain,
     * it reads the files `get` wrote whatever its exit code: a run whose mapping has problems still writes it (the
     * picture bench says them and ends 3), and the caller looks for the files it needs.
     * @param {'brand' | 'plan' | 'copy' | 'pictures'} name @param {string} runId @param {string} dir
     * @returns {Promise<{ code: number, out: string[], err: string[] }>}
     */
    async filesOf(name, runId, dir) {
      await mkdir(dir, { recursive: true })
      return command(name, ['get', runId, '--out', dir])
    },
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
      await trialsOf(ctx)
      const ref = ctx.contract?.id
      if (!ref || !readableKits().some((k) => k.ref === ref))
        throw stepError(`no readable template kit for ${ref ?? ctx.quickstart}`)
      const kit = openKit(ref)
      const images = await kitImages.ensure(kit)
      if (!images.ok) throw stepError(`the kit ${ref} images: ${images.code}: ${images.reason}`)
      const map = openContentMap(ref)
      if (map?.invalid) throw stepError(`the kit ${ref} content map: ${map.invalid}`)
      return { value: { ref, platform: kit.platform, doc: kit.doc, contentMap: map?.doc ?? null }, usd: 0 }
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
        signal,
        { revisionId: revisionOf(ctx), kitRef: kit.ref }
      )
      const file = path.join(dir, 'brand-file.json')
      return answerOf(ran, { file }, exists(file))
    },

    async plan(ctx, { kit, onDraft = null }, { signal }) {
      const dir = path.join(await folderOf(ctx), 'plan')
      // The first draft, once checked with failures (so fix rounds follow): handed on once, so the copy step's first
      // draft is written while the planner fixes its own (copyDraft). A draft that passes needs no fix round, and the
      // plan step ends with it anyway.
      let drafted = false
      const onPoll = onDraft
        ? async (runId) => {
            if (drafted) return
            const { rows } = await pool.query(
              `select plan, failure_list from site_planner_round where run_id = $1 and round = 0 and state = 'checked'`,
              [runId]
            )
            if (!rows[0]?.plan || !String(rows[0].failure_list ?? '').trim()) return
            drafted = true
            await mkdir(dir, { recursive: true })
            const file = path.join(dir, 'plan-draft.json')
            await writeFile(file, `${JSON.stringify(rows[0].plan, null, 2)}\n`)
            onDraft({ file })
          }
        : null
      // The build's staff measurement switches (trialsOf): a switch turned after its first step is the next build's.
      const trial = trialArgs('plan', await trialsOf(ctx))
      const ran = await benchRun(
        'plan',
        [...planArgs(kit.ref, revisionOf(ctx)), ...trial.argv, ...NO_CAPS],
        dir,
        signal,
        { revisionId: revisionOf(ctx), kitRef: kit.ref },
        { onPoll }
      )
      // The plan the run ended with: the last round that has one, as `get` writes it (plan-vN.json).
      const { rows } = await pool.query(
        'select plan from site_planner_round where run_id = $1 and plan is not null order by round desc limit 1',
        [ran.runId]
      )
      if (!rows[0]?.plan) throw stepError(ran.failure ?? `the planner run ${ran.runId} left no plan`, ran.usd)
      const file = path.join(dir, 'plan.json')
      await writeFile(file, `${JSON.stringify(rows[0].plan, null, 2)}\n`)
      return answerOf({ ...ran, trials: trial.names }, { file }, true)
    },

    // The copy step's first draft on the plan's checked first draft, written while the planner fixes its plan: one
    // round, no fix round (the copy step on the final plan takes it as its base copy, checks it and fixes it). Its file
    // and spend, or null when it made no copy.
    async copyDraft(ctx, { kit, plan }, { signal }) {
      const dir = path.join(await folderOf(ctx), 'copy-draft')
      const trials = await trialsOf(ctx)
      const trial = trialArgs('copy', trials)
      const argv = [...copyArgs(ctx, kit, plan, trials), ...trial.argv, '--max-fix-rounds', '0', ...NO_CAPS]
      const same = { revisionId: revisionOf(ctx), kitRef: kit.ref, plan: await planOf(plan.file) }
      const ran = await benchRun('copy', argv, dir, signal, same)
      const file = path.join(dir, 'site-copy.json')
      return (await exists(file)) ? { file, usd: ran.usd, runId: ran.runId, trials: trial.names } : null
    },

    async copy(ctx, { kit, plan, base = null }, { signal }) {
      const dir = path.join(await folderOf(ctx), 'copy')
      // With a draft copy (copyDraft) the run takes it as round 0 and only checks and fixes it against the final plan;
      // its spend is the copy step's too.
      if (base?.file) {
        const argv = [
          '--plan-file',
          plan.file,
          '--kit',
          kit.ref,
          '--brief-revision',
          revisionOf(ctx),
          '--base-copy',
          base.file,
          ...NO_CAPS
        ]
        const same = { revisionId: revisionOf(ctx), kitRef: kit.ref, plan: await planOf(plan.file) }
        const ran = await benchRun('copy', argv, dir, signal, same)
        const file = path.join(dir, 'site-copy.json')
        return answerOf(
          {
            ...ran,
            usd: Number(ran.usd ?? 0) + Number(base.usd ?? 0),
            draftRunId: base.runId,
            trials: base.trials ?? []
          },
          { file },
          exists(file)
        )
      }
      const trials = await trialsOf(ctx)
      const trial = trialArgs('copy', trials)
      const argv = [...copyArgs(ctx, kit, plan, trials), ...trial.argv, ...NO_CAPS]
      const same = { revisionId: revisionOf(ctx), kitRef: kit.ref, plan: await planOf(plan.file) }
      const ran = await benchRun('copy', argv, dir, signal, same)
      const file = path.join(dir, 'site-copy.json')
      return answerOf({ ...ran, trials: trial.names }, { file }, exists(file))
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
      const same = { revisionId: revisionOf(ctx), kitRef: kit.ref, plan: await planOf(plan.file) }
      const ran = await benchRun('pictures', argv, dir, signal, same)
      const value = { file: path.join(dir, 'mapping.json'), manifest: path.join(dir, 'site-pictures.json') }
      return answerOf(ran, value, exists(value.file))
    },

    // Step 9 whole: write, Site check, 9b repair pass, recheck, hand-over (write-step-nine.js).
    async write(ctx, inputs, { door, limits }) {
      const dir = await folderOf(ctx)
      const { rows } = await pool.query('select brief from wo_revision where id = $1', [revisionOf(ctx)])
      if (!rows[0]) throw stepError(`no research revision ${revisionOf(ctx)}`)
      const brief = path.join(dir, 'brief.json')
      const briefText = `${JSON.stringify(rows[0].brief, null, 2)}\n`
      await writeFile(brief, briefText)
      // A planner or writer that made nothing leaves stand-ins: the whole kit kept, no slot filled, so the closing ladder
      // empties every kept slot nothing else fills (write-step/stand-in-files.js).
      let planFile = inputs.plan?.file
      if (!planFile) {
        planFile = path.join(dir, 'plan-stand-in.json')
        await writeFile(planFile, JSON.stringify(standInPlan(inputs.kit), null, 2))
      }
      let copyFile = inputs.copy?.file
      if (!copyFile) {
        copyFile = path.join(dir, 'site-copy-stand-in.json')
        const planText = await readFile(planFile, 'utf8')
        await writeFile(copyFile, JSON.stringify(standInCopy(inputs.kit, { planText, briefText }), null, 2))
      }
      // A brand step that made no file leaves a stand-in that still names the business from the brief, so the site never
      // keeps the template's demo name or its label (write-step/stand-in-files.js).
      let brandFile = inputs.brand?.file
      if (!brandFile) {
        brandFile = path.join(dir, 'brand-stand-in.json')
        await writeFile(brandFile, JSON.stringify(standInBrand(inputs.kit, rows[0].brief), null, 2))
      }
      const site = await siteOf(ctx.siteKey)
      if (!site) throw stepError(`no site ${ctx.siteKey}`)
      // The comment requests and turn undo of 9b go through the web app's own doors as the site owner; every Apply call of
      // the step, the write and the site check's reads, goes through the setup door under this run's id.
      const http = ownerSiteDoor(ctx, site)
      const siteDoor = { ...http, apply: door.apply }
      const manifest = inputs.pictures
        ? JSON.parse(await readFile(inputs.pictures.manifest, 'utf8').catch(() => 'null'))
        : null
      const host = hostMeasure({ hostCall, config, site, selfNames: demoSelfNames, fetchImpl })
      const write = {
        host,
        door: siteDoor,
        siteKey: ctx.siteKey,
        kit: { ref: inputs.kit.ref, doc: inputs.kit.doc, platform: inputs.kit.platform },
        contentMap: inputs.kit.contentMap,
        files: {
          plan: planFile,
          copy: copyFile,
          brief,
          brand: brandFile,
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
          brief: rows[0].brief,
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
        fetchImpl,
        setupRun: ctx.runId
      })
      const out = path.join(dir, 'step-9')
      await mkdir(out, { recursive: true })
      const step = await runWithSiteRecovery({
        signal: ctx.signal,
        door: siteDoor,
        siteKey: ctx.siteKey,
        runId: ctx.runId,
        probe: () => probeSiteHome({ site, readers, fetchImpl }),
        sleep,
        run: () =>
          runStepNine({
            write,
            beforeRepair: async () => {
              if (!ctx.commitSetupWrites) throw new Error('The chain has no setup write checkpoint.')
              await ctx.commitSetupWrites()
            },
            checkSite,
            pictures: manifest,
            agent,
            baselines: contractBaselineStore({ index: defaultContracts() }),
            pageHtml: (page) => pageHtml({ siteKey: ctx.siteKey, path: page }),
            limits,
            // A chain build runs 9b only when it could leave the site clean (write-step-nine.js cannotFinish).
            repairOnlyWhenItCanFinish: true,
            saveFile: (name, data) => writeFile(path.join(out, name), data),
            log: { warn: (line) => log.warn?.(`[step-chain] ${ctx.siteKey}: ${line}`) }
          })
      })
      await writeFile(path.join(out, 'site-recovery.json'), JSON.stringify(step.recovery, null, 2))
      await writeFile(path.join(out, 'site-write-report.json'), JSON.stringify(step.report, null, 2))
      const usd = step.repair ? (step.repair.costUsd?.agent ?? null) : 0
      return {
        value: {
          report: step.report,
          siteCheck: step.siteCheck?.status ?? null,
          diagnostics: stepNineDiagnostics(step)
        },
        usd,
        ...(usd === null ? { knownUsd: step.repair?.costUsd?.agentKnown ?? 0 } : {})
      }
    },

    // What the run left on disk goes with it (unless `keepFiles`: a stand that reads them after); the bench runs keep their
    // own rows and files.
    async dispose(prepared) {
      const pending = folders.get(prepared?.runId)
      if (!pending) return
      folders.delete(prepared.runId)
      const dir = await pending
      if (deps.keepFiles) log.info?.(`[step-chain] run ${prepared.runId}: files kept`)
      else await rm(dir, { recursive: true, force: true })
    }
  }
}
