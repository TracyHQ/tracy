import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDetails, parseConsumeResult, createResetCreditService } from '../lib/reset-credits.js'

test('#85: parseDetails picks available unexpired credit (earliest expiry first)', () => {
  const now = 1_000_000
  const details = parseDetails({
    available_count: 2,
    credits: [
      { id: 'late', status: 'AVAILABLE', expires_at: 5_000 },
      { id: 'early', status: 'available', expires_at: 2_000 },
      { id: 'spent', status: 'redeemed', expires_at: 1_000 },
      { id: 'gone', status: 'available', expires_at: 100 },
    ],
  }, now)
  assert.equal(details.creditId, 'early')
  assert.equal(details.availableCount, 2)
})

test('#85: parseDetails rejects zero availability', () => {
  assert.throws(() => parseDetails({ available_count: 0, credits: [] }, 0))
  assert.throws(() => parseDetails(null, 0))
})

test('#85: parseConsumeResult codes', () => {
  assert.equal(parseConsumeResult({ code: 'reset', windows_reset: 2 }).code, 'reset')
  assert.deepEqual(parseConsumeResult({ code: 'nothing_to_reset' }).windowsReset, [])
  assert.throws(() => parseConsumeResult({ code: 'wat' }))
})

function makeService(nowRef, fetchCalls) {
  return createResetCreditService({
    loadBlob: async () => ({ accessToken: 'at', accountId: 'acc1' }),
    fetchImpl: async (url, opts) => {
      fetchCalls.push({ url, opts })
      if (url.endsWith('/rate-limit-reset-credits')) {
        return { ok: true, json: async () => ({ available_count: 1, credits: [{ id: 'c1', status: 'available', expires_at: 100000 }] }) }
      }
      return { ok: true, json: async () => ({ code: 'reset', windows_reset: 1 }) }
    },
    now: () => nowRef.t,
    randomId: (() => { let n = 0; return () => 'id' + (++n) })(),
  })
}

test('#85: full challenge flow - cooldown, ack gate, single-flight', async () => {
  const nowRef = { t: 10_000 }
  const calls = []
  const svc = makeService(nowRef, calls)
  const prep = await svc.prepare('CODEX_OAUTH_1')
  assert.equal(prep.availableCount, 1)
  assert.equal(prep.readyAt, 15_000)

  await assert.rejects(() => svc.consume({ challengeId: prep.challengeId, acknowledged: true }), /wait before/)

  nowRef.t = 15_001
  await assert.rejects(() => svc.consume({ challengeId: prep.challengeId, acknowledged: false }), /acknowledge/)
  const result = await svc.consume({ challengeId: prep.challengeId, acknowledged: true })
  assert.equal(result.code, 'reset')
  assert.equal(calls.filter((c) => c.url.endsWith('/consume')).length, 1)
  await assert.rejects(() => svc.consume({ challengeId: prep.challengeId, acknowledged: true }), /no longer valid/)
})

test('#85: rapid double consume is blocked by the pending gate', async () => {
  const nowRef = { t: 10_000 }
  const calls = []
  const svc = makeService(nowRef, calls)
  const prep = await svc.prepare('CODEX_OAUTH_1')
  nowRef.t = 15_001
  const first = svc.consume({ challengeId: prep.challengeId, acknowledged: true })
  await assert.rejects(() => svc.consume({ challengeId: prep.challengeId, acknowledged: true }), /already in progress/)
  await first
  assert.equal(calls.filter((c) => c.url.endsWith('/consume')).length, 1)
})
