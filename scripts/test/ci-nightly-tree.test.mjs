/**
 * The nightly Tracy CI run describes ONE tree — `.github/workflows/tracy-ci.yml`, `schedule` event.
 *
 * WHY THIS IS PINNED BY A TEST. Until 05/10/2026 `dsh-lib`, `plan` and every `build-check` row each
 * checked out the moving `develop` on their own, minutes apart, and the verdict then said "every row
 * ran" as if about one commit. Nothing in a workflow file goes red when a job quietly reads the
 * branch again: the run is green, only its claim is wrong. So the wiring is asserted here, in three
 * ways that do not depend on reading the YAML by eye:
 *
 *   1. the workflow is PARSED (js-yaml), and the `if`/`ref`/`runs-on` expressions are EVALUATED for
 *      each event by the small evaluator below — it throws on any syntax it does not know, so it can
 *      never guess;
 *   2. the nightly's shell steps are EXECUTED with bash against throwaway git repositories (under
 *      `$TCH_TEST_ARTIFACTS_DIR` when set, the OS temp directory otherwise);
 *   3. the pull-request and manual paths are evaluated too, because the change must not move them.
 *
 * WHAT THIS CANNOT SHOW: GitHub's own scheduler, its expression engine, `actions/checkout` fetching
 * a commit id, and the cache transport. Only a real scheduled run shows those; how to read one is
 * in `docs/references/gates-ci-runners.md`.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { load } from 'js-yaml'

import { runnerPaths } from '../test-support/runs-on.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const workflow = load(readFileSync(join(ROOT, '.github/workflows/tracy-ci.yml'), 'utf8'))
const jobs = workflow.jobs

const SCRATCH = mkdtempSync(join(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir(), 'ci-nightly-tree-'))
after(() => rmSync(SCRATCH, { recursive: true, force: true }))

// ── a strict evaluator for the expression subset this workflow uses ──────────────────────────────

const TOKEN =
  /\s*(?:(&&|\|\||==|!=|!|\(|\)|,)|'((?:[^']|'')*)'|([A-Za-z_][\w-]*(?:\.(?:\*|[A-Za-z_][\w-]*))*))/y

function tokenize(source) {
  const tokens = []
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < source.length) {
    const at = TOKEN.lastIndex
    const m = TOKEN.exec(source)
    if (!m) {
      if (source.slice(at).trim() === '') break
      throw new Error(`expression syntax this test does not know, at: ${source.slice(at, at + 30)}`)
    }
    if (m[1] !== undefined) tokens.push({ op: m[1] })
    else if (m[2] !== undefined) tokens.push({ string: m[2].replaceAll("''", "'") })
    else tokens.push({ name: m[3] })
  }
  return tokens
}

const truthy = (v) => !(v === false || v === null || v === 0 || v === '')
const toNumber = (v) => (v === null ? 0 : typeof v === 'boolean' ? Number(v) : v === '' ? 0 : Number(v))

/** GitHub's `==`: same type compares directly (strings ignoring case), otherwise as numbers. */
function looseEqual(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase()
  if (typeof a === typeof b || (a === null && b === null)) return a === b
  return toNumber(a) === toNumber(b)
}

function lookup(context, path) {
  let value = context
  const keys = path.split('.')
  for (const [i, key] of keys.entries()) {
    // GitHub's object filter: `labels.*.name` is the `name` of every element of `labels`.
    if (key === '*') {
      if (!Array.isArray(value)) return null
      const rest = keys.slice(i + 1).join('.')
      return rest ? value.map((item) => lookup(item, rest)) : value
    }
    if (value === null || typeof value !== 'object' || !(key in value)) return null
    value = value[key]
  }
  return value ?? null
}

