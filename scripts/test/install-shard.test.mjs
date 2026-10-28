// install-shard.sh --dry-run on any machine (a Mac included): the steps in order, the inputs it
// refuses, and that no secret it is given ever reaches its output. Tasks 13-16 add to this file.
//   node --test scripts/test/install-shard.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { R, bash, fakeAge, script, tempDir, writeFiles } from './_shard.mjs'

// Every secret input carries SECRETMARKER; no line of output may contain one.
const SECRET_INPUTS = {
  GHCR_TOKEN: 'ghp_SECRETMARKER_ghcr',
  CF_TUNNEL_TOKEN: 'SECRETMARKER_tunnel',
  MODEL_API_KEY: 'sk-SECRETMARKER-model',
  RESEND_KEY: 're_SECRETMARKER_resend',
  R2_ARTIFACT_ACCESS_KEY: 'SECRETMARKER-artifact-id',
  R2_ARTIFACT_SECRET_KEY: 'SECRETMARKER-artifact-secret',
  R2_BACKUP_ACCESS_KEY: 'SECRETMARKER-backup-id',
  R2_BACKUP_SECRET_KEY: 'SECRETMARKER-backup-secret',
  TRACY_RELEASES_GITHUB_TOKEN: 'github_pat_SECRETMARKER'
}
const INPUTS = {
  TRACY_SHARD_NAME: 's9',
  TRACY_MASTER_ORIGIN: 'https://cowork.tracy.test',
  TRACY_SITE_DOMAIN: 'tracy.test',
  TRACY_APP_TAG: 'app-0123456789ab',
  TRACY_DSH_TAG: '2026-10-15-abcdef12',
  GHCR_USER: 'tracy-s9',
  CF_TUNNEL_ID: '01234567-89ab-cdef-0123-456789abcdef',
  MAIL_FROM: 'Tracy <hello@tracy.test>',
  R2_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
  R2_ARTIFACT_BUCKET: 'tracy-s9-artifacts',
  R2_BACKUP_BUCKET: 'tracy-s9-backup',
  BACKUP_AGE_RECIPIENT: fakeAge,
  OPERATOR_EMAILS: 'anh@example.com,em@example.com',
  SSH_ALLOW_FROM: '203.0.113.7/32',
  GITHUB_APP_ID: '1234567',
  GITHUB_APP_PRIVATE_KEY_FILE: '/root/s9-github-app.pem',
  GITHUB_ORG: 'tracy-sites-s9',
  ...SECRET_INPUTS
}
const KEPT_SECRETS =
  [
    'SHARD_SECRET',
    'HOST_SECRET',
    'SESSION_SECRET',
    'API_KEY_PEPPER',
    'MCP_TRACY_ACTOR_SECRET',
    'POSTGRES_PASSWORD',
    'SEAT_PLAN_KEK',
    'GITHUB_WEBHOOK_SECRET'
  ]
    .map((k) => `${k}=KEPTMARKER_${k.toLowerCase()}`)
    .join('\n') + '\n'

// The registry inputs a developer's own shell may carry (AWS_REGION, ...): never read from there.
const REGISTRY_INPUT_KEYS = [
  'REGISTRY_AUTH',
  'TRACY_IMAGE_PREFIX',
  'ECR_REGISTRY',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY'
]
const ECR = '123456789012.dkr.ecr.us-east-1.amazonaws.com'
const { GHCR_USER: _ghcrUser, GHCR_TOKEN: _ghcrTok, ...NO_GHCR } = INPUTS
const ECR_INPUTS = {
  ...NO_GHCR,
  REGISTRY_AUTH: 'ecr',
  ECR_REGISTRY: ECR,
  TRACY_IMAGE_PREFIX: `${ECR}/lab3-image/tracy-ai`,
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'AKIASECRETMARKERPULL',
  AWS_SECRET_ACCESS_KEY: 'SECRETMARKER-aws-pull'
}

function install(args = [], { inputs = INPUTS, secretsFile = null } = {}) {
  const dir = tempDir('install-shard-')
  const lines = Object.entries(inputs).map(([k, v]) => `${k}=${v}`)
  writeFiles(dir, { 'inputs.env': `${lines.join('\n')}\n`, 'etc/.keep': '' })
  if (secretsFile) writeFiles(dir, { 'etc/shard-secrets.env': secretsFile })
  // Inputs come from the file only: blank every one of them in this process's environment.
  const blank = Object.fromEntries(
    [...Object.keys(INPUTS), ...Object.keys(inputs), ...REGISTRY_INPUT_KEYS].map((k) => [k, ''])
  )
  const run = bash(
    [script('install-shard.sh'), '--inputs', path.join(dir, 'inputs.env'), '--dry-run', ...args],
    {
      env: { ...blank, REPO_TOKEN: '', TRACY_ETC: path.join(dir, 'etc') }
    }
  )
  for (const marker of ['SECRETMARKER', 'KEPTMARKER'])
    assert.ok(!run.stdout.includes(marker) && !run.stderr.includes(marker), `${marker} leaked`)
  return run
}

