import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
// The signing half, imported only here (and in auth.test.mjs) to prove a REAL signed call gets
// past the middleware this app wires — never a hand-typed header fixture.
import { signHostCall } from '../../tracy-web/src/host/client.js'

const config = { hostName: 'local', hostSecret: 'host-secret', sitesRoot: process.cwd() }

const fakeRun = (result) => async () => result

test('GET /health answers 200 with docker:true and sitesRoot:true when run succeeds and sitesRoot is writable', async () => {
  const app = buildApp({ config, run: fakeRun({ code: 0, tail: [] }) })
  const res = await app.fetch(new Request('http://tracy-host.test/health'))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { docker: true, sitesRoot: true })
})

test('GET /health answers docker:false when run reports a non-zero exit code', async () => {
  const app = buildApp({ config, run: fakeRun({ code: 1, tail: ['docker: command not found'] }) })
  const res = await app.fetch(new Request('http://tracy-host.test/health'))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { docker: false, sitesRoot: true })
})

test('GET /health answers sitesRoot:false when the configured directory does not exist', async () => {
  const app = buildApp({
    config: { ...config, sitesRoot: '/no/such/tracy-sites-root/at/all' },
    run: fakeRun({ code: 0, tail: [] })
  })
  const res = await app.fetch(new Request('http://tracy-host.test/health'))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { docker: true, sitesRoot: false })
})

test('GET /health never signs — it is unsigned by design (nothing in it a stranger could use)', async () => {
  const app = buildApp({ config, run: fakeRun({ code: 0, tail: [] }) })
  const res = await app.fetch(new Request('http://tracy-host.test/health'))
  assert.equal(res.status, 200)
})

test('an unsigned call to /_host/provision is refused 403 BAD_SIGNATURE — the route need not even exist', async () => {
  const app = buildApp({ config, run: fakeRun({ code: 0, tail: [] }) })
  const res = await app.fetch(
    new Request('http://tracy-host.test/_host/provision', { method: 'POST', body: '{}' })
  )
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { code: 'BAD_SIGNATURE', why: 'missing' })
})

test('a call to /_host/* signed with the wrong secret is refused 403 BAD_SIGNATURE signature', async () => {
  const app = buildApp({ config, run: fakeRun({ code: 0, tail: [] }) })
  const body = '{}'
  const headers = await signHostCall({ secret: 'not-the-host-secret', path: '/_host/provision', body })
  const res = await app.fetch(
    new Request('http://tracy-host.test/_host/provision', { method: 'POST', headers, body })
  )
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { code: 'BAD_SIGNATURE', why: 'signature' })
})

test('a correctly signed call to an unregistered /_host/* route passes the middleware — 404, never 403', async () => {
  const body = '{}'
  const headers = await signHostCall({ secret: 'host-secret', path: '/_host/not-a-real-route', body })
  const app = buildApp({ config, run: fakeRun({ code: 0, tail: [] }) })
  const res = await app.fetch(
    new Request('http://tracy-host.test/_host/not-a-real-route', { method: 'POST', headers, body })
  )
  assert.equal(res.status, 404)
})

test('replaying the same signed call twice is refused the second time — 403 BAD_SIGNATURE replay', async () => {
  const body = '{}'
  const headers = await signHostCall({ secret: 'host-secret', path: '/_host/not-a-real-route', body })
  const app = buildApp({ config, run: fakeRun({ code: 0, tail: [] }) })
  const first = await app.fetch(
    new Request('http://tracy-host.test/_host/not-a-real-route', { method: 'POST', headers, body })
  )
  assert.equal(first.status, 404)
  const second = await app.fetch(
    new Request('http://tracy-host.test/_host/not-a-real-route', { method: 'POST', headers, body })
  )
  assert.equal(second.status, 403)
  assert.deepEqual(await second.json(), { code: 'BAD_SIGNATURE', why: 'replay' })
})

