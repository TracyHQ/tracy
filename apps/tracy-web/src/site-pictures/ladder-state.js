// The state of one finished round while its frames climb the fallback ladder (#344, ladder-step.js): the entries of the
// manifest by frame (twins left out, put together again whenever the manifest is read), what waits and what is
// returned, the rows dropped, each frame's place on its ladder and the rungs it took, and the files and drawings made.
import { addTwins } from './frame-entries.js'
import { OWNER_SOURCES } from './manifest-shape.js'
import { NONE } from './picker-picks.js'

/**
 * @param {object} idx the picture check's index of plan, kit and brief
 * @param {object} doc the round's manifest
 */
export function ladderState(idx, doc) {
  const isTwin = (id) => Boolean(idx.frames.get(id)?.twinOf) || Boolean(idx.wishes.get(id)?.sameAs)
  const entries = new Map()
  for (const list of ['frames', 'siteSettings'])
    for (const e of doc[list]) if (e.source !== 'twin') entries.set(e.frame, { list, entry: { ...e } })
  const ladder = new Map()
  const s = {
    isTwin,
    entries,
    pending: doc.pending.filter((p) => !isTwin(p.frame)),
    // A frame returned because the kit does not let it be written stays; other twins are put together again.
    returns: doc.returns.filter(
      (r) => !(isTwin(r.frame) && idx.frames.get(r.frame) && idx.frames.get(r.frame).writable !== false)
    ),
    rows: [],
    rowsNow: new Map(),
    ladder,
    /** frame -> { at, tried: Set of assets, photos, mode, asset, faults, last, done } */
    progress: new Map(),
    files: [],
    draws: [],
    picked: new Set((doc.picks ?? []).filter((p) => p.photo && p.photo !== NONE).map((p) => p.frame)),
    note: (frame, rung, outcome, detail = null) =>
      ladder.set(frame, [...(ladder.get(frame) ?? []), { rung, outcome, detail }]),
    /** The rungs a frame took, as one line. */
    story: (frame) =>
      (ladder.get(frame) ?? [])
        .map((x) => `${x.rung} ${x.outcome}${x.detail ? ` (${x.detail})` : ''}`)
        .join('; '),
    listOf: (frame) => (frame.writable === false ? 'siteSettings' : 'frames'),
    extraOf: (list) => (list === 'siteSettings' ? { writeDoor: 'none' } : {}),
    /** How many frames use each brief photo now. */
    usageNow() {
      const usage = new Map((doc.usage ?? []).map((u) => [u.asset, 0]))
      for (const { entry } of entries.values())
        if (OWNER_SOURCES.has(entry.source)) usage.set(entry.asset, (usage.get(entry.asset) ?? 0) + 1)
      return usage
    },
    /** The owner photos already shown on a page of this frame, by any other frame. */
    onPages(frameId) {
      const pages = idx.wishes.get(frameId)?.pages ?? new Set()
      const used = new Set()
      for (const [id, { entry }] of entries) {
        if (id === frameId || !OWNER_SOURCES.has(entry.source)) continue
        if ([...(idx.wishes.get(id)?.pages ?? [])].some((p) => pages.has(p))) used.add(entry.asset)
      }
      return used
    },
    /** The cuts of each owner photo shown on a page of this frame by any other frame: asset -> [{ frame, crop }]. */
    cutsOn(frameId) {
      const pages = idx.wishes.get(frameId)?.pages ?? new Set()
      const cuts = new Map()
      for (const [id, { entry }] of entries) {
        if (id === frameId || !OWNER_SOURCES.has(entry.source)) continue
        if (![...(idx.wishes.get(id)?.pages ?? [])].some((p) => pages.has(p))) continue
        cuts.set(entry.asset, [...(cuts.get(entry.asset) ?? []), { frame: id, crop: entry.crop }])
      }
      return cuts
    },
    /** Record a file made in this save (stored already), with what making it cost. */
    keepFile(made, costUsd = 0) {
      s.files.push({
        file: `files/${made.sha256}.${made.ext}`,
        name: `${made.sha256}.${made.ext}`,
        sha256: made.sha256,
        width: made.width,
        height: made.height,
        costUsd
      })
    },
    /** The manifest as it stands: the entries, the twins put together again, what waits, what is returned, usage. */
    docOf() {
      const ents = new Map([...entries].map(([k, v]) => [k, { list: v.list, entry: { ...v.entry } }]))
      const pending = [...s.pending]
      const returns = [...s.returns]
      addTwins({ idx, entries: ents, returns, pending })
      const of = (list) => [...ents.values()].filter((e) => e.list === list).map((e) => e.entry)
      return {
        ...doc,
        frames: of('frames'),
        siteSettings: of('siteSettings'),
        returns,
        pending,
        usage: [...s.usageNow()].map(([asset, frames]) => ({ asset, frames }))
      }
    }
  }
  return s
}
