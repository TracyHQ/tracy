import assert from 'node:assert/strict'
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { OWNED_PROJECTS, SITE_POOL, poolLabel } from '../pool.mjs'
import {
  DeadlineError,
  Intent,
  PreflightRefusal,
  StandBuildError,
  StandEnvError,
  acquireLease,
  assertMountable,
  classifyBuildFailure,
  down,
  readLease,
  splitOwnership,
  underRoot,
  check,
  chooseSubnet,
  countStands,
  envText,
  layout,
  overrideText,
  ownedResources,
  proveClean,
  releaseLease,
  up
} from '../stand.mjs'
import { UsageError } from '../util.mjs'
import { fakeDocker, tmpDir } from './helpers.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

/** A Docker that holds a set of owned resources until `compose down`/`rm` is asked. */
function world(initial = {}) {
  const w = {
    containers: [...(initial.containers ?? [])],
    volumes: [...(initial.volumes ?? [])],
    networks: [...(initial.networks ?? [])],
    failQueries: false,
    downs: [],
    stands: initial.stands ?? []
  }
  const docker = fakeDocker((args) => {
    const [a, b] = args
    if (w.failQueries && ['ps', 'volume', 'network', 'inspect'].includes(a))
      return { code: 1, stderr: 'daemon not running' }
    if (a === 'info') return { stdout: '29.0' }
    if (a === 'compose' && args.includes('down')) {
      w.downs.push(args[2])
      if (!w.stubborn) {
        w.containers = []
        w.volumes = []
        w.networks = []
      }
      return {}
    }
    if (a === 'ps' && args.includes('label=com.docker.compose.service=tracy-web'))
      return { stdout: w.stands.join('\n') }
    if (a === 'ps' && args.includes('-aq'))
      return { stdout: w.containers.map((c) => c.split(' ')[0]).join('\n') }
    if (a === 'ps')
      return {
        stdout: args.some((x) => x.startsWith('label=com.docker.compose.project=tchqa'))
          ? w.containers.join('\n')
          : w.containers.join('\n')
      }
    if (a === 'volume' && b === 'ls') return { stdout: w.volumes.join('\n') }
    if (a === 'network' && b === 'ls') return { stdout: w.networks.join('\n') }
    if (a === 'inspect') return { code: 1, stderr: 'Error: No such object' }
    if (a === 'image' && b === 'inspect' && !(w.images ?? []).includes(args.at(-1)))
      return { code: 1, stderr: 'Error: No such image' }
    return {}
  })
  return Object.assign(docker, { w })
}

test('pool: only tchqa and its finite site slots are ours; a label outside is refused', () => {
  assert.ok(OWNED_PROJECTS.includes('tchqa') && OWNED_PROJECTS.every((p) => p.startsWith('tchqa')))
  assert.equal(poolLabel('sw1'), 'tchqa-sw1')
  for (const bad of ['zz', 'sw3', '', '../x', 'w; rm'])
    assert.throws(() => poolLabel(bad), /outside the owned pool/)
  assert.ok(!SITE_POOL.includes('tchqa'))
})

test('ownedResources: lists by label and by name; a failing query is a gap, never "nothing there"', async () => {
  const d = world({
    containers: ['abc tchqa-tracy-web-1'],
    volumes: ['tchqa_pg'],
    networks: ['n1 tchqa_default']
  })
  const r = await ownedResources(d)
  assert.equal(r.ok, true)
  assert.deepEqual(r.containers, ['abc tchqa-tracy-web-1'])
  d.w.failQueries = true
  const bad = await ownedResources(d)
  assert.equal(bad.ok, false)
  assert.ok(bad.gaps.length > 0)
})

