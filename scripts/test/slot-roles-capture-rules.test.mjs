// Spec #37 C2, C4, C5: what the rule tables place on a Joomla content map. Every business, field and address below is
// made up; the maps are what a capture of a fictional template ("Harbour" modules) would hand over.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkContentMapRoles } from '../../packages/wo/website-opportunities/domain/content-map-roles.mjs'
import { FACT_FAMILY_ROLES, proposeContentMapRoles } from '../slot-roles/rule-tables.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const V2 = 'place-content-roles/2'
const V3 = 'place-content-roles/3'

/** An ACM slot: `block[field]` at `index`, the shape the capture writes. */
const acm = (key, field, sample, index = 0, extra = {}) => ({
  key,
  entity: 'module-7',
  column: 'params',
  type: extra.type ?? 'text',
  sample,
  maxCharacters: 80,
  requiresEvidence: false,
  jsonPath: ['hero', `hero[${field}]`, index],
  nestedJson: 'jatools-config',
  ...extra
})
/** An HTML slot cut out of a module body. */
const html = (key, xpath, type, sample, extra = {}) => ({
  key,
  entity: 'module-9',
  column: 'content',
  type,
  sample,
  maxCharacters: 80,
  requiresEvidence: false,
  xpath,
  ...extra
})

const propose = (slots, vocabulary) =>
  proposeContentMapRoles({ slots }, { cms: 'joomla', vocabulary }).contentMap.slots
const by = (slots) => Object.fromEntries(slots.map((s) => [s.key, s]))
const roleAndGroup = (s) => [s.role, s.group?.id ?? null, s.group?.kind ?? null]

test('C5: an email label is words, an eyebrow is words, and neither is hours or a category label', () => {
  const out = by(
    propose([
      acm('module-7.0', 'email', 'hello@larkspur.example'),
      acm('module-7.1', 'email-label', 'Write to us'),
      acm('module-7.2', 'eyebrow', 'Our harbour yard')
    ])
  )
  assert.equal(out['module-7.0'].role, 'contact.email')
  assert.equal(out['module-7.1'].role, 'editorial.heading')
  assert.equal(out['module-7.1'].group, undefined)
  assert.equal(out['module-7.2'].role, 'editorial.heading')
  assert.equal(out['module-7.2'].group, undefined)
})

test('C5: the title of an article that needs evidence is an article title in v3, a heading in v2', () => {
  const slots = () => [
    {
      key: 'article-4.0',
      entity: 'article-4',
      column: 'title',
      type: 'text',
      sample: 'Team schedule',
      requiresEvidence: true
    },
    {
      key: 'menuItem-8.0',
      entity: 'menuItem-8',
      column: 'title',
      type: 'text',
      sample: 'Team',
      requiresEvidence: true
    }
  ]
  const v2 = by(propose(slots(), V2))
  assert.equal(v2['article-4.0'].role, 'editorial.heading')
  assert.equal(v2['menuItem-8.0'].role, 'editorial.menu_label')
  const v3 = proposeContentMapRoles({ slots: slots() }, { cms: 'joomla', vocabulary: V3 })
  const out = by(v3.contentMap.slots)
  assert.equal(v3.contentMap.roleVocabularyVersion, V3)
  assert.deepEqual(roleAndGroup(out['article-4.0']), ['article.title', 'article-4.article.0', 'post'])
  assert.equal(out['menuItem-8.0'].role, 'editorial.menu_label')
  assert.deepEqual(checkContentMapRoles(v3.contentMap).errors, [])
})

test('C5: a call-to-action label and its link share one group, and a second button has its own', () => {
  const out = by(
    propose([
      acm('module-7.0', 'btn-text', 'Book a tour'),
      acm('module-7.1', 'btn-link', 'index.php?Itemid=12', 0, { type: 'url' }),
      acm('module-7.2', 'btn-text-2', 'See prices'),
      acm('module-7.3', 'btn-link-2', 'index.php?Itemid=14', 0, { type: 'text' })
    ])
  )
  assert.deepEqual(roleAndGroup(out['module-7.0']), ['contact.cta_label', 'module-7.section.0', 'contact'])
  assert.deepEqual(roleAndGroup(out['module-7.1']), ['contact.cta_url', 'module-7.section.0', 'contact'])
  assert.deepEqual(roleAndGroup(out['module-7.2']), ['contact.cta_label', 'module-7.cta.2', 'contact'])
  assert.deepEqual(roleAndGroup(out['module-7.3']), ['contact.cta_url', 'module-7.cta.2', 'contact'])
})

test('C5: a button written in the module body pairs its label and its link; an inline link does not', () => {
  const out = by(
    propose([
      html('module-9.0', '/html/body/div/a/text()', 'text', 'Join the yard'),
      html('module-9.1', '/html/body/div/a/@href', 'url', 'index.php?Itemid=3'),
      html('module-9.2', '/html/body/div/p', 'text', 'Read our harbour rules'),
      html('module-9.3', '/html/body/div/p/a/@href', 'url', 'index.php?Itemid=9')
    ])
  )
  assert.deepEqual(roleAndGroup(out['module-9.0']), [
    'contact.cta_label',
    'module-9.content.cta.a',
    'contact'
  ])
  assert.deepEqual(roleAndGroup(out['module-9.1']), ['contact.cta_url', 'module-9.content.cta.a', 'contact'])
  assert.equal(out['module-9.2'].role, 'editorial.paragraph', 'a whole paragraph slot reads as a paragraph')
  assert.equal(out['module-9.3'].role, undefined, 'v2 has no role for a link inside a sentence')
  const v3 = by(propose([html('module-9.3', '/html/body/div/p/a/@href', 'url', 'index.php?Itemid=9')], V3))
  assert.equal(v3['module-9.3'].role, 'editorial.navigation_url')
})

