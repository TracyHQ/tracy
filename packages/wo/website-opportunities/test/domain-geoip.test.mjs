import { test } from 'node:test'
import assert from 'node:assert/strict'
import { approxLocationOf, isLocatableAddress } from '../domain/geoip.mjs'

const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('ipinfo answer becomes a labelled city-level point', async () => {
  const seen = []
  const fetch = async (url) => {
    seen.push(url)
    return json({ ip: '94.200.1.2', city: 'Dubai', region: 'Dubai', country: 'AE', loc: '25.0772,55.3093' })
  }
  const place = await approxLocationOf('94.200.1.2', { fetch, resolve })
  assert.deepEqual(place, {
    lat: 25.0772,
    lon: 55.3093,
    label: 'Dubai, United Arab Emirates',
    country: 'AE',
    accuracy: 'city',
    provider: 'ipinfo'
  })
  assert.deepEqual(seen, ['https://ipinfo.io/94.200.1.2/json'])
})

test('falls back to geojs when ipinfo fails or knows nothing', async () => {
  const fetch = async (url) =>
    url.startsWith('https://ipinfo.io/')
      ? json({ bogon: true })
      : json({
          city: 'Hoi An',
          region: 'Quang Nam',
          country: 'Vietnam',
          country_code: 'VN',
          latitude: '15.88',
          longitude: '108.33'
        })
  const place = await approxLocationOf('113.161.1.1', { fetch, resolve })
  assert.equal(place.provider, 'geojs')
  assert.equal(place.label, 'Hoi An, Quang Nam, Vietnam')
})

test('null ip asks about the egress address; private addresses are never sent out', async () => {
  const seen = []
  const fetch = async (url) => {
    seen.push(url)
    return json({ city: 'Dubai', country: 'AE', loc: '25.07,55.30' })
  }
  assert.equal(await approxLocationOf('172.18.0.1', { fetch, resolve }), null)
  assert.equal(await approxLocationOf('unknown', { fetch, resolve }), null)
  assert.deepEqual(seen, [])
  assert.equal((await approxLocationOf(null, { fetch, resolve })).label, 'Dubai, United Arab Emirates')
  assert.deepEqual(seen, ['https://ipinfo.io/json'])
})

test('no provider answers → null, and 0,0 counts as unknown', async () => {
  const fetch = async (url) =>
    url.includes('ipinfo') ? json({}, 429) : json({ latitude: '0', longitude: '0' })
  assert.equal(await approxLocationOf('8.8.8.8', { fetch, resolve }), null)
})

test('isLocatableAddress accepts public v4/v6 only', () => {
  assert.equal(isLocatableAddress('8.8.8.8'), true)
  assert.equal(isLocatableAddress('2a00:1450::1'), true)
  assert.equal(isLocatableAddress('10.0.0.1'), false)
  assert.equal(isLocatableAddress('::1'), false)
  assert.equal(isLocatableAddress('nope'), false)
})
