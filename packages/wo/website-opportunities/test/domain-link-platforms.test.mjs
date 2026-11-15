// Which links are a business's page on a booking platform or a link-in-bio page (`domain/link-platforms.mjs`): by
// host and path, never by a word anywhere in the address, and never the platform's own pages.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bookingPlatformOf,
  isBookingUrl,
  isLinkInBioHost,
  linkInBioOf,
  unwrapRedirect
} from '../domain/link-platforms.mjs'

test('a business page on each booking platform the research must know is named by its platform', () => {
  const pages = {
    'https://www.opentable.com/r/the-lantern-cafe-portland': 'OpenTable',
    'https://www.opentable.co.uk/r/the-lantern-cafe-bristol': 'OpenTable',
    'https://www.sevenrooms.com/reservations/thelanterncafe': 'SevenRooms',
    'https://resy.com/cities/ny/the-lantern-cafe': 'Resy',
    'https://www.fresha.com/a/harbour-cuts-bristol-12-quay-street-abc123': 'Fresha',
    'https://booksy.com/en-gb/12345_harbour-cuts_hair-salon_6789_bristol': 'Booksy',
    'https://www.treatwell.co.uk/place/harbour-cuts/': 'Treatwell',
    'https://www.treatwell.de/ort/harbour-cuts/': 'Treatwell',
    'https://clients.mindbodyonline.com/classic/ws?studioid=12345': 'Mindbody',
    'https://calendly.com/harbour-physio/first-visit': 'Calendly',
    'https://playtomic.io/harbour-padel-club/abc-123': 'Playtomic',
    'https://bookings.zenchef.com/results?rid=123456': 'Zenchef',
    'https://www.thefork.com/restaurant/the-lantern-cafe-r12345': 'TheFork',
    'https://app.squareup.com/appointments/book/abc/def/start': 'Square Appointments',
    'https://harbourcuts.setmore.com/': 'Setmore',
    'https://www.exploretock.com/thelanterncafe': 'Tock',
    'https://www.yelp.com/reservations/the-lantern-cafe-portland': 'Yelp Reservations'
  }
  for (const [url, name] of Object.entries(pages)) {
    assert.equal(bookingPlatformOf(url), name, url)
    assert.equal(isBookingUrl(url), true, url)
  }
})

test('a platform home, its own pages and look-alike hosts are no booking link', () => {
  for (const url of [
    'https://www.fresha.com/',
    'https://www.fresha.com/for-business',
    'https://www.fresha.com/en-gb/for-business/pricing',
    'https://calendly.com/',
    'https://calendly.com/pricing',
    'https://www.opentable.com/',
    'https://www.treatwell.co.uk/en/login',
    'https://www.setmore.com/',
    'https://help.setmore.com/',
    'https://booksy.com/en-gb/s/hair-salon/bristol',
    'https://www.yelp.com/biz/the-lantern-cafe-portland',
    'https://notopentable.com/r/the-lantern-cafe',
    'https://opentable.example.test/r/the-lantern-cafe',
    // A platform named in the query is no page on it (the old substring rule took this for a booking).
    'https://thelanterncafe.test/?ref=resy.com',
    'mailto:book@thelanterncafe.test',
    'not a link',
    null
  ])
    assert.equal(bookingPlatformOf(url), null, String(url))
})

test('a link-in-bio page is the platform host with one handle, or a subdomain where the platform gives one', () => {
  assert.equal(linkInBioOf('https://linktr.ee/harbourcuts'), 'Linktree')
  assert.equal(linkInBioOf('https://linktr.ee/harbourcuts?utm_source=ig_web_button_share_sheet'), 'Linktree')
  assert.equal(linkInBioOf('https://beacons.ai/thelanterncafe'), 'Beacons')
  assert.equal(linkInBioOf('https://tap.bio/@harbourcuts'), 'Tap Bio')
  assert.equal(linkInBioOf('https://harbourcuts.bio.site/'), 'Bio Sites')
  for (const url of [
    'https://linktr.ee/',
    'https://linktr.ee/s/about',
    'https://linktr.ee/privacy',
    'https://ugc.production.linktr.ee/harbourcuts-avatar.jpeg',
    'https://help.bio.site/',
    'https://beacons.ai/harbourcuts/store/item',
    'https://harbourcuts.test/links'
  ])
    assert.equal(linkInBioOf(url), null, url)
  assert.equal(isLinkInBioHost('ugc.production.linktr.ee'), true)
  assert.equal(isLinkInBioHost('harbourcuts.test'), false)
})

test("a social network's outbound redirect is read as the address behind it", () => {
  assert.equal(
    unwrapRedirect('https://l.instagram.com/?u=https%3A%2F%2Flinktr.ee%2Fharbourcuts&e=AT0abc'),
    'https://linktr.ee/harbourcuts'
  )
  assert.equal(
    unwrapRedirect('https://l.facebook.com/l.php?u=https%3A%2F%2Fbeacons.ai%2Fthelanterncafe&h=AT1'),
    'https://beacons.ai/thelanterncafe'
  )
  assert.equal(
    unwrapRedirect('https://www.google.com/url?q=https://linktr.ee/harbourcuts&sa=D'),
    'https://linktr.ee/harbourcuts'
  )
  assert.equal(unwrapRedirect('https://linktr.ee/harbourcuts'), 'https://linktr.ee/harbourcuts')
  assert.equal(
    unwrapRedirect('https://l.instagram.com/?u=javascript%3Aalert(1)'),
    'https://l.instagram.com/?u=javascript%3Aalert(1)',
    'a wrapped address that is no web link is not unwrapped'
  )
})
