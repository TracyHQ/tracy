// One picture of the measured brand colours for the owner review sheet: the main colour with the words written on it,
// the secondary, each side's ground, the status colours, the brand variables, and where the brand colour sits inside
// pictures. Drawn as HTML and shot in the browser (no image library).

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const swatch = (colour, label, note = '', ink = null) =>
  `<div class="sw"><div class="chip" style="background:${esc(colour)};color:${esc(ink ?? '#000')}">${ink ? 'Aa' : ''}</div><b>${esc(label)}</b><code>${esc(colour)}</code><small>${esc(note)}</small></div>`

/** The HTML of the palette picture. @param {object} bc `site.brandColours` @param {string} title */
export function paletteHtml(bc, title) {
  const rows = []
  if (bc.primary)
    rows.push([
      'Main colour',
      [swatch(bc.primary.value, 'primary', bc.primary.roles.join(', '), bc.primary.wordsOn?.[0])]
    ])
  if (bc.secondary)
    rows.push(['Secondary', [swatch(bc.secondary.value, 'secondary', bc.secondary.roles.join(', '))]])
  rows.push([
    'Page grounds by side',
    bc.sides
      .filter((s) => s.ground && (s.marker === 'base' || s.groundFrom === 'own'))
      .map((s) => swatch(s.ground, s.marker, `${s.groundSide} ground`, bc.primary?.value))
  ])
  const brandTokens = bc.tokens.filter((t) => t.brand)
  if (brandTokens.length)
    rows.push(['Brand variables', brandTokens.slice(0, 8).map((t) => swatch(t.value, t.name, t.side))])
  if (bc.statusColours.length)
    rows.push(['Status colours (never brand)', bc.statusColours.slice(0, 8).map((c) => swatch(c, ''))])
  const places = [
    `${bc.dataUriIcons.length} stylesheet icon(s) drawn in the brand colour`,
    `${bc.inlineIcons.length} inline icon(s) painted in it`,
    `${bc.pictures.length} picture file(s) holding it`,
    `${bc.onPictureScopes.selectors.length} part(s) with words on a picture, judged on ${bc.onPictureScopes.judgedOn}`
  ]
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:24px;font:14px/1.4 system-ui,sans-serif;background:#fff;color:#111;width:960px}
h1{font-size:20px;margin:0 0 16px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#555;margin:18px 0 8px}
.row{display:flex;flex-wrap:wrap;gap:14px}.sw{width:160px}.chip{height:64px;border-radius:8px;border:1px solid #0002;display:flex;align-items:center;justify-content:center;font:700 22px system-ui}
b{display:block;margin-top:6px;font-size:12px;word-break:break-all}code{font-size:12px;color:#333}small{display:block;color:#666;font-size:11px}
ul{margin:0;padding-left:18px;color:#333}</style>
<h1>${esc(title)}</h1>${rows.map(([h, s]) => `<h2>${esc(h)}</h2><div class="row">${s.join('')}</div>`).join('')}
<h2>Where the brand colour sits in pictures</h2><ul>${places.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
}

/** Shoot the palette into a PNG file with an open Playwright browser. */
export async function writePalettePng(browser, bc, title, file) {
  const ctx = await browser.newContext({ viewport: { width: 1008, height: 600 }, deviceScaleFactor: 1 })
  try {
    const page = await ctx.newPage()
    await page.setContent(paletteHtml(bc, title))
    await page.screenshot({ path: file, fullPage: true, type: 'png' })
  } finally {
    await ctx.close()
  }
}
