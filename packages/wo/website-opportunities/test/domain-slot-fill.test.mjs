import assert from 'node:assert/strict'
import { test } from 'node:test'
import { neutralFor } from '../domain/neutral-copy.mjs'
import { emptyPlaceProfile, validatePlaceProfile } from '../domain/place-profile.mjs'
import { validateSlotFillManifest } from '../domain/slot-fill-manifest.mjs'
import { planSlotFill, provisionalAssessment } from '../domain/slot-fill.mjs'

/** A small valid profile: every fact gets its own evidence from one website source. */
function profileOf(build) {
  const doc = emptyPlaceProfile('business_1')
  doc.sources.push({ id: 'source_site', kind: 'website', ref: 'https://place.test' })
  let n = 0
  const fact = (value, extra = {}) => {
    n += 1
    const evidence = `evidence_${n}`
    doc.evidence.push({
      id: evidence,
      sourceId: 'source_site',
      locator: { kind: 'url', value: `https://place.test/#${n}` },
      extraction: { method: 'test', version: '1' }
    })
    return { id: extra.id ?? `fact_${n}`, value, evidenceRefs: [evidence] }
  }
  build(doc, fact)
  const checked = validatePlaceProfile(doc)
  assert.equal(checked.ok, true, JSON.stringify(checked.errors))
  return doc
}

const price = (raw, extra = {}) => ({ kind: raw ? 'exact' : 'unknown', raw, ...extra })
const dish = (name, raw, extra = {}) => ({
  kind: 'dish',
  name,
  variants: [{ price: price(raw, extra.price) }],
  ...(extra.description ? { description: extra.description } : {})
})

function cards(count, entityKind = 'menu_item', allowedKinds = ['menu_item', 'service', 'package']) {
  const groups = []
  const bindings = []
  for (let i = 0; i < count; i += 1) {
    const id = `menu.dish.${i}`
    groups.push({ id, entityKind, allowedKinds, itemIndex: i, requiredRoles: ['offering.name'] })
    bindings.push(
      { slotKey: `menu.name.${i}`, groupId: id, role: 'offering.name', mode: 'copy' },
      { slotKey: `menu.price.${i}`, groupId: id, role: 'offering.price', mode: 'format' },
      { slotKey: `menu.image.${i}`, groupId: id, role: 'offering.image', mode: 'asset' }
    )
  }
  return { schemaVersion: 'tracy-quickstart-slot-roles/v1', groups, bindings }
}

const byKey = (plan) => Object.fromEntries(plan.writes.map((w) => [w.slotKey, w]))

test('each card group takes every field from one entity: a dish without a price never borrows the next one', () => {
  const profile = profileOf((doc, fact) => {
    doc.offerings.push(fact(dish('Duck salad', ''), { id: 'dish_a' }))
    doc.offerings.push(fact(dish('Pho bo', '12'), { id: 'dish_b' }))
  })
  const plan = planSlotFill({
    slotRoles: cards(2),
    profile,
    assessment: provisionalAssessment(profile),
    locale: 'en',
    neutralFor
  })
  const w = byKey(plan)
  assert.equal(w['menu.name.0'].value, 'Duck salad')
  assert.equal(w['menu.name.0'].entityId, 'dish_a')
  assert.equal(w['menu.price.0'].state, 'empty')
  assert.equal(w['menu.price.0'].value, '')
  assert.equal(w['menu.price.0'].entityId, 'dish_a')
  assert.equal(w['menu.name.1'].value, 'Pho bo')
  assert.equal(w['menu.price.1'].value, '12')
  assert.equal(w['menu.price.1'].entityId, 'dish_b')
  assert.equal(validateSlotFillManifest(plan.manifest).ok, true)
})