/** Evaluate one expression (without its `${{ }}`) against a context. */
function evaluate(source, context) {
  const tokens = tokenize(source)
  let at = 0
  const peekOp = () => tokens[at]?.op
  const primary = () => {
    const token = tokens[at++]
    if (token === undefined) throw new Error(`expression ends early: ${source}`)
    if (token.op === '(') {
      const value = or()
      if (tokens[at++]?.op !== ')') throw new Error(`missing ) in: ${source}`)
      return value
    }
    if (token.string !== undefined) return token.string
    if (token.name === undefined) throw new Error(`unexpected ${token.op} in: ${source}`)
    if (peekOp() === '(') {
      at++
      if (token.name === 'contains') {
        const haystack = or()
        if (tokens[at++]?.op !== ',') throw new Error(`contains() takes two arguments: ${source}`)
        const needle = or()
        if (tokens[at++]?.op !== ')') throw new Error(`missing ) in: ${source}`)
        // GitHub's contains(): an array holds the item (strings ignoring case), a string the substring.
        if (Array.isArray(haystack)) return haystack.some((item) => looseEqual(item, needle))
        return String(haystack ?? '')
          .toLowerCase()
          .includes(String(needle ?? '').toLowerCase())
      }
      if (tokens[at++]?.op !== ')') throw new Error(`only argument-less functions are known: ${source}`)
      const fn = context.functions[token.name]
      if (!fn) throw new Error(`function this test does not know: ${token.name}()`)
      return fn()
    }
    if (token.name === 'true') return true
    if (token.name === 'false') return false
    if (token.name === 'null') return null
    return lookup(context, token.name)
  }
  const unary = () => {
    if (peekOp() === '!') {
      at++
      return !truthy(unary())
    }
    return primary()
  }
  const equality = () => {
    const left = unary()
    const op = peekOp()
    if (op !== '==' && op !== '!=') return left
    at++
    const same = looseEqual(left, unary())
    return op === '==' ? same : !same
  }
  const and = () => {
    let value = equality()
    while (peekOp() === '&&') {
      at++
      const right = equality()
      value = truthy(value) ? right : value
    }
    return value
  }
  function or() {
    let value = and()
    while (peekOp() === '||') {
      at++
      const right = and()
      value = truthy(value) ? value : right
    }
    return value
  }
  const value = or()
  if (at !== tokens.length) throw new Error(`trailing tokens in: ${source}`)
  return value
}

/** A YAML value that is a literal or exactly one `${{ }}`; anything mixed is refused. */
function template(value, context) {
  if (value === undefined || value === null) return ''
  const text = String(value).trim()
  const whole = /^\$\{\{([\s\S]*)\}\}$/.exec(text)
  if (whole) return evaluate(whole[1], context)
  if (text.includes('${{')) throw new Error(`mixed template this test does not know: ${text}`)
  return text
}

/**
 * The context of one job on one event.
 *
 * @param {object} o
 * @param {string} o.event - `schedule`, `pull_request` or `workflow_dispatch`.
 * @param {boolean} [o.draft] - the pull request is a draft.
 * @param {string} [o.baseRef] - the pull request's base branch.
 * @param {boolean} [o.cancelled] - the run was cancelled.
 * @param {Record<string, string>} [o.results] - result of each job in `needs`.
 * @param {string} [o.sha] - what `plan` published as `checkout_sha`.
 */
function contextOf({ event, draft = false, baseRef = 'develop', cancelled = false, results = {}, sha = '' }) {
  const pr = event === 'pull_request'
  const needs = Object.fromEntries(
    Object.entries(results).map(([job, result]) => [job, { result, outputs: {} }])
  )
  // A published commit implies a `plan` that finished; its outputs exist whenever `plan` is needed.
  if (sha !== '' && !needs.plan) needs.plan = { result: 'success' }
  if (needs.plan) needs.plan.outputs = { checkout_sha: sha, matrix: '{"include":[]}' }
  const all = Object.values(results)
  return {
    github: {
      event_name: event,
      base_ref: pr ? baseRef : '',
      // A schedule event runs the default branch's copy of the file, so `ref_name` is `main`.
      ref_name: pr ? '7/merge' : event === 'schedule' ? 'main' : 'develop',
      event: pr ? { pull_request: { draft } } : {}
    },
    needs,
    matrix: { label: 'tracy-check', group: 'checks' },
    functions: {
      always: () => true,
      cancelled: () => cancelled,
      // Documented default: a job runs only when every job it needs succeeded — a skipped one counts
      // against it, which is exactly why `build-check` has to spell its condition out.
      success: () => !cancelled && all.every((r) => r === 'success'),
      failure: () => !cancelled && all.includes('failure')
    }
  }
}

/** Would this job (or step) start? GitHub prepends `success() &&` unless a status function is named. */
function runs(node, context) {
  if (node.if === undefined) return context.functions.success()
  const text = String(node.if).trim()
  const source = /^\$\{\{([\s\S]*)\}\}$/.exec(text)?.[1] ?? text
  const named = /\b(always|cancelled|success|failure)\s*\(/.test(source)
  return truthy(evaluate(named ? source : `success() && (${source})`, context))
}

/** Can the job start on this event for ANY combination of its prerequisites' results? */
function canStart(job, event) {
  const needs = [job.needs ?? []].flat()
  const combos = needs.reduce(
    (all, need) => all.flatMap((c) => RESULTS.map((r) => ({ ...c, [need]: r }))),
    [{}]
  )
  return combos.some((results) => runs(job, contextOf({ event, results })))
}

const stepNamed = (job, name) => jobs[job]?.steps?.find((s) => s.name === name)
const checkouts = (job) =>
  (jobs[job]?.steps ?? []).filter((s) => String(s.uses ?? '').startsWith('actions/checkout@'))

// ── running a step's shell against a throwaway repository ────────────────────────────────────────

const BASH = existsSync('/bin/bash') ? '/bin/bash' : 'bash'
const GIT_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }

