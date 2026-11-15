// The marker test's reading of rendered pages (ticket #585), on invented renders of an invented florist site: a marker
// is the build's own, any other word, picture or link is a leak named by its page, place and source, a kept interface
// string and a date the build set are exempt, hidden words still leak, and a written value no page shows is reported
// with the reason the page gives.
import assert from 'node:assert/strict'
import test from 'node:test'
import { classify } from '../ai-quickstart/gate/classify.mjs'
import { exemptionOf, keptKeysOf } from '../ai-quickstart/gate/exemptions.mjs'
import { codeOf, linkMarker, textMarker } from '../ai-quickstart/gate/marker-codec.mjs'
import { checkRecord } from '../ai-quickstart/gate/record.mjs'
import { recordHtml } from '../ai-quickstart/gate/record-html.mjs'
import { sourceResolver } from '../ai-quickstart/gate/sources.mjs'

const ORIGIN = 'http://florist.example'
const [A, B, C] = [1, 2, 3].map(codeOf)
const ARCHIVE = {
  names: ['templates/petal/favicon.ico', 'templates/petal/css/theme.css'],
  files: new Map([
    [
      'language/en-GB/mod_footer.ini',
      'FOOTER_LINE="Copyright &#169; %date% %sitename%. All Rights Reserved." ; note\r\n'
    ],
    ['language/en-GB/tpl_petal.ini', 'TPL_FOLLOW="Follow us"\nTPL_MORE="Read more"\n'],
    ['templates/petal/html/layouts/card.php', '<span class="tag">Fresh today</span>'],
    [
      'templates/petal/css/theme.css',
      '.hero::after{content:"Since forever"} .x{background:url(../images/leaf.png)}'
    ],
    ['installation/sql/mysql/custom.sql', "INSERT INTO `#__modules` VALUES (1,'Bouquet of the week');\n"]
  ])
}
const resolve = sourceResolver(ARCHIVE, { site: ORIGIN })
const obs = (kind, value, element, visible = true) => ({ kind, value, place: { element }, visible })

test('the source of a word or a picture is read from the archive the site was built from', () => {
  assert.deepEqual(resolve.text('Read more'), {
    kind: 'language',
    file: 'language/en-GB/tpl_petal.ini',
    key: 'TPL_MORE'
  })
  assert.equal(resolve.text(`Copyright © 2026 ${textMarker(A)}. All Rights Reserved.`).key, 'FOOTER_LINE')
  assert.equal(resolve.text('Fresh today').kind, 'template')
  assert.equal(resolve.text('Since forever').kind, 'stylesheet')
  assert.equal(resolve.text('Bouquet of the week').table, '#__modules')
  assert.equal(resolve.text('Nowhere at all'), null)
  assert.deepEqual(resolve.picture(`${ORIGIN}/templates/petal/favicon.ico`), {
    kind: 'file',
    file: 'templates/petal/favicon.ico'
  })
  assert.equal(resolve.picture(`${ORIGIN}/images/leaf.png`).kind, 'stylesheet')
  assert.deepEqual(resolve.picture('https://avatars.example/a.png'), {
    kind: 'outside',
    host: 'avatars.example'
  })
})

test('only a kept interface string, a date the build set and the site frame are exempt', () => {
  const kept = keptKeysOf({
    overrides: { language: [{ key: 'TPL_FOLLOW', keep: 'kept: a label of the social row' }] }
  })
  const ctx = { origin: ORIGIN, kept, builtYear: 2026 }
  const follow = { ...ctx, source: resolve.text('Follow us') }
  assert.match(exemptionOf(obs('text', 'Follow us', 'span'), follow), /^kept_by_kit/)
  assert.equal(
    exemptionOf(obs('text', 'Read more', 'a'), { ...ctx, source: resolve.text('Read more') }),
    null
  )
  assert.equal(exemptionOf(obs('text', '14 March 2026', 'time'), ctx), 'date_set_by_build')
  assert.equal(exemptionOf(obs('text', '1999', 'span'), ctx), null)
  assert.equal(exemptionOf(obs('jsonld', `${ORIGIN}/#site`, 'script'), ctx), 'site_address')
  assert.equal(exemptionOf(obs('meta', 'website', 'meta[og:type]'), ctx), 'share_type')
  assert.equal(exemptionOf(obs('text', 'https://other.example/', 'a'), ctx), null)
})

