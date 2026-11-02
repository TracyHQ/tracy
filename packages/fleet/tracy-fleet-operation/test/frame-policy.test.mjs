import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { reconcileFramePolicy, withInit } from '../scripts/webroot/site-frame-policy.mjs'

const A = 'http://workspace.example:47211',
  B = 'https://panel.example:39129'
const policy = (origin) =>
  `'self' https://*.example https://example http://127.0.0.1:* http://localhost:* ${origin}`
// The shape written before the zone apex was listed: still Tracy's own policy, so it upgrades.
const policyBeforeApex = (origin) =>
  `'self' https://*.example http://127.0.0.1:* http://localhost:* ${origin}`

function fixture(cms) {
  const root = mkdtempSync(path.join(tmpdir(), 'frame-policy-')),
    directory = path.join(root, 'cafe')
  mkdirSync(directory)
  writeFileSync(path.join(directory, 'content.txt'), 'The business content stays intact.')
  const env = path.join(directory, '.env')
  if (cms === 'emdash') {
    writeFileSync(
      env,
      `MAIL_ENABLED=off\nDATABASE_SECRET=fixture-only\nTRACY_FRAME_ANCESTORS="${policy(A)}"\n`
    )
    writeFileSync(
      path.join(directory, 'docker-compose.yml'),
      'services:\n  web:\n    environment:\n      TRACY_FRAME_ANCESTORS: "${TRACY_FRAME_ANCESTORS:-}"\n'
    )
  } else {
    mkdirSync(path.join(directory, 'apache'))
    writeFileSync(env, 'MAIL_ENABLED=off\nDATABASE_SECRET=fixture-only\n')
    writeFileSync(
      path.join(directory, 'apache/tracy-noindex.conf'),
      `Header always set X-Robots-Tag "noindex, nofollow"\nHeader always set Content-Security-Policy "frame-ancestors ${policy(A)}"\n`
    )
  }
  return { root, directory, env, clean: () => rmSync(root, { recursive: true, force: true }) }
}

for (const cms of ['wordpress', 'joomla', 'emdash'])
  test(`${cms}: changing the public origin reconciles once without changing content, mail or publish state`, () => {
    const f = fixture(cms),
      calls = [],
      run = (args, options) => calls.push({ args, options })
    try {
      const result = reconcileFramePolicy({
        root: f.root,
        label: 'cafe',
        policy: policy(B),
        publicOrigin: B,
        run
      })
      assert.equal(result.state, 'updated')
      const text = readFileSync(
        cms === 'emdash' ? f.env : path.join(f.directory, 'apache/tracy-noindex.conf'),
        'utf8'
      )
      assert.ok(text.includes(B))
      assert.ok(!text.includes(A))
      assert.ok(readFileSync(f.env, 'utf8').includes('MAIL_ENABLED=off\nDATABASE_SECRET=fixture-only\n'))
      assert.equal(
        readFileSync(path.join(f.directory, 'content.txt'), 'utf8'),
        'The business content stays intact.'
      )
      if (cms !== 'emdash') {
        assert.ok(text.includes('X-Robots-Tag "noindex, nofollow"'))
        assert.deepEqual(
          calls.map((c) => c.args.slice(-2)),
          [
            ['apache2ctl', '-t'],
            ['-k', 'graceful']
          ]
        )
      } else {
        assert.equal(calls.length, 1)
        assert.ok(calls[0].args.includes('up'))
        assert.ok(calls[0].args.includes('--wait'))
        assert.ok(!calls[0].args.includes('restart'))
      }
      const count = calls.length
      assert.equal(
        reconcileFramePolicy({ root: f.root, label: 'cafe', policy: policy(B), publicOrigin: B, run }).state,
        'current'
      )
      assert.equal(calls.length, count)
      assert.equal(JSON.parse(readFileSync(path.join(f.directory, '.frame-policy.json'))).publicOrigin, B)
    } finally {
      f.clean()
    }
  })

test('custom policies and none are preserved without Docker effects', () => {
  const f = fixture('wordpress'),
    file = path.join(f.directory, 'apache/tracy-noindex.conf')
  try {
    for (const [custom, expected] of [
      ["'none'", 'refused'],
      ["'self' https://partner.example", 'unmanaged']
    ]) {
      const text = `Header always set Content-Security-Policy "frame-ancestors ${custom}"\n`
      writeFileSync(file, text)
      const result = reconcileFramePolicy({
        root: f.root,
        label: 'cafe',
        policy: policy(B),
        publicOrigin: B,
        run: () => assert.fail('must not touch Docker')
      })
      assert.equal(result.state, expected)
      assert.equal(readFileSync(file, 'utf8'), text)
    }
  } finally {
    f.clean()
  }
})

test('a failed Apache configuration test restores its previous bytes and leaves the policy uncommitted', () => {
  const f = fixture('joomla'),
    file = path.join(f.directory, 'apache/tracy-noindex.conf'),
    original = readFileSync(file, 'utf8')
  let attempts = 0
  try {
    assert.throws(
      () =>
        reconcileFramePolicy({
          root: f.root,
          label: 'cafe',
          policy: policy(B),
          publicOrigin: B,
          run: () => {
            if (++attempts === 1) throw new Error('invalid configuration')
          }
        }),
      /update refused/
    )
    assert.equal(readFileSync(file, 'utf8'), original)
  } finally {
    f.clean()
  }
})

