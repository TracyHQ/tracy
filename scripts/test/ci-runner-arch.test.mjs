/**
 * Which jobs may land on an arm64 runner — pinned since 11/10/2026.
 *
 * The check and light pools mix the AWS amd64 runners with two arm64 Mac runners (Linux
 * containers running natively, `TracyHQ/tracy-runners` hosts.tsv). So a job carrying
 * `tracy-check` or `tracy-light` must NOT ask for `x64` — or the Macs never get it and the pool
 * is three runners smaller than the fleet says — while every build, deploy and image job MUST keep
 * `x64`: those produce or run amd64 images on amd64 hosts.
 *
 * A `runs-on` label nobody carries does not go red, it queues silently; this is the cheapest place
 * to catch a new job that copies the wrong line.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { load } from 'js-yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DIR = join(ROOT, '.github/workflows')

/** Every job's `runs-on`, as one string per label, across every workflow file. */
const jobs = readdirSync(DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .flatMap((file) =>
    Object.entries(load(readFileSync(join(DIR, file), 'utf8')).jobs ?? {}).map(([name, job]) => ({
      where: `${file} › ${name}`,
      labels: [job['runs-on']].flat().map(String)
    }))
  )
  .filter((j) => j.labels.includes('self-hosted'))

// `build-check` asks for `${{ matrix.label }}`, and `scripts/ci/plan-ci.mjs` fills it with `tracy-check`.
const POOLED = /tracy-check|tracy-light|matrix\.label/
const PINNED = /tracy-build|tracy-dev\b|tracy-prod\b|tracy-staging|tracy-demo-/

test('the workflows were read', () => {
  assert.ok(jobs.length > 10, `only ${jobs.length} self-hosted jobs found`)
  assert.ok(jobs.some((j) => POOLED.test(j.labels.join(' '))))
  assert.ok(jobs.some((j) => PINNED.test(j.labels.join(' '))))
})

test('check and light jobs do not ask for x64, so the arm64 Mac runners can take them', () => {
  for (const { where, labels } of jobs.filter((j) => POOLED.test(j.labels.join(' ')))) {
    assert.ok(!labels.includes('x64'), `${where}: [${labels.join(', ')}]`)
    assert.deepEqual(labels.slice(0, 2), ['self-hosted', 'linux'], where)
  }
})

test('build, deploy and image jobs keep x64', () => {
  for (const { where, labels } of jobs.filter((j) => !POOLED.test(j.labels.join(' ')))) {
    assert.ok(
      PINNED.test(labels.join(' ')),
      `${where}: a self-hosted job in neither group — classify it here`
    )
    assert.ok(labels.includes('x64'), `${where}: [${labels.join(', ')}]`)
  }
})
