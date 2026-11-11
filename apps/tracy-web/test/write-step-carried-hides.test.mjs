// Controls removed by a supported parent operation must follow its actual outcome, including refusals.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hideOrders } from '../src/write-step/hide-plan.js'
import { hideLines } from '../src/write-step/hide-lines.js'
import { followClosedForms } from '../src/write-step/form-close.js'
import { readBackGroup } from '../src/site-check/read-back.js'
import { KIT, plan, runStep } from './_write-step-run.mjs'

function orders({ kit, hide, extras = {}, kept = [], cannotHide = null }) {
  return hideOrders({
    kit,
    plan: { pages: kept },
    owners: new Map(hide.map((slot) => [slot, { slot, kind: 'hide' }])),
    extras,
    reading: { slots: [] },
    changes: {},
    cannotHide,
    rowsRemove: false
  })
}
function results(order, { settled = new Map(), refused = new Map() } = {}) {
  return hideLines({
    order,
    words: { refusedAll: null, refused },
    blocks: new Map(),
    pages: new Map(),
    cannotHide: null,
    emptied: [],
    refused: new Map(),
    settled
  })
}
const menuLink = {
  id: 'header.link-4',
  label: 'CLASSES',
  menu: 'module-1',
  menuItem: 'menuItem-167',
  action: 'navigation'
}
const menuKit = {
  blocks: [{ id: 'header', source: { entity: null }, links: [menuLink] }],
  pages: [{ id: 'classes', path: '/classes' }]
}
const menuExtras = {
  mainMenu: { hide: [{ slot: 'menuItem-167.0', item: 'menuItem-167', path: '/classes' }] }
}

test('a header link follows its exact already scheduled menu hide and checks the published value', async () => {
  const order = orders({ kit: menuKit, hide: [menuLink.id], extras: menuExtras })
  assert.equal(order.orders.get(menuLink.id).via, 'menu')
  assert.deepEqual(order.noWayOut, [])
  const readFrom = {
    action: 'content.get',
    params: { kind: 'menuItem', id: 167 },
    path: ['item', 'published']
  }
  const line = {
    slot: menuLink.id,
    ...results(order, {
      settled: new Map([['menuItem-167', { status: 'written', ordered: '0', readFrom }]])
    }).hides.get(menuLink.id)
  }
  assert.equal(line.status, 'hidden')
  assert.deepEqual(line.readFrom, readFrom)
  for (const published of [0, 1]) {
    const check = await readBackGroup.run({
      report: { status: 'done', slots: [line] },
      read: async () => ({ ok: true, item: { published } })
    })
    assert.equal(check.failures.length, published)
  }
  const refused = results(order, {
    settled: new Map([['menuItem-167', { status: 'failed', reason: 'native locked this item' }]])
  }).hides.get(menuLink.id)
  assert.equal(refused.status, 'failed')
  assert.match(refused.reason, /native locked/)
})

test('menu links without an exact scheduled parent hide stay blocked, and kept-page protection remains', () => {
  const unmatched = orders({
    kit: menuKit,
    hide: [menuLink.id],
    extras: { mainMenu: { hide: [{ slot: 'other', item: 'menuItem-999', path: '/other' }] } }
  })
  assert.equal(unmatched.orders.get(menuLink.id).via, 'failed')
  const unavailable = orders({
    kit: menuKit,
    hide: [menuLink.id],
    extras: menuExtras,
    cannotHide: 'native hide operation unavailable'
  })
  assert.equal(unavailable.orders.get(menuLink.id).via, 'failed')
  const guarded = orders({
    kit: menuKit,
    hide: [menuLink.id],
    extras: menuExtras,
    kept: [{ id: 'classes', decision: 'keep', blocks: [] }]
  })
  assert.match(guarded.orders.get(menuLink.id).refused, /kept page/)
})

const fixedId = 'block-168.fixed-mod-footer-line2'
const fixedLink = { id: 'block-168.link-1', label: 'Joomla!', fixedLabel: { rule: 'template-words' } }
const fixed = {
  id: fixedId,
  text: 'Joomla! is Free Software released under the GNU General Public License.',
  canHide: true,
  source: { constant: 'MOD_FOOTER_LINE2' }
}
const fixedKit = {
  template: { name: 'ja_boxing' },
  blocks: [{ id: 'block-168', source: { entity: 'module-168' }, fixedText: [fixed], links: [fixedLink] }]
}

