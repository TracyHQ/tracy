/**
 * The workflow rules that keep fork code off the team's runners (docs/references/public-repo-ci.md).
 *
 * Every pull-request job runs on a GitHub-hosted runner (since 27/10/2026), the same job for a branch
 * of this repository and for a fork; a step that reads a secret is guarded to this repository's
 * branches; no checkout keeps a credential; every action from another repository is pinned to a commit.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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

// GitHub-hosted runner images a job may ask for; never a team runner label.
const HOSTED = /^(ubuntu-latest|ubuntu-24\.04|ubuntu-24\.04-arm)$/
const steps = (job) => job.steps ?? []
// The local actions that run `node` themselves.
const NODE_ACTIONS = ['./.github/actions/dsh-lib', './.github/actions/turbo-cache']
const usesNode = (step) =>
  /(^|[\s;&|(])(node|pnpm|npx|corepack)\s/m.test(String(step.run ?? '')) ||
  NODE_ACTIONS.includes(String(step.uses))
const setsUpNode = (step) =>
  String(step.uses ?? '').startsWith('actions/setup-node@') || step.uses === './.github/actions/node-pnpm'

test('every job of a pull-request workflow runs on a GitHub-hosted runner', () => {
  // Since 27/10/2026: the team's self-hosted runners take no pull-request code at all.
  for (const { file, doc } of prWorkflows)
    for (const [name, job] of Object.entries(doc.jobs)) {
      const labels = labelsOf(job)
      assert.equal(labels.length, 1, `${file} › ${name}: ${labels.join(', ')}`)
      assert.match(labels[0], HOSTED, `${file} › ${name}`)
    }
})

test('each gate is one job: a fork runs the same job, there is no fork twin', () => {
  for (const { file, doc } of prWorkflows)
    for (const [name, job] of Object.entries(doc.jobs)) {
      assert.doesNotMatch(String(job.name ?? name), /\(fork\)$/, `${file} › ${name}`)
      assert.ok(
        !String(job.if ?? '').includes('full_name != github.repository'),
        `${file} › ${name}: a fork-only job`
      )
    }
})

test('a step that reads a secret never runs for a fork pull request', () => {
  // GitHub hands a fork's `pull_request` run no secret anyway; the guard keeps that true by reading,
  // not by trusting the platform, and keeps a step from failing on an empty value.
  let guarded = 0
  for (const { file, doc } of prWorkflows)
    for (const [name, job] of Object.entries(doc.jobs))
      for (const step of steps(job)) {
        const text = JSON.stringify(step).replaceAll('secrets.GITHUB_TOKEN', '')
        if (!text.includes('secrets.')) continue
        guarded++
        const cond = `${String(job.if ?? '')} ${String(step.if ?? '')}`
        assert.ok(cond.includes(SAME_REPO), `${file} › ${name} › ${step.name}: needs ${SAME_REPO}`)
      }
  assert.ok(guarded >= 3, `only ${guarded} secret-reading steps found`)
})

test('a checkout in a pull-request workflow keeps no credential', () => {
  for (const { file, doc } of prWorkflows)
    for (const [name, job] of Object.entries(doc.jobs))
      for (const step of steps(job))
        if (String(step.uses ?? '').startsWith('actions/checkout@'))
          assert.equal(step.with?.['persist-credentials'], false, `${file} › ${name} › ${step.name}`)
})

test('a GitHub-hosted job sets up the Node of .node-version before it runs node or pnpm', () => {
  let checked = 0
  for (const { file, doc } of workflows)
    for (const [name, job] of Object.entries(doc.jobs)) {
      if (labelsOf(job).includes('self-hosted')) continue
      const first = steps(job).findIndex(usesNode)
      if (first === -1) continue
      checked++
      const setup = steps(job).findIndex(setsUpNode)
      assert.ok(setup !== -1 && setup < first, `${file} › ${name}: node runs before it is set up`)
      const step = steps(job)[setup]
      if (step.uses !== './.github/actions/node-pnpm')
        assert.match(String(step.with?.['node-version-file']), /(^|\/)\.node-version$/, `${file} › ${name}`)
    }
  assert.ok(checked >= 15, `only ${checked} GitHub-hosted node jobs found`)
})

test('no job of a pull-request workflow names a runner lane', () => {
  for (const { file, text } of prWorkflows) assert.doesNotMatch(text, /tracy-lane-(dev|prod)/, file)
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
