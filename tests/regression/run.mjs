#!/usr/bin/env node
/**
 * Regression runner: reads the catalogue, picks cases by id/area/kind/cms, hands each case to the
 * Codex CLI against a running stand, and appends one result line per case to
 * `tests/regression/results/<YYYY-MM-DD>-<commit>.jsonl`.
 *
 *   node tests/regression/run.mjs --dry-run                        # list what would run
 *   node tests/regression/run.mjs --stand http://tracy.test:8080 --id REG-001,REG-PR-912-backup-button
 *   node tests/regression/run.mjs --stand <url> --area site-changes/backup --no-model
 *   node tests/regression/run.mjs --dry-run --profile dev               # what dev can run, and why not the rest
 *   node tests/regression/run.mjs --profile dev --stand https://cowork.tracy.site --id REG-001
 *   node tests/regression/run.mjs --stand https://cowork.tracy.site --common tests/regression/common-dev.md \
 *     --cdp http://127.0.0.1:9391 --commit <dev commit> --id REG-057     # develop, not a local stand
 *
 * It does NOT build a stand: pass the URL of one that already runs the commit under test
 * (`--commit`, default `HEAD` of this checkout). The commit written into the result is what the
 * `Regression` gate checks against the PR branch, so it must be the code the stand serves.
 *
 * `--profile dev` points the cases at the develop surface instead of a local stand: only cases whose
 * needs dev can meet run (`devFit`); the runner builds each case's sites and seats on dev under a
 * run manifest and deletes them after the case (`tests/e2e-dev/lib/reg.mjs`); the prompt sends
 * Codex to "Common setup — dev" and the suite's own headless Chromium; `commit` is the deployed
 * web image tag, not `HEAD`; and results go to `~/TCH-local/e2e-dev/reg/<runId>/`, never to
 * `tests/regression/results/` (that folder is the gate's evidence for a branch's commits).
 *
 * `--id` takes whole ids in the catalogue's one grammar (`catalogue.mjs`): a malformed id, an id no
 * case carries, or an id the other filters leave out stops the run with exit 2 — a typed id that
 * silently ran nothing would read as a green run.
 *
 * 🔒 `codex exec` gets stdin closed (`stdio[0] = 'ignore'`, the same as `< /dev/null`): with an
 * open stdin it waits for input forever.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CASES_DIR,
  compareIds,
  duplicateIds,
  formatResult,
  ID_FORMS,
  isCaseId,
  isCasePath,
  parseCase,
  resultPath
} from './catalogue.mjs'
import { runScript } from './script.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Model and effort fixed by the design of 03/10/2026; overridable for experiments. */
export const DEFAULT_MODEL = 'gpt-6.1-sol'
export const DEFAULT_EFFORT = 'low'

/** Where the cases run: a local stand (the default) or the develop surface. */
export const PROFILES = ['local', 'dev']

/**
 * @typedef {object} RunOptions
 * @property {boolean} dryRun - list only.
 * @property {string | null} stand - stand URL.
 * @property {string[]} ids - case ids to keep (empty = all).
 * @property {string[]} areas - area prefixes to keep (empty = all).
 * @property {string | null} kind - `fix` or `feat`.
 * @property {string | null} cms - keep cases for this CMS (or `any`).
 * @property {boolean} noModel - skip `flaky_model` cases.
 * @property {boolean} noCodex - run only cases that carry `run`; never start Codex.
 * @property {string} commit - commit the stand runs.
 * @property {string} model - Codex model.
 * @property {string} effort - reasoning effort.
 * @property {string} evidenceDir - where each case's Codex output is written.
 * @property {'local' | 'dev'} profile - local stand or the develop surface.
 * @property {string | null} runId - dev profile: the run id (labels, emails, results folder).
 * @property {string | null} common - repo file holding the common setup of this stand (null = README section, scv2).
 * @property {string} cdp - CDP endpoint of the chrome-watch Chrome the case drives.
 */

/**
 * Parse argv into options. Throws on an unknown flag or a missing value.
 * @param {string[]} argv - arguments after the script path.
 * @returns {RunOptions} options.
 */
