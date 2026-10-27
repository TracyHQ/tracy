/**
 * PREVIEW-PARITY: the Design system popup shows the template as Try on shows it (Akemi, 17/10/2026: JA
 * Essence's carousel cut, JA Vital's and Podcast's icons as empty squares in the popup but not on the page;
 * a customer takes that for a bug). Measured by apps/tracy-web/scripts/preview-parity.mjs into the
 * measurement file's `previewParity` block: per declared page, system and width, the differences a visitor
 * sees between the popup's page and the page after Try on (icons, fonts, large blocks, carousels).
 *
 * 🔒 It belongs to preview probe v10 (`PARITY_SINCE`): while PREVIEW_PROBE_VERSION is lower the rule is
 * not on the list (measurement.mjs `BUILT_SITE_RULES`, /ops `RULES`), so no file judges differently.
 */

/** The preview probe version the rule belongs to. */
export const PARITY_SINCE = 10
export const PARITY_RULE = 'PREVIEW-PARITY'

const isPath = (/** @type {unknown} */ p) => typeof p === 'string' && p.startsWith('/') && p.length < 500
const isCount = (/** @type {unknown} */ x) => Number.isInteger(x) && /** @type {number} */ (x) >= 0

/**
 * Every way a `previewParity` block is not one. PURE.
 * @param {any} b
 * @returns {string[]}
 */
export function validateParity(b) {
  if (b === undefined || b === null) return []
  if (typeof b !== 'object' || Array.isArray(b)) return ['previewParity must be an object']
  const out = []
  if (!(Number.isInteger(b.probeVersion) && b.probeVersion > 0))
    out.push('previewParity.probeVersion must be a positive integer')
  if (typeof b.popup !== 'string' || !b.popup)
    out.push('previewParity.popup must name the popup path measured')
  if (!Array.isArray(b.pages) || !b.pages.every(isPath))
    out.push('previewParity.pages must be a list of paths')
  if (!Array.isArray(b.rows)) out.push('previewParity.rows must be a list')
  else
    b.rows.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
      if (!r || typeof r !== 'object') return out.push(`previewParity.rows[${i}] must be an object`)
      if (!isPath(r.page)) out.push(`previewParity.rows[${i}].page must be a path`)
      if (typeof r.system !== 'string' || !r.system)
        out.push(`previewParity.rows[${i}].system must be a system id`)
      if (!isCount(r.count)) out.push(`previewParity.rows[${i}].count must be a count`)
      if (!Array.isArray(r.findings)) out.push(`previewParity.rows[${i}].findings must be a list`)
    })
  return out
}

const KIND_WORDS = /** @type {Record<string, string>} */ ({
  icon: 'icon glyphs that do not load (empty squares)',
  font: 'fonts that do not load',
  box: 'blocks hidden or sized apart',
  slider: 'carousels laid out apart',
  page: 'the page a share taller or shorter'
})

/**
 * The rule from the block. PURE.
 * @param {any} block the file's `previewParity`
 * @param {{ probe?: number, pages?: string[] | null, label?: (system: string) => string }} [o]
 *   `probe`: the current preview probe version; `pages`: the declared pages (the file's `previewPages`, else
 *   the block's own list)
 * @returns {{ status: 'pass' | 'fail' | 'unmeasurable', note: string, findings?: any[] }}
 */
export function judgeParity(block, { probe = PARITY_SINCE, pages = null, label = (s) => s } = {}) {
  if (!block || !Array.isArray(block.rows))
    return { status: 'unmeasurable', note: 'the Design system popup was not compared with Try on' }
  if (!(Number.isInteger(block.probeVersion) && block.probeVersion >= probe))
    return { status: 'unmeasurable', note: 'measured with an older preview probe — measure again' }
  const declared = Array.isArray(pages) && pages.length ? pages : (block.pages ?? [])
  const bad = block.rows.filter((/** @type {any} */ r) => r.count > 0)
  const missing = declared.filter(
    (/** @type {string} */ p) => !block.rows.some((/** @type {any} */ r) => r.page === p)
  )
  const notMeasured = missing.length
    ? `not measured on ${missing.length} of ${declared.length} declared pages (${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', …' : ''})`
    : null
  if (!bad.length)
    return missing.length || !block.rows.length
      ? { status: 'unmeasurable', note: notMeasured ?? 'no page was compared' }
      : { status: 'pass', note: `the popup (${block.popup}) shows every page as Try on does` }
  // one line per kind: where, on which pages and systems
  /** @type {Map<string, { at: Set<string>, on: Set<string> }>} */
  const byKind = new Map()
  for (const r of bad)
    for (const f of r.findings ?? []) {
      const k = byKind.get(f.kind) ?? { at: new Set(), on: new Set() }
      k.at.add(f.family ? `${f.family} (${f.at})` : f.at)
      k.on.add(`${r.page} ${label(r.system)}/${r.width}`)
      byKind.set(f.kind, k)
    }
  const notes = [...byKind].map(
    ([kind, k]) =>
      `${KIND_WORDS[kind] ?? kind}: ${[...k.at].slice(0, 6).join(', ')}${k.at.size > 6 ? ', …' : ''} on ${[...k.on].slice(0, 6).join(', ')}${k.on.size > 6 ? ', …' : ''}`
  )
  return {
    status: 'fail',
    note: [`the popup (${block.popup}) differs from Try on — ${notes.join('; ')}`, notMeasured]
      .filter(Boolean)
      .join('; '),
    findings: bad.map((/** @type {any} */ r) => ({
      page: r.page,
      system: r.system,
      width: r.width,
      findings: r.findings
    }))
  }
}
