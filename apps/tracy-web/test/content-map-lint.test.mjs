/**
 * The packing check of a content map's declarations (spec TracyHQ/tracy#189): each rule fires on a fictional map that
 * declares the defect and stays quiet on the same map declared right. Two trades, a bakery and a dental clinic, so no
 * rule leans on one template's words.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'

import { rolesOfRead } from '../src/lib/content-coverage/roles.js'
import { lintItemIconGrounds } from '../src/lib/content-map-lint-icons.js'
import { LINT_RULES, lintContentMap, lintContractDir } from '../src/lib/content-map-lint.js'
import { readSlotRoles } from '../src/lib/contract-slot-roles.js'

const V3 = 'place-content-roles/3'
const TRADES = [
  {
    trade: 'bakery',
    headline: 'Fresh bread every morning',
    subline: 'Sourdough and pastries baked on site.'
  },
  {
    trade: 'dental clinic',
    headline: 'Gentle care for every smile',
    subline: 'Checkups and cleaning for all ages.'
  }
]

const text = (key, entity, role, sample, extra = {}) => ({
  key,
  entity,
  type: 'text',
  role,
  sample,
  ...extra
})
const url = (key, entity, role, sample, extra = {}) => ({ key, entity, type: 'url', role, sample, ...extra })
const image = (key, entity, role, extra = {}) => ({
  key,
  entity,
  type: 'image',
  role,
  sample: `images/demo/${key}.jpg`,
  ...extra
})
const group = (id, kind, item = 0) => ({ group: { id, item, kind } })
const field = (name, index = 0) => ({ jsonPath: ['hero', `hero[${name}]`, index], label: `Hero / ${name}` })

/** A home page with a hero module (module-10) and the given slots. */
function mapOf(slots, extra = {}) {
  return {
    roleVocabularyVersion: V3,
    entities: [
      { key: 'module-10', kind: 'module', identity: { module: 'mod_ja_acm', position: 'hero' } },
      { key: 'module-20', kind: 'module', identity: { module: 'mod_ja_acm', position: 'section-1' } },
      { key: 'module-30', kind: 'module', identity: { module: 'mod_ja_acm', position: 'section-2' } },
      { key: 'article-1', kind: 'article' }
    ],
    pages: [
      {
        route: 'home',
        assignedModules: ['module-10', 'module-20', 'module-30'].map((entity) => ({
          entity,
          position: entity === 'module-10' ? 'hero' : 'section-1',
          published: '1'
        }))
      }
    ],
    slots,
    ...extra
  }
}

/** The hero of a trade, its subline and button declared right. */
function hero({ headline, subline }, { sublineGroup = true, buttonGroup = true, link = true } = {}) {
  const card = group('module-10.business', 'business')
  return [
    text('module-10.0', 'module-10', 'claim.heading', headline, { ...card, ...field('title') }),
    text('module-10.1', 'module-10', 'editorial.paragraph', subline, {
      ...(sublineGroup ? card : {}),
      ...field('desc')
    }),
    text('module-10.2', 'module-10', 'contact.cta_label', 'Book a visit', {
      ...group('module-10.cta.0', 'contact'),
      ...field('button')
    }),
    ...(link
      ? [
          url('module-10.3', 'module-10', 'contact.cta_url', 'index.php?Itemid=1', {
            ...(buttonGroup ? group('module-10.cta.0', 'contact') : group('module-10.cta.9', 'contact')),
            ...field('btn-link')
          })
        ]
      : [])
  ]
}

const rulesOf = (map, rows = null) => lintContentMap(map, { rows }).findings.map((f) => `${f.rule} ${f.key}`)

test('every rule names what it checks, its severity and a fix hint', () => {
  const ids = new Set()
  for (const rule of LINT_RULES) {
    assert.match(rule.id, /^[a-z]+(?:-[a-z]+)+$/)
    assert.ok(!ids.has(rule.id), `${rule.id} twice`)
    ids.add(rule.id)
    assert.ok(['error', 'warning'].includes(rule.severity))
    assert.ok(rule.checks.length > 20 && rule.fix.length > 40, `${rule.id} needs words`)
    assert.doesNotMatch(`${rule.checks} ${rule.fix}`, /[–—]/)
  }
})

test('a map that declares no roles is not read', () => {
  assert.deepEqual(lintContentMap({ slots: [{ key: 'a', type: 'text' }] }), {
    declared: false,
    findings: [],
    errors: 0,
    warnings: 0
  })
})

