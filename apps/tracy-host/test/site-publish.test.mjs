/**
 * `POST /_host/go-live` as the web door's publish flow relies on it: an immediate 202 with a job id,
 * the job's own states afterwards, and ONE go-live per site at a time.
 *
 * The app is the real `buildApp`; calls are really signed. `run` stands in for `go-live.sh` and is
 * held open by the test, so "a job is running" is a fact the test controls rather than a race.
 *
 * The last section runs the REAL `go-live.sh` with `iptables`, `docker` and `netfilter-persistent`
 * replaced by stand-ins the test controls: what is held there is the script's own contract — which
 * step failing ends it non-zero, which lines it prints, and that a second run beside a first one
 * ends 75 having changed nothing. The runs that carry a domain of the customer's own reach the
 * tunnel through a stand-in for `ingress_api.py` (the real one is run against a provider the test
 * owns in `packages/fleet/tracy-fleet-operation/test/teardown-ingress.test.mjs`).
 *
 * WHAT THIS DOES NOT RUN: a real firewall, a real Apache, a real tunnel, real DNS — those need a
 * real host.
 *
 *   node --test apps/tracy-host/test/site-publish.test.mjs
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  rmdir,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildApp, keyedJobId } from '../src/app.js'
// A namespace: on sources without the acceptance mark this file still loads, and its tests fail one by one.
import * as jobStore from '../src/jobs.js'
import { signHostCall } from '../../tracy-web/src/host/client.js'

const made = []
after(() => Promise.all(made.map((dir) => rm(dir, { recursive: true, force: true }))))

async function tmpDir(name) {
  const dir = await mkdtemp(
    path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), `tracy-host-publish-${name}-`)
  )
  made.push(dir)
  return dir
}

async function configured({ cloudflare = true } = {}) {
  const config = {
    hostName: 'local',
    hostSecret: 'host-secret',
    sitesRoot: await tmpDir('sites'),
    privateRoot: await tmpDir('private'),
    scriptsDir: await tmpDir('scripts'),
    jobsDir: await tmpDir('jobs'),
    logDir: await tmpDir('logs'),
    cloudflare: cloudflare ? { token: 'cf-tok', account: 'acct-1', tunnel: 'tun-1' } : null
  }
  await mkdir(path.join(config.privateRoot, 'lantern'), { recursive: true })
  await mkdir(path.join(config.privateRoot, 'harbor'), { recursive: true })
  return config
}

/** `lstat`, where only a missing name is "absent": any other error is raised, never read as absence. */
async function lstatOrNull(file) {
  try {
    return await lstat(file)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

/** Remove a name without following it: a link or a pipe is unlinked, a locked folder is opened up one level at a time. */
async function removeNode(file) {
  const info = await lstatOrNull(file)
  if (!info) return
  if (!info.isDirectory()) return unlink(file)
  if ((info.mode & 0o700) !== 0o700) await chmod(file, 0o700)
  for (const name of await readdir(file)) await removeNode(path.join(file, name))
  await rmdir(file)
}

/** What a fixture folder holds when it is made: folders and regular files, each with its mode (and bytes). */
async function snapshotTree(root) {
  const tree = new Map()
  const walk = async (dir, rel) => {
    for (const name of (await readdir(dir)).sort()) {
      const file = path.join(dir, name)
      const key = path.join(rel, name)
      const info = await lstat(file)
      const mode = info.mode & 0o7777
      if (info.isDirectory()) {
        tree.set(key, { kind: 'dir', mode })
        await walk(file, key)
      } else if (info.isFile()) tree.set(key, { kind: 'file', mode, text: await readFile(file, 'utf8') })
      else throw new Error(`fixture ${file} is neither a folder nor a regular file`)
    }
  }
  tree.set('', { kind: 'dir', mode: (await lstat(root)).mode & 0o7777 })
  await walk(root, '')
  return tree
}

/**
 * Bring `root` back to `want` (a `snapshotTree`) by looking at every name in it, never following a
 * link and never reading a pipe: a name that is already right is not touched (inode and times stay),
 * a wrong mode is fixed in place, wrong bytes are written again, anything of another kind under the
 * name — or any name `want` does not have — is removed by name. Only a missing name is "absent".
 */
async function reconcile(root, want) {
  for (const [key, entry] of want) {
    const file = path.join(root, key)
    let info = await lstatOrNull(file)
    if (info && (entry.kind === 'dir') !== info.isDirectory()) {
      await removeNode(file)
      info = null
    } else if (info && entry.kind === 'file' && !info.isFile()) {
      await removeNode(file)
      info = null
    }
    if (entry.kind === 'dir') {
      if (!info) {
        await mkdir(file, { recursive: key === '' })
        await chmod(file, entry.mode)
      } else if ((info.mode & 0o7777) !== entry.mode) await chmod(file, entry.mode)
      for (const name of await readdir(file)) {
        if (!want.has(path.join(key, name))) await removeNode(path.join(file, name))
      }
      continue
    }
    if (info && (info.mode & 0o7777) !== entry.mode) await chmod(file, entry.mode)
    if (info && info.size === Buffer.byteLength(entry.text) && (await readFile(file, 'utf8')) === entry.text)
      continue
    await writeFile(file, entry.text)
    await chmod(file, entry.mode)
  }
  // The audit run (`TRACY_FIXTURE_AUDIT=1`) reads the folder back: a reset that missed anything is red.
  if (process.env.TRACY_FIXTURE_AUDIT) {
    assert.deepEqual([...(await snapshotTree(root))], [...want], `${root} is not what it was made as`)
  }
}

/**
 * One `configured()` for a whole matrix of iterations, made on the first `fresh()`. Each `fresh()`
 * puts back only what the iteration before changed — the fields of the config and what the five
 * folders gained, lost or had locked — and writes nothing when nothing changed. Use it only when the
 * iteration before has ended every job it started (or never touched the folders); `apart()` is a
 * new `configured()` for an iteration that leaves a runner behind that still writes to its folders.
 */
function reusable(options) {
  let made = null
  return {
    async fresh() {
      if (!made) {
        const config = await configured(options)
        const trees = {}
        for (const key of FOLDERS) trees[key] = await snapshotTree(config[key])
        made = { config, text: JSON.stringify(config), trees }
        return config
      }
      const { config, text, trees } = made
      if (JSON.stringify(config) !== text) {
        const first = JSON.parse(text)
        for (const key of Object.keys(config)) if (!(key in first)) delete config[key]
        Object.assign(config, first)
      }
      for (const key of FOLDERS) await reconcile(config[key], trees[key])
      return config
    },
    apart: () => configured(options)
  }
}
const FOLDERS = ['sitesRoot', 'privateRoot', 'scriptsDir', 'jobsDir', 'logDir']

function memoryJobs() {
  const store = new Map()
  /** The keys this host took (`jobs.js` `acceptJob`): kept apart from the records, as on disk. */
  const marks = new Set()
  return {
    store,
    marks,
    async accept(id) {
      marks.add(id)
    },
    async accepted(id) {
      return marks.has(id)
    },
    async put(id, fields) {
      const next = { ...(store.get(id) ?? { id, createdAt: Date.now() }), ...fields, updatedAt: Date.now() }
      store.set(id, next)
      return next
    },
    async get(id) {
      return store.get(id) ?? null
    }
  }
}

/** A `run` whose every call waits until the test ends it: `{ calls, end(index, result) }`. */
function heldRun() {
  const calls = []
  const run = (input) =>
    new Promise((resolve, reject) => {
      calls.push({ input, resolve, reject })
    })
  return { run, calls }
}

async function post(app, config, payload, raw, door = '/_host/go-live') {
  const body = raw ?? JSON.stringify(payload)
  const headers = await signHostCall({ secret: config.hostSecret, path: door, body })
  return app.fetch(new Request(`http://tracy-host.test${door}`, { method: 'POST', headers, body }))
}

async function job(app, config, id) {
  const urlPath = `/_host/jobs/${id}`
  const headers = await signHostCall({ secret: config.hostSecret, path: urlPath, body: '' })
  const res = await app.fetch(new Request(`http://tracy-host.test${urlPath}`, { headers }))
  return { status: res.status, body: await res.json() }
}

async function until(read, done, what) {
  const deadline = Date.now() + 10_000
  for (;;) {
    const value = await read()
    if (done(value)) return value
    if (Date.now() > deadline) throw new Error(`${what}: gave up; last ${JSON.stringify(value)}`)
    await new Promise((r) => setTimeout(r, 5))
  }
}

test('a go-live answers 202 with a job id at once; the job reads running, then done with the script output', async () => {
  const config = await configured()
  const held = heldRun()
  const app = buildApp({ config, jobs: memoryJobs(), run: held.run })
  const res = await post(app, config, { label: 'lantern', op: 'live', domains: ['example.com'] })
  assert.equal(res.status, 202)
  const { jobId } = await res.json()
  assert.match(jobId, /^[A-Za-z0-9_-]+$/)

  const running = await until(
    () => job(app, config, jobId),
    (j) => j.body.state === 'running',
    'running'
  )
  assert.equal(running.body.step, 'go-live:live')
  assert.equal(held.calls.length, 1)
  const { args, env } = held.calls[0].input
  assert.ok(args[0].endsWith(path.join('provision', 'go-live.sh')))
  assert.deepEqual(args.slice(1), [
    '--label',
    'lantern',
    '--op',
    'live',
    '--root',
    config.privateRoot,
    '--domain',
    'example.com'
  ])
  assert.equal(env.TRACY_TUNNEL_ID, 'tun-1')

  held.calls[0].resolve({ code: 0, tail: ['TRACY_RESULT go_live=live label=lantern platform=wordpress'] })
  const done = await until(
    () => job(app, config, jobId),
    (j) => j.body.state === 'done',
    'done'
  )
  assert.equal(done.body.exitCode, 0)
  assert.match(done.body.output, /go_live=live/)
})

test('a script that exits non-zero, or cannot be started, ends the job failed — never done', async () => {
  const config = await configured()
  const held = heldRun()
  const app = buildApp({ config, jobs: memoryJobs(), run: held.run })
  const first = await (await post(app, config, { label: 'lantern', op: 'live' })).json()
  await until(
    () => held.calls.length,
    (n) => n === 1,
    'first run'
  )
  held.calls[0].resolve({ code: 1, tail: ['!! could not read the subnet'] })
  const failed = await until(
    () => job(app, config, first.jobId),
    (j) => j.body.state === 'failed',
    'failed'
  )
  assert.equal(failed.body.exitCode, 1)
  assert.match(failed.body.output, /subnet/)

  const second = await (await post(app, config, { label: 'lantern', op: 'draft' })).json()
  await until(
    () => held.calls.length,
    (n) => n === 2,
    'second run'
  )
  held.calls[1].reject(new Error('spawn bash ENOENT'))
  const broken = await until(
    () => job(app, config, second.jobId),
    (j) => j.body.state === 'failed',
    'spawn failure'
  )
  assert.match(broken.body.detail, /ENOENT/)
  // Failed to the reader, but not by the script's own exit: no exit code is on the record.
  assert.equal(broken.body.exitCode, null)
  assert.equal(broken.body.unobserved, true)
})

test('one go-live per site: a second call while the first runs is refused GO_LIVE_BUSY with that job, and starts nothing', async () => {
  const config = await configured()
  const held = heldRun()
  const jobs = memoryJobs()
  const app = buildApp({ config, jobs, run: held.run })
  // Two calls that arrive together, as a double click sends them.
  const [a, b] = await Promise.all([
    post(app, config, { label: 'lantern', op: 'live' }),
    post(app, config, { label: 'lantern', op: 'live' })
  ])
  const statuses = [a.status, b.status].sort()
  assert.deepEqual(statuses, [202, 409])
  const taken = await (a.status === 202 ? a : b).json()
  const refused = await (a.status === 409 ? a : b).json()
  assert.deepEqual(refused, { code: 'GO_LIVE_BUSY', jobId: taken.jobId, op: 'live' })

  // The other direction is refused too, and says which direction holds the site.
  const draft = await post(app, config, { label: 'lantern', op: 'draft' })
  assert.equal(draft.status, 409)
  assert.equal((await draft.json()).op, 'live')
  await until(
    () => held.calls.length,
    (n) => n >= 1,
    'run'
  )
  assert.equal(held.calls.length, 1, 'the script ran once')
  assert.equal(jobs.store.size, 1, 'one job record')

  // Another site is not held by this one.
  const other = await post(app, config, { label: 'harbor', op: 'live' })
  assert.equal(other.status, 202)
})

test('the site is free again once its job has ended, done or failed', async () => {
  const config = await configured()
  const held = heldRun()
  const app = buildApp({ config, jobs: memoryJobs(), run: held.run })
  const first = await (await post(app, config, { label: 'lantern', op: 'live' })).json()
  await until(
    () => held.calls.length,
    (n) => n === 1,
    'run'
  )
  held.calls[0].resolve({ code: 1, tail: [] })
  await until(
    () => job(app, config, first.jobId),
    (j) => j.body.state === 'failed',
    'failed'
  )
  const again = await until(
    () => post(app, config, { label: 'lantern', op: 'live' }),
    (res) => res.status === 202,
    'free again'
  )
  assert.notEqual((await again.json()).jobId, first.jobId)
})

test('a job record that cannot be written leaves the site free, not held for ever', async () => {
  const config = await configured()
  const held = heldRun()
  let fail = true
  const jobs = memoryJobs()
  const put = jobs.put
  jobs.put = async (...args) => {
    if (fail) throw new Error('ENOSPC')
    return put(...args)
  }
  const app = buildApp({ config, jobs, run: held.run })
  const broken = await post(app, config, { label: 'lantern', op: 'live' })
  assert.equal(broken.status, 500)
  assert.equal(held.calls.length, 0)
  fail = false
  assert.equal((await post(app, config, { label: 'lantern', op: 'live' })).status, 202)
})

test('no tunnel configuration: publish and back to draft at the Tracy address still run — no domain, no tunnel needed, and no Cloudflare name invented for the script', async () => {
  const rig = await reusable({ cloudflare: false })
  for (const op of ['live', 'draft']) {
    for (const payload of [
      { label: 'lantern', op },
      { label: 'lantern', op, domains: [] },
      { label: 'lantern', op, jobKey: `publish:bare${op}` }
    ]) {
      const config = await rig.fresh()
      const held = heldRun()
      const jobs = memoryJobs()
      const app = buildApp({ config, jobs, run: held.run })
      const res = await post(app, config, payload)
      const what = JSON.stringify(payload)
      assert.equal(res.status, 202, what)
      const { jobId } = await res.json()
      await until(
        () => held.calls.length,
        (n) => n === 1,
        `${what}: the script started`
      )
      const { input } = held.calls[0]
      assert.deepEqual(input.args.slice(1, 5), ['--label', 'lantern', '--op', op], what)
      assert.equal(input.args.includes('--domain'), false, what)
      // Exactly what this process has, which on a host with no tunnel is nothing: never a made-up value.
      for (const name of ['TRACY_CF_API_TOKEN', 'TRACY_CF_ACCOUNT_ID', 'TRACY_TUNNEL_ID'])
        assert.equal(input.env[name], process.env[name], `${what}: ${name}`)
      held.calls[0].resolve({ code: 0, tail: [`TRACY_RESULT go_live=${op} label=lantern platform=none`] })
      const done = await until(
        () => job(app, config, jobId),
        (j) => j.body.state === 'done',
        `${what}: done`
      )
      assert.equal(done.body.exitCode, 0, what)
    }
  }
})

test('no tunnel configuration: only an ask that NAMES a domain is refused 501 NOT_CONFIGURED — after its shape was checked, and before anything is recorded or run', async () => {
  const config = await configured({ cloudflare: false })
  const held = heldRun()
  const jobs = memoryJobs()
  const app = buildApp({ config, jobs, run: held.run })
  for (const payload of [
    { label: 'lantern', op: 'live', domains: ['example.com'] },
    { label: 'lantern', op: 'draft', domains: ['example.com'] },
    { label: 'lantern', op: 'drop-domain', domains: ['example.com'] }
  ]) {
    const res = await post(app, config, payload)
    assert.equal(res.status, 501, JSON.stringify(payload))
    assert.deepEqual(await res.json(), { code: 'NOT_CONFIGURED' })
    const keyed = await post(app, config, { ...payload, jobKey: 'publish:nevertaken' })
    assert.equal(keyed.status, 501)
    assert.deepEqual(await keyed.json(), { code: 'NOT_CONFIGURED', accepted: false })
  }
  // A malformed ask is told it is malformed on this host too, not that the host has no tunnel.
  for (const payload of [
    { label: 'lantern', op: 'live', domains: ['https://example.com'] },
    { label: 'lantern', op: 'publish', domains: ['example.com'] },
    { label: 'lantern', op: 'live', domains: ['example.com'], force: true },
    { label: 'lantern', op: 'drop-domain' }
  ]) {
    const res = await post(app, config, payload)
    assert.equal(res.status, 400, JSON.stringify(payload))
    assert.equal((await res.json()).code, 'BAD_REQUEST')
  }
  // And a site this host does not have is still 404 for an ask without a domain.
  const ghost = await post(app, config, { label: 'ghost', op: 'live' })
  assert.equal(ghost.status, 404)
  assert.equal(held.calls.length, 0)
  assert.equal(jobs.store.size, 0)
})

test('every malformed body is refused 400 before a job exists', async () => {
  const config = await configured()
  const held = heldRun()
  const jobs = memoryJobs()
  const app = buildApp({ config, jobs, run: held.run })
  const bodies = [
    ['no label', { op: 'live' }],
    ['a path as the label', { label: '../lantern', op: 'live' }],
    ['no op', { label: 'lantern' }],
    ['an unknown op', { label: 'lantern', op: 'publish' }],
    ['domains that are not a list', { label: 'lantern', op: 'live', domains: 'example.com' }],
    ['a domain that is not a string', { label: 'lantern', op: 'live', domains: [7] }],
    ['a domain with a scheme', { label: 'lantern', op: 'live', domains: ['https://example.com'] }],
    ['a domain with a path', { label: 'lantern', op: 'live', domains: ['example.com/x'] }],
    ['a wildcard domain', { label: 'lantern', op: 'live', domains: ['*.example.com'] }],
    ['a single label', { label: 'lantern', op: 'live', domains: ['localhost'] }],
    ['a trailing dot', { label: 'lantern', op: 'live', domains: ['example.com.'] }],
    ['a Unicode name', { label: 'lantern', op: 'live', domains: ['bücher.example'] }],
    ['an option as the domain', { label: 'lantern', op: 'live', domains: ['--root'] }],
    [
      'more than ten domains',
      { label: 'lantern', op: 'live', domains: Array.from({ length: 11 }, (_, i) => `d${i}.example.com`) }
    ],
    ['an unknown key', { label: 'lantern', op: 'live', force: true }],
    ['one domain named twice', { label: 'lantern', op: 'live', domains: ['example.com', 'example.com'] }],
    ['an IP address as the domain', { label: 'lantern', op: 'live', domains: ['192.0.2.7'] }],
    ['a domain with a port', { label: 'lantern', op: 'live', domains: ['example.com:8443'] }],
    ['a domain in upper case', { label: 'lantern', op: 'live', domains: ['Example.COM'] }],
    ['a domain with a space', { label: 'lantern', op: 'live', domains: ['exa mple.com'] }],
    ['an empty domain', { label: 'lantern', op: 'live', domains: [''] }],
    ['a domain that is null', { label: 'lantern', op: 'live', domains: [null] }],
    ['domains that are null', { label: 'lantern', op: 'live', domains: null, extra: 1 }],
    // A field that is there is read as what it is, never as its default: null is not "none".
    ['domains that are null, nothing else wrong', { label: 'lantern', op: 'live', domains: null }],
    ['domains null on a draft', { label: 'lantern', op: 'draft', domains: null }],
    ['domains that are a string', { label: 'lantern', op: 'live', domains: 'example.com' }],
    ['domains that are an object', { label: 'lantern', op: 'live', domains: { 0: 'example.com' } }],
    ['an attempt that is null', { label: 'lantern', op: 'draft', jobKey: 'publish:k1', attempt: null }],
    ['an attempt that is null, no key', { label: 'lantern', op: 'draft', attempt: null }],
    ['an attempt that is true', { label: 'lantern', op: 'draft', jobKey: 'publish:k1', attempt: true }],
    ['a label that is a number', { label: 7, op: 'live' }],
    ['a label that is a list', { label: ['lantern'], op: 'live' }],
    ['a label that is null', { label: null, op: 'live' }],
    ['an op that is null', { label: 'lantern', op: null }],
    ['an op that is a list', { label: 'lantern', op: ['live'] }],
    ['a job key that is null', { label: 'lantern', op: 'live', jobKey: null }],
    [
      'a routing target that is null',
      { label: 'lantern', op: 'live', domains: ['example.com'], routingTarget: null }
    ],
    ['drop-domain with no domain', { label: 'lantern', op: 'drop-domain' }],
    ['drop-domain with an empty list', { label: 'lantern', op: 'drop-domain', domains: [] }],
    [
      'drop-domain with two domains',
      { label: 'lantern', op: 'drop-domain', domains: ['a.example.com', 'b.example.com'] }
    ],
    [
      'a routing target that is not a string',
      { label: 'lantern', op: 'live', domains: ['example.com'], routingTarget: 7 }
    ],
    [
      'a routing target that is not a host name',
      { label: 'lantern', op: 'live', domains: ['example.com'], routingTarget: 'https://x.example/' }
    ],
    [
      'a routing target with no domain to prove',
      { label: 'lantern', op: 'live', routingTarget: 't.cfargotunnel.com' }
    ],
    [
      'a routing target on a draft',
      { label: 'lantern', op: 'draft', domains: ['example.com'], routingTarget: 't.cfargotunnel.com' }
    ],
    [
      'an attempt that is not a number',
      { label: 'lantern', op: 'draft', jobKey: 'publish:k1', attempt: '1' }
    ],
    ['a negative attempt', { label: 'lantern', op: 'draft', jobKey: 'publish:k1', attempt: -1 }],
    ['a fractional attempt', { label: 'lantern', op: 'draft', jobKey: 'publish:k1', attempt: 1.5 }],
    ['an attempt past the bound', { label: 'lantern', op: 'draft', jobKey: 'publish:k1', attempt: 1001 }],
    ['an attempt without a key', { label: 'lantern', op: 'draft', attempt: 1 }]
  ]
  for (const [what, payload] of bodies) {
    const res = await post(app, config, payload)
    assert.equal(res.status, 400, what)
    assert.equal((await res.json()).code, 'BAD_REQUEST', what)
  }
  // JSON that is not an object has no label to read: refused the same way, never a 500.
  for (const raw of ['{"label":', 'null', '[]', '["lantern"]', '7', '"lantern"', 'true']) {
    const res = await post(app, config, null, raw)
    assert.equal(res.status, 400, raw)
    assert.equal((await res.json()).code, 'BAD_REQUEST', raw)
  }
  assert.equal(held.calls.length, 0)
  assert.equal(jobs.store.size, 0)
})

test('a label with no site folder — or one that is a file, or a link to nowhere — is 404, and nothing runs', async () => {
  const config = await configured()
  const held = heldRun()
  const app = buildApp({ config, jobs: memoryJobs(), run: held.run })
  await writeFile(path.join(config.privateRoot, 'afile'), '')
  await symlink(path.join(config.privateRoot, 'nowhere'), path.join(config.privateRoot, 'dangling'))
  for (const label of ['ghost', 'afile', 'dangling']) {
    const res = await post(app, config, { label, op: 'live' })
    assert.equal(res.status, 404, label)
    assert.deepEqual(await res.json(), { code: 'NOT_FOUND' }, label)
  }
  assert.equal(held.calls.length, 0)
})

test('an unknown job id reads 404 NOT_FOUND, which the web door takes as "ask again for the same operation"', async () => {
  const config = await configured()
  const app = buildApp({ config, jobs: memoryJobs(), run: heldRun().run })
  const answer = await job(app, config, 'nosuchjob')
  assert.equal(answer.status, 404)
  assert.deepEqual(answer.body, { code: 'NOT_FOUND' })
})

test("every refusal this door gives is on the web door's list of them, on the listed status, and tells a keyed ask its key was never taken — and nothing else it answers reads as one", async () => {
  // The one list (`apps/tracy-web/src/sites/publish-store.js`): what the web door takes as the
  // host's own "no" to a publish. Imported here so a refusal added to `goLiveRoute`, or one whose
  // status moves, fails on this side too.
  const { HOST_REFUSALS, hostRefusal } = await import('../../tracy-web/src/sites/publish-store.js')
  const read = async (res) => ({ status: res.status, body: await res.json().catch(() => null) })
  const seen = new Set()
  let key = 0
  const refused = async (app, config, payload, what) => {
    const answer = await read(await post(app, config, { ...payload, jobKey: `publish:never${key++}` }))
    const code = hostRefusal(answer)
    assert.notEqual(code, null, `${what}: ${answer.status} ${JSON.stringify(answer.body)}`)
    assert.equal(HOST_REFUSALS[code], answer.status, what)
    assert.equal(answer.body.accepted, false, what)
    seen.add(code)
    // The same ask without a key: the same refusal, with no word on a key — never an ending.
    const bare = await read(await post(app, config, payload))
    assert.equal(bare.status, answer.status, what)
    assert.equal(bare.body.code, code, what)
    assert.equal('accepted' in bare.body, false, what)
    assert.equal(hostRefusal(bare), null, what)
  }

  const bare = await configured({ cloudflare: false })
  const bareJobs = memoryJobs()
  const bareApp = buildApp({ config: bare, jobs: bareJobs, run: heldRun().run })
  await refused(
    bareApp,
    bare,
    { label: 'lantern', op: 'live', domains: ['example.com'] },
    'a domain on a host with no tunnel configuration'
  )
  const config = await configured()
  const held = heldRun()
  const jobs = memoryJobs()
  const app = buildApp({ config, jobs, run: held.run })
  await refused(app, config, { label: 'lantern' }, 'no op')
  await refused(app, config, { label: '../lantern', op: 'live' }, 'a bad label')
  await refused(app, config, { label: 'lantern', op: 'live', domains: 'x' }, 'bad domains')
  await refused(app, config, { label: 'lantern', op: 'live', extra: 1 }, 'an unknown field')
  await refused(app, config, { label: 'ghost', op: 'live' }, 'no such site')
  await refused(
    app,
    config,
    { label: 'lantern', op: 'live', domains: ['example.com'], routingTarget: 'another.cfargotunnel.com' },
    'domains proven against a tunnel this host does not write to'
  )
  assert.deepEqual(
    [...seen].sort(),
    Object.keys(HOST_REFUSALS).sort(),
    'the list names nothing this door does not say'
  )
  assert.equal(jobs.store.size + bareJobs.store.size, 0, 'a refused ask left no record')
  assert.equal(held.calls.length, 0)

  // Refused with no key the host could look up: nothing says the key was never taken.
  for (const [what, res] of [
    ['JSON null', await post(app, config, null, 'null')],
    ['not JSON', await post(app, config, null, '{')],
    ['a key that is not one', await post(app, config, { label: 'lantern', op: 'live', jobKey: '../x' })],
    ['a key that is a number', await post(app, config, { label: 'lantern', op: 'live', jobKey: 7 })]
  ]) {
    const answer = await read(res)
    assert.equal(answer.status, 400, what)
    assert.equal('accepted' in answer.body, false, what)
    assert.equal(hostRefusal(answer), null, what)
  }

  // Not refusals: the job itself, "another job holds the site", and a call that was not let in.
  const taken = await read(await post(app, config, { label: 'lantern', op: 'live', jobKey: 'publish:a1' }))
  assert.equal(taken.status, 202)
  assert.equal(hostRefusal(taken), null)
  const busy = await read(await post(app, config, { label: 'lantern', op: 'draft', jobKey: 'publish:b2' }))
  assert.equal(busy.status, 409)
  assert.equal(busy.body.code, 'GO_LIVE_BUSY')
  assert.equal(hostRefusal(busy), null, 'busy is a job at work, never an ending')
  const body = JSON.stringify({ label: 'lantern', op: 'live', jobKey: 'publish:a1' })
  const unsigned = await read(
    await app.fetch(new Request('http://tracy-host.test/_host/go-live', { method: 'POST', body }))
  )
  assert.ok(unsigned.status === 401 || unsigned.status === 403, `not let in: ${unsigned.status}`)
  assert.equal(hostRefusal(unsigned), null, 'a call that was not let in says nothing about the operation')
  const wrongSecret = await signHostCall({ secret: 'not-the-secret', path: '/_host/go-live', body })
  const forged = await read(
    await app.fetch(
      new Request('http://tracy-host.test/_host/go-live', { method: 'POST', headers: wrongSecret, body })
    )
  )
  assert.ok(forged.status === 401 || forged.status === 403, `not let in: ${forged.status}`)
  assert.equal(hostRefusal(forged), null)
  assert.equal(held.calls.length <= 1, true, 'only the taken job may have started a script')
  held.calls[0]?.resolve({ code: 0, tail: [] })
})

/** What can change on a host after it took a job: `[what, status, code, change]`. */
const HOST_CHANGES = [
  [
    "the site's folder is gone",
    404,
    'NOT_FOUND',
    (config) => rm(path.join(config.privateRoot, 'lantern'), { recursive: true })
  ],
  [
    'the tunnel configuration is gone',
    501,
    'NOT_CONFIGURED',
    (config) => {
      config.cloudflare = null
    },
    // Only an ask that names a domain needs the tunnel.
    { domains: ['example.com'] }
  ],
  ['the ask itself is one the host no longer takes', 400, 'BAD_REQUEST', () => {}, { extra: 1 }]
]

test('a key the host has taken is answered with its job BEFORE the folder, the configuration or the request are checked — while it runs and after it ended', async () => {
  const rig = await reusable()
  for (const [what, , , change, more = {}] of HOST_CHANGES) {
    const config = await rig.fresh()
    const held = heldRun()
    const jobs = memoryJobs()
    const app = buildApp({ config, jobs, run: held.run })
    const payload = { label: 'lantern', op: 'live', jobKey: 'publish:0123456789abcdef' }
    const first = await (await post(app, config, payload)).json()
    await until(
      () => held.calls.length,
      (n) => n === 1,
      'the script started'
    )
    await change(config)
    const during = await post(app, config, { ...payload, ...more })
    assert.equal(during.status, 202, what)
    assert.deepEqual(await during.json(), { jobId: first.jobId, reused: true }, what)

    held.calls[0].resolve({ code: 0, tail: [] })
    await until(
      () => job(app, config, first.jobId),
      (j) => j.body.state === 'done',
      'done'
    )
    const after = await post(app, config, { ...payload, ...more })
    assert.equal(after.status, 202, what)
    assert.deepEqual(await after.json(), { jobId: first.jobId, reused: true }, what)
    // Even from a host started again since: the record is the outcome.
    const restarted = buildApp({ config, jobs, run: held.run })
    assert.deepEqual(
      await (await post(restarted, config, { ...payload, ...more })).json(),
      { jobId: first.jobId, reused: true },
      what
    )
    assert.equal(held.calls.length, 1, what)
  }
})

test('a taken key whose record is no outcome, on a host that cannot run it again: the refusal says the key WAS taken and names its job; a key never taken is told so', async () => {
  const rig = await reusable()
  for (const [what, status, code, change, more = {}] of HOST_CHANGES) {
    // isolated: a script held by this iteration is still at work when the next one starts.
    const config = await rig.apart()
    const held = heldRun()
    const jobs = memoryJobs()
    const app = buildApp({ config, jobs, run: held.run })
    const payload = { label: 'lantern', op: 'live', jobKey: 'publish:0123456789abcdef' }
    const first = await (await post(app, config, payload)).json()
    await until(
      () => held.calls.length,
      (n) => n === 1,
      'the script started'
    )
    // The host starts again with the script still at work: no guard, a record that reads `running`.
    const restarted = buildApp({ config, jobs, run: held.run })
    await change(config)
    const res = await post(restarted, config, { ...payload, ...more })
    assert.equal(res.status, status, what)
    const body = await res.json()
    assert.equal(body.code, code, what)
    assert.equal(body.accepted, true, what)
    assert.equal(body.jobId, first.jobId, what)
    assert.equal(held.calls.length, 1, `${what}: nothing started`)
    assert.equal((await job(restarted, config, first.jobId)).body.state, 'running', 'the record is untouched')

    const never = await post(restarted, config, { ...payload, ...more, jobKey: 'publish:fedcba9876543210' })
    assert.equal(never.status, status, what)
    const neverBody = await never.json()
    assert.equal(neverBody.code, code, what)
    assert.equal(neverBody.accepted, false, what)
    assert.equal('jobId' in neverBody, false, what)
    assert.equal(jobs.store.size, 1, what)
  }
})

test('a job store that cannot be READ is not "never taken": the keyed ask gets no refusal the web door could end on, whatever the host looks like now', async () => {
  const { hostRefusal } = await import('../../tracy-web/src/sites/publish-store.js')
  const rig = await reusable()
  for (const [what, , , change, more = {}] of HOST_CHANGES) {
    // isolated: a script held by this iteration is still at work when the next one starts.
    const config = await rig.apart()
    const held = heldRun()
    const store = memoryJobs()
    let unreadable = false
    const jobs = {
      accept: store.accept,
      accepted: store.accepted,
      put: (id, fields) => store.put(id, fields),
      get: async (id) => {
        if (unreadable) throw new Error('EIO: the job record could not be read')
        return store.get(id)
      }
    }
    const app = buildApp({ config, jobs, run: held.run })
    const payload = { label: 'lantern', op: 'live', jobKey: 'publish:0123456789abcdef' }
    await post(app, config, payload)
    // The host starts again (no guard), cannot read its records, and has changed.
    const restarted = buildApp({ config, jobs, run: held.run })
    unreadable = true
    await change(config)
    const res = await post(restarted, config, { ...payload, ...more })
    const answer = { status: res.status, body: await res.json().catch(() => null) }
    assert.equal(answer.status, 500, what)
    assert.equal(hostRefusal(answer), null, what)
    assert.notEqual(answer.body?.accepted, false, what)
    assert.equal(held.calls.length <= 1, true, `${what}: nothing started beside the first script`)
  }
})

// ── the acceptance mark: "was this key ever taken" does not hang on the job's record ─────────────

/** The job store as the host process wires it (`server.js`): files under `config.jobsDir`. */
function diskJobs(config) {
  return {
    put: (id, fields) => jobStore.putJob(config.jobsDir, id, fields),
    get: (id) => jobStore.readJob(config.jobsDir, id),
    accept: (id) => jobStore.acceptJob(config.jobsDir, id),
    accepted: (id) => jobStore.jobAccepted(config.jobsDir, id)
  }
}

/** What can become of a taken job's record on disk: `[what, damage(recordPath)]`. */
const RECORD_LOSSES = [
  ['the record was deleted', (file) => rm(file)],
  ['the record is not JSON any more', (file) => writeFile(file, '{"state":"runn')],
  ['the record is empty', (file) => writeFile(file, '')],
  [
    'the record cannot be read',
    async (file) => {
      // A folder under the record's name: reading it fails for every user, root included.
      await rm(file)
      await mkdir(file)
    }
  ]
]

test('a key the host took, whose record is then lost, on a host that has changed: every refusal still says the key WAS taken — never `accepted: false` — and nothing is started', async () => {
  const { hostRefusal } = await import('../../tracy-web/src/sites/publish-store.js')
  const rig = await reusable()
  for (const [lost, damage] of RECORD_LOSSES) {
    for (const [changed, status, code, change, more = {}] of HOST_CHANGES) {
      const what = `${lost}; ${changed}`
      // isolated: a script held by this iteration is still at work when the next one starts.
      const config = await rig.apart()
      const held = heldRun()
      const jobs = diskJobs(config)
      const app = buildApp({ config, jobs, run: held.run })
      const payload = { label: 'lantern', op: 'live', jobKey: 'publish:0123456789abcdef' }
      // The host takes the job; its 202 is the answer the caller never hears.
      const first = await (await post(app, config, payload)).json()
      assert.equal(first.jobId, keyedJobId('go-live:publish:0123456789abcdef'))
      await until(
        async () => (await jobStore.readJob(config.jobsDir, first.jobId))?.state,
        // The record reaches the disk a turn before the runner is called: wait for both.
        (state) => state === 'running' && held.calls.length > 0,
        'the script started'
      )
      assert.equal(held.calls.length, 1)
      // The host starts again with the script still at work, and the record goes.
      const restarted = buildApp({ config, jobs, run: held.run })
      await damage(path.join(config.jobsDir, `${first.jobId}.json`))
      assert.equal(await jobs.get(first.jobId), null, `${what}: the store reads "no record"`)
      await change(config)
      for (let ask = 0; ask < 2; ask++) {
        const res = await post(restarted, config, { ...payload, ...more })
        const answer = { status: res.status, body: await res.json() }
        assert.deepEqual(
          answer,
          {
            status,
            body: {
              code,
              ...(more.extra ? { why: 'refused extra' } : {}),
              accepted: true,
              jobId: first.jobId
            }
          },
          what
        )
        assert.equal(hostRefusal(answer), null, `${what}: nothing the web door may end on`)
      }
      assert.equal(held.calls.length, 1, `${what}: nothing started beside the first script`)
      assert.equal((await job(restarted, config, first.jobId)).status, 404, `${what}: outcome unknown`)

      // A key this host never saw, asked the same way on the same host: that one IS told so.
      const never = await post(restarted, config, { ...payload, ...more, jobKey: 'publish:fedcba9876543210' })
      assert.equal(never.status, status, what)
      assert.equal((await never.json()).accepted, false, what)
    }
  }
})

test('a taken key whose record is lost, on a host that is whole: the same key runs the job again under the same id, from a clean record', async () => {
  const rig = await reusable()
  for (const [lost, damage] of RECORD_LOSSES.slice(0, 3)) {
    // isolated: a script held by this iteration is still at work when the next one starts.
    const config = await rig.apart()
    const held = heldRun()
    const jobs = diskJobs(config)
    const payload = { label: 'lantern', op: 'live', jobKey: 'publish:0123456789abcdef' }
    const first = await (await post(buildApp({ config, jobs, run: held.run }), config, payload)).json()
    await until(
      () => held.calls.length,
      (n) => n === 1,
      'the script started'
    )
    const restarted = buildApp({ config, jobs, run: held.run })
    await damage(path.join(config.jobsDir, `${first.jobId}.json`))
    const again = await post(restarted, config, payload)
    assert.equal(again.status, 202, lost)
    assert.deepEqual(await again.json(), { jobId: first.jobId }, lost)
    await until(
      () => held.calls.length,
      (n) => n === 2,
      'the same key runs again'
    )
    held.calls[1].resolve({ code: 0, tail: [] })
    const ended = await until(
      () => job(restarted, config, first.jobId),
      (j) => j.body.state === 'done',
      'done'
    )
    assert.equal(ended.body.exitCode, 0, lost)
    assert.equal(ended.body.orphanedAt, null, lost)
    held.calls[0].resolve({ code: 0, tail: [] })
  }
})

test('the mark is on disk before the record is written, the script is started or 202 is answered — and it is the only thing a key leaves that no later write touches', async () => {
  const config = await configured()
  const held = heldRun()
  const disk = diskJobs(config)
  const id = keyedJobId('go-live:publish:0123456789abcdef')
  const order = []
  const jobs = {
    ...disk,
    accept: async (jobId) => {
      order.push(`accept:${await jobStore.jobAccepted(config.jobsDir, jobId)}:runs=${held.calls.length}`)
      await disk.accept(jobId)
    },
    put: async (jobId, fields) => {
      order.push(`put:${fields.state}:marked=${await jobStore.jobAccepted(config.jobsDir, jobId)}`)
      return disk.put(jobId, fields)
    }
  }
  const app = buildApp({ config, jobs, run: held.run })
  const res = await post(app, config, { label: 'lantern', op: 'live', jobKey: 'publish:0123456789abcdef' })
  assert.equal(res.status, 202)
  await until(
    () => held.calls.length,
    (n) => n === 1,
    'the script started'
  )
  assert.deepEqual(order.slice(0, 2), ['accept:false:runs=0', 'put:queued:marked=true'])
  const mark = path.join(config.jobsDir, `${id}.accepted`)
  const written = await readFile(mark, 'utf8')
  assert.equal(JSON.parse(written).id, id)
  held.calls[0].resolve({ code: 0, tail: [] })
  await until(
    () => job(app, config, id),
    (j) => j.body.state === 'done',
    'done'
  )
  assert.equal(await readFile(mark, 'utf8'), written, 'the run never rewrote the mark')
  assert.deepEqual(
    (await readdir(config.jobsDir)).sort(),
    [`${id}.accepted`, `${id}.json`],
    'no temp file left beside them'
  )

  // An ask without a key has nothing to be asked again by: it leaves no mark.
  const bare = await (await post(app, config, { label: 'harbor', op: 'live' })).json()
  await until(
    () => held.calls.length,
    (n) => n === 2,
    'the second script started'
  )
  assert.equal(await jobStore.jobAccepted(config.jobsDir, bare.jobId), false)
  held.calls[1].resolve({ code: 0, tail: [] })
})

test('a mark that cannot be written: the key is NOT taken — 503, no record, no script, the site left free — and the same key is taken once the store writes again', async () => {
  const { hostRefusal } = await import('../../tracy-web/src/sites/publish-store.js')
  const rig = await reusable()
  for (const [what, fail] of [
    ['the write throws', () => Promise.reject(Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }))],
    [
      'the write throws synchronously',
      () => {
        throw new Error('EIO')
      }
    ]
  ]) {
    const config = await rig.fresh()
    const held = heldRun()
    const store = memoryJobs()
    let broken = true
    const jobs = { ...store, accept: (id) => (broken ? fail() : store.accept(id)) }
    const app = buildApp({ config, jobs, run: held.run })
    const payload = { label: 'lantern', op: 'live', jobKey: 'publish:0123456789abcdef' }
    const res = await post(app, config, payload)
    const answer = { status: res.status, body: await res.json() }
    assert.equal(answer.status, 503, what)
    assert.equal(answer.body.code, 'JOB_STORE_UNAVAILABLE', what)
    assert.equal('accepted' in answer.body, false, `${what}: a failed write may still have left the mark`)
    assert.equal(hostRefusal(answer), null, what)
    assert.equal(store.store.size, 0, `${what}: no record`)
    assert.equal(held.calls.length, 0, `${what}: no script`)
    // The site is not held by the ask that was not taken.
    const other = await post(app, config, { label: 'lantern', op: 'live' })
    assert.equal(other.status, 202, what)
    await until(
      () => held.calls.length,
      (n) => n === 1,
      'the unkeyed job started'
    )
    held.calls[0].resolve({ code: 0, tail: [] })
    await until(
      () => store.store.values().next().value?.state,
      (state) => state === 'done',
      'the unkeyed job ended'
    )
    broken = false
    const taken = await post(app, config, payload)
    assert.equal(taken.status, 202, what)
    assert.equal(store.marks.size, 1, what)
    await until(
      () => held.calls.length,
      (n) => n === 2,
      'the keyed job started'
    )
    held.calls[1].resolve({ code: 0, tail: [] })
    await until(
      () => [...store.store.values()].map((record) => record.state),
      (states) => states.length === 2 && states.every((state) => state === 'done'),
      `${what}: both jobs ended before the folders are reused`
    )
  }

  // The real store, with a jobs directory that cannot take a file: the same answer.
  const config = await configured()
  await rm(config.jobsDir, { recursive: true })
  await writeFile(config.jobsDir, 'not a directory')
  const held = heldRun()
  const app = buildApp({ config, jobs: diskJobs(config), run: held.run })
  const res = await post(app, config, { label: 'lantern', op: 'live', jobKey: 'publish:0123456789abcdef' })
  assert.equal(res.status, 503)
  const body = await res.json()
  assert.equal(body.code, 'JOB_STORE_UNAVAILABLE')
  assert.equal('accepted' in body, false)
  assert.equal(held.calls.length, 0)
})

