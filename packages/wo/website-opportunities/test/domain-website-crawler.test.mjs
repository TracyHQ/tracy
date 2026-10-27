import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  crawlWebsite,
  extractPage,
  keepFallbackCopy,
  nameFromTitle,
  originalImageUrl
} from '../domain/website-crawler.mjs'

const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const html = (s) => () => new Response(s, { headers: { 'content-type': 'text/html; charset=utf-8' } })
const xml = (s) => () => new Response(s, { headers: { 'content-type': 'application/xml' } })

const HOME = `<!doctype html><html><head>
<title>Brewlet Coffee &amp; Kitchen — Hội An</title>
<meta name="description" content="Slow coffee in the old town.">
<meta property="og:image" content="/img/og.jpg">
<script>window.tracking = "IGNORE ME";</script>
<style>.x{color:red}</style>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":["Restaurant"],"name":"Brewlet Coffee","telephone":"+84 235 555 0134","email":"mailto:Hello@Phin.test",
"address":{"@type":"PostalAddress","streetAddress":"12 Trần Phú","addressLocality":"Hội An","addressCountry":"VN"},
"openingHours":["Mo-Su 07:00-21:00"],"menu":"https://phin.test/menu.pdf","servesCuisine":"Vietnamese",
"sameAs":["https://www.facebook.com/brewletcoffeehoian","https://www.instagram.com/brewletcoffeehoian/"]}]}</script>
</head><body>
<nav><a href="/about">About</a><a href="/gallery">Gallery</a><a href="https://other.test/x">Partner</a></nav>
<main><h1>Welcome</h1><p>Hand-brewed  phin coffee since 2015.</p>
<img src="/img/a-small.jpg" srcset="/img/a-480.jpg 480w, /img/a-1600.jpg 1600w, /img/a-800.jpg 800w" alt="Egg coffee">
<img data-src="/img/lazy.webp" alt="Rooftop terrace">
<video src="/v/tour.mp4" poster="/v/poster.jpg"></video>
<video><source src="/v/clip.webm" type="video/webm"></video>
<a href="/files/Menu-2026.pdf">Our menu</a>
<a href="https://www.tiktok.com/@brewlet.coffee">TikTok</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
<a href="tel:+842355550134">Call</a>
</main><footer>© footer boilerplate</footer></body></html>`

test('extractPage pulls title, visible text, JSON-LD, images, videos, PDFs and socials', () => {
  const p = extractPage(HOME, 'https://phin.test/')
  assert.equal(p.title, 'Brewlet Coffee & Kitchen — Hội An')
  assert.match(p.text, /Hand-brewed phin coffee since 2015\./)
  assert.doesNotMatch(p.text, /IGNORE ME|color:red|footer boilerplate|Partner/)
  assert.equal(p.description, 'Slow coffee in the old town.')
  assert.equal(p.business.name, 'Brewlet Coffee')
  assert.equal(p.business.telephone, '+84 235 555 0134')
  assert.equal(p.business.email, 'hello@phin.test', 'a mailto: prefix is not part of the address')
  assert.equal(p.business.address, '12 Trần Phú, Hội An, VN')
  assert.deepEqual(p.business.openingHours, ['Mo-Su 07:00-21:00'])
  assert.equal(p.business.menu, 'https://phin.test/menu.pdf')
  assert.deepEqual(p.business.servesCuisine, ['Vietnamese'])
  assert.ok(p.business.sameAs.includes('https://www.facebook.com/brewletcoffeehoian'))

  const images = p.images.map((i) => i.url)
  assert.deepEqual(images, [
    'https://phin.test/img/og.jpg',
    'https://phin.test/img/a-1600.jpg',
    'https://phin.test/img/lazy.webp',
    'https://phin.test/v/poster.jpg'
  ])
  assert.equal(p.images[1].alt, 'Egg coffee')
  assert.deepEqual(
    p.videos.map((v) => v.url),
    ['https://phin.test/v/tour.mp4', 'https://phin.test/v/clip.webm']
  )
  assert.deepEqual(p.pdfs, [{ url: 'https://phin.test/files/Menu-2026.pdf', text: 'Our menu', menu: true }])
  assert.equal(p.socials.tiktok, 'https://www.tiktok.com/@brewlet.coffee')
  assert.equal(
    p.socials.facebook,
    'https://www.facebook.com/brewletcoffeehoian',
    'share links are ignored, sameAs counts'
  )
  assert.equal(p.phones[0], '+842355550134')
  assert.ok(p.links.includes('https://phin.test/about'))
})

