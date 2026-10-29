/**
 * The content coverage audit (`content-coverage/`): the parts that decide a verdict without a browser.
 * The matcher (what counts as declared), the class of a hole (capture, template, core, unknown), the
 * lock state of a capture hole, and the committed file /ops reads.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { createClassifier } from '../content-coverage/lib/classify.mjs'
import { loadContract } from '../content-coverage/lib/contract.mjs'
import { buildCoverageFile, holeKey } from '../content-coverage/lib/coverage-file.mjs'
import { buildDbIndex } from '../content-coverage/lib/db-index.mjs'
import { annotate, mergeViewports } from '../content-coverage/lib/items.mjs'
import { createMatcher } from '../content-coverage/lib/match.mjs'
import { parseConfigurationPhp } from '../content-coverage/lib/site-config.mjs'
import {
  coverageFileProblem,
  judgeCoverage
} from '../../../../apps/tracy-web/src/lib/content-coverage/judge.js'

const SITE = 'http://127.0.0.1:53039/'

/** A contract with one article (title + intro slot) and one module whose params the lock pins. */
function contractDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'cov-contract-'))
  const write = (name, value) => writeFileSync(path.join(dir, name), JSON.stringify(value))
  write('manifest.json', {
    id: 'ja-test/j6/1.0.0',
    template: 'ja_test',
    quickstart: { release: 'quickstart/ja-test/j6', version: '1.0.0' }
  })
  write('content-map.json', {
    entities: [
      { key: 'article-2', kind: 'article', sourceId: 2 },
      { key: 'module-90', kind: 'module', sourceId: 90 },
      { key: 'menu-101', kind: 'menuItem', sourceId: 101 }
    ],
    slots: [
      { key: 'article-2.title', type: 'text', sample: 'Advanced Boxing' },
      { key: 'article-2.intro', type: 'html', sample: '<p>Train like a champion every single day.</p>' },
      { key: 'article-2.image', type: 'image', sample: 'images/joomlart/classes/intro-1.jpg' },
      // A whole-unit slot (capture --whole-units): the xpath names the heading, the sample joins its pieces.
      { key: 'article-2.heading', type: 'text', sample: 'Ring Ready Now', xpath: '/html/body/div/h2' },
      { key: 'module-90.video', type: 'text', sample: '7CZ5I-PZjEg' },
      { key: 'module-90.email', type: 'text', sample: 'sale@getfit.com' },
      { key: 'module-90.info', type: 'html', sample: '<p>Call us: <span>(239) 555-0108</span></p>' },
      // A label and a phone number in fields of their own, printed as one list item ("or CALL: <a>number</a>").
      { key: 'module-90.phone-label', type: 'text', sample: 'or CALL:' },
      { key: 'module-90.phone', type: 'text', sample: '(239) 555-0177' }
    ],
    pages: [{ entity: 'menu-101', route: 'home' }]
  })
  write('presentation-lock.json', {
    entities: {
      'module-90': { params: '{"title":"Join over 100k"}' },
      'menu-101': { type: 'component', published: 1 }
    },
    files: { 'templates/ja_test/images/logo.png': 'x', 'images/joomlart/demo.jpg': 'y' }
  })
  return dir
}

/** A tiny dump: the article, the module (its params hold a heading), an author, a price. */
function dbDump() {
  const dir = mkdtempSync(path.join(tmpdir(), 'cov-db-'))
  const file = path.join(dir, 'db.sql')
  writeFileSync(
    file,
    [
      'CREATE TABLE `jos_content` (\n  `id` int,\n  `title` varchar(255),\n  `attribs` text\n);',
      'INSERT INTO `jos_content` VALUES (2,\'Advanced Boxing\',\'{\\"price\\":\\"$141.00\\"}\');',
      'CREATE TABLE `jos_modules` (\n  `id` int,\n  `title` varchar(255),\n  `params` text\n);',
      'INSERT INTO `jos_modules` VALUES (90,\'Newsletter\',\'{\\"heading\\":\\"Join over 100k of inspiring creatives\\"}\');',
      'CREATE TABLE `jos_users` (\n  `id` int,\n  `name` varchar(255),\n  `email` varchar(255)\n);',
      "INSERT INTO `jos_users` VALUES (44,'Drew Stokes','drew@example.com');",
      'CREATE TABLE `jos_virtuemart_products_en_gb` (\n  `virtuemart_product_id` int,\n  `product_name` varchar(255)\n);',
      "INSERT INTO `jos_virtuemart_products_en_gb` VALUES (7,'Linen Wrap Dress');"
    ].join('\n')
  )
  return file
}

