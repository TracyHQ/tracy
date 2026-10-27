#!/usr/bin/env node
// round.mjs — the Visual QA fix loop, timed and logged by this script, not by hand. Two modes.
//
// ROLLING (the default for a fix loop): one controller per ledger, the agent talks to it with
// recheck.mjs.
//
//   node scripts/visual/round.mjs --config <round.json> --name <session> --watch [--skip-deploy] [--new-tier]
//        [--stages a,b,c,d] [--tier-concurrency N] [--concurrency N] [--checkpoint-every K --checkpoint-reason "…"]
//
//   deploy → checkpoint (every page × every configured tier, tiers and pages concurrent, bounded)
//   while it runs, each finished page is readable (recheck.mjs --status) and the agent fixes it;
//   a fix (recheck.mjs --changed …) → the running checkpoint is cancelled (it counts for nothing),
//   deploy, generation + 1, re-measure ONLY the pages the change can reach, on EVERY tier, answer
//   with their verdicts → a fresh full checkpoint only on recheck.mjs --checkpoint (the final integration one) — none is scheduled by
//   default; a schedule (`--checkpoint-every K`) and a third or later full checkpoint need a stated reason, recorded in the ledger.
//   After every deploy the loop runs site-sweep.mjs (all eleven checks; SWEEP_CHECKS) and puts its result on the next ledger line.
//
// Why: JA Vega M4c (27/09) — step 8b took ~2 h 05 for 13 rounds over 4 tiers: tool runs ~40 min,
// fixes waited for whole runs, tiers ran one after another and a fix for a later tier broke an
// earlier one unseen (dd-1: 181 new; lr-1: 54 new). Here every fix is judged on every tier at once,
// and nothing waits for pages the fix cannot reach.
//
// ONE ROUND (the old loop, still whole): build → deploy → seed → contract init → determinism
// preflight → scope → visual-qa (per tier, tiers concurrent) → diff per page against the latest
// measurement of each page → clusters with history (cluster.mjs via report.writeClusterViews, per
// tier) → ONE line appended to <evidence>/rounds.jsonl. Every checkpoint and recheck writes clusters too.
//
//   node scripts/visual/round.mjs --config <round.json> --name <run> [--scope auto|full] [--pages a,b]
//        [--skip-deploy] [--new-tier] [--note "…"] [--stages …] [--tier-concurrency N] [--concurrency N]
//
// A config with one `stage` writes exactly what it wrote before (<evidence>/<run>/, one tier per
// line). With `stages` (several tiers) each tier's report is <evidence>/<run>/<stage>/ and the
// ledger line is one per round with `tiers.<stage>` beside the totals; its tier key is the stages
// joined with `+`, so its round count and lens gate are its own.
//
// Why a script owns this: on Tracy Base wp7 (25/09) three full runs of 750–770 s were 38 of ~90
// minutes, the build/deploy/seed steps ~18 s, and every duration in the run log was typed by an
// agent. Here each step's duration is measured by this process and each step writes its log; the
// ledger line is the only record of order and time.
//
// SCOPE (auto): the tier's first round is FULL. After that the change decides (affected.mjs) —
// CSS by selector on the live DOM, in every (width × theme) state the tiers measure; templates and
// patterns by the contract's layout→template and section→pattern map, united with the pages whose
// served HTML moved; parts/content by served-HTML hash; theme.json, functions.php, inc/*, JS,
// tokens.css, an unknown file, a changed contract, a template the contract cannot place or an
// unparseable selector → FULL. Nondeterministic pages are not selected by HTML hash (their hash
// moves on every request). Targeted runs (rechecks) never pass the gate and never close a tier.
//
// DECISIONS (rounds.mjs): churn guard new ÷ closed > 0.3 on deterministic pages → fix again;
// at most `maxRounds` (3) deploying rounds a tier in ONE-ROUND mode (a 4th deploy is refused
// without --new-tier), at most `maxRounds` checkpoints after the baseline in ROLLING mode (rechecks
// never count and never reset it); STOP when a complete checkpoint shows no net progress against
// the previous complete one (total not decreasing, or closed ≤ new) — a 19 % drop that closed far
// more than it opened continues; owner groups by the kind+layout rule (no LLM routing); lenses:
// `layout` at the tier's first run, every lens at close — and a deploy is REFUSED (`failedStep:
// "lenses"`, before build) while a lens an earlier run of the tier asked for has no
// `notes/<lens>.md` in that run's directory (for several tiers: in each tier's directory).
//
// Config (paths relative to the config file; `${NAME}` `${EVIDENCE}` `${ROUND_DIR}` `${SKILL}`
// `${CONFIG_DIR}` expand in every string, steps included):
//   { "runRoot", "evidence", "site", "sourceSite", "spec", "theme" (built theme dir), "artifact",
//     "pack" (quickstart pack dir; needs "artifact"),
//     "seedReport", "patternsMap", "stage": "light-desktop" | "stages": ["light-desktop", …],
//     "concurrency": 3 (one tier; 2 a tier with several), "tierConcurrency": 2, "checkpointEvery": null (none; with a number, "checkpointReason" is required),
//     "fetches": 5, "maxRounds": 3, "churnLimit": 0.3, "visualQaArgs": [], "visualQaArgsByStage": {},
//     "unsetEnv": ["DOCKER_HOST"], "timeouts": { "<step>": seconds },
//     "steps": { "build"|"deploy"|"seed"|"contractInit": { "cmd": [...], "cwd": "…" } } }
// Resource bound: at most tierConcurrency × concurrency page-axis jobs at once (2 × 2 = 4 browser
// contexts in 2 Chromium processes, plus a mega-hover walk per page when the contract names one).
//
// ARTIFACT BINDING: with `pack` (and `artifact`, the theme zip) every tier that writes a report
// also writes <tier dir>/artifact-binding.json (tracy-visual-artifact-binding/v1) — the report's
// SHA-256, its measurement time, the stage, and the theme zip, webroot archive and database archive
// (the pack's manifest names the two archives) by name and SHA-256. The three are hashed before the
// tiers start and again when each tier ends: an artifact that changed meanwhile, a report whose
// identity names another theme zip or whose times disagree, or a report measured before an artifact
// was written leaves no binding, and the tier — so the checkpoint — is incomplete. release.mjs reads
// these files; it never writes one. Without `pack` a round writes no binding, as before.
import { spawn } from 'node:child_process'
import { appendFileSync, closeSync, constants as FS, copyFileSync, existsSync, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL, contractHash, groupIdOf, resolveContract } from '../lib/canonical.mjs'
import { mapLimit } from '../lib/browser.mjs'
import { STAGES, UNMEASURED_KINDS, containerProbes, containersKey, resolvePageSelection } from './contract.mjs'
import { checkDeterminism } from './determinism.mjs'
import { changedRules, classifyChanges, dependentPages, matchStatesFor, pagesMatching, selectorsFor } from './affected.mjs'
import { writeClusterViews } from './report.mjs'
import { churn, compareRuns, lensesDue, lensesOf, missingLensNotes, nextStep, ownersOf, stableCount, stopRule } from './rounds.mjs'
import { acquireLock, answer, controlFile, pendingRequests, releaseLock, requestsDir } from './recheck.mjs'
import { isArtifactName, readPack } from '../quickstart/lib.mjs'
import { CHECK_ORDER } from './site-sweep-judge.mjs'
import { BEHAVIOUR_ORDER } from './site-sweep-behaviour-judge.mjs'
import { settleOutput } from './site-sweep-publish.mjs'
import { CLUSTERS, readEvidence } from './evidence.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SKILL = path.resolve(HERE, '..', '..')
const STEPS = ['build', 'deploy', 'seed', 'contractInit']

// ── the build loop's rules, held by the tools (SKILL.md §Build loop) ──────────────────────────────────
// Full four-tier checkpoints: exactly two on the clean path (the baseline and the final integration checkpoint), counted per tier in
// this config's ledger (<evidence>/rounds.jsonl). A third or later one is asked for explicitly with a stated reason, which is recorded
// in the ledger line of the checkpoint. The release checkpoint on the stand restored from the pack is measured with its own config
// and evidence dir (quickstart.md §Five phases), so it is that ledger's first, not this one's third.
export const FREE_FULL_CHECKPOINTS = 2
export const CHECKPOINT_REASON = 'checkpoint-reason'
export const CHECKPOINT_LIMIT = 'checkpoint-limit'
const reasonOf = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Whether a full checkpoint may start now: `completed` complete ones are in the tier's ledger; `reason` is what the one asking gave. */
export function checkpointGate({ completed, reason = null }) {
  if (completed < FREE_FULL_CHECKPOINTS || reasonOf(reason)) return { ok: true, reason: reasonOf(reason) }
  return { ok: false, code: CHECKPOINT_LIMIT, why: `[${CHECKPOINT_LIMIT}] ${completed} full checkpoint(s) are already complete for this tier — the clean path is two (the baseline and the final integration checkpoint). A regression after the final checkpoint needs a re-measure: ask for the ${completed + 1}th with a reason (recheck.mjs --checkpoint --reason "<what changed and why a scoped round cannot see it>"); it is recorded in the run record` }
}

// After every build + deploy the loop runs site-sweep.mjs with all eleven checks (the five plain ones, the five behaviour ones and heights), port against
// source: the cheap whole-site measure of what the scoped rounds do not see. The command carries no `--only`: all eleven is the default, and only a sweep without an
// explicit scope uses its history (a scoped re-run of what the last build touched); `--only` would make every route x width x scheme be measured again. `steps.sweep.cmd` replaces the command (`--out <dir>` is appended); source-less pages are measured target-only by the sweep.
export const SWEEP_CHECKS = Object.freeze([...CHECK_ORDER, ...BEHAVIOUR_ORDER, 'heights'])
export function sweepStep(cfg, out) {
  if (cfg.steps?.sweep?.cmd) return { cmd: [...cfg.steps.sweep.cmd, '--out', out], cwd: cfg.steps.sweep.cwd ?? SKILL }
  return {
    cmd: [process.execPath, path.join(SKILL, 'scripts', 'visual', 'site-sweep.mjs'), '--site', cfg.site, ...(cfg.sourceSite ? ['--source', cfg.sourceSite] : []), '--run-root', cfg.runRoot, ...(cfg.spec ? ['--spec', cfg.spec] : []), ...(cfg.artifact && existsSync(cfg.artifact) ? ['--zip', cfg.artifact] : []), '--out', out],
    cwd: SKILL
  }
}

/** Run the sweep step into `<dir>/sweep`. Never throws and never fails the round: its result is a line in the ledger (`sweep`) and in the answer. */
async function runSweepStep(cfg, dir, children = null) {
  const out = path.join(dir, 'sweep')
  const step = sweepStep(cfg, out)
  try {
    const r = await runStep(cfg, 'sweep', step.cmd[0], step.cmd.slice(1), { cwd: step.cwd, timeoutS: cfg.timeouts.sweep ?? 1800, logDir: dir, children })
    settleOutput(out)
    const doc = existsSync(path.join(out, 'site-sweep.json')) ? readJson(path.join(out, 'site-sweep.json')) : null
    const sum = (k) => (doc?.checks ?? []).reduce((n, c) => n + (c[k] ?? 0), 0)
    const complete = doc?.schema === 'tracy-site-sweep/v1' && Array.isArray(doc.checks) && SWEEP_CHECKS.every((id) => doc.checks.some((c) => c.id === id))
    const validClean = complete && doc.exit === 0 && !doc.owed?.length && doc.checks.every((c) => c.pass === true || (c.status === 'not-applicable' && c.pass === undefined && c.cases === 0))
    const status = r.status === 0 && validClean ? 'clean' : r.status === 0 ? 'error' : r.status === 1 ? 'defects' : r.status === 3 ? 'not-measured' : 'error'
    if (r.status === 0 && !doc) return { status: 'error', reason: 'the sweep exited 0 but wrote no site-sweep.json' }
    if (r.status === 0 && !validClean) return { status: 'error', reason: 'the sweep exited 0 without a valid complete clean report' }
    return { status, exit: r.status, out, log: r.log, seconds: r.seconds, ...(doc ? { checks: (doc.checks ?? []).map((c) => c.id), defects: sum('defects'), notMeasured: sum('notMeasured'), notApplicable: (doc.applicability?.outcomes ?? []).filter((x) => x.status === 'not-applicable').length, target: doc.applicability?.target ?? null, targetOutcomes: (doc.applicability?.outcomes ?? []).filter((x) => x.status !== 'not-applicable') } : {}) }
  } catch (e) {
    return { status: 'error', reason: String(e.message).split('\n')[0] }
  }
}
const STAGE_ORDER = STAGES.map((s) => s.id)
const sec = (ms) => Math.round(ms / 100) / 10
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16)
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))

