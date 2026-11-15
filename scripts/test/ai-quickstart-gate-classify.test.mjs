// The marker test's reading of rendered pages (ticket #585), on invented renders of an invented florist site: every
// leak is named by its true source (each source class has a case), a kept interface string and the adapter's frame
// are the only exemptions, the marker filler alone is the gate's own, hidden words still leak, findings group once per
// source and text with the fix they most likely need, and the raw HTML and the browser's read of a block compare in
// the scan's own spelling.
import assert from 'node:assert/strict'
import test from 'node:test'
import { EXEMPTIONS } from '../ai-quickstart/gate/adapters/joomla-t4.mjs'
import { classify } from '../ai-quickstart/gate/classify.mjs'
import { compareBlocks } from '../ai-quickstart/gate/demo-checks.mjs'
import { exemptionOf, keptKeysOf } from '../ai-quickstart/gate/exemptions.mjs'
import { fixClassOf, groupCounts, groupsOf } from '../ai-quickstart/gate/groups.mjs'
import {
  codeOf,
  codesIn,
  linkMarker,
  markerShare,
  phoneMarker,
  textMarker
} from '../ai-quickstart/gate/marker-codec.mjs'
import { checkRecord } from '../ai-quickstart/gate/record.mjs'
import { blankControlOf } from '../ai-quickstart/gate/verdict.mjs'
import { recordHtml } from '../ai-quickstart/gate/record-html.mjs'
import { ownerOf, sourceResolver } from '../ai-quickstart/gate/sources.mjs'
import { demoCorpus, demoScan } from '../ai-quickstart/rendered-scan.mjs'

const ORIGIN = 'http://florist.example'
const [A, B, C] = [1, 2, 3].map(codeOf)
const DUMP = [
  "INSERT INTO `#__content` VALUES (1,'Spring tulips are here');",
  'INSERT INTO `#__template_styles` VALUES (9,\'{"copyright":"Made with petals"}\');',
  'INSERT INTO `#__modules` VALUES (4,\'{\\"pic\\":\\"images/demo/bouquet.jpg\\"}\');'
].join('\n')
const ARCHIVE = {
  names: ['templates/petal/favicon.ico', 'templates/petal/css/theme.css', 'images/petal/hero.jpg'],
  files: new Map([
    ['language/en-GB/joomla.ini', 'JNEXT="Next"\nJPREV="Prev"\n'],
    ['language/en-GB/tpl_petal.ini', 'TPL_FOLLOW="Follow us"\nTPL_MORE="Read more"\n'],
    ['language/en-GB/com_content.ini', 'COM_CONTENT_HITS="Hits: %s"\n'],
    ['language/overrides/en-GB.override.ini', 'TPL_MORE="Read the story"\n'],
    [
      'language/en-GB/mod_footer.ini',
      'FOOTER_LINE="Copyright &#169; %date% %sitename%. All Rights Reserved." ; note\r\n'
    ],
    ['templates/petal/html/layouts/card.php', '<span class="tag">Fresh today</span>'],
    ['modules/mod_petal_news/tmpl/default.php', '<button>Subscribe</button>'],
    ['plugins/system/petal/petal.php', "echo '<em>Powered by petals</em>';"],
    ['templates/petal/local/etc/site/default.json', '{"footer_text":"Open every day"}'],
    [
      'templates/petal/css/theme.css',
      '.hero::after{content:"Since forever"} .x{background:url(../images/leaf.png)} .y{background:url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=)}'
    ],
    ['installation/sql/mysql/custom.sql', DUMP]
  ])
}
const CONTENT_MAP = {
  entities: [
    {
      key: 'languageString-5',
      kind: 'languageString',
      identity: { extension: 'tpl_petal', key: 'TPL_PETAL_DETAILS', language: 'en-GB' }
    }
  ],
  slots: [
    { key: 'module-7.2', entity: 'module-7', sample: 'Bouquet of the week' },
    { key: 'languageString-5.0', entity: 'languageString-5', sample: 'Details' }
  ]
}
const MAPPING = {
  blocks: { 'petal-hero': { fields: { heading: { slot: 'module-7.2', entity: 'module-7' } } } }
}
const WRITES = new Map([
  ['Store Owner', { table: 'users', column: 'name', why: 'the account the build writes as' }]
])
const resolve = sourceResolver(ARCHIVE, {
  site: ORIGIN,
  contentMap: CONTENT_MAP,
  mapping: MAPPING,
  writes: WRITES
})
const obs = (kind, value, element, visible = true, extra = {}) => ({
  kind,
  value,
  place: { element },
  visible,
  ...extra
})

