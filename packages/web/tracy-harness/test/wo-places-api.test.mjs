// /ops/wo › Places (`src/WoPlaces.tsx`): the doors' client and the pure helpers the tab shows them with.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addSocialPage,
  fetchAgainPreview,
  fetchPlaces,
  judgeSocialPage,
  researchAgain,
  researchAgainMany,
  saveResearchCaps,
  setMediaRevoked
} from '../src/wo-places-api.ts'
import {
  centsOfDollars,
  committedCents,
  formatCents,
  againTallyLine,
  oldestCollection,
  pagesToJudge,
  failureText,
  placeRowOf
} from '../src/wo-places-format.ts'
import { en } from '../src/i18n/ns/wo-places.ts'
import { translate } from '../src/i18n/translator.ts'

/** The screens' English, as `useT()` reads it with no language loaded. */
const t = (key, params) => translate('en', {}, en, key, params)

const PLACE = {
  id: '6a1f0000-0000-4000-8000-000000000001',
  name: 'Pho Ba',
  identities: [
    { namespace: 'url', externalId: 'https://pho.example' },
    { namespace: 'google', externalId: 'ChIJpho' }
  ],
  sources: [
    { source: 'website', collectedAt: '2026-10-16T09:00:00.000Z' },
    { source: 'instagram', collectedAt: '2026-09-09T09:00:00.000Z' }
  ]
}

test('money reads in dollars; what the operator types becomes whole cents or nothing', () => {
  assert.equal(formatCents(1734), '$17.34')
  assert.equal(formatCents(0), '$0.00')
  assert.equal(formatCents(null), '—')
  assert.equal(centsOfDollars('20'), 2000)
  assert.equal(centsOfDollars(' $0.25 '), 25)
  assert.equal(centsOfDollars('20.5'), 2050)
  assert.equal(centsOfDollars('-1'), null)
  assert.equal(centsOfDollars('1.234'), null)
  assert.equal(centsOfDollars('ten'), null)
  assert.equal(committedCents({ spentCents: 17, reservedCents: 40, unreconciledCents: 7 }), 64)
})

test('the oldest collection is what freshness is measured from; a never-collected source has none', () => {
  assert.equal(oldestCollection(PLACE), '2026-09-09T09:00:00.000Z')
  assert.equal(oldestCollection({ sources: [{ source: 'website', collectedAt: null }] }), null)
})

test('a place row names the Google place and its website, and invents no search facts', () => {
  const row = placeRowOf(t, PLACE)
  assert.equal(row.key, PLACE.id)
  assert.equal(row.provider, 'google-places')
  assert.equal(row.providerId, 'ChIJpho')
  assert.equal(row.website, 'https://pho.example')
  assert.equal(row.mapsUrl, 'https://www.google.com/maps/place/?q=place_id:ChIJpho')
  assert.equal(row.score.pending, true)
  assert.equal(row.kind, null)
  assert.equal(
    placeRowOf(t, { ...PLACE, name: null, identities: [PLACE.identities[0]] }).name,
    'https://pho.example'
  )
})

function recorder(answers) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined })
    const next = answers.shift()
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 })
  }
  return { calls, fetchImpl }
}

test('the list door gets only the filters that are set', async () => {
  const { calls, fetchImpl } = recorder([{ body: { places: [] } }, { body: { places: [] } }])
  await fetchPlaces({ state: 'all' }, fetchImpl)
  await fetchPlaces({ q: 'pho', state: 'stale', cursor: 'abc', limit: 50 }, fetchImpl)
  assert.deepEqual(
    calls.map((c) => c.url),
    ['/api/ops/wo/places', '/api/ops/wo/places?q=pho&state=stale&cursor=abc&limit=50']
  )
})

