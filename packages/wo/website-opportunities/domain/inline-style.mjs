// Replace the words, never the style (spec TracyHQ/tracy#189, COO rule 29/10/2026).
//
// A template heading often mixes styles inside one line: "THE<br><span>WORKOUT</span>" (first word plain, a line break, the
// key word in the accent colour), "OUR <span class="accent">BREADS</span>", or a JA ACM field that spells the same markup as
// `((span))NO1((/span)) BOXING STUDIO`. A build that writes plain words into such a slot loses the accent and the break.
//
// This module reads the demo value of a slot as a STYLE PATTERN (its text parts, the inline tags around each, its line
// breaks and where the styled parts sit), tells the writer that pattern in a small marker language (`[[words]]` for a
// styled part, `[[br]]` for a line break), and rebuilds the demo's own tags around the words the writer marked. Only the
// demo's own inline tags are ever written, with the demo's own attributes: the writer's text is escaped and any markup in it
// is dropped. Words with no marks, or marks that do not fit the pattern, get the style by position (the last word when the
// demo styled its last word, a break where the demo broke). Pure: no I/O, CMS-agnostic.

/** The inline elements a style pattern may hold. Anything else (a link, a picture, a block) is not a pattern. */
const INLINE = new Set(['span', 'strong', 'em', 'b', 'i', 'mark', 'u', 'small', 'sup', 'sub', 'br'])
/** A tag in the form a JA ACM field stores it: `((span class="x"))`, `((/span))`, `((br/))`. */
const ACM_TAG = /\(\((\/?[a-z][\w-]*(?:\s[^()]*)?\/?)\)\)/gi
const MARK = /\[\[([\s\S]*?)\]\]/g
const BREAK = 'br'

/**
 * @typedef {{ kind: 'text', words: string, source?: string, open: string[], close: string[] }} TextPart
 * @typedef {{ kind: 'br', raw: string, lead?: string, gap?: string }} BreakPart - `lead`/`gap`: the space the demo had
 *   before/after the break, which is the only gap between the words where a narrow screen hides the break
 * @typedef {{ form: 'html' | 'acm', parts: Array<TextPart | BreakPart>, styled: number[], positions: string[],
 *   breaks: number, hint: string, plain: string }} StylePattern
 */

const squash = (/** @type {string} */ s) => s.replace(/\s+/g, ' ')
const wordsOf = (/** @type {string} */ s) => squash(s).trim().split(' ').filter(Boolean)
const decode = (/** @type {string} */ s) =>
  s
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
const escapeHtml = (/** @type {string} */ s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The style pattern of a demo value, or null when it carries no inline styling (plain words, or markup that is not inline).
 * @param {unknown} value - the demo's own value: HTML (`<span>`) or JA ACM markers (`((span))`)
 * @returns {StylePattern | null}
 */
export function inlineStylePattern(value) {
  const raw = String(value ?? '')
  const form = /\(\(\/?[a-z]/i.test(raw) && !/<\/?[a-z]/i.test(raw) ? 'acm' : 'html'
  const html = form === 'acm' ? raw.replace(ACM_TAG, '<$1>') : raw
  if (!/<\/?[a-z]/i.test(html)) return null
  /** @type {Array<TextPart | BreakPart>} */
  const parts = []
  /** @type {Array<{ name: string, raw: string }>} */
  const stack = []
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g)) {
    if (m[4] !== undefined) {
      const words = decode(m[4])
      const last = parts.at(-1)
      if (last?.kind === 'br' && /^\s/.test(words)) last.gap = ' '
      // Spacing between parts is the parts' own business; a run of spaces alone is no part.
      if (words.trim() === '') continue
      parts.push({
        kind: 'text',
        words: squash(words).trim(),
        source: words,
        open: stack.map((t) => t.raw),
        close: [...stack].reverse().map((t) => `</${t.name}>`)
      })
      continue
    }
    const name = m[2].toLowerCase()
    if (!INLINE.has(name)) return null
    if (name === BREAK) {
      const before = /** @type {any} */ (parts.at(-1))
      parts.push({
        kind: 'br',
        raw: m[0],
        ...(before?.kind === 'text' && /\s$/.test(before.source) ? { lead: ' ' } : {})
      })
      continue
    }
    if (m[1] === '/') {
      const at = stack.map((t) => t.name).lastIndexOf(name)
      if (at >= 0) stack.splice(at, 1)
    } else if (!m[3].trim().endsWith('/')) stack.push({ name, raw: m[0] })
  }
  const texts = parts.filter((p) => p.kind === 'text')
  if (texts.length === 0) return null
  const styled = parts.flatMap((p, i) => (p.kind === 'text' && p.open.length > 0 ? [i] : []))
  const breaks = parts.filter((p) => p.kind === 'br').length
  if (styled.length === 0 && breaks === 0) return null
  // Where each styled part sits among the words: what the fallback reads when the writer gave no fitting marks.
  const total = texts.length
  const positions = styled.map((i) => {
    const n = texts.indexOf(/** @type {TextPart} */ (parts[i]))
    return total === 1 ? 'whole' : n === 0 ? 'first' : n === total - 1 ? 'last' : 'middle'
  })
  const hint = parts
    .map((p) => (p.kind === 'br' ? `[[${BREAK}]]` : p.open.length > 0 ? `[[${p.words}]]` : ` ${p.words} `))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/ ?\[\[br\]\] ?/g, '[[br]]')
    .trim()
  return { form, parts, styled, positions, breaks, hint, plain: texts.map((p) => p.words).join(' ') }
}