// The lines --dry-run prints for one file it would write (`    > <path> (mode …)` then `      | …`).
function printedFile(out, suffix) {
  const lines = out.split('\n')
  const at = lines.findIndex((l) => l.trimStart().startsWith('> ') && l.includes(suffix))
  assert.ok(at >= 0, `${suffix} is written`)
  const body = []
  for (const l of lines.slice(at + 1)) {
    if (!l.startsWith('      | ')) break
    body.push(l.slice(8))
  }
  return body
}

test('preflight runs on any machine in --dry-run and shows inputs as set / not set', () => {
  const run = install()
  assert.equal(run.status, 0, run.stderr)
  assert.match(
    run.stdout,
    /==> 0\. preflight · shard s9 · origin https:\/\/s9\.tracy\.test · phase beta · source image · dry-run 1/
  )
  assert.match(run.stdout, /inputs: GHCR_TOKEN set, CF_TUNNEL_TOKEN set, MODEL_API_KEY set, RESEND_KEY set/)
  assert.match(run.stdout, /firewall: ufw .* iptables-persistent .* mode iptables/)
})

test('missing inputs are named, never shown, and stop with exit 2', () => {
  const { GHCR_TOKEN: _ghcrToken, CF_TUNNEL_ID: _tunnelId, ...rest } = INPUTS
  const run = install([], { inputs: rest })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /missing inputs: GHCR_TOKEN CF_TUNNEL_ID/)
})

test("a shard name outside the contract's ^[a-z][a-z0-9]{0,15}$ is refused", () => {
  for (const name of ['s_9', 's-9', 'S9', '9s', `s${'1'.repeat(16)}`])
    assert.equal(install([], { inputs: { ...INPUTS, TRACY_SHARD_NAME: name } }).status, 2, name)
  const longest = `s${'1'.repeat(15)}`
  const run = install([], {
    inputs: { ...INPUTS, TRACY_SHARD_NAME: longest, GITHUB_ORG: `tracy-sites-${longest}` }
  })
  assert.equal(run.status, 0, run.stderr)
})

test('SSH_ALLOW_FROM is required, an IPv4 address or CIDR, and never the whole internet (contract section 9)', () => {
  const { SSH_ALLOW_FROM: _sshAllowFrom, ...rest } = INPUTS
  const missing = install([], { inputs: rest })
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /missing inputs: SSH_ALLOW_FROM/)
  for (const bad of ['0.0.0.0/0', 'bastion.example.com', '10.0.0.0/33'])
    assert.equal(install([], { inputs: { ...INPUTS, SSH_ALLOW_FROM: bad } }).status, 2, bad)
})

test("this shard's own GitHub App: three inputs, required, and the org is tracy-sites-<name>", () => {
  const { GITHUB_ORG: _githubOrg, ...rest } = INPUTS
  const missing = install([], { inputs: rest })
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /missing inputs: GITHUB_ORG/)
  const shared = install([], { inputs: { ...INPUTS, GITHUB_ORG: 'TracyHQ' } })
  assert.equal(shared.status, 2)
  assert.match(shared.stderr, /GITHUB_ORG must be tracy-sites-s9/)
  const webhook = install([], { inputs: { ...INPUTS, GITHUB_WEBHOOK_SECRET: 'SECRETMARKER_webhook' } })
  assert.equal(webhook.status, 2, 'the installer generates the webhook secret; it is not an input')
  assert.match(webhook.stderr, /unknown key GITHUB_WEBHOOK_SECRET/)
})

test('SHARD_REGION is asia, america, europe or unknown (the default)', () => {
  assert.equal(install([], { inputs: { ...INPUTS, SHARD_REGION: 'mars' } }).status, 2)
  assert.equal(
    install([], { inputs: { ...INPUTS, SHARD_REGION: 'europe', SHARD_PROVIDER: 'vultr' } }).status,
    0
  )
})

test('an unknown key in the inputs file is refused', () => {
  const run = install([], { inputs: { ...INPUTS, CLOUDFLARE_TOKEN: 'x' } })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /unknown key CLOUDFLARE_TOKEN/)
})

test('a non-age backup recipient and an overlapping network prefix are refused', () => {
  assert.equal(install([], { inputs: { ...INPUTS, BACKUP_AGE_RECIPIENT: 'ssh-ed25519 AAAA' } }).status, 2)
  assert.equal(install([], { inputs: { ...INPUTS, TRACY_NETWORK_PREFIX: '10.200.0' } }).status, 2)
})

