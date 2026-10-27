import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { planStand, probeSpecs, renderEnv, renderOverride } from '../lib/stand.mjs'
import { FakeDocker } from './fake-docker.mjs'
import { SHA, cli, fakeGit, readJson, tmpDir } from './helpers.mjs'
import { readTextAsync } from '../lib/bounded-reader.mjs'

async function world() {
  const resultsRoot = await tmpDir('stand')
  const docker = new FakeDocker()
  const state = { sha: SHA, dirty: '' }
  const env = { resultsRoot, docker, git: fakeGit(state), platform: 'linux', portBusy: async () => false }
  const stand = (action, id, extra = []) => cli(['stand', action, '--id', id, ...extra], env)
  const manifestPath = (id) => path.join(resultsRoot, 'stands', `${id}.json`)
  return {
    resultsRoot,
    docker,
    state,
    env,
    stand,
    manifestPath,
    manifest: (id) => readJson(manifestPath(id))
  }
}

const PRE_EXISTING = (docker) => {
  docker.add('container', 'tracy-dsh', 'tracy')
  docker.add('container', 'tchqa2-dsh', 'tchqa2')
  docker.add('volume', 'tracy_tracy-pg', 'tracy')
  docker.add('network', 'tracy_default', 'tracy')
}

test('dry run prints isolated compose commands and touches neither Docker nor the disk', async () => {
  const w = await world()
  const r = await w.stand('up', 'w0-selftest', ['--dry-run'])
  assert.equal(r.code, 0, r.err)
  assert.deepEqual(w.docker.calls, [])
  assert.deepEqual(await fs.readdir(w.resultsRoot), [])
  assert.match(
    r.out,
    /docker compose -p tchqa-w0-selftest -f .*deploy\/compose\.yml -f .*compose\.override\.yml --env-file .*stand\.env --profile local up -d --wait/
  )
  assert.doesNotMatch(r.out, /compose\.macos\.yml/)
  const mac = await cli(['stand', 'up', '--id', 'w0-selftest', '--dry-run'], { ...w.env, platform: 'darwin' })
  assert.match(mac.out, /-f [^\n]*compose\.yml -f [^\n]*compose\.macos\.yml -f [^\n]*compose\.override\.yml/)
  for (const action of ['reuse', 'down']) {
    const dry = await w.stand(action, 'w0-selftest', ['--dry-run'])
    assert.ok([0, 2].includes(dry.code))
    assert.deepEqual(w.docker.calls, [])
  }
})

test('generated override and env isolate every fixed name, port and bind root the base compose uses', async () => {
  const w = await world()
  const plan = planStand({ ...w.env, repoRoot: process.cwd(), resultsRoot: w.resultsRoot }, 'iso')
  const override = renderOverride(plan)
  assert.match(override, /container_name: tchqa-iso-dsh/)
  assert.match(override, /container_name: tchqa-iso-docker-proxy/)
  assert.doesNotMatch(override, /container_name: tracy-|51700|51710|51720/)
  assert.match(override, new RegExp(`subnet: "${plan.prefix.replaceAll('.', '\\.')}\\.0/24"`))
  const envText = renderEnv(plan, {
    session: 's',
    actor: 'a',
    pepper: 'p',
    host: 'h',
    seat: 'e',
    pg: 'g',
    minio: 'm'
  })
  assert.ok(envText.includes(`TRACY_SITES_ROOT=${plan.paths.root}/sites`))
  assert.doesNotMatch(envText, /51700|51710|51720|51730|51740|172\.30\.0/)
  const other = planStand({ ...w.env, repoRoot: process.cwd(), resultsRoot: w.resultsRoot }, 'iso2')
  assert.notDeepEqual(plan.ports, other.ports)
  assert.ok(Object.values(plan.ports).every((p) => p >= 53100 && p < 54200))
  assert.equal(probeSpecs(plan).length, 6)
  assert.ok(probeSpecs(plan).every((s) => s.container.startsWith('tchqa-iso-')))
})

test('up records resources before and after start, probes cross-service reachability, writes 0600 secrets', async () => {
  const w = await world()
  PRE_EXISTING(w.docker)
  const r = await w.stand('up', 's1')
  assert.equal(r.code, 0, r.out + r.err)
  const m = await w.manifest('s1')
  assert.equal(m.status, 'up')
  assert.equal(m.project, 'tchqa-s1')
  assert.ok(m.resources.containers.every((c) => c.id && c.name.startsWith('tchqa-s1-')))
  assert.ok(
    m.resources.containers.some((c) => c.name === 'tchqa-s1-minio-init-1' && c.id),
    'the one-shot minio-init container is part of the planned set and gets its identity recorded'
  )
  assert.ok(
    m.resources.containers.every((c) => !c.discovered),
    'nothing is adopted outside the plan'
  )
  assert.equal(m.resources.volumes.length, 3)
  assert.equal(m.probes.length, 6)
  assert.ok(m.probes.every((p) => p.ok))
  assert.ok(Object.keys(m.fingerprints.image).length >= 2)
  assert.equal((await fs.stat(path.join(w.resultsRoot, 'stands/s1/stand.env'))).mode & 0o777, 0o600)
  assert.match(r.out, /ok\s+web→host/)
  assert.equal((await w.stand('up', 's1')).code, 2, 'second up of a live stand is refused')
})

