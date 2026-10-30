/**
 * LANG-2 fonts follow a T4 font setting to where css/tpl/theme.tpl.css writes it (follow-up of #1240). T4 substitutes
 * `__heading_font_family` straight into selectors (`h1 { font-family: __heading_font_family }`, JA Tour, Spa,
 * Symphony) or into a property named its own way (`--font-special-family: __special_font_family`, JA Trip), not into
 * a `--heading-font-family` the rule used to assume. A template's css/language-fonts.css re-sets those selectors or
 * that property under :lang(vi), and the rule must pair them.
 *
 * Fixtures (`c/ja-trip-t4-font-settings/`, `c/ja-tour-t4-font-settings/`): css/tpl/theme.tpl.css,
 * css/language-fonts.css (byte for byte) and the T4 profile (reformatted by biome) of the JA Trip 1.0.5 and JA Tour 1.0.2
 * webroots (green packs of joomlart-products fix/published-joomla-templates-green, 12/10/2026). The woff2 files the replacements
 * load stand in with Be Vietnam Pro 400, which draws Vietnamese like the real cuts.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { lang2OneLanguageEverywhere } from '../src/lib/template-customization-question-readiness/rules/lang-2-one-language-everywhere.js'
import { contextOf, zipOf } from './template-customization-question-readiness-fixtures.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const C = path.join(HERE, 'fixtures', 'template-customization-question-readiness', 'c')
const BE_VIETNAM = readFileSync(
  path.join(
    HERE,
    '../../../packages/cms/tracy-wordpress-theme/overlays/wp-ja-essence/assets/fonts/be-vietnam-pro-400.woff2'
  )
)

/**
 * Google Fonts as a browser is answered: Mulish has a vietnamese face; DM Sans, Cookie, Frank Ruhl Libre, Marcellus and
 * Sacramento do not.
 */
const google = async (/** @type {string} */ url) => {
  const family = /family=([^:&]+)/.exec(url)?.[1]?.replace(/\+/g, ' ') ?? ''
  const latin = `/* latin */\n@font-face { font-family: '${family}'; src: url(https://fonts.gstatic.com/x.woff2); unicode-range: U+0000-00FF; }`
  if (family === 'Mulish')
    return `/* vietnamese */\n@font-face { font-family: 'Mulish'; src: url(https://fonts.gstatic.com/v.woff2); unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+1EA0-1EF9; }\n${latin}`
  if (['DM Sans', 'Cookie', 'Frank Ruhl Libre', 'Marcellus', 'Sacramento'].includes(family)) return latin
  throw new Error(`400 ${family}`)
}

/**
 * A Joomla release whose installer holds the template's fixture files, the font files its language-fonts.css loads,
 * and `extra` (path in the template → text); `languageFonts` replaces css/language-fonts.css when given.
 * @param {string} template @param {string} fixture @param {Record<string, string>} extra @param {string} [languageFonts]
 */