test('every source class: the true source of a word or a picture, or unknown with what was searched', () => {
  const t = (v) => resolve.text(v)
  assert.deepEqual(t('Bouquet of the week'), {
    class: 'block_field',
    slot: 'module-7.2',
    entity: 'module-7',
    block: 'petal-hero',
    field: 'heading'
  })
  assert.equal(t('Store Owner').class, 'write')
  // A slot of a language string entity is that language string, not demo content of a block.
  assert.deepEqual(
    [t('Details').class, t('Details').key, t('Details').owner, t('Details').slot],
    ['language', 'TPL_PETAL_DETAILS', 'template', 'languageString-5.0']
  )
  assert.deepEqual(t('Spring tulips are here'), {
    class: 'data',
    file: 'installation/sql/mysql/custom.sql',
    table: '#__content'
  })
  assert.equal(t('Made with petals').class, 'setting')
  assert.equal(t('Made with petals').table, '#__template_styles')
  assert.equal(t('Open every day').class, 'setting')
  assert.deepEqual([t('Next').class, t('Next').key, t('Next').owner], ['language', 'JNEXT', 'core'])
  assert.equal(t('Follow us').owner, 'template')
  assert.deepEqual([t('Hits: 3').key, t('Hits: 3').owner], ['COM_CONTENT_HITS', 'extension'])
  assert.equal(t('Read the story').owner, 'site_override')
  assert.equal(t(`Copyright © 2026 ${textMarker(A)}. All Rights Reserved.`).key, 'FOOTER_LINE')
  assert.deepEqual([t('Fresh today').class, t('Fresh today').owner], ['literal', 'template'])
  assert.deepEqual([t('Subscribe').class, t('Subscribe').owner], ['literal', 'module'])
  assert.deepEqual(
    [t('Powered by petals').owner, t('Powered by petals').extension],
    ['plugin', 'system/petal']
  )
  assert.equal(t('Since forever').class, 'stylesheet')
  assert.deepEqual(t('Nowhere at all'), {
    class: 'unknown',
    searched: ['block_field', 'write', 'data', 'language', 'setting', 'literal', 'stylesheet', 'picture_file']
  })
  const p = (u) => resolve.picture(u)
  assert.deepEqual(p(`${ORIGIN}/templates/petal/favicon.ico`), {
    class: 'picture_file',
    file: 'templates/petal/favicon.ico',
    owner: 'template',
    extension: 'petal'
  })
  assert.equal(p(`${ORIGIN}/images/leaf.png`).class, 'stylesheet')
  assert.equal(p(`${ORIGIN}/images/demo/bouquet.jpg`).class, 'data')
  assert.equal(
    p('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=').class,
    'stylesheet'
  )
  assert.deepEqual(p('https://avatars.example/a.png'), { class: 'outside', host: 'avatars.example' })
  assert.equal(p(`${ORIGIN}/images/none/x.png`).class, 'unknown')
  assert.equal(ownerOf('media/templates/site/petal/js/menu.js').owner, 'template')
  assert.equal(ownerOf('components/com_petal/tmpl/x.php').owner, 'component')
})