function positiveInt(v, name) {
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer, got ${JSON.stringify(v)}`)
  return n
}

/**
 * The config with paths resolved and `${…}` expanded. `overrides` are the command line's
 * (`--stages`, `--tier-concurrency`, `--concurrency`, `--checkpoint-every`); a null one is not given.
 * Stages are validated and put in the fixed stage order; limits must be positive integers.
 */
export function loadConfig(file, { name, overrides = {} } = {}) {
  const dir = path.dirname(path.resolve(file))
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const evidence = path.resolve(dir, raw.evidence ?? '.')
  const vars = { NAME: name, EVIDENCE: evidence, ROUND_DIR: path.join(evidence, `${name}.round`), SKILL, CONFIG_DIR: dir }
  const expand = (v) =>
    typeof v === 'string' ? v.replace(/\$\{(\w+)\}/g, (m, k) => vars[k] ?? m) : Array.isArray(v) ? v.map(expand) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expand(x)])) : v
  const c = expand(raw)
  const abs = (p) => (p ? path.resolve(dir, p) : null)
  if (c.pack !== undefined && c.pack !== null && (typeof c.pack !== 'string' || !c.pack)) throw new Error('config `pack` must be the path of a quickstart pack directory')
  for (const k of ['runRoot', 'spec', 'theme', 'artifact', 'pack', 'seedReport', 'patternsMap']) c[k] = abs(c[k])
  c.evidence = evidence
  c.roundDir = vars.ROUND_DIR
  for (const s of Object.values(c.steps ?? {})) s.cwd = s.cwd ? path.resolve(dir, s.cwd) : SKILL
  if (!c.runRoot || !c.site) throw new Error('config needs runRoot and site')
  if (c.pack && !c.artifact) throw new Error('config `pack` binds each tier to the theme zip as well as the pack: set `artifact` to the theme zip')
  const given = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== null && v !== undefined))
  const cfg = { fetches: 5, maxRounds: 3, churnLimit: 0.3, visualQaArgs: [], visualQaArgsByStage: {}, timeouts: {}, tierConcurrency: 2, ...c, ...given }
  if ('minDrop' in cfg) console.error('round: `minDrop` is no longer read — the stop rule is net progress between checkpoints (rounds.mjs stopRule)')
  const stages = cfg.stages ?? [cfg.stage ?? 'light-desktop']
  if (!Array.isArray(stages) || !stages.length) throw new Error('config `stages` must be a non-empty list of stage ids')
  for (const s of stages) if (!STAGE_ORDER.includes(s)) throw new Error(`unknown stage ${s} (one of ${STAGE_ORDER.join(', ')})`)
  if (new Set(stages).size !== stages.length) throw new Error(`stage listed twice in ${stages.join(', ')}`)
  cfg.stages = STAGE_ORDER.filter((s) => stages.includes(s))
  cfg.multi = cfg.stages.length > 1
  // the tier key of the ledger: one stage keeps its old key, several are one tier set
  cfg.stage = cfg.stages.join('+')
  cfg.concurrency ??= cfg.multi ? 2 : 3
  for (const k of ['concurrency', 'tierConcurrency', 'fetches', 'maxRounds']) cfg[k] = positiveInt(cfg[k], k)
  // No periodic full checkpoint by default: the clean path is the baseline and the final integration checkpoint (SKILL.md §Build loop).
  // A schedule is asked for explicitly, with the reason it is needed, and the reason goes into the run record.
  if (cfg.checkpointEvery === undefined || cfg.checkpointEvery === null) cfg.checkpointEvery = null
  else {
    cfg.checkpointEvery = positiveInt(cfg.checkpointEvery, 'checkpointEvery')
    if (typeof cfg.checkpointReason !== 'string' || !cfg.checkpointReason.trim()) throw new Error(`[${CHECKPOINT_REASON}] a periodic full checkpoint (checkpointEvery / --checkpoint-every ${cfg.checkpointEvery}) is not scheduled by default: the clean path is the baseline and the final integration checkpoint only. Give the reason it is needed with --checkpoint-reason "<text>" (config: checkpointReason); it is recorded in the run record`)
  }
  for (const s of Object.keys(cfg.visualQaArgsByStage ?? {})) if (!cfg.stages.includes(s)) throw new Error(`visualQaArgsByStage names ${s}, which is not a stage of this config`)
  return cfg
}

/** The lenses the contract's pictures of one stage are for (visual.shots consumers); null when the contract cannot be read. */
function stageConsumersOf(cfg, stage) {
  try {
    const c = readJson(resolveContract({ runRoot: cfg.runRoot, name: CANONICAL.visual }).path)
    return [...new Set((c.visual?.shots ?? []).filter((s) => s.stages?.includes(stage)).flatMap((s) => s.consumers ?? []))]
  } catch {
    return null
  }
}

/** Ledger lines of this stage's current tier (from the last `tierStart` on). */
export function tierLines(lines, stage) {
  const mine = lines.filter((l) => l.stage === stage)
  const start = mine.map((l) => Boolean(l.tierStart)).lastIndexOf(true)
  return start === -1 ? mine : mine.slice(start)
}

/** stage → report directory of one ledger line (a one-tier line: its `out`). */
export const tierOuts = (line) => (line.tiers ? Object.fromEntries(Object.entries(line.tiers).map(([s, t]) => [s, t.out])) : line.out ? { [String(line.stage)]: line.out } : {})

/**
 * The pages one run measured: its report, or — for a run cut short (a checkpoint a fix cancelled)
 * — the pages it finished, from pages.jsonl (visual-qa writes one line a page as it is done).
 */
function pagesOfRun(out) {
  if (!out) return []
  const f = path.join(out, 'visual.json')
  if (existsSync(f)) return readJson(f).pages ?? []
  const ev = path.join(out, 'pages.jsonl')
  if (!existsSync(ev)) return []
  const byPage = new Map()
  for (const line of readFileSync(ev, 'utf8').split('\n').filter(Boolean)) {
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue // the last line of a killed run may be cut
    }
    byPage.set(e.page, { id: e.page, layout: e.layout, findings: e.findings ?? [] })
  }
  return [...byPage.values()]
}

const hasAxisError = (p) => (p.findings ?? []).some((f) => f.kind === 'axis-error')

/**
 * What in a report blocks the run without being a finding, when the report itself explains it: the
 * interaction states the probe ran and could not measure (`notMeasured`), and the intrinsic mobile
 * defects the site has and the source does not (`siteOnly`). Both are results a rerun repeats. A probe
 * that did not run, read nothing or could not read a page is not explained (`unexplained`): that run
 * is broken. Null when nothing blocks.
 */
export function blockingOf(report) {
  const ia = report?.summary?.interaction
  const ii = report?.summary?.intrinsic
  if (!ia?.blocking && !ii?.blocking) return null
  const iaRead = ia?.status === 'run' && (ia.examined ?? 0) > 0
  const interaction = ia?.blocking && iaRead ? (ia.notMeasured ?? 0) : 0
  const intrinsic = ii?.blocking ? (ii.siteOnly ?? 0) : 0
  const unexplained = Boolean((ia?.blocking && (!iaRead || ia.blocking !== interaction)) || (ii?.blocking && (ii.status !== 'run' || (ii.errors ?? 0) > 0)))
  return { interaction, intrinsic, unexplained }
}

/**
 * Why one tier's report is not the measurement it was asked for (an empty list: it is). A file
 * called visual.json is not enough: `visualQaArgsByStage` can narrow a run to `--pages` or
 * `--scope fast-gate`, a run can be stale (--allow-stale), and a report can miss pages or axes.
 * `pages` are the page ids asked for; `full` asks for visual-qa's full scope over every one of them.
 */
export function reportProblems({ contract, stage, report, exit, signal = null, pages, full }) {
  const problems = []
  if (signal || (exit !== 0 && exit !== 1)) problems.push(`visual-qa ended with ${signal ? `signal ${signal}` : `exit ${exit}`}`)
  const dirty = Boolean(report.summary?.findings || report.summary?.unclassified || report.summary?.stale?.length)
  // 🔒 AN EXIT 1 THE REPORT EXPLAINS IS A RESULT, NOT A BROKEN RUN. visual-qa also exits 1 for a
  // blocking interaction record or intrinsic probe (report.mjs exitCodeOf) — a state it could not
  // measure. Measuring again measures the same thing: ja-restaurant re-ran its 31-page, four-tier
  // checkpoint three times (rc-4, rc-5, rc-7; 33–40 min each) on "exited 1 on a report without
  // findings → measure again", each time with 0 findings and the same unmeasured form states. The
  // blocking stays visible (blockingOf, the round's `unblock` step) and a release still refuses any
  // tier that did not exit 0.
  const blocked = blockingOf(report)
  if (exit === 1 && !dirty && (!blocked || blocked.unexplained)) problems.push('visual-qa exited 1 on a report without findings')
  if (exit === 0 && dirty) problems.push('visual-qa exited 0 on a report with findings')
  const kind = report.scope?.kind ?? null
  if (full ? kind !== 'full' : !['full', 'targeted-debug'].includes(kind)) problems.push(`report scope ${kind ?? 'unknown'}${full ? ', not full' : ''}`)
  if (report.summary?.stale?.length) problems.push(`report is stale (${report.summary.stale.join('; ')})`)
  const row = (report.stages ?? []).find((s) => s.id === stage)
  if (!row || !['pass', 'fail'].includes(row.status)) problems.push(`stage ${stage} ${row ? row.status : 'absent from the report'}`)
  const stages = contract.visual?.stages ?? STAGES
  const got = new Map((report.pages ?? []).map((p) => [p.id, new Map((p.axes ?? []).map((a) => [a.variant, a]))]))
  const missing = []
  const notNow = []
  // 🔒 WHAT WAS ASKED FOR MUST BE WHAT THE CONTRACT HAS. A page id the contract does not know has no
  // variants, so it was owed no axis and could never be missing: `--pages /error-page` (a path; the
  // contract keys `en-error-page`) measured 0 pages and this check found nothing to object to — the
  // recheck read "targeted pages converged" and exit 0 (JA Vega M4d, #27 item 10). An unknown page, an
  // empty list and a list that owes this stage no axis at all are each a problem.
  if (!pages?.length) problems.push('no page was asked for: a measurement of nothing is not a result')
  const unknown = (pages ?? []).filter((id) => !contract.pages.some((p) => p.id === id))
  if (unknown.length) problems.push(`unknown page${unknown.length > 1 ? 's' : ''} asked for: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? ', …' : ''}`)
  let owed = 0
  const probesMissing = []
  const key = containersKey(contract)
  for (const id of pages ?? []) {
    const page = contract.pages.find((p) => p.id === id)
    const want = (page?.variants ?? []).filter((v) => stages.find((s) => s.variants.includes(v))?.id === stage)
    owed += want.length
    for (const v of want) {
      const axis = got.get(id)?.get(v)
      if (!axis) missing.push(`${id} ${v}`)
      // 🔒 AN AXIS COUNTS ONLY WHEN THIS RUN MEASURED IT (`measured: 'now'`). A round never passes
      // --reuse, so an axis copied from an earlier report (`'reused'`), one that says it was not
      // measured, or one that says nothing is an old or absent result under a clean summary.
      else if (axis.measured !== 'now') notNow.push(`${id} ${v} (measured: ${JSON.stringify(axis.measured ?? null)})`)
      // 🔒 A REPRESENTATIVE'S CONTAINER PROBES ARE PART OF ITS AXIS. Every probe the contract owes
      // (containerProbes) has its row, measured under THIS declaration (containersKey): an axis
      // without them — an older visual-qa, a cut run, breakpoints changed since — is not a result
      // for the widths between 1440 and 390, whatever its findings say (JA Vega M6-14).
      if (!axis) continue
      const variant = contract.variants?.find((x) => x.id === v)
      const probes = variant ? containerProbes(contract, page, variant) : []
      if (!probes.length) continue
      const c = axis.containers
      if (!c || c.key !== key) {
        probesMissing.push(`${id} ${v} (${c ? 'measured under another container declaration' : 'no container probes'})`)
        continue
      }
      // A row that says `not-measured` is a probe nobody read: it is not a result either (#37 review).
      const rows = new Set((c.rows ?? []).filter((r) => ['ok', 'mismatch'].includes(r.status)).map((r) => `${r.item}@${r.width}`))
      const lacking = probes.filter((pr) => !rows.has(`${pr.item}@${pr.width}`)).map((pr) => `${pr.item}@${pr.width}`)
      if (lacking.length) probesMissing.push(`${id} ${v} (${lacking.slice(0, 5).join(', ')}${lacking.length > 5 ? ', …' : ''})`)
    }
  }
  if (probesMissing.length) problems.push(`${probesMissing.length} axis/axes without every container probe the contract owes, measured: ${probesMissing.slice(0, 5).join('; ')}${probesMissing.length > 5 ? '; …' : ''}`)
  // 🔒 A MEASUREMENT NOT TAKEN IS NOT A RESULT, finding or accepted. The body's text rendering, a
  // container: an axis that could not read one is incomplete, whatever an exception says.
  const blind = []
  for (const p of report?.pages ?? [])
    for (const a of p.axes ?? [])
      for (const f of [...(a.findings ?? []), ...(a.accepted ?? [])]) if (UNMEASURED_KINDS.includes(f.kind)) blind.push(`${p.id} ${a.variant} ${f.kind}${f.property ? ` ${f.property}` : ''}${f.container ? ` ${f.container}@${f.width}` : ''}`)
  if (blind.length) problems.push(`${blind.length} measurement(s) not taken: ${blind.slice(0, 5).join('; ')}${blind.length > 5 ? '; …' : ''}`)
  if (pages?.length && !unknown.length && !owed) problems.push(`the pages asked for have no axis in stage ${stage}: nothing was measured`)
  if (missing.length) problems.push(`${missing.length} page axis/axes not measured (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''})`)
  if (notNow.length) problems.push(`${notNow.length} page axis/axes not measured by this run (${notNow.slice(0, 5).join(', ')}${notNow.length > 5 ? ', …' : ''})`)
  return problems
}

/** Whether two saved states are one deployment as served: contract, theme files and page HTML. */
const canon = (o) => JSON.stringify(Object.entries(o ?? {}).sort((x, y) => (x[0] < y[0] ? -1 : 1)))
const sameState = (a, b) => Boolean(a && b) && a.contractHash === b.contractHash && canon(a.theme) === canon(b.theme) && canon(a.html) === canon(b.html)

/**
 * A checkpoint that counts: full, every tier reported, nothing cut, no axis-error. Only a line that
 * says `complete: true` counts — a ledger line written before that field existed never had its
 * report's scope and coverage checked (a full round narrowed by `--pages` looks the same), so it is
 * neither a stop-rule baseline nor a source of lens notes.
 */
export function isCompleteCheckpoint(line, stages) {
  if (line.failedStep || line.complete !== true || (line.axisErrors ?? 0) > 0 || line.determinism?.errors?.length) return false
  if (line.kind ? line.kind !== 'checkpoint' : line.scope?.kind !== 'full') return false
  const outs = tierOuts(line)
  return stages.every((s) => outs[s] && existsSync(path.join(outs[s], 'visual.json')))
}

/** Hashes of every file of the built theme, relative paths. */
function themeFiles(dir) {
  const out = {}
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else out[path.relative(dir, p).split(path.sep).join('/')] = sha(readFileSync(p))
    }
  }
  if (dir && existsSync(dir)) walk(dir)
  return out
}

export const changedFiles = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((f) => before[f] !== after[f]).sort()

/**
 * Pages to measure after a change: `{ kind: 'full'|'targeted'|'none', reason, pages }`. `prev` is
 * the last round's saved state (theme hashes, CSS copies dir, HTML hashes, contract hash,
 * nondeterministic). `states` are the DOM states a changed selector is matched in (matchStatesFor:
 * every width × theme the tiers measure); `patternsMap` places pattern files on pages.
 */
export async function planScope({ prev, contract, contractHashNow, themeNow, themeDir, html, nondeterministic, site, affectedImpl = pagesMatching, states = null, patternsMap = null }) {
  const all = contract.pages.map((p) => p.id)
  if (!prev) return { kind: 'full', reason: "the tier's first round is full", pages: all }
  if (prev.contractHash !== contractHashNow) return { kind: 'full', reason: 'the contract changed', pages: all }
  const files = changedFiles(prev.theme, themeNow)
  const cls = classifyChanges(files)
  if (cls.full.length) return { kind: 'full', reason: `fail closed: ${cls.full.map((f) => `${f.file} (${f.reason})`).join('; ')}`, pages: all, files }
  const picked = new Set()
  // which change reached each page: served HTML, a template/pattern the contract places, a CSS rule
  const by = { html: new Set(), deps: new Set(), css: new Set() }
  const why = []
  const nd = new Set([...nondeterministic, ...(prev.nondeterministic ?? [])])
  for (const p of contract.pages) {
    if (nd.has(p.id)) continue
    if (!prev.html[p.id] || !html[p.id] || prev.html[p.id] !== html[p.id]) by.html.add(p.id)
  }
  by.html.forEach((id) => picked.add(id))
  if (picked.size) why.push(`${picked.size} page(s) serve different HTML than last round`)
  // Templates and patterns: the pages the contract says they draw, on top of the served-HTML hash
  // (a template can change what a nondeterministic page serves, which the hash does not select).
  // A changed template while a page has no known template, or a pattern no map places → FULL.
  const deps = cls.html.filter((f) => !f.startsWith('parts/'))
  if (deps.length) {
    const dep = dependentPages({ contract, files: deps, patternsMap })
    const unplaced = contract.pages.filter((p) => !(p.template ?? contract.layouts?.find((l) => l.id === p.layout)?.template)).map((p) => p.id)
    if (deps.some((f) => f.startsWith('templates/')) && unplaced.length) return { kind: 'full', reason: `fail closed: a template changed and ${unplaced.length} page(s) have no known template (${unplaced.slice(0, 5).join(', ')})`, pages: all, files }
    if (dep.unknown.length) return { kind: 'full', reason: `fail closed: ${dep.unknown.map((u) => `${u.file} (${u.reason})`).join('; ')}`, pages: all, files }
    for (const id of dep.pages) {
      picked.add(id)
      by.deps.add(id)
    }
    if (dep.why.length) why.push(dep.why.join('; '))
    if (dep.htmlOnly.length) why.push(`by served HTML only: ${dep.htmlOnly.map((u) => `${u.file} (${u.reason})`).join('; ')}`)
  }
  if (cls.css.length) {
    const keys = []
    try {
      for (const f of cls.css) {
        const old = path.join(prev.cssDir, f)
        keys.push(...changedRules(existsSync(old) ? readFileSync(old, 'utf8') : '', existsSync(path.join(themeDir, f)) ? readFileSync(path.join(themeDir, f), 'utf8') : ''))
      }
    } catch (e) {
      return { kind: 'full', reason: `fail closed: CSS did not parse (${e.message})`, pages: all, files }
    }
    const { full, selectors } = selectorsFor(keys)
    if (full) return { kind: 'full', reason: `fail closed: ${full}`, pages: all, files }
    const hit = await affectedImpl({ site, pages: contract.pages, selectors, ...(states ? { states } : {}) })
    if (hit.failClosed) return { kind: 'full', reason: 'fail closed: a changed selector did not parse in the browser', pages: all, files }
    for (const id of hit.affected) {
      picked.add(id)
      by.css.add(id)
    }
    why.push(`${keys.length} changed CSS rule(s) → ${hit.affected.length} page(s) with a matching element${hit.states?.length ? ` in ${hit.states.join(', ')}` : ''}`)
  }
  if (!picked.size) return { kind: 'none', reason: 'nothing the pages serve changed since the last round', pages: [], files }
  // a known change: which channel reached which page, for the rolling recheck's sampling
  const known = { by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, all.filter((id) => v.has(id))])), markup: cls.html.length > 0 }
  if (picked.size === all.length) return { kind: 'full', reason: `every page is affected — ${why.join('; ')}`, pages: all, files, allAffected: true, ...known }
  return { kind: 'targeted', reason: why.join('; '), pages: all.filter((id) => picked.has(id)), files, ...known }
}

/**
 * The pages a rolling recheck measures out of a known change's affected set (planScope `targeted`,
 * or `full` with `allAffected`): JA Vega M4d (27/09) spent 8–11 minutes on each of three rechecks
 * because a shared template or rule reached nearly every page and every one was measured.
 *
 *   - each affected layout's representative (contract `layouts[].representative`);
 *   - every affected page its representative cannot stand in for: the representative must have been
 *     reached by every channel that reached the page (a narrow selector matching the page but not the
 *     representative keeps the page; served HTML stands in only when a theme markup file changed —
 *     otherwise the page's own HTML moved and only that page shows it);
 *   - affected pages in the changed clusters: the request's `clusters` hint, when every hinted id is
 *     an open cluster of a tier's latest clusters.json and reaches an affected page; without a usable
 *     hint, every affected page with findings on any tier, or not yet measured on one (conservative).
 *
 * The rest is `deferred`: not measured, its findings stay as last measured (a recheck never closes
 * what it did not measure), and the next full checkpoint measures it. An affected page whose layout
 * has no valid representative is measured itself; a representative that is not a page of its layout
 * is `full` (fail closed). Order is the contract's, so the result does not depend on input order.
 * `latest`: stage → Map(page id → latest measurement); `clusters`: stage → clusters.json data.
 */
export function sampleRecheck({ scope, contract, latest = {}, clusters = {}, hint = [] }) {
  const all = contract.pages.map((p) => p.id)
  const affected = new Set(scope.pages)
  const layouts = new Map((contract.layouts ?? []).map((l) => [l.id, l]))
  const byPage = new Map(contract.pages.map((p) => [p.id, p]))
  const by = Object.fromEntries(Object.entries(scope.by ?? {}).map(([k, v]) => [k, new Set(v)]))
  const reasons = new Map()
  const add = (id, why) => reasons.set(id, [...(reasons.get(id) ?? []), why])
  // the representative of every affected page's layout, checked before anything is deferred to it
  const repOf = new Map()
  for (const id of scope.pages) {
    const l = layouts.get(byPage.get(id)?.layout)
    if (!l) continue
    if (!l.representative || !byPage.has(l.representative) || !(l.pages ?? []).includes(l.representative) || byPage.get(l.representative).layout !== l.id)
      return { full: `layout ${l.id}: representative ${l.representative ?? '(none)'} is not a page of the layout` }
    repOf.set(id, l.representative)
  }
  const channels = (id) => Object.keys(by).filter((k) => by[k].has(id))
  for (const id of all) {
    if (!affected.has(id)) continue
    const rep = repOf.get(id)
    if (!rep) {
      add(id, 'no layout representative')
      continue
    }
    if (rep === id) {
      add(id, 'layout representative')
      continue
    }
    const missing = channels(id).filter((k) => !by[k].has(rep) || (k === 'html' && !scope.markup))
    if (!affected.has(rep) || missing.length) add(id, `precise: its representative ${rep} is not reached by ${missing.join(', ') || 'the change'}`)
  }
  // the changed clusters: a hint that names what the latest clusters do not hold is not used
  const open = new Map()
  for (const data of Object.values(clusters)) for (const c of data?.clusters ?? []) if (c.status === 'open') open.set(c.id, [...new Set([...(open.get(c.id) ?? []), ...(c.pages ?? [])])])
  const wanted = [...new Set(hint)].sort()
  const bad = wanted.filter((c) => !open.has(c) || !open.get(c).some((id) => affected.has(id)))
  let clusterUse
  if (wanted.length && !bad.length) {
    const members = new Set(wanted.flatMap((c) => open.get(c)))
    for (const id of all) if (affected.has(id) && members.has(id)) add(id, `in changed cluster(s) ${wanted.filter((c) => open.get(c).includes(id)).join(', ')}`)
    clusterUse = { hint: wanted, used: true }
  } else {
    const stages = Object.keys(latest)
    for (const id of all) {
      if (!affected.has(id)) continue
      const unmeasured = !stages.length || stages.some((s) => !latest[s].has(id))
      const withFindings = stages.some((s) => (latest[s].get(id)?.findings?.length ?? 0) > 0)
      if (unmeasured || withFindings) add(id, unmeasured ? 'not measured on every tier yet' : 'open findings (no usable cluster hint)')
    }
    clusterUse = { hint: wanted, used: false, why: wanted.length ? `hint not used: ${bad.join(', ')} not an open cluster reaching an affected page` : 'no cluster hint' }
  }
  const measure = all.filter((id) => reasons.has(id))
  return { measure, deferred: all.filter((id) => affected.has(id) && !reasons.has(id)), affected: all.filter((id) => affected.has(id)), reasons: Object.fromEntries(measure.map((id) => [id, reasons.get(id)])), clusters: clusterUse }
}

/** Kill a child's whole process group (visual-qa and the Chromium it launched), then the child. */
function killGroup(child, signal) {
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      /* already gone */
    }
  }
}

// Asynchronous on purpose, like visual-qa's mega-hover (lib/child.mjs): a synchronous spawn would
// freeze anything else this process serves while a 7-minute step runs (the test's mock site does).
// `children` (a Set) makes the step cancellable: the controller kills what is in it at a deploy
// boundary; a group child (`group: true`) is killed with everything it started.
async function runStep(cfg, id, cmd, args, { cwd, timeoutS, logDir = cfg.roundDir, children = null, group = false }) {
  mkdirSync(logDir, { recursive: true })
  const log = path.join(logDir, `${id}.log`)
  writeFileSync(log, `$ (cd ${cwd} && ${[cmd, ...args].join(' ')})\n`)
  const fd = openSync(log, 'a')
  const env = { ...process.env, ...(cfg.env ?? {}) }
  for (const k of cfg.unsetEnv ?? []) delete env[k]
  const t0 = performance.now()
  let cancelled = false
  const r = await new Promise((resolve) => {
    let child
    try {
      child = spawn(cmd, args, { cwd, env, stdio: ['ignore', fd, fd], detached: group })
    } catch (e) {
      resolve({ status: null, signal: null, error: e })
      return
    }
    const handle = {
      cancel: () => {
        cancelled = true
        // A group child is signalled leader first: its own handler (visual-qa's) ends it, and only
        // then does the rest of the group get SIGTERM. One SIGTERM to the whole group also reached
        // Chromium, and Node could read the browser's exit before its own signal: the page in
        // flight became an axis-error ("browser has been closed") and was published, with a whole
        // report, after the cut (the rolling test's "cut cp1 pagesMeasured not < 3", 27/09).
        if (!group) killGroup(child, 'SIGTERM')
        else if (child.exitCode !== null || child.signalCode !== null) killGroup(child, 'SIGTERM')
        else {
          child.once('exit', () => killGroup(child, 'SIGTERM'))
          try {
            child.kill('SIGTERM')
          } catch {
            /* already gone */
          }
        }
        setTimeout(() => killGroup(child, 'SIGKILL'), 5000).unref()
      }
    }
    children?.add(handle)
    const timer = setTimeout(() => (group ? killGroup(child, 'SIGKILL') : child.kill('SIGKILL')), (timeoutS ?? 900) * 1000)
    child.on('error', (e) => {
      clearTimeout(timer)
      children?.delete(handle)
      resolve({ status: null, signal: null, error: e })
    })
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      children?.delete(handle)
      resolve({ status, signal, error: null })
    })
  })
  const ms = performance.now() - t0
  closeSync(fd)
  appendFileSync(log, `\nexit=${r.status}${r.signal ? ` signal=${r.signal}` : ''}${r.error ? ` error=${r.error.message}` : ''}${cancelled ? ' cancelled' : ''} seconds=${sec(ms)}\n`)
  return { status: r.status, signal: r.signal, seconds: sec(ms), log, cancelled }
}

// ── artifact binding ────────────────────────────────────────────────────────────────────────────
export const BINDING_SCHEMA = 'tracy-visual-artifact-binding/v1'
export const BINDING_FILE = 'artifact-binding.json'
const ISO_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const isoAt = (v) => (typeof v === 'string' && ISO_AT.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null)

/**
 * The bytes of a regular file and the stat of the descriptor read: a final symlink is not followed
 * and a FIFO is never waited on — anything but a regular file throws, named.
 */
function readRegularFile(file) {
  let fd
  try {
    fd = openSync(file, FS.O_RDONLY | FS.O_NOFOLLOW | FS.O_NONBLOCK)
  } catch (e) {
    throw new Error(e.code === 'ELOOP' ? `${file} is a symlink, not a regular file` : `${file} cannot be read (${e.code ?? e.message})`)
  }
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw new Error(`${file} is not a regular file`)
    return { bytes: readFileSync(fd), stat }
  } finally {
    closeSync(fd)
  }
}

/**
 * The pack directory itself, held to be a directory and not a link to one. The files in it are left
 * to readPack, which reads each through a descriptor that follows no link and waits on no FIFO.
 */
function packDirectory(pack) {
  let dir
  try {
    dir = lstatSync(pack)
  } catch (e) {
    throw new Error(`${pack} cannot be read (${e.code ?? e.message})`)
  }
  if (!dir.isDirectory()) throw new Error(`${pack} is ${dir.isSymbolicLink() ? 'a symlink' : 'not a directory'}, not the pack directory`)
}

/**
 * The three artifacts a tier is bound to, measured now: the theme zip (`artifact`) and the pack's
 * webroot and database archives, as `{theme, webroot, database}` each `{file, sha256: "sha256:<hex>",
 * mtimeMs}`. The pack must check out (quickstart/lib.mjs readPack: sums, manifest) and each archive
 * must be the bytes its manifest names. Throws one named error.
 */
export function packArtifacts(cfg) {
  const one = (file, want = null) => {
    const { bytes, stat } = readRegularFile(file)
    const hex = createHash('sha256').update(bytes).digest('hex')
    if (want && hex !== want) throw new Error(`${file} is ${hex}, the pack's manifest says ${want}`)
    const name = path.basename(file)
    if (!isArtifactName(name)) throw new Error(`${file}: ${JSON.stringify(name)} is not a plain artifact file name`)
    return { file: name, sha256: `sha256:${hex}`, mtimeMs: stat.mtimeMs }
  }
  if (!cfg.artifact || !cfg.pack) throw new Error('binding needs both `artifact` (the theme zip) and `pack`')
  let manifest
  try {
    packDirectory(cfg.pack)
    ;({ manifest } = readPack(cfg.pack))
  } catch (e) {
    throw new Error(`the pack ${cfg.pack} does not check out: ${e.message}`)
  }
  return {
    theme: one(cfg.artifact),
    webroot: one(path.join(cfg.pack, manifest.webroot.file), manifest.webroot.sha256),
    database: one(path.join(cfg.pack, manifest.database.file), manifest.database.sha256)
  }
}

