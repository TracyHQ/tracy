// Write the contact sheets (every block image; with `evidence` every list minimum image too) and the owner's
// review sheet as HTML pages in <out>/contact-sheet, and a PNG of each.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { contactSheetPages, sheetCells } from './contact-sheet.mjs'
import { reviewPages, reviewRows } from './review-sheet.mjs'

async function toPng(chromium, files) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } })
    for (const f of files) {
      await page.goto(`file://${f}`, { waitUntil: 'load' })
      await page.screenshot({ path: f.replace(/\.html$/, '.png'), fullPage: true })
    }
  } finally {
    await browser.close()
  }
}

/**
 * @param {{out: string, kit: object, chromium: object, kind: 'blocks'|'evidence'|'review', fixes?: object[]}} o
 * @returns {Promise<{files: string[], count: number}>}
 */
export async function writeSheets({ out, kit, chromium, kind, fixes = [] }) {
  const dir = join(out, 'contact-sheet')
  mkdirSync(dir, { recursive: true })
  let pages
  let count
  if (kind === 'review') {
    const rows = reviewRows(kit, fixes)
    count = rows.length
    pages = reviewPages(rows, { title: 'Template kit review' })
  } else {
    const cells = sheetCells(kit, { evidence: kind === 'evidence' })
    count = cells.length
    pages = contactSheetPages(cells, { title: `Template kit ${kind}` })
  }
  const files = pages.map((html, i) => {
    const f = join(dir, `${kind}-${String(i + 1).padStart(2, '0')}.html`)
    writeFileSync(f, html)
    return f
  })
  await toPng(chromium, files)
  return { files, count }
}
