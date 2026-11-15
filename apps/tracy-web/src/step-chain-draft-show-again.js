// A record an earlier revision hid that a later revision wants again (#599): shown again, never made a second time.
//
// A hide or an unassign (`step-chain-draft-removal.js`) keeps the record and its id, so the run record knows it:
// `state.hidden` maps each operation such an act settled to the record (`{kind, id, door}`), carried from build to
// build (`hiddenOf`, which also reads the done acts of a record written before `hidden` existed). An operation the next
// revision adds again whose record was taken off that way is a SHOW (`showsOf`): its key goes into `state.rewrite`, so
// `madeOnce` writes the record again in place through the update door, same id, with every field a new record gets (an
// article `state: 1`, a menu item `published: 1`: the reverse of the hide) and the new plan's content; a module's pages
// are written again by its own assign operation, added again too. Those writes go through the journal like any other
// (`journaledDoors`): the values before (a hidden column 0, a module's empty pages) are kept in `state.undo`, so the
// restore and the abandon of this revision take the record off again. Before any door write, every show is checked as
// its act is (`checkAct`), over every column the show writes (a module's record AND its page list): a record the owner
// edited or deleted since, or a module whose page list is gone, stops `site_changed_outside`, nothing written. The report
// says which operations were shown again (`shown_again`).
import { checkAct } from './step-chain-draft-removal.js'

const list = (value) => (Array.isArray(value) ? value : [])

/** What a revision's act took off, per operation it settled. */
const takenOf = (act) => ({ kind: act.kind, id: Number(act.id), door: act.door })

/** The records a build's run record knows as taken off by a revision: operation key -> `{kind, id, door}`. */
export function hiddenOf(state) {
  const out = { ...state?.hidden }
  const done = new Set(list(state?.removal?.done))
  for (const act of list(state?.removal?.acts))
    if (done.has(act.key)) for (const op of list(act.ops)) out[op] ??= takenOf(act)
  return out
}

/**
 * The operations a revision adds whose record an earlier revision took off, and what stays taken off.
 * @param {{added: string[]}} delta the write delta (`writeDeltaOf`)
 * @param {object} previous the previous build's run record state
 * @returns {{shows: Array<{key: string, door: 'hide' | 'unassign', kind: string, id: number, ops: string[]}>,
 *   hidden: Record<string, {kind: string, id: number}>}}
 */
export function showsOf(delta, previous) {
  const hidden = hiddenOf(previous)
  const ids = previous?.ids ?? {}
  const shows = []
  for (const key of list(delta.added)) {
    const was = hidden[key]
    delete hidden[key]
    if (!was || Number(ids[key]) !== was.id) continue
    // Checked as its act is (`checkAct`), and every column the show writes: a module's record as well as its pages.
    const door = was.door ?? 'hide'
    shows.push({
      key: `show:${was.kind}:${was.id}`,
      door,
      kind: was.kind,
      id: was.id,
      ops: [key],
      show: true
    })
  }
  return { shows, hidden }
}

/** Every show checked before the first door write: a hidden record edited outside Tracy stops the run. */
export async function checkShows(shows, doors, states, undo) {
  for (const show of shows) await checkAct(show, doors, states, undo)
}

/** What a removal act took off, kept in the run record, so a later revision knows what it may show again. */
export function keepHidden(state, act) {
  state.hidden ??= {}
  for (const op of list(act.ops)) state.hidden[op] = takenOf(act)
}

/** The report flag of the operations shown again. */
export const shownFlagOf = (shows) =>
  shows.length ? [{ code: 'shown_again', ops: shows.flatMap((s) => s.ops) }] : []
