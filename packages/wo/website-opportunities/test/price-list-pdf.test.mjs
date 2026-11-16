// A price list PDF a business links from its site, or from the link-in-bio page its social bio points at, is read like
// a menu PDF (`menu-reader.mjs`, `src/menu-pdf-text.js`): each service and price that share a row, with the file and
// page it came from. Bounded by the reader's caps: a PDF over the size cap is not read. Fake web, real PDF reader.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { crawlWebsite } from '../domain/website-crawler.mjs'
import { expandLinkPages } from '../domain/link-in-bio.mjs'
import { readMenus } from '../domain/menu-reader.mjs'
import { offeringKindOf } from '../domain/offering-kind.mjs'
import { pdfTextPages } from '../src/menu-pdf-text.js'

const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const SALON_LINKTREE = readFileSync(
  new URL('./fixtures/link-in-bio/linktree-salon.html', import.meta.url),
  'utf8'
)

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

const PRICE_LIST = pdfOf([
  [50, 800, 'HAIR', 12],
  [50, 780, 'Ladies cut and blow dry'],
  [400, 780, 'EUR 45.00'],
  [50, 760, 'Gents cut'],
  [400, 760, 'EUR 25.00'],
  [50, 740, 'NAILS', 12],
  [50, 720, 'Gel manicure'],
  [400, 720, 'EUR 30.00']
])

function web(pages) {
  const calls = []
  const fetch = async (url) => {
    calls.push(url)
    const page = pages[url]
    if (page instanceof Uint8Array)
      return new Response(page, { status: 200, headers: { 'content-type': 'application/pdf' } })
    return typeof page === 'string'
      ? new Response(page, { status: 200, headers: { 'content-type': 'text/html' } })
      : new Response('', { status: 404 })
  }
  return { fetch, calls }
}

const EXPECTED = [
  ['Ladies cut and blow dry', 'EUR 45.00', 'EUR', 'HAIR', true],
  ['Gents cut', 'EUR 25.00', 'EUR', 'HAIR', true],
  ['Gel manicure', 'EUR 30.00', 'EUR', 'NAILS', true]
]
const rowsOf = (items) => items.map((i) => [i.name, i.price, i.currency, i.section, i.verified])

test('a price list PDF linked from the site is read into services and prices with the file they came from', async () => {
  const { fetch } = web({
    'https://harbourcuts.test/':
      '<html><title>Harbour Cuts</title><body><p>Hair and nails in the harbour since 2009.</p>' +
      '<a href="/files/salon-2026.pdf">Our price list</a><a href="/files/terms.pdf">Terms</a></body></html>',
    'https://harbourcuts.test/files/salon-2026.pdf': PRICE_LIST
  })
  const crawl = await crawlWebsite('https://harbourcuts.test/', { maxPages: 3 }, { fetch, resolve })
  assert.deepEqual(crawl.menus, [
    { url: 'https://harbourcuts.test/files/salon-2026.pdf', sourceUrl: 'https://harbourcuts.test/' }
  ])
  const { items, reads } = await readMenus({ menus: crawl.menus, fetch, resolve, pdfText: pdfTextPages })
  assert.deepEqual(reads, [
    { url: 'https://harbourcuts.test/files/salon-2026.pdf', kind: 'pdf', status: 'complete', items: 3 }
  ])
  assert.deepEqual(rowsOf(items), EXPECTED)
  for (const item of items) {
    assert.equal(item.source.url, 'https://harbourcuts.test/files/salon-2026.pdf')
    assert.equal(item.source.kind, 'pdf')
    assert.equal(item.source.page, 1)
    assert.match(item.source.sha256, /^[0-9a-f]{64}$/)
  }
  // A salon's price list offers services, not dishes (`offering-kind.mjs`).
  assert.equal(offeringKindOf(items[0], 'beauty'), 'service')
})

test('a price list PDF on the link-in-bio page a social bio points at is read the same way', async () => {
  const { fetch, calls } = web({
    'https://linktr.ee/harbourcuts': SALON_LINKTREE,
    'https://harbourcuts.test/files/salon-2026.pdf': PRICE_LIST
  })
  const social = await expandLinkPages(
    {
      source: 'instagram',
      status: 'complete',
      profile: {
        name: 'Harbour Cuts',
        website: 'https://linktr.ee/harbourcuts',
        url: 'https://www.instagram.com/harbourcuts/'
      },
      posts: [],
      media: []
    },
    { source: 'instagram' },
    { fetch, resolve }
  )
  const { items } = await readMenus({ menus: social.menus, fetch, resolve, pdfText: pdfTextPages })
  assert.deepEqual(rowsOf(items), EXPECTED)
  assert.deepEqual(calls, ['https://linktr.ee/harbourcuts', 'https://harbourcuts.test/files/salon-2026.pdf'])
})

test('a PDF over the size cap is not read: what a cut-off part says is no price', async () => {
  const big = new Uint8Array(11 * 1024 * 1024).fill(32)
  big.set(PRICE_LIST.subarray(0, PRICE_LIST.length - 1))
  const { fetch } = web({ 'https://harbourcuts.test/files/huge.pdf': big })
  let parsed = 0
  const { items, reads } = await readMenus({
    menus: [{ url: 'https://harbourcuts.test/files/huge.pdf' }],
    fetch,
    resolve,
    pdfText: async (bytes) => {
      parsed += 1
      return pdfTextPages(bytes)
    }
  })
  assert.equal(parsed, 0)
  assert.deepEqual(items, [])
  assert.deepEqual(reads, [
    {
      url: 'https://harbourcuts.test/files/huge.pdf',
      kind: 'pdf',
      status: 'skipped',
      reason: 'too_large',
      items: 0
    }
  ])
})
