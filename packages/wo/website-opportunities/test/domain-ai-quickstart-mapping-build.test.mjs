// The build declarations of ticket #597 (`ai-quickstart-mapping-build.mjs`, `ai-quickstart-frames.mjs`), each broken
// on the invented fixture: the accent door, the page of every page type, a main block with data, the row a page type
// keys, a fact place not written by decision, and the frames of created records. The last case reads JA Boxing.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkAiQuickstartContract } from '../domain/ai-quickstart-contract.mjs'
import { parseFrame, xpathCount } from '../domain/ai-quickstart-frames.mjs'

const read = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/ai-quickstart/${name}`, import.meta.url), 'utf8'))
const VALID = {
  blockStore: read('block-store.json'),
  pageRecipes: read('page-recipes.json'),
  mapping: read('mapping.json')
}
const valid = () => structuredClone(VALID)
const problemsOf = (set) => checkAiQuickstartContract(set).problems.map((p) => `${p.at}: ${p.message}`)
const has = (set, pattern) => {
  const problems = problemsOf(set)
  assert.ok(
    problems.some((p) => pattern.test(p)),
    `no problem matches ${pattern}:\n${problems.join('\n')}`
  )
}

test('the accent door is declared: variables, value format, sides and the module it is written as', () => {
  const set = valid()
  delete set.mapping.look
  has(set, /^look\.accent: declare where the accent colour is written/)
  const s = valid()
  s.mapping.look.accent.variables = ['color']
  s.mapping.look.accent.value = 'red'
  s.mapping.look.accent.writtenAs.assign = 'somewhere'
  has(s, /look\.accent\.variables: the template variables/)
  has(s, /look\.accent\.value: the value format/)
  has(s, /look\.accent\.writtenAs\.assign: assign is one of/)
})

test('every page type has one way to its page, and links name only what the build makes or keeps', () => {
  const set = valid()
  delete set.mapping.pages.services
  has(set, /pages\.services: a page type has one of menuItem, under/)
  const s = valid()
  s.mapping.pages.services.menuItem.link = 'index.php?id={category:blog}&x={page:home}&y={record}'
  s.mapping.pages.services.menuItem.templateStyle = 13
  s.mapping.pages.blog = s.mapping.pages.home
  has(s, /pages\.services\.menuItem\.link: \{category:blog\}: a placeholder names/)
  has(s, /pages\.services\.menuItem\.templateStyle: templateStyle is 0/)
  has(s, /pages\.blog: no recipe has this page type/)
  const u = valid()
  u.mapping.pages.services = { under: { page: 'home', address: 'index.php?id={record}', why: 'x' } }
  has(u, /pages\.services\.under\.address: the address names the record and the list page \{page:home\}/)
  has(u, /pages\.services\.ownItem: a menu item is/)
  has(u, /pages\.services\.under: only an article page is reached under a list page/)
})

test('an article page creates a record with its category; an unbuilt page type says why', () => {
  const set = valid()
  set.mapping.seo.pageTypes = { home: 'menuItem', services: 'article' }
  has(set, /pages\.services\.record: a record is \{kind: article \| contact, category, base, why\}/)
  set.mapping.pages.services.record = {
    kind: 'article',
    category: { extension: 'com_content' },
    base: {},
    why: 'x'
  }
  has(set, /pages\.services\.record\.category: category is \{extension, parent: "root", title: \{from\}/)
  const u = valid()
  u.mapping.pages.services = { unbuilt: { why: 'x' } }
  has(u, /pages\.services\.unbuilt: unbuilt is \{code, why\}/)
})

test('a main block shows data the plan can give, or the plan gate drops its page', () => {
  const set = valid()
  const hero = set.blockStore.blocks.find((b) => b.id === 'hero-home')
  for (const f of [...(hero.fields ?? []), ...(hero.itemFields ?? [])]) f.kind = 'editorial.heading'
  has(set, /pages\.home: main block hero-home shows no data \(only editorial fields\)/)
})

test('a fact place not written is so by decision, on the global configuration only', () => {
  const set = valid()
  const place = set.mapping.facts.name.find((p) => p.entity !== 'settings') ?? set.mapping.facts.name[0]
  place.notWritten = { by: 'someone' }
  has(set, /facts\.name\[\d+\]\.notWritten: notWritten is \{by: "decision", why\}/)
})

test('a frame names every xpath of a created record value exactly once', () => {
  const root = parseFrame('<h3 class="a"> </h3><p> </p><p> </p><div><img src="" width="1"/></div>')
  assert.equal(xpathCount(root, '/html/body/div/p[2]/text()'), 1)
  assert.equal(xpathCount(root, '/html/body/div/p/text()'), 2)
  assert.equal(xpathCount(root, '/html/body/div/div/img/@src'), 1)
  assert.equal(xpathCount(root, '/html/body/div/h3[2]/text()'), 0)
  assert.equal(parseFrame('<p><b></p>'), null)
  const set = valid()
  set.mapping.entities['article-9'] = { kind: 'article', identity: { alias: 'invented' }, created: true }
  set.mapping.blocks['services-grid'].fields.body = {
    entity: 'article-9',
    column: 'fulltext',
    xpath: '/html/body/div/p[2]/text()'
  }
  has(set, /createdFrames: article-9 fulltext \(services-grid\): a created record value written at/)
  set.mapping.createdFrames = [{ entities: ['article-9'], column: 'fulltext', html: '<p> </p>', why: 'x' }]
  has(
    set,
    /createdFrames\[0\]: article-9 fulltext: \/html\/body\/div\/p\[2\]\/text\(\) \(services-grid\) names no single node/
  )
  set.mapping.createdFrames[0].html = '<p> </p><p> </p>'
  assert.ok(!problemsOf(set).some((p) => p.startsWith('createdFrames')), problemsOf(set).join('\n'))
})

test('JA Boxing: the build declarations pass, and the gaps the build team named are declared', () => {
  const folder = '../../../cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/'
  const json = (name) => JSON.parse(readFileSync(new URL(folder + name, import.meta.url), 'utf8'))
  const set = {
    blockStore: json('block-store.json'),
    pageRecipes: json('page-recipes.json'),
    mapping: json('mapping.json')
  }
  assert.deepEqual(problemsOf(set), [])
  const m = set.mapping
  assert.ok(m.look.accent.variables.includes('--color-primary'))
  assert.equal(set.pageRecipes.recipes.find((r) => r.pageType === 'plans').mainBlock, 'block-167')
  assert.equal(m.placements['block-162'].keyedRow.row, 14)
  assert.equal(m.pages['news-post'].record.base.featured, 1)
  assert.equal(m.pages.class.record.base.attribs['classes-info'] !== undefined, true)
  assert.equal(m.facts.name.find((p) => p.column === 'fromname').notWritten.by, 'decision')
  // The masthead keys the classes page beside its pages list: without keyedRow the build cannot tell the rows apart.
  delete m.placements['block-162'].keyedRow
  set.pageRecipes.recipes.find((r) => r.pageType === 'plans').mainBlock = 'block-184'
  const problems = problemsOf(set)
  assert.ok(
    problems.includes(
      'placements[block-162].keyedRow: a page type keys a row beside the rows of a list: declare keyedRow'
    )
  )
  assert.ok(
    problems.includes(
      'pages.plans: main block block-184 shows no data (only editorial fields): the plan gate drops the page'
    )
  )
})