test('replaying a signed call against a REAL, registered route is refused the second time too — proves the middleware runs before a real handler, not just before a 404', async () => {
  // Body deliberately fails provisionRoute's own validation (missing site/label) — the point is
  // only that a real handler ran and answered on its own terms (400, not 404) the first time,
  // then the middleware's replay check still fires before that same handler runs again.
  const body = '{}'
  const headers = await signHostCall({ secret: 'host-secret', path: '/_host/provision', body })
  const app = buildApp({ config, run: fakeRun({ code: 0, tail: [] }) })
  const first = await app.fetch(
    new Request('http://tracy-host.test/_host/provision', { method: 'POST', headers, body })
  )
  assert.equal(first.status, 400)
  const second = await app.fetch(
    new Request('http://tracy-host.test/_host/provision', { method: 'POST', headers, body })
  )
  assert.equal(second.status, 403)
  assert.deepEqual(await second.json(), { code: 'BAD_SIGNATURE', why: 'replay' })
})

test('host inventory requires a signature and runs only the fixed inventory command', async () => {
  const calls = []
  const payload = { container: { status: 'running' }, packages: [] }
  const app = buildApp({
    config: { ...config, scriptsDir: '/opt/tracy-fleet' },
    run: async (input) => {
      calls.push(input)
      return { code: 0, tail: [JSON.stringify(payload)] }
    }
  })
  const path = '/_host/dsh-versions'
  const body = '{}'
  const unsigned = await app.request(path, { method: 'POST', body })
  assert.equal(unsigned.status, 403)
  assert.equal(calls.length, 0)
  const headers = await signHostCall({ secret: config.hostSecret, path, body })
  const result = await app.request(path, { method: 'POST', headers, body })
  assert.equal(result.status, 200)
  assert.deepEqual(await result.json(), payload)
  assert.deepEqual(calls, [
    { script: 'node', args: ['/opt/tracy-fleet/provision/dsh-versions.mjs', '--host', 'local'] }
  ])
})

// ── A keyed provision attempt is idempotent on this host (plan first-site-build-onboarding §5.3) ──

/** A job store in memory, shaped like `jobs.js`'s `put`/`get`. */
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

test('POST /_host/provision with a jobKey names the SAME job on a second call — nothing runs twice', async () => {
  const { keyedJobId } = await import('../src/app.js')
  const jobs = memoryJobs()
  const app = buildApp({
    config: { ...config, privateRoot: '/tmp/x', scriptsDir: '/opt/tracy-fleet' },
    jobs,
    // Never resolves: the job stays `queued`/`running` for the whole test, like a real provision.
    run: async () => new Promise(() => {})
  })
  const path = '/_host/provision'
  const instruction = { site: 'x.test', label: 'x', platform: 'joomla', fresh: true, jobKey: 'build-1:1' }
  const first = await app.request(path, {
    method: 'POST',
    headers: await signHostCall({ secret: config.hostSecret, path, body: JSON.stringify(instruction) }),
    body: JSON.stringify(instruction)
  })
  assert.equal(first.status, 202)
  const firstBody = await first.json()
  assert.equal(firstBody.jobId, keyedJobId('build-1:1'))
  // The response is lost; tracy-web asks again with the same key.
  const again = await app.request(path, {
    method: 'POST',
    headers: await signHostCall({ secret: config.hostSecret, path, body: JSON.stringify(instruction) }),
    body: JSON.stringify(instruction)
  })
  assert.equal(again.status, 202)
  assert.deepEqual(await again.json(), { jobId: firstBody.jobId, reused: true })
  assert.equal(jobs.rows.size, 1)
  assert.equal(jobs.rows.get(firstBody.jobId).jobKey, 'build-1:1')
  // A DIFFERENT attempt of the same build is a different job.
  const retry = { ...instruction, jobKey: 'build-1:2' }
  const second = await app.request(path, {
    method: 'POST',
    headers: await signHostCall({ secret: config.hostSecret, path, body: JSON.stringify(retry) }),
    body: JSON.stringify(retry)
  })
  assert.notEqual((await second.json()).jobId, firstBody.jobId)
  assert.equal(jobs.rows.size, 2)
  // An unkeyed call keeps the old shape: a fresh random id.
  const { jobKey: _k, ...unkeyed } = instruction
  const third = await app.request(path, {
    method: 'POST',
    headers: await signHostCall({ secret: config.hostSecret, path, body: JSON.stringify(unkeyed) }),
    body: JSON.stringify(unkeyed)
  })
  assert.match((await third.json()).jobId, /^[0-9a-f]{12}$/)
  // A key that is not a key is refused before anything is written.
  const bad = { ...instruction, jobKey: 'a b' }
  const refused = await app.request(path, {
    method: 'POST',
    headers: await signHostCall({ secret: config.hostSecret, path, body: JSON.stringify(bad) }),
    body: JSON.stringify(bad)
  })
  assert.equal(refused.status, 400)
  assert.equal(jobs.rows.size, 3)
})