test('fewer entities than cards: the spare cards keep every slot, neutral or empty, none dropped', () => {
  const profile = profileOf((doc, fact) => doc.offerings.push(fact(dish('Pho bo', '12'))))
  const plan = planSlotFill({
    slotRoles: cards(4),
    profile,
    assessment: provisionalAssessment(profile),
    locale: 'en',
    neutralFor
  })
  assert.equal(plan.writes.length, 12)
  const w = byKey(plan)
  for (const i of [1, 2, 3]) {
    assert.equal(w[`menu.name.${i}`].state, 'neutral')
    assert.equal(w[`menu.name.${i}`].value, 'Menu item')
    assert.equal(w[`menu.name.${i}`].neutralKey, 'neutral.offering.menu_item')
    assert.equal(w[`menu.price.${i}`].state, 'empty')
    assert.equal(w[`menu.image.${i}`].state, 'empty')
    assert.equal(w[`menu.name.${i}`].entityId, undefined)
  }
  assert.equal(validateSlotFillManifest(plan.manifest).ok, true)
})

test('two services with near-identical names keep their own price and photo', () => {
  const profile = profileOf((doc, fact) => {
    const a = fact(
      { kind: 'service', name: 'Deep tissue massage', variants: [{ price: price('60') }] },
      { id: 'svc_a' }
    )
    const b = fact(
      { kind: 'service', name: 'Deep tissue massage (90)', variants: [{ price: price('85') }] },
      { id: 'svc_b' }
    )
    doc.offerings.push(a, b)
    doc.media.push(
      fact(
        {
          kind: 'image',
          url: 'https://place.test/b.jpg',
          restrictions: [],
          relations: [{ entityId: 'svc_b', relation: 'depicts', evidenceRefs: b.evidenceRefs }]
        },
        { id: 'media_b' }
      ),
      fact(
        {
          kind: 'image',
          url: 'https://place.test/a.jpg',
          restrictions: [],
          relations: [{ entityId: 'svc_a', relation: 'depicts', evidenceRefs: a.evidenceRefs }]
        },
        { id: 'media_a' }
      )
    )
  })
  const plan = planSlotFill({
    slotRoles: cards(2, 'service', ['service', 'menu_item', 'package']),
    profile,
    assessment: provisionalAssessment(profile),
    locale: 'en',
    neutralFor
  })
  const w = byKey(plan)
  assert.deepEqual(
    [w['menu.name.0'].value, w['menu.price.0'].value, w['menu.image.0'].value.url],
    ['Deep tissue massage', '60', 'https://place.test/a.jpg']
  )
  assert.deepEqual(
    [w['menu.name.1'].value, w['menu.price.1'].value, w['menu.image.1'].value.url],
    ['Deep tissue massage (90)', '85', 'https://place.test/b.jpg']
  )
  assert.deepEqual(w['menu.image.1'].factRefs, ['svc_b', 'media_b'])
})

test('a withheld fact is never written, and its photo does not move to another card', () => {
  const profile = profileOf((doc, fact) => {
    doc.offerings.push(fact(dish('Off menu', '9'), { id: 'dish_withheld' }))
    doc.offerings.push(fact(dish('Banh mi', '5'), { id: 'dish_ok' }))
    doc.media.push(
      fact(
        {
          kind: 'image',
          url: 'https://place.test/off.jpg',
          restrictions: [],
          relations: [{ entityId: 'dish_withheld', relation: 'depicts', evidenceRefs: ['evidence_1'] }]
        },
        { id: 'media_off' }
      )
    )
  })
  const assessment = provisionalAssessment(profile).map((a) =>
    a.factId === 'dish_withheld' ? { ...a, status: 'withheld', onSite: false } : a
  )
  const plan = planSlotFill({ slotRoles: cards(2), profile, assessment, locale: 'en', neutralFor })
  const w = byKey(plan)
  assert.equal(w['menu.name.0'].value, 'Banh mi')
  assert.equal(w['menu.image.0'].state, 'empty')
  assert.equal(w['menu.name.1'].state, 'neutral')
  assert.ok(!JSON.stringify(plan.writes).includes('Off menu'))
  assert.ok(!JSON.stringify(plan.writes).includes('off.jpg'))
})

test('no assessment means nothing is accepted: every slot falls back to its neutral policy', () => {
  const profile = profileOf((doc, fact) => doc.offerings.push(fact(dish('Pho bo', '12'))))
  const plan = planSlotFill({ slotRoles: cards(1), profile, assessment: [], locale: 'en', neutralFor })
  assert.equal(byKey(plan)['menu.name.0'].state, 'neutral')
})