test('proveClean: clean only when every query worked and nothing is left; leftovers and gaps are named', async () => {
  const empty = world()
  assert.equal((await proveClean(empty)).clean, true)
  const left = world({ containers: ['abc tchqa-x'], volumes: ['tchqa_v'] })
  const p = await proveClean(left)
  assert.equal(p.clean, false)
  assert.ok(p.left.length >= 2)
  const broken = world()
  broken.w.failQueries = true
  const g = await proveClean(broken)
  assert.equal(g.clean, false, 'a failed Docker query must not be reported clean')
  assert.equal(g.queryOk, false)
  // recorded ids still present → not clean
  const stale = fakeDocker((args) =>
    args[0] === 'inspect' ? { code: 0, stdout: 'sha256:abc' } : { code: 0, stdout: '' }
  )
  const ids = await proveClean(stale, { intent: { ids: ['deadbeef'] } })
  assert.equal(ids.clean, false)
  assert.match(ids.left.join(' '), /id deadbeef/)
})

test('countStands counts compose projects with a tracy-web, and says when it cannot', async () => {
  const d = world({ stands: ['tracy', 'tracy', 'tchpublish'] })
  assert.deepEqual(await countStands(d), { ok: true, count: 2, projects: ['tracy', 'tchpublish'] })
  const bad = fakeDocker(() => ({ code: 1 }))
  assert.equal((await countStands(bad)).ok, false)
})

test('chooseSubnet skips subnets other networks use and fails when none is free', async () => {
  const used = ['172.31.77.0/24', '172.31.78.0/24']
  const d = fakeDocker((args) => {
    if (args[1] === 'ls') return { stdout: 'a\nb' }
    return { stdout: `${used[args.length % 2]} ` }
  })
  const prefix = await chooseSubnet(d, ['172.31.77', '172.31.78', '172.31.79'])
  assert.ok(['172.31.77', '172.31.78', '172.31.79'].includes(prefix))
  const all = fakeDocker((args) => (args[1] === 'ls' ? { stdout: 'a' } : { stdout: '172.31.77.0/24 ' }))
  await assert.rejects(() => chooseSubnet(all, ['172.31.77']), /no free/)
})

test('lease: one holder at a time; a dead holder is reclaimed only when no resource is left', async () => {
  const dir = tmpDir('lease')
  const file = path.join(dir, 'lease.json')
  const a = await acquireLease({ file, deadlineMs: 60_000, owner: 'a' })
  await assert.rejects(() => acquireLease({ file, deadlineMs: 60_000, owner: 'b' }), /held by pid/)
  releaseLease(a)
  assert.equal(existsSync(file), false)
  writeFileSync(
    file,
    JSON.stringify({
      pid: 999_999_999,
      owner: 'dead',
      deadlineAt: new Date(Date.now() - 1000).toISOString(),
      token: 'x'
    })
  )
  await assert.rejects(
    () => acquireLease({ file, deadlineMs: 60_000, owner: 'c', canReclaim: async () => false }),
    /stale lease/
  )
  const c = await acquireLease({ file, deadlineMs: 60_000, owner: 'c', canReclaim: async () => true })
  assert.equal(c.owner, 'c')
  releaseLease({ ...c, token: 'someone-else' })
  assert.ok(existsSync(file), 'a lease is released only by its holder')
  writeFileSync(file, 'garbage')
  await assert.rejects(() => acquireLease({ file, deadlineMs: 60_000, owner: 'd' }), /unreadable/)
  await assert.rejects(
    () => acquireLease({ file: path.join(dir, 'x'), deadlineMs: -1, owner: 'e' }),
    UsageError
  )
})

test('intent: registered sites must be pool slots; ids and paths are journalled', () => {
  const dir = tmpDir('intent')
  const i = new Intent(path.join(dir, 'intent.json'))
  i.site('tchqa-sw', 'tchqa-sw.localhost')
  assert.throws(() => i.site('somebody-elses-site', 'x'), /outside the owned pool/)
  i.id('abc')
  i.step('compose up')
  const again = new Intent(path.join(dir, 'intent.json'))
  assert.deepEqual(again.data.sites, [{ label: 'tchqa-sw', siteKey: 'tchqa-sw.localhost' }])
  assert.deepEqual(again.data.ids, ['abc'])
})

