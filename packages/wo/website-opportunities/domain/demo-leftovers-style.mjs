// C20 of the demo-leftover check (spec TracyHQ/tracy#189, "replace the words, never the style"): a slot whose demo mixed
// styles inside one line (an accent span, a strong word, a line break) whose written value carries none of it. The served
// page alone cannot say which element a slot became, so the rule reads the values the site stores (`styleReadback`, by slot
// key: what the engine read back after its writes) against the slot's style pattern (`inlineStyle`, from the release). A slot
// with no read-back value is not judged.
import { keepsInlineStyle } from './inline-style.mjs'

/** Plain words of a stored value, for the report. */
const wordsOf = (/** @type {string} */ value) =>
  value
    .replace(/<[^>]*>|\(\([^()]*\)\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * @param {{ contentMap?: { slots?: any[], pages?: any[] } | null, styleReadback?: Record<string, string> }} ctx
 * @returns {Array<{ page: string, place: string, found: string }>}
 */
export function styleLeftovers(ctx) {
  const stored = ctx.styleReadback ?? {}
  const pages = ctx.contentMap?.pages ?? []
  /** The page a slot's entity shows on: the first page that is that entity or carries it. */
  const pageOf = (/** @type {string} */ entity) => {
    const page = pages.find(
      (p) => p?.entity === entity || (p?.assignedModules ?? []).some((m) => m?.entity === entity)
    )
    return page?.route ? `/${String(page.route).replace(/^\/+/, '')}` : '/'
  }
  const out = []
  for (const slot of ctx.contentMap?.slots ?? []) {
    if (!slot?.inlineStyle || typeof stored[slot.key] !== 'string') continue
    if (keepsInlineStyle(slot.inlineStyle, stored[slot.key])) continue
    out.push({
      page: pageOf(String(slot.entity)),
      place: slot.key,
      found: wordsOf(stored[slot.key]).slice(0, 80)
    })
  }
  return out
}
