import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apifyCollect } from '../domain/apify.mjs'
import { facebookPictureSize, largestPhotoInPage, facebookPhotoPageUrl } from '../domain/facebook-photos.mjs'

// Page data of the fictional Tamarel (facebook.com/TamarelHoiAn) in the actor's shape, stripped to structure + picture URLs.
const POSTS = JSON.parse(
  readFileSync(new URL('./fixtures/facebook-posts-tamarel.json', import.meta.url), 'utf8')
)
// The public photo page of fbid 3788800030553945, reduced to the sized picture nodes it carries.
const PHOTO_PAGE = readFileSync(new URL('./fixtures/facebook-photo-page.html', import.meta.url), 'utf8')

const TOKEN = 'apify_api_SECRET123'
const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const NOW = () => Date.parse('2026-10-18T09:00:00Z')
const SMALL_XMAS =
  'https://scontent-ord5-2.xx.fbcdn.net/v/t39.30808-6/675448183_1373038088772473_8810643113418370906_n.jpg?stp=dst-jpg_tt6&cstp=mx1280x720&ctp=s590x590'
const LARGE_XMAS =
  'https://scontent.fauh1-1.fna.fbcdn.net/v/t39.30808-6/675448183_1373038088772473_8810643113418370906_n.jpg?stp=dst-jpg_tt6&cstp=mx1280x720&ctp=s1280x720'

function router(routes) {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url, init })
    for (const [match, respond] of routes) if (match(url)) return respond(url, init)
    return new Response('not found', { status: 404 })
  }
  return { fetch, calls }
}
const isApify = (u) => u.startsWith('https://api.apify.com/')
const isPhotoPage = (u) => u.startsWith('https://www.facebook.com/photo/')
const json = (body) =>
  new Response(JSON.stringify(body), { status: 201, headers: { 'content-type': 'application/json' } })
const html = (body) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })

test('facebookPictureSize reads the served box and the original size from the CDN URL', () => {
  assert.deepEqual(facebookPictureSize(SMALL_XMAS), {
    served: { width: 590, height: 590 },
    original: { width: 1280, height: 720 }
  })
  assert.deepEqual(facebookPictureSize('https://x.fbcdn.net/a.jpg?ctp=p843x403&cstp=mx1075x650'), {
    served: { width: 843, height: 403 },
    original: { width: 1075, height: 650 }
  })
  assert.deepEqual(facebookPictureSize('https://x.fbcdn.net/a.jpg'), { served: null, original: null })
  assert.deepEqual(facebookPictureSize(undefined), { served: null, original: null })
  assert.deepEqual(facebookPictureSize('not a url'), { served: null, original: null })
})

test('largestPhotoInPage finds the same picture at full size and ignores other pictures on the page', () => {
  assert.deepEqual(largestPhotoInPage(PHOTO_PAGE, SMALL_XMAS), { url: LARGE_XMAS, width: 1280, height: 720 })
  const otherPhoto = SMALL_XMAS.replace('675448183_1373038088772473', '584731652_3209059679771258')
  assert.equal(largestPhotoInPage(PHOTO_PAGE, otherPhoto), null)
  assert.equal(largestPhotoInPage('<html>login</html>', SMALL_XMAS), null)
  assert.equal(largestPhotoInPage(PHOTO_PAGE, undefined), null)
  assert.equal(largestPhotoInPage(undefined, SMALL_XMAS), null)
})

test('facebookPhotoPageUrl builds the public photo page from a numeric id only', () => {
  assert.equal(
    facebookPhotoPageUrl('3788800030553945'),
    'https://www.facebook.com/photo/?fbid=3788800030553945'
  )
  assert.equal(facebookPhotoPageUrl('12&x=1'), null)
  assert.equal(facebookPhotoPageUrl(undefined), null)
})

test('facebook: a photo whose public page carries it at full size is collected large, the small one kept as fallback', async () => {
  const { fetch, calls } = router([
    [isApify, () => json(POSTS)],
    [isPhotoPage, () => html(PHOTO_PAGE)]
  ])
  const r = await apifyCollect(
    'facebook',
    'https://www.facebook.com/TamarelHoiAn',
    { limit: 10 },
    { fetch, resolve, token: TOKEN, now: NOW }
  )

  const xmas = r.media.find((m) => m.photoId === '3788800030553945')
  assert.equal(xmas.url, LARGE_XMAS)
  assert.equal(xmas.width, 1280)
  assert.equal(xmas.height, 720)
  assert.equal(xmas.fallbackUrl, SMALL_XMAS)
  assert.equal(xmas.kind, 'image')

  // The page served here does not carry these pictures: they stay small, with the size the actor gave.
  const album = r.media.find((m) => m.photoId === '3864624261767720')
  assert.match(album.url, /ctp=s590x590/)
  assert.equal(album.width, 590)
  assert.equal(album.height, 590)
  assert.equal(album.fallbackUrl, undefined)

  // An album's header entry points at the post page, not at a picture.
  assert.ok(!r.media.some((m) => m.url.includes('/posts/')), 'no post page collected as a picture')
  // A reel's `image` is a 296x100 crop; its thumbnail is the bigger picture of the same frame.
  const reel = r.media.find((m) => m.postId === '3814805889251499' && m.kind === 'image')
  assert.match(reel.url, /ctp=s960x960/)

  const pages = calls.filter((c) => isPhotoPage(c.url))
  assert.equal(pages.length, 5, 'one public photo page per photo that is served smaller than its original')
  assert.match(pages[0].init.headers['user-agent'], /Mozilla\/5\.0/)
  assert.equal(
    pages.some((c) => c.init.headers.authorization),
    false,
    'the Apify token never goes to facebook.com'
  )
  assert.deepEqual(r.coverage.photoPages, { tried: 5, upgraded: 1 })
})

test('facebook: photo pages are capped per run and a failing page never fails the source', async () => {
  const { fetch, calls } = router([
    [isApify, () => json(POSTS)],
    [
      isPhotoPage,
      () => {
        throw new Error('connection reset')
      }
    ]
  ])
  const r = await apifyCollect(
    'facebook',
    'TamarelHoiAn',
    { limit: 10 },
    { fetch, resolve, token: TOKEN, now: NOW, photoPageMax: 2 }
  )
  assert.equal(r.status, 'complete')
  assert.equal(calls.filter((c) => isPhotoPage(c.url)).length, 2)
  assert.deepEqual(r.coverage.photoPages, { tried: 2, upgraded: 0, skipped: 3 })
  assert.equal(r.media.find((m) => m.photoId === '3788800030553945').url, SMALL_XMAS)
})

test('facebook: no photo page when the actor already gave the original size, and odd shapes never throw', async () => {
  const full = 'https://x.fbcdn.net/v/1_2_3_n.jpg?cstp=mx590x590&ctp=s590x590'
  const { fetch, calls } = router([
    [
      isApify,
      () =>
        json([
          {
            postId: 'p1',
            media: [
              null,
              'x',
              {},
              { __typename: 'Photo' },
              { __typename: 'Photo', id: '9', image: 'not an object' },
              { __typename: 'Photo', id: '7', image: { uri: full, width: 590, height: 590 } }
            ]
          },
          { postId: 'p2', media: { unexpected: true } }
        ])
    ]
  ])
  const r = await apifyCollect('facebook', 'phin', {}, { fetch, resolve, token: TOKEN, now: NOW })
  assert.equal(calls.filter((c) => isPhotoPage(c.url)).length, 0)
  assert.deepEqual(
    r.media.map((m) => [m.url, m.width, m.height]),
    [[full, 590, 590]]
  )
  assert.equal(r.coverage.photoPages, undefined)
})
