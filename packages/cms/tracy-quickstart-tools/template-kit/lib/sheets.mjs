// Write the contact sheet (every block image) and the owner's
// review sheet as HTML pages in <out>/contact-sheet. They show the kit's own images only: nothing is shot for them.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { contactSheetPages, sheetCells } from './contact-sheet.mjs'
import { reviewPages, reviewRows } from './review-sheet.mjs'

/**
 * @param {{out: string, kit: object, kind: 'blocks'|'review', fixes?: object[]}} o
 * @returns {Promise<{files: string[], count: number}>}
 */
export async function writeSheets({ out, kit, kind, fixes = [] }) {
  const dir = join(out, 'contact-sheet')
  mkdirSync(dir, { recursive: true })
  let pages
  let count
  if (kind === 'review') {
    const rows = reviewRows(kit, fixes)
    count = rows.length
    pages = reviewPages(rows, { title: 'Template kit review' })
  } else {
    const cells = sheetCells(kit)
    count = cells.length
    pages = contactSheetPages(cells, { title: `Template kit ${kind}` })
  }
  const files = pages.map((html, i) => {
    const f = join(dir, `${kind}-${String(i + 1).padStart(2, '0')}.html`)
    writeFileSync(f, html)
    return f
  })
  return { files, count }
}
