/**
 * The workflow rules that keep fork code off the team's runners (docs/references/public-repo-ci.md).
 *
 * A pull request from a branch of this repository runs on the self-hosted runners as before; one
 * from a fork runs only GitHub-hosted jobs with a read-only token and no secret; no pull-request job
 * asks for the production lane; every action from another repository is pinned to a commit.
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
      assert.deepEqual(job.permissions, { contents: 'read' }, `${file} › ${name}`)
      for (const step of job.steps ?? []) {
        if (String(step.uses ?? '').startsWith('actions/checkout@'))
          assert.equal(step.with?.['persist-credentials'], false, `${file} › ${name}: checkout`)
        assert.ok(!JSON.stringify(step).includes('secrets.'), `${file} › ${name}: ${step.name}`)
      }
      assert.ok(text.includes(`name: ${job.name}`), `${file} › ${name}`)
    }
  assert.ok(forkJobs >= 6, `only ${forkJobs} fork jobs found`)
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
