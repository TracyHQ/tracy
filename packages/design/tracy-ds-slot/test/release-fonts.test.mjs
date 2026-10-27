/**
 * The font check of `release-batch.mjs verify` (#1310): a rebuilt Joomla quickstart may not lose the
 * body font variable the released version had, and every font file it serves must answer.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareFonts, fontReport, fontUrlsOf, stylesheetsOf } from '../src/release-fonts.mjs'

const SITE = 'http://127.0.0.1:51801'
const HTML = `<html><head>
<link href="/media/t4/optimize/css/a1b2c3.css?v=1" rel="stylesheet">
<link rel="stylesheet" href='/media/system/css/joomla-fontawesome.min.css'>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&amp;display=swap">
<link rel="icon" href="/favicon.ico">
<style>.x{font-family:var(--body-font-family)}</style>
</head><body></body></html>`
const T4 = `:root{--body-font-family:"Poppins",sans-serif}@font-face{font-family:Poppins;src:url(../../../../templates/ja_conf/fonts/poppins.woff2) format("woff2"),url("../../../../templates/ja_conf/fonts/poppins.woff")}`
const FA = `@font-face{font-family:"Font Awesome";src:url(../fonts/fa-solid-900.woff2)}.i{background:url(data:image/png;base64,AAA)}`

test('the stylesheets a page links, absolute and in order, icons and other links left out', () => {
  assert.deepEqual(stylesheetsOf(HTML, `${SITE}/`), [
    `${SITE}/media/t4/optimize/css/a1b2c3.css?v=1`,
    `${SITE}/media/system/css/joomla-fontawesome.min.css`,
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap'
  ])
})

test('the font files a sheet loads, resolved against the sheet, data urls and pictures left out', () => {
  assert.deepEqual(fontUrlsOf(T4, `${SITE}/media/t4/optimize/css/a1b2c3.css?v=1`), [
    `${SITE}/templates/ja_conf/fonts/poppins.woff2`,
    `${SITE}/templates/ja_conf/fonts/poppins.woff`
  ])
  assert.deepEqual(fontUrlsOf(FA, `${SITE}/media/system/css/joomla-fontawesome.min.css`), [
    `${SITE}/media/system/fonts/fa-solid-900.woff2`
  ])
})

test('a page report: body font variable found, every font with its status and host', () => {
  const sheets = {
    [`${SITE}/media/t4/optimize/css/a1b2c3.css?v=1`]: T4,
    [`${SITE}/media/system/css/joomla-fontawesome.min.css`]: FA
  }
  const r = fontReport({
    html: HTML,
    pageUrl: `${SITE}/`,
    sheets,
    fontStatus: {
      [`${SITE}/templates/ja_conf/fonts/poppins.woff2`]: '200',
      [`${SITE}/templates/ja_conf/fonts/poppins.woff`]: '404',
      [`${SITE}/media/system/fonts/fa-solid-900.woff2`]: '200'
    }
  })
  assert.equal(r.bodyFontVar, true)
  assert.equal(r.fonts.length, 3)
  assert.deepEqual(
    r.fonts.map((f) => f.status),
    ['200', '404', '200']
  )
  assert.ok(r.fonts.every((f) => f.sameHost))
})

test('a rebuild that lost the body font variable or a font file fails; what the release itself broke does not count', () => {
  const was = {
    sheets: [],
    bodyFontVar: true,
    fonts: [
      { url: `${SITE}/templates/ja_conf/fonts/poppins.woff2`, status: '200', sameHost: true },
      { url: `${SITE}/templates/ja_conf/fonts/old.woff`, status: '404', sameHost: true }
    ]
  }
  const same = compareFonts(was, {
    ...was,
    fonts: was.fonts.map((f) => ({ ...f, url: f.url.replace(':51801', ':51802') }))
  })
  assert.equal(same.ok, true, same.problems.join('; '))
  const lost = compareFonts(was, { ...was, bodyFontVar: false })
  assert.equal(lost.ok, false)
  assert.match(lost.problems[0], /--body-font-family/)
  const broken = compareFonts(was, {
    ...was,
    fonts: [{ url: `${SITE}/templates/ja_conf/fonts/poppins.woff2`, status: '404', sameHost: true }]
  })
  assert.equal(broken.ok, false)
  assert.deepEqual(broken.fonts.broken, [`${SITE}/templates/ja_conf/fonts/poppins.woff2 404`])
  // JA Vital writes its face as a literal: no variable before, none after, nothing to lose
  const literal = compareFonts({ ...was, bodyFontVar: false }, { ...was, bodyFontVar: false })
  assert.equal(literal.ok, true)
  // a Google font is not this host's to serve
  const google = compareFonts(was, {
    ...was,
    fonts: [...was.fonts, { url: 'https://fonts.gstatic.com/s/inter.woff2', status: '000', sameHost: false }]
  })
  assert.equal(google.ok, true)
})