test('a resized copy on a documented image host offers the original first and keeps the copy as fallback', async () => {
  const wix =
    'https://static.wixstatic.com/media/11062b_a1~mv2.jpg/v1/fit/w_480,h_320,q_90,enc_avif/11062b_a1~mv2.jpg'
  const wixFill = 'https://static.wixstatic.com/media/11062b_a1~mv2.jpg/v1/fill/w_960,h_640/11062b_a1~mv2.jpg'
  const wp = 'https://phin.test/wp-content/uploads/2024/05/pho-300x200.jpg'
  const shopify = 'https://cdn.shopify.com/s/files/1/0001/files/cake_400x300_crop_center@2x.jpg?v=12'
  const unknown = 'https://images.example.test/media/a-480x320.jpg/v1/fit/w_480/a.jpg'
  const page = extractPage(
    `<html><body><img srcset="${wix} 480w"><img src="${wixFill}" alt="Second copy of the same photo"><img src="${wp}" alt="Pho"><img src="${shopify}"><img src="${unknown}"><img src="https://static.wixstatic.com/media/plain~mv2.png"></body></html>`,
    'https://phin.test/'
  )
  assert.deepEqual(
    page.images,
    [
      { url: 'https://static.wixstatic.com/media/11062b_a1~mv2.jpg', fallbackUrl: wixFill },
      { url: 'https://phin.test/wp-content/uploads/2024/05/pho.jpg', fallbackUrl: wp, alt: 'Pho' },
      { url: 'https://cdn.shopify.com/s/files/1/0001/files/cake.jpg?v=12', fallbackUrl: shopify },
      { url: unknown },
      { url: 'https://static.wixstatic.com/media/plain~mv2.png' }
    ],
    'two sizes of one Wix original collapse into one picture that falls back on the wider copy; an unknown host and an original stay as seen'
  )
  assert.equal(
    originalImageUrl('https://shop.test/cdn/shop/files/cake.jpg?v=1&width=600'),
    'https://shop.test/cdn/shop/files/cake.jpg?v=1'
  )
  assert.equal(
    originalImageUrl('https://shop.test/cdn/shop/products/cake_600x.jpg'),
    'https://shop.test/cdn/shop/products/cake.jpg'
  )
  assert.equal(
    originalImageUrl('https://other.test/cdn/shop/assets/cake_600x.jpg?width=600'),
    null,
    'a /cdn/shop/ path outside the Shopify file shape stays as seen'
  )
  assert.equal(
    originalImageUrl('https://shop.test/cdn/shop/files/cake.jpg?v=1'),
    null,
    'a Shopify file with no size is already the original'
  )
  assert.equal(
    originalImageUrl('https://phin.test/uploads/pho-300x200.jpg'),
    null,
    'a size suffix outside wp-content/uploads is a name'
  )
  assert.equal(originalImageUrl('not a url'), null)

  const { fetch } = site({
    'https://phin.test/': html(
      `<html><body><img src="${wix}" alt="Terrace"><a href="/gallery">Gallery</a></body></html>`
    ),
    'https://phin.test/gallery': html(`<html><body><img src="${wixFill}"></body></html>`)
  })
  const r = await crawlWebsite('https://phin.test/', { maxPages: 2 }, { fetch, resolve })
  assert.deepEqual(
    r.media,
    [
      {
        url: 'https://static.wixstatic.com/media/11062b_a1~mv2.jpg',
        fallbackUrl: wixFill,
        kind: 'image',
        sourceUrl: 'https://phin.test/',
        caption: 'Terrace'
      }
    ],
    'a wider copy found on a later page replaces the fallback'
  )
})

test('the fallback copy is the widest one whose URL says its width, else the first one seen', () => {
  const wp = (size) => `https://phin.test/wp-content/uploads/2024/05/pho${size}.jpg`
  const image = { url: wp('') }
  keepFallbackCopy(image, wp('-300x200'))
  keepFallbackCopy(image, wp('-1024x683'))
  keepFallbackCopy(image, wp('-768x512'))
  assert.equal(image.fallbackUrl, wp('-1024x683'))
  const unsized = {
    url: 'https://cdn.shopify.com/s/files/1/files/cake.jpg',
    fallbackUrl: 'https://cdn.shopify.com/s/files/1/files/cake.jpg?crop=center'
  }
  keepFallbackCopy(unsized, 'https://cdn.shopify.com/s/files/1/files/cake_2048x.jpg')
  assert.equal(
    unsized.fallbackUrl,
    'https://cdn.shopify.com/s/files/1/files/cake.jpg?crop=center',
    'an unknown width keeps the first copy'
  )
  const page = extractPage(
    `<html><body><img src="${wp('')}"><img src="${wp('-300x200')}"></body></html>`,
    'https://phin.test/'
  )
  assert.deepEqual(
    page.images,
    [{ url: wp(''), fallbackUrl: wp('-300x200') }],
    'the original seen as is still gets a copy to fall back on'
  )
})