test('a mark that cannot be LOOKED AT is neither yes nor no: every refusal to that key carries no `accepted`, whatever the record store says', async () => {
  const { hostRefusal } = await import('../../tracy-web/src/sites/publish-store.js')
  const coded = (code) => Object.assign(new Error(`${code}: the mark could not be read`), { code })
  /** `[what, accepted()]` — how a store may fail to say whether the mark is there. */
  const UNKNOWN = [
    ['EACCES', () => Promise.reject(coded('EACCES'))],
    ['EIO', () => Promise.reject(coded('EIO'))],
    ['ENOTDIR', () => Promise.reject(coded('ENOTDIR'))],
    [
      'a synchronous throw',
      () => {
        throw coded('EIO')
      }
    ],
    ['an answer that is not a boolean', async () => undefined],
    ['an answer that is null', async () => null],
    ['an answer that is the string "false"', async () => 'false']
  ]
  const rig = await reusable()
  for (const [how, accepted] of UNKNOWN) {
    for (const [changed, status, code, change, more = {}] of HOST_CHANGES) {
      const what = `${how}; ${changed}`
      const config = await rig.fresh()
      const held = heldRun()
      const store = memoryJobs()
      const app = buildApp({ config, jobs: { ...store, accepted }, run: held.run })
      await change(config)
      const res = await post(app, config, {
        label: 'lantern',
        op: 'live',
        jobKey: 'publish:0123456789abcdef',
        ...more
      })
      const answer = { status: res.status, body: await res.json() }
      assert.equal(answer.status, status, what)
      assert.equal(answer.body.code, code, what)
      assert.equal('accepted' in answer.body, false, what)
      assert.equal(hostRefusal(answer), null, what)
      assert.equal(held.calls.length, 0, what)
      assert.equal(store.store.size, 0, what)
    }
  }

  // The real store: a jobs directory that is a file, and something that is not a file under the
  // mark's own name.
  const id = keyedJobId('go-live:publish:0123456789abcdef')
  for (const [how, spoil] of [
    [
      'the jobs directory is a file',
      async (config) => {
        await rm(config.jobsDir, { recursive: true })
        await writeFile(config.jobsDir, 'not a directory')
      }
    ],
    ['a folder under the mark’s name', (config) => mkdir(path.join(config.jobsDir, `${id}.accepted`))],
    [
      'a link under the mark’s name',
      (config) => symlink('/nowhere/at/all', path.join(config.jobsDir, `${id}.accepted`))
    ]
  ]) {
    const config = await rig.fresh()
    await spoil(config)
    await rm(path.join(config.privateRoot, 'lantern'), { recursive: true })
    const held = heldRun()
    const app = buildApp({ config, jobs: diskJobs(config), run: held.run })
    const res = await post(app, config, { label: 'lantern', op: 'live', jobKey: 'publish:0123456789abcdef' })
    const answer = { status: res.status, body: await res.json() }
    assert.deepEqual(answer, { status: 404, body: { code: 'NOT_FOUND' } }, how)
    assert.equal(hostRefusal(answer), null, how)
  }
})

