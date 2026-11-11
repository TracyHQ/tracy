/**
 * The seller's own edits of the Profile (#524, `PUT …/:id/profile`): the text facts a seller may correct, whether one
 * is already their edit (`profile.editedBySeller`), and the body a save sends. Emptying a field undoes the edit, so the
 * researched value shows again. The name, hours, rating and reading have their own rows.
 */
type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : {})

export const EDITABLE_PROFILE_FIELDS = ['phone', 'address', 'bio'] as const
export type EditableProfileField = (typeof EDITABLE_PROFILE_FIELDS)[number]
const EDITABLE = new Set<string>(EDITABLE_PROFILE_FIELDS)

export interface ProfileEditView {
  value: string
  /** The value shown is the seller's own edit. */
  edited: boolean
}

/** The edit control of one Profile row, or null when the row is not editable here. */
export function profileEditView(profile: unknown, field: string): ProfileEditView | null {
  if (!EDITABLE.has(field)) return null
  const p = rec(profile)
  const value = typeof p[field] === 'string' ? (p[field] as string) : ''
  const edited = Array.isArray(p.editedBySeller) && p.editedBySeller.includes(field)
  return { value, edited }
}

/** What a save sends: the new words, null to undo, or null when nothing changed. */
export function profileEditBody(
  field: EditableProfileField | string,
  typed: string,
  shown: string
): { edits: Record<string, string | null> } | null {
  const value = typed.trim()
  if (value === shown.trim()) return null
  return { edits: { [field]: value === '' ? null : value } }
}

/**
 * The opening hours a seller typed in the Business brief table: one line per day (or `;` between days), blank lines
 * dropped. Empty = nothing to save.
 */
export function typedHours(typed: string): string[] {
  return typed
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
}