function git(cwd, ...args) {
  const done = spawnSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8', timeout: 20000, env: { ...process.env, ...GIT_ENV } }
  )
  assert.equal(done.status, 0, `git ${args.join(' ')}: ${done.stderr}`)
  return done.stdout.trim()
}

let serial = 0
/** A fresh directory, optionally a repository on `develop` with one commit. */
function scratch({ commits = 0 } = {}) {
  const dir = join(SCRATCH, `case-${String(++serial)}`)
  mkdirSync(join(dir, 'repo'), { recursive: true })
  if (commits >= 0) git(join(dir, 'repo'), 'init', '-q', '-b', 'develop')
  for (let i = 0; i < commits; i++)
    git(join(dir, 'repo'), 'commit', '-q', '--allow-empty', '-m', `c${String(i)}`)
  return { dir, repo: join(dir, 'repo'), output: join(dir, 'output'), summary: join(dir, 'summary') }
}

/**
 * Run a step's `run:` the way the runner does (`bash -e`), with ONLY the environment given — so a
 * variable the step needs and the test forgot is a failure here, not something inherited.
 */
function runStep(step, { cwd, env = {}, path = process.env.PATH }) {
  assert.ok(step?.run, 'the step must exist and carry a run: script')
  const done = spawnSync(BASH, ['-e', '-c', step.run], {
    cwd,
    encoding: 'utf8',
    timeout: 20000,
    // The ceiling keeps "not a repository" true even when the scratch directory sits inside one.
    env: { PATH: path, HOME: cwd, GIT_CEILING_DIRECTORIES: SCRATCH, ...GIT_ENV, ...env }
  })
  assert.equal(done.error, undefined, `bash did not run: ${String(done.error)}`)
  return { status: done.status, text: `${done.stdout}${done.stderr}` }
}

const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '')
const published = (file) => /^checkout_sha=(.*)$/m.exec(read(file))?.[1]

const A = 'a'.repeat(40)
/** Everything that is not exactly forty lowercase hex digits, one shape per entry. */
const MALFORMED = {
  empty: '',
  'a branch name': 'develop',
  '39 digits': 'a'.repeat(39),
  '41 digits': 'a'.repeat(41),
  uppercase: 'A'.repeat(40),
  'not hex': 'g'.repeat(40),
  'trailing newline': `${A}\n`,
  'leading newline': `\n${A}`,
  'leading space': ` ${A}`,
  'trailing space': `${A} `,
  'two ids': `${A}\n${A}`
}

const PIN = 'Pin the nightly to one commit'
const REFUSE = 'Refuse a nightly without its pinned commit'
const ASSERT = 'Assert the nightly checkout is the pinned commit'
/** The jobs that check out the nightly's tree after `plan`. */
const CONSUMERS = ['dsh-lib-nightly', 'build-check']
const EVENTS = ['schedule', 'pull_request', 'workflow_dispatch']
const RESULTS = ['success', 'failure', 'cancelled', 'skipped']

// ── plan: one commit, published once ─────────────────────────────────────────────────────────────

test('nightly: plan resolves develop once and publishes that commit as checkout_sha', () => {
  const pin = stepNamed('plan', PIN)
  assert.ok(pin, 'plan needs a step that pins the commit')
  assert.ok(pin.id, 'the pin step needs an id for its output to be readable')
  assert.equal(jobs.plan.outputs.checkout_sha, `\${{ steps.${pin.id}.outputs.checkout_sha }}`)

  // It runs on the nightly only, and after the one checkout that names the branch.
  assert.equal(runs(pin, contextOf({ event: 'schedule' })), true)
  assert.equal(runs(pin, contextOf({ event: 'pull_request' })), false)
  assert.equal(runs(pin, contextOf({ event: 'workflow_dispatch' })), false)
  const [checkout] = checkouts('plan')
  assert.ok(jobs.plan.steps.indexOf(checkout) < jobs.plan.steps.indexOf(pin))
  assert.equal(template(checkout.with.ref, contextOf({ event: 'schedule' })), 'develop')

  const s = scratch({ commits: 2 })
  const head = git(s.repo, 'rev-parse', 'HEAD')
  const done = runStep(pin, { cwd: s.repo, env: { GITHUB_OUTPUT: s.output, GITHUB_STEP_SUMMARY: s.summary } })
  assert.equal(done.status, 0, done.text)
  assert.equal(read(s.output), `checkout_sha=${head}\n`, 'exactly one output line, the full commit id')
  assert.ok(done.text.includes(`nightly tree: plan selected ${head}`), 'the log names the selected commit')
  assert.ok(read(s.summary).includes(head), 'the run summary names the selected commit')
})