test('failed probe, unavailable Docker and failed compose are different outcomes, never a pass', async () => {
  const w = await world()
  w.docker.failingProbes.add('2375')
  const probe = await w.stand('up', 'p1')
  assert.equal(probe.code, 1)
  assert.match(probe.out, /FAIL\s+dsh→docker-proxy/)
  assert.equal((await w.manifest('p1')).status, 'failed')
  assert.equal((await w.stand('down', 'p1', ['-v'])).code, 0)

  const gone = await world()
  gone.docker.unavailable = true
  const unavailable = await gone.stand('up', 'u1')
  assert.equal(unavailable.code, 3)
  assert.match(unavailable.out, /ENV: Docker is not available/)
  assert.deepEqual(await fs.readdir(gone.resultsRoot), [], 'no files before Docker is proven')

  const broken = await world()
  broken.docker.composeFails = true
  const failed = await broken.stand('up', 'c1')
  assert.equal(failed.code, 3)
  assert.match(failed.out, /pull access denied/)
  assert.equal((await broken.manifest('c1')).status, 'failed')
  assert.equal((await broken.stand('down', 'c1', ['-v'])).code, 0)
  assert.deepEqual(broken.docker.names(), { containers: [], volumes: [], networks: [] })

  const busy = await world()
  const noPort = await cli(['stand', 'up', '--id', 'b1'], {
    ...busy.env,
    portBusy: async (port) => port % 10 === 3
  })
  assert.equal(noPort.code, 3)
  assert.ok(!busy.docker.calls.some((c) => /^(composeUp|remove)/.test(c)), 'nothing started or removed')
})

test('at most two stands; a third is refused, also under concurrent acquisition', async () => {
  const w = await world()
  assert.equal((await w.stand('up', 'a1')).code, 0)
  assert.equal((await w.stand('up', 'a2')).code, 0)
  const third = await w.stand('up', 'a3')
  assert.equal(third.code, 3)
  assert.match(third.err, /at most 2 stands/)
  assert.equal((await w.stand('down', 'a1', ['-v'])).code, 0)
  assert.equal((await w.stand('up', 'a3')).code, 0)

  const race = await world()
  const results = await Promise.all(['r1', 'r2', 'r3', 'r4'].map((id) => race.stand('up', id)))
  const codes = results.map((r) => r.code).sort()
  assert.deepEqual(codes, [0, 0, 3, 3], results.map((r) => r.err).join('|'))
})

test('a stale lease lock from a dead process is reclaimed', async () => {
  const w = await world()
  const lock = path.join(w.resultsRoot, 'stands/.lease.lock')
  await fs.mkdir(lock, { recursive: true })
  await fs.writeFile(
    path.join(lock, 'owner.json'),
    JSON.stringify({ pid: 2_147_483_000, at: new Date().toISOString() })
  )
  assert.equal((await w.stand('up', 'l1')).code, 0)
  await assert.rejects(fs.access(lock))
})

test('reuse accepts a matching stand and refuses every kind of mismatch', async () => {
  const w = await world()
  await w.stand('up', 'ru')
  const ok = await w.stand('reuse', 'ru')
  assert.equal(ok.code, 0, ok.out + ok.err)
  assert.ok((await w.manifest('ru')).last_reused_at)

  w.state.sha = 'd'.repeat(40)
  const sha = await w.stand('reuse', 'ru')
  assert.equal(sha.code, 2)
  assert.match(sha.out, /git sha differs/)
  w.state.sha = SHA

  const override = path.join(w.resultsRoot, 'stands/ru/compose.override.yml')
  const original = await readTextAsync(override)
  await fs.writeFile(override, `${original}# tampered\n`)
  assert.match((await w.stand('reuse', 'ru')).out, /compose config fingerprint differs/)
  await fs.writeFile(override, original)

  const envFile = path.join(w.resultsRoot, 'stands/ru/stand.env')
  const envOriginal = await readTextAsync(envFile)
  await fs.writeFile(envFile, `${envOriginal}EXTRA=1\n`)
  assert.match((await w.stand('reuse', 'ru')).out, /fixture fingerprint differs/)
  await fs.writeFile(envFile, envOriginal)

  w.docker.containers.get('tchqa-ru-dsh').image = 'sha256:other'
  assert.match((await w.stand('reuse', 'ru')).out, /image of tchqa-ru-dsh differs/)
  w.docker.containers.get('tchqa-ru-dsh').image = w.docker.image

  w.docker.add('container', 'tchqa-ru-sidecar-1', 'tchqa-ru')
  assert.match((await w.stand('reuse', 'ru')).out, /unrecorded container tchqa-ru-sidecar-1/)
  w.docker.containers.delete('tchqa-ru-sidecar-1')

  w.docker.containers.get('tchqa-ru-minio-1').project = 'someone-else'
  assert.match((await w.stand('reuse', 'ru')).out, /different label or id/)
  w.docker.containers.get('tchqa-ru-minio-1').project = 'tchqa-ru'

  w.docker.containers.delete('tchqa-ru-dns-1')
  assert.match((await w.stand('reuse', 'ru')).out, /container tchqa-ru-dns-1 is missing/)
  assert.equal((await w.stand('reuse', 'nothere')).code, 2)
})