/** Whether a value carries the writer's style marks. */
export const hasStyleMarks = (/** @type {unknown} */ value) => /\[\[[\s\S]*?\]\]/.test(String(value ?? ''))

/**
 * The writer's words without its marks, and without any markup it wrote: what a visitor reads, on one line.
 * @param {unknown} value
 */
export function unmarked(value) {
  return squash(
    String(value ?? '')
      .replace(MARK, (_, inner) => (inner.trim().toLowerCase() === BREAK ? ' ' : ` ${inner} `))
      .replace(/<[^>]*>|\(\([^()]*\)\)/g, ' ')
      .replace(/\[\[|\]\]/g, ' ')
  ).trim()
}

/**
 * The writer's text read as pieces: plain runs, marked runs and breaks. Any markup it wrote is dropped first.
 * @param {string} value
 * @returns {Array<{ kind: 'plain' | 'mark', words: string } | { kind: 'br' }>}
 */
function piecesOf(value) {
  const clean = value.replace(/<[^>]*>|\(\([^()]*\)\)/g, ' ')
  /** @type {Array<{ kind: 'plain' | 'mark', words: string } | { kind: 'br' }>} */
  const out = []
  let at = 0
  const plain = (/** @type {string} */ s) => {
    const words = squash(s.replace(/\[\[|\]\]/g, ' ')).trim()
    if (words) out.push({ kind: 'plain', words })
  }
  for (const m of clean.matchAll(MARK)) {
    plain(clean.slice(at, m.index))
    const inner = squash(m[1]).trim()
    if (inner.toLowerCase() === BREAK) out.push({ kind: 'br' })
    else if (inner) out.push({ kind: 'mark', words: inner })
    at = /** @type {number} */ (m.index) + m[0].length
  }
  plain(clean.slice(at))
  return out
}

/**
 * The words laid on the pattern from the writer's marks, or null when the marks do not fit it: as many marked runs as the
 * pattern has styled parts, and breaks only as many as the pattern has.
 * @param {StylePattern} pattern
 * @param {ReturnType<typeof piecesOf>} pieces
 */
function fromMarks(pattern, pieces) {
  const marks = pieces.filter((p) => p.kind === 'mark')
  const breaks = pieces.filter((p) => p.kind === 'br').length
  if (marks.length !== pattern.styled.length || breaks > pattern.breaks) return null
  if (marks.length === 0 && breaks === 0) return null
  const styleOf = pattern.styled.map((i) => /** @type {TextPart} */ (pattern.parts[i]))
  const plainStyle = /** @type {TextPart | undefined} */ (
    pattern.parts.find((p) => p.kind === 'text' && p.open.length === 0)
  )
  let k = 0
  // The writer's breaks stand where it put them; with none, the pattern's breaks keep their place by position below.
  const laid = pieces.map((p) =>
    p.kind === 'br'
      ? { ...firstBreak(pattern) }
      : p.kind === 'mark'
        ? { kind: 'text', words: p.words, open: styleOf[k].open, close: styleOf[k++].close }
        : { kind: 'text', words: p.words, open: plainStyle?.open ?? [], close: plainStyle?.close ?? [] }
  )
  return breaks === 0 && pattern.breaks > 0 ? withPatternBreaks(pattern, laid) : laid
}