test('saving the caps keeps every other setting: the settings door replaces the whole object', async () => {
  const { calls, fetchImpl } = recorder([
    { body: { settings: { defaultRadiusM: 3500, researchDailyCapCents: 2000, webSearchProvider: 'jina' } } },
    { body: { settings: {} } }
  ])
  await saveResearchCaps(
    { researchDailyCapCents: 5000, researchJobCapCents: 300, newPlacesPerAccountPerDay: 12 },
    fetchImpl
  )
  assert.equal(calls[1].url, '/api/ops/wo/settings')
  assert.equal(calls[1].method, 'PUT')
  assert.deepEqual(calls[1].body, {
    settings: {
      defaultRadiusM: 3500,
      webSearchProvider: 'jina',
      researchDailyCapCents: 5000,
      researchJobCapCents: 300,
      newPlacesPerAccountPerDay: 12
    }
  })
})

test('a refused action surfaces the server message', async () => {
  const { calls, fetchImpl } = recorder([
    {
      status: 400,
      body: { error: 'INVALID_REASON', message: 'A revoke needs a reason of 1–500 characters.' }
    }
  ])
  await assert.rejects(setMediaRevoked('p1', 'm1', true, '', fetchImpl), /needs a reason/)
  assert.deepEqual(calls[0], {
    url: '/api/ops/wo/places/p1/media/m1/revoke',
    method: 'POST',
    body: { reason: '' }
  })
})

const PLAN = {
  run: [
    { part: 'instagram-search', reason: 'never', ceilingCents: 4 },
    { part: 'tripadvisor', reason: 'failed', ceilingCents: 2 }
  ],
  kept: [{ part: 'website', reason: 'none' }],
  ceilingCents: 6
}

test('the Research again preview is read, not run', async () => {
  const { calls, fetchImpl } = recorder([{ body: { plan: PLAN, payer: 'operator' } }])
  const preview = await fetchAgainPreview('p1', fetchImpl)
  assert.equal(preview.plan.ceilingCents, 6)
  assert.deepEqual(calls[0], { url: '/api/ops/wo/places/p1/research-again', method: 'GET', body: undefined })
})

test('Research again runs, or answers that nothing was due; any other refusal is an error', async () => {
  const { calls, fetchImpl } = recorder([
    { body: { ok: true, job: { id: 'j1', state: 'queued', force: false }, joined: false, plan: PLAN } },
    {
      status: 409,
      body: { error: 'NOTHING_DUE', message: 'Everything is up to date.', plan: { ...PLAN, run: [] } }
    },
    { status: 409, body: { error: 'DAILY_CAP_REACHED', message: 'Today’s research budget is spent.' } }
  ])
  const ran = await researchAgain('p1', fetchImpl)
  assert.equal(ran.outcome, 'ran')
  assert.equal(ran.job.id, 'j1')
  const fresh = await researchAgain('p1', fetchImpl)
  assert.equal(fresh.outcome, 'up-to-date')
  assert.deepEqual(fresh.plan.run, [])
  await assert.rejects(researchAgain('p1', fetchImpl), /budget is spent/)
  assert.deepEqual(calls[0], { url: '/api/ops/wo/places/p1/research-again', method: 'POST', body: {} })
})

test('Research again on many places counts what ran, what was up to date and what failed', async () => {
  const { calls, fetchImpl } = recorder([
    { body: { ok: true, job: { id: 'j1', state: 'queued', force: false }, joined: false, plan: PLAN } },
    { status: 409, body: { error: 'NOTHING_DUE', message: 'Up to date.', plan: PLAN } },
    { status: 409, body: { error: 'PLACE_MERGED', message: 'This place was merged.' } }
  ])
  const tally = await researchAgainMany(['a', 'b', 'c'], fetchImpl, 1)
  assert.deepEqual(
    calls.map((c) => c.url),
    [
      '/api/ops/wo/places/a/research-again',
      '/api/ops/wo/places/b/research-again',
      '/api/ops/wo/places/c/research-again'
    ]
  )
  assert.equal(tally.ran, 1)
  assert.equal(tally.upToDate, 1)
  assert.deepEqual(tally.failed, [{ id: 'c', message: 'This place was merged.' }])
  assert.equal(againTallyLine(t, tally), '1 ran, 1 up to date, 1 failed: This place was merged.')
  assert.equal(againTallyLine(t, { ran: 3, upToDate: 0, failed: [] }), '3 ran')
})

