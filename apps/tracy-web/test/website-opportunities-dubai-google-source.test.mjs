// Synthetic Google responses and isolated Postgres only; no paid calls.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { fileDb } from './_db.mjs'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createDubaiGoogleSource } from 'website-opportunities/src/dubai-google-source.js'

const db = fileDb()
const opts = { skip: !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)
const one = async (sql) => (await db.pool.query(sql)).rows[0]
const candidate = (id) => ({
  id: `google-${id}`,
  displayName: { text: `Restaurant ${id}` },
  primaryType: 'restaurant',
  businessStatus: 'OPERATIONAL',
  location: { latitude: 25.198, longitude: 55.275 },
  websiteUri: `https://restaurant${id}.example.test`
})
async function setup({ fetchImpl, key = 'synthetic-key', daily = 100, loadDomain } = {}) {
  await db.pool.query(`insert into wo_prefetch_campaign(id,seed_source,selection_rule)
    values('dubai','{}','Synthetic source') on conflict do nothing`)
  let calls = 0
  const ledger = createCostLedger({
    pool: db.pool,
    caps: async () => ({ dailyCapCents: daily, jobCapCents: 15 })
  })
  const source = createDubaiGoogleSource({
    pool: db.pool,
    ledger,
    runtime: async () => ({ keys: { google: key } }),
    loadDomain: loadDomain ?? websiteOpportunitiesDomain,
    resolve: async () => [{ address: '8.8.8.8', family: 4 }],
    fetchImpl: async (...args) => {
      calls++
      return fetchImpl(...args)
    }
  })
  return { source, calls: () => calls, ledger }
}

test(
  'three Google pages reuse purchased receipts across import retries and keep original age',
  opts,
  async () => {
    const fixture = await setup({
      fetchImpl: async (_url, init) => {
        const index = Number(JSON.parse(init.body).pageToken ?? 0)
        return Response.json({
          places: Array.from({ length: 20 }, (_, n) => candidate(index * 20 + n)),
          ...(index < 2 ? { nextPageToken: String(index + 1) } : {})
        })
      }
    })
    const first = await fixture.source()
    assert.equal(first.candidates.length, 60)
    assert.equal(first.source.pages, 3)
    const second = await fixture.source()
    assert.equal(fixture.calls(), 3)
    assert.deepEqual(second, first)
    assert.deepEqual(
      await one('select count(*)::int as calls,sum(reserved_cents)::int as ceiling from wo_cost_ledger'),
      { calls: 3, ceiling: 15 }
    )
  }
)

test('concurrent importers admit one POST, and a timeout remains unknown after restart', opts, async () => {
  let entered, release
  const started = new Promise((r) => {
    entered = r
  })
  const barrier = new Promise((r) => {
    release = r
  })
  const fixture = await setup({
    fetchImpl: async () => {
      entered()
      await barrier
      throw new Error('timeout')
    }
  })
  const first = fixture.source()
  const rejected = assert.rejects(first, /PREFETCH_SOURCE_RECEIPT_UNKNOWN/)
  await started
  await assert.rejects(fixture.source(), /PREFETCH_SOURCE_RECEIPT_UNKNOWN/)
  release()
  await rejected
  await assert.rejects(fixture.source(), /PREFETCH_SOURCE_RECEIPT_UNKNOWN/)
  assert.equal(fixture.calls(), 1)
  assert.equal((await one('select state from wo_cost_ledger')).state, 'unreconciled')
})

test('a received error is replayed without another provider POST', opts, async () => {
  const fixture = await setup({
    fetchImpl: async () => Response.json({ error: 'service disabled' }, { status: 403 })
  })
  await assert.rejects(fixture.source(), /HTTP 403/)
  await assert.rejects(fixture.source(), /HTTP 403/)
  assert.equal(fixture.calls(), 1)
  assert.equal((await one('select state from wo_prefetch_source_page')).state, 'received')
})

test('missing credential and a refused budget send no requests', opts, async () => {
  const fetchImpl = () => {
    throw new Error('Unexpected provider request')
  }
  await assert.rejects((await setup({ key: null, fetchImpl })).source(), /CREDENTIAL_MISSING/)
  const fixture = await setup({ daily: 4, fetchImpl })
  await assert.rejects(fixture.source(), /research budget exceeded/)
  assert.equal(fixture.calls(), 0)
  assert.equal((await one('select count(*)::int as n from wo_cost_ledger')).n, 0)
  assert.equal((await one('select state from wo_prefetch_source_page')).state, 'planned')
})