test('a value more than one source holds is ambiguous, with every candidate, and a kit keep of any of them exempts it', () => {
  const r = sourceResolver(
    {
      names: [],
      files: new Map([
        ['language/en-GB/joomla.ini', 'JCLOSE="Close"\n'],
        ['language/en-GB/tpl_petal.ini', 'TPL_CLOSE="Close"\n'],
        ['templates/petal/html/modal.php', '<button>Close</button>'],
        ['language/en-GB/com_petal.ini', 'PETAL_ONLY="Only here"\n']
      ])
    },
    {
      site: ORIGIN,
      contentMap: {
        entities: [
          {
            key: 'languageString-9',
            kind: 'languageString',
            identity: { extension: 'tpl_petal', key: 'TPL_CLOSE' }
          }
        ],
        slots: [{ key: 'languageString-9.0', entity: 'languageString-9', sample: 'Close' }]
      }
    }
  )
  const close = r.text('Close')
  assert.equal(close.class, 'ambiguous')
  assert.deepEqual(
    close.candidates.map((c) => [c.class, c.key ?? c.file]),
    [
      ['language', 'TPL_CLOSE'],
      ['language', 'JCLOSE'],
      ['literal', 'templates/petal/html/modal.php']
    ]
  )
  assert.equal(close.likely.key, 'TPL_CLOSE')
  assert.equal(r.text('Only here').class, 'language')
  // The kit keeps JCLOSE: one of the candidates, so the words are exempt.
  const kept = keptKeysOf({
    overrides: { language: [{ key: 'JCLOSE', keep: 'kept: the close button of a dialog' }] }
  })
  assert.match(
    exemptionOf(obs('text', 'Close', 'button'), { origin: ORIGIN, kept, source: close, rules: EXEMPTIONS }),
    /^kept_by_kit/
  )
  assert.equal(fixClassOf({ group: 'unmarked_text', source: close }), 'kit_declare_keep')
  const [g] = groupsOf([
    { group: 'unmarked_text', page: 'a', value: 'Close', where: ['dark 390'], source: close }
  ])
  assert.match(g.label, /one of 3 sources/)
})

test('exemptions come from the kit (a kept key) and the adapter (the page frame) only', () => {
  const kept = keptKeysOf({
    overrides: { language: [{ key: 'TPL_FOLLOW', keep: 'kept: a label of the social row' }] }
  })
  const ctx = { origin: ORIGIN, kept, builtYear: 2026, rules: EXEMPTIONS }
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
  // With no adapter rules, nothing of the frame is exempt: no rule lives in the classifier.
  assert.equal(exemptionOf(obs('text', '14 March 2026', 'time'), { ...ctx, rules: [] }), null)
  assert.equal(exemptionOf(obs('jsonld', `${ORIGIN}/#site`, 'script'), { ...ctx, rules: [] }), null)
})

test('a kept string with a placeholder is exempt only when the placeholder holds nothing, a marker or the build date', () => {
  const kept = keptKeysOf({
    overrides: { language: [{ key: 'FOOTER_LINE', keep: 'kept: the copyright line' }] }
  })
  const ctx = { origin: ORIGIN, kept, builtYear: 2026, rules: EXEMPTIONS }
  const line = (name) => `Copyright \u00a9 2026 ${name}. All Rights Reserved.`
  const ask = (v) => exemptionOf(obs('text', v, 'p'), { ...ctx, source: resolve.text(v) })
  assert.equal(resolve.text(line('Petal Demo Shop')).fills.join(' ').trim(), '2026 Petal Demo Shop')
  // A demo site name in the placeholder is a leak, though the string around it is kept.
  assert.equal(ask(line('Petal Demo Shop')), null)
  assert.match(ask(line(textMarker(A))), /^kept_by_kit/)
  assert.match(ask('Copyright \u00a9 2026 . All Rights Reserved.'), /^kept_by_kit/)
  // A year the build did not set is no date of the build.
  assert.equal(ask(`Copyright \u00a9 1999 ${textMarker(A)}. All Rights Reserved.`), null)
})

test('a value with no letter is exempt only as punctuation, the not found status on its page, or the build year', () => {
  const ctx = { origin: ORIGIN, kept: new Map(), builtYear: 2026, rules: EXEMPTIONS }
  const ask = (v, extra = {}) => exemptionOf(obs('text', v, 'span'), { ...ctx, ...extra })
  for (const v of ['|', '\u00b7', '/', '\u2192', '...']) assert.equal(ask(v), 'no_words', v)
  // Counters, prices, hours and numbers are content: a demo value of them leaks.
  for (const v of ['4', '32', '$45', '10:00', '+1 555 0100 001', '1999']) assert.equal(ask(v), null, v)
  assert.equal(ask('404', { pageStatus: 404 }), 'not_found_status')
  assert.equal(ask('404', { pageStatus: 200 }), null)
  assert.equal(ask('2026'), 'date_set_by_build')
})

