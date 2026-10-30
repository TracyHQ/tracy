import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planSite } from '../domain/site-plan.mjs'

const slot = (key, type, sample, action, extra = {}) => ({
  key,
  entity: key.split('.')[0],
  type,
  sample,
  role: type === 'url' ? 'editorial.navigation_url' : 'editorial.button_label',
  ...(action ? { action } : {}),
  ...extra
})
const map = {
  entities: [{ key: 'module-2', identity: { module: 'mod_custom', position: 'hero' } }],
  pages: [
    { route: 'home', entity: 'menuItem-1', assignedModules: [{ entity: 'module-2', position: 'hero' }] },
    { route: 'contact', entity: 'menuItem-40' }
  ],
  slots: [
    slot('module-1.0', 'url', 'index.php?Itemid=40'),
    slot('module-1.1', 'text', 'Learn more', { kind: 'primary-cta', urlKey: 'module-1.0' }),
    slot('module-2.0', 'text', 'Discover', { kind: 'primary-cta', urlKey: 'module-2.1' }),
    slot('module-2.1', 'url', 'index.php?Itemid=40'),
    slot('languageString-5.0', 'text', 'Contact', {
      kind: 'go-to-item',
      uses: [
        { kind: 'go-to-item', destination: '/treatments/cleaning' },
        { kind: 'go-to-item', destination: '/treatments/fillings' }
      ]
    }),
    slot('languageString-6.0', 'text', 'Contact', {
      kind: 'open-map',
      uses: [{ kind: 'open-map', selector: '#btn-map', destination: '#modalMap' }]
    })
  ]
}

for (const [trade, label, channel, href] of [
  ['bakery', 'Order a cake', 'whatsapp', 'https://wa.me/441234567890'],
  ['dental clinic', 'Book an appointment', 'contact', 'index.php?Itemid=40']
])
  test(`${trade}: the declared header and hero use the brief action and its real channel`, () => {
    const brief = {
      business: { name: 'Fictional business', phone: '+44 1234 567890' },
      primaryAction: {
        label,
        channel,
        href: channel === 'contact' ? null : href,
        basis: 'sourced',
        evidence: []
      }
    }
    const plan = planSite(brief, { questions: [] }, { contentMap: map })
    const values = Object.fromEntries(
      plan.slots.filter((s) => s.decision === 'value').map((s) => [s.key, s.value])
    )
    assert.equal(values['module-1.1'], label)
    assert.equal(values['module-1.0'], href)
    assert.equal(
      values['module-2.0'],
      label,
      'the older phone-first hero must not replace the declared action'
    )
    assert.equal(values['module-2.1'], href)
    assert.equal(values['languageString-5.0'], 'View details')
    assert.equal(values['languageString-6.0'], 'Get directions')
    assert.equal(
      plan.slots.find((s) => s.key === 'languageString-6.0')?.href,
      undefined,
      'the modal trigger stays intact'
    )
  })

test('an ungrouped single-button record uses its own URL', () => {
  const own = {
    ...map,
    slots: [slot('module-1.0', 'url', 'index.php?Itemid=40'), slot('module-1.1', 'text', 'Contact')]
  }
  const plan = planSite({ business: { name: 'Fictional clinic' } }, { questions: [] }, { contentMap: own })
  assert.equal(plan.slots.find((s) => s.key === 'module-1.1')?.value, 'Contact us')
})

test('an inferred main action is disclosed once in the build notes', () => {
  const plan = planSite(
    { primaryAction: { label: 'Order a cake', channel: 'contact', href: null, basis: 'inferred' } },
    { questions: [] },
    { contentMap: map }
  )
  assert.equal(plan.notes.filter((n) => /primary action.*inferred/i.test(n)).length, 1)
})

test('a declared primary action refuses a missing brief decision instead of inventing button copy', () => {
  assert.throws(
    () => planSite({ business: { name: 'Fictional clinic' } }, { questions: [] }, { contentMap: map }),
    { code: 'PRIMARY_ACTION_REQUIRED' }
  )
})

