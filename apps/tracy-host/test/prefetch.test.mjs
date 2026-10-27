/**
 * `POST /_host/prefetch`: the first step of a live demo's update. It fetches and verifies the new
 * release into this host's cache and touches no site, so a download that fails (25/10/2026: a 403
 * on JA Boxing 1.0.4 after its old copy was already gone) costs nothing.
 */
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { signHostCall } from '../../tracy-web/src/host/client.js'
import { buildApp, keyedJobId } from '../src/app.js'

const secret = 'host-secret'
const entry = {
  platform: 'joomla',
  version: '1.0.4',
  installer: {
    file: 'q.zip',
    sha256: 'a'.repeat(64),
    bytes: 10,
    githubAssetId: 1,
    url: 'https://github.com/x'
  }
}
const TOKEN = `ghs_${'t'.repeat(36)}`

function memoryJobs() {
  const rows = new Map()
  return {
    rows,
    get: async (id) => rows.get(id) ?? null,
    put: async (id, fields) => {
      const next = { ...(rows.get(id) ?? { id }), ...fields }
      rows.set(id, next)
      return next
    }
  }
}

async function setup(result) {
  const logDir = await mkdtemp(join(tmpdir(), 'tracy-host-prefetch-'))
  const config = {
    hostName: 'local',
    hostSecret: secret,
    sitesRoot: process.cwd(),
    scriptsDir: '/opt/tracy-fleet',
    logDir
  }
  const runs = []
  const run = async (input) => {
    runs.push({ ...input, catalogue: JSON.parse(await readFile(input.env.TRACY_QUICKSTARTS_JSON, 'utf8')) })
    return result
  }
  const jobs = memoryJobs()
  const app = buildApp({ config, jobs, run })
  const post = async (body) => {
    const raw = JSON.stringify(body)
    return app.request('/_host/prefetch', {
      method: 'POST',
      headers: await signHostCall({ secret, path: '/_host/prefetch', body: raw }),
      body: raw
    })
  }
  return { post, runs, jobs }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

test('a prefetch runs quickstart.py --prefetch on the entry it was handed, the token in the environment only', async () => {
  const { post, runs, jobs } = await setup({ code: 0, tail: ['fetched and verified 1 part(s)'] })
  const res = await post({
    label: 'ja-boxing-joomla',
    quickstart: 'quickstart/ja-boxing/j6',
    quickstartEntry: entry,
    releasesToken: TOKEN,
    jobKey: 'demo:ja-boxing-joomla:prefetch:0123456789abcdef'
  })
  assert.equal(res.status, 202)
  const { jobId } = await res.json()
  assert.equal(jobId, keyedJobId('demo:ja-boxing-joomla:prefetch:0123456789abcdef'))
  await settle()
  assert.equal(runs.length, 1)
  const [ran] = runs
  assert.equal(ran.script, 'python3')
  assert.deepEqual(ran.args, [
    '/opt/tracy-fleet/provision/quickstart.py',
    '--id',
    'quickstart/ja-boxing/j6',
    '--prefetch'
  ])
  assert.ok(!ran.args.join(' ').includes(TOKEN), 'the token is never an argument')
  assert.equal(ran.env.TRACY_RELEASES_GITHUB_TOKEN, TOKEN)
  assert.deepEqual(ran.catalogue, { 'quickstart/ja-boxing/j6': entry })
  assert.equal((await jobs.get(jobId)).state, 'done')
})

test('a prefetch that fails keeps the sentence the script died on', async () => {
  const { post, jobs } = await setup({
    code: 1,
    tail: [
      '==> fetching q.zip',
      'quickstart download failed (HTTP 403): GitHub rate limit for the release credential is spent until 2026-10-25T09:05:13Z; press again after that'
    ]
  })
  const { jobId } = await (
    await post({ label: 'ja-boxing-joomla', quickstart: 'quickstart/ja-boxing/j6', quickstartEntry: entry })
  ).json()
  await settle()
  const job = await jobs.get(jobId)
  assert.equal(job.state, 'failed')
  assert.equal(job.step, 'prefetch')
  assert.match(job.output, /rate limit .* until 2026-10-25T09:05:13Z/)
})

test('a prefetch refuses a label that is a path, a tag that climbs out, and a body with no entry', async () => {
  const { post, runs } = await setup({ code: 0, tail: [] })
  for (const body of [
    { label: '../x', quickstart: 'quickstart/a/j6', quickstartEntry: entry },
    { label: 'x', quickstart: '../../etc/passwd', quickstartEntry: entry },
    { label: 'x', quickstart: 'quickstart/a/j6' },
    { label: 'x', quickstart: 'quickstart/a/j6', quickstartEntry: entry, releasesToken: 'short' }
  ]) {
    const res = await post(body)
    assert.equal(res.status, 400, JSON.stringify(body))
  }
  await settle()
  assert.equal(runs.length, 0)
})

test('two asks with one jobKey fetch once', async () => {
  const { post, runs } = await setup({ code: 0, tail: [] })
  const body = {
    label: 'x',
    quickstart: 'quickstart/a/j6',
    quickstartEntry: entry,
    jobKey: 'demo:x:prefetch:1234'
  }
  const [a, b] = await Promise.all([post(body), post(body)])
  assert.equal((await a.json()).jobId, (await b.json()).jobId)
  await settle()
  assert.equal(runs.length, 1)
})
