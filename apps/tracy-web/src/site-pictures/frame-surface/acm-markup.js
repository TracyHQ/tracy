// The element that carries a frame's picture in a JoomlArt ACM module (ADR 0043 section 3e), read from the quickstart's
// own files, never guessed. The content map slot of the frame says which module field holds the picture
// (`nestedJson: "jatools-config"`, jsonPath ["cta", "parallax[cta-bg]", 0] is the field "cta-bg" of the ACM type
// "cta"); the module's row in the quickstart database says its layout ("jatools-layout-cta": "style-1"); the layout's
// template (templates/<template>/acm/<type>/tmpl/<layout>.php) says where the field is printed: in a tag's inline style
// (the tag is the container: it carries the picture as its background) or as an img src (the container is the img's
// parent element). Any other case (the field printed by a helper function, a module that is not an ACM module, no row,
// no template) is `{ unknown: reason }`. Pure: texts in, a plain object out.
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'col', 'embed'])

/** The helper key of a jatools-config path: ["cta", "parallax[cta-bg]", 0] -> "cta-bg", "teams-intro[data][img]" -> "data.img". */
export function acmFieldOf(jsonPath) {
  const last = [...(Array.isArray(jsonPath) ? jsonPath : [])].reverse().find((p) => typeof p === 'string')
  const parts = [...String(last ?? '').matchAll(/\[([^\]]+)\]/g)].map((m) => m[1])
  return parts.length ? parts.join('.') : null
}

/** The ACM type and layout of a module row in a Joomla SQL dump, by module id; null when the row is not found. */
export function acmLayoutOf(sql, moduleId) {
  // Other tables (assets, menu) have rows that start with the same id: the module row is the one naming mod_ja_acm.
  const rows = String(sql ?? '').matchAll(new RegExp(`^,?\\(${moduleId},[^\\n]*`, 'gm'))
  const row = [...rows].map((m) => m[0]).find((r) => /'mod_ja_acm'/.test(r))
  if (!row) return null
  // The params are JSON inside JSON inside SQL: the quotes come escaped two or three times.
  const type = /[\\"]+:type[\\"]+:[\\"]+[a-z0-9_]+:([a-z0-9-]+)/i.exec(row)?.[1]
  const layout = type
    ? new RegExp(`jatools-layout-${type}[\\\\"]+:[\\\\"]+([a-z0-9-]+)`, 'i').exec(row)?.[1]
    : null
  return type && layout ? { type, layout } : null
}

const classesIn = (attrs) => {
  const m = /\bclass\s*=\s*"([^"]*)"|\bclass\s*=\s*'([^']*)'/i.exec(attrs)
  return String(m?.[1] ?? m?.[2] ?? '')
    .split(/\s+/)
    .filter((c) => c && !c.includes('\uE000'))
}

/**
 * Where an ACM template prints a field: the container element, its ancestors inside the module (outermost first) and
 * how the picture is shown, or { unknown }.
 * @returns {{ container: { tag: string, classes: string[] }, ancestors: { tag: string, classes: string[] }[],
 *   shownAs: 'background' | 'img', img: { tag: 'img', classes: string[] } | null } | { unknown: string }}
 */
export function pictureElementIn(php, field) {
  const blocks = []
  // PHP blocks become placeholders, so a ">" inside PHP code never ends a tag.
  const text = String(php ?? '').replace(/<\?(?:php|=)?([\s\S]*?)(?:\?>|$)/g, (_, code) => {
    blocks.push(code)
    return `\uE000${blocks.length - 1}\uE000`
  })
  const esc = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const reads = new RegExp(`get\\s*\\(\\s*['"]${esc}['"]`)
  // Variables assigned from the field (`$ctaBg = 'style="background-image: url(' . $helper->get('cta-bg') . ')"'`).
  const vars = new Map()
  for (const code of blocks)
    for (const m of code.matchAll(/\$(\w+)\s*=\s*([^;]*);/g)) if (reads.test(m[2])) vars.set(m[1], m[2])
  const printsIt = (code) =>
    reads.test(code) || [...vars.keys()].some((v) => new RegExp(`\\$${v}\\b`).test(code))
  const placeholders = (s) => [...s.matchAll(/\uE000(\d+)\uE000/g)].map((m) => blocks[Number(m[1])])
  const stack = []
  const found = []
  for (const m of text.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
    const [, closing, rawTag, attrs] = m
    const tag = rawTag.toLowerCase()
    if (closing) {
      const at = stack.map((e) => e.tag).lastIndexOf(tag)
      if (at >= 0) stack.length = at
      continue
    }
    const el = { tag, classes: classesIn(attrs) }
    const codes = placeholders(attrs).filter(printsIt)
    if (codes.length) {
      const viaVar = codes.some((c) =>
        [...vars].some(([v, rhs]) => new RegExp(`\\$${v}\\b`).test(c) && /background/i.test(rhs))
      )
      if (tag === 'img' && /\bsrc\s*=/.test(attrs)) {
        const parent = stack.at(-1)
        if (parent)
          found.push({
            container: parent,
            ancestors: stack.slice(0, -1),
            shownAs: 'img',
            img: { tag, classes: el.classes }
          })
      } else if (/background/i.test(attrs) || viaVar)
        found.push({ container: el, ancestors: [...stack], shownAs: 'background', img: null })
    }
    if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push(el)
  }
  if (!found.length)
    return {
      unknown: `the field "${field}" is not printed in a tag's style or an img src (it may be printed by a helper)`
    }
  // The same field printed twice in two different ways is not one container.
  const key = (f) => `${f.shownAs} ${f.container.tag}.${f.container.classes.join('.')}`
  if (new Set(found.map(key)).size > 1)
    return { unknown: `the field "${field}" is printed in more than one kind of element` }
  return found[0]
}