/**
 * The binding of one tier's report (`bytes`, parsed as `report`) to the artifacts measured before the
 * tier started (`before`) and again now: the object to write, or a thrown reason there is none. The
 * report must record an ISO measurement time equal to its identity's capture time, and name the
 * theme zip that was measured; nothing may have changed during the measurement, and the report may
 * not predate any artifact.
 */
export function bindingFor({ stage, bytes, report, before, after }) {
  const at = isoAt(report?.at)
  if (at === null) throw new Error(`the report's measurement time ${JSON.stringify(report?.at ?? null)} is not an ISO-8601 timestamp`)
  if (isoAt(report.identity?.capturedAt) !== at) throw new Error(`the report says it was measured at ${report.at} and its identity at ${JSON.stringify(report.identity?.capturedAt ?? null)}`)
  if (report.identity?.artifactHash !== before.theme.sha256) throw new Error(`the report's identity.artifactHash ${JSON.stringify(report.identity?.artifactHash ?? null)} is not the theme zip ${before.theme.sha256}`)
  const artifactHash = {}
  for (const key of ['theme', 'webroot', 'database']) {
    const a = before[key]
    const b = after[key]
    if (a.file !== b.file || a.sha256 !== b.sha256) throw new Error(`the ${key} artifact changed during the measurement (${a.file} ${a.sha256} → ${b.file} ${b.sha256}): measure again`)
    if (at < Math.floor(b.mtimeMs)) throw new Error(`measured at ${report.at}, before the ${key} artifact ${b.file} was written (${new Date(b.mtimeMs).toISOString()})`)
    artifactHash[key] = { file: a.file, sha256: a.sha256 }
  }
  return { schema: BINDING_SCHEMA, stage, report: { file: 'visual.json', sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }, measuredAt: report.at, artifactHash }
}

