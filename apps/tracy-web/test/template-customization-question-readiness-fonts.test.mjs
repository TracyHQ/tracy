/**
 * Template Customization Question Readiness, LANG-2 fonts (TCH #1013): a font the template loads that cannot draw the letters of a
 * language the customer may choose. Measured 10/10/2026 on dev g60-ess-wp-full and g60-ess-j-full (JA Essence, vi): the heading
 * font Jost has no Vietnamese letters (Google serves cyrillic, latin, latin-ext; the WordPress theme ships it cut to latin), so
 * "đề" was drawn as "đê" with a loose grave. The fixtures carry the theme's real Jost file; Google Fonts answers through a fake
 * `fetchText`, the way the runner passes the real one.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { googleFamilies } from '../src/lib/template-customization-question-readiness/readers/template-fonts.js'
import { offeredScripts } from '../src/lib/template-customization-question-readiness/rules/lang-2-font-glyphs.js'
import { lang2OneLanguageEverywhere } from '../src/lib/template-customization-question-readiness/rules/lang-2-one-language-everywhere.js'
import { contextOf, dumpOf, zipOf } from './template-customization-question-readiness-fixtures.mjs'

const FONTS = new URL('../../../packages/cms/tracy-wordpress-theme/overlays/', import.meta.url)
const JOST = readFileSync(new URL('wp-ja-essence/assets/fonts/jost-400.woff2', FONTS))
const ICONS = readFileSync(new URL('wp-ja-impact/assets/fonts/fa-solid-900.woff2', FONTS))

const WP = {
  platform: 'wordpress',
  label: 'JA Essence',
  version: '1.0.12',
  template: 'ja-essence',
  install: { database: { file: 'db.sql.gz' } }
}

/** A WordPress release whose theme zip holds `theme` (path → text or bytes). */
function release(/** @type {Record<string, string | Buffer>} */ theme, fetchText = undefined) {
  const context = contextOf(WP, {
    'db.sql.gz': dumpOf({
      tr_options: [{ option_name: 'stylesheet', option_value: 'wp-ja-essence' }],
      tr_posts: [
        {
          ID: '10',
          post_content: '<!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph -->',
          post_title: 'Home',
          post_status: 'publish',
          post_name: 'home',
          post_parent: '0',
          post_type: 'page'
        }
      ]
    }),
    'wp-ja-essence-1.0.12.zip': zipOf({
      'wp-ja-essence/style.css': '/* Theme Name: JA Essence */',
      ...Object.fromEntries(Object.entries(theme).map(([f, t]) => [`wp-ja-essence/${f}`, t]))
    })
  })
  return fetchText ? { ...context, fetchText } : context
}

const VI = 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+1EA0-1EF9'
/** Google Fonts as a browser is answered: Lora has a vietnamese face, Jost does not. */
const google = async (/** @type {string} */ url) => {
  if (/family=Lora/.test(url))
    return `/* vietnamese */\n@font-face { font-family: 'Lora'; src: url(https://fonts.gstatic.com/l1.woff2); unicode-range: ${VI}; }\n/* latin */\n@font-face { font-family: 'Lora'; src: url(https://fonts.gstatic.com/l2.woff2); unicode-range: U+0000-00FF; }`
  if (/family=Jost/.test(url))
    return "/* latin-ext */\n@font-face { font-family: 'Jost'; src: url(https://fonts.gstatic.com/j1.woff2); unicode-range: U+0100-02BA; }\n/* latin */\n@font-face { font-family: 'Jost'; src: url(https://fonts.gstatic.com/j2.woff2); unicode-range: U+0000-00FF; }"
  throw new Error('400')
}

test('the customer may choose Vietnamese on every CMS: its letters are checked', () => {
  for (const platform of ['wordpress', 'joomla', 'emdash']) assert.deepEqual(offeredScripts(platform), ['vi'])
})

test('a Google Fonts address names its families (css2 and the older css)', () => {
  assert.deepEqual(
    googleFamilies(
      'https://fonts.googleapis.com/css2?family=Jost:wght@400;600&amp;family=Noto+Serif:wght@400&display=swap'
    ),
    ['Jost', 'Noto Serif']
  )
  assert.deepEqual(googleFamilies('https://fonts.googleapis.com/css?family=Roboto:300,400|Open+Sans'), [
    'Roboto',
    'Open Sans'
  ])
})