export function parseArgs(argv) {
  /** @type {RunOptions} */
  const o = {
    dryRun: false,
    stand: null,
    ids: [],
    areas: [],
    kind: null,
    cms: null,
    noModel: false,
    noCodex: false,
    commit: 'HEAD',
    model: DEFAULT_MODEL,
    effort: DEFAULT_EFFORT,
    evidenceDir: 'tests/regression/.runs',
    profile: 'local',
    runId: null,
    common: null,
    cdp: 'http://127.0.0.1:9222'
  }
  const list = (v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`)
      return v
    }
    if (flag === '--dry-run' || flag === '--list') o.dryRun = true
    else if (flag === '--no-model') o.noModel = true
    else if (flag === '--no-codex') o.noCodex = true
    else if (flag === '--stand') o.stand = value()
    else if (flag === '--id') {
      // Every comma-separated item is judged before anything is dropped: `REG-001,` or
      // `REG-001,,REG-002` is a mistyped list, not a list with one id fewer.
      const ids = value()
        .split(',')
        .map((s) => s.trim())
      const bad = ids.filter((id) => !isCaseId(id))
      if (bad.length > 0)
        throw new Error(
          `--id ${bad.map((id) => (id === '' ? '(empty item)' : id)).join(', ')}: a case id looks like ${ID_FORMS}`
        )
      o.ids.push(...ids)
    } else if (flag === '--area') o.areas.push(...list(value()))
    else if (flag === '--kind') o.kind = value()
    else if (flag === '--cms') o.cms = value()
    else if (flag === '--commit') o.commit = value()
    else if (flag === '--model') o.model = value()
    else if (flag === '--effort') o.effort = value()
    else if (flag === '--evidence-dir') o.evidenceDir = value()
    else if (flag === '--profile') o.profile = /** @type {any} */ (value())
    else if (flag === '--run-id') o.runId = value()
    else if (flag === '--common') o.common = value()
    else if (flag === '--cdp') o.cdp = value()
    else throw new Error(`unknown flag ${flag}`)
  }
  if (!PROFILES.includes(o.profile)) throw new Error('--profile must be local or dev')
  if (o.runId !== null && o.profile !== 'dev') throw new Error('--run-id belongs to --profile dev')
  if (o.common !== null && o.profile === 'dev')
    throw new Error('--common belongs to the local profile; --profile dev reads its own README section')
  if (o.kind !== null && o.kind !== 'fix' && o.kind !== 'feat') throw new Error('--kind must be fix or feat')
  if (o.noCodex && o.profile === 'dev') throw new Error('--no-codex belongs to the local profile')
  // Script cases name what they need themselves (`run.needs`); only Codex always needs a stand.
  if (!o.dryRun && !o.noCodex && o.stand === null)
    throw new Error('--stand <url> is required (or --dry-run, or --no-codex for script cases only)')
  return o
}

/**
 * Keep the cases the options ask for, sorted by id.
 * @param {import('./catalogue.mjs').RegressionCase[]} cases - the whole catalogue.
 * @param {Pick<RunOptions, 'ids' | 'areas' | 'kind' | 'cms' | 'noModel'>} o - filters.
 * @returns {import('./catalogue.mjs').RegressionCase[]} selected cases.
 */
export function selectCases(cases, o) {
  return cases
    .filter((c) => o.ids.length === 0 || o.ids.includes(c.id))
    .filter((c) => o.areas.length === 0 || o.areas.some((a) => c.area === a || c.area.startsWith(`${a}/`)))
    .filter((c) => o.kind === null || c.kind === o.kind)
    .filter((c) => o.cms === null || c.cms.includes(o.cms) || c.cms.includes('any'))
    .filter((c) => !o.noModel || !c.flaky_model)
    .toSorted((a, b) => compareIds(a.id, b.id))
}

/**
 * Why explicitly requested ids will not run. An id is matched whole, so a near miss selects
 * nothing; without this a mistyped `--id` ends in "0 case(s)" and exit 0.
 * @param {import('./catalogue.mjs').RegressionCase[]} all - the whole catalogue.
 * @param {import('./catalogue.mjs').RegressionCase[]} selected - what `selectCases` kept.
 * @param {string[]} ids - the ids given with `--id`.
 * @returns {string[]} one line per requested id that is not selected; empty when all are.
 */
export function unmatchedIds(all, selected, ids) {
  const known = new Set(all.map((c) => c.id))
  const kept = new Set(selected.map((c) => c.id))
  return [...new Set(ids)]
    .filter((id) => !kept.has(id))
    .map((id) =>
      known.has(id)
        ? `${id}: left out by the other filters (--area/--kind/--cms/--no-model)`
        : `${id}: no such case in ${CASES_DIR}`
    )
}

/**
 * Needs the dev profile cannot meet, with why. Checked in order; the first match refuses.
 * @type {[RegExp, string][]}
 */
const DEV_REFUSED = [
  [/^stand:/, 'needs a stand built for this case (local only)'],
  [/^(chrome-watch|browser:)/, 'drives a watched local Chrome (chrome-watch / CDP 9222)'],
  [
    /^seat:tracy[-_]admin$/,
    'needs a seat in the tracy_admin workspace, which dev does not grant to run accounts'
  ],
  [/^site:create:/, 'creates its own site; on dev the runner creates and deletes every site'],
  [/^fixture:.*-site$/, 'needs a site built from a named quickstart the runner does not build'],
  [/^(checkout|php)$/, 'runs in the checkout, not on a stand']
]

/** Needs the dev profile meets: the runner builds sites and seats, Codex drives its own Chromium. */
const DEV_MET = [
  /^stand$/,
  /^seat:(owner|editor|viewer)$/,
  /^site:(wp|jo|em|any)$/,
  /^model$/,
  /^viewport:\d+$/,
  /^playwright$/,
  /^fixture:[a-z0-9-]+$/
]

/** CMS the dev profile can build a site for (`ENV.builds` in tests/e2e-dev/lib/env.mjs). */
const DEV_CMS = ['wp', 'jo', 'em', 'any']

/**
 * Whether a case can run on the develop surface, and if not, why.
 * @param {import('./catalogue.mjs').RegressionCase} c - the case.
 * @returns {{ ok: true } | { ok: false, reason: string }} verdict.
 */
export function devFit(c) {
  for (const need of c.needs) {
    const refused = DEV_REFUSED.find(([re]) => re.test(need))
    if (refused) return { ok: false, reason: `${need}: ${refused[1]}` }
    if (!DEV_MET.some((re) => re.test(need))) return { ok: false, reason: `${need}: no dev equivalent` }
  }
  if (!c.needs.includes('stand'))
    return { ok: false, reason: 'runs in the checkout (no stand): the same answer on every profile' }
  if (c.area.startsWith('wordpress-theme/'))
    return { ok: false, reason: 'needs a site built from that theme, which the runner does not build' }
  if (!c.cms.every((x) => DEV_CMS.includes(x)))
    return { ok: false, reason: `no dev build for cms ${c.cms.join('/')}` }
  return { ok: true }
}

/** The API's platform name for a case CMS code. */
const PLATFORM = { wp: 'wordpress', jo: 'joomla', em: 'emdash' }

/**
 * What the runner builds on dev before a case: one site per `site:<cms>` need (or one of the
 * case's first CMS, WordPress for `any`), owned by seat A; seat B for `seat:editor`, seat C for
 * `seat:viewer`.
 * @param {import('./catalogue.mjs').RegressionCase} c - the case.
 * @returns {{ sites: string[], seats: ('b' | 'c')[] }} plan.
 */
export function devPlan(c) {
  const named = c.needs.filter((n) => /^site:(wp|jo|em)$/.test(n)).map((n) => PLATFORM[n.slice(5)])
  const first = c.cms.find((x) => x !== 'any')
  const sites = named.length > 0 ? [...new Set(named)] : [first ? PLATFORM[first] : 'wordpress']
  /** @type {('b' | 'c')[]} */
  const seats = []
  if (c.needs.includes('seat:editor')) seats.push('b')
  if (c.needs.includes('seat:viewer')) seats.push('c')
  return { sites, seats }
}

/**
 * Read and validate every case file. A broken file, a `.json` there that is not a case, a case
 * that is not a regular file, or a duplicate id is an error: running a catalogue that is half-read
 * would report green on cases that never ran.
 * @param {string} root - repository root.
 * @returns {import('./catalogue.mjs').RegressionCase[]} all cases.
 */
export function loadCatalogue(root) {
  const dir = join(root, CASES_DIR)
  const problems = []
  const cases = []
  const entries = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).toSorted((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  )) {
    const path = `${CASES_DIR}${entry.name}`
    if (!isCasePath(path)) continue
    // Never open what is not a plain file: a symlink reads a file outside the catalogue, and a
    // FIFO blocks the read forever.
    if (!entry.isFile()) {
      problems.push(`${path}: must be a regular file (not a symlink, folder or pipe)`)
      continue
    }
    const parsed = parseCase(readFileSync(join(root, path), 'utf8'), path)
    if (parsed.ok) {
      cases.push(parsed.value)
      entries.push({ id: parsed.value.id, path })
    } else problems.push(`${path}: ${parsed.problems.join('; ')}`)
  }
  for (const { id, paths } of duplicateIds(entries)) problems.push(`duplicate id ${id}: ${paths.join(', ')}`)
  if (problems.length > 0) throw new Error(`catalogue is invalid:\n  ${problems.join('\n  ')}`)
  return cases
}

/**
 * The `evidence` value of a result line: the same string on every machine.
 * @param {string} root - the repository root.
 * @param {string} log - absolute path of the case's log.
 * @returns {string} the repo-relative path (forward slashes) when the log sits in the checkout;
 *   only the log's file name when `--evidence-dir` (or a run folder) points outside it.
 */
export function evidencePath(root, log) {
  const rel = relative(root, log)
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return basename(log)
  return rel.split(sep).join('/')
}

/**
 * The verdict Codex printed: the LAST line of the form `VERDICT: PASS|FAIL|BLOCKED`.
 * @param {string} output - Codex stdout.
 * @returns {'PASS' | 'FAIL' | 'BLOCKED'} verdict; `BLOCKED` when none was printed.
 */
export function parseVerdict(output) {
  const all = [...output.matchAll(/^\s*VERDICT:\s*(PASS|FAIL|BLOCKED)\b/gm)]
  return all.length === 0 ? 'BLOCKED' : /** @type {'PASS' | 'FAIL' | 'BLOCKED'} */ (all.at(-1)?.[1])
}

/**
 * The instruction handed to Codex for one case.
 * @param {import('./catalogue.mjs').RegressionCase} c - the case.
 * The dev profile changes exactly two sentences: where "Common setup" is (the dev section of the
 * README, plus the case's env file) and how browsers are driven (the suite's own Chromium).
 * @param {{stand: string, commit: string, profile?: 'local' | 'dev', envFile?: string}} ctx - where
 *   and what is under test; `envFile` is the dev case's `$Q/env.sh`.
 * @returns {string} prompt text.
 *   `common` (local profile only) replaces the README section with another stand's setup file,
 *   and `cdp` names the chrome-watch endpoint the local profile drives.
 * @param {{stand: string, commit: string, profile?: 'local' | 'dev', envFile?: string, common?: string | null, cdp?: string}} ctx - where
 *   and what is under test; `envFile` is the dev case's `$Q/env.sh`.
 * @returns {string} prompt text.
 */
export function buildPrompt(
  c,
  { stand, commit, profile = 'local', envFile = '', common = null, cdp = 'http://127.0.0.1:9222' }
) {
  const dev = profile === 'dev'
  const setup = dev
    ? [
        `First read the section "Common setup — dev" of tests/regression/README.md and start every shell command with \`. ${envFile} &&\`: a step that says`,
        '"Common setup" means that section (O, COOKIE_DOMAIN, seats A/B/C, the case\'s sites S/KEY/LABEL, mint/api/pq/dshgrep/em).'
      ]
    : common === null
      ? [
          'First read the section "Common setup (every case)" of tests/regression/README.md: a step that says',
          '"Common setup" means that section (O, COOKIE_DOMAIN, PG/WEB/HOST/DSH, seat cookies, api/pq/em).'
        ]
      : [
          `First read ${common} in full: a step that says "Common setup" means THAT file, not the scv2`,
          'section of tests/regression/README.md (it defines O, the cookies, api/pq and what you may write).'
        ]
  return [
    `You are a regression test runner for the Tracy repository (checkout: ${ROOT}).`,
    `The stand under test is ${stand} (this is O), running commit ${commit}.`,
    ...setup,
    'Run exactly the case below. Do not change any repository file and do not fix anything.',
    dev
      ? "Drive browsers with the suite's own headless Chromium (Playwright, resolved the way `tests/e2e-dev/lib/browser.mjs` does); never use chrome-watch."
      : `Drive browsers only through \`chrome-watch\` (CDP on ${cdp}); do not close pages.`,
    'Judge only by the `expect` items: every one must hold for PASS. If a precondition in `needs`',
    'cannot be met (no stand, no seat, no model key), the verdict is BLOCKED, not FAIL.',
    'End your answer with one line: `VERDICT: PASS`, `VERDICT: FAIL` or `VERDICT: BLOCKED`,',
    'preceded by one line per expect item saying what you observed.',
    '',
    'Case:',
    JSON.stringify(c, null, 2)
  ].join('\n')
}

