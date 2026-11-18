// A link-in-bio page read once (`domain/link-in-bio.mjs`): the links it lists sorted into social pages, booking links
// and menus, each with the page it came from; bounded in pages, time and links; a read that points at none unchanged.
// The pages are fixtures served by a fake fetch: no network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bioPageLinks, expandLinkPages, readBioPage, sortBioLinks } from '../domain/link-in-bio.mjs'

const fixture = (name) => readFileSync(new URL(`./fixtures/link-in-bio/${name}`, import.meta.url), 'utf8')
const SALON = fixture('linktree-salon.html')
const CAFE = fixture('beacons-restaurant.html')
const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const html = (body) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })

/** A fake web: each URL's response, every request recorded. */
function web(pages) {
  const calls = []
  const fetch = async (url, init) => {
    calls.push(url)
    const page = pages[url]
    if (typeof page === 'function') return page(url, init)
    return page === undefined ? new Response('', { status: 404 }) : html(page)
  }
  return { fetch, calls }
}

test('a Linktree page lists its links in page order, without the platform its own and its pictures', () => {
  const links = bioPageLinks(SALON, 'https://linktr.ee/harbourcuts')
  assert.deepEqual(
    links.map((l) => l.url),
    [
      'https://www.fresha.com/a/harbour-cuts-bristol-12-quay-street-abc123',
      'https://harbourcuts.test/files/salon-2026.pdf',
      'https://harbourcuts.test/gift-cards',
      'https://www.instagram.com/harbourcuts/',
      'https://www.facebook.com/harbourcutsbristol',
      'https://www.tiktok.com/@harbourcuts'
    ]
  )
  assert.equal(links[1].text, 'Price list')
})

test('a Beacons page drawn by script is read from its embedded data', () => {
  const links = bioPageLinks(CAFE, 'https://beacons.ai/thelanterncafe')
  assert.deepEqual(
    links.map((l) => [l.url, l.text]),
    [
      ['https://www.opentable.com/r/the-lantern-cafe-portland', 'Reserve a table'],
      ['https://thelanterncafe.test/menu', 'Food menu'],
      ['https://www.ubereats.com/store/the-lantern-cafe/abc', 'Order delivery'],
      ['https://deliveroo.co.uk/menu/portland/the-lantern-cafe', 'Our menu on Deliveroo'],
      ['https://www.instagram.com/thelanterncafe', 'instagram'],
      ['https://www.facebook.com/thelanterncafe', 'facebook']
    ]
  )
})

test('the links are sorted: social pages, booking links by platform, menus and price lists; nothing else', () => {
  const page = 'https://beacons.ai/thelanterncafe'
  const sorted = sortBioLinks(bioPageLinks(CAFE, page), page)
  assert.deepEqual(sorted.socials, {
    instagram: 'https://www.instagram.com/thelanterncafe',
    facebook: 'https://www.facebook.com/thelanterncafe'
  })
  assert.deepEqual(sorted.bookings, [
    {
      url: 'https://www.opentable.com/r/the-lantern-cafe-portland',
      sourceUrl: page,
      via: page,
      platform: 'OpenTable'
    }
  ])
  // A delivery platform's copy of the menu is a listing site's page, not the restaurant's menu.
  assert.deepEqual(sorted.menus, [{ url: 'https://thelanterncafe.test/menu', sourceUrl: page, via: page }])
})

test('readBioPage: a page read, a missing one, one that left its platform, a blocked address, a slow one', async () => {
  const { fetch } = web({
    'https://linktr.ee/harbourcuts': SALON,
    'https://linktr.ee/movedaway': () =>
      new Response('', { status: 301, headers: { location: 'https://harbourcuts.test/' } }),
    'https://harbourcuts.test/': '<html><a href="https://www.fresha.com/a/x">Book</a></html>',
    'https://linktr.ee/slow': (_, init) =>
      new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))
  })
  const read = await readBioPage('https://linktr.ee/harbourcuts', { fetch, resolve })
  assert.equal(read.status, 'complete')
  assert.equal(read.links.length, 6)
  assert.deepEqual(await readBioPage('https://linktr.ee/gone', { fetch, resolve }), {
    url: 'https://linktr.ee/gone',
    status: 'failed',
    reason: 'not_found'
  })
  assert.deepEqual(await readBioPage('https://linktr.ee/movedaway', { fetch, resolve }), {
    url: 'https://linktr.ee/movedaway',
    status: 'failed',
    reason: 'not_a_bio_page'
  })
  const blocked = await readBioPage('https://linktr.ee/harbourcuts', {
    fetch,
    resolve: async () => [{ address: '127.0.0.1', family: 4 }]
  })
  assert.equal(blocked.reason, 'url_blocked')
  const slow = await readBioPage('https://linktr.ee/slow', { fetch, resolve, timeoutMs: 20 })
  assert.equal(slow.reason, 'timeout')
})

const instagramRead = (website) => ({
  source: 'instagram',
  status: 'complete',
  profile: {
    name: 'Harbour Cuts',
    website,
    url: 'https://www.instagram.com/harbourcuts/'
  },
  posts: [{ id: '1', caption: 'New season colours' }],
  media: [],
  coverage: { fetched: 1 }
})

