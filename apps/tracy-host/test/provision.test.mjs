import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { signHostCall } from '../../tracy-web/src/host/client.js'
import { buildApp } from '../src/app.js'
import {
  failedProvisionOutput,
  PROVISION_IDLE_MS,
  PROVISION_TIMEOUT_MS,
  provisionArgs,
  runProvisionJob
} from '../src/provision.js'

// ---------------------------------------------------------------------------------------------
// provisionArgs
// ---------------------------------------------------------------------------------------------

test('provisionArgs: a full instruction produces the flags in PROVISION_FLAGS order, then --fresh, --no-publish, --root', () => {
  const args = provisionArgs({
    site: 'example.com',
    label: 'example-com-0871',
    platform: 'wordpress',
    siteKey: 'example.com',
    webrootKey: 'example.com/migrate/1/webroot.tar',
    dbKey: 'example.com/migrate/1/db.sql.gz',
    liveSite: 'http://127.0.0.1:8181',
    ownerEmail: 'team@example.com',
    fresh: true,
    privateRoot: '/srv/tracy'
  })
  assert.deepEqual(args, [
    '--site',
    'example.com',
    '--label',
    'example-com-0871',
    '--platform',
    'wordpress',
    '--site-key',
    'example.com',
    '--webroot-key',
    'example.com/migrate/1/webroot.tar',
    '--db-key',
    'example.com/migrate/1/db.sql.gz',
    '--live-site',
    'http://127.0.0.1:8181',
    '--owner-email',
    'team@example.com',
    '--fresh',
    '--no-publish',
    '--root',
    '/srv/tracy'
  ])
})

test('provisionArgs: carries the picked design and the registry revision, and nothing the fleet resolves itself', () => {
  // `design` and `designRevision` have to be in PROVISION_FLAGS or they are dropped between the
  // signed call and argv with no error anywhere — a site then builds with the default design while
  // the form said otherwise. The effective design is deliberately NOT a flag: `provision.sh`
  // resolves it from the registry the fleet ships, so one answer of record exists.
  const args = provisionArgs({
    site: 'harbour.localhost',
    label: 'harbour',
    platform: 'joomla',
    quickstart: 'tracy-apple/j6',
    design: 'airbnb',
    designRevision: 'a'.repeat(64),
    effectiveDesign: 'apple',
    contractProfile: 'tracy-apple/j6/1.1.0',
    fresh: true,
    privateRoot: '/srv/tracy'
  })
  assert.equal(args.includes('--design'), true)
  assert.equal(args[args.indexOf('--design') + 1], 'airbnb')
  assert.equal(args[args.indexOf('--design-revision') + 1], 'a'.repeat(64))
  assert.equal(args.includes('--effective-design'), false)
  assert.equal(args.includes('--contract-profile'), false)
  assert.equal(args.includes('apple'), false)
  assert.equal(args.includes('tracy-apple/j6/1.1.0'), false)
})

test('provisionArgs: never emits --access-aud or --access-team-domain even if the caller sends them', () => {
  const args = provisionArgs({
    site: 'x.com',
    label: 'x',
    accessAud: 'some-aud',
    accessTeamDomain: 'team.cloudflareaccess.com',
    privateRoot: '/srv/tracy'
  })
  assert.equal(args.includes('--access-aud'), false)
  assert.equal(args.includes('--access-team-domain'), false)
  assert.deepEqual(args, ['--site', 'x.com', '--label', 'x', '--no-publish', '--root', '/srv/tracy'])
})

test('provisionArgs: omits a flag entirely when its value is missing, never emits an empty value', () => {
  const args = provisionArgs({ site: 'x.com', label: 'x', privateRoot: '/srv/tracy' })
  assert.deepEqual(args, ['--site', 'x.com', '--label', 'x', '--no-publish', '--root', '/srv/tracy'])
})

test('provisionArgs: --fresh only appears when instruction.fresh is truthy', () => {
  const withoutFresh = provisionArgs({ site: 'x.com', label: 'x', privateRoot: '/root' })
  const withFresh = provisionArgs({ site: 'x.com', label: 'x', fresh: true, privateRoot: '/root' })
  assert.equal(withoutFresh.includes('--fresh'), false)
  assert.equal(withFresh.includes('--fresh'), true)
})

test('provisionArgs: coworkMinVersion reaches provision.sh as --cowork-min-version, and is omitted when nothing seals the site', () => {
  // 🔒 THE FLAG IS THE ONLY WAY THE FLOOR TRAVELS. tracy-web reads the contract profiles; no fleet
  // script has them. Drop this mapping and a sealed card is provisioned with `provision.sh`'s
  // default floor (0.8.19), which admits a Claude Cowork plugin with no `content.contract` — the bind then dies
  // at the last step of an otherwise healthy provision. Measured 19/09 on `site-lp4yub`.
  const sealed = provisionArgs({
    site: 'example.com',
    label: 'example-com-0871',
    platform: 'joomla',
    quickstart: 'tracy-base/j6',
    coworkMinVersion: '0.15.0',
    privateRoot: '/srv/private'
  })
  const at = sealed.indexOf('--cowork-min-version')
  assert.notEqual(at, -1, 'a sealed card must carry its floor')
  assert.equal(sealed[at + 1], '0.15.0')

  const unsealed = provisionArgs({
    site: 'example.com',
    label: 'example-com-0871',
    platform: 'joomla',
    privateRoot: '/srv/private'
  })
  assert.equal(unsealed.includes('--cowork-min-version'), false, 'a site nothing seals names no floor')
})

test('provisionArgs: frameAncestors reaches provision.sh as --frame-ancestors, and only a demo carries it', () => {
  // Demo-only, and it stays that way BECAUSE it is threaded, not defaulted: only `provisionDemo`
  // (tracy-web's demo-sites.js) sets `frameAncestors`, so a customer provision — which never sets
  // the field — emits no flag at all, and the EmDash middleware never turns a customer site into a
  // frameable one. A missing value must produce no flag, the rule every optional flag follows.
  const demo = provisionArgs({
    site: 'business-emdash.tracy.test',
    label: 'business-emdash',
    platform: 'emdash',
    frameAncestors: 'https://cowork.tracy.site',
    privateRoot: '/srv/tracy'
  })
  const i = demo.indexOf('--frame-ancestors')
  assert.ok(i >= 0)
  assert.equal(demo[i + 1], 'https://cowork.tracy.site')

  const customer = provisionArgs({
    site: 'lantern.localhost',
    label: 'lantern',
    platform: 'emdash',
    privateRoot: '/srv/tracy'
  })
  assert.equal(customer.includes('--frame-ancestors'), false)
})

