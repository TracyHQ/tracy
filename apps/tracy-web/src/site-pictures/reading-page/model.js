// The picture reading page's model (ADR 0043, #341): the plan's picture wishes, the manifest the run ended with and
// the brief joined into what the page shows, in plan order, every planned frame once. Pure: files in, a plain object
// out. Nothing is judged here; the labels only say what the manifest holds.
const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/** The label of each manifest source, in the order the summary lists them. */
export const SOURCE_LABELS = Object.freeze({
  'owner-photo': 'owner photo',
  'owner-photo-extended': 'extended photo',
  drawn: 'drawn',
  icon: 'icon',
  initials: 'initials',
  hide: 'hidden',
  twin: 'twin'
})
export const LABEL_ORDER = Object.freeze([...Object.values(SOURCE_LABELS), 'returned', 'pending', 'no entry'])

// Every picture wish of one plan block, in order (the block's own, then its list items').
const wishesOf = (d) => [
  ...arr(d?.pictures),
  ...arr(d?.lists).flatMap((l) => arr(l?.items).flatMap((i) => arr(i?.pictures)))
]

/** Plan frames in plan order as groups: shared blocks first, then every kept page; a frame belongs to its first group. */
function groupsOf(plan) {
  const seen = new Set()
  const groups = []
  const group = (id, title, blocks) => {
    const frames = []
    for (const d of blocks) {
      if (!isObject(d) || d.decision === 'hide') continue
      for (const w of wishesOf(d)) {
        if (!isObject(w) || typeof w.frame !== 'string' || seen.has(w.frame)) continue
        seen.add(w.frame)
        frames.push({ wish: w, block: typeof d.id === 'string' ? d.id : null })
      }
    }
    groups.push({ id, title, frames })
  }
  group('shared', 'Shared blocks', arr(plan?.sharedBlocks))
  for (const p of arr(plan?.pages))
    if (isObject(p) && p.decision === 'keep' && typeof p.id === 'string') group(p.id, p.id, arr(p.blocks))
  return { groups, seen }
}

function stateOf(frame, entries, returns, pending) {
  const found = entries.get(frame)
  if (found) {
    const e = found.entry
    return {
      label: SOURCE_LABELS[e.source] ?? String(e.source),
      entry: e,
      setting: found.list === 'siteSettings'
    }
  }
  if (returns.has(frame)) return { label: 'returned', reason: returns.get(frame).reason }
  if (pending.has(frame)) {
    const p = pending.get(frame)
    return { label: 'pending', reason: p.reason ?? null, waitsFor: p.waitsFor ?? null }
  }
  return { label: 'no entry' }
}

/**
 * @param {{ plan: object, brief?: object | null, manifest: object, run?: object | null }} files
 */
export function buildModel({ plan, brief = null, manifest, run = null }) {
  const entries = new Map()
  for (const list of ['frames', 'siteSettings'])
    for (const e of arr(manifest?.[list]))
      if (isObject(e) && typeof e.frame === 'string' && !entries.has(e.frame))
        entries.set(e.frame, { list, entry: e })
  const returns = new Map(
    arr(manifest?.returns)
      .filter((r) => isObject(r))
      .map((r) => [r.frame, r])
  )
  const pending = new Map(
    arr(manifest?.pending)
      .filter((p) => isObject(p))
      .map((p) => [p.frame, p])
  )
  const assets = new Map(
    arr(brief?.assets)
      .filter((a) => isObject(a))
      .map((a) => [a.id, a])
  )
  const { groups, seen } = groupsOf(plan)
  const extra = [...new Set([...entries.keys(), ...returns.keys(), ...pending.keys()])].filter(
    (f) => !seen.has(f)
  )
  groups.push({
    id: 'outside',
    title: 'Frames outside the plan wishes',
    frames: extra.map((f) => ({ wish: { frame: f }, block: null }))
  })
  const alts = new Map(
    arr(manifest?.altNotes)
      .filter((n) => isObject(n))
      .map((n) => [n.frame, n])
  )
  const counts = Object.fromEntries(LABEL_ORDER.map((l) => [l, 0])) // other labels join as they appear
  for (const g of groups)
    g.frames = g.frames.map(({ wish, block }) => {
      const state = stateOf(wish.frame, entries, returns, pending)
      counts[state.label] = (counts[state.label] ?? 0) + 1
      const asset = state.entry?.asset ? (assets.get(state.entry.asset) ?? null) : null
      return {
        frame: wish.frame,
        block,
        wish,
        ...state,
        sha256: asset?.sha256 ?? null,
        alt: alts.get(wish.frame) ?? null
      }
    })
  const roles = [...new Set([...Object.keys(manifest?.cost ?? {}), ...Object.keys(manifest?.timing ?? {})])]
  return {
    kit: manifest?.fingerprint?.kit ?? 'unknown kit',
    run,
    groups: groups.filter((g) => g.frames.length),
    counts,
    total: groups.reduce((n, g) => n + g.frames.length, 0),
    returns: arr(manifest?.returns).filter((r) => isObject(r)),
    altNotes: arr(manifest?.altNotes).filter((n) => isObject(n)),
    cost: roles.map((r) => ({ role: r, usd: manifest?.cost?.[r] ?? null, ms: manifest?.timing?.[r] ?? null }))
  }
}