/**
 * The Codex command line for one prompt.
 * @param {string} prompt - the prompt.
 * @param {Pick<RunOptions, 'model' | 'effort'>} o - model and effort.
 * @returns {string[]} argv after `codex`.
 */
export function codexArgs(prompt, o) {
  return [
    'exec',
    '-m',
    o.model,
    '-c',
    `model_reasoning_effort=${o.effort}`,
    '--sandbox',
    'danger-full-access',
    prompt
  ]
}

/**
 * Resolve a revision to a full sha in this checkout.
 * @param {string} rev - revision.
 * @returns {string} sha.
 */
/**
 * Whether a Chrome answers on the CDP endpoint.
 * @param {string} cdp - e.g. http://127.0.0.1:9222.
 * @returns {Promise<boolean>} true when /json/version answers.
 */
async function cdpAnswers(cdp) {
  try {
    const r = await fetch(`${cdp}/json/version`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch {
    return false
  }
}

function revParse(rev) {
  const r = spawnSync('git', ['rev-parse', '--verify', `${rev}^{commit}`], { cwd: ROOT, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`cannot resolve commit ${rev}`)
  return r.stdout.trim()
}

/**
 * Run the selected cases.
 * @param {string[]} argv - arguments.
 * @returns {Promise<number>} exit code: 0 when every case passed (or dry run), 1 otherwise.
 */
async function main(argv) {
  const o = parseArgs(argv)
  const all = loadCatalogue(ROOT)
  const cases = selectCases(all, o)
  const unmatched = unmatchedIds(all, cases, o.ids)
  if (unmatched.length > 0)
    throw new Error(`--id asks for cases that would not run:\n  ${unmatched.join('\n  ')}`)
  if (o.profile === 'dev') return mainDev(o, cases)
  if (o.dryRun) {
    for (const c of cases) {
      const flags = [
        c.kind,
        `#${String(c.pr)}`,
        c.cms.join('/'),
        c.flaky_model ? 'model' : 'mechanism',
        c.run ? 'script' : 'codex'
      ].join(' · ')
      process.stdout.write(`${c.id}  ${c.area}  [${flags}]  ${c.title}\n`)
    }
    process.stdout.write(`${String(cases.length)} case(s) would run.\n`)
    return 0
  }
  const commit = revParse(o.commit)
  const started = new Date()
  const out = join(ROOT, resultPath(started, commit))
  const evidenceDir = resolve(
    ROOT,
    o.evidenceDir,
    `${started.toISOString().slice(0, 10)}-${commit.slice(0, 9)}`
  )
  mkdirSync(dirname(out), { recursive: true })
  mkdirSync(evidenceDir, { recursive: true })
  let failed = 0
  const cdpUp = cases.some((c) => c.run?.needs?.includes('chrome')) ? await cdpAnswers(o.cdp) : false
  for (const c of cases) {
    if (c.run) {
      const r = runScript(c.run, { root: ROOT, env: process.env, stand: o.stand, cdpUp })
      const log = join(evidenceDir, `${c.id}.log`)
      writeFileSync(log, `$ ${c.run.cmd.join(' ')}\n${r.output}\n--- verdict ---\n${r.verdict} ${r.reason}\n`)
      if (r.verdict !== 'PASS') failed++
      const evidence = evidencePath(ROOT, log)
      appendFileSync(
        out,
        `${formatResult({ id: c.id, verdict: r.verdict, commit, ranAt: new Date(), evidence })}\n`
      )
      const why = r.reason ? ` — ${r.reason}` : ''
      process.stdout.write(`${c.id} ${r.verdict} (script, ${String(Math.round(r.ms / 1000))} s)${why}\n`)
      continue
    }
    if (o.noCodex) {
      process.stdout.write(`${c.id} SKIPPED (no run script yet; Codex not started)\n`)
      continue
    }
    const prompt = buildPrompt(c, {
      stand: /** @type {string} */ (o.stand),
      commit,
      common: o.common,
      cdp: o.cdp
    })
    const r = spawnSync('codex', codexArgs(prompt, o), {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024
    })
    const log = join(evidenceDir, `${c.id}.log`)
    writeFileSync(
      log,
      `${r.stdout ?? ''}\n--- stderr ---\n${r.stderr ?? ''}${r.error ? `\n${String(r.error)}` : ''}`
    )
    const verdict = r.status === 0 ? parseVerdict(r.stdout ?? '') : 'BLOCKED'
    if (verdict !== 'PASS') failed++
    const evidence = evidencePath(ROOT, log)
    appendFileSync(out, `${formatResult({ id: c.id, verdict, commit, ranAt: new Date(), evidence })}\n`)
    process.stdout.write(`${c.id} ${verdict}\n`)
  }
  process.stdout.write(`results: ${relative(ROOT, out)}\n`)
  return failed === 0 ? 0 : 1
}

/**
 * The reason to show for a verdict that is not PASS: the observation lines Codex printed just
 * before its last VERDICT line.
 * @param {string} output - Codex stdout.
 * @returns {string} up to three lines joined, at most 300 characters.
 */
export function verdictReason(output) {
  const lines = output.split('\n').map((l) => l.trim())
  const at = lines.findLastIndex((l) => /^VERDICT:\s*(PASS|FAIL|BLOCKED)\b/.test(l))
  const before = (at === -1 ? lines : lines.slice(0, at)).filter((l) => l !== '')
  return before.slice(-3).join(' / ').slice(0, 300)
}

/**
 * `--profile dev`: filter by `devFit`, then per case build its sites and seats on dev, hand it to
 * Codex with the dev prompt, and delete what was built. One run folder holds the deploy manifest,
 * `results.jsonl`, one log and one verdict JSON per case, and `report.md`/`report.json`.
 * @param {RunOptions} o - options.
 * @param {import('./catalogue.mjs').RegressionCase[]} selected - cases after the usual filters.
 * @returns {Promise<number>} exit code.
 */
async function mainDev(o, selected) {
  const fit = selected.map((c) => ({ c, fit: devFit(c) }))
  const runnable = fit.filter((x) => x.fit.ok).map((x) => x.c)
  const refused = fit.filter((x) => !x.fit.ok)
  if (o.dryRun) {
    for (const c of runnable) {
      const plan = devPlan(c)
      const seats = ['A owner', ...plan.seats.map((s) => `${s.toUpperCase()} editor`)].join(', ')
      process.stdout.write(
        `${c.id}  ${c.area}  [${c.flaky_model ? 'model' : 'mechanism'}]  sites: ${plan.sites.join(', ')} · seats: ${seats}  ${c.title}\n`
      )
    }
    process.stdout.write(`${String(runnable.length)} case(s) would run on dev.\n`)
    if (refused.length > 0) {
      process.stdout.write(`\nNot on dev (${String(refused.length)}):\n`)
      for (const { c, fit: f } of refused)
        process.stdout.write(`${c.id}  ${c.area}  — ${/** @type {{reason: string}} */ (f).reason}\n`)
    }
    return 0
  }
  // Asked for by id and refused by dev: stop before touching dev, for the same reason an unknown
  // id stops a local run — the run would end green without that case.
  const refusedById = refused.filter((x) => o.ids.includes(x.c.id))
  if (refusedById.length > 0)
    throw new Error(
      `--id asks for cases dev cannot run:\n  ${refusedById
        .map((x) => `${x.c.id}: ${/** @type {{reason: string}} */ (x.fit).reason}`)
        .join('\n  ')}`
    )

  const { ENV, RUN_ID } = await import('../e2e-dev/lib/env.mjs')
  const { readDeploy, deployCommit } = await import('../e2e-dev/lib/deploy.mjs')
  const { devExec } = await import('../e2e-dev/lib/dev.mjs')
  const { redact, redactText } = await import('../e2e-dev/lib/redact.mjs')
  const { writeReport } = await import('../e2e-dev/lib/report.mjs')
  const { CLEANERS } = await import('../e2e-dev/lib/sites.mjs')
  const reg = await import('../e2e-dev/lib/reg.mjs')

  if (o.stand !== ENV.origin)
    throw new Error(
      `--profile dev talks to ${ENV.origin} (E2E_DEV_ORIGIN); --stand ${String(o.stand)} differs`
    )
  const d = new Date()
  const runId =
    o.runId ??
    `r${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`
  if (!RUN_ID.test(runId)) throw new Error(`--run-id must match ${String(RUN_ID)}`)
  const log = (line) => process.stdout.write(`[reg dev ${runId}] ${line}\n`)
  for (const { c, fit: f } of refused)
    log(`${c.id} not on dev: ${/** @type {{reason: string}} */ (f).reason}`)

  const recovered = await reg.recoverAbandoned(log)
  const { dir, manifest } = reg.openRun(runId)
  const startedAt = new Date().toISOString()
  const deploy = await readDeploy()
  writeFileSync(join(dir, 'deploy.json'), `${JSON.stringify(redact(deploy), null, 2)}\n`)
  const commit = deployCommit(deploy)
  const deployLine = {
    run: runId,
    images: deploy.images,
    dshSourceCommit: deploy.env.DSH_SOURCE_COMMIT,
    plugins: deploy.plugins,
    manifest: join(dir, 'deploy.json')
  }
  log(`results in ${dir} · deploy ${commit} · ${String(runnable.length)} case(s)`)
  mkdirSync(join(dir, 'journeys'), { recursive: true })

  let failed = 0
  let interrupted = false
  const stop = () => {
    interrupted = true
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  try {
    for (const [i, c] of runnable.entries()) {
      if (interrupted) break
      const started = Date.now()
      /** @type {'PASS' | 'FAIL' | 'BLOCKED'} */
      let verdict = 'BLOCKED'
      let reason = ''
      let q = null
      let sites = []
      // Dev redeploys on every push to develop, also in the middle of a run (measured 04/10/2026,
      // run k1004r1): each case names the web image it actually ran against, read just before
      // Codex starts, and says when it changed before Codex finished.
      let caseCommit = commit
      let caseImages = deploy.images
      let changedDuringCase = false
      const logFile = join(dir, `${c.id}.log`)
      try {
        const prepared = await reg.prepareCase({
          runId,
          manifest,
          runDir: dir,
          caseId: c.id,
          index: i + 1,
          plan: devPlan(c)
        })
        q = prepared.q
        sites = prepared.sites
        log(
          `${c.id}: ${sites.map((s) => `${s.siteKey} ready in ${String(Math.round(s.ms / 1000))} s`).join(', ')}`
        )
        caseImages = await devExec.images()
        caseCommit = deployCommit({ images: caseImages })
        const prompt = buildPrompt(c, {
          stand: ENV.origin,
          commit: caseCommit,
          profile: 'dev',
          envFile: prepared.envFile
        })
        const r = spawnSync('codex', codexArgs(prompt, o), {
          cwd: ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 256 * 1024 * 1024
        })
        const imagesAfter = await devExec.images().catch(() => caseImages)
        changedDuringCase = Object.keys(caseImages).some((k) => imagesAfter[k] !== caseImages[k])
        if (changedDuringCase) log(`${c.id}: the deploy changed while the case ran`)
        writeFileSync(
          logFile,
          redactText(
            `${r.stdout ?? ''}\n--- stderr ---\n${r.stderr ?? ''}${r.error ? `\n${String(r.error)}` : ''}`
          )
        )
        verdict = r.status === 0 ? parseVerdict(r.stdout ?? '') : 'BLOCKED'
        reason =
          r.status === 0
            ? verdict === 'PASS'
              ? ''
              : verdictReason(r.stdout ?? '')
            : `codex exited ${String(r.status)}${r.error ? ` (${String(r.error)})` : ''}`
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        reason = `[environment] ${message}`
        writeFileSync(logFile, redactText(`setup failed: ${message}\n`))
      } finally {
        const after = await reg.cleanupCase({ manifest, q })
        const left = after.resources.filter((r) => r.kind === 'site' && r.state === 'left')
        if (left.length > 0) log(`${c.id}: NOT cleaned: ${left.map((r) => r.id).join(', ')}`)
      }
      if (verdict !== 'PASS') failed++
      const ranAt = new Date()
      const evidence = evidencePath(ROOT, logFile)
      appendFileSync(
        join(dir, 'results.jsonl'),
        `${JSON.stringify({
          ...JSON.parse(formatResult({ id: c.id, verdict, commit: caseCommit, ranAt, evidence })),
          deploy: { ...deployLine, images: caseImages, ...(changedDuringCase ? { changedDuringCase } : {}) }
        })}\n`
      )
      writeFileSync(
        join(dir, 'journeys', `${c.id}.json`),
        `${JSON.stringify(
          redact({
            id: c.id,
            cms: null,
            verdict,
            reason: reason || null,
            retries: 0,
            startedAt: new Date(started).toISOString(),
            ms: Date.now() - started,
            origin: ENV.origin,
            area: c.area,
            commit: caseCommit,
            ...(changedDuringCase ? { deployChangedDuringCase: true } : {}),
            sites: sites.map((s) => s.siteKey),
            log: logFile
          }),
          null,
          2
        )}\n`
      )
      log(`${c.id} ${verdict}${reason ? ` — ${reason}` : ''}`)
    }
  } finally {
    await manifest.cleanup(CLEANERS)
    const images = await devExec.images().catch((error) => ({ error: String(error) }))
    writeFileSync(
      join(dir, 'deploy-end.json'),
      `${JSON.stringify({ measuredAt: new Date().toISOString(), images }, null, 2)}\n`
    )
    manifest.finish()
    if (recovered.length > 0)
      writeFileSync(join(dir, 'recovered.json'), `${JSON.stringify(recovered, null, 2)}\n`)
    const { json } = writeReport({
      runDir: dir,
      runId,
      requested: runnable.map((c) => ({ id: c.id, cms: null })),
      startedAt,
      finishedAt: new Date().toISOString(),
      flags: {
        profile: 'dev',
        ids: o.ids,
        areas: o.areas,
        noModel: o.noModel,
        refused: refused.map((x) => x.c.id),
        ...(interrupted ? { interrupted } : {})
      }
    })
    const s = json.summary
    log(
      `${String(s.pass)} PASS · ${String(s.fail)} FAIL · ${String(s.blocked)} BLOCKED — ${join(dir, 'report.md')}`
    )
    const uncleaned = json.leftover.filter((r) => r.state !== 'kept')
    if (uncleaned.length > 0) {
      log(`NOT CLEANED: ${uncleaned.map((r) => `${r.kind} ${r.id} (${r.state})`).join(', ')}`)
      failed++
    }
  }
  return failed === 0 && !interrupted ? 0 : 1
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    process.exit(await main(process.argv.slice(2)))
  } catch (error) {
    process.stderr.write(`run.mjs: ${/** @type {Error} */ (error).message}\n`)
    process.exit(2)
  }
}
