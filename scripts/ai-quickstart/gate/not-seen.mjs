// The other way round of the marker test (ticket #585): each value the write plan wrote that no render shows, with the
// reason the pages give. A block copy is a module the page prints as `id="Mod<id>"` (T4 and Joomla's own chrome): when
// the page's HTML has no such module, the block was not printed at all (its position is not in the page's layout, or it
// is assigned to no page); when it has it, the block was printed without that value (a place the template does not read,
// a value its layout leaves out). Pure.
import { codesIn } from './marker-codec.mjs'
import { placeKeyOf, universeOf } from './universe.mjs'

/** The page id of a plan entry (`<page>.<block>.<field>`), or null. */
const pageOfEntry = (entry) => (typeof entry === 'string' ? entry.split('.')[0] : null)

/**
 * @param {{writePlan: object, registry: object[], seen: Set<string>, renders: object[], ids: Record<string, number>,
 *   uploaded: Record<string, string>, pictures: Set<string>}} input
 * @returns {Array<{code?: string, picture?: string, entry: string | null, op: string, loc: object | null,
 *   stood: string | null, reason: string, module?: number}>}
 */
export function notSeenOf({
  writePlan,
  registry,
  seen,
  renders,
  ids = {},
  uploaded = {},
  pictures = new Set()
}) {
  const what = new Map((registry ?? []).map((e) => [e.code, e]))
  const htmlOf = new Map()
  for (const r of renders ?? [])
    if (r.html) htmlOf.set(r.pageType, `${htmlOf.get(r.pageType) ?? ''}${r.html}`)
  const reasonOf = (op, entry) => {
    const id = ids[op.key]
    const page = pageOfEntry(entry)
    if (op.kind === 'module.copy' && id) {
      const html = htmlOf.get(page)
      if (html === undefined) return { reason: 'page_not_rendered', module: id }
      return html.includes(`id="Mod${id}"`)
        ? { reason: 'block_printed_without_value', module: id }
        : { reason: 'block_not_printed', module: id }
    }
    if (op.kind === 'article.create') {
      const item = op.key.split(':').slice(1).join(':')
      if (!htmlOf.has(`article:${item}`)) return { reason: 'article_not_rendered' }
    }
    return { reason: 'value_not_printed' }
  }
  const out = new Map()
  for (const op of writePlan?.ops ?? [])
    for (const v of op.values ?? []) {
      if (typeof v.value !== 'string') continue
      for (const code of codesIn(v.value))
        if (!seen.has(code) && !out.has(code))
          out.set(code, {
            code,
            entry: v.entry ?? null,
            op: op.key,
            loc: v.loc ?? null,
            stood: what.get(code)?.what ?? null,
            ...reasonOf(op, v.entry)
          })
    }
  const opsByKey = new Map((writePlan?.ops ?? []).map((o) => [o.key, o]))
  for (const [key, path] of Object.entries(uploaded ?? {})) {
    const file = String(path).replace(/^\/+/, '')
    if (pictures.has(file)) continue
    const entry = key.replace(/^picture:/, '')
    // The copy that shows the picture: the operation of its page block.
    const [page, block] = entry.split('.')
    const copy = opsByKey.get(`copy:${page}.${block}`) ?? opsByKey.get(key) ?? { key, kind: 'picture.upload' }
    out.set(file, { picture: file, entry, op: key, loc: null, stood: 'picture', ...reasonOf(copy, entry) })
  }
  return [...out.values()]
}

/**
 * Each written value no page shows, with the declared reason it may not show (`declared`), or null: a conflict the
 * real write reported for its entry (`write_conflict`), a flag the write plan raised on its block or entry (its code),
 * or the kit's own word that the place prints nothing (`prints: false` with `why` on the mapping location). A value with
 * no declared reason fails the verdict.
 * @param {object[]} notSeen `notSeenOf`
 * @param {{conflicts?: string[], unproven?: object[], mapping?: object}} context
 */
export function declareNotSeen(notSeen, { conflicts = [], unproven = [], mapping = null } = {}) {
  const conflicted = new Set(conflicts)
  const silent = new Map()
  for (const p of universeOf(mapping).values())
    if (p.loc?.prints === false) silent.set(p.key, p.loc.why ?? 'declared')
  return notSeen.map((n) => {
    const entry = String(n.entry ?? '')
    const flag = unproven.find(
      (u) =>
        (u.entry && (entry === u.entry || entry.startsWith(`${u.entry}.`))) ||
        (u.block && u.page && entry.startsWith(`${u.page}.${u.block}.`))
    )
    const kit = n.loc ? silent.get(placeKeyOf(n.loc)) : undefined
    const declared = conflicted.has(entry)
      ? 'write_conflict'
      : flag
        ? flag.code
        : kit
          ? `kit_declares_not_printed: ${kit}`
          : null
    return { ...n, declared }
  })
}
