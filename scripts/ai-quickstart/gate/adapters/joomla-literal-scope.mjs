// Where a file a kit's `keptLiterals` names prints, on a Joomla page (ticket #586, review 4 W1). A page tells which
// module printed an element (`place.module`, the `Mod<id>` wrapper) and the address it was read at; the blank site's
// dump tells what each module row is (its type and, for a JA ACM module, the layout its params pick); the write record
// tells which blank site module each copy the build made comes from. From these, for a file and a place on a page:
//   true    the file prints there (a component layout outside any module, on a page of its view, read from the
//           address or the menu item the page is; a module layout in a
//           module of that type; an ACM layout in an ACM module whose params pick that layout and style)
//   false   the page tells that another file prints there
//   null    the page cannot tell (a file of another kind, a module the dump does not hold)
// `holds(place, words)`: the dump row of the module the words are printed in holds those words, so they are that row's
// (demo data), never a literal of a file. Pure.

const list = (v) => (Array.isArray(v) ? v : [])
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every module row of a dump by its id: `{module, line}` (the whole row, as the dump writes it). */
export function moduleRowsOf(dump) {
  const rows = new Map()
  let inModules = false
  for (const line of String(dump ?? '').split('\n')) {
    if (/^INSERT INTO /i.test(line)) inModules = /^INSERT INTO `#__modules`/i.test(line)
    if (!inModules) continue
    const m = /^,?\((\d+),.*?'(mod_[a-z0-9_]+)'/i.exec(line)
    if (m) rows.set(Number(m[1]), { module: m[2], line })
  }
  return rows
}

/** The blank site module each module the build copied comes from: `Map<copy id, source id>`. */
export function copySourcesOf({ ids = {}, plan = null, mapping = null }) {
  const out = new Map()
  for (const [key, id] of Object.entries(ids ?? {})) {
    const m = /^copy:([^.]+)\.(.+)$/.exec(key)
    if (!m) continue
    const block =
      m[1] === 'site'
        ? m[2]
        : list(list(plan?.pages).find((p) => p.id === m[1])?.blocks).find((b) => b.id === m[2])?.block
    const entity = mapping?.placements?.[block]?.entity
    const source = mapping?.entities?.[entity]?.sourceId ?? Number(/^module-(\d+)$/.exec(entity ?? '')?.[1])
    if (Number.isFinite(Number(id)) && Number.isFinite(source)) out.set(Number(id), Number(source))
  }
  return out
}

/** What kind of output a file of the release is: a component view, a module type, an ACM layout, or null. */
export function fileKindOf(file) {
  const f = String(file ?? '')
  let m = /\/acm\/([^/]+)\/tmpl\/([^/.]+)\.php$/.exec(f)
  if (m) return { kind: 'acm', name: m[1], style: m[2] }
  m = /(?:^|\/)html\/(mod_[a-z0-9_]+)\//i.exec(f) ?? /^modules\/(mod_[a-z0-9_]+)\//i.exec(f)
  if (m) return { kind: 'module', module: m[1] }
  m =
    /(?:^|\/)html\/(com_[a-z0-9_]+)\/([^/]+)\//i.exec(f) ??
    /^components\/(com_[a-z0-9_]+)\/tmpl\/([^/]+)\//i.exec(f)
  if (m) return { kind: 'component', component: m[1], view: m[2] }
  // The pagination of a list: printed by the component's list views, outside any module.
  if (/(?:^|\/)layouts\/joomla\/pagination\//.test(f))
    return { kind: 'component', component: null, view: null }
  return null
}

/** The view an address names (`view=article`), or null. */
const viewOf = (path) => /[?&]view=([a-z0-9_]+)/i.exec(String(path ?? ''))?.[1] ?? null

/**
 * @param {{dump: string, ids?: object, plan?: object, mapping?: object}} input
 * @returns {{renders: (file: string, at: {place?: object, path?: string, view?: string}) => boolean | null,
 *   holds: (place: object, words: string) => boolean}}
 */
export function joomlaLiteralScope({ dump, ids = {}, plan = null, mapping = null }) {
  const rows = moduleRowsOf(dump)
  const sources = copySourcesOf({ ids, plan, mapping })
  const rowOf = (place) => {
    const id = Number(place?.module)
    if (!Number.isFinite(id) || !place?.module) return null
    return rows.get(sources.get(id) ?? id) ?? null
  }
  const renders = (file, { place = null, path = null, view = null } = {}) => {
    const k = fileKindOf(file)
    if (!k) return null
    if (k.kind === 'component') {
      if (place?.module) return false
      const at = view ?? viewOf(path)
      if (!k.view) return true
      return at ? at === k.view : null
    }
    if (!place?.module) return false
    const row = rowOf(place)
    if (!row) return null
    if (k.kind === 'module') return row.module.toLowerCase() === k.module.toLowerCase()
    // An ACM module names its layout and style in its params: `"jatools-layout-<name>":"<style>"`, escaped.
    const picks = new RegExp(`jatools-layout-${escapeRe(k.name)}[\\\\"]*:[\\\\"]*${escapeRe(k.style)}[\\\\"]`)
    return row.module === 'mod_ja_acm' && picks.test(row.line)
  }
  const holds = (place, words) => {
    const row = rowOf(place)
    const v = String(words ?? '').trim()
    if (!row || !v) return false
    const low = row.line.toLowerCase()
    const w = escapeRe(v.toLowerCase())
    return new RegExp(`(?:'|\\\\*"|>)\\s*${w}\\s*(?:'|\\\\*"|<)`).test(low)
  }
  return { renders, holds }
}
