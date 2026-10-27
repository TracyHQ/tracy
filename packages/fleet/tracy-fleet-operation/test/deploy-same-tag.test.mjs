#!/usr/bin/env node
/**
 * Since 15/09 both image workflows deploy on every push to their branch, and most of those deploys
 * ask for a tag the host already runs (the build was skipped because nothing entering the image
 * changed). Two things must then hold, and neither is visible from a green run:
 *
 *   1. `deploy-host-dsh.sh` does NOTHING to the host — no drain (which waits up to 20 minutes for
 *      running customer imports), no re-seed, no `up` — when the tag, the running image and every
 *      service's compose config hash are all unchanged; and it still deploys when ANY of the three
 *      moved (a re-pushed tag with new bytes, a changed host-dsh.yml, a stopped container).
 *   2. Both deploy scripts keep the rollback target: rewriting `…_IMAGE_TAG=X` over `X` must not
 *      turn `…_PREVIOUS` into `X`, which would erase the only record of the build before it.
 *   3. `deploy-host-dsh.sh` refuses, before touching anything, an env file without a non-empty
 *      TRACY_SITE_DOMAIN (#306: without it site-tools refuses every fleet https page).
 *   4. Every deploy that ends healthy — the same-tag exit included — ends by running
 *      `tools/resync-access-plugin.sh` through the daemon (#677), and a failed or missing resync
 *      makes the deploy fail without rolling the healthy image back. `--dry-run` only describes it.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/deploy-same-tag.test.mjs
 *
 * `docker` is a stub on PATH that answers from environment variables and logs every call, so the
 * test can say exactly which host-changing commands ran.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import { sh } from './sh-async.mjs'
import { linkStub, warmStub } from './warm-stub.mjs'

const DSH_DEPLOY = fileURLToPath(new URL('../dsh/deploy-host-dsh.sh', import.meta.url))
const STACK_DEPLOY = fileURLToPath(
  new URL('../../../../deploy/scripts/deploy-tracy-stack.sh', import.meta.url)
)

const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
args="$*"
case "$args" in
  "compose version"*) echo "Docker Compose version v2.29.7" ;;
  "pull "*) : ;;
  "image inspect "*) echo "$FAKE_WANT_ID" ;;
  "inspect tracy-dsh --format {{.Image}}") echo "$FAKE_HAVE_ID" ;;
  "inspect tracy-dsh --format {{.State.Status}}"*) echo "$FAKE_STATE" ;;
  "inspect tracy-dsh --format {{.Config.Image}}") echo "$FAKE_CONFIG_IMAGE" ;;
  "run "*resync-access-plugin.sh) exit "\${FAKE_RESYNC_RC:-0}" ;;
  "run "*resync-joomla-access-plugin.sh) exit "\${FAKE_JOOMLA_RESYNC_RC:-0}" ;;
  compose*"config --hash"*) printf 'dsh %s\\ndocker-proxy %s\\n' "$FAKE_HASH_DSH" proxyhash ;;
  compose*"ps -q dsh") [ -z "$FAKE_NO_CONTAINER" ] && echo cid-dsh ;;
  compose*"ps -q docker-proxy") echo cid-proxy ;;
  "inspect cid-dsh --format"*) echo "$FAKE_LABEL_DSH" ;;
  "inspect cid-proxy --format"*) echo proxyhash ;;
  *) : ;;
esac
`

// One stub each for the whole file (see warm-stub.mjs); every case links them and sets its values in env.
const DOCKER_STUB = warmStub('docker', FAKE_DOCKER, { warmEnv: { FAKE_LOG: '/dev/null' } })
// Exits 1 unless a case asks for the whole deploy (FAKE_SEED_RC=0), so reaching it proves the path.
const SEED_STUB = warmStub(
  'seed-profile.sh',
  '#!/bin/sh\ntouch "$FAKE_SEEDED"\nexit "${FAKE_SEED_RC:-1}"\n',
  { warmEnv: { FAKE_SEEDED: '/dev/null' } }
)
// The deploy only checks that the resync script is there; it runs it through `docker run`.
const RESYNC_STUB = warmStub('resync-access-plugin.sh', '#!/bin/sh\nexit 0\n')
const JOOMLA_RESYNC_STUB = warmStub('resync-joomla-access-plugin.sh', '#!/bin/sh\nexit 0\n')
const IMAGE_REPO = 'ghcr.io/tracyhq/tracy-dsh'

const FAKE_SECRET = 'sk-fake-secret-do-not-print'

function makeHost(
  t,
  {
    envTag = 'ctx-aaa',
    previous = 'ctx-old',
    siteDomainLine = 'TRACY_SITE_DOMAIN=tracy.site\n',
    resync = true
  } = {}
) {
  const dir = mkdtempSync(path.join(tmpdir(), 'deploy-same-tag-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(path.join(dir, 'bin'))
  linkStub(DOCKER_STUB, path.join(dir, 'bin/docker'))
  // The script finds seed-profile.sh beside itself; a stub there proves whether seeding ran.
  mkdirSync(path.join(dir, 'fleet'))
  copyFileSync(DSH_DEPLOY, path.join(dir, 'fleet/deploy-host-dsh.sh'))
  linkStub(SEED_STUB, path.join(dir, 'fleet/seed-profile.sh'))
  writeFileSync(path.join(dir, 'fleet/host-dsh.yml'), 'services: {}\n')
  writeFileSync(path.join(dir, 'fleet/docker-proxy.haproxy.cfg'), '# rules\n')
  // `<fleet>/tools/` beside `<fleet>/dsh/`, as the deploy action ships them.
  mkdirSync(path.join(dir, 'tools'))
  if (resync) linkStub(RESYNC_STUB, path.join(dir, 'tools/resync-access-plugin.sh'))
  if (resync) linkStub(JOOMLA_RESYNC_STUB, path.join(dir, 'tools/resync-joomla-access-plugin.sh'))
  mkdirSync(path.join(dir, 'home'))
  writeFileSync(
    path.join(dir, 'host-dsh.env'),
    `HOST_DSH_HOME=${dir}/home\nDSH_IMAGE_TAG=${envTag}\nDSH_IMAGE_TAG_PREVIOUS=${previous}\n` +
      `MODEL_API_KEY=${FAKE_SECRET}\n${siteDomainLine}`
  )
  return dir
}

async function deployDsh(dir, tag, fake, extraArgs = []) {
  const log = path.join(dir, 'docker.log')
  const res = await sh(
    'bash',
    [path.join(dir, 'fleet/deploy-host-dsh.sh'), '--tag', tag, '--drain-timeout', '0', ...extraArgs],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}/bin:${process.env.PATH}`,
        DSH_IMAGE: IMAGE_REPO,
        HOST_DSH_COMPOSE: path.join(dir, 'fleet/host-dsh.yml'),
        HOST_DSH_ENV_FILE: path.join(dir, 'host-dsh.env'),
        FAKE_LOG: log,
        FAKE_SEEDED: path.join(dir, 'SEEDED'),
        FAKE_WANT_ID: 'sha256:same',
        FAKE_HAVE_ID: 'sha256:same',
        FAKE_STATE: 'running/healthy',
        FAKE_HASH_DSH: 'dshhash',
        FAKE_LABEL_DSH: 'dshhash',
        FAKE_CONFIG_IMAGE: `${IMAGE_REPO}:${tag}`,
        ...fake
      }
    }
  )
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
  return { ...res, calls, seeded: existsSync(path.join(dir, 'SEEDED')) }
}

/** The access resync (#677): a `docker run` of the resync script. */
const isResync = (c) => /^run .*resync-access-plugin\.sh$/.test(c)
const resyncRuns = (calls) => calls.filter(isResync)
/** The Joomla half: the Claude Cowork package's updates put the header-trusting plugin back. */
const isJoomlaResync = (c) => /^run .*resync-joomla-access-plugin\.sh$/.test(c)

