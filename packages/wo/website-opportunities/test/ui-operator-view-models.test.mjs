// The operator page's pure view models (ui/public/operator-view-models.js): money, caps, keys, order moves, queue rows.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  breakdownRows,
  capMeter,
  centsText,
  dollarsToCents,
  keyRowView,
  moveInOrder,
  operatorTabs,
  orderRows,
  queueRowView,
  usageView
} from '../ui/public/operator-view-models.js'

test('cents read as dollars, a missing amount as a dash', () => {
  assert.equal(centsText(0), '$0.00')
  assert.equal(centsText(1234), '$12.34')
  assert.equal(centsText(5), '$0.05')
  assert.equal(centsText(null), '—')
})

test('dollars typed by a person become whole cents; anything else is refused', () => {
  assert.equal(dollarsToCents('12.34'), 1234)
  assert.equal(dollarsToCents('0'), 0)
  assert.equal(dollarsToCents(' 3 '), 300)
  assert.equal(dollarsToCents('-1'), null)
  assert.equal(dollarsToCents('abc'), null)
  assert.equal(dollarsToCents(''), null)
  assert.equal(dollarsToCents('1.005'), null)
})

test('a cap meter warns near the cap and says when paid research is off', () => {
  assert.deepEqual(capMeter(500, 2000), { text: '$5.00 of $20.00', ratio: 0.25, tone: 'ok' })
  assert.equal(capMeter(1700, 2000).tone, 'warn')
  assert.equal(capMeter(2100, 2000).tone, 'bad')
  assert.equal(capMeter(2100, 2000).ratio, 1)
  assert.deepEqual(capMeter(0, 0), { text: 'Paid research is off (cap $0.00)', ratio: 1, tone: 'bad' })
})

test('breakdown rows name an unlabelled purpose and flag unreconciled calls', () => {
  const rows = breakdownRows(
    [
      { purpose: 'research', calls: 2, committedCents: 16, unreconciledCalls: 0 },
      { purpose: null, calls: 1, committedCents: 5, unreconciledCalls: 1 }
    ],
    'purpose'
  )
  assert.deepEqual(rows, [
    { label: 'research', calls: '2 calls', amount: '$0.16', flag: null },
    { label: 'Not labelled', calls: '1 call', amount: '$0.05', flag: '1 unreconciled' }
  ])
})

test('a key row says where the key comes from and what the operator may do', () => {
  assert.deepEqual(keyRowView('apify', { configured: true, source: 'ops', hint: 'api… (18 chars)' }, true), {
    label: 'Apify',
    status: 'Saved here · api… (18 chars)',
    tone: 'ok',
    editable: true
  })
  assert.equal(
    keyRowView('google', { configured: true, source: 'env', hint: 'AIz… (39 chars)' }, false).status,
    'From the environment · AIz… (39 chars)'
  )
  assert.deepEqual(keyRowView('serpapi', { configured: false, source: null, hint: null }, false), {
    label: 'SerpApi',
    status: 'Not set',
    tone: 'neutral',
    editable: false
  })
})

test('moving a provider in an order never loses or duplicates one', () => {
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c'])
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b'])
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c'])
  assert.deepEqual(moveInOrder(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c'])
})

test('order rows list the providers in use first, then the ones left out', () => {
  const group = {
    order: ['apify', 'scrapecreators'],
    providers: [
      { id: 'scrapecreators', label: 'ScrapeCreators', state: 'connected' },
      { id: 'rapidapi-scraper3', label: 'Scraper3', state: 'missing_key' },
      {
        id: 'apify',
        label: 'Apify',
        state: 'error',
        lastError: { reason: 'credential_invalid', at: '2026-10-23T10:00:00Z' }
      }
    ]
  }
  assert.deepEqual(
    orderRows(group).map((r) => [r.id, r.inUse, r.stateText, r.tone]),
    [
      ['apify', true, 'Last call failed: credential_invalid', 'bad'],
      ['scrapecreators', true, 'Connected', 'ok'],
      ['rapidapi-scraper3', false, 'Key missing', 'neutral']
    ]
  )
})

test('queue rows: retry for a stopped job, cancel for a waiting one', () => {
  const failed = queueRowView({
    placeName: 'Cafe B',
    state: 'failed',
    stage: 'collection',
    error: 'X: y',
    retryable: true,
    cancellable: false
  })
  assert.deepEqual(failed, {
    title: 'Cafe B',
    state: 'Failed',
    tone: 'bad',
    detail: 'X: y',
    actions: ['retry']
  })
  const queued = queueRowView({
    placeName: null,
    state: 'queued',
    stage: 'discovery',
    retryable: false,
    cancellable: true
  })
  assert.deepEqual(queued, {
    title: 'Unnamed place',
    state: 'Waiting',
    tone: 'busy',
    detail: null,
    actions: ['cancel']
  })
})

test('the Hub tab exists only where the server serves the hub', () => {
  assert.deepEqual(operatorTabs({ hub: false }), ['settings', 'spend', 'queue'])
  assert.deepEqual(operatorTabs({ hub: true }), ['settings', 'spend', 'queue', 'hub'])
  assert.deepEqual(operatorTabs({ hub: true, tracy: true }), ['settings', 'spend', 'queue', 'hub', 'tracy'])
})

test('quota use reads against the limits, with no limit said in words', () => {
  assert.deepEqual(
    usageView(
      { read_places: { day: 7, month: 70 }, observations: { day: 1, month: 2 } },
      {
        read_places: { day: 500, month: 10000 },
        observations: { day: 500, month: null }
      }
    ),
    [
      { label: 'Place reads', day: '7 / 500', month: '70 / 10000' },
      { label: 'Observations sent', day: '1 / 500', month: '2 / no limit' }
    ]
  )
})