// #295: a deploy waiting to replace this container has left a marker in the jobs directory.
test('POST /_host/provision while a deploy drains: a new job is refused HOST_UPDATING, a known one is still answered', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { keyedJobId } = await import('../src/app.js')
  const jobsDir = await mkdtemp(join(tmpdir(), 'tracy-host-draining-'))
  const jobs = memoryJobs()
  const app = buildApp({
    config: { ...config, privateRoot: '/tmp/x', scriptsDir: '/opt/tracy-fleet', jobsDir },
    jobs,
    run: async () => new Promise(() => {})
  })
  const path = '/_host/provision'
  const post = async (instruction) =>
    app.request(path, {
      method: 'POST',
      headers: await signHostCall({ secret: config.hostSecret, path, body: JSON.stringify(instruction) }),
      body: JSON.stringify(instruction)
    })
  const instruction = { site: 'x.test', label: 'x', platform: 'joomla', fresh: true, jobKey: 'build-1:1' }
  assert.equal((await post(instruction)).status, 202)

  await writeFile(join(jobsDir, 'draining'), JSON.stringify({ until: Date.now() + 60_000 }))
  const again = await post(instruction)
  assert.equal(again.status, 202, 'asking again for a running job starts nothing, so it is not refused')
  assert.deepEqual(await again.json(), { jobId: keyedJobId('build-1:1'), reused: true })
  const fresh = await post({ ...instruction, jobKey: 'build-2:1' })
  assert.equal(fresh.status, 503)
  assert.deepEqual(await fresh.json(), { code: 'HOST_UPDATING' })
  assert.equal(jobs.rows.size, 1, 'the refused press wrote a job')
})

// ── Bad input at the door (QA run 20/10/2026: 4b, 5a, 5b, 5c) ──

/** A signed POST to `path` with `raw` as the exact body. */
async function signedPost(app, path, raw) {
  return app.request(path, {
    method: 'POST',
    headers: await signHostCall({ secret: config.hostSecret, path, body: raw }),
    body: raw
  })
}

/** `memoryJobs`, but every read answers a little late — the window two requests can race through. */
function slowJobs() {
  const jobs = memoryJobs()
  const get = jobs.get
  jobs.get = async (id) => {
    const found = await get(id)
    await new Promise((resolve) => setTimeout(resolve, 20))
    return found
  }
  return jobs
}

/** A `run` that never finishes and remembers which script each call started. */
function countingRun() {
  const scripts = []
  const run = async (input) => {
    scripts.push((input.args ?? []).find((arg) => String(arg).endsWith('.sh')) ?? input.script)
    return new Promise(() => {})
  }
  return { run, scripts }
}

const hostConfig = { ...config, privateRoot: '/tmp/x', scriptsDir: '/opt/tracy-fleet', logDir: '/tmp/x-logs' }

test('POST /_host/provision: two requests with the same jobKey at the same moment start provision.sh once', async () => {
  const { keyedJobId } = await import('../src/app.js')
  const jobs = slowJobs()
  const { run, scripts } = countingRun()
  const app = buildApp({ config: hostConfig, jobs, run })
  const raw = JSON.stringify({
    site: 'x.test',
    label: 'x',
    platform: 'joomla',
    fresh: true,
    jobKey: 'build-9:1'
  })
  const answers = await Promise.all([
    signedPost(app, '/_host/provision', raw),
    signedPost(app, '/_host/provision', raw)
  ])
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(
    answers.map((res) => res.status),
    [202, 202]
  )
  const bodies = await Promise.all(answers.map((res) => res.json()))
  assert.deepEqual(
    bodies.map((body) => body.jobId),
    [keyedJobId('build-9:1'), keyedJobId('build-9:1')]
  )
  assert.equal(
    bodies.filter((body) => body.reused === true).length,
    1,
    'exactly one answer is the reused job'
  )
  assert.equal(scripts.filter((script) => script.endsWith('provision.sh')).length, 1)
})