test('LANG-2 fails a font file the theme ships that cannot draw Vietnamese (JA Essence WP Jost); an icon font is no text', async () => {
  const css =
    '@font-face { font-family: "Jost"; src: url("../fonts/jost-400.woff2") format("woff2"); }\n' +
    '@font-face { font-family: "Icons"; src: url("../fonts/fa-solid-900.woff2") format("woff2"); }\n' +
    'h1 { font-family: "Jost", sans-serif; } .i { font-family: Icons; }\n'
  const red = await lang2OneLanguageEverywhere.run(
    release({
      'assets/css/theme.css': css,
      'assets/fonts/jost-400.woff2': JOST,
      'assets/fonts/fa-solid-900.woff2': ICONS
    })
  )
  assert.equal(red.status, 'fail')
  assert.match(
    red.message,
    /fonts: 'Jost' cannot draw \d+ of the 102 vietnamese letters .*assets\/fonts\/jost-400\.woff2/
  )
  assert.doesNotMatch(red.message, /Icons/)
  // The same face, unused by any rule: nothing to draw.
  const unused = await lang2OneLanguageEverywhere.run(
    release({
      'assets/css/theme.css': '@font-face { font-family: "Jost"; src: url("../fonts/jost-400.woff2"); }\n',
      'assets/fonts/jost-400.woff2': JOST
    })
  )
  assert.doesNotMatch(unused.message, /fonts:/)
})

test('LANG-2 asks Google Fonts for a family the theme loads from it: one without the subset fails, one with it passes', async () => {
  const php = (/** @type {string} */ family) =>
    `<?php wp_enqueue_style( 'f', 'https://fonts.googleapis.com/css2?family=${family}:wght@400&display=swap' );\n`
  const red = await lang2OneLanguageEverywhere.run(release({ 'functions.php': php('Jost') }, google))
  assert.equal(red.status, 'fail')
  assert.match(
    red.message,
    /fonts: 'Jost' cannot draw 102 of the 102 vietnamese letters .*Google Fonts, functions\.php/
  )
  const green = await lang2OneLanguageEverywhere.run(release({ 'functions.php': php('Lora') }, google))
  assert.doesNotMatch(green.message, /fonts:/)
  // Without a door to the network the family is said to be unchecked, never passed or failed in silence.
  const offline = await lang2OneLanguageEverywhere.run(release({ 'functions.php': php('Jost') }))
  assert.doesNotMatch(offline.message, /fonts:/)
  assert.ok(
    offline.details.some((d) => /fonts not checked .*'Jost' \(vi\)/.test(d)),
    offline.details.join(' | ')
  )
})

/**
 * Icon fonts draw pictures, never the site's words (Joomla quickstarts, 14/10/2026: Font Awesome, swiper-icons). Each
 * one below would read as a text face that lacks Vietnamese if judged by its file alone: the Jost file stands in for an
 * icon set that draws by ligature on the Latin letters (swiper-icons, Material Icons), and two sets ship no file at all.
 */
const ICON_SETS =
  '@font-face { font-family: "Jost"; src: url("../fonts/jost-400.woff2") format("woff2"); }\n' +
  '@font-face { font-family: "swiper-icons"; src: url("../fonts/swiper-icons.woff2") format("woff2"); }\n' +
  '@font-face { font-family: "Font Awesome 6 Brands"; src: url("../webfonts/fa-brands-400.woff2") format("woff2"); }\n' +
  '@font-face { font-family: "FontAwesome"; src: url("../fonts/fontawesome-webfont.woff2") format("woff2"); }\n' +
  '@font-face { font-family: "Marks"; src: url("../fonts/marks.woff2") format("woff2"); unicode-range: U+E000-F8FF; }\n' +
  '@font-face { font-family: "Pictos"; src: url("../fonts/pictos.woff2") format("woff2"); }\n' +
  'h1 { font-family: "Jost", sans-serif; }\n' +
  '.swiper-button-next:after { font-family: swiper-icons; }\n' +
  '.fab { font-family: "Font Awesome 6 Brands"; } .fa { font-family: FontAwesome; } .mark { font-family: Marks; }\n' +
  '[class^="pi-"]::before, [class*=" pi-"]::before { font-family: "Pictos"; }\n' +
  '.pi { font-family: var(--pi-font); speak: never; } :root { --pi-font: "Pictos"; }\n'
/** Google Fonts answers an icon family with one face of no language. */
const googleIcons = async (/** @type {string} */ url) => {
  if (/family=Material\+Symbols\+Outlined/.test(url))
    return "/* fallback */\n@font-face { font-family: 'Material Symbols Outlined'; src: url(https://fonts.gstatic.com/m.woff2) format('woff2'); }"
  return google(url)
}
const iconRelease = (/** @type {string} */ more = '') =>
  release(
    {
      'assets/css/theme.css': ICON_SETS + more,
      'functions.php':
        "<?php wp_enqueue_style( 'i', 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined' );\n",
      'assets/fonts/jost-400.woff2': JOST,
      'assets/fonts/swiper-icons.woff2': JOST,
      'assets/fonts/pictos.woff2': JOST
    },
    googleIcons
  )

