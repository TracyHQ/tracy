import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beginRealQuery, acceptRealQuery } from '../src/invitations/real-state.ts'
import { realRequest, uploadReal } from '../src/invitations/real-api.ts'

test('a delayed response cannot cross campaigns or groups, and filters reset pagination without clearing dirty edits', () => {
  const initial = { campaignId: 'a', group: '', queryId: 0, recipients: [], cursor: 'old', dirty: true }
  const a = beginRealQuery(initial, { campaignId: 'a', group: 'group_2' })
  const b = beginRealQuery(a.state, { campaignId: 'b', group: 'group_1' })
  const page = { items: [{ id: 'private-a' }], nextCursor: 'next', revision: 3, total: 1 }
  assert.deepEqual(acceptRealQuery(b.state, a.token, page), b.state)
  assert.equal(b.state.cursor, null)
  assert.deepEqual(b.state.recipients, [])
  assert.equal(b.state.dirty, true)
  const accepted = acceptRealQuery(b.state, b.token, page)
  assert.equal(accepted.recipients[0].id, 'private-a')
  assert.equal(accepted.cursor, 'next')
})
test('binary upload carries ASCII-safe metadata, JSON search stays in body, and errors never echo response messages', async () => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return new Response(
      JSON.stringify({ code: 'REAL_STALE_REVISION', message: 'Private synthetic detail' }),
      { status: 409 }
    )
  }
  try {
    await assert.rejects(
      uploadReal({ path: '/imports/preview', bytes: new Uint8Array([1]), metadata: { name: 'Synthetic Ω' } }),
      (e) => e.status === 409 && !e.message.includes('Private')
    )
    assert.equal(calls[0].options.credentials, 'same-origin')
    assert.deepEqual(JSON.parse(decodeURIComponent(calls[0].options.headers['x-invitations-input'])), {
      name: 'Synthetic Ω'
    })
    assert.equal(calls[0].options.headers['content-type'], 'application/octet-stream')
    await assert.rejects(
      realRequest({
        path: '/campaigns/a/recipients/query',
        method: 'POST',
        body: { search: 'synthetic@example.test' }
      })
    )
    assert.ok(!calls[1].url.includes('synthetic'))
    assert.equal(JSON.parse(calls[1].options.body).search, 'synthetic@example.test')
  } finally {
    globalThis.fetch = original
  }
})