test('REPO_TOKEN switches the source to a checkout', () => {
  const run = install([], { inputs: { ...INPUTS, REPO_TOKEN: 'ghp_SECRETMARKER_repo', REPO_REF: 'develop' } })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /source git/)
})

test('--from-dir names a checkout-shaped directory on this VM, checked before anything runs (contract section 10)', () => {
  const src = writeFiles(tempDir('from-dir-'), {
    'deploy/scripts/sync-fleet-files.sh': '#!/usr/bin/env bash\n'
  })
  const run = install(['--from-dir', src])
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /source dir/)
  assert.equal(install(['--from-dir', path.join(src, 'missing')]).status, 2, 'not a directory')
  const empty = install(['--from-dir', tempDir('from-dir-empty-')])
  assert.equal(empty.status, 2)
  assert.match(empty.stderr, /has no deploy\/scripts\/sync-fleet-files\.sh/)
  assert.equal(install(['--from-dir', 'relative/tch']).status, 2, 'an absolute path only')
  const two = install(['--from-dir', src], { inputs: { ...INPUTS, REPO_TOKEN: 'ghp_SECRETMARKER_repo' } })
  assert.equal(two.status, 2, 'two sources')
  assert.match(two.stderr, /--from-dir and REPO_TOKEN/)
  assert.match(install(['--from-image']).stdout, /source image/, 'the explicit default')
})

test('TRACY_ETC is refused outside --dry-run', () => {
  const run = bash([script('install-shard.sh')], { env: { TRACY_ETC: tempDir('etc-') } })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /TRACY_ETC is for --dry-run tests only/)
})

test('step 1 writes the docker pools before docker starts, then installs docker and the tools', () => {
  const run = install()
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /==> 1\. docker engine, \/etc\/docker\/daemon\.json, packages/)
  const daemon = printedFile(run.stdout, '/etc/docker/daemon.json').join('\n')
  assert.match(daemon, /"base": "10\.200\.0\.0\/16"/)
  assert.match(daemon, /"base": "10\.201\.0\.0\/16"/)
  assert.match(
    run.stdout,
    /apt-get install -y -qq docker-ce docker-ce-cli containerd\.io docker-compose-plugin/
  )
  assert.match(run.stdout, /apt-get install -y -qq jq openssl age rclone chrony/)
})

test('step 2 generates the eight secrets of a new shard, never showing one', () => {
  const run = install()
  assert.match(run.stdout, /==> 2\. this shard's own secrets/)
  for (const k of [
    'SHARD_SECRET',
    'HOST_SECRET',
    'SESSION_SECRET',
    'API_KEY_PEPPER',
    'MCP_TRACY_ACTOR_SECRET',
    'POSTGRES_PASSWORD',
    'SEAT_PLAN_KEK',
    'GITHUB_WEBHOOK_SECRET'
  ])
    assert.match(run.stdout, new RegExp(`would add ${k} to `), k)
  assert.match(run.stdout, /keeping 0, generated: SHARD_SECRET HOST_SECRET SESSION_SECRET/)
  assert.match(run.stdout, /secrets\/mcp-actor-secret \(mode 0600\) <value set>/)
})

test('keeping 8: a re-run reuses every secret it generated before (Review Focus 4)', () => {
  const run = install([], { secretsFile: KEPT_SECRETS })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /keeping 8, generated: none/)
  assert.doesNotMatch(run.stdout, /would add /)
})

test('--force --rotate-webhook-secret mints GITHUB_WEBHOOK_SECRET alone; without --force it is refused', () => {
  const run = install(['--force', '--rotate-webhook-secret'], { secretsFile: KEPT_SECRETS })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /would replace GITHUB_WEBHOOK_SECRET in /)
  assert.match(run.stdout, /keeping 7, generated: GITHUB_WEBHOOK_SECRET/)
  assert.equal(install(['--rotate-webhook-secret']).status, 2)
})

test('a key line missing from an existing shard-secrets.env stops the run by name; only --force --rotate-webhook-secret adds GITHUB_WEBHOOK_SECRET back (contract section 9)', () => {
  const without = (key) =>
    KEPT_SECRETS.split('\n')
      .filter((l) => !l.startsWith(`${key}=`))
      .join('\n')
  for (const args of [[], ['--force']]) {
    const run = install(args, { secretsFile: without('SESSION_SECRET') })
    assert.equal(run.status, 1, args.join(' ') || '(no flag)')
    assert.match(run.stderr, /has no SESSION_SECRET line/)
    assert.doesNotMatch(run.stdout, /would add /)
  }
  const stillNo = install(['--force', '--rotate-webhook-secret'], { secretsFile: without('SESSION_SECRET') })
  assert.equal(stillNo.status, 1, 'the rotate flag covers the webhook secret only')
  const plain = install(['--force'], { secretsFile: without('GITHUB_WEBHOOK_SECRET') })
  assert.equal(plain.status, 1, '--force alone never mints')
  assert.match(plain.stderr, /has no GITHUB_WEBHOOK_SECRET line/)
  const rotated = install(['--force', '--rotate-webhook-secret'], {
    secretsFile: without('GITHUB_WEBHOOK_SECRET')
  })
  assert.equal(rotated.status, 0, rotated.stderr)
  assert.match(rotated.stdout, /would add GITHUB_WEBHOOK_SECRET to /)
  assert.match(rotated.stdout, /keeping 7, generated: GITHUB_WEBHOOK_SECRET/)
})