function site(pages) {
  const calls = []
  const fetch = async (url) => {
    calls.push(url)
    const r = pages[url]
    return r ? r() : new Response('nope', { status: 404 })
  }
  return { fetch, calls }
}

test('crawlWebsite reads the sitemap index, then pages, staying on the same host', async () => {
  const { fetch, calls } = site({
    'https://phin.test/sitemap.xml': xml(
      '<sitemapindex><sitemap><loc>https://phin.test/sitemap-pages.xml</loc></sitemap></sitemapindex>'
    ),
    'https://phin.test/sitemap-pages.xml': xml(
      '<urlset><url><loc>https://phin.test/menu</loc></url><url><loc>https://www.phin.test/contact</loc></url><url><loc>https://evil.test/</loc></url></urlset>'
    ),
    'https://phin.test/': html(HOME),
    'https://phin.test/menu': html('<html><title>Menu</title><body><p>Egg coffee 45k</p></body></html>'),
    'https://www.phin.test/contact': html('<html><title>Contact</title><body>Call us</body></html>'),
    'https://phin.test/about': html('<html><title>About</title><body>Since 2015</body></html>'),
    'https://phin.test/gallery': html('<html><title>Gallery</title><body><img src="/g/1.jpg"></body></html>')
  })
  const r = await crawlWebsite('https://phin.test/', {}, { fetch, resolve })
  assert.equal(r.source, 'website')
  assert.equal(r.status, 'complete')
  assert.equal(r.cursor, null)
  assert.deepEqual(
    r.pages.map((p) => p.title),
    ['Brewlet Coffee & Kitchen — Hội An', 'Menu', 'Contact', 'About', 'Gallery']
  )
  assert.ok(!calls.some((u) => u.startsWith('https://evil.test') || u.startsWith('https://other.test')))
  assert.equal(r.profile.name, 'Brewlet Coffee')
  assert.equal(r.profile.phone, '+84 235 555 0134')
  assert.equal(r.profile.bio, 'Slow coffee in the old town.')
  assert.deepEqual(r.profile.hours, ['Mo-Su 07:00-21:00'])
  assert.ok(r.profile.links.includes('https://www.tiktok.com/@brewlet.coffee'))
  assert.equal(r.socials.instagram, 'https://www.instagram.com/brewletcoffeehoian/')
  assert.deepEqual(
    r.menus.map((m) => m.url),
    ['https://phin.test/menu.pdf', 'https://phin.test/files/Menu-2026.pdf', 'https://phin.test/menu']
  )
  assert.ok(
    r.media.some(
      (m) =>
        m.url === 'https://phin.test/g/1.jpg' &&
        m.kind === 'image' &&
        m.sourceUrl === 'https://phin.test/gallery'
    )
  )
  assert.ok(r.media.some((m) => m.kind === 'video' && m.url === 'https://phin.test/v/tour.mp4'))
  assert.deepEqual(r.coverage, { fetched: 5, total: 5 })
})

test('maxPages stops early with a cursor; resuming from it finishes without refetching', async () => {
  const pages = {
    'https://phin.test/': html(
      '<html><title>Home</title><body><a href="/a">a</a><a href="/b">b</a><a href="/c">c</a></body></html>'
    ),
    'https://phin.test/a': html('<html><title>A</title></html>'),
    'https://phin.test/b': html('<html><title>B</title></html>'),
    'https://phin.test/c': html('<html><title>C</title></html>')
  }
  const first = site(pages)
  const r1 = await crawlWebsite('https://phin.test/', { maxPages: 2 }, { fetch: first.fetch, resolve })
  assert.equal(r1.status, 'partial')
  assert.deepEqual(
    r1.pages.map((p) => p.title),
    ['Home', 'A']
  )
  assert.ok(r1.cursor && r1.cursor.queue.length === 2)
  const cursor = JSON.parse(JSON.stringify(r1.cursor)) // must survive a jsonb round trip

  const second = site(pages)
  const r2 = await crawlWebsite(
    'https://phin.test/',
    { maxPages: 40, cursor },
    { fetch: second.fetch, resolve }
  )
  assert.equal(r2.status, 'complete')
  assert.deepEqual(
    r2.pages.map((p) => p.title),
    ['B', 'C']
  )
  assert.ok(!second.calls.includes('https://phin.test/sitemap.xml'))
  assert.deepEqual(r2.coverage, { fetched: 4, total: 4 })
})

