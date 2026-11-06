/**
 * The hidden kit fields check of the template readiness verdict (ticket #435): the five kit fields the write step hides
 * by CSS on the customer's site (play buttons with an empty video address, "more" buttons that lead to their own page,
 * list row links to a hidden page, blocks a created page must not show such as a share bar, the article layout of a
 * created legal page) must each name what the template prints, or say none with a reason. And the readers behind them
 * scope a rule by the page classes the template's framework prints: T4 `item-<id>` on the body, T3 `itemid-<id>` on html.
 *
 * The reference T4 case is the committed JA Boxing kit; the T3 case is JA Diner, recorded as it is.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { defaultContracts } from '../src/lib/contracts.js'
import { createdHideSelectorsFor, isCreatedHideBlock } from '../src/lib/created-page-hide.js'
import { frameworkOfKit } from '../src/lib/kit-framework.js'
import {
  isSelfLinkBlock,
  pageBodyOf,
  SELF_LINKS_END,
  SELF_LINKS_START,
  selfLinkSelectorsFor
} from '../src/lib/self-link-buttons.js'
import {
  HIDDEN_KIT_FIELDS,
  HIDDEN_KIT_FIELDS_CHECK,
  hiddenKitFieldsOf
} from '../src/lib/template-readiness/hidden-kit-fields.js'
import { latestPin, releaseOfPin } from '../src/lib/template-readiness/pinned-release.js'
import { readinessVerdict } from '../src/lib/template-readiness/verdict.js'
import { hideOnCreatedPages } from '../src/write-step/created-page-hide-stage.js'

const CONTRACTS = new URL('../../../packages/cms/tracy-joomla-quickstart/contracts/', import.meta.url)
const kitAt = (id) => JSON.parse(readFileSync(new URL(`${id}/template-kit.json`, CONTRACTS), 'utf8'))
const BOXING = 'ja-boxing/j6/1.0.11'
const DINER = 'ja-diner/j6/1.0.5'

const release = (tag, version, platform = 'joomla') => ({
  tag,
  kind: 'quickstart',
  platform,
  setting: { platform, version }
})
const boxingRelease = release('quickstart/ja-boxing/j6', '1.0.11')
const dinerRelease = release('quickstart/ja-diner/j6', '1.0.5')
const judge = (rel, doc) => HIDDEN_KIT_FIELDS_CHECK.judge(rel, { templateKit: { state: 'read', doc } }, {})

const WHY = 'the invented template prints no such control on any page, read in every layout file'

/** A T3 kit shaped like JA Diner's, every field declared with invented selectors. */
const dinerShaped = () => ({
  ...kitAt(DINER),
  site: {
    ...kitAt(DINER).site,
    emptyVideoButtons: [{ selector: '.play-pill[data-video$="/embed/"]', why: WHY }],
    selfLinkButtons: [{ container: '.section-more', why: WHY }],
    hiddenPageLinks: [{ container: '.chef-card', why: WHY }],
    createdPageHide: [{ selector: '.share-strip', why: WHY }],
    createdPageLayouts: { legal: { articleLayout: 'ja_diner:default', why: WHY } }
  }
})

const without = (doc, field) => {
  const site = { ...doc.site }
  if (field === 'createdPageLayouts.legal') site.createdPageLayouts = {}
  else delete site[field]
  return { ...doc, site }
}

test('the five fields, by the kit field that holds each', () => {
  assert.deepEqual(
    HIDDEN_KIT_FIELDS.map((f) => f.field),
    ['emptyVideoButtons', 'selfLinkButtons', 'hiddenPageLinks', 'createdPageHide', 'createdPageLayouts.legal']
  )
})

test('the latest JA Boxing kit declares all five and passes', () => {
  const judged = judge(boxingRelease, kitAt(BOXING))
  assert.equal(judged.state, 'done')
  assert.equal(judged.code, 'kit-hidden-fields-declared')
  assert.deepEqual(
    judged.params.declared,
    HIDDEN_KIT_FIELDS.map((f) => f.field)
  )
  assert.deepEqual(judged.params.none, [])
  assert.equal(
    HIDDEN_KIT_FIELDS_CHECK.judge(boxingRelease, { contracts: defaultContracts() }).params.framework,
    't4'
  )
})

