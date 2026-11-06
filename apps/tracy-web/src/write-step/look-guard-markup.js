// The look guard's judgement of written HTML (ADR 0044, decision 10). A content map keeps markup as doubled round brackets, a row
// keeps real tags, and both are read here. Replacing words is free. A new inline style, a class the template's element did not have
// or one it lost, an element that can size or restyle the words, and an attribute that can do so are not. Pure.
const TAG =
  /\(\(\s*(\/?)([a-z][a-z0-9-]*)((?:[^()]|\([^()]*\))*?)\/?\s*\)\)|<\s*(\/?)([a-z][a-z0-9-]*)([^<>]*?)\/?\s*>/gi
const ATTR = /([a-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))|([a-z_:][\w:.-]*)/gi

/** What the words of a slot may be wrapped in beyond what the template had: paragraphs, lists, a break, a link, a stress. */
const WORD_ELEMENTS = new Set(['p', 'ul', 'li', 'br', 'a', 'span', 'strong', 'em', 'b', 'i'])
/** What a link or a picture needs of itself: none of it changes how anything looks. */
const WORD_ATTRS = new Set(['href', 'target', 'rel', 'title', 'alt'])

function tagsOf(text) {
  const tags = []
  for (const m of String(text ?? '').matchAll(TAG)) {
    const name = (m[2] ?? m[5]).toLowerCase()
    if (m[1] || m[4]) continue
    const attrs = new Map()
    for (const a of (m[3] ?? m[6] ?? '').matchAll(ATTR)) {
      const key = (a[1] ?? a[5]).toLowerCase()
      attrs.set(key, a[2] ?? a[3] ?? a[4] ?? '')
    }
    tags.push({ name, attrs })
  }
  return tags
}

const classesOf = (tags) =>
  new Set(
    tags.flatMap((t) =>
      (t.attrs.get('class') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((c) => `${t.name}.${c}`)
    )
  )

/** Whether a value holds any markup at all. */
export const hasMarkup = (value) => tagsOf(value).length > 0

/**
 * @param {string} value what is about to be written
 * @param {string} sample what the template holds there
 * @returns {string[]} one sentence per thing that goes beyond words; empty for a plain replacement
 */
export function markupFaults(value, sample) {
  const was = tagsOf(sample)
  const now = tagsOf(value)
  const faults = []
  const styles = new Set(was.map((t) => t.attrs.get('style')).filter(Boolean))
  const elements = new Set(was.map((t) => t.name))
  const attrs = new Set(was.flatMap((t) => [...t.attrs.keys()]))
  for (const tag of now) {
    if (!elements.has(tag.name) && !WORD_ELEMENTS.has(tag.name))
      faults.push(`it adds the element ${tag.name}, which the template does not have here`)
    const style = tag.attrs.get('style')
    if (style !== undefined && !styles.has(style))
      faults.push(`it adds an inline style: ${style.slice(0, 80)}`)
    for (const name of tag.attrs.keys())
      if (name !== 'style' && name !== 'class' && !WORD_ATTRS.has(name) && !attrs.has(name))
        faults.push(`it adds the attribute ${name} on ${tag.name}`)
  }
  const before = classesOf(was)
  const after = classesOf(now)
  for (const c of after)
    if (!before.has(c)) faults.push(`it adds the class ${c}, which the template does not have here`)
  for (const c of before) if (!after.has(c)) faults.push(`it takes off the template's class ${c}`)
  return [...new Set(faults)]
}