test('provisionArgs: mailSender reaches provision.sh as --mail-sender, and an absent one emits no flag', () => {
  // A site nobody owns yet (a demo, a stock instance) has no owner email to send mail from, so
  // tracy-web names the site's own relay address instead. It is a separate flag from ownerEmail
  // because ownerEmail also makes an EmDash admin account (mint-agent-admin.cjs): the relay address
  // must never become a person who can sign in.
  const demo = provisionArgs({
    site: 'business-emdash.tracy.test',
    label: 'business-emdash',
    platform: 'emdash',
    mailSender: 'business-emdash@sites.tracy.site',
    privateRoot: '/srv/tracy'
  })
  const i = demo.indexOf('--mail-sender')
  assert.ok(i >= 0, demo.join(' '))
  assert.equal(demo[i + 1], 'business-emdash@sites.tracy.site')
  assert.equal(demo.includes('--owner-email'), false)
  const customer = provisionArgs({
    site: 'l.localhost',
    label: 'l',
    ownerEmail: 'a@b.example',
    privateRoot: '/r'
  })
  assert.equal(customer.includes('--mail-sender'), false)
})

// ---------------------------------------------------------------------------------------------
// Routes, exercised through buildApp with a fake `run` and an in-memory `jobs` store — the same
// style app.test.mjs uses, so a test here never spawns a real process or writes a real file.
// ---------------------------------------------------------------------------------------------

async function tmpDir(name) {
  return mkdtemp(path.join(tmpdir(), `tracy-host-${name}-`))
}

function fakeJobs() {
  const store = new Map()
  return {
    async put(id, fields) {
      const current = store.get(id) ?? { id, createdAt: Date.now() }
      const next = { ...current, ...fields, updatedAt: Date.now() }
      store.set(id, next)
      return next
    },
    async get(id) {
      return store.get(id) ?? null
    }
  }
}

async function config() {
  return {
    hostName: 'local',
    hostSecret: 'host-secret',
    sitesRoot: await tmpDir('sites'),
    privateRoot: await tmpDir('private'),
    scriptsDir: await tmpDir('scripts'),
    jobsDir: await tmpDir('jobs'),
    logDir: await tmpDir('logs')
  }
}

async function signedPost(app, secret, path, payload) {
  const body = JSON.stringify(payload)
  const headers = await signHostCall({ secret, path, body })
  return app.fetch(new Request(`http://tracy-host.test${path}`, { method: 'POST', headers, body }))
}

async function signedGet(app, secret, path) {
  const headers = await signHostCall({ secret, path, body: '' })
  return app.fetch(new Request(`http://tracy-host.test${path}`, { method: 'GET', headers }))
}

// ⚠ A DEADLINE IN SECONDS, NOT A COUNT OF TRIES. It was `tries = 100, delayMs = 5` — about half a
// second of budget on an idle machine, and a WALL-CLOCK deadline in disguise on a busy one. Under
// the full `pnpm build:check` (thousands of tests, plus whatever else the laptop is running) that
// budget ran out and the run went red on a test nothing had touched — measured 11/09: 1177ms to
// burn through all 100 tries, and passing in 137ms the moment it ran alone. A gate that goes red
// for a reason that is not the code teaches people to re-run it, which is how a real red gets
// ignored. Ten seconds costs nothing when the job finishes in milliseconds, which it always does.
async function pollJob(app, secret, jobId, { until, timeoutMs = 10_000, delayMs = 5 } = {}) {
  const deadline = Date.now() + timeoutMs
  let job
  do {
    const res = await signedGet(app, secret, `/_host/jobs/${jobId}`)
    job = await res.json()
    if (until(job)) return job
    await new Promise((r) => setTimeout(r, delayMs))
  } while (Date.now() < deadline)
  throw new Error(`pollJob: gave up after ${timeoutMs}ms; last job was ${JSON.stringify(job)}`)
}

test('POST /_host/provision: 202 with a jobId, then GET /_host/jobs/:id shows running/starting and finally done/ready/port', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  let onLineCalls = []
  // 🔒 THE INTERMEDIATE STATE IS HELD UNTIL THE TEST HAS SEEN IT, not for a fixed 15 ms. A sleep
  // is a race against the poller: under a full gate run with a Docker build alongside (measured
  // 13/09), the first poll after the POST already found the job `done`, the "running / starting
  // database" moment had come and gone unobserved, and `pollJob` then spent its whole ten-second
  // budget polling a finished job before going red — on a test nothing had touched. The fake
  // script now waits for the test to release it, so the state it is asserting cannot be missed.
  let releaseScript
  const observed = new Promise((r) => {
    releaseScript = r
  })
  const run = async ({ script, args, onLine }) => {
    assert.equal(script, 'bash')
    assert.ok(args[0].endsWith('provision/provision.sh'))
    onLineCalls = args
    // `==>`, with the arrow, because that is what `provision.sh` prints — 121 of its narration
    // lines carry it. This fixture said `==` until 19/09/2026 and so asserted the step label on a
    // string the script never emits; the arrow it left behind reached the customer's Build screen.
    await onLine('==> starting database')
    await observed
    await onLine('TRACY_RESULT port=8181 label=lantern')
    return { code: 0, tail: ['==> starting database', 'TRACY_RESULT port=8181 label=lantern'] }
  }
  const app = buildApp({ config: cfg, jobs, run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'lantern.tracy.ai',
    label: 'lantern',
    platform: 'wordpress',
    fresh: true
  })
  assert.equal(res.status, 202)
  const { jobId } = await res.json()
  assert.ok(jobId)

  // Somewhere along the way it was running with the step the script announced.
  const running = await pollJob(app, cfg.hostSecret, jobId, {
    until: (j) => j.state === 'running' && j.step === 'starting database'
  })
  assert.equal(running.label, 'lantern')
  releaseScript()

  const done = await pollJob(app, cfg.hostSecret, jobId, { until: (j) => j.state === 'done' })
  assert.equal(done.step, 'ready')
  assert.equal(done.port, 8181)

  assert.ok(onLineCalls.includes('--fresh'))
  assert.ok(onLineCalls.includes('--root'))
  assert.ok(onLineCalls.includes(cfg.privateRoot))
})