test('LANG-2 never judges an icon font as text: by its name, a cut to the Private Use Area, or rules that draw only icons', async () => {
  const red = await lang2OneLanguageEverywhere.run(iconRelease())
  // A real text face that lacks Vietnamese still fails, alone.
  assert.equal(red.status, 'fail')
  assert.match(red.message, /fonts: 'Jost' cannot draw \d+ of the 102 vietnamese letters/)
  const said = [red.message, ...red.details].join(' | ')
  assert.doesNotMatch(said, /swiper|awesome|marks|pictos|material/i, said)
})

test('LANG-2 still judges a face that sets the words of an element, whatever else draws icons in it', async () => {
  for (const words of [
    'p { font-family: "Pictos", serif; }\n',
    // A `font` shorthand is not read rule by rule: a family it names may set words.
    'body { font: 400 16px/1.5 "Pictos", serif; }\n'
  ]) {
    const red = await lang2OneLanguageEverywhere.run(iconRelease(words))
    assert.equal(red.status, 'fail', words)
    assert.match(red.message, /'Pictos' cannot draw \d+ of the 102 vietnamese letters/, words)
    assert.match(red.message, /'Jost' cannot draw/, words)
  }
})

const BE_VIETNAM = readFileSync(new URL('wp-ja-essence/assets/fonts/be-vietnam-pro-400.woff2', FONTS))
/** The template's own replacement for Vietnamese pages (spec final rule 6): JA Essence WP 1.0.16 and Joomla 1.3.4. */
const REPLACEMENT_FACES =
  '@font-face { font-family: "Jost"; src: url("../fonts/jost-400.woff2") format("woff2"); }\n' +
  '@font-face { font-family: "Be Vietnam Pro"; src: url("../fonts/be-vietnam-pro-400.woff2") format("woff2"); }\n' +
  'h1 { font-family: var(--je-font-display, "Jost"), sans-serif; } :root { --je-font-display: "Jost"; }\n'
const replacementRelease = (/** @type {string} */ scoped) =>
  release({
    'assets/css/theme.css': REPLACEMENT_FACES + scoped,
    'assets/fonts/jost-400.woff2': JOST,
    'assets/fonts/be-vietnam-pro-400.woff2': BE_VIETNAM
  })

test('LANG-2 accepts a font the template replaces, on pages of that language, with one that draws its letters (rule 6)', async () => {
  for (const scoped of [
    // JA Essence WordPress 1.0.16
    'html:lang(vi), html:lang(vi) body { --je-font-display: "Be Vietnam Pro"; }\n',
    // JA Essence Joomla 1.3.4, css/language-fonts.css, over a heading set in T4's custom property
    'h2 { font-family: var(--heading-font-family); } :root { --heading-font-family: "Jost"; }\n' +
      ':root:lang(vi) {\n  --heading-font-family: "Be Vietnam Pro", sans-serif;\n}\nhtml:lang(vi) { --je-font-display: "Be Vietnam Pro"; }\n',
    // a plain rule inside a media query
    '@media screen { html:lang(vi) h1, html:lang(vi) h2 { font-family: "Be Vietnam Pro", sans-serif; } }\n'
  ]) {
    const green = await lang2OneLanguageEverywhere.run(replacementRelease(scoped))
    assert.doesNotMatch(green.message, /fonts:/, scoped)
    assert.ok(
      green.details.some((d) => /'Jost' .*replaced on vi pages by 'Be Vietnam Pro'/.test(d)),
      green.details.join(' | ')
    )
  }
})

test('LANG-2 still fails a font whose replacement is for another language, or cannot draw the letters either', async () => {
  for (const scoped of [
    'html:lang(fr) { --je-font-display: "Be Vietnam Pro"; }\n',
    'html:lang(vi) { --je-font-display: "Jost"; }\n',
    'html:lang(vi) { --je-font-display: "Missing Sans"; }\n'
  ]) {
    const red = await lang2OneLanguageEverywhere.run(replacementRelease(scoped))
    assert.equal(red.status, 'fail', scoped)
    assert.match(red.message, /fonts: 'Jost' cannot draw/, scoped)
  }
})

