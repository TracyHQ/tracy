// Card AZ, 2026-11-06: a phone link the kit says no door holds was refused with the kit's demo number, while the page already
// dialled the brief's number (the template prints a tel: link around the contact phone the write step wrote). Before refusing,
// the write step reads the page: a tel: link dialling the plan's number, and none left on the demo's, means nothing is to write.
// Numbers, pages and slots are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { settleDialledPhones } from '../src/write-step/dialled-phones.js'

const refused = {
  key: null,
  slot: 'body-contact.link-1',
  owner: 'plan',
  status: 'refused',
  reason:
    "no door holds this link: the template prints it and it keeps opening tel:5550100200, so the plan's phone:f-1 cannot reach the site",
  keeps: 'tel:5550100200',
  readBack: null
}
const planLinks = [
  {
    link: 'body-contact.link-1',
    block: 'body-contact',
    pages: ['page-contact'],
    target: { kind: 'phone', digits: '971500001234' }
  }
]
const keptPages = [{ id: 'page-contact', path: '/about/contact' }]
const html = (...tels) =>
  `<html><body>${tels.map((t) => `<a href="tel:${t}">Call</a>`).join('')}</body></html>`
const reader = (pages) => async (path) => pages[path] ?? null

test('a refused phone link the page already dials, in any way of writing the number, is no refusal', async () => {
  for (const tel of ['+971500001234', '00971%20500%20001%20234', '+971-50-000-1234']) {
    const [line] = await settleDialledPhones({
      lines: [refused],
      planLinks,
      keptPages,
      pageHtml: reader({ '/about/contact': html(tel, '+971500009999') })
    })
    assert.equal(line.status, 'skipped', tel)
    assert.equal(line.already, 'dials')
    assert.match(line.reason, /already dials \+971500001234 on \/about\/contact/)
  }
})

test('the refusal stays when the page still dials the demo number, dials another, or cannot be read', async () => {
  for (const pages of [
    { '/about/contact': html('+971500001234', '5550100200') },
    { '/about/contact': html('+971500009999') },
    {}
  ]) {
    const [line] = await settleDialledPhones({
      lines: [refused],
      planLinks,
      keptPages,
      pageHtml: reader(pages)
    })
    assert.deepEqual(line, refused)
  }
})

test('other lines, and a refused link to a page, are left alone without a read', async () => {
  let reads = 0
  const lines = [
    { ...refused, slot: 'body-contact.link-2' },
    { slot: 'block-2.1', key: 'module-2.1', status: 'written', ordered: 'Words' }
  ]
  const out = await settleDialledPhones({
    lines,
    planLinks: [
      ...planLinks,
      { link: 'body-contact.link-2', pages: ['page-contact'], target: { kind: 'page' } }
    ],
    keptPages,
    pageHtml: async () => {
      reads++
      return html('+971500001234')
    }
  })
  assert.deepEqual(out, lines)
  assert.equal(reads, 0)
})

test('a phone link no door holds is refused with the address the template keeps, for the page read to judge', async () => {
  const { lineOrder } = await import('../src/write-step/link-lines.js')
  const line = lineOrder(
    { slot: 'body-contact.link-1', content: 'phone:f-1' },
    { via: 'none', link: { target: 'tel:5550100200' } },
    { kind: 'phone', url: 'tel:+971500001234' },
    { hiddenKeys: new Map(), leaving: new Set() }
  )
  assert.equal(line.status, 'refused')
  assert.equal(line.keeps, 'tel:5550100200')
})
