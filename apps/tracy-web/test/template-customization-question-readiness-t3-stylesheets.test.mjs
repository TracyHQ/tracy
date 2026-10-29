/**
 * LANG-2 fonts read only the stylesheets a page loads (follow-up of #1231). A JA T3 template ships
 * `css/rtl/<name>.css`, loaded only on a right-to-left page, and `css/themes/<colour>/<name>.css`,
 * loaded only for the theme its template style sets. JA Mood 1.0.1's default style sets no theme.
 *
 * Fixtures (`c/ja-mood-1.0.1-stylesheets/`): the three `off-canvas.css` of the JA Mood 1.0.1
 * installer, byte for byte, and its `ja_mood` rows of `#__template_styles` (12/10/2026).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

import { fontDeclarations } from '../src/lib/template-customization-question-readiness/readers/font-declarations.js'
import { templateFonts } from '../src/lib/template-customization-question-readiness/readers/template-fonts.js'
import { contextOf, dumpOf, zipOf } from './template-customization-question-readiness-fixtures.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MOOD = path.join(
  HERE,
  'fixtures',
  'template-customization-question-readiness',
  'c',
  'ja-mood-1.0.1-stylesheets'
)
const SHEETS = ['css/off-canvas.css', 'css/rtl/off-canvas.css', 'css/themes/green/off-canvas.css']
const STYLES = JSON.parse(readFileSync(path.join(MOOD, 'template-styles.json'), 'utf8'))

/** JA Mood 1.0.1 with its three off-canvas stylesheets, its styles, and `menu` rows. */
function mood(/** @type {Record<string, unknown>[]} */ menu = []) {
  const files = Object.fromEntries(
    SHEETS.map((f) => [`templates/ja_mood/${f}`, readFileSync(path.join(MOOD, f))])
  )
  const sql = dumpOf({ jos_template_styles: STYLES, ...(menu.length ? { jos_menu: menu } : {}) })
  // dumpOf gzips; an installer carries plain SQL.
  files['installation/sql/mysql/custom.sql'] = gunzipSync(sql)
  const setting = {
    platform: 'joomla',
    label: 'JA Mood',
    version: '1.0.1',
    template: 'ja_mood',
    install: { installer: { file: 'installer.zip' } }
  }
  return contextOf(setting, { 'installer.zip': zipOf(files) }, 'quickstart/ja-mood/j6')
}

const readFiles = async (/** @type {any} */ context) =>
  new Set((await templateFonts(context)).declarations.map((d) => d.file))

test('LANG-2 fonts: JA Mood 1.0.1 reads css/off-canvas.css, not its rtl copy nor the green theme no style uses', async () => {
  const files = await readFiles(mood())
  assert.ok(files.has('css/off-canvas.css'), [...files].join(', '))
  assert.ok(!files.has('css/rtl/off-canvas.css'))
  assert.ok(!files.has('css/themes/green/off-canvas.css'))
})

test('LANG-2 fonts: the green theme counts once a published menu item opens the JA Mood green style', async () => {
  const green = STYLES.find((/** @type {any} */ s) => JSON.parse(s.params).theme === 'green')
  assert.ok(green)
  const files = await readFiles(
    mood([{ id: '101', client_id: '0', published: '1', template_style_id: green.id, title: 'Green page' }])
  )
  assert.ok(files.has('css/themes/green/off-canvas.css'))
  assert.ok(!files.has('css/rtl/off-canvas.css'))
})

// JA Sensei 2.2.2 (joomlart-products fix/published-joomla-templates-green, 423f86c18): css/language-fonts.css
// re-sets `body` as `html:lang(vi) body`, which the browser applies over `body` of css/offline.css.
const SENSEI = path.join(
  HERE,
  'fixtures',
  'template-customization-question-readiness',
  'c',
  'ja-sensei-language-fonts'
)

test('LANG-2 fonts: html:lang(vi) body of JA Sensei language-fonts.css replaces the body of offline.css', () => {
  const sheet = (/** @type {string} */ f) =>
    fontDeclarations(`css/${f}`, readFileSync(path.join(SENSEI, f), 'utf8'))
  const plain = sheet('offline.css').find((d) => d.prop === 'font-family' && d.stack[0] === '"HKGrotesk"')
  assert.ok(plain)
  const vi = sheet('language-fonts.css').filter((d) => d.prop === 'font-family' && d.lang === 'vi')
  assert.ok(
    vi.some((d) => d.selector === plain.selector),
    `${JSON.stringify(plain.selector)} not among ${JSON.stringify(vi.map((d) => d.selector))}`
  )
  // `html:lang(vi) body h1` is `h1`, a scope inside the selector stays.
  assert.ok(vi.some((d) => d.selector === 'h1'))
  assert.equal(
    fontDeclarations('x.css', 'html:lang(vi) .page body p { font-family: A }')[0].selector,
    '.page body p'
  )
})
