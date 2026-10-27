/** The master's shard alerts (spec §5; contract §5, §7): one line each, kept to their fields, told once per key. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOpsSignal, signalText } from '../src/lib/ops-signal.js'

test('each shard alert is one line naming the shard and what happened', () => {
  const text = (kind, data) => signalText({ kind, data }, 'PROD')
  assert.equal(
    text('shard.silent', { shard: 's2', since: '2026-10-20T03:00:00.000Z' }),
    '[PROD] Shard s2 has sent no heartbeat since 2026-10-20T03:00:00.000Z'
  )
  assert.equal(
    text('shard.update_failed', { shard: 's2', tag: 'app-0123456789ab', finished_at: 'T' }),
    '[PROD] Shard s2 failed to update to app-0123456789ab (finished T)'
  )
  assert.equal(
    text('shard.dns_conflict', { shard: 's1', hostname: 'shop.tracy.ai' }),
    '[PROD] Shard s1: shop.tracy.ai already points elsewhere; DNS left as it is'
  )
  assert.equal(
    text('shard.none', { reason: 'NO_ELIGIBLE_SHARD' }),
    '[PROD] No shard could take a new account (NO_ELIGIBLE_SHARD); sign-ups are refused until one does'
  )
  assert.equal(
    text('shard.degraded', { shard: 's3', status: 503 }),
    '[PROD] Shard s3 refused an adopt (status 503) and is passed over until its next heartbeat'
  )
  assert.equal(
    text('shard.closed', { shard: 's3', reason: 'FULL' }),
    '[PROD] Shard s3 stopped taking new accounts (FULL)'
  )
  assert.equal(
    text('shard.label_conflict', { shard: 's1', label: 'shop', holder: 's2' }),
    '[PROD] Shard s1 made a site under shop, which s2 holds; this master did not list it'
  )
  assert.equal(
    text('shard.backup_stale', { shard: 's2', at: '2026-10-18T01:00:00Z', result: 'stale' }),
    '[PROD] Shard s2: database backup stale (last 2026-10-18T01:00:00Z)'
  )
  assert.equal(
    text('shard.web_images_missing', { shard: 's3', tag: 'app-0123456789ab' }),
    '[PROD] Shard s3 updated to app-0123456789ab without its site web images; customer sites may not build'
  )
  assert.equal(
    text('shard.adopt_failed', { shard: 's1', code: 'MIRROR_CONFLICT' }),
    '[PROD] Shard s1 refused an adopt outright (MIRROR_CONFLICT); nobody was moved and no other shard was asked'
  )
})

test('a shard alert keeps only its declared fields, goes to Telegram, and is told once per dedupe key', async () => {
  const signal = createOpsSignal({ pool: null, config: { environment: 'dev' }, log: { warn() {} } })
  const first = await signal.record('shard.dns_conflict', {
    data: { shard: 's1', hostname: 'shop.tracy.ai', token: 'must-not-be-kept' },
    dedupeKey: 'dns:shop.tracy.ai'
  })
  assert.deepEqual(first.data, { shard: 's1', hostname: 'shop.tracy.ai' })
  assert.equal(first.telegram_required, true)
  assert.equal(
    await signal.record('shard.dns_conflict', { data: { shard: 's1' }, dedupeKey: 'dns:shop.tracy.ai' }),
    null
  )
})