test('a shortened menu price prints its full amount in the site language (priceScale), sizes joined', () => {
  const profile = profileOf((doc, fact) => {
    doc.offerings.push(
      fact({
        kind: 'dish',
        name: 'Pho bo',
        variants: [
          { size: 'Small', price: price('55', { priceScale: 1000 }) },
          { size: 'Large', price: price('75', { priceScale: 1000 }) }
        ]
      })
    )
    doc.offerings.push(fact(dish('Tea', '1.50')))
  })
  const plan = planSlotFill({
    slotRoles: cards(2),
    profile,
    assessment: provisionalAssessment(profile),
    locale: 'vi',
    neutralFor
  })
  const w = byKey(plan)
  assert.equal(w['menu.price.0'].value, 'Small 55.000 · Large 75.000')
  assert.equal(w['menu.price.1'].value, '1.50')
  assert.equal(plan.offerings[0].price, 'Small 55.000 · Large 75.000')
})

function ctaSidecar() {
  return {
    schemaVersion: 'tracy-quickstart-slot-roles/v1',
    groups: [{ id: 'hero.0', entityKind: 'business', allowedKinds: ['business'], itemIndex: 0 }],
    bindings: [
      { slotKey: 'hero.name', groupId: 'hero.0', role: 'business.name', mode: 'verbatim' },
      { slotKey: 'hero.lead', groupId: 'hero.0', role: 'business.summary', mode: 'copy' },
      { slotKey: 'hero.cta', groupId: 'hero.0', role: 'contact.cta_label', mode: 'copy' },
      { slotKey: 'hero.href', groupId: 'hero.0', role: 'contact.cta_url', mode: 'copy' }
    ]
  }
}

test('a call to action needs a real contact target: with a phone it links to that number', () => {
  const profile = profileOf((doc, fact) => {
    doc.business.name = fact('Iron Gym', { id: 'name' })
    doc.business.phone = fact('+84 90 123 4567', { id: 'phone' })
  })
  const plan = planSlotFill({
    slotRoles: ctaSidecar(),
    profile,
    assessment: provisionalAssessment(profile),
    locale: 'en',
    neutralFor
  })
  const w = byKey(plan)
  assert.equal(w['hero.name'].value, 'Iron Gym')
  assert.equal(w['hero.cta'].value, 'Contact')
  assert.equal(w['hero.cta'].state, 'neutral')
  assert.equal(w['hero.href'].value, 'tel:+84901234567')
  assert.deepEqual(w['hero.href'].factRefs, ['phone'])
  // Prose about the business is the model's, pointed at the facts it may use.
  assert.equal(w['hero.lead'].state, 'composed')
  assert.equal(w['hero.lead'].value, null)
  assert.ok(w['hero.lead'].factRefs.includes('name'))
  assert.equal(validateSlotFillManifest(plan.manifest).ok, true)
})

test('a call to action with no contact target is empty: no label, no dead link', () => {
  const profile = profileOf((doc, fact) => {
    doc.business.name = fact('Iron Gym')
  })
  const plan = planSlotFill({
    slotRoles: ctaSidecar(),
    profile,
    assessment: provisionalAssessment(profile),
    locale: 'en',
    neutralFor
  })
  const w = byKey(plan)
  assert.equal(w['hero.cta'].state, 'empty')
  assert.equal(w['hero.href'].state, 'empty')
  assert.equal(w['hero.href'].value, '')
})

