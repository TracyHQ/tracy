/**
 * Spec #37 (issue #43): the content coverage audit runs on a WordPress contract the way it runs on Joomla. The fixture
 * is a made-up tea room: its contract is captured from its own page markup (all text, version 3 roles), its database
 * dump holds the same page plus a second one the contract does not know.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { deriveProfile } from '../../tracy-wordpress-quickstart/scripts/capture-contract.mjs'
import { createClassifier } from '../content-coverage/lib/classify.mjs'
import { loadContract } from '../content-coverage/lib/contract.mjs'
import { buildCoverageFile } from '../content-coverage/lib/coverage-file.mjs'
import { buildDbIndex } from '../content-coverage/lib/db-index.mjs'
import { annotate } from '../content-coverage/lib/items.mjs'
import { createMatcher } from '../content-coverage/lib/match.mjs'
import { PagePlan } from '../content-coverage/lib/pages.mjs'
import { buildSourceIndex } from '../content-coverage/lib/sources.mjs'

const SITE = 'http://tea.invalid/'
const wp = (type, inner, attrs = '') =>
  `<!-- wp:${type}${attrs ? ` ${attrs}` : ''} -->\n${inner}\n<!-- /wp:${type} -->`
const HOME = [
  wp('heading', '<h1>Larkspur Tea Room</h1>', '{"level":1}'),
  wp('paragraph', '<p>Scones are baked at 7am. <a href="/menu/">See the menu</a>.</p>'),
  wp(
    'button',
    '<div class="wp-block-button"><a class="wp-block-button__link" href="/book/">Book now</a></div>'
  )
].join('\n')
const EXTRA = wp('paragraph', '<p>Dinner is served at nine on Fridays.</p>')

const q = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
const table = (name, columns, rows) =>
  `CREATE TABLE \`tr_${name}\` (\n${columns.map((c) => `  \`${c}\` text`).join(',\n')}\n) ENGINE=InnoDB;\nINSERT INTO \`tr_${name}\` VALUES ${rows.map((r) => `(${r.map(q).join(',')})`).join(',')};\n`
const POST = ['ID', 'post_content', 'post_title', 'post_status', 'post_name', 'post_type', 'post_parent']
const SQL =
  table(
    'options',
    ['option_id', 'option_name', 'option_value'],
    [
      [1, 'stylesheet', 'wp-demo'],
      [2, 'template', 'wp-demo'],
      [3, 'blogname', 'Larkspur'],
      [4, 'blogdescription', 'Tea and scones']
    ]
  ) +
  table(
    'term_taxonomy',
    ['term_taxonomy_id', 'term_id', 'taxonomy', 'description'],
    [[1, 1, 'category', '']]
  ) +
  table('posts', POST, [
    [10, HOME, 'Home', 'publish', 'home', 'page', 0],
    [11, EXTRA, 'Extras', 'publish', 'extras', 'page', 0]
  ])

/** The contract folder and the dump of the fixture tea room. */
function fixture() {
  const out = deriveProfile({
    sql: SQL,
    release: {
      version: '1.0.0',
      prefix: 'tr_',
      wpVersion: '7.1',
      placeholderUrl: 'https://quickstart.invalid',
      theme: { name: 'wp-demo' },
      webroot: { file: 'w.tar.gz', bytes: 1, sha256: 'a'.repeat(64) },
      database: { file: 'd.sql.gz', bytes: 1, sha256: 'b'.repeat(64) }
    },
    card: { slug: 'ja-demo', version: '1.0.0', tag: 'quickstart/ja-demo/wp7', repo: 'o/r', assets: {} },
    coworkVersion: '0.17.1',
    themeRoots: ['wp-content/themes/wp-demo'],
    allText: true,
    vocabulary: 'place-content-roles/3'
  })
  const dir = mkdtempSync(path.join(tmpdir(), 'cov-wp-'))
  const contractDir = path.join(dir, 'contract')
  mkdirSync(contractDir)
  // The extras page is in the dump but outside the contract: drop its entity and slots.
  const map = {
    ...out.contentMap,
    entities: out.contentMap.entities.filter((e) => e.key !== 'page-extras'),
    slots: out.contentMap.slots.filter((s) => s.entity !== 'page-extras')
  }
  writeFileSync(path.join(contractDir, 'manifest.json'), JSON.stringify(out.manifest))
  writeFileSync(path.join(contractDir, 'content-map.json'), JSON.stringify(map))
  writeFileSync(path.join(contractDir, 'presentation-lock.json'), JSON.stringify(out.lock))
  const dump = path.join(dir, 'database.sql')
  writeFileSync(dump, SQL)
  const webroot = path.join(dir, 'webroot')
  mkdirSync(path.join(webroot, 'wp-content/themes/wp-demo'), { recursive: true })
  mkdirSync(path.join(webroot, 'wp-includes'), { recursive: true })
  writeFileSync(
    path.join(webroot, 'wp-content/themes/wp-demo/footer.php'),
    '<footer>Find us beside the old mill bridge</footer>'
  )
  writeFileSync(path.join(webroot, 'wp-includes/general-template.php'), '<p>Core words about nothing</p>')
  return { contractDir, dump, webroot }
}

test('a WordPress contract loads: its pages come from the page entities, its template is the theme', () => {
  const { contractDir } = fixture()
  const contract = loadContract(contractDir, SITE)
  assert.equal(contract.template, 'wp-demo')
  assert.equal(contract.platform, 'wordpress')
  assert.deepEqual(
    contract.pages.map((p) => [p.entity, p.route, p.openAs]),
    [['page-home', 'home', '?pagename=home']]
  )
  assert.ok(contract.index.text.has('larkspur tea room'))
})