/** Any docker call that changes the host, other than the access resync. */
const changesHost = (calls) =>
  calls.filter(
    (c) =>
      !isResync(c) &&
      !isJoomlaResync(c) &&
      (/ up( |$)|^run |^rm |^stop |^restart /.test(c) || c.includes(' up -d'))
  )

describe('deploy-host-dsh.sh — the same tag again', { concurrency: 8 }, () => {
  test('image, config and health unchanged: exits 0 before drain, seed and up', async (t) => {
    const dir = makeHost(t)
    const r = await deployDsh(dir, 'ctx-aaa', {})
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stdout, /nothing to deploy/)
    assert.equal(r.seeded, false, 'seed-profile.sh ran on an unchanged deploy')
    assert.deepEqual(changesHost(r.calls), [])
    assert.ok(!existsSync(path.join(dir, 'home/draining')), 'the drain file was written')
    const env = readFileSync(path.join(dir, 'host-dsh.env'), 'utf8')
    assert.match(env, /^DSH_IMAGE_TAG_PREVIOUS=ctx-old$/m, 'the rollback target was touched')
    // …but it still carries the shipped tracy-access.php to every site (#677).
    const [resync, ...more] = resyncRuns(r.calls)
    assert.deepEqual(more, [], 'resync ran more than once')
    assert.ok(resync, `no access resync:\n${r.calls.join('\n')}`)
    assert.ok(resync.includes('--pull never'), resync)
    assert.ok(resync.includes(`type=bind,source=${dir},target=${dir},readonly`), resync)
    assert.ok(resync.includes('type=bind,source=/srv/tracy-sites,target=/srv/tracy-sites'), resync)
    assert.ok(resync.includes('-e TRACY_SITES_ROOT=/srv/tracy-sites'), resync)
    assert.ok(resync.endsWith(`${IMAGE_REPO}:ctx-aaa ${dir}/tools/resync-access-plugin.sh`), resync)
  })

  test('the Joomla access plugin is resynced too, once, with the same mounts and after the WordPress one', async (t) => {
    const dir = makeHost(t)
    const r = await deployDsh(dir, 'ctx-aaa', {})
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const joomla = r.calls.filter(isJoomlaResync)
    assert.equal(joomla.length, 1, r.calls.join('\n'))
    assert.ok(joomla[0].includes('type=bind,source=/srv/tracy-sites,target=/srv/tracy-sites'), joomla[0])
    assert.ok(
      joomla[0].endsWith(`${IMAGE_REPO}:ctx-aaa ${dir}/tools/resync-joomla-access-plugin.sh`),
      joomla[0]
    )
    assert.ok(r.calls.findIndex(isResync) < r.calls.findIndex(isJoomlaResync))
  })

  test('the Joomla resync fails: the deploy says so and exits non-zero', async (t) => {
    const dir = makeHost(t)
    const r = await deployDsh(dir, 'ctx-aaa', { FAKE_JOOMLA_RESYNC_RC: '1' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /resync-joomla-access-plugin\.sh/)
  })

  test('the sites root the resync mounts is the one dsh mounts (HOST_SITES_ROOT)', async (t) => {
    const dir = makeHost(t, {
      siteDomainLine: 'HOST_SITES_ROOT=/data/sites\nTRACY_SITE_DOMAIN=tracy.site\n'
    })
    const r = await deployDsh(dir, 'ctx-aaa', {})
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const [resync] = resyncRuns(r.calls)
    assert.ok(resync?.includes('type=bind,source=/data/sites,target=/data/sites'), resync)
    assert.ok(resync.includes('-e TRACY_SITES_ROOT=/data/sites'), resync)
  })

  test('the resync gets the private root (HOST_PRIVATE_ROOT) and the tag, so its copy is a commit named for the deploy', async (t) => {
    const privateRoot = mkdtempSync(path.join(tmpdir(), 'private-root-'))
    t.after(() => rmSync(privateRoot, { recursive: true, force: true }))
    const dir = makeHost(t, {
      siteDomainLine: `HOST_PRIVATE_ROOT=${privateRoot}\nTRACY_SITE_DOMAIN=tracy.site\n`
    })
    const r = await deployDsh(dir, 'ctx-aaa', {})
    assert.equal(r.status, 0, r.stderr + r.stdout)
    const [resync] = resyncRuns(r.calls)
    assert.ok(resync?.includes(`type=bind,source=${privateRoot},target=${privateRoot}`), resync)
    assert.ok(resync.includes(`-e TRACY_PRIVATE_ROOT=${privateRoot}`), resync)
    assert.match(resync, /-e TRACY_DEPLOY_TAG=\S+/)

    // A host with no such root: the copy still runs, with no mount and a note.
    const bare = makeHost(t, {
      siteDomainLine: 'HOST_PRIVATE_ROOT=/nonexistent/tracy\nTRACY_SITE_DOMAIN=tracy.site\n'
    })
    const plain = await deployDsh(bare, 'ctx-aaa', {})
    assert.equal(plain.status, 0, plain.stderr + plain.stdout)
    assert.ok(!resyncRuns(plain.calls)[0].includes('TRACY_PRIVATE_ROOT'))
    assert.match(plain.stdout + plain.stderr, /no \/nonexistent\/tracy \(HOST_PRIVATE_ROOT\)/)
  })

  test('same tag, resync fails: non-zero, says so, and still no drain, seed or up', async (t) => {
    const dir = makeHost(t)
    const r = await deployDsh(dir, 'ctx-aaa', { FAKE_RESYNC_RC: '1' })
    assert.notEqual(r.status, 0, r.stdout)
    assert.match(r.stderr, /tracy-access\.php did not reach every WordPress site/)
    assert.match(r.stderr, /the running image was not touched/)
    assert.equal(r.seeded, false)
    assert.deepEqual(changesHost(r.calls), [])
    assert.ok(!existsSync(path.join(dir, 'home/draining')))
  })

  test('same tag, resync script not shipped: non-zero, names it, runs nothing', async (t) => {
    const dir = makeHost(t, { resync: false })
    const r = await deployDsh(dir, 'ctx-aaa', {})
    assert.notEqual(r.status, 0, r.stdout)
    assert.match(r.stderr, /no executable .*tools\/resync-access-plugin\.sh/)
    assert.deepEqual(resyncRuns(r.calls), [])
    assert.equal(r.seeded, false)
  })

  for (const [name, fake] of [
    ['the tag was re-pushed with different bytes (a forced rebuild)', { FAKE_WANT_ID: 'sha256:new' }],
    ['host-dsh.yml changed (compose config hash differs)', { FAKE_HASH_DSH: 'changed' }],
    ['the dsh container is missing', { FAKE_NO_CONTAINER: '1' }],
    ['the container is not healthy', { FAKE_STATE: 'exited/none' }]
  ]) {
    test(`still deploys when ${name}`, async (t) => {
      const dir = makeHost(t)
      const r = await deployDsh(dir, 'ctx-aaa', fake)
      // The stub seed exits 1 on purpose, so reaching it is the proof the full path was taken.
      assert.equal(r.seeded, true, `the deploy stopped early:\n${r.stdout}`)
      assert.doesNotMatch(r.stdout, /nothing to deploy/)
    })
  }

  test('a different tag never takes the shortcut', async (t) => {
    const dir = makeHost(t)
    const r = await deployDsh(dir, 'ctx-bbb', {})
    assert.equal(r.seeded, true)
    assert.doesNotMatch(r.stdout, /nothing to deploy/)
  })
})