test('a root URL on a private network fails without fetching', async () => {
  const { fetch, calls } = site({})
  const r = await crawlWebsite('http://192.168.1.10/', {}, { fetch, resolve })
  assert.equal(r.status, 'failed')
  assert.equal(r.reason, 'url_blocked')
  assert.equal(calls.length, 0)
})

test('an unreachable homepage fails with not_found', async () => {
  const { fetch } = site({})
  const r = await crawlWebsite('https://gone.test/', {}, { fetch, resolve })
  assert.equal(r.status, 'failed')
  assert.equal(r.reason, 'not_found')
})

test('a timeout mid-crawl returns partial and keeps the timed-out page in the cursor', async () => {
  const fetch = async (url, init) => {
    if (url === 'https://phin.test/slow')
      return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)))
    if (url === 'https://phin.test/') return html('<html><title>Home</title><a href="/slow">s</a></html>')()
    return new Response('', { status: 404 })
  }
  const r = await crawlWebsite('https://phin.test/', { pageTimeoutMs: 20 }, { fetch, resolve })
  assert.equal(r.status, 'partial')
  assert.equal(r.reason, 'timeout')
  assert.deepEqual(r.cursor.queue, ['https://phin.test/slow'])
})

test('a domain that no longer resolves fails as not_found, not url_blocked', async () => {
  const { crawlWebsite } = await import('../domain/website-crawler.mjs')
  const resolve = async () => {
    throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })
  }
  const r = await crawlWebsite(
    'https://gone.example/',
    { maxPages: 2 },
    {
      fetch: async () => {
        throw new Error('no fetch')
      },
      resolve
    }
  )
  assert.equal(r.status, 'failed')
  assert.equal(r.reason, 'not_found')
})

test('a /menu page counts as a menu source and a /book-online page or a booking provider link as a booking', async () => {
  const { crawlWebsite } = await import('../domain/website-crawler.mjs')
  const html = (title, body) =>
    `<!doctype html><html><head><title>${title}</title></head><body><nav><a href="/menu">Menu</a><a href="/book-online">Book Online</a></nav>${body}</body></html>`
  const pages = {
    'https://bistro.example/': html(
      'Bistro',
      '<p>Welcome</p><a href="https://www.opentable.com/r/bistro">Reserve</a>'
    ),
    'https://bistro.example/menu': html('Menu | Bistro', '<p>Pasta</p>'),
    'https://bistro.example/book-online': html('Book Online | Bistro', '<p>Pick a time</p>')
  }
  const fetch = async (url) =>
    pages[url]
      ? new Response(pages[url], { status: 200, headers: { 'content-type': 'text/html' } })
      : new Response('', { status: 404 })
  const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
  const r = await crawlWebsite('https://bistro.example/', { maxPages: 5 }, { fetch, resolve })
  assert.deepEqual(
    r.menus.map((m) => m.url),
    ['https://bistro.example/menu']
  )
  assert.deepEqual(r.bookings.map((b) => b.url).sort(), [
    'https://bistro.example/book-online',
    'https://www.opentable.com/r/bistro'
  ])
})

test('a business of any trade is read from its JSON-LD, with its most specific schema.org type', () => {
  const ld = (node) =>
    `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify(node)}</script></head><body></body></html>`
  const dentist = extractPage(
    ld({
      '@context': 'https://schema.org',
      '@type': ['LocalBusiness', 'Dentist'],
      name: 'Elite Smiles',
      telephone: '812-555-0154',
      address: { streetAddress: '1800 South 3rd St', addressLocality: 'Terre Haute' }
    }),
    'https://smiles.test/'
  )
  assert.equal(dentist.business.type, 'Dentist')
  assert.equal(dentist.business.name, 'Elite Smiles')
  assert.equal(dentist.business.telephone, '812-555-0154')
  assert.match(dentist.business.address, /1800 South 3rd St/)
  assert.equal(
    extractPage(ld({ '@type': 'LocalBusiness', name: 'Shop' }), 'https://s.test/').business.type,
    'LocalBusiness'
  )
  assert.equal(
    extractPage(ld({ '@type': 'Restaurant', name: 'Pho' }), 'https://p.test/').business.type,
    'Restaurant'
  )
  // Not a business at all: no profile is read from it.
  assert.equal(extractPage(ld({ '@type': 'WebSite', name: 'Site' }), 'https://w.test/').business, null)
})