test('reuse refuses when a probe fails (stand up but services cannot talk)', async () => {
  const w = await world()
  await w.stand('up', 'rp')
  w.docker.failingProbes.add('postgres')
  const r = await w.stand('reuse', 'rp')
  assert.equal(r.code, 1)
  assert.match(r.out, /FAIL\s+web→postgres/)
})

test('down -v removes only recorded resources, lists leftovers, never touches other projects', async () => {
  const w = await world()
  PRE_EXISTING(w.docker)
  await w.stand('up', 'd1')
  w.docker.add('container', 'tchqa-d1-ghost-1', 'tchqa-d1')
  const r = await w.stand('down', 'd1', ['-v'])
  assert.equal(r.code, 3, 'an unrecorded resource of the project is reported, not deleted')
  assert.match(r.out, /tchqa-d1-ghost-1 \(UNRECORDED — not deleted\)/)
  assert.deepEqual(
    w.docker.names().containers.filter((n) => n.startsWith('tchqa-d1')),
    ['tchqa-d1-ghost-1']
  )
  assert.deepEqual(
    w.docker
      .names()
      .containers.filter((n) => !n.startsWith('tchqa-d1'))
      .sort(),
    ['tchqa2-dsh', 'tracy-dsh']
  )
  assert.deepEqual(w.docker.names().volumes, ['tracy_tracy-pg'])
  assert.deepEqual(w.docker.names().networks, ['tracy_default'])
  assert.equal((await w.manifest('d1')).status, 'leftover')
  assert.ok(!w.docker.calls.some((c) => /remove \w+ (tracy|tchqa2)/.test(c)))
  assert.equal((await w.stand('up', 'd1')).code, 2, 'leftover blocks a fresh up')
  w.docker.containers.delete('tchqa-d1-ghost-1')
  const clean = await w.stand('down', 'd1', ['-v'])
  assert.equal(clean.code, 0, clean.out)
  assert.match(clean.out, /no tchqa-d1 container, volume or network is left/)
  assert.equal((await w.manifest('d1')).status, 'down')
  await assert.rejects(fs.access(path.join(w.resultsRoot, 'stands/d1')), 'fixture directory removed')
  assert.equal((await w.stand('down', 'd1', ['-v'])).code, 0, 'down is idempotent')
})

test('down without -v keeps volumes and says so', async () => {
  const w = await world()
  await w.stand('up', 'k1')
  const r = await w.stand('down', 'k1')
  assert.equal(r.code, 0, r.out)
  assert.equal(w.docker.names().volumes.length, 3)
  assert.equal(w.docker.names().containers.length, 0)
  assert.match(r.out, /volumes kept/)
  assert.equal((await w.manifest('k1')).status, 'stopped')
})

test('stand down refuses a foreign project name', async () => {
  const w = await world()
  PRE_EXISTING(w.docker)
  await w.stand('up', 'f1')
  const calls = w.docker.calls.length
  const flag = await w.stand('down', 'f1', ['--project', 'tracy', '-v'])
  assert.equal(flag.code, 2)
  assert.match(flag.err, /refusing project "tracy"/)
  assert.equal(w.docker.calls.length, calls, 'refused before any Docker call')
  for (const id of ['tracy', '../tracy', 'Tracy', 'a b', '']) {
    const r = await w.stand('down', id, ['-v'])
    assert.equal(r.code, 2, JSON.stringify(id))
  }
  const m = await w.manifest('f1')
  m.project = 'tracy'
  await fs.writeFile(w.manifestPath('f1'), JSON.stringify(m))
  const tampered = await w.stand('down', 'f1', ['-v'])
  assert.equal(tampered.code, 2)
  assert.equal(w.docker.calls.length, calls)
  assert.ok(w.docker.containers.has('tracy-dsh'))
})

