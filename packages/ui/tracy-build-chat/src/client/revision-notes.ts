/**
 * The note a change request leaves on the plan card (#609): what the plan step changed and what it did not do, with
 * its reason. The lines come from the `tracy_build` answer of the revise step (`revised` of the plan fold), which the
 * draft does not keep, so this small store holds them per plan revision for the card to read. A note belongs to the
 * revision it was made for: once the plan moves on (an edit, a newer request) the card asks for another key and the
 * note is gone. A dismissed note stays dismissed when the session log is folded again.
 */
import type { RevisionNote } from '@tracy/core/build-chat'

export interface RevisionNotes {
  /** The note of this plan revision (`<plan id>:<revision>`), or null when there is none or it was dismissed. */
  read(key: string): RevisionNote | null
  /** Keeps the note of a plan revision; the same revision again changes nothing. */
  put(key: string, note: RevisionNote): void
  /** Hides the note of a plan revision for good. */
  dismiss(key: string): void
  subscribe(listener: () => void): () => void
}

/** Whether a note has anything to say. */
export const hasNote = (note: RevisionNote | null): note is RevisionNote =>
  note !== null && (note.changed.length > 0 || note.notDone.length > 0)

export function createRevisionNotes(): RevisionNotes {
  const notes = new Map<string, RevisionNote>()
  const dismissed = new Set<string>()
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  return {
    read: (key) => (dismissed.has(key) ? null : (notes.get(key) ?? null)),
    put(key, note) {
      if (notes.has(key)) return
      notes.set(key, note)
      notify()
    },
    dismiss(key) {
      if (dismissed.has(key)) return
      dismissed.add(key)
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
