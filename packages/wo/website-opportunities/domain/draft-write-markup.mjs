// The markup a written value carries (ticket #597), read as a browser reads it (`draft-write-tags.mjs`): its tags
// (`<span class="a">`) and the content map's markers (`((span))`, which the template turns into the same tags), each
// with its attributes; and the markup that would run code on the site. The order check holds each tag to its field's
// `inline` declaration and to `runsCodeIn` (the writer can still redo it); the write guard holds every value written
// as HTML to `runsCodeIn` (the last line before a door). Both read tags with one tokenizer, so they cannot disagree.
// Pure.
import { decodeEntities } from './draft-write-entities.mjs'
import { attrsOf, readTags } from './draft-write-tags.mjs'

export { attrsOf }

/** Every tag and marker of a value: `{name, close, attrs: [[name, value]], form: 'tag' | 'marker'}`. */
export function tagsOf(value) {
  return readTags(value).tags.map((t) => ({
    name: t.name,
    close: t.close,
    attrs: t.attrs.map((a) => [a.name, a.value]),
    form: t.form
  }))
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
/** Attributes that hold a document or a form target: code whatever their value says. */
const CODE_ATTRS = new Set(['srcdoc', 'formaction'])
/** An address that runs code when opened, once the white space and control characters a browser skips are out. */
const CODE_SCHEME = /^(javascript|vbscript|livescript|data(?!:image\/(png|jpe?g|gif|webp)[;,])):/
/** A style's CSS escapes read (`e\78pression`, `\6a avascript`), as the browser's CSS reader reads them. */
const cssRead = (text) =>
  text.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => {
    const n = Number.parseInt(hex, 16)
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
  })
const squeezed = (text) =>
  cssRead(decodeEntities(text))
    // oxlint-disable-next-line no-control-regex -- the control characters a browser skips inside an address
    .replace(/[\u0000- \u007f-\u00a0\u200b-\u200f\u2028\u2029\ufeff\\]/g, '')
    .toLowerCase()

/** Whether an address runs code when opened (`javascript:`, `java&#09;script:`, `JaVaScRiPt&colon;`). */
export const addressRunsCode = (value) => CODE_SCHEME.test(squeezed(value))

/**
 * The rules a value written as HTML breaks: a code element, an `on*` handler, an address or a style that runs code,
 * in tags and in markers alike, in any case and whatever entities, quotes or white space hide them; markup inside an
 * attribute value (read again, as a raw text element or a `srcdoc` would let it out); a `((` or `))` no marker reads
 * (`marker_unread`). `[]` when none.
 */
export function runsCodeIn(value, depth = 0) {
  const text = String(value ?? '')
  const out = new Set()
  const { tags, strays } = readTags(text)
  if (strays) out.add('marker_unread')
  for (const tag of tags) {
    if (CODE_TAGS.has(tag.name)) out.add('code_element')
    for (const { name, value: v, raw } of tag.attrs) {
      if (name.startsWith('on')) out.add('event_handler')
      if (CODE_ATTRS.has(name)) out.add('code_in_attribute')
      if (addressRunsCode(v)) out.add('code_address')
      if (/javascript:|vbscript:|expression\(|url\(['"]?(javascript|vbscript|data):/.test(squeezed(v)))
        out.add('code_in_attribute')
      if (depth < 2 && /<|\(\(/.test(raw + v))
        for (const rule of [...runsCodeIn(raw, depth + 1), ...runsCodeIn(v, depth + 1)])
          if (rule !== 'marker_unread') out.add(rule)
    }
  }
  if (addressRunsCode(text)) out.add('code_address')
  return [...out]
}
