/**
 * The workflow rules that keep fork code off the team's runners (docs/references/public-repo-ci.md).
 *
 * A pull request from a branch of this repository runs on the self-hosted runners as before; one
 * from a fork runs only GitHub-hosted jobs with a read-only token and no secret; no pull-request job
 * asks for the production lane; the jobs holding a write token run GitHub-hosted; every action from
 * another repository is pinned to a commit.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { load } from 'js-yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const WORKFLOWS = join(ROOT, '.github/workflows')
const ACTIONS = join(ROOT, '.github/actions')
const SAME_REPO = 'github.event.pull_request.head.repo.full_name == github.repository'

const workflows = readdirSync(WORKFLOWS)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .map((file) => {
    const text = readFileSync(join(WORKFLOWS, file), 'utf8')
    return { file, text, doc: load(text) }
  })

const triggers = (doc) => Object.keys(doc.on ?? doc[true] ?? {})
const prWorkflows = workflows.filter((w) =>
  triggers(w.doc).some((t) => t === 'pull_request' || t === 'pull_request_target')
)
const labelsOf = (job) => [job['runs-on']].flat().map(String)

test('the pull-request workflows were read', () => {
  const names = prWorkflows.map((w) => w.file).sort()
  for (const file of [
    'branch-fresh-check.yml',
    'changelog-check.yml',
    'ci-before-merge.yml',
    'ci-label-rerun.yml',
    'language-policy.yml',
    'pr-description-check.yml',
    'regression-check.yml',
    'tracy-ci.yml'
  ])
    assert.ok(names.includes(file), file)
})

test('a self-hosted job of a pull-request workflow runs only for branches of this repository', () => {
  for (const { file, doc } of prWorkflows)
    for (const [name, job] of Object.entries(doc.jobs)) {
      if (!labelsOf(job).includes('self-hosted')) continue
      const cond = String(job.if ?? '')
      // The nightly-only jobs never see a pull request; every other one must name the guard itself.
      assert.ok(
        cond.includes(SAME_REPO) || /^(always\(\) && )?github\.event_name == 'schedule'$/.test(cond),
        `${file} › ${name}: if must require ${SAME_REPO}`
      )
    }
})

test('no pull-request job asks for the production lane', () => {
  for (const { file, doc } of prWorkflows)
    for (const [name, job] of Object.entries(doc.jobs)) {
      for (const label of labelsOf(job)) {
        if (!label.includes('tracy-lane-prod')) continue
        assert.ok(!label.includes('base_ref'), `${file} › ${name}: lane follows the PR base: ${label}`)
        assert.match(
          label,
          /github\.event_name == '(push|workflow_dispatch)'/,
          `${file} › ${name}: the production lane only for a push or a manual run`
        )
      }
    }
})

test('every fork job is GitHub-hosted, read-only, keeps no credential and reads no secret', () => {
  let forkJobs = 0
  for (const { file, doc, text } of prWorkflows)
    for (const [name, job] of Object.entries(doc.jobs)) {
      const cond = String(job.if ?? '')
      if (!cond.includes('github.event.pull_request.head.repo.full_name != github.repository')) continue
      forkJobs++
      assert.deepEqual(labelsOf(job), ['ubuntu-latest'], `${file} › ${name}`)
      // CodeQL asks to upload its results; GitHub caps a fork pull request's token at read anyway.
      const allowed =
        file === 'codeql.yml'
          ? { contents: 'read', 'security-events': 'write', actions: 'read' }
          : { contents: 'read' }
      assert.deepEqual(job.permissions, allowed, `${file} › ${name}`)
      for (const step of job.steps ?? []) {
        if (String(step.uses ?? '').startsWith('actions/checkout@'))
          assert.equal(step.with?.['persist-credentials'], false, `${file} › ${name}: checkout`)
        assert.ok(!JSON.stringify(step).includes('secrets.'), `${file} › ${name}: ${step.name}`)
      }
      assert.ok(text.includes(`name: ${job.name}`), `${file} › ${name}`)
    }
  assert.ok(forkJobs >= 6, `only ${forkJobs} fork jobs found`)
})

test('the jobs holding a write token run on GitHub-hosted runners, never beside pull-request code', () => {
  // The self-hosted runners are persistent and run pull-request jobs; a token there could be read.
  for (const [file, name] of [
    ['auto-merge-develop.yml', 'merge'],
    ['ci-label-rerun.yml', 'rerun']
  ]) {
    const job = workflows.find((w) => w.file === file).doc.jobs[name]
    assert.deepEqual(labelsOf(job), ['ubuntu-latest'], `${file} › ${name}`)
    for (const step of job.steps.filter((s) => String(s.uses ?? '').startsWith('actions/checkout@')))
      assert.equal(step.with?.['persist-credentials'], false, `${file} › ${name}: checkout`)
  }
})

test('every action from another repository is pinned to a full commit id', () => {
  const files = [
    ...workflows.map((w) => ({ file: w.file, text: w.text })),
    ...readdirSync(ACTIONS).map((dir) => ({
      file: `actions/${dir}`,
      text: readFileSync(join(ACTIONS, dir, 'action.yml'), 'utf8')
    }))
  ]
  for (const { file, text } of files)
    for (const [, ref] of text.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)) {
      if (ref.startsWith('./')) continue
      assert.match(ref, /@[0-9a-f]{40}$/, `${file}: ${ref}`)
    }
})

test('English policy reads trusted base code and scans fork Git data without running it', () => {
  const { doc } = workflows.find((w) => w.file === 'language-policy.yml')
  const job = doc.jobs['language-policy']
  assert.equal(job.name, 'language-policy')
  assert.equal(job.if, undefined, 'drafts, forks and every contributor must be checked')
  assert.deepEqual(labelsOf(job), ['ubuntu-latest'])
  assert.deepEqual(job.permissions, { contents: 'read' })
  const trigger = doc.on.pull_request
  assert.equal(trigger.paths, undefined, 'no file filter may skip the required check')
  assert.equal(trigger['paths-ignore'], undefined)
  for (const event of ['opened', 'edited', 'synchronize', 'reopened'])
    assert.ok(trigger.types.includes(event), event)
  const checkouts = job.steps.filter((s) => s.uses?.startsWith('actions/checkout@'))
  assert.equal(checkouts.length, 2)
  assert.equal(checkouts[0].with.ref, '${{ github.event.pull_request.base.sha }}')
  assert.equal(checkouts[0].with.path, 'trusted')
  assert.equal(checkouts[1].with.ref, '${{ github.event.pull_request.head.sha }}')
  assert.equal(checkouts[1].with.path, 'candidate')
  assert.equal(checkouts[1].with['fetch-depth'], 0)
  for (const step of job.steps) {
    assert.ok(!JSON.stringify(step).includes('secrets.'))
    if (checkouts.includes(step)) {
      assert.equal(step.with['persist-credentials'], false)
      assert.equal(step.with.submodules, false)
    }
    if (step.uses) assert.match(step.uses, /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/)
  }
  const commands = job.steps.filter((s) => s.run)
  assert.equal(commands.length, 1)
  assert.match(commands[0].run, /^node trusted\/scripts\/check-language-policy\.mjs\s+--repo candidate /)
  assert.ok(commands[0].run.includes('--event "$GITHUB_EVENT_PATH"'))
  assert.equal(commands[0].env.BASE, '${{ github.event.pull_request.base.sha }}')
  assert.equal(commands[0].env.HEAD, '${{ github.event.pull_request.head.sha }}')
})

/**
 * Evaluate a GitHub Actions expression (the `${{ }}` body or a bare `if:`) against a context. Only
 * what `codeql.yml` uses: context paths, '…' strings, ==, !=, !, &&, || (both returning an operand,
 * as in Actions), parentheses and format(). Actions compares strings case-insensitively; the values
 * here are all lower-case, so plain equality is enough.
 */
