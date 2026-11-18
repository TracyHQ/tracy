// The EmDash content map in the shape the kit reads (contract-read.mjs). A Joomla map lists its pages with the modules
// assigned to each (`pages[]`). An EmDash map lists, for each page, the entry that is the page (`pages[].entity`), and
// slots keyed `<collection>.<entry>.<field>`; what a page prints around and between them is the theme's layout, not
// the map's. So the blocks of a page are read from the site, once per run (site/emdash-sections-file.mjs): what the
// layout prints before `<main>` (top bar, header, menu), each direct child of `<main>` (a section), and what it prints
// after (a signup strip, a picture strip, the footer). The theme stamps which entry field printed each element when a
// request carries `X-Tracy-Preview: pick`; those stamps say which block a slot belongs to, never a guess from words.
// A slot has one block: the section of its own page that prints it, else the first shared part that does. A slot no
// stamp reaches stays with its entry, and the coverage gate names it.
// The Joomla-only keys stay absent; `platformGaps` names each one the kit cannot read on EmDash and why.
import { normText } from '../../../../content-coverage/lib/normalize.mjs'
import { slugOfPath } from '../../kit-paths.mjs'

/** What an EmDash content map does not declare, and so what the kit leaves empty, each with its reason. */
export const EMDASH_MAP_GAPS = Object.freeze([
  {
    key: 'menuBlocks',
    field: 'site.navigationGroups[].items',
    reason:
      'the EmDash content map declares menus (`menus`), not menu blocks: their labels are menu items, not slots, so navigation groups are read from the pages only'
  },
  {
    key: 'itemLists',
    field: 'blocks[].lists[rowKind=items]',
    reason:
      'the EmDash content map declares no item lists: a card list prints entries the map holds slots for under their own page, so no items list is built'
  },
  {
    key: 'menuItem',
    field: 'pages[].inMainMenu',
    reason:
      'EmDash pages have no menu item entity: whether a page is in the main menu is read from the menu the pages print'
  }
])

/** A part of a page the theme prints whatever the page, found by tag when the site was not read. */
const FALLBACK = [
  { entity: 'header', position: 'header', selector: 'header', kind: 'template-header' },
  { entity: 'main-body', position: null, selector: 'main', kind: 'component' },
  { entity: 'footer', position: 'footer', selector: 'footer', kind: 'template-part' }
]

/** Class words that name no part (`rs-section` on every section). */
const GENERIC = new Set(['section', 'wrap', 'container', 'inner'])

