/**
 * Every visible text of a WordPress page's markup, as units a content map can address (spec #37, issue #43).
 *
 * `capture-contract.mjs` makes a slot only for a block named by `metadata.name`; a theme that names a fraction of its
 * blocks leaves the rest of the page (dish names, prices, hours, list items) outside the map. This reader walks every
 * text-bearing core block in document order and returns one unit per block, with the texts and links it holds.
 *
 * POSITION is the address of a block that has no name (or repeats one): `blockType` and `occurrence`, the 1-based
 * count of blocks of that type in the page, named or not, in document order. A block that holds several texts adds a
 * sub-position (`list` item, `table` cell, `quote` cite).
 */

const OPEN = /<!-- (\/)?wp:(?:([a-z0-9-]+)\/)?([a-z0-9-]+)(?: (\{[^\n]*\}))? ?(\/)?-->/g
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export const decodeEntities = (text) =>
  text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => ENTITIES[n])

/** The words a visitor reads in some markup: tags gone, `<br>` a space, entities decoded, blanks collapsed. */
export const visibleText = (html) =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()

/** A text the way a single-value slot holds it: plain text keeps its own line breaks, markup is flattened. */
const sampleOf = (raw) => (raw.includes('<') ? visibleText(raw) : decodeEntities(raw))

const hrefs = (html) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => decodeEntities(m[1]))

const SINGLE = new Set(['heading', 'paragraph', 'verse', 'preformatted', 'list-item'])

/** The text-bearing fields of one block, from the markup it wraps. */
function fieldsOf(type, inner, attrs) {
  const own = inner.split('<!--')[0]
  if (SINGLE.has(type))
    return [
      {
        id: '',
        attr: 'content',
        raw: own.replace(/^\s*<[a-z0-9]+\b[^>]*>/, '').replace(/<\/[a-z0-9]+>\s*$/, ''),
        links: hrefs(own)
      }
    ]
  if (type === 'button') {
    const a = /<a\b[^>]*>([\s\S]*?)<\/a>/.exec(inner)
    const url = typeof attrs?.url === 'string' ? attrs.url : (hrefs(inner)[0] ?? null)
    return a ? [{ id: '', attr: 'content', raw: a[1], links: [], url }] : []
  }
  if (type === 'navigation-link' || type === 'navigation-submenu')
    return typeof attrs?.label === 'string'
      ? [{ id: '', attr: 'label', raw: attrs.label, links: [], url: attrs.url ?? null }]
      : []
  if (type === 'list' && !inner.includes('<!--'))
    return [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m, i) => ({
      id: String(i + 1),
      attr: 'content',
      raw: m[1],
      links: hrefs(m[1])
    }))
  if (type === 'table')
    return [...inner.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m, i) => ({
      id: String(i + 1),
      attr: 'content',
      raw: m[1],
      links: hrefs(m[1])
    }))
  if (type === 'quote' || type === 'pullquote') {
    const out = []
    if (type === 'pullquote') {
      const p = /<p\b[^>]*>([\s\S]*?)<\/p>/.exec(inner)
      if (p) out.push({ id: 'text', attr: 'content', raw: p[1], links: hrefs(p[1]) })
    }
    const cite = /<cite\b[^>]*>([\s\S]*?)<\/cite>/.exec(inner)
    if (cite) out.push({ id: 'cite', attr: 'content', raw: cite[1], links: hrefs(cite[1]) })
    return out
  }
  return []
}

const HANDLED = new Set([
  ...SINGLE,
  'button',
  'list',
  'table',
  'quote',
  'pullquote',
  'navigation-link',
  'navigation-submenu'
])

/**
 * @param {string} content a page's `post_content`
 * @returns {{ blockType: string, occurrence: number, name: string | null, start: number, fields: { id: string, attr: string, raw: string, text: string, sample: string, links: string[], url?: string | null }[] }[]}
 */
