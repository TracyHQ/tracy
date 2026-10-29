import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptedStatisticTuples } from '../domain/statistic-tuples.mjs'
import { planSite } from '../domain/site-plan.mjs'
import { renderBriefMarkdown } from '../domain/brief.mjs'
import { renderAgentPrompt } from '../domain/agent-prompt.mjs'

const trades = ['Fernmill Bakery', 'Juniper Dental']
const facts = (amount = 1247) => [
  {
    id: 'f1',
    field: 'socialFigures',
    onSite: true,
    reasons: [],
    confidence: 'single-source',
    value: { label: 'followers', amount, scope: 'https://www.instagram.com/fictional/' },
    evidence: [{ source: 'instagram', url: 'https://www.instagram.com/fictional/' }]
  }
]
const map = {
  slots: ['value', 'label', 'context'].map((role, n) => ({
    key: `module-40.${n}`,
    type: 'text',
    entity: 'module-40',
    role: `stat.${role}`,
    maxCharacters: 50,
    sample: ['100k+', 'Happy clients', 'Demo context'][n],
    column: 'params',
    jsonPath: ['stats', `stats[${role}]`, 0],
    group: { id: 'module-40.stat.0', kind: 'stat_item', item: 0 }
  }))
}

for (const name of trades) {
  test(`${name}: planner assigns the whole accepted statistic and every writer receives its evidence`, () => {
    const brief = {
      business: { name },
      facts: facts(),
      sitemap: [],
      assets: [],
      content: { items: [] },
      missing: []
    }
    const plan = planSite(brief, { questions: [] }, { contentMap: map })
    assert.equal(plan.honesty.values['module-40.0'].value, '1247')
    assert.equal(plan.honesty.values['module-40.1'].value, 'Instagram followers')
    assert.equal(plan.honesty.values['module-40.2'].value, 'Instagram')
    for (const prompt of [
      renderBriefMarkdown(brief),
      renderAgentPrompt({ revision: { brief, cms: 'joomla' } })
    ]) {
      assert.match(prompt, /1247/)
      assert.match(prompt, /Instagram followers/)
      assert.match(prompt, /instagram\.com\/fictional/)
      assert.match(prompt, /take off the tile/)
    }
  })
  test(`${name}: a number that cannot fit its box takes the tile off as a unit`, () => {
    const tiny = {
      ...map,
      slots: map.slots.map((s) => ({ ...s, maxCharacters: s.role === 'stat.value' ? 1 : 50 }))
    }
    const plan = planSite({ business: { name }, facts: facts() }, { questions: [] }, { contentMap: tiny })
    assert.equal(plan.honesty.records[0].decision, 'hide')
    assert.deepEqual(plan.honesty.values, {})
  })
}

test('rejected, unbacked and invalid typed facts never reach a writer; an accepted real zero does', () => {
  for (const patch of [
    { onSite: false },
    { onSite: undefined },
    { evidence: [] },
    { value: { label: 'followers', amount: -1, scope: 'instagram' } },
    { value: { label: 'followers', amount: '1247', scope: 'instagram' } }
  ]) {
    assert.deepEqual(acceptedStatisticTuples({ facts: [{ ...facts()[0], ...patch }] }), [])
  }
  assert.equal(acceptedStatisticTuples({ facts: facts(0) })[0].value, '0')
})

test('two platforms keep different counts, each with its own source', () => {
  const brief = {
    facts: [
      ...facts(),
      {
        ...facts(2386)[0],
        id: 'f2',
        value: { label: 'followers', amount: 2386, scope: 'facebook' },
        evidence: [{ source: 'facebook' }]
      }
    ]
  }
  assert.deepEqual(
    acceptedStatisticTuples(brief).map((f) => [f.value, f.label]),
    [
      ['1247', 'Instagram followers'],
      ['2386', 'Facebook followers']
    ]
  )
})