const firstBreak = (/** @type {StylePattern} */ pattern) =>
  /** @type {BreakPart} */ (
    pattern.parts.find((p) => p.kind === 'br') ?? { kind: 'br', raw: '<br>', gap: ' ' }
  )

/**
 * The pattern's breaks put back where the pattern has them, by the styled part they stand beside: a break before the demo's
 * styled part stands before the new styled part, one after it after.
 * @param {StylePattern} pattern
 * @param {any[]} laid
 */
function withPatternBreaks(pattern, laid) {
  const out = [...laid]
  const styledAt = laid.flatMap((p, i) => (p.kind === 'text' && p.open.length > 0 ? [i] : []))
  pattern.parts.forEach((part, i) => {
    if (part.kind !== 'br') return
    const before = pattern.styled.indexOf(i + 1)
    const after = pattern.styled.indexOf(i - 1)
    let at = -1
    if (before >= 0 && styledAt[before] !== undefined) at = out.indexOf(laid[styledAt[before]])
    else if (after >= 0 && styledAt[after] !== undefined) at = out.indexOf(laid[styledAt[after]]) + 1
    else at = splitAt(pattern, i, out)
    if (at > 0 && at < out.length && out[at - 1].kind !== 'br') out.splice(at, 0, { ...part })
  })
  return out
}

/**
 * Where a break between plain words goes in the new words: at the same share of the words as in the demo (a demo that broke
 * a sentence after half its words breaks the new one after half of its), splitting a text part when the place falls inside
 * one. Returns the index in `out` the break is inserted at, or -1.
 * @param {StylePattern} pattern
 * @param {number} i - the break's index in the pattern
 * @param {any[]} out - the laid parts, changed in place when a part is split
 */
function splitAt(pattern, i, out) {
  const count = (/** @type {any[]} */ parts) =>
    parts.filter((p) => p.kind === 'text').reduce((n, p) => n + wordsOf(p.words).length, 0)
  const demoTotal = count(pattern.parts)
  const total = count(out)
  if (demoTotal === 0 || total < 2) return -1
  const k = Math.min(
    total - 1,
    Math.max(1, Math.round((count(pattern.parts.slice(0, i)) / demoTotal) * total))
  )
  let seen = 0
  for (let n = 0; n < out.length; n += 1) {
    const part = out[n]
    if (part.kind !== 'text') continue
    const words = wordsOf(part.words)
    if (seen + words.length === k) return n + 1
    if (seen + words.length > k) {
      const cut = k - seen
      out.splice(
        n,
        1,
        { ...part, words: words.slice(0, cut).join(' ') },
        { ...part, words: words.slice(cut).join(' ') }
      )
      return n + 1
    }
    seen += words.length
  }
  return -1
}

/**
 * The words laid on the pattern by position: each styled part of the demo takes as many words at the same place (the last
 * word when the demo styled its last word), the other words stay plain, and the breaks keep their place beside the styled
 * parts. Never drops the style: one word is enough to carry it.
 * @param {StylePattern} pattern
 * @param {string} text
 */