/**
 * Write `binding` as <out>/artifact-binding.json whole or not at all: a temporary file beside it,
 * linked into place. An existing entry of that name (another run's binding, a symlink) is never
 * replaced — the tier then has no binding of its own.
 */
export function writeBinding(out, binding) {
  const file = path.join(out, BINDING_FILE)
  const exists = (p) => {
    try {
      lstatSync(p)
      return true
    } catch {
      return false
    }
  }
  const taken = `${file} already exists: a tier directory holds one binding, written by the run that measured it`
  if (exists(file)) throw new Error(taken)
  const tmp = path.join(out, `.${BINDING_FILE}.${process.pid}.${Date.now()}.tmp`)
  try {
    writeFileSync(tmp, JSON.stringify(binding, null, 2) + '\n', { flag: 'wx' })
    // a hard link publishes the complete file under its name, and fails (EEXIST) rather than
    // replace an entry created since the check above — rename would replace it
    try {
      linkSync(tmp, file)
    } catch (e) {
      throw new Error(e.code === 'EEXIST' ? taken : e.message)
    }
  } catch (e) {
    throw new Error(`the binding cannot be written: ${e.message}`)
  } finally {
    rmSync(tmp, { force: true })
  }
  return file
}

/**
 * visual-qa once per tier, up to `tierConcurrency` tiers at once, each with `concurrency` page
 * jobs — one process (one Chromium) a tier, so a tier that dies takes no other with it. Returns one
 * result a tier, in stage order; `report` is null when the tier wrote none.
 */
async function measureTiers(cfg, { stages, outOf, pages = null, priority = [], logDir, logName, children = null }) {
  // with `pack`, the artifacts as they are before any tier starts: a pack that does not check out
  // is a failed measurement, named, before visual-qa runs
  let before = null
  if (cfg.pack)
    try {
      before = packArtifacts(cfg)
    } catch (e) {
      return stages.map((stage) => ({ stage, out: outOf(stage), exit: null, signal: null, seconds: 0, log: null, cancelled: false, report: null, bindingError: `artifact binding: ${e.message}` }))
    }
  return mapLimit(stages, cfg.tierConcurrency, async (stage) => {
    const out = outOf(stage)
    // a cut run (`children.closed`, set before its processes are killed) starts no queued tier:
    // the cut is recorded as soon as the tiers already running have ended
    if (children?.closed) return { stage, out, exit: null, signal: null, seconds: 0, log: null, cancelled: true, notStarted: true, report: null }
    const args = [
      path.join(HERE, 'visual-qa.mjs'), '--run-root', cfg.runRoot, '--site', cfg.site, '--out', out, '--stage', stage, '--concurrency', String(cfg.concurrency),
      ...(cfg.sourceSite ? ['--source-site', cfg.sourceSite] : []), ...(cfg.spec ? ['--spec', cfg.spec] : []), ...(cfg.theme ? ['--theme', cfg.theme] : []),
      ...(cfg.artifact ? ['--artifact', cfg.artifact] : []), ...(cfg.seedReport ? ['--seed-report', cfg.seedReport] : []), ...(cfg.patternsMap ? ['--patterns-map', cfg.patternsMap] : []),
      ...(pages ? ['--pages', pages.join(',')] : []), ...(priority.length ? ['--priority', priority.join(',')] : []), ...cfg.visualQaArgs, ...(cfg.visualQaArgsByStage?.[stage] ?? []),
      // the intrinsic and interaction probes measure the deployment, not a tier: the first tier measures them, the others copy its
      // validated records once it reports (visual-qa.mjs probesFrom) — on ja-restaurant rc-7 each tier spent ~15 min on the same probe
      ...(stage !== stages[0] ? ['--probes-from', outOf(stages[0])] : [])
    ]
    let v
    try {
      v = await runStep(cfg, logName(stage), process.execPath, args, { cwd: SKILL, timeoutS: cfg.timeouts.visualQa ?? 3600, logDir, children, group: Boolean(children) })
    } finally {
      // a tier waiting for the first tier's probes stops waiting the moment its process ends, report or none
      if (stage === stages[0] && stages.length > 1) writeFileSync(`${out}.ended`, `${JSON.stringify({ exit: v?.status ?? null, signal: v?.signal ?? null })}\n`)
    }
    const file = path.join(out, 'visual.json')
    const result = { stage, out, exit: v.status, signal: v.signal, seconds: v.seconds, log: v.log, cancelled: v.cancelled, report: null }
    if (v.cancelled || !existsSync(file)) return result
    // the report is parsed from the very bytes a binding hashes
    let bytes
    try {
      bytes = readRegularFile(file).bytes
      result.report = JSON.parse(bytes.toString('utf8'))
    } catch (e) {
      result.bindingError = `visual.json cannot be read: ${e.message}`
      return result
    }
    if (before)
      try {
        result.binding = writeBinding(out, bindingFor({ stage, bytes, report: result.report, before, after: packArtifacts(cfg) }))
      } catch (e) {
        result.bindingError = `artifact binding: ${e.message}`
      }
    return result
  })
}