test('tampered manifests are refused: foreign names, wrong id, junk, symlink', async () => {
  const w = await world()
  await w.stand('up', 't1')
  const good = await w.manifest('t1')
  const calls = w.docker.calls.length
  const mutate = async (fn) => {
    const copy = structuredClone(good)
    fn(copy)
    await fs.writeFile(w.manifestPath('t1'), JSON.stringify(copy))
    return w.stand('down', 't1', ['-v'])
  }
  assert.equal((await mutate((m) => m.resources.containers.push({ name: 'tracy-dsh', id: 'x' }))).code, 2)
  assert.equal(
    (await mutate((m) => m.resources.networks.push({ name: 'tchqa-t1x_net', id: null }))).code,
    2,
    'prefix needs a - or _ delimiter'
  )
  assert.equal(
    (
      await mutate((m) => {
        m.id = 'other'
      })
    ).code,
    2
  )
  assert.equal(
    (
      await mutate((m) => {
        m.status = 'weird'
      })
    ).code,
    2
  )
  await fs.writeFile(w.manifestPath('t1'), '{not json')
  assert.equal((await w.stand('down', 't1', ['-v'])).code, 2)
  await fs.rm(w.manifestPath('t1'))
  await fs.writeFile(path.join(w.resultsRoot, 'elsewhere.json'), JSON.stringify(good))
  await fs.symlink(path.join(w.resultsRoot, 'elsewhere.json'), w.manifestPath('t1'))
  assert.equal((await w.stand('down', 't1', ['-v'])).code, 2)
  assert.equal(w.docker.calls.length, calls, 'nothing was inspected or removed')
  assert.ok(w.docker.containers.has('tchqa-t1-dsh'))
})

test('resources replaced or relabelled after recording are refused, never deleted', async () => {
  const w = await world()
  await w.stand('up', 'x1')
  w.docker.containers.get('tchqa-x1-dsh').id = 'replaced-by-someone'
  w.docker.containers.get('tchqa-x1-minio-1').project = 'not-ours'
  const r = await w.stand('down', 'x1', ['-v'])
  assert.equal(r.code, 3)
  assert.match(r.out, /refused: container tchqa-x1-dsh: identity differs/)
  assert.match(r.out, /refused: container tchqa-x1-minio-1: label project=not-ours/)
  assert.ok(w.docker.containers.has('tchqa-x1-dsh') && w.docker.containers.has('tchqa-x1-minio-1'))
  assert.ok(!w.docker.containers.has('tchqa-x1-postgres-1'), 'verified resources are still removed')
})

test('a resource swapped between inspect and delete is not deleted', async () => {
  const w = await world()
  await w.stand('up', 'z1')
  let seen = 0
  w.docker.hooks.beforeInspect = (kind, name, docker) => {
    if (kind === 'container' && name === 'tchqa-z1-dsh' && ++seen === 2)
      docker.containers.get(name).id = 'swapped'
  }
  const r = await w.stand('down', 'z1', ['-v'])
  w.docker.hooks.beforeInspect = undefined
  assert.equal(r.code, 3)
  assert.match(r.out, /changed between inspect and delete/)
  assert.ok(w.docker.containers.has('tchqa-z1-dsh'))
})

test('interrupted startup: manifest is on disk before side effects; up resumes and down adopts', async () => {
  const w = await world()
  w.docker.composeCrashes = true
  const crashed = await w.stand('up', 'i1')
  assert.equal(crashed.code, 2)
  const m = await w.manifest('i1')
  assert.equal(m.status, 'starting')
  assert.ok(
    m.resources.containers.length > 0 && m.resources.containers.every((c) => c.id === null),
    'planned names recorded before anything existed'
  )
  w.docker.composeCrashes = false
  const refused = await w.stand('up', 'i1')
  assert.equal(refused.code, 2, 'an interrupted stand is cleaned with down -v, never silently resumed')
  assert.match(refused.out, /stand down --id i1 -v/)
  assert.equal((await w.stand('down', 'i1', ['-v'])).code, 0)
  const resumed = await w.stand('up', 'i1')
  assert.equal(resumed.code, 0, resumed.out + resumed.err)
  assert.equal((await w.manifest('i1')).status, 'up')

  const second = await world()
  second.docker.composeCrashes = true
  await second.stand('up', 'i2')
  second.docker.composeCrashes = false
  await second.docker.composeUp({ project: 'tchqa-i2' })
  const down = await second.stand('down', 'i2', ['-v'])
  assert.equal(down.code, 0, down.out)
  assert.deepEqual(second.docker.names().volumes, [])
  assert.deepEqual(second.docker.names().networks, [])
  assert.deepEqual(second.docker.names().containers, [])
})

test('down -v refuses to delete a stand directory that is a symlink', async () => {
  const w = await world()
  await w.stand('up', 'y1')
  const target = await tmpDir('precious')
  await fs.writeFile(path.join(target, 'keep.txt'), 'x')
  await fs.rm(path.join(w.resultsRoot, 'stands/y1'), { recursive: true })
  await fs.symlink(target, path.join(w.resultsRoot, 'stands/y1'))
  const r = await w.stand('down', 'y1', ['-v'])
  assert.equal(r.code, 2)
  assert.match(r.err, /symlink in the path/)
  await fs.access(path.join(target, 'keep.txt'))
})

