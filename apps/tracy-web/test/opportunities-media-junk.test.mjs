import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mediaJunk, neverALogo } from 'website-opportunities/src/media-junk.js'

const web = (url, w, h, extra = {}) => ({
  source: 'website',
  status: 'stored',
  kind: 'image',
  source_url: url,
  width: w,
  height: h,
  ...extra
})

test('the junk of a real cafe site (Cafe VELA, 42 found): icons, map, arrow and an undownloadable row are hidden, photos are not', () => {
  const base = 'http://www.cafevela.example/images/stories/'
  assert.equal(mediaJunk(web(`${base}tripadv.jpg`, 30, 30)), 'social-icon')
  assert.equal(mediaJunk(web(`${base}instagram12n-1-web.jpg`, 30, 30)), 'social-icon')
  assert.equal(mediaJunk(web(`${base}demo/icon_g-plus.png`, 30, 30)), 'social-icon')
  assert.equal(mediaJunk(web(`${base}demo/facebook%20icon%20round.png`, 30, 30)), 'social-icon')
  assert.equal(
    mediaJunk(web('http://www.cafevela.example/media/system/images/arrow.png', 4, 8)),
    'decoration'
  )
  assert.equal(mediaJunk(web(`${base}map.jpg`, 180, 120)), 'map')
  assert.equal(mediaJunk(web(`${base}banner_groen_99x32.gif`, 99, 32)), 'tiny')
  assert.equal(
    mediaJunk({ ...web(`${base}chililille_180_120.jpg`, null, null), status: 'reference' }),
    'not_stored'
  )
  assert.equal(mediaJunk(web(`${base}clipboard01.jpg`, 599, 364)), null)
  assert.equal(mediaJunk(web(`${base}cb_180_120.jpg`, 180, 120)), null)
})

test("only the restaurant's own website markup is judged by name and size; another source's pictures are not", () => {
  assert.equal(
    mediaJunk({
      source: 'instagram',
      status: 'stored',
      kind: 'image',
      source_url: 'https://cdn.ig/facebook.jpg',
      width: 30,
      height: 30
    }),
    null
  )
  assert.equal(
    mediaJunk({
      source: 'google-maps',
      status: 'stored',
      kind: 'image',
      source_url: 'https://lh3/map',
      width: 960,
      height: 720
    }),
    null
  )
  assert.equal(
    mediaJunk({ source: 'tripadvisor', status: 'reference', kind: 'image', source_url: 'https://x' }),
    'not_stored'
  )
})

test('a large photo named after a social network or a map is still a photo; decoration words and sprites are hidden', () => {
  assert.equal(mediaJunk(web('https://x.test/instagram-feed.jpg', 1200, 800)), null)
  assert.equal(mediaJunk(web('https://x.test/img/bg-pattern.png', 600, 400)), 'decoration')
  assert.equal(mediaJunk(web('https://x.test/img/sprite.png', 400, 300)), 'decoration')
  assert.equal(mediaJunk(web('https://x.test/wide.jpg', 900, 150)), 'decoration')
  assert.equal(mediaJunk(web('https://x.test/dish.jpg', 400, 300, { alt: 'Google Maps' })), 'map')
})

test('a vision label of icon or map hides a picture whatever its name', () => {
  const labelled = (subject) =>
    web('https://x.test/a.jpg', 300, 300, { labels: { vision: { labels: { subject } } } })
  assert.equal(mediaJunk(labelled('icon')), 'icon')
  assert.equal(mediaJunk(labelled('map')), 'map')
  assert.equal(mediaJunk(labelled('food')), null)
})

test('videos are never judged; a social icon, a map or an unstored picture is never a logo candidate, a tiny one may be', () => {
  assert.equal(
    mediaJunk({ source: 'website', status: 'stored', kind: 'video', source_url: 'https://x/v.mp4' }),
    null
  )
  assert.equal(neverALogo('social-icon'), true)
  assert.equal(neverALogo('map'), true)
  assert.equal(neverALogo('icon'), true)
  assert.equal(neverALogo('not_stored'), true)
  assert.equal(neverALogo('tiny'), false)
  assert.equal(neverALogo('decoration'), false)
  assert.equal(neverALogo(null), false)
})
