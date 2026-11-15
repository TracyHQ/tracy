// A kept literal exempts only the words of the file it names (ticket #586, review 4 W1). With the JA Boxing mapping's
// own `keptLiterals` (share bar network names, two digit counters), on an invented site dump: a demo counter printed by
// a stats module, a demo footer link and a demo picture alt are leaks; the share bar under an article and the counter
// of a features block stay exempt, each naming the file it matched.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { joomlaLiteralScope } from '../ai-quickstart/gate/adapters/joomla-literal-scope.mjs'
import { exemptionOf, keptKeysOf, keptPlacesOf } from '../ai-quickstart/gate/exemptions.mjs'

const KIT = new URL(
  '../../packages/cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/',
  import.meta.url
)
const mapping = JSON.parse(readFileSync(new URL('mapping.json', KIT), 'utf8'))
const keep = keptPlacesOf(mapping)
// An invented dump: a stats block (an ACM "stats" module holding a demo counter), a features block (ACM
// "features-intro", style 4), a footer menu and a custom module with a demo picture.
const dump = [
  'INSERT INTO `#__modules` (`id`, `title`, `module`, `params`) VALUES ',
  `(160,'Numbers','mod_ja_acm','{\\"jatools-config\\":\\"{\\\\\\":type\\\\\\":\\\\\\"stats\\\\\\",\\\\\\"stats\\\\\\":{\\\\\\"jatools-layout-stats\\\\\\":\\\\\\"style-1\\\\\\",\\\\\\"stats[count]\\\\\\":[\\\\\\"25\\\\\\"]}}\\"}')`,
  `,(170,'Why us','mod_ja_acm','{\\"jatools-config\\":\\"{\\\\\\":type\\\\\\":\\\\\\"features-intro\\\\\\",\\\\\\"features-intro\\\\\\":{\\\\\\"jatools-layout-features-intro\\\\\\":\\\\\\"style-4\\\\\\"}}\\"}')`,
  `,(171,'Footer','mod_menu','{}')`,
  `,(172,'Follow','mod_custom','{}');`
].join('\n')
const scope = joomlaLiteralScope({
  dump,
  // The build's copy 301 of the features block (placement `home-b2` holds block-170 of the store).
  ids: { 'copy:home.home-b2': 301 },
  plan: { pages: [{ id: 'home', blocks: [{ id: 'home-b2', block: 'block-170' }] }] },
  mapping: {
    placements: { 'block-170': { entity: 'module-170' } },
    entities: { 'module-170': { kind: 'module', sourceId: 170 } }
  }
})
const ctx = { origin: 'http://florist.example', kept: keptKeysOf(mapping), keep, rules: [], scope }
const DEMO_ROW = { class: 'data', file: 'installation/sql/mysql/custom.sql', table: '#__modules' }
const SHARE_SOURCE = {
  class: 'ambiguous',
  candidates: [
    { class: 'data', file: 'installation/sql/mysql/custom.sql', table: '#__acym_configuration' },
    { class: 'literal', file: 'plugins/system/jasocialshare/jasocialshare.php', owner: 'plugin' }
  ]
}
const at = (kind, value, place, path = 'index.php') => ({ kind, value, visible: true, place, path })
const ARTICLE = 'index.php?option=com_content&view=article&id=5&Itemid=249'

test('W1: a demo counter, a demo footer link and a demo picture alt are leaks, not kept literals', () => {
  assert.equal(
    exemptionOf(at('text', '25', { element: 'span', module: 160 }), { ...ctx, source: DEMO_ROW }),
    null
  )
  assert.equal(
    exemptionOf(at('text', 'Facebook', { element: 'a', module: 171, menu: true }), {
      ...ctx,
      source: SHARE_SOURCE
    }),
    null
  )
  assert.equal(
    exemptionOf(at('alt', 'Twitter', { element: 'img[alt]', module: 172 }), { ...ctx, source: DEMO_ROW }),
    null
  )
  // The same words with no module and no source that names the file: the page cannot tell the file, so no exemption.
  assert.equal(
    exemptionOf(at('text', '25', { element: 'span' }), { ...ctx, source: { class: 'unknown' } }),
    null
  )
})

test('W1: the share bar under an article and a features block counter stay exempt, naming their file', () => {
  const share = exemptionOf(at('attr', 'facebook', { element: 'a[title]' }, ARTICLE), {
    ...ctx,
    source: SHARE_SOURCE
  })
  assert.match(
    share,
    /^kept_literal: templates\/ja_boxing\/html\/com_content\/article\/(default|learning)\.php: /
  )
  const card = exemptionOf(at('text', '01', { element: 'span', module: 301 }), {
    ...ctx,
    source: { class: 'unknown' }
  })
  assert.match(card, /^kept_literal: templates\/ja_boxing\/acm\/features-intro\/tmpl\/style-4\.php: /)
  // A learning step number is printed by the article layout, outside any module.
  const step = exemptionOf(at('text', '02', { element: 'span' }, ARTICLE), {
    ...ctx,
    source: { class: 'unknown' }
  })
  assert.match(step, /^kept_literal: templates\/ja_boxing\/html\/com_content\/article\/learning\.php: /)
  // A two digit number in another ACM block (the stats block) is not the features block's counter.
  assert.equal(
    exemptionOf(at('text', '07', { element: 'span', module: 160 }), { ...ctx, source: { class: 'unknown' } }),
    null
  )
})

test('W1: words a module row of the demo holds are that row, even where a kept file prints', () => {
  // The features block row holds no "25"; the stats row does: a "25" in a stats copy is the demo's, never a counter.
  assert.equal(
    exemptionOf(at('text', '25', { element: 'span', module: 160 }), { ...ctx, source: { class: 'unknown' } }),
    null
  )
  // A named source that is the write or a contract place is never a kept literal.
  for (const source of [
    { class: 'write', entry: 'e-1' },
    { class: 'block_field', slot: 'module-170.3', entity: 'module-170' }
  ])
    assert.equal(exemptionOf(at('text', '03', { element: 'span', module: 301 }), { ...ctx, source }), null)
})

test('W1: a source that names the literal file exempts it with no position to read', () => {
  const source = { class: 'literal', file: 'templates/ja_boxing/html/com_content/article/default.php' }
  assert.match(
    exemptionOf(at('attr', 'reddit', { element: 'a[title]' }), { ...ctx, scope: null, source }),
    /^kept_literal: templates\/ja_boxing\/html\/com_content\/article\/default\.php: /
  )
})
