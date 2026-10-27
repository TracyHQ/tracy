/**
 * The letters of a site's language its template's fonts cannot draw (LANG-2, TCH #1013). Measured 10/10/2026 on dev
 * g60-ess-wp-full and g60-ess-j-full (JA Essence, Vietnamese): the heading font Jost has no Vietnamese glyphs anywhere, so
 * "đề" was drawn as "đê" with a loose grave accent. Once the site speaks its language, the families its home page uses that
 * cannot draw the letters it prints are given faces of the same family name, limited to those letters.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { fallbackCss, fallbackFaces, glyphGaps } from '../src/lib/font-glyphs.js'
import { giveGlyphs } from '../src/sites/brief-engines/glyph-fallback.js'
import { essenceModel, essenceSite, runEssence } from './_joomla-essence-site.mjs'

const SITE = 'https://bakery.tracy.site/'
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329'
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF'
const VI =
  'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB'
const face = (/** @type {string} */ subset, family, weight, range, file) =>
  `/* ${subset} */\n@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url(https://fonts.gstatic.com/s/${file}.woff2) format('woff2');\n  unicode-range: ${range};\n}`

/** What Google answers, by family asked: Jost has no vietnamese face, Noto Serif and Be Vietnam Pro do. */
function google(/** @type {string} */ url) {
  const u = new URL(url)
  if (u.pathname === '/css')
    return [
      face('latin-ext', 'Jost', 400, LATIN_EXT, 'jost/v1/ext'),
      face('latin', 'Jost', 400, LATIN, 'jost/v1/latin'),
      face('vietnamese', 'Noto Serif', 400, VI, 'notoserif/v1/vi'),
      face('latin', 'Noto Serif', 400, LATIN, 'notoserif/v1/latin')
    ].join('\n')
  const family = String(u.searchParams.get('family')).split(':')[0]
  if (family === 'Jost') return [face('latin', 'Jost', 400, LATIN, 'jost/v1/latin2')].join('\n')
  if (family === 'Be Vietnam Pro')
    return [
      face('vietnamese', 'Be Vietnam Pro', 400, VI, 'bevietnampro/v12/vi-400'),
      face('latin', 'Be Vietnam Pro', 400, LATIN, 'bevietnampro/v12/latin-400'),
      face('vietnamese', 'Be Vietnam Pro', 700, VI, 'bevietnampro/v12/vi-700')
    ].join('\n')
  return '/* not a family */'
}

/** A site reader: JA Essence Joomla's home (Google Fonts link, headings in Jost, body in Noto Serif), and what Google answers. */
function reader({ html } = {}) {
  const asked = []
  return {
    asked,
    base: SITE,
    text: async (/** @type {string} */ url, /** @type {Record<string, string>} */ headers = {}) => {
      asked.push({ url, ua: headers['user-agent'] ?? '' })
      if (url === SITE)
        return (
          html ??
          '<html><head><link href="https://fonts.googleapis.com/css?family=Noto+Serif%3A400%2C700%7CJost" rel="stylesheet">' +
            '<style>h1,h2{font-family:Jost, sans-serif} body{font-family:"Noto Serif", serif}</style></head>' +
            '<body><h2>Đề nghị hợp tác</h2><p>Tiệm bánh gia đình ở Dubai</p></body></html>'
        )
      if (/fonts\.googleapis\.com/.test(url)) return google(url)
      throw new Error(`not served: ${url}`)
    },
    bytes: async () => null
  }
}

test('g60: Jost cannot draw ề, Noto Serif can; Jost is given Be Vietnam Pro’s Vietnamese faces under its own name', async () => {
  const read = reader()
  const gaps = await glyphGaps({
    html: await read.text(SITE),
    base: SITE,
    lang: 'vi-VN',
    fetchText: read.text,
    fetchBytes: read.bytes
  })
  assert.deepEqual(
    gaps.map((g) => [g.family, g.generic, g.missing.includes('ề')]),
    [['Jost', 'sans-serif', true]]
  )
  const faces = await fallbackFaces({ gaps, fetchText: read.text })
  assert.deepEqual(
    faces.map((f) => [f.family, f.weight, f.from, f.src]),
    [
      ['Jost', '400', 'Be Vietnam Pro', 'https://fonts.gstatic.com/s/bevietnampro/v12/vi-400.woff2'],
      ['Jost', '700', 'Be Vietnam Pro', 'https://fonts.gstatic.com/s/bevietnampro/v12/vi-700.woff2']
    ]
  )
  assert.match(fallbackCss(faces), /font-family:"Jost";.*unicode-range:U\+0102-0103/)
  assert.ok(
    read.asked.filter((a) => /googleapis/.test(a.url)).every((a) => /Chrome/.test(a.ua)),
    'Google is asked as a browser'
  )
})