function release(template, fixture, extra = {}, languageFonts = undefined) {
  const dir = path.join(C, fixture)
  const read = (/** @type {string} */ f) => readFileSync(path.join(dir, f), 'utf8')
  const sheet = languageFonts ?? read('css/language-fonts.css')
  /** @type {Record<string, string | Buffer>} */
  const files = {}
  for (const f of ['css/tpl/theme.tpl.css', 'etc/site/default.json', 'etc/theme/default.json'])
    try {
      files[`templates/${template}/${f}`] = read(f)
    } catch {
      // Each template keeps its font settings in one of the two profiles.
    }
  files[`templates/${template}/css/language-fonts.css`] = sheet
  for (const m of sheet.matchAll(/url\("\.\.\/(fonts\/[^"]+\.woff2)"\)/g))
    files[`templates/${template}/${m[1]}`] = BE_VIETNAM
  for (const [f, t] of Object.entries(extra)) files[`templates/${template}/${f}`] = t
  return {
    ...contextOf(
      {
        platform: 'joomla',
        label: template,
        version: '1.0.0',
        template,
        install: { installer: { file: 'installer.zip' } }
      },
      { 'installer.zip': zipOf(files) }
    ),
    fetchText: google
  }
}

test('LANG-2 pairs a T4 setting theme.tpl.css writes into selectors with the same selectors under :lang(vi) (JA Tour 1.0.2)', async () => {
  const tour = await lang2OneLanguageEverywhere.run(release('ja_tour', 'ja-tour-t4-font-settings'))
  assert.doesNotMatch(tour.message, /fonts:/, tour.message)
  assert.ok(
    tour.details.some((d) => /'Frank Ruhl Libre' .*replaced on vi pages by 'Source Serif 4'/.test(d)),
    tour.details.join(' | ')
  )
  // Nothing covers the headings for Vietnamese: Frank Ruhl Libre still fails, named with a selector of theme.tpl.css.
  const bare = await lang2OneLanguageEverywhere.run(release('ja_tour', 'ja-tour-t4-font-settings', {}, ''))
  assert.equal(bare.status, 'fail')
  assert.match(bare.message, /fonts: 'Frank Ruhl Libre' cannot draw .*heading_font_family/)
})

test('LANG-2 pairs a T4 setting theme.tpl.css writes into its own property with that property under :lang(vi) (JA Trip 1.0.5)', async () => {
  // css/template.css 19535 of JA Trip 1.0.5 sets the script titles in the property T4 writes special_font_family into.
  const titles = {
    'css/template.css': '.font-special-family {\n  font-family: var(--font-special-family); }\n'
  }
  const trip = await lang2OneLanguageEverywhere.run(release('ja_trip', 'ja-trip-t4-font-settings', titles))
  assert.doesNotMatch(trip.message, /fonts:/, trip.message)
  assert.ok(
    trip.details.some((d) => /'Cookie' .*replaced on vi pages by 'Dancing Script'/.test(d)),
    trip.details.join(' | ')
  )
  // Without its --font-special-family line, language-fonts.css leaves the script titles in Cookie.
  const sheet = readFileSync(path.join(C, 'ja-trip-t4-font-settings', 'css/language-fonts.css'), 'utf8')
  const without = sheet.replace(/^\s*--font-special-family:.*$/m, '')
  assert.notEqual(without, sheet)
  const bare = await lang2OneLanguageEverywhere.run(
    release('ja_trip', 'ja-trip-t4-font-settings', titles, without)
  )
  assert.equal(bare.status, 'fail')
  assert.match(bare.message, /fonts: 'Cookie' cannot draw .*special_font_family/)
})

// 🔒 A role-variable build wraps the setting in the design system's variable (17/10/2026, feat/ds-role-vars-batch2):
// JA Spa 1.0.7 writes `.special_font_family { font-family: var(--ds-font-display, __special_font_family) }`, and T4
// still substitutes the placeholder inside the fallback. Read only as a whole stack item, the placeholder was left
// unsubstituted, no rule reached Sacramento, and LANG-2 failed it as a lone Google family although language-fonts.css
// replaces it with Allura on vi pages, as 1.0.6 (which passes) does. Fixture `c/ja-spa-t4-font-settings-role-variables/`:
// theme.tpl.css and language-fonts.css byte for byte, the profiles reformatted by biome, of the local 1.0.7 pack.
test('LANG-2 follows a T4 setting written inside the fallback of var() (JA Spa 1.0.7, role variables)', async () => {
  const spa = await lang2OneLanguageEverywhere.run(
    release('ja_spa', 'ja-spa-t4-font-settings-role-variables')
  )
  assert.doesNotMatch(spa.message, /fonts:/, spa.message)
  assert.ok(
    spa.details.some((d) => /'Sacramento' .*replaced on vi pages by 'Allura'/.test(d)),
    spa.details.join(' | ')
  )
  assert.ok(
    spa.details.some((d) => /'Marcellus' .*replaced on vi pages by 'Gideon Roman'/.test(d)),
    spa.details.join(' | ')
  )
})

test('a font without Vietnamese letters written inside var() still fails when nothing replaces it', async () => {
  // Without language-fonts.css the section signatures stay in Sacramento and the headings in Marcellus.
  const bare = await lang2OneLanguageEverywhere.run(
    release('ja_spa', 'ja-spa-t4-font-settings-role-variables', {}, '')
  )
  assert.equal(bare.status, 'fail')
  assert.match(bare.message, /'Sacramento' cannot draw [^)]*special_font_family/)
  assert.match(bare.message, /'Marcellus' cannot draw [^)]*heading_font_family/)
  // A replacement that covers the headings only leaves Sacramento failing, named with its theme.tpl.css rule.
  const headingsOnly = await lang2OneLanguageEverywhere.run(
    release(
      'ja_spa',
      'ja-spa-t4-font-settings-role-variables',
      {},
      readFileSync(
        path.join(C, 'ja-spa-t4-font-settings-role-variables', 'css/language-fonts.css'),
        'utf8'
      ).replace(/:root:lang\(vi\) \.special_font_family \{[^}]*\}/, '')
    )
  )
  assert.equal(headingsOnly.status, 'fail')
  assert.match(headingsOnly.message, /'Sacramento' cannot draw [^)]*special_font_family/)
  assert.doesNotMatch(headingsOnly.message, /'Marcellus' cannot draw/)
})