test('nightly: plan publishes nothing when git fails, cannot start, or answers with no commit id', () => {
  const pin = stepNamed('plan', PIN)
  const attempt = (label, { repo, path }) => {
    const s = scratch({ commits: repo })
    const env = { GITHUB_OUTPUT: s.output, GITHUB_STEP_SUMMARY: s.summary }
    const done = runStep(pin, { cwd: s.repo, env, path: path ? path(s.dir) : undefined })
    assert.notEqual(done.status, 0, `${label}: the step must fail — ${done.text}`)
    assert.equal(published(s.output), undefined, `${label}: no checkout_sha may be published`)
    assert.ok(!read(s.summary).includes('checks out'), `${label}: no summary may claim a tree`)
  }
  const stub = (script) => (dir) => {
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    if (script !== null) {
      writeFileSync(join(bin, 'git'), `#!${BASH}\n${script}\n`)
      chmodSync(join(bin, 'git'), 0o755)
    }
    return bin
  }
  // A repository with no commit: `HEAD^{commit}` does not resolve.
  attempt('no commit', { repo: 0 })
  // Not a repository at all.
  attempt('not a repository', { repo: -1 })
  // `git` is not on PATH: bash answers 127.
  attempt('git missing', { repo: 1, path: stub(null) })
  attempt('git exits non-zero after printing an id', { repo: 1, path: stub(`echo ${A}; exit 3`) })
  attempt('git prints nothing', { repo: 1, path: stub('exit 0') })
  attempt('git prints a branch name', { repo: 1, path: stub('echo develop') })
  attempt('git prints an abbreviated id', { repo: 1, path: stub('echo abc1234') })
  attempt('git prints two ids', { repo: 1, path: stub(`echo ${A}; echo ${A}`) })
})

test('nightly: a summary or an output that cannot be written fails the pin and publishes nothing', () => {
  const pin = stepNamed('plan', PIN)
  const attempt = (label, envOf) => {
    const s = scratch({ commits: 1 })
    const done = runStep(pin, { cwd: s.repo, env: envOf(s) })
    assert.notEqual(done.status, 0, `${label}: the step must fail — ${done.text}`)
    assert.equal(published(s.output), undefined, `${label}: no checkout_sha may be published`)
  }
  const missing = (s) => join(s.dir, 'no-such-directory', 'file')
  attempt('summary path missing', (s) => ({ GITHUB_OUTPUT: s.output, GITHUB_STEP_SUMMARY: missing(s) }))
  attempt('summary is a directory', (s) => ({ GITHUB_OUTPUT: s.output, GITHUB_STEP_SUMMARY: s.dir }))
  attempt('summary variable unset', (s) => ({ GITHUB_OUTPUT: s.output }))
  attempt('output path missing', (s) => ({ GITHUB_OUTPUT: missing(s), GITHUB_STEP_SUMMARY: s.summary }))
  attempt('output is a directory', (s) => ({ GITHUB_OUTPUT: s.dir, GITHUB_STEP_SUMMARY: s.summary }))
  attempt('output variable unset', (s) => ({ GITHUB_STEP_SUMMARY: s.summary }))
})

// ── consumers: the pinned commit, never the branch ───────────────────────────────────────────────

test('nightly: only plan names develop; every other checkout takes the commit plan pinned', () => {
  const scheduled = contextOf({ event: 'schedule', sha: A })
  const reading = []
  for (const [name, job] of Object.entries(jobs)) {
    for (const checkout of checkouts(name)) {
      // A job that can never start on the nightly cannot read the branch then.
      if (!canStart(job, 'schedule')) {
        assert.ok(!String(checkout.with?.ref ?? '').includes('develop'), `${name} still spells develop`)
        continue
      }
      reading.push(name)
      assert.equal(
        template(checkout.with?.ref, scheduled),
        name === 'plan' ? 'develop' : A,
        `${name} must check out ${name === 'plan' ? 'develop' : 'the pinned commit'} on the nightly`
      )
    }
  }
  assert.deepEqual(
    reading.sort(),
    ['plan', ...CONSUMERS].sort(),
    'the jobs that check out a tree on the nightly'
  )
  for (const name of CONSUMERS) {
    assert.ok(jobs[name].needs.includes('plan'), `${name} must wait for plan's commit`)
    assert.equal(checkouts(name).length, 1)
  }
})