test('a marker counts only when its code is one the build registered: a look-alike phone number is a leak', () => {
  const known = new Set([A])
  assert.deepEqual(codesIn('+1 555 0100 999', known), [])
  assert.deepEqual(codesIn(phoneMarker(A), known), [A])
  assert.equal(markerShare('+1 555 0100 999', { known }).kind, 'none')
  assert.equal(markerShare(`${textMarker(A)} +1 555 0100 999`, { known }).kind, 'mixed')
  const out = classify({
    renders: [
      {
        pageType: 'home',
        path: 'index.php',
        theme: 'light',
        width: 1440,
        status: 200,
        observations: [
          obs('text', '+1 555 0100 999', 'span'),
          obs('href', 'tel:+15550100999', 'a[href]'),
          obs('href', `tel:${phoneMarker(A).replace(/\s/g, '')}`, 'a[href]')
        ]
      }
    ],
    origin: ORIGIN,
    registry: [{ code: A, what: 'writer' }],
    writePlan: { ops: [] },
    uploaded: {},
    resolve,
    kept: new Map(),
    rules: EXEMPTIONS
  })
  assert.deepEqual(
    out.findings.map((f) => [f.group, f.value]),
    [
      ['unmarked_text', '+1 555 0100 999'],
      ['unmarked_link', 'tel:+15550100999']
    ]
  )
})

test('an embed whose address is no marker is a leak; fonts and declared hosts stay notes; a reader problem is kept', () => {
  const out = classify({
    renders: [
      {
        pageType: 'contact',
        path: 'index.php/contact',
        theme: 'light',
        width: 1440,
        status: 200,
        observations: [
          obs('embed', 'https://maps.example/embed?q=demo+shop', 'iframe[src]'),
          obs('embed', linkMarker(A), 'iframe[src]'),
          obs('media', `${ORIGIN}/media/demo.mp4`, 'video[src]'),
          obs('request', 'https://maps.example/embed?q=demo+shop', 'request[document]'),
          obs('request', 'https://video.example/clip.mp4', 'request[media]'),
          obs('request', 'https://fonts.example/font.woff2', 'request[font]'),
          obs('request', 'https://widgets.example/frame', 'request[document]'),
          obs('problem', 'structured data that does not parse: Unexpected end', 'script[ld+json]')
        ]
      }
    ],
    origin: ORIGIN,
    registry: [{ code: A, what: 'writer' }],
    writePlan: { ops: [] },
    uploaded: {},
    resolve,
    kept: new Map(),
    rules: EXEMPTIONS,
    declaredHosts: new Set(['widgets.example'])
  })
  assert.deepEqual(
    out.findings.map((f) => [f.group, f.value]).sort(),
    [
      ['outside_request', 'https://fonts.example/font.woff2'],
      ['outside_request', 'https://widgets.example/frame'],
      ['unmarked_embed', `${ORIGIN}/media/demo.mp4`],
      ['unmarked_embed', 'https://maps.example/embed?q=demo+shop'],
      ['unmarked_embed', 'https://maps.example/embed?q=demo+shop'],
      ['unmarked_embed', 'https://video.example/clip.mp4']
    ].sort()
  )
  assert.deepEqual(out.problems, [
    {
      page: 'contact',
      element: 'script[ld+json]',
      value: 'structured data that does not parse: Unexpected end'
    }
  ])
  assert.equal(
    fixClassOf({ group: 'unmarked_embed', source: { class: 'outside', host: 'maps.example' } }),
    'template_patch'
  )
})