test('POST /_host/provision: a script that exits non-zero produces a failed job with the last 200 lines as output', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`)
  const run = async () => ({ code: 1, tail: lines })
  const app = buildApp({ config: cfg, jobs, run })

  // fresh:true — a restore (the non-fresh path) would need webrootKey, which isn't what this
  // test is about; see the dedicated 400 test below for that branch.
  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'x.com',
    label: 'x',
    fresh: true
  })
  assert.equal(res.status, 202)
  const { jobId } = await res.json()

  const failed = await pollJob(app, cfg.hostSecret, jobId, { until: (j) => j.state === 'failed' })
  assert.equal(failed.exitCode, 1)
  assert.equal(failed.output.split('\n').length, 200)
  assert.equal(failed.output, lines.join('\n'))
})

/**
 * What TracyHQ/tch#361's failed job really printed, in the order it printed it: a screenful of
 * GNU tar warnings from unpacking a macOS-packed archive, the stages, the daemon refusing the port,
 * and the timing summary the EXIT trap always writes last. The wizard showed the first lines.
 */
const TAR_NOISE = "tar: Ignoring unknown extended header keyword 'LIBARCHIVE.xattr.com.apple.provenance'"
const BIND_ERROR =
  'Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint lantern-web-1 (0123abcd): failed to bind host port 127.0.0.1:52060/tcp: address already in use'

function issue361Tail() {
  return [
    ...Array.from({ length: 30 }, () => TAR_NOISE),
    '==> starting database',
    '[stage]    12s  +12s   fetching webroot',
    ' Container lantern-web-1  Creating',
    ' Container lantern-web-1  Created',
    ' Container lantern-web-1  Starting',
    BIND_ERROR,
    '[stage]   112s  +100s  · pulling and starting the site containers',
    '[stage] ── 112s total, slowest stages first ──',
    '[stage]    100s  · pulling and starting the site containers'
  ]
}

test('POST /_host/provision: a failed job leads its output with the daemon error, not the tar noise before it', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  const tail = issue361Tail()
  const run = async () => ({ code: 1, tail })
  const app = buildApp({ config: cfg, jobs, run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'lantern.tracy.ai',
    label: 'lantern',
    fresh: true
  })
  const { jobId } = await res.json()

  const failed = await pollJob(app, cfg.hostSecret, jobId, { until: (j) => j.state === 'failed' })
  const lines = failed.output.split('\n')
  assert.equal(lines[0], BIND_ERROR)
  assert.equal(failed.output.includes('LIBARCHIVE.xattr'), false, 'the harmless tar warnings are dropped')
  // The context after it keeps the order it was printed in, timing summary included.
  assert.deepEqual(
    lines.slice(1),
    tail.filter((line) => line !== TAR_NOISE)
  )
  assert.ok(failed.detail.includes('provision-lantern.log'), 'the full log is still named')
})

test('failedProvisionOutput: the last error leads — a retry that failed again comes before the one it retried', () => {
  const second = BIND_ERROR.replace('52060', '52061')
  const output = failedProvisionOutput([
    '==> starting database',
    BIND_ERROR,
    '!! port 52060 was taken before the site could start — retrying once on port 52061',
    second,
    '[stage] ── 140s total, slowest stages first ──'
  ]).split('\n')
  assert.deepEqual(output.slice(0, 3), [
    second,
    '!! port 52060 was taken before the site could start — retrying once on port 52061',
    BIND_ERROR
  ])
})

test('failedProvisionOutput: a port conflict the retry fixed never leads when a later step fails', () => {
  // The lines provision.sh prints on this path, in order: the retry, the `mark` it writes the moment
  // the site is up, then Joomla's `platform_post_up` refusing with a line no error pattern knows
  // (platform/joomla.sh), then the EXIT trap's summary. No `==>` sits between the start and the failure.
  const missing = 'quickstart configuration is missing'
  const output = failedProvisionOutput([
    '==> starting database',
    '[stage]    12s  +12s   fetching webroot',
    '[stage]    20s  +8s    starting database',
    BIND_ERROR,
    '!! port 52060 was taken before the site could start — retrying once on port 52061',
    ' Container lantern-web-1  Started',
    '[stage]   130s  +110s  · pulling and starting the site containers',
    missing,
    '[stage]   131s  +1s    · site started, finishing it on its running stack',
    '[stage] ── 131s total, slowest stages first ──',
    '[stage]    110s  · pulling and starting the site containers'
  ]).split('\n')
  assert.equal(output[0], missing, 'the failing step leads, even with no error pattern in it')
  // Then the tail as printed, its oldest line given up so the output keeps the tail's length.
  assert.equal(output[1], '[stage]    12s  +12s   fetching webroot')
  assert.equal(output.length, 11)
  assert.equal(output.filter((line) => line === BIND_ERROR).length, 1, 'the fixed conflict stays, in place')
})

test('failedProvisionOutput: the failing step leads with its own error lines, not an earlier step’s', () => {
  const output = failedProvisionOutput([
    '==> fetching webroot',
    'curl: (22) The requested URL returned error: 503',
    'retrying the download',
    '==> starting database',
    '[stage]    40s  +40s   fetching webroot',
    'waiting for mariadb',
    'Error response from daemon: container lantern-db-1 is unhealthy',
    '[stage] ── 90s total, slowest stages first ──'
  ]).split('\n')
  assert.deepEqual(output.slice(0, 2), [
    'Error response from daemon: container lantern-db-1 is unhealthy',
    'curl: (22) The requested URL returned error: 503'
  ])
})

test('failedProvisionOutput: stays inside the 200 lines run already capped the tail to', () => {
  const tail = [...Array.from({ length: 199 }, (_, i) => `line ${i + 1}`), BIND_ERROR]
  const output = failedProvisionOutput(tail).split('\n')
  assert.equal(output.length, 200)
  assert.equal(output[0], BIND_ERROR)
  assert.equal(output.at(-1), BIND_ERROR)
})

test('failedProvisionOutput: a tail with no error line, and an empty one, come back as printed', () => {
  assert.equal(
    failedProvisionOutput(['one', 'two', '[stage] failed stage name']),
    'one\ntwo\n[stage] failed stage name'
  )
  assert.equal(failedProvisionOutput([]), '')
})

test('POST /_host/provision: missing site or label is refused 400 before any job is created', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  const run = async () => {
    throw new Error('must not be called')
  }
  const app = buildApp({ config: cfg, jobs, run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', { site: 'x.com' })
  assert.equal(res.status, 400)
})

test('POST /_host/provision: a flag value with shell-hostile characters is refused 400', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  const run = async () => {
    throw new Error('must not be called')
  }
  const app = buildApp({ config: cfg, jobs, run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'x.com; rm -rf /',
    label: 'x'
  })
  assert.equal(res.status, 400)
})

test('POST /_host/provision: a plus-addressed ownerEmail is accepted and reaches argv — a Gmail alias is a real customer', async () => {
  // Measured 11/09 on the dev box: signing in as `contact+tracydev@…` worked, and every site the
  // person then created answered `BAD_REQUEST: refused ownerEmail` — an error naming a field they
  // never typed. `SAFE_ARG` had no `+`, inherited from the Python host. argv is an array, so `+`
  // is one ordinary character all the way to provision.sh.
  const cfg = await config()
  const jobs = fakeJobs()
  let seen = null
  const run = async ({ args, onLine }) => {
    seen = args
    await onLine('TRACY_RESULT port=8081 label=x')
    return { code: 0, tail: ['TRACY_RESULT port=8081 label=x'] }
  }
  const app = buildApp({ config: cfg, jobs, run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'x.com',
    label: 'x',
    fresh: true,
    ownerEmail: 'me+tracy@example.com'
  })
  assert.equal(res.status, 202)
  const { jobId } = await res.json()
  await pollJob(app, cfg.hostSecret, jobId, { until: (j) => j.state === 'done' })
  assert.ok(seen.includes('me+tracy@example.com'), `argv kept the plus-address: ${JSON.stringify(seen)}`)
})

test('POST /_host/provision: a restore (not fresh, not emdash) without webrootKey is refused 400 synchronously — no job is created, py:707-709', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  const run = async () => {
    throw new Error('must not be called')
  }
  const app = buildApp({ config: cfg, jobs, run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'x.com',
    label: 'x',
    platform: 'wordpress'
  })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).why, 'need webrootKey for this platform')
})

test('POST /_host/provision: fresh:true never needs webrootKey — a fleet-born site has no archive to restore', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  const run = async () => ({ code: 0, tail: [] })
  const app = buildApp({ config: cfg, jobs, run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'x.com',
    label: 'x',
    platform: 'wordpress',
    fresh: true
  })
  assert.equal(res.status, 202)
})

test('POST /_host/provision: platform emdash never needs webrootKey — it keeps its site in a database, not a webroot', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  const run = async () => ({ code: 0, tail: [] })
  const app = buildApp({ config: cfg, jobs, run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'x.com',
    label: 'x',
    platform: 'emdash'
  })
  assert.equal(res.status, 202)
})

test('POST /_host/provision: a restore WITH webrootKey is accepted', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  const run = async () => ({ code: 0, tail: [] })
  const app = buildApp({ config: cfg, jobs, run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'x.com',
    label: 'x',
    platform: 'wordpress',
    webrootKey: 'x.com/migrate/1/webroot.tar'
  })
  assert.equal(res.status, 202)
})

test('POST /_host/provision: a non-integer port fails the job loudly instead of writing HOST_PORT=NaN', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  let sawEnv = null
  const run = async ({ env }) => {
    sawEnv = env
    return { code: 0, tail: [] }
  }
  const app = buildApp({ config: cfg, jobs, run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'x.com',
    label: 'x',
    fresh: true,
    port: 'not-a-number'
  })
  assert.equal(res.status, 202) // Python's own check here is not synchronous either
  const { jobId } = await res.json()
  const failed = await pollJob(app, cfg.hostSecret, jobId, { until: (j) => j.state === 'failed' })
  assert.ok(failed.detail.includes('port'))
  assert.equal(sawEnv, null) // run() must never even be called with a bad HOST_PORT
})

test("POST /_host/provision: a numeric-string port reaches the script as HOST_PORT, truncated like Python's int()", async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  let sawEnv = null
  const run = async ({ env }) => {
    sawEnv = env
    return { code: 0, tail: [] }
  }
  const app = buildApp({ config: cfg, jobs, run })
  await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'x.com',
    label: 'x',
    fresh: true,
    port: '8181'
  })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(sawEnv.HOST_PORT, '8181')
})

test('POST /_host/provision: signed archive URLs reach the script through the environment, never argv', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  let saw = null
  const run = async (input) => {
    saw = input
    return { code: 0, tail: [] }
  }
  const app = buildApp({ config: cfg, jobs, run })
  const webrootUrl =
    'https://acct.r2.cloudflarestorage.com/b/sites/x/webroot.tar?X-Amz-Signature=abc&X-Amz-Expires=86400'
  const dbUrl = 'https://acct.r2.cloudflarestorage.com/b/sites/x/db.sql.gz?X-Amz-Signature=def'
  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'x.com',
    label: 'x',
    platform: 'wordpress',
    webrootKey: 'sites/x/webroot.tar',
    dbKey: 'sites/x/db.sql.gz',
    webrootUrl,
    dbUrl
  })
  assert.equal(res.status, 202)
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(saw.env.TRACY_ARCHIVE_WEBROOT_URL, webrootUrl)
  assert.equal(saw.env.TRACY_ARCHIVE_DB_URL, dbUrl)
  // A signed URL is a bearer credential for its lifetime: `ps` must not show it.
  assert.ok(!saw.args.some((a) => a.includes('X-Amz-Signature')))
})

test('POST /_host/provision: an archive URL that is not http(s) is refused 400 synchronously', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  let ran = false
  const run = async () => {
    ran = true
    return { code: 0, tail: [] }
  }
  const app = buildApp({ config: cfg, jobs, run })
  for (const bad of ['file:///etc/passwd', 'https://x/y\nZ=1', 42]) {
    const res = await signedPost(app, cfg.hostSecret, '/_host/provision', {
      site: 'x.com',
      label: 'x',
      platform: 'wordpress',
      webrootKey: 'sites/x/webroot.tar',
      webrootUrl: bad
    })
    assert.equal(res.status, 400, String(bad))
    assert.equal((await res.json()).why, 'refused webrootUrl')
  }
  assert.equal(ran, false)
})

test('provisionArgs: the copy address reaches provision.sh as --copy-address', () => {
  const args = provisionArgs({
    site: 'fijitrips.example',
    label: 'fijitrips-example-5254d120',
    copyAddress: 'http://fijitrips-example-5254d120.tracy.test:51710/',
    privateRoot: '/srv/tracy'
  })
  const i = args.indexOf('--copy-address')
  assert.ok(i >= 0)
  assert.equal(args[i + 1], 'http://fijitrips-example-5254d120.tracy.test:51710/')
})

test('GET /_host/jobs/:id: 404 for a job that was never created', async () => {
  const cfg = await config()
  const app = buildApp({ config: cfg, jobs: fakeJobs(), run: async () => ({ code: 0, tail: [] }) })
  const res = await signedGet(app, cfg.hostSecret, '/_host/jobs/does-not-exist')
  assert.equal(res.status, 404)
})

test('POST /_host/attach: creates sitesRoot/<label> and writes AGENTS.md via ensure-site-folder.mjs', async () => {
  const cfg = await config()
  // ensure-site-folder.mjs lives under scriptsDir/provision/ in production; mirror that layout in
  // the temp scriptsDir by pointing at the real file the repo ships.
  const realScripts = path.resolve(
    new URL('../../../packages/fleet/tracy-fleet-operation/scripts', import.meta.url).pathname
  )
  const app = buildApp({
    config: { ...cfg, scriptsDir: realScripts },
    jobs: fakeJobs(),
    run: async () => ({ code: 0, tail: [] })
  })

  const res = await signedPost(app, cfg.hostSecret, '/_host/attach', { label: 'lantern' })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, label: 'lantern', path: '/site/lantern' })

  const agents = await readFile(path.join(cfg.sitesRoot, 'lantern', 'AGENTS.md'), 'utf8')
  assert.ok(agents.includes('lantern'))
})

test('POST /_host/attach: calling it twice is a no-op the second time — write-if-missing, not overwritten', async () => {
  const cfg = await config()
  const realScripts = path.resolve(
    new URL('../../../packages/fleet/tracy-fleet-operation/scripts', import.meta.url).pathname
  )
  const app = buildApp({
    config: { ...cfg, scriptsDir: realScripts },
    jobs: fakeJobs(),
    run: async () => ({ code: 0, tail: [] })
  })
  await signedPost(app, cfg.hostSecret, '/_host/attach', { label: 'lantern' })
  const agentsPath = path.join(cfg.sitesRoot, 'lantern', 'AGENTS.md')
  await writeFile(agentsPath, 'the team already edited this\n')

  const res = await signedPost(app, cfg.hostSecret, '/_host/attach', { label: 'lantern' })
  assert.equal(res.status, 200)
  assert.equal(await readFile(agentsPath, 'utf8'), 'the team already edited this\n')
})

test('POST /_host/attach: a label containing a path separator is refused 400', async () => {
  const cfg = await config()
  const app = buildApp({ config: cfg, jobs: fakeJobs(), run: async () => ({ code: 0, tail: [] }) })
  const res = await signedPost(app, cfg.hostSecret, '/_host/attach', { label: '../escape' })
  assert.equal(res.status, 400)
})

test('POST /_host/attach: any body key other than label is refused 400 — py:568-570, fail-open on an unknown field is a bug here', async () => {
  const cfg = await config()
  const app = buildApp({ config: cfg, jobs: fakeJobs(), run: async () => ({ code: 0, tail: [] }) })
  const res = await signedPost(app, cfg.hostSecret, '/_host/attach', {
    label: 'lantern',
    siteKey: 'lantern.tracy.ai'
  })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).why, 'refused siteKey')
})

test('POST /_host/teardown: 202 with a jobId, then a done job once the script exits 0', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  let calledArgs = null
  const run = async ({ script, args }) => {
    assert.equal(script, 'bash')
    calledArgs = args
    return { code: 0, tail: ['teardown complete'] }
  }
  const app = buildApp({ config: cfg, jobs, run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/teardown', {
    label: 'lantern',
    site: 'lantern.tracy.ai'
  })
  assert.equal(res.status, 202)
  const { jobId } = await res.json()
  const done = await pollJob(app, cfg.hostSecret, jobId, { until: (j) => j.state === 'done' })
  assert.equal(done.step, 'teardown')

  assert.ok(calledArgs.includes('--label'))
  assert.ok(calledArgs.includes('lantern'))
  assert.ok(calledArgs.includes('--site'))
  assert.ok(calledArgs.includes('lantern.tracy.ai'))
  assert.ok(calledArgs.includes('--root'))
  assert.ok(calledArgs.includes(cfg.privateRoot))
})

test('POST /_host/teardown with a jobKey answers the job named by that key, and starts nothing twice', async () => {
  // tracy-web names a demo teardown before it asks (12/10/2026), so the install door can answer at
  // once with the id the host will use; a lost answer asked again must not tear down twice.
  const { keyedJobId } = await import('../src/app.js')
  const cfg = await config()
  const jobs = fakeJobs()
  let runs = 0
  const run = async () => {
    runs++
    return { code: 0, tail: ['teardown complete'] }
  }
  const app = buildApp({ config: cfg, jobs, run })
  const body = { label: 'lantern', jobKey: 'demo:lantern:teardown:abc123' }
  const first = await signedPost(app, cfg.hostSecret, '/_host/teardown', body)
  assert.equal(first.status, 202)
  const { jobId } = await first.json()
  assert.equal(jobId, keyedJobId('demo:lantern:teardown:abc123'))
  await pollJob(app, cfg.hostSecret, jobId, { until: (j) => j.state === 'done' })
  const again = await signedPost(app, cfg.hostSecret, '/_host/teardown', body)
  assert.deepEqual(await again.json(), { jobId, reused: true })
  assert.equal(runs, 1)
  const bad = await signedPost(app, cfg.hostSecret, '/_host/teardown', { label: 'lantern', jobKey: 'a b' })
  assert.equal(bad.status, 400)
})

test('POST /_host/teardown: a host with a tunnel hands teardown.sh the three names ingress_api.py reads', async () => {
  const cfg = await config()
  cfg.cloudflare = { token: 'cf-tok', account: 'acct-1', tunnel: 'tun-1' }
  let seenEnv = null
  const run = async ({ env }) => {
    seenEnv = env
    return { code: 0, tail: [] }
  }
  const app = buildApp({ config: cfg, jobs: fakeJobs(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/teardown', { label: 'lantern' })
  assert.equal(res.status, 202)
  await pollJob(app, cfg.hostSecret, (await res.json()).jobId, { until: (j) => j.state === 'done' })

  // 🔒 Measured 21/09 on the dev host: a bare `process.env` made teardown.sh skip the rule removal
  // on every teardown, and a stale rule sent the Tracy Business demo to Tracy Base's container.
  assert.equal(seenEnv.TRACY_CF_API_TOKEN, 'cf-tok')
  assert.equal(seenEnv.TRACY_CF_ACCOUNT_ID, 'acct-1')
  assert.equal(seenEnv.TRACY_TUNNEL_ID, 'tun-1')
  assert.notEqual(seenEnv.TRACY_TUNNEL, 'none', 'a host with a tunnel never says it has none')
})

test('POST /_host/teardown: a host with no tunnel still tears down, with no Cloudflare names invented', async () => {
  const cfg = await config()
  cfg.cloudflare = null
  let seenEnv = null
  const run = async ({ env }) => {
    seenEnv = env
    return { code: 0, tail: [] }
  }
  const app = buildApp({ config: cfg, jobs: fakeJobs(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/teardown', { label: 'lantern' })
  assert.equal(res.status, 202)
  const done = await pollJob(app, cfg.hostSecret, (await res.json()).jobId, {
    until: (j) => j.state === 'done'
  })
  assert.equal(done.step, 'teardown')
  assert.equal(seenEnv.TRACY_CF_API_TOKEN, process.env.TRACY_CF_API_TOKEN)
  // Said, not left to be inferred: teardown.sh refuses a host with no road to the tunnel unless it
  // is told there is none.
  assert.equal(seenEnv.TRACY_TUNNEL, 'none')
})

/**
 * 🔒 STEP 5 OF teardown.sh PRUNES THIS HOST'S RECORDS ABOUT THE SITE, AND IT HAS TO BE TOLD WHERE THEY ARE.
 * Without the two names it falls back to `/var/lib/tracy-jobs` and `/var/log/tracy-hooks`, the Python
 * hooks' paths, which do not exist in this container (measured 05/10/2026 on the local stand): every
 * deleted site left its job records (whole slabs of its content in `output`) and its provision log, and
 * the "keeping …/teardown-<label>.log" line named a file that was not there.
 */
test('POST /_host/teardown: teardown.sh is handed the job and log directories this host really uses', async () => {
  const cfg = await config()
  let seen = null
  const run = async ({ env, logPath }) => {
    seen = { env, logPath }
    return { code: 0, tail: [] }
  }
  const app = buildApp({ config: cfg, jobs: fakeJobs(), run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/teardown', { label: 'lantern' })
  assert.equal(res.status, 202)
  await pollJob(app, cfg.hostSecret, (await res.json()).jobId, { until: (j) => j.state === 'done' })
  assert.equal(seen.env.JOBS_DIR, cfg.jobsDir)
  assert.equal(seen.env.HOOK_LOG_DIR, cfg.logDir)
  // The log the script keeps or removes is the one this host writes it into.
  assert.equal(path.dirname(seen.logPath), seen.env.HOOK_LOG_DIR)
  assert.equal(path.basename(seen.logPath), 'teardown-lantern.log')
})

test('POST /_host/teardown: an invalid site is silently dropped from the argv, not a 400 — same as Python', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  let calledArgs = null
  const run = async ({ args }) => {
    calledArgs = args
    return { code: 0, tail: [] }
  }
  const app = buildApp({ config: cfg, jobs, run })

  const res = await signedPost(app, cfg.hostSecret, '/_host/teardown', {
    label: 'lantern',
    site: 'bad; rm -rf /'
  })
  assert.equal(res.status, 202)
  await pollJob(app, cfg.hostSecret, (await res.json()).jobId, { until: (j) => j.state === 'done' })
  assert.equal(calledArgs.includes('--site'), false)
})

test('POST /_host/teardown: a script that exits non-zero produces a failed job', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  const run = async () => ({ code: 1, tail: ['boom'] })
  const app = buildApp({ config: cfg, jobs, run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/teardown', { label: 'lantern' })
  const { jobId } = await res.json()
  const failed = await pollJob(app, cfg.hostSecret, jobId, { until: (j) => j.state === 'failed' })
  assert.equal(failed.exitCode, 1)
  assert.equal(failed.output, 'boom')
})

test('POST /_host/teardown: missing label is refused 400', async () => {
  const cfg = await config()
  const app = buildApp({ config: cfg, jobs: fakeJobs(), run: async () => ({ code: 0, tail: [] }) })
  const res = await signedPost(app, cfg.hostSecret, '/_host/teardown', {})
  assert.equal(res.status, 400)
})

test('POST /_host/reserve: makes the folder with the claim marker alone, twice is the same answer, a site is left as it is', async () => {
  const cfg = await config()
  const app = buildApp({ config: cfg, jobs: fakeJobs(), run: async () => ({ code: 0, tail: [] }) })
  const res = await signedPost(app, cfg.hostSecret, '/_host/reserve', { label: 'granite' })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, label: 'granite', path: '/site/granite', reserved: true })
  const dir = path.join(cfg.sitesRoot, 'granite')
  assert.deepEqual(
    await readdir(dir),
    ['.tracy-claimed.json'],
    'the marker and nothing else — no AGENTS.md before the provision'
  )
  const again = await signedPost(app, cfg.hostSecret, '/_host/reserve', { label: 'granite' })
  assert.equal((await again.json()).reserved, true)
  // A folder that already holds a site: untouched, and said so.
  await writeFile(path.join(dir, 'AGENTS.md'), 'a real site\n')
  const onSite = await signedPost(app, cfg.hostSecret, '/_host/reserve', { label: 'granite' })
  assert.equal((await onSite.json()).reserved, false)
  assert.equal(await readFile(path.join(dir, 'AGENTS.md'), 'utf8'), 'a real site\n')
  const bad = await signedPost(app, cfg.hostSecret, '/_host/reserve', { label: 'granite', extra: 1 })
  assert.equal(bad.status, 400)
})

test('POST /_host/unreserve: removes a folder that holds the marker alone, never one that holds a site', async () => {
  const cfg = await config()
  const app = buildApp({ config: cfg, jobs: fakeJobs(), run: async () => ({ code: 0, tail: [] }) })
  await signedPost(app, cfg.hostSecret, '/_host/reserve', { label: 'granite' })
  const gone = await signedPost(app, cfg.hostSecret, '/_host/unreserve', { label: 'granite' })
  assert.deepEqual(await gone.json(), { ok: true, label: 'granite', removed: true })
  assert.equal(existsSync(path.join(cfg.sitesRoot, 'granite')), false)
  const none = await signedPost(app, cfg.hostSecret, '/_host/unreserve', { label: 'granite' })
  assert.equal((await none.json()).removed, false)
  await signedPost(app, cfg.hostSecret, '/_host/reserve', { label: 'marble' })
  await writeFile(path.join(cfg.sitesRoot, 'marble', 'AGENTS.md'), 'a real site\n')
  const kept = await (await signedPost(app, cfg.hostSecret, '/_host/unreserve', { label: 'marble' })).json()
  assert.equal(kept.removed, false)
  assert.match(kept.reason ?? '', /holds a site/)
  assert.ok(existsSync(path.join(cfg.sitesRoot, 'marble', 'AGENTS.md')))
})

/**
 * 🔒 THESE FOUR WERE NESTED INSIDE THE TEST ABOVE UNTIL 17/09, and un-awaited, so the runner
 * cancelled them the moment their parent returned: `test did not finish before its parent and was
 * cancelled`. The parent then failed with "4 subtests failed" — on macOS. On the Linux runner they
 * finished inside the parent's tick and everything was green, so CI called this file healthy while
 * four of its cases proved nothing on either machine.
 *
 * A missing `})` is all it was. Kept as a comment because the failure reads as a flaky test and is
 * not one: the next person to see red here should reach for the nesting, not for a retry.
 */
test('a resolved quickstart is written beside the log and pointed at with TRACY_QUICKSTARTS_JSON', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-host-qs-'))
  let seen = null
  await runProvisionJob({
    jobId: 'j1',
    body: {
      label: 'acme',
      site: 'acme',
      platform: 'emdash',
      quickstart: 'tracy-business/emdash-0.x',
      quickstartEntry: {
        platform: 'emdash',
        version: '1.0.0',
        source: { file: 'q.zip', sha256: 'a'.repeat(64), url: 'https://github.test/q.zip' }
      }
    },
    config: { logDir: dir, privateRoot: '/srv', scriptsDir: '/opt' },
    jobs: { put: async () => {} },
    run: async ({ env }) => {
      seen = env.TRACY_QUICKSTARTS_JSON
      return { code: 0, tail: '' }
    }
  })
  assert.equal(seen, path.join(dir, 'quickstart-acme.json'))
  const written = JSON.parse(readFileSync(seen, 'utf8'))
  assert.deepEqual(
    Object.keys(written),
    ['tracy-business/emdash-0.x'],
    'one entry, the shape quickstart.py reads'
  )
  assert.equal(written['tracy-business/emdash-0.x'].source.sha256, 'a'.repeat(64))
  rmSync(dir, { recursive: true, force: true })
})

test('the first quickstart on a host makes its own log directory, instead of dying on ENOENT', async () => {
  // 🔒 THE FIXTURE IS THE POINT: a log directory that does NOT exist yet. The test above hands
  // `runProvisionJob` a `mkdtempSync` directory, so for months it proved the file was written
  // without ever proving it COULD be — and on a host whose jobs volume is new, it could not.
  // Measured 17/09 on a freshly wiped local stand: `Install demo` on ja_trip answered
  // "Failed at provision — ENOENT: no such file or directory, open
  // '/var/lib/tracy-host/logs/quickstart-ja-trip-joomla.json'", before the script was spawned.
  // `runScript` makes that directory, but it never got the chance to run.
  const parent = mkdtempSync(path.join(tmpdir(), 'tracy-host-fresh-'))
  const dir = path.join(parent, 'logs')
  assert.equal(existsSync(dir), false, 'the fixture must start without the directory')
  let seen = null
  let ran = false
  await runProvisionJob({
    jobId: 'j-fresh',
    body: {
      label: 'ja-trip-joomla',
      site: 'ja-trip-joomla',
      platform: 'joomla',
      quickstart: 'quickstart/ja-trip/j6',
      quickstartEntry: {
        platform: 'joomla',
        version: '1.0.0',
        source: { file: 'q.zip', sha256: 'b'.repeat(64), url: 'https://github.test/q.zip' }
      }
    },
    config: { logDir: dir, privateRoot: '/srv', scriptsDir: '/opt' },
    jobs: { put: async () => {} },
    run: async ({ env }) => {
      ran = true
      seen = env.TRACY_QUICKSTARTS_JSON
      return { code: 0, tail: '' }
    }
  })
  assert.ok(ran, 'the script is reached at all — the failure was that it never was')
  assert.equal(seen, path.join(dir, 'quickstart-ja-trip-joomla.json'))
  assert.equal(JSON.parse(readFileSync(seen, 'utf8'))['quickstart/ja-trip/j6'].source.sha256, 'b'.repeat(64))
  rmSync(parent, { recursive: true, force: true })
})

test('no resolved entry, no file and no pointer — an older caller keeps the old road', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-host-qs-'))
  let seen = 'untouched'
  await runProvisionJob({
    jobId: 'j2',
    body: { label: 'acme', site: 'acme', platform: 'joomla', quickstart: 'tracy-base/j6' },
    config: { logDir: dir, privateRoot: '/srv', scriptsDir: '/opt' },
    jobs: { put: async () => {} },
    run: async ({ env }) => {
      seen = env.TRACY_QUICKSTARTS_JSON
      return { code: 0, tail: '' }
    }
  })
  assert.equal(seen, undefined)
  rmSync(dir, { recursive: true, force: true })
})

test('workflow: template reaches provision.sh as BUILD_WORKFLOW — a demo is installed as released, whatever its card says', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-host-wf-'))
  const envOf = async (body) => {
    let seen = null
    await runProvisionJob({
      jobId: 'j1',
      body: { label: 'base-joomla', site: 'base-joomla', platform: 'joomla', fresh: true, ...body },
      config: { logDir: dir, privateRoot: '/srv', scriptsDir: '/opt' },
      jobs: { put: async () => {} },
      run: async ({ env }) => {
        seen = env
        return { code: 0, tail: '' }
      }
    })
    return seen
  }
  assert.equal((await envOf({ workflow: 'template' })).BUILD_WORKFLOW, 'template')
  assert.equal(
    (await envOf({})).BUILD_WORKFLOW,
    undefined,
    'absent: provision.sh decides from the entry, as before'
  )
})

test('demo: true reaches provision.sh as TRACY_DEMO_SITE=1, so the demo runs lean; a customer install never does', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-host-demo-'))
  const envOf = async (body) => {
    let seen = null
    await runProvisionJob({
      jobId: 'j1',
      body: { label: 'base-joomla', site: 'base-joomla', platform: 'joomla', fresh: true, ...body },
      config: { logDir: dir, privateRoot: '/srv', scriptsDir: '/opt' },
      jobs: { put: async () => {} },
      run: async ({ env }) => {
        seen = env
        return { code: 0, tail: '' }
      }
    })
    return seen
  }
  const saved = process.env.TRACY_DEMO_SITE
  delete process.env.TRACY_DEMO_SITE
  try {
    assert.equal((await envOf({ demo: true })).TRACY_DEMO_SITE, '1')
    assert.equal((await envOf({})).TRACY_DEMO_SITE, undefined)
    assert.equal((await envOf({ demo: 'yes' })).TRACY_DEMO_SITE, undefined, 'only the boolean the door sends')
  } finally {
    if (saved !== undefined) process.env.TRACY_DEMO_SITE = saved
    rmSync(dir, { recursive: true, force: true })
  }
})

test('releasesToken travels to provision.sh as TRACY_RELEASES_GITHUB_TOKEN and nowhere else', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-host-tok-'))
  let seen = null
  await runProvisionJob({
    jobId: 'j1',
    body: {
      label: 'acme',
      site: 'acme',
      platform: 'joomla',
      fresh: true,
      releasesToken: 'ghs_' + 'x'.repeat(30)
    },
    config: { logDir: dir, privateRoot: '/srv', scriptsDir: '/opt' },
    jobs: { put: async () => {} },
    run: async ({ args, env }) => {
      seen = { args, env }
      return { code: 0, tail: '' }
    }
  })
  assert.equal(seen.env.TRACY_RELEASES_GITHUB_TOKEN, 'ghs_' + 'x'.repeat(30))
  assert.ok(!seen.args.join(' ').includes('ghs_'), 'the token is env, never argv')
})

/**
 * THE STAGE TIMING LINE MUST NOT BECOME A CUSTOMER-VISIBLE STEP.
 *
 * `provision.sh` narrates fifteen stages and, from 19/09/2026, times each of them. The timing goes
 * to stderr with a `[stage]` prefix precisely because THIS handler reads the same merged stream and
 * turns anything starting with `==` into the sentence on the customer's Build screen
 * (`stepFromLine`, which strips the `=` and shows the rest). Two ways to get that wrong, and neither
 * says anything at runtime: a stamp in FRONT of `==>` stops the progress display updating at all,
 * and a stamp appended after it puts "(12s)" into the sentence a customer reads. This pins the
 * contract from the reading side, where the parser actually lives.
 */
test('provision: `[stage]` timing lines never become a job step, and `==>` lines still do', async () => {
  const cfg = await config()
  const jobs = fakeJobs()
  const steps = []
  const run = async ({ onLine }) => {
    // Exactly what the script emits, interleaved the way the merged stream delivers it.
    await onLine('==> fetching webroot')
    await onLine('[stage]     0s  +0s    start')
    await onLine('==> starting database')
    await onLine('[stage]    12s  +12s   fetching webroot')
    await onLine('[stage] ── 14s total, slowest stages first ──')
    await onLine('[stage]     12s  fetching webroot')
    await onLine('TRACY_RESULT port=8181 label=lantern')
    return { code: 0, tail: [] }
  }
  const watched = {
    ...jobs,
    put: async (id, fields) => {
      if (typeof fields.step === 'string') steps.push(fields.step)
      return jobs.put(id, fields)
    }
  }
  const app = buildApp({ config: cfg, jobs: watched, run })
  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'lantern.tracy.ai',
    label: 'lantern',
    platform: 'wordpress',
    fresh: true
  })
  assert.equal(res.status, 202)
  const { jobId } = await res.json()
  await pollJob(app, cfg.hostSecret, jobId, { until: (j) => j.state === 'done' })

  // The narration still drives the screen…
  assert.ok(steps.includes('fetching webroot'), `no stage reached the job: ${JSON.stringify(steps)}`)
  assert.ok(steps.includes('starting database'), JSON.stringify(steps))
  // …and not one timing line did, in any of its three shapes.
  for (const step of steps) {
    assert.ok(!step.includes('[stage]'), `a timing line became a step: ${JSON.stringify(step)}`)
    assert.ok(!/\bs\s+\+\d+s\b/.test(step), `a timing line became a step: ${JSON.stringify(step)}`)
    assert.ok(!step.includes('slowest stages'), `a summary line became a step: ${JSON.stringify(step)}`)
  }
})

// ── Demo installs take a slot (12/10/2026, fleet01) ────────────────────────────────────────────
//
// Fourteen demo redeploys pressed together on fleet01 (2 cores) all ran provision.sh at once: their
// steps stopped moving for good, and demos nobody touched stopped answering within 20 s. A demo
// provision now waits for one of `demoInstallSlots` (default 2) and says so; the door still
// answers 202 at once, and a customer's provision never waits behind a demo.

/** A `run` whose provision.sh calls end only when the test says so, in start order. */
function heldRun() {
  const started = []
  const run = ({ args, onLine }) =>
    new Promise((resolve) => {
      started.push({
        label: args[args.indexOf('--label') + 1],
        end: async () => {
          await onLine?.('TRACY_RESULT port=8080')
          resolve({ code: 0, tail: ['TRACY_RESULT port=8080'] })
        }
      })
    })
  return { run, started }
}

const demoBody = (label) => ({ site: `${label}.test`, label, platform: 'joomla', fresh: true, demo: true })

test('POST /_host/provision: demo installs beyond the slots queue, say how many are ahead, and start as slots free', async () => {
  const cfg = { ...(await config()), demoInstallSlots: 2 }
  const jobs = fakeJobs()
  const held = heldRun()
  const app = buildApp({ config: cfg, jobs, run: held.run })
  const ids = []
  for (const label of ['d1', 'd2', 'd3', 'd4']) {
    const res = await signedPost(app, cfg.hostSecret, '/_host/provision', demoBody(label))
    assert.equal(res.status, 202, 'the door answers at once, slot or not')
    ids.push((await res.json()).jobId)
  }
  await new Promise((r) => setTimeout(r, 30))
  assert.deepEqual(
    held.started.map((s) => s.label),
    ['d1', 'd2'],
    'two run, two wait'
  )
  assert.equal((await jobs.get(ids[2])).state, 'queued')
  assert.equal((await jobs.get(ids[2])).step, 'waiting for a free install slot (next)')
  assert.equal((await jobs.get(ids[3])).step, 'waiting for a free install slot (1 ahead)')

  held.started[0].end()
  await pollJob(app, cfg.hostSecret, ids[0], { until: (j) => j.state === 'done' })
  await new Promise((r) => setTimeout(r, 30))
  assert.deepEqual(
    held.started.map((s) => s.label),
    ['d1', 'd2', 'd3'],
    'a freed slot goes to the next in line'
  )
  assert.equal((await jobs.get(ids[3])).step, 'waiting for a free install slot (next)')
  for (const s of held.started.slice(1)) s.end()
  await new Promise((r) => setTimeout(r, 30))
  held.started.at(-1).end()
  await pollJob(app, cfg.hostSecret, ids[3], { until: (j) => j.state === 'done' })
  assert.equal(held.started.length, 4)
})

test('POST /_host/provision: a customer provision never waits behind demo installs', async () => {
  const cfg = { ...(await config()), demoInstallSlots: 1 }
  const held = heldRun()
  const app = buildApp({ config: cfg, jobs: fakeJobs(), run: held.run })
  await signedPost(app, cfg.hostSecret, '/_host/provision', demoBody('d1'))
  await signedPost(app, cfg.hostSecret, '/_host/provision', demoBody('d2'))
  await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'acme.test',
    label: 'acme',
    platform: 'joomla',
    fresh: true
  })
  await new Promise((r) => setTimeout(r, 30))
  assert.deepEqual(
    held.started.map((s) => s.label),
    ['d1', 'acme']
  )
  for (const s of held.started) s.end()
})

test('POST /_host/provision: a demo install on a host short of memory answers 202, waits with the memory step, then runs', async () => {
  const cfg = { ...(await config()), demoInstallSlots: 2, demoInstallMinFreeMb: 600 }
  const jobs = fakeJobs()
  const held = heldRun()
  let free = 54
  const app = buildApp({
    config: cfg,
    jobs,
    run: held.run,
    deps: { memAvailableMb: async () => free, memoryPollMs: 5 }
  })
  const res = await signedPost(app, cfg.hostSecret, '/_host/provision', demoBody('d1'))
  assert.equal(res.status, 202)
  const { jobId } = await res.json()
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(held.started.length, 0)
  assert.equal((await jobs.get(jobId)).state, 'queued')
  assert.equal((await jobs.get(jobId)).step, 'waiting for free memory (54 MB available, 600 MB needed)')
  // A customer's provision does not wait for memory either.
  await signedPost(app, cfg.hostSecret, '/_host/provision', {
    site: 'acme.test',
    label: 'acme',
    platform: 'joomla',
    fresh: true
  })
  await new Promise((r) => setTimeout(r, 30))
  assert.deepEqual(
    held.started.map((s) => s.label),
    ['acme']
  )
  free = 1200
  await new Promise((r) => setTimeout(r, 40))
  assert.deepEqual(
    held.started.map((s) => s.label),
    ['acme', 'd1']
  )
  for (const s of held.started) await s.end()
})

test('a provision has a total limit and a silence limit, and a run stopped by either fails saying which', async () => {
  // 16/10/2026: no layer limited a build, so a hung step left the customer's spinner turning for good.
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-host-limit-'))
  /** @type {any} */
  let asked = null
  const puts = []
  await runProvisionJob({
    jobId: 'j-idle',
    body: { label: 'acme', site: 'acme', platform: 'wordpress' },
    config: { logDir: dir, privateRoot: '/srv', scriptsDir: '/opt' },
    jobs: { put: async (_id, row) => puts.push(row) },
    run: async (input) => {
      asked = input
      return {
        code: 1,
        tail: ['==> fetching webroot', '[run] killed after 900000 ms with no output'],
        timedOut: true,
        idle: true
      }
    }
  })
  assert.equal(asked.timeoutMs, PROVISION_TIMEOUT_MS)
  assert.equal(asked.idleMs, PROVISION_IDLE_MS)
  assert.ok(
    PROVISION_IDLE_MS >= 10 * 60_000 && PROVISION_TIMEOUT_MS >= 45 * 60_000,
    'above the longest healthy build'
  )
  const failed = puts.find((row) => row.state === 'failed')
  assert.equal(failed?.reason, 'idle')
  assert.match(failed?.detail ?? '', /^no progress for 15 minutes; see /)
})
