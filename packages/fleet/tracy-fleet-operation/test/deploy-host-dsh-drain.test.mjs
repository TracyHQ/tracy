#!/usr/bin/env node
/**
 * The dsh deploy's drain (§2b of `deploy-host-dsh.sh`), run for real against a fake `$DSH_HOME`.
 *
 * WHY THIS FILE EXISTS (#83, #295). The drain shipped 15/09 for imports and was never seen waiting
 * for anything: every test before this one passed `--drain-timeout 0`, and the only record from a
 * real host is "nothing running". On 24/09 it let a deploy cut a chat turn 14 minutes in, because
 * chat turns held no lease. Chat turns and Build jobs now hold the same lease, so what this file
 * proves is the part every kind of long work relies on:
 *
 *   1. a fresh lease makes the deploy WAIT, and it goes on as soon as the lease is gone;
 *   2. `draining` exists while the deploy waits and is still there when it replaces dsh (so no new
 *      long work starts in between), and is removed when the script ends;
 *   3. a lease with no heartbeat for two minutes is a dead process, not something to wait for;
 *   4. on timeout the deploy goes on, names the work it cuts (by kind, and each lease), emits
 *      `::warning::`, and appends it to `cut-by-deploy.json` for the people it belonged to.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/deploy-host-dsh-drain.test.mjs
 *
 * `docker` is a stub on PATH. The seed stub stands in for everything after the drain: it records
 * what the drain left on disk at that moment, then exits 1 so nothing past it runs.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import { linkStub, warmStub } from './warm-stub.mjs'

const DSH_DEPLOY = fileURLToPath(new URL('../dsh/deploy-host-dsh.sh', import.meta.url))

// A different image than the one running, so the deploy never takes the same-tag shortcut.
const FAKE_DOCKER = `#!/usr/bin/env bash
case "$*" in
  "compose version"*) echo "Docker Compose version v2.29.7" ;;
  "image inspect "*) echo sha256:new ;;
  "inspect tracy-dsh --format {{.Image}}") echo sha256:old ;;
  *) : ;;
esac
`

// One stub each for the whole file (see warm-stub.mjs); a case links them and passes its paths in env.
const DOCKER_STUB = warmStub('docker', FAKE_DOCKER)
const SEED_STUB = warmStub(
  'seed-profile.sh',
  `#!/bin/sh\n[ -e "$SEED_HOME/draining" ] && echo present > "$SEED_DIR/SEED_SAW_DRAINING"\n` +
    `[ -e "$SEED_HOME/cut-by-deploy.json" ] && echo present > "$SEED_DIR/SEED_SAW_CUT"\nexit 1\n`,
  { warmEnv: { SEED_HOME: '/nonexistent', SEED_DIR: '/nonexistent' } }
)

function makeHost(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'deploy-dsh-drain-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(path.join(dir, 'bin'))
  linkStub(DOCKER_STUB, path.join(dir, 'bin/docker'))
  mkdirSync(path.join(dir, 'fleet'))
  copyFileSync(DSH_DEPLOY, path.join(dir, 'fleet/deploy-host-dsh.sh'))
  const home = path.join(dir, 'home')
  linkStub(SEED_STUB, path.join(dir, 'fleet/seed-profile.sh'))
  writeFileSync(path.join(dir, 'fleet/host-dsh.yml'), 'services: {}\n')
  writeFileSync(path.join(dir, 'fleet/docker-proxy.haproxy.cfg'), '# rules\n')
  mkdirSync(path.join(home, 'leases'), { recursive: true })
  writeFileSync(
    path.join(dir, 'host-dsh.env'),
    `HOST_DSH_HOME=${home}\nDSH_IMAGE_TAG=ctx-old\nDSH_IMAGE_TAG_PREVIOUS=ctx-older\nTRACY_SITE_DOMAIN=tracy.site\n`
  )
  return { dir, home }
}

/** A lease exactly as the lease helper writes it: one JSON object on one line. */
function lease(home, id, fields, { ageSecs = 0 } = {}) {
  const file = path.join(home, 'leases', `${id}.json`)
  writeFileSync(file, JSON.stringify({ id, ...fields, heartbeatAt: new Date().toISOString() }))
  if (ageSecs) {
    const then = new Date(Date.now() - ageSecs * 1000)
    utimesSync(file, then, then)
  }
  return file
}

/** Run the deploy without blocking the event loop, so a test can change the host while it waits. */
function deploy(dir, drainTimeout) {
  const started = Date.now()
  const child = spawn(
    'bash',
    [path.join(dir, 'fleet/deploy-host-dsh.sh'), '--tag', 'ctx-new', '--drain-timeout', String(drainTimeout)],
    {
      env: {
        ...process.env,
        PATH: `${dir}/bin:${process.env.PATH}`,
        HOST_DSH_COMPOSE: path.join(dir, 'fleet/host-dsh.yml'),
        HOST_DSH_ENV_FILE: path.join(dir, 'host-dsh.env'),
        HOST_DSH_DRAIN_POLL_SECS: '0.1',
        SEED_HOME: path.join(dir, 'home'),
        SEED_DIR: dir,
        GITHUB_ACTIONS: 'true'
      }
    }
  )
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => {
    stdout += d
  })
  child.stderr.on('data', (d) => {
    stderr += d
  })
  const done = new Promise((resolve) => {
    child.on('close', (status) =>
      resolve({
        status,
        stdout,
        stderr,
        secs: (Date.now() - started) / 1000,
        seedSawDraining: existsSync(path.join(dir, 'SEED_SAW_DRAINING')),
        seedSawCut: existsSync(path.join(dir, 'SEED_SAW_CUT'))
      })
    )
  })
  return { done, output: () => stdout }
}