function evaluate(expr, ctx) {
  const js = expr.replace(/'(?:[^']|'')*'|[A-Za-z_][\w-]*(?:\.[\w-]+)*|==|!=/g, (tok) => {
    if (tok.startsWith("'")) return JSON.stringify(tok.slice(1, -1).replaceAll("''", "'"))
    if (tok === '==') return '==='
    if (tok === '!=') return '!=='
    if (tok === 'format') return 'format'
    const [head, ...rest] = tok.split('.')
    return `ctx[${JSON.stringify(head)}]` + rest.map((k) => `?.[${JSON.stringify(k)}]`).join('')
  })
  const format = (f, ...args) => f.replace(/\{(\d+)\}/g, (_, n) => String(args[n]))
  return new Function('ctx', 'format', `return (${js})`)(ctx, format)
}

/** A template string with `${{ }}` parts, as GitHub renders it. */
const render = (text, ctx) => text.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, e) => String(evaluate(e, ctx) ?? ''))

test('the expression helper reads like Actions', () => {
  const ctx = { github: { event: { action: 'edited', changes: {} }, run_id: 7 } }
  assert.equal(evaluate("github.event.action == 'edited' && !github.event.changes.base", ctx), true)
  assert.equal(evaluate("github.event.changes.base || 'x'", ctx), 'x')
  assert.equal(render("a-${{ format('-{0}', github.run_id) }}", ctx), 'a--7')
})