test('no mark and no record: the key was never taken, and the real store says so — `accepted: false`, the one refusal the web door ends on', async () => {
  const { hostRefusal } = await import('../../tracy-web/src/sites/publish-store.js')
  const rig = await reusable()
  for (const [changed, status, code, change, more = {}] of HOST_CHANGES) {
    for (const jobsDirThere of [true, false]) {
      const what = `${changed}; jobs directory ${jobsDirThere ? 'empty' : 'not there yet'}`
      const config = await rig.fresh()
      if (!jobsDirThere) await rm(config.jobsDir, { recursive: true })
      const held = heldRun()
      const app = buildApp({ config, jobs: diskJobs(config), run: held.run })
      await change(config)
      const res = await post(app, config, {
        label: 'lantern',
        op: 'live',
        jobKey: 'publish:0123456789abcdef',
        ...more
      })
      const answer = { status: res.status, body: await res.json() }
      assert.equal(answer.status, status, what)
      assert.equal(answer.body.accepted, false, what)
      assert.equal('jobId' in answer.body, false, what)
      assert.equal(hostRefusal(answer), code, what)
      assert.equal(held.calls.length, 0, what)
    }
  }
})

test('a record with no mark beside it still says the key was taken: a record is only ever left by a key this host took', async () => {
  const rig = await reusable()
  for (const [changed, status, code, change, more = {}] of HOST_CHANGES) {
    // isolated: a script held by this iteration is still at work when the next one starts.
    const config = await rig.apart()
    const held = heldRun()
    const jobs = diskJobs(config)
    const payload = { label: 'lantern', op: 'live', jobKey: 'publish:0123456789abcdef' }
    const first = await (await post(buildApp({ config, jobs, run: held.run }), config, payload)).json()
    await until(
      () => held.calls.length,
      (n) => n === 1,
      'the script started'
    )
    await rm(path.join(config.jobsDir, `${first.jobId}.accepted`))
    const restarted = buildApp({ config, jobs, run: held.run })
    await change(config)
    const res = await post(restarted, config, { ...payload, ...more })
    assert.equal(res.status, status, changed)
    const body = await res.json()
    assert.equal(body.code, code, changed)
    assert.equal(body.accepted, true, changed)
    assert.equal(body.jobId, first.jobId, changed)
    assert.equal(held.calls.length, 1, changed)
  }
})