/** stage → Map(page id → its latest measurement without axis-error), over `lines` in ledger order. */
function latestPages(lines, stages) {
  const maps = Object.fromEntries(stages.map((s) => [s, new Map()]))
  for (const l of lines)
    for (const [s, out] of Object.entries(tierOuts(l))) {
      if (!maps[s]) continue
      for (const p of pagesOfRun(out)) if (!hasAxisError(p)) maps[s].set(p.id, p)
    }
  return maps
}

/** stage → the clusters.json of the tier's latest run that wrote one, over `lines` in ledger order. */
export function latestClusters(lines, stages) {
  const out = {}
  for (const l of lines)
    for (const [s, dir] of Object.entries(tierOuts(l))) {
      const f = path.join(dir, 'clusters.json')
      if (!stages.includes(s) || !existsSync(f)) continue
      out[s] = readEvidence(f, CLUSTERS, { what: 'clusters.json' })
    }
  return out
}

/** The lens gate for every tier of the config: each tier's notes live in that tier's directory. */
function missingNotes(cfg, tier) {
  const missing = []
  for (const s of cfg.stages) {
    const lines = tier.flatMap((l) => {
      if (!l.tiers) return l.stage === s ? [l] : []
      const t = l.tiers[s]
      return t ? [{ run: l.run, out: t.out, failedStep: l.failedStep, lensesDue: l.lensesDue, lenses: t.lenses }] : []
    })
    missing.push(...missingLensNotes(lines, { stageConsumers: stageConsumersOf(cfg, s), noteSize: (f) => (existsSync(f) ? statSync(f).size : 0) }))
  }
  return missing
}

/**
 * The judgement of one measurement (every tier of the config): per-tier diff against the latest
 * measurement of each page before it, churn, the stop rule (full + complete only, against the
 * previous complete checkpoint on the same deterministic set), owners, lenses and `next`.
 */
function judge({ cfg, contract, det, results, prior, scopeKind, pages: asked, stateNow, round, tierFirstRun, roundDir, ledger = prior }) {
  const nd = det.nondeterministic
  const deterministicIds = new Set(contract.pages.map((p) => p.id).filter((id) => !nd.includes(id)))
  const before = latestPages(prior, cfg.stages)
  const tiers = {}
  const failedTiers = []
  const sum = { total: 0, distinct: 0, unclassified: 0, onStable: 0, closed: 0, new: 0, same: 0, ndClosed: 0, ndNew: 0, pClosed: 0, pNew: 0, notMeasuredBefore: 0, axisErrors: 0, retried: 0, recovered: 0 }
  const retriedAxes = []
  const clusterSum = { findings: 0, clusters: 0, unchanged: 0, compared: 0 }
  // Clusters with history (cluster.mjs): every earlier measurement in the ledger, all stages, oldest
  // first — a page a targeted run did not measure keeps its older measurements, and a page's
  // axis-error measurement is skipped inside cluster.mjs, never read as clean.
  const outsNow = new Set(results.map((r) => r.out))
  const history = ledger
    .filter((l) => !l.failedStep)
    .flatMap((l) => Object.values(tierOuts(l)).map((o) => ({ run: l.run, out: o })))
    .filter((h) => !outsNow.has(h.out) && existsSync(path.join(h.out, 'visual.json')))
    .map((h) => ({ run: h.run, pages: pagesOfRun(h.out) }))
  const allPages = []
  const measured = new Set()
  const regressions = []
  const invalid = []
  const blockedTiers = []
  for (const r of results) {
    if (!r.report) {
      failedTiers.push(r.stage)
      tiers[r.stage] = { out: r.out, exit: r.exit, seconds: r.seconds, log: r.log, error: r.cancelled ? 'cancelled' : (r.bindingError ?? 'visual-qa wrote no report') }
      continue
    }
    const rep = r.report
    const problems = reportProblems({ contract, stage: r.stage, report: rep, exit: r.exit, signal: r.signal, pages: asked, full: scopeKind === 'full' })
    // a tier configured to be bound and left without its binding is not a measurement a release can use
    if (r.bindingError) problems.push(r.bindingError)
    if (problems.length) invalid.push(`${r.stage}: ${problems.join('; ')}`)
    const diff = compareRuns(before[r.stage], rep.pages, { nondeterministic: nd })
    const axisErrors = rep.pages.reduce((n, p) => n + (p.findings ?? []).filter((f) => f.kind === 'axis-error').length, 0)
    const onStable = stableCount(rep.pages, deterministicIds)
    const tierRegressions = diff.pages.filter((p) => p.new && !p.nondeterministic).map((p) => ({ page: p.page, new: p.new, closed: p.closed }))
    const grouped = writeClusterViews(r.out, rep, { history }).clusters.totals
    const clusters = { findings: grouped.findings, clusters: grouped.clusters, unchanged: grouped.unchanged, compared: grouped.compared }
    for (const k of Object.keys(clusterSum)) clusterSum[k] += clusters[k] ?? 0
    tiers[r.stage] = {
      out: r.out,
      exit: r.exit,
      seconds: r.seconds,
      measuredPages: rep.pages.length,
      findings: { total: rep.summary.findings, distinct: rep.summary.distinct, unclassified: rep.summary.unclassified, onDeterministicPages: onStable, closed: diff.deterministic.closed, new: diff.deterministic.new, same: diff.deterministic.same, nondeterministicPages: { closed: diff.nondeterministic.closed, new: diff.nondeterministic.new }, pointer: diff.pointer, notMeasuredBefore: diff.notMeasuredBefore.length },
      axisErrors,
      churn: churn(diff, cfg.churnLimit),
      clusters,
      regressions: tierRegressions,
      ...(blockingOf(rep) ? { blocking: blockingOf(rep) } : {}),
      ...(r.binding ? { binding: r.binding } : {}),
      ...(problems.length ? { problems } : {})
    }
    for (const x of tierRegressions) regressions.push({ stage: r.stage, ...x })
    const b = blockingOf(rep)
    if (b) blockedTiers.push(`${r.stage}: ${[b.interaction ? `${b.interaction} interaction state(s) not measured` : null, b.intrinsic ? `${b.intrinsic} intrinsic mobile defect(s)` : null].filter(Boolean).join(', ') || 'a blocking probe'}`)
    Object.assign(sum, {
      total: sum.total + rep.summary.findings,
      distinct: sum.distinct + (rep.summary.distinct ?? 0),
      unclassified: sum.unclassified + rep.summary.unclassified,
      onStable: sum.onStable + onStable,
      closed: sum.closed + diff.deterministic.closed,
      new: sum.new + diff.deterministic.new,
      same: sum.same + diff.deterministic.same,
      ndClosed: sum.ndClosed + diff.nondeterministic.closed,
      ndNew: sum.ndNew + diff.nondeterministic.new,
      pClosed: sum.pClosed + diff.pointer.closed,
      pNew: sum.pNew + diff.pointer.new,
      notMeasuredBefore: sum.notMeasuredBefore + diff.notMeasuredBefore.length,
      axisErrors: sum.axisErrors + axisErrors,
      retried: sum.retried + (rep.summary.retried ?? 0),
      recovered: sum.recovered + (rep.summary.retryRecovered ?? 0)
    })
    retriedAxes.push(...(rep.summary.retriedAxes ?? []))
    for (const p of rep.pages) measured.add(p.id)
    allPages.push(...rep.pages)
    if (cfg.multi) writeFileSync(path.join(roundDir, `diff-${r.stage}.json`), JSON.stringify(diff, null, 2) + '\n')
    else writeFileSync(path.join(roundDir, 'diff.json'), JSON.stringify(diff, null, 2) + '\n')
  }
  const cancelled = results.some((r) => r.cancelled)
  // Anything that leaves a page × tier unknown makes the measurement incomplete: a missing or cut
  // tier, a report that is not what was asked for, an axis-error on a checkpoint, and a determinism
  // preflight that could not read a page (its HTML identity — and so the scope — is unknown).
  const detErrors = det.errors ?? []
  const incomplete =
    [
      failedTiers.length ? `${cancelled ? 'cancelled' : 'no report from'} ${failedTiers.join(', ')}` : null,
      ...invalid,
      sum.axisErrors && scopeKind === 'full' ? `${sum.axisErrors} axis-error(s)` : null,
      detErrors.length ? `determinism preflight failed on ${detErrors.length} page(s) (${detErrors.slice(0, 3).map((e) => e.page).join(', ')})` : null
    ]
      .filter(Boolean)
      .join('; ') || null
  const guard = churn({ deterministic: { closed: sum.closed, new: sum.new } }, cfg.churnLimit)
  let stop = null
  if (scopeKind === 'full' && !incomplete) {
    const last = [...prior].reverse().find((l) => isCompleteCheckpoint(l, cfg.stages))
    let prevCount = null
    const pair = { closed: 0, new: 0 }
    if (last) {
      prevCount = 0
      const outs = tierOuts(last)
      for (const r of results) {
        const prevPages = pagesOfRun(outs[r.stage])
        prevCount += stableCount(prevPages, deterministicIds)
        const d = compareRuns(new Map(prevPages.map((p) => [p.id, p])), r.report.pages, { nondeterministic: nd })
        pair.closed += d.deterministic.closed
        pair.new += d.deterministic.new
      }
    }
    stop = stopRule(prevCount, sum.onStable, last ? pair : {})
    if (last) stop.against = last.run
  }
  const owners = ownersOf(allPages, contract, { nondeterministic: nd })
  writeFileSync(path.join(roundDir, 'owners.json'), JSON.stringify(owners, null, 2) + '\n')
  let decision = nextStep({ scope: scopeKind, round, maxRounds: cfg.maxRounds, churnVerdict: guard.verdict, stop, findings: sum.total, unclassified: sum.unclassified, nondeterministic: nd.length, axisErrors: sum.axisErrors, incomplete })
  // the churn guard decided this checkpoint (#19 item 8): its stop verdict is recorded as deferred,
  // never as a second, conflicting next step
  if (decision.next === 'fix-again' && stop?.stop) stop = { ...stop, stop: false, deferred: 'churn', reason: `${stop.reason} — deferred: churn ${guard.ratio} above the guard ${guard.limit}, fix the regressions first` }
  const due = lensesDue({ tierFirstRun, next: decision.next })
  // A clean checkpoint closes the tier only with every lens note written: the ones earlier runs of
  // the tier asked for (the layout lens of its first run) in their directories, and every lens the
  // contract names for each stage — in this run's tier directory, or in an earlier complete
  // checkpoint of the tier that measured the same deployment (contract, theme files, served HTML).
  // Until then the verdict is `lenses`: write them, then run a checkpoint again.
  let lensGap = null
  if (decision.next === 'close-tier') {
    const outs = Object.fromEntries(results.map((r) => [r.stage, r.out]))
    const same = prior.filter((l) => isCompleteCheckpoint(l, cfg.stages) && l.state && existsSync(l.state) && sameState(readJson(l.state), stateNow))
    // stage → the tier directories of this deployment (this run first): a note in any of them is
    // the note of every one — a clean checkpoint repeated after writing notes asks for no new copy
    const dirsOf = Object.fromEntries(cfg.stages.map((s) => [s, [outs[s], ...same.map((l) => tierOuts(l)[s])].filter(Boolean)]))
    const has = (d, lens) => existsSync(path.join(d, 'notes', `${lens}.md`)) && statSync(path.join(d, 'notes', `${lens}.md`)).size > 0
    const inGroup = (s, note) => dirsOf[s].some((d) => note === `${d}/notes/${path.basename(note)}`)
    const asked = missingNotes(cfg, prior).filter((m) => !(m.lens && cfg.stages.some((s) => inGroup(s, m.note) && dirsOf[s].some((d) => has(d, m.lens)))))
    const missing = asked.map((m) => m.why ?? `${m.note} (asked for by ${m.run})`)
    for (const s of cfg.stages) {
      const lenses = stageConsumersOf(cfg, s)
      if (!lenses?.length) {
        missing.push(`${s}: the contract's visual.shots consumers for this stage cannot be determined (contract unreadable or no shot names the stage)`)
        continue
      }
      // a lens an earlier checkpoint of this deployment already asks for is listed once, there
      const listed = (lens) => asked.some((m) => m.lens === lens && inGroup(s, m.note))
      for (const lens of lenses) if (!dirsOf[s].some((d) => has(d, lens)) && !listed(lens)) missing.push(path.join(outs[s], 'notes', `${lens}.md`))
    }
    if (missing.length) {
      lensGap = missing
      decision = { next: 'lenses', why: `clean checkpoint, and the tier closes once every lens note is written: ${missing.join('; ')} — write them (nothing to deploy), then run a checkpoint again` }
    }
  }
  // 🔒 A CLEAN CHECKPOINT WITH A BLOCKING PROBE DOES NOT CLOSE THE TIER, AND IS NOT MEASURED AGAIN.
  // The visual measurement is whole; what blocks (blockingOf) is a state the probe could not measure
  // or an intrinsic defect, and a rerun of every page × tier repeats it. The next step is the cause:
  // the page, or the probe (an S-number and a tool repair), then a recheck of the pages it is on.
  if (blockedTiers.length && !incomplete && (decision.next === 'close-tier' || decision.next === 'lenses'))
    decision = {
      next: 'unblock',
      why: `visual measurement whole${decision.next === 'lenses' ? ` (lens notes still due: ${lensGap.join('; ')})` : ' and clean'}, and the run is blocked by what it could not measure or an intrinsic defect — ${blockedTiers.join('; ')} (interaction.json, notes/machine.md). Measuring the site again repeats it: fix the page, or record the tool defect as an S-number and repair the probe, then measure only the pages it names (round.mjs --pages). A release needs a checkpoint whose every tier exits 0.`
    }
  const findings = {
    total: sum.total,
    distinct: sum.distinct,
    unclassified: sum.unclassified,
    onDeterministicPages: sum.onStable,
    closed: sum.closed,
    new: sum.new,
    same: sum.same,
    nondeterministicPages: { closed: sum.ndClosed, new: sum.ndNew },
    pointer: { closed: sum.pClosed, new: sum.pNew },
    notMeasuredBefore: sum.notMeasuredBefore
  }
  const common = {
    complete: !incomplete,
    ...(incomplete ? { incomplete } : {}),
    ...(blockedTiers.length ? { blocked: blockedTiers } : {}),
    measuredPages: measured.size,
    findings,
    clusters: clusterSum,
    retries: { retried: sum.retried, recovered: sum.recovered, axes: retriedAxes },
    axisErrors: sum.axisErrors,
    churn: guard,
    stop,
    owners: Object.fromEntries(Object.entries(owners).map(([g, x]) => [g, { findings: x.findings, pages: x.pages.length }])),
    lensesDue: due,
    ...(lensGap ? { lensGap } : {}),
    ...decision
  }
  if (!cfg.multi) {
    const r = results[0]
    return { exit: r.exit, ...common, lenses: lensesOf({ lensesDue: due }, stageConsumersOf(cfg, cfg.stages[0])), ...(r.report ? {} : { failedTiers }) }
  }
  for (const s of cfg.stages) if (tiers[s]) tiers[s].lenses = lensesOf({ lensesDue: due }, stageConsumersOf(cfg, s))
  return { stages: cfg.stages, tiers, ...(failedTiers.length ? { failedTiers } : {}), regressions, ...common }
}