/** The `github` context of one event, enough for `codeql.yml`'s conditions. */
function event({
  name = 'pull_request',
  action = 'synchronize',
  base = 'develop',
  fork = false,
  changes
} = {}) {
  const repo = 'TracyHQ/tracy'
  const pr = name === 'pull_request'
  return {
    github: {
      event_name: name,
      repository: repo,
      ref: pr ? 'refs/pull/9/merge' : `refs/heads/${base}`,
      base_ref: pr ? base : '',
      run_id: 1234,
      event: {
        action: pr ? action : undefined,
        changes,
        pull_request: pr
          ? { number: 9, head: { repo: { full_name: fork ? 'someone/tracy' : repo } } }
          : undefined
      }
    }
  }
}

test('CodeQL: forks and pull requests into main scan everything, team pull requests into develop stay incremental', () => {
  const { doc } = workflows.find((w) => w.file === 'codeql.yml')
  assert.deepEqual(triggers(doc).sort(), ['pull_request', 'push', 'schedule'])
  // A pull request into any base gets a result; `edited` catches a retarget without a new commit.
  assert.equal(doc.on.pull_request.branches, undefined, 'no base filter on pull requests')
  assert.ok(doc.on.pull_request.types.includes('edited'))
  const { analyze, 'analyze-full': full, 'dependency-review': review } = doc.jobs
  const initOf = (job) => job.steps.find((s) => String(s.uses).startsWith('github/codeql-action/init@'))
  // The overlay-base cache key carries the job id and the matrix: one job, one matrix, every event.
  assert.equal(initOf(analyze).with['config-file'], './.github/codeql/codeql-config.yml')
  assert.equal(initOf(full).with['config-file'], undefined, 'the full scan reads no exclusions')
  assert.equal(initOf(full).with.config, undefined)
  assert.deepEqual(full.strategy.matrix, analyze.strategy.matrix)

  const runs = (ctx) =>
    Object.entries({ analyze, full, review })
      .filter(([, job]) => evaluate(job.if, ctx))
      .map(([id]) => id)
  const retarget = { base: { ref: { from: 'develop' } } }
  const cases = [
    [{ name: 'push', base: 'develop' }, ['analyze']],
    [{ name: 'push', base: 'main' }, ['analyze']],
    [{ name: 'schedule', base: 'main' }, ['analyze']],
    [{ base: 'develop' }, ['analyze', 'review']],
    [{ base: 'develop', action: 'opened' }, ['analyze', 'review']],
    [{ base: 'main' }, ['full', 'review']],
    [{ base: 'feat/stacked' }, ['full', 'review']],
    [{ base: 'develop', fork: true }, ['full', 'review']],
    [{ base: 'main', fork: true }, ['full', 'review']],
    // A retarget develop -> main starts the full scan; main -> develop the filtered one.
    [{ base: 'main', action: 'edited', changes: retarget }, ['full', 'review']],
    [
      { base: 'develop', action: 'edited', changes: { base: { ref: { from: 'main' } } } },
      ['analyze', 'review']
    ],
    // A title or body edit runs nothing.
    [{ base: 'main', action: 'edited', changes: { body: { from: 'old' } } }, []],
    [{ base: 'develop', action: 'edited', changes: { title: { from: 'old' } } }, []],
    [{ base: 'develop', action: 'edited', fork: true, changes: { body: { from: 'old' } } }, []]
  ]
  for (const [e, want] of cases) assert.deepEqual(runs(event(e)), want, JSON.stringify(e))

  // A retarget cancels the scan of the old base; a body edit cancels nothing.
  const group = (e) => render(doc.concurrency.group, event(e))
  assert.equal(group({ base: 'main', action: 'edited', changes: retarget }), group({ base: 'develop' }))
  assert.notEqual(group({ action: 'edited', changes: { body: { from: 'old' } } }), group({ base: 'develop' }))
  assert.equal(evaluate(doc.concurrency['cancel-in-progress'].slice(3, -2), event({ name: 'push' })), false)
  assert.equal(evaluate(doc.concurrency['cancel-in-progress'].slice(3, -2), event()), true)

  // Only paths-ignore: queries, packs or query-filters switch off overlay analysis for JavaScript.
  const config = load(readFileSync(join(ROOT, '.github/codeql/codeql-config.yml'), 'utf8'))
  assert.deepEqual(Object.keys(config).sort(), ['name', 'paths-ignore'])
})

