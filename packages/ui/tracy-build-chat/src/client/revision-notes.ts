/**
 * The note a change request leaves on the plan card (#609): what the plan step changed and what it did not do, with
 * its reason, or for an `edit` the agent made, the values it changed (`edits`). The lines come from the `tracy_build`
 * answer of the revise step, or the edit call's own changes (`revised` of the plan fold), which the
 * draft does not keep, so this small store holds them per plan revision for the card to read. A note belongs to the
 * revision it was made for: once the plan moves on (an edit, a newer request) the card asks for another key and the
 * note is gone. A dismissed note stays dismissed when the session log is folded again.
 */
import type { RevisionNote } from '@tracy/core/build-chat'

export interface RevisionNotes {
  /** The note of this plan revision (`<plan id>:<revision>`), or null when there is none or it was dismissed. */
  read(key: string): RevisionNote | null
  /**
   * Keeps the note of a plan revision; the same note again changes nothing (a dismissal stays), a different note for
   * the same revision (a later request that changed nothing) replaces it and shows.
   */
  put(key: string, note: RevisionNote): void
  /** Hides the note of a plan revision for good. */
  dismiss(key: string): void
  subscribe(listener: () => void): () => void
}

/** Whether a note has anything to say. */
export const hasNote = (note: RevisionNote | null): note is RevisionNote =>
  note !== null && (note.changed.length > 0 || note.notDone.length > 0 || (note.edits?.length ?? 0) > 0)

export function createRevisionNotes(): RevisionNotes {
  const notes = new Map<string, RevisionNote>()
  const dismissed = new Set<string>()
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  // A dismissal belongs to the note it hid, so folding the log again never brings a dismissed note back.
  const idOf = (key: string, note: RevisionNote | undefined) => `${key}\n${JSON.stringify(note ?? null)}`
  return {
    read(key) {
      const note = notes.get(key)
      return note === undefined || dismissed.has(idOf(key, note)) ? null : note
    },
    put(key, note) {
      const held = notes.get(key)
      if (held && JSON.stringify(held) === JSON.stringify(note)) return
      // A request that changed nothing answers the same revision with a note of its own: the newer note shows.
      notes.set(key, note)
      notify()
    },
    dismiss(key) {
      const id = idOf(key, notes.get(key))
      if (dismissed.has(id)) return
      dismissed.add(id)
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