test('generated env and override isolate names, ports, subnet, mounts and networks', () => {
  const ports = { web: 1111, host: 2222, pg: 3333, minio: 4444, dsh: 5555, dns: 6666 }
  const env = envText({
    ports,
    prefix: '172.31.80',
    dataDir: '/data',
    secrets: { session: 's', actor: 'a', pepper: 'p', host: 'h', seat: 't' }
  })
  for (const want of [
    'WEB_PORT=1111',
    'TRACY_NETWORK_PREFIX=172.31.80',
    'TRACY_SITE_NETWORK=tchqa_tracy',
    'HOST_DSH_CONTAINER=tchqa-dsh',
    'WEB_IMAGE=tchqa/web',
    'TRACY_SITES_ROOT=/data/sites',
    'TRACY_EGRESS_FENCE=off',
    'MAIL=console'
  ])
    assert.ok(env.includes(want), want)
  assert.ok(!/(^|[^a-z])tracy\/(web|host|dsh)/.test(env), 'no image name of another stand')
  const o = overrideText({
    envFile: '/gen/.env',
    ports,
    prefix: '172.31.80',
    dataDir: '/data',
    srcDir: '/src'
  })
  for (const want of [
    'container_name: tchqa-dsh',
    'container_name: tchqa-docker-proxy',
    '127.0.0.1:5555:8080',
    '/data/dns.d:/etc/dnsmasq.d:ro',
    'dns-host: !reset null',
    '!override ["/gen/.env"]'
  ])
    assert.ok(o.includes(want), want)
})

test('up refuses to adopt existing tchqa resources, a third stand, or an unreachable Docker — before creating anything', async () => {
  const out = tmpDir('up-refuse')
  const existing = world({ containers: ['abc tchqa-old'] })
  await assert.rejects(() => up({ out, docker: existing, build: false }), PreflightRefusal)
  assert.ok(!existsSync(layout(out).intent), 'no intent journal: nothing was started')
  const crowded = world({ stands: ['tracy', 'tchpublish'] })
  await assert.rejects(() => up({ out, docker: crowded, build: false }), /already 2 stands/)
  const dead = fakeDocker(() => ({ code: 1, stderr: 'Cannot connect to the Docker daemon' }))
  const err = await up({ out, docker: dead, build: false }).catch((e) => e)
  assert.ok(err instanceof StandEnvError && err.preflight)
  assert.match(err.probe, /docker info/)
})

test('check: wrong project and missing command are usage errors', async () => {
  const out = tmpDir('check-usage')
  await assert.rejects(() => check({ out, project: 'tracy', deadlineMs: 1000, argv: ['true'] }), UsageError)
  await assert.rejects(() => check({ out, project: 'tchqa', deadlineMs: 1000, argv: [] }), /no command/)
})

test('check: tears down after the command, proves it, passes raw exit 3 through as 0 but never hides a FAIL', async () => {
  for (const [cmdExit, want] of [
    [0, 0],
    [3, 0],
    [1, 1],
    [2, 2]
  ]) {
    const out = tmpDir('check-run')
    const d = world()
    const status = await check({
      out,
      project: 'tchqa',
      deadlineMs: 60_000,
      argv: [process.execPath, '-e', `process.exit(${cmdExit})`],
      docker: d,
      leaseFile: path.join(out, 'lease.json'),
      deps: {
        up: async () => ({
          project: 'tchqa',
          origin: 'http://localhost:1',
          siteDomain: 'localhost',
          ports: {},
          containers: { web: 'w', host: 'h', postgres: 'p', dsh: 'd' },
          commit: 'x'
        }),
        down: async () => ({
          clean: true,
          problems: [],
          proof: { clean: true, queryOk: true, left: [], gaps: [] }
        })
      }
    })
    assert.equal(status.rawExit, cmdExit)
    assert.equal(status.exit, want, `raw ${cmdExit}`)
    assert.equal(status.teardownClean, true)
    assert.ok(existsSync(path.join(layout(out).root, 'lifecycle.json')))
    assert.ok(!existsSync(path.join(out, 'lease.json')), 'lease released')
  }
})