const readLedger = (ledger) => (existsSync(ledger) ? readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])

/** Determinism preflight + the deployed theme, kept for the next scope decision. */
async function snapshot(cfg, dir) {
  const contract = readJson(resolveContract({ runRoot: cfg.runRoot, name: CANONICAL.visual }).path)
  if (groupIdOf(contract)) throw new Error(`${cfg.runRoot}: the canonical contract is page group ${groupIdOf(contract)}'s — a checkpoint runs on the site's own contract (the main dossier), group evidence never stands for it`)
  const cHash = contractHash(contract)
  const t0 = performance.now()
  const det = await checkDeterminism({ pages: contract.pages, site: cfg.site, fetches: cfg.fetches })
  const seconds = sec(performance.now() - t0)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'determinism.json'), JSON.stringify(det, null, 2) + '\n')
  const html = Object.fromEntries(Object.entries(det.pages).map(([id, v]) => [id, v.hash]))
  const theme = themeFiles(cfg.theme)
  const cssDir = path.join(dir, 'theme-css')
  for (const f of Object.keys(theme).filter((f) => /^assets\/css\/.*\.css$/.test(f))) {
    mkdirSync(path.dirname(path.join(cssDir, f)), { recursive: true })
    copyFileSync(path.join(cfg.theme, f), path.join(cssDir, f))
  }
  const state = { contractHash: cHash, theme, cssDir, html, nondeterministic: det.nondeterministic }
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2) + '\n')
  return { contract, cHash, det, state, seconds, stateFile: path.join(dir, 'state.json') }
}

const patternsMapOf = (cfg) => (cfg.patternsMap && existsSync(cfg.patternsMap) ? readJson(cfg.patternsMap) : null)

function overridesFrom(opt) {
  return {
    stages: opt('--stages') ? opt('--stages').split(',').filter(Boolean) : null,
    tierConcurrency: opt('--tier-concurrency'),
    concurrency: opt('--concurrency'),
    checkpointEvery: opt('--checkpoint-every'),
    checkpointReason: opt('--checkpoint-reason')
  }
}

export async function runRound(argv) {
  const opt = (n, d = null) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d)
  const flag = (n) => argv.includes(n)
  const name = opt('--name')
  if (!opt('--config') || !name) throw new Error('usage: round.mjs --config <round.json> --name <run> [--watch] [--scope auto|full] [--pages a,b] [--skip-deploy] [--new-tier] [--note "…"] [--stages a,b] [--tier-concurrency N] [--concurrency N]')
  if (flag('--watch')) return runWatch(argv)
  const cfg = loadConfig(opt('--config'), { name, overrides: overridesFrom(opt) })
  // One writer per ledger: a one-round run takes the same lock a rolling controller holds, for its
  // whole run — a controller, or another round, running beside it is refused, never interleaved.
  const lock = acquireLock(cfg.evidence, name, { role: 'round' })
  try {
    // A dead writer's lock taken over is part of the round's record: the ledger line says so.
    const recoveredLock = lock.recovered ? { pid: lock.recovered.pid ?? null, name: lock.recovered.name ?? null } : null
    return await roundOnce(cfg, { name, opt, flag, recoveredLock })
  } finally {
    releaseLock(cfg.evidence)
  }
}

async function roundOnce(cfg, { name, opt, flag, recoveredLock = null }) {
  const ledger = path.join(cfg.evidence, 'rounds.jsonl')
  const out = path.join(cfg.evidence, name)
  if (existsSync(out) || existsSync(cfg.roundDir)) throw new Error(`run ${name} already exists in ${cfg.evidence}; a round never overwrites another`)
  const lines = readLedger(ledger)
  const newTier = flag('--new-tier') || !lines.some((l) => l.stage === cfg.stage)
  const tier = newTier ? [] : tierLines(lines, cfg.stage)
  const ok = tier.filter((l) => !l.failedStep)
  const deploy = !flag('--skip-deploy')
  // Round 0 is the tier's first deploy (its baseline); each later deploy is a fix round. A re-measure
  // without a deploy belongs to the round it measures, and a deploy that changed nothing the pages
  // serve (scope `none`) spent no round (smoke 25/09: a no-change redeploy took round 1). The
  // rolling controller's lines are counted by checkpoints, not here.
  const deployedBefore = ok.filter((l) => l.deployed && l.scope?.kind !== 'none' && !l.watch).length
  const round = deploy ? deployedBefore : Math.max(0, deployedBefore - 1)
  const durations = {}
  const line = { run: name, stage: cfg.stage, ...(cfg.multi ? { stages: cfg.stages } : {}), ...(newTier ? { tierStart: true } : {}), round, deployed: deploy, start: new Date().toISOString(), note: opt('--note'), ...(recoveredLock ? { recoveredLock } : {}), out, durations_s: durations }
  const finish = (extra = {}) => {
    Object.assign(line, extra, { end: new Date().toISOString() })
    durations.total = sec(Date.parse(line.end) - Date.parse(line.start))
    appendFileSync(ledger, JSON.stringify(line) + '\n')
    return line
  }
  if (deploy && line.round > cfg.maxRounds)
    return finish({ failedStep: 'bound', why: `round ${line.round} exceeds ${cfg.maxRounds} deploying rounds for tier ${cfg.stage}: replan (decision list, evidence) — --new-tier starts a new count on purpose` })
  // The lens gate, before any build or deploy: a lens this tier asked for has a note first.
  if (deploy && tier.length) {
    const missing = missingNotes(cfg, tier)
    if (missing.length)
      return finish({ failedStep: 'lenses', missing, why: `lens note(s) missing before a fix is deployed: ${missing.map((m) => m.why ?? `${m.note} (asked for by ${m.run})`).join('; ')} — run the lens, write its note, then deploy` })
  }

  // 1. build → deploy → seed → contract init
  if (deploy)
    for (const id of STEPS) {
      const s = cfg.steps?.[id]
      if (!s) continue
      const r = await runStep(cfg, id, s.cmd[0], s.cmd.slice(1), { cwd: s.cwd, timeoutS: cfg.timeouts[id] })
      durations[id] = r.seconds
      if (r.status !== 0) return finish({ failedStep: id, exit: r.status, log: r.log })
    }
  // 1b. the sweep: every build + deploy is followed by site-sweep.mjs, all eleven checks (its result is read, it never fails the round)
  if (deploy) {
    line.sweep = await runSweepStep(cfg, cfg.roundDir)
    durations.sweep = line.sweep.seconds ?? 0
  }

  // 2. determinism preflight (also the HTML identity of every page) and 3. the theme as deployed
  const snap = await snapshot(cfg, cfg.roundDir)
  durations.determinism = snap.seconds
  const { contract, det } = snap

  // 4. scope
  let t0 = performance.now()
  const last = [...ok].reverse().find((l) => l.state && existsSync(l.state))
  const prev = last ? readJson(last.state) : null
  const given = flag('--pages') ? opt('--pages') ?? '' : null
  const scopeArg = opt('--scope', 'auto')
  // Pages named by id or path, resolved against THIS contract before anything is measured: one it
  // does not have stops the round here, named, rather than measuring nothing (#27 item 10).
  let named = null
  if (given !== null) {
    try {
      named = resolvePageSelection(contract, given.split(','))
    } catch (e) {
      return finish({ failedStep: 'scope', why: e.message })
    }
  }
  const scope = named
    ? { kind: 'targeted', reason: 'pages given with --pages', pages: named }
    : scopeArg === 'full'
      ? { kind: 'full', reason: '--scope full', pages: contract.pages.map((p) => p.id) }
      : await planScope({ prev, contract, contractHashNow: snap.cHash, themeNow: snap.state.theme, themeDir: cfg.theme, html: snap.state.html, nondeterministic: det.nondeterministic, site: cfg.site, states: matchStatesFor(contract, cfg.stages), patternsMap: patternsMapOf(cfg) })
  durations.scope = sec(performance.now() - t0)
  line.kind = scope.kind === 'full' ? 'checkpoint' : 'recheck'
  line.state = snap.stateFile
  line.scope = { kind: scope.kind, reason: scope.reason, pages: scope.kind === 'targeted' ? scope.pages : scope.pages.length, ...(scope.files ? { changedFiles: scope.files } : {}) }
  line.determinism = { fetchesPerPage: det.fetchesPerPage, nondeterministic: det.nondeterministic, errors: det.errors }
  if (scope.kind === 'none') return finish({ next: 'fix', why: scope.reason })

  // 5. visual-qa, every tier (concurrent, bounded)
  const results = await measureTiers(cfg, {
    stages: cfg.stages,
    outOf: (s) => (cfg.multi ? path.join(out, s) : out),
    pages: scope.kind === 'targeted' ? scope.pages : null,
    logDir: cfg.roundDir,
    logName: (s) => (cfg.multi ? `visualQa-${s}` : 'visualQa')
  })
  durations.visualQa = Math.max(...results.map((r) => r.seconds))
  if (cfg.multi) durations.visualQaByTier = Object.fromEntries(results.map((r) => [r.stage, r.seconds]))
  if (!cfg.multi && !results[0].report) return finish({ failedStep: 'visualQa', exit: results[0].exit, log: results[0].log, ...(results[0].bindingError ? { why: results[0].bindingError } : {}) })

  // 6. diff against the tier's latest measurement of each page, and the decisions
  t0 = performance.now()
  const verdict = judge({ cfg, contract, det, results, prior: ok, scopeKind: scope.kind, pages: scope.pages, stateNow: snap.state, round: line.round, tierFirstRun: !ok.length, roundDir: cfg.roundDir, ledger: lines })
  durations.diff = sec(performance.now() - t0)
  return finish(verdict)
}