test('POST /_host/teardown: two requests with the same jobKey at the same moment start teardown.sh once', async () => {
  const jobs = slowJobs()
  const { run, scripts } = countingRun()
  const app = buildApp({ config: hostConfig, jobs, run })
  const raw = JSON.stringify({ label: 'x', jobKey: 'teardown-9:1' })
  const answers = await Promise.all([
    signedPost(app, '/_host/teardown', raw),
    signedPost(app, '/_host/teardown', raw)
  ])
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(
    answers.map((res) => res.status),
    [202, 202]
  )
  assert.equal(scripts.filter((script) => script.endsWith('teardown.sh')).length, 1)
})

test('POST /_host/teardown and the webroot jobs of /_host/site refuse a label that is a path, and take a real one', async () => {
  const jobs = memoryJobs()
  const { run, scripts } = countingRun()
  const app = buildApp({ config: hostConfig, jobs, run })
  for (const label of ['../x', '../../etc', 'a/b', '-rf', '.', '..']) {
    const teardown = await signedPost(app, '/_host/teardown', JSON.stringify({ label }))
    assert.equal(teardown.status, 400, `teardown took ${label}`)
    const site = await signedPost(app, '/_host/site', JSON.stringify({ kind: 'git-status', label }))
    assert.equal(site.status, 400, `site job took ${label}`)
  }
  assert.equal(jobs.rows.size, 0)
  assert.deepEqual(scripts, [])
  const real = await signedPost(app, '/_host/teardown', JSON.stringify({ label: 'demo-joomla-1' }))
  assert.equal(real.status, 202)
})

test('GET /_host/jobs/:id refuses an id that is not a job id, and still reads a real one', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { putJob, readJob } = await import('../src/jobs.js')
  const root = await mkdtemp(join(tmpdir(), 'tracy-host-jobs-id-'))
  try {
    const jobsDir = join(root, 'jobs')
    await mkdir(jobsDir)
    await writeFile(join(root, 'secret.json'), JSON.stringify({ secret: 'outside the jobs dir' }))
    await putJob(jobsDir, 'abcdef012345', { state: 'done' })
    const jobs = { get: (id) => readJob(jobsDir, id), put: (id, fields) => putJob(jobsDir, id, fields) }
    const app = buildApp({ config: hostConfig, jobs, run: fakeRun({ code: 0, tail: [] }) })
    const get = async (id) => {
      const path = `/_host/jobs/${id}`
      return app.request(path, { headers: await signHostCall({ secret: config.hostSecret, path, body: '' }) })
    }
    for (const id of ['..%2Fsecret', '..%2F..%2Fjobs%2Fabcdef012345', 'abc', 'ABCDEF012345', 'secret']) {
      const res = await get(id)
      assert.equal(res.status, 404, `${id} answered ${res.status}`)
      assert.doesNotMatch(await res.text(), /outside the jobs dir/)
    }
    // The store itself never reaches outside its directory, whoever asks it.
    assert.equal(await readJob(jobsDir, '../secret'), null)
    const real = await get('abcdef012345')
    assert.equal(real.status, 200)
    assert.equal((await real.json()).state, 'done')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a JSON body that is not an object is refused 400 at every door that reads one, never a 500', async () => {
  const app = buildApp({
    config: { ...hostConfig, cloudflare: { token: 't', account: 'a', tunnel: 'u' } },
    jobs: memoryJobs(),
    run: fakeRun({ code: 0, tail: [] })
  })
  const doors = [
    'provision',
    'attach',
    'reserve',
    'unreserve',
    'teardown',
    'site',
    'agent-token',
    'content-token',
    'site-files',
    'display-locale',
    'address'
  ]
  for (const door of doors) {
    for (const raw of ['null', '7', '"label"', '[]']) {
      const res = await signedPost(app, `/_host/${door}`, raw)
      assert.equal(res.status, 400, `${door} answered ${res.status} to ${raw}`)
    }
  }
})
