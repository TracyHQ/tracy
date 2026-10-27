import { test } from 'node:test'
import assert from 'node:assert/strict'
import { receiveHandoff } from '../src/client/handoff-entry.ts'
const BUILD = '11111111-2222-4333-8444-555555555555'
test('historical URLs remove their parameter and only read server receipts; an unaccepted prompt cannot be sent by the page', async () => {
  for (const accepted of [false, true]) {
    const urls = [],
      errors = [],
      calls = []
    receiveHandoff({
      location: { pathname: '/phoba.localhost/s/held-session', search: `?x=1&wo-handoff=${BUILD}` },
      api: {
        handOffState: async (id) => {
          calls.push(id)
          return {
            ok: true,
            status: 200,
            body: {
              handoff: {
                state: 'ready',
                prompt: 'Build this site',
                ...(accepted ? { promptSent: { requestId: 'accepted' } } : {})
              },
              site: { key: 'phoba.localhost' }
            }
          }
        }
      },
      replaceUrl: (url) => urls.push(url),
      onError: (code) => errors.push(code)
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual(urls, ['/phoba.localhost/s/held-session?x=1'])
    assert.deepEqual(calls, [BUILD])
    assert.deepEqual(errors, accepted ? [] : ['HANDOFF_NOT_READY'])
  }
})