test('nightly: an empty or malformed pinned commit is refused before any consumer checks out', () => {
  for (const name of CONSUMERS) {
    const refuse = stepNamed(name, REFUSE)
    assert.ok(refuse, `${name} needs the refusal step`)
    const steps = jobs[name].steps
    assert.ok(
      steps.indexOf(refuse) < steps.indexOf(checkouts(name)[0]),
      `${name}: refusal comes before checkout`
    )
    assert.equal(refuse.env.NIGHTLY_SHA, '${{ needs.plan.outputs.checkout_sha }}')
    assert.equal(runs(refuse, contextOf({ event: 'schedule', results: { plan: 'success' } })), true)

    const s = scratch({ commits: -1 })
    for (const [label, value] of Object.entries(MALFORMED)) {
      const done = runStep(refuse, { cwd: s.dir, env: { NIGHTLY_SHA: value } })
      assert.notEqual(done.status, 0, `${name}: ${label} must be refused — ${done.text}`)
    }
    assert.notEqual(runStep(refuse, { cwd: s.dir }).status, 0, `${name}: an unset value must be refused`)
    const good = runStep(refuse, { cwd: s.dir, env: { NIGHTLY_SHA: A } })
    assert.equal(good.status, 0, good.text)
    assert.ok(good.text.includes(`nightly tree: plan selected ${A}`))
  }
})

test('nightly: develop advancing after plan moves no consumer, and a different checkout is red', () => {
  const s = scratch({ commits: 1 })
  const env = { GITHUB_OUTPUT: s.output, GITHUB_STEP_SUMMARY: s.summary }
  assert.equal(runStep(stepNamed('plan', PIN), { cwd: s.repo, env }).status, 0)
  const pinned = published(s.output)
  assert.match(pinned ?? '', /^[0-9a-f]{40}$/)

  // develop takes another merge while the run is in flight.
  git(s.repo, 'commit', '-q', '--allow-empty', '-m', 'merged after plan')
  const moved = git(s.repo, 'rev-parse', 'develop')
  assert.notEqual(moved, pinned)

  for (const name of CONSUMERS) {
    const ref = template(checkouts(name)[0].with.ref, contextOf({ event: 'schedule', sha: pinned }))
    assert.equal(ref, pinned, `${name} asks checkout for the pinned commit, not the branch`)
    const check = stepNamed(name, ASSERT)
    assert.ok(check, `${name} needs the equality step`)
    const steps = jobs[name].steps
    assert.equal(
      steps.indexOf(check),
      steps.indexOf(checkouts(name)[0]) + 1,
      `${name}: asserted right after checkout`
    )
    assert.equal(check.env.NIGHTLY_SHA, '${{ needs.plan.outputs.checkout_sha }}')
    assert.equal(runs(check, contextOf({ event: 'schedule', results: { plan: 'success' } })), true)

    git(s.repo, 'checkout', '-q', '--detach', ref)
    const same = runStep(check, { cwd: s.repo, env: { NIGHTLY_SHA: pinned } })
    assert.equal(same.status, 0, same.text)
    assert.ok(
      same.text.includes(`nightly tree: checked out ${pinned}`),
      `${name} reports the commit it holds`
    )

    // What a second read of the branch would have produced.
    git(s.repo, 'checkout', '-q', 'develop')
    const other = runStep(check, { cwd: s.repo, env: { NIGHTLY_SHA: pinned } })
    assert.notEqual(other.status, 0, `${name}: a different HEAD must be red`)
    assert.ok(other.text.includes(`nightly tree: checked out ${moved}`), `${name} names the commit it found`)

    for (const [label, value] of Object.entries(MALFORMED)) {
      assert.notEqual(
        runStep(check, { cwd: s.repo, env: { NIGHTLY_SHA: value } }).status,
        0,
        `${name}: ${label}`
      )
    }
    assert.notEqual(runStep(check, { cwd: s.repo }).status, 0, `${name}: unset pinned commit`)
    assert.notEqual(
      runStep(check, { cwd: s.dir, env: { NIGHTLY_SHA: pinned } }).status,
      0,
      `${name}: no repository`
    )
  }
})

