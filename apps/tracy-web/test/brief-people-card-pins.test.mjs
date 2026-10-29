import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { planFill } from 'website-opportunities/domain/fill-plan.mjs'
import { planSite } from 'website-opportunities/domain/site-plan.mjs'
import { copyPinsOf } from '../src/sites/brief-engines/wo-copy-pins.js'

const served = { set: { contentHash: 'c'.repeat(64) }, questions: [{ id: 'name', kind: 'text' }] }

// Fictional businesses in two unrelated trades, with people accepted from guest reviews.
const trades = [
  { name: 'Brightwater Dental', person: 'Mara Vale', role: 'dentist', service: 'Cleaning' },
  { name: 'Crumb and Kettle', person: 'Elsie Reed', role: 'baker', service: 'Sourdough' }
]

function scenario(t, trade) {
  const brief = {
    business: { name: trade.name },
    facts: [
      {
        id: 'f1',
        field: 'team',
        value: { name: trade.person, role: trade.role },
        onSite: true,
        reasons: ['review-only-person']
      }
    ],
    reading: {
      team: [{ id: 'p1', label: trade.person, role: trade.role, factId: 'f1' }],
      services: [{ id: 's1', label: trade.service, quote: trade.service }]
    }
  }
  const slots = [0, 1].flatMap((item) =>
    ['person.name', 'person.role', 'person.image'].map((role, field) => ({
      key: `module-40.${item * 3 + field}`,
      entity: 'module-40',
      type: role === 'person.image' ? 'image' : 'text',
      role,
      sample: role === 'person.image' ? `images/demo/${item}.jpg` : 'Demo person',
      maxCharacters: 100,
      column: 'params',
      jsonPath: ['team', `team[${field}]`, item],
      group: { id: `module-40.person.${item}`, item, kind: 'person' }
    }))
  )
  const map = { roleVocabularyVersion: 'place-content-roles/3', entities: [], pages: [], slots }
  const dir = mkdtempSync(path.join(tmpdir(), 'people-card-pins-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify(map))
  const plan = planSite(brief, served, { contentMap: map, now: '2026-10-29T00:00:00.000Z' })
  const ctx = {
    siteKey: 'fictional',
    email: 'owner@example.com',
    contract: { id: 'fictional/j6/1.0.0', dir },
    note() {}
  }
  // An older profile has no accepted people, while the frozen brief's decision accepts one.
  const store = {
    copyFor: async () => ({ buildId: 'b1', pinned: {}, placeProfile: { profile: {}, assessment: [] } }),
    sitePlanFor: async () => plan
  }
  return { brief, map, plan, ctx, store }
}

for (const trade of trades)
  test(`${trade.name}: accepted person's name and role survive empty profile pins beside their avatar`, async (t) => {
    const { brief, map, plan, ctx, store } = scenario(t, trade)
    const copy = await copyPinsOf(store, ctx, { cms: 'joomla', contentMap: map, lang: 'en' })
    assert.ok(copy, 'the production pin reader made a slot plan')
    assert.equal(copy.pins['module-40.0'], trade.person)
    assert.equal(copy.pins['module-40.1'], trade.role[0].toUpperCase() + trade.role.slice(1))
    assert.ok(!copy.placeholders.includes('module-40.0'))
    assert.equal(copy.slotFill.manifest.find((m) => m.slotKey === 'module-40.0').state, 'sourced')
    const fill = planFill({ contentMap: map, brief, cardNames: plan.honesty.cardNames })
    const avatar = fill.slots.find((s) => s.key === 'module-40.2').substitute
    assert.equal(avatar.personId, 'p1')
    assert.equal(avatar.initials, trade.person === 'Mara Vale' ? 'MV' : 'ER')
    assert.ok(!('module-40.3' in copy.pins), 'the unaccepted card is left to the removal decision')
  })

for (const trade of trades)
  test(`${trade.name}: a card whose accepted name cannot fit is taken off with its avatar`, (t) => {
    const { brief, map } = scenario(t, trade)
    map.slots.find((s) => s.key === 'module-40.0').maxCharacters = 1
    const plan = planSite(brief, served, { contentMap: map, now: '2026-10-29T00:00:00.000Z' })
    assert.equal(plan.honesty.records.find((r) => r.group === 'module-40.person.0').decision, 'hide')
    assert.ok(!('module-40.person.0' in plan.honesty.cardNames))
    const fill = planFill({ contentMap: map, brief, cardNames: plan.honesty.cardNames })
    assert.equal(fill.slots.find((s) => s.key === 'module-40.2').substitute.initials, '')
  })

for (const cms of ['joomla', 'wordpress'])
  test(`${cms}: all sourced slot roles outrank empty profile pins`, async (t) => {
    const { map, ctx, store } = scenario(t, trades[0])
    const roles = [
      'offering.name',
      'contact.phone',
      'contact.email',
      'contact.address',
      'person.name',
      'person.role'
    ]
    // The legacy map supplies the title while the profile fill has no corresponding identity fact.
    const { slotRolesFor } = await import('website-opportunities/domain/contract-copy-pins.mjs')
    const legacy = slotRolesFor(cms, 'tracy-business')
    const key = legacy.roles['hero.title'][0].text
    map.roleVocabularyVersion = undefined
    map.slots = [{ key, type: 'text', sample: 'Demo name', maxCharacters: 100 }]
    writeFileSync(path.join(ctx.contract.dir, 'content-map.json'), JSON.stringify(map))
    // No declared roles: a hand map remains the only source. The same build's stronger brief decision still wins.
    ctx.contract.id = 'tracy-business/fictional/1.0.0'
    store.copyFor = async () => ({
      buildId: 'b1',
      pinned: { 'hero.title': { value: 'Brightwater Dental', source: 'business.name' } }
    })
    store.sitePlanFor = async () => ({
      honesty: { values: { [key]: { value: 'Brightwater Dental', reason: 'brief-fact' } } }
    })
    const copy = await copyPinsOf(store, ctx, { cms, contentMap: map, lang: 'en' })
    assert.equal(copy.pins[key], 'Brightwater Dental')
    // Each supported fact role is exercised through the production reader, not the merge helper.
    for (const role of roles) {
      const field = map.slots[0]
      map.roleVocabularyVersion = 'place-content-roles/3'
      field.role = role
      field.group = {
        id: 'module-40.fact.0',
        item: 0,
        kind: role.startsWith('person.') ? 'person' : role.startsWith('offering.') ? 'service' : 'contact'
      }
      if (role === 'person.role') map.slots.push({ ...field, key: 'module-40.name', role: 'person.name' })
      writeFileSync(path.join(ctx.contract.dir, 'content-map.json'), JSON.stringify(map))
      store.copyFor = async () => ({
        buildId: 'b1',
        pinned: {},
        placeProfile: { profile: {}, assessment: [] }
      })
      const actual = await copyPinsOf(store, ctx, { cms, contentMap: map, lang: 'en' })
      assert.ok(actual, role)
      assert.equal(actual.pins[key], 'Brightwater Dental', role)
      assert.ok(!actual.placeholders.includes(key), role)
      // Strong brief facts also appear as value decisions outside the honesty records.
      store.sitePlanFor = async () => ({
        slots: [{ key, decision: 'value', value: 'Brightwater Dental', reason: 'brief-fact' }]
      })
      const fromBrief = await copyPinsOf(store, ctx, { cms, contentMap: map, lang: 'en' })
      assert.equal(fromBrief.pins[key], 'Brightwater Dental', `${role}: brief fact`)
      store.sitePlanFor = async () => ({
        honesty: { values: { [key]: { value: 'Brightwater Dental', reason: 'brief-fact' } } }
      })
    }
  })

for (const trade of trades)
  test(`${trade.name}: the role can occupy the free line under the accepted name`, async (t) => {
    const { brief, map, ctx, store } = scenario(t, trade)
    map.slots.find((s) => s.key === 'module-40.1').role = 'editorial.paragraph'
    writeFileSync(path.join(ctx.contract.dir, 'content-map.json'), JSON.stringify(map))
    store.sitePlanFor = async () =>
      planSite(brief, served, { contentMap: map, now: '2026-10-29T00:00:00.000Z' })
    const copy = await copyPinsOf(store, ctx, { cms: 'joomla', contentMap: map, lang: 'en' })
    assert.equal(copy.pins['module-40.0'], trade.person)
    assert.equal(copy.pins['module-40.1'], trade.role[0].toUpperCase() + trade.role.slice(1))
  })