function byPosition(pattern, text) {
  const words = wordsOf(text)
  if (words.length === 0) return []
  const texts = /** @type {TextPart[]} */ (pattern.parts.filter((p) => p.kind === 'text'))
  const demoWords = texts.map((p) => wordsOf(p.words).length)
  const demoTotal = demoWords.reduce((a, b) => a + b, 0)
  /** @type {Array<{ start: number, end: number, part: TextPart }>} */
  const spans = []
  let start = 0
  for (const [n, part] of texts.entries()) {
    const end = start + demoWords[n]
    if (part.open.length > 0) {
      const size = Math.max(1, Math.min(demoWords[n], words.length - (texts.length > 1 ? 1 : 0)))
      const position = pattern.positions[pattern.styled.indexOf(pattern.parts.indexOf(part))]
      const from =
        position === 'whole'
          ? 0
          : position === 'first'
            ? 0
            : position === 'last'
              ? words.length - size
              : Math.min(words.length - size, Math.round((start / demoTotal) * words.length))
      spans.push({
        start: Math.max(0, from),
        end: position === 'whole' ? words.length : Math.max(0, from) + size,
        part
      })
    }
    start = end
  }
  // Styled parts never overlap: a later one starts where the one before it ended.
  spans.sort((a, b) => a.start - b.start)
  for (let i = 1; i < spans.length; i += 1)
    if (spans[i].start < spans[i - 1].end) {
      spans[i].start = spans[i - 1].end
      spans[i].end = Math.max(spans[i].end, spans[i].start + 1)
    }
  const plainStyle = texts.find((p) => p.open.length === 0)
  const laid = []
  let at = 0
  const plain = (/** @type {number} */ to) => {
    if (to > at)
      laid.push({
        kind: 'text',
        words: words.slice(at, to).join(' '),
        open: plainStyle?.open ?? [],
        close: plainStyle?.close ?? []
      })
    at = Math.max(at, to)
  }
  for (const span of spans) {
    if (span.start >= words.length) break
    plain(span.start)
    const end = Math.min(words.length, span.end)
    laid.push({
      kind: 'text',
      words: words.slice(span.start, end).join(' '),
      open: span.part.open,
      close: span.part.close
    })
    at = end
  }
  plain(words.length)
  return pattern.breaks > 0 ? withPatternBreaks(pattern, laid) : laid
}

/**
 * The new words written in the demo's style.
 * @param {StylePattern} pattern
 * @param {unknown} written - the writer's words, with or without `[[...]]` marks
 * @returns {{ value: string, plain: string, by: 'marks' | 'position' }} `value` in the pattern's own form (HTML, or JA ACM
 *   markers); `plain` the words a visitor reads, for a door that takes plain words only
 */
export function applyInlineStyle(pattern, written) {
  const text = String(written ?? '')
  const pieces = piecesOf(text)
  const marked = hasStyleMarks(text) ? fromMarks(pattern, pieces) : null
  const laid = marked ?? byPosition(pattern, unmarked(text))
  // Leading and trailing breaks show as empty lines: a break only stands between words.
  while (laid.length && laid[0].kind === 'br') laid.shift()
  while (laid.length && laid.at(-1).kind === 'br') laid.pop()
  const textOf = (/** @type {string} */ s) =>
    pattern.form === 'acm' ? s.replace(/[<>]/g, ' ').replace(/\(\(|\)\)/g, ' ') : escapeHtml(s)
  const tagOf = (/** @type {string} */ s) =>
    pattern.form === 'acm' ? s.replace(/^</, '((').replace(/>$/, '))') : s
  let value = ''
  for (const [i, part] of laid.entries()) {
    if (part.kind === 'br') {
      value += (part.lead ?? '') + tagOf(part.raw) + (part.gap ?? '')
      continue
    }
    const gap = i > 0 && laid[i - 1].kind === 'text' ? ' ' : ''
    value += gap + part.open.map(tagOf).join('') + textOf(part.words) + part.close.map(tagOf).join('')
  }
  return { value, plain: unmarked(text), by: marked ? 'marks' : 'position' }
}

/**
 * Whether a stored value still carries the pattern's style: every styled part's innermost tag, and the breaks, are there.
 * @param {StylePattern} pattern
 * @param {unknown} stored - the value as the site holds it (HTML or JA ACM markers)
 */
export function keepsInlineStyle(pattern, stored) {
  const value = String(stored ?? '').replace(ACM_TAG, '<$1>')
  for (const i of pattern.styled) {
    const open = /** @type {TextPart} */ (pattern.parts[i]).open.at(-1) ?? ''
    if (open && !value.includes(open)) return false
  }
  return pattern.breaks === 0 || /<br\b/i.test(value)
}