test('check: a teardown that leaves something, or whose Docker query fails, is never reported clean (exit 1)', async () => {
  const out = tmpDir('check-left')
  const status = await check({
    out,
    project: 'tchqa',
    deadlineMs: 60_000,
    argv: [process.execPath, '-e', 'process.exit(0)'],
    docker: world(),
    leaseFile: path.join(out, 'lease.json'),
    deps: {
      up: async () => ({
        project: 'tchqa',
        origin: 'http://localhost:1',
        siteDomain: 'localhost',
        containers: { web: 'w', host: 'h', postgres: 'p', dsh: 'd' }
      }),
      down: async () => ({
        clean: false,
        problems: [],
        proof: { clean: false, queryOk: false, left: ['abc tchqa-x'], gaps: ['containers: daemon gone'] }
      })
    }
  })
  assert.equal(status.teardownClean, false)
  assert.equal(status.exit, 1)
  assert.equal(status.phases.at(-1).left[0], 'abc tchqa-x')
})

test('check: a preflight refusal tears nothing down (what exists is not ours) and the lease is released', async () => {
  const out = tmpDir('check-pre')
  const d = world({ containers: ['abc tchqa-foreign'] })
  let downCalled = false
  const status = await check({
    out,
    project: 'tchqa',
    deadlineMs: 60_000,
    argv: ['true'],
    docker: d,
    leaseFile: path.join(out, 'lease.json'),
    deps: {
      up: (o) => up({ ...o, build: false }),
      down: async () => {
        downCalled = true
        return { clean: true, problems: [], proof: { clean: true, queryOk: true, left: [], gaps: [] } }
      }
    }
  })
  assert.equal(downCalled, false)
  assert.equal(d.w.downs.length, 0, 'no compose down was issued against foreign resources')
  assert.equal(
    status.rawExit,
    0,
    'the command still ran, with the bootstrap reason, so every case is reported'
  )
  assert.equal(status.teardownClean, false, 'the foreign resource is still there: not clean')
  assert.equal(status.exit, 1)
  assert.ok(!existsSync(path.join(out, 'lease.json')))
})

test('check: Docker unreachable at preflight is ENV (exit 3) with a recorded gap, not a clean claim', async () => {
  const out = tmpDir('check-dead')
  const dead = fakeDocker(() => ({ code: 1, stderr: 'Cannot connect' }))
  const status = await check({
    out,
    project: 'tchqa',
    deadlineMs: 60_000,
    argv: ['true'],
    docker: dead,
    leaseFile: path.join(out, 'lease.json'),
    deps: { up: (o) => up({ ...o, build: false }) }
  })
  assert.equal(status.exit, 3)
  assert.equal(status.proofGap, true)
  assert.notEqual(status.teardownClean, true)
})

test('check: a signal during the command interrupts it, still tears down, and exits 1', async () => {
  const out = tmpDir('check-sig')
  let downs = 0
  const p = check({
    out,
    project: 'tchqa',
    deadlineMs: 60_000,
    argv: [process.execPath, '-e', 'setTimeout(() => {}, 20000)'],
    docker: world(),
    leaseFile: path.join(out, 'lease.json'),
    deps: {
      up: async () => ({
        project: 'tchqa',
        origin: 'http://localhost:1',
        siteDomain: 'localhost',
        containers: { web: 'w', host: 'h', postgres: 'p', dsh: 'd' }
      }),
      down: async () => {
        downs++
        return { clean: true, problems: [], proof: { clean: true, queryOk: true, left: [], gaps: [] } }
      }
    }
  })
  setTimeout(() => process.emit('SIGTERM', 'SIGTERM'), 600)
  const status = await p
  assert.equal(downs, 1)
  assert.equal(status.interrupted, 'SIGTERM')
  assert.equal(status.exit, 1)
  assert.ok(readTextSync(path.join(layout(out).root, 'lifecycle.json')).includes('SIGTERM'))
  mkdirSync(out, { recursive: true })
})

// ── ownership, cleanup proof, bootstrap verdicts, deadline ─────────────────────────────────────