// Pilot 24/10/2026: a home page with no JSON-LD or og:site_name gave its whole SEO title as the business name.
test('nameFromTitle keeps the brand of a home page title, drops page words, keeps a title with no separator', () => {
  assert.equal(nameFromTitle('Las Tortas No. 1 | Taquerias in New York City'), 'Las Tortas No. 1')
  assert.equal(nameFromTitle('Home | Levain Bakery'), 'Levain Bakery')
  assert.equal(nameFromTitle('Welcome to Tartine'), 'Tartine')
  assert.equal(nameFromTitle('Brewlet Coffee & Kitchen \u2014 H\u1ed9i An'), 'Brewlet Coffee & Kitchen')
  assert.equal(nameFromTitle('A-1 Plumbing'), 'A-1 Plumbing')
  assert.equal(nameFromTitle(''), undefined)
})

const LOGO_PAGE = `<!doctype html><html><head><title>Bistro</title>
<meta property="og:image" content="/img/og-cover.jpg">
<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch.png">
<link rel="stylesheet" href="/x.css">
<script type="application/ld+json">{"@type":"Restaurant","name":"Bistro","logo":"/brand/ld-logo.png"}</script>
<script type="application/ld+json">{"@type":"Organization","logo":{"@type":"ImageObject","url":"https://cdn.test/org-logo.svg"}}</script>
</head><body>
<header><a href="/"><img src="/img/header-mark.png" alt="Bistro"></a><nav><a href="/menu">Menu</a></nav></header>
<main><img src="/img/dish.jpg" alt="Dish"><img class="site-logo" src="/img/logo-small.png" alt=""></main>
<footer><img src="/img/footer-partner.png" alt="Partner logo"></footer></body></html>`

test('extractPage lists logo candidates by where they were found, in the order a person would trust them', () => {
  const page = extractPage(LOGO_PAGE, 'https://bistro.test/')
  const by = Object.fromEntries(page.logos.map((l) => [l.url, l.via]))
  assert.equal(by['https://bistro.test/brand/ld-logo.png'], 'jsonld-logo')
  assert.equal(by['https://cdn.test/org-logo.svg'], 'jsonld-logo')
  assert.equal(by['https://bistro.test/img/header-mark.png'], 'header-img')
  assert.equal(by['https://bistro.test/img/logo-small.png'], 'img-named')
  assert.equal(by['https://bistro.test/img/footer-partner.png'], 'img-named')
  assert.equal(by['https://bistro.test/apple-touch.png'], 'apple-touch-icon')
  assert.equal(by['https://bistro.test/favicon.ico'], 'icon')
  assert.equal(by['https://bistro.test/img/og-cover.jpg'], 'og-image')
  assert.equal(by['https://bistro.test/img/dish.jpg'], undefined)
  assert.equal(page.logos[0].via, 'jsonld-logo')
})

test('a page with no logo hint lists none', () => {
  assert.deepEqual(
    extractPage('<html><body><img src="/a.jpg" alt="x"></body></html>', 'https://a.test/').logos,
    []
  )
})

test('crawlWebsite keeps the home page logo candidates once, capped, on the result', async () => {
  const fetchImpl = async (url) =>
    String(url).endsWith('robots.txt') || String(url).includes('sitemap')
      ? new Response('', { status: 404 })
      : html(LOGO_PAGE)()
  const out = await crawlWebsite('https://bistro.test/', { maxPages: 1 }, { fetch: fetchImpl, resolve })
  assert.ok(out.logos.length >= 6 && out.logos.length <= 12)
  assert.equal(new Set(out.logos.map((l) => l.url)).size, out.logos.length)
  assert.equal(out.logos[0].via, 'jsonld-logo')
})

test('a page read through the browser fallback lists its logo candidates too', async () => {
  const { renderedPagesResult } = await import('../domain/website-browser.mjs')
  const base = {
    source: 'website',
    provider: 'apify-browser',
    cursor: null,
    pages: [],
    media: [],
    menus: [],
    socials: {},
    profile: {},
    coverage: { fetched: 0 }
  }
  const out = renderedPagesResult([{ url: 'https://bistro.test/', html: LOGO_PAGE }], base)
  assert.equal(out.logos[0].via, 'jsonld-logo')
  assert.equal(out.logos[0].sourceUrl, 'https://bistro.test/')
})
