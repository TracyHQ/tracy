// Helpers of the crash sweeps of the revision run tests (#599). Invented data only.
import { snapshotOf } from './draft-write-fixtures.mjs'

/** The door calls of the first build of the florist on a blank site. */
export const FIRST = 63

/** A record whose state is only what `save` stored: `revive()` is the record a new process reads. */
export function durable() {
  let saved
  const save = async (state) => {
    saved = structuredClone(state)
  }
  return {
    record: { save },
    revive: () => ({ state: saved && structuredClone(saved), save }),
    saved: () => saved && structuredClone(saved)
  }
}

const WRITES = ['update', 'contract', 'identity', 'upload', 'hide', 'unassign', 'deleteMedia']
/** Doors that die (`fatal`, code `crash`) at their `at`-th writing call, after it acted or `before` it did. */
export function crashingDoors(doors, at, before = false) {
  let n = 0
  const out = { ...doors, count: () => n }
  for (const name of WRITES)
    out[name] = async (call) => {
      n += 1
      const dies = () => Object.assign(new Error(`scripted crash call ${n}`), { fatal: true, code: 'crash' })
      if (n === at && before) throw dies()
      const answer = await doors[name](call)
      if (n === at) throw dies()
      return answer
    }
  return out
}

/**
 * A site's snapshot without the files a run left (`left`: their paths) and without the records the run made that the
 * undo hid or put on no page (absent from `snapshot`, hidden), to compare with the snapshot before it.
 */
export function uploadsLeft(memory, snapshot, left = []) {
  return withoutHiddenMade(snapshotOf(memory), snapshot, left)
}

/** `now` (a snapshot) less the files `left` and the records absent from `before` that read hidden or on no page. */
export function withoutHiddenMade(now, before, left = []) {
  const gone = new Set(left)
  now.uploads = now.uploads.filter(([path]) => !gone.has(path))
  const had = (kind, id) => (before?.records?.[kind] ?? []).some(([i]) => i === id)
  const hidden = (r) => r.published === 0 || r.state === 0
  const offPage = new Set(
    now.assignments.filter(([id, m]) => m.length === 0 && !had('module', id)).map(([id]) => id)
  )
  for (const kind of Object.keys(now.records))
    now.records[kind] = now.records[kind].filter(
      ([id, r]) => had(kind, id) || !(hidden(r) || (kind === 'module' && offPage.has(id)))
    )
  now.assignments = now.assignments.filter(([id]) => !offPage.has(id))
  return now
}
