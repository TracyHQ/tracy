/**
 * Which jobs still run on the team's self-hosted runners — pinned since 27/10/2026.
 *
 * Every check, light and image-build job moved to GitHub-hosted runners when the repository went
 * public (docs/references/gates-ci-runners.md, Runners). What stays self-hosted is a job that must
 * run ON a deploy host (`tracy-dev`, `tracy-staging`, `tracy-prod`): deploys and that host's own
 * dispatch jobs. Those run amd64 images on amd64 hosts, so they keep `x64`.
 *
 * A `runs-on` label nobody carries does not go red, it queues silently; this is the cheapest place
 * to catch a new job that copies an old line asking for a retired pool.
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

const DEPLOY_HOST = /^(tracy-dev|tracy-staging|tracy-prod)$/
// Retired pools: no runner may be asked for them again.
const RETIRED = /tracy-check|tracy-light|tracy-build|tracy-lane-|matrix\.label/

test('the workflows were read', () => {
  assert.ok(jobs.length >= 5, `only ${jobs.length} self-hosted jobs found`)
})

test('a self-hosted job runs on exactly one deploy host, on x64', () => {
  for (const { where, labels } of jobs) {
    assert.deepEqual(labels.slice(0, 3), ['self-hosted', 'linux', 'x64'], where)
    assert.equal(labels.length, 4, `${where}: [${labels.join(', ')}]`)
    // The host may be an expression that picks one of the three (`build-web-images`).
    for (const host of labels[3].match(/tracy-[a-z]+/g) ?? [])
      assert.match(host, DEPLOY_HOST, `${where}: [${labels.join(', ')}]`)
  }
})

test('no job asks for a retired check, light, build or lane pool', () => {
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')))
    for (const [name, job] of Object.entries(load(readFileSync(join(DIR, file), 'utf8')).jobs ?? {}))
      assert.doesNotMatch([job['runs-on']].flat().map(String).join(' '), RETIRED, `${file} › ${name}`)
})
