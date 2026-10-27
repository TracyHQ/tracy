/**
 * A worn design system's fonts held to the site's language (`sites/design-system-glyphs.js`). Measured 13/10/2026: a
 * Vietnamese Tracy Business EmDash site wearing Balsa (Bebas Neue, no Vietnamese cut on Google) printed
 * "BÁNH MÌ NướNG MỗI SÁNG". The family is now replaced whole, in the bytes the write carries, by one that has the cut.
 * Google Fonts and the site are doubles answering with the sheets Google serves (subset comments, unicode ranges).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SWAPS, googleFamilies, swapsFor, withSwaps } from '../src/sites/design-system-glyphs.js'

const face = (family, subset) =>
  `/* ${subset} */\n@font-face { font-family: '${family}'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/${family.replace(/ /g, '').toLowerCase()}/${subset}.woff2) format('woff2'); unicode-range: U+0000-00FF; }\n`

/** What Google serves: Bebas Neue and DM Serif Display without a Vietnamese cut; the replacements with one. */
const GOOGLE = {
  'Bebas Neue': ['latin-ext', 'latin'],
  Inter: ['vietnamese', 'latin-ext', 'latin'],
  Oswald: ['vietnamese', 'latin-ext', 'latin'],
  'DM Serif Display': ['latin-ext', 'latin'],
  'Playfair Display': ['vietnamese', 'latin-ext', 'latin']
}

const VI_HOME =
  '<!doctype html><html lang="vi-VN"><body><h1>Bánh mì nướng mỗi sáng tại Dubai</h1></body></html>'

/** A reader double: the site's home page, and Google's css2 sheets by family. */
function reader(home = VI_HOME, { asked = [] } = {}) {
  return {
    base: 'http://bakery.tracy.test/',
    text: async (url, headers = {}) => {
      if (!url.startsWith('https://fonts.googleapis.com/')) return home
      asked.push({ url, ua: headers['user-agent'] ?? null })
      const family = decodeURIComponent(/family=([^:&]+)/.exec(url)[1].replace(/\+/g, ' '))
      const subsets = GOOGLE[family]
      if (!subsets) return '/* error */ Bad Request'
      return subsets.map((s) => face(family, s)).join('')
    }
  }
}

const BALSA_HREF =
  'https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400&family=Inter:wght@400;500;600;700&display=swap'

const emdash = {
  ok: true,
  id: 'refero:balsa',
  name: 'Balsa',
  platform: 'emdash',
  css: `/* fonts: ${BALSA_HREF} */\n:root { --ds-font-display: "Bebas Neue", Impact, sans-serif; --ds-font-body: "Inter", system-ui, sans-serif; }\n`
}

test('the families of a write are read off its css2 links', () => {
  assert.deepEqual(googleFamilies(emdash.css), ['Bebas Neue', 'Inter'])
  assert.deepEqual(googleFamilies(`<link rel="stylesheet" href="${BALSA_HREF.replace(/&/g, '&amp;')}">`), [
    'Bebas Neue',
    'Inter'
  ])
})

test('a Vietnamese site wearing Bebas Neue gets Oswald, asked of Google as a browser; Inter, which has the cut, stays', async () => {
  const asked = []
  const found = await swapsFor({ out: emdash, reader: reader(VI_HOME, { asked }) })
  assert.equal(found.lang, 'vi-VN')
  assert.deepEqual(
    found.swaps.map(({ from, to, subset }) => ({ from, to, subset })),
    [{ from: 'Bebas Neue', to: 'Oswald', subset: 'vietnamese' }]
  )
  assert.ok(
    asked.every((a) => a.ua && /Chrome/.test(a.ua)),
    'Google answers subset-cut sheets only to a browser'
  )
})

test('EmDash: the stylesheet names Oswald everywhere it named Bebas Neue, and loads it', async () => {
  const found = await swapsFor({ out: emdash, reader: reader() })
  const out = await withSwaps(emdash, found.swaps)
  assert.doesNotMatch(out.css, /Bebas/)
  assert.match(out.css, /--ds-font-display: "Oswald", Impact, sans-serif/)
  assert.match(out.css, /family=Oswald:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600;700/)
  assert.match(out.css, /"Inter", system-ui/, 'a family that draws the language is left as it is')
})

test('Joomla: the module markup links and names the replacement', async () => {
  const joomla = {
    ok: true,
    platform: 'joomla',
    html: `<link rel="stylesheet" href="${BALSA_HREF.replace(/&/g, '&amp;')}"><style id="tracy-ds-slot">h1{font-family:'Bebas Neue', Impact, sans-serif}</style>`,
    module: { title: 'Tracy design system' }
  }
  const found = await swapsFor({ out: joomla, reader: reader() })
  const out = await withSwaps(joomla, found.swaps)
  assert.doesNotMatch(out.html, /Bebas/)
  assert.match(out.html, /font-family:'Oswald', Impact/)
  assert.match(out.html, /family=Oswald:wght@/)
  assert.deepEqual(out.module, joomla.module)
})

test("WordPress: the variation's family is renamed and wears the replacement's faces, never the old ones", async () => {
  const wordpress = {
    ok: true,
    platform: 'wordpress',
    slug: 'tracy-ds-arc',
    variation: {
      settings: {
        typography: {
          fontFamilies: [
            {
              name: 'DM Serif Display',
              slug: 'ds-display',
              fontFamily: '"DM Serif Display", Georgia, serif',
              fontFace: [
                { fontFamily: 'DM Serif Display', src: ['https://fonts.gstatic.com/s/dmserif/a.woff2'] }
              ]
            },
            { name: 'Inter', slug: 'ds-body', fontFamily: '"Inter", system-ui, sans-serif' }
          ]
        }
      },
      styles: {
        css: '/* fonts: https://fonts.googleapis.com/css2?family=DM+Serif+Display:wght@400&family=Inter:wght@400&display=swap */'
      }
    }
  }
  const found = await swapsFor({ out: wordpress, reader: reader() })
  assert.deepEqual(
    found.swaps.map((s) => s.to),
    ['Playfair Display']
  )
  const resolved = []
  const out = await withSwaps(wordpress, found.swaps, {
    fontFaces: async (href) => {
      resolved.push(href)
      return [
        {
          fontFamily: 'Playfair Display',
          fontWeight: '400',
          fontStyle: 'normal',
          src: ['https://fonts.gstatic.com/s/playfair/v.woff2']
        }
      ]
    }
  })
  const [display, body] = out.variation.settings.typography.fontFamilies
  assert.equal(display.fontFamily, '"Playfair Display", Georgia, serif')
  assert.equal(display.name, 'Playfair Display')
  assert.deepEqual(
    display.fontFace.map((f) => f.fontFamily),
    ['Playfair Display']
  )
  assert.match(resolved[0], /family=Playfair\+Display/)
  assert.equal(body.fontFamily, '"Inter", system-ui, sans-serif')
  assert.equal(
    wordpress.variation.settings.typography.fontFamilies[0].fontFamily,
    '"DM Serif Display", Georgia, serif',
    "the system's own answer is not changed in place"
  )
})

test('nothing is replaced when the site is not written in a language with letters of its own', async () => {
  const english = '<html lang="en-US"><body><h1>Bread baked every morning</h1></body></html>'
  assert.deepEqual((await swapsFor({ out: emdash, reader: reader(english) })).swaps, [])
  // a Vietnamese-tagged page that prints none of its own letters needs nothing either
  const bare = '<html lang="vi"><body><h1>Tamarind</h1></body></html>'
  assert.deepEqual((await swapsFor({ out: emdash, reader: reader(bare) })).swaps, [])
})

test('a Google sheet that cannot be read judges nothing, and a site that cannot be read leaves the write as it is', async () => {
  const silent = {
    ...reader(),
    text: async (url) => (url.startsWith('https://fonts.') ? Promise.reject(new Error('timeout')) : VI_HOME)
  }
  assert.deepEqual((await swapsFor({ out: emdash, reader: silent })).swaps, [])
  assert.deepEqual((await swapsFor({ out: emdash, reader: null })).swaps, [])
  assert.equal(await withSwaps(emdash, []), emdash)
})

test('every family named in SWAPS is replaced by one that is not itself in the table', () => {
  for (const [subset, table] of Object.entries(SWAPS))
    for (const to of Object.values(table))
      assert.equal(table[to.toLowerCase()], undefined, `${subset}: ${to} is itself replaced`)
})
