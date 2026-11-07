// The sections of a WordPress page: the top-level blocks of its post content, each one a block of the kit (a hero, a
// menu list, a booking form), as a Joomla page is its modules. Read from the post content (the site's database, SELECT
// only), never from the rendered page: WordPress does not print `metadata.name`, and the content map finds a slot by
// that name (the FIRST block of the name in the page) or, for an unnamed block, by its type and 1-based occurrence
// among the page's core blocks of that type (capture-contract.mjs, capture-all-text.mjs). So each section lists the
// names it holds first and the occurrence range of each block type inside it, and a slot belongs to the section that
// holds its target.

const OPEN = /<!-- (\/)?wp:(?:([a-z0-9-]+)\/)?([a-z0-9-]+)(?: (\{[^\n]*?\}))? ?(\/)?-->/g

const attrsOf = (raw) => {
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** A file-safe label of a section's name: `features-intro.root` -> `features-intro`. */
const labelOf = (name) =>
  String(name ?? '')
    .replace(/\.root$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * The top-level blocks of a post content, in order.
 * @param {string} content a page's `post_content`
 * @returns {{index: number, label: string, name: string|null, selector: string, names: string[], occurrences: Record<string, [number, number]>}[]}
 */
export function postSections(content) {
  const sections = []
  const seenNames = new Set()
  const seenTypes = new Map()
  const labels = new Map()
  let depth = 0
  let current = null
  for (const m of String(content ?? '').matchAll(OPEN)) {
    const [, close, ns, type, raw, self] = m
    if (close) {
      depth--
      continue
    }
    const attrs = attrsOf(raw)
    if (depth === 0) {
      const name =
        typeof attrs.metadata?.name === 'string' && attrs.metadata.name ? attrs.metadata.name : null
      const index = sections.length + 1
      const base = labelOf(name) || `section-${index}`
      const n = (labels.get(base) ?? 0) + 1
      labels.set(base, n)
      // A section with an anchor is found by its id, else by its place among the post content's children. A section a
      // script moves and renames (a tab panel pulled into a tabs block) is then not found: its words read as the host's.
      const anchor =
        typeof attrs.anchor === 'string' && /^[A-Za-z][\w-]*$/.test(attrs.anchor) ? attrs.anchor : null
      current = {
        index,
        label: n > 1 ? `${base}-${n}` : base,
        name,
        selector: anchor ? `#${anchor}` : `.wp-block-post-content > :nth-child(${index})`,
        names: [],
        occurrences: {}
      }
      sections.push(current)
    }
    const name = attrs.metadata?.name
    if (typeof name === 'string' && name && !seenNames.has(name)) {
      seenNames.add(name)
      current.names.push(name)
    }
    if (!ns || ns === 'core') {
      const occurrence = (seenTypes.get(type) ?? 0) + 1
      seenTypes.set(type, occurrence)
      const range = (current.occurrences[type] ??= [occurrence, occurrence])
      range[1] = occurrence
    }
    if (!self) depth++
  }
  return sections
}

/** The section that holds a slot's target (`{block}` by name, `{blockType, occurrence}` by place), or null. */
export function sectionOfTarget(sections, target) {
  if (typeof target?.block === 'string') return sections.find((s) => s.names.includes(target.block)) ?? null
  if (typeof target?.blockType === 'string' && Number.isInteger(target.occurrence))
    return (
      sections.find((s) => {
        const r = s.occurrences[target.blockType]
        return r && target.occurrence >= r[0] && target.occurrence <= r[1]
      }) ?? null
    )
  return null
}