test('the page plan opens each page entity by its slug, then the front page', () => {
  const { contractDir } = fixture()
  const plan = new PagePlan(SITE, loadContract(contractDir, SITE), 10)
  const urls = []
  for (let job = plan.next(); job; job = plan.next()) urls.push(job.url)
  assert.deepEqual(urls, [`${SITE}?pagename=home`, SITE])
})

test('a request that lands on another host left the site: it is recorded, never audited as a page of the site', () => {
  const { contractDir } = fixture()
  const plan = new PagePlan(SITE, loadContract(contractDir, SITE), 10)
  // a banner click is a same-host link whose answer is a redirect to the advertiser
  const job = { url: `${SITE}index.php/component/banners/click/2`, origin: 'crawl' }
  assert.equal(plan.leftSite(job, 'https://advertiser.invalid/'), true)
  assert.deepEqual(plan.offsite, [{ url: job.url, landedOn: 'https://advertiser.invalid/' }])
  assert.equal(plan.leftSite({ url: SITE, origin: 'crawl' }, `${SITE}menu/`), false)
  assert.equal(plan.offsite.length, 1)
})

test('a shop listing sorted another way is the same products in another order: the crawl does not queue it', () => {
  const { contractDir } = fixture()
  const plan = new PagePlan(SITE, loadContract(contractDir, SITE), 10)
  plan.addLinks(
    [
      '/index.php/shop/shoes/by,product_name',
      '/index.php/shop/shoes/by,ordering,product_name/dirDesc',
      '/index.php/shop/shoes/manufacturer/atelier-nord/shoes/by,mf_name/dirAsc',
      '/index.php/shop/shoes?orderby=product_name',
      '/index.php/shop/shoes/manufacturer/atelier-nord',
      '/index.php/shop/shoes/bio-leather-sandal-detail'
    ],
    SITE
  )
  assert.deepEqual(
    plan.queue.slice(-2).map((job) => new URL(job.url).pathname),
    ['/index.php/shop/shoes/manufacturer/atelier-nord', '/index.php/shop/shoes/bio-leather-sandal-detail']
  )
  assert.equal(plan.queue.filter((job) => /by,|dir(Asc|Desc)|orderby/.test(job.url)).length, 0)
})

test('the database index reads a WordPress dump, and an unmapped post is a capture hole of a row outside the contract', () => {
  const { contractDir, dump } = fixture()
  const contract = loadContract(contractDir, SITE)
  const db = buildDbIndex(dump)
  assert.equal(db.prefix, 'tr_')
  const match = createMatcher(contract, SITE)
  const classify = createClassifier(contract, db, null)
  const items = annotate(
    [
      { key: 'a', kind: 'text', value: 'Larkspur Tea Room', viewports: { desktop: { visible: true } } },
      {
        key: 'b',
        kind: 'text',
        value: 'Dinner is served at nine on Fridays.',
        viewports: { desktop: { visible: true } }
      },
      { key: 'c', kind: 'text', value: 'Skip to content', viewports: { desktop: { visible: true } } }
    ],
    match,
    classify
  )
  assert.equal(items[0].status, 'matched')
  assert.equal(items[1].status, 'hole')
  assert.equal(items[1].class, 'a')
  assert.match(items[1].classLabel, /not a contract entity/)
  assert.match(items[1].evidence[0], /^posts#11\.post_content/)
  assert.equal(items[2].class, 'c', 'a string WordPress themes print themselves is core')
})

test('a post of the contract whose field has no slot says so', () => {
  const { contractDir, dump } = fixture()
  const contract = loadContract(contractDir, SITE)
  contract.index.text.delete('larkspur tea room')
  contract.index.textCompact.delete('larkspurtearoom')
  const classify = createClassifier(contract, buildDbIndex(dump), null)
  const got = classify({ kind: 'text', value: 'Larkspur Tea Room' }, {})
  assert.equal(got.class, 'a')
  assert.match(got.label, /row is contract entity page-home, but this field has no slot/)
})

test('the source index of a WordPress site reads the theme and nothing of WordPress itself', () => {
  const { webroot } = fixture()
  const index = buildSourceIndex(webroot, 'wp-demo', 'wordpress')
  assert.deepEqual(
    index.files.map((f) => [f.rel, f.origin.cls]),
    [['wp-content/themes/wp-demo/footer.php', 'b']]
  )
})

test('the coverage file of a WordPress contract carries the label rules, judged on a version 3 map', () => {
  const { contractDir } = fixture()
  const contract = loadContract(contractDir, SITE)
  const result = {
    pages: [{ url: `${SITE}home/`, items: [] }],
    failures: [],
    capReached: false,
    viewports: ['desktop'],
    summary: { pages: 1, mappedPages: 1, unmappedPages: 0 }
  }
  const doc = buildCoverageFile({ result, contract, measuredAt: '2026-10-28T00:00:00.000Z' })
  assert.equal(doc.contract.id, 'ja-demo/wp7/1.0.0')
  assert.equal(doc.labelRules.applies, true)
  assert.equal(doc.labelRules.rules.R3.count, 0, 'every url slot of the capture has a role')
  assert.equal(doc.labelRules.rules.R4.count, 0, 'the button is grouped with its link')
})