test('down for an id with no manifest deletes nothing', async () => {
  const w = await world()
  PRE_EXISTING(w.docker)
  const r = await w.stand('down', 'ghost', ['-v'])
  assert.equal(r.code, 2)
  assert.ok(!w.docker.calls.some((c) => c.startsWith('remove')))
})

test('a timed-out probe is reported as a failure, not as a pass', async () => {
  const w = await world()
  w.docker.timedOutProbes.add('minio')
  const r = await w.stand('up', 'to')
  assert.equal(r.code, 1)
  assert.match(r.out, /FAIL\s+web→minio — timed out/)
})

test('the host→web probe uses the platform-specific web origin', async () => {
  const w = await world()
  const plan = (platform) =>
    planStand({ ...w.env, platform, repoRoot: process.cwd(), resultsRoot: w.resultsRoot }, 'pl')
  const script = (platform) =>
    probeSpecs(plan(platform))
      .find((p) => p.name === 'host→web')
      .argv.at(-1)
  assert.match(script('darwin'), new RegExp(`http://tracy-web:${plan('darwin').ports.web}/`))
  assert.doesNotMatch(script('darwin'), /127\.0\.0\.1/)
  assert.match(script('linux'), new RegExp(`http://127\\.0\\.0\\.1:${plan('linux').ports.web}/`))
})

test('a command that finds a stand mid-start is refused by the per-stand lock', async () => {
  const w = await world()
  let release
  w.docker.composeGate = new Promise((resolve) => {
    release = resolve
  })
  const starting = w.stand('up', 'k1')
  while (!w.docker.calls.some((c) => c.startsWith('composeUp'))) await new Promise((r) => setTimeout(r, 1))
  for (const action of ['down', 'reuse', 'up']) {
    const blocked = await w.stand(action, 'k1', action === 'down' ? ['-v'] : [])
    assert.equal(blocked.code, 3, action)
    assert.match(blocked.err, /being operated on/, action)
  }
  release()
  assert.equal((await starting).code, 0)
  assert.equal((await w.manifest('k1')).status, 'up')
  await assert.rejects(fs.stat(path.join(w.resultsRoot, 'stands/k1.lock')), /ENOENT/, 'lock released')
})

test('ports reserved by an active stand cannot be taken by another id', async () => {
  const w = await world()
  assert.equal((await w.stand('up', 'q1')).code, 0)
  const plan2 = planStand({ ...w.env, repoRoot: process.cwd(), resultsRoot: w.resultsRoot }, 'q2')
  const doc = await w.manifest('q1')
  await fs.writeFile(w.manifestPath('q1'), JSON.stringify({ ...doc, ports: plan2.ports }))
  const clash = await w.stand('up', 'q2')
  assert.equal(clash.code, 3)
  assert.match(clash.out, /reserved by stand q1/)
  assert.ok(!w.docker.calls.includes('composeUp tchqa-q2'))
})

test('resources or a fixture directory no manifest records are never adopted by up', async () => {
  const w = await world()
  w.docker.add('volume', 'tchqa-n1_tracy-pg', 'tchqa-n1')
  const r = await w.stand('up', 'n1')
  assert.equal(r.code, 3)
  assert.match(r.out, /volume tchqa-n1_tracy-pg/)
  assert.ok(!w.docker.calls.some((c) => c.startsWith('composeUp')))
  const dirOnly = await world()
  await fs.mkdir(path.join(dirOnly.resultsRoot, 'stands/n2/dsh-home'), { recursive: true })
  const d = await dirOnly.stand('up', 'n2')
  assert.equal(d.code, 3)
  assert.match(d.out, /directory/)
})

test('a failed or stopped stand keeps its volumes: fresh up is refused and it still counts toward the limit', async () => {
  const w = await world()
  assert.equal((await w.stand('up', 'a1')).code, 0)
  assert.equal((await w.stand('down', 'a1')).code, 0)
  assert.equal((await w.manifest('a1')).status, 'stopped')
  const again = await w.stand('up', 'a1')
  assert.equal(again.code, 2)
  assert.match(again.out, /stand down --id a1 -v/)
  assert.equal((await w.stand('up', 'a2')).code, 0)
  const third = await w.stand('up', 'a3')
  assert.equal(third.code, 3, 'the stopped stand still occupies a slot')
  assert.match(third.err, /at most 2/)
})

test('a resource with the project label but a foreign name is reported by down and never deleted', async () => {
  const w = await world()
  assert.equal((await w.stand('up', 'l1')).code, 0)
  w.docker.add('container', 'someones-sidecar', 'tchqa-l1')
  const r = await w.stand('down', 'l1', ['-v'])
  assert.equal(r.code, 3)
  assert.match(r.out, /someones-sidecar/)
  assert.match(r.out, /UNRECORDED/)
  assert.ok(w.docker.containers.has('someones-sidecar'))
  assert.ok(!w.docker.calls.some((c) => c.includes('remove container someones-sidecar')))
})

