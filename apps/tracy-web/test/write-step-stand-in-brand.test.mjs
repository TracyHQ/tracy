// A step chain whose brand step made no brand file (#483): the write step still names the business from its research, never
// keeps the site label or the template's demo name. Measured on a local step chain run: the brand step failed before any model
// call, so no name was written and the footer printed the site label. The stand-in brand file holds only what code decides from
// the brief and the kit (the name slots, the template's own accent): no logo, no colour of its own. Everything is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportBrandOrders } from '../src/write-step/brand-write-orders.js'
import { standInBrand } from '../src/write-step/stand-in-files.js'

const kit = {
  ref: 'invented-gym/j6/1.0.0',
  doc: {
    quickstart: { product: 'invented-gym', version: '1.0.0' },
    template: { name: 'ja_invented' },
    blocks: [],
    site: {
      brandColours: { primary: { value: '#a03c2d' } },
      logoSpots: [],
      nameSlots: [
        { kind: 'setting', scope: 'cms', setting: 'global configuration sitename', value: 'JA Invented' },
        {
          kind: 'printed',
          where: 'text',
          block: 'block-9',
          region: 'footer',
          sample: 'Copyright 2026 JA Invented. All Rights Reserved.',
          text: 'Copyright 2026 JA Invented. All Rights Reserved.',
          source: { setting: 'global configuration sitename' }
        }
      ]
    }
  }
}
const brief = { brand: { name: 'Harbour Padel Club' }, missing: [] }

test('with no brand file the site name is written from the brief, through the same orders a brand file makes', () => {
  const brand = standInBrand(kit, brief)
  const { orders, problems } = exportBrandOrders({ brand, kit: kit.doc })
  assert.deepEqual(problems, [])
  const name = orders.find((o) => o.via === 'identity')
  assert.equal(name?.key, 'sitename')
  assert.equal(name?.value, 'Harbour Padel Club')
  assert.ok(
    orders.some((o) => o.via === 'follows'),
    'the footer line is printed from the site name'
  )
  // No logo and no colour of its own: the template keeps both.
  assert.equal(orders.find((o) => o.item === 'accent').via, 'none')
  assert.equal(brand.colours.accent, '#a03c2d')
  assert.ok(orders.filter((o) => o.item === 'logo').every((o) => o.via === 'none'))
})

test('a brief that holds the name back writes no name at all', () => {
  const brand = standInBrand(kit, {
    brand: { name: 'Harbour Padel Club' },
    missing: [{ field: 'brand.name' }]
  })
  const { orders } = exportBrandOrders({ brand, kit: kit.doc })
  assert.ok(orders.filter((o) => o.item === 'name').every((o) => o.via === 'none'))
})

test('the write step takes the stand-in like a brand file: the name is written, the painted icon in the template accent', async () => {
  const { brandKit } = await import('./_write-step-brand.mjs')
  const { iconItem, runPainted } = await import('./_write-step-painted.mjs')
  const fixture = brandKit()
  fixture.doc.site.brandColours = { primary: { value: '#a03c2d' } }
  const brand = standInBrand(fixture, { brand: { name: 'Harbour Padel Club' }, missing: [] })
  const { report, line } = await runPainted({ brand, items: () => [iconItem('block-3.icon')] })
  assert.equal(report.status, 'done', JSON.stringify(report.cause ?? null))
  const named = report.slots.filter((l) => l.part === 'brand-name')
  assert.ok(
    named.some((l) => l.status === 'written' && l.ordered === 'Harbour Padel Club'),
    JSON.stringify(named)
  )
  assert.equal(line('block-3.icon').status, 'written')
})
