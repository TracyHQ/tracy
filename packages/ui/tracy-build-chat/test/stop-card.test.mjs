// The stop card at the end of the build chat (#575, `src/client/StopCard.tsx`): why in one plain sentence, the local
// time of a limit, Try again (disabled until that time, absent when the step may not run again) and Start over, and
// the start over door it calls. Rendered with `react-dom/server`; every value here is invented.
//
//   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/stop-card.test.mjs
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { bundleClient } from './bundle-client.mjs'

let lib
let done
before(async () => {
  ;({ lib, done } = await bundleClient(`
    import { createElement } from 'react'
    import { renderToStaticMarkup } from 'react-dom/server'
    import { StopCard, retryTimeOf } from './StopCard'
    import { startOverDraft, START_OVER_PATH } from './start-over'
    import { english } from './strings'
    export { english, retryTimeOf, startOverDraft, START_OVER_PATH }
    export const cardOf = (card, now = 0) =>
      renderToStaticMarkup(createElement(StopCard, {
        card, t: english, locale: 'en-GB', now, retry: async () => 'sent', startOver: async () => true
      }))`))
})
after(() => done?.())

const AT = '2026-11-17T15:30:00.000Z'
const buttons = (html) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1])

test('a fault: the notice of the mock with its sentence, Try again and Start over', () => {
  const html = lib.cardOf({ step: 'compose', limit: false, retryAt: null, retry: 'offered' })
  assert.match(html, /Your site is not finished yet/)
  assert.match(html, /This step could not finish, so I stopped here\. What I gathered so far is kept\./)
  assert.deepEqual(buttons(html), ['Try again', 'Start over'])
  assert.doesNotMatch(html, /disabled/)
  assert.match(html, /role="status"/)
})

test('a limit says the local time, and Try again waits for it', () => {
  const now = Date.parse(AT) - 30 * 60_000
  const html = lib.cardOf({ step: 'research', limit: true, retryAt: AT, retry: 'waiting' }, now)
  const time = lib.retryTimeOf(AT, 'en-GB', now)
  assert.ok(html.includes(`You can try again from ${time}.`), html)
  assert.match(html, /<button[^>]*disabled=""[^>]*>Try again<\/button>/)
  const open = lib.cardOf(
    { step: 'research', limit: true, retryAt: AT, retry: 'offered' },
    Date.parse(AT) + 1
  )
  assert.match(open, /You can try again now\./)
  assert.doesNotMatch(open, /disabled/)
})

test('the time of a limit follows the interface locale, with the day when it is not today', () => {
  const now = Date.parse(AT) - 60_000
  assert.equal(
    lib.retryTimeOf(AT, 'de-DE', now),
    new Intl.DateTimeFormat('de-DE', { hour: 'numeric', minute: '2-digit' }).format(new Date(AT))
  )
  const tomorrow = lib.retryTimeOf(AT, 'en-GB', now - 2 * 86_400_000)
  assert.match(tomorrow, /day/i, tomorrow)
})

test('a step that may not run again offers Start over only', () => {
  const html = lib.cardOf({ step: 'brand', limit: false, retryAt: null, retry: 'none' })
  assert.deepEqual(buttons(html), ['Start over'])
})

test('every sentence of the card has no dash', () => {
  for (const key of [
    'stop.fault',
    'stop.limit',
    'stop.limit.now',
    'stop.startOver.confirm',
    'stop.startOver.failed'
  ])
    assert.doesNotMatch(lib.english(key, { time: '10:00' }), /[\u2013\u2014]/)
})

test('Start over calls the existing door once, confirmed, from the chat it is pressed in', async () => {
  const sent = []
  const fetchImpl = async (url, init) => {
    sent.push({ url, init })
    return new Response(JSON.stringify({ started: true, open: '/new/build', say: 'x' }), { status: 200 })
  }
  assert.equal(await lib.startOverDraft('session-build-1', fetchImpl), '/new/build')
  assert.equal(sent[0].url, lib.START_OVER_PATH)
  assert.equal(sent[0].init.method, 'POST')
  assert.equal(sent[0].init.headers['x-tracy-session'], 'session-build-1')
  assert.deepEqual(JSON.parse(sent[0].init.body), { confirm: true })
  const refused = async () => new Response(JSON.stringify({ code: 'SITE_BUILT', say: 'x' }), { status: 409 })
  assert.equal(await lib.startOverDraft('session-build-1', refused), null)
  const elsewhere = async () => new Response(JSON.stringify({ started: true, open: '//elsewhere.example' }))
  assert.equal(
    await lib.startOverDraft('session-build-1', elsewhere),
    '/new/build',
    'never leaves the origin'
  )
})
