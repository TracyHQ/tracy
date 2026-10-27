import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pdfTextPages } from 'website-opportunities/src/menu-pdf-text.js'
import { menuItemsFromPdfPages } from '../../../packages/wo/website-opportunities/domain/menu-reader.mjs'

/** A one-page PDF with Helvetica text at the given positions (x, y in points), xref offsets computed. */
function pdfOf(lines) {
  const stream = lines
    .map(
      ([x, y, text, size = 10]) => `BT /F1 ${size} Tf ${x} ${y} Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`
    )
    .join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(out, 'latin1'))
}

test('a real two-column PDF menu with prices by size reads into the same items as its layout', async () => {
  const bytes = pdfOf([
    [50, 800, 'PIZZA', 12],
    [200, 800, 'Small'],
    [250, 800, 'Large'],
    [320, 800, 'DRINKS', 12],
    [50, 780, 'Margherita'],
    [200, 780, '8.50'],
    [250, 780, '12.00'],
    [320, 780, 'Espresso'],
    [480, 780, '2.50'],
    [50, 760, 'Tiramisu'],
    [200, 745, '6.00']
  ])
  const pages = await pdfTextPages(bytes)
  assert.equal(pages.length, 1)
  const items = menuItemsFromPdfPages(pages, {
    source: { url: 'https://phin.test/menu.pdf', sha256: 'b'.repeat(64), kind: 'pdf' },
    collectedAt: '2026-10-23T10:00:00.000Z'
  })
  assert.deepEqual(
    items.map((i) => [i.name, i.price, i.size ?? null, i.section, i.verified, i.source.page]),
    [
      ['Margherita', '8.50', 'Small', 'PIZZA', true, 1],
      ['Margherita', '12.00', 'Large', 'PIZZA', true, 1],
      ['Espresso', '2.50', null, 'DRINKS', true, 1],
      ['Tiramisu', '6.00', null, 'PIZZA', false, 1]
    ]
  )
})

test('bytes that are not a PDF throw, so the reader reports the source failed', async () => {
  await assert.rejects(() => pdfTextPages(new TextEncoder().encode('%PDF-1.4 broken')))
})