const FOOTER = () => [
  html('module-9.0', '/html/body/div/ul/li[1]/a/@href', 'url', 'index.php?Itemid=21'),
  html('module-9.1', '/html/body/div/ul/li[1]/a/text()', 'text', 'Classes'),
  html('module-9.2', '/html/body/div/ul/li[2]/a/@href', 'url', 'index.php?Itemid=22'),
  html('module-9.3', '/html/body/div/ul/li[2]/a/text()', 'text', 'Prices'),
  html('module-9.4', '/html/body/div/ul/li[3]/a/@href', 'url', 'https://www.facebook.com/larkspurtearoom'),
  html('module-9.5', '/html/body/div/ul/li[3]/a/text()', 'text', 'Facebook')
]

test('C2: a link list is grouped one item per card; the v3 roles label its links and its pages', () => {
  const v3 = proposeContentMapRoles({ slots: FOOTER() }, { cms: 'joomla', vocabulary: V3 })
  const out = by(v3.contentMap.slots)
  const list = 'module-9.content.ul'
  assert.deepEqual(roleAndGroup(out['module-9.0']), ['editorial.navigation_url', `${list}.0`, 'business'])
  assert.deepEqual(roleAndGroup(out['module-9.1']), ['editorial.menu_label', `${list}.0`, 'business'])
  assert.deepEqual(roleAndGroup(out['module-9.3']), ['editorial.menu_label', `${list}.1`, 'business'])
  assert.equal(out['module-9.3'].group.item, 1)
  // A social network is a contact whatever list it sits in.
  assert.deepEqual(roleAndGroup(out['module-9.4']), ['contact.social_url', `${list}.2`, 'contact'])
  assert.deepEqual(roleAndGroup(out['module-9.5']), ['contact.social_label', `${list}.2`, 'contact'])
  assert.deepEqual(checkContentMapRoles(v3.contentMap).errors, [])
})

test('C2: in v2 the same list keeps labels editorial, groups only the social items and leaves page links alone', () => {
  const out = by(propose(FOOTER(), V2))
  assert.deepEqual(roleAndGroup(out['module-9.1']), ['editorial.menu_label', null, null])
  assert.equal(out['module-9.0'].role, undefined)
  assert.deepEqual(roleAndGroup(out['module-9.4']), [
    'contact.social_url',
    'module-9.content.ul.2',
    'contact'
  ])
})

test('C2: two lists of one body do not share group ids, and a plain bullet is not a link item', () => {
  const out = by(
    propose(
      [
        html('module-9.0', '/html/body/div/ul[1]/li[1]/a/text()', 'text', 'Classes'),
        html('module-9.1', '/html/body/div/ul[2]/li[1]/a/text()', 'text', 'Prices'),
        html('module-9.2', '/html/body/div/ul[2]/li[2]', 'text', 'Rest 30 seconds')
      ],
      V3
    )
  )
  assert.notEqual(out['module-9.0'].group.id, out['module-9.1'].group.id)
  assert.equal(out['module-9.2'].group, undefined)
})

test('C4: a field the server fact list names gets its role from the family table, with no entry of its own', () => {
  const out = by(
    propose([
      acm('module-7.0', 'town', 'Oakmere', 0),
      acm('module-7.1', 'town', 'Fenwick', 1),
      acm('module-7.2', 'stats-number', '120', 0),
      acm('module-7.3', 'counter-label', 'Boats launched', 0),
      acm('module-7.4', 'speaker-bio', 'Taught sailing for years.', 0),
      acm('module-7.5', 'review-text', 'Quiet yard, fair price.', 0),
      acm('module-7.6', 'partner-name', 'Marlow Rope Works', 0),
      acm('module-7.7', 'plan-price', '40', 0),
      acm('module-7.8', 'dish-price', '9', 0)
    ])
  )
  assert.deepEqual(roleAndGroup(out['module-7.0']), ['contact.address', 'module-7.place.0', 'contact'])
  assert.deepEqual(roleAndGroup(out['module-7.1']), ['contact.address', 'module-7.place.1', 'contact'])
  assert.deepEqual(roleAndGroup(out['module-7.2']), ['stat.value', 'module-7.stat.0', 'stat_item'])
  assert.deepEqual(roleAndGroup(out['module-7.3']), ['stat.label', 'module-7.stat.0', 'stat_item'])
  assert.equal(out['module-7.4'].role, 'person.bio')
  assert.equal(out['module-7.5'].role, 'quote.text')
  assert.equal(out['module-7.6'].role, 'claim.entity_name')
  assert.equal(out['module-7.7'].role, 'package.price')
  assert.equal(out['module-7.8'].role, 'offering.price')
})

test('C4: a bare "label" beside a "value" is a stat label, as the server reads it', () => {
  const out = by(propose([acm('module-7.0', 'value', '12'), acm('module-7.1', 'label', 'Years afloat')]))
  assert.equal(out['module-7.0'].role, 'stat.value')
  assert.equal(out['module-7.1'].role, 'stat.label')
  assert.equal(out['module-7.1'].group.id, out['module-7.0'].group.id)
})

test('C4: every role family of the server fact list has a place in the family table', () => {
  const rules = JSON.parse(readFileSync(path.join(ROOT, 'apps/tracy-web/src/lib/fact-fields.json'), 'utf8'))
  assert.deepEqual(Object.keys(FACT_FAMILY_ROLES).sort(), Object.keys(rules.roles).sort())
})