describe('deploy-host-dsh.sh — the access resync ends a full deploy (#677)', { concurrency: 8 }, () => {
  // FAKE_SEED_RC=0 lets the deploy run to the end: up, healthy, smoke, image check.
  const full = { FAKE_SEED_RC: '0', FAKE_WANT_ID: 'sha256:new' }

  test('a new tag: resync runs after up and the image check, then the deploy reports success', async (t) => {
    const dir = makeHost(t)
    const r = await deployDsh(dir, 'ctx-bbb', full)
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stdout, /deployed ghcr\.io\/tracyhq\/tracy-dsh:ctx-bbb/)
    const up = r.calls.findIndex((c) => c.includes(' up -d'))
    const checked = r.calls.indexOf('inspect tracy-dsh --format {{.Config.Image}}')
    const resync = r.calls.findIndex(isResync)
    assert.ok(up >= 0 && checked > up, r.calls.join('\n'))
    assert.ok(resync > checked, `resync did not come last:\n${r.calls.join('\n')}`)
    assert.equal(resyncRuns(r.calls).length, 1)
    assert.ok(r.calls[resync].includes(`${IMAGE_REPO}:ctx-bbb `), r.calls[resync])
  })

  test('a new tag, resync fails: non-zero, no success line, the healthy image is not rolled back', async (t) => {
    const dir = makeHost(t)
    const r = await deployDsh(dir, 'ctx-bbb', { ...full, FAKE_RESYNC_RC: '1' })
    assert.notEqual(r.status, 0, r.stdout)
    assert.match(r.stderr, /tracy-access\.php did not reach every WordPress site/)
    assert.match(r.stderr, /is up and healthy and was NOT rolled back/)
    assert.doesNotMatch(r.stdout, /^deployed /m)
    assert.doesNotMatch(r.stderr, /putting ctx-aaa back|deploy failed on/)
    assert.equal(r.calls.filter((c) => c.includes(' up -d')).length, 1, 'a second up ran')
    const env = readFileSync(path.join(dir, 'host-dsh.env'), 'utf8')
    assert.match(env, /^DSH_IMAGE_TAG=ctx-bbb$/m)
  })

  test('a deploy that fails its health check rolls back and never runs the resync', async (t) => {
    const dir = makeHost(t)
    const r = await deployDsh(dir, 'ctx-bbb', { ...full, FAKE_STATE: 'exited/none' })
    assert.notEqual(r.status, 0, r.stdout)
    assert.match(r.stderr, /putting ctx-aaa back/)
    assert.deepEqual(resyncRuns(r.calls), [])
    assert.doesNotMatch(r.stdout, /^deployed /m)
  })

  test('a new tag with the resync script missing: refuses at the end, image left up', async (t) => {
    const dir = makeHost(t, { resync: false })
    const r = await deployDsh(dir, 'ctx-bbb', full)
    assert.notEqual(r.status, 0, r.stdout)
    assert.match(r.stderr, /no executable .*resync-access-plugin\.sh/)
    assert.doesNotMatch(r.stderr, /putting ctx-aaa back/)
    assert.doesNotMatch(r.stdout, /^deployed /m)
  })
})