// ── prerequisites: which jobs start, per event ───────────────────────────────────────────────────

test('nightly: exactly one dsh job runs per event, and the nightly one is dsh-lib step for step', () => {
  const nightly = jobs['dsh-lib-nightly']
  assert.ok(nightly, 'the nightly needs its own dsh job')
  assert.deepEqual(nightly.needs, ['plan'])
  // The pull-request job must not be serialised behind plan.
  assert.equal(jobs['dsh-lib'].needs, undefined)

  for (const event of EVENTS) {
    for (const draft of event === 'pull_request' ? [false, true] : [false]) {
      const original = runs(jobs['dsh-lib'], contextOf({ event, draft }))
      const planned = runs(jobs.plan, contextOf({ event, draft }))
      const copy = runs(
        nightly,
        contextOf({ event, draft, results: { plan: planned ? 'success' : 'skipped' } })
      )
      assert.equal(original, event !== 'schedule' && !draft, `dsh-lib on ${event} draft=${String(draft)}`)
      assert.equal(copy, event === 'schedule', `dsh-lib-nightly on ${event} draft=${String(draft)}`)
      assert.ok(!(original && copy), 'never both: no event gets an extra runner')
    }
  }
  for (const plan of RESULTS.filter((r) => r !== 'success')) {
    assert.equal(runs(nightly, contextOf({ event: 'schedule', results: { plan } })), false, `plan ${plan}`)
  }

  // Same machine class, same budget, same steps — only the two guards and the pinned ref differ.
  // `dsh-lib` may also run GitHub-hosted (`ci:hosted`, pull requests only): its self-hosted list is compared.
  const labels = (job) =>
    runnerPaths(job['runs-on']).selfHosted.map((l) => template(l, contextOf({ event: 'schedule' })))
  assert.deepEqual(labels(nightly), labels(jobs['dsh-lib']))
  assert.equal(nightly['timeout-minutes'], jobs['dsh-lib']['timeout-minutes'])
  const shared = nightly.steps
    .filter((s) => s.name !== REFUSE && s.name !== ASSERT)
    .map((s) =>
      String(s.uses ?? '').startsWith('actions/checkout@') ? { ...s, with: { ...s.with, ref: undefined } } : s
    )
  const original = jobs['dsh-lib'].steps.map((s) =>
    String(s.uses ?? '').startsWith('actions/checkout@') ? { ...s, with: { ...s.with, ref: undefined } } : s
  )
  assert.deepEqual(shared, original)
  // Unconditional here: the job itself only exists on the nightly.
  assert.equal(stepNamed('dsh-lib-nightly', REFUSE).if, undefined)
  assert.equal(stepNamed('dsh-lib-nightly', ASSERT).if, undefined)
  assert.equal(checkouts('dsh-lib-nightly')[0].with.ref, '${{ needs.plan.outputs.checkout_sha }}')
})

test('nightly: the rows start only behind a green plan and the green dsh job of their own event', () => {
  const job = jobs['build-check']
  assert.deepEqual([...job.needs].sort(), ['dsh-lib', 'dsh-lib-nightly', 'plan'])
  let started = 0
  for (const event of EVENTS) {
    for (const draft of event === 'pull_request' ? [false, true] : [false]) {
      for (const cancelled of [false, true]) {
        for (const plan of RESULTS) {
          for (const dsh of RESULTS) {
            for (const dshNightly of RESULTS) {
              const results = { plan, 'dsh-lib': dsh, 'dsh-lib-nightly': dshNightly }
              const mine = event === 'schedule' ? dshNightly : dsh
              const other = event === 'schedule' ? dsh : dshNightly
              const expected =
                !cancelled && !draft && plan === 'success' && mine === 'success' && other === 'skipped'
              const got = runs(job, contextOf({ event, draft, cancelled, results }))
              assert.equal(
                got,
                expected,
                `${event} draft=${String(draft)} cancelled=${String(cancelled)} ${JSON.stringify(results)}`
              )
              if (got) started++
            }
          }
        }
      }
    }
  }
  // One combination per event starts the rows: the table above is not vacuous.
  assert.equal(started, EVENTS.length)
  // The rows are still the planner's, every verdict still reported.
  assert.equal(job.strategy.matrix, '${{ fromJSON(needs.plan.outputs.matrix) }}')
  assert.equal(job.strategy['fail-fast'], false)
})