test('step 3 logs in on stdin, pulls the app tag and lifts the fleet files out of the tracy-host image', () => {
  const out = install().stdout
  assert.match(out, /==> 3\. ghcr login and the fleet files of app-0123456789ab \(image\)/)
  assert.deepEqual(
    printedFile(out, '/registry.env').filter((l) => !l.startsWith('#')),
    ['GHCR_USER=tracy-s9', 'GHCR_TOKEN=<set>']
  )
  assert.match(out, /docker login ghcr\.io -u tracy-s9 --password-stdin/)
  assert.match(out, /docker pull -q ghcr\.io\/tracyhq\/tracy-host:app-0123456789ab/)
  assert.match(
    out,
    /sync-fleet-files\.sh --from-image ghcr\.io\/tracyhq\/tracy-host:app-0123456789ab --dest \/opt\/tracy-fleet/
  )
})

test('TRACY_SOURCE_REPO picks the repository the checkout clones; only our two homes', () => {
  const run = install([], {
    inputs: {
      ...INPUTS,
      REPO_TOKEN: 'ghp_SECRETMARKER_repo',
      REPO_REF: 'develop',
      TRACY_SOURCE_REPO: 'TracyHQ/tracy'
    }
  })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /git clone .* --branch develop https:\/\/github\.com\/TracyHQ\/tracy /)
  const bad = install([], {
    inputs: { ...INPUTS, REPO_TOKEN: 'ghp_SECRETMARKER_repo', TRACY_SOURCE_REPO: 'someone/tracy' }
  })
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /TRACY_SOURCE_REPO/)
})

test('with REPO_TOKEN the files come from a sparse checkout, the token in no argv', () => {
  const out = install([], {
    inputs: { ...INPUTS, REPO_TOKEN: 'ghp_SECRETMARKER_repo', REPO_REF: 'develop' }
  }).stdout
  assert.match(
    out,
    /GIT_CONFIG_VALUE_0='AUTHORIZATION: bearer <REPO_TOKEN>' git clone .* --branch develop https:\/\/github\.com\/TracyHQ\/tch/
  )
  assert.match(
    out,
    /sparse-checkout set deploy packages\/fleet\/tracy-fleet-operation\/dsh .*vendor\/joomla\/joomlart-t4-skill apps\/tracy-web\/scripts/
  )
  assert.match(
    out,
    /sync-fleet-files\.sh --from-dir \/tmp\/install-shard\.dry-run\/tch --dest \/opt\/tracy-fleet/
  )
})

test('--from-dir: the fleet files come from that directory through its own sync-fleet-files.sh; no image is opened (contract section 10)', () => {
  const src = writeFiles(tempDir('from-dir-'), {
    'deploy/scripts/sync-fleet-files.sh': '#!/usr/bin/env bash\n'
  })
  const out = install(['--from-dir', src]).stdout
  assert.match(out, /==> 3\. ghcr login and the fleet files of app-0123456789ab \(dir\)/)
  assert.ok(
    out.includes(`bash ${src}/deploy/scripts/sync-fleet-files.sh --from-dir ${src} --dest /opt/tracy-fleet`),
    out
  )
  assert.doesNotMatch(out, /docker create --pull never/)
  assert.doesNotMatch(out, /git clone/)
  assert.match(
    out,
    /docker login ghcr\.io -u tracy-s9 --password-stdin/,
    'the stack images are still pulled from ghcr'
  )
})

test("steps 4-5: bootstrap.sh with this shard's network prefix, then the reserved ports", () => {
  const out = install().stdout
  assert.match(out, /env TRACY_NETWORK_PREFIX=10\.90\.0 bash \/opt\/tracy-fleet\/provision\/bootstrap\.sh/)
  assert.match(out, /docker network rm tracy_tracy/)
  assert.match(
    printedFile(out, '/etc/sysctl.d/90-tracy.conf').join('\n'),
    /net\.ipv4\.ip_local_reserved_ports = 51700-51749,52000-52999/
  )
})

