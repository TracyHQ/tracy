// Seam 1 of spec TracyHQ/tracy#189 (ticket #191): the site plan, made from a brief revision, the questions the
// template's create door serves and the template's content map. Pure: no model, no site. The business below is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSite, SITE_PLAN_VERSION } from '../domain/site-plan.mjs'

const HASH = 'b'.repeat(64)

/** The questions a made-up cafe template serves: its Contact page sits under About. */
const served = {
  set: { contentHash: HASH },
  questions: [
    { id: 'name', kind: 'text' },
    { id: 'about', kind: 'longtext' },
    {
      id: 'pages',
      kind: 'multi',
      feeds: ['site.pages'],
      options: [
        'home',
        'about',
        'about/our-bakers',
        'about/journal',
        'about/contact-us',
        'menu',
        'pricing',
        'pages/elements'
      ],
      locked: ['home'],
      optionLabels: { 'about/contact-us': { en: 'Contact us' }, pricing: { en: 'Pricing' } }
    },
    { id: 'tone', kind: 'choice', options: ['plain', 'warm', 'bold'] }
  ]
}

/** A made-up neighbourhood bakery. */
function clubBrief() {
  return {
    madeAt: '2026-10-20T08:00:00.000Z',
    business: {
      name: 'Copperleaf Bakery',
      phone: '+44 20 7946 0321',
      email: 'hello@copperleaf.example',
      address: '14 Mill Lane, Ashby Vale',
      hours: ['Tue-Sun 07:00-15:00'],
      serviceAreas: [{ text: 'Ashby Vale and Lower Ashby' }]
    },
    contact: { whatsapp: { number: '+447700901111' } },
    brand: { voice: 'English; informal tone (observed from bio)' },
    reading: { about: 'A family bakery for sourdough and pastries in Ashby Vale.' },
    sitemap: [{ slug: 'home', sections: [{ kind: 'hero', copy: 'Copperleaf Bakery.' }] }],
    content: { items: [] }
  }
}

/** A trimmed content map: one hero picture, one demo email line, one demo phone line. */
const contentMap = {
  roleVocabularyVersion: 3,
  entities: [{ key: 'module-1', kind: 'module' }],
  pages: [],
  slots: [
    {
      key: 'module-1.0',
      entity: 'module-1',
      type: 'image',
      role: 'business.hero_image',
      sample: 'images/demo/hero/counter.jpg'
    },
    {
      key: 'module-1.1',
      entity: 'module-1',
      type: 'text',
      role: 'contact.email',
      sample: 'sale@demo.example'
    },
    { key: 'module-1.2', entity: 'module-1', type: 'text', role: 'contact.phone', sample: '(239) 555-0108' }
  ]
}

test('a brief with contact facts keeps the Contact page, though the template puts it under another page', () => {
  const plan = planSite(clubBrief(), served, { now: '2026-10-29T00:00:00.000Z' })
  const contact = plan.pages.find((p) => p.id === 'about/contact-us')
  assert.equal(contact.decision, 'keep')
  assert.equal(contact.reason, 'contact-facts')
  assert.ok(plan.answers.pages.includes('about/contact-us'), 'the create door is asked to keep it')
})

test('a brief without contact facts still drops a Contact page the template hides under another page', () => {
  const brief = clubBrief()
  brief.business = { name: 'Copperleaf Bakery' }
  delete brief.contact
  const plan = planSite(brief, served, { now: '2026-10-29T00:00:00.000Z' })
  assert.equal(plan.pages.find((p) => p.id === 'about/contact-us').decision, 'drop')
})

test('every contact fact of the brief is in the plan with the link it is written with', () => {
  const plan = planSite(clubBrief(), served, { now: '2026-10-29T00:00:00.000Z' })
  assert.deepEqual(plan.contact.phone, {
    value: '+44 20 7946 0321',
    href: 'tel:+442079460321',
    source: 'business.phone'
  })
  assert.deepEqual(plan.contact.email, {
    value: 'hello@copperleaf.example',
    href: 'mailto:hello@copperleaf.example',
    source: 'business.email'
  })
  assert.deepEqual(plan.contact.whatsapp, {
    value: '+447700901111',
    href: 'https://wa.me/447700901111',
    source: 'contact.whatsapp'
  })
  assert.equal(plan.contact.address.value, '14 Mill Lane, Ashby Vale')
  assert.equal(plan.contact.hours.value, 'Tue-Sun 07:00-15:00')
  assert.equal(plan.contact.serviceArea.value, 'Ashby Vale and Lower Ashby')
  // The create door takes them beside the answers, WhatsApp and service area included.
  assert.equal(plan.facts.whatsapp.value, '+447700901111')
  assert.equal(plan.facts.serviceArea.value, 'Ashby Vale and Lower Ashby')
})