function audit(items) {
  const contract = loadContract(contractDir(), SITE)
  const match = createMatcher(contract, SITE)
  const classify = createClassifier(contract, buildDbIndex(dbDump()), null)
  const withKeys = items.map((it, i) => ({
    key: `${it.kind}|${i}`,
    viewports: { desktop: { visible: true } },
    ...it
  }))
  return { contract, items: annotate(withKeys, match, classify) }
}

const byValue = (items, v) => items.find((i) => i.value === v)

test('declared text, a fragment of a slot and a slot image match; a video id in data-src and a mailto address match their slots', () => {
  const { items } = audit([
    { kind: 'text', value: 'Advanced Boxing' },
    { kind: 'text', value: 'Train like a champion every single day.' },
    { kind: 'image', value: '/images/joomlart/classes/intro-1.jpg' },
    { kind: 'link', value: 'https://www.youtube.com/embed/7CZ5I-PZjEg', source: 'data-src', role: 'embed' },
    { kind: 'link', value: 'mailto:sale@getfit.com', source: 'a', role: 'content' }
  ])
  assert.deepEqual(
    items.map((i) => i.status),
    ['matched', 'matched', 'matched', 'matched', 'matched']
  )
})

test('a phone number declared inside a field of markup is declared: a segment with digits and no letter counts', () => {
  const { items } = audit([
    { kind: 'text', value: '(239) 555-0108' },
    { kind: 'text', value: '(239) 555-0199' }
  ])
  assert.equal(byValue(items, '(239) 555-0108').status, 'matched')
  // another number is not covered by it
  assert.notEqual(byValue(items, '(239) 555-0199').status, 'matched')
})

test('a block made of a label slot and a phone slot is that pair: a figure slot with no letter still counts', () => {
  // JA Boxing 1.0.8: "or CALL: (239) 555-0108" is one list item printed from two fields; the number has no letter.
  const { items } = audit([{ kind: 'text', value: 'or CALL: (239) 555-0177' }])
  const block = items[0]
  assert.deepEqual(
    [block.status, block.matchBy, [...block.slots].sort()],
    ['matched', 'composite', ['module-90.phone', 'module-90.phone-label']]
  )
})

test('a word-bounded piece of a whole-unit slot is that slot; a piece cut inside a word is not', () => {
  // The page shows "Ring Ready" <br> "Now" as two blocks; each is a piece of the one heading slot, which a writer
  // replaces as a whole.
  const { items } = audit([
    { kind: 'text', value: 'Ring Ready' },
    { kind: 'text', value: 'Now' },
    { kind: 'text', value: 'Rea' }
  ])
  const piece = byValue(items, 'Ring Ready')
  assert.deepEqual(
    [piece.status, piece.matchBy, piece.slots],
    ['matched', 'piece-of-whole-unit', ['article-2.heading']]
  )
  assert.equal(byValue(items, 'Now').status, 'matched')
  assert.notEqual(byValue(items, 'Rea').status, 'matched')
})

