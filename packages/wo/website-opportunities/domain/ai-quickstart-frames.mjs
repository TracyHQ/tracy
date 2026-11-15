// The HTML frames of the records a build creates (ticket #597), `mapping.createdFrames`. Pure.
//
// A created record (an article, a contact: `entities[<key>].created`) has no stored HTML on the blank site, so a field
// written at an xpath inside one of its values needs the template's own skeleton to be written into. The mapping file
// declares it: `createdFrames: [{entities: [<entity key>], column, nestedJson?, jsonPath?, html, why}]`, the demo
// value with its words and pictures emptied and its classes kept, every text node a single space. The check reads each
// frame as the plugin does (wrapped in `/html/body/div`) and asks that every xpath of the file on that value names
// exactly one node, so a frame cannot leave a field without its place. A value written whole (`/html/body/div`) needs
// no frame. A place only blocks of unbuilt page types use (`pages.<type>.unbuilt`) needs none either.

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const each = (value) => (Array.isArray(value) ? value : [])
const VOID = new Set(['br', 'img', 'hr', 'input', 'source', 'wbr'])

/** A small reader for the well formed frames of a mapping file: elements, attributes and text nodes. */
export function parseFrame(html) {
  const root = { name: '#root', attrs: {}, children: [] }
  const stack = [root]
  const re = /<\/([a-z][\w-]*)\s*>|<([a-z][\w-]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*(\/?)>|<!--.*?-->|([^<]+)/gis
  for (const m of String(html).matchAll(re)) {
    const top = stack.at(-1)
    if (m[1]) {
      if (top.name !== m[1].toLowerCase()) return null
      stack.pop()
    } else if (m[2]) {
      const attrs = Object.fromEntries(
        [...m[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((a) => [a[1], a[2] ?? ''])
      )
      const node = { name: m[2].toLowerCase(), attrs, children: [] }
      top.children.push(node)
      if (!m[4] && !VOID.has(node.name)) stack.push(node)
    } else if (m[5] !== undefined) top.children.push({ text: m[5] })
  }
  return stack.length === 1 ? root : null
}

/** How many nodes an xpath under `/html/body/div` names in a parsed frame. */
export function xpathCount(root, xpath) {
  const steps = String(xpath).split('/').filter(Boolean)
  if (steps.slice(0, 3).join('/') !== 'html/body/div') return 0
  let nodes = [root]
  for (const step of steps.slice(3)) {
    const m = /^(text\(\)|@[\w-]+|[a-z][\w-]*)(?:\[(\d+)\])?$/i.exec(step)
    if (!m) return 0
    const at = m[2] ? Number(m[2]) : null
    if (m[1].startsWith('@')) return nodes.filter((n) => Object.hasOwn(n.attrs ?? {}, m[1].slice(1))).length
    const pick = (list) => (at ? list.slice(at - 1, at) : list)
    nodes = nodes.flatMap((n) =>
      pick(
        each(n.children).filter((c) =>
          m[1] === 'text()' ? c.text !== undefined : c.name === m[1].toLowerCase()
        )
      )
    )
  }
  return nodes.length
}

const valueKey = (l) => JSON.stringify([l.entity, l.column, l.nestedJson ?? '', each(l.jsonPath)])

/** Every location of a block's mapping entry, each with the block id. */
function blockLocations(id, entry, out) {
  const walk = (v) => {
    if (Array.isArray(v)) for (const x of v) walk(x)
    else if (isObject(v) && isName(v.entity) && isName(v.column)) out.push({ ...v, block: id })
    else if (isObject(v)) for (const [k, x] of Object.entries(v)) if (k !== 'keyAt') walk(x)
  }
  walk(['fields', 'itemFields', 'lists', 'itemLists'].map((k) => entry?.[k]))
}

/** The problems of `mapping.createdFrames`; `recipes` are the page recipes (to find blocks of unbuilt pages only). */
export function framesProblems(mapping, recipes, report) {
  const frames = mapping.createdFrames
  if (frames !== undefined && !Array.isArray(frames))
    return report('createdFrames', 'createdFrames is a list of {entities, column, jsonPath?, html, why}')
  const byValue = new Map()
  each(frames).forEach((f, i) => {
    const at = `createdFrames[${i}]`
    const root = isObject(f) ? parseFrame(f.html) : null
    if (!isObject(f) || !each(f.entities).length || !isName(f.column) || !isName(f.why) || !root)
      return report(at, 'a frame is {entities, column, nestedJson?, jsonPath?, html (well formed), why}')
    for (const entity of f.entities) {
      if (mapping.entities?.[entity]?.created !== true)
        report(`${at}.entities`, `${entity} is no record the build creates (entities[].created)`)
      byValue.set(valueKey({ ...f, entity }), { root, at })
    }
  })
  const unbuilt = new Set(
    Object.entries(mapping.pages ?? {})
      .filter(([, p]) => p?.unbuilt)
      .map(([t]) => t)
  )
  const built = new Set(
    each(recipes?.recipes)
      .filter((r) => !unbuilt.has(r.pageType))
      .flatMap((r) => each(r.blocks))
  )
  const locs = []
  for (const [id, entry] of Object.entries(mapping.blocks ?? {}))
    if (built.has(id)) blockLocations(id, entry, locs)
  const seen = new Set()
  for (const l of locs) {
    if (!isName(l.xpath) || l.xpath === '/html/body/div' || mapping.entities?.[l.entity]?.created !== true)
      continue
    const key = `${valueKey(l)}|${l.xpath}`
    if (seen.has(key)) continue
    seen.add(key)
    const frame = byValue.get(valueKey(l))
    const where = `${l.entity} ${l.column}${l.jsonPath ? ` ${JSON.stringify(l.jsonPath)}` : ''}`
    if (!frame)
      report(
        'createdFrames',
        `${where} (${l.block}): a created record value written at ${l.xpath} needs its frame`
      )
    else if (xpathCount(frame.root, l.xpath) !== 1)
      report(frame.at, `${where}: ${l.xpath} (${l.block}) names no single node of the frame`)
  }
}
