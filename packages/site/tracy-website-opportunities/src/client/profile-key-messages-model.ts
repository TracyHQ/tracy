/**
 * The "Key messages" block of the Details Profile card (#1791), from `profile.readingCard.keyMessages` (the server's
 * `readingCardOf`): up to three points the site leads with, each a short label and the verbatim quote or quotes it rests
 * on. The owner edits a label, reorders or deletes; what is saved is the owner's picks (ids removed, ids in order,
 * labels typed). The quotes are shown, never typed here.
 */
type Rec = Record<string, unknown>

export const MAX_KEY_MESSAGES = 3
export const MAX_LABEL_LENGTH = 60

export interface KeyMessageView {
  id: string
  label: string
  /** Verbatim quotes the point rests on. */
  quotes: string[]
  /** The label is the owner's (it differs from the one the reading proposed). */
  edited: boolean
}

/** The owner's picks as the server keeps them (`candidate.keyMessagePicks`). */
export interface KeyMessagePicks {
  removed: string[]
  order: string[]
  labels: Record<string, string>
}

const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

/** The messages the owner keeps, in order (a removed one is left out). Empty when the reading has none. */
export function keyMessagesView(profile: unknown): KeyMessageView[] {
  const list = rec(rec(profile).readingCard).keyMessages
  if (!Array.isArray(list)) return []
  return list
    .flatMap((item) => {
      const m = rec(item)
      const id = text(m.id)
      const label = text(m.label)
      if (id === null || label === null || m.removed === true) return []
      const quotes = (Array.isArray(m.quotes) ? m.quotes : []).flatMap((q) => {
        const body = text(rec(q).quote) ?? text(rec(q).text)
        return body === null ? [] : [body]
      })
      return [{ id, label, quotes, edited: m.edited === true }]
    })
    .slice(0, MAX_KEY_MESSAGES)
}

/** The list with item `from` moved to `to`; unchanged when either index is outside the list. */
export function moveMessage(list: KeyMessageView[], from: number, to: number): KeyMessageView[] {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

export const removeMessage = (list: KeyMessageView[], at: number): KeyMessageView[] =>
  list.filter((_, i) => i !== at)

/** A label with its edit applied: spaces folded, trimmed and cut to the limit; null when the edit leaves nothing. */
export function cleanLabel(raw: string): string | null {
  const label = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH)
  return label === '' ? null : label
}

export const withLabel = (list: KeyMessageView[], at: number, raw: string): KeyMessageView[] => {
  const label = cleanLabel(raw)
  return label === null ? list : list.map((m, i) => (i === at ? { ...m, label } : m))
}

/** The ids the owner already took off, from the reading card (the view leaves them out). */
export function removedKeyMessageIds(profile: unknown): string[] {
  const list = rec(rec(profile).readingCard).keyMessages
  if (!Array.isArray(list)) return []
  return list.flatMap((item) => {
    const m = rec(item)
    const id = text(m.id)
    return id !== null && m.removed === true ? [id] : []
  })
}

/**
 * What saving sends: every id the owner deleted so far (`stored` are the ones deleted before, `before` minus `draft`
 * the ones deleted now), the ids that remain in the owner's order, and the label of every kept message that is the
 * owner's: one already edited (it differs from the reading's) or retyped now. The server merges a save into what it
 * holds, so carrying the earlier edits keeps a later save from undoing them.
 */
export function keyMessagePicksOf(
  before: KeyMessageView[],
  draft: KeyMessageView[],
  stored: string[] = []
): KeyMessagePicks {
  const kept = new Set(draft.map((m) => m.id))
  const labels: Record<string, string> = {}
  for (const m of draft) {
    const was = before.find((b) => b.id === m.id)
    if (was?.edited === true || was?.label !== m.label) labels[m.id] = m.label
  }
  return {
    removed: [...new Set([...stored, ...before.filter((m) => !kept.has(m.id)).map((m) => m.id)])],
    order: draft.map((m) => m.id),
    labels
  }
}
