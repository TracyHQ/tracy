// QA stand package (G7): rebuild-local --build-only, the docker guard, env + config check,
// manifest, netfilter, snapshot and restore. Every Docker call goes to a FAKE `docker` on PATH.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { checkCompose, checkEnv, checkReadConfig } from '../qa/stand/check-config.mjs'
import { decide } from '../qa/stand/docker-guard.mjs'
import { makeEnv } from '../qa/stand/make-env.mjs'
import { actual, decide as decideRebuild, desired, diff } from '../qa/stand/manifest.mjs'
import * as nf from '../qa/stand/netfilter.mjs'
import { QA, dockerRunner, parseEnv } from '../qa/stand/qa-stand.mjs'
import { planRestore, restore } from '../qa/stand/restore.mjs'
import { planSnapshot, preconditions } from '../qa/stand/snapshot.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const TMP = mkdtempSync(path.join(tmpdir(), 'qa-stand-test-'))
after(() => rmSync(TMP, { recursive: true, force: true }))

let n = 0
const fresh = (name) => {
  const d = path.join(TMP, `${name}-${++n}`)
  mkdirSync(d, { recursive: true })
  return d
}

// Node 24 reads `--env-file <f>` even AFTER the script name unless a `--` comes first (measured:
// `node fake.cjs compose --env-file /qa/.env` dies with "node: /qa/.env: not found"), so the fake
// is a sh wrapper that puts `--` in front of the arguments.
const FAKE_SHIM = `#!/bin/sh
exec node "$(dirname "$0")/fake-docker.cjs" -- "$@"
`
const FAKE_DOCKER = `const fs = require('fs')
const args = process.argv.slice(2)
if (args[0] === '--') args.shift()
fs.appendFileSync(process.env.FAKE_DOCKER_LOG, JSON.stringify(args) + '\\n')
let rules = []
try { rules = JSON.parse(fs.readFileSync(process.env.FAKE_DOCKER_RULES, 'utf8')) } catch {}
const line = args.join(' ')
for (const r of rules) {
  if (new RegExp(r.match).test(line)) {
    if (r.stdout) fs.writeSync(1, r.stdout)
    if (r.stderr) fs.writeSync(2, r.stderr)
    process.exit(r.code ?? 0)
  }
}
`

/** A fake `docker` in its own bin dir; returns { bin, env, calls(), setRules(rules) }. */
function fakeDocker(rules = []) {
  const dir = fresh('fake')
  const bin = path.join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(path.join(bin, 'docker'), FAKE_SHIM)
  writeFileSync(path.join(bin, 'fake-docker.cjs'), FAKE_DOCKER)
  chmodSync(path.join(bin, 'docker'), 0o755)
  const log = path.join(dir, 'calls.jsonl')
  const rulesFile = path.join(dir, 'rules.json')
  writeFileSync(log, '')
  writeFileSync(rulesFile, JSON.stringify(rules))
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    FAKE_DOCKER_LOG: log,
    FAKE_DOCKER_RULES: rulesFile
  }
  return {
    bin,
    dir,
    env,
    path: path.join(bin, 'docker'),
    calls: () =>
      readFileSync(log, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
    setRules: (r) => writeFileSync(rulesFile, JSON.stringify(r)),
    runner: () => {
      const run = dockerRunner(path.join(bin, 'docker'))
      return (args, opts = {}) => run(args, { ...opts, env })
    }
  }
}

const git = (cwd, ...args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/dev/null'
    }
  }).trim()

/** A minimal tree rebuild-local.sh can build from without bootstrapping anything. */
function buildTree(dir) {
  const files = {
    'apps/tracy-web/Dockerfile': 'FROM scratch\n',
    'apps/tracy-host/Dockerfile': 'FROM scratch\n',
    'packages/fleet/tracy-fleet-operation/dsh/Dockerfile': 'FROM scratch\n',
    'packages/fleet/tracy-fleet-operation/scripts/tools/stage-cms-seeder.sh': 'exit 0\n',
    'packages/web/tracy-harness/dist/.keep': '',
    'packages/web/tracy-design-page/dist/.keep': '',
    'packages/web/tracy-wo-find-page/dist/.keep': '',
    'apps/tracy-docs/dist/.keep': '',
    'apps/tracy-web/static/ops-cms/.keep': '',
    'deploy/compose.yml': 'name: tracy\n',
    'deploy/compose.macos.yml': 'services: {}\n'
  }
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true })
    writeFileSync(path.join(dir, f), body)
  }
  git(dir, 'init', '-q', '-b', 'develop')
  git(dir, 'add', '-A')
  git(dir, 'update-index', '--add', '--cacheinfo', `160000,${'a'.repeat(40)},vendor/tracy/deepseek-harness`)
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'tree'], {
    cwd: dir,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-10-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-10-01T00:00:00Z',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/dev/null'
    }
  })
  return git(dir, 'rev-parse', 'HEAD')
}

