// The text and picture keys the demo scan compares by (ticket #585). One spelling for a piece of words however a page
// or a release file writes it: markup and the content map's ((span)) markers gone, character references read, NFKC,
// case folded, white space one space. Pure.
import { decodeEntities } from '../../../packages/wo/website-opportunities/domain/draft-write-entities.mjs'

/** The content map's markup markers: `((br/))`, `((span class="x"))`, `((/span))`. */
const MARKER = /\(\(\/?[a-z][^()]*\)\)/gi
const TAG = /<[^>]*>/g
const WORD = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu
/** A segment shorter than this many words and characters is not a sentence of its own. */
export const SEGMENT_WORDS = 4
export const SEGMENT_CHARS = 20
/** The length of a shingle, in words. */
export const SHINGLE = 5

/** A piece of words in its one spelling. */
export function normalise(text) {
  const plain = decodeEntities(
    String(text ?? '')
      .replace(MARKER, ' ')
      .replace(TAG, ' ')
  )
  return plain
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The words of a normalised text. */
export const wordsOf = (normalised) => normalised.match(WORD) ?? []

/** Whether a normalised segment is long enough to stand as a sentence: 4 words or 20 characters. */
export const isSentence = (segment) =>
  wordsOf(segment).length >= SEGMENT_WORDS || segment.replace(/[^\p{L}\p{N}]/gu, '').length >= SEGMENT_CHARS

/** A segment without the punctuation around it, so `Join us today!` and `join us today` are one. */
const bare = (segment) => segment.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

/**
 * The sentences of a text, normalised, each long enough to stand alone. A line break, a `((br/))` marker, a block tag
 * or a sentence end (`.`, `!`, `?`, `…`) starts a new one.
 */
export function segmentsOf(text) {
  const lines = String(text ?? '')
    .replace(MARKER, '\n')
    .replace(/<\/?(?:br|p|div|li|h[1-6]|td|th|tr|ul|ol|section|article|blockquote)\b[^>]*>/gi, '\n')
    .split(/\n+|(?<=[.!?…])\s+|\s[|•·]\s/)
  const out = []
  for (const line of lines) {
    const segment = bare(normalise(line))
    if (segment && isSentence(segment)) out.push(segment)
  }
  return out
}

/** The 5-word shingles of a normalised text, each the words joined by one space. */
export function shinglesOf(normalised) {
  const words = wordsOf(normalised)
  const out = []
  for (let i = 0; i + SHINGLE <= words.length; i++) out.push(words.slice(i, i + SHINGLE).join(' '))
  return out
}

/** The digits of a phone number, when the text is one: 7 to 15 digits with the usual separators only. */
export function phoneKey(text) {
  const raw = String(text ?? '').trim()
  if (!/^\+?[\d\s().-]{7,}$/.test(raw)) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15 ? digits : null
}

const IMAGE_FILE = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i
/** Whether an address names a picture file. */
export const isPictureFile = (address) => IMAGE_FILE.test(fileKey(address) ?? '')

/**
 * A picture file as a path relative to the site root, the way a release names it (`images/hero/a.jpg`): no anchor
 * (`#joomlaImage://...`), no query string, no scheme or host, no leading slash, escapes read, case folded.
 */
export function fileKey(address) {
  let raw = String(address ?? '').trim()
  if (!raw || /^(?:data|blob|javascript|mailto|tel):/i.test(raw)) return null
  raw = raw
    .replace(/#.*$/, '')
    .replace(/\?.*$/, '')
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
    .replace(/^\/\/[^/]*/, '')
  try {
    raw = decodeURIComponent(raw)
  } catch {
    // A broken escape stays as it is written.
  }
  const key = raw.replace(/^\.?\/+/, '').toLowerCase()
  return key || null
}

/** Whether the rendered address `seen` (a file key) is the release file `file`: the same, or it under a base path. */
export const sameFile = (seen, file) => seen === file || seen.endsWith(`/${file}`)
