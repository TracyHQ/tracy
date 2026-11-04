// Pages that share a layout, decided from the DOM each page renders, never from its menu group: the same kind of
// main content and the same body skeleton (read-details.js: containers with their classes, flowing content as `~`).
// Two layouts of one kind whose skeletons are close but not equal stay apart (one more body shot, the safe side)
// and are listed in `layoutChecks` for a person to look at. Within one layout a page stands for the rest
// (a group's representative first, then the page with the most blocks, a main menu page, the shortest path): its
// body shot is the one taken (`shotOf` on the others) and its frames are the ones emptied: a frame of another page
// in the same place (same role, same order among the frames of that role) takes its `canHide` (`canHideFrom`). A
// frame with no counterpart is measured on its own page. A further result page (`?start=6`, `/page/2`) whose
// skeleton is page 1's or close to it uses page 1's shots (`paginationOf`): it lacks only what page 1 alone shows.
import { firstPageOf } from './kit-paths.mjs'
import { representativeOf } from './pack.mjs'

/** Two skeletons at least this close (and not equal): a further result page joins page 1; other pages are listed. */
export const SKELETON_CLOSE = 0.8

const bodyOf = (page) => `body-${String(page.id).replace(/^page-/, '')}`
const listed = (page) =>
  new Set(Array.isArray(page.blocks) ? page.blocks : Object.values(page.blocks ?? {}).flat())
// A further result page's kind names its offset (`category listing (list position 6)`): the view is page 1's.
const kindOf = (page) => String(page.kind ?? 'unknown').replace(/\s*\(list position \d+\)$/, '')

/** What a page's main area is, without its words: the kind of main content and the body skeleton. */
export function layoutKey(page, skeleton = null) {
  return `${kindOf(page)}|${skeleton ?? ''}`
}

/** Share of the distinct pieces (an element's tag and classes, or `~`) two skeletons have in common, 0..1. */
export function skeletonSimilarity(a, b) {
  const parts = (s) =>
    new Set(
      String(s ?? '')
        .split(/[(),>]+/)
        .filter(Boolean)
    )
  const x = parts(a)
  const y = parts(b)
  if (!x.size && !y.size) return 1
  let both = 0
  for (const t of x) if (y.has(t)) both++
  return Math.round((both / (x.size + y.size - both)) * 1000) / 1000
}

/**
 * @param {{pages: object[], pageGroups: object[], skeletons?: Map<string, string>}} kit
 *   pages with `kind` (what owns their main area); `skeletons`: body id -> skeleton
 * @returns {{layouts: Map<string, {exemplar: string, key: string, size: number, paginationOf?: string}>, checks: object[]}}
 */
export function bodyLayouts({ pages, pageGroups, skeletons = new Map() }) {
  const pageById = new Map(pages.map((p) => [p.id, p]))
  const pageByPath = new Map(pages.map((p) => [p.path, p]))
  const reps = new Set((pageGroups ?? []).map((g) => representativeOf(g, pageById)?.page).filter(Boolean))
  const rank = (a, b) =>
    Number(reps.has(b.id)) - Number(reps.has(a.id)) ||
    listed(b).size - listed(a).size ||
    Number(!!b.inMainMenu) - Number(!!a.inMainMenu) ||
    a.path.length - b.path.length ||
    (a.id < b.id ? -1 : 1)
  const sk = (p) => skeletons.get(bodyOf(p)) ?? ''
  const withBody = pages.filter((p) => listed(p).has(bodyOf(p)))
  // Further result pages first find page 1; the rest form one cluster per kind and skeleton.
  const further = new Map()
  for (const p of withBody) {
    const first = pageByPath.get(firstPageOf(p.path))
    if (first && listed(first).has(bodyOf(first)) && kindOf(first) === kindOf(p)) {
      const s = skeletonSimilarity(sk(first), sk(p))
      if (s >= SKELETON_CLOSE) further.set(p.id, first)
    }
  }
  const clusters = new Map()
  for (const p of withBody.filter((x) => !further.has(x.id))) {
    const k = layoutKey(p, sk(p))
    if (!clusters.has(k)) clusters.set(k, { key: k, kind: kindOf(p), members: [] })
    clusters.get(k).members.push(p)
  }
  const list = [...clusters.values()]
  for (const c of list) c.members.sort(rank)
  list.sort((a, b) => rank(a.members[0], b.members[0]))
  // Close skeletons of one kind: listed, kept apart.
  const checks = []
  for (const [i, a] of list.entries())
    for (const b of list.slice(i + 1)) {
      if (a.kind !== b.kind) continue
      const close = skeletonSimilarity(sk(a.members[0]), sk(b.members[0]))
      if (close >= SKELETON_CLOSE)
        checks.push({
          a: bodyOf(a.members[0]),
          b: bodyOf(b.members[0]),
          skeletonSimilarity: close,
          same: false
        })
    }
  const out = new Map()
  for (const c of list) {
    const exemplar = bodyOf(c.members[0])
    for (const p of c.members) out.set(bodyOf(p), { exemplar, key: c.key })
  }
  for (const [id, first] of further) {
    const home = out.get(bodyOf(first))
    if (home) out.set(bodyOf(pageById.get(id)), { ...home, paginationOf: first.id })
  }
  const size = new Map()
  for (const l of out.values()) size.set(l.exemplar, (size.get(l.exemplar) ?? 0) + 1)
  for (const l of out.values()) l.size = size.get(l.exemplar)
  return { layouts: out, checks }
}