// ── ROLLING: the controller ─────────────────────────────────────────────────────────────────────
//
// One process owns the ledger (rolling.lock). It is the only one that deploys and the only one
// that writes a ledger line; the agent sends requests (recheck.mjs). Every deploy starts a new
// GENERATION. A run belongs to the generation it started in, and a deploy happens only at a
// boundary: a running checkpoint is cancelled first (its processes killed, its line written as
// `complete: false, interrupted`), a running recheck is finished first (requests wait). So no run
// ever measures two generations, and only a checkpoint that ran whole at one generation counts
// for the stop rule, the bound and closing the tier.
//
// Order of work: requests first (fixes are coalesced — several queued fixes are ONE deploy and
// one recheck, each answered with it), then a checkpoint when one is owed: the session's first,
// one on request (and, only when asked for with a reason, one after every `checkpointEvery` fixes). A checkpoint measures the pages the
// session has never measured first, then the rest by oldest measurement.
async function runWatch(argv) {
  const opt = (n, d = null) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d)
  const flag = (n) => argv.includes(n)
  const name = opt('--name')
  if (!opt('--config') || !name) throw new Error('usage: round.mjs --config <round.json> --name <session> --watch [--skip-deploy] [--new-tier] [--stages a,b] [--tier-concurrency N] [--concurrency N] [--checkpoint-every K]')
  const cfg = loadConfig(opt('--config'), { name, overrides: overridesFrom(opt) })
  const session = path.join(cfg.evidence, name)
  if (existsSync(session)) throw new Error(`session ${name} already exists in ${cfg.evidence}; a session never overwrites another`)
  const lock = acquireLock(cfg.evidence, name)
  const pollMs = Number(opt('--poll-ms', 200))
  const w = { cfg, name, session, ledger: path.join(cfg.evidence, 'rounds.jsonl'), gen: 0, fixes: 0, fixesSinceComplete: 0, cpSeq: 0, rcSeq: 0, active: null, waiting: [], halted: null, autoFailed: false, runs: [], stale: false, completeInSession: 0, recovered: lock.recovered, stopping: false, newTier: flag('--new-tier'), rcChildren: new Set(), controlKey: null }
  mkdirSync(requestsDir(cfg.evidence, name), { recursive: true })
  const onSignal = (sig) => {
    w.stopping = true
    w.signal = sig
    if (w.active) w.active.children.closed = true
    w.rcChildren.closed = true
    w.active?.children.forEach((c) => c.cancel())
    w.rcChildren.forEach((c) => c.cancel())
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  try {
    return await watchLoop(w, { skipDeploy: flag('--skip-deploy'), pollMs, note: opt('--note') })
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    w.active?.children.forEach((c) => c.cancel())
    w.rcChildren.forEach((c) => c.cancel())
    releaseLock(cfg.evidence)
    // A handler for SIGTERM/SIGINT replaces Node's default of ending the process: once the session
    // is wound down, end it as the signal asked. Without this, a controller running inside another
    // process (a test file the runner timed out) outlived its kill and went on with the next work.
    if (w.signal) process.exit(w.signal === 'SIGINT' ? 130 : 143)
  }
}

function writeControl(w, phase, extra = {}) {
  const key = JSON.stringify([phase, w.gen, w.active?.id ?? null, w.fixes, w.halted, w.runs.length, extra])
  if (key === w.controlKey) return
  w.controlKey = key
  const f = controlFile(w.cfg.evidence, w.name)
  const body = { pid: process.pid, session: w.name, stages: w.cfg.stages, gen: w.gen, phase, active: w.active ? { id: w.active.id, kind: 'checkpoint', gen: w.active.gen } : null, fixes: w.fixes, fixesSinceCheckpoint: w.fixesSinceComplete, checkpointEvery: w.cfg.checkpointEvery, halted: w.halted, runs: w.runs, at: new Date().toISOString(), ...extra }
  writeFileSync(`${f}.tmp`, JSON.stringify(body, null, 2) + '\n')
  // rename: a reader never sees half a file
  renameSync(`${f}.tmp`, f)
}

