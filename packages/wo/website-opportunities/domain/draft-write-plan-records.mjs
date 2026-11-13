// The door operation of one record of the draft write (ticket #597): a created record, a module copy, its assignment
// and a picture to upload or draw, with the aliases a resumed run finds created records by. Pure; part of `opsOf`
// (`draft-write-plan-ops.mjs`).

export const valuesOf = (record) =>
  [...record.values.values()].map(({ loc, value, entry, rule }) => ({ loc, value, entry, rule }))

/** A URL part of a label: lower case letters and digits joined by dashes, in the label's own script. */
export const slugOf = (text) =>
  String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'page'

/** Aliases unique per record kind, in plan order: the mark a resumed run finds a created record by. */
export function aliasesOf(records) {
  const used = new Map()
  for (const r of records) {
    const base = slugOf(r.title ?? r.subject ?? r.key)
    const kind = r.recordKind
    const seen = used.get(kind) ?? new Set()
    used.set(kind, seen)
    let alias = base
    for (let n = 2; seen.has(alias); n++) alias = `${base}-${n}`
    seen.add(alias)
    r.alias = alias
  }
}

/**
 * A person with no photo shows their initials, drawn in the frame of the slot (`initials-avatar.js` of tracy-web). The
 * drawer has strokes for A to Z only (`initialsOf` folds accented Latin letters to them): a name in another script
 * is drawn as the neutral figure, flagged `initials_drawn_as_figure` (the template has no text slot for initials).
 */
export function drawOf(picture) {
  if (picture.source !== 'initials') return {}
  const initials = picture.substitute?.initials ?? ''
  const frame = picture.substitute?.frame ?? picture.size ?? {}
  return {
    draw: { initials, width: frame.width ?? 400, height: frame.height ?? 400 },
    ...(/^[A-Z]+$/.test(initials) ? {} : { unproven: 'initials_drawn_as_figure' })
  }
}

export function createOp(record) {
  return {
    key: record.key,
    kind: `${record.recordKind}.create`,
    record: record.key,
    recordKind: record.recordKind,
    mark: record.alias,
    fields: {
      title: record.title ?? null,
      alias: record.alias,
      ...(record.menutype ? { menutype: record.menutype, home: record.home ? 1 : 0 } : {}),
      ...(record.category ? { catid: { ref: record.category, form: 'id' } } : {})
    },
    ...(record.page ? { page: record.page } : {}),
    ...(record.link ? { link: record.link } : {}),
    ...(record.pageType ? { pageType: record.pageType } : {}),
    values: valuesOf(record),
    entries: record.entries,
    rules: [`created:${record.recordKind}`, ...record.rules],
    // A created record has no frame from the blank site (#584): an HTML piece it holds is written into an empty value.
    ...([...record.values.values()].some((v) => v.loc.xpath) ? { unproven: 'created_record_frame' } : {})
  }
}

export function copyOp(record) {
  return {
    key: record.key,
    kind: 'module.copy',
    record: record.key,
    source: { kind: 'module', id: record.sourceId, entity: record.entity },
    mark: record.key,
    // Modules sharing a position draw by `ordering`: the block's rank on its first page keeps the page's order.
    ordering: record.rank ?? null,
    values: valuesOf(record),
    cuts: record.cuts,
    removes: record.removes,
    entries: record.entries,
    rules: [...record.rules, 'ordering:page_rank']
  }
}

export function assignOf(record, placement) {
  if (!placement?.assign) return null
  const menuids =
    placement.assign === 'every-page'
      ? [0]
      : [...record.pages].map((page) => ({ ref: `page:${page}`, form: 'id' }))
  return {
    key: `assign:${record.key}`,
    kind: 'module.assign',
    record: record.key,
    ...(record.kind === 'store' ? { sourceId: record.sourceId } : {}),
    menuids,
    entries: [],
    rules: [`assign:${placement.assign}`]
  }
}
