import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectStack, STACK_PACK_NAMES } from '../domain/site-stack.mjs'

const NOW = new Date('2026-10-18T00:00:00Z')
const detect = (html, over = {}) =>
  detectStack({ html, finalUrl: 'https://example-restaurant.vn/', now: NOW, ...over })

const WORDPRESS = `<!doctype html><html><head><meta name="generator" content="WordPress 6.5.2" />
<link rel="stylesheet" href="https://tamarel.example/wp-content/themes/astra/style.css"></head>
<body><footer>© 2016 – 2024 Tamarel Restaurant · <a href="mailto:Hello@Tamarel.example?subject=Table">Hello@Tamarel.example</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
<a href="https://www.facebook.com/TamarelHoiAn/">Facebook</a>
<a href="https://www.instagram.com/tamarel.hoian/">IG</a>
<a href="https://www.youtube.com/watch?v=abc">clip</a>
<a href="https://www.youtube.com/@tamarelhoian">YouTube</a>
<img src="/wp-content/uploads/logo@2x.png" alt="">
</footer></body></html>`

const WIX = `<html><head><link rel="stylesheet" href="https://static.wixstatic.com/sites/abc.css"><script src="https://static.parastorage.com/x.js"></script></head>
<body><p>Copyright 2019 Moon Lotus. Write to info@moonlotus.example or noreply@wix.com</p>
<a href="https://www.tiktok.com/@moonlotus">TikTok</a></body></html>`

const SQUARESPACE = `<html><head><link href="https://static1.squarespace.com/static/x.css"></head><body>&copy; 2025 Nu Eatery</body></html>`

const JOOMLA = `<html><head><script src="/media/system/js/core.js"></script><link href="/media/jui/css/bootstrap.css"></head>
<body>(c) 2012-2021 Mango Rooms · <a href="index.php?option=com_content&view=article&id=1">About</a></body></html>`

const NEXT = `<html><head><script src="/_next/static/chunks/main.js"></script></head><body>Hello</body></html>`

const BLANK = `<html><body><p>A page with nothing to say. Contact: sales@test.example.com, hi@example.org</p></body></html>`

test('WordPress with a version from the generator meta, last year of a © range, lowercased unique emails, profile links only', () => {
  const out = detect(WORDPRESS)
  assert.deepEqual(out, {
    cms: 'WordPress',
    cmsVersion: '6.5.2',
    copyrightYear: 2024,
    emails: ['hello@tamarel.example'],
    socials: {
      facebook: 'https://www.facebook.com/TamarelHoiAn/',
      instagram: 'https://www.instagram.com/tamarel.hoian/',
      youtube: 'https://www.youtube.com/@tamarelhoian'
    }
  })
})

test('Wix by fingerprint: no version, plain-text email kept, noreply dropped, TikTok profile', () => {
  const out = detect(WIX)
  assert.deepEqual(out, {
    cms: 'Wix',
    cmsVersion: null,
    copyrightYear: 2019,
    emails: ['info@moonlotus.example'],
    socials: { tiktok: 'https://www.tiktok.com/@moonlotus' }
  })
})

test('error-tracking DSNs and builder domains are not emails: a 32-hex local part, sentry.wixpress.com, ingest.sentry.io', () => {
  const html = `<footer>Write to <a href="mailto:hello@thelarchhouse.example">us</a>.
    cd64ba1f47df485bba2b0076c0dd3b25@sentry.wixpress.com 8c4075d5481d476e945486754f783364@sentry.io
    https://abc@o123.ingest.sentry.io/1 support@wix.com</footer>`
  assert.deepEqual(detect(html).emails, ['hello@thelarchhouse.example'])
})

test('Squarespace by host fingerprint and &copy; year', () => {
  assert.deepEqual(detect(SQUARESPACE), {
    cms: 'Squarespace',
    cmsVersion: null,
    copyrightYear: 2025,
    emails: [],
    socials: {}
  })
})

test('Joomla by media paths and com_content; (c) range takes the later year', () => {
  const out = detect(JOOMLA)
  assert.deepEqual([out.cms, out.copyrightYear], ['Joomla', 2021])
})

test('Next.js by _next/ path; nothing else on the page', () => {
  assert.deepEqual(detect(NEXT), {
    cms: 'Next.js',
    cmsVersion: null,
    copyrightYear: null,
    emails: [],
    socials: {}
  })
})

test('nothing recognised: cms null; example.* addresses are not contacts', () => {
  assert.deepEqual(detect(BLANK), {
    cms: null,
    cmsVersion: null,
    copyrightYear: null,
    emails: [],
    socials: {}
  })
  assert.deepEqual(detect(''), { cms: null, cmsVersion: null, copyrightYear: null, emails: [], socials: {} })
  assert.deepEqual(detectStack({}), {
    cms: null,
    cmsVersion: null,
    copyrightYear: null,
    emails: [],
    socials: {}
  })
})

test('PageSpeed stackPacks win over the page, mapped to a known name; the generator still supplies the version', () => {
  assert.equal(detect(NEXT, { stackPacks: [{ id: 'wordpress', title: 'WordPress' }] }).cms, 'WordPress')
  assert.equal(detect(WIX, { stackPacks: ['Joomla'] }).cms, 'Joomla')
  assert.equal(detect(WIX, { stackPacks: [{ title: 'Something Unknown' }] }).cms, 'Wix')
  const wp = detect(WORDPRESS, { stackPacks: [{ title: 'WordPress' }] })
  assert.deepEqual([wp.cms, wp.cmsVersion], ['WordPress', '6.5.2'])
  const mismatch = detect(WORDPRESS, { stackPacks: [{ title: 'React' }] })
  assert.deepEqual([mismatch.cms, mismatch.cmsVersion], ['React', null])
  for (const name of [
    'WordPress',
    'Joomla',
    'Drupal',
    'Wix',
    'Magento',
    'Shopify',
    'Next.js',
    'Nuxt',
    'Gatsby',
    'Angular',
    'React',
    'Vue'
  ])
    assert.ok(STACK_PACK_NAMES.includes(name), name)
})

test('copyright year must be plausible: 1995 up to next year; the latest match on the page wins', () => {
  assert.equal(detect('<p>© 1899 Old</p>').copyrightYear, null)
  assert.equal(detect('<p>© 2031 Future</p>').copyrightYear, null)
  assert.equal(detect('<p>© 2027 Next</p>').copyrightYear, 2027)
  assert.equal(detect('<p>© 2010 Shop</p><p>Copyright 2023 Shop</p>').copyrightYear, 2023)
  assert.equal(detect('<p>&#169; 2020 Shop</p>').copyrightYear, 2020)
  assert.equal(detect('<p>© 2018 - 2022 Shop</p>').copyrightYear, 2022)
})

test('host fingerprints from finalUrl: wixsite, blogspot, myshopify, webflow.io, wordpress.com', () => {
  const host = (u) => detect('<html></html>', { finalUrl: u }).cms
  assert.equal(host('https://moon.wixsite.com/lotus'), 'Wix')
  assert.equal(host('https://banhmi.blogspot.com/'), 'Blogger')
  assert.equal(host('https://la-eatery.myshopify.com/'), 'Shopify')
  assert.equal(host('https://hill.webflow.io/'), 'Webflow')
  assert.equal(host('https://phin.wordpress.com/'), 'WordPress')
  assert.equal(host('not a url'), null)
})