test('a JA Boxing kit with one field removed is todo, naming that field', () => {
  for (const { field } of HIDDEN_KIT_FIELDS) {
    const judged = judge(boxingRelease, without(kitAt(BOXING), field))
    assert.equal(judged.state, 'todo', field)
    assert.equal(judged.code, 'kit-hidden-field-missing', field)
    assert.deepEqual(judged.params.fields, [field])
  }
})

test('a field set to none with a reason passes; an empty list or a none without a reason does not', () => {
  const doc = kitAt(BOXING)
  const none = {
    ...doc,
    site: { ...doc.site, emptyVideoButtons: [], noneWhy: { emptyVideoButtons: WHY } }
  }
  const judged = judge(boxingRelease, none)
  assert.equal(judged.state, 'done')
  assert.deepEqual(judged.params.none, ['emptyVideoButtons'])

  const bare = { ...doc, site: { ...doc.site, emptyVideoButtons: [] } }
  assert.deepEqual(judge(boxingRelease, bare).params.fields, ['emptyVideoButtons'])
  const blank = { ...doc, site: { ...doc.site, emptyVideoButtons: [], noneWhy: { emptyVideoButtons: '  ' } } }
  assert.deepEqual(judge(boxingRelease, blank).params.fields, ['emptyVideoButtons'])

  const legalNone = {
    ...doc,
    site: { ...doc.site, createdPageLayouts: { legal: { articleLayout: null, why: WHY } } }
  }
  assert.deepEqual(judge(boxingRelease, legalNone).params.none, ['createdPageLayouts.legal'])
  const legalBare = {
    ...doc,
    site: { ...doc.site, createdPageLayouts: { legal: { articleLayout: null, why: '' } } }
  }
  assert.deepEqual(judge(boxingRelease, legalBare).params.fields, ['createdPageLayouts.legal'])
})

test('an entry the write step would leave out does not count as declared', () => {
  const doc = kitAt(BOXING)
  const bad = { ...doc, site: { ...doc.site, selfLinkButtons: [{ container: '.a .b', why: WHY }] } }
  const judged = judge(boxingRelease, bad)
  assert.deepEqual(judged.params.fields, ['selfLinkButtons'])
  assert.match(judged.params.problems.join(' '), /compound/)
})

test('the same fault gives the same code on a T3 kit and a T4 kit', () => {
  assert.equal(judge(dinerRelease, dinerShaped()).state, 'done')
  for (const { field } of HIDDEN_KIT_FIELDS) {
    const t3 = judge(dinerRelease, without(dinerShaped(), field))
    const t4 = judge(boxingRelease, without(kitAt(BOXING), field))
    assert.deepEqual([t3.state, t3.code, t3.params.fields], [t4.state, t4.code, t4.params.fields], field)
  }
})

test('JA Diner 1.0.5 as committed declares none of the five', () => {
  const judged = judge(dinerRelease, kitAt(DINER))
  assert.equal(judged.state, 'todo')
  assert.equal(judged.code, 'kit-hidden-field-missing')
  assert.deepEqual(
    judged.params.fields,
    HIDDEN_KIT_FIELDS.map((f) => f.field)
  )
})

test('the check does not apply off Joomla, or without a readable kit (the kit step says that)', () => {
  const wp = release('quickstart/ja-example/wp7', '1.0.0', 'wordpress')
  assert.equal(
    HIDDEN_KIT_FIELDS_CHECK.judge(wp, { templateKit: { state: 'read', doc: kitAt(BOXING) } }, {}),
    null
  )
  assert.equal(HIDDEN_KIT_FIELDS_CHECK.judge(boxingRelease, { templateKit: { state: 'none' } }, {}), null)
})

