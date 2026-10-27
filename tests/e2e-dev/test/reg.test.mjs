import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { envScript } from '../lib/reg.mjs'

const script = envScript({
  runId: 'k1004ab',
  q: "/tmp/q it's",
  emails: {
    a: 'e2e-k1004ab-owner@example.test',
    b: 'e2e-k1004ab-editor@example.test',
    c: 'e2e-k1004ab-third@example.test'
  },
  sites: [
    { platform: 'wordpress', label: 'e2ek1004ab1w', siteKey: 'e2ek1004ab1w.tracy.site', ms: 1 },
    { platform: 'joomla', label: 'e2ek1004ab1j', siteKey: 'e2ek1004ab1j.tracy.site', ms: 1 }
  ]
})

test('the case env file sources in bash and names the run, seats and sites', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reg-env-'))
  const file = join(dir, 'env.sh')
  writeFileSync(file, script)
  const r = spawnSync(
    'bash',
    [
      '-c',
      `. ${file} && printf '%s\\n' "$E2E_RUN_ID" "$O" "$COOKIE_DOMAIN" "$Q" "$A" "$S" "$KEY" "$S_JO" "$LABEL_WP" && type mint api pq dshgrep em >/dev/null && echo ok`
    ],
    { encoding: 'utf8' }
  )
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(r.stdout.trim().split('\n'), [
    'k1004ab',
    'https://cowork.tracy.site',
    '.tracy.site',
    "/tmp/q it's",
    'e2e-k1004ab-owner@example.test',
    'e2ek1004ab1w.tracy.site',
    'e2ek1004ab1w.tracy.site',
    'e2ek1004ab1j.tracy.site',
    'e2ek1004ab1w',
    'ok'
  ])
})

test('the env file holds no secret: cookies are minted into $Q, never written here', () => {
  assert.doesNotMatch(script, /\bv1\.[A-Za-z0-9_-]{16,}\./)
  assert.doesNotMatch(script, /SESSION_SECRET/)
  assert.match(script, /tests\/e2e-dev\/bin\/mint\.mjs" "\$e" "\$Q\/cookie-\$1\.txt"/)
})
