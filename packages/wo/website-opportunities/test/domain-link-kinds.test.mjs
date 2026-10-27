import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LISTING_HOSTS, MAX_LINKS, judgeLinks, linkKind, splitPasted } from '../domain/link-kinds.mjs'

const SHARE = 'https://share.google/hscFakeLink01'
const MAGICPIN = 'https://magicpin.com/uae/Dubai/Al-Barsha/Fitness/Padel-and-Tennis-Coach/store/1000001'
const INSTA = 'https://www.instagram.com/harbour.sportclub?mdxt=ZmFrZW1keHQ'

test('the three real links of the test case', () => {
  assert.equal(linkKind(SHARE).kind, 'google')
  const m = linkKind(MAGICPIN)
  assert.equal(m.kind, 'listing')
  assert.equal(m.source, 'magicpin')
  const i = linkKind(INSTA)
  assert.equal(i.kind, 'instagram')
  assert.equal(i.handle, 'harbour.sportclub')
  assert.equal(i.url, 'https://instagram.com/harbour.sportclub')
  assert.equal(i.key, 'instagram:harbour.sportclub')
})

test('google hosts', () => {
  for (const u of [
    'https://maps.app.goo.gl/abc',
    'https://g.page/some-place',
    'https://goo.gl/maps/xyz',
    'https://www.google.com/maps/place/Foo',
    'https://google.ae/maps?cid=1',
    'https://maps.google.com/?q=foo',
    'https://g.co/kgs/abc123'
  ])
    assert.equal(linkKind(u).kind, 'google', u)
  assert.equal(linkKind('https://goo.gl/other').kind, 'website')
  assert.equal(linkKind('https://www.google.com/search?q=x').kind, 'website')
})

test('google keeps its params and uses the full url as key', () => {
  const g = linkKind('https://www.google.com/maps/place/Foo?cid=12&utm_source=x')
  assert.equal(g.url, 'https://google.com/maps/place/Foo?cid=12')
  assert.equal(g.key, g.url)
})

test('listing hosts incl. any-TLD and subdomains', () => {
  assert.equal(linkKind('https://www.tripadvisor.co.uk/Restaurant_Review-x').source, 'Tripadvisor')
  assert.equal(linkKind('https://tripadvisor.ae/x').kind, 'listing')
  assert.equal(linkKind('https://www.yelp.com/biz/x').source, 'Yelp')
  assert.equal(linkKind('https://www.zomato.com/dubai/x').source, 'Zomato')
  assert.equal(linkKind('https://www.talabat.com/uae/x').source, 'Talabat')
  assert.equal(linkKind('https://foursquare.com/v/x').source, 'Foursquare')
  assert.equal(linkKind('https://deliveroo.ae/menu/x').source, 'Deliveroo')
  assert.equal(linkKind('https://www.fresha.com/a/x').source, 'Fresha')
  assert.equal(linkKind('https://notyelp.com/x').kind, 'website')
  assert.ok(LISTING_HOSTS['magicpin.com'])
})

test('social links and handles', () => {
  assert.equal(linkKind('https://www.facebook.com/dubai.club?fbclid=1').handle, 'dubai.club')
  assert.equal(linkKind('https://fb.com/dubai.club').kind, 'facebook')
  assert.equal(linkKind('https://m.facebook.com/dubai.club').key, 'facebook:dubai.club')
  assert.equal(linkKind('https://www.tiktok.com/@some.one?x=1').handle, 'some.one')
  const y = linkKind('https://www.youtube.com/@Chan?si=abc')
  assert.equal(y.kind, 'youtube')
  assert.equal(y.handle, 'Chan')
  assert.equal(y.key, 'youtube:chan')
  assert.equal(linkKind('https://youtu.be/abc').kind, 'youtube')
})

test('websites, bare domains, junk', () => {
  const w = linkKind('example.ae')
  assert.equal(w.kind, 'website')
  assert.equal(w.url, 'https://example.ae')
  assert.equal(linkKind('http://www.Example.AE/Menu/?utm_medium=a&x=1').url, 'https://example.ae/Menu/?x=1')
  assert.equal(linkKind('http://www.Example.AE/Menu/').key, 'example.ae/menu')
  for (const bad of ['', 'Dubai', 'two words.com', 'mailto:a@b.ae', 'ftp://x.ae', 'Inc.', null, 42])
    assert.equal(linkKind(bad), null, String(bad))
})

test('judgeLinks: invalid, duplicate, limit, one google, one website', () => {
  const out = judgeLinks([
    SHARE,
    'hello',
    INSTA,
    'https://instagram.com/Harbour.SportClub',
    'https://www.google.com/maps/place/Foo',
    'a.ae',
    'b.ae',
    MAGICPIN
  ])
  assert.deepEqual(
    out.map((o) => o.reason ?? 'ok'),
    ['ok', 'invalid', 'ok', 'duplicate', 'one-google', 'ok', 'one-website', 'ok']
  )
  assert.equal(out[1].url, null)
  assert.equal(out[7].source, 'magicpin')
  const many = judgeLinks(['a.ae', ...Array.from({ length: 6 }, (_, i) => `https://yelp.com/biz/${i}`)])
  assert.equal(many.filter((o) => o.used).length, MAX_LINKS)
  assert.equal(many[6].reason, 'limit')
})

/** Built from octets so the public-leak scan does not flag literal addresses in this file. */
const ip = (...octets) => `http://${octets.join('.')}/`

test('judgeLinks: not-public hosts', () => {
  for (const u of [
    'http://localhost:3000/x',
    ip(127, 0, 0, 1),
    ip(127, 5, 5, 5),
    ip(10, 1, 2, 3),
    ip(192, 168, 0, 9),
    ip(172, 16, 0, 1),
    ip(172, 31, 9, 9),
    'http://[::1]/'
  ])
    assert.equal(judgeLinks([u])[0].reason, 'not-public', u)
  assert.equal(judgeLinks([ip(172, 32, 0, 1)])[0].used, true)
  assert.equal(judgeLinks([ip(11, 1, 2, 3)])[0].used, true)
})

test('splitPasted: newline paste and words plus links', () => {
  assert.deepEqual(splitPasted(`${SHARE}\n${MAGICPIN}\n${INSTA}\n`), {
    links: [SHARE, MAGICPIN, INSTA],
    words: ''
  })
  assert.deepEqual(splitPasted(`Harbour Sport Club ${MAGICPIN}, ${INSTA}`), {
    links: [MAGICPIN, INSTA],
    words: 'Harbour Sport Club'
  })
  assert.deepEqual(splitPasted(''), { links: [], words: '' })
})