test('in the verdict: the latest JA Boxing release stays green, the latest JA Diner names all five', () => {
  const contracts = defaultContracts()
  const pieceOf = (name) => {
    const r = releaseOfPin(latestPin(name), contracts)
    const verdict = readinessVerdict(r, { contracts, server: false, checks: [HIDDEN_KIT_FIELDS_CHECK] })
    return verdict.pieces.find((p) => p.piece === 'template-kit')
  }
  const boxing = pieceOf('ja-boxing')
  assert.deepEqual(
    [boxing.step, boxing.state, boxing.code],
    ['kit-hidden-fields', 'done', 'kit-hidden-fields-declared']
  )
  const diner = pieceOf('ja-diner')
  assert.deepEqual(
    [diner.step, diner.state, diner.code],
    ['kit-hidden-fields', 'todo', 'kit-hidden-field-missing']
  )
  assert.deepEqual(
    diner.params.fields,
    HIDDEN_KIT_FIELDS.map((f) => f.field)
  )
  assert.deepEqual(hiddenKitFieldsOf(kitAt(DINER)).declared, [])
})

// ── T3 and T4 markup ─────────────────────────────────────────────────────────────────────────────────────────────────

test('the framework of a kit is the one its release profile records, never guessed from the template name', () => {
  assert.equal(frameworkOfKit(kitAt(BOXING)), 't4')
  assert.equal(frameworkOfKit(kitAt(DINER)), 't3')
  assert.equal(frameworkOfKit({ contract: 'ja-example/j6/9.9.9', template: { name: 'ja_example_t3' } }), null)
  assert.equal(frameworkOfKit(null), null)
})

test('a page is scoped where its framework prints the page classes: T4 body item-<id>, T3 html itemid-<id>', () => {
  // T3 prints the page classes on the html element (tpls/default.php: class='<jdoc:include type="pageclass" />') and
  // leaves body bare, as JA Diner 1.0.5 answers: html class 'com_contact view-contact itemid-117 ...', body with no class.
  const page = { option: 'com_content', view: 'article', id: 244 }
  assert.equal(pageBodyOf(page), 'body.com_content.view-article.item-244')
  assert.equal(pageBodyOf({ ...page, framework: 't4' }), 'body.com_content.view-article.item-244')
  assert.equal(pageBodyOf({ ...page, framework: 't3' }), 'html.com_content.view-article.itemid-244')
})

test('the self link and created page rules follow the framework, and the look guard takes both', () => {
  const openings = [
    { path: '/coaches', rows: [{ id: 195, link: 'index.php?option=com_content&view=category&id=8' }] }
  ]
  const t3 = selfLinkSelectorsFor(openings, ['.section-more'], 't3')
  assert.ok(t3.length > 0)
  assert.ok(t3.every((s) => s.startsWith('html.com_content.view-category.itemid-195 .section-more a[href=')))
  const t4 = selfLinkSelectorsFor(openings, ['.section-more'], 't4')
  assert.ok(t4.every((s) => s.startsWith('body.com_content.view-category.item-195 ')))
  const block = (list) =>
    `${SELF_LINKS_START}<style>${list.join(',')}{display:none!important}</style>${SELF_LINKS_END}`
  assert.equal(isSelfLinkBlock(block(t3), ['.section-more']), true)
  assert.equal(isSelfLinkBlock(block(t4), ['.section-more']), true)

  const created = createdHideSelectorsFor([{ id: 'legal:privacy', itemId: 301 }], ['.share-strip'], 't3')
  assert.deepEqual(created, ['html.com_content.view-article.itemid-301 .share-strip'])
  const hide = `<!-- tracy-created-hide:start --><style>${created[0]}{display:none!important}</style><!-- tracy-created-hide:end -->`
  assert.equal(isCreatedHideBlock(hide, ['.share-strip']), true)
})

test('the created page stage scopes a T3 kit by html itemid-<id>, from the framework its release records', async () => {
  let held = ''
  const door = {
    apply: async ({ action, params }) => {
      if (action === 'content.get') return { ok: true, item: { id: params.id, content: held } }
      held = params.fields.content
      return { ok: true }
    }
  }
  const kit = {
    ...dinerShaped(),
    site: {
      ...dinerShaped().site,
      head: { injection: { maxBytes: 8000, position: { name: 'foot-1', block: 'block-42' } } }
    }
  }
  const lines = await hideOnCreatedPages({
    door,
    siteKey: 'site-1',
    kit,
    created: [{ id: 'legal:privacy', itemId: 301 }]
  })
  assert.equal(lines[0]?.status, 'written', JSON.stringify(lines))
  assert.match(held, /html\.com_content\.view-article\.itemid-301 \.share-strip\{display:none!important\}/)
})