describe('deploy-host-dsh.sh — TRACY_SITE_DOMAIN must be in the env file', { concurrency: 8 }, () => {
  // The process environment carries a domain in every case, so a pass can only come from the FILE —
  // the container receives the file, not the deploying shell's environment.
  const fromShell = { TRACY_SITE_DOMAIN: 'from-the-shell.example' }

  for (const [name, siteDomainLine] of [
    ['missing', ''],
    ['empty', 'TRACY_SITE_DOMAIN=\n'],
    ['quoted empty', 'TRACY_SITE_DOMAIN=""\n'],
    ['whitespace only', 'TRACY_SITE_DOMAIN=   \n'],
    // Compose reads an inline comment after whitespace as a comment: this value is EMPTY to it.
    ['an inline comment for a value', 'TRACY_SITE_DOMAIN= # TODO\n'],
    ['a value followed by a comment', 'TRACY_SITE_DOMAIN=tracy.site # prod\n'],
    // Compose keeps the LAST line of a key, so a later empty duplicate wins over a good first one.
    ['a later empty duplicate', 'TRACY_SITE_DOMAIN=tracy.site\nTRACY_SITE_DOMAIN=\n'],
    ['a duplicate written with export', 'TRACY_SITE_DOMAIN=tracy.site\nexport TRACY_SITE_DOMAIN=\n'],
    // A bare key with no `=` is "unset" to compose, so it too must count as a second line.
    ['a later bare declaration', 'TRACY_SITE_DOMAIN=tracy.site\nTRACY_SITE_DOMAIN\n'],
    ['a later bare export', 'TRACY_SITE_DOMAIN=tracy.site\nexport TRACY_SITE_DOMAIN \n'],
    // Compose also accepts `KEY: value`, so a colon line is a second declaration that wins.
    ['a later empty colon declaration', 'TRACY_SITE_DOMAIN=tracy.site\nTRACY_SITE_DOMAIN: \n'],
    ['a colon declaration only', 'TRACY_SITE_DOMAIN: tracy.site\n'],
    ['not a hostname', 'TRACY_SITE_DOMAIN=https://tracy.site/\n']
  ]) {
    for (const [mode, tag, extraArgs] of [
      ['a new tag', 'ctx-bbb', []],
      ['the same tag', 'ctx-aaa', []],
      ['--dry-run', 'ctx-bbb', ['--dry-run']]
    ]) {
      test(`${name}: refuses ${mode} before pull, drain, seed or up`, async (t) => {
        const dir = makeHost(t, { siteDomainLine })
        const envBefore = readFileSync(path.join(dir, 'host-dsh.env'), 'utf8')
        const r = await deployDsh(dir, tag, fromShell, extraArgs)
        assert.notEqual(r.status, 0, r.stdout)
        assert.match(r.stderr, /TRACY_SITE_DOMAIN/)
        assert.ok(r.stderr.includes(path.join(dir, 'host-dsh.env')), r.stderr)
        assert.equal(r.seeded, false, 'seed-profile.sh ran')
        assert.deepEqual(changesHost(r.calls), [])
        assert.deepEqual(resyncRuns(r.calls), [], 'the access resync ran')
        assert.deepEqual(
          r.calls.filter((c) => /^pull |^image inspect /.test(c)),
          [],
          'an image was pulled or inspected'
        )
        assert.ok(!existsSync(path.join(dir, 'home/draining')), 'the drain file was written')
        assert.equal(readFileSync(path.join(dir, 'host-dsh.env'), 'utf8'), envBefore)
        assert.ok(!(r.stdout + r.stderr).includes(FAKE_SECRET), 'a secret from the env file was printed')
      })
    }
  }

  test('present: --dry-run passes preflight and prints no secret', async (t) => {
    const dir = makeHost(t, { siteDomainLine: 'TRACY_SITE_DOMAIN="tracy.site"\n' })
    const r = await deployDsh(dir, 'ctx-bbb', {}, ['--dry-run'])
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stdout, /--dry-run: would pull/)
    assert.match(r.stdout, /--dry-run: then, .*resync tracy-access\.php/)
    assert.ok(!(r.stdout + r.stderr).includes(FAKE_SECRET))
    assert.deepEqual(changesHost(r.calls), [])
    assert.deepEqual(resyncRuns(r.calls), [], 'a dry run ran the resync')
  })

  test('present, single-quoted: --dry-run passes preflight', async (t) => {
    const dir = makeHost(t, { siteDomainLine: "TRACY_SITE_DOMAIN='tracy.site'\n" })
    const r = await deployDsh(dir, 'ctx-bbb', {}, ['--dry-run'])
    assert.equal(r.status, 0, r.stderr + r.stdout)
  })

  test('present: a new tag goes on to the seed', async (t) => {
    const dir = makeHost(t)
    const r = await deployDsh(dir, 'ctx-bbb', {})
    assert.equal(r.seeded, true, `the deploy stopped early:\n${r.stderr}`)
    assert.doesNotMatch(r.stderr, /TRACY_SITE_DOMAIN/)
  })
})