export function textUnits(content) {
  const tokens = [...content.matchAll(OPEN)].map((m) => ({
    close: Boolean(m[1]),
    core: !m[2] || m[2] === 'core',
    type: m[3],
    attrs: m[4],
    self: Boolean(m[5]),
    start: m.index,
    end: m.index + m[0].length
  }))
  const seen = new Map()
  const units = []
  tokens.forEach((t, i) => {
    if (t.close || !t.core || !HANDLED.has(t.type)) return
    const occurrence = (seen.get(t.type) ?? 0) + 1
    seen.set(t.type, occurrence)
    let inner = ''
    if (!t.self) {
      let depth = 1
      for (let j = i + 1; j < tokens.length && depth > 0; j++) {
        const o = tokens[j]
        if (!o.core || o.type !== t.type || o.self) continue
        depth += o.close ? -1 : 1
        if (depth === 0) inner = content.slice(t.end, o.start)
      }
    }
    let attrs = null
    try {
      attrs = t.attrs ? JSON.parse(t.attrs) : null
    } catch {
      attrs = null
    }
    const fields = fieldsOf(t.type, inner, attrs)
      .map((f) => ({ ...f, sample: sampleOf(f.raw), text: visibleText(f.raw) }))
      .filter((f) => f.text !== '')
    const name =
      typeof attrs?.metadata?.name === 'string' && attrs.metadata.name !== '' ? attrs.metadata.name : null
    units.push({ blockType: t.type, occurrence, name, start: t.start, fields })
  })
  return units
}

const NAMED_TYPES = new Set(['heading', 'paragraph', 'list-item', 'button'])
const budget = (sample) => Math.max(80, Math.min(2000, sample.length * 2 + 20))

/**
 * The slots of one page when every visible text is captured.
 *   - the first block of a name, of a type the plugin addresses by name, keeps the key and target `pageSlots` always
 *     gave it (so a released profile's slots do not move);
 *   - every other text, and the links inside it, is addressed by position (see the file header).
 * @param {{ content: string, entityKey: string, prefix: string, nameProblem: (name: string, start: number) => string | null }} input
 *   `nameProblem`: why the plugin cannot address the first block of that name, or null when it can
 * @returns {{ slots: object[], skipped: string[] }}
 */
export function allTextSlots({ content, entityKey, prefix, nameProblem }) {
  const slots = []
  const skipped = []
  const usedNames = new Set()
  for (const unit of textUnits(content)) {
    const byName = unit.name !== null && NAMED_TYPES.has(unit.blockType) && !usedNames.has(unit.name)
    if (unit.name !== null) usedNames.add(unit.name)
    const problem = byName ? nameProblem(unit.name, unit.start) : null
    if (problem) skipped.push(`${entityKey}:${unit.name} (${problem}; captured by position)`)
    const named = byName && !problem
    unit.fields.forEach((field) => {
      const where = named
        ? { target: { block: unit.name } }
        : { target: { blockType: unit.blockType, occurrence: unit.occurrence } }
      const base = named
        ? `${prefix}.${unit.name}`
        : `${prefix}.${unit.blockType}.${unit.occurrence}${field.id ? `.${field.id}` : ''}`
      const label = `${prefix} — ${named ? unit.name : base.slice(prefix.length + 1)}`
      const subField = field.id && named ? { field: field.id } : {}
      slots.push({
        key: base,
        entity: entityKey,
        target: { ...where.target, attr: field.attr, ...subField },
        type: 'text',
        sample: field.sample,
        maxCharacters: budget(field.sample),
        label
      })
      if (field.url) {
        slots.push({
          key: `${base}.url`,
          entity: entityKey,
          target: { ...where.target, attr: 'url', ...subField },
          type: 'url',
          sample: field.url,
          maxCharacters: 2048,
          label: `${label} (link)`
        })
      }
      field.links.forEach((href, k) =>
        slots.push({
          key: `${base}.link.${k + 1}`,
          entity: entityKey,
          target: { ...where.target, attr: 'url', link: k + 1, ...subField },
          type: 'url',
          sample: href,
          maxCharacters: 2048,
          label: `${label} (link ${k + 1})`
        })
      )
    })
  }
  return { slots, skipped }
}
