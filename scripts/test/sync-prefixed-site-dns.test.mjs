#!/usr/bin/env node
/**
 * The staging host's DNS sync decides from facts alone (`--plan`), so what it adds and deletes is
 * tested here without Cloudflare or Docker.
 *
 *   node --test scripts/test/sync-prefixed-site-dns.test.mjs
 *
 * The cases asserted hardest are the ones that keep it off other people's names: an empty prefix
 * refuses, a record pointing elsewhere is never touched, and the dev wildcard is never read.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '../../deploy/scripts/sync-prefixed-site-dns.py')
const TARGET = 'stg-tunnel.cfargotunnel.com'

function planOf(facts) {
  const r = spawnSync('python3', [SCRIPT, '--plan'], { input: JSON.stringify(facts), encoding: 'utf8' })
  return { status: r.status, plan: r.status === 0 ? JSON.parse(r.stdout) : null, stderr: r.stderr }
}

const base = { prefix: 'stg-', zone: 'tracy.site', target: TARGET }
const rec = (id, name, content = TARGET, type = 'CNAME') => ({ id, name, content, type })

test('a new prefixed site gets a record; a removed one loses it', () => {
  const { plan } = planOf({
    ...base,
    labels: ['stg-shop', 'stg-blog'],
    records: [rec('1', 'stg-blog.tracy.site'), rec('2', 'stg-gone.tracy.site')]
  })
  assert.deepEqual(plan, {
    add: ['stg-shop.tracy.site'],
    delete: [{ id: '2', name: 'stg-gone.tracy.site' }],
    conflict: []
  })
})

test("labels without the prefix are not this host's and get nothing", () => {
  const { plan } = planOf({ ...base, labels: ['shop', 'business-joomla'], records: [] })
  assert.deepEqual(plan, { add: [], delete: [], conflict: [] })
})

test('a record pointing elsewhere is a conflict, never overwritten or deleted', () => {
  const { plan } = planOf({
    ...base,
    labels: ['stg-shop'],
    records: [
      rec('9', 'stg-shop.tracy.site', 'dev-tunnel.cfargotunnel.com'),
      rec('8', 'stg-x.tracy.site', 'other')
    ]
  })
  assert.deepEqual(plan, { add: [], delete: [], conflict: ['stg-shop.tracy.site'] })
})

test('the wildcard and other zones are never candidates for deletion', () => {
  const { plan } = planOf({
    ...base,
    labels: [],
    records: [rec('1', '*.tracy.site'), rec('2', 'stg-a.tracy.ai'), rec('3', 'cowork-staging.tracy.site')]
  })
  assert.deepEqual(plan, { add: [], delete: [], conflict: [] })
})

test('an empty prefix refuses: on such a host the wildcard already serves every site', () => {
  const r = planOf({ ...base, prefix: '', labels: ['shop'], records: [] })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /SITE_ADDRESS_PREFIX is empty/)
})

test('a label that is not a DNS label is skipped', () => {
  const { plan } = planOf({ ...base, labels: ['stg-ok', 'stg-bad_name', 'stg-'], records: [] })
  assert.deepEqual(plan.add, ['stg-ok.tracy.site'])
})

test('a non-CNAME record on a prefixed name is a conflict too', () => {
  const { plan } = planOf({
    ...base,
    labels: ['stg-shop'],
    records: [rec('5', 'stg-shop.tracy.site', '203.0.113.7', 'A')]
  })
  assert.deepEqual(plan, { add: [], delete: [], conflict: ['stg-shop.tracy.site'] })
})
