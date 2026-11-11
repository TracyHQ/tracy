// A form the plan hides on a contact page: Joomla draws it from the page's own setting. Every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { closeForms, followClosedForms } from '../src/write-step/form-close.js'
import { readBackGroup } from '../src/site-check/read-back.js'
import { KIT, plan, runStep } from './_write-step-run.mjs'

const kit = {
  blocks: [
    { id: 'body-reach', source: { entity: 'contact-3', ownerKind: 'contact page' } },
    { id: 'block-news', source: { entity: 'module-9' } }
  ],
  pages: [{ id: 'page-reach', path: '/reach', blocks: { 1440: ['body-reach'] } }]
}
const planOf = (forms, decision = 'keep') => ({
  site: { forms },
  pages: [{ id: 'page-reach', decision, blocks: [] }]
})
const HIDE = { block: 'body-reach', decision: 'hide', why: 'no address' }

function door(refuse = null) {
  const calls = []
  return {
    calls,
    apply: async ({ action, params }) => {
      if (action === 'content.list')
        return {
          ok: true,
          items:
            params.offset === 0
              ? [{ id: 7, path: 'reach', published: 1, params: '{"menu_text":1,"show_email_form":""}' }]
              : []
        }
      calls.push({ action, params })
      return refuse ? { ok: false, error: 'locked', message: refuse } : { ok: true }
    }
  }
}

test('a hidden form of a contact page is closed by its menu item, every other setting kept, and read back there', async () => {
  const site = door()
  const lines = await closeForms({ door: site, siteKey: 's', plan: planOf([HIDE]), kit })
  assert.equal(site.calls.length, 1)
  const { action, params } = site.calls[0]
  assert.equal(action, 'content.update')
  assert.deepEqual([params.kind, params.id], ['menuItem', 7])
  assert.ok(params.apply_id)
  assert.deepEqual(JSON.parse(params.fields.params), { menu_text: 1, show_email_form: '0' })
  assert.equal(lines.length, 1)
  assert.deepEqual(
    [lines[0].slot, lines[0].status, lines[0].owner, lines[0].ordered],
    ['body-reach', 'hidden', 'plan', '0']
  )
  assert.deepEqual(lines[0].readFrom, {
    action: 'content.get',
    params: { kind: 'menuItem', id: 7 },
    path: ['item', 'params', 'show_email_form']
  })
})

test('a refusal is a failed line in the plugin’s words', async () => {
  const lines = await closeForms({ door: door('in use'), siteKey: 's', plan: planOf([HIDE]), kit })
  assert.equal(lines[0].status, 'failed')
  assert.match(lines[0].reason, /in use/)
})

test('a form kept, a form of another block, and a page the plan drops ask nothing', async () => {
  for (const plan of [
    planOf([{ ...HIDE, decision: 'keep' }]),
    planOf([{ block: 'block-news', decision: 'hide' }]),
    planOf([HIDE], 'drop'),
    { pages: [] }
  ]) {
    const site = door()
    assert.deepEqual(await closeForms({ door: site, siteKey: 's', plan, kit }), [])
    assert.equal(site.calls.length, 0)
  }
})

test('the write orchestration discharges a submit-label refusal only after its own form closes', async () => {
  for (const scenario of ['closed', 'refused', 'other-block', 'kept']) {
    const template = KIT()
    const block = template.doc.blocks.find((b) => b.id === 'block-2')
    block.source = { entity: 'contact-3' }
    block.links = [
      {
        id: 'block-2.button-1',
        labelId: 'block-2.3',
        action: 'page-control',
        opens: { kind: 'form', action: '/' }
      }
    ]
    template.doc.pages = [{ id: 'page-home', path: '/', blocks: { 1440: ['block-2'] } }]
    const planned = plan()
    planned.site.forms = [
      {
        block: scenario === 'other-block' ? 'another-block' : 'block-2',
        decision: scenario === 'kept' ? 'keep' : 'hide',
        why: 'no message destination'
      }
    ]
    const { report, line, site } = await runStep(
      { plan: planned },
      {
        records: [
          { kind: 'menuItem', id: 7, path: '', home: 1, published: 1, params: '{"show_email_form":"1"}' }
        ],
        refuseUpdate: (_kind, _id, fields) =>
          scenario === 'refused' && fields.params?.includes('show_email_form')
            ? { ok: false, error: 'locked', message: 'the form is locked' }
            : null
      },
      { kit: template }
    )
    const label = line('block-2.3')
    assert.equal(label.part, 'control-label')
    if (scenario === 'closed') {
      assert.equal(label.status, 'hidden')
      assert.deepEqual(label.readFrom, line('block-2').readFrom)
      assert.ok(!report.noWayOut.some((item) => item.slot === label.slot))
      assert.ok(
        site.updates().some((call) => JSON.parse(call.params.fields.params ?? '{}').show_email_form === '0')
      )
      const check = () =>
        readBackGroup.run({
          read: (action, params) => site.door.apply({ siteKey: report.site, action, params }),
          report: { ...report, slots: [label] }
        })
      assert.equal((await check()).failures.length, 0)
      site.records.get('menuItem-7').params = '{"show_email_form":"1"}'
      assert.ok(
        (await check()).failures.some((failure) => failure.slot === label.slot),
        'reopening the form fails read-back'
      )
      const replay = await runStep(
        { plan: planned },
        {
          records: [
            { kind: 'menuItem', id: 7, path: '', home: 1, published: 1, params: '{"show_email_form":"1"}' }
          ]
        },
        { kit: template, last: report }
      )
      assert.equal(replay.line('block-2.3').status, 'hidden')
      const reread = await readBackGroup.run({
        read: (action, params) => replay.site.door.apply({ siteKey: replay.report.site, action, params }),
        report: { ...replay.report, slots: [replay.line('block-2.3')] }
      })
      assert.ok(
        reread.failures.some((failure) => failure.slot === label.slot),
        'a cached closure still checks the live setting'
      )
    } else {
      assert.equal(label.status, 'failed', scenario)
      assert.match(label.reason, /only label/)
      assert.ok(report.noWayOut.some((item) => item.slot === label.slot))
    }
  }
})

test('a shared label still blocks when a different control remains on the page', () => {
  const line = { slot: 'submit', part: 'control-label', status: 'failed', reason: 'only label' }
  const forms = [{ slot: 'body-reach', part: 'form', status: 'hidden', ordered: '0' }]
  const template = {
    blocks: [
      {
        id: 'body-reach',
        links: [
          { labelId: 'submit', opens: { kind: 'form' } },
          { labelId: 'submit', opens: { kind: 'modal' } }
        ]
      }
    ]
  }
  assert.equal(followClosedForms([line], template, forms)[0], line)
})