/** A CodeQL `paths-ignore` pattern as a regular expression over repo-relative paths. */
const ignoreRe = (glob) =>
  new RegExp(
    '^' +
      glob
        .split(/(\*\*\/|\/\*\*$|\*\*|\*)/)
        .map((p) =>
          p === '**/'
            ? '(?:.*/)?'
            : p === '/**'
              ? '(?:/.*)?'
              : p === '**'
                ? '.*'
                : p === '*'
                  ? '[^/]*'
                  : p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        )
        .join('') +
      '(?:/|$)'
  )

test('CodeQL paths-ignore leaves out no entry point a wrangler config or a package.json names', () => {
  const { 'paths-ignore': globs } = load(readFileSync(join(ROOT, '.github/codeql/codeql-config.yml'), 'utf8'))
  const res = globs.map((g) => [g, ignoreRe(g)])
  assert.ok(ignoreRe('packages/**/test').test('packages/a/b/test/x.mjs'))
  assert.ok(ignoreRe('packages/cms/*/seed').test('packages/cms/t/seed/a.json'))
  assert.ok(!ignoreRe('packages/cms/*/seed').test('packages/cms/t/src/seed.ts'))
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 30 })
    .split('\n')
    .filter(Boolean)
  const strings = (v) =>
    typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []
  const entries = []
  for (const file of files) {
    const name = posix.basename(file)
    const dir = posix.dirname(file)
    if (name === 'package.json') {
      let pkg
      try {
        pkg = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
      } catch {
        continue
      }
      for (const key of ['main', 'module', 'browser', 'exports', 'bin'])
        for (const target of strings(pkg[key])) {
          if (target.includes(':')) continue
          const path = posix.join(dir, target)
          // A built entry (`dist/x.js`) ships its source (`src/x.ts`): judge both.
          entries.push([file, path], [file, path.replace(/\/(dist|lib)\//, '/src/')])
        }
    } else if (/^wrangler.*\.(toml|json|jsonc)$/.test(name)) {
      const text = readFileSync(join(ROOT, file), 'utf8')
      for (const [, main] of text.matchAll(/["']?main["']?\s*[:=]\s*["']([^"']+)["']/g))
        entries.push([file, posix.join(dir, main)])
    }
  }
  assert.ok(entries.length > 100, `only ${entries.length} entry points found`)
  for (const [from, path] of entries)
    for (const [glob, re] of res) assert.ok(!re.test(path), `${glob} hides ${path}, named by ${from}`)
})