test('firewall keeps 51720 open to the docker networks, ssh to the bastion, then drops (Review Focus 5)', () => {
  const out = install().stdout
  const accepts = [
    /iptables -A TRACY-INPUT -p tcp --dport 51720 -s 10\.200\.0\.0\/15 -j ACCEPT/,
    /iptables -A TRACY-INPUT -p tcp --dport 51720 -s 10\.90\.0\.0\/24 -j ACCEPT/,
    /iptables -A TRACY-INPUT -p tcp --dport 22 -s 203\.0\.113\.7\/32 -j ACCEPT/,
    /iptables -A TRACY-INPUT -p udp --sport 67 --dport 68 -j ACCEPT/
  ].map((re) => out.search(re))
  const drop = out.search(/iptables -A TRACY-INPUT -j DROP/)
  assert.ok(
    accepts.every((i) => i > 0),
    `${accepts}`
  )
  assert.ok(drop > Math.max(...accepts), 'every ACCEPT comes before the DROP')
  assert.match(out, /iptables -C INPUT -j TRACY-INPUT 2>\/dev\/null \|\| iptables -I INPUT 1 -j TRACY-INPUT/)
  assert.match(out, /netfilter-persistent save/)
  assert.doesNotMatch(out, /ufw (enable|default|allow)/)
})

test("FIREWALL_MODE=cloud writes no host rule and says what the provider's firewall must do", () => {
  const out = install([], { inputs: { ...INPUTS, FIREWALL_MODE: 'cloud' } }).stdout
  assert.match(out, /no host rules: the provider's firewall must open ONLY tcp\/22/)
  assert.doesNotMatch(out, /iptables -A TRACY-INPUT/)
})

test('step 7 turns chrony on', () => {
  assert.match(install().stdout, /==> 7\. chrony[\s\S]*systemctl enable --now chrony/)
})

test('step 8 writes host-dsh.env, then runs host-dsh-init.sh with the actor FILE and the shard origin', () => {
  const out = install().stdout
  const dshEnv = printedFile(out, '/host-dsh.env')
  for (const line of [
    'DSH_IMAGE_TAG=2026-10-15-abcdef12',
    'HOST_AGENT_HOSTNAME=s9-agent.tracy.test',
    'HOST_PRIVATE_ROOT=/srv/tracy-private',
    'TRACY_SITE_DOMAIN=tracy.test',
    'MODEL_API_KEY=<set>',
    'TRACY_RELEASES_GITHUB_TOKEN=<set>'
  ])
    assert.ok(dshEnv.includes(line), line)
  const init = out.search(
    /host-dsh-init\.sh s9 --image-tag 2026-10-15-abcdef12 --hostname s9-agent\.tracy\.test --actor-secret-file \S+\/secrets\/mcp-actor-secret --tracy-origin https:\/\/s9\.tracy\.test --seat-secret-out \/tmp\/install-shard\.dry-run\/seat\.secret/
  )
  assert.ok(init > out.indexOf('/host-dsh.env (mode 0600)'), 'the env file exists before init runs')
  assert.match(
    out,
    /==> 9\. MCP_SEAT_SECRET from \/tmp\/install-shard\.dry-run\/seat\.secret/,
    'step 9 reads the file, not dsh-passwords.env'
  )
  assert.doesNotMatch(out, /dsh-passwords\.env/)
})

test('step 9: tracy-web.env holds every line the silent failures of may-dev.md need, secrets masked', () => {
  const env = printedFile(install().stdout, '/tracy-web.env')
  for (const line of [
    'TRACY_ORIGIN=https://s9.tracy.test',
    'SITE_DOMAIN=tracy.test',
    'SESSION_DOMAIN=tracy.test',
    'DOCS_ORIGIN=https://docs.tracy.test',
    'TRACY_ENVIRONMENT=dev',
    'TRACY_DEPLOYMENT_ROLE=shard',
    'MASTER_ORIGIN=https://cowork.tracy.test',
    'SHARD_SECRET=<set>',
    'SESSION_COOKIE_NAME=tracy_sess_s9',
    'TRACY_TUNNEL=catch-all',
    'BETA_GATE=off',
    'HOST_NAME=s9',
    'HOSTS=s9',
    'HOST_s9_ORIGIN=http://host.docker.internal:51720',
    'HOST_s9_DSH_ORIGIN=http://tracy-dsh:8080',
    'HOST_s9_SECRET=<set>',
    'SEAT_s9_SECRET=<set>',
    'TRACY_DSH_HOME=/srv/tracy/host-dsh/home',
    'DATABASE_URL=<set>',
    'TRACY_EGRESS_FENCE=on',
    'MAIL=<set>',
    'MAIL_FROM=Tracy <hello@tracy.test>',
    'GITHUB_APP_ID=1234567',
    'GITHUB_APP_PRIVATE_KEY=<set>',
    'GITHUB_WEBHOOK_SECRET=<set>',
    'GITHUB_ORG=tracy-sites-s9'
  ])
    assert.ok(env.includes(line), line)
  assert.ok(!env.some((l) => l.startsWith('SITE_ADDRESS_PREFIX=')), 'no prefix in beta')
  assert.equal(
    env.filter((l) => l.startsWith('GITHUB_')).length,
    4,
    'each GitHub key written once (contract section 9)'
  )
})

test('step 9: tracy-web.env carries MINIO_PASSWORD, which compose requires on a server although no MinIO runs', () => {
  const run = install()
  assert.equal(run.status, 0, run.stderr)
  const env = printedFile(run.stdout, '/tracy-web.env')
  // The dry-run listing masks every *PASSWORD value, so the line is checked as <set>.
  assert.equal(env.filter((l) => l.startsWith('MINIO_PASSWORD=')).length, 1, 'written once')
  assert.ok(env.includes('MINIO_PASSWORD=<set>'), 'a value is present')
  // A fixed non-secret literal, not one of the eight generated secrets (step 2 still names eight).
  assert.doesNotMatch(run.stdout, /would add MINIO_PASSWORD to /)
  const steps = readFileSync(path.join(R, 'deploy/scripts/install-shard-steps.sh'), 'utf8')
  assert.match(steps, /^MINIO_PASSWORD=no-minio-runs-on-a-shard$/m)
  assert.doesNotMatch(steps, /^SECRET_SPECS=.*MINIO_PASSWORD/m)
})

test('--phase g1: no SESSION_DOMAIN, and site labels prefixed <name>t- (amendment 8)', () => {
  const env = printedFile(install(['--phase', 'g1']).stdout, '/tracy-web.env')
  assert.ok(!env.some((l) => l.startsWith('SESSION_DOMAIN=')))
  assert.ok(env.includes('SITE_ADDRESS_PREFIX=s9t-'))
})

test('every name step 9 writes is classified in shard.env.example', () => {
  const template = readFileSync(path.join(R, 'deploy/shard.env.example'), 'utf8')
  const keys = printedFile(install().stdout, '/tracy-web.env')
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => l.slice(0, l.indexOf('=')).replace(/^(HOST|SEAT)_s9_/, '$1_s1_'))
  assert.ok(keys.length >= 40, `${keys.length} keys`)
  const missing = keys.filter(
    (k) => !new RegExp(`(^|[^A-Za-z0-9_])${k}([^A-Za-z0-9_]|$)`, 'm').test(template)
  )
  assert.deepEqual(missing, [])
})

