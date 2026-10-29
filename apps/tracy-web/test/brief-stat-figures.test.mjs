import assert from 'node:assert/strict'
import { test } from 'node:test'
import { statFactsOf } from 'website-opportunities/domain/stat-box-plan.mjs'
import { renderLeftoverCleanupPrompt } from 'website-opportunities/domain/leftover-cleanup.mjs'
import { plannedSlotValues } from '../src/sites/brief-engines/joomla-outside-map.js'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'
import { planSite } from 'website-opportunities/domain/site-plan.mjs'
import { statisticFindings } from '../src/opportunities-build/statistic-check.js'

const trades = [
  { name: 'Fernmill Bakery', count: 1247 },
  { name: 'Juniper Dental', count: 2386 }
]
const briefOf = (trade) => ({
  business: { name: trade.name },
  facts: [
    {
      id: 'followers',
      field: 'socialFigures',
      onSite: true,
      value: { amount: trade.count, label: 'followers', scope: 'instagram' },
      evidence: [{ source: 'instagram', url: 'https://social.example/profile' }]
    }
  ]
})
const contentMap = {
  slots: ['value', 'label', 'context'].map((role, i) => ({
    key: `module-40.${i}`,
    entity: 'module-40',
    type: 'text',
    role: `stat.${role}`,
    sample: ['100k+', 'Happy clients', 'Demo statistic'][i],
    group: { id: 'module-40.stat.0', kind: 'stat_item', item: 0 }
  }))
}

for (const trade of trades) {
  test(`${trade.name}: every accepted typed statistic is available as a complete tuple`, () => {
    const facts = statFactsOf(briefOf(trade), { now: 2026 })
    assert.ok(
      facts.some(
        (f) =>
          f.value === String(trade.count) &&
          /followers/i.test(f.label) &&
          /instagram/i.test(`${f.label} ${f.line}`)
      )
    )
  })
  test(`${trade.name}: cleanup receives the number with its label and source`, () => {
    const prompt = renderLeftoverCleanupPrompt({
      brief: briefOf(trade),
      leftovers: { findings: [{ kind: 'C17', page: '/', place: 'module-40.0', found: '100k+' }] }
    })
    assert.match(prompt, new RegExp(String(trade.count)))
    assert.match(prompt, /followers/i)
    assert.match(prompt, /social\.example\/profile/)
    assert.match(prompt, /statistic.*number|number.*statistic/i)
  })
  test(`${trade.name}: final readback rejects a numberless replacement after demo removal`, async () => {
    const report = await runLeftoverCheck({
      readPage: async (path) => ({
        status: path === '/' ? 200 : 404,
        html:
          path === '/'
            ? '<section id="Mod40"><div class="stat-item"><strong class="number">A town</strong><span class="label">Instagram followers</span><p>Instagram</p></div></section>'
            : ''
      }),
      check: () => ({ version: 'test', pass: true, findings: [], counts: {} }),
      contentMap,
      brief: briefOf(trade)
    })
    assert.equal(report.pass, false)
    assert.ok(report.findings.some((f) => f.kind === 'C17' && /stat/i.test(f.place)))
  })
}

test('planned statistics reach the contract writer even without a profile copy reader', () => {
  assert.deepEqual(
    plannedSlotValues({
      honesty: {
        values: {
          'module-40.0': { value: '3', reason: 'brief-statistic' },
          'module-40.1': { value: 'Years running', reason: 'brief-statistic' },
          'module-40.2': { value: 'Since 2023', reason: 'brief-statistic' }
        }
      }
    }),
    { 'module-40.0': '3', 'module-40.1': 'Years running', 'module-40.2': 'Since 2023' }
  )
})

for (const trade of trades) {
  test(`${trade.name}: the frozen plan gives every writer all accepted statistics`, () => {
    const plan = planSite(briefOf(trade), { questions: [] }, { contentMap })
    assert.ok(plan.statistics.some((f) => f.value === String(trade.count)))
  })
  for (const id of ['Mod40', 'mod-40', 'block-statistics'])
    test(`${trade.name}: ${id} checks each tile's numeric tuple independently`, () => {
      const scan = (inner) =>
        statisticFindings({
          pages: [{ path: '/', html: `<section id="${id}">${inner}</section>` }],
          contentMap,
          brief: briefOf(trade)
        })
      const tile = (number, label, extra = '') =>
        `<div class="stat-item" ${extra}><strong class="stat-number">${number}</strong><span>${label}</span></div>`
      assert.equal(scan(tile(trade.count.toLocaleString('en-US'), 'Instagram followers')).length, 0)
      assert.equal(scan(tile(trade.count, 'Google reviews')).length, 1)
      assert.equal(scan(tile(trade.count + 1, 'Instagram followers')).length, 1)
      assert.equal(scan(tile(trade.count, 'Instagram followers') + tile('', 'Instagram followers')).length, 1)
      assert.equal(scan(tile('Town', 'Instagram followers', 'hidden')).length, 0)
      assert.equal(scan('<div class="stat-item"><span>Instagram followers</span></div>').length, 1)
      assert.equal(scan('<div class="stat-item"><img src="owner.jpg"></div>').length, 1)
      assert.equal(scan('<div class="gallery-statics bg-dark"><div class="inner"></div></div>').length, 1)
      assert.equal(scan('<div class="gallery-item"><img src="owner.jpg"></div>').length, 0)
    })
}

test('a standalone stat tile with no accepted number is taken off, not left as an empty or prose tile', () => {
  const plan = planSite({ business: { name: 'Juniper Dental' } }, { questions: [] }, { contentMap })
  assert.equal(plan.honesty.records.find((r) => r.kind === 'stat_item').decision, 'hide')
})