test('every render is read: markers pass, leaks are named once with where they were seen', () => {
  const page = (theme, width, extra = []) => ({
    pageType: 'home',
    path: 'index.php',
    theme,
    width,
    status: 200,
    html: '<div id="Mod7"></div>',
    observations: [
      obs('text', textMarker(A, { length: 17 }), 'h1'),
      obs('text', 'Read more', 'a'),
      obs('text', 'Bouquet of the week', 'h3', false),
      obs('text', '&lt;b&gt;bold&lt;/b&gt;', 'p'),
      obs('href', linkMarker(B), 'a[href]'),
      obs('href', 'https://demo-shop.example/cart', 'a[href]'),
      obs('image', `${ORIGIN}/images/tracy/aa.png`, 'img[src]'),
      obs('image', `${ORIGIN}/templates/petal/favicon.ico`, 'link[icon]'),
      obs('request', 'https://fonts.example/css', 'request[stylesheet]'),
      ...extra
    ]
  })
  const writePlan = {
    ops: [
      {
        key: 'copy:home.home-b1',
        kind: 'module.copy',
        values: [{ value: textMarker(A), entry: 'home.home-b1.heading' }]
      },
      {
        key: 'copy:home.home-b2',
        kind: 'module.copy',
        values: [{ value: textMarker(C), entry: 'home.home-b2.heading' }]
      }
    ]
  }
  const out = classify({
    renders: [page('light', 390), page('dark', 1440)],
    origin: ORIGIN,
    registry: [
      { code: A, what: 'writer' },
      { code: C, what: 'writer' }
    ],
    writePlan,
    uploaded: { 'picture:home.home-b1.image': 'images/tracy/aa.png' },
    ids: { 'copy:home.home-b2': 7 },
    resolve,
    kept: new Map()
  })
  const by = (value) => out.findings.find((f) => f.value === value)
  assert.equal(by('Read more').group, 'unmarked_text')
  assert.deepEqual(by('Read more').where, ['dark 1440', 'light 390'])
  assert.equal(by('Read more').source.key, 'TPL_MORE')
  assert.equal(by('Bouquet of the week').visible, false)
  assert.equal(by('&lt;b&gt;bold&lt;/b&gt;').group, 'raw_markup')
  assert.equal(by('https://demo-shop.example/cart').group, 'unmarked_link')
  assert.equal(by(`${ORIGIN}/templates/petal/favicon.ico`).group, 'unmarked_picture')
  assert.equal(by('https://fonts.example/css').group, 'outside_request')
  assert.equal(
    out.findings.some((f) => f.value.includes(A) || f.value.includes('images/tracy/aa.png')),
    false
  )
  assert.equal(out.findings.length, 6)
  // C was written into a copy the page prints (module 7) but no page shows it.
  assert.deepEqual(
    out.notSeen.map((n) => [n.code, n.reason, n.module]),
    [[C, 'block_printed_without_value', 7]]
  )

  const record = checkRecord({
    kit: { ref: 'petal/j6@1.0.0', mapping: { template: { slug: 'petal', version: '1.0.0' } } },
    origin: ORIGIN,
    built: { gaps: [], written: { report: { status: 'done' } }, writePlan },
    accounting: {
      counts: { universe: 2, written: 2, declared_not_written: 0, skipped_by_writer: 0, unexplained: 0 },
      places: []
    },
    real: { status: 'done' },
    renders: [],
    pages: [{ pageType: 'home', path: 'index.php' }],
    classified: out,
    demo: {
      browser: [],
      html: [],
      checks: {
        interfaceLetThrough: [],
        htmlVersusBrowser: { blocks: 0, blockDiffers: [] },
        pictureAddresses: []
      }
    },
    widths: [390, 768, 1440],
    themes: ['light', 'dark'],
    plugin: { start: '1.0.0', end: '1.0.0' },
    refusals: [],
    startedAt: '2026-01-01T00:00:00.000Z'
  })
  assert.equal(record.verdict.pass, false)
  assert.equal(record.verdict.leaks, 5)
  assert.equal(JSON.stringify(record).includes(ORIGIN), false)
  assert.equal(record.pending.minItems.status, 'not_run')
  const html = recordHtml(record)
  assert.match(html, /Not passed/)
  assert.doesNotMatch(html, /<b>bold<\/b>/)
})
