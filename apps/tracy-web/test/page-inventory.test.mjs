import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPageInventoryReader } from '../src/sites/page-inventory.js'

function source() {
  let revision = 'one',
    reads = 0,
    refusal = null
  const ask = async (params) => {
    reads++
    if (refusal) return refusal
    const offset = params.cursor ? 100 : 0
    return {
      schemaVersion: 'tracy-content/v1',
      snapshot: { revision },
      site: { url: 'https://example.test' },
      contents: [{ id: `id-${offset}`, revision, url: `https://example.test/${offset}` }],
      pagination: { limit: 100, total: 101, nextCursor: offset ? null : 'next' }
    }
  }
  return {
    ask,
    reads: () => reads,
    change: () => {
      revision = 'two'
    },
    deny: () => {
      refusal = { error: { code: 'CONTENT_FORBIDDEN' } }
    }
  }
}
test('a fresh snapshot replaces repeat walks, content changes force the complete walk', async () => {
  const read = createPageInventoryReader(),
    cmsSource = source()
  const a = await read('scope', cmsSource.ask, {})
  assert.equal(cmsSource.reads(), 2)
  const b = await read('scope', cmsSource.ask, {})
  assert.equal(cmsSource.reads(), 3)
  assert.deepEqual(b, a)
  b.listings[1].contents[0].id = 'mutated'
  assert.equal((await read('scope', cmsSource.ask, {})).listings[1].contents[0].id, 'id-100')
  cmsSource.change()
  const changed = await read('scope', cmsSource.ask, {})
  assert.equal(cmsSource.reads(), 6)
  assert.equal(changed.listings[1].snapshot.revision, 'two')
  cmsSource.deny()
  assert.equal((await read('scope', cmsSource.ask, {})).refusal.error.code, 'CONTENT_FORBIDDEN')
})
test('different authority scopes, expiry and bounded memory never reuse an unchecked inventory', async () => {
  let now = 0
  const read = createPageInventoryReader({ now: () => now, maxEntries: 1, ttlMs: 100 })
  const s = source()
  await read('seat-a', s.ask, {})
  await read('seat-b', s.ask, {})
  await read('seat-a', s.ask, {})
  assert.equal(s.reads(), 6)
  now = 101
  await read('seat-a', s.ask, {})
  assert.equal(s.reads(), 8)
})
test('missing snapshots and oversized inventories keep ordinary fresh walks', async () => {
  const read = createPageInventoryReader({ maxBytes: 1 }),
    s = source()
  await read('a', s.ask, {})
  await read('a', s.ask, {})
  assert.equal(s.reads(), 4)
  let calls = 0
  const unsupported = async () => {
    calls++
    return { schemaVersion: 'tracy-content/v1', contents: [], pagination: { nextCursor: null } }
  }
  await read('b', unsupported, {})
  await read('b', unsupported, {})
  assert.equal(calls, 2)
})

test('Joomla requires a complete inventory fingerprint, including addresses outside content revisions', async () => {
  const s = source(),
    read = createPageInventoryReader()
  let address = 'before'
  const ask = async (q) => {
    const r = await s.ask(q)
    r.snapshot.inventoryRevision = address
    r.contents[0].url = `https://example.test/${address}/${q.cursor ? 'tail' : 'head'}`
    return r
  }
  const options = { requireInventoryRevision: true }
  await read('joomla', s.ask, {}, options)
  await read('joomla', s.ask, {}, options)
  assert.equal(s.reads(), 4, 'older adapters always walk fresh')
  await read('joomla', ask, {}, options)
  const warm = await read('joomla', ask, {}, options)
  warm.index.clear()
  assert.equal((await read('joomla', ask, {}, options)).index.size, 2)
  address = 'after'
  const changed = await read('joomla', ask, {}, options)
  assert.equal(changed.listings[1].contents[0].url, 'https://example.test/after/tail')
})
test('partial, unavailable and mixed snapshots are never remembered; recovery reads everything', async () => {
  for (const failure of ['null', 'denied', 'mixed', 'cap']) {
    let broken = true,
      calls = 0
    const s = source(),
      read = createPageInventoryReader()
    const ask = async (q) => {
      calls++
      if (broken && q.cursor && failure === 'null') return null
      if (broken && q.cursor && failure === 'denied') return { error: { code: 'CONTENT_FORBIDDEN' } }
      const r = await s.ask(q)
      if (broken && q.cursor && failure === 'mixed') r.snapshot.revision = 'other'
      if (broken && failure === 'cap') r.pagination.nextCursor = 'more'
      return r
    }
    const bad = await read(failure, ask, {})
    if (failure === 'null') assert.equal(bad.refusal.error.code, 'CONTENT_SOURCE_UNAVAILABLE')
    if (failure === 'cap') assert.equal(bad.truncated, true)
    broken = false
    const before = calls
    const recovered = await read(failure, ask, {})
    assert.equal(calls - before, 2)
    assert.equal(recovered.refusal, null)
  }
})
test('changedSince can require fresh rows without reusing dynamic lock metadata', async () => {
  const s = source(),
    read = createPageInventoryReader()
  await read('a', s.ask, {})
  await read('a', s.ask, {}, { reusable: false })
  assert.equal(s.reads(), 4)
})
