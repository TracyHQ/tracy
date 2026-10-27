/**
 * Page hygiene (`content-coverage/lib/hygiene.mjs`): what a customer must never see on a page built
 * from a quickstart. Raw language constants, PHP error text, unfilled placeholder tokens. The
 * fixtures are slices of JA Boxing 1.0.2 as it served them on 24/10/2026; the items are what the
 * in-page extractor reads from them (text of a block, an attribute).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildCoverageFile, hygieneKey } from '../content-coverage/lib/coverage-file.mjs'
import { findHygiene, HYGIENE_RULES } from '../content-coverage/lib/hygiene.mjs'
import { judgeCoverage } from '../../../../apps/tracy-web/src/lib/content-coverage/judge.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name) => readFileSync(path.join(here, 'fixtures/hygiene', name), 'utf8')
const text = (value, extra = {}) => ({
  kind: 'text',
  value,
  visibleAnywhere: true,
  selector: 'div',
  ...extra
})
const attr = (name, value) => ({ kind: 'attr', attr: name, value, visibleAnywhere: false, selector: 'ul' })
const kinds = (found) => found.map((f) => [f.kind, f.value])

test('a raw template language constant in the footer is flagged, even when this viewport hides it', () => {
  const found = findHygiene({
    html: fixture('footer.html'),
    items: [text('TPL_FOLLOW_US', { visibleAnywhere: false, selector: 'h5.my-0.d-none' })]
  })
  assert.deepEqual(kinds(found), [['language-constant', 'TPL_FOLLOW_US']])
  assert.equal(found[0].where, 'text')
  assert.equal(found[0].visible, false)
})

test('a raw constant in an attribute a screen reader reads (aria-label of the search list) is flagged', () => {
  const found = findHygiene({
    html: '<ul id="awesomplete_list_1"></ul>',
    items: [attr('aria-label', 'COM_FINDER_SEARCH_FORM_LIST_LABEL')]
  })
  assert.deepEqual(kinds(found), [['language-constant', 'COM_FINDER_SEARCH_FORM_LIST_LABEL']])
  assert.equal(found[0].where, 'attr:aria-label')
})

test('constants that are only keys in a page script (translations handed to JavaScript) are not flagged', () => {
  const found = findHygiene({ html: fixture('contact.html'), items: [text('(239) 555-0108')] })
  assert.deepEqual(
    found.filter((f) => f.kind === 'language-constant'),
    []
  )
})

test('PHP Deprecated text anywhere in the HTML is flagged, hidden in a visually-hidden span or not', () => {
  const found = findHygiene({ html: fixture('contact.html'), items: [] })
  assert.deepEqual(kinds(found), [
    [
      'php-error',
      'Deprecated: nl2br(): Passing null to parameter #1 ($string) of type string is deprecated (templates/ja_boxing/html/com_contact/contact/default_address.php:94)'
    ]
  ])
  assert.equal(found[0].where, 'html')
})

test('PHP Warning, Notice and Fatal error in plain text form are flagged; prose that starts with Warning is not', () => {
  const html = [
    '<p>Warning: Undefined array key "x" in /var/www/html/modules/mod_x/tmpl/default.php on line 12</p>',
    '<p>Notice: Trying to get property of non-object in /srv/site/plugins/system/t4/src/Foo.php on line 7</p>',
    'Fatal error: Uncaught Error: Call to undefined function x() in /var/www/html/libraries/src/Bar.php on line 3',
    '<p>Warning: gloves must be clean before every class.</p>'
  ].join('\n')
  assert.deepEqual(
    findHygiene({ html, items: [] }).map((f) => f.value),
    [
      'Warning: Undefined array key "x" (modules/mod_x/tmpl/default.php:12)',
      'Notice: Trying to get property of non-object (plugins/system/t4/src/Foo.php:7)',
      'Fatal error: Uncaught Error: Call to undefined function x() (libraries/src/Bar.php:3)'
    ]
  )
})

test('a lone uppercase TITLE inside demo copy is an unfilled placeholder', () => {
  const html = fixture('class.html')
  const found = findHygiene({
    html,
    items: [text('Here’s everything you need to know to get ready for your first TITLE workout!')]
  })
  assert.deepEqual(kinds(found), [
    ['placeholder', 'Here’s everything you need to know to get ready for your first TITLE workout!']
  ])
  assert.equal(found[0].token, 'TITLE')
})

test('curly tokens, JA ((span)) leftovers and %tokens% are unfilled placeholders', () => {
  const found = findHygiene({
    html: '',
    items: [
      text('Call us at {contact.tel}'),
      text('NO1 ((Boxing)) studio'),
      attr('placeholder', 'Write to %sitename%')
    ]
  })
  assert.deepEqual(
    found.map((f) => [f.kind, f.token]),
    [
      ['placeholder', '{contact.tel}'],
      ['placeholder', '((Boxing))'],
      ['placeholder', '%sitename%']
    ]
  )
})

test('no false alarms: real all-caps headings, lorem ipsum, prices, prose with a placeholder word in lowercase', () => {
  const found = findHygiene({
    html: '<h2>THE WORKOUT</h2><p>Lorem ipsum dolor sit amet.</p>',
    items: [
      text('THE WORKOUT'),
      text('NO1 BOXING STUDIO'),
      text('WHAT TO BRING'),
      text('JOB TITLE AND NAME'),
      text('Lorem ipsum dolor sit amet, consectetur adipiscing elit.'),
      text('$141.00 /class'),
      text('Pick a title for your first class'),
      text('Write to us at hello@example.com, 50% off for 20% of members'),
      text('COVID-19 rules: bring a towel'),
      text('ACME_CORP'),
      attr('title', 'Facebook')
    ]
  })
  assert.deepEqual(found, [])
})

test('the rules live in data: constant prefixes, PHP levels, placeholder words and the case threshold', () => {
  for (const key of [
    'constantPrefixes',
    'phpLevels',
    'placeholderWords',
    'tokenPatterns',
    'minLowercaseShare'
  ])
    assert.ok(key in HYGIENE_RULES, key)
  const strict = { ...HYGIENE_RULES, placeholderWords: [] }
  assert.deepEqual(findHygiene({ html: '', items: [text('your first TITLE workout!')], rules: strict }), [])
})

test('the coverage file lists each page problem once with its pages; accepted reasons carry over; one blocks Publish', () => {
  const page = (url, hygiene) => ({ url, items: [], hygiene })
  const constant = {
    kind: 'language-constant',
    value: 'TPL_FOLLOW_US',
    where: 'text',
    visible: false,
    evidence: 'h5'
  }
  const php = {
    kind: 'php-error',
    value: 'Deprecated: nl2br() (x.php:94)',
    where: 'html',
    visible: false,
    evidence: ''
  }
  const result = {
    pages: [page('http://s/', [constant]), page('http://s/contact', [constant, php])],
    failures: [],
    capReached: false,
    viewports: ['desktop'],
    summary: { pages: 2, mappedPages: 2, unmappedPages: 0 }
  }
  const contract = {
    manifest: { id: 'ja-test/j6/1.0.0' },
    sha256: { contentMap: 'a'.repeat(64), presentationLock: 'b'.repeat(64) }
  }
  const previous = { hygiene: [{ ...php, accepted: 'Measured on a broken PHP build of the test site.' }] }
  const doc = buildCoverageFile({ result, contract, previous, measuredAt: '2026-10-24T00:00:00.000Z' })
  assert.deepEqual(
    doc.hygiene.map((h) => [h.kind, h.value, h.pages, h.firstPage, h.accepted ?? null]),
    // PHP errors first: the page breaks, not only its words
    [
      [
        'php-error',
        'Deprecated: nl2br() (x.php:94)',
        1,
        '/contact',
        'Measured on a broken PHP build of the test site.'
      ],
      ['language-constant', 'TPL_FOLLOW_US', 2, '/', null]
    ]
  )
  assert.equal(hygieneKey(doc.hygiene[1]), 'language-constant|TPL_FOLLOW_US')
  const verdict = judgeCoverage(doc)
  assert.equal(verdict.holds, true)
  assert.deepEqual(
    verdict.hygiene.map((h) => h.value),
    ['TPL_FOLLOW_US']
  )
  assert.deepEqual(verdict.hygieneByKind, { 'language-constant': 1 })
})
