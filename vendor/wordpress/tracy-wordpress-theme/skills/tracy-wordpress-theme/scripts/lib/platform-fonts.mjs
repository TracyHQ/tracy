// The font the renderer actually drew with, per node — shared by Visual QA (port vs source) and the
// Phase 2 source-font measurement (ingest/source-font-browser.mjs).

/**
 * The font the renderer actually used for a few sample nodes (CDP CSS.getPlatformFontsForNode):
 * the computed `font-family` string says what was asked for, not what drew the glyphs — a theme
 * that never ships Newsreader still reports "Newsreader, serif" while Times paints the page. A
 * generic first family (system-ui, sans-serif…) asks for nothing specific and is not checked.
 * Each sample also carries `fonts`: every platform font of the node with its glyph count.
 */
export async function platformFonts(page, selectors) {
  const client = await page.context().newCDPSession(page)
  const out = []
  try {
    await client.send('DOM.enable')
    await client.send('CSS.enable')
    const { root } = await client.send('DOM.getDocument', { depth: -1 })
    for (const selector of selectors) {
      const { nodeIds } = await client.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector })
      for (const nodeId of nodeIds.slice(0, 3)) {
        const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId }).catch(() => ({ fonts: [] }))
        const requested = await page.evaluate(
          ({ selector, i }) => {
            const el = document.querySelectorAll(selector)[i]
            return el ? getComputedStyle(el).fontFamily : null
          },
          { selector, i: nodeIds.indexOf(nodeId) }
        )
        if (!requested || !fonts?.length) continue
        const used = fonts.sort((a, b) => b.glyphCount - a.glyphCount)[0]
        out.push({ selector, requested, used: used.familyName, custom: used.isCustomFont, fonts: fonts.map((f) => ({ name: f.familyName, custom: Boolean(f.isCustomFont), glyphs: f.glyphCount })) })
      }
    }
  } finally {
    await client.detach().catch(() => null)
  }
  return out
}


/**
 * The platform fonts that painted each element carrying `[attr="<id>"]`: { id: [{ name, custom, glyphs }] }. An element the renderer reports no font for is
 * absent — "not known" is not "no web font". The same CDP call as platformFonts, for elements the page marked itself.
 */
export async function platformFontsOfMarked(page, attr, ids) {
  const out = {}
  if (!ids.length) return out
  const client = await page.context().newCDPSession(page)
  try {
    await client.send('DOM.enable')
    await client.send('CSS.enable')
    const { root } = await client.send('DOM.getDocument', { depth: -1 })
    for (const id of ids) {
      const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[${attr}="${id}"]` }).catch(() => ({ nodeId: 0 }))
      if (!nodeId) continue
      const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId }).catch(() => ({ fonts: [] }))
      if (fonts?.length) out[id] = fonts.map((f) => ({ name: f.familyName, custom: Boolean(f.isCustomFont), glyphs: f.glyphCount }))
    }
  } finally {
    await client.detach().catch(() => null)
  }
  return out
}