/** Fake pnpm/corepack that only record they were called: a bootstrap must not happen. */
function fakeTools(fake) {
  for (const t of ['pnpm', 'corepack']) {
    writeFileSync(path.join(fake.bin, t), `#!/bin/sh\necho ${t} "$@" >> "${fake.dir}/tools.log"\n`)
    chmodSync(path.join(fake.bin, t), 0o755)
  }
  return () =>
    existsSync(path.join(fake.dir, 'tools.log')) ? readFileSync(path.join(fake.dir, 'tools.log'), 'utf8') : ''
}

function installScript(repo, source) {
  mkdirSync(path.join(repo, 'scripts'), { recursive: true })
  copyFileSync(source, path.join(repo, 'scripts', 'rebuild-local.sh'))
}

// ---------------------------------------------------------------------------------------------
describe('G7.1 rebuild-local.sh --context --build-only', () => {
  test('builds exactly three labelled images and nothing else, with no deploy/.env anywhere', () => {
    const fake = fakeDocker()
    const toolsLog = fakeTools(fake)
    const ctx = fresh('ctx')
    const sha = buildTree(ctx)
    mkdirSync(path.join(ctx, 'node_modules'))
    const repo = fresh('repo') // a copy of the script with no deploy/.env beside it, not a git repo
    installScript(repo, path.join(ROOT, 'scripts', 'rebuild-local.sh'))
    const r = spawnSync(
      'bash',
      [path.join(repo, 'scripts', 'rebuild-local.sh'), '--context', ctx, '--build-only', 'all'],
      {
        encoding: 'utf8',
        env: { ...fake.env, APP_IMAGE_TAG: 'qa-next' }
      }
    )
    assert.equal(r.status, 0, r.stderr)
    assert.doesNotMatch(r.stdout + r.stderr, /using the shared checkout's/)
    const calls = fake.calls()
    assert.equal(calls.length, 3, JSON.stringify(calls))
    const tags = calls.map((c) => {
      assert.equal(c[0], 'build')
      assert.ok(c.includes(`tracy.commit=${sha}`), `label missing in ${c.join(' ')}`)
      return c[c.indexOf('-t') + 1]
    })
    assert.deepEqual(tags.sort(), ['tracy/dsh:qa-next', 'tracy/host:qa-next', 'tracy/web:qa-next'])
    for (const c of calls) for (const bad of ['run', 'compose', 'tar']) assert.ok(!c.includes(bad))
    assert.equal(toolsLog(), '', 'no bootstrap may run')
  })

  // Keep the shared rebuild contract, including develop's web-before-host startup order.
  // QA's extra flags must not change the calls made by other sessions.
  const BEFORE = {
    '--here all': [
      'build -f <REPO>/apps/tracy-host/Dockerfile -t tracy/host:dev <REPO>',
      'build -f <REPO>/apps/tracy-web/Dockerfile -t tracy/web:dev <REPO>',
      `build -f <REPO>/packages/fleet/tracy-fleet-operation/dsh/Dockerfile --build-arg DSH_COMMIT=${'a'.repeat(40)} --label tracy.commit=<SHA> -t tracy/dsh:dev <REPO>`,
      'run --rm --entrypoint sh tracy/dsh:dev -c tar -C /desk-home -cf - profiles',
      'run -i --rm -v <DSH>:/out alpine tar -C /out -xf -',
      'compose --project-directory <REPO>/deploy -f <REPO>/deploy/compose.yml -f <REPO>/deploy/compose.macos.yml --profile local up -d --no-deps --force-recreate tracy-web',
      'compose --project-directory <REPO>/deploy -f <REPO>/deploy/compose.yml -f <REPO>/deploy/compose.macos.yml --profile local up -d --no-deps --force-recreate tracy-host tracy-dsh',
      'ps --format   {{.Names}}\\t{{.Image}}',
      'inspect tracy-tracy-host-1 --format {{.HostConfig.NetworkMode}}'
    ],
    'web host': [
      'build -f <WT>/apps/tracy-web/Dockerfile -t tracy/web:dev <WT>',
      'build -f <WT>/apps/tracy-host/Dockerfile -t tracy/host:dev <WT>',
      'inspect tracy/dsh:dev --format {{index .Config.Labels "tracy.commit"}}',
      'compose --project-directory <REPO>/deploy -f <WT>/deploy/compose.yml -f <WT>/deploy/compose.macos.yml --profile local up -d --no-deps --force-recreate tracy-web',
      'compose --project-directory <REPO>/deploy -f <WT>/deploy/compose.yml -f <WT>/deploy/compose.macos.yml --profile local up -d --no-deps --force-recreate tracy-host',
      'ps --format   {{.Names}}\\t{{.Image}}',
      'inspect tracy-tracy-host-1 --format {{.HostConfig.NetworkMode}}'
    ]
  }
  for (const [label, expected] of Object.entries(BEFORE)) {
    test(`without the new flags, \`${label}\` makes the same docker calls as before the change`, () => {
      const fake = fakeDocker()
      fakeTools(fake)
      const repo = fresh('repo')
      buildTree(repo)
      mkdirSync(path.join(repo, 'node_modules'))
      const dshHome = fresh('dsh-home')
      writeFileSync(path.join(repo, 'deploy', '.env'), `TRACY_DSH_HOME=${dshHome}\n`)
      const origin = fresh('origin')
      git(origin, 'clone', '-q', '--bare', repo, 'o.git')
      git(repo, 'remote', 'add', 'origin', path.join(origin, 'o.git'))
      installScript(repo, path.join(ROOT, 'scripts', 'rebuild-local.sh'))
      const r = spawnSync('bash', [path.join(repo, 'scripts', 'rebuild-local.sh'), ...label.split(' ')], {
        encoding: 'utf8',
        env: fake.env
      })
      assert.equal(r.status, 0, r.stderr)
      const norm = (s) =>
        s
          .replaceAll(repo, '<REPO>')
          .replace(/[^\s"]*tracy-rebuild\.[A-Za-z0-9]+/g, '<WT>')
          .replaceAll(dshHome, '<DSH>')
          .replace(/tracy\.commit=[0-9a-f]{40}/g, 'tracy.commit=<SHA>')
      // The profile seed is `docker run … | docker run …`: the two halves start in either order.
      const seq = fake.calls().map((c) => norm(c.join(' ')))
      const i = seq.findIndex((c) => c.startsWith('run '))
      if (i >= 0 && seq[i + 1]?.startsWith('run ')) seq.splice(i, 2, ...[seq[i], seq[i + 1]].sort())
      assert.deepEqual(seq, expected)
    })
  }
})

// ---------------------------------------------------------------------------------------------
describe('G7.2 docker guard', () => {
  const labels = {
    container: {
      'leetest-web-1': { 'com.docker.compose.project': 'leetest' },
      'tracy-qa-postgres-1': { 'com.docker.compose.project': 'tracy-qa' },
      'qa-fixedwp-web-1': { 'com.docker.compose.project': 'qa-fixedwp' },
      tmp1: { 'qa.run': '20261003a' }
    },
    network: {
      somenet: {},
      'tracy-qa_default': { 'com.docker.compose.project': 'tracy-qa' },
      canary: { 'qa.run': '20261003a' }
    },
    volume: {
      leetest_db: { 'com.docker.compose.project': 'leetest' },
      'qa-fixedem_app': { 'com.docker.compose.project': 'qa-fixedem' }
    }
  }
  const existing = new Set(['tracy/web-joomla:5-apache-20260923-r1'])
  const ctx = {
    siteProjects: new Set(['qa-fixedwp', 'qa-fixedjo', 'qa-fixedem']),
    defaultWebImages: new Set([
      'tracy/web-wordpress:php8.3-apache-20260923-r1',
      'tracy/web-joomla:5-apache-20260923-r1'
    ]),
    imageExists: (ref) => existing.has(ref),
    labelsOf: (kind, name) => labels[kind]?.[name] ?? null
  }
  const refused = [
    ['compose', '-p', 'tracy', '-f', 'deploy/compose.yml', 'up', '-d'],
    ['compose', '-f', 'deploy/compose.yml', 'up', '-d'],
    ['rm', '-f', 'leetest-web-1'],
    ['stop', 'some-unknown-container'],
    ['build', '-t', 'tracy/web:dev', '.'],
    ['build', '-t', 'tracy/web-joomla:5-apache-20260923-r1', '.'],
    ['network', 'rm', 'somenet'],
    ['volume', 'rm', 'leetest_db'],
    ['network', 'create', 'x'],
    ['run', '--rm', 'alpine', 'true'],
    ['run', '-d', '--name', 'x', 'alpine'],
    ['--context', 'studio', 'ps'],
    ['-H', 'ssh://macmini', 'ps'],
    ['system', 'prune', '-af'],
    ['pull', 'alpine'],
    ['tag', 'tracy/web:qa', 'tracy/web:dev'],
    ['rmi', 'tracy/web:dev'],
    ['exec', 'leetest-web-1', 'sh']
  ]
  const allowed = [
    [
      'compose',
      '--project-directory',
      '/x/deploy',
      '--env-file',
      '/q/.env',
      '-p',
      'tracy-qa',
      '-f',
      'a.yml',
      'up',
      '-d'
    ],
    ['compose', '-p', 'qa-fixedwp', 'up', '-d'],
    ['compose', '-p', 'tracy', 'config', '--format', 'json'],
    [
      'build',
      '-f',
      'apps/tracy-web/Dockerfile',
      '--label',
      'tracy.commit=abc',
      '-t',
      'tracy/web:qa-next',
      '.'
    ],
    [
      'build',
      '-f',
      'x',
      '--build-arg',
      'BASE=wordpress:php8.3-apache',
      '-t',
      'tracy/web-wordpress:php8.3-apache-20260923-r1',
      '.'
    ],
    ['network', 'create', '--subnet', '10.241.250.0/24', '--label', 'qa.run=20261003a', 'canary'],
    ['volume', 'create', '--label', 'qa.run=20261003a', 'tracy-qa_tracy-minio'],
    [
      'run',
      '--rm',
      '-d',
      '--network',
      'host',
      '--label',
      'qa.run=20261003a',
      '--entrypoint',
      'sh',
      'tracy/host:qa',
      '-c',
      'iptables -S'
    ],
    ['network', 'rm', 'tracy-qa_default'],
    ['network', 'rm', 'canary'],
    ['network', 'rm', 'qa-fixedwp_default'],
    ['volume', 'rm', 'qa-fixedem_app'],
    ['rm', '-f', 'tmp1'],
    ['exec', '-e', 'A=1', 'tracy-qa-postgres-1', 'psql', '-U', 'tracy', '-At'],
    ['cp', 'tracy-qa-postgres-1:/tmp/x', '/q/x'],
    ['tag', 'tracy/web:qa', 'tracy/web:qa-prev'],
    ['ps', '-a'],
    ['inspect', 'anything'],
    ['image', 'inspect', 'tracy/web:dev'],
    ['network', 'ls'],
    ['images']
  ]
  for (const argv of refused)
    test(`refuses: docker ${argv.join(' ')}`, () => assert.equal(decide(argv, ctx).allow, false))
  for (const argv of allowed)
    test(`allows: docker ${argv.join(' ')}`, () =>
      assert.equal(decide(argv, ctx).allow, true, decide(argv, ctx).reason))

  test('bin/docker refuses before reaching the real docker, logs, and passes allowed calls through', () => {
    const fake = fakeDocker()
    const home = fresh('home')
    const env = {
      ...fake.env,
      QA_HOME: home,
      QA_REAL_DOCKER: fake.path,
      QA_SRC_DIR: ROOT,
      QA_RUN_ID: 'r-test'
    }
    const guard = path.join(ROOT, 'scripts', 'qa', 'bin', 'docker')
    const no = spawnSync(guard, ['compose', '-p', 'tracy', 'up', '-d'], { encoding: 'utf8', env })
    assert.equal(no.status, 126)
    assert.match(no.stderr, /refused/)
    assert.equal(fake.calls().length, 0)
    const yes = spawnSync(guard, ['ps', '-a'], { encoding: 'utf8', env })
    assert.equal(yes.status, 0, yes.stderr)
    assert.deepEqual(fake.calls(), [['ps', '-a']])
    // `--env-file` must reach docker, not node.
    const cfg = ['compose', '--env-file', '/q/.env', '-p', 'tracy-qa', 'config']
    const third = spawnSync(guard, cfg, { encoding: 'utf8', env })
    assert.equal(third.status, 0, third.stderr)
    assert.deepEqual(fake.calls().at(-1), cfg)
    const log = readFileSync(path.join(home, 'logs', 'docker-guard.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    assert.equal(log.length, 3)
    assert.equal(log[0].allow, false)
    assert.equal(log[0].runId, 'r-test')
    assert.equal(log[1].allow, true)
  })
})

// ---------------------------------------------------------------------------------------------
describe('G7.3 env file and check-config', () => {
  const SOURCE_VALUE = 'fake-model-key-value-1234567890'
  function generate({ token } = {}) {
    const dir = fresh('env')
    const source = path.join(dir, 'shared.env')
    writeFileSync(
      source,
      `MODEL_API_KEY=${SOURCE_VALUE}\nSESSION_SECRET=shared-session-secret-not-to-copy-000000\nTRACY_RELEASES_GITHUB_TOKEN=gho_shared_not_to_copy\nDEMO_JOOMLART_SSH_KEY=/k\n`
    )
    const out = path.join(dir, '.env')
    let releasesTokenFile = null
    if (token) {
      releasesTokenFile = path.join(dir, 'tok')
      writeFileSync(releasesTokenFile, `${token}\n`)
    }
    const res = makeEnv({
      exampleFile: path.join(ROOT, 'deploy', '.env.example'),
      sourceEnvFile: source,
      outFile: out,
      qaHome: path.join(dir, 'qa'),
      toolDir: ROOT,
      releasesTokenFile
    })
    return { out, env: parseEnv(readFileSync(out, 'utf8')), res, dir }
  }

  test('generated env: fresh secrets, only MODEL_API_KEY copied, release token empty, 0600, passes checkEnv', () => {
    const { out, env, res } = generate()
    assert.equal(env.get('MODEL_API_KEY'), SOURCE_VALUE)
    assert.notEqual(env.get('SESSION_SECRET'), 'shared-session-secret-not-to-copy-000000')
    assert.equal(env.get('SESSION_SECRET').length, 64)
    assert.notEqual(env.get('SESSION_SECRET'), env.get('SEAT_local_SECRET'))
    assert.equal(env.get('TRACY_RELEASES_GITHUB_TOKEN'), '')
    assert.equal(env.get('DEMO_JOOMLART_SSH_KEY'), '')
    assert.equal(statSync(out).mode & 0o777, 0o600)
    assert.ok(!JSON.stringify(res).includes(SOURCE_VALUE), 'the result names keys, never values')
    assert.deepEqual(checkEnv(env), [])
  })

  test('a release token reaches the env only through the named token file', () => {
    assert.equal(
      generate({ token: 'github_pat_readonly_example' }).env.get('TRACY_RELEASES_GITHUB_TOKEN'),
      'github_pat_readonly_example'
    )
  })

  test('make-env refuses to rotate an existing file, and its CLI prints no value', () => {
    const { out, dir } = generate()
    assert.throws(
      () =>
        makeEnv({
          exampleFile: path.join(ROOT, 'deploy', '.env.example'),
          sourceEnvFile: null,
          outFile: out,
          qaHome: '/q',
          toolDir: '/t'
        }),
      /refusing/
    )
    const r = spawnSync(
      process.execPath,
      [
        path.join(ROOT, 'scripts/qa/stand/make-env.mjs'),
        '--src',
        ROOT,
        '--source-env',
        path.join(dir, 'shared.env'),
        '--out',
        path.join(dir, 'cli.env'),
        '--qa-home',
        path.join(dir, 'qa'),
        '--tool-dir',
        ROOT
      ],
      { encoding: 'utf8' }
    )
    assert.equal(r.status, 0, r.stderr)
    assert.ok(!r.stdout.includes(SOURCE_VALUE) && !r.stderr.includes(SOURCE_VALUE))
  })

  test('missing TRACY_SITE_NETWORK is red and names the key', () => {
    const { env } = generate()
    env.delete('TRACY_SITE_NETWORK')
    const keys = checkEnv(env).map((p) => p.key)
    assert.deepEqual(keys, ['TRACY_SITE_NETWORK'])
  })

  test('a filled DEMO_JOOMLART_SSH_KEY is red', () => {
    const { env } = generate()
    env.set('DEMO_JOOMLART_SSH_KEY', '/Users/x/.ssh/id')
    assert.deepEqual(
      checkEnv(env).map((p) => p.key),
      ['DEMO_JOOMLART_SSH_KEY']
    )
  })

  test('the tree’s own readConfig accepts the generated env, and names a broken key', async () => {
    const { env } = generate()
    assert.deepEqual(await checkReadConfig(ROOT, env), [])
    env.set('BETA_GATE', 'maybe')
    const [p] = await checkReadConfig(ROOT, env)
    assert.equal(p.key, 'BETA_GATE')
  })

  test('checkCompose: internal tracy network, ports, egress proxy, absolute QA env_file', () => {
    const { env } = generate()
    const home = env.get('QA_HOME')
    const svcEnv = { QA_HOME: home, TRACY_SITE_NETWORK: QA.siteNetwork, TRACY_SITE_DNS: QA.siteDns }
    const port = (pub, target) => ({ host_ip: '127.0.0.1', published: pub, target: Number(target) })
    const good = {
      name: 'tracy-qa',
      services: {
        postgres: { image: 'postgres:16-alpine', ports: [port('36730', 5432)] },
        minio: { image: 'm', ports: [port('36740', 9000)] },
        dns: { image: 'd', command: ['-k', '--no-resolv', '--address=/qa.tracy.test/10.91.36.10'] },
        'tracy-web': { image: 'tracy/web:qa', ports: [port('36081', 36080)], environment: { ...svcEnv } },
        'tracy-host': { image: 'tracy/host:qa', ports: [port('36720', 36720)], environment: { ...svcEnv } },
        'docker-proxy': { image: 'h', container_name: 'tracy-qa-docker-proxy' },
        'tracy-dsh': {
          image: 'tracy/dsh:qa',
          container_name: 'tracy-qa-dsh',
          ports: [port('36700', 8080)],
          environment: { HTTPS_PROXY: 'http://qa-egress:3128', NODE_USE_ENV_PROXY: '1' }
        },
        'qa-egress': { image: 'node:24-alpine', networks: { default: {}, egress: {} } }
      },
      networks: {
        tracy: { name: 'tracy-qa_tracy', internal: true, ipam: { config: [{ subnet: '10.91.36.0/24' }] } },
        default: { ipam: { config: [{ subnet: '10.233.36.0/24' }] } },
        egress: { ipam: { config: [{ subnet: '10.233.37.0/24' }] } },
        'docker-api': { internal: true, ipam: { config: [{ subnet: '10.233.38.0/24' }] } }
      }
    }
    assert.deepEqual(checkCompose(good, env), [])
    const bad = structuredClone(good)
    bad.networks.tracy.internal = false
    bad.services['tracy-web'].environment.QA_HOME = undefined
    bad.services.dns.command.push('--server=1.1.1.1')
    delete bad.services['qa-egress']
    assert.deepEqual(
      checkCompose(bad, env)
        .map((p) => p.key)
        .sort(),
      ['networks.tracy.internal', 'services.dns.command', 'services.qa-egress', 'services.tracy-web.env_file']
    )
  })
})

// ---------------------------------------------------------------------------------------------
describe('G7.4 manifest and the rebuild decision', () => {
  const base = () => ({
    sourceSha: 'T'.repeat(40),
    compose: { postgres: 'h1', 'tracy-web': 'h2' },
    baseImages: { postgres: 'sha256:pg1' },
    webDefaults: { wordpress: 'tracy/web-wordpress:a', joomla: 'tracy/web-joomla:b' },
    migrations: ['001.sql', '002.sql'],
    netfilterHash: nf.rulesetHash(),
    toolSha: 'tool1'
  })
  const cases = [
    ['compose hash only', (a) => (a.compose['tracy-web'] = 'other'), 'compose'],
    ['base image digest only', (a) => (a.baseImages.postgres = 'sha256:pg2'), 'baseImages'],
    ['one migration missing', (a) => a.migrations.pop(), 'migrations'],
    ['netfilter drifted', (a) => (a.netfilterHash = 'x'), 'netfilterHash']
  ]
  for (const [name, mutate, field] of cases) {
    test(`actual ≠ desired when ${name}`, () => {
      const a = base()
      mutate(a)
      assert.deepEqual(decideRebuild(base(), a), { rebuild: true, reasons: [field] })
    })
  }
  test('equal manifests: no rebuild', () =>
    assert.deepEqual(decideRebuild(base(), base()), { rebuild: false, reasons: [] }))
  test('build red last night, no new commit tonight: still rebuilds', () => {
    // Last night T was the target and the build failed, so the stand still runs B. Tonight the
    // target is the same T (nothing merged): the decision reads the stand, not the PR list.
    const stand = { ...base(), sourceSha: 'B'.repeat(40) }
    assert.deepEqual(decideRebuild(base(), stand).reasons, ['sourceSha'])
  })

  test('desired() and actual() read Docker through the docker on PATH and agree on a matching stand', () => {
    const T = 'c'.repeat(40)
    const cfg = {
      services: {
        postgres: { image: 'postgres:16-alpine' },
        'tracy-web': { image: 'tracy/web:qa' },
        'tracy-host': { image: 'tracy/host:qa' },
        'tracy-dsh': { image: 'tracy/dsh:qa' }
      }
    }
    const ps = [
      'postgres\th1\tsha256:pg\tc-pg',
      'tracy-web\th2\tsha256:w\tc-w',
      'tracy-host\th3\tsha256:h\tc-h',
      'tracy-dsh\th4\tsha256:d\tc-d'
    ].join('\n')
    const ruleText = `${nf.RULES.join('\n')}\n--- DOCKER-USER\n-N DOCKER-USER\n${nf.JUMPS.join('\n')}\n-A DOCKER-USER -j RETURN\n`
    const migrations = readdirMigrations()
    const fake = fakeDocker([
      { match: ' config --hash \\*$', stdout: 'postgres h1\ntracy-web h2\ntracy-host h3\ntracy-dsh h4\n' },
      { match: ' config --format json$', stdout: JSON.stringify(cfg) },
      { match: '^ps -a --filter label=com.docker.compose.project=tracy-qa', stdout: ps },
      { match: '^inspect --format \\{\\{.Image\\}\\} c-pg$', stdout: 'sha256:pg\n' },
      { match: '^inspect --format \\{\\{.Image\\}\\} c-(w|h|d)$', stdout: 'sha256:app\n' },
      {
        match: '^image inspect --format \\{\\{index .Config.Labels "tracy.commit"\\}\\} sha256:app$',
        stdout: `${T}\n`
      },
      { match: '^image inspect --format \\{\\{.Id\\}\\} postgres:16-alpine$', stdout: 'sha256:pg\n' },
      { match: '^image inspect --format \\{\\{.Id\\}\\} tracy/web-', stdout: 'sha256:webimg\n' },
      { match: '^exec tracy-qa-postgres-1 psql', stdout: `${migrations.join('\n')}\n` },
      { match: '^run --rm --network host', stdout: ruleText }
    ])
    const opts = { srcDir: ROOT, envFile: '/qa/.env', docker: fake.runner() }
    const want = desired({ ...opts, sourceSha: T, toolSha: 'tool1' })
    const have = actual({ ...opts, previous: { toolSha: 'tool1' } })
    assert.deepEqual(diff(want, have), [])
    assert.equal(have.sourceSha, T)
    // Every Docker call was read-only or the labelled netfilter helper.
    for (const c of fake.calls())
      assert.ok(['compose', 'ps', 'inspect', 'image', 'exec', 'run'].includes(c[0]), c.join(' '))
  })
})

function readdirMigrations() {
  return execFileSync('ls', [path.join(ROOT, 'apps/tracy-web/src/db/migrations')], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

// ---------------------------------------------------------------------------------------------
describe('G7.5 netfilter, snapshot, restore', () => {
  test('apply runs the §3.3 rules in order in one labelled host-network helper', () => {
    const fake = fakeDocker()
    assert.equal(nf.apply({ docker: fake.runner(), runId: '20261003a' }).ok, true)
    const [call] = fake.calls()
    assert.deepEqual(call.slice(0, 11), [
      'run',
      '--rm',
      '--network',
      'host',
      '--cap-add',
      'NET_ADMIN',
      '--cap-add',
      'NET_RAW',
      '--label',
      'qa.run=20261003a',
      '--entrypoint'
    ])
    const script = call.at(-1).split('\n')
    assert.deepEqual(
      script.filter((l) => l.startsWith('iptables ') && !l.includes('2>/dev/null')),
      [
        'iptables -F QA-EGRESS',
        'iptables -A QA-EGRESS -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN',
        'iptables -A QA-EGRESS -s 10.241.0.0/16 -d 10.241.0.0/16 -j RETURN',
        'iptables -A QA-EGRESS -s 10.233.37.0/24 -d 10.233.37.0/24 -j RETURN',
        'iptables -A QA-EGRESS -j REJECT --reject-with icmp-port-unreachable',
        'iptables -I DOCKER-USER 1 -s 10.241.0.0/16 -j QA-EGRESS',
        'iptables -I DOCKER-USER 1 -s 10.233.37.0/24 -j QA-EGRESS'
      ]
    )
  })

  const full = `${nf.RULES.join('\n')}\n--- DOCKER-USER\n-N DOCKER-USER\n${nf.JUMPS.join('\n')}\n-A DOCKER-USER -j RETURN\n`
  test('verify is green on the full ruleset', () => {
    const fake = fakeDocker([{ match: '^run ', stdout: full }])
    const r = nf.verify({ docker: fake.runner() })
    assert.equal(r.ok, true)
    assert.equal(r.hash, nf.rulesetHash())
  })
  for (const dropped of [nf.RULES[3], nf.JUMPS[1]]) {
    test(`verify is red and names the rule when one is missing: ${dropped}`, () => {
      const fake = fakeDocker([{ match: '^run ', stdout: full.replace(`${dropped}\n`, '') }])
      const r = nf.verify({ docker: fake.runner() })
      assert.equal(r.ok, false)
      assert.ok(
        r.missing.some((m) => m.startsWith(dropped)),
        JSON.stringify(r.missing)
      )
      assert.notEqual(r.hash, nf.rulesetHash())
    })
  }

  test('snapshot preconditions: exactly the three fixed sites, no running job, no open ledger row', () => {
    assert.deepEqual(preconditions({ siteLabels: [...QA.fixedSites], jobsRunning: 0, openLedgerRows: 0 }), [])
    assert.equal(
      preconditions({ siteLabels: [...QA.fixedSites, 'qa-tmp'], jobsRunning: 1, openLedgerRows: 2 }).length,
      3
    )
  })

  test('the snapshot manifest lists <label>_app for an EmDash site, from its compose file', () => {
    const fake = fakeDocker([
      { match: 'qa-fixedem config --volumes$|qa-fixedem -f \\S+ config --volumes$', stdout: 'app\n' },
      { match: 'config --volumes$', stdout: 'db\n' },
      { match: '^image inspect', stdout: 'sha256:img\n' },
      { match: '^exec', stdout: '051-beta-login-job-lang.sql\n' }
    ])
    const home = '/q'
    const m = planSnapshot({
      qaHome: home,
      siteLabels: ['qa-fixedwp', 'qa-fixedem'],
      sourceSha: 'X',
      runId: 'r1',
      docker: fake.runner()
    })
    const names = m.volumes.map((v) => v.name)
    assert.deepEqual(names, [
      'tracy-qa_tracy-minio',
      'tracy-qa_tracy-host-jobs',
      'qa-fixedwp_db',
      'qa-fixedem_app'
    ])
    assert.equal(m.pgDump.volume, 'tracy-qa_tracy-pg')
    assert.deepEqual(
      m.dirs.map((d) => d.path),
      [
        '/q/sites/qa-fixedwp',
        '/q/private/qa-fixedwp',
        '/q/sites/qa-fixedem',
        '/q/private/qa-fixedem',
        '/q/dsh-home'
      ]
    )
    assert.equal(m.lastMigration, '051-beta-login-job-lang.sql')
  })

  const manifest = {
    runId: 'r1',
    pgDump: { volume: 'tracy-qa_tracy-pg', file: 'postgres.dump' },
    volumes: [
      { name: 'tracy-qa_tracy-minio', file: 'a.tar' },
      { name: 'qa-fixedem_app', file: 'b.tar' }
    ],
    dirs: [],
    sites: [{ label: 'qa-fixedem' }],
    standImages: { 'tracy/web': 'sha256:w' },
    files: {}
  }
  test('restore plan: Q21 adds the volumes of a site created after the snapshot', () => {
    const fake = fakeDocker([{ match: 'label=com.docker.compose.project=qa-tmp1', stdout: 'qa-tmp1_db\n' }])
    const plan = planRestore({
      manifest,
      dbLabels: ['qa-fixedem', 'qa-tmp1'],
      ledgerLabels: [],
      docker: fake.runner()
    })
    assert.deepEqual(plan.deleteVolumes, [
      'tracy-qa_tracy-pg',
      'tracy-qa_tracy-minio',
      'qa-fixedem_app',
      'qa-tmp1_db'
    ])
    assert.deepEqual(plan.extraSites, ['qa-tmp1'])
  })

  test('restore refuses to delete a volume outside the manifest, before touching anything', async () => {
    const fake = fakeDocker([{ match: '^image inspect', stdout: 'sha256:w\n' }])
    await assert.rejects(
      restore({
        manifest,
        snapshotDir: fresh('snap'),
        qaHome: '/q',
        srcDir: ROOT,
        envFile: '/q/.env',
        runId: 'r1',
        dbLabels: ['qa-fixedem'],
        ledgerLabels: [],
        extraVolumes: ['leetest_db'],
        docker: fake.runner(),
        log: () => {}
      }),
      /refusing to delete volume leetest_db/
    )
    assert.ok(
      fake.calls().every((c) => ['image', 'volume'].includes(c[0]) && !c.includes('rm')),
      JSON.stringify(fake.calls())
    )
  })

  test('restore refuses when the tag does not hold the snapshot’s images', async () => {
    const fake = fakeDocker([{ match: '^image inspect', stdout: 'sha256:other\n' }])
    await assert.rejects(
      restore({
        manifest,
        snapshotDir: fresh('snap'),
        qaHome: '/q',
        srcDir: ROOT,
        envFile: '/q/.env',
        runId: 'r1',
        dbLabels: [],
        ledgerLabels: [],
        imageTag: 'qa-prev',
        docker: fake.runner(),
        log: () => {}
      }),
      /tracy\/web:qa-prev is not the image/
    )
  })
})