test('pull requests and manual runs check out the event ref and skip the nightly guards', () => {
  for (const event of ['pull_request', 'workflow_dispatch']) {
    // Even if a commit id were somehow published, no job outside the nightly may use it.
    const context = contextOf({
      event,
      sha: A,
      results: { plan: 'success', 'dsh-lib': 'success', 'dsh-lib-nightly': 'skipped' }
    })
    for (const name of ['dsh-lib', 'plan', 'build-check']) {
      for (const checkout of checkouts(name)) {
        assert.equal(
          template(checkout.with?.ref, context),
          '',
          `${name} on ${event}: empty ref = the event's own`
        )
      }
    }
    for (const guard of [REFUSE, ASSERT]) {
      const step = stepNamed('build-check', guard)
      if (step) assert.equal(runs(step, context), false, `${guard} must not run on ${event}`)
    }
    assert.equal(runs(jobs['nightly-report'], context), false)
  }
  // The lane: production runners only for a manual run on main; pull requests (into main too) and
  // the nightly take the dev lane (docs/references/public-repo-ci.md).
  const lane = (context) => template(runnerPaths(jobs['build-check']['runs-on']).selfHosted.at(-1), context)
  assert.equal(lane(contextOf({ event: 'pull_request', baseRef: 'main' })), 'tracy-lane-dev')
  const dispatchOnMain = contextOf({ event: 'workflow_dispatch' })
  dispatchOnMain.github.ref_name = 'main'
  assert.equal(lane(dispatchOnMain), 'tracy-lane-prod')
  assert.equal(lane(contextOf({ event: 'pull_request', baseRef: 'develop' })), 'tracy-lane-dev')
  assert.equal(lane(contextOf({ event: 'schedule' })), 'tracy-lane-dev')
  assert.equal(workflow.concurrency['cancel-in-progress'], "${{ github.event_name == 'pull_request' }}")
})

test('GitHub-hosted only for a pull request labelled ci:hosted; the nightly and manual runs stay on our runners', () => {
  const labelled = (names) => {
    const context = contextOf({ event: 'pull_request' })
    context.github.event.pull_request.labels = names.map((name) => ({ name }))
    return context
  }
  const hostedJobs = Object.entries(jobs).filter(([, job]) => runnerPaths(job['runs-on']).condition !== null)
  assert.deepEqual(hostedJobs.map(([name]) => name).sort(), [
    'build-check',
    'dsh-lib',
    'new-test-proof',
    'plan',
    'suite-skipped',
    'test-growth'
  ])
  for (const [name, job] of hostedJobs) {
    const { condition } = runnerPaths(job['runs-on'])
    for (const [label, context] of [
      ['the nightly', contextOf({ event: 'schedule' })],
      ['a manual run', contextOf({ event: 'workflow_dispatch' })],
      ['an unlabelled pull request', contextOf({ event: 'pull_request' })],
      ['a pull request labelled ci:aws-only', labelled(['ci:aws-only'])]
    ])
      assert.equal(truthy(evaluate(condition, context)), false, `${name} on ${label}`)
    assert.equal(truthy(evaluate(condition, labelled(['ci:e2e', 'ci:hosted']))), true, name)
  }
  // The PostgreSQL service starts with the same label, and only with it: an empty image starts none.
  const image = jobs['build-check'].services.postgres.image
  assert.equal(template(image, contextOf({ event: 'schedule' })), '')
  assert.equal(template(image, contextOf({ event: 'pull_request' })), '')
  assert.equal(template(image, labelled(['ci:hosted'])), 'postgres:16-alpine')
})

// ── the verdict ──────────────────────────────────────────────────────────────────────────────────

