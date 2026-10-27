/**
 * The Add site wizard follows the server that keeps the person's sites (shard beta,
 * docs/sre/hop-dong-cua-shard.md §6, §12): a master answers `409 USE_SHARD {redirect}`, a full
 * shard answers `503 SHARD_FULL {createAt}`, and the wizard goes there instead of printing a
 * refusal nobody can act on. Only an absolute https URL the door itself sent is followed.
 *
 *   node --test packages/site/tracy-add-site/test/create-elsewhere.test.mjs
 */
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { createSite, elsewhereUrl } from '../src/client/create.ts'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const answer = (status, body) => {
  globalThis.fetch = async () => json(status, body)
}

test('409 USE_SHARD with a redirect is elsewhere, with that url', async () => {
  answer(409, { code: 'USE_SHARD', redirect: 'https://s1.tracy.ai/new/' })
  assert.deepEqual(await createSite('shop', 'wordpress'), {
    refusal: 'elsewhere',
    code: 'USE_SHARD',
    url: 'https://s1.tracy.ai/new/'
  })
  // A full shard of a person who already has one: the master's fresh-start door (contract §12).
  answer(409, { code: 'USE_SHARD', redirect: 'https://cowork.tracy.ai/new/?fresh=1' })
  assert.equal((await createSite('shop', 'wordpress')).url, 'https://cowork.tracy.ai/new/?fresh=1')
})

test('503 SHARD_FULL with createAt is elsewhere too, read before the 5xx rule', async () => {
  answer(503, { code: 'SHARD_FULL', message: 'full', createAt: 'https://cowork.tracy.ai/new/?fresh=1' })
  assert.deepEqual(await createSite('shop', 'wordpress'), {
    refusal: 'elsewhere',
    code: 'SHARD_FULL',
    url: 'https://cowork.tracy.ai/new/?fresh=1'
  })
})

test('a url that is not an absolute https one is not followed: the refusal is other, with no url', async () => {
  for (const redirect of [
    '/new/',
    'http://s1.tracy.ai/new/',
    'javascript:alert(1)',
    '//s1.tracy.ai/new/',
    7,
    undefined
  ]) {
    answer(409, { code: 'USE_SHARD', redirect })
    const outcome = await createSite('shop', 'wordpress')
    assert.equal(outcome.refusal, 'other', `redirect ${String(redirect)}`)
    assert.equal('url' in outcome, false)
  }
  answer(503, { code: 'SHARD_FULL' })
  assert.deepEqual(await createSite('shop', 'wordpress'), { refusal: 'other', code: 'SHARD_FULL' })
})

test('the codes are believed only on their own status (doorCode): a 503 USE_SHARD or a 409 SHARD_FULL decides nothing', async () => {
  answer(503, { code: 'USE_SHARD', redirect: 'https://s1.tracy.ai/new/' })
  assert.deepEqual(await createSite('shop', 'wordpress'), { refusal: 'other', code: 'HTTP_503' })
  answer(409, { code: 'SHARD_FULL', createAt: 'https://cowork.tracy.ai/new/?fresh=1' })
  assert.deepEqual(await createSite('shop', 'wordpress'), { refusal: 'other', code: 'HTTP_409' })
})

test('the refusals of today are untouched beside the new one', async () => {
  answer(409, { code: 'TAKEN' })
  assert.deepEqual(await createSite('shop', 'wordpress'), { refusal: 'taken', code: 'TAKEN' })
  answer(503, { code: 'HOST_UPDATING' })
  assert.deepEqual(await createSite('shop', 'wordpress'), { refusal: 'host_updating', code: 'HOST_UPDATING' })
  answer(401, { code: 'NOT_SIGNED_IN' })
  assert.equal((await createSite('shop', 'wordpress')).refusal, 'signed_out')
})

test('elsewhereUrl keeps an absolute https URL and nothing else', () => {
  assert.equal(elsewhereUrl('https://s1.tracy.ai/new/'), 'https://s1.tracy.ai/new/')
  assert.equal(elsewhereUrl('https://cowork.tracy.ai/new/?fresh=1'), 'https://cowork.tracy.ai/new/?fresh=1')
  for (const bad of [
    'http://s1.tracy.ai/new/',
    '/new/',
    'https://',
    'ftp://x',
    'javascript:alert(1)',
    '',
    null,
    1,
    {}
  ])
    assert.equal(elsewhereUrl(bad), null, `not followed: ${String(bad)}`)
})
