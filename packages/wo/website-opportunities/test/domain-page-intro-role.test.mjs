import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planPageIntros, planPlaceIntros } from '../domain/page-intros.mjs'

export function fixture(trade) {
  const routes = ['about-us/our-team', 'about-us/contact', 'contact/services', 'our-story']
  const roles = ['team', 'contact', 'services', 'about']
  return {
    brief: {
      business: {
        name: `Example ${trade}`,
        address: '12 Elm Road - North Quarter - Westford - Exampleland',
        serviceAreas: ['Locations across Westford']
      },
      reading: { services: [{ label: trade, quote: trade }] }
    },
    pages: routes.map((id, n) => ({ id, role: roles[n], decision: 'keep' })),
    contentMap: {
      pages: routes.map((route, n) => ({ route, entity: `menuItem-${n + 1}` })),
      intros: [
        { entity: 'module-9', field: 'menuitem_config', items: routes.map((_, n) => [String(n + 1)]) }
      ],
      slots: routes.map((_, n) => ({
        key: `module-9.${n}`,
        entity: 'module-9',
        type: 'text',
        role: 'editorial.paragraph',
        jsonPath: ['menuitem_config', 'description', n],
        sample: 'Come on in.',
        maxCharacters: 180
      }))
    }
  }
}

for (const trade of ['Bread baking', 'Dental care']) {
  test(`${trade}: declared roles choose every intro independently of ancestry`, () => {
    const input = fixture(trade)
    const place = planPlaceIntros(input)
    assert.deepEqual(
      place.map((s) => s.page),
      ['about-us/contact', 'our-story']
    )
    const intros = planPageIntros(input)
    assert.ok(intros.some((s) => s.page === 'about-us/our-team' && s.pageRole === 'team'))
    assert.ok(intros.some((s) => s.page === 'contact/services' && s.pageRole === 'services'))
    assert.ok(intros.every((s) => s.pageRole))
    assert.ok(!intros.find((s) => s.pageRole === 'team').value.includes('North Quarter'))
  })
}

test('native page leads use declared page roles even without a Joomla module', () => {
  for (const trade of ['Bread baking', 'Dental care']) {
    const input = fixture(trade)
    input.contentMap.intros = []
    input.contentMap.slots = input.contentMap.pages.map((p, n) => ({
      key: `page.${n}.lead`,
      entity: p.entity,
      role: 'article.lead',
      type: 'text',
      sample: 'Welcome.',
      maxCharacters: 120
    }))
    const intros = planPageIntros(input)
    assert.equal(intros.length, 4)
    assert.equal(intros[0].pageRole, 'team')
    assert.equal(intros[0].key, 'page.0.lead')
    assert.ok(intros[2].value.toLowerCase().includes(trade.toLowerCase()))
  }
})

/** Two pages without their own masthead line show the masthead's shared default line. */
function sharedDefault(trade, roles) {
  const input = fixture(trade)
  const routes = ['about-us/coaches', 'about-us/history']
  input.pages = routes.map((id, n) => ({ id, role: roles[n], decision: 'keep' }))
  input.contentMap.intros = []
  input.contentMap.pages = routes.map((route, n) => ({
    route,
    entity: `menuItem-${n + 40}`,
    assignedModules: [{ entity: 'module-30', position: 'masthead', published: '1' }]
  }))
  input.contentMap.slots = [
    {
      key: 'module-30.1',
      entity: 'module-30',
      type: 'text',
      role: 'business.tagline',
      jsonPath: ['default-description'],
      sample: 'Come on in.',
      maxCharacters: 180
    }
  ]
  return input
}

for (const trade of ['Bread baking', 'Dental care']) {
  test(`${trade}: a default line shared by pages of different roles gets no role intro and no place line`, () => {
    const input = sharedDefault(trade, ['team', 'about'])
    assert.deepEqual(planPageIntros(input), [])
    assert.deepEqual(planPlaceIntros(input), [])
  })

  test(`${trade}: a default line shared by pages of one role still follows that role`, () => {
    const input = sharedDefault(trade, ['about', 'about'])
    assert.deepEqual(
      planPlaceIntros(input).map((s) => s.key),
      ['module-30.1']
    )
    assert.deepEqual(
      [...new Set(planPageIntros(input).map((s) => `${s.key} ${s.pageRole}`))],
      ['module-30.1 about']
    )
  })
}