for (const t of TRADES) {
  test(`${t.trade}: a hero declared right has no finding`, () => {
    assert.deepEqual(rulesOf(mapOf(hero(t))), [])
  })

  test(`${t.trade}: a hero subline outside the headline's group is a warning`, () => {
    const res = lintContentMap(mapOf(hero(t, { sublineGroup: false })))
    assert.deepEqual(
      res.findings.map((f) => [f.rule, f.severity, f.key]),
      [['hero-subline-ungrouped', 'warning', 'module-10.1']]
    )
    assert.equal(res.errors, 0)
  })

  test(`${t.trade}: a hero button with a link outside its group is a warning, with no link an error`, () => {
    assert.deepEqual(rulesOf(mapOf(hero(t, { buttonGroup: false }))), ['hero-button-unpaired module-10.2'])
    const res = lintContentMap(mapOf(hero(t, { link: false })))
    assert.deepEqual(
      res.findings.map((f) => [f.rule, f.severity]),
      [['hero-button-no-link', 'error']]
    )
  })

  test(`${t.trade}: a gallery picture inside an article is a card thumbnail, a gallery module is not`, () => {
    const slots = [
      ...hero(t),
      image('article-1.4', 'article-1', 'business.gallery_image', group('article-1.video.1', 'gallery', 1)),
      image('module-20.0', 'module-20', 'business.gallery_image', group('module-20.gallery.0', 'gallery')),
      text('module-20.1', 'module-20', 'editorial.paragraph', '', group('module-20.gallery.0', 'gallery'))
    ]
    assert.deepEqual(rulesOf(mapOf(slots)), ['gallery-in-article article-1.4'])
  })

  test(`${t.trade}: a gallery group with a title or a video is a card list`, () => {
    const card = group('module-20.video.0', 'gallery')
    const slots = [
      ...hero(t),
      image('module-20.0', 'module-20', 'business.gallery_image', card),
      text('module-20.1', 'module-20', 'editorial.heading', `Our ${t.trade} tour`, card),
      url('module-20.2', 'module-20', 'business.video', 'abc123', card)
    ]
    assert.deepEqual(rulesOf(mapOf(slots)), ['gallery-group-is-a-card module-20.0'])
  })

  test(`${t.trade}: a styled HTML unit with a plain sample is a warning; a unit with a link inside is an error`, () => {
    const unit = (key, sample, column) =>
      text(key, 'module-20', 'editorial.heading', sample, { column, xpath: '/html/body/div' })
    const slots = [
      ...hero(t),
      unit('module-20.5', 'OUR SERVICES', 'content'),
      unit('module-20.6', 'Call us today', 'note')
    ]
    const rows = {
      'module-20': { content: 'OUR<br/><span>SERVICES</span>', note: 'Call us <a href="tel:1">today</a>' }
    }
    const res = lintContentMap(mapOf(slots), { rows })
    assert.deepEqual(
      res.findings.map((f) => [f.rule, f.severity, f.key]),
      [
        ['styled-unit-plain-sample', 'warning', 'module-20.5'],
        ['unit-markup-not-inline', 'error', 'module-20.6']
      ]
    )
    // Without the release's rows nothing can be told.
    assert.deepEqual(rulesOf(mapOf(slots)), [])
  })

  test(`${t.trade}: a layout setting declared as page copy is a warning`, () => {
    const slots = [
      ...hero(t),
      text('module-20.3', 'module-20', 'editorial.paragraph', '32', { label: 'Gallery / gutter' }),
      text('module-20.4', 'module-20', 'editorial.paragraph', '4 seasons', { label: 'Gallery / title' })
    ]
    assert.deepEqual(rulesOf(mapOf(slots)), ['layout-setting-as-text module-20.3'])
  })

  test(`${t.trade}: a social list bound item by item must be a repeatable list`, () => {
    const social = (i) => [
      text(`module-30.${i}`, 'module-30', 'contact.social_label', ['Facebook', 'Instagram'][i], {
        ...group(`module-30.social.${i}`, 'contact'),
        jsonPath: ['social', 'social[title]', i]
      }),
      url(`module-30.${i + 2}`, 'module-30', 'contact.social_url', '#', {
        ...group(`module-30.social.${i}`, 'contact'),
        jsonPath: ['social', 'social[link]', i]
      })
    ]
    const slots = [...hero(t), ...social(0), ...social(1)]
    assert.deepEqual(rulesOf(mapOf(slots)), ['social-list-fixed-length module-30.0'])
    const listed = mapOf(slots, {
      repeatableLists: { 'module-30.social': { itemTemplate: 'module-30.social.0', min: 0, max: 2 } }
    })
    assert.deepEqual(rulesOf(listed), [])
  })

  test(`${t.trade}: a person's links declared as the business's are an error`, () => {
    const person = group('module-20.person.0', 'person')
    const slots = [
      ...hero(t),
      text('module-20.0', 'module-20', 'person.name', 'Robin Example', person),
      url('module-20.1', 'module-20', 'contact.social_url', '#', group('module-20.social.0', 'contact'))
    ]
    const res = lintContentMap(mapOf(slots))
    assert.deepEqual(
      res.findings.map((f) => [f.rule, f.severity, f.key]),
      [['social-in-person-card', 'error', 'module-20.1']]
    )
    slots[slots.length - 1] = url('module-20.1', 'module-20', 'person.social_url', '#', person)
    assert.deepEqual(rulesOf(mapOf(slots)), [])
  })

  test(`${t.trade}: a kept icon picture in a social card is a warning`, () => {
    const card = group('module-30.social.0', 'contact')
    const slots = [
      ...hero(t),
      url('module-30.0', 'module-30', 'contact.social_url', '#', card),
      image('module-30.1', 'module-30', 'editorial.item_icon', {
        ...card,
        customize: 'keep',
        fit: { replace: 'keep' }
      })
    ]
    assert.deepEqual(rulesOf(mapOf(slots)), ['social-icon-kept module-30.1'])
  })
}

