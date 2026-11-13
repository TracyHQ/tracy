// The markup a written value carries (ticket #597), read as a browser reads it (`draft-write-tags.mjs`): its tags
// (`<span class="a">`) and the content map's markers (`((span))`, which the template turns into the same tags), each
// with its attributes; and the markup that would run code on the site. The order check holds each tag to its field's
// `inline` declaration and to `runsCodeIn`; the write guard holds every value written as HTML to `runsCodeIn` (the last
// line before a door), and an address to `addressRunsCode` only where an address is written. Both read tags with one
// tokenizer, so they cannot disagree. A value the writer wrote never reaches either with markup: the copy check sends
// it back first (`page-copy-check.mjs`).
// Pure.
import { decodeEntities } from './draft-write-entities.mjs'
import { attrsOf, balanced, readTags } from './draft-write-tags.mjs'

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

/** Elements whose content a browser reads as raw text: the reader would read on inside them, so none is allowed. */
const RAW_TEXT_TAGS = new Set([
  'title',
  'textarea',
  'xmp',
  'plaintext',
  'noembed',
  'noframes',
  'script',
  'style',
  'iframe',
  'noscript'
])
/** Attributes whose value a browser opens or loads as an address. */
export const URL_ATTRS = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'xlink:href',
  'poster',
  'background',
  'cite',
  'data',
  'codebase',
  'ping',
  'srcset',
  'lowsrc',
  'dynsrc',
  'longdesc',
  'usemap',
  'manifest',
  'archive',
  'classid',
  'icon'
])
const STYLE_CODE =
  /expression\(|javascript:|vbscript:|url\(['"]?(javascript|vbscript|data):|behavior:|-moz-binding/
/** Markup in a raw attribute value: a tag, a bogus form or a marker the converter would read. */
const MARKUP_IN_VALUE = /<[a-zA-Z/!?]|\(\(\/?[a-zA-Z]/

/**
 * The rules a value written as HTML breaks: a code element or a raw text element (`code_element`,
 * `raw_text_element`), an `on*` handler, a code address in an address attribute (`href`, `src`, ...), a style that
 * runs code, in tags and in markers alike, in any case and whatever entities, quotes or white space hide them; markup
 * inside an attribute value (`markup_in_attribute`); a comment or any other `<!`, `<?` or `</` form
 * (`markup_unread`); a marker start no marker reads (`marker_unread`); a tag, a marker or a quote left open, a closing
 * tag that closes nothing or the wrong element (`markup_unbalanced`). Words are never read as an address: `Data: we
 * keep only what you send` is prose (an address is held only where one is written, `addressRunsCode`). `[]` when none.
 */
export function runsCodeIn(value) {
  const text = String(value ?? '')
  const out = new Set()
  const read = readTags(text)
  if (read.strays) out.add('marker_unread')
  if (read.bogus) out.add('markup_unread')
  if (!balanced(read)) out.add('markup_unbalanced')
  for (const tag of read.tags) {
    if (CODE_TAGS.has(tag.name)) out.add('code_element')
    if (RAW_TEXT_TAGS.has(tag.name)) out.add('raw_text_element')
    for (const { name, value: v, raw } of tag.attrs) {
      if (name.startsWith('on')) out.add('event_handler')
      if (CODE_ATTRS.has(name)) out.add('code_in_attribute')
      if (URL_ATTRS.has(name) && addressRunsCode(v)) out.add('code_address')
      if (name === 'style' && STYLE_CODE.test(squeezed(v))) out.add('code_in_attribute')
      if (MARKUP_IN_VALUE.test(raw)) out.add('markup_in_attribute')
    }
  }
  return [...out]
}
