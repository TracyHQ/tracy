// The door operation of one record of the draft write (ticket #597): a created record, a module copy, its assignment
// and a picture to upload or draw, with the aliases a resumed run finds created records by. Pure; part of `opsOf`
// (`draft-write-plan-ops.mjs`).

export const valuesOf = (record) =>
  [...record.values.values()].map(({ loc, value, entry, rule }) => ({ loc, value, entry, rule }))

// The alias rule (ASCII, transliterated, unique, a fallback from the key): `draft-write-alias.mjs`.
export { aliasesOf, slugOf } from './draft-write-alias.mjs'

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
    // The menu item as the kit declares it (`pages.<type>.menuItem`): template style, params, parent page.
    ...(record.item ? { item: record.item } : {}),
    // The columns a created record starts from (`pages.<type>.record.base`) and a category's own (`record.category`).
    ...(record.base ? { base: record.base } : {}),
    ...(record.extension ? { extension: record.extension, params: record.params ?? {} } : {}),
    ...(record.frames ? { frames: record.frames } : {}),
    // A created article's rank among the dates the write gives (0 newest): `draft-write-record-columns.mjs`.
    ...(record.dated ? { dated: record.dated } : {}),
    ...(record.pageType ? { pageType: record.pageType } : {}),
    values: valuesOf(record),
    entries: record.entries,
    rules: [`created:${record.recordKind}`, ...record.rules],
    // Every key of a row the record writes that the plan leaves unset, set empty first (`rowFillsOf`, fact K1).
    ...(record.fills ? { fills: record.fills } : {}),
    // A created record has no frame from the blank site (#584): an HTML piece it holds is written into the frame the
    // kit declares (`createdFrames`, measured on a created record, fact K1), or, for a kit with no frames, into the
    // smallest frame that holds it (`created_record_frame`).
    ...(!record.frames && [...record.values.values()].some((v) => v.loc.xpath)
      ? { unproven: 'created_record_frame' }
      : {})
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
  // An `unassign` hide (#587): every field of its group is empty, so the module is left on no page, through the
  // site's unassign door, instead of assigned.
  if (record.unassign)
    return {
      key: `unassign:${record.key}`,
      kind: 'module.unassign',
      record: record.key,
      ...(record.kind === 'store' ? { sourceId: record.sourceId } : {}),
      fields: record.unassign.fields,
      entries: [],
      rules: [record.unassign.rule]
    }
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