/** A Docker with typed resources that remembers which `rm` calls it served and can refuse some. */
function ownedDocker(items, { failRm = [], images = [] } = {}) {
  const w = { items: [...items], removed: [], images: [...images], composeDowns: 0 }
  const of = (kind, project) => w.items.filter((i) => i.kind === kind && i.project === project)
  const docker = fakeDocker((args) => {
    const [a, b] = args
    const label = args.find((x) => x.startsWith('label=com.docker.compose.project='))
    const project = label?.split('=').pop()
    if (a === 'ps' && label)
      return {
        stdout: of('container', project)
          .map((i) => `${i.id} ${i.name}`)
          .join('\n')
      }
    if (a === 'ps')
      return {
        stdout: w.items
          .filter((i) => i.kind === 'container')
          .map((i) => `${i.id} ${i.name}`)
          .join('\n')
      }
    if (a === 'volume' && b === 'ls')
      return {
        stdout: (label ? of('volume', project) : w.items.filter((i) => i.kind === 'volume'))
          .map((i) => i.name)
          .join('\n')
      }
    if (a === 'network' && b === 'ls')
      return {
        stdout: (label ? of('network', project) : w.items.filter((i) => i.kind === 'network'))
          .map((i) => `${i.id} ${i.name}`)
          .join('\n')
      }
    if (['container', 'network', 'volume'].includes(a) && b === 'inspect') {
      const it = w.items.find((i) => i.id === args.at(-1))
      return it ? { stdout: new Date(it.created).toISOString() } : { code: 1, stderr: 'No such object' }
    }
    if (a === 'inspect') {
      const it = w.items.find((i) => i.id === args.at(-1))
      return it ? { stdout: it.id } : { code: 1, stderr: 'Error: No such object' }
    }
    if ((a === 'rm' || (a === 'volume' && b === 'rm') || (a === 'network' && b === 'rm')) && true) {
      const id = args.at(-1)
      if (failRm.includes(id)) return { code: 1, stderr: 'device busy' }
      w.items = w.items.filter((i) => i.id !== id)
      w.removed.push(id)
      return {}
    }
    if (a === 'image' && b === 'inspect')
      return w.images.includes(args.at(-1)) ? { stdout: 'sha256:x' } : { code: 1, stderr: 'No such image' }
    if (a === 'image' && b === 'rm') {
      w.images = w.images.filter((x) => x !== args.at(-1))
      w.removed.push(args.at(-1))
      return {}
    }
    return {}
  })
  return Object.assign(docker, { w })
}

function journal(out, extra = {}) {
  const l = layout(out)
  mkdirSync(l.root, { recursive: true })
  const intent = new Intent(l.intent, { fresh: true })
  Object.assign(intent.data, extra)
  intent.save()
  return { l, intent }
}

test('down: without a journal that proves ownership nothing is removed and the result is not clean', async () => {
  const out = tmpDir('down-nojournal')
  const d = ownedDocker([
    { kind: 'container', id: 'c1', name: 'tchqa-web', project: 'tchqa', created: Date.now() }
  ])
  const r = await down({ out, docker: d })
  assert.equal(r.clean, false)
  assert.match(r.problems.join(' '), /no ownership journal/)
  assert.deepEqual(d.w.removed, [])
})

test('down: removes only what this run created; a resource that predates it, or a project the journal never named, is refused', async () => {
  const out = tmpDir('down-own')
  const { intent } = journal(out)
  const t0 = intent.data.startedAtMs
  const d = ownedDocker([
    { kind: 'container', id: 'mine', name: 'tchqa-tracy-web-1', project: 'tchqa', created: t0 + 5000 },
    { kind: 'volume', id: 'tchqa_pg', name: 'tchqa_pg', project: 'tchqa', created: t0 + 5000 },
    { kind: 'container', id: 'older', name: 'tchqa-old', project: 'tchqa', created: t0 - 3_600_000 },
    { kind: 'container', id: 'late-foreign', name: 'tchqa-b-late', project: 'tchqa-b', created: t0 + 9000 }
  ])
  const r = await down({ out, docker: d })
  assert.deepEqual(d.w.removed.sort(), ['mine', 'tchqa_pg'])
  assert.equal(r.clean, false, 'refused resources stay, so the run is not clean')
  assert.match(r.problems.join(' '), /refused: container tchqa-old/)
  assert.match(r.problems.join(' '), /refused: container tchqa-b-late/)
  assert.ok(
    r.proof.left.some((x) => x.includes('tchqa-old')),
    'the proof still names what is left'
  )
  // A site label the journal names makes that project's fresh resources ours.
  const out2 = tmpDir('down-own2')
  const { intent: i2 } = journal(out2)
  i2.site('tchqa-sw', 'site-key')
  const d2 = ownedDocker([
    {
      kind: 'container',
      id: 's1',
      name: 'tchqa-sw-web',
      project: 'tchqa-sw',
      created: i2.data.startedAtMs + 100
    }
  ])
  const r2 = await down({ out: out2, docker: d2 })
  assert.deepEqual(d2.w.removed, ['s1'])
  assert.equal(r2.clean, true)
})