/** Each frame's place in its block: its role and its order among the block's frames of that role. */
export function layoutKeys(frames) {
  const seen = new Map()
  const keys = new Map()
  for (const f of frames ?? []) {
    const role = f.role ?? 'none'
    const n = seen.get(role) ?? 0
    seen.set(role, n + 1)
    keys.set(f.id, `${role}#${n}`)
  }
  return keys
}

/**
 * Frames that take their `canHide` from the frame in the same place on the layout's exemplar page.
 * @param {Map<string, object>} layouts from `bodyLayouts`
 * @param {(blockId: string) => Array<{id: string, role?: string}>} framesOf
 * @returns {Map<string, string>} frame id -> the exemplar frame id
 */
export function inheritedFrames(layouts, framesOf) {
  const out = new Map()
  for (const [blockId, l] of layouts) {
    if (blockId === l.exemplar) continue
    const theirs = new Map([...layoutKeys(framesOf(l.exemplar))].map(([id, key]) => [key, id]))
    for (const [id, key] of layoutKeys(framesOf(blockId))) if (theirs.has(key)) out.set(id, theirs.get(key))
  }
  return out
}

/**
 * Apply the layouts to an assembled kit (in place): `shotOf` on a body block that is not its layout's exemplar,
 * `canHide` and `canHideFrom` on a frame that has a counterpart there, and its own canHide error dropped.
 */
/**
 * Pages of one layout lay their item rows out the same way: an items list left without a minimum (its page shows
 * too few rows to measure one, such as a tag with a single article) takes the minimum measured on the page of that
 * layout that showed the most rows (`minSource: "layout"`, `minFrom`). Changes the lists in place.
 * @returns {Set<string>} the `.min` error fields the layout answered
 */
export function inheritListMins(layouts, blockById) {
  const itemsOf = (id) => (blockById.get(id)?.lists ?? []).find((l) => l.rowKind === 'items') ?? null
  const members = new Map()
  for (const [id, l] of layouts) members.set(l.exemplar, [...(members.get(l.exemplar) ?? []), id])
  const answered = new Set()
  for (const ids of members.values()) {
    const donor = ids
      .map((id) => itemsOf(id))
      .filter((l) => l?.min != null && l.minSource === 'measured')
      .sort((a, b) => (b.maxEvidence?.rowsShown ?? 0) - (a.maxEvidence?.rowsShown ?? 0))[0]
    if (!donor) continue
    for (const id of ids) {
      const list = itemsOf(id)
      if (!list || list.min != null || list === donor) continue
      Object.assign(list, { min: donor.min, minSource: 'layout', minFrom: donor.id })
      answered.add(`blocks[${id}].lists[${list.id}].min`)
    }
  }
  return answered
}

export function applyLayouts(kit, { skeletons = new Map() } = {}) {
  const { layouts, checks } = bodyLayouts({ ...kit, skeletons })
  kit.layoutChecks = checks
  for (const p of kit.pages) {
    const l = layouts.get(bodyOf(p))
    if (l?.paginationOf) p.paginationOf = l.paginationOf
  }
  const blockById = new Map(kit.blocks.map((b) => [b.id, b]))
  const frameById = new Map(kit.blocks.flatMap((b) => (b.frames ?? []).map((f) => [f.id, f])))
  for (const [id, l] of layouts) {
    const b = blockById.get(id)
    if (b && id !== l.exemplar && blockById.get(l.exemplar)?.images) {
      b.shotOf = l.exemplar
    }
  }
  const inherit = inheritedFrames(layouts, (id) => blockById.get(id)?.frames ?? [])
  const dropped = new Set()
  for (const [id, from] of inherit) {
    const f = frameById.get(id)
    const e = frameById.get(from)
    if (!f || !e) continue
    f.canHide = e.canHide ?? null
    f.canHideFrom = from
    dropped.add(id)
  }
  const minTaken = inheritListMins(layouts, blockById)
  // The inheriting frame's own canHide error goes when its counterpart has an answer, and an items list's own
  // minimum error when the layout gave it one (errors changed in place).
  const kept = kit.errors.filter((e) => {
    const m = /^blocks\[[^\]]+\]\.frames\[([^\]]+)\]\.canHide$/.exec(e.field ?? '')
    if (minTaken.has(e.field)) return false
    return !(m && dropped.has(m[1]) && frameById.get(m[1]).canHide != null)
  })
  kit.errors.splice(0, kit.errors.length, ...kept)
  return { layouts, inherit, checks }
}