test('a kept string whose reason says no page draws it, seen on a page, is a finding: the reason is false', () => {
  const kept = keptKeysOf({
    overrides: {
      language: [
        { key: 'TPL_FOLLOW', keep: 'not-drawn: no kit page draws it' },
        { key: 'TPL_MORE', keep: 'kept: interface text, not drawn as visible text on any kit page' }
      ]
    }
  })
  const out = classify({
    renders: [
      {
        pageType: 'home',
        path: 'index.php',
        theme: 'dark',
        width: 390,
        status: 200,
        observations: [
          obs('text', 'Follow us', 'span'),
          obs('text', 'Follow us', 'span', false, { place: { element: 'label' } }),
          obs('text', 'Read the story', 'a', false)
        ]
      }
    ],
    origin: ORIGIN,
    registry: [],
    writePlan: { ops: [] },
    uploaded: {},
    resolve,
    kept,
    rules: EXEMPTIONS
  })
  const groups = groupsOf(out.findings)
  // Hidden words are in the page all the same (product decision 5): shown or hidden, the reason is false.
  assert.deepEqual(
    out.findings.map((f) => [f.group, f.value, f.visible]),
    [
      ['kit_reason_false', 'Follow us', true],
      ['kit_reason_false', 'Follow us', false]
    ]
  )
  assert.equal(groups[0].fixClass, 'kit_declare_keep')
  assert.match(out.findings[0].why, /says no page draws it/)
  // A reason that says only "not drawn as visible text" holds for hidden words: exempt, and recorded as hidden.
  assert.deepEqual(
    out.exempt.map((e) => [e.value, e.visible]),
    [['Read the story', false]]
  )
})

test('the marker filler alone is the gate own words, never a finding; beside other words those words are read', () => {
  assert.equal(markerShare('qqqqq').kind, 'filler')
  assert.equal(markerShare('qqqqq.').kind, 'filler')
  assert.deepEqual(markerShare('Search Terms: qqqqq'), { kind: 'none', rest: 'Search Terms:' })
  assert.equal(markerShare('Read more').kind, 'none')
})