test('LANG-2 counts a family cut per language (a vietnamese face with its unicode-range), never as an icon font', async () => {
  const VI_RANGE =
    'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB'
  const result = await lang2OneLanguageEverywhere.run(
    release({
      // JA Essence WordPress 1.0.16: Noto Serif cut to latin, plus its vietnamese cut for those code points only.
      'assets/css/theme.css':
        '@font-face { font-family: "Noto Serif"; src: url("../fonts/noto-serif-400.woff2") format("woff2"); }\n' +
        `@font-face { font-family: "Noto Serif"; src: url("../fonts/noto-serif-vietnamese-400.woff2") format("woff2"); unicode-range: ${VI_RANGE}; }\n` +
        'body { font-family: "Noto Serif", serif; }\n',
      'assets/fonts/noto-serif-400.woff2': readFileSync(
        new URL('wp-ja-essence/assets/fonts/noto-serif-400.woff2', FONTS)
      ),
      'assets/fonts/noto-serif-vietnamese-400.woff2': readFileSync(
        new URL('wp-ja-essence/assets/fonts/noto-serif-vietnamese-400.woff2', FONTS)
      )
    })
  )
  assert.doesNotMatch(result.message, /fonts:/)
  assert.ok(!result.details.some((d) => /Noto Serif/.test(d)), result.details.join(' | '))
})

test('LANG-2 judges the font a page of the language actually draws with, rule by rule (spec rule 6)', async () => {
  for (const [scoped, why] of [
    // The replacement covers the headings' property; the buttons are set in Jost by name and stay Jost.
    [
      'html:lang(vi) { --je-font-display: "Be Vietnam Pro"; }\n.btn { font-family: "Jost", sans-serif; }\n',
      /\.btn/
    ],
    // Be Vietnam Pro is only a fallback after Jost, which the template loads: the page draws with Jost.
    ['html:lang(vi) { --je-font-display: "Jost", "Be Vietnam Pro"; }\n', /h1/],
    // A Vietnamese rule for another selector replaces nothing on h1.
    ['html:lang(vi) h3 { font-family: "Be Vietnam Pro"; }\n', /h1/]
  ]) {
    const red = await lang2OneLanguageEverywhere.run(replacementRelease(scoped))
    assert.equal(red.status, 'fail', scoped)
    assert.match(red.message, /fonts: 'Jost' cannot draw/, scoped)
    assert.match(red.message, why, scoped)
  }
  // A family named only as a fallback the template never loads is not counted: 'Missing Sans' draws nothing.
  const green = await lang2OneLanguageEverywhere.run(
    replacementRelease('html:lang(vi) { --je-font-display: "Missing Sans", "Be Vietnam Pro"; }\n')
  )
  assert.doesNotMatch(green.message, /fonts:/)
})

test('LANG-2 follows a T4 font setting to the custom property T4 writes it into (JA Essence Joomla 1.3.4)', async () => {
  const essence = (/** @type {string} */ languageFonts) =>
    contextOf(
      {
        platform: 'joomla',
        label: 'JA Essence',
        version: '1.3.4',
        template: 'ja_essence',
        install: { installer: { file: 'installer.zip' } }
      },
      {
        'installer.zip': zipOf({
          'templates/ja_essence/etc/site/default.json': JSON.stringify({
            heading_font_family: 'Jost',
            megamenu_font_family: 'Jost',
            body_font_family: 'Lora'
          }),
          'templates/ja_essence/css/language-fonts.css': languageFonts,
          'templates/ja_essence/fonts/be-vietnam-pro-400.woff2': BE_VIETNAM
        })
      }
    )
  const face =
    '@font-face { font-family: "Be Vietnam Pro"; src: url("../fonts/be-vietnam-pro-400.woff2"); }\n'
  const both = await lang2OneLanguageEverywhere.run({
    ...essence(
      `${face}:root:lang(vi) { --heading-font-family: "Be Vietnam Pro", sans-serif; --megamenu-font-family: "Be Vietnam Pro", sans-serif; }\n`
    ),
    fetchText: google
  })
  assert.doesNotMatch(both.message, /fonts:/)
  assert.ok(
    both.details.some((d) => /'Jost' .*replaced on vi pages by 'Be Vietnam Pro'/.test(d)),
    both.details.join(' | ')
  )
  // Replacing the headings only leaves the menu in Jost.
  const headings = await lang2OneLanguageEverywhere.run({
    ...essence(`${face}:root:lang(vi) { --heading-font-family: "Be Vietnam Pro", sans-serif; }\n`),
    fetchText: google
  })
  assert.equal(headings.status, 'fail')
  assert.match(headings.message, /fonts: 'Jost' cannot draw .*megamenu_font_family/)
})