const until = async (check, ms = 20_000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting')
    await new Promise((r) => setTimeout(r, 100))
  }
}

describe('deploy-host-dsh.sh — the drain', { concurrency: 5 }, () => {
  test('a fresh lease holds the deploy until it is gone; draining stays up to the replace, then goes', async (t) => {
    const { dir, home } = makeHost(t)
    const file = lease(home, 'chat-s1', { kind: 'chat', siteKey: 'site-a', sessionId: 's1' })
    const run = deploy(dir, 60)
    await until(() => /still running: chat 1/.test(run.output()))
    assert.ok(existsSync(path.join(home, 'draining')), 'no draining file while the deploy waits')
    rmSync(file)
    const r = await run.done
    assert.match(r.stdout, /nothing running/, r.stdout + r.stderr)
    assert.equal(r.seedSawDraining, true, 'draining was gone before the deploy replaced dsh')
    assert.equal(r.seedSawCut, false, 'work that finished was recorded as cut off')
    assert.ok(!existsSync(path.join(home, 'draining')), 'draining outlived the deploy')
    assert.doesNotMatch(r.stdout + r.stderr, /::warning::/)
  })

  test('a lease with no heartbeat for two minutes is not waited for', async (t) => {
    const { dir, home } = makeHost(t)
    lease(home, 'import-old', { kind: 'import', siteKey: 'site-a' }, { ageSecs: 600 })
    const r = await deploy(dir, 60).done
    assert.match(r.stdout, /nothing running/, r.stdout + r.stderr)
    assert.ok(r.secs < 10, `waited ${r.secs}s for a dead lease`)
    assert.equal(r.seedSawDraining, true)
  })

  test('on timeout it goes on, names what it cuts by kind and lease, warns, and records it', async (t) => {
    const { dir, home } = makeHost(t)
    lease(home, 'chat-s1', { kind: 'chat', siteKey: 'site-a', sessionId: 's1' })
    lease(home, 'build-j1', { kind: 'build', siteKey: 'site-b', sessionId: 's2', step: 'seed' })
    lease(home, 'imp-1', { kind: 'import', siteKey: 'site-c' }, { ageSecs: 600 })
    const r = await deploy(dir, 1).done
    assert.equal(r.seedSawDraining, true, 'the deploy never got past the drain')
    assert.match(r.stderr, /CUTS OFF 2 piece\(s\) of work \(build 1, chat 1\)/)
    assert.match(r.stderr, /"id":"chat-s1"/)
    assert.match(r.stderr, /"id":"build-j1"/)
    assert.doesNotMatch(r.stderr, /imp-1/, 'a dead lease was named as cut off')
    assert.match(
      r.stdout,
      /::warning::deploy cut off 2 piece\(s\) of running customer work \(build 1, chat 1\)/
    )
    assert.equal(r.seedSawCut, true, 'the cut was not recorded before dsh was replaced')
    const cut = JSON.parse(readFileSync(path.join(home, 'cut-by-deploy.json'), 'utf8'))
    assert.equal(cut.length, 1)
    assert.equal(cut[0].tag, 'ctx-new')
    assert.match(cut[0].at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/)
    assert.deepEqual(cut[0].work.map((w) => [w.id, w.kind, w.siteKey, w.sessionId]).sort(), [
      ['build-j1', 'build', 'site-b', 's2'],
      ['chat-s1', 'chat', 'site-a', 's1']
    ])
    assert.ok(!existsSync(path.join(home, 'draining')))
  })

  test('a second cut is appended to the record nobody has read yet, not written over it', async (t) => {
    const { dir, home } = makeHost(t)
    const earlier = [{ at: '2026-09-24T03:51:26Z', tag: 'ctx-a', work: [{ id: 'chat-s0', kind: 'chat' }] }]
    writeFileSync(path.join(home, 'cut-by-deploy.json'), JSON.stringify(earlier))
    lease(home, 'imp-2', { kind: 'import', siteKey: 'site-d' })
    const r = await deploy(dir, 0).done
    assert.match(r.stderr, /CUTS OFF 1 piece\(s\) of work \(import 1\)/, r.stdout + r.stderr)
    const cut = JSON.parse(readFileSync(path.join(home, 'cut-by-deploy.json'), 'utf8'))
    assert.deepEqual(
      cut.map((c) => c.work.map((w) => w.id)),
      [['chat-s0'], ['imp-2']]
    )
  })

  test('a lease written before kinds existed still counts, as work', async (t) => {
    const { dir, home } = makeHost(t)
    lease(home, 'old-shape', { siteKey: 'site-e' })
    const r = await deploy(dir, 0).done
    assert.match(r.stderr, /CUTS OFF 1 piece\(s\) of work \(work 1\)/, r.stdout + r.stderr)
  })
})
