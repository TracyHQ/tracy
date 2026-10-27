/**
 * The background checks Find and My opportunities both run on the rows they show
 * (`src/client/check-polls.ts`): which websites and social pages are asked, in what order and how
 * many a call, what one answer gives back, and that a refusal stops the asking.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { askSiteChecks, askSocialStats, sitesToAsk, socialPagesToAsk } from '../src/client/check-polls.ts'

const row = (key, over = {}) => ({
  key,
  website: null,
  socials: null,
  social: null,
  siteCheck: null,
  score: { score: 0, grade: 'C', pending: false, reasons: [] },
  ...over
})

test('sitesToAsk: websites never checked, queued or left unqueued, best score first, each once, up to the batch', () => {
  const rows = [
    row('low', {
      website: 'https://low.example',
      score: { score: 10, grade: 'C', pending: true, reasons: [] }
    }),
    row('high', {
      website: 'https://high.example',
      score: { score: 80, grade: 'A', pending: true, reasons: [] }
    }),
    row('done', { website: 'https://done.example', siteCheck: { status: 'done' } }),
    row('queued', { website: 'https://queued.example', siteCheck: { status: 'queued' } }),
    row('twin', { website: 'https://high.example' }),
    row('none')
  ]
  assert.deepEqual(sitesToAsk(rows, 60), [
    'https://high.example',
    'https://low.example',
    'https://queued.example'
  ])
  assert.deepEqual(sitesToAsk(rows, 1), ['https://high.example'])
  assert.deepEqual(sitesToAsk([row('none')], 60), [])
})

test('socialPagesToAsk: linked pages with no numbers yet or queued; settled ones are not asked again', () => {
  const rows = [
    row('a', { socials: { facebook: 'https://facebook.com/a' } }),
    row('b', {
      socials: { instagram: 'https://instagram.com/b' },
      social: { instagram: { url: 'https://instagram.com/b', status: 'ok' } }
    }),
    row('c', {
      socials: { tiktok: 'https://tiktok.com/@c' },
      social: { tiktok: { url: 'https://tiktok.com/@c', status: 'queued' } }
    })
  ]
  assert.deepEqual(
    socialPagesToAsk(rows, 40).map((h) => h.url),
    ['https://facebook.com/a', 'https://tiktok.com/@c']
  )
})

test('askSiteChecks: the checks answered; a refusal that asking again cannot change stops the poll; a passing failure does not', async () => {
  const api = (answer) => ({ siteChecks: async (urls) => ({ ...answer, asked: urls }) })
  assert.deepEqual(
    await askSiteChecks(api({ ok: true, status: 200, body: { checks: { u: { status: 'done' } } } }), ['u']),
    {
      checks: { u: { status: 'done' } },
      stop: false
    }
  )
  assert.deepEqual(await askSiteChecks(api({ ok: false, status: 503, code: 'CHECKS_UNAVAILABLE' }), ['u']), {
    checks: null,
    stop: true
  })
  assert.deepEqual(await askSiteChecks(api({ ok: false, status: 0, code: 'NETWORK' }), ['u']), {
    checks: null,
    stop: false
  })
})

test('askSocialStats: pages asked and left out of the answer read as not queued; a refusal stops', async () => {
  const handles = [
    { network: 'facebook', url: 'https://facebook.com/a' },
    { network: 'instagram', url: 'https://instagram.com/b' }
  ]
  const ok = await askSocialStats(
    {
      socialStats: async () => ({
        ok: true,
        status: 200,
        body: { stats: { 'https://facebook.com/a': { status: 'done' } } }
      })
    },
    handles
  )
  assert.deepEqual(ok, {
    stats: {
      'https://facebook.com/a': { status: 'done' },
      'https://instagram.com/b': { status: 'not_queued' }
    },
    stop: false
  })
  const refused = await askSocialStats(
    { socialStats: async () => ({ ok: false, status: 429, code: 'RATE_LIMITED' }) },
    handles
  )
  assert.deepEqual(
    refused,
    {
      stats: {
        'https://facebook.com/a': { status: 'not_queued' },
        'https://instagram.com/b': { status: 'not_queued' }
      },
      stop: true
    },
    'a stopped poll leaves its pages to the button instead of "Checking…" (dev round L1)'
  )
})