test('nightly: the verdict is green only for a green plan, dsh job and rows on a valid pinned commit', () => {
  const report = jobs['nightly-report']
  const [step] = report.steps
  assert.deepEqual([...report.needs].sort(), ['build-check', 'dsh-lib-nightly', 'plan'])
  assert.deepEqual(step.env, {
    RESULT: '${{ needs.build-check.result }}',
    PLAN: '${{ needs.plan.result }}',
    DSH: '${{ needs.dsh-lib-nightly.result }}',
    SELECTED_SHA: '${{ needs.plan.outputs.checkout_sha }}'
  })
  // It reports whatever happened upstream, on the nightly only.
  for (const result of RESULTS) {
    for (const cancelled of [false, true]) {
      const results = { plan: result, 'dsh-lib-nightly': result, 'build-check': result }
      assert.equal(runs(report, contextOf({ event: 'schedule', cancelled, results })), true)
      assert.equal(runs(report, contextOf({ event: 'pull_request', cancelled, results })), false)
    }
  }

  const verdict = (env) => {
    const s = scratch({ commits: -1 })
    const done = runStep(step, { cwd: s.dir, env: { GITHUB_STEP_SUMMARY: s.summary, ...env } })
    return { ...done, summary: read(s.summary) }
  }
  const green = { PLAN: 'success', DSH: 'success', RESULT: 'success', SELECTED_SHA: A }
  const ok = verdict(green)
  assert.equal(ok.status, 0, ok.text)
  assert.match(ok.summary, /green/)
  assert.ok(ok.summary.includes(A), 'the green claim names its commit')

  const red = (label, env) => {
    const done = verdict(env)
    assert.notEqual(done.status, 0, `${label} must be red — ${done.text}`)
    assert.doesNotMatch(done.summary, /green/, `${label}: no green claim`)
    assert.match(done.summary, /RED/, `${label}: announced`)
    assert.match(done.text, /::error::/, `${label}: annotated`)
  }
  // Every prerequisite, every way it can be other than green — including a status nobody knows.
  for (const key of ['PLAN', 'DSH', 'RESULT']) {
    for (const result of ['failure', 'cancelled', 'skipped', '', 'neutral', 'SUCCESS', 'success ']) {
      red(`${key}=${JSON.stringify(result)}`, { ...green, [key]: result })
    }
  }
  for (const [label, value] of Object.entries(MALFORMED))
    red(`pinned commit ${label}`, { ...green, SELECTED_SHA: value })

  // A variable the runner did not hand over, or a summary that cannot be written, is not green.
  for (const key of Object.keys(green)) {
    const done = verdict(Object.fromEntries(Object.entries(green).filter(([k]) => k !== key)))
    assert.notEqual(done.status, 0, `${key} unset`)
    assert.doesNotMatch(done.summary, /green/)
  }
  const s = scratch({ commits: -1 })
  for (const summary of [join(s.dir, 'no-such-directory', 'summary'), s.dir]) {
    const done = runStep(step, { cwd: s.dir, env: { ...green, GITHUB_STEP_SUMMARY: summary } })
    assert.notEqual(done.status, 0, `green with an unwritable summary must fail: ${summary}`)
  }
  assert.notEqual(runStep(step, { cwd: s.dir, env: green }).status, 0, 'no summary variable')
})

// ── the evaluator itself: it must refuse, not guess ──────────────────────────────────────────────

test('the expression evaluator follows the documented rules and refuses what it does not know', () => {
  const context = contextOf({ event: 'schedule', results: { plan: 'success' }, sha: A })
  assert.equal(evaluate("github.event_name == 'schedule' && 'develop' || ''", context), 'develop')
  assert.equal(evaluate("github.event_name == 'pull_request' && 'develop' || ''", context), '')
  assert.equal(
    evaluate("github.event_name == 'schedule' && needs.plan.outputs.checkout_sha || ''", context),
    A
  )
  assert.equal(evaluate("needs.plan.result == 'SUCCESS'", context), true, 'string comparison ignores case')
  assert.equal(evaluate('github.event.pull_request.draft == false', context), true, 'null compares as 0')
  assert.equal(evaluate("!cancelled() && (needs.plan.result != 'success' || true)", context), true)
  assert.equal(evaluate("needs.nobody.result == 'success'", context), false)
  const labelled = { github: { event: { pull_request: { labels: [{ name: 'CI:AWS-ONLY' }] } } } }
  const aws = "contains(github.event.pull_request.labels.*.name, 'ci:aws-only') && 'X64' || 'linux'"
  assert.equal(evaluate(aws, labelled), 'X64', 'contains() over an object filter, ignoring case')
  assert.equal(evaluate(aws, context), 'linux', 'no pull request labels: the element is linux again')
  for (const bad of [
    'a ? b : c',
    'startsWith(a, b)',
    "format('{0}', a)",
    'a == ',
    '(a',
    'a b',
    'a > 1',
    'nobody()'
  ]) {
    assert.throws(() => evaluate(bad, context), bad)
  }
  assert.throws(() => template('refs/${{ github.ref_name }}', context))
  // Without a status function a job waits for every need — the rule build-check has to override.
  assert.equal(
    runs(
      { if: "github.event_name == 'schedule'" },
      contextOf({ event: 'schedule', results: { plan: 'skipped' } })
    ),
    false
  )
  assert.equal(runs({}, contextOf({ event: 'schedule', results: { plan: 'failure' } })), false)
})
