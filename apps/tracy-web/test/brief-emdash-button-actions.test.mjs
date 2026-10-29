import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  emdashButtonMap,
  writeEmdashButtonActions
} from '../src/sites/brief-engines/emdash-button-actions.js'

const fieldMap = {
  collections: [
    {
      collection: 'site',
      fields: [
        { slug: 'button_label', action: { kind: 'primary-cta', urlKey: 'site.button_url' } },
        { slug: 'button_url' },
        { slug: 'directions_label', action: { kind: 'open-map' } }
      ]
    },
    { collection: 'contact', urlPattern: '/contact', fields: [] }
  ]
}
const seed = {
  defaultLocale: 'en',
  collections: [
    {
      slug: 'site',
      fields: [
        { slug: 'button_label', type: 'string' },
        { slug: 'button_url', type: 'string' },
        { slug: 'directions_label', type: 'string' }
      ]
    }
  ],
  content: {
    site: [
      {
        slug: 'site',
        data: { button_label: 'Learn more', button_url: '/contact', directions_label: 'Contact' }
      }
    ],
    contact: [{ slug: 'contact', data: {} }]
  }
}

for (const [trade, label, channel, href] of [
  ['bakery', 'Order a cake', 'whatsapp', 'https://wa.me/441234567890'],
  ['dental clinic', 'Book an appointment', 'contact', '/contact']
])
  test(`${trade}: EmDash field-map actions overwrite native generic copy and publish the paired channel`, async () => {
    const live = {
      button_label: 'Contact',
      button_url: '/old-target',
      directions_label: 'Contact',
      unrelated: 'Keep this'
    }
    let draft = null
    const calls = []
    const api = async (method, route, body) => {
      calls.push({ method, route, body })
      if (method === 'GET')
        return { _rev: 'revision-1', item: { id: 'site-1', status: 'published', data: live } }
      if (method === 'PUT') {
        assert.equal(body._rev, 'revision-1')
        draft = body.data
        return {}
      }
      if (method === 'POST') {
        Object.assign(live, draft)
        return {}
      }
      assert.fail(method)
    }
    const result = await writeEmdashButtonActions({
      api,
      fieldMap,
      seed,
      sitePlan: {
        primaryAction: {
          label,
          channel,
          href: channel === 'contact' ? null : href,
          basis: 'sourced',
          evidence: []
        }
      }
    })
    assert.equal(result.written, 1)
    assert.equal(live.button_label, label)
    assert.equal(live.button_url, href)
    assert.equal(live.directions_label, 'Get directions')
    assert.equal(live.unrelated, 'Keep this')
    assert.equal(calls.filter((c) => c.method === 'GET').length, 2, 'read before and after publish')
  })

test('EmDash uses the released field-map URL pattern as the real Contact route', () => {
  const mapped = emdashButtonMap(fieldMap, seed)
  assert.equal(
    mapped.slots.find((s) => s.key === 'site.site.button_label').action.urlKey,
    'site.site.button_url'
  )
  assert.equal(mapped.pages.find((p) => p.entity === 'contact.contact').route, '/contact')
})