test('fixed-word labels without a supported parent relation stay blocked even when a sentence hides', () => {
  for (const label of ['Joomla!', 'Free', 'a', 'Another link']) {
    const kit = structuredClone(fixedKit)
    kit.blocks[0].links[0].label = label
    const order = orders({ kit, hide: [fixedId, fixedLink.id] })
    assert.equal(order.orders.get(fixedLink.id).via, 'failed', label)
    assert.equal(results(order).hides.get(fixedLink.id).status, 'failed', label)
  }
})

test('a form button follows only its own successful supported form closure, with live read-back', async () => {
  const button = 'body-reach.button-1'
  const line = { slot: button, status: 'failed', reason: 'no independent slot' }
  const template = {
    blocks: [{ id: 'body-reach', links: [{ id: button, labelId: 'submit', opens: { kind: 'form' } }] }]
  }
  const readFrom = {
    action: 'content.get',
    params: { kind: 'menuItem', id: 168 },
    path: ['item', 'params', 'show_email_form']
  }
  const closure = { slot: 'body-reach', part: 'form', status: 'hidden', ordered: '0', readFrom }
  const hidden = followClosedForms([line], template, [closure])[0]
  assert.equal(hidden.status, 'hidden')
  assert.deepEqual(hidden.readFrom, readFrom)
  for (const show_email_form of ['0', '1']) {
    const check = await readBackGroup.run({
      report: { status: 'done', slots: [hidden] },
      read: async () => ({ ok: true, item: { params: { show_email_form } } })
    })
    assert.equal(check.failures.length, Number(show_email_form))
  }
  for (const forms of [[], [{ ...closure, slot: 'another' }], [{ ...closure, status: 'failed' }]])
    assert.equal(followClosedForms([line], template, forms)[0], line)
  template.blocks.push({ id: 'other', links: [{ id: button, opens: { kind: 'modal' } }] })
  assert.equal(followClosedForms([line], template, [closure])[0], line)
})

test('the full write step carries a hidden submit button only after its own native form closes', async () => {
  for (const refused of [false, true]) {
    const template = KIT()
    const block = template.doc.blocks.find((b) => b.id === 'block-2')
    block.source = { entity: 'contact-3' }
    block.links = [
      { id: 'block-2.button-1', labelId: 'block-2.3', action: 'page-control', opens: { kind: 'form' } }
    ]
    template.doc.pages = [{ id: 'page-home', path: '/', blocks: { 1440: ['block-2'] } }]
    const planned = plan()
    planned.site.forms = [{ block: 'block-2', decision: 'hide', why: 'no message destination' }]
    planned.pages[0].blocks[0].hiddenSlots.push({ slot: 'block-2.button-1', why: 'form closes' })
    const done = await runStep(
      { plan: planned },
      {
        records: [
          { kind: 'menuItem', id: 7, path: '', home: 1, published: 1, params: '{"show_email_form":"1"}' }
        ],
        refuseUpdate: (_kind, _id, fields) =>
          refused && fields.params?.includes('show_email_form')
            ? { ok: false, error: 'locked', message: 'the form is locked' }
            : null
      },
      { kit: template }
    )
    const button = done.line('block-2.button-1')
    assert.equal(button.status, refused ? 'failed' : 'hidden')
    assert.equal(
      done.report.noWayOut.some((item) => item.slot === button.slot),
      refused
    )
    if (refused) continue
    assert.deepEqual(button.readFrom, done.line('block-2').readFrom)
    const check = () =>
      readBackGroup.run({
        report: { ...done.report, slots: [button] },
        read: (action, params) => done.site.door.apply({ siteKey: done.report.site, action, params })
      })
    assert.equal((await check()).failures.length, 0)
    done.site.records.get('menuItem-7').params = '{"show_email_form":"1"}'
    assert.ok((await check()).failures.some((failure) => failure.slot === button.slot))
  }
})