test('a price is demo content: numeric-only text is not ignored, and is found in the database; a bare counter is core', () => {
  const { items } = audit([
    { kind: 'text', value: '$141.00' },
    { kind: 'text', value: '·' },
    { kind: 'text', value: '28' }
  ])
  const price = byValue(items, '$141.00')
  assert.deepEqual([price.status, price.class], ['hole', 'a'])
  assert.equal(byValue(items, '·').status, 'ignored')
  // a bare calendar day or index no database cell holds is printed by a layout: core, never a hole to fix
  assert.equal(byValue(items, '28').class, 'c')
})

test('a capture hole says whether the presentation lock pins its field (locked) or nothing declares it', () => {
  const { items } = audit([
    { kind: 'text', value: 'Join over 100k of inspiring creatives' },
    { kind: 'text', value: 'Drew Stokes' }
  ])
  const locked = byValue(items, 'Join over 100k of inspiring creatives')
  assert.deepEqual([locked.status, locked.class, locked.lockState], ['hole', 'a', 'locked'])
  const author = byValue(items, 'Drew Stokes')
  assert.deepEqual([author.class, author.lockState], ['a', 'undeclared'])
})

test('only a design asset outside images/ may be locked; a locked demo photo is still a hole', () => {
  const { items } = audit([
    { kind: 'image', value: '/templates/ja_test/images/logo.png' },
    { kind: 'image', value: '/images/joomlart/demo.jpg' }
  ])
  assert.equal(items[0].status, 'locked')
  assert.equal(items[1].status, 'hole')
})

test('the coverage file: counts per class, one line per distinct hole, accepted reasons carried over', () => {
  const { contract, items } = audit([
    { kind: 'text', value: 'Advanced Boxing' },
    { kind: 'text', value: 'Join over 100k of inspiring creatives' },
    { kind: 'text', value: 'Drew Stokes' },
    { kind: 'text', value: 'Read more ...' }
  ])
  const result = {
    pages: [{ url: `${SITE}index.php?Itemid=101`, items }],
    failures: [],
    capReached: false,
    viewports: ['desktop'],
    summary: { pages: 1, mappedPages: 1, unmappedPages: 0 }
  }
  const previous = {
    holes: [
      { kind: 'text', value: 'Drew Stokes', accepted: 'Author names are Joomla users, not page content.' }
    ]
  }
  const doc = buildCoverageFile({ result, contract, previous, measuredAt: '2026-10-24T00:00:00.000Z' })
  assert.equal(coverageFileProblem(doc), null)
  assert.equal(doc.contract.id, 'ja-test/j6/1.0.0')
  assert.match(doc.contract.contentMapSha256, /^[0-9a-f]{64}$/)
  assert.deepEqual(
    [doc.counts.text.matched, doc.counts.text.capture, doc.counts.text.captureLocked, doc.counts.text.core],
    [1, 2, 1, 1]
  )
  // core strings are counted, never listed
  assert.deepEqual(doc.holes.map((h) => [h.value, h.class, h.lock, h.accepted ?? null]).sort(), [
    ['Drew Stokes', 'capture', 'undeclared', 'Author names are Joomla users, not page content.'],
    ['Join over 100k of inspiring creatives', 'capture', 'locked', null]
  ])
  assert.equal(
    holeKey(doc.holes[0]),
    holeKey({ kind: 'text', value: `  ${doc.holes[0].value.toUpperCase()} ` })
  )
  const verdict = judgeCoverage(doc)
  assert.deepEqual([verdict.holds, verdict.blocking.length, verdict.accepted], [true, 1, 1])
})

test('configuration.php gives the visible site strings and never a secret', () => {
  const config = parseConfigurationPhp(
    "<?php\nclass JConfig {\n\tpublic $sitename = 'JA Boxing';\n\tpublic $password = 'secret';\n\tpublic $MetaDesc = 'It\\'s boxing';\n}"
  )
  assert.deepEqual(config, { sitename: 'JA Boxing', MetaDesc: "It's boxing" })
})