test('up reports a labelled resource with a foreign name as a conflict instead of skipping it', async () => {
  const w = await world()
  const original = w.docker.composeUp.bind(w.docker)
  w.docker.composeUp = async (args) => {
    const r = await original(args)
    w.docker.add('container', 'stray-sidecar', args.project)
    return r
  }
  const r = await w.stand('up', 'f1')
  assert.equal(r.code, 2)
  assert.match(r.out, /CONFLICT: container stray-sidecar/)
  assert.equal((await w.manifest('f1')).status, 'failed')
})

test('an unplanned resource whose name merely carries the project prefix is never adopted or deleted', async () => {
  const w = await world()
  const original = w.docker.composeUp.bind(w.docker)
  w.docker.composeUp = async (args) => {
    const r = await original(args)
    w.docker.add('container', 'tchqa-p1-evil-1', args.project)
    return r
  }
  const up = await w.stand('up', 'p1')
  assert.equal(up.code, 2)
  assert.match(up.out, /CONFLICT: container tchqa-p1-evil-1 is not a resource this stand plans to create/)
  const m = await w.manifest('p1')
  assert.ok(!m.resources.containers.some((c) => c.name === 'tchqa-p1-evil-1'), 'not recorded')
  const down = await w.stand('down', 'p1', ['-v'])
  assert.equal(down.code, 3)
  assert.match(down.out, /tchqa-p1-evil-1 \(UNRECORDED/)
  assert.ok(w.docker.containers.has('tchqa-p1-evil-1'), 'still there')
  assert.ok(!w.docker.calls.some((c) => c.includes('remove container tchqa-p1-evil-1')))
})

test('a tampered manifest that lists an unplanned prefix-named resource is refused before any removal', async () => {
  const w = await world()
  assert.equal((await w.stand('up', 'p2')).code, 0)
  w.docker.add('container', 'tchqa-p2-victim-1', 'tchqa-p2')
  const m = await w.manifest('p2')
  m.resources.containers.push({ name: 'tchqa-p2-victim-1', id: null })
  await fs.writeFile(w.manifestPath('p2'), JSON.stringify(m))
  for (const action of [['down', '-v'], ['reuse']]) {
    const r = await w.stand(action[0], 'p2', action.slice(1))
    assert.equal(r.code, 2, action.join(' '))
    assert.match(r.err, /never plans to create/)
  }
  assert.ok(w.docker.containers.has('tchqa-p2-victim-1'))
  assert.ok(!w.docker.calls.some((c) => c.startsWith('remove ')))
})

test('a lock held by a live process is never reclaimed, however old', async () => {
  const w = await world()
  for (const lockName of ['.lease.lock', 'z1.lock']) {
    const lock = path.join(w.resultsRoot, 'stands', lockName)
    await fs.mkdir(lock, { recursive: true })
    await fs.writeFile(
      path.join(lock, 'owner.json'),
      JSON.stringify({ pid: process.pid, at: new Date(Date.now() - 3_600_000).toISOString() })
    )
  }
  const r = await w.stand('up', 'z1')
  assert.equal(r.code, 3)
  assert.match(r.err, /being operated on by another qa stand command/)
  assert.ok(!w.docker.calls.some((c) => c.startsWith('composeUp')))
  await fs.access(path.join(w.resultsRoot, 'stands/z1.lock/owner.json'))
})

test('two ids with different ports but one subnet cannot be live at once', async () => {
  const w = await world()
  assert.equal((await w.stand('up', 'q1')).code, 0)
  const m = await w.manifest('q1')
  const plan = planStand({ ...w.env, repoRoot: process.cwd(), resultsRoot: w.resultsRoot }, 'q2')
  // q1 is recorded as holding the subnet q2 would generate, on unrelated ports.
  m.subnet_prefix = plan.prefix
  m.ports = { web: 1, host: 2 }
  await fs.writeFile(w.manifestPath('q1'), JSON.stringify(m))
  const clash = await w.stand('up', 'q2')
  assert.equal(clash.code, 3)
  assert.match(clash.out, /subnet .* is reserved by stand q1/)
  assert.ok(!w.docker.calls.some((c) => c === 'composeUp tchqa-q2'))
})

test('stand files never follow a symlinked results root, stands directory or stand directory', async () => {
  const precious = await tmpDir('precious2')
  await fs.writeFile(path.join(precious, 'keep.txt'), 'x')
  // symlinked stands directory
  const a = await world()
  await fs.symlink(precious, path.join(a.resultsRoot, 'stands'))
  for (const action of ['up', 'reuse', 'down']) {
    const r = await a.stand(action, 'k1', action === 'down' ? ['-v'] : [])
    assert.equal(r.code, 2, action)
    assert.match(r.err, /symlink in the path/)
  }
  assert.deepEqual(await fs.readdir(precious), ['keep.txt'])
  assert.ok(!a.docker.calls.some((c) => c.startsWith('composeUp') || c.startsWith('remove ')))
  // symlinked results root
  const b = await world()
  const link = path.join(await tmpDir('linkroot'), 'results')
  await fs.symlink(b.resultsRoot, link)
  const viaLink = await cli(['stand', 'up', '--id', 'k2'], { ...b.env, resultsRoot: link })
  assert.equal(viaLink.code, 2)
  assert.deepEqual(await fs.readdir(b.resultsRoot), [])
  // symlinked stand directory (up refuses; the earlier down test covers removal)
  const c = await world()
  await fs.mkdir(path.join(c.resultsRoot, 'stands'), { recursive: true })
  await fs.symlink(precious, path.join(c.resultsRoot, 'stands/k3'))
  const up = await c.stand('up', 'k3')
  assert.equal(up.code, 2)
  assert.deepEqual(await fs.readdir(precious), ['keep.txt'])
})

test('down -v keeps manifest and fixture directory when a removal fails, and a retry finishes it', async () => {
  const w = await world()
  assert.equal((await w.stand('up', 'k1')).code, 0)
  const realRemove = w.docker.remove.bind(w.docker)
  w.docker.remove = async (kind, ref) =>
    kind === 'volume' ? { ok: false, detail: 'volume in use' } : realRemove(kind, ref)
  const failed = await w.stand('down', 'k1', ['-v'])
  assert.notEqual(failed.code, 0)
  assert.match(failed.out, /volume in use|LEFTOVER/)
  await fs.access(path.join(w.resultsRoot, 'stands/k1/stand.env'))
  assert.equal((await w.manifest('k1')).status, 'leftover')
  w.docker.remove = realRemove
  const retried = await w.stand('down', 'k1', ['-v'])
  assert.equal(retried.code, 0, retried.out)
  await assert.rejects(fs.access(path.join(w.resultsRoot, 'stands/k1')))
})

test('an interrupt after the manifest but before the fixture files leaves something down can clean', async () => {
  const w = await world()
  assert.equal((await w.stand('up', 'k2')).code, 0)
  // Simulate the crash window: ledger present, fixture directory not yet written.
  await fs.rm(path.join(w.resultsRoot, 'stands/k2'), { recursive: true })
  const down = await w.stand('down', 'k2', ['-v'])
  assert.equal(down.code, 0, down.out + down.err)
  assert.deepEqual(w.docker.names().containers, [])
})

// Fault injection at the real operation boundaries: each point throws once, then the retry runs
// with no fault. The ledger must exist before every side effect and the fixture directory (the
// recovery material) must survive until the ledger says teardown is complete.
function injector(w) {
  const state = { point: null, hits: [] }
  w.env.fault = async (point) => {
    state.hits.push(point)
    if (point === state.point) {
      state.point = null
      throw new Error(`injected fault at ${point}`)
    }
  }
  return state
}
const exists = (file) =>
  fs.access(file).then(
    () => true,
    () => false
  )

test('up: a fault at each boundary leaves a ledger down can use; nothing is written before the ledger', async () => {
  const boundaries = ['manifest:reserved', 'fixture:dirs', 'fixture:override', 'fixture:env']
  for (const point of boundaries) {
    const w = await world()
    const fault = injector(w)
    fault.point = point
    const failed = await w.stand('up', 'f1')
    assert.notEqual(failed.code, 0, point)
    assert.match(failed.err + failed.out, /injected fault/, point)
    assert.ok(!w.docker.calls.some((c) => c.startsWith('composeUp')), `${point}: nothing started`)
    const ledger = await exists(w.manifestPath('f1'))
    const fixture = await exists(path.join(w.resultsRoot, 'stands/f1'))
    if (point === 'manifest:reserved') {
      assert.equal(ledger, false, 'the failed ledger write left no ledger')
      assert.equal(fixture, false, `${point}: no fixture before the ledger`)
    } else {
      assert.equal(ledger, true, `${point}: ledger written before any fixture file`)
    }
    // Recovery: down adopts whatever exists, then a fresh up works.
    const down = await w.stand('down', 'f1', ['-v'])
    assert.ok([0, 2].includes(down.code), `${point}: ${down.out}${down.err}`)
    if (ledger) {
      assert.equal(down.code, 0, `${point}: ${down.out}${down.err}`)
      assert.equal(await exists(path.join(w.resultsRoot, 'stands/f1')), false, `${point}: fixture cleaned`)
    }
    const again = await w.stand('up', 'f1')
    assert.equal(again.code, 0, `${point}: ${again.out}${again.err}`)
    assert.deepEqual(
      w.docker.names().containers.filter((n) => !n.startsWith('tchqa-f1-')),
      [],
      point
    )
  }
})

test('up: a crash inside compose, or in reconcile after compose, keeps the ledger and is cleaned by down', async () => {
  const crash = await world()
  crash.docker.composeCrashes = true
  assert.notEqual((await crash.stand('up', 'f2')).code, 0)
  assert.equal((await crash.manifest('f2')).status, 'starting', 'ledger says the start was attempted')
  assert.ok(await exists(path.join(crash.resultsRoot, 'stands/f2/stand.env')))
  crash.docker.composeCrashes = false
  assert.equal((await crash.stand('down', 'f2', ['-v'])).code, 0)
  assert.deepEqual(crash.docker.names().containers, [])

  const rec = await world()
  rec.docker.hooks.beforeInspect = () => {
    if (rec.docker.calls.some((c) => c.startsWith('composeUp'))) throw new Error('inspect lost the daemon')
  }
  const up = await rec.stand('up', 'f3')
  assert.notEqual(up.code, 0)
  assert.notEqual((await rec.manifest('f3')).status, 'up', 'never recorded as up')
  const blocked = await rec.stand('down', 'f3', ['-v'])
  assert.notEqual(blocked.code, 0, 'down cannot verify, so it does not claim clean')
  assert.ok(await exists(path.join(rec.resultsRoot, 'stands/f3/stand.env')), 'recovery material kept')
  assert.notEqual((await rec.manifest('f3')).status, 'down')
  rec.docker.hooks.beforeInspect = undefined
  assert.equal((await rec.stand('down', 'f3', ['-v'])).code, 0, 'retry finishes')
  assert.deepEqual(rec.docker.names().containers, [])
})

test('down: faults at remove, enumerate and each ledger write keep recovery material until teardown is recorded', async () => {
  const fixtureOf = (w) => path.join(w.resultsRoot, 'stands/f4/stand.env')
  // remove refused / enumerate unreadable: nothing is claimed clean and the fixture stays.
  for (const mode of ['remove', 'enumerate']) {
    const w = await world()
    assert.equal((await w.stand('up', 'f4')).code, 0)
    const realRemove = w.docker.remove.bind(w.docker)
    const realList = w.docker.listByPrefix.bind(w.docker)
    if (mode === 'remove')
      w.docker.remove = async (kind, ref) =>
        kind === 'network' ? { ok: false, detail: 'network has active endpoints' } : realRemove(kind, ref)
    else
      w.docker.listByPrefix = async () => {
        throw new Error('docker ls failed')
      }
    const failed = await w.stand('down', 'f4', ['-v'])
    assert.notEqual(failed.code, 0, mode)
    assert.ok(await exists(fixtureOf(w)), `${mode}: fixture kept`)
    assert.notEqual((await w.manifest('f4')).status, 'down', mode)
    w.docker.remove = realRemove
    w.docker.listByPrefix = realList
    assert.equal((await w.stand('down', 'f4', ['-v'])).code, 0, `${mode}: retry`)
    assert.equal(await exists(fixtureOf(w)), false)
    assert.equal((await w.manifest('f4')).status, 'down')
  }
  // The ledger write that precedes fixture removal fails: the fixture must still be there.
  const a = await world()
  assert.equal((await a.stand('up', 'f4')).code, 0)
  const fa = injector(a)
  fa.point = 'manifest:tearing-down'
  const first = await a.stand('down', 'f4', ['-v'])
  assert.notEqual(first.code, 0)
  assert.ok(await exists(fixtureOf(a)), 'fixture survives a failed teardown ledger write')
  assert.notEqual((await a.manifest('f4')).status, 'down')
  assert.equal((await a.stand('down', 'f4', ['-v'])).code, 0, 'retry')
  // The final ledger write fails after the fixture was removed: tearing-down is durable, the retry
  // needs no fixture and finishes.
  const b = await world()
  assert.equal((await b.stand('up', 'f4')).code, 0)
  const fb = injector(b)
  fb.point = 'manifest:down'
  const second = await b.stand('down', 'f4', ['-v'])
  assert.notEqual(second.code, 0)
  assert.equal((await b.manifest('f4')).status, 'tearing-down')
  assert.equal(await exists(fixtureOf(b)), false)
  assert.equal((await b.stand('up', 'f4')).code, 2, 'a stand that is still tearing down is not reusable')
  const retried = await b.stand('down', 'f4', ['-v'])
  assert.equal(retried.code, 0, retried.out + retried.err)
  assert.equal((await b.manifest('f4')).status, 'down')
  assert.deepEqual(b.docker.names().containers, [])
})

test('down: faults never touch resources outside the manifest', async () => {
  const w = await world()
  PRE_EXISTING(w.docker)
  const before = JSON.stringify(w.docker.names())
  assert.equal((await w.stand('up', 'f5')).code, 0)
  const fault = injector(w)
  fault.point = 'manifest:tearing-down'
  await w.stand('down', 'f5', ['-v'])
  await w.stand('down', 'f5', ['-v'])
  assert.equal(JSON.stringify(w.docker.names()), before)
})
