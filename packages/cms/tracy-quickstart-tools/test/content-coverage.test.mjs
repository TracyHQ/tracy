/**
 * The content coverage audit (`content-coverage/`): the parts that decide a verdict without a browser.
 * The matcher (what counts as declared), the class of a hole (capture, template, core, unknown), the
 * lock state of a capture hole, and the committed file /ops reads.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { createClassifier } from '../content-coverage/lib/classify.mjs'
import { loadContract } from '../content-coverage/lib/contract.mjs'
import { buildCoverageFile, holeKey } from '../content-coverage/lib/coverage-file.mjs'
import { buildDbIndex } from '../content-coverage/lib/db-index.mjs'
import { annotate, mergeViewports, physicalReceivers } from '../content-coverage/lib/items.mjs'
import { createMatcher } from '../content-coverage/lib/match.mjs'
import { parseConfigurationPhp } from '../content-coverage/lib/site-config.mjs'
import { buildSourceIndex, receiverProducer } from '../content-coverage/lib/sources.mjs'
import {
  coverageFileProblem,
  judgeCoverage
} from '../../../../apps/tracy-web/src/lib/content-coverage/judge.js'

const SITE = 'http://127.0.0.1:53039/'

/** A contract with one article (title + intro slot) and one module whose params the lock pins. */
function contractDir(extraSlots = []) {
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
      // A paragraph with inline code: capture leaves the code words out of the sample.
      {
        key: 'article-2.typed',
        type: 'text',
        sample: 'Assign types at ingest: is an integer, is a float.',
        xpath: '/html/body/div/p[3]'
      },
      { key: 'module-90.video', type: 'text', sample: '7CZ5I-PZjEg' },
      { key: 'module-90.email', type: 'text', sample: 'sale@getfit.com' },
      { key: 'module-90.info', type: 'html', sample: '<p>Call us: <span>(239) 555-0108</span></p>' },
      // A label and a phone number in fields of their own, printed as one list item ("or CALL: <a>number</a>").
      { key: 'module-90.phone-label', type: 'text', sample: 'or CALL:' },
      { key: 'module-90.phone', type: 'text', sample: '(239) 555-0177' },
      // A figure field the template prints after a hard-coded currency sign ("$<?= $raise ?>").
      { key: 'module-90.raised', type: 'text', sample: '4,500' },
      // A tour's price field, printed alone in the quick facts and after a hard-coded label on the booking button.
      { key: 'article-4.price', type: 'text', sample: '$2,450' },
      // A store link kept in a text field of the template's extra fields.
      { key: 'article-2.store', type: 'text', sample: 'https://music.apple.com/' },
      // Template language strings with printf placeholders (capture's language-string rule) and an author's name.
      { key: 'languageString-1.0', type: 'text', sample: 'Showing %1$s of %2$s' },
      { key: 'languageString-2.0', type: 'text', sample: 'Follow %s' },
      { key: 'languageString-3.0', type: 'text', sample: 'Ready to write your own %s chapter?' },
      { key: 'user-45.0', type: 'text', sample: 'Riley Moss' },
      // A policy paragraph that names an address in its text, and a label a card prints before it.
      { key: 'article-3.label', type: 'text', sample: 'HOUSE RULES' },
      {
        key: 'article-3.body',
        type: 'text',
        sample: 'Write to rules@example.test for any question about these rules and we answer within a day.'
      },
      ...extraSlots
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

function audit(items, extraSlots = []) {
  const contract = loadContract(contractDir(extraSlots), SITE)
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

test('a web address kept in a text field is the slot of the link that prints it', () => {
  const { items } = audit([
    { kind: 'link', value: 'https://music.apple.com/', source: 'a', role: 'content' },
    { kind: 'link', value: 'https://open.spotify.com/', source: 'a', role: 'content' }
  ])
  assert.equal(byValue(items, 'https://music.apple.com/').status, 'matched')
  assert.equal(byValue(items, 'https://open.spotify.com/').status, 'hole')
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

test('a figure printed after a currency sign the template writes is its slot; another figure is not', () => {
  // JA Impact 1.0.6: donation cards print "$" + the raise field, so the page shows "$4,500" for the slot "4,500".
  const { items } = audit([
    { kind: 'text', value: '$4,500' },
    { kind: 'text', value: '$40,000' }
  ])
  assert.deepEqual(
    [byValue(items, '$4,500').status, byValue(items, '$4,500').slots],
    ['matched', ['module-90.raised']]
  )
  assert.notEqual(byValue(items, '$40,000').status, 'matched')
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

test('a short figure slot inside a block is removed from it: the words the template writes around it are what is left', () => {
  // JA Voyara 1.0.12: tour.php prints 'Reserve \u2014 ' . $tourPrice on the booking button; the price is a slot with
  // no letter and fewer than 7 figures, so the whole button used to be one unknown hole that read as a price.
  const { items } = audit([
    { kind: 'text', value: 'Reserve \u2014 $2,450' },
    { kind: 'text', value: 'Reserve \u2014 $9,950' },
    { kind: 'text', value: 'Reserve \u2014 $2,4500' }
  ])
  const [button, other, longer] = items
  assert.deepEqual(
    [button.status, button.matchBy, button.slots, button.remainder],
    ['hole', 'partial', ['article-4.price'], 'reserve -']
  )
  assert.deepEqual([other.status, other.slots ?? null], ['hole', null])
  assert.deepEqual([longer.status, longer.slots ?? null], ['hole', null])
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

test('a language string with placeholders matches text filled with counts, slot text or a first name; other words stay holes', () => {
  const { items } = audit([
    { kind: 'text', value: 'Showing 8 of 82' },
    { kind: 'text', value: 'Follow Riley' },
    { kind: 'text', value: 'Ready to write your own Advanced Boxing chapter?' },
    { kind: 'text', value: 'Follow Morgan' }
  ])
  assert.deepEqual(
    items.map((i) => [i.status, i.matchBy ?? null, i.slots ?? null]),
    [
      ['matched', 'language pattern', ['languageString-1.0']],
      ['matched', 'language pattern', ['languageString-2.0']],
      ['matched', 'language pattern', ['languageString-3.0']],
      ['hole', null, null]
    ]
  )
})

test('a card excerpt cut inside a slot is that slot; a cloaked address inside a slot text is its mailto link', () => {
  const { items } = audit([
    { kind: 'text', value: 'HOUSE RULES Write to rules@example.test for any question about…' },
    { kind: 'text', value: 'HOUSE RULES Something else entirely that no slot holds…' },
    { kind: 'link', value: 'mailto:rules@example.test', source: 'a', role: 'content' },
    { kind: 'link', value: 'mailto:other@example.test', source: 'a', role: 'content' }
  ])
  assert.deepEqual(
    items.map((i) => [i.status, i.matchBy ?? null]),
    [
      ['matched', 'composite'],
      ['hole', 'partial'],
      ['matched', 'address inside a slot text'],
      ['hole', null]
    ]
  )
})

test('a paragraph with inline code is its slot when the words outside the code match; a block of code alone stays a hole', () => {
  const { items } = audit([
    {
      kind: 'text',
      value: 'Assign types at ingest: status is an integer, duration_ms is a float.',
      outsideCode: 'Assign types at ingest: is an integer, is a float.'
    },
    {
      kind: 'text',
      value: 'Assign types at ingest: status is a string.',
      outsideCode: 'Assign types at ingest: is a string.'
    },
    { kind: 'text', value: 'alert "disk pressure" | when disk_used > 0.9 for 15m', outsideCode: '' }
  ])
  const p = items[0]
  assert.deepEqual([p.status, p.slots], ['matched', ['article-2.typed']])
  assert.match(p.matchBy, /^text outside inline code/)
  assert.notEqual(items[1].status, 'matched')
  assert.notEqual(items[2].status, 'matched')
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

test('an all-numeric date a layout prints is core like a written one; a phone number is not', () => {
  const { items } = audit([
    { kind: 'text', value: '06.09.2021' },
    { kind: 'text', value: '2021/09/06' },
    { kind: 'text', value: '6 September 2021' },
    { kind: 'text', value: '(084) 555-0110' }
  ])
  assert.deepEqual(
    items.slice(0, 3).map((i) => [i.value, i.class]),
    [
      ['06.09.2021', 'c'],
      ['2021/09/06', 'c'],
      ['6 September 2021', 'c']
    ]
  )
  // A phone number has the digits but not the shape: never core.
  assert.notEqual(byValue(items, '(084) 555-0110').class, 'c')
})

test('an article date a module prints with a weekday ("Tue, Aug 2021", date_format "D, M Y") is core, like other Joomla dates', () => {
  const { items } = audit([
    { kind: 'text', value: 'Tue, Aug 2021' },
    { kind: 'text', value: 'Monday, 14 June 2021' },
    { kind: 'text', value: 'Tuesday is gig night' }
  ])
  assert.equal(byValue(items, 'Tue, Aug 2021').class, 'c')
  assert.equal(byValue(items, 'Monday, 14 June 2021').class, 'c')
  assert.notEqual(byValue(items, 'Tuesday is gig night').class, 'c')
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

test('the coverage file names each page that failed to render, by path, never by stand address', () => {
  const { contract, items } = audit([{ kind: 'text', value: 'Advanced Boxing' }])
  const result = {
    pages: [{ url: `${SITE}index.php?Itemid=101`, items }],
    failures: [
      { url: `${SITE}index.php?Itemid=909`, origin: 'map', mapPage: 'menuItem-909', status: 503 },
      { url: `${SITE}blog/slow-page`, origin: 'crawl', status: undefined, error: 'Timeout 30000ms exceeded' }
    ],
    capReached: false,
    viewports: ['desktop'],
    summary: { pages: 1, mappedPages: 1, unmappedPages: 0 }
  }
  const doc = buildCoverageFile({ result, contract, measuredAt: '2026-10-24T00:00:00.000Z' })
  assert.equal(doc.pages.failed, 2)
  assert.deepEqual(doc.pages.failures, [
    { url: '/index.php?Itemid=909', code: 'page-not-rendered', mapPage: 'menuItem-909', status: 503 },
    { url: '/blog/slow-page', code: 'page-not-rendered', error: 'Timeout 30000ms exceeded' }
  ])
  assert.equal(JSON.stringify(doc).includes(new URL(SITE).host), false)
  const clean = buildCoverageFile({ result: { ...result, failures: [] }, contract })
  assert.deepEqual(clean.pages.failures, [])
  assert.equal(coverageFileProblem(doc), null)
})

test('each failure of the coverage file names what failed by a code, so a dead link is never read as a page that did not render', () => {
  const { contract, items } = audit([{ kind: 'text', value: 'Advanced Boxing' }])
  const result = {
    pages: [{ url: `${SITE}index.php?Itemid=101`, items }],
    failures: [
      {
        url: `${SITE}pages/contact`,
        origin: 'link',
        status: 404,
        error: 'dead link (404) shown on 2 page(s): /, /about'
      },
      {
        url: `${SITE}tours/glacier-walk`,
        origin: 'layout',
        error: 'asks for layout ja_example:tour, the page serves the default'
      },
      { url: `${SITE}about`, error: 'module boxes not read (desktop: Timeout 30000ms exceeded)' },
      { url: `${SITE}blog/slow-page`, origin: 'crawl', error: 'Timeout 30000ms exceeded' }
    ],
    capReached: false,
    viewports: ['desktop'],
    summary: { pages: 1, mappedPages: 1, unmappedPages: 0 }
  }
  const doc = buildCoverageFile({ result, contract })
  assert.deepEqual(
    doc.pages.failures.map((f) => f.code),
    ['dead-link', 'layout-not-served', 'module-boxes-not-read', 'page-not-rendered']
  )
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

test('a breadcrumb that prints the page heading first keeps the heading mark when the copies merge', () => {
  const merged = mergeViewports(
    {
      desktop: {
        items: [
          { kind: 'text', value: 'Company', tag: 'li', role: 'nav', visible: true },
          { kind: 'text', value: 'Company', tag: 'h1', role: 'content', visible: true }
        ]
      }
    },
    SITE
  )
  assert.equal(merged.length, 1)
  assert.equal(merged[0].tag, 'li')
  assert.equal(merged[0].h1, true)
})

test('audio capability matches exact owner and sparse track while preserving URL case/query and every occurrence', () => {
  const dir = contractDir()
  const mapPath = path.join(dir, 'content-map.json')
  const slots = [11, 12].flatMap((entity) =>
    [0, 2].map((row) => ({
      key: `article-${entity}.${row}`,
      entity: `article-${entity}`,
      column: 'attribs',
      jsonPath: ['ctm_audio', 'audio-src', row],
      type: 'url',
      role: 'business.audio',
      sample: 'https://media.example/Track.mp3?key=A'
    }))
  )
  writeFileSync(mapPath, JSON.stringify({ entities: [], pages: [], slots }))
  const matcher = createMatcher(loadContract(dir, SITE), SITE)
  const item = { kind: 'media', mediaKind: 'audio', entity: 'article-11', track: '2', value: slots[0].sample }
  assert.deepEqual(matcher(item).slots, ['article-11.2'])
  for (const over of [
    { entity: 'article-13' },
    { track: '1' },
    { value: 'https://media.example/track.mp3?key=A' },
    { value: 'https://media.example/Track.mp3?key=a' },
    { entity: undefined },
    { value: '/images/undeclared.mp3' }
  ])
    assert.equal(matcher({ ...item, ...over }).status, 'hole')
  const copies = slots.map((s) => ({
    ...item,
    entity: s.entity,
    track: String(s.jsonPath[2]),
    rect: null,
    visible: true
  }))
  const merged = mergeViewports({ 1440: { items: copies }, 390: { items: copies } }, SITE)
  assert.equal(merged.length, 4)
  assert.deepEqual(
    merged.map((x) => [x.entity, x.track]),
    copies.map((x) => [x.entity, x.track])
  )
})

const metadataSlots = [
  { key: 'module-91.year', type: 'text', sample: '2026' },
  { key: 'module-92.figure', type: 'text', sample: '99.99%' },
  { key: 'module-93.lines', type: 'text', sample: 'First line\n99.99% UPTIME\r\n\nLast line' },
  { key: 'module-94.features', type: 'text', sample: 'Private tier\n99.99% SLA' }
]

test('saved metadata: complete newline lines keep their declared owner before short figures', () => {
  const { items } = audit(
    [
      { kind: 'text', value: '99.99% UPTIME' },
      { kind: 'text', value: '99.99% SLA' },
      { kind: 'text', value: 'First line' }
    ],
    metadataSlots
  )
  assert.deepEqual(
    items.map((i) => [i.status, i.slots]),
    [
      ['matched', ['module-93.lines']],
      ['matched', ['module-94.features']],
      ['matched', ['module-93.lines']]
    ]
  )
})

for (const reverse of [false, true]) {
  test(`saved metadata: date and read-time preserve a full date, encounter order ${reverse}`, () => {
    const values = ['Riley Moss · 18 June 2026 · 2 min', '18 June 2026', '25 June 2026 · 3 min read']
    if (reverse) values.reverse()
    const { items } = audit(
      values.map((value) => ({ kind: 'text', value })),
      metadataSlots
    )
    for (const i of items) {
      assert.equal(i.class, 'c', i.value)
      assert.ok(!i.slots?.includes('module-91.year'), i.value)
    }
  })

  test(`saved metadata: classifier cache includes whole value, encounter order ${reverse}`, () => {
    const contract = loadContract(contractDir(), SITE)
    const classify = createClassifier(contract, buildDbIndex(dbDump()), null)
    const values = [
      ['Advanced Boxing', 'a'],
      ['18 June 2026', 'c']
    ]
    if (reverse) values.reverse()
    for (const [value, expected] of values)
      assert.equal(classify({ kind: 'text', value }, { remainder: '18 june' }).class, expected)
  })
}

test('saved metadata: partial lines, yearless dates and unknown claims stay unexplained', () => {
  const { items } = audit(
    [
      'UPTIME',
      '99.99% AMAZING',
      'SLA',
      '18 June',
      'Riley Moss · 18 June 2026 · Top 100 provider',
      'Riley Moss · 18 June 2026 · 2 min · Unowned promise',
      'Riley Moss · 18 June 2026 · (239) 555-0199',
      'Riley Moss · 18 June 2026 · $9,950'
    ].map((value) => ({ kind: 'text', value })),
    metadataSlots
  )
  for (const i of items) {
    assert.equal(i.status, 'hole', i.value)
    assert.notEqual(i.class, 'c', i.value)
  }
})

test('saved metadata: unknown prices, phones and locked PRE remain holes', () => {
  const { items } = audit(
    [
      { kind: 'text', value: '$141.00' },
      { kind: 'text', value: '(239) 555-0199' },
      {
        kind: 'text',
        tag: 'pre',
        inCode: true,
        outsideCode: '',
        value: 'union events | where ts > 2026 | sort ts asc'
      }
    ],
    metadataSlots
  )
  for (const i of items) assert.equal(i.status, 'hole', i.value)
  assert.notEqual(items[2].class, 'c')
})

test('literal PRE: exact code text owns only its declared scalar, never prose normalization', () => {
  const literal = 'SELECT <Widget>\n\tA &amp; B ((strong))Case((/strong))'
  const c = loadContract(
    contractDir([
      {
        key: 'article-2.code',
        type: 'text',
        sample: literal,
        xpath: '/html/body/div/pre/code/text()'
      }
    ]),
    SITE
  )
  const match = createMatcher(c, SITE)
  const item = (codeText) => ({
    kind: 'text',
    tag: 'pre',
    inCode: true,
    codeText,
    value: codeText,
    outsideCode: ''
  })
  assert.equal(match(item(literal)).status, 'matched')
  assert.deepEqual(match(item(literal)).slots, ['article-2.code'])
  for (const changed of [
    literal.toLowerCase(),
    literal.replace('\t', ' '),
    literal.replace('\n', ' '),
    literal.replace('&amp;', '&'),
    literal + ' '
  ])
    assert.equal(match(item(changed)).status, 'hole', JSON.stringify(changed))
  assert.notEqual(match({ kind: 'text', value: literal }).status, 'matched', 'code samples cannot own prose')
  assert.equal(match(item('Train like a champion every single day.')).status, 'hole', 'prose cannot own code')
  assert.equal(
    match({ ...item(literal), codeText: undefined }).status,
    'hole',
    'unsupported CODE has no exact structural observation'
  )
  const merged = mergeViewports(
    { desktop: { items: [item(literal), item(literal.toLowerCase())] }, phone: { items: [item(literal)] } },
    SITE
  )
  assert.equal(merged.length, 2)
  assert.equal(merged[0].codeText, literal)
  assert.equal(merged[0].viewports.phone.count, 1)
})

test('literal PRE: DOM extraction double preserves decoded text and rejects unsupported structures', async () => {
  const { parseHTML } = await import('linkedom')
  const { runInNewContext } = await import('node:vm')
  const { extractPage } = await import('../content-coverage/lib/browser-extract.js')
  const literal = 'SELECT <Widget>\n\tA &amp; B'
  const read = (inner) => {
    const { window, document } = parseHTML(`<html><body>${inner}</body></html>`)
    document.body.normalize() // linkedom splits entities into adjacent text nodes; HTML parsers coalesce them.
    // Layout/canvas doubles only; this is no browser or rendering proof.
    window.HTMLElement.prototype.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 100,
      bottom: 30,
      width: 100,
      height: 30
    })
    const create = document.createElement.bind(document)
    document.createElement = (tag) =>
      tag === 'canvas'
        ? { getContext: () => ({ measureText: (s) => ({ width: s.length * 8 }) }) }
        : create(tag)
    window.scrollX = 0
    window.scrollY = 0
    window.innerWidth = 1440
    return runInNewContext(`(${extractPage.toString()})()`, {
      window,
      document,
      location: { href: SITE },
      getComputedStyle: () => ({
        display: 'block',
        backgroundImage: 'none',
        fontSize: '16px',
        lineHeight: '20px'
      })
    }).items
  }
  const encoded = literal.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const supported = read(`<pre><code>${encoded}</code></pre>`)
  assert.equal(
    supported.filter((s) => s.kind === 'text').length,
    1,
    'block-display CODE is not duplicated or lost'
  )
  assert.equal(supported[0].codeText, literal)
  for (const html of [
    `<pre><code><span>${encoded}</span></code></pre>`,
    `<pre>outside<code>${encoded}</code></pre>`,
    `<pre>${encoded}</pre>`
  ])
    assert.equal(
      read(html).some((s) => typeof s.codeText === 'string'),
      false
    )
})

// Fictional ACM source fields; no saved contract, contacts or accounts are loaded.
function teamSocialMatcher(sample, extra = {}, module = 'mod_ja_acm') {
  const dir = contractDir([
    {
      key: 'module-90.socials',
      entity: 'module-90',
      column: 'params',
      type: 'text',
      role: 'editorial.navigation_url',
      nestedJson: 'jatools-config',
      jsonPath: ['teams', 'teams[socials]', 0],
      sample,
      ...extra
    }
  ])
  const file = path.join(dir, 'content-map.json')
  const map = JSON.parse(readFileSync(file, 'utf8'))
  map.entities.find((e) => e.key === 'module-90').identity = { module }
  writeFileSync(file, JSON.stringify(map))
  const contract = loadContract(dir, SITE)
  return { contract, match: createMatcher(contract, SITE), mapFile: file }
}

test('ACM social URLs: two newline network|URL entries bind their existing scalar key', () => {
  const sample =
    'network-one | https://one.example.test/profile\r\nnetwork-two|https://two.example.test/profile?view=card&lang=en'
  const { contract, match, mapFile } = teamSocialMatcher(sample)
  const before = readFileSync(mapFile, 'utf8')
  for (const value of [
    'https://one.example.test/profile',
    'https://two.example.test/profile?view=card&lang=en'
  ])
    assert.deepEqual(match({ kind: 'link', value }), {
      status: 'matched',
      by: 'href',
      slots: ['module-90.socials']
    })
  assert.equal(contract.slotsByKey.get('module-90.socials').sample, sample)
  assert.equal(readFileSync(mapFile, 'utf8'), before, 'indexing never rewrites the map')
  assert.equal(match({ kind: 'link', value: 'https://one.example.test/other' }).status, 'hole')
})

test('ACM social URLs: wrong source address, type, role or module never gains a URL projection', () => {
  const value = 'https://gated.example.test/profile'
  const sample = `network|${value}`
  for (const extra of [
    { entity: 'article-2' },
    { column: 'content' },
    { type: 'html' },
    { role: 'editorial.paragraph' },
    { nestedJson: 'other-config' },
    { jsonPath: ['other', 'teams[socials]', 0] },
    { jsonPath: ['teams', 'teams[bio]', 0] },
    { jsonPath: ['teams', 'teams[socials]', '0'] },
    { jsonPath: ['teams', 'teams[socials]', -1] },
    { jsonPath: ['teams', 'teams[socials]', 0, 'extra'] }
  ])
    assert.equal(teamSocialMatcher(sample, extra).match({ kind: 'link', value }).status, 'hole')
  assert.equal(teamSocialMatcher(sample, {}, 'mod_custom').match({ kind: 'link', value }).status, 'hole')
})

test('ACM social URLs: malformed lines and prose stay holes while ordinary URL behavior remains', () => {
  const value = 'https://negative.example.test/profile'
  for (const sample of [
    `Read the profile at ${value}`,
    `network ${value}`,
    `|${value}`,
    `network|${value}|trailing`,
    `network|${value} trailing prose`,
    `network|javascript:open('${value}')`,
    'network|https://'
  ])
    assert.equal(teamSocialMatcher(sample).match({ kind: 'link', value }).status, 'hole')
  const { match } = teamSocialMatcher(`network|${value}\rbad line\nnetwork|`)
  assert.equal(match({ kind: 'link', value }).status, 'matched', 'malformed sibling lines add no URL')
  assert.deepEqual(match({ kind: 'link', value: 'https://music.apple.com/' }).slots, ['article-2.store'])
  assert.equal(match({ kind: 'text', value: 'Advanced Boxing' }).status, 'matched')
})

function generatedReceiverFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'cov-generated-'))
  const put = (file, body) => {
    const target = path.join(root, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, body)
  }
  const base = 'templates/ja_kinetic/html/com_content/'
  const files = {
    [base + 'article/default.php']: `<?php
function kinetic_readtime($html) { $words = str_word_count(strip_tags((string) $html)); return max(1, (int) ceil($words / 200)); }
$readmins = kinetic_readtime(($this->item->introtext ?? '') . ' ' . ($this->item->fulltext ?? ''));
?><span class="hx-author__meta"><?php $hxMeta = []; if ($authorRole !== '') $hxMeta[] = $this->escape($authorRole);
$hxMeta[] = HTMLHelper::_('date', $this->item->created, Text::_('DATE_FORMAT_LC3'));
$hxMeta[] = Text::sprintf('TPL_JA_KINETIC_BLOG_READMIN', $readmins); echo implode(' · ', $hxMeta); ?></span>
<?php echo $this->loadTemplate('related'); ?>`,
    [base + 'article/default_related.php']: `<?php
$rmin = kinetic_readtime(($rel->introtext ?? '') . ' ' . ($rel->fulltext ?? ''));
?><a class="hx-related__card" href="<?php echo $link; ?>"><span class="hx-related__m"><?php echo HTMLHelper::_('date', $rel->created, Text::_('DATE_FORMAT_LC3')) . ' · ' . Text::sprintf('TPL_JA_KINETIC_BLOG_READMIN', $rmin); ?></span></a>`,
    [base + 'author/author_info.php']:
      `<?php ?><div class="hx-auaside__meta"><?php if ($haRole !== '') : ?><span class="hx-auaside__role"><?php echo $this->escape($haRole); ?></span> &middot; <?php endif; ?><span class="hx-auaside__c"><?php echo Text::plural('TPL_JA_KINETIC_N_ARTICLES', (int) $haCount); ?></span></div>`,
    [base + 'category/blog.php']:
      `<?php $hxTotal = (int) (!empty($this->pagination->total) ? $this->pagination->total : count($rows)); ?><span class="hx-bloglist__count">// <?php echo str_pad((string) $hxTotal, 2, '0', STR_PAD_LEFT); ?> <?php echo Text::_('TPL_JA_KINETIC_BLOG_POSTS_NEWEST'); ?></span>`,
    [base + 'category/blog_item.php']:
      `<?php $dateField = $params->get('show_create_date', 1) ? $item->created : ($item->publish_up ?? $item->created); ?>
<time class="hx-blogdate"><span class="hx-blogdate__d"><?php echo HTMLHelper::_('date', $dateField, 'd'); ?></span><span class="hx-blogdate__m"><?php echo HTMLHelper::_('date', $dateField, 'M'); ?></span></time>
<div class="hx-blogmeta"><span class="hx-blogauthor"><?php echo $this->escape($author); ?></span><span class="hx-blogdatetxt"><?php echo HTMLHelper::_('date', $dateField, Text::_('DATE_FORMAT_LC3')); ?></span><span class="hx-blogread"><?php echo Text::sprintf('TPL_JA_KINETIC_BLOG_READMIN_SHORT', $readmins); ?></span></div>`,
    'language/en-GB/en-GB.tpl_ja_kinetic.ini':
      'TPL_JA_KINETIC_BLOG_READMIN="%d min read"\nTPL_JA_KINETIC_BLOG_READMIN_SHORT="%d min"\nTPL_JA_KINETIC_N_ARTICLES="%d articles"\nTPL_JA_KINETIC_N_ARTICLES_1="%d article"\nTPL_JA_KINETIC_BLOG_POSTS_NEWEST="posts &middot; newest first"',
    'language/en-GB/joomla.ini':
      'DATE_FORMAT_LC3="d F Y"\nJUNE_SHORT="Jun"\nJUNE="June"\nJGLOBAL_PASSWORD="Password"',
    'libraries/src/Date/Date.php': `<?php $return = str_replace(self::MONTH_ABBR, $this->monthToString(parent::format('n'), true), $return); $return = str_replace(self::MONTH_NAME, $this->monthToString(parent::format('n')), $return); function monthToString($month, $abbr = false) { switch ($month) { case 6: return $abbr ? Text::_('JUNE_SHORT') : Text::_('JUNE'); } }`,
    'components/com_users/forms/login.xml':
      '<form><field name="username" type="text" label="COM_USERS_LOGIN_USERNAME_LABEL" required="true"/><field name="password" type="password" label="JGLOBAL_PASSWORD" required="true"/></form>',
    'components/com_users/forms/registration.xml':
      '<form><field name="name" type="text" label="COM_USERS_REGISTER_NAME_LABEL" required="true"/><field name="password1" type="password" label="COM_USERS_PROFILE_PASSWORD1_LABEL" required="true"/></form>',
    'libraries/src/Form/FormField.php': `<?php $title = $this->element['label'] ? (string) $this->element['label'] : (string) $this->element['name']; $title = $this->translateLabel ? Text::_($title) : $title; $extraData = ['text' => $data['label'], 'for' => $this->id]; return $this->getRenderer($this->renderLabelLayout)->render(array_merge($data, $extraData));`,
    'layouts/joomla/form/renderlabel.php': `<?php $id = $for . '-lbl'; ?><label id="<?php echo $id; ?>" for="<?php echo $for; ?>"><?php echo $text; ?><?php if ($required) : ?><span class="star" aria-hidden="true">&#160;*</span><?php endif; ?></label>`,
    'language/en-GB/com_users.ini':
      'COM_USERS_LOGIN_USERNAME_LABEL="Username"\nCOM_USERS_REGISTER_NAME_LABEL="Name"\nCOM_USERS_PROFILE_PASSWORD1_LABEL="Password"'
  }
  for (const [file, body] of Object.entries(files)) put(file, body)
  const contract = loadContract(
    contractDir([{ key: 'module-90.role', type: 'text', sample: 'Editor' }]),
    SITE
  )
  contract.template = 'ja_kinetic'
  const create = () => createClassifier(contract, null, buildSourceIndex(root, contract.template))
  const item = (value, selector, extra = {}) => ({
    kind: 'text',
    tag: 'span',
    value,
    selector,
    viewports: { desktop: { count: 1, selector }, phone: { count: 1, selector } },
    ...extra
  })
  return { root, create, item, put, files, base, contract }
}

test('generated receivers: durations/counts preserve template language origin and covered role/date siblings', () => {
  const f = generatedReceiverFixture(),
    c = f.create()
  for (const [value, selector] of [
    [
      'Editor · 18 June 2026 · 2 min read',
      'div.hx-author > div.hx-author__c > span.hx-author__meta:nth-of-type(2)'
    ],
    ['Editor · 3 articles', 'div.hx-auaside > div.hx-auaside__nm > div.hx-auaside__meta'],
    ['1 article', 'div.hx-auaside > div.hx-auaside__nm > div.hx-auaside__meta'],
    ['// 03 posts · newest first', 'div.hx-bloglist > div.hx-bloglist__head > span.hx-bloglist__count']
  ]) {
    const result = c(f.item(value, selector), {})
    assert.equal(result.class, 'b')
    assert.match(result.label, /source-bound/)
  }
  for (const [value, selector] of [
    ['Unowned claim · 2 min read', 'span.hx-author__meta'],
    ['Editor · 2 min read · Unowned claim', 'span.hx-author__meta'],
    ['Unowned role · 3 articles', 'div.hx-auaside__meta'],
    ['Editor · 1 articles', 'div.hx-auaside__meta'],
    ['// 3 posts · newest first', 'span.hx-bloglist__count'],
    ['// 03 posts · newest first Unowned claim', 'span.hx-bloglist__count']
  ])
    assert.doesNotMatch(c(f.item(value, selector), { remainder: '2 min read' }).label, /source-bound/)
})

test('generated receivers: exact localized day/month and full metadata formulas require their source', () => {
  const f = generatedReceiverFixture(),
    c = f.create()
  const day = f.item('18 Jun', 'a.hx-blogrow > time.hx-blogdate', { tag: 'time' })
  assert.equal(c(day, {}).class, 'c')
  assert.match(c(day, {}).label, /source-bound/)
  const meta = f.item('Editor 18 June 2026 2 min', 'a.hx-blogrow > div.hx-blogmeta', { tag: 'div' })
  assert.equal(c(meta, { remainder: '18 june' }).class, 'b', 'template duration remains template origin')
  assert.match(c(meta, { remainder: '18 june' }).label, /source-bound/)
  for (const value of ['18 June', '32 Jun', '18 Jun claim'])
    assert.notEqual(c({ ...day, value }, {}).class, 'c')
  for (const value of ['Unowned 18 June 2026 2 min', 'Editor 18 June 2026 2 min Unowned'])
    assert.doesNotMatch(c({ ...meta, value }, { remainder: '18 june' }).label, /source-bound/)
  f.put('language/overrides/en-GB.override.ini', 'JUNE_SHORT="Jun"')
  assert.equal(f.create()(day, {}).class, 'b', 'effective override origin survives')
  f.put('language/fr-FR/joomla.ini', 'JUNE_SHORT="Juin"')
  f.put('language/overrides/en-GB.override.ini', '')
  assert.notEqual(f.create()(day, {}).class, 'c', 'conflicting effective source languages refuse')
})

test('generated receivers: required labels bind exact form/page, XML, renderlabel and effective language', () => {
  const f = generatedReceiverFixture(),
    c = f.create()
  const login = { url: SITE + '?option=com_users&view=login' }
  const registration = { url: SITE + '?option=com_users&view=registration' }
  for (const [value, selector, context] of [
    ['Username *', '#username-lbl', login],
    ['Password\u00a0*', '#password-lbl', login],
    ['Name *', '#jform_name-lbl', registration],
    ['Password *', '#jform_password1-lbl', registration]
  ]) {
    const result = c(f.item(value, selector, { tag: 'label' }), {}, context)
    assert.equal(result.class, 'c')
    assert.match(result.label, /source-bound/)
  }
  const label = f.item('Password *', '#password-lbl', { tag: 'label' })
  for (const context of [{}, registration, { url: SITE + '?option=com_example&view=login' }])
    assert.notEqual(c(label, {}, context).class, 'c')
  f.put('language/overrides/en-GB.override.ini', 'JGLOBAL_PASSWORD="Password"')
  assert.equal(f.create()(label, {}, login).class, 'b')
  f.put('language/overrides/en-GB.override.ini', 'JGLOBAL_PASSWORD="Secret phrase"')
  assert.notEqual(f.create()(label, {}, login).class, 'c')
})

test('generated receivers: every viewport/count/selector/code and cache order is guarded', () => {
  const f = generatedReceiverFixture()
  const valid = f.item('18 Jun', 'a.hx-blogrow > time.hx-blogdate', { tag: 'time' })
  const invalid = [
    { ...valid, inCode: true },
    { ...valid, codeText: '18 Jun' },
    { ...valid, tag: 'div' },
    { ...valid, selector: valid.selector + ' > span.extra', viewports: {} },
    { ...valid, viewports: { desktop: { count: 1 } } },
    { ...valid, selector: 'time.hx-blogdate-business', viewports: {} },
    { ...valid, viewports: { desktop: { count: 2, selector: valid.selector } } },
    {
      ...valid,
      viewports: {
        desktop: { count: 1, selector: valid.selector },
        phone: { count: 1, selector: 'div.business' }
      }
    }
  ]
  for (const reverse of [false, true]) {
    const c = f.create(),
      entries = [[valid, 'c'], ...invalid.map((i) => [i, 'not-c'])]
    if (reverse) entries.reverse()
    for (const [item, expected] of entries) {
      const result = c(item, {})
      if (expected === 'c') assert.equal(result.class, 'c')
      else assert.notEqual(result.class, 'c')
    }
  }
})

test('generated receivers: comments, wrong producers and unseen source do not prove generation', () => {
  const f = generatedReceiverFixture(),
    date = f.item('18 Jun', 'time.hx-blogdate', { tag: 'time' })
  const file = f.base + 'category/blog_item.php'
  for (const body of [
    '',
    '<?php /* ' + f.files[file] + ' */',
    '<?php\n# $dateField = $item->created; $item->publish_up; class="hx-blogdate__d" class="hx-blogdate__m"\n# HTMLHelper::_("date", $dateField, "d"); HTMLHelper::_("date", $dateField, "M");'
  ]) {
    f.put(file, body)
    assert.notEqual(f.create()(date, {}).class, 'c')
  }
  f.put(file, f.files[file].replace("$dateField, 'M'", "$otherField, 'M'"))
  assert.notEqual(f.create()(date, {}).class, 'c')
  f.put(file, f.files[file])
  f.put('libraries/src/Date/Date.php', '<?php // monthToString JUNE_SHORT')
  assert.notEqual(f.create()(date, {}).class, 'c')
  const duration = f.item('2 min read', 'span.hx-author__meta')
  f.put(f.base + 'article/default.php', '<?php /* ' + f.files[f.base + 'article/default.php'] + ' */')
  assert.doesNotMatch(f.create()(duration, {}).label, /source-bound/)
})

test('generated receivers: annotate forwards page context transiently without changing occurrence records', () => {
  const f = generatedReceiverFixture(),
    context = { url: SITE + '?option=com_users&view=login' }
  const label = f.item('Password *', '#password-lbl', { tag: 'label' })
  const views = JSON.stringify(label.viewports)
  const items = annotate([label], () => ({ status: 'hole' }), f.create(), context)
  assert.equal(items[0].class, 'c')
  assert.equal(JSON.stringify(items[0].viewports), views)
  assert.equal(Object.hasOwn(items[0], 'url'), false)
  assert.equal(Object.hasOwn(items[0], 'context'), false)
  const absent = f.item('Password *', '#password-lbl', { tag: 'label' })
  assert.notEqual(annotate([absent], () => ({ status: 'hole' }), f.create())[0].class, 'c')
})

test('generated receivers: producer token guards keep markup and quoted URLs but remove real comments', () => {
  const f = generatedReceiverFixture()
  const file = 'templates/ja_kinetic/producer.php'
  // The source index itself is the production path; no synthetic normalized-only source index is substituted.
  f.put(
    file,
    `<?php $url = 'https://example.test/path'; /* ?> ignored_producer */ ?>// visible_count &#160;* <?php # hidden_producer\n $alive = 'yes'; ?>`
  )
  const index = buildSourceIndex(f.root, 'ja_kinetic')
  assert.equal(
    receiverProducer(index, file, /https:\/\/example\.test\/path/, /visible_count/, /&#160;\*/, /\$alive/),
    true
  )
  assert.equal(receiverProducer(index, file, /ignored_producer/), false)
  assert.equal(receiverProducer(index, file, /hidden_producer/), false)
  const js = 'media/vendor/widget/widget.js'
  f.put(js, 'const path=/\\//g; const receiver="real_receiver"; // fake_receiver')
  const source = buildSourceIndex(f.root, 'ja_kinetic')
  assert.equal(receiverProducer(source, js, /real_receiver/), true, 'pre-unescape source keeps regex slashes')
  assert.equal(receiverProducer(source, js, /fake_receiver/), false)
})

test('generated receivers: wrong category formula, template label origin and untouched cohorts remain guarded', () => {
  const f = generatedReceiverFixture()
  const file = f.base + 'category/blog.php'
  const count = f.item('// 03 posts · newest first', 'span.hx-bloglist__count')
  f.put(file, f.files[file].replace('count($rows)', 'count($unrelated)'))
  assert.doesNotMatch(f.create()(count, {}).label, /source-bound/)
  f.put('templates/ja_kinetic/language/en-GB/tpl_ja_kinetic.ini', 'COM_USERS_REGISTER_NAME_LABEL="Name"')
  const label = f.item('Name *', '#jform_name-lbl', { tag: 'label' })
  assert.equal(f.create()(label, {}, { url: SITE + '?option=com_users&view=registration' }).class, 'b')
  const c = f.create()
  for (const item of [
    f.item('network', 'a.hx-team-social-link', {
      kind: 'attr',
      attr: 'aria-label',
      viewports: { desktop: { count: 3, selector: 'a.hx-team-social-link' } }
    }),
    f.item('Unbound article excerpt...', 'span.hxcat-row__excerpt')
  ])
    assert.notEqual(c(item, {}).class, 'c')
})

test('generated receivers: month format M cannot be proved by the numeric-month m producer', () => {
  const f = generatedReceiverFixture()
  const file = f.base + 'category/blog_item.php'
  const value = f.item('18 Jun', 'a.hx-blogrow > time.hx-blogdate', { tag: 'time' })
  assert.equal(f.create()(value, {}).class, 'c', 'named-month producer is proved')
  f.put(file, f.files[file].replace("$dateField, 'M'", "$dateField, 'm'"))
  assert.notEqual(
    f.create()(value, {}).class,
    'c',
    'same receiver/value/language with numeric format remains unproved'
  )
  const source = buildSourceIndex(f.root, 'ja_kinetic')
  assert.ok(
    source.files.find((s) => s.rel === file).code.includes("$dateField, 'm'"),
    'producer index retains exact source case'
  )
  f.put(file, f.files[file])
  f.put(file, f.files[file].replace("$dateField, 'd'", "$dateField, 'D'"))
  assert.notEqual(f.create()(value, {}).class, 'c', 'weekday format cannot prove day-of-month')
  f.put(file, f.files[file])
  const dateFile = 'libraries/src/Date/Date.php'
  f.put(dateFile, f.files[dateFile].replaceAll("format('n')", "format('N')"))
  assert.notEqual(f.create()(value, {}).class, 'c', 'weekday number cannot prove month number')
  f.put(dateFile, f.files[dateFile])
  f.put(file, '<?PHP /* ' + f.files[file] + ' */')
  assert.notEqual(f.create()(value, {}).class, 'c', 'case-insensitive PHP opener still strips comments')
  f.put(file, f.files[file])
  f.put('language/fr-FR/joomla.ini', 'DATE_FORMAT_LC3="d f Y"')
  const meta = f.item('Editor 18 June 2026 2 min', 'div.hx-blogmeta', { tag: 'div' })
  assert.doesNotMatch(
    f.create()(meta, {}).label,
    /source-bound/,
    'case-distinct effective date formats conflict'
  )
})

test('causal matching: Joomla truncation cleans internal ellipsis spaces without claiming short, wrong or ambiguous prose', () => {
  const sample = 'Grouping ... uses declared columns before choosing the final calculation for each row.'
  const slot = { key: 'article-8.intro', type: 'text', sample }
  const match = createMatcher(loadContract(contractDir([slot]), SITE), SITE)
  assert.deepEqual(match({ kind: 'text', value: 'Grouping... uses declared columns before...' }), {
    status: 'matched',
    by: 'Joomla truncated spacing',
    slots: ['article-8.intro']
  })
  for (const value of [
    'Grouping...',
    'Grouping... invents an unrelated claim...',
    'Unrelated grouping... uses columns...'
  ])
    assert.equal(match({ kind: 'text', value }).status, 'hole')
  const ambiguous = createMatcher(
    loadContract(
      contractDir([
        slot,
        {
          ...slot,
          key: 'article-9.intro',
          sample: 'Grouping ... uses declared columns before discarding every result.'
        }
      ]),
      SITE
    ),
    SITE
  )
  assert.equal(
    ambiguous({ kind: 'text', value: 'Grouping... uses declared columns before...' }).status,
    'hole'
  )
  assert.equal(
    match({
      kind: 'text',
      value: 'Grouping... uses declared columns before...',
      codeText: 'Grouping... uses declared columns before...'
    }).status,
    'hole'
  )
  assert.equal(
    match({ kind: 'text', value: 'Grouping... uses declared columns before...', inCode: true }).status,
    'hole'
  )
})

test('causal receivers: repeated dates require a complete distinct source-bound receipt for every physical copy', () => {
  const f = generatedReceiverFixture()
  const raw = (row, extra = {}) => ({
    kind: 'text',
    tag: 'time',
    value: '18 Jun',
    selector: `a.hx-blogrow:nth-of-type(${row}) > time.hx-blogdate`,
    ...extra
  })
  const merge = (items) => mergeViewports({ desktop: { items }, phone: { items } }, SITE)[0]
  const good = merge([raw(1), raw(2), raw(3)])
  assert.equal(f.create()(good, {}).class, 'c')
  assert.equal(good.viewports.desktop.count, 3)
  assert.equal(good.viewports.desktop.receivers.length, 3)
  const bad = [
    merge([raw(1), raw(2, { selector: 'div.business' })]),
    merge([raw(1), raw(2, { tag: 'div' })]),
    merge([raw(1), raw(1)]),
    merge([raw(1), raw(2, { selector: null })])
  ]
  for (const change of [
    (v) => {
      v.count++
    },
    (v) => {
      v.receivers.pop()
    },
    (v) => {
      v.receivers[1].inCode = true
    },
    (v) => {
      delete v.receivers
    },
    (v) => {
      v.selector = 'div.foreign'
    }
  ]) {
    const item = structuredClone(good)
    change(item.viewports.phone)
    bad.push(item)
  }
  for (const reverse of [false, true]) {
    const classify = f.create()
    const cases = [[good, true], ...bad.map((item) => [item, false])]
    if (reverse) cases.reverse()
    for (const [item, expected] of cases) assert.equal(classify(item, {}).class === 'c', expected)
  }
})

test('causal matching: declared numeric printf pieces keep their owner inside a composite and leave foreign residue', () => {
  const slots = [
    { key: 'module-90.role', type: 'text', sample: 'Editor' },
    { key: 'languageString-10.0', type: 'text', sample: '%d min read' },
    { key: 'languageString-11.0', type: 'text', sample: '%d min' }
  ]
  const match = createMatcher(loadContract(contractDir(slots), SITE), SITE)
  const good = match({ kind: 'text', value: 'Editor · 4 min read' })
  assert.equal(good.status, 'matched')
  assert.deepEqual(new Set(good.slots), new Set(['module-90.role', 'languageString-10.0']))
  for (const value of [
    'Editor · many min read',
    'Editor · 4 min read · foreign promise 987',
    'Editor · 4 min readextra'
  ])
    assert.equal(match({ kind: 'text', value }).status, 'hole')
  const residue = match({ kind: 'text', value: 'Editor · 4 min read · foreign promise 987' })
  assert.match(residue.remainderParts.join(' '), /foreign promise 987/)
  const ambiguous = createMatcher(
    loadContract(contractDir([slots[0], slots[1], { ...slots[1], key: 'languageString-12.0' }]), SITE),
    SITE
  )
  assert.equal(ambiguous({ kind: 'text', value: 'Editor · 4 min read' }).status, 'hole')
  assert.equal(
    match({ kind: 'text', value: 'Editor · 4 min read', codeText: 'Editor · 4 min read' }).status,
    'hole'
  )
})

test('causal receivers: generated composites bind declared template language instead of waiving template holes', () => {
  const f = generatedReceiverFixture()
  const entries = [
    ['31', 'TPL_JA_KINETIC_BLOG_READMIN', '%d min read'],
    ['32', 'TPL_JA_KINETIC_BLOG_READMIN_SHORT', '%d min'],
    ['33', 'TPL_JA_KINETIC_BLOG_POSTS_NEWEST', 'posts · newest first']
  ]
  const dir = contractDir([
    { key: 'module-90.role', type: 'text', sample: 'Editor' },
    ...entries.map(([id, , sample]) => ({
      key: `languageString-${id}.0`,
      entity: `languageString-${id}`,
      column: 'value',
      type: 'text',
      sample
    }))
  ])
  const mapPath = path.join(dir, 'content-map.json')
  const map = JSON.parse(readFileSync(mapPath, 'utf8'))
  for (const [id, key] of entries)
    map.entities.push({
      key: `languageString-${id}`,
      kind: 'languageString',
      identity: { extension: 'tpl_ja_kinetic', language: 'en-GB', key }
    })
  writeFileSync(mapPath, JSON.stringify(map))
  const contract = loadContract(dir, SITE)
  contract.template = 'ja_kinetic'
  const run = (item) =>
    annotate(
      [item],
      createMatcher(contract, SITE),
      createClassifier(contract, null, buildSourceIndex(f.root, contract.template))
    )[0]
  const article = () => f.item('Editor · 18 June 2026 · 2 min read', 'span.hx-author__meta')
  const category = () => f.item('// 06 posts · newest first', 'span.hx-bloglist__count')
  const full = () => f.item('Editor 18 June 2026 2 min', 'div.hx-blogmeta', { tag: 'div' })
  for (const [item, owner] of [
    [article(), 'languageString-31.0'],
    [category(), 'languageString-33.0'],
    [full(), 'languageString-32.0']
  ]) {
    const result = run(item)
    assert.equal(result.status, 'matched')
    assert.ok(result.slots.includes(owner))
    assert.equal(result.class, undefined)
    assert.match(result.evidence.join(' '), /source-bound/)
  }
  for (const item of [
    f.item('Foreign promise · 18 June 2026 · 2 min read', 'span.hx-author__meta'),
    f.item('Editor · 18 June 2026 · 2 min read · 987 dollars', 'span.hx-author__meta'),
    f.item('Editor · 18 June 2026 · 2 min read', 'span.business'),
    { ...article(), inCode: true }
  ])
    assert.equal(run(item).status, 'hole')
  f.put(f.base + 'article/default.php', '<?php /* ' + f.files[f.base + 'article/default.php'] + ' */')
  assert.equal(run(article()).status, 'hole')
  f.put(f.base + 'article/default.php', f.files[f.base + 'article/default.php'])
  contract.entityByKey.get('languageString-31').identity.key = 'UNRELATED_KEY'
  assert.equal(
    run(article()).status,
    'hole',
    'same-word slot from another language key is not source ownership'
  )
  contract.entityByKey.get('languageString-31').identity.key = entries[0][1]
  contract.slotsByKey.get('languageString-31.0').sample = '%d unrelated words'
  assert.equal(run(article()).status, 'hole', 'stale or different slot text cannot own the effective format')
  const slot = contract.slotsByKey.get('languageString-33.0')
  const entity = contract.entityByKey.get('languageString-33')
  for (const [object, key, value] of [
    [slot, 'entity', 'missing-entity'],
    [slot, 'type', 'html'],
    [slot, 'column', 'title'],
    [slot, 'sample', 'posts · different promise'],
    [entity, 'kind', 'module'],
    [entity.identity, 'extension', 'tpl_other'],
    [entity.identity, 'key', 'UNRELATED_KEY'],
    [entity.identity, 'language', 'fr-FR']
  ]) {
    const previous = object[key]
    object[key] = value
    assert.equal(
      run(category()).status,
      'hole',
      `${key} must still identify the exact declared language owner`
    )
    object[key] = previous
  }
  const file = f.base + 'category/blog.php'
  for (const body of [
    '',
    '<?php /* ' + f.files[file] + ' */',
    f.files[file].replace('str_pad((string) $hxTotal, 2', 'str_pad((string) $hxTotal, 3'),
    f.files[file].replace('TPL_JA_KINETIC_BLOG_POSTS_NEWEST', 'UNRELATED_KEY')
  ]) {
    f.put(file, body)
    assert.equal(run(category()).status, 'hole', 'equivalent scalar text cannot replace its producer formula')
  }
  f.put(file, f.files[file])
  const incomplete = category()
  incomplete.viewports.phone.count = 2
  const foreign = category()
  foreign.viewports.phone.selector = 'span.business'
  for (const item of [
    incomplete,
    foreign,
    { ...category(), inCode: true },
    { ...category(), codeText: '// 06 posts · newest first' }
  ])
    assert.equal(run(item).status, 'hole', 'scalar equivalence cannot supply missing copies or prove CODE')
  const duplicateMap = JSON.parse(readFileSync(mapPath, 'utf8'))
  duplicateMap.slots.push({ ...slot, key: 'languageString-34.0', entity: 'languageString-34' })
  duplicateMap.entities.push({ ...entity, key: 'languageString-34' })
  writeFileSync(mapPath, JSON.stringify(duplicateMap))
  const duplicate = loadContract(dir, SITE)
  duplicate.template = 'ja_kinetic'
  const duplicateClassifier = createClassifier(duplicate, null, buildSourceIndex(f.root, duplicate.template))
  assert.equal(annotate([category()], createMatcher(duplicate, SITE), duplicateClassifier)[0].status, 'hole')
  assert.notEqual(
    duplicateClassifier(category(), { slots: ['languageString-33.0', 'languageString-34.0'] }).status,
    'matched',
    'two declared owners with the same identity and scalar remain ambiguous'
  )
})

function breadcrumbReceiverFixture() {
  const f = generatedReceiverFixture()
  const entries = [
    ['61', 'TPL_JA_KINETIC_BLOG_KICKER_CAP', 'Journal'],
    ['62', 'TPL_JA_KINETIC_ARCHIVE_CRUMB', 'Archive'],
    ['63', 'TPL_JA_KINETIC_AUTHORS_CRUMB', 'Authors'],
    ['64', 'TPL_JA_KINETIC_TAGS_CRUMB', 'Topics']
  ]
  const dir = contractDir([
    ...entries.map(([id, , sample]) => ({
      key: `languageString-${id}.0`,
      entity: `languageString-${id}`,
      column: 'value',
      type: 'text',
      sample
    })),
    {
      key: 'user-61.0',
      entity: 'user-61',
      column: 'name',
      type: 'text',
      role: 'person.name',
      sample: 'Casey Rowan'
    },
    { key: 'tag-71.0', entity: 'tag-71', column: 'title', type: 'text', sample: 'Platform Reliability' },
    ...['Journal', 'Archive', 'Authors', 'Topics', 'Casey Rowan', 'Platform Reliability'].map(
      (sample, i) => ({
        key: `module-90.foreign-${i}`,
        entity: 'module-90',
        column: 'params',
        type: 'text',
        sample
      })
    )
  ])
  const mapPath = path.join(dir, 'content-map.json')
  const map = JSON.parse(readFileSync(mapPath, 'utf8'))
  map.entities.push(
    ...entries.map(([id, key]) => ({
      key: `languageString-${id}`,
      kind: 'languageString',
      identity: { extension: 'tpl_ja_kinetic', language: 'en-GB', key }
    })),
    { key: 'user-61', kind: 'user', sourceId: 61, identity: { username: 'casey-test' } },
    { key: 'tag-71', kind: 'tag', sourceId: 71, identity: { alias: 'platform-test' } },
    ...[81, 82, 83].map((id) => ({ key: `menu-${id}`, kind: 'menuItem', sourceId: id }))
  )
  map.pages = [
    { entity: 'menu-81', route: 'archive', link: 'index.php?option=com_content&view=archive' },
    { entity: 'menu-82', route: 'people', link: 'index.php?option=com_content&view=author&layout=list' },
    { entity: 'menu-83', route: 'topics', link: 'index.php?option=com_tags&view=tags' }
  ]
  writeFileSync(mapPath, JSON.stringify(map))
  const contract = loadContract(dir, SITE)
  contract.template = 'ja_kinetic'
  const files = {
    [f.base + 'archive/default.php']:
      `<?php ?><span class="hx-bc-tail">/ <?php echo Text::_('TPL_JA_KINETIC_BLOG_KICKER_CAP'); ?> / <?php echo Text::_('TPL_JA_KINETIC_ARCHIVE_CRUMB'); ?></span>`,
    [f.base + 'author/author.php']:
      `<?php $author = $this->author; ?><span class="hx-author__bc-trail">/ <a class="hx-author__bc-link" href="<?php echo $authorsUrl; ?>"><?php echo Text::_('TPL_JA_KINETIC_AUTHORS_CRUMB'); ?></a> / <?php echo $this->escape($author->name); ?></span>`,
    'templates/ja_kinetic/html/com_tags/tag/default.php': `<?php $tagTitleHtml = HTMLHelper::_('content.prepare', $this->tags_title, '', 'com_tags.tag'); $hxTagName = trim(strip_tags((string) $tagTitleHtml)); ?><span class="hx-author__bc-trail" style="color:var(--muted);">/ <a class="hx-author__bc-link" href="<?php echo $hxTagsUrl; ?>" style="color:var(--muted);"><?php echo Text::_('TPL_JA_KINETIC_TAGS_CRUMB'); ?></a> / <?php echo $this->escape($hxTagName); ?></span>`,
    'plugins/system/t4/src/t4/MVC/Router/T4.php': `<?php if(preg_match("/\\/author\\/(.*?)(\\/|\\?|\\&|$)/", $uri->toString(array('path', 'query', 'fragment')), $matches)) { $uid = intval($this->getUserId($matches[1])); $vars['option'] = 'com_content'; $vars['view'] = 'author'; $vars['layout'] = 'author'; $vars['id'] = $uid; } function getUserId($username = '') { $q->from('#__users')->where('username = '. $this->db->quote($username)); }`,
    'components/com_tags/src/Service/Router.php': `<?php $slug = $this->fixSegment($id); $ids[] = $slug; $vars['id'] = $ids; $vars['view'] = 'tag'; function fixSegment($segment) { $alias = str_replace(':', '-', $segment); $query->from('#__tags')->where($this->db->quoteName('alias') . ' = :alias')->bind(':alias', $alias); }`
  }
  f.put(
    'language/en-GB/en-GB.tpl_ja_kinetic.ini',
    entries.map(([, key, value]) => `${key}="${value}"`).join('\n')
  )
  for (const [file, body] of Object.entries(files)) f.put(file, body)
  const selectors = {
    archive: 'nav.hx-archmast__bc > span.hx-bc-tail',
    author: 'nav.hx-author__bc > span.hx-author__bc-trail',
    tag: 'nav.hx-author__bc.kinetic-tags-bc > span.hx-author__bc-trail'
  }
  const values = {
    archive: '/ Journal / Archive',
    author: '/ Authors / Casey Rowan',
    tag: '/ Topics / Platform Reliability'
  }
  const urls = {
    archive: `${SITE}index.php?Itemid=81`,
    author: `${SITE}index.php?option=com_content&view=author&layout=author&id=61`,
    tag: `${SITE}index.php?option=com_tags&view=tag&id=71`
  }
  const item = (kind) => {
    const raw = { kind: 'text', tag: 'span', value: values[kind], selector: selectors[kind] }
    return mergeViewports({ desktop: { items: [raw] }, phone: { items: [raw] } }, SITE)[0]
  }
  const run = (it, url) =>
    annotate(
      [it],
      createMatcher(contract, SITE),
      createClassifier(contract, null, buildSourceIndex(f.root, contract.template)),
      { url }
    )[0]
  return { ...f, contract, mapPath, entries, files, selectors, values, urls, item, run }
}

function stockTagBreadcrumbFixture() {
  const f = breadcrumbReceiverFixture()
  f.contract.entityByKey.get('tag-71').identity = { path: 'platform-test', language: '*' }
  const router = 'components/com_tags/src/Service/Router.php'
  const table = 'administrator/components/com_tags/src/Table/TagTable.php'
  const nested = 'libraries/src/Table/Nested.php'
  const files = {
    [router]: f.files[router].replace("->from('#__tags')", "->from($this->db->quoteName('#__tags'))"),
    [table]: `<?php class TagTable extends Nested implements CurrentUserInterface { public function __construct($db) { parent::__construct('#__tags', 'id', $db, $dispatcher); } }`,
    [nested]: `<?php function rebuildPath($pk = null) {
      $query = $db->createQuery()
        ->select('p.alias')
        ->from($this->_tbl . ' AS n, ' . $this->_tbl . ' AS p')
        ->where('n.lft BETWEEN p.lft AND p.rgt')
        ->where('n.' . $this->_tbl_key . ' = ' . (int) $pk)
        ->order('p.lft');
      $db->setQuery($query);
      $segments = $db->loadColumn();
      if (!empty($segments) && $segments[0] === 'root') { array_shift($segments); }
      $path = trim(implode('/', $segments), ' /\\\\');
      $query->clear()->update($this->_tbl)
        ->set('path = ' . $db->quote($path))
        ->where($this->_tbl_key . ' = ' . (int) $pk);
      $db->setQuery($query)->execute();
    }`
  }
  for (const [file, body] of Object.entries(files)) f.put(file, body)
  return { ...f, stockFiles: files, router, table, nested, url: `${SITE}index.php/topics/platform-test` }
}

test('stock tag breadcrumbs: quoted router and single-segment stock path bind the declared title', () => {
  const f = stockTagBreadcrumbFixture()
  for (const identity of [
    { path: 'platform-test', language: '*' },
    { alias: 'platform-test' },
    { alias: 'platform-test', path: 'platform-test', language: '*' }
  ]) {
    f.contract.entityByKey.get('tag-71').identity = identity
    const result = f.run(f.item('tag'), f.url)
    assert.equal(result.status, 'matched', JSON.stringify(identity))
    assert.deepEqual(result.slots, ['languageString-64.0', 'tag-71.0'])
  }
  f.put(f.router, f.files[f.router])
  assert.equal(
    f.run(f.item('tag'), f.url).status,
    'matched',
    'legacy literal table expression remains supported'
  )
})

test('stock tag breadcrumbs: conflicting, duplicate, nested and non-string identities refuse ownership', () => {
  const f = stockTagBreadcrumbFixture()
  const entity = f.contract.entityByKey.get('tag-71')
  for (const identity of [
    {},
    { path: null },
    { path: 71 },
    { path: ['platform-test'] },
    { path: 'parent/platform-test' },
    { alias: 'platform-test', path: 'parent/platform-test' },
    { alias: 'foreign', path: 'platform-test' },
    { alias: null, path: 'platform-test' },
    { alias: 'platform-test', path: null }
  ]) {
    entity.identity = identity
    assert.notEqual(f.run(f.item('tag'), f.url).status, 'matched', JSON.stringify(identity))
  }
  for (const numeric of ['71', '7.1', '.71', '71.', '7e1', '+71', ' 71 ']) {
    entity.identity = { path: numeric, language: '*' }
    assert.notEqual(
      f.run(f.item('tag'), `${SITE}index.php/topics/${encodeURIComponent(numeric)}`).status,
      'matched',
      'the stock router consumes numeric segments before alias lookup'
    )
  }
  entity.identity = { path: 'platform-test', language: '*' }
  f.contract.entityByKey.set('tag-72', {
    key: 'tag-72',
    kind: 'tag',
    sourceId: 72,
    identity: { path: 'platform-test', language: '*' }
  })
  assert.notEqual(
    f.run(f.item('tag'), f.url).status,
    'matched',
    'duplicate path never selects the first owner'
  )
  f.contract.entityByKey.get('tag-72').identity = { alias: 'platform-test' }
  assert.notEqual(f.run(f.item('tag'), f.url).status, 'matched', 'path and alias owners remain ambiguous')
  f.contract.entityByKey.get('tag-72').identity = { path: 'platform-test', alias: 'foreign' }
  assert.notEqual(
    f.run(f.item('tag'), f.url).status,
    'matched',
    'a conflicting duplicate identity cannot be discarded to make the first owner unique'
  )
})

test('stock tag breadcrumbs: connected path producer, route and every raw copy remain mandatory', () => {
  const f = stockTagBreadcrumbFixture()
  assert.equal(f.run(f.item('tag'), f.url).status, 'matched', 'positive production seam before refusals')
  for (const [file, altered] of [
    [f.router, (s) => s.replace("quoteName('#__tags')", "quoteName('#__foreign')")],
    [f.router, (s) => s.replace("quoteName('alias')", "quoteName('title')")],
    [f.table, (s) => s.replace('extends Nested', 'extends Foreign')],
    [f.table, (s) => s.replace("'#__tags'", "'#__foreign'")],
    [f.nested, (s) => s.replace("select('p.alias')", "select('p.title')")],
    [f.nested, (s) => s.replace("->from($this->_tbl . ' AS n, ' . $this->_tbl . ' AS p')", '')],
    [f.nested, (s) => s.replace("' AS n, '", "' AS foreign, '")],
    [f.nested, (s) => s.replace("->where('n.lft BETWEEN p.lft AND p.rgt')", '')],
    [f.nested, (s) => s.replace('n.lft BETWEEN p.lft AND p.rgt', 'n.lft BETWEEN p.rgt AND p.lft')],
    [f.nested, (s) => s.replace("->where('n.' . $this->_tbl_key . ' = ' . (int) $pk)", '')],
    [f.nested, (s) => s.replace("'n.' . $this->_tbl_key", "'p.' . $this->_tbl_key")],
    [f.nested, (s) => s.replace('$db->setQuery($query);', '')],
    [f.nested, (s) => s.replace('$db->setQuery($query);', '$db->setQuery($foreign);')],
    [f.nested, (s) => s.replace('->update($this->_tbl)', '->update($foreign)')],
    [f.nested, (s) => s.replace("->where($this->_tbl_key . ' = ' . (int) $pk)", '')],
    [
      f.nested,
      (s) =>
        s.replace(
          "->where($this->_tbl_key . ' = ' . (int) $pk)",
          "->where($this->_tbl_key . ' = ' . (int) $foreign)"
        )
    ],
    [f.nested, (s) => s.replace('$db->setQuery($query)->execute()', '$db->setQuery($foreign)->execute()')],
    [f.nested, (s) => s.replace('array_shift($segments)', 'array_pop($segments)')],
    [f.nested, (s) => s.replace("implode('/', $segments)", "implode('-', $segments)")]
  ]) {
    for (const body of ['', `<?php /* ${f.stockFiles[file]} */`, altered(f.stockFiles[file])]) {
      f.put(file, body)
      assert.notEqual(f.run(f.item('tag'), f.url).status, 'matched', file)
    }
    f.put(file, f.stockFiles[file])
  }
  for (const url of [`${SITE}index.php/foreign/platform-test`, `${f.url}/extra`, `${f.url}?id=71`])
    assert.notEqual(f.run(f.item('tag'), url).status, 'matched', 'unknown or conflicting route')
  for (const change of [
    (it) => {
      delete it.viewports.phone
    },
    (it) => {
      delete it.viewports.phone.receivers
    },
    (it) => {
      it.viewports.phone.receivers[0].value += ' foreign'
    },
    (it) => {
      it.viewports.phone.receivers[0].selector = 'span.foreign'
    },
    (it) => {
      it.viewports.phone.receivers[0].inCode = true
    },
    (it) => {
      it.inCode = true
    },
    (it) => {
      it.codeText = it.value
    }
  ]) {
    const item = f.item('tag')
    change(item)
    assert.notEqual(f.run(item, f.url).status, 'matched', 'all raw copies, viewport and CODE guards')
  }
})

test('breadcrumb receivers: source formulas bind unique declared archive, public author and tag owners', () => {
  const f = breadcrumbReceiverFixture()
  for (const [kind, owners] of [
    ['archive', ['languageString-61.0', 'languageString-62.0']],
    ['author', ['languageString-63.0', 'user-61.0']],
    ['tag', ['languageString-64.0', 'tag-71.0']]
  ]) {
    const result = f.run(f.item(kind), f.urls[kind])
    assert.equal(result.status, 'matched', kind)
    assert.deepEqual(result.slots, owners)
    assert.match(result.evidence.join(' '), /source-bound .*breadcrumb/)
  }
  assert.equal(f.run(f.item('author'), `${SITE}index.php/people/author/casey-test`).status, 'matched')
  assert.equal(f.run(f.item('tag'), `${SITE}index.php/topics/platform-test`).status, 'matched')
})

test('breadcrumb receivers: absent raw copies, foreign selectors, mismatched bytes and CODE stay unproved', () => {
  const f = breadcrumbReceiverFixture()
  for (const change of [
    (it) => {
      delete it.viewports.phone
    },
    (it) => {
      delete it.viewports.phone.receivers
    },
    (it) => {
      it.viewports.phone.count++
    },
    (it) => {
      it.viewports.phone.receivers.push(it.viewports.phone.receivers[0])
      it.viewports.phone.count++
    },
    (it) => {
      it.viewports.phone.receivers[0].value += ' foreign'
    },
    (it) => {
      it.viewports.phone.receivers[0].value = it.value.toLowerCase()
    },
    (it) => {
      it.viewports.phone.receivers[0].selector = 'nav.foreign > span.hx-author__bc-trail'
      it.viewports.phone.selector = it.viewports.phone.receivers[0].selector
    },
    (it) => {
      it.viewports.phone.receivers[0].inCode = true
    },
    (it) => {
      it.inCode = true
    },
    (it) => {
      it.codeText = it.value
    },
    (it) => {
      it.attr = 'aria-label'
    }
  ]) {
    const it = f.item('author')
    change(it)
    assert.notEqual(f.run(it, f.urls.author).status, 'matched')
  }
})

test('breadcrumb receivers: route identity, unique real owner and connected formula cannot be borrowed', () => {
  const f = breadcrumbReceiverFixture()
  for (const kind of ['archive', 'tag'])
    assert.notEqual(f.run(f.item(kind), `${f.urls[kind]}&layout=foreign`).status, 'matched')
  for (const url of [
    undefined,
    `${SITE}index.php?option=com_users&view=author&id=61`,
    `${SITE}index.php?option=com_content&view=author&layout=list&id=61`,
    `${f.urls.author}&id=62`,
    `${f.urls.author}&u_id=62`,
    `${f.urls.author}&id[]=62`,
    `${SITE}index.php?option=com_content&view=author&layout=author&id=62`,
    `${SITE}foreign?option=com_content&view=author&layout=author&id=61`,
    `${SITE}index.php/foreign/author/casey-test`,
    `${SITE}index.php/people/author/unknown-test`
  ])
    assert.notEqual(f.run(f.item('author'), url).status, 'matched')
  for (const [target, field, value] of [
    [f.contract.slotsByKey.get('user-61.0'), 'column', 'username'],
    [f.contract.slotsByKey.get('user-61.0'), 'type', 'html'],
    [f.contract.slotsByKey.get('user-61.0'), 'role', 'editorial.paragraph'],
    [f.contract.slotsByKey.get('user-61.0'), 'nestedJson', 'foreign-config'],
    [f.contract.slotsByKey.get('user-61.0'), 'sample', 'A different person'],
    [f.contract.entityByKey.get('user-61'), 'kind', 'module'],
    [f.contract.entityByKey.get('languageString-63').identity, 'key', 'FOREIGN_KEY'],
    [f.contract.entityByKey.get('languageString-63').identity, 'language', 'fr-FR']
  ]) {
    const previous = target[field]
    target[field] = value
    assert.notEqual(f.run(f.item('author'), f.urls.author).status, 'matched', field)
    target[field] = previous
  }
  for (const [kind, file, changed] of [
    ['archive', f.base + 'archive/default.php', (s) => s.replace('ARCHIVE_CRUMB', 'FOREIGN_CRUMB')],
    ['author', f.base + 'author/author.php', (s) => s.replace('$author->name', '$author->username')],
    [
      'tag',
      'templates/ja_kinetic/html/com_tags/tag/default.php',
      (s) => s.replace("'com_tags.tag'", "'com_content.article'")
    ]
  ]) {
    for (const body of ['', '<?php /* ' + f.files[file] + ' */', changed(f.files[file])]) {
      f.put(file, body)
      assert.notEqual(f.run(f.item(kind), f.urls[kind]).status, 'matched')
    }
    f.put(file, f.files[file])
  }
  const owner = f.contract.slotsByKey.get('user-61.0')
  f.contract.slotsByKey.set('user-61.duplicate', { ...owner, key: 'user-61.duplicate' })
  assert.notEqual(f.run(f.item('author'), f.urls.author).status, 'matched', 'duplicate name address')
  f.contract.slotsByKey.delete('user-61.duplicate')
  const lang = f.contract.slotsByKey.get('languageString-63.0')
  f.contract.slotsByKey.set('languageString-63.duplicate', { ...lang, key: 'languageString-63.duplicate' })
  assert.notEqual(f.run(f.item('author'), f.urls.author).status, 'matched', 'duplicate language owner')
  f.contract.slotsByKey.get('languageString-63.duplicate').sample = 'A stale scalar'
  assert.notEqual(
    f.run(f.item('author'), f.urls.author).status,
    'matched',
    'stale duplicate identity is still ambiguous'
  )
  f.contract.slotsByKey.delete('languageString-63.duplicate')
  f.contract.entityByKey.set('user-62', {
    key: 'user-62',
    kind: 'user',
    sourceId: 61,
    identity: { username: 'other-test' }
  })
  assert.notEqual(f.run(f.item('author'), f.urls.author).status, 'matched', 'duplicate numeric identity')
  f.contract.entityByKey.get('user-62').sourceId = 62
  f.contract.entityByKey.get('user-62').identity.username = 'casey-test'
  assert.notEqual(
    f.run(f.item('author'), `${SITE}index.php/people/author/casey-test`).status,
    'matched',
    'duplicate route identity'
  )
  f.contract.entityByKey.delete('user-62')
  for (const [kind, file, url, changed] of [
    [
      'author',
      'plugins/system/t4/src/t4/MVC/Router/T4.php',
      `${SITE}index.php/people/author/casey-test`,
      (s) => s.replace('getUserId($matches[1])', 'getDifferentId($matches[1])')
    ],
    [
      'tag',
      'components/com_tags/src/Service/Router.php',
      `${SITE}index.php/topics/platform-test`,
      (s) => s.replace("quoteName('alias')", "quoteName('title')")
    ]
  ]) {
    f.put(file, changed(f.files[file]))
    assert.notEqual(f.run(f.item(kind), url).status, 'matched', 'route resolver source must agree')
    f.put(file, f.files[file])
  }
  f.contract.entityByKey.get('tag-71').identity.alias = '71'
  assert.notEqual(
    f.run(f.item('tag'), `${SITE}index.php/topics/71`).status,
    'matched',
    'numeric segment is not an alias lookup'
  )
  for (const link of [
    'http://[',
    'https://foreign.example.test/index.php?option=com_content&view=archive',
    'index.php?option=com_content&view=archive&view=author'
  ]) {
    f.contract.pages[0].link = link
    assert.notEqual(
      f.run(f.item('archive'), f.urls.archive).status,
      'matched',
      'invalid or foreign mapped route'
    )
  }
  const category = f.item('archive')
  category.selector = 'nav.hxcat-bc > span.hxcat-bc__rest'
  for (const v of Object.values(category.viewports)) {
    v.selector = category.selector
    v.receivers[0].selector = category.selector
  }
  assert.notEqual(
    f.run(category, f.urls.archive).status,
    'matched',
    'conditional category breadcrumb is outside this proof'
  )
})

function mixedMetadataFixture() {
  const f = generatedReceiverFixture()
  const dir = contractDir([
    {
      key: 'languageString-31.0',
      entity: 'languageString-31',
      column: 'value',
      type: 'text',
      sample: '%d min read'
    },
    { key: 'module-90.role', type: 'text', sample: 'Editor' }
  ])
  const file = path.join(dir, 'content-map.json')
  const map = JSON.parse(readFileSync(file, 'utf8'))
  map.entities.push({
    key: 'languageString-31',
    kind: 'languageString',
    identity: { extension: 'tpl_ja_kinetic', language: 'en-GB', key: 'TPL_JA_KINETIC_BLOG_READMIN' }
  })
  writeFileSync(file, JSON.stringify(map))
  const contract = loadContract(dir, SITE)
  contract.template = 'ja_kinetic'
  const author = 'div.hx-author > div.hx-author__c > span.hx-author__meta:nth-of-type(2)'
  const related = 'section.hx-related > a.hx-related__card > span.hx-related__m:nth-of-type(3)'
  const item = (value = '18 June 2026 · 2 min read', selectors = [author, related]) => {
    const items = selectors.map((selector) => ({ kind: 'text', tag: 'span', value, selector }))
    return mergeViewports({ desktop: { items }, phone: { items } }, SITE)[0]
  }
  const create = () => {
    const match = createMatcher(contract, SITE)
    const classify = createClassifier(contract, null, buildSourceIndex(f.root, contract.template))
    return (it) => annotate([it], match, classify)[0]
  }
  return { ...f, contract, author, related, item, create }
}

test('mixed metadata receivers: every author or related copy binds its own producer and declared language', () => {
  const f = mixedMetadataFixture(),
    run = f.create()
  for (const selectors of [[f.author, f.related], [f.related, f.author], [f.related]]) {
    const result = run(f.item(undefined, selectors))
    assert.equal(result.status, 'matched')
    assert.deepEqual(result.slots, ['languageString-31.0'])
    assert.equal(result.class, undefined)
    assert.match(result.evidence.join(' '), /article\/default_related\.php/)
    assert.match(result.evidence.join(' '), /article\/default\.php/)
  }
  assert.equal(run(f.item('Editor · 18 June 2026 · 2 min read', [f.author])).status, 'matched')
})

test('mixed metadata receivers: absent callers, source files and exact date/readtime formulas refuse', () => {
  const f = mixedMetadataFixture()
  const article = f.base + 'article/default.php'
  const related = f.base + 'article/default_related.php'
  const broken = [
    [article, f.files[article].replace("$this->loadTemplate('related')", "$this->loadTemplate('other')")],
    [article, f.files[article].replace('$words / 200', '$words / 100')],
    [article, f.files[article].replace('str_word_count', 'strlen')],
    [article, f.files[article].replace('$this->item->introtext', '$other->introtext')],
    [article, f.files[article].replace('$this->item->fulltext', '$other->fulltext')],
    [article, f.files[article].replace('$this->item->created', '$other->created')],
    [article, f.files[article].replace("BLOG_READMIN', $readmins", "BLOG_READMIN', $Readmins")],
    [related, ''],
    [related, '<?php /* ' + f.files[related] + ' */'],
    [related, f.files[related].replace('$rel->introtext', '$other->introtext')],
    [related, f.files[related].replace('$rel->fulltext', '$other->fulltext')],
    [related, f.files[related].replace('$rel->created', '$other->created')],
    [related, f.files[related].replace("'DATE_FORMAT_LC3'", "'OTHER_FORMAT'")],
    [related, f.files[related].replace("' · '", "' / '")],
    [related, f.files[related].replace("BLOG_READMIN', $rmin", "BLOG_READMIN', $readmins")],
    [related, f.files[related].replace("BLOG_READMIN', $rmin", "BLOG_READMIN', $RMIN")],
    [related, f.files[related].replace('hx-related__m', 'business-meta')]
  ]
  for (const [file, body] of broken) {
    f.put(file, body)
    const result = f.create()(f.item())
    assert.equal(result.status, 'hole', `${file} must not prove a changed producer`)
    assert.doesNotMatch((result.evidence ?? []).join(' '), /source-bound/)
    f.put(file, f.files[file])
  }
})

test('mixed metadata receivers: all copies require exact raw strings, distinct selectors and non-CODE provenance', () => {
  const f = mixedMetadataFixture()
  const invalid = []
  for (const value of [undefined, null, '18 June 2026  ·  2 min read', '18 June 2026 · 3 min read']) {
    const it = f.item()
    it.viewports.phone.receivers[1].value = value
    invalid.push(it)
  }
  for (const change of [
    (it) => {
      it.viewports.phone.receivers[1].selector = 'div.business > span.hx-related__m'
    },
    (it) => {
      it.viewports.phone.receivers[1].selector = f.author
    },
    (it) => {
      it.viewports.phone.receivers[1].inCode = true
    },
    (it) => {
      it.viewports.phone.receivers[1].tag = 'code'
    },
    (it) => {
      it.viewports.phone.count = 3
    },
    (it) => {
      delete it.viewports.phone.receivers
    },
    (it) => {
      it.inCode = true
    },
    (it) => {
      it.codeText = it.value
    },
    (it) => {
      it.tag = 'div'
      for (const v of Object.values(it.viewports)) for (const c of v.receivers) c.tag = 'div'
    },
    (it) => {
      it.attr = 'title'
      for (const v of Object.values(it.viewports)) for (const c of v.receivers) c.attr = 'title'
    }
  ]) {
    const it = f.item()
    change(it)
    invalid.push(it)
  }
  for (const reverse of [false, true]) {
    const entries = [[f.item(), 'matched'], ...invalid.map((it) => [it, 'hole'])]
    if (reverse) entries.reverse()
    const run = f.create()
    for (const [it, status] of entries) assert.equal(run(structuredClone(it)).status, status)
  }
})

test('mixed metadata receivers: related date/duration accepts no foreign prefix or stale language owner', () => {
  const f = mixedMetadataFixture(),
    run = f.create()
  for (const value of [
    'Editor · 18 June 2026 · 2 min read',
    'Foreign claim · 18 June 2026 · 2 min read',
    '18 June 2026 · 2 min read · Foreign claim',
    '31 June 2026 · 2 min read',
    '18 June 2026 · 0 min read',
    '18 June 2026 · 02 min read'
  ])
    assert.equal(run(f.item(value)).status, 'hole', value)
  assert.equal(run(f.item('2 min read')).status, 'matched', 'ordinary printf matching is unchanged')
  assert.notEqual(
    createClassifier(
      f.contract,
      null,
      buildSourceIndex(f.root, f.contract.template)
    )(f.item('2 min read'), { slots: ['languageString-31.0'] }).status,
    'matched',
    'a related producer cannot prove a date-less composite'
  )
  f.contract.entityByKey.get('languageString-31').identity.key = 'UNRELATED_KEY'
  assert.equal(f.create()(f.item()).status, 'hole')
})

function teamAriaFixture(extra = {}, module = 'mod_ja_acm', additional = []) {
  const f = generatedReceiverFixture()
  const social = teamSocialMatcher(
    'Network-One|https://one.example.test/a\nnetwork-one|https://two.example.test/b\nnetwork-one|https://three.example.test/c',
    extra,
    module
  )
  if (additional.length) {
    const map = JSON.parse(readFileSync(social.mapFile, 'utf8'))
    const original = map.slots.find((s) => s.key === 'module-90.socials')
    map.slots.push(...additional.map((s) => ({ ...original, ...s })))
    writeFileSync(social.mapFile, JSON.stringify(map))
    social.contract = loadContract(path.dirname(social.mapFile), SITE)
    social.match = createMatcher(social.contract, SITE)
  }
  social.contract.template = 'ja_kinetic'
  const file = 'templates/ja_kinetic/acm/teams/tmpl/style-1.php'
  const source = `<?php $count = (int) $helper->getRows('name'); ?>
<div class="hx-cols"><?php for ($i = 0; $i < $count; $i++) :
$socials = array();
foreach (preg_split('/\\r\\n|\\r|\\n/', (string) $helper->get('socials', $i)) as $line) {
  $line = trim($line); if ($line === '') { continue; }
  $parts = array_map('trim', explode('|', $line, 2));
  $url = isset($parts[1]) ? $parts[1] : '';
  if ($url === '') { continue; }
  $socials[] = array('net' => strtolower($parts[0]), 'url' => $url);
} ?><div class="hx-card hx-team-card"><div class="hx-team-social"><?php foreach ($socials as $s) : ?>
<a class="hx-team-social-link" href="<?php echo htmlspecialchars($s['url'], ENT_QUOTES, 'UTF-8'); ?>" aria-label="<?php echo htmlspecialchars($s['net'] !== '' ? $s['net'] : 'website', ENT_QUOTES, 'UTF-8'); ?>"></a>
<?php endforeach; ?></div></div><?php endfor; ?></div>`
  f.put(file, source)
  const raw = (n, changes = {}) => ({
    kind: 'attr',
    attr: 'aria-label',
    tag: 'a',
    value: 'network-one',
    selector: `div.hx-card.hx-team-card > div.hx-team-social > a.hx-team-social-link:nth-of-type(${n})`,
    scopes: ['acm-teams-90'],
    ...changes
  })
  const merge = (items) => mergeViewports({ desktop: { items }, phone: { items } }, SITE)[0]
  const run = (item) =>
    annotate(
      [item],
      social.match,
      createClassifier(social.contract, null, buildSourceIndex(f.root, social.contract.template))
    )[0]
  return { ...f, ...social, raw, merge, run, file, source }
}

test('causal receivers: ACM social aria binds each exact module/card/entry and source-derived token to its scalar', () => {
  const f = teamAriaFixture()
  const item = f.merge([f.raw(1), f.raw(2), f.raw(3)])
  const result = f.run(item)
  assert.equal(result.status, 'matched')
  assert.deepEqual(result.slots, ['module-90.socials'])
  assert.equal(result.class, undefined)
  assert.match(result.evidence.join(' '), /teams\/tmpl\/style-1.php/)
  for (const raw of [
    f.raw(4),
    f.raw(1, { scopes: ['acm-teams-91'] }),
    f.raw(1, { scopes: [] }),
    f.raw(1, { scopes: ['acm-teams-90', 'acm-teams-91'] }),
    f.raw(1, { value: 'other-network' }),
    f.raw(1, { value: 'Network-One' }),
    f.raw(1, {
      selector: 'div.hx-card.hx-team-card:nth-of-type(2) > div.hx-team-social > a.hx-team-social-link'
    }),
    f.raw(1, { selector: 'a.unrelated-social-link' }),
    f.raw(1, { tag: 'span' })
  ])
    assert.equal(f.run(f.merge([raw])).status, 'hole')
  const mixed = f.merge([f.raw(1), f.raw(2, { scopes: ['acm-teams-91'] })])
  assert.equal(f.run(mixed).status, 'hole')
  const missing = f.merge([f.raw(1), f.raw(2)])
  delete missing.viewports.phone.receivers
  assert.equal(f.run(missing).status, 'hole')
  f.put(f.file, f.source.replace("$s['net'] !== '' ? $s['net'] : 'website'", "'network-one'"))
  assert.equal(
    f.run(f.merge([f.raw(1)])).status,
    'hole',
    'hard-coded same word cannot stand in for scalar derivation'
  )
})

test('causal receivers: ACM aria preserves scalar ambiguity, malformed entry ordinals, copy counts and source guards', () => {
  const f = teamAriaFixture({}, 'mod_ja_acm', [
    { key: 'module-90.second', jsonPath: ['teams', 'teams[socials]', 1] }
  ])
  const second = f.raw(1, {
    selector: 'div.hx-card.hx-team-card:nth-of-type(2) > div.hx-team-social > a.hx-team-social-link'
  })
  const matched = f.run(f.merge([f.raw(1), second]))
  assert.equal(matched.status, 'matched')
  assert.deepEqual(new Set(matched.slots), new Set(['module-90.socials', 'module-90.second']))
  const ambiguous = teamAriaFixture({}, 'mod_ja_acm', [{ key: 'module-90.duplicate' }])
  assert.equal(ambiguous.run(ambiguous.merge([ambiguous.raw(1)])).status, 'hole')
  const ordinal = teamAriaFixture({
    sample: 'network-one|relative/path\nnetwork-one|https://valid.example.test/profile'
  })
  assert.equal(ordinal.run(ordinal.merge([ordinal.raw(1)])).status, 'hole')
  assert.equal(ordinal.run(ordinal.merge([ordinal.raw(2)])).status, 'matched')
  for (const extra of [
    { column: 'content' },
    { type: 'html' },
    { role: 'editorial.paragraph' },
    { nestedJson: 'other' },
    { jsonPath: ['teams', 'teams[bio]', 0] },
    { jsonPath: ['teams', 'teams[socials]', '0'] }
  ]) {
    const wrong = teamAriaFixture(extra)
    assert.equal(wrong.run(wrong.merge([wrong.raw(1)])).status, 'hole')
  }
  const wrongModule = teamAriaFixture({}, 'mod_custom')
  assert.equal(wrongModule.run(wrongModule.merge([wrongModule.raw(1)])).status, 'hole')
  const valid = f.merge([f.raw(1), f.raw(2)])
  const invalid = [
    (v) => {
      v.count++
    },
    (v) => {
      v.receivers.pop()
    },
    (v) => {
      v.receivers[1].inCode = true
    },
    (v) => {
      v.receivers[1].scopes = ['acm-teams-91']
    },
    (v) => {
      v.receivers[1].selector = v.receivers[0].selector
    },
    (v) => {
      v.receivers[1] = null
    }
  ].map((change) => {
    const item = structuredClone(valid)
    change(item.viewports.phone)
    return item
  })
  for (const reverse of [false, true]) {
    const classify = createClassifier(f.contract, null, buildSourceIndex(f.root, f.contract.template))
    const cases = [[valid, true], ...invalid.map((item) => [item, false])]
    if (reverse) cases.reverse()
    for (const [item, expected] of cases) assert.equal(classify(item, {}).status === 'matched', expected)
  }
  for (const source of [
    '<?php /* ' + f.source + ' */',
    f.source.replace("get('socials', $i)", "get('bio', $i)"),
    f.source.replace('strtolower($parts[0])', '$parts[0]'),
    f.source.replace("$s['url']", "'https://other.example.test/'")
  ]) {
    f.put(f.file, source)
    assert.equal(f.run(f.merge([f.raw(1)])).status, 'hole')
  }
})

test('causal receivers: receipts retain each raw href and attribute without borrowing the first copy', () => {
  const raw = (n, extra = {}) => ({
    kind: 'text',
    tag: 'a',
    value: 'Example Author',
    selector: `a.author:nth-of-type(${n})`,
    href: `index.php?author=${n}`,
    ...extra
  })
  const item = mergeViewports({ desktop: { items: [raw(1), raw(2), raw(3, { href: undefined })] } }, SITE)[0]
  assert.deepEqual(
    physicalReceivers(item).map((c) => c.href),
    ['index.php?author=1', 'index.php?author=2', undefined]
  )
  const attr = mergeViewports({ desktop: { items: [raw(1, { kind: 'attr', attr: 'aria-label' })] } }, SITE)[0]
  assert.equal(physicalReceivers(attr)[0].attr, 'aria-label')
  attr.viewports.desktop.receivers[0].attr = 'title'
  assert.equal(physicalReceivers(attr), null, 'different attribute is not the same physical receiver')
  const f = generatedReceiverFixture()
  const date = f.item('18 Jun', 'time.hx-blogdate', { tag: 'time' })
  for (const viewports of [{}, { desktop: null }]) {
    const result = f.create()({ ...date, viewports }, {})
    assert.notEqual(result.class, 'c', 'missing or malformed observations cannot prove all copies')
  }
})

test('causal receivers: every ACM aria copy keeps its exact raw token despite normalized merging', () => {
  const f = teamAriaFixture()
  const mixed = f.merge([f.raw(1), f.raw(2, { value: 'Network-One' })])
  assert.equal(f.run(mixed).status, 'hole', 'a same-normalized but different raw token is not source-derived')
  const spaced = f.merge([f.raw(1), f.raw(2, { value: 'network-one ' })])
  assert.equal(f.run(spaced).status, 'hole', 'raw attribute whitespace cannot borrow the first token')
})

test('K3 review R1: missing raw tokens cannot own absent or reserved ACM network entries', () => {
  const f = teamAriaFixture({
    sample:
      'network-one|relative/path\nnetwork-one|https://valid.example.test/profile\nnetwork-one|https://another.example.test/profile'
  })
  const good = f.merge([f.raw(2), f.raw(3)])
  const cases = [
    (copy) => {
      copy.selector = copy.selector.replace('nth-of-type(3)', 'nth-of-type(4)')
      delete copy.value
    },
    (copy) => {
      copy.selector = copy.selector.replace('nth-of-type(3)', 'nth-of-type(1)')
      copy.value = null
    },
    (copy) => {
      delete copy.value
    },
    (copy) => {
      copy.value = null
    },
    (copy) => {
      copy.value = ''
    },
    (copy) => {
      copy.value = 0
    }
  ].map((change) => {
    const item = structuredClone(good)
    change(item.viewports.phone.receivers[1])
    return item
  })
  for (const reverse of [false, true]) {
    const classify = createClassifier(f.contract, null, buildSourceIndex(f.root, f.contract.template))
    const entries = [[good, true], ...cases.map((item) => [item, false])]
    if (reverse) entries.reverse()
    for (const [item, expected] of entries) assert.equal(classify(item, {}).status === 'matched', expected)
  }
})

test('K3 review R2: positional numeric formats conservatively stay whole-value only', () => {
  const matchOf = (sample) =>
    createMatcher(
      loadContract(
        contractDir([
          { key: 'module-90.role', type: 'text', sample: 'Editor' },
          { key: 'languageString-10.0', type: 'text', sample }
        ]),
        SITE
      ),
      SITE
    )
  const repeated = matchOf('Read %1$d of %1$d pages')
  assert.equal(repeated({ kind: 'text', value: 'Editor · Read 2 of 3 pages' }).status, 'hole')
  assert.equal(
    repeated({ kind: 'text', value: 'Editor · Read 2 of 2 pages' }).status,
    'hole',
    'positional fragments are deliberately unsupported, even when equal'
  )
  const distinct = matchOf('Read %1$d of %2$u pages')
  assert.equal(
    distinct({ kind: 'text', value: 'Editor · Read 2 of 3 pages' }).status,
    'hole',
    'all positional fragments decline without a printf argument binder'
  )
  assert.equal(
    repeated({ kind: 'text', value: 'Read 2 of 2 pages' }).status,
    'matched',
    'existing whole-value compatibility retained'
  )
  assert.equal(distinct({ kind: 'text', value: 'Read 2 of 3 pages' }).status, 'matched')
  assert.equal(
    matchOf('Read %d of %u pages')({ kind: 'text', value: 'Editor · Read 2 of 3 pages' }).status,
    'matched',
    'ordinary independent integer fragments remain supported'
  )
})

test('remaining67 matching: complete literals keep ownership before overlapping numeric fragments', () => {
  const slots = [
    { key: 'languageString-71.0', type: 'text', sample: 'posts . newest first' },
    { key: 'languageString-72.0', type: 'text', sample: '%d posts' },
    { key: 'languageString-73.0', type: 'text', sample: '%d min read' },
    { key: 'module-90.role', type: 'text', sample: 'Editor' }
  ]
  const match = createMatcher(loadContract(contractDir(slots), SITE), SITE)
  const count = match({ kind: 'text', value: '// 12 posts . newest first' })
  assert.ok(count.slots.includes('languageString-71.0'))
  assert.equal(count.slots.includes('languageString-72.0'), false)
  assert.equal(count.status, 'hole', 'only the genuine generated number remains for source classification')
  assert.match(count.remainder, /12/)
  const independent = match({ kind: 'text', value: 'Editor · 3 min read' })
  assert.equal(independent.status, 'matched')
  assert.deepEqual(new Set(independent.slots), new Set(['module-90.role', 'languageString-73.0']))
  assert.deepEqual(match({ kind: 'text', value: '3 posts' }).slots, ['languageString-72.0'])
  const foreign = match({ kind: 'text', value: '// 12 posts . newest first · foreign promise' })
  assert.match(foreign.remainderParts.join(' '), /foreign promise/)
  const ambiguous = createMatcher(
    loadContract(contractDir([...slots, { ...slots[0], key: 'languageString-74.0' }]), SITE),
    SITE
  )
  const refused = ambiguous({ kind: 'text', value: 'Editor · posts . newest first' })
  assert.equal(refused.status, 'hole', 'composite literal ambiguity cannot choose the first slot')
  assert.match(refused.remainderParts.join(' '), /posts . newest first/)
  for (const flags of [{ inCode: true }, { codeText: '// 12 posts . newest first' }])
    assert.equal(match({ kind: 'text', value: '// 12 posts . newest first', ...flags }).status, 'hole')
})

test('remaining67 matching: actual category producer binds the full literal and preserves ambiguity', () => {
  const f = generatedReceiverFixture()
  const dir = contractDir([
    {
      key: 'languageString-71.0',
      entity: 'languageString-71',
      column: 'value',
      type: 'text',
      sample: 'posts . newest first'
    },
    { key: 'languageString-72.0', type: 'text', sample: '%d posts' }
  ])
  const file = path.join(dir, 'content-map.json')
  const map = JSON.parse(readFileSync(file, 'utf8'))
  map.entities.push({
    key: 'languageString-71',
    kind: 'languageString',
    identity: { extension: 'tpl_ja_kinetic', language: 'en-GB', key: 'TPL_JA_KINETIC_BLOG_POSTS_NEWEST' }
  })
  writeFileSync(file, JSON.stringify(map))
  const run = () => {
    const contract = loadContract(dir, SITE)
    contract.template = 'ja_kinetic'
    return annotate(
      [f.item('// 12 posts . newest first', 'span.hx-bloglist__count')],
      createMatcher(contract, SITE),
      createClassifier(contract, null, buildSourceIndex(f.root, contract.template))
    )[0]
  }
  const good = run()
  assert.equal(good.status, 'matched')
  assert.deepEqual(good.slots, ['languageString-71.0'])
  assert.match(good.evidence.join(' '), /source-bound/)
  map.slots.push({ ...map.slots.find((s) => s.key === 'languageString-71.0'), key: 'languageString-71.1' })
  writeFileSync(file, JSON.stringify(map))
  assert.equal(run().status, 'hole', 'duplicate complete literal slots cannot establish unique ownership')
})

test('remaining67 dates: exact full-date and month leaves bind their own source and locale', () => {
  const f = generatedReceiverFixture()
  const full = f.item(
    '18 June 2026',
    'a.hx-blogrow > div.hx-blogmeta:nth-of-type(2) > span.hx-blogdatetxt:nth-of-type(2)'
  )
  const month = f.item('Jun', 'a.hx-blogrow > time.hx-blogdate > span.hx-blogdate__m:nth-of-type(2)')
  const c = f.create()
  for (const item of [full, month]) {
    const result = c(item, {})
    assert.equal(result.class, 'c')
    assert.match(result.label, /source-bound/)
  }
  for (const [item, value] of [
    [full, '31 June 2026'],
    [full, '00 June 2026'],
    [full, '18 June 0000'],
    [full, '18 Jun 2026'],
    [full, '18 June 2026 foreign promise'],
    [month, '06'],
    [month, 'June']
  ])
    assert.notEqual(c({ ...item, value }, {}).class, 'c')
  for (const item of [full, month])
    for (const extra of [
      { inCode: true },
      { codeText: item.value },
      { tag: 'div' },
      { viewports: { desktop: { count: 2, selector: item.selector } } }
    ])
      assert.notEqual(c({ ...item, ...extra }, {}).class, 'c')
  const file = f.base + 'category/blog_item.php'
  f.put(file, f.files[file].replace("$dateField, 'M'", "$dateField, 'm'"))
  assert.notEqual(f.create()(month, {}).class, 'c')
  f.put(
    file,
    f.files[file].replace("$dateField, Text::_('DATE_FORMAT_LC3')", "$unrelated, Text::_('DATE_FORMAT_LC3')")
  )
  assert.notEqual(f.create()(full, {}).class, 'c')
  f.put(file, '<?php /* ' + f.files[file] + ' */')
  assert.notEqual(f.create()(full, {}).class, 'c')
  f.put(file, f.files[file])
  f.put('language/fr-FR/joomla.ini', 'DATE_FORMAT_LC3="d f Y"\nJUNE_SHORT="Juin"')
  assert.notEqual(f.create()(full, {}).class, 'c')
  assert.notEqual(f.create()(month, {}).class, 'c')
})

test('remaining67 dates: physical leaf copies and calendar bounds survive cache order', () => {
  const f = generatedReceiverFixture()
  const raw = (row) => ({
    kind: 'text',
    tag: 'span',
    value: '18 June 2026',
    selector: `a.hx-blogrow:nth-of-type(${row}) > div.hx-blogmeta > span.hx-blogdatetxt`
  })
  const good = mergeViewports(
    { desktop: { items: [raw(1), raw(2)] }, phone: { items: [raw(1), raw(2)] } },
    SITE
  )[0]
  const bad = []
  for (const change of [
    (v) => {
      delete v.receivers
    },
    (v) => {
      v.receivers[1].value = '18 June 2027'
    },
    (v) => {
      v.receivers[1].selector = 'span.business'
    },
    (v) => {
      v.receivers[1].inCode = true
    },
    (v) => {
      v.receivers.pop()
    }
  ]) {
    const item = structuredClone(good)
    change(item.viewports.phone)
    bad.push(item)
  }
  for (const reverse of [false, true]) {
    const c = f.create(),
      cases = [[good, true], ...bad.map((item) => [item, false])]
    if (reverse) cases.reverse()
    for (const [item, expected] of cases) assert.equal(c(item, {}).class === 'c', expected)
  }
  f.put('language/en-GB/joomla.ini', f.files['language/en-GB/joomla.ini'] + '\nFEBRUARY="February"')
  f.put('libraries/src/Date/Date.php', f.files['libraries/src/Date/Date.php'] + "\nText::_('FEBRUARY');")
  const selector = 'div.hx-blogmeta > span.hx-blogdatetxt'
  const c = f.create()
  assert.equal(c(f.item('29 February 2024', selector), {}).class, 'c')
  for (const value of ['29 February 2026', '29 February 1900', '30 February 2024'])
    assert.notEqual(c(f.item(value, selector), {}).class, 'c')
  assert.equal(c(f.item('29 February 2000', selector), {}).class, 'c')
})

test('remaining67 forms: conflicting template/core phases never pick the observed same words', () => {
  const f = generatedReceiverFixture(),
    context = { url: SITE + '?option=com_users&view=registration' }
  f.put('templates/ja_kinetic/language/en-GB/tpl_ja_kinetic.ini', 'COM_USERS_REGISTER_NAME_LABEL="Full name"')
  // Static files do not establish which plugins loaded a language before the HTML form rendered.
  f.put('libraries/src/Application/CMSApplication.php', '<?php $this->doExecute(); $this->render();')
  f.put('libraries/src/Document/HtmlDocument.php', "<?php $lang->load('tpl_' . $template, JPATH_BASE);")
  for (const value of ['Name *', 'Full name *'])
    assert.doesNotMatch(
      f.create()(f.item(value, '#jform_name-lbl', { tag: 'label' }), {}, context).label,
      /source-bound/
    )
  f.put('templates/ja_kinetic/language/en-GB/tpl_ja_kinetic.ini', 'COM_USERS_REGISTER_NAME_LABEL="Name"')
  assert.equal(f.create()(f.item('Name *', '#jform_name-lbl', { tag: 'label' }), {}, context).class, 'b')
  f.put('language/overrides/en-GB.override.ini', 'COM_USERS_REGISTER_NAME_LABEL="Public name"')
  const override = f.create()(f.item('Public name *', '#jform_name-lbl', { tag: 'label' }), {}, context)
  assert.equal(override.class, 'b')
  assert.match(override.label, /source-bound/)
})

test('remaining67 leaf boundaries: a producer prefix or ambiguous month cannot prove the whole scalar', () => {
  const f = generatedReceiverFixture(),
    file = f.base + 'category/blog_item.php'
  const full = f.item('18 June 2026', 'div.hx-blogmeta > span.hx-blogdatetxt')
  const month = f.item('Jun', 'time.hx-blogdate > span.hx-blogdate__m')
  for (const item of [full, month]) assert.equal(f.create()(item, {}).class, 'c')
  const fullEcho = "HTMLHelper::_('date', $dateField, Text::_('DATE_FORMAT_LC3'))"
  const monthEcho = "HTMLHelper::_('date', $dateField, 'M')"
  for (const [item, expression] of [
    [full, fullEcho],
    [month, monthEcho]
  ]) {
    f.put(file, f.files[file].replace(expression + ';', expression + " . ' extra';"))
    assert.notEqual(f.create()(item, {}).class, 'c', 'the echo must be the complete leaf value')
    f.put(file, f.files[file].replace(expression + '; ?></span>', expression + '; ?> extra</span>'))
    assert.notEqual(
      f.create()(item, {}).class,
      'c',
      'adjacent literal leaf content is not the old date alone'
    )
    f.put(file, f.files[file])
    const orphan = { ...item, selector: item.selector.split(' > ').at(-1) }
    orphan.viewports = { desktop: { count: 1, selector: orphan.selector } }
    assert.notEqual(f.create()(orphan, {}).class, 'c', 'the exact generated parent is required')
  }
  f.put('language/en-GB/joomla.ini', f.files['language/en-GB/joomla.ini'] + '\nMAY_SHORT="Jun"')
  f.put(
    'libraries/src/Date/Date.php',
    f.files['libraries/src/Date/Date.php'].replace('case 6:', "case 5: return Text::_('MAY_SHORT'); case 6:")
  )
  assert.notEqual(f.create()(month, {}).class, 'c', 'two source months with one label remain ambiguous')
})