async function watchLoop(w, { skipDeploy, pollMs, note }) {
  const { cfg } = w
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const lines = () => readLedger(w.ledger)
  const tierNow = () => {
    const all = lines()
    // the session's own first line opens the tier when --new-tier or the tier is new
    const firstOwn = all.findIndex((l) => l.watch === w.name)
    if (firstOwn === -1) return w.newTier || !all.some((l) => l.stage === cfg.stage) ? [] : tierLines(all, cfg.stage)
    return tierLines(all, cfg.stage)
  }
  const append = (line) => {
    const tierStart = !lines().some((l) => l.watch === w.name) && (w.newTier || !lines().some((l) => l.stage === cfg.stage))
    const full = { stage: cfg.stage, stages: cfg.stages, watch: w.name, gen: w.gen, ...(tierStart ? { tierStart: true } : {}), ...line }
    appendFileSync(w.ledger, JSON.stringify(full) + '\n')
    return full
  }

  // generation 1: the stand as the session starts
  writeControl(w, 'deploying')
  const deployNow = async (label) => {
    const dir = path.join(w.session, `g${w.gen + 1}`)
    const durations = {}
    for (const id of STEPS) {
      const s = cfg.steps?.[id]
      if (!s) continue
      const r = await runStep(cfg, id, s.cmd[0], s.cmd.slice(1), { cwd: s.cwd, timeoutS: cfg.timeouts[id], logDir: dir })
      durations[id] = r.seconds
      if (r.status !== 0) {
        // the stand may be half deployed: whatever runs next measures it whole
        w.gen++
        w.stale = true
        return { failed: { failedStep: id, exit: r.status, log: r.log }, durations }
      }
    }
    w.gen++
    // after every build + deploy: the sweep, all eleven checks; its result rides on the next ledger line (w.pendingSweep)
    const sweep = await runSweepStep(cfg, dir, w.rcChildren)
    durations.sweep = sweep.seconds ?? 0
    w.pendingSweep = sweep
    const snap = await snapshot(cfg, dir)
    durations.determinism = snap.seconds
    return { snap, durations, label, sweep }
  }
  let current
  if (skipDeploy) {
    w.gen = 1
    current = { snap: await snapshot(cfg, path.join(w.session, 'g1')), durations: {} }
  } else {
    current = await deployNow('start')
    if (current.failed) {
      const l = append({ run: `${w.name}/g${w.gen}`, kind: 'deploy', deployed: true, ...current.failed, durations_s: current.durations })
      writeControl(w, 'stopped', { error: l.failedStep })
      return { session: w.name, failed: l }
    }
  }
  let state = current.snap.state

  const tierFirstRun = () => !tierNow().filter((l) => !l.failedStep && l.out).length
  const lensGate = () => {
    const tier = tierNow()
    // the tier's first checkpoint, still running, asks for the layout lens already
    if (w.active && !tier.filter((l) => !l.failedStep && l.out).length)
      tier.push({ run: `${w.name}/${w.active.id}`, out: w.active.dir, tiers: Object.fromEntries(cfg.stages.map((s) => [s, { out: path.join(w.active.dir, s) }])), lensesDue: lensesDue({ tierFirstRun: true, next: 'fix' }) })
    return missingNotes(cfg, tier)
  }
  const priorityNow = (contract) => {
    // pages never measured in the session first, then by the generation of their last measurement
    const lastGen = new Map()
    for (const r of w.runs)
      for (const out of Object.values(r.tiers))
        for (const p of pagesOfRun(out)) lastGen.set(p.id, Math.max(lastGen.get(p.id) ?? -1, r.gen))
    const ids = contract.pages.map((p) => p.id)
    return ids.map((id, i) => ({ id, i, g: lastGen.has(id) ? lastGen.get(id) : -1 })).sort((a, b) => a.g - b.g || a.i - b.i).map((x) => x.id)
  }
  const startCheckpoint = (why, reason = null, { failClosed = false } = {}) => {
    const id = `cp${++w.cpSeq}`
    const dir = path.join(w.session, id)
    const children = new Set()
    const a = { id, dir, gen: w.gen, why, ...(reason ? { reason } : {}), ...(failClosed ? { failClosed: true } : {}), children, start: new Date().toISOString(), settled: false, results: null, cancelled: false }
    const priority = priorityNow(current.snap.contract)
    w.runs.push({ id, kind: 'checkpoint', gen: w.gen, tiers: Object.fromEntries(cfg.stages.map((s) => [s, path.join(dir, s)])) })
    a.promise = measureTiers(cfg, { stages: cfg.stages, outOf: (s) => path.join(dir, s), priority, logDir: dir, logName: (s) => `visualQa-${s}`, children }).then((r) => {
      a.results = r
      a.settled = true
    })
    w.active = a
    writeControl(w, 'checkpoint')
  }
  // the sweep of the last deploy goes on ONE ledger line: the first that follows it
  let lastTaken = null
  const takeSweep = () => {
    lastTaken = w.pendingSweep ?? null
    w.pendingSweep = null
    return lastTaken
  }
  // the free two are counted without the whole measures a fix forced (fail closed: every page it reaches), which are recorded as such (`failClosed`)
  const gateCount = () => tierNow().filter((l) => isCompleteCheckpoint(l, cfg.stages) && !l.failClosed).length
  const checkpointRound = () => tierNow().filter((l) => isCompleteCheckpoint(l, cfg.stages)).length
  const finishCheckpoint = (a) => {
    w.active = null
    const tier = tierNow().filter((l) => !l.failedStep)
    const base = { run: `${w.name}/${a.id}`, kind: 'checkpoint', deployed: false, out: a.dir, start: a.start, why: a.why, ...(a.reason ? { reason: a.reason } : {}), ...(a.failClosed ? { failClosed: true } : {}), ...(takeSweep() ? { sweep: lastTaken } : {}), scope: { kind: 'full', reason: a.why, pages: current.snap.contract.pages.length }, state: current.snap.stateFile, determinism: { fetchesPerPage: current.snap.det.fetchesPerPage, nondeterministic: current.snap.det.nondeterministic, errors: current.snap.det.errors } }
    if (a.cancelled) {
      // evidence of the pages it finished, and nothing else: it never counts
      const due = lensesDue({ tierFirstRun: tierFirstRun(), next: 'fix' })
      const notStarted = new Set((a.results ?? []).filter((r) => r.notStarted).map((r) => r.stage))
      const tiers = Object.fromEntries(cfg.stages.map((s) => [s, { out: path.join(a.dir, s), ...(notStarted.has(s) ? { started: false } : {}), pagesMeasured: pagesOfRun(path.join(a.dir, s)).length, lenses: lensesOf({ lensesDue: due }, stageConsumersOf(cfg, s)) }]))
      return append({ ...base, round: checkpointRound(), complete: false, interrupted: true, incomplete: `cancelled at generation ${a.gen} by ${a.cancelledBy ?? 'a deploy'}`, tiers, lensesDue: due, next: 'full', why: 'checkpoint cancelled before it ran whole: it does not count — a fresh one runs at the current generation', end: new Date().toISOString() })
    }
    const round = checkpointRound()
    mkdirSync(a.dir, { recursive: true })
    const verdict = judge({ cfg, contract: current.snap.contract, det: current.snap.det, results: a.results, prior: tier, scopeKind: 'full', pages: current.snap.contract.pages.map((p) => p.id), stateNow: current.snap.state, round, tierFirstRun: tierFirstRun(), roundDir: a.dir, ledger: lines() })
    const flat = cfg.multi ? verdict : { ...verdict, tiers: { [cfg.stages[0]]: { out: path.join(a.dir, cfg.stages[0]), lenses: verdict.lenses } } }
    return append({ ...base, round, ...flat, end: new Date().toISOString() })
  }

  // A checkpoint is settled once: judged (or recorded as cut), the tier decided when it says so,
  // and the checkpoint requests answered — unless it was cut, then they wait for the next one.
  const settle = (a) => {
    const l = finishCheckpoint(a)
    if (l.complete) {
      w.fixesSinceComplete = 0
      w.completeInSession++
    } else if (!l.interrupted) w.autoFailed = true
    if (l.next === 'close-tier' || l.next === 'stop-decision-list' || l.next === 'replan') w.halted = { next: l.next, why: l.why }
    if (!l.interrupted) {
      for (const r of w.waiting) answer(cfg.evidence, w.name, r.id, { verdict: l.complete ? (l.next === 'close-tier' ? 'close' : l.next === 'lenses' ? 'lenses' : 'open') : 'error', why: l.complete ? l.why : l.incomplete, gen: a.gen, line: l, closesGate: l.complete === true && l.next === 'close-tier' })
      w.waiting = []
    }
    return l
  }
  // Cut the running checkpoint at a boundary. One whose processes had all ended is whole and counts.
  const cut = async (why) => {
    const a = w.active
    if (!a) return null
    writeControl(w, 'cancelling')
    a.cancelledBy = why
    // no queued tier starts after this (measureTiers), and the running ones are killed
    a.children.closed = true
    a.children.forEach((c) => c.cancel())
    await a.promise
    a.cancelled = a.results.some((r) => r.cancelled)
    return settle(a)
  }

  while (!w.stopping) {
    if (w.active?.settled) {
      settle(w.active)
      continue
    }
    const pending = pendingRequests(cfg.evidence, w.name)
    for (const r of pending.filter((x) => !['recheck', 'checkpoint', 'stop'].includes(x.kind))) answer(cfg.evidence, w.name, r.id, { verdict: 'error', why: 'request could not be read', closesGate: false })
    for (const r of pending.filter((x) => x.kind === 'checkpoint')) {
      if (w.waiting.some((x) => x.id === r.id)) continue
      // a third or later full checkpoint is asked for with a reason; without one it is refused now, by name (checkpointGate)
      const gate = checkpointGate({ completed: gateCount(), reason: r.reason })
      if (!gate.ok) answer(cfg.evidence, w.name, r.id, { verdict: 'refused', code: gate.code, why: gate.why, gen: w.gen, closesGate: false })
      else w.waiting.push(r)
    }
    const stops = pending.filter((r) => r.kind === 'stop')
    const fixes = pending.filter((r) => r.kind === 'recheck')
    if (stops.length) {
      await cut('a stop request')
      for (const r of [...fixes, ...w.waiting]) answer(cfg.evidence, w.name, r.id, { verdict: 'error', why: 'the session was stopped before this request ran', closesGate: false })
      for (const r of stops) answer(cfg.evidence, w.name, r.id, { verdict: 'stopped', gen: w.gen, closesGate: false })
      break
    }
    if (fixes.length) {
      await handleFixes(fixes)
      continue
    }
    if (!w.active) {
      const owed = w.waiting.length
        ? 'requested (recheck.mjs --checkpoint)'
        : w.autoFailed
          ? null
          : !w.completeInSession
            ? "the session's first checkpoint"
            : cfg.checkpointEvery && w.fixesSinceComplete >= cfg.checkpointEvery
              ? `${w.fixesSinceComplete} fix(es) since the last complete checkpoint (every ${cfg.checkpointEvery}, asked for: ${cfg.checkpointReason})`
              : null
      if (owed) {
        // the reason of the one asking: a request's own, else the config's (a periodic schedule always has one); the session's first
        // checkpoint of a tier that already has the two free ones is a third and needs the config's
        const reason = reasonOf(w.waiting.find((r) => reasonOf(r.reason))?.reason) ?? reasonOf(cfg.checkpointReason)
        const gate = checkpointGate({ completed: gateCount(), reason })
        if (!gate.ok) throw new Error(gate.why.replace('recheck.mjs --checkpoint --reason', 'round.mjs --checkpoint-reason'))
        startCheckpoint(owed, gate.reason)
        continue
      }
    }
    writeControl(w, w.active ? 'checkpoint' : 'idle')
    await sleep(pollMs)
  }

  // Several queued fixes are ONE deploy and one recheck, each request answered with it.
  async function handleFixes(fixes) {
    const ids = fixes.map((r) => r.id)
    const reply = (result) => {
      for (const id of ids) answer(cfg.evidence, w.name, id, { closesGate: false, note: 'a recheck never closes the visual gate: a complete checkpoint does', ...result })
    }
    if (w.halted) return reply({ verdict: 'refused', why: `the tier is decided (${w.halted.next}: ${w.halted.why}) — start a new session with --new-tier on purpose`, gen: w.gen })
    const missing = lensGate()
    if (missing.length)
      return reply({ verdict: 'refused', failedStep: 'lenses', missing, why: `lens note(s) missing before a fix is deployed: ${missing.map((m) => m.why ?? `${m.note} (asked for by ${m.run})`).join('; ')} — run the lens, write its note, then send the fix again`, gen: w.gen })
    // the boundary: a running checkpoint is cut, its finished pages kept as evidence only
    await cut('a deploy')
    if (w.halted) return reply({ verdict: 'refused', why: `the checkpoint that just ended decided the tier (${w.halted.next}: ${w.halted.why})`, gen: w.gen })
    writeControl(w, 'deploying')
    const prevState = w.stale ? null : state
    const t0 = Date.now()
    const dep = await deployNow('fix')
    const rcId = `rc${++w.rcSeq}`
    const hint = [...new Set(fixes.flatMap((r) => r.changed ?? []))].sort()
    const base = { run: `${w.name}/${rcId}`, kind: 'recheck', deployed: true, ...(takeSweep() ? { sweep: lastTaken } : {}), start: new Date(t0).toISOString(), note: fixes.map((r) => r.note).filter(Boolean).join(' | ') || note || null, requests: ids }
    if (dep.failed) {
      const l = append({ ...base, ...dep.failed, durations_s: dep.durations, end: new Date().toISOString() })
      return reply({ verdict: 'error', why: `deploy failed at ${l.failedStep} (${l.log}) — the stand is measured whole next time`, gen: w.gen, line: l })
    }
    current = dep
    state = dep.snap.state
    const contract = dep.snap.contract
    const ts = performance.now()
    let scope = await planScope({ prev: prevState, contract, contractHashNow: dep.snap.cHash, themeNow: state.theme, themeDir: cfg.theme, html: state.html, nondeterministic: dep.snap.det.nondeterministic, site: cfg.site, states: matchStatesFor(contract, cfg.stages), patternsMap: patternsMapOf(cfg) })
    // a KNOWN change (every page it reaches is placed) is a recheck, sampled: each affected layout's
    // representative, the pages it cannot stand in for, the changed clusters' pages; the rest waits
    // for the next checkpoint. Uncertainty (first round, contract, global file, parse) stays full.
    let sample = null
    if (scope.kind === 'targeted' || (scope.kind === 'full' && scope.allAffected)) {
      const prior = tierNow().filter((l) => !l.failedStep)
      sample = sampleRecheck({ scope, contract, latest: latestPages(prior, cfg.stages), clusters: latestClusters(prior, cfg.stages), hint: fixes.flatMap((r) => r.clusters ?? []) })
      if (sample.full) {
        scope = { kind: 'full', reason: `fail closed: ${sample.full}`, pages: contract.pages.map((p) => p.id), files: scope.files }
        sample = null
      }
    }
    dep.durations.scope = sec(performance.now() - ts)
    w.stale = false
    // the agent's list is a hint: what changed on disk decides, and a disagreement is said
    const actual = scope.files ?? []
    const matches = (h, f) => h === f || h.endsWith(`/${f}`)
    const changed = { hint, actual, hintNotChanged: hint.filter((h) => !actual.some((f) => matches(h, f))), unhinted: actual.filter((f) => !hint.some((h) => matches(h, f))) }
    w.fixes++
    w.fixesSinceComplete++
    w.autoFailed = false
    const scopeLine = sample
      ? { kind: 'targeted', reason: scope.reason, pages: sample.measure, affected: sample.affected, deferred: sample.deferred, selection: sample.reasons, clusters: sample.clusters, ...(scope.allAffected ? { allAffected: true } : {}), ...(scope.files ? { changedFiles: scope.files } : {}) }
      : { kind: scope.kind, reason: scope.reason, pages: scope.kind === 'targeted' ? scope.pages : scope.pages.length, ...(scope.files ? { changedFiles: scope.files } : {}) }
    if (scope.kind === 'none') {
      const l = append({ ...base, scope: scopeLine, changed, durations_s: dep.durations, next: 'fix', why: scope.reason, end: new Date().toISOString() })
      return reply({ verdict: 'no-change', why: scope.reason, gen: w.gen, changed, line: l })
    }
    if (!sample) {
      // a change that reaches every page is measured as a checkpoint, whole, before anything else
      startCheckpoint(`fix ${rcId}: ${scope.reason}`, 'a fix that reaches every page is measured whole (fail closed)', { failClosed: true })
      const a = w.active
      await a.promise
      const l = settle(a)
      // the fix's own answer never closes the gate, even when the checkpoint it ran as did: that
      // decision is the checkpoint's line (`checkpoint.next`), read by recheck.mjs --checkpoint
      return reply({ verdict: l.complete ? (l.findings.total || l.findings.unclassified ? 'findings' : 'clean') : 'error', why: l.complete ? `measured whole as checkpoint ${a.id}: ${scope.reason}` : l.incomplete, gen: w.gen, changed, scope: scopeLine, line: l, checkpoint: { run: l.run, complete: l.complete, next: l.next } })
    }
    writeControl(w, 'recheck', { recheck: rcId })
    const dir = path.join(w.session, rcId)
    w.runs.push({ id: rcId, kind: 'recheck', gen: w.gen, tiers: Object.fromEntries(cfg.stages.map((s) => [s, path.join(dir, s)])) })
    const tier = tierNow().filter((l) => !l.failedStep)
    const results = await measureTiers(cfg, { stages: cfg.stages, outOf: (s) => path.join(dir, s), pages: sample.measure, logDir: dir, logName: (s) => `visualQa-${s}`, children: w.rcChildren })
    dep.durations.visualQa = Math.max(...results.map((r) => r.seconds))
    const verdict = judge({ cfg, contract, det: dep.snap.det, results, prior: tier, scopeKind: 'targeted', pages: sample.measure, stateNow: state, round: checkpointRound(), tierFirstRun: false, roundDir: dir, ledger: lines() })
    const flat = cfg.multi ? verdict : { ...verdict, tiers: { [cfg.stages[0]]: { out: path.join(dir, cfg.stages[0]) } } }
    const l = append({ ...base, out: dir, state: dep.snap.stateFile, scope: scopeLine, changed, durations_s: { ...dep.durations, total: sec(Date.now() - t0) }, ...flat, end: new Date().toISOString() })
    // per page × tier: what this fix did there
    const pages = {}
    for (const r of results) {
      if (!r.report) continue
      const diffFile = path.join(dir, cfg.multi ? `diff-${r.stage}.json` : 'diff.json')
      const rows = new Map((existsSync(diffFile) ? readJson(diffFile).pages : []).map((p) => [p.page, p]))
      pages[r.stage] = Object.fromEntries(r.report.pages.map((p) => [p.id, { findings: p.findings.length, kinds: [...new Set(p.findings.map((f) => f.kind))].sort(), closed: rows.get(p.id)?.closed ?? 0, new: rows.get(p.id)?.new ?? 0 }]))
    }
    const errored = results.filter((r) => !r.report).map((r) => r.stage)
    reply({
      verdict: errored.length || !l.complete ? 'error' : l.findings.total || l.findings.unclassified ? 'findings' : 'clean',
      ...(errored.length || !l.complete ? { why: errored.length ? `no report from ${errored.join(', ')} — nothing on those tiers is known` : `recheck incomplete: ${l.incomplete}` } : {}),
      gen: w.gen,
      changed,
      scope: scopeLine,
      pages,
      // not measured by this recheck: their findings stay as last measured until the next checkpoint
      deferred: sample.deferred,
      regressions: l.regressions ?? [],
      churn: l.churn,
      next: l.next,
      line: { run: l.run, out: l.out, findings: l.findings, next: l.next, why: l.why },
      checkpointDue: Boolean(cfg.checkpointEvery) && w.fixesSinceComplete >= cfg.checkpointEvery,
      sweep: dep.sweep
    })
    writeControl(w, 'idle')
  }
  writeControl(w, 'stopped')
  return { session: w.name, gen: w.gen, fixes: w.fixes, checkpoints: w.cpSeq, rechecks: w.rcSeq, recovered: w.recovered }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runRound(process.argv.slice(2))
    .then((line) => {
      console.log(JSON.stringify(line))
      // an incomplete measurement is not a result: a shell sees it fail, not pass
      process.exit(line.failedStep || line.failed || line.complete === false ? 1 : 0)
    })
    .catch((e) => {
      console.error(`round: ${e.message}`)
      process.exit(2)
    })
}
