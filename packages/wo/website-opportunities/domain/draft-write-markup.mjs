// The markup a written value carries (ticket #597), read as a browser reads it: its tags (`<span class="a">`) and the
// content map's markers (`((span))`, which the template turns into the same tags), each with its attributes; and the
// markup that would run code on the site. The order check holds each tag to its field's `inline` declaration (the
// writer can still redo it); the write guard holds every value written as HTML to `runsCodeIn` (the last line before
// a door). Pure.
import { decodeEntities } from './draft-write-entities.mjs'

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g
const MARKER = /\(\((\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[\s/][^)]*?)?)\/?\)\)/g
// A name ends at white space, a slash or `=` (`<br/onclick=x>` is a `br` with an `onclick`).
const ATTR = /([^\s/=>"'`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"'`]+)))?/g

/** The attributes of a tag's attribute text: `[[name, value]]`, names in lower case, values read. */
export function attrsOf(text) {
  return [...String(text ?? '').matchAll(ATTR)].map((a) => [
    a[1].toLowerCase(),
    decodeEntities(a[2] ?? a[3] ?? a[4] ?? '')
  ])
}

/** Every tag and marker of a value: `{name, close, attrs, form: 'tag' | 'marker'}`. */
export function tagsOf(value) {
  const text = String(value ?? '')
  const read = (re, form) =>
    [...text.matchAll(re)].map((m) => ({
      name: m[2].toLowerCase(),
      close: m[1] === '/',
      attrs: attrsOf(m[3].replace(/\/\s*$/, '')),
      form
    }))
  return [...read(TAG, 'tag'), ...read(MARKER, 'marker')]
}

/** Elements that run code, load code or a document, or restyle the page. */
const CODE_TAGS = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'style',
  'link',
  'meta',
  'base',
  'form',
  'svg',
  'math',
  'template',
  'noscript'
])
/** An address that runs code when opened, once the white space and control characters a browser skips are out. */
const CODE_SCHEME = /^(javascript|vbscript|livescript|data(?!:image\/(png|jpe?g|gif|webp)[;,])):/
const squeezed = (text) =>
  decodeEntities(text)
    // oxlint-disable-next-line no-control-regex -- the control characters a browser skips inside an address
    .replace(/[\u0000- \u007f-\u00a0\u200b-\u200f\u2028\u2029\ufeff]/g, '')
    .toLowerCase()

/** Whether an address runs code when opened (`javascript:`, `java&#09;script:`, `JaVaScRiPt&colon;`). */
export const addressRunsCode = (value) => CODE_SCHEME.test(squeezed(value))

/**
 * The rules a value written as HTML breaks: a code element, an `on*` handler, an address or a style that runs code,
 * in tags and in markers alike, in any case and whatever entities or white space hide them. `[]` when none.
 */
export function runsCodeIn(value) {
  const text = String(value ?? '')
  const out = new Set()
  for (const tag of tagsOf(text)) {
    if (CODE_TAGS.has(tag.name)) out.add('code_element')
    for (const [name, v] of tag.attrs) {
      if (name.startsWith('on')) out.add('event_handler')
      if (addressRunsCode(v)) out.add('code_address')
      if (/javascript:|vbscript:|expression\(|url\(\s*['"]?\s*(javascript|vbscript|data):/.test(squeezed(v)))
        out.add('code_in_attribute')
    }
  }
  // A tag the pattern above cannot split (an unclosed one, a stray `<script`): the raw forms count too.
  if (/<\s*\/?\s*(script|iframe|object|embed|style|svg)\b/i.test(text)) out.add('code_element')
  if (/[\s/"'`]on[a-z]+\s*=/i.test(text.replace(/[^<]*(<[^>]*>?)?/g, '$1'))) out.add('event_handler')
  if (addressRunsCode(text)) out.add('code_address')
  return [...out]
}