test('a family the release swaps out for the page’s language is no gap there (JA Nova, JA Donate, 15/10/2026)', async () => {
  // Jost is named only in the custom property, which the release points at Noto Serif on a Vietnamese page
  const html =
    '<html><head><link href="https://fonts.googleapis.com/css?family=Noto+Serif%3A400%2C700%7CJost" rel="stylesheet">' +
    '<style>:root{--body-font-family:Jost, sans-serif} :root:lang(vi){--body-font-family:"Noto Serif", serif}' +
    ' body,h2{font-family:var(--body-font-family)}</style></head>' +
    '<body><h2>Đề nghị hợp tác</h2><p>Tiệm bánh gia đình ở Dubai</p></body></html>'
  const read = reader({ html })
  const gaps = await glyphGaps({
    html,
    base: SITE,
    lang: 'vi-VN',
    fetchText: read.text,
    fetchBytes: read.bytes
  })
  assert.deepEqual(gaps, [])
  // the same sheet on an English page draws Jost, which is judged as before (it has the English letters)
  const en = await glyphGaps({
    html,
    base: SITE,
    lang: 'en-GB',
    fetchText: read.text,
    fetchBytes: read.bytes
  })
  assert.deepEqual(en, [])
  // without the swap, the Vietnamese page draws Jost and it is a gap
  const bare = html.replace(' :root:lang(vi){--body-font-family:"Noto Serif", serif}', '')
  const gaps2 = await glyphGaps({
    html: bare,
    base: SITE,
    lang: 'vi-VN',
    fetchText: read.text,
    fetchBytes: read.bytes
  })
  assert.deepEqual(
    gaps2.map((g) => g.family),
    ['Jost']
  )
})

test('a WordPress site gets the faces as its tracy_glyph_fallback option, said in the report', async () => {
  const writes = []
  const notes = []
  const out = await giveGlyphs({
    platform: 'wordpress',
    reader: reader(),
    lang: 'vi',
    write: async (action, params) => (writes.push({ action, params }), { ok: true }),
    note: (n) => notes.push(n)
  })
  assert.equal(out.faces, 2)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].action, 'content.update')
  assert.deepEqual(
    { kind: writes[0].params.kind, key: writes[0].params.key },
    { kind: 'option', key: 'tracy_glyph_fallback' }
  )
  assert.match(String(writes[0].params.apply_id), /^glyphs-/)
  const value = JSON.parse(String(writes[0].params.fields.value))
  assert.deepEqual(Object.keys(value.faces[0]).sort(), ['family', 'src', 'style', 'subset', 'weight'])
  assert.ok(
    notes.some((n) => /Jost ← Be Vietnam Pro/.test(n)),
    notes.join(' | ')
  )
})

test('an older plugin that does not know the door is said, with the version it needs; nothing fails', async () => {
  const notes = []
  const out = await giveGlyphs({
    platform: 'joomla',
    reader: reader(),
    lang: 'vi-VN',
    template: 'ja_essence',
    write: async () => ({ ok: false, error: 'unsupported', message: 'other_glyphFaces cannot be written' }),
    note: (n) => notes.push(n)
  })
  assert.equal(out.faces, 0)
  assert.ok(
    notes.some((n) => /needs 0\.24\.13 or later/.test(n)),
    notes.join(' | ')
  )
})

test('a site whose fonts draw its language, or one in English, is not written to', async () => {
  const writes = []
  const html =
    '<html><head><style>@font-face{font-family:"Body";src:url(/f.woff2);unicode-range:' +
    VI +
    '} p{font-family:Body}</style></head><body><p>Đề nghị</p></body></html>'
  for (const [lang, page] of [
    ['vi', html],
    ['en', undefined]
  ])
    await giveGlyphs({
      platform: 'wordpress',
      reader: reader({ html: page }),
      lang,
      write: async (action, params) => (writes.push({ action, params }), { ok: true }),
      note: () => {}
    })
  assert.deepEqual(writes, [])
})