test('two asks for one key that arrive together with the folder vanishing between them: the second is told the job the first was given, never "never taken"', async () => {
  const config = await configured()
  const held = heldRun()
  const store = memoryJobs()
  // The first ask is held inside its record write; the folder goes while it waits there.
  let letPut
  const putHeld = new Promise((resolve) => (letPut = resolve))
  let puts = 0
  const jobs = {
    accept: store.accept,
    accepted: store.accepted,
    get: (id) => store.get(id),
    put: async (id, fields) => {
      if (++puts === 1) await putHeld
      return store.put(id, fields)
    }
  }
  const app = buildApp({ config, jobs, run: held.run })
  const payload = { label: 'lantern', op: 'live', jobKey: 'publish:0123456789abcdef' }
  const a = post(app, config, payload)
  await until(
    () => puts,
    (n) => n === 1,
    'the first ask reached its record'
  )
  await rm(path.join(config.privateRoot, 'lantern'), { recursive: true })
  const b = post(app, config, payload)
  letPut()
  const [first, second] = [await (await a).json(), await b]
  assert.equal(second.status, 202)
  assert.deepEqual(await second.json(), { jobId: first.jobId, reused: true })
  await until(
    () => held.calls.length,
    (n) => n === 1,
    'one script'
  )
  held.calls[0].resolve({ code: 0, tail: [] })
})

// ── the job key: asking again is not a second go-live ────────────────────────────────────────────

test('the same job key names the same job: asked again while it runs, and after it ended, nothing new starts', async () => {
  const config = await configured()
  const held = heldRun()
  const jobs = memoryJobs()
  const app = buildApp({ config, jobs, run: held.run })
  const ask = () => post(app, config, { label: 'lantern', op: 'live', jobKey: 'publish:0123456789abcdef' })
  // Together, as a door and a reader that both lost patience send them.
  const [a, b] = await Promise.all([ask(), ask()])
  assert.deepEqual([a.status, b.status], [202, 202])
  const first = await a.json()
  const second = await b.json()
  assert.equal(first.jobId, second.jobId)
  assert.equal([first, second].filter((answer) => answer.reused === true).length, 1)
  await until(
    () => held.calls.length,
    (n) => n >= 1,
    'run'
  )
  const during = await (await ask()).json()
  assert.deepEqual(during, { jobId: first.jobId, reused: true })
  held.calls[0].resolve({ code: 0, tail: ['TRACY_RESULT go_live=live label=lantern platform=none'] })
  await until(
    () => job(app, config, first.jobId),
    (j) => j.body.state === 'done',
    'done'
  )
  const after = await ask()
  assert.equal(after.status, 202)
  assert.deepEqual(await after.json(), { jobId: first.jobId, reused: true })
  assert.equal(held.calls.length, 1, 'the script ran once for four asks')
  assert.equal(jobs.store.size, 1)
})

test('a record that is no outcome is run again under the same key: after a restart marked it failed, and after the script found the site locked', async () => {
  const config = await configured()
  const held = heldRun()
  const jobs = memoryJobs()
  const app = buildApp({ config, jobs, run: held.run })
  const ask = () => post(app, config, { label: 'lantern', op: 'live', jobKey: 'publish:0123456789abcdef' })
  const first = await (await ask()).json()
  await until(
    () => held.calls.length,
    (n) => n === 1,
    'first run'
  )
  // The script found the site held by an earlier run (exit 75): the job ends, the operation did not.
  held.calls[0].resolve({
    code: 75,
    tail: ['!! another go-live of lantern is running — nothing was changed']
  })
  const busy = await until(
    () => job(app, config, first.jobId),
    (j) => j.body.state === 'failed',
    'busy'
  )
  assert.equal(busy.body.busy, true)
  assert.equal(busy.body.exitCode, 75)

  const again = await ask()
  assert.equal(again.status, 202)
  const second = await again.json()
  assert.equal(second.jobId, first.jobId, 'the same key is the same job')
  assert.notEqual(second.reused, true, 'and it was started again')
  await until(
    () => held.calls.length,
    (n) => n === 2,
    'second run'
  )
  const running = await job(app, config, first.jobId)
  assert.equal(running.body.state, 'running')
  assert.equal(running.body.busy, false, 'nothing of the run before reads as this one')
  assert.equal(running.body.exitCode, null)
  assert.equal(running.body.output, null)
  // While it runs the same key is the same job, and another key is refused.
  assert.deepEqual(await (await ask()).json(), { jobId: first.jobId, reused: true })
  assert.equal(held.calls.length, 2)

  // tracy-host restarts under it: the record is marked failed as orphaned (`orphanJobs`).
  await jobs.put(first.jobId, { state: 'failed', detail: 'tracy-host restarted', orphanedAt: Date.now() })
  const restarted = buildApp({ config, jobs, run: held.run })
  const third = await post(restarted, config, {
    label: 'lantern',
    op: 'live',
    jobKey: 'publish:0123456789abcdef'
  })
  assert.equal(third.status, 202)
  assert.notEqual((await third.json()).reused, true)
  await until(
    () => held.calls.length,
    (n) => n === 3,
    'third run'
  )
  assert.equal((await job(restarted, config, first.jobId)).body.orphanedAt, null)
  held.calls[2].resolve({ code: 0, tail: ['TRACY_RESULT go_live=live label=lantern platform=none'] })
  const done = await until(
    () => job(restarted, config, first.jobId),
    (j) => j.body.state === 'done',
    'done'
  )
  assert.equal(done.body.busy, false)
  // A real ending is kept: asked again, nothing runs.
  const after = await post(restarted, config, {
    label: 'lantern',
    op: 'live',
    jobKey: 'publish:0123456789abcdef'
  })
  assert.deepEqual(await after.json(), { jobId: first.jobId, reused: true })
  assert.equal(held.calls.length, 3)
  assert.equal(jobs.store.size, 1)
})

test('a script that failed by its own exit is an outcome: the same key answers that job and runs nothing', async () => {
  const config = await configured()
  const held = heldRun()
  const jobs = memoryJobs()
  const app = buildApp({ config, jobs, run: held.run })
  const ask = () => post(app, config, { label: 'lantern', op: 'draft', jobKey: 'publish:fedcba9876543210' })
  const first = await (await ask()).json()
  await until(
    () => held.calls.length,
    (n) => n === 1,
    'run'
  )
  held.calls[0].resolve({ code: 1, tail: ['!! could not reload Apache'] })
  const failed = await until(
    () => job(app, config, first.jobId),
    (j) => j.body.state === 'failed',
    'failed'
  )
  assert.notEqual(failed.body.busy, true)
  assert.deepEqual(await (await ask()).json(), { jobId: first.jobId, reused: true })
  assert.equal(held.calls.length, 1)
})

test('a run that threw with its script still at work is no outcome: the record carries no exit code, and the same key runs the job again', async () => {
  const config = await configured()
  const held = heldRun()
  const jobs = memoryJobs()
  const app = buildApp({ config, jobs, run: held.run })
  const ask = () => post(app, config, { label: 'lantern', op: 'live', jobKey: 'publish:00000000000000a1' })
  const first = await (await ask()).json()
  await until(
    () => held.calls.length,
    (n) => n === 1,
    'first run'
  )
  // The log could not be appended to: `run` throws, and the child it started is still running.
  held.calls[0].reject(new Error("ENOSPC: no space left on device, open 'go-live-lantern.log'"))
  const lost = await until(
    () => job(app, config, first.jobId),
    (j) => j.body.state === 'failed',
    'unobserved'
  )
  assert.equal(lost.body.unobserved, true)
  assert.equal(lost.body.exitCode, null, 'no exit code: nothing here says the script stopped')
  assert.notEqual(lost.body.busy, true)
  assert.match(lost.body.detail, /ENOSPC/)

  // Asked again: not "that job, ended" — it is run again, and finds the first script on the lock.
  const again = await (await ask()).json()
  assert.equal(again.jobId, first.jobId)
  assert.notEqual(again.reused, true)
  await until(
    () => held.calls.length,
    (n) => n === 2,
    'second run'
  )
  assert.equal((await job(app, config, first.jobId)).body.unobserved, false)
  held.calls[1].resolve({ code: 75, tail: ['!! another go-live of lantern is running'] })
  const busy = await until(
    () => job(app, config, first.jobId),
    (j) => j.body.busy === true,
    'busy'
  )
  assert.equal(busy.body.exitCode, 75)
  // Once the first script is gone, a run goes through and that is the outcome.
  assert.notEqual((await (await ask()).json()).reused, true)
  await until(
    () => held.calls.length,
    (n) => n === 3,
    'third run'
  )
  held.calls[2].resolve({ code: 0, tail: ['TRACY_RESULT go_live=live label=lantern platform=none'] })
  await until(
    () => job(app, config, first.jobId),
    (j) => j.body.state === 'done' && j.body.exitCode === 0,
    'done'
  )
  assert.deepEqual(await (await ask()).json(), { jobId: first.jobId, reused: true })
  assert.equal(held.calls.length, 3)
})

test('an ending the job store could not write is no outcome either: no `done`, no script failure, and the same key runs again', async () => {
  const rig = await reusable()
  for (const scene of ['ending-lost', 'every-write-lost', 'never-started', 'no-exit-code']) {
    const config = await rig.fresh()
    const held = heldRun()
    const jobs = memoryJobs()
    const put = jobs.put
    /** @type {(fields: Record<string, unknown>) => boolean} */
    let refuse = () => false
    jobs.put = async (id, fields) => {
      if (refuse(fields)) throw new Error('EIO: job store')
      return put(id, fields)
    }
    const app = buildApp({ config, jobs, run: held.run })
    const ask = () => post(app, config, { label: 'lantern', op: 'draft', jobKey: 'publish:00000000000000b2' })
    if (scene === 'never-started') refuse = (fields) => fields.state === 'running'
    const first = await (await ask()).json()
    if (scene === 'never-started') {
      // The record could not be moved to `running`: the script was never started.
      await new Promise((r) => setTimeout(r, 20))
      assert.equal(held.calls.length, 0, scene)
    } else {
      await until(
        () => held.calls.length,
        (n) => n === 1,
        `${scene}: first run`
      )
      // The script itself went through; what fails is the record of it.
      if (scene === 'ending-lost') refuse = (fields) => Number.isInteger(fields.exitCode)
      if (scene === 'every-write-lost') refuse = () => true
      held.calls[0].resolve(
        scene === 'no-exit-code'
          ? { code: null, tail: ['killed'] }
          : { code: 0, tail: ['TRACY_RESULT go_live=draft label=lantern platform=none'] }
      )
      await new Promise((r) => setTimeout(r, 20))
    }
    const record = (await job(app, config, first.jobId)).body
    assert.notEqual(record.state, 'done', scene)
    assert.equal(
      Number.isInteger(record.exitCode),
      false,
      `${scene}: a record nobody could write the ending of names no exit code`
    )
    if (scene === 'ending-lost' || scene === 'no-exit-code') assert.equal(record.unobserved, true, scene)
    refuse = () => false
    const ran = held.calls.length
    const again = await (await ask()).json()
    assert.equal(again.jobId, first.jobId, scene)
    assert.notEqual(again.reused, true, `${scene}: asked again, the job is run again`)
    await until(
      () => held.calls.length,
      (n) => n === ran + 1,
      `${scene}: run again`
    )
    held.calls[ran].resolve({ code: 0, tail: ['TRACY_RESULT go_live=draft label=lantern platform=none'] })
    const done = await until(
      () => job(app, config, first.jobId),
      (j) => j.body.state === 'done',
      `${scene}: done`
    )
    assert.equal(done.body.exitCode, 0, scene)
    assert.equal(done.body.unobserved, false, scene)
  }
})

test('another key while a job holds the site is refused GO_LIVE_BUSY; a key that is not one is refused 400', async () => {
  const config = await configured()
  const held = heldRun()
  const jobs = memoryJobs()
  const app = buildApp({ config, jobs, run: held.run })
  const first = await (
    await post(app, config, { label: 'lantern', op: 'live', jobKey: 'publish:aaaaaaaaaaaaaaaa' })
  ).json()
  const other = await post(app, config, { label: 'lantern', op: 'live', jobKey: 'publish:bbbbbbbbbbbbbbbb' })
  assert.equal(other.status, 409)
  assert.deepEqual(await other.json(), { code: 'GO_LIVE_BUSY', jobId: first.jobId, op: 'live' })
  for (const jobKey of [
    '',
    'short',
    'has space in it',
    7,
    null,
    ['publish:aaaaaaaaaaaaaaaa'],
    'x'.repeat(121)
  ]) {
    const res = await post(app, config, { label: 'harbor', op: 'live', jobKey })
    assert.equal(res.status, 400, JSON.stringify(jobKey))
  }
  assert.equal(jobs.store.size, 1)
})

// ── the real go-live.sh ──────────────────────────────────────────────────────────────────────────

const PROVISION = fileURLToPath(
  new URL('../../../packages/fleet/tracy-fleet-operation/scripts/provision/', import.meta.url)
)

/** A host's tunnel credentials, with nothing said about where tracy-web listens. */
const bedEnv = () => ({
  TRACY_CF_API_TOKEN: 'cf-tok',
  TRACY_CF_ACCOUNT_ID: 'acct-1',
  TRACY_TUNNEL_ID: 'tun-1'
})
/** tracy-web's local address on the host of these tests: where an own domain's rule leads (#1037). */
const WEB_SERVICE = 'http://127.0.0.1:51710'

// The stand-ins never change from one bed to the next, so beds share one `bin/` made on first use.
// A fresh executable pays a first-run cost (about 0.2 s per bed measured on macOS), which a shared
// one pays once. A test that edits a stand-in asks for `ownBin` and gets a private copy.
let sharedBin = null
const stubBin = () => {
  sharedBin ??= tmpDir('stubs').then(async (dir) => {
    await writeStubs(dir)
    return dir
  })
  return sharedBin
}

