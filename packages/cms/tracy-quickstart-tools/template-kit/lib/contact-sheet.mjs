// A contact sheet of every block image of a kit (the pack's images), so a person or an agent
// reading an image can eyeball them at once: misaligned, blank, cut by a header, or the same block twice.
const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** The cells of the sheet: each block image per width, in kit order. */
export function sheetCells(kit) {
  const cells = []
  // Pages and blocks name images by id; the image list says where each one is.
  const pathOf = new Map((kit.images ?? []).map((i) => [i.id, i.path]))
  const file = (id) => pathOf.get(id) ?? id
  for (const b of kit.blocks)
    for (const w of kit.widths.map(String))
      if (b.images?.[w]) cells.push({ label: b.id, width: w, file: file(b.images[w]) })
  return cells
}

/** One HTML page per chunk of cells; image paths are relative to `base`. */
export function contactSheetPages(cells, { title, base = '..', perPage = 60 } = {}) {
  const pages = []
  for (let i = 0; i < Math.max(cells.length, 1); i += perPage) {
    const chunk = cells.slice(i, i + perPage)
    const items = chunk
      .map(
        (c) =>
          `<figure class="w${c.width}"><img src="${esc(`${base}/${c.file}`)}" alt=""><figcaption>${esc(c.label)} · ${esc(c.width)}</figcaption></figure>`
      )
      .join('\n')
    pages.push(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)} ${pages.length + 1}</title>
<style>
body{margin:0;padding:16px;background:#e9e9ec;font:12px/1.3 system-ui,sans-serif;color:#111}
h1{font-size:16px;margin:0 0 12px}
main{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}
figure{margin:0;background:#fff;padding:6px;border:1px solid #c9c9cf}
figure.w1440 img{width:300px}
figure.w390 img{width:120px}
img{display:block;max-height:520px;object-fit:contain;object-position:top;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/12px 12px}
figcaption{max-width:300px;margin-top:4px;word-break:break-all}
</style></head><body><h1>${esc(title)} · sheet ${pages.length + 1} · ${chunk.length} images</h1><main>
${items}
</main></body></html>
`)
  }
  return pages
}