test('down: a removal that fails is a problem with its exit code recorded, never a clean proof; images this run built are removed and proven gone', async () => {
  const out = tmpDir('down-fail')
  const { intent } = journal(out)
  intent.image('tchqa/dsh:dev')
  const d = ownedDocker(
    [
      {
        kind: 'container',
        id: 'stuck',
        name: 'tchqa-tracy-web-1',
        project: 'tchqa',
        created: intent.data.startedAtMs + 1
      }
    ],
    { failRm: ['stuck'], images: ['tchqa/dsh:dev'] }
  )
  const r = await down({ out, docker: d })
  assert.equal(r.clean, false)
  assert.match(r.problems.join(' '), /rm tchqa-tracy-web-1: device busy/)
  assert.ok(r.commands.some((c) => c.what === 'rm tchqa-tracy-web-1' && c.code === 1))
  assert.ok(d.w.removed.includes('tchqa/dsh:dev'), 'the image this run built is removed')
  assert.equal(d.w.images.length, 0)
  // A query that fails during teardown is a gap, not a pass.
  const broken = fakeDocker((args) => (args[0] === 'ps' ? { code: 1, stderr: 'daemon gone' } : {}))
  const out2 = tmpDir('down-gap')
  journal(out2)
  const r2 = await down({ out: out2, docker: broken })
  assert.equal(r2.clean, false)
  assert.equal(r2.proof.queryOk, false)
})

test('down: an image that already existed before the run is not in the journal, so it is never removed', async () => {
  const out = tmpDir('down-image')
  journal(out)
  const d = ownedDocker([], { images: ['tchqa/dsh:dev'] })
  const r = await down({ out, docker: d })
  assert.deepEqual(d.w.removed, [])
  assert.equal(r.clean, true)
})

test('splitOwnership: recorded ids and fresh resources of named projects are ours; nothing is ours without a journal', () => {
  const items = [{ kind: 'container', id: 'abcdef', project: 'tchqa-uw', createdMs: 10 }]
  assert.equal(splitOwnership(items, null).owned.length, 0)
  assert.equal(splitOwnership(items, { ids: ['abcdef0123'], startedAtMs: 100, sites: [] }).owned.length, 1)
  assert.equal(
    splitOwnership(items, { ids: [], startedAtMs: 100000, sites: [{ label: 'tchqa-uw' }] }).owned.length,
    0
  )
})

test('a live holder keeps the lease even past its deadline; a dead one is replaced only when nothing of ours exists', async () => {
  const dir = tmpDir('lease-live')
  const file = path.join(dir, 'lease.json')
  writeFileSync(
    file,
    JSON.stringify({
      pid: process.pid,
      owner: 'someone',
      deadlineAt: new Date(Date.now() - 60_000).toISOString(),
      token: 'x'
    })
  )
  await assert.rejects(
    () => acquireLease({ file, deadlineMs: 1000, owner: 'me', canReclaim: async () => true }),
    /held by pid/
  )
  assert.equal(readLease(file).owner, 'someone')
})

test('build failures: a missing dependency named in the output is ENV with that line as the probe; anything else is a build failure of this tree', () => {
  const missing = classifyBuildFailure({
    message: 'docker build exited 1',
    output:
      'step 1\nERROR: failed to resolve source metadata for docker.io/library/node:22: dial tcp: no such host\n',
    logFile: '/l/001.log'
  })
  assert.equal(missing.env, true)
  assert.match(missing.probe, /failed to resolve source metadata/)
  const own = classifyBuildFailure({
    message: 'docker build exited 1',
    output: '--- composed tree follows ---\nlacks permission "approval: ask"\n',
    logFile: '/l/002.log'
  })
  assert.equal(own.env, false)
  assert.equal(own.logFile, '/l/002.log')
  assert.ok(new StandBuildError('x', null) instanceof Error)
})