test('step 9 checks the new file for forbidden variables at once', () => {
  assert.match(install().stdout, /shard-env-check\.sh \S+\/tracy-web\.env/)
})

test('steps 10-11: dsh, then the stack, then the staff seats, in that order', () => {
  const out = install().stdout
  const dsh = out.search(/deploy-host-dsh\.sh --tag 2026-10-15-abcdef12/)
  const stack = out.search(
    /deploy-tracy-stack\.sh --tag app-0123456789ab --services postgres,tracy-web,tracy-host/
  )
  const seed = out.search(/node scripts\/seed-admin-seats\.mjs anh@example\.com,em@example\.com/)
  assert.ok(dsh > 0 && stack > dsh && seed > stack, `${dsh} ${stack} ${seed}`)
})

test('seed-admin-seats.mjs absent from the image: copied from a checkout-shaped source, skipped at --phase g1, fatal at beta', () => {
  const beta = install().stdout
  assert.match(beta, /docker exec <tracy-web> test -f scripts\/seed-admin-seats\.mjs/)
  assert.match(beta, /absent everywhere: stop/)
  assert.doesNotMatch(beta, /skips the seed/)
  const g1 = install(['--phase', 'g1']).stdout
  assert.match(g1, /absent everywhere: --phase g1 skips the seed/)
  assert.doesNotMatch(g1, /absent everywhere: stop/)
  const src = writeFiles(tempDir('from-dir-'), {
    'deploy/scripts/sync-fleet-files.sh': '#!/usr/bin/env bash\n'
  })
  const dir = install(['--from-dir', src, '--phase', 'g1']).stdout
  assert.ok(
    dir.includes(`absent in the image: docker cp ${src}/apps/tracy-web/scripts/seed-admin-seats.mjs`),
    dir
  )
})

test('the whole run: steps 0 to 17, in order, then done', () => {
  const run = install()
  assert.equal(run.status, 0, run.stderr)
  const steps = [...run.stdout.matchAll(/^==> (\d+)\. /gm)].map((m) => Number(m[1]))
  assert.deepEqual(
    steps,
    Array.from({ length: 18 }, (_, i) => i)
  )
  assert.match(run.stdout, /==> done: shard s9 at https:\/\/s9\.tracy\.test/)
})