/** A 96px icon: a glyph on a filled disc, or the same glyph alone on transparency. */
async function iconPng(onDisc) {
  const disc = onDisc ? '<circle cx="48" cy="48" r="46" fill="#1f6feb"/>' : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">${disc}<path d="M30 48h36M48 30v36" stroke="${onDisc ? '#ffffff' : '#222222'}" stroke-width="8"/></svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

test('an item icon drawn on a disc is reported from its picture; a bare glyph is not', async () => {
  const files = { 'images/demo/disc.png': await iconPng(true), 'images/demo/bare.png': await iconPng(false) }
  const map = mapOf([
    image('module-20.0', 'module-20', 'editorial.item_icon', {
      sample: 'images/demo/disc.png#joomlaImage://x'
    }),
    image('module-20.1', 'module-20', 'editorial.item_icon', { sample: 'images/demo/bare.png' })
  ])
  const found = await lintItemIconGrounds(map, (file) => files[file] ?? null)
  assert.deepEqual(
    found.map((f) => [f.rule, f.key]),
    [['item-icon-ground-undeclared', 'module-20.0']]
  )
})

test('a contract folder is read with the rows of its presentation lock, and /ops reads an error as an invalid declaration', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'content-map-lint-'))
  const at = path.join(dir, 'demo', 'j6', '1.0.0')
  mkdirSync(at, { recursive: true })
  const person = group('module-20.person.0', 'person')
  const map = mapOf([
    ...hero(TRADES[1]),
    text('module-20.0', 'module-20', 'person.name', 'Robin Example', person),
    url('module-20.1', 'module-20', 'contact.social_url', '#', group('module-20.social.0', 'contact')),
    text('module-20.5', 'module-20', 'editorial.heading', 'OUR TEAM', {
      column: 'content',
      xpath: '/html/body/div'
    })
  ])
  writeFileSync(path.join(at, 'content-map.json'), JSON.stringify(map))
  writeFileSync(
    path.join(at, 'presentation-lock.json'),
    JSON.stringify({ entities: { 'module-20': { content: 'OUR<br/><span>TEAM</span>' } } })
  )
  const res = lintContractDir(at)
  assert.deepEqual(
    res.findings.map((f) => f.rule),
    ['styled-unit-plain-sample', 'social-in-person-card']
  )
  const roles = rolesOfRead({ ...readSlotRoles(at), source: 'content-map', state: 'ready', errors: [] }, at)
  assert.equal(roles.state, 'invalid')
  assert.match(roles.reason, /^declaration rule social-in-person-card \(1 error\): module-20\.1 .*Fix: /)
  assert.deepEqual(roles.lint, {
    errors: 1,
    warnings: 1,
    rules: [
      { rule: 'styled-unit-plain-sample', severity: 'warning', count: 1 },
      { rule: 'social-in-person-card', severity: 'error', count: 1 }
    ]
  })
})