test('check: a stand that did not build is exit 1 (not ENV), and the command still runs and is told why', async () => {
  const out = tmpDir('check-build')
  const marker = path.join(out, 'seen.json')
  const status = await check({
    out,
    project: 'tchqa',
    deadlineMs: 60_000,
    argv: [
      process.execPath,
      '-e',
      `require('fs').writeFileSync(${JSON.stringify(marker)}, process.env.QA_STAND_BOOTSTRAP ?? 'none' + (process.env.QA_STAND_URL ?? ''))`
    ],
    docker: world(),
    leaseFile: path.join(out, 'lease.json'),
    deps: {
      up: async () => {
        throw new StandBuildError('dsh image check failed', '/logs/001-docker.log')
      },
      down: async () => ({
        clean: true,
        problems: [],
        proof: { clean: true, queryOk: true, left: [], gaps: [] }
      })
    }
  })
  assert.equal(status.exit, 1)
  assert.equal(status.rawExit, 0)
  const seen = JSON.parse(readTextSync(marker))
  assert.equal(seen.kind, 'build')
  assert.equal(seen.logFile, '/logs/001-docker.log')
  // A proven missing dependency is the only bootstrap failure that exits 3.
  const out2 = tmpDir('check-env')
  const env = await check({
    out: out2,
    project: 'tchqa',
    deadlineMs: 60_000,
    argv: ['true'],
    docker: world(),
    leaseFile: path.join(out2, 'lease.json'),
    deps: {
      up: async () => {
        throw new StandEnvError('registry unreachable', 'dial tcp: no such host')
      },
      down: async () => ({
        clean: true,
        problems: [],
        proof: { clean: true, queryOk: true, left: [], gaps: [] }
      })
    }
  })
  assert.equal(env.exit, 3)
  assert.equal(env.phases[0].kind, 'env')
})

test('check: one total deadline — the bootstrap gets what is left after the teardown reserve, and the command is stopped by it', async () => {
  const out = tmpDir('check-deadline')
  let seenDeadline = 0
  const t0 = Date.now()
  const status = await check({
    out,
    project: 'tchqa',
    deadlineMs: 4000,
    argv: [process.execPath, '-e', 'setTimeout(() => {}, 30000)'],
    docker: world(),
    leaseFile: path.join(out, 'lease.json'),
    deps: {
      up: async ({ deadline }) => {
        seenDeadline = deadline
        return {
          project: 'tchqa',
          origin: 'http://localhost:1',
          siteDomain: 'localhost',
          containers: { web: 'w', host: 'h', postgres: 'p', dsh: 'd' }
        }
      },
      down: async () => ({
        clean: true,
        problems: [],
        proof: { clean: true, queryOk: true, left: [], gaps: [] }
      })
    }
  })
  assert.ok(seenDeadline <= t0 + 4000 - 1000 + 200, 'up is capped by deadline minus the reserve')
  assert.ok(Date.now() - t0 < 9000, 'the command was stopped by the deadline, not left to run 30 s')
  assert.equal(status.deadline.totalMs, 4000)
  assert.ok(new DeadlineError('x') instanceof Error)
})

test('paths: mount-hostile output names are refused, and a symlinked data directory is not "under the root"', () => {
  for (const bad of ['/tmp/a,b', '/tmp/a:b', '/tmp/a\nb'])
    assert.throws(() => assertMountable(bad), UsageError)
  assert.equal(assertMountable('/tmp/ok-dir'), '/tmp/ok-dir')
  const root = tmpDir('under-root')
  const outside = tmpDir('under-outside')
  mkdirSync(path.join(root, 'data'))
  assert.equal(underRoot(root, path.join(root, 'data')), true)
  symlinkSync(outside, path.join(root, 'link'))
  assert.equal(underRoot(root, path.join(root, 'link')), false)
  assert.equal(underRoot(root, path.join(root, 'missing')), false)
})