test('a primary label with no writable URL refuses mismatched words and destination', () => {
  const missingUrl = { ...map, slots: [slot('module-1.1', 'text', 'Learn more', { kind: 'primary-cta' })] }
  assert.throws(
    () =>
      planSite(
        { primaryAction: { label: 'Order a cake', channel: 'contact' } },
        { questions: [] },
        { contentMap: missingUrl }
      ),
    { code: 'PRIMARY_ACTION_DESTINATION_REQUIRED' }
  )
})

test('one string shared between different actions uses words valid for every use', () => {
  const mixed = {
    ...map,
    slots: [
      slot('languageString-9.0', 'text', 'Contact', {
        kind: 'navigation',
        uses: [{ kind: 'open-map' }, { kind: 'contact' }]
      })
    ]
  }
  const plan = planSite({}, { questions: [] }, { contentMap: mixed })
  assert.equal(plan.slots[0].value, 'View details')
})

test('a navigation button to a page without a known title keeps the writer words instead of a fixed fallback', () => {
  const plain = {
    ...map,
    slots: [
      slot('module-30.0', 'url', 'index.php?Itemid=77'),
      slot('module-30.1', 'text', 'About the bakery', { kind: 'navigation', urlKey: 'module-30.0' })
    ]
  }
  const plan = planSite({}, { questions: [] }, { contentMap: plain })
  assert.equal(
    plan.slots.some((s) => s.reason === 'button-action'),
    false
  )
})

for (const [trade, label, channel, route] of [
  ['bakery', 'Order a cake', 'contact', 'about/our-bakers'],
  ['dental clinic', 'Book an appointment', 'contact', 'team']
])
  test(`${trade}: a navigation button never leads to the page its own section sits on`, () => {
    const own = {
      entities: [],
      pages: [
        { route: 'home', entity: 'menuItem-1' },
        {
          route,
          entity: 'menuItem-50',
          title: 'Our people',
          assignedModules: [
            { entity: 'module-9', assignmentMode: 'include', menuIds: [50], position: 'section-1' }
          ]
        },
        { route: 'contact', entity: 'menuItem-40' },
        { route: 'prices', entity: 'menuItem-60', title: 'Prices' }
      ],
      slots: [
        slot('module-9.0', 'text', 'Meet the team', { kind: 'navigation', urlKey: 'module-9.1' }),
        slot('module-9.1', 'url', 'index.php?Itemid=50'),
        // Another section, shown on a different page, keeps its destination words.
        slot('module-8.0', 'text', 'See more', { kind: 'navigation', urlKey: 'module-8.1' }),
        slot('module-8.1', 'url', 'index.php?Itemid=60')
      ]
    }
    const plan = planSite(
      { primaryAction: { label, channel, href: null, basis: 'sourced', evidence: [] } },
      { questions: [] },
      { contentMap: own }
    )
    const values = Object.fromEntries(
      plan.slots.filter((s) => s.decision === 'value').map((s) => [s.key, s.value])
    )
    assert.equal(values['module-9.0'], label)
    assert.equal(values['module-9.1'], 'index.php?Itemid=40')
    assert.equal(values['module-8.0'], 'Prices')
    assert.equal(values['module-8.1'], undefined)
  })

test('a navigation button on its own destination page with no primary action gets no words', () => {
  const own = {
    entities: [],
    pages: [
      {
        route: 'team',
        entity: 'menuItem-50',
        title: 'Our people',
        assignedModules: [{ entity: 'module-9', assignmentMode: 'include', menuIds: [50] }]
      }
    ],
    slots: [
      slot('module-9.0', 'text', 'Meet the team', { kind: 'navigation', urlKey: 'module-9.1' }),
      slot('module-9.1', 'url', 'index.php?Itemid=50')
    ]
  }
  const plan = planSite({ business: { name: 'Fictional clinic' } }, { questions: [] }, { contentMap: own })
  assert.equal(plan.slots.find((s) => s.key === 'module-9.0')?.decision === 'value', false)
})
