// The existing CMS record writer removes both halves of an incomplete step, preserving the bound indexes of its siblings.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { leftDemoWords, planRecordSteps } from '../src/sites/brief-engines/joomla-plan-records.js'

for (const name of ['Cedar Bakery', 'Willow Dental']) {
  test(`${name}: incomplete steps leave their native title/body arrays together`, async () => {
    const slots = [0, 1].flatMap((item) =>
      ['title', 'description'].map((field) => ({
        key: `module-50.${item}.${field}`,
        entity: 'module-50',
        column: 'params',
        nestedJson: 'jatools-config',
        type: 'text',
        role: `step.${field}`,
        group: { id: `module-50.step.${item}`, item, kind: 'step' },
        sample: field === 'title' ? 'Demo training' : 'Practice the old boxing drills.',
        jsonPath: ['steps', `steps[${field}]`, item],
        maxCharacters: 400
      }))
    )
    const kept = {
      'module-50.0.title': 'First visit',
      'module-50.0.description': 'Discuss your needs with us.',
      'module-50.1.title': 'STEP',
      'module-50.1.description': ''
    }
    const cleaned = await leftDemoWords({
      kept,
      slots,
      asked: slots.map((s) => s.key),
      held: [],
      ownText: name,
      honesty: {},
      locale: 'en',
      business: {}
    })
    const config = {
      steps: {
        'steps[title]': ['First visit', 'STEP'],
        'steps[description]': ['Discuss your needs with us.', '']
      }
    }
    const made = await planRecordSteps({
      apply: async (call) =>
        call.action === 'content.list'
          ? {
              ok: true,
              items:
                call.params.offset > 0
                  ? []
                  : [{ id: 50, params: JSON.stringify({ 'jatools-config': JSON.stringify(config) }) }]
            }
          : { ok: true },
      siteKey: 'fictional-site',
      ctx: { note: () => {}, time: () => {} },
      woContent: { sitePlanFor: async () => null },
      extraHides: cleaned.hides,
      extraBlanks: cleaned.blanks
    })
    const module = made.steps.find((step) => step.kind === 'module' && step.id === 50)
    const readback = JSON.parse(JSON.parse(module.fields.params)['jatools-config'])
    assert.deepEqual(readback.steps['steps[title]'], ['First visit', ''])
    assert.deepEqual(readback.steps['steps[description]'], ['Discuss your needs with us.', ''])
  })
}