test('step 12: nginx is tested, started alone with --no-deps, then proven to reach this tracy-web', () => {
  const out = install().stdout
  assert.match(out, /compose\.shard\.yml run --rm --no-deps -T nginx nginx -t/)
  assert.match(out, /compose\.shard\.yml up -d --no-deps nginx/)
  assert.match(out, /curl -H 'Host: s9\.tracy\.test' http:\/\/127\.0\.0\.1\/api\/config/)
})

test('step 13 builds the default site images, or says it was skipped', () => {
  assert.match(install().stdout, /env DEFAULTS_ONLY=1 bash \/opt\/tracy-fleet\/web\/build\.sh/)
  assert.match(install(['--skip-web-images']).stdout, /--skip-web-images: skipped/)
})

test('step 14 installs cloudflared with the token masked', () => {
  assert.match(install().stdout, /cloudflared service install <CF_TUNNEL_TOKEN>/)
})

test('step 15 writes backup-r2.env and shard-install.env, then turns the three timers on', () => {
  const out = install().stdout
  const backup = printedFile(out, '/backup-r2.env')
  for (const line of [
    'R2_BACKUP_BUCKET=tracy-s9-backup',
    'R2_BACKUP_ACCESS_KEY=<set>',
    'R2_BACKUP_SECRET_KEY=<set>',
    `BACKUP_AGE_RECIPIENT=${fakeAge}`,
    'TRACY_SHARD_NAME=s9'
  ])
    assert.ok(backup.includes(line), line)
  const record = printedFile(out, '/shard-install.env')
  assert.ok(record.includes('FIREWALL_MODE=iptables') && record.includes('PHASE=beta'))
  assert.match(
    out,
    /systemctl enable --now tracy-heartbeat\.timer tracy-updater\.timer tracy-backup-postgres\.timer/
  )
})

test('steps 16-17: both checks, and a registration with the /ops Add values and the env block, secret not printed', () => {
  const out = install().stdout
  assert.match(out, /check-server\.sh/)
  assert.match(out, /check-shard\.sh --before-registration/)
  const reg = printedFile(out, '/root/tracy-shard-s9-registration.txt')
  const tunnel = '01234567-89ab-cdef-0123-456789abcdef'
  for (const line of [
    'FORM_NAME=s9',
    'FORM_ORIGIN=https://s9.tracy.test',
    'FORM_SECRET=<set>',
    `FORM_TUNNEL_ID=${tunnel}`,
    'FORM_PROVIDER=unknown',
    'FORM_REGION=unknown',
    'SHARDS=s9',
    'SHARD_s9_ORIGIN=https://s9.tracy.test',
    'SHARD_s9_SECRET=<set>',
    `SHARD_s9_TUNNEL_ID=${tunnel}`,
    'SHARD_s9_PROVIDER=unknown',
    'SHARD_s9_REGION=unknown'
  ])
    assert.ok(reg.includes(line), line)
  const placed = printedFile(
    install([], { inputs: { ...INPUTS, SHARD_PROVIDER: 'digitalocean', SHARD_REGION: 'asia' } }).stdout,
    '/root/tracy-shard-s9-registration.txt'
  )
  assert.ok(placed.includes('FORM_REGION=asia') && placed.includes('SHARD_s9_PROVIDER=digitalocean'))
})

