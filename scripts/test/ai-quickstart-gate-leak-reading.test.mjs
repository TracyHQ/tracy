// How the marker test reads what a page shows (ticket #586, slice B gate faults G3 to G9), on an invented florist site:
// an interface string outranks a row of the dump that happens to hold the same words (G3); a language string written
// with entities or inline markup is matched by its words (G4); an address of the site that names a marker page is the
// build's own (G5); in structured data only a type is exempt as a type, never a name (G6); a kept string whose fill is
// a number or another kept string is exempt (G7); the kit's kept places and kept literals exempt, and a false reason on
// any of them is caught (G8); an inline picture is named in full and found in the file that writes it (G9).
import assert from 'node:assert/strict'
import test from 'node:test'
import { EXEMPTIONS } from '../ai-quickstart/gate/adapters/joomla-t4.mjs'
import { classify } from '../ai-quickstart/gate/classify.mjs'
import { exemptionOf, keptPlacesOf } from '../ai-quickstart/gate/exemptions.mjs'
import { codeOf } from '../ai-quickstart/gate/marker-codec.mjs'
import { sourceResolver } from '../ai-quickstart/gate/sources.mjs'

const ORIGIN = 'http://florist.example'
const A = codeOf(7)
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="M0 0h8v8z"/></svg>'
const B64 = 'data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64')
const ARCHIVE = {
  names: [],
  files: new Map([
    [
      'language/en-GB/com_petal.ini',
      'COM_PETAL_EMAIL="Email"\nCOM_PETAL_TIPS="Join words with <strong>AND</strong> here"\n'
    ],
    ['language/en-GB/mod_search.ini', 'MOD_SEARCH_LABEL="Search&hellip;"\n'],
    [
      'language/en-GB/lib_joomla.ini',
      'JLIB_PAGE_OF="Page %s of %s"\nJNEXT="Next"\nJLIB_GOTO="Go to the %s page"\n'
    ],
    ['installation/sql/mysql/custom.sql', 'INSERT INTO `#__extensions` VALUES (3,\'{"label":"Email"}\');'],
    [
      'media/vendor/petal/css/forms.css',
      `.f{background:url("data:image/svg+xml,${encodeURIComponent(SVG)}")}` +
        `.g{background:url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg'%3e%3ccircle r='2'/%3e%3c/svg%3e")}`
    ]
  ])
}
const resolve = sourceResolver(ARCHIVE, { site: ORIGIN })
const obs = (kind, value, element, extra = {}) => ({
  kind,
  value,
  place: { element },
  visible: true,
  ...extra
})
const read = (observations, extra = {}) =>
  classify({
    renders: [
      { pageType: 'home', path: 'index.php', theme: 'light', width: 1440, status: 200, observations }
    ],
    origin: ORIGIN,
    registry: [{ code: A, what: 'writer' }],
    writePlan: { ops: [] },
    uploaded: {},
    resolve,
    kept: new Map(),
    rules: EXEMPTIONS,
    ...extra
  })

test('G3: an interface string outranks a dump row that holds the same word', () => {
  const s = resolve.text('Email')
  assert.equal(s.class, 'ambiguous')
  assert.equal(s.likely.class, 'language', JSON.stringify(s))
  assert.equal(s.likely.key, 'COM_PETAL_EMAIL')
})

test('G4: a language string written with an entity or inline markup is matched by its words', () => {
  assert.equal(resolve.text('Search…').key, 'MOD_SEARCH_LABEL')
  assert.equal(resolve.text('Join words with AND here').key, 'COM_PETAL_TIPS')
})

test('G5: an address of the site naming a marker page is the build own, never a leak', () => {
  const out = read([
    obs('jsonld', `${ORIGIN}/index.php/${'qx' + A.toLowerCase()}`, 'script[ld+json]', { key: 'url' })
  ])
  assert.deepEqual(out.findings, [])
  assert.ok(out.seen.has(A))
})

test('G6: in structured data a capitalised name is no type; only a type is exempt as one', () => {
  const ctx = { kept: new Map(), rules: EXEMPTIONS, origin: ORIGIN }
  assert.equal(
    exemptionOf(obs('jsonld', 'Person', 'script[ld+json]', { key: '@type' }), ctx),
    'structured_data_type'
  )
  assert.equal(
    exemptionOf(obs('jsonld', 'en-GB', 'script[ld+json]', { key: 'inLanguage' }), ctx),
    'structured_data_type'
  )
  assert.equal(exemptionOf(obs('jsonld', 'Rosalind', 'script[ld+json]', { key: 'name' }), ctx), null)
  const out = read([obs('jsonld', 'Rosalind', 'script[ld+json]', { key: 'name' })])
  assert.equal(out.findings.length, 1)
})