test('a team, a testimonial and steps the research never found stay empty or neutral, never a person', () => {
  const sidecar = {
    schemaVersion: 'tracy-quickstart-slot-roles/v1',
    groups: [
      { id: 'team.0', entityKind: 'person', allowedKinds: ['person'], itemIndex: 0 },
      { id: 'quote.0', entityKind: 'quote', allowedKinds: ['quote'], itemIndex: 0 },
      { id: 'step.1', entityKind: 'step', allowedKinds: ['step'], itemIndex: 1 },
      { id: 'stat.0', entityKind: 'stat_item', allowedKinds: ['stat_item'], itemIndex: 0 }
    ],
    bindings: [
      { slotKey: 'team.name', groupId: 'team.0', role: 'person.name', mode: 'copy' },
      { slotKey: 'team.image', groupId: 'team.0', role: 'person.image', mode: 'asset' },
      { slotKey: 'quote.text', groupId: 'quote.0', role: 'quote.text', mode: 'copy' },
      { slotKey: 'step.index', groupId: 'step.1', role: 'step.index', mode: 'format' },
      { slotKey: 'step.title', groupId: 'step.1', role: 'step.title', mode: 'copy' },
      { slotKey: 'stat.value', groupId: 'stat.0', role: 'stat.value', mode: 'verbatim' },
      { slotKey: 'stat.label', groupId: 'stat.0', role: 'stat.label', mode: 'copy' }
    ]
  }
  const profile = profileOf((doc, fact) => {
    // A review is kept off a demo; it is never a testimonial.
    doc.quotes.push(fact({ kind: 'review', text: 'Great place', restrictions: ['not-on-demo'] }))
  })
  const plan = planSlotFill({
    slotRoles: sidecar,
    profile,
    assessment: provisionalAssessment(profile),
    locale: 'vi',
    neutralFor
  })
  const w = byKey(plan)
  assert.equal(w['team.name'].state, 'empty')
  assert.equal(w['team.image'].state, 'empty')
  assert.equal(w['quote.text'].state, 'empty')
  assert.equal(w['step.index'].value, '02')
  assert.equal(w['step.title'].state, 'neutral')
  assert.equal(w['stat.value'].value, '—')
  assert.equal(w['stat.label'].state, 'empty')
  assert.equal(validateSlotFillManifest(plan.manifest).ok, true)
})

test('a statistic writes its number and leaves its label to the model, pointed at that one fact', () => {
  const sidecar = {
    schemaVersion: 'tracy-quickstart-slot-roles/v1',
    groups: [{ id: 'stat.0', entityKind: 'stat_item', allowedKinds: ['stat_item'], itemIndex: 0 }],
    bindings: [
      { slotKey: 'stat.value', groupId: 'stat.0', role: 'stat.value', mode: 'verbatim' },
      { slotKey: 'stat.label', groupId: 'stat.0', role: 'stat.label', mode: 'copy' }
    ]
  }
  const profile = profileOf((doc, fact) =>
    doc.claims.statistics.push(fact({ amount: 4.7, label: 'rating', scope: 'google' }, { id: 'rating' }))
  )
  const plan = planSlotFill({
    slotRoles: sidecar,
    profile,
    assessment: provisionalAssessment(profile),
    locale: 'en',
    neutralFor
  })
  const w = byKey(plan)
  assert.equal(w['stat.value'].value, '4.7')
  assert.equal(w['stat.label'].state, 'composed')
  assert.deepEqual(w['stat.label'].factRefs, ['rating'])
})

test('a gym on a restaurant template: spare dish cards say "Service", not "Menu item"', () => {
  const profile = profileOf((doc, fact) =>
    doc.classification.derivedCategories.push(
      fact({ taxonomy: 'tracy-trade', code: 'fitness', mappingVersion: 'tracy-trade/1' })
    )
  )
  const plan = planSlotFill({
    slotRoles: cards(1),
    profile,
    assessment: provisionalAssessment(profile),
    locale: 'en',
    neutralFor
  })
  assert.equal(byKey(plan)['menu.name.0'].value, 'Service')
})

test('the plan is the same for the same input, and needs a neutral resolver', () => {
  const profile = profileOf((doc, fact) => doc.offerings.push(fact(dish('Pho bo', '12'))))
  const input = {
    slotRoles: cards(2),
    profile,
    assessment: provisionalAssessment(profile),
    locale: 'en',
    neutralFor
  }
  assert.deepEqual(planSlotFill(input), planSlotFill(input))
  assert.throws(() => planSlotFill({ ...input, neutralFor: undefined }), /neutralFor/)
})