test('install-shard.sh sources install-shard-steps.sh from its own directory, and each file stays under 800 lines (contract section 10)', () => {
  for (const name of ['install-shard.sh', 'install-shard-steps.sh']) {
    assert.equal(bash(['-n', script(name)]).status, 0, `${name} parses`)
    assert.ok(readFileSync(script(name), 'utf8').split('\n').length < 800, `${name} is under 800 lines`)
  }
  const main = readFileSync(script('install-shard.sh'), 'utf8')
  assert.match(main, /^source "\$\(dirname "\$0"\)\/install-shard-steps\.sh"$/m)
  assert.doesNotMatch(main, /^step_[a-z_]+\(\) \{/m, 'no step function is left in the entry file')
  const steps = readFileSync(script('install-shard-steps.sh'), 'utf8')
  for (const fn of [
    'step_host_base',
    'step_secrets',
    'step_fleet_files',
    'step_dsh',
    'step_web_env',
    'step_seed',
    'step_registration'
  ])
    assert.match(steps, new RegExp(`^${fn}\\(\\) \\{`, 'm'), `${fn} lives in the steps file`)
  // Proof the source line is real and relative to the script: the entry file alone cannot run.
  const alone = writeFiles(tempDir('install-alone-'), { 'install-shard.sh': main })
  const run = bash([path.join(alone, 'install-shard.sh'), '--help'])
  assert.equal(run.status, 2, run.stderr)
  assert.match(run.stderr, /install-shard-steps\.sh is not beside/)
  // And together they still run the whole plan (the step list of the test above).
  assert.equal(install().status, 0)
})

test('REGISTRY_AUTH=ecr: registry.env names the ECR pull key, the login goes through the aws-cli image, every image under TRACY_IMAGE_PREFIX', () => {
  const run = install([], { inputs: ECR_INPUTS })
  assert.equal(run.status, 0, run.stderr)
  const out = run.stdout
  const prefix = `${ECR}/lab3-image/tracy-ai`
  assert.match(out, /==> 3\. ecr login and the fleet files of app-0123456789ab \(image\)/)
  assert.deepEqual(
    printedFile(out, '/registry.env').filter((l) => !l.startsWith('#')),
    [
      'REGISTRY_AUTH=ecr',
      `TRACY_IMAGE_PREFIX=${prefix}`,
      `ECR_REGISTRY=${ECR}`,
      'AWS_REGION=us-east-1',
      'AWS_ACCESS_KEY_ID=<set>',
      'AWS_SECRET_ACCESS_KEY=<set>'
    ]
  )
  assert.ok(
    out.includes(
      `docker run --rm --env-file <0600 temp file: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION> public.ecr.aws/aws-cli/aws-cli:`
    ) &&
      out.includes(
        `ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${ECR}`
      ),
    out
  )
  assert.ok(out.includes(`docker pull -q ${prefix}/tracy-host:app-0123456789ab`), out)
  assert.ok(out.includes(`DSH_IMAGE=${prefix}/tracy-dsh bash /opt/tracy-fleet/dsh/host-dsh-init.sh`), out)
  assert.ok(
    out.includes(
      `env TRACY_IMAGE_PREFIX=${prefix} /opt/tracy-fleet/stack/deploy-tracy-stack.sh --tag app-0123456789ab`
    ),
    out
  )
  assert.doesNotMatch(out, /ghcr\.io/)
})

test('REGISTRY_AUTH=ecr: its inputs are required by name, and a prefix outside ECR_REGISTRY is refused', () => {
  const { AWS_SECRET_ACCESS_KEY: _secret, ...rest } = ECR_INPUTS
  const missing = install([], { inputs: rest })
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /missing inputs: AWS_SECRET_ACCESS_KEY/)
  assert.doesNotMatch(missing.stderr, /GHCR_/, 'the GHCR inputs are not asked for')
  const outside = install([], { inputs: { ...ECR_INPUTS, TRACY_IMAGE_PREFIX: 'ghcr.io/tracyhq' } })
  assert.equal(outside.status, 2)
  assert.match(outside.stderr, /TRACY_IMAGE_PREFIX must start with ECR_REGISTRY\//)
  assert.equal(install([], { inputs: { ...ECR_INPUTS, REGISTRY_AUTH: 'basic' } }).status, 2)
})

test('preflight accepts Ubuntu 24.04 and 26.04 only', () => {
  // The preflight reads /etc/os-release, absent on a Mac: check the predicate it calls on its own.
  const src = readFileSync(script('install-shard.sh'), 'utf8')
  const fn = src.match(/^os_supported\(\) \{\n[\s\S]*?\n\}$/m)
  assert.ok(fn, 'os_supported is defined')
  assert.match(src, /os_supported "\$os_id" "\$os_version" \|\|/, 'preflight calls it')
  const supported = (id, version) => bash(['-c', `${fn[0]}\nos_supported "$1" "$2"`, 'x', id, version]).status
  assert.equal(supported('ubuntu', '24.04'), 0)
  assert.equal(supported('ubuntu', '26.04'), 0)
  for (const [id, version] of [
    ['ubuntu', '22.04'],
    ['ubuntu', '25.10'],
    ['ubuntu', '26.04.1'],
    ['debian', '24.04'],
    ['', '']
  ])
    assert.equal(supported(id, version), 1, `${id} ${version} is refused`)
})

test('apt keyrings stay readable by _apt under a caller umask 077', () => {
  // s1, 21/10/2026: run under `umask 077`, docker.asc came out 0600 and apt refused the repository.
  const src = readFileSync(script('install-shard.sh'), 'utf8')
  const steps = readFileSync(script('install-shard-steps.sh'), 'utf8')
  assert.ok(src.indexOf('\numask 022\n') > 0, 'the installer resets the umask')
  assert.ok(src.indexOf('\numask 022\n') < src.indexOf('\nmain() {'), 'before any step runs')
  for (const keyring of ['/etc/apt/keyrings/docker.asc', '/usr/share/keyrings/cloudflare-public-v2.gpg'])
    assert.match(
      steps,
      new RegExp(`run chmod a\\+r ${keyring.replace(/[.]/g, '\\.')}\\n`),
      `${keyring} is chmod a+r`
    )
})