test('G7: a kept string whose fills are numbers or another kept string is exempt; other words are not', () => {
  const kept = new Map([
    ['JLIB_PAGE_OF', 'pagination, valid on every site'],
    ['JLIB_GOTO', 'pagination, valid on every site'],
    ['JNEXT', 'pagination, valid on every site']
  ])
  const out = read(
    [
      obs('text', 'Page 1 of 2', 'p'),
      obs('text', 'Go to the Next page', 'a'),
      obs('text', 'Page tulips of 2', 'p')
    ],
    { kept }
  )
  assert.deepEqual(
    out.findings.map((f) => f.value),
    ['Page tulips of 2']
  )
})

test('G8: kept places and kept literals exempt; a false reason on any of them is caught', () => {
  const mapping = {
    notEmptied: [
      { entity: 'field-1', slot: 'field-1.0', why: 'the phone field label, interface text on every site' }
    ],
    keptLiterals: [
      {
        file: 'templates/petal/share.php',
        values: ['facebook'],
        why: 'a share network name, valid on every site'
      },
      { file: 'templates/petal/steps.php', pattern: '^\\d{2}$', why: 'the ordinal the layout counts' },
      { file: 'templates/petal/x.php', values: ['reddit'], why: 'no page draws it' }
    ]
  }
  const draftReport = {
    outsideStore: [
      { slot: 'category-2.0', entity: 'category-2', as: 'kept', why: 'the default category name' }
    ]
  }
  const keep = keptPlacesOf(mapping, draftReport)
  const resolveWith = {
    text: (v) =>
      v === 'Phone'
        ? { class: 'block_field', slot: 'field-1.0', entity: 'field-1' }
        : v === 'Uncategorised'
          ? { class: 'data', slot: 'category-2.0', entity: 'category-2', table: '#__categories' }
          : { class: 'unknown', searched: [] },
    picture: () => ({ class: 'unknown', searched: [] })
  }
  const out = read(
    ['Phone', 'Uncategorised', 'facebook', '07', 'reddit', 'Twitter'].map((v) => obs('text', v, 'span')),
    // The adapter's scope says the literal files print on this page (W1: a literal exempts only where its file prints).
    { keep, resolve: resolveWith, scope: { renders: () => true, holds: () => false } }
  )
  assert.deepEqual(out.findings.map((f) => [f.group, f.value]).sort(), [
    ['kit_reason_false', 'reddit'],
    ['unmarked_text', 'Twitter']
  ])
  // With no scope and no source naming the file, the page cannot tell the file: the literals are leaks.
  const blind = read(
    ['facebook', '07'].map((v) => obs('text', v, 'span')),
    { keep, resolve: resolveWith }
  )
  assert.deepEqual(blind.findings.map((f) => f.value).sort(), ['07', 'facebook'])
  assert.deepEqual(out.exempt.map((e) => e.why.split(':')[0]).sort(), [
    'kept_by_kit',
    'kept_by_kit',
    'kept_literal',
    'kept_literal'
  ])
})

test('G9: an inline picture is found in the file that writes it, and two that start alike stay apart', () => {
  assert.deepEqual(
    [resolve.picture(B64).class, resolve.picture(B64).file],
    ['stylesheet', 'media/vendor/petal/css/forms.css']
  )
  // A sheet that writes the picture percent encoded with single quotes inside, read back by a browser in base64.
  const quoted = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>'
  assert.equal(
    resolve.picture('data:image/svg+xml;base64,' + Buffer.from(quoted).toString('base64')).file,
    'media/vendor/petal/css/forms.css'
  )
  const other = 'data:image/svg+xml;base64,' + Buffer.from(SVG.replace('8v8', '4v4')).toString('base64')
  const out = read([obs('image', B64, 'input[background]'), obs('image', other, 'input[background]')])
  assert.equal(out.findings.length, 2)
  assert.notEqual(out.findings[0].value, out.findings[1].value)
})

test('the not found title is sourced to the string it prints in full, not to a shorter one with a fill', () => {
  const r = sourceResolver(
    {
      names: [],
      files: new Map([
        ['language/en-GB/com_mailer.ini', 'MAILER_NOT_FOUND="%s not found"\n'],
        ['language/en-GB/joomla.ini', 'JERROR_ERROR="Error"\nJERROR_PAGE_NOT_FOUND="Page not found"\n']
      ])
    },
    { site: ORIGIN }
  )
  const s = r.text('Error: 404 Page not found')
  assert.equal(s.class, 'ambiguous', JSON.stringify(s))
  assert.equal(s.likely.key, 'JERROR_PAGE_NOT_FOUND')
  const kept = new Map([
    ['JERROR_PAGE_NOT_FOUND', 'the not found page, valid on every site'],
    ['JERROR_ERROR', 'the not found page, valid on every site']
  ])
  const out = read([obs('title', 'Error: 404 Page not found', 'title')], { kept, resolve: r })
  assert.deepEqual(out.findings, [])
})