test('a verdict on a searched page is sent with its url', async () => {
  const { calls, fetchImpl } = recorder([{ body: { ok: true, page: { url: 'u', verdict: 'rejected' } } }])
  await judgeSocialPage('p1', 'https://www.instagram.com/kiramdubai', 'reject', fetchImpl)
  assert.deepEqual(calls[0], {
    url: '/api/ops/wo/places/p1/social-pages',
    method: 'POST',
    body: { url: 'https://www.instagram.com/kiramdubai', verdict: 'reject' }
  })
})

test('a social page the search did not find is added by its url', async () => {
  const { calls, fetchImpl } = recorder([
    { body: { ok: true, link: { kind: 'facebook', url: 'https://www.facebook.com/kirami' }, added: true } }
  ])
  const out = await addSocialPage('p1', ' https://www.facebook.com/kirami ', fetchImpl)
  assert.deepEqual(calls[0], {
    url: '/api/ops/wo/places/p1/social-pages/add',
    method: 'POST',
    body: { url: 'https://www.facebook.com/kirami' }
  })
  assert.equal(out.added, true)
})

test('only the pages a search left pending wait for a verdict', () => {
  const source = {
    source: 'instagram-search',
    pages: [
      {
        url: 'https://www.instagram.com/a',
        network: 'instagram',
        verdict: 'pending',
        evidence: { reasons: ['name_near'] }
      },
      { url: 'https://www.instagram.com/b', network: 'instagram', verdict: 'confirmed' },
      { url: 'https://www.instagram.com/c', network: 'instagram', verdict: 'rejected' }
    ]
  }
  assert.deepEqual(
    pagesToJudge(source).map((p) => p.url),
    ['https://www.instagram.com/a']
  )
  assert.deepEqual(pagesToJudge({ source: 'website' }), [])
})

test('Read menu again previews and runs Research again limited to the two menu parts', async () => {
  const { calls, fetchImpl } = recorder([
    { body: { plan: PLAN, payer: 'operator' } },
    { body: { ok: true, job: { id: 'j2', state: 'queued', force: false }, joined: false, plan: PLAN } }
  ])
  await fetchAgainPreview('p1', fetchImpl, ['menu-file', 'menu-photos'])
  await researchAgain('p1', fetchImpl, ['menu-file', 'menu-photos'])
  assert.deepEqual(calls, [
    {
      url: '/api/ops/wo/places/p1/research-again?parts=menu-file%2Cmenu-photos',
      method: 'GET',
      body: undefined
    },
    {
      url: '/api/ops/wo/places/p1/research-again',
      method: 'POST',
      body: { parts: ['menu-file', 'menu-photos'] }
    }
  ])
})

test('a door that fails with no message of its own is worded on screen, also inside a bulk run', async () => {
  const silent = async () => new Response('', { status: 502 })
  const error = await setMediaRevoked('p1', 'm1', false, '', silent).catch((e) => e)
  assert.equal(failureText(t, error), 'Failed to restore the media (HTTP 502)')
  assert.equal(failureText(t, new Error('Said by the server.')), 'Said by the server.')
  const tally = await researchAgainMany(['a'], silent)
  assert.equal(againTallyLine(t, tally), '1 failed: Failed to research the place again (HTTP 502)')
})

test('money follows the screen language and reads as before in English', () => {
  assert.equal(formatCents(123456), '$1234.56', 'no grouping, as before')
  assert.equal(formatCents(1734, 'de-DE').replace(/\s/g, ' '), '17,34 $')
})
