import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/lib/site-apache-conf.sh', import.meta.url))

test('site preview admits the configured web origin on an apex, including local HTTP ports', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-apache-'))
  try {
    for (const origin of ['', 'http://qa.tracy.test:51770/', 'https://tracy.site']) {
      const result = spawnSync(
        'bash',
        ['-c', 'source "$1"; tracy_write_apache_conf "$2" off', 'test', script, dir],
        {
          env: { ...process.env, TRACY_ORIGIN: origin, FLEET_ZONE: 'qa.tracy.test' },
          encoding: 'utf8'
        }
      )
      assert.equal(result.status, 0, result.stderr)
      const conf = readFileSync(path.join(dir, 'apache/tracy-noindex.conf'), 'utf8')
      const policy = conf
        .split('\n')
        .find((line) => line.startsWith('Header always set Content-Security-Policy'))
      assert.ok(policy.includes("frame-ancestors 'self' https://*.qa.tracy.test"))
      if (origin) assert.ok(policy.includes(` ${origin.replace(/\/$/, '')}"`))
      assert.ok(!conf.includes('Header always set X-Robots-Tag'))
      assert.ok(!policy.includes('frame-ancestors *'))
    }
    const previous = readFileSync(path.join(dir, 'apache/tracy-noindex.conf'), 'utf8')
    for (const origin of [
      'http://qa.test/path',
      'https://user:pass@qa.test',
      'https://qa.test"\nHeader always unset Content-Security-Policy',
      'https://qa.test; *'
    ]) {
      const result = spawnSync(
        'bash',
        ['-c', 'source "$1"; tracy_write_apache_conf "$2" off', 'test', script, dir],
        {
          env: { ...process.env, TRACY_ORIGIN: origin },
          encoding: 'utf8'
        }
      )
      assert.notEqual(result.status, 0)
      assert.equal(readFileSync(path.join(dir, 'apache/tracy-noindex.conf'), 'utf8'), previous)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a managed policy written before the zone apex was listed is rewritten with the apex, not kept as custom', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-apache-'))
  const write = () =>
    spawnSync('bash', ['-c', 'source "$1"; tracy_write_apache_conf "$2" off', 'test', script, dir], {
      env: { ...process.env, TRACY_ORIGIN: 'https://cowork.tracy.ai', FLEET_ZONE: 'tracy.ai' },
      encoding: 'utf8'
    })
  const conf = () => readFileSync(path.join(dir, 'apache/tracy-noindex.conf'), 'utf8')
  try {
    assert.equal(write().status, 0)
    const old = "'self' https://*.tracy.ai http://127.0.0.1:* http://localhost:* https://cowork.tracy.ai"
    const fresh =
      "'self' https://*.tracy.ai https://tracy.ai http://127.0.0.1:* http://localhost:* https://cowork.tracy.ai"
    assert.ok(conf().includes(`"frame-ancestors ${fresh}"`))
    writeFileSync(path.join(dir, 'apache/tracy-noindex.conf'), conf().replace(fresh, old))
    assert.equal(write().status, 0)
    assert.ok(conf().includes(`"frame-ancestors ${fresh}"`))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
