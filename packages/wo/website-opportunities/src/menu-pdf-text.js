/**
 * A menu PDF's text with its layout (`pdfTextPages`), for the WO domain's menu reader (`readMenus({pdfText})`): each text
 * run with its position, so a dish and its price are matched by row, never by reading order.
 */
const MAX_PAGES = 20
const MAX_ITEMS = 5000

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<Array<{page: number, items: Array<{str: string, x: number, y: number, w: number, h: number}>}>>}
 */
export async function pdfTextPages(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({
    // pdf.js takes ownership of the buffer it is given.
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
    verbosity: 0
  })
  const doc = await task.promise
  try {
    const pages = []
    let total = 0
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES) && total < MAX_ITEMS; n += 1) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      const items = []
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim() || total >= MAX_ITEMS) continue
        const [, , , d, x, y] = it.transform
        items.push({ str: it.str, x, y, w: it.width, h: it.height || Math.abs(d) })
        total += 1
      }
      pages.push({ page: n, items })
      page.cleanup()
    }
    return pages
  } finally {
    await task.destroy()
  }
}
