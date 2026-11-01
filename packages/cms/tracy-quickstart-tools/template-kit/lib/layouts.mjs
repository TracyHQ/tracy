// Pages that share a layout, decided from what each page renders, never from its menu group: the same kind of main
// content, the same skeleton of its body block when the capture read one, and a body shot whose ink sits in the same
// places (layout-profiles.mjs). Within one layout a page stands for the rest (a group's representative first, then the
// page with the most blocks, a main menu page, the shortest path): its body shot is the one packed (`shotOf` on the
// others) and its frames are the ones emptied: a frame of another page in the same place (same role, same order among
// the frames of that role) takes its `canHide` (`canHideFrom`). A frame with no counterpart is measured on its own
// page. A further result page (`?start=6`, `/page/2`) of the same kind and skeleton as its page 1 uses page 1's
// shots (`paginationOf`): its pictures differ, its layout does not.
import { profileSimilarity, SAME_LAYOUT } from './layout-profiles.mjs'
import { firstPageOf } from './kit-paths.mjs'
import { representativeOf } from './pack.mjs'

const bodyOf = (page) => `body-${String(page.id).replace(/^page-/, '')}`
const listed = (page) =>
  new Set(Array.isArray(page.blocks) ? page.blocks : Object.values(page.blocks ?? {}).flat())

/**
 * What a page's main area is, without its words: the kind of main content and the skeleton of the body block. The
 * blocks around the body are left out: an extra module beside an article does not change the article's layout, and
 * a sidebar that narrows the body shows in its profile.
 */
export function layoutKey(page, skeleton = null) {
  // A further result page's kind names its offset (`category listing (list position 6)`): the view is page 1's.
  const kind = String(page.kind ?? 'unknown').replace(/\s*\(list position \d+\)$/, '')
  return `${kind}|${skeleton ?? ''}`
}

/**
 * @param {{pages: object[], pageGroups: object[], blocks?: object[], profiles?: object, skeletons?: Map<string, string>}} kit
 *   pages with `kind` (what owns their main area); `profiles`: image id -> layout profile; `skeletons`: body id -> skeleton
 * @returns {Map<string, {exemplar: string, key: string, size: number, similarity: number|null, paginationOf?: string}>}
 */
export function bodyLayouts({ pages, pageGroups, blocks = [], profiles = {}, skeletons = new Map() }) {
  const pageById = new Map(pages.map((p) => [p.id, p]))
  const pageByPath = new Map(pages.map((p) => [p.path, p]))
  const reps = new Set((pageGroups ?? []).map((g) => representativeOf(g, pageById)?.page).filter(Boolean))
  const shotOf = new Map(blocks.map((b) => [b.id, b.images?.['1440'] ?? b.images?.[1440]]))
  const profile = (bodyId) => profiles[shotOf.get(bodyId)] ?? null
  const looksSame = (a, b) => {
    const s = profileSimilarity(profile(a), profile(b))
    return { ok: s === null || s >= SAME_LAYOUT, s }
  }
  const withBody = pages.filter((p) => listed(p).has(bodyOf(p)))
  const buckets = new Map()
  for (const p of withBody) {
    const k = layoutKey(p, skeletons.get(bodyOf(p)))
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k).push(p)
  }
  const rank = (a, b) =>
    Number(reps.has(b.id)) - Number(reps.has(a.id)) ||
    listed(b).size - listed(a).size ||
    Number(!!b.inMainMenu) - Number(!!a.inMainMenu) ||
    a.path.length - b.path.length ||
    (a.id < b.id ? -1 : 1)
  const out = new Map()
  for (const [key, list] of buckets) {
    const firsts = list.filter((p) => !firstPageOf(p.path)).sort(rank)
    const further = list.filter((p) => firstPageOf(p.path)).sort(rank)
    const clusters = []
    const join = (p, c, s, extra = {}) => {
      c.members.push(p)
      out.set(bodyOf(p), { exemplar: c.exemplar, key, similarity: s, ...extra })
    }
    for (const p of [...firsts, ...further]) {
      const body = bodyOf(p)
      // A further result page is page 1's menu item and view at another offset: in page 1's bucket (same kind, same
      // skeleton) it is page 1's layout, whatever its pictures, which differ on every result page.
      const first = pageByPath.get(firstPageOf(p.path))
      const home = first && clusters.find((c) => c.members.includes(first))
      if (home) {
        join(p, home, looksSame(body, home.exemplar).s, { paginationOf: first.id })
        continue
      }
      // The closest layout that looks the same, not the first one met.
      const hit = clusters
        .map((c) => ({ c, ...looksSame(body, c.exemplar) }))
        .filter((x) => x.ok)
        .sort((a, b) => (b.s ?? 1) - (a.s ?? 1))[0]
      if (hit) join(p, hit.c, hit.s)
      else {
        const c = { exemplar: body, members: [] }
        clusters.push(c)
        join(p, c, null)
      }
    }
    for (const c of clusters) for (const p of c.members) out.get(bodyOf(p)).size = c.members.length
  }
  return out
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
export function applyLayouts(kit, { profiles = {}, skeletons = new Map() } = {}) {
  const layouts = bodyLayouts({ ...kit, profiles, skeletons })
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
      b.shotSimilarity = l.similarity
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
  // The inheriting frame's own canHide error goes when its counterpart has an answer (errors changed in place).
  const kept = kit.errors.filter((e) => {
    const m = /^blocks\[[^\]]+\]\.frames\[([^\]]+)\]\.canHide$/.exec(e.field ?? '')
    return !(m && dropped.has(m[1]) && frameById.get(m[1]).canHide != null)
  })
  kit.errors.splice(0, kit.errors.length, ...kept)
  return { layouts, inherit }
}
