import assert from 'node:assert/strict'
import { test } from 'node:test'
import { en } from '../src/i18n/ns/team.ts'
import { startViewAs, viewAsErrorKey } from '../src/view-as-user-api.ts'

const answer = (status, body) => async () => new Response(JSON.stringify(body), { status })

test('a started view answers its url', async () => {
  let sent
  const fetchImpl = async (url, init) => {
    sent = { url, init }
    return new Response(JSON.stringify({ url: 'https://x.test/' }), { status: 200 })
  }
  assert.deepEqual(await startViewAs('a@b.c', fetchImpl), {
    ok: true,
    url: 'https://x.test/'
  })
  assert.equal(sent.url, '/api/ops/view-as')
  assert.equal(sent.init.method, 'POST')
  assert.deepEqual(JSON.parse(sent.init.body), { email: 'a@b.c' })
})

test('a refusal answers the door’s code, and every code has words', async () => {
  const refused = await startViewAs('a@b.c', answer(403, { code: 'STAFF_TARGET' }))
  assert.deepEqual(refused, { ok: false, code: 'STAFF_TARGET' })
  for (const code of ['NO_SUCH_ACCOUNT', 'STAFF_TARGET', 'SELF', 'FORBIDDEN', 'FAILED', 'SOMETHING_NEW']) {
    assert.ok(en[viewAsErrorKey(code)]?.length > 10, code)
  }
  assert.equal(
    viewAsErrorKey('SOMETHING_NEW'),
    viewAsErrorKey('FAILED'),
    'an unknown code reads as a failure'
  )
})

test('a bare 403 or a dead network never throws', async () => {
  assert.deepEqual(await startViewAs('a@b.c', async () => new Response(null, { status: 403 })), {
    ok: false,
    code: 'FORBIDDEN'
  })
  assert.deepEqual(
    await startViewAs('a@b.c', async () => {
      throw new Error('offline')
    }),
    { ok: false, code: 'FAILED' }
  )
})
