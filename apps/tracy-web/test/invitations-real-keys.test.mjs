import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createCampaignKeyStore } from '../src/invitations/real-keys.js'
import { open, seal } from '../src/invitations/real-crypto.js'

const now = '2030-01-01T00:00:00.000Z'
const expiresAt = '2030-01-31T00:00:00.000Z'
const initialImportedAt = now
const tomorrow = '2030-01-02T00:00:00.000Z'
test('vault sweep isolates corrupt ledgers and stale locks without deleting or recovering them', async (t) => {
  const { root, keys, input } = await fixture(t)
  const corrupt = '00000000-0000-4000-8000-000000000001',
    busy = '00000000-0000-4000-8000-000000000002',
    expired = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  for (const campaignId of [corrupt, busy, expired]) await keys.create({ ...input, campaignId })
  await writeFile(join(root, corrupt, 'ledger.json'), '{}', { mode: 0o600 })
  await writeFile(join(root, `${busy}.lock`), '', { mode: 0o600 })
  const result = await keys.sweep({ now: expiresAt, limit: 20 })
  assert.equal(result.revoked, 1)
  assert.equal(await readFile(join(root, corrupt, 'ledger.json'), 'utf8'), '{}')
  assert.ok((await lstat(join(root, `${busy}.lock`))).isFile())
  assert.ok(!(await readdir(join(root, expired))).includes('key.json'))
})
async function fixture(t) {
  const dir = await mkdtemp(join(await realpath(tmpdir()), 'invitations-real-keys-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const root = join(dir, 'vault')
  const keys = createCampaignKeyStore({ root })
  const campaignId = randomUUID()
  const input = { campaignId, now, expiresAt, initialImportedAt }
  return { dir, root, keys, campaignId, input }
}

test('private campaign keys are durable, independent and read fresh per request', async (t) => {
  const { root, keys, campaignId, input } = await fixture(t)
  await keys.create(input)
  const first = await keys.read({ campaignId, now })
  assert.equal(first.key.length, 32)
  assert.equal(first.indexKey.length, 32)
  assert.notDeepEqual(first.key, first.indexKey)
  const second = await createCampaignKeyStore({ root }).read({ campaignId, now })
  assert.deepEqual(second.key, first.key)
  first.key.fill(0)
  assert.deepEqual((await keys.read({ campaignId, now })).key, second.key)
  const other = randomUUID()
  await keys.create({ ...input, campaignId: other })
  assert.notDeepEqual((await keys.read({ campaignId: other, now })).key, second.key)
  assert.equal((await lstat(root)).mode & 0o777, 0o700)
  assert.equal((await lstat(join(root, campaignId))).mode & 0o777, 0o700)
  for (const name of await readdir(join(root, campaignId))) {
    assert.equal((await lstat(join(root, campaignId, name))).mode & 0o777, 0o600)
  }
})

test('expiry_and_tombstone_survive_db_restore: expiry cannot be extended or recreated', async (t) => {
  const { root, keys, campaignId, input } = await fixture(t)
  await keys.create(input)
  const { key } = await keys.read({ campaignId, now })
  const context = { campaignId, recordId: randomUUID(), purpose: 'recipient', version: 1 }
  const oldDatabaseRow = seal({ key, context, bytes: Buffer.from('Synthetic restored row') })
  await assert.rejects(() => keys.read({ campaignId, now: expiresAt }), { code: 'REAL_EXPIRED' })
  await assert.rejects(() =>
    keys.extend({ campaignId, now: expiresAt, expiresAt: '2030-03-01T00:00:00.000Z' })
  )
  await assert.rejects(() => keys.create(input))
  const restoredClient = createCampaignKeyStore({ root })
  await assert.rejects(() => restoredClient.read({ campaignId, now }))
  // Restoring ciphertext cannot recover the missing campaign key.
  assert.throws(() => open({ key: null, context, envelope: oldDatabaseRow }))
  assert.equal((await readdir(join(root, campaignId))).includes('key.json'), false)
})

test('explicit revocation is irreversible and idempotent across store instances', async (t) => {
  const { root, keys, campaignId, input } = await fixture(t)
  await keys.create(input)
  await keys.revoke({ campaignId, now })
  await keys.revoke({ campaignId, now: tomorrow })
  await assert.rejects(() => createCampaignKeyStore({ root }).read({ campaignId, now: tomorrow }))
  await assert.rejects(() => keys.create(input))
})

test('revoking an absent UUID creates a tombstone rather than allowing later recreation', async (t) => {
  const { keys, campaignId, input } = await fixture(t)
  await keys.revoke({ campaignId, now })
  await assert.rejects(() => keys.create(input))
  await assert.rejects(() => keys.read({ campaignId, now }))
})

test('extension is explicit, never shortens retention, and stops at 365 days from first import', async (t) => {
  const { keys, campaignId, input } = await fixture(t)
  await keys.create(input)
  const deadline = '2031-01-01T00:00:00.000Z'
  await keys.extend({ campaignId, now: tomorrow, expiresAt: deadline })
  assert.equal((await keys.read({ campaignId, now: tomorrow })).expiresAt, deadline)
  for (const date of [expiresAt, '2031-01-01T00:00:00.001Z']) {
    await assert.rejects(() => keys.extend({ campaignId, now: tomorrow, expiresAt: date }))
  }
})

test('missing or corrupt key/ledger refuses and never creates a replacement', async (t) => {
  for (const name of ['key.json', 'ledger.json']) {
    const { root, keys, campaignId, input } = await fixture(t)
    await keys.create(input)
    const file = join(root, campaignId, name)
    await unlink(file)
    await assert.rejects(() => keys.read({ campaignId, now }))
    await assert.rejects(() => keys.create(input))
    await writeFile(file, '{}', { mode: 0o600 })
    await assert.rejects(() => keys.read({ campaignId, now }))
    assert.equal(await readFile(file, 'utf8'), '{}')
  }
})

test('path_and_symlink_refuse: invalid IDs and times cannot touch paths or extend retention', async (t) => {
  const { dir, root, keys, input } = await fixture(t)
  for (const campaignId of ['../escape', '/tmp/escape', '', 'not-a-uuid']) {
    await assert.rejects(() => keys.create({ ...input, campaignId }))
    await assert.rejects(() => keys.read({ campaignId, now }))
    await assert.rejects(() => keys.revoke({ campaignId, now }))
  }
  for (const bad of ['invalid', '', '2030-02-30T00:00:00.000Z']) {
    await assert.rejects(() => keys.create({ ...input, now: bad }))
    await assert.rejects(() => keys.create({ ...input, expiresAt: bad }))
  }
  await assert.rejects(() => keys.create({ ...input, expiresAt: now }))
  await assert.rejects(() => keys.create({ ...input, expiresAt: '2032-01-01T00:00:00.000Z' }))
  await assert.rejects(() => keys.create({ ...input, initialImportedAt: tomorrow }))
  const target = join(dir, 'target')
  await mkdir(target, { mode: 0o700 })
  await symlink(target, root)
  await assert.rejects(() => keys.create(input))
  assert.deepEqual(await readdir(target), [])
})

test('unsafe file permissions, hardlinks and symlinked campaign/key/ancestor fail closed', async (t) => {
  const { dir, root, keys, campaignId, input } = await fixture(t)
  await keys.create(input)
  const keyPath = join(root, campaignId, 'key.json')
  await chmod(keyPath, 0o644)
  await assert.rejects(() => keys.read({ campaignId, now }))
  await chmod(keyPath, 0o600)
  const hardlink = join(dir, 'hardlink')
  await link(keyPath, hardlink)
  await assert.rejects(() => keys.read({ campaignId, now }))
  await unlink(hardlink)
  const original = await readFile(keyPath)
  const target = join(dir, 'external-key')
  await writeFile(target, original, { mode: 0o600 })
  await unlink(keyPath)
  await symlink(target, keyPath)
  await assert.rejects(() => keys.read({ campaignId, now }))
  assert.deepEqual(await readFile(target), original)
  const linkRoot = join(dir, 'linked-vault')
  await symlink(root, linkRoot)
  await assert.rejects(() => createCampaignKeyStore({ root: join(linkRoot, 'nested') }).create(input))
  const id = randomUUID()
  await symlink(join(root, campaignId), join(root, id))
  await assert.rejects(() => keys.read({ campaignId: id, now }))
})

test('revocation removes temporary key material from an interrupted atomic create', async (t) => {
  const { root, keys, campaignId, input } = await fixture(t)
  await keys.create(input)
  const dir = join(root, campaignId)
  const temp = join(dir, `key.json.${randomUUID()}.tmp`)
  await writeFile(temp, await readFile(join(dir, 'key.json')), { mode: 0o600 })
  await keys.revoke({ campaignId, now })
  assert.deepEqual(await readdir(dir), ['ledger.json'])
})

test('sweep finishes erasure after a crash between durable tombstone and key deletion', async (t) => {
  const { root, keys, campaignId, input } = await fixture(t)
  await keys.create(input)
  const dir = join(root, campaignId)
  await writeFile(
    join(dir, 'ledger.json'),
    JSON.stringify({ v: 1, campaignId, state: 'revoked', revokedAt: now }),
    { mode: 0o600 }
  )
  assert.equal((await keys.sweep({ now: tomorrow, limit: 1 })).revoked, 1)
  assert.deepEqual(await readdir(dir), ['ledger.json'])
  await assert.rejects(() => keys.read({ campaignId, now }))
})

test('unsafe roots and preexisting permissive directories are refused', async (t) => {
  for (const root of ['/', '.', 'relative/vault', '/private/../tmp/vault', null]) {
    assert.throws(() => createCampaignKeyStore({ root }))
  }
  const { root, keys, input } = await fixture(t)
  await mkdir(root, { mode: 0o755 })
  await assert.rejects(() => keys.create(input))
  assert.deepEqual(await readdir(root), [])
})

test('exclusive creation across instances cannot replace an existing encryption key', async (t) => {
  const { root, input, keys, campaignId } = await fixture(t)
  const results = await Promise.allSettled([
    keys.create(input),
    createCampaignKeyStore({ root }).create(input)
  ])
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1)
  const key = (await keys.read({ campaignId, now })).key
  await assert.rejects(() => keys.create(input))
  assert.deepEqual((await keys.read({ campaignId, now })).key, key)
})

test('bounded sweep also revokes orphan keys without a database row', async (t) => {
  const { keys, input } = await fixture(t)
  const ids = [randomUUID(), randomUUID(), randomUUID()]
  for (const campaignId of ids) await keys.create({ ...input, campaignId })
  assert.equal((await keys.sweep({ now: expiresAt, limit: 2 })).revoked, 2)
  assert.equal((await keys.sweep({ now: expiresAt, limit: 2 })).revoked, 1)
  assert.equal((await keys.sweep({ now: expiresAt, limit: 2 })).revoked, 0)
  for (const campaignId of ids) await assert.rejects(() => keys.read({ campaignId, now }))
  for (const limit of [0, -1, 1.5, 1001]) await assert.rejects(() => keys.sweep({ now, limit }))
})

test('a lock is cleared only when its owner is provably gone: same host and a finished run', async () => {
  const { abandonedLock } = await import('../src/invitations/real-keys.js')
  const me = { host: 'h1', pid: 10, boot: 'boot-now', alive: (pid) => pid === 10 || pid === 20 }
  const owner = (over) => ({ v: 1, host: 'h1', pid: 30, boot: 'boot-old', at: now, ...over })
  assert.equal(abandonedLock(owner(), me), true, 'dead pid on this host')
  assert.equal(abandonedLock(owner({ pid: 10 }), me), true, 'our pid, but an earlier run (container restart)')
  assert.equal(abandonedLock(owner({ pid: 20 }), me), false, 'another live process')
  assert.equal(abandonedLock(owner({ pid: 10, boot: 'boot-now' }), me), false, 'our own run')
  assert.equal(abandonedLock(owner({ host: 'h2' }), me), false, 'another host decides nothing here')
  for (const bad of [null, {}, owner({ v: 2 }), owner({ pid: 0 }), owner({ boot: 1 })])
    assert.equal(abandonedLock(bad, me), false)
})

test('an abandoned lock from an earlier run is renamed aside and the vault opens; a foreign one stays', async (t) => {
  const { hostname } = await import('node:os')
  const { root, keys, input } = await fixture(t)
  const reported = []
  const store = createCampaignKeyStore({ root, onAbandonedLock: (x) => reported.push(x.campaignId) })
  await keys.create(input)
  const lockPath = join(root, `${input.campaignId}.lock`)
  // A previous run of this very process id left its lock behind (a container restart keeps pid 1).
  await writeFile(
    lockPath,
    JSON.stringify({ v: 1, host: hostname(), pid: process.pid, boot: 'an-earlier-run', at: now }),
    { mode: 0o600 }
  )
  const read = await store.read({ campaignId: input.campaignId, now })
  assert.equal(read.key.length, 32)
  assert.deepEqual(reported, [input.campaignId])
  const names = await readdir(root)
  assert.ok(!names.includes(`${input.campaignId}.lock`))
  assert.equal(names.filter((n) => n.startsWith(`${input.campaignId}.lock.abandoned-`)).length, 1)
  // A lock written on another host is never judged from here.
  await writeFile(lockPath, JSON.stringify({ v: 1, host: 'another-host', pid: 1, boot: 'x', at: now }), {
    mode: 0o600
  })
  await assert.rejects(() => store.read({ campaignId: input.campaignId, now }), { code: 'REAL_KEY_BUSY' })
  assert.ok((await lstat(lockPath)).isFile())
})

test('drain waits for an operation holding a lock and reports idle', async (t) => {
  const { root, input } = await fixture(t)
  const store = createCampaignKeyStore({ root })
  assert.equal(await store.drain(10), true)
  const created = store.create(input)
  const draining = store.drain(5000)
  await created
  assert.equal(await draining, true)
})