test("a social page's bio link to a link-in-bio page brings its booking link, price list and social pages", async () => {
  const { fetch, calls } = web({ 'https://linktr.ee/harbourcuts': SALON })
  const before = instagramRead('https://l.instagram.com/?u=https%3A%2F%2Flinktr.ee%2Fharbourcuts&e=AT0abc')
  const out = await expandLinkPages(
    before,
    { source: 'instagram', ref: 'https://www.instagram.com/harbourcuts' },
    { fetch, resolve }
  )
  assert.deepEqual(calls, ['https://linktr.ee/harbourcuts'])
  const page = 'https://linktr.ee/harbourcuts'
  assert.deepEqual(out.bookings, [
    {
      url: 'https://www.fresha.com/a/harbour-cuts-bristol-12-quay-street-abc123',
      sourceUrl: page,
      via: page,
      platform: 'Fresha'
    }
  ])
  assert.deepEqual(out.menus, [
    { url: 'https://harbourcuts.test/files/salon-2026.pdf', sourceUrl: page, via: page }
  ])
  assert.deepEqual(out.profile.links, [
    'https://www.instagram.com/harbourcuts/',
    'https://www.facebook.com/harbourcutsbristol',
    'https://www.tiktok.com/@harbourcuts'
  ])
  assert.equal(out.socials, undefined, 'a social read has no socials map of its own')
  assert.equal(out.bioPages.length, 1)
  assert.equal(out.bioPages[0].url, page)
  assert.equal(out.bioPages[0].sourceUrl, 'https://www.instagram.com/harbourcuts/')
  assert.equal(out.bioPages[0].links.length, 6)
  // What the social read held is kept as it was.
  assert.deepEqual(out.posts, before.posts)
  assert.equal(out.profile.name, 'Harbour Cuts')
  assert.equal(before.bookings, undefined, 'the read given is not changed')
})

test("a social page's bio link that is a booking platform's page is the booking link, read from nothing more", async () => {
  const { fetch, calls } = web({})
  const out = await expandLinkPages(
    instagramRead('https://booksy.com/en-gb/12345_harbour-cuts_hair-salon_6789_bristol'),
    { source: 'instagram', ref: 'https://www.instagram.com/harbourcuts' },
    { fetch, resolve }
  )
  assert.deepEqual(calls, [])
  assert.deepEqual(out.bookings, [
    {
      url: 'https://booksy.com/en-gb/12345_harbour-cuts_hair-salon_6789_bristol',
      sourceUrl: 'https://www.instagram.com/harbourcuts/',
      platform: 'Booksy'
    }
  ])
  assert.equal(out.bioPages, undefined)
})

test("the website's link-in-bio pages: at most two read, the site's own social pages first", async () => {
  const pages = {
    'https://beacons.ai/thelanterncafe': CAFE,
    'https://linktr.ee/thelanterncafe': SALON,
    'https://linktr.ee/thelanterncafe2': SALON,
    'https://linktr.ee/thelanterncafe3': SALON
  }
  const { fetch, calls } = web(pages)
  const site = 'https://thelanterncafe.test/'
  const before = {
    source: 'website',
    status: 'partial',
    menus: [{ url: 'https://thelanterncafe.test/menu.pdf', sourceUrl: site }],
    bookings: [],
    socials: { instagram: 'https://www.instagram.com/lanterncafe.official' },
    profile: { name: 'The Lantern Cafe', links: ['https://www.instagram.com/lanterncafe.official'] },
    bioLinks: Object.keys(pages).map((url) => ({ url, sourceUrl: site }))
  }
  const out = await expandLinkPages(before, { source: 'website', ref: site }, { fetch, resolve })
  assert.deepEqual(calls, ['https://beacons.ai/thelanterncafe', 'https://linktr.ee/thelanterncafe'])
  assert.deepEqual(out.socials, {
    instagram: 'https://www.instagram.com/lanterncafe.official',
    facebook: 'https://www.facebook.com/thelanterncafe',
    tiktok: 'https://www.tiktok.com/@harbourcuts'
  })
  assert.equal(out.profile.links[0], 'https://www.instagram.com/lanterncafe.official')
  assert.deepEqual(
    out.bookings.map((b) => b.platform),
    ['OpenTable', 'Fresha']
  )
  assert.deepEqual(
    out.menus.map((m) => m.url),
    [
      'https://thelanterncafe.test/menu.pdf',
      'https://thelanterncafe.test/menu',
      'https://harbourcuts.test/files/salon-2026.pdf'
    ]
  )
})

test('a read that points at no link-in-bio page, or failed, is returned as it is, with no request', async () => {
  const { fetch, calls } = web({})
  const plain = {
    source: 'website',
    status: 'complete',
    menus: [],
    bookings: [{ url: 'https://www.opentable.com/r/bistro', sourceUrl: 'https://bistro.test/' }],
    socials: {},
    profile: { name: 'Bistro' }
  }
  assert.equal(await expandLinkPages(plain, { source: 'website' }, { fetch, resolve }), plain)
  const social = instagramRead('https://harbourcuts.test/')
  assert.equal(await expandLinkPages(social, { source: 'instagram' }, { fetch, resolve }), social)
  const failed = { ...instagramRead('https://linktr.ee/harbourcuts'), status: 'failed' }
  assert.equal(await expandLinkPages(failed, { source: 'instagram' }, { fetch, resolve }), failed)
  assert.deepEqual(calls, [])
})

test('a link-in-bio page that cannot be read is recorded as tried and adds nothing', async () => {
  const { fetch } = web({})
  const out = await expandLinkPages(
    instagramRead('https://linktr.ee/harbourcuts'),
    { source: 'instagram' },
    { fetch, resolve }
  )
  assert.deepEqual(out.bioPages, [
    {
      url: 'https://linktr.ee/harbourcuts',
      status: 'failed',
      reason: 'not_found',
      sourceUrl: 'https://www.instagram.com/harbourcuts/'
    }
  ])
  assert.equal(out.bookings, undefined)
  assert.equal(out.menus, undefined)
})