test('g60: a Vietnamese JA Essence Joomla Apply gives its template the faces, through the Apply door', async () => {
  const site = essenceSite()
  const plain = site.apply
  const sets = []
  site.apply = async (/** @type {any} */ call) => {
    if (call.action === 'template.siteSettings') return sets.push(call.params), { ok: true }
    return plain(call)
  }
  const read = reader()
  const { notes } = await runEssence({
    site,
    model: essenceModel({ translate: (t) => `VI ${t}` }),
    siteReader: async () => read
  })
  assert.equal(sets.length, 1, notes.join(' | '))
  assert.equal(sets[0].template, 'ja_essence')
  assert.equal(JSON.parse(sets[0].fields.other_glyphFaces).faces[0].family, 'Jost')
  // An English site reads nothing.
  const quiet = reader()
  await runEssence({ model: essenceModel(), languages: ['en'], siteReader: async () => quiet })
  assert.deepEqual(quiet.asked, [])
})

test('the font file of JA Essence WordPress is read: its Jost has no Vietnamese letters', async () => {
  const jost = new Uint8Array(
    readFileSync(
      new URL(
        '../../../packages/cms/tracy-wordpress-theme/overlays/wp-ja-essence/assets/fonts/jost-400.woff2',
        import.meta.url
      )
    )
  )
  const html =
    '<html><head><style>@font-face{font-family:"Jost";src:url("/wp-content/themes/wp-ja-essence/assets/fonts/jost-400.woff2")} h2{font-family:Jost}</style></head><body><h2>Đề nghị</h2></body></html>'
  const gaps = await glyphGaps({
    html,
    base: SITE,
    lang: 'vi',
    fetchText: async () => '',
    fetchBytes: async (url) => (url.endsWith('jost-400.woff2') ? jost : null)
  })
  assert.deepEqual(
    gaps.map((g) => g.family),
    ['Jost']
  )
})

// 🔒 AN ICON FONT SETS NO TEXT (TCH #1013, 14/10/2026). Measured on the local stand (run j2): the built-site check said
// "font awesome 6 free", "font awesome 6 brands", "fontawesome" and "swiper-icons" cannot draw Vietnamese on JA Nova, JA
// Resort, JA Seven and JA Donate Joomla. An icon font draws pictures in the Private Use Area (Font Awesome: 1,435 of them,
// ionicons 696, every text font of this repo none) or names its arrows by ligature (swiper-icons); a gap in it is no gap a
// visitor reads, and giving it Vietnamese faces would only be weight.
test('an icon font is never a gap: by the pictures its file holds, or by the name an icon family goes by', async () => {
  const file = (/** @type {string} */ p) =>
    new Uint8Array(
      readFileSync(new URL(`../../../packages/cms/tracy-wordpress-theme/overlays/${p}`, import.meta.url))
    )
  const awesome = file('wp-ja-impact/assets/fonts/fa-solid-900.woff2')
  const jost = file('wp-ja-essence/assets/fonts/jost-400.woff2')
  const html =
    '<html><head><style>' +
    '@font-face{font-family:"Font Awesome 6 Free";src:url("/fonts/fa-solid-900.woff2")}' +
    '@font-face{font-family:"swiper-icons";src:url("/fonts/swiper.woff2")}' +
    '@font-face{font-family:"Jost";src:url("/fonts/jost-400.woff2")}' +
    '.fa{font-family:"Font Awesome 6 Free"} .swiper-button-next:after{font-family:swiper-icons} h2{font-family:Jost}' +
    '</style></head><body><h2>Đề nghị hợp tác</h2><i class="fa"></i></body></html>'
  const gaps = await glyphGaps({
    html,
    base: SITE,
    lang: 'vi',
    fetchText: async () => '',
    // swiper-icons is read as a file with no pictures at all: only its name tells it is an icon font
    fetchBytes: async (url) => (url.endsWith('fa-solid-900.woff2') ? awesome : jost)
  })
  assert.deepEqual(
    gaps.map((g) => g.family),
    ['Jost'],
    'the text font is still a gap; the two icon fonts are not'
  )
})

test('faces past what the plugins print are cut weight by weight, every family kept, the common weights first', async () => {
  const { fewestFaces, MAX_GLYPH_FACES } = await import('../src/sites/brief-engines/glyph-fallback.js')
  const families = ['Glegoo', 'Londrina Solid', 'Golos Text', 'Poppins', 'Frank Ruhl Libre']
  const weights = ['300', '400', '500', '600', '700', '800']
  const faces = families.flatMap((family) => weights.map((weight) => ({ family, weight })))
  const kept = fewestFaces(faces)
  assert.equal(kept.length, MAX_GLYPH_FACES)
  for (const family of families) {
    const own = kept.filter((f) => f.family === family).map((f) => f.weight)
    assert.ok(own.includes('400') && own.includes('700'), `${family}: ${own}`)
  }
  // a set within the limit is left as it is
  assert.equal(fewestFaces(faces.slice(0, 12)).length, 12)
})
