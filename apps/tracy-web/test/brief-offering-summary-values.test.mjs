import assert from 'node:assert/strict'
import test from 'node:test'
import { offeringSummaryValues } from '../src/sites/brief-engines/offering-summaries.js'
import { planHonesty } from 'website-opportunities/domain/site-plan-honesty.mjs'
import { planRecordSteps } from '../src/sites/brief-engines/joomla-plan-records.js'

for (const [label, other, quote] of [
  ['Sourdough', 'Pastries', 'Sourdough made with a slow fermentation.'],
  ['Dental cleaning', 'Implants', 'Dental cleaning with a gentle approach.']
]) {
  const group = { id: 'article-31.offering', kind: 'service', item: 0 }
  const slots = [
    {
      key: 'article-31.title',
      entity: 'article-31',
      column: 'title',
      type: 'text',
      sample: 'Demo title',
      role: 'offering.name',
      group
    },
    {
      key: 'article-31.intro',
      entity: 'article-31',
      column: 'introtext',
      type: 'text',
      sample: 'Demo activity from the template.',
      role: 'offering.summary',
      group,
      maxCharacters: 100
    }
  ]
  const map = { slots, entities: [{ key: 'article-31', kind: 'article' }] }
  const { honesty } = planHonesty(
    {
      reading: {
        services: [
          { id: 'one', label, quote },
          { id: 'two', label: other }
        ]
      }
    },
    map
  )
  test(`${label}: the final summary guard repairs an empty pin and refuses other offerings`, async () => {
    for (const current of [
      '',
      '\u00a0',
      '&nbsp;',
      '<p>&#160;</p>',
      'Demo activity from the template.',
      `Discover ${other} today.`
    ]) {
      const values = await offeringSummaryValues({ slots, honesty, written: { 'article-31.intro': current } })
      assert.equal(values['article-31.intro'], quote)
    }
  })
  test(`${label}: valid own copy stays and an untranslatable fallback fails visibly`, async () => {
    const own = `${label} described for this card.`
    assert.equal(
      (await offeringSummaryValues({ slots, honesty, written: { 'article-31.intro': own } }))[
        'article-31.intro'
      ],
      own
    )
    await assert.rejects(() => offeringSummaryValues({ slots, honesty, written: {}, locale: 'de' }), {
      code: 'OFFERING_SUMMARY_TRANSLATION_REQUIRED'
    })
  })
  test(`${label}: later record cleanup cannot empty a protected summary`, async () => {
    const steps = await planRecordSteps({
      siteKey: 'fictional',
      ctx: { siteKey: 'fictional', email: 'owner@example.test', note() {} },
      woContent: { sitePlanFor: async () => ({ honesty }) },
      protectedKeys: new Set(['article-31.intro']),
      extraBlanks: [slots[1]],
      apply: async ({ action }) =>
        action === 'content.get'
          ? { ok: true, item: { id: 31, introtext: `<p>${quote}</p>` } }
          : { ok: true, items: [] }
    })
    assert.deepEqual(steps.steps, [])
  })
}