const page = (theme, width, extra = []) => ({
  pageType: 'home',
  path: 'index.php',
  theme,
  width,
  status: 200,
  shot: theme === 'dark' && width === 1440 ? 'shots/home-dark-1440.png' : undefined,
  html: '<div id="Mod7"></div>',
  observations: [
    obs('text', textMarker(A, { length: 17 }), 'h1'),
    obs('text', 'Read more', 'a', true, { box: { x: 10, y: 20, w: 80, h: 18 } }),
    obs('text', 'Bouquet of the week', 'h3', false),
    obs('text', 'qqqqq', 'mark'),
    obs('text', 'Fresh today', 'span'),
    obs('text', '&lt;b&gt;bold&lt;/b&gt;', 'p'),
    obs('href', linkMarker(B), 'a[href]'),
    obs('href', 'https://demo-shop.example/cart', 'a[href]'),
    obs('image', `${ORIGIN}/images/tracy/aa.png`, 'img[src]'),
    obs('image', `${ORIGIN}/templates/petal/favicon.ico`, 'link[icon]'),
    obs('image', `${ORIGIN}/`, 'img[src]'),
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
const classified = () =>
  classify({
    renders: [page('light', 390), page('dark', 1440)],
    origin: ORIGIN,
    registry: [
      { code: A, what: 'writer' },
      { code: B, what: 'writer' },
      { code: C, what: 'writer' }
    ],
    writePlan,
    uploaded: { 'picture:home.home-b1.image': 'images/tracy/aa.png' },
    ids: { 'copy:home.home-b2': 7 },
    resolve,
    kept: new Map(),
    rules: EXEMPTIONS
  })

test('every render is read: markers pass, leaks are named once with where and a crop, filler is exempt', () => {
  const out = classified()
  const by = (value) => out.findings.find((f) => f.value === value)
  assert.equal(by('Read more').group, 'unmarked_text')
  assert.deepEqual(by('Read more').where, ['dark 1440', 'light 390'])
  assert.equal(by('Read more').source.key, 'TPL_MORE')
  assert.deepEqual(by('Read more').crop, {
    shot: 'shots/home-dark-1440.png',
    box: { x: 10, y: 20, w: 80, h: 18 },
    where: 'dark 1440'
  })
  assert.equal(by('Bouquet of the week').visible, false)
  assert.equal(by('Bouquet of the week').source.class, 'block_field')
  assert.equal(by('&lt;b&gt;bold&lt;/b&gt;').group, 'raw_markup')
  assert.equal(by('https://demo-shop.example/cart').group, 'unmarked_link')
  assert.equal(by(`${ORIGIN}/templates/petal/favicon.ico`).group, 'unmarked_picture')
  assert.equal(by(`${ORIGIN}/`).group, 'empty_picture')
  assert.equal(by('https://fonts.example/css').group, 'outside_request')
  assert.equal(by('qqqqq'), undefined)
  assert.ok(out.exempt.some((e) => e.why === 'marker_filler'))
  assert.equal(
    out.findings.some((f) => f.value.includes(A) || f.value.includes('images/tracy/aa.png')),
    false
  )
  assert.equal(out.findings.length, 8)
  // C was written into a copy the page prints (module 7) but no page shows it.
  assert.deepEqual(
    out.notSeen.map((n) => [n.code, n.reason, n.module]),
    [[C, 'block_printed_without_value', 7]]
  )
})

test('findings group once per source and text with occurrences, each with the fix it most likely needs', () => {
  const groups = groupsOf(classified().findings, { written: new Set([7]) })
  const of = (value) => groups.find((g) => g.value === value)
  assert.equal(of('Read more').fixClass, 'kit_declare_keep')
  assert.equal(of('Read more').count, 2)
  assert.equal(of('Read more').occurrences.length, 1)
  assert.equal(of('Fresh today').fixClass, 'template_patch')
  assert.equal(of('Bouquet of the week').fixClass, 'build_gap')
  assert.equal(of(`${ORIGIN}/templates/petal/favicon.ico`).fixClass, 'kit_write')
  assert.equal(of('fonts.example').fixClass, 'external_request')
  assert.equal(of(`${ORIGIN}/`).fixClass, 'template_patch')
  assert.equal(
    fixClassOf({ group: 'empty_picture', place: { module: 7 } }, { written: new Set([7]) }),
    'build_gap'
  )
  assert.equal(fixClassOf({ group: 'unmarked_text', source: resolve.text('Store Owner') }), 'kit_write')
  assert.equal(fixClassOf({ group: 'unmarked_text', source: resolve.text('Made with petals') }), 'kit_write')
  assert.equal(
    fixClassOf({ group: 'unmarked_text', source: resolve.text('Open every day') }),
    'template_patch'
  )
  assert.equal(fixClassOf({ group: 'unmarked_text', source: resolve.text('Nowhere') }), 'unclassified')
  assert.match(of('Read more').label, /language string of the template \(TPL_MORE\)/)
  const counts = groupCounts(groups)
  assert.equal(counts.byFix.kit_declare_keep, 1)
  // The outside link is in no file of the archive: unknown, with what was searched, and left to the owner; a picture
  // with no address names nothing to search for.
  assert.equal(counts.unknown, 2)
  assert.equal(of(`${ORIGIN}/`).source.class, 'unknown')
  assert.equal(of('https://demo-shop.example/cart').fixClass, 'unclassified')
  assert.ok(of('https://demo-shop.example/cart').source.searched.includes('literal'))
  // The same words from two places on two pages are one group with two occurrences.
  const twice = groupsOf([
    { group: 'unmarked_text', page: 'a', value: 'Next', where: ['dark 1440'], source: resolve.text('Next') },
    { group: 'unmarked_text', page: 'b', value: 'Next', where: ['light 390'], source: resolve.text('Next') }
  ])
  assert.equal(twice.length, 1)
  assert.equal(twice[0].occurrences.length, 2)
  // One language string is one group whatever its placeholder holds.
  const hits = groupsOf(
    ['Hits: 3', 'Hits: 4'].map((value) => ({
      group: 'unmarked_text',
      page: value,
      value,
      where: ['dark 1440'],
      source: resolve.text(value)
    }))
  )
  assert.equal(hits.length, 1)
  assert.deepEqual(hits[0].values, ['Hits: 3', 'Hits: 4'])
})

test('the raw HTML and the browser read a block in the scan spelling: capitals of a stylesheet are no difference', async () => {
  const r = {
    pageType: 'home',
    theme: 'dark',
    width: 390,
    html: '<html><body><p>Fresh  flowers every morning</p><p>Only in html</p></body></html>',
    observations: [
      { kind: 'block', value: 'FRESH FLOWERS EVERY MORNING', visible: true },
      { kind: 'block', value: 'Written by a script', visible: true }
    ]
  }
  const c = compareBlocks([r])
  assert.equal(c.blocks, 2)
  assert.equal(c.rawDiffers, 2)
  assert.deepEqual(
    c.blockDiffers.map((d) => d.value),
    ['Written by a script']
  )
  // The scan's matcher compares in the same spelling: the demo sentence in capitals is still found.
  const corpus = demoCorpus({ fixedTexts: ['Fresh flowers every morning for the whole town'] })
  const lower = await demoScan({
    pages: [
      { path: 'a', observations: [{ kind: 'text', value: 'Fresh flowers every morning for the whole town' }] }
    ],
    corpus
  })
  const upper = await demoScan({
    pages: [
      { path: 'a', observations: [{ kind: 'text', value: 'FRESH FLOWERS EVERY MORNING FOR THE WHOLE TOWN' }] }
    ],
    corpus
  })
  assert.equal(lower.length, 1)
  assert.equal(upper.length, lower.length)
})

test('the record: groups and counts, kit hashes, controls; not passed while anything is failing or not run', () => {
  const out = classified()
  const groups = groupsOf(out.findings)
  const input = {
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
    groups,
    demo: {
      browser: [],
      html: [],
      checks: {
        interfaceLetThrough: [],
        htmlVersusBrowser: { blocks: 0, rawDiffers: 0, blockDiffers: [] },
        pictureAddresses: []
      }
    },
    controls: {
      human: { status: 'run', findings: 40, pages: 3 },
      blank: blankControlOf([])
    },
    widths: [390, 768, 1440],
    themes: ['light', 'dark'],
    plugin: { start: '1.0.0', end: '1.0.0' },
    refusals: [],
    kitHashes: { 'mapping.json': 'a'.repeat(64) },
    startedAt: '2026-01-01T00:00:00.000Z'
  }
  const record = checkRecord(input)
  assert.equal(record.verdict.pass, false)
  assert.equal(record.verdict.leaks, 7)
  assert.equal(record.verdict.controls, 'right')
  assert.deepEqual(record.verdict.notRun, ['writeSafety', 'structure', 'quality', 'secrets'])
  assert.equal(record.kitFiles['mapping.json'].length, 64)
  assert.equal(record.markerTest.groups.length, groups.length)
  assert.equal(JSON.stringify(record).includes(ORIGIN), false)
  assert.equal(record.measurements.structure.minItems.status, 'not_run')
  assert.equal(record.binding.kitFilesSha256.length, 64)
  // A clean run is still not passed while #586 is not run: nothing is called passed that was not measured.
  const clean = checkRecord({
    ...input,
    classified: { ...out, findings: [], notSeen: [] },
    groups: []
  })
  assert.equal(clean.verdict.leaks, 0)
  assert.equal(clean.verdict.pass, false)
  // The human control with pages that did not load measures nothing.
  const humanBroken = checkRecord({
    ...input,
    controls: { ...input.controls, human: { status: 'run', findings: 40, failed: 5 } }
  })
  assert.equal(humanBroken.verdict.controls, 'not_run')
  const html = recordHtml(record)
  assert.match(html, /Not passed/)
  assert.match(html, /Copy answers/)
  assert.match(html, /data-a="correct"/)
  assert.doesNotMatch(html, /<b>bold<\/b>/)
  assert.doesNotMatch(html, /florist\.example/)
  assert.doesNotMatch(html, /[\u2013\u2014]/)
  // The page says which parts failed, that the blank control is not applicable and why, and the written not seen.
  assert.match(html, /Failing parts: /)
  assert.match(html, /not applicable: the blank site before the write serves no page by design/)
  assert.match(html, /Written but not seen/)
  // The six measurements are named on the page, each with its status.
  assert.match(html, /Secret scan<\/span><code>not_run/)
  assert.match(html, /link check not_run, minimum items not_run/)
})