/** The prefix most parts' first class share (`rs-`), or '' when no prefix is common. */
function themePrefix(parts) {
  const counts = new Map()
  for (const p of parts) {
    const m = /^([a-z]{1,4}-)/.exec(p.classes[0] ?? '')
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  const [best, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  return n * 2 >= parts.length ? best : ''
}

/** The name of a part: its first class that names something (prefix and generic words dropped), else its tag. */
function labelOf(part, prefix) {
  const words = part.classes
    .map((c) => (prefix && c.startsWith(prefix) ? c.slice(prefix.length) : c))
    .map((c) => c.toLowerCase().replace(/[^a-z0-9-]+/g, ''))
    .filter((c) => c && !GENERIC.has(c) && !/^(min|max)-/.test(c))
  return words[0] ?? part.tag
}

/** The field a stamp names, without a repeater row or Portable Text block part (`items.title` -> `items`). */
const rootField = (field) => String(field ?? '').split('.')[0]

/**
 * The map with `pages[]` derived from the sections the run read, and `platformGaps` naming what the map cannot say.
 * @param {object} map the content map
 * @param {Record<string, {before: object[], main: object[], after: object[]}>|null} sections by page path, as
 *   `readEmdashSections` returns them; without them every page is header, main body and footer by tag
 * @param {Record<string, string>|null} [media] the served path of the file each picture slot holds, by slot key; the
 *   map keeps the demo file name (`rest-6.jpg`), the page serves the stored key, so a picture slot takes the served
 *   path as its sample and is found on the pages. Without it the names stay and the gap is named.
 */
export function withEmdashPages(map, sections = null, media = null) {
  const platformGaps = EMDASH_MAP_GAPS.filter((g) =>
    g.key === 'menuItem' ? !(map.entities ?? []).some((e) => e.kind === 'menuItem') : map[g.key] == null
  )
  const listed = (map.pages ?? []).map((p) => ({
    ...p,
    path: String(p.openAs ?? (p.route === 'home' ? '/' : p.route) ?? '/').replace(/\/+$/, '') || '/'
  }))
  if (!listed.length) return { ...map, platformGaps }
  const read = sections ?? {}
  const all = Object.values(read).flatMap((s) => [...s.before, ...s.main, ...s.after])
  const prefix = themePrefix(all)
  const slotsOf = new Map()
  for (const s of map.slots ?? []) {
    const k = `${s.entity}|${rootField(s.target?.field)}`
    slotsOf.set(k, [...(slotsOf.get(k) ?? []), s])
  }
  const claims = new Map()
  // The business logo and name are the header block's by role (block-slots.mjs), whatever prints them.
  const ofHeader = (slot) => /^business\.(logo|name)$/.test(slot.role ?? '')
  const stampEntity = (st) => `${st.collection}.${st.slug}`
  const pageEntities = new Set(listed.map((p) => p.entity))
  /** The slots a stamp names: the field's own, or every cell of a repeater / block of a rich text field. */
  const slotsOfStamp = (st) =>
    st.field
      ? (slotsOf.get(`${stampEntity(st)}|${rootField(st.field)}`) ?? []).filter((s) => !ofHeader(s))
      : []
  const claim = (st, owner) => {
    for (const s of slotsOfStamp(st)) if (!claims.has(s.key)) claims.set(s.key, owner)
  }
  const sectionEntities = []
  const sectionGaps = []
  // A part every page prints (same place in the layout) is one block: the header, the footer, a signup strip.
  const keyOfPart = (where, part) => `${where}|${part.selector.replace(/:nth-child\(\d+\)/g, '')}`
  const pagesRead = listed.filter((p) => read[p.path])
  const onPages = new Map()
  for (const p of pagesRead)
    for (const where of ['before', 'after'])
      for (const part of read[p.path][where].filter((x) => x.shown)) {
        const k = keyOfPart(where, part)
        onPages.set(k, (onPages.get(k) ?? 0) + 1)
      }
  const sharedKeys = new Set([...onPages].filter(([, n]) => n === pagesRead.length).map(([k]) => k))
  const shared = new Map()
  const sharedOf = (part, where) => {
    const key = keyOfPart(where, part)
    if (shared.has(key)) return shared.get(key)
    const label = part.isFooter ? 'footer' : labelOf(part, prefix)
    const header = where === 'before' && part.hasHeaderTag
    const entity = part.isFooter ? 'footer' : header ? 'header' : `part-${label}`
    const position = part.isFooter ? 'footer' : where === 'before' ? `header-${label}` : label
    const kind = where === 'before' ? 'template-header' : 'template-part'
    const area = { entity, position, selector: part.selector, kind, published: '1' }
    shared.set(key, area)
    return area
  }
  // The other parts belong to the page that prints them (a masthead, the sections of main). A part that prints the
  // fields of one entry that is no page of its own (a reservation form, a promo) is that entry's block on every page.
  const partEntity = (part, slug, label) => {
    const entities = new Set(part.stamps.filter((st) => st.field).map(stampEntity))
    const only = entities.size === 1 ? [...entities][0] : null
    return only && !pageEntities.has(only) && !only.startsWith('chrome.')
      ? `block-${only.replace('.', '-')}`
      : `block-${slug}-${label}`
  }
  const placed = listed.map((p) => {
    const s = read[p.path]
    if (!s) return { page: p, areas: null }
    const slug = slugOfPath(p.path)
    const seen = new Map()
    const area = (part) => {
      const label = labelOf(part, prefix)
      const n = (seen.get(label) ?? 0) + 1
      seen.set(label, n)
      const name = n > 1 ? `${label}-${n}` : label
      const entity = partEntity(part, slug, name)
      if (!sectionEntities.some((e) => e.key === entity))
        sectionEntities.push({ key: entity, kind: 'section', identity: { page: p.entity, label: name } })
      return { entity, position: label, kind: 'section', selector: part.selector, published: '1', part }
    }
    const own = (where) =>
      s[where].filter((x) => x.shown && !sharedKeys.has(keyOfPart(where, x))).map((x) => area(x))
    const placeMain = s.main.filter((x) => x.shown).map((x) => area(x))
    return { page: p, s, own: { before: own('before'), after: own('after'), main: placeMain } }
  })
  const partsOf = (q) => [...q.own.before, ...q.own.main, ...q.own.after]
  // Who owns a slot, strongest evidence first: 1. a page's own entry, in the parts of its page (the stamp names the
  // field); 1b. its text the theme does not stamp (a title in a heading), by the heading's words; 2. an entry that is
  // no page of its own (a masthead, a form, a promo) where it is first printed; 3. the same in the parts every page
  // prints (the chrome entry); 4. what is left that some part of a page prints (a card of an entry whose page does not
  // print that field); 5. what only the parts every page prints show (a page title as a menu label).
  for (const q of placed.filter((x) => x.s))
    for (const a of partsOf(q))
      for (const st of a.part.stamps) if (stampEntity(st) === q.page.entity) claim(st, a.entity)
  // 1b. A page's own text the theme does not stamp (its title in a heading): the part whose heading says those words.
  for (const q of placed.filter((x) => x.s))
    for (const s of map.slots ?? []) {
      if (s.entity !== q.page.entity || s.type !== 'text' || claims.has(s.key) || !s.sample) continue
      const words = normText(s.sample)
      const at = partsOf(q).find((a) => (a.part.headings ?? []).some((h) => normText(h) === words))
      if (words && at) claims.set(s.key, at.entity)
    }
  for (const q of placed.filter((x) => x.s))
    for (const a of partsOf(q))
      for (const st of a.part.stamps) if (!pageEntities.has(stampEntity(st))) claim(st, a.entity)
  for (const q of placed.filter((x) => x.s))
    for (const where of ['before', 'after'])
      for (const part of q.s[where].filter((x) => x.shown && sharedKeys.has(keyOfPart(where, x)))) {
        const a = sharedOf(part, where)
        if (a.entity !== 'header')
          for (const st of part.stamps) if (!pageEntities.has(stampEntity(st))) claim(st, a.entity)
      }
  for (const q of placed.filter((x) => x.s))
    for (const a of partsOf(q)) for (const st of a.part.stamps) claim(st, a.entity)
  // 5. A page's field only a part every page prints shows (its title as a menu label).
  for (const q of placed.filter((x) => x.s))
    for (const where of ['before', 'after'])
      for (const part of q.s[where].filter((x) => x.shown && sharedKeys.has(keyOfPart(where, x)))) {
        const a = sharedOf(part, where)
        if (a.entity !== 'header') for (const st of part.stamps) claim(st, a.entity)
      }
  const sharedEntities = [...new Map([...shared.values()].map((a) => [a.entity, a])).values()]
    .filter((a) => a.entity !== 'header')
    .map((a) => ({ key: a.entity, kind: 'template-part', identity: { selector: a.selector } }))
  const bare = (a) => ({
    entity: a.entity,
    position: a.position,
    kind: a.kind,
    selector: a.selector,
    published: a.published
  })
  const pages = placed.map((q) => {
    const p = q.page
    const base = {
      entity: p.entity,
      route: p.path === '/' ? 'home' : p.path.slice(1),
      link: null,
      openAs: p.path,
      title: p.title,
      view: p.view
    }
    if (!q.s) {
      sectionGaps.push({
        field: `blocks[${p.entity}]`,
        reason: `the page ${p.path} was not read for its sections: it stays header, main body and footer`
      })
      return { ...base, assignedModules: FALLBACK.map((a) => ({ ...a, published: '1' })) }
    }
    // The layout's order: everything before main (shared or not), main's sections, everything after.
    const ordered = (where, owned) =>
      q.s[where]
        .filter((x) => x.shown)
        .map((x) =>
          sharedKeys.has(keyOfPart(where, x)) ? sharedOf(x, where) : bare(owned.find((a) => a.part === x))
        )
    return {
      ...base,
      assignedModules: [
        ...ordered('before', q.own.before),
        ...q.own.main.map(bare),
        ...ordered('after', q.own.after)
      ]
    }
  })
  const first = placed.find((q) => q.s)
  const frame = first
    ? [
        ...first.s.before
          .filter((x) => x.shown && sharedKeys.has(keyOfPart('before', x)))
          .map((x) => sharedOf(x, 'before')),
        { entity: 'main-body', position: null, kind: 'component', selector: 'main', published: '1' },
        ...first.s.after
          .filter((x) => x.shown && sharedKeys.has(keyOfPart('after', x)))
          .map((x) => sharedOf(x, 'after'))
      ]
    : FALLBACK.map((a) => ({ ...a, published: '1' }))
  const pictureSlots = (map.slots ?? []).filter((s) => s.type === 'image' && s.sample)
  if (!media && pictureSlots.length)
    sectionGaps.push({
      field: 'blocks[].frames[].picture',
      reason: `${pictureSlots.length} picture slots hold their demo file name, not the file the page serves, so no frame is matched to its slot (no agent token to read which media file each holds: --token-file)`
    })
  const slots = (map.slots ?? []).map((s) => ({
    ...s,
    ...(claims.get(s.key) ? { entity: claims.get(s.key) } : {}),
    ...(s.type === 'image' && media?.[s.key] ? { sample: media[s.key] } : {})
  }))
  return {
    ...map,
    entities: [...(map.entities ?? []), ...sectionEntities, ...sharedEntities],
    slots,
    pages,
    // A page the map does not list (a further result page, an address a link reaches) prints the shared parts around
    // its main body.
    otherPageAreas: frame,
    platformGaps,
    sectionGaps
  }
}