test('a policy file symlink cannot redirect a reconciliation outside the managed site', () => {
  const f = fixture('joomla'),
    file = path.join(f.directory, 'apache/tracy-noindex.conf'),
    elsewhere = path.join(f.root, 'elsewhere')
  try {
    writeFileSync(elsewhere, 'outside')
    rmSync(file)
    symlinkSync(elsewhere, file)
    assert.throws(
      () =>
        reconcileFramePolicy({
          root: f.root,
          label: 'cafe',
          policy: policy(B),
          publicOrigin: B,
          run: () => assert.fail('must not touch Docker')
        }),
      /unsafe/
    )
    assert.equal(readFileSync(elsewhere, 'utf8'), 'outside')
  } finally {
    f.clean()
  }
})

for (const cms of ['wordpress', 'emdash'])
  test(`${cms}: a policy written before the zone apex was listed upgrades to the one that lists it`, () => {
    const f = fixture(cms),
      calls = []
    const file = cms === 'emdash' ? f.env : path.join(f.directory, 'apache/tracy-noindex.conf')
    try {
      writeFileSync(file, readFileSync(file, 'utf8').replace(policy(A), policyBeforeApex(A)))
      const result = reconcileFramePolicy({
        root: f.root,
        label: 'cafe',
        policy: policy(A),
        publicOrigin: A,
        run: (args) => calls.push(args)
      })
      assert.equal(result.state, 'updated')
      assert.ok(readFileSync(file, 'utf8').includes(policy(A)))
      assert.ok(calls.length > 0, 'the web container is reloaded or recreated')
    } finally {
      f.clean()
    }
  })

test('the shared renderer lists the zone apex beside its subdomains (tracy.ai serves the Templates pages)', () => {
  const script = fileURLToPath(new URL('../scripts/lib/frame-policy.sh', import.meta.url))
  const result = spawnSync('bash', ['-c', 'source "$1"; tracy_frame_ancestors', 'frame', script], {
    env: { ...process.env, TRACY_ORIGIN: 'https://cowork.tracy.ai', FLEET_ZONE: 'tracy.ai' },
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    result.stdout,
    "'self' https://*.tracy.ai https://tracy.ai http://127.0.0.1:* http://localhost:* https://cowork.tracy.ai"
  )
})

test('the shared renderer accepts arbitrary public ports and rejects header injection', () => {
  const script = fileURLToPath(new URL('../scripts/lib/frame-policy.sh', import.meta.url))
  for (const origin of [A, B, 'https://[::1]:48239']) {
    const result = spawnSync('bash', ['-c', 'source "$1"; tracy_frame_ancestors', 'frame', script], {
      env: { ...process.env, TRACY_ORIGIN: origin, FLEET_ZONE: 'example' },
      encoding: 'utf8'
    })
    assert.equal(result.status, 0, result.stderr)
    assert.ok(result.stdout.endsWith(` ${origin}`))
  }
  const bad = spawnSync('bash', ['-c', 'source "$1"; tracy_frame_ancestors', 'frame', script], {
    env: { ...process.env, TRACY_ORIGIN: 'https://panel.example; frame-ancestors *' }
  })
  assert.notEqual(bad.status, 0)
})

test('the locked CLI executes reconciliation and emits a parseable current receipt on replay', () => {
  const f = fixture('wordpress')
  const script = fileURLToPath(new URL('../scripts/webroot/site-frame-policy.sh', import.meta.url))
  try {
    // Already correct bytes plus receipt avoid a real Docker call while exercising re-exec and lock.
    writeFileSync(
      path.join(f.directory, '.frame-policy.json'),
      JSON.stringify({ schema: 'tracy-frame-policy/v1', policy: policy(A), publicOrigin: A })
    )
    const result = spawnSync('bash', [script, f.root, 'cafe'], {
      env: { ...process.env, TRACY_ORIGIN: A, FLEET_ZONE: 'example' },
      encoding: 'utf8'
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout.trim()).state, 'current')
  } finally {
    f.clean()
  }
})

// #205: the recreate this job makes anyway gives an EmDash container rendered before 31/10/2026 its
// init, in the one place render-compose.sh writes it, so its next stop is at once.
test('emdash: the policy recreate adds init: true under restart, once, and nothing else (#205)', () => {
  const f = fixture('emdash')
  const compose = path.join(f.directory, 'docker-compose.yml')
  const before =
    'services:\n  web:\n    image: tracy/web-emdash:0.37.0\n    restart: unless-stopped\n    security_opt: ["no-new-privileges:true"]\n    environment:\n      TRACY_FRAME_ANCESTORS: "${TRACY_FRAME_ANCESTORS:-}"\n'
  writeFileSync(compose, before)
  try {
    const result = reconcileFramePolicy({
      root: f.root,
      label: 'cafe',
      policy: policy(B),
      publicOrigin: B,
      run: () => {}
    })
    assert.equal(result.state, 'updated')
    assert.equal(
      readFileSync(compose, 'utf8'),
      before.replace('    restart: unless-stopped\n', '    restart: unless-stopped\n    init: true\n')
    )
    assert.equal(withInit(readFileSync(compose, 'utf8')), readFileSync(compose, 'utf8'), 'never twice')
    // Not the generator's form (no image/restart run under web): left as it is.
    const other = 'services:\n  web:\n    environment: {}\n'
    assert.equal(withInit(other), other)
  } finally {
    f.clean()
  }
})