async function writeStubs(bin) {
  const real = spawnSync('bash', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim()
  assert.notEqual(real, '', 'python3 is needed to take the go-live lock')
  const stubs = {
    iptables: `#!/bin/bash
echo "iptables $*" >> "$STUB/calls"
case "$1" in
  # As iptables answers a check: 0 the rule is there, 1 it is not, anything else "could not look"
  # (4: the xtables lock is held, or no permission).
  -C) { [ -e "$STUB/fail-iptables-S" ] || [ -e "$STUB/fail-iptables-C" ]; } && exit 4
      { [ -e "$STUB/rule" ] || [ -e "$STUB/hidden-rule" ]; } && exit 0; exit 1 ;;
  -S) [ -e "$STUB/fail-iptables-S" ] && { echo "iptables: Permission denied (you must be root)" >&2; exit 4; }
      echo "-N DOCKER-USER"
      [ -e "$STUB/rule" ] && echo "-A DOCKER-USER -s 172.30.0.0/24 -j TRACY-FLEET-EGRESS"
      # The same rule as another iptables would spell it: there, and not as the script writes it.
      [ -e "$STUB/hidden-rule" ] && echo "-A DOCKER-USER -s 172.30.0.0/255.255.255.0 -j TRACY-FLEET-EGRESS"
      [ -e "$STUB/other-rule" ] && echo "-A DOCKER-USER -s 172.30.9.0/24 -j TRACY-FLEET-EGRESS"
      echo "-A DOCKER-USER -j RETURN"; exit 0 ;;
  -D) [ -e "$STUB/fail-iptables-D" ] && exit 1; rm -f "$STUB/rule" ;;
  -I) [ -e "$STUB/fail-iptables-I" ] && exit 1; [ -e "$STUB/lose-iptables-I" ] || : > "$STUB/rule" ;;
esac
`,
    'netfilter-persistent': `#!/bin/bash
echo "netfilter-persistent $*" >> "$STUB/calls"
[ -e "$STUB/fail-save" ] && exit 1
exit 0
`,
    docker: `#!/bin/bash
echo "docker $*" >> "$STUB/calls"
case "$1 $2" in
  "network inspect") [ -e "$STUB/fail-subnet" ] && exit 1; echo 172.30.0.0/24 ;;
  "compose exec") [ -e "$STUB/fail-graceful" ] && exit 1; exit 0 ;;
  "compose restart") [ -e "$STUB/fail-restart" ] && exit 1; exit 0 ;;
esac
`,
    python3: `#!/bin/bash
# The site's go-live lock is taken with \`python3 -c\`: the real interpreter, on the descriptor the
# script handed down. Managed frame policy receipts use stdin, without a tunnel request.
# Other calls are ingress operations and are written down for the test to find.
if [ "$1" = "-c" ] || [ "$1" = "-" ]; then exec "${real}" "$@"; fi
echo "python3 $*" >> "$STUB/calls"
# With \`$STUB/tunnel\` there, this stands in for ingress_api.py: the tunnel's rules are the files
# \`$STUB/tunnel/<hostname>\` (content: the port of a rule straight to a site, or the service of a
# rule to tracy-web). \`$STUB/ingress-exit-<hostname>\` names the exit code of the next call for
# that name instead (the provider failing). Whose rule a name is, is decided as the real script
# decides it, minus the owner record (tested against the real script in teardown-ingress.test.mjs):
# a rule to another port or another service is somebody else's (exit 3).
[ -d "$STUB/tunnel" ] || exit 1
host=""; port=""; only=""; service=""; takeover=""; remove=0; prev=""
for a in "$@"; do
  case "$prev" in
    --hostname) host="$a" ;; --port) port="$a" ;; --only-port) only="$a" ;;
    --service) service="$a" ;; --takeover-port) takeover="$a" ;;
  esac
  [ "$a" = "--remove" ] && remove=1
  prev="$a"
done
[ -n "$TRACY_CF_API_TOKEN" ] || { echo "need TRACY_CF_API_TOKEN, TRACY_CF_ACCOUNT_ID and TRACY_TUNNEL_ID" >&2; exit 1; }
if [ -e "$STUB/ingress-exit-$host" ]; then exit "$(cat "$STUB/ingress-exit-$host")"; fi
now=""; [ -e "$STUB/tunnel/$host" ] && now="$(cat "$STUB/tunnel/$host")"
if [ "$remove" = 1 ]; then
  if [ -n "$only" ] && [ -n "$now" ] && [ "$now" != "$only" ] && [ "$now" != "$service" ]; then exit 3; fi
  rm -f "$STUB/tunnel/$host"
elif [ -n "$service" ]; then
  if [ -n "$now" ] && [ "$now" != "$service" ] && [ "$now" != "$takeover" ]; then exit 3; fi
  printf %s "$service" > "$STUB/tunnel/$host"
else
  printf %s "$port" > "$STUB/tunnel/$host"
fi
exit 0
`
  }
  await mkdir(bin, { recursive: true })
  for (const [name, text] of Object.entries(stubs)) {
    await writeFile(path.join(bin, name), text)
    await chmod(path.join(bin, name), 0o755)
  }
}

/**
 * A site folder and a `bin/` of stand-ins put first on PATH. What each stand-in does is read from
 * files under `state/` the test writes:
 *   state/rule            exists ⇔ the mail egress rule is in the chain
 *   state/fail-<what>     exists ⇔ that call fails: iptables-S · iptables-C · iptables-D · iptables-I · save ·
 *                         graceful · restart · subnet
 *   state/lose-iptables-I exists ⇔ the insert reports success and changes nothing
 *   state/calls           every stand-in call, one per line
 */
async function scriptBed({ port = 8123, rule = true, ownBin = false } = {}) {
  const root = await tmpDir('golive')
  const bin = ownBin ? path.join(root, 'bin') : await stubBin()
  const state = path.join(root, 'state')
  const site = path.join(root, 'private', 'lantern')
  await mkdir(state, { recursive: true })
  await mkdir(path.join(site, 'apache'), { recursive: true })
  await writeFile(path.join(site, '.env'), `HOST_PORT=${port}\nDB_PASSWORD=pw\n`)
  await writeFile(path.join(site, 'apache', 'tracy-noindex.conf'), 'before\n')
  if (rule) await writeFile(path.join(state, 'rule'), '')
  if (ownBin) await writeStubs(bin)
  const baseline = await snapshotTree(root)
  const fail = (what) => writeFile(path.join(state, `fail-${what}`), '')
  const heal = (what) => rm(path.join(state, `fail-${what}`), { force: true })
  const read = (file) => readFile(file, 'utf8').catch(() => null)
  const args = (op, platform) => [
    path.join(PROVISION, 'go-live.sh'),
    '--label',
    'lantern',
    '--op',
    op,
    '--root',
    path.join(root, 'private'),
    '--platform',
    platform
  ]
  const env = (extra) => ({ PATH: `${bin}:/usr/bin:/bin`, STUB: state, ...extra })
  const run = (op, extra = {}, platform = 'none', domains = []) => {
    const result = spawnSync('bash', [...args(op, platform), ...domains.flatMap((d) => ['--domain', d])], {
      encoding: 'utf8',
      timeout: 60_000,
      env: env(extra)
    })
    assert.equal(result.error, undefined)
    return { code: result.status, out: `${result.stdout}${result.stderr}` }
  }
  const CF = {
    TRACY_CF_API_TOKEN: 'cf-tok',
    TRACY_CF_ACCOUNT_ID: 'acct-1',
    TRACY_TUNNEL_ID: 'tun-1',
    // Where tracy-web listens on this host: the service a customer's own domain is sent to (#1037).
    TRACY_OWN_DOMAIN_SERVICE: WEB_SERVICE
  }
  return {
    site,
    state,
    root,
    /**
     * Put the bed back as `scriptBed()` made it, for the next iteration of a matrix: only what the
     * iteration before added, removed, replaced or locked is put right (see `reconcile`), so the
     * `.env`, the conf and the rule keep their inode and times when they were not touched.
     * `rule` asks for the rule file present or not, whatever the bed was made with.
     */
    async fresh({ rule: ruleThere = rule } = {}) {
      const want = new Map(baseline)
      if (!ruleThere) want.delete('state/rule')
      else if (!want.has('state/rule')) want.set('state/rule', { kind: 'file', mode: 0o644, text: '' })
      await reconcile(root, want)
      return this
    },
    fail,
    heal,
    /** Give this bed a tunnel (the python3 stand-in keeps its rules as files). */
    tunnel: () => mkdir(path.join(state, 'tunnel'), { recursive: true }),
    /** A run that carries domains, on a host with tunnel credentials. */
    withDomains: (op, domains, extra = {}) => run(op, { ...CF, ...extra }, 'none', domains),
    /** The tunnel's rules: `{ hostname: port }`. */
    rules: async () => {
      const out = {}
      for (const name of await readdir(path.join(state, 'tunnel')).catch(() => []))
        out[name] = await read(path.join(state, 'tunnel', name))
      return out
    },
    route: (hostname, port) => writeFile(path.join(state, 'tunnel', hostname), String(port)),
    ingressExit: (hostname, code) =>
      code === null
        ? rm(path.join(state, `ingress-exit-${hostname}`), { force: true })
        : writeFile(path.join(state, `ingress-exit-${hostname}`), String(code)),
    ledger: async () => ((await read(path.join(site, '.golive-domains'))) ?? '').split('\n').filter(Boolean),
    lose: (what) => writeFile(path.join(state, `lose-${what}`), ''),
    flag: (name) => writeFile(path.join(state, name), ''),
    run,
    ruleIn: async () => (await read(path.join(state, 'rule'))) !== null,
    conf: () => read(path.join(site, 'apache', 'tracy-noindex.conf')),
    calls: async () => ((await read(path.join(state, 'calls'))) ?? '').split('\n').filter(Boolean)
  }
}
const RESULT = /^TRACY_RESULT go_live=/m

test('go-live.sh live then draft, no domain: every step through → exit 0 and the closing line of that direction, run twice the same', async () => {
  const bed = await scriptBed()
  for (const round of [1, 2]) {
    const { code, out } = bed.run('live')
    assert.equal(code, 0, `round ${round}: ${out}`)
    assert.match(out, /==> mail egress: OPEN/)
    assert.match(out, /==> noindex: off/)
    assert.match(out, /^TRACY_RESULT go_live=live label=lantern /m)
    assert.doesNotMatch(out, /==> ingress:/)
    assert.equal(await bed.ruleIn(), false)
    assert.doesNotMatch(await bed.conf(), /^Header always set X-Robots-Tag/m)
  }
  for (const round of [1, 2]) {
    const { code, out } = bed.run('draft')
    assert.equal(code, 0, `round ${round}: ${out}`)
    assert.match(out, /==> mail egress: BLOCKED/)
    assert.match(out, /==> noindex: on/)
    assert.match(out, /^TRACY_RESULT go_live=draft label=lantern /m)
    assert.equal(await bed.ruleIn(), true)
    assert.match(await bed.conf(), /X-Robots-Tag/)
  }
  assert.equal(
    (await bed.calls()).some((line) => line.startsWith('python3')),
    false,
    'the tunnel is never called without a domain'
  )
})

test('go-live.sh: a required step that fails ends the script non-zero, with no closing line', async () => {
  const cases = [
    ['live', 'iptables-D', /could not remove the mail egress rule/],
    ['draft', 'iptables-I', /could not put the mail egress rule back/],
    ['live', 'subnet', /subnet/],
    ['live', 'save', /could not save the firewall rules/],
    ['draft', 'save', /could not save the firewall rules/]
  ]
  const rigged = await scriptBed()
  for (const [op, what, said] of cases) {
    const bed = await rigged.fresh({ rule: op === 'live' })
    await bed.fail(what)
    const { code, out } = bed.run(op)
    assert.notEqual(code, 0, `${op} ${what}: ${out}`)
    assert.match(out, said, `${op} ${what}`)
    assert.doesNotMatch(out, RESULT, `${op} ${what}`)
    assert.doesNotMatch(out, /==> noindex:/, `${op} ${what}: the later steps did not run`)
  }
  // The mail rule that would not go is still there, and the script did not say OPEN.
  const bed = await scriptBed()
  await bed.fail('iptables-D')
  const stuck = bed.run('live')
  assert.doesNotMatch(stuck.out, /mail egress: OPEN/)
  assert.equal(await bed.ruleIn(), true)
})

test('go-live.sh: Apache that takes neither a reload nor a restart, or a conf that cannot be written, ends it non-zero', async () => {
  const rigged = await scriptBed()
  for (const op of ['live', 'draft']) {
    const bed = await rigged.fresh({ rule: op === 'live' })
    await bed.fail('graceful')
    const restarted = bed.run(op)
    assert.equal(restarted.code, 0, `${op}: a restart is a reload — ${restarted.out}`)
    assert.match(restarted.out, RESULT)

    await bed.fail('restart')
    const neither = bed.run(op)
    assert.notEqual(neither.code, 0, `${op}: ${neither.out}`)
    assert.match(neither.out, /could not reload Apache/)
    assert.doesNotMatch(neither.out, RESULT)
    assert.doesNotMatch(neither.out, /==> noindex:/)
  }
  // The conf writer refuses (an origin it will not put in a conf): a live must not fall through to
  // writing noindex back on, and must not end 0.
  const bed = await scriptBed()
  const refused = bed.run('live', { TRACY_ORIGIN: 'not an origin' })
  assert.notEqual(refused.code, 0, refused.out)
  assert.match(refused.out, /could not write the noindex conf/)
  assert.doesNotMatch(refused.out, RESULT)
  assert.equal(await bed.conf(), 'before\n', 'the conf was not rewritten either way')
  assert.equal(
    (await bed.calls()).some((line) => line.startsWith('docker compose')),
    false
  )
})

// ── a firewall that cannot be read ───────────────────────────────────────────────────────────────

test('go-live.sh: a firewall chain that cannot be READ ends the script — it is never taken for "no rule"', async () => {
  const rigged = await scriptBed()
  for (const op of ['live', 'draft']) {
    const bed = await rigged.fresh({ rule: true })
    await bed.fail('iptables-S')
    const { code, out } = bed.run(op)
    assert.notEqual(code, 0, `${op}: ${out}`)
    assert.match(out, /could not read the firewall chain DOCKER-USER/, op)
    assert.doesNotMatch(out, /mail egress: (OPEN|BLOCKED)/, op)
    assert.doesNotMatch(out, RESULT, op)
    assert.doesNotMatch(out, /==> noindex:/, `${op}: the later steps did not run`)
    assert.equal(await bed.ruleIn(), true, `${op}: nothing was changed`)
    const calls = await bed.calls()
    assert.equal(
      calls.some((line) => /^iptables -[DI]/.test(line)),
      false,
      `${op}: no blind write`
    )
    assert.equal(
      calls.some((line) => line.startsWith('iptables -C')),
      false,
      op
    )
  }
})

test("go-live.sh: only this site's own rule counts as its mail rule, and an insert that left no rule is not a closed door", async () => {
  // Another site's rule in the chain is not this site's: a live has nothing to delete.
  const other = await scriptBed({ rule: false })
  await other.flag('other-rule')
  const live = other.run('live')
  assert.equal(live.code, 0, live.out)
  assert.equal(
    (await other.calls()).some((line) => line.startsWith('iptables -D')),
    false
  )
  // …and a draft still has to add its own.
  const draft = other.run('draft')
  assert.equal(draft.code, 0, draft.out)
  assert.equal(await other.ruleIn(), true)

  const lost = await scriptBed({ rule: false })
  await lost.lose('iptables-I')
  const { code, out } = lost.run('draft')
  assert.notEqual(code, 0, out)
  assert.match(out, /is not in the chain after adding it/)
  assert.doesNotMatch(out, /mail egress: BLOCKED/)
  assert.doesNotMatch(out, RESULT)
})

// ── one go-live script per site ──────────────────────────────────────────────────────────────────

/** Hold a site's go-live lock from another process, as a running go-live.sh does. */
function holdGoLiveLock(privateRoot, label) {
  const holder = spawn(
    'python3',
    [
      '-c',
      'import fcntl, sys, time\nf = open(sys.argv[1], "a")\nfcntl.flock(f, fcntl.LOCK_EX)\nprint("held", flush=True)\ntime.sleep(120)',
      path.join(privateRoot, `.go-live-${label}.lock`)
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  )
  const held = new Promise((resolve, reject) => {
    holder.stdout.once('data', () => resolve())
    holder.once('exit', (code) => reject(new Error(`the lock holder ended early (${code})`)))
  })
  const closed = new Promise((resolve) => holder.once('close', () => resolve()))
  return {
    held,
    release() {
      holder.kill('SIGKILL')
      return closed
    }
  }
}

test('go-live.sh beside another go-live of the same site ends at once with 75, having read and changed nothing — live and draft', async () => {
  const bed = await scriptBed()
  const lock = holdGoLiveLock(path.dirname(bed.site), 'lantern')
  try {
    await lock.held
    for (const op of ['live', 'draft']) {
      const { code, out } = bed.run(op)
      assert.equal(code, 75, `${op}: ${out}`)
      assert.match(out, /another go-live of lantern is running — nothing was changed/, op)
      assert.doesNotMatch(out, RESULT, op)
    }
    assert.deepEqual(await bed.calls(), [], 'not one firewall or docker call')
    assert.equal(await bed.ruleIn(), true)
    assert.equal(await bed.conf(), 'before\n')
    // The other script is KILLED, not asked to let go: the lock goes with its process.
    await lock.release()
    const after = bed.run('live')
    assert.equal(after.code, 0, after.out)
    assert.match(after.out, /^TRACY_RESULT go_live=live label=lantern /m)
  } finally {
    await lock.release()
  }
})

test('go-live.sh: a lock that cannot be taken — a link, a folder under its name, or an interpreter that will not run — is not a free one', async () => {
  const linked = await scriptBed()
  const elsewhere = path.join(linked.state, 'elsewhere')
  await writeFile(elsewhere, '')
  await symlink(elsewhere, path.join(path.dirname(linked.site), '.go-live-lantern.lock'))
  const folder = await scriptBed()
  await mkdir(path.join(path.dirname(folder.site), '.go-live-lantern.lock'))
  // A link to nowhere would be MADE by an open that follows it, and a pipe would hold a plain open
  // for ever: both are opened without following and without waiting, and judged by what was opened.
  const dangling = await scriptBed()
  const nowhere = path.join(dangling.state, 'nowhere')
  await symlink(nowhere, path.join(path.dirname(dangling.site), '.go-live-lantern.lock'))
  const pipe = await scriptBed()
  assert.equal(spawnSync('mkfifo', [path.join(path.dirname(pipe.site), '.go-live-lantern.lock')]).status, 0)
  for (const [what, bed] of [
    ['a link', linked],
    ['a folder', folder],
    ['a dangling link', dangling],
    ['a pipe', pipe]
  ]) {
    const { code, out } = bed.run('live')
    assert.equal(code, 1, `${what}: ${out}`)
    assert.match(out, /the go-live lock of lantern cannot be taken/, what)
    assert.doesNotMatch(out, RESULT, what)
    assert.deepEqual(await bed.calls(), [], what)
    assert.equal(await bed.ruleIn(), true, what)
  }
  assert.equal(await readFile(elsewhere, 'utf8'), '', 'nothing was written through the link')
  assert.equal(await readFile(nowhere, 'utf8').catch(() => null), null, 'nothing was made through the link')
  // The interpreter that asks for the lock is not there: "could not ask" is not "free".
  const bare = await scriptBed({ ownBin: true })
  await writeFile(path.join(path.dirname(bare.state), 'bin', 'python3'), '#!/bin/bash\nexit 127\n')
  const { code, out } = bare.run('draft')
  assert.equal(code, 1, out)
  assert.match(out, /could not ask for the go-live lock of lantern/)
  assert.doesNotMatch(out, RESULT)
  assert.deepEqual(await bare.calls(), [])
})

test('go-live.sh live: a mail rule the firewall still has, though its listing spells it another way, is not an open door', async () => {
  const bed = await scriptBed({ rule: false })
  await bed.flag('hidden-rule')
  const { code, out } = bed.run('live')
  assert.equal(code, 1, out)
  assert.match(out, /the firewall still has the mail egress rule/)
  assert.doesNotMatch(out, /mail egress: OPEN/)
  assert.doesNotMatch(out, RESULT)
})
test('go-live.sh live: a firewall check that could not be made is not "no rule" — no OPEN line and no closing line, whatever the listing shows', async () => {
  // The rule is there under another spelling, so the listing does not show it as the script writes
  // it, and `-C` fails on the xtables lock (exit 4) instead of answering.
  const rigged = await scriptBed()
  for (const scene of ['equivalent-rule-listed', 'nothing-listed']) {
    const bed = await rigged.fresh({ rule: false })
    if (scene === 'equivalent-rule-listed') await bed.flag('hidden-rule')
    await bed.fail('iptables-C')
    const { code, out } = bed.run('live')
    assert.equal(code, 1, `${scene}: ${out}`)
    assert.match(
      out,
      /could not check the mail egress rule for 172\.30\.0\.0\/24 \(iptables -C exit 4\)/,
      scene
    )
    assert.doesNotMatch(out, /mail egress: OPEN/, scene)
    assert.doesNotMatch(out, RESULT, scene)
    assert.doesNotMatch(out, /==> noindex:/, `${scene}: the later steps did not run`)
    assert.equal(await bed.conf(), 'before\n', scene)
    // The check answers again: only its own "no such rule" opens the door.
    await bed.heal('iptables-C')
    const healed = bed.run('live')
    if (scene === 'equivalent-rule-listed') {
      assert.equal(healed.code, 1, healed.out)
      assert.match(healed.out, /the firewall still has the mail egress rule/)
      assert.doesNotMatch(healed.out, RESULT)
    } else {
      assert.equal(healed.code, 0, healed.out)
      assert.match(healed.out, /mail egress: OPEN/)
      assert.match(healed.out, RESULT)
    }
  }
})

test("go-live.sh: the platform's own mail switch failing ends the script in either direction — no closing line on a site whose mailer was not switched", async () => {
  const rigged = await scriptBed()
  for (const op of ['live', 'draft']) {
    const bed = await rigged.fresh({ rule: op === 'live' })
    // Joomla's hook edits configuration.php, and this site has none: the hook says so and fails.
    const { code, out } = bed.run(op, { TRACY_SITES_ROOT: path.join(bed.state, 'sites') }, 'joomla')
    assert.notEqual(code, 0, `${op}: ${out}`)
    assert.match(out, /the application-level mail switch is unchanged/, op)
    assert.doesNotMatch(out, RESULT, op)
    assert.doesNotMatch(out, /==> noindex:/, `${op}: the steps after it did not run`)
  }
})

// ── The customer's own domain, a signal that is no exit code, and a cleanup asked for again ──────

const TUNNEL = '0f3c9a52-7b1e-4d6a-9c2f-5e8d1a4b7c90'
const TARGET = `${TUNNEL}.cfargotunnel.com`

test("POST /_host/routing-target: the tunnel's public name and nothing else — 501 when this host has no tunnel, or its id is not one", async () => {
  const rig = await reusable()
  const ask = async (cloudflare) => {
    const config = await rig.fresh()
    config.cloudflare = cloudflare
    const app = buildApp({ config, jobs: memoryJobs(), run: heldRun().run })
    const res = await post(app, config, {}, undefined, '/_host/routing-target')
    return { status: res.status, body: await res.json() }
  }
  assert.deepEqual(
    await ask({ token: 'cf-secret-token', account: 'acct-secret', tunnel: TUNNEL.toUpperCase() }),
    {
      status: 200,
      body: { target: TARGET }
    }
  )
  for (const cloudflare of [
    null,
    { token: 't', account: 'a', tunnel: 'tun-1' },
    { token: 't', account: 'a', tunnel: '' },
    { token: 't', account: 'a', tunnel: `${TUNNEL}.evil.example` },
    { token: 't', account: 'a', tunnel: 7 },
    { token: 't', account: 'a' }
  ])
    assert.deepEqual(await ask(cloudflare), { status: 501, body: { code: 'NOT_CONFIGURED' } })

  // The door reads nothing from its body: a field sent to it, or a body that is not an object, is
  // refused — on a host with a tunnel and on one without — and never answered a target.
  for (const cloudflare of [{ token: 't', account: 'a', tunnel: TUNNEL }, null]) {
    const config = await rig.fresh()
    config.cloudflare = cloudflare
    const app = buildApp({ config, jobs: memoryJobs(), run: heldRun().run })
    for (const [payload, raw] of [
      [{ label: 'lantern' }],
      [{ tunnel: 'other' }],
      [{ target: null }],
      [null, 'null'],
      [null, '[]'],
      [null, '"x"'],
      [null, '{"label":']
    ]) {
      const res = await post(app, config, payload, raw, '/_host/routing-target')
      assert.equal(res.status, 400, raw ?? JSON.stringify(payload))
      const body = await res.json()
      assert.equal(body.code, 'BAD_REQUEST')
      assert.equal('target' in body, false)
    }
  }
})

test("a live that carries domains hands each to the script, with the tunnel names, and only when they were proven against THIS host's tunnel", async () => {
  const config = await configured()
  config.cloudflare = { token: 'cf-tok', account: 'acct-1', tunnel: TUNNEL }
  const held = heldRun()
  const jobs = memoryJobs()
  const app = buildApp({ config, jobs, run: held.run })

  const moved = await post(app, config, {
    label: 'lantern',
    op: 'live',
    domains: ['shop.example.com'],
    routingTarget: 'ffffffff-7b1e-4d6a-9c2f-5e8d1a4b7c90.cfargotunnel.com',
    jobKey: 'publish:moved'
  })
  assert.equal(moved.status, 409)
  assert.deepEqual(await moved.json(), { code: 'ROUTING_TARGET_CHANGED', accepted: false })
  assert.equal(held.calls.length, 0)
  assert.equal(jobs.store.size, 0)

  const res = await post(app, config, {
    label: 'lantern',
    op: 'live',
    domains: ['shop.example.com', 'www.shop.example.com'],
    routingTarget: TARGET,
    jobKey: 'publish:proven'
  })
  assert.equal(res.status, 202)
  await until(
    () => held.calls.length,
    (n) => n === 1,
    'the script started'
  )
  const { input } = held.calls[0]
  assert.deepEqual(input.args.slice(-4), ['--domain', 'shop.example.com', '--domain', 'www.shop.example.com'])
  assert.equal(input.env.TRACY_CF_API_TOKEN, 'cf-tok')
  assert.equal(input.env.TRACY_CF_ACCOUNT_ID, 'acct-1')
  assert.equal(input.env.TRACY_TUNNEL_ID, TUNNEL)
  held.calls[0].resolve({ code: 0, tail: [] })
})

test('drop-domain is a job like any other go-live: one domain, the same guard, the same key rule', async () => {
  const config = await configured()
  const held = heldRun()
  const jobs = memoryJobs()
  const app = buildApp({ config, jobs, run: held.run })
  const payload = {
    label: 'lantern',
    op: 'drop-domain',
    domains: ['shop.example.com'],
    jobKey: 'publish:drop1'
  }
  const first = await post(app, config, payload)
  assert.equal(first.status, 202)
  const { jobId } = await first.json()
  await until(
    () => held.calls.length,
    (n) => n === 1,
    'the script started'
  )
  const { input } = held.calls[0]
  assert.deepEqual(input.args.slice(1, 5), ['--label', 'lantern', '--op', 'drop-domain'])
  assert.deepEqual(input.args.slice(-2), ['--domain', 'shop.example.com'])
  assert.equal((await job(app, config, jobId)).body.step, 'go-live:drop-domain')

  // While it runs: the same key is the same job; a publish of the same site is told who holds it.
  assert.deepEqual(await (await post(app, config, payload)).json(), { jobId, reused: true })
  const beside = await post(app, config, { label: 'lantern', op: 'live', jobKey: 'publish:other' })
  assert.equal(beside.status, 409)
  assert.deepEqual(await beside.json(), { code: 'GO_LIVE_BUSY', jobId, op: 'drop-domain' })
  assert.equal(held.calls.length, 1)
  held.calls[0].resolve({ code: 0, tail: ['==> ingress: removed shop.example.com'] })
  await until(
    () => job(app, config, jobId),
    (j) => j.body.state === 'done',
    'done'
  )
})

test('teardown through this door is an operation like the others: teardown.sh under a key — one job however often it is asked for, a failed run taken up again only for the next attempt, and no refusal for a folder that is already gone', async () => {
  const rig = await reusable()
  for (const tunnel of [true, false]) {
    const config = await rig.fresh()
    if (!tunnel) config.cloudflare = null
    const held = heldRun()
    const jobs = memoryJobs()
    const app = buildApp({ config, jobs, run: held.run })
    const payload = { label: 'lantern', op: 'teardown', jobKey: 'publish:delete0123456789' }
    const first = await post(app, config, payload)
    assert.equal(first.status, 202)
    const { jobId } = await first.json()
    await until(
      () => held.calls.length,
      (n) => n === 1,
      'the script started'
    )
    const { input } = held.calls[0]
    assert.ok(input.args[0].endsWith(path.join('provision', 'teardown.sh')), input.args[0])
    assert.deepEqual(input.args.slice(1), ['--label', 'lantern', '--root', config.privateRoot])
    // What teardown.sh needs from this host, as `POST /_host/teardown` hands it.
    assert.equal(input.env.JOBS_DIR, config.jobsDir)
    assert.equal(input.env.HOOK_LOG_DIR, config.logDir)
    assert.equal(input.env.TRACY_TUNNEL, tunnel ? undefined : 'none')
    assert.equal(input.env.TRACY_TUNNEL_ID, tunnel ? config.cloudflare.tunnel : process.env.TRACY_TUNNEL_ID)
    assert.equal((await job(app, config, jobId)).body.step, 'go-live:teardown')

    // While it runs: the same key is the same job, and a publish of the site is told who holds it.
    assert.deepEqual(await (await post(app, config, payload)).json(), { jobId, reused: true })
    const beside = await post(app, config, { label: 'lantern', op: 'live', jobKey: 'publish:other' })
    assert.equal(beside.status, 409)
    assert.deepEqual(await beside.json(), { code: 'GO_LIVE_BUSY', jobId, op: 'teardown' })
    assert.equal(held.calls.length, 1)

    // It fails with the folder already gone: looked at again it is the job it has; asked for with
    // the next attempt it runs again — "no such folder" is where a teardown ends, not a refusal.
    await rm(path.join(config.privateRoot, 'lantern'), { recursive: true })
    held.calls[0].resolve({ code: 1, tail: ['!! teardown of lantern did not finish'] })
    await until(
      () => job(app, config, jobId),
      (j) => j.body.state === 'failed',
      'failed'
    )
    assert.deepEqual(await (await post(app, config, payload)).json(), { jobId, reused: true })
    assert.equal(held.calls.length, 1, 'nothing reran by being looked at')
    const again = await post(app, config, { ...payload, attempt: 1 })
    assert.equal(again.status, 202)
    assert.deepEqual(await again.json(), { jobId })
    await until(
      () => held.calls.length,
      (n) => n === 2,
      'the next attempt runs'
    )
    held.calls[1].resolve({ code: 0, tail: ['TRACY_RESULT torn_down=1 label=lantern'] })
    await until(
      () => job(app, config, jobId),
      (j) => j.body.state === 'done',
      'done'
    )
    // Done is never run again, whatever attempt is asked for.
    assert.deepEqual(await (await post(app, config, { ...payload, attempt: 2 })).json(), {
      jobId,
      reused: true
    })
    assert.equal(held.calls.length, 2)
  }

  // A teardown names no domain: the site's own record says which it has.
  const config = await configured()
  const held = heldRun()
  const app = buildApp({ config, jobs: memoryJobs(), run: held.run })
  const refused = await post(app, config, { label: 'lantern', op: 'teardown', domains: ['shop.example.com'] })
  assert.equal(refused.status, 400)
  assert.equal(held.calls.length, 0)
})

/** How a run may end without the script having exited by itself (`run.js`): `[what, ending]`. */
const NOT_AN_EXIT = [
  ['SIGTERM', { code: null, signal: 'SIGTERM', tail: ['==> mail egress: OPEN'] }],
  ['SIGKILL', { code: null, signal: 'SIGKILL', tail: [] }],
  ['SIGHUP', { code: null, signal: 'SIGHUP', tail: [] }],
  ['a signal with a made-up exit code beside it', { code: 1, signal: 'SIGTERM', tail: [] }],
  ['the time limit, the child having exited 1 while being stopped', { code: 1, timedOut: true, tail: [] }],
  ['the time limit and its signal', { code: null, signal: 'SIGTERM', timedOut: true, tail: [] }],
  ['a script that could not be started', { code: null, spawnError: 'ENOENT', tail: [] }],
  ['no code at all', { tail: [] }],
  ['a code that is a string', { code: '0', tail: [] }],
  ['nothing', undefined]
]

test('a run that a signal, a time limit or a failed start ended is NOT the script failing: no exit code on the record, the signal kept beside it, and the same key runs the job again', async () => {
  const rig = await reusable()
  for (const op of ['live', 'draft', 'drop-domain']) {
    for (const [what, ending] of NOT_AN_EXIT) {
      const how = `${op}; ${what}`
      const config = await rig.fresh()
      const held = heldRun()
      const jobs = memoryJobs()
      const app = buildApp({ config, jobs, run: held.run })
      const payload = {
        label: 'lantern',
        op,
        jobKey: 'publish:0123456789abcdef',
        ...(op === 'drop-domain' ? { domains: ['shop.example.com'] } : {})
      }
      const { jobId } = await (await post(app, config, payload)).json()
      await until(
        () => held.calls.length,
        (n) => n === 1,
        `${how}: the script started`
      )
      held.calls[0].resolve(ending)
      const record = await until(
        () => job(app, config, jobId),
        (j) => j.body.state === 'failed',
        `${how}: recorded`
      )
      assert.equal(record.body.exitCode, null, `${how}: no exit code was made up`)
      assert.equal(record.body.unobserved, true, how)
      assert.equal(record.body.busy, false, how)
      assert.equal(record.body.signal, typeof ending?.signal === 'string' ? ending.signal : null, how)
      assert.equal(record.body.timedOut, ending?.timedOut === true, how)
      assert.equal(
        record.body.output,
        null,
        `${how}: no output that could be read as the script's closing line`
      )
      // What the web door reads: not an outcome, so the site's reservation is not released on it.
      const { scriptOutcome, noOutcome } = await import('../../tracy-web/src/sites/publish-store.js')
      assert.equal(scriptOutcome(record.body), null, how)
      assert.equal(noOutcome(record.body), true, how)

      // Asked again under the same key: the job is run again, under the same id, from a clean record.
      const again = await post(app, config, payload)
      assert.equal(again.status, 202, how)
      assert.deepEqual(await again.json(), { jobId }, how)
      await until(
        () => held.calls.length,
        (n) => n === 2,
        `${how}: run again`
      )
      const running = (await job(app, config, jobId)).body
      assert.equal(running.unobserved, false, how)
      assert.equal(running.signal, null, how)
      assert.equal(running.timedOut, false, how)
      held.calls[1].resolve({ code: 0, tail: [] })
      await until(
        () => job(app, config, jobId),
        (j) => j.body.state === 'done',
        `${how}: done`
      )
    }
  }
})

test('end to end with the real runner: a go-live script killed by a signal leaves a record with the signal and no exit code — the same script exiting 1 by itself leaves exit code 1', async () => {
  const { runScript } = await import('../src/run.js')
  const config = await configured()
  await mkdir(path.join(config.scriptsDir, 'provision'), { recursive: true })
  const script = path.join(config.scriptsDir, 'provision', 'go-live.sh')
  const app = buildApp({ config, jobs: diskJobs(config), run: runScript })

  await writeFile(script, '#!/usr/bin/env bash\necho "==> mail egress: OPEN"\nkill -TERM $$\nsleep 30\n')
  const killed = await (
    await post(app, config, { label: 'lantern', op: 'live', jobKey: 'publish:sig' })
  ).json()
  const signalled = await until(
    () => job(app, config, killed.jobId),
    (j) => j.body.state === 'failed',
    'the signalled run was recorded'
  )
  assert.equal(signalled.body.exitCode, null)
  assert.equal(signalled.body.signal, 'SIGTERM')
  assert.equal(signalled.body.unobserved, true)
  assert.match(signalled.body.detail, /SIGTERM/)

  await writeFile(script, '#!/usr/bin/env bash\necho "!! could not read the subnet"\nexit 1\n')
  const failing = await (
    await post(app, config, { label: 'harbor', op: 'live', jobKey: 'publish:own' })
  ).json()
  const failed = await until(
    () => job(app, config, failing.jobId),
    (j) => j.body.state === 'failed',
    'the failed run was recorded'
  )
  assert.equal(failed.body.exitCode, 1)
  assert.equal(failed.body.signal, null)
  assert.equal(failed.body.unobserved, false)
  assert.match(failed.body.output, /subnet/)
})

test('a cleanup that failed is run again under its own key only when the next attempt is asked for — never by being looked at, never a job that ended done, never a publish', async () => {
  const rig = await reusable()
  for (const op of ['draft', 'drop-domain']) {
    const config = await rig.fresh()
    const held = heldRun()
    const jobs = memoryJobs()
    const app = buildApp({ config, jobs, run: held.run })
    const payload = {
      label: 'lantern',
      op,
      jobKey: 'publish:cleanup0123456789',
      ...(op === 'drop-domain' ? { domains: ['shop.example.com'] } : {})
    }
    const { jobId } = await (await post(app, config, payload)).json()
    await until(
      () => held.calls.length,
      (n) => n === 1,
      `${op}: first run`
    )
    held.calls[0].resolve({ code: 1, tail: ['!! 1 domain(s) could not be removed from the ingress'] })
    await until(
      () => job(app, config, jobId),
      (j) => j.body.state === 'failed',
      `${op}: failed`
    )
    // Looked at again, with no attempt and with the attempt it already ran as: the job it has.
    for (const same of [payload, { ...payload, attempt: 0 }]) {
      assert.deepEqual(await (await post(app, config, same)).json(), { jobId, reused: true }, op)
    }
    assert.equal(held.calls.length, 1, `${op}: nothing reran`)
    assert.equal((await job(app, config, jobId)).body.exitCode, 1)

    // The next attempt: the same key, the same job id, run again from a clean record.
    const retry = await post(app, config, { ...payload, attempt: 1 })
    assert.equal(retry.status, 202, op)
    assert.deepEqual(await retry.json(), { jobId }, op)
    await until(
      () => held.calls.length,
      (n) => n === 2,
      `${op}: second run`
    )
    const running = (await job(app, config, jobId)).body
    assert.equal(running.attempt, 1, op)
    assert.equal(running.exitCode, null, `${op}: nothing of the first run reads as this one's ending`)
    assert.equal(running.output, null, op)
    // While it runs, and once it has failed again: attempt 1 is this run, not another one.
    assert.deepEqual(await (await post(app, config, { ...payload, attempt: 1 })).json(), {
      jobId,
      reused: true
    })
    held.calls[1].resolve({ code: 1, tail: ['!! still there'] })
    await until(
      () => job(app, config, jobId),
      (j) => j.body.state === 'failed' && j.body.exitCode === 1,
      `${op}: failed again`
    )
    assert.deepEqual(await (await post(app, config, { ...payload, attempt: 1 })).json(), {
      jobId,
      reused: true
    })
    // A late ask for the attempt before it changes nothing.
    assert.deepEqual(await (await post(app, config, { ...payload, attempt: 0 })).json(), {
      jobId,
      reused: true
    })
    assert.equal(held.calls.length, 2, op)

    // Attempt 2 goes through; after that no attempt runs it again.
    await post(app, config, { ...payload, attempt: 2 })
    await until(
      () => held.calls.length,
      (n) => n === 3,
      `${op}: third run`
    )
    held.calls[2].resolve({ code: 0, tail: [`TRACY_RESULT go_live=${op} label=lantern platform=none`] })
    await until(
      () => job(app, config, jobId),
      (j) => j.body.state === 'done',
      `${op}: done`
    )
    for (const attempt of [2, 3, 1000]) {
      assert.deepEqual(
        await (await post(app, config, { ...payload, attempt })).json(),
        { jobId, reused: true },
        `${op}: a finished cleanup is never run again (attempt ${attempt})`
      )
    }
    assert.equal(held.calls.length, 3, op)
  }

  // A publish that failed is not a cleanup: a higher attempt is still the job it has.
  const config = await configured()
  const held = heldRun()
  const app = buildApp({ config, jobs: memoryJobs(), run: held.run })
  const live = { label: 'lantern', op: 'live', jobKey: 'publish:live0123456789' }
  const { jobId } = await (await post(app, config, live)).json()
  await until(
    () => held.calls.length,
    (n) => n === 1,
    'live: first run'
  )
  held.calls[0].resolve({ code: 1, tail: ['!! no'] })
  await until(
    () => job(app, config, jobId),
    (j) => j.body.state === 'failed',
    'live: failed'
  )
  assert.deepEqual(await (await post(app, config, { ...live, attempt: 3 })).json(), { jobId, reused: true })
  assert.equal(held.calls.length, 1)
})

// ── go-live.sh with a domain of the customer's own ──────────────────────────────────────────────

test("go-live.sh live with domains: each is on the site's record BEFORE its rule is asked for, and only a rule the tunnel took is said to be routed", async () => {
  const bed = await scriptBed()
  await bed.tunnel()
  await bed.ingressExit('broken.example.com', 1)
  const { code, out } = bed.withDomains('live', ['shop.example.com', 'broken.example.com'])
  // The site IS live at its Tracy address; the domain that could not be added is simply not said.
  assert.equal(code, 0, out)
  // #1037: to tracy-web, never straight to the site's own port (8123).
  assert.match(out, /^==> ingress: shop\.example\.com → tracy-web http:\/\/127\.0\.0\.1:51710$/m)
  assert.doesNotMatch(out, /→ 127\.0\.0\.1:8123/)
  assert.doesNotMatch(out, /==> ingress: broken\.example\.com/)
  assert.match(out, /!! could not add broken\.example\.com to the ingress/)
  assert.match(out, /^TRACY_RESULT go_live=live label=lantern /m)
  assert.deepEqual(await bed.rules(), { 'shop.example.com': WEB_SERVICE })
  // Both on record: a rule that may have landed without its answer is one a later draft takes out.
  assert.deepEqual(await bed.ledger(), ['shop.example.com', 'broken.example.com'])

  // Run again: the record does not grow, the rule is the same.
  const again = bed.withDomains('live', ['shop.example.com'])
  assert.equal(again.code, 0, again.out)
  assert.deepEqual(await bed.ledger(), ['shop.example.com', 'broken.example.com'])
})

test("go-live.sh draft: the names it is given AND the ones on record leave the tunnel, each only as this site's rule — and one that cannot be removed ends the script non-zero with the rest done and written down", async () => {
  const bed = await scriptBed({ rule: false })
  await bed.tunnel()
  assert.equal(bed.withDomains('live', ['a.example.com', 'b.example.com', 'c.example.com']).code, 0)
  // b has become another site's since: its rule leads to that site's port.
  await bed.route('b.example.com', 9555)
  await bed.ingressExit('c.example.com', 1)

  const first = bed.withDomains('draft', [])
  assert.notEqual(first.code, 0, first.out)
  assert.notEqual(first.code, 75)
  assert.doesNotMatch(first.out, RESULT, 'no closing line while a domain may still open the site')
  assert.match(first.out, /^==> ingress: removed a\.example\.com$/m)
  assert.match(first.out, /^==> ingress: b\.example\.com is not routed to this site$/m)
  assert.match(first.out, /!! could not remove c\.example\.com from the ingress/)
  assert.match(first.out, /!! 1 domain\(s\) could not be removed/)
  // Mail and noindex were closed all the same: the half that could be done is done.
  assert.match(first.out, /==> mail egress: BLOCKED/)
  assert.equal(await bed.ruleIn(), true)
  // What is left is exactly what is still to do: the record names only the domain that stayed.
  assert.deepEqual(await bed.ledger(), ['c.example.com'])
  assert.deepEqual(await bed.rules(), { 'b.example.com': '9555', 'c.example.com': WEB_SERVICE })

  // The retry: only the half that was not finished touches the tunnel.
  await bed.ingressExit('c.example.com', null)
  const before = (await bed.calls()).length
  const second = bed.withDomains('draft', [])
  assert.equal(second.code, 0, second.out)
  assert.match(second.out, /^TRACY_RESULT go_live=draft label=lantern /m)
  const tunnelCalls = (await bed.calls()).slice(before).filter((line) => line.startsWith('python3'))
  assert.equal(tunnelCalls.length, 1, `only the domain still on record: ${tunnelCalls.join(' | ')}`)
  assert.match(
    tunnelCalls[0],
    /--hostname c\.example\.com --remove --only-port 8123 --owner lantern --service http:\/\/127\.0\.0\.1:51710$/
  )
  assert.deepEqual(await bed.ledger(), [])
  assert.deepEqual(await bed.rules(), { 'b.example.com': '9555' }, "the other site's rule still stands")
})

test('go-live.sh drop-domain: one domain out of the tunnel and off the record — mail, noindex and the other domains untouched; failing, it ends non-zero with the name still on record', async () => {
  const bed = await scriptBed({ rule: false })
  await bed.tunnel()
  assert.equal(bed.withDomains('live', ['a.example.com', 'b.example.com']).code, 0)
  const confBefore = await bed.conf()
  const before = (await bed.calls()).length

  await bed.ingressExit('a.example.com', 1)
  const failed = bed.withDomains('drop-domain', ['a.example.com'])
  assert.notEqual(failed.code, 0, failed.out)
  assert.doesNotMatch(failed.out, RESULT)
  assert.deepEqual(await bed.ledger(), ['a.example.com', 'b.example.com'])

  await bed.ingressExit('a.example.com', null)
  const { code, out } = bed.withDomains('drop-domain', ['a.example.com'])
  assert.equal(code, 0, out)
  assert.match(out, /^==> ingress: removed a\.example\.com$/m)
  assert.match(out, /^TRACY_RESULT go_live=drop-domain label=lantern /m)
  assert.deepEqual(await bed.ledger(), ['b.example.com'])
  assert.deepEqual(await bed.rules(), { 'b.example.com': WEB_SERVICE })
  assert.equal(await bed.conf(), confBefore, 'noindex untouched')
  assert.equal(await bed.ruleIn(), false, 'the mail rule untouched: the site is still live')
  const touched = (await bed.calls()).slice(before).filter((line) => !line.startsWith('python3'))
  assert.deepEqual(touched, [], 'neither the firewall nor docker was called')

  // Exactly one name, or nothing is touched.
  for (const domains of [[], ['a.example.com', 'b.example.com']]) {
    const refused = bed.withDomains('drop-domain', domains)
    assert.equal(refused.code, 2, refused.out)
  }
  assert.deepEqual(await bed.ledger(), ['b.example.com'])
})

test('go-live.sh: a domain is said to be out only when its rule AND its place on the record are — a record that cannot be rewritten prints neither line, ends non-zero, and the retry finishes it', async () => {
  const rigged = await scriptBed()
  for (const op of ['draft', 'drop-domain']) {
    const bed = await rigged.fresh({ rule: false })
    await bed.tunnel()
    assert.equal(bed.withDomains('live', ['a.example.com', 'b.example.com']).code, 0)
    // b is another site's by now: "not routed to this site" is the other line a caller forgets on.
    await bed.route('b.example.com', 9555)
    // The file the record is rewritten through cannot be made: a folder that is not empty sits there.
    const tmp = path.join(bed.site, '.golive-domains.tmp')
    await mkdir(tmp)
    await writeFile(path.join(tmp, 'kept'), '')
    const names = op === 'draft' ? [] : ['a.example.com']
    const first = bed.withDomains(op, names)
    assert.notEqual(first.code, 0, `${op}: ${first.out}`)
    assert.notEqual(first.code, 75, op)
    assert.doesNotMatch(first.out, RESULT, op)
    assert.doesNotMatch(first.out, /==> ingress: removed/, `${op}: not said while the record names it`)
    assert.doesNotMatch(first.out, /is not routed to this site/, op)
    assert.match(first.out, /!! could not take a\.example\.com out of /, op)
    assert.deepEqual(await bed.ledger(), ['a.example.com', 'b.example.com'], `${op}: the record is whole`)

    await rm(tmp, { recursive: true })
    const second = bed.withDomains(op, names)
    assert.equal(second.code, 0, `${op}: ${second.out}`)
    assert.match(second.out, /^==> ingress: removed a\.example\.com$/m, op)
    assert.deepEqual(await bed.ledger(), op === 'draft' ? [] : ['b.example.com'], op)
    assert.deepEqual(await bed.rules(), { 'b.example.com': '9555' }, `${op}: the other site's rule stands`)
  }
})

test('go-live.sh: the record is never written through what was put beside it or under its name — a link at the temporary name is replaced, not followed; a name that cannot be recorded is not added to the tunnel', async () => {
  const bed = await scriptBed({ rule: false })
  await bed.tunnel()
  const elsewhere = path.join(bed.root, 'elsewhere')
  await writeFile(elsewhere, 'kept\n')
  await symlink(elsewhere, path.join(bed.site, '.golive-domains.tmp'))
  const added = bed.withDomains('live', ['a.example.com'])
  assert.equal(added.code, 0, added.out)
  assert.equal(await readFile(elsewhere, 'utf8'), 'kept\n', 'nothing was written through the link')
  assert.deepEqual(await bed.ledger(), ['a.example.com'])
  assert.deepEqual(await bed.rules(), { 'a.example.com': WEB_SERVICE })

  // The same link while a name is taken OFF the record.
  await symlink(elsewhere, path.join(bed.site, '.golive-domains.tmp'))
  const dropped = bed.withDomains('drop-domain', ['a.example.com'])
  assert.equal(dropped.code, 0, dropped.out)
  assert.equal(await readFile(elsewhere, 'utf8'), 'kept\n')
  assert.deepEqual(await bed.ledger(), [])

  // Not recordable: the rule is never asked for.
  const tmp = path.join(bed.site, '.golive-domains.tmp')
  await mkdir(tmp)
  await writeFile(path.join(tmp, 'kept'), '')
  const refused = bed.withDomains('live', ['c.example.com'])
  assert.match(refused.out, /!! could not record c\.example\.com/)
  assert.doesNotMatch(refused.out, /==> ingress: c\.example\.com/)
  assert.deepEqual(await bed.rules(), {})
})

test("go-live.sh: the site's port is read from its own .env and never through a link or a pipe — a domain is not added, or taken out, on a port read from somewhere else", async () => {
  const rigged = await scriptBed()
  for (const what of ['a link to another site’s .env', 'a pipe']) {
    for (const op of ['live', 'drop-domain']) {
      const bed = await rigged.fresh({ rule: false })
      await bed.tunnel()
      // The name is another site's rule, on that site's port — the port the link leads to.
      await bed.route('a.example.com', 9555)
      const env = path.join(bed.site, '.env')
      await rm(env)
      if (what === 'a pipe') assert.equal(spawnSync('mkfifo', [env]).status, 0)
      else {
        await writeFile(path.join(bed.root, 'other.env'), 'HOST_PORT=9555\n')
        await symlink(path.join(bed.root, 'other.env'), env)
      }
      const { code, out } = bed.withDomains(op, ['a.example.com'])
      const how = `${what}; ${op}`
      assert.equal(code, 1, `${how}: ${out}`)
      assert.match(out, /HOST_PORT/, how)
      assert.doesNotMatch(out, RESULT, how)
      assert.doesNotMatch(out, /==> ingress:/, how)
      assert.deepEqual(await bed.rules(), { 'a.example.com': '9555' }, `${how}: the other site's rule stands`)
    }
  }
})

test('go-live.sh: a record of domains that cannot be trusted is NOT "no domains" — refused before anything is flipped, for every kind of it and every direction', async () => {
  /** `[what, damage(file, bed)]` — what may sit under the record's name. */
  const LEDGERS = [
    [
      'a link to a file',
      async (file, bed) => {
        await writeFile(path.join(bed.root, 'elsewhere'), 'evil.example.com\n')
        await symlink(path.join(bed.root, 'elsewhere'), file)
      }
    ],
    ['a dangling link', (file, bed) => symlink(path.join(bed.root, 'nowhere'), file)],
    ['a folder', (file) => mkdir(file)],
    [
      'a pipe',
      async (file) => {
        assert.equal(spawnSync('mkfifo', [file]).status, 0)
      }
    ],
    ['a line that is not a host name', (file) => writeFile(file, 'a.example.com\n--remove\n')],
    ['a line with a space', (file) => writeFile(file, 'a.example.com b.example.com\n')],
    ['a line with a path', (file) => writeFile(file, '../../etc/passwd\n')],
    ['a single label', (file) => writeFile(file, 'localhost\n')],
    ['a file larger than a record can be', (file) => writeFile(file, 'a.example.com\n'.repeat(6000))],
    [
      'a file that cannot be read',
      async (file) => {
        await writeFile(file, 'a.example.com\n')
        await chmod(file, 0o000)
      }
    ]
  ]
  const rigged = await scriptBed()
  for (const [what, damage] of LEDGERS) {
    // Root reads through a mode: that one case proves nothing there.
    if (what === 'a file that cannot be read' && process.getuid?.() === 0) continue
    for (const op of ['live', 'draft', 'drop-domain']) {
      const bed = await rigged.fresh()
      await bed.tunnel()
      await bed.route('a.example.com', 8123)
      const confBefore = await bed.conf()
      const file = path.join(bed.site, '.golive-domains')
      await damage(file, bed)
      const { code, out } = bed.withDomains(op, op === 'draft' ? [] : ['a.example.com'])
      const how = `${what}; ${op}`
      assert.equal(code, 1, `${how}: ${out}`)
      assert.match(out, /refusing to use it/, how)
      assert.doesNotMatch(out, RESULT, how)
      assert.deepEqual(
        await bed.calls(),
        [],
        `${how}: nothing was asked of the firewall, docker or the tunnel`
      )
      assert.equal(await bed.conf(), confBefore, how)
      assert.deepEqual(await bed.rules(), { 'a.example.com': '8123' }, how)
      await chmod(file, 0o600).catch(() => {})
    }
  }
})

test('go-live.sh draft on a host with no tunnel: no domain on record → it runs to its closing line and never reaches for the tunnel; a domain on record → it ends non-zero, the record kept', async () => {
  const clean = await scriptBed()
  const { code, out } = clean.run('draft')
  assert.equal(code, 0, out)
  assert.match(out, /^TRACY_RESULT go_live=draft label=lantern /m)
  assert.equal(
    (await clean.calls()).some((line) => line.startsWith('python3')),
    false
  )

  const bed = await scriptBed()
  await bed.tunnel()
  await writeFile(path.join(bed.site, '.golive-domains'), 'a.example.com\n')
  await bed.route('a.example.com', 8123)
  // No tunnel names in the environment: the stand-in refuses as ingress_api.py does.
  const left = bed.run('draft')
  assert.notEqual(left.code, 0, left.out)
  assert.doesNotMatch(left.out, RESULT)
  assert.deepEqual(await bed.ledger(), ['a.example.com'])
})

// ── #1037: a customer's own domain is routed to tracy-web, never straight to the site ────────────

test("#1037 go-live.sh live: a site connected the old way is brought over — its own old rule (straight to its port) is replaced by the route to tracy-web; another site's rule is left standing and is not said to be routed", async () => {
  const bed = await scriptBed()
  await bed.tunnel()
  await bed.route('old.example.com', 8123) // this site's rule from before #1037
  await bed.route('theirs.example.com', 9555) // another site's port
  const { code, out } = bed.withDomains('live', ['old.example.com', 'theirs.example.com'])
  assert.equal(code, 0, out)
  assert.match(out, /^==> ingress: old\.example\.com → tracy-web http:\/\/127\.0\.0\.1:51710$/m)
  assert.doesNotMatch(out, /==> ingress: theirs\.example\.com/)
  assert.match(out, /!! could not add theirs\.example\.com to the ingress/)
  assert.deepEqual(await bed.rules(), { 'old.example.com': WEB_SERVICE, 'theirs.example.com': '9555' })
  const calls = (await bed.calls()).filter((line) => line.startsWith('python3'))
  assert.match(
    calls[0],
    /--hostname old\.example\.com --service http:\/\/127\.0\.0\.1:51710 --owner lantern --owner-gen 0 --takeover-port 8123$/
  )
  assert.doesNotMatch(calls.join('\n'), /--port /, 'no rule straight to a port is ever asked for')
})

test('#1037 go-live.sh: the route generation of the run reaches the tunnel script, add and remove; one that is not a number is refused before anything runs', async () => {
  // Its own `bin/`: the script is started by hand below, with PATH led by the bed's stand-ins.
  const bed = await scriptBed({ rule: false, ownBin: true })
  await bed.tunnel()
  const live = bed.run('live', { ...bedEnv(), TRACY_OWN_DOMAIN_SERVICE: WEB_SERVICE }, 'none', [
    'a.example.com'
  ])
  assert.equal(live.code, 0, live.out)
  const gen = (op, value) =>
    spawnSync(
      'bash',
      [
        path.join(PROVISION, 'go-live.sh'),
        '--label',
        'lantern',
        '--op',
        op,
        '--root',
        path.join(bed.root, 'private'),
        '--platform',
        'none',
        '--domain',
        'a.example.com',
        '--route-gen',
        value
      ],
      {
        encoding: 'utf8',
        env: {
          PATH: `${path.join(bed.root, 'bin')}:/usr/bin:/bin`,
          STUB: bed.state,
          ...bedEnv(),
          TRACY_OWN_DOMAIN_SERVICE: WEB_SERVICE
        }
      }
    )
  const before = (await bed.calls()).length
  assert.equal(gen('live', '41').status, 0)
  assert.equal(gen('drop-domain', '42').status, 0)
  const calls = (await bed.calls()).slice(before).filter((line) => line.startsWith('python3'))
  assert.match(calls[0], /--owner lantern --owner-gen 41 --takeover-port 8123$/)
  assert.match(calls[1], /--remove --only-port 8123 --owner lantern --owner-gen 42 --service /)
  for (const bad of ['', 'x', '-1', '1.5', '01', '9'.repeat(16), '4 2', '$(id)']) {
    if (bad === '') continue
    const refused = gen('live', bad)
    assert.equal(refused.status, 2, `${bad}: ${refused.stderr}`)
  }
  assert.equal((await bed.calls()).slice(before).filter((line) => line.startsWith('python3')).length, 2)
})

test("#1037 go-live.sh: where tracy-web listens is this host's own word — the named service, or tracy-web's loopback origin; a public origin is never a local service, and with none the domain is not added, not recorded and not said to be routed", async () => {
  for (const [what, extra, service] of [
    ['named outright', { TRACY_OWN_DOMAIN_SERVICE: 'http://tracy-web:8080' }, 'http://tracy-web:8080'],
    ['the loopback origin of tracy-web', { TRACY_WEB_ORIGIN: 'http://127.0.0.1:51710' }, WEB_SERVICE],
    ['the loopback origin, with a slash', { TRACY_WEB_ORIGIN: 'http://127.0.0.1:51710/' }, WEB_SERVICE],
    [
      'the named one wins',
      { TRACY_OWN_DOMAIN_SERVICE: WEB_SERVICE, TRACY_WEB_ORIGIN: 'http://127.0.0.1:1' },
      WEB_SERVICE
    ],
    ['nothing said', {}, null],
    ['a public origin only', { TRACY_WEB_ORIGIN: 'https://cowork.tracy.ai' }, null]
  ]) {
    const bed = await scriptBed()
    await bed.tunnel()
    const { code, out } = bed.run('live', { ...bedEnv(), ...extra }, 'none', ['a.example.com'])
    assert.equal(code, 0, `${what}: ${out}`)
    assert.match(out, /^TRACY_RESULT go_live=live label=lantern /m, what)
    if (service) {
      assert.ok(out.includes(`==> ingress: a.example.com → tracy-web ${service}\n`), what)
      assert.deepEqual(await bed.rules(), { 'a.example.com': service }, what)
    } else {
      assert.doesNotMatch(out, /==> ingress: a\.example\.com/, what)
      assert.match(out, /does not say where tracy-web listens/, what)
      assert.deepEqual(await bed.rules(), {}, what)
      assert.deepEqual(await bed.ledger(), [], `${what}: nothing added, nothing to take out later`)
    }
  }
  // A service that is not one ends the script: never a rule to wherever the text happens to lead.
  for (const bad of [
    'https://127.0.0.1:51710',
    'http://127.0.0.1',
    'http://127.0.0.1:51710/x',
    'http://a b:80',
    'http://h:80;id'
  ]) {
    const bed = await scriptBed()
    await bed.tunnel()
    const { code, out } = bed.run('live', { ...bedEnv(), TRACY_OWN_DOMAIN_SERVICE: bad }, 'none', [
      'a.example.com'
    ])
    assert.notEqual(code, 0, bad)
    assert.doesNotMatch(out, RESULT, bad)
    assert.deepEqual(await bed.rules(), {}, bad)
  }
})

test('#1037 the go-live door: routeGen goes with an ask that names domains, as --route-gen; anything else under that name is refused before a job exists', async () => {
  const config = await configured()
  const held = heldRun()
  const app = buildApp({ config, jobs: memoryJobs(), run: held.run })
  const res = await post(app, config, { label: 'lantern', op: 'live', domains: ['example.com'], routeGen: 7 })
  assert.equal(res.status, 202)
  await until(
    () => held.calls.length,
    (n) => n === 1,
    'the script started'
  )
  const { args } = held.calls[0].input
  assert.deepEqual(args.slice(-4), ['--domain', 'example.com', '--route-gen', '7'])
  held.calls[0].resolve({ code: 0, tail: [] })
  for (const [body, why] of [
    [{ label: 'lantern', op: 'live', routeGen: 7 }, 'routeGen goes with domains'],
    [{ label: 'lantern', op: 'draft', routeGen: 7 }, 'routeGen goes with domains'],
    [{ label: 'lantern', op: 'teardown', routeGen: 7 }, 'routeGen goes with domains'],
    ...[0, -1, 1.5, '7', null, true, [7], {}, 2 ** 53].map((routeGen) => [
      { label: 'lantern', op: 'live', domains: ['example.com'], routeGen },
      'refused routeGen'
    ])
  ]) {
    const refused = await post(app, config, body)
    assert.equal(refused.status, 400, JSON.stringify(body))
    assert.equal((await refused.json()).why, why, JSON.stringify(body))
  }
  assert.equal(held.calls.length, 1, 'no refused ask started anything')
})