test('the contract loader names the exact map and lock it read', () => {
  const dir = contractDir()
  const contract = loadContract(dir, SITE)
  mkdirSync(path.join(dir, 'x'), { recursive: true })
  assert.match(contract.sha256.presentationLock, /^[0-9a-f]{64}$/)
  assert.notEqual(contract.sha256.contentMap, contract.sha256.presentationLock)
})

test('a shop catalogue (VirtueMart) is its own class: listed in the file, never a blocking hole, never read by R9', () => {
  const { contract, items } = audit([
    // a price VirtueMart computes inside its own markup: in no database cell as printed
    { kind: 'text', value: '$98.00', zone: 'catalogue' },
    // a product name, found only in a virtuemart_ table
    { kind: 'text', value: 'Linen Wrap Dress' },
    // a product picture under VirtueMart's media folder
    { kind: 'image', value: '/images/virtuemart/product/wrap-dress.jpg' },
    // demo copy outside the catalogue stays a capture hole
    { kind: 'text', value: 'Join over 100k of inspiring creatives' }
  ])
  assert.deepEqual(
    items.map((i) => [i.value, i.status, i.class]),
    [
      ['$98.00', 'hole', 'e'],
      ['Linen Wrap Dress', 'hole', 'e'],
      ['/images/virtuemart/product/wrap-dress.jpg', 'hole', 'e'],
      ['Join over 100k of inspiring creatives', 'hole', 'a']
    ]
  )
  const result = {
    pages: [{ url: `${SITE}index.php?Itemid=101`, items }],
    failures: [],
    capReached: false,
    viewports: ['desktop'],
    summary: { pages: 1, mappedPages: 1, unmappedPages: 0 }
  }
  const doc = buildCoverageFile({ result, contract, measuredAt: '2026-10-29T00:00:00.000Z' })
  assert.deepEqual([doc.counts.text.catalogue, doc.counts.images.catalogue], [2, 1])
  assert.deepEqual(
    doc.holes
      .filter((h) => h.class === 'catalogue')
      .map((h) => h.value)
      .sort(),
    ['$98.00', 'Linen Wrap Dress', 'images/virtuemart/product/wrap-dress.jpg']
  )
  assert.equal(doc.labelRules.rules?.R9?.count ?? doc.labelRules.failing?.R9 ?? 0, 0)
  const verdict = judgeCoverage(doc)
  assert.deepEqual(
    verdict.blocking.map((h) => h.value),
    ['Join over 100k of inspiring creatives']
  )
})

test('a news feed Joomla fetches from another site when the page is viewed is core output, never read by R9', () => {
  const { contract, items } = audit([
    // an item of a remote feed (com_newsfeeds): in no database cell and no source file of the site
    { kind: 'text', value: 'Security advisory: CVE-2026-00001, reported 2026-01-01', zone: 'feed' },
    // demo copy beside it stays a capture hole
    { kind: 'text', value: 'Join over 100k of inspiring creatives' }
  ])
  assert.deepEqual(
    items.map((i) => [i.value, i.class]),
    [
      ['Security advisory: CVE-2026-00001, reported 2026-01-01', 'c'],
      ['Join over 100k of inspiring creatives', 'a']
    ]
  )
  const result = {
    pages: [{ url: `${SITE}index.php?Itemid=101`, items }],
    failures: [],
    capReached: false,
    viewports: ['desktop'],
    summary: { pages: 1, mappedPages: 1, unmappedPages: 0 }
  }
  const doc = buildCoverageFile({ result, contract, measuredAt: '2026-10-29T00:00:00.000Z' })
  assert.equal(doc.labelRules.rules?.R9?.count ?? 0, 0)
})

test('an item VirtueMart printed on one viewport keeps its catalogue zone when the viewports merge', () => {
  const merged = mergeViewports(
    {
      desktop: { items: [{ kind: 'text', value: '$98.00', visible: true, zone: 'catalogue' }] },
      phone: { items: [{ kind: 'text', value: '$98.00', visible: true }] }
    },
    SITE
  )
  assert.equal(merged[0].zone, 'catalogue')
})