test('the name, description and tone come from the brief, each with its reason', () => {
  const plan = planSite(clubBrief(), served, { now: '2026-10-29T00:00:00.000Z' })
  assert.deepEqual(plan.brand.name, { value: 'Copperleaf Bakery', reason: 'brief-name' })
  assert.deepEqual(plan.brand.description, {
    value: 'A family bakery for sourdough and pastries in Ashby Vale.',
    reason: 'brief-about'
  })
  assert.deepEqual(plan.brand.tone, { value: 'warm', reason: 'brief-voice' })
  assert.equal(plan.answers.name, 'Copperleaf Bakery')
  assert.equal(plan.questionnaire, HASH)
})

test('with a content map, each slot carries a decision and its reason', () => {
  const plan = planSite(clubBrief(), served, { now: '2026-10-29T00:00:00.000Z', contentMap })
  const byKey = Object.fromEntries(plan.slots.map((s) => [s.key, s]))
  assert.equal(byKey['module-1.1'].decision, 'value')
  assert.equal(byKey['module-1.1'].value, 'hello@copperleaf.example')
  assert.equal(byKey['module-1.2'].value, '+44 20 7946 0321')
  assert.ok(byKey['module-1.0'].reason, 'the picture slot says why')
})

test('the same brief and content map give the same plan, and the inputs are left as they were', () => {
  const brief = clubBrief()
  const before = JSON.stringify({ brief, served, contentMap })
  const a = planSite(brief, served, { now: '2026-10-29T00:00:00.000Z', contentMap })
  const b = planSite(clubBrief(), structuredClone(served), {
    now: '2026-10-29T00:00:00.000Z',
    contentMap: structuredClone(contentMap)
  })
  assert.equal(a.version, SITE_PLAN_VERSION)
  assert.deepEqual(a, b)
  assert.equal(JSON.stringify({ brief, served, contentMap }), before)
})

/** A pricing page of package cards and an intro: the bakery's brief holds no price. */
const pricingMap = {
  roleVocabularyVersion: 3,
  entities: [
    { key: 'menuItem-60', kind: 'menuItem', identity: { path: 'pricing' } },
    { key: 'menuItem-61', kind: 'menuItem', identity: { path: 'menu' } },
    { key: 'module-70', kind: 'module' },
    { key: 'module-71', kind: 'module' },
    { key: 'module-72', kind: 'module' }
  ],
  pages: [
    {
      entity: 'menuItem-60',
      link: 'index.php?option=com_content&view=category&layout=blog&id=2',
      assignedModules: [
        { entity: 'module-70', assignmentMode: 'include' },
        { entity: 'module-71', assignmentMode: 'include' },
        { entity: 'module-1', assignmentMode: 'all' }
      ]
    },
    {
      entity: 'menuItem-61',
      link: 'index.php?option=com_content&view=featured',
      assignedModules: [{ entity: 'module-72', assignmentMode: 'include' }]
    }
  ],
  slots: [0, 1]
    .flatMap((i) => [
      {
        key: `module-70.${i * 2}`,
        entity: 'module-70',
        type: 'text',
        role: 'package.name',
        sample: `Ring pass ${i}`,
        column: 'params',
        jsonPath: ['packs', 'title', i],
        group: { id: `module-70.item.${i}`, item: i, kind: 'package' }
      },
      {
        key: `module-70.${i * 2 + 1}`,
        entity: 'module-70',
        type: 'text',
        role: 'package.price',
        sample: `$${49 + i}`,
        column: 'params',
        jsonPath: ['packs', 'price', i],
        group: { id: `module-70.item.${i}`, item: i, kind: 'package' }
      }
    ])
    .concat([
      {
        key: 'module-71.0',
        entity: 'module-71',
        type: 'text',
        role: 'editorial.heading',
        sample: 'Memberships'
      },
      {
        key: 'module-71.1',
        entity: 'module-71',
        type: 'text',
        role: 'editorial.paragraph',
        sample: 'Pick a pack.'
      },
      {
        key: 'module-72.0',
        entity: 'module-72',
        type: 'text',
        role: 'editorial.heading',
        sample: 'Our bakes'
      }
    ])
}

test('a kept page whose every section the plan took off (no price in the brief) goes, with its pages answer', () => {
  const plan = planSite(clubBrief(), served, { now: '2026-10-29T00:00:00.000Z', contentMap: pricingMap })
  assert.ok(
    plan.honesty.hide.some((h) => h.entity === 'module-70'),
    `the package cards are hidden: ${JSON.stringify(plan.honesty.hide)}`
  )
  const pricing = plan.pages.find((p) => p.id === 'pricing')
  assert.deepEqual([pricing.decision, pricing.reason], ['drop', 'emptied-page'])
  assert.ok(!plan.answers.pages.includes('pricing'))
  assert.ok(!plan.pagePlan.keep.includes('pricing'))
  // A page whose sections nobody hid stays, even with a heading alone.
  assert.ok(plan.answers.pages.includes('menu'))
})