/** Run a script's `write_tag` function alone, against a real env file. */
function writeTag(script, prefix, { current, previous, next }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'write-tag-'))
  try {
    const envFile = path.join(dir, 'x.env')
    writeFileSync(envFile, `SECRET=1\n${prefix}=${current}\n${prefix}_PREVIOUS=${previous}\n`)
    const src = readFileSync(script, 'utf8')
    const fn = src.match(/^write_tag\(\) \{[\s\S]*?^\}/m)?.[0]
    assert.ok(fn, `no write_tag() in ${script}`)
    const res = spawnSync(
      'bash',
      [
        '-c',
        `set -euo pipefail\nENV_FILE='${envFile}'\nPREVIOUS_TAG='${previous}'\n${fn}\nwrite_tag '${next}' '${current}'`
      ],
      { encoding: 'utf8' }
    )
    assert.equal(res.status, 0, res.stderr)
    return readFileSync(envFile, 'utf8')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('write_tag keeps the rollback target', () => {
  for (const [script, prefix] of [
    [DSH_DEPLOY, 'DSH_IMAGE_TAG'],
    [STACK_DEPLOY, 'APP_IMAGE_TAG']
  ]) {
    const name = path.basename(script)
    test(`${name}: redeploying the running tag leaves PREVIOUS alone`, () => {
      const env = writeTag(script, prefix, { current: 'X', previous: 'W', next: 'X' })
      assert.match(env, new RegExp(`^${prefix}=X$`, 'm'))
      assert.match(env, new RegExp(`^${prefix}_PREVIOUS=W$`, 'm'))
      assert.match(env, /^SECRET=1$/m)
    })
    test(`${name}: a new tag makes the running one PREVIOUS`, () => {
      const env = writeTag(script, prefix, { current: 'X', previous: 'W', next: 'Y' })
      assert.match(env, new RegExp(`^${prefix}=Y$`, 'm'))
      assert.match(env, new RegExp(`^${prefix}_PREVIOUS=X$`, 'm'))
    })
  }
})
