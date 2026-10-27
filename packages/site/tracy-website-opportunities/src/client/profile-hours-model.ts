/**
 * The "Opening hours" row of the Details Profile card, from `profile.hoursCheck` (the server's decision,
 * `website-opportunities/domain/hours-check.mjs`): the hours the site shows, and whether a person should check them
 * first. Hours open 24 hours every day, said by one source for a business that rarely is, wait for a check. Nothing
 * is decided here; the row only shows the server's decision.
 */
type Rec = Record<string, unknown>

export interface HoursRowView {
  /** The hours lines to show: the site's, or, while a check waits, what the one source says. */
  hours: string[]
  /** What the source says, for Keep and as the start of an edit (empty when no source states hours). */
  sourceHours: string[]
  /** The person chose to leave the hours off the site. */
  left: boolean
  /** `check` while the hours wait for a person; `checked` once the person kept, typed or left them off. */
  chip: 'check' | 'checked' | null
  /** The source that alone says open 24 hours every day (`google`, `website`, `listing`…), for the note. */
  source: string | null
  /** For a listing site, its name. */
  sourceLabel: string | null
  /** The actions show without a press: the hours still need a check. */
  open: boolean
}

const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const lines = (v: unknown): string[] =>
  Array.isArray(v) ? v.flatMap((s) => (text(s) === null ? [] : [text(s) as string])) : []

/** The row, or null when there are no hours to show or check (none found, or sources that disagree). */
export function hoursRowView(profile: unknown): HoursRowView | null {
  const check = rec(rec(profile).hoursCheck)
  const state = check.state
  const claims = (Array.isArray(check.claims) ? check.claims : []).map(rec)
  const claim = claims.find((c) => lines(c.hours).length > 0) ?? null
  const sourceHours = claim === null ? [] : lines(claim.hours)
  if (state === 'agreed') {
    const hours = lines(check.hours)
    return hours.length
      ? { hours, sourceHours: hours, left: false, chip: null, source: null, sourceLabel: null, open: false }
      : null
  }
  if (state === 'check')
    return {
      hours: sourceHours,
      sourceHours,
      left: false,
      chip: 'check',
      source: claim === null ? null : text(claim.source),
      sourceLabel: claim === null ? null : text(claim.label),
      open: true
    }
  if (state === 'chosen') {
    const left = check.choice === 'leave'
    return {
      hours: left ? [] : lines(check.hours),
      sourceHours,
      left,
      chip: 'checked',
      source: claim === null ? null : text(claim.source),
      sourceLabel: null,
      open: false
    }
  }
  return null
}

/** What the person typed, one line per group of days, blank lines dropped. */
export const typedHours = (draft: string): string[] =>
  draft
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