test('a changed request or fourth page cannot create another paid start', opts, async () => {
  const domain = await websiteOpportunitiesDomain()
  const fixture = await setup({
    loadDomain: async () => ({
      ...domain,
      searchPlacesText: async (_query, deps) => {
        for (let n = 0; n < 4; n++)
          await deps.fetch(domain.GPLACES_TEXT_URL, {
            method: 'POST',
            headers: { 'x-goog-fieldmask': domain.GPLACES_TEXT_FIELDS },
            body: JSON.stringify({ page: n })
          })
      }
    }),
    fetchImpl: async () => Response.json({ places: [] })
  })
  await assert.rejects(fixture.source(), /PREFETCH_UNEXPECTED_PROVIDER_REQUEST/)
  assert.equal(fixture.calls(), 3)
  await db.pool.query("update wo_prefetch_source_page set request_hash='changed' where page=0")
  await assert.rejects(fixture.source(), /PREFETCH_SOURCE_REQUEST_CHANGED/)
  assert.equal(fixture.calls(), 3)
})

test('atomic admission rolls back a reservation if its receipt checkpoint fails', opts, async () => {
  const fixture = await setup({ fetchImpl: async () => Response.json({ places: [] }) })
  await assert.rejects(
    fixture.ledger.reserve(
      { provider: 'google', operation: 'place-search-text', maxCents: 5 },
      {
        onAdmitted: async () => {
          throw new Error('checkpoint lost')
        }
      }
    ),
    /checkpoint lost/
  )
  assert.equal((await one('select count(*)::int as n from wo_cost_ledger')).n, 0)
})

test('receipt-only upgrade refuses a missing next page without purchasing it', opts, async () => {
  const fixture = await setup({
    daily: 5,
    fetchImpl: async () =>
      Response.json({
        places: Array.from({ length: 20 }, (_, n) => candidate(n)),
        nextPageToken: 'second-page'
      })
  })
  await assert.rejects(fixture.source(), /research budget exceeded/)
  assert.equal(fixture.calls(), 1)
  await db.pool.query("delete from wo_prefetch_source_page where state='planned'")
  const purchased = await one('select count(*)::int as n from wo_cost_ledger')
  await assert.rejects(fixture.source({ receivedOnly: true }), /PREFETCH_RECEIVED_SOURCE_REQUIRED/)
  assert.equal(fixture.calls(), 1)
  assert.deepEqual(await one('select count(*)::int as n from wo_cost_ledger'), purchased)
  assert.equal((await one('select count(*)::int as n from wo_prefetch_source_page where page=0')).n, 1)
  assert.equal((await one('select state from wo_prefetch_source_page where page=1')).state, 'planned')
})

test(
  'receipt-only replay preserves all purchased pages, their original age and response hash',
  opts,
  async () => {
    const fixture = await setup({
      fetchImpl: async (_url, init) => {
        const page = Number(JSON.parse(init.body).pageToken ?? 0)
        return Response.json({
          places: Array.from({ length: 20 }, (_, n) => candidate(page * 20 + n)),
          ...(page < 2 ? { nextPageToken: String(page + 1) } : {})
        })
      }
    })
    const purchased = await fixture.source()
    const before = (
      await db.pool.query(
        'select page,request_hash,response,received_at from wo_prefetch_source_page order by page'
      )
    ).rows
    const replayed = await fixture.source({ receivedOnly: true })
    assert.deepEqual(replayed, purchased)
    assert.equal(replayed.source.pages, 3)
    assert.equal(replayed.candidates.length, 60)
    assert.equal(fixture.calls(), 3)
    assert.deepEqual(
      (
        await db.pool.query(
          'select page,request_hash,response,received_at from wo_prefetch_source_page order by page'
        )
      ).rows,
      before
    )
    assert.equal((await one('select count(*)::int as n from wo_cost_ledger')).n, 3)
  }
)

test('receipt-only discovery cannot purchase an absent first receipt', opts, async () => {
  const fixture = await setup({
    fetchImpl: async () => {
      throw new Error('Unexpected provider request')
    }
  })
  await assert.rejects(fixture.source({ receivedOnly: true }), /PREFETCH_RECEIVED_SOURCE_REQUIRED/)
  assert.equal(fixture.calls(), 0)
  assert.equal((await one('select count(*)::int as n from wo_cost_ledger')).n, 0)
  assert.equal((await one('select state from wo_prefetch_source_page')).state, 'planned')
})

test('receipt-only upgrade leaves an unknown paid receipt blocked without a new start', opts, async () => {
  const fixture = await setup({
    fetchImpl: async () => {
      throw new Error('Synthetic timeout after admission')
    }
  })
  await assert.rejects(fixture.source(), /PREFETCH_SOURCE_RECEIPT_UNKNOWN/)
  const before = await one('select id,state,reserved_cents from wo_cost_ledger')
  await assert.rejects(fixture.source({ receivedOnly: true }), /PREFETCH_RECEIVED_SOURCE_REQUIRED/)
  assert.equal(fixture.calls(), 1)
  assert.deepEqual(await one('select id,state,reserved_cents from wo_cost_ledger'), before)
  assert.equal(before.state, 'unreconciled')
  assert.equal((await one('select state from wo_prefetch_source_page')).state, 'starting')
})
