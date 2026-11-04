// Pure rules of the K6 script (k6-edit-one-slot.mjs), kept apart so they can be tested without a site.

// Shortest old text a slot may have: a short word ("Other") also sits inside menu words ("Other Pages").
export const MIN_SAMPLE_LENGTH = 12

/**
 * The longest new text the plugin accepts for a slot, computed like the plugin's write check
 * (SlotFit::checkText in the Claude Cowork plugin): the slot's own maxCharacters, then, only when the
 * slot carries a measured fit, fit.maxCharacters, else the smallest integer of fit.maxChars. The
 * smallest of those wins. Returns 0 when nothing usable is known.
 */
export function effectiveLimit(slot) {
  const own = Number.isInteger(slot?.maxCharacters) && slot.maxCharacters > 0 ? slot.maxCharacters : null
  let fitLimit = null
  const fit = slot?.fit
  if (fit && typeof fit === 'object' && !Array.isArray(fit) && fit.measured === true) {
    if (Number.isInteger(fit.maxCharacters)) fitLimit = fit.maxCharacters
    else if (fit.maxChars && typeof fit.maxChars === 'object') {
      const all = Object.values(fit.maxChars).filter(Number.isInteger)
      if (all.length > 0) fitLimit = Math.min(...all)
    }
    if (fitLimit !== null && fitLimit <= 0) fitLimit = null
  }
  const limits = [own, fitLimit].filter((n) => n !== null)
  return limits.length > 0 ? Math.min(...limits) : 0
}

/** New text for a slot: the full marker when the limit allows, else a shorter one; null when none fits. */
export function pickNewText(stamp, limit) {
  const digits = stamp.slice(-6)
  for (const text of [`K6 edit ${digits}`, `K6 ${digits}`]) if (text.length <= limit) return text
  return null
}

/**
 * Whole-text matches of `text` in an HTML page: text nodes whose trimmed text equals `text`, so
 * "Other" does not match inside "Other Pages". Returns the count and, for the first match, the
 * index just after the matched words in `html` (-1 when none).
 */
export function wholeTextMatches(html, text) {
  let count = 0
  let end = -1
  const nodes = />([^<>]+)(?=<)/g
  for (let match = nodes.exec(html); match; match = nodes.exec(html)) {
    const raw = match[1]
    if (raw.trim() !== text) continue
    count += 1
    if (end === -1) end = match.index + 1 + raw.indexOf(text) + text.length
  }
  return { count, end }
}
