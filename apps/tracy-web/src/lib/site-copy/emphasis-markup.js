// Shared: the write step, the copy check and the site check read it, so it lives in lib/ (module-graph.test.mjs).
// The two forms of a heading's emphasis (ADR 0042 section 11, 2026-11-06). The export writes emphasis in content map notation,
// `What we((br/))((span))coach((/span))` (inline-emphasis.js). Where a slot's value is stored decides which form the site needs:
//   - a text inside an HTML value (the content map gives the slot an `xpath`: a T4 section's `main-section`, an article's extra
//     field, a masthead title) prints its stored value as HTML, so it needs real tags: `What we<br/><span>coach</span>`;
//   - a text inside an ACM module's `jatools-config` data is read by the template, which turns the codes into tags itself;
//   - any other place is not known, and the codes stay as they are.
// Pure, no input is modified.

/** One emphasis code: a line break `((br/))`, the opening `((span attrs))` or the closing `((/span))`. */
const EMPHASIS_CODE = /\(\(\s*(?:(br)\b([^()]*?)\s*\/?\s*|(span)\b([^()]*?)\s*|\/\s*(span)\s*)\)\)/gi
/** Any content map code, emphasis or not (`((p))`, `((ul class="x"))`). */
const ANY_CODE = /\(\(\s*\/?[a-z][a-z0-9]*\b[^()]*\)\)/gi
const BREAK_CODE = /\(\(\s*br\b[^()]*\)\)/gi
const BREAK_TAG = /<\s*br\b[^<>]*>/gi
const ANY_TAG = /<\/?[a-z][a-z0-9]*\b[^<>]*>/gi

/** The ACM data the template reads the codes from itself. */
export const CODES_READ_BY_TEMPLATE = 'jatools-config'

/** Whether a value holds an emphasis code. */
export const hasEmphasisCodes = (value) => new RegExp(EMPHASIS_CODE.source, 'i').test(String(value ?? ''))

/** Whether a printed text still shows content map codes as words (`WHAT WE((BR/))((SPAN))COACH`). */
export const showsRawCodes = (text) => new RegExp(ANY_CODE.source, 'i').test(String(text ?? ''))

const isAttributeXpath = (xpath) => /\/@[^/]+$/.test(String(xpath ?? ''))

/**
 * How the site stores a slot's emphasis, from its content map entry.
 * @param {object | null | undefined} slot the content map slot (`xpath`, `nestedJson`, `jsonPath`, `column`)
 * @returns {'html' | 'codes' | 'unknown'}
 */
export function storageOf(slot) {
  if (!slot || typeof slot !== 'object') return 'unknown'
  const xpath = typeof slot.xpath === 'string' && slot.xpath ? slot.xpath : null
  if (slot.nestedJson === CODES_READ_BY_TEMPLATE && !xpath) return 'codes'
  // A text of an HTML value; an attribute (an alt, a title) takes no tags, and a nested HTML value of other data is not known.
  if (xpath && !isAttributeXpath(xpath) && slot.nestedJson === undefined) return 'html'
  return 'unknown'
}

/** Text as an HTML text node is saved: `&`, `<` and `>` as references. */
export const escapeText = (text) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const attrsOf = (raw) => {
  const attrs = String(raw ?? '').trim()
  return attrs ? ` ${attrs}` : ''
}

/**
 * The value with its emphasis codes as real tags, in the demo's own shape (`<br/>`, `<span attrs>`), and every other piece of
 * it escaped as text: only the emphasis tags are markup. Other content map codes are text here, escaped like the rest.
 */
export function codesToHtml(value) {
  const text = String(value ?? '')
  let out = ''
  let from = 0
  for (const m of text.matchAll(EMPHASIS_CODE)) {
    out += escapeText(text.slice(from, m.index))
    if (m[1]) out += `<br${attrsOf(m[2])}/>`
    else if (m[3]) out += `<span${attrsOf(m[4])}>`
    else out += '</span>'
    from = m.index + m[0].length
  }
  return out + escapeText(text.slice(from))
}

/** Real emphasis tags back as codes, so two values that differ only in the form of their emphasis read the same. */
export const tagsToCodes = (value) =>
  String(value ?? '')
    .replace(/<\s*br\b([^<>]*?)\s*\/?\s*>/gi, (_, a) => `((br${attrsOf(a)}/))`)
    .replace(/<\s*span\b([^<>]*?)\s*>/gi, (_, a) => `((span${attrsOf(a)}))`)
    .replace(/<\s*\/\s*span\s*>/gi, '((/span))')

const REFERENCES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/**
 * Removes codes and tags until nothing changes: one pass can leave a new tag behind when removing a piece joins the text around
 * it (`<scr<script>ipt>` loses the inner tag and reads `<script>` again), so a single pass is not a full strip.
 */
function stripUntilStable(text) {
  let current = text
  for (;;) {
    const next = current
      .replace(BREAK_CODE, ' ')
      .replace(BREAK_TAG, ' ')
      .replace(ANY_CODE, '')
      .replace(ANY_TAG, '')
    if (next === current) return next
    current = next
  }
}

/**
 * What a visitor reads of a value: codes and tags left out, a line break as a space, references read, spaces collapsed.
 * The copy check and the plugin count this, never the markup.
 */
export function visibleText(value) {
  return stripUntilStable(String(value ?? ''))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, name) => REFERENCES[name.toLowerCase()])
    .replace(/\s+/g, ' ')
    .trim()
}
