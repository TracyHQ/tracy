/**
 * Pure helpers that turn the Design system step's rules into what /ops shows (15/10/2026: "look at
 * it on dev and you see it", the step read as a wall of text on Tracy Business).
 *
 *   - runsOf: the run each source (Built site, Preview…) was measured on, said ONCE above the groups
 *     instead of a "Measured on" line under each of 40 rows.
 *   - seenOnOf: "refero:5fd3b3b4-02ab-…/light 2" becomes { system: "Refero 5fd3b3b4", scheme: "light",
 *     count: 2 }, so no raw UUID reaches the screen.
 *   - countedOf: "<page> <count>" split in two, so the page reads as a path and the count as a number.
 */
import type { CustomizeRule } from './problem-guides'

/** One source's run, shared by every rule of that source. */
export interface DsRun {
  source: string
  stamp: string
}

/**
 * The run of each source whose measured rules all share ONE stamp, in first-seen order. A source
 * whose rules disagree is left out: its rows keep their own stamp (`rowStamp`).
 */
export function runsOf(rules: CustomizeRule[]): DsRun[] {
  const stamps = new Map<string, Set<string>>()
  for (const r of rules) {
    if (!r.measuredOn) continue
    const set = stamps.get(r.question) ?? new Set<string>()
    set.add(r.measuredOn)
    stamps.set(r.question, set)
  }
  // the built site first: it is the run the grade is scored on, the preview runs after it
  const rank = (source: string) => (source === 'Built site' ? 0 : 1)
  return [...stamps]
    .filter(([, set]) => set.size === 1)
    .map(([source, set]) => ({ source, stamp: [...set][0] }))
    .sort((a, b) => rank(a.source) - rank(b.source))
}

/** The stamp a row still says itself: only when its source has no single shared run. */
export function rowStamp(r: CustomizeRule, runs: DsRun[]): string | null {
  if (!r.measuredOn) return null
  return runs.some((x) => x.source === r.question && x.stamp === r.measuredOn) ? null : r.measuredOn
}

/** One "<system>/<scheme> <count>" of a finding, readable. */
export interface SeenOn {
  system: string
  scheme: string | null
  count: number | null
}

const UUID = /^([a-z][a-z0-9-]*):([0-9a-f]{8})-[0-9a-f-]{27,}$/i

/** "refero:5fd3b3b4-…" → "Refero 5fd3b3b4"; "Moxie" stays "Moxie". */
export function systemName(raw: string): string {
  const m = UUID.exec(raw.trim())
  if (!m) return raw.trim()
  const library = m[1].charAt(0).toUpperCase() + m[1].slice(1)
  return `${library} ${m[2]}`
}

/** "Moxie/dark 2" → { system: "Moxie", scheme: "dark", count: 2 }; anything else is kept whole. */
export function seenOnOf(raw: string): SeenOn {
  const m = /^(.*)\/(light|dark)(?:\s+(\d+))?$/.exec(raw.trim())
  if (!m) return { system: systemName(raw), scheme: null, count: null }
  return { system: systemName(m[1]), scheme: m[2], count: m[3] ? Number(m[3]) : null }
}

/** "/index.php/news 1" → { label: "/index.php/news", count: 1 }; a label without a count keeps it all. */
export function countedOf(raw: string): { label: string; count: number | null } {
  const m = /^(.*\S)\s+(\d+)$/.exec(raw.trim())
  return m ? { label: m[1], count: Number(m[2]) } : { label: raw.trim(), count: null }
}

/** The first `n` items and how many more there are. */
export function firstOf<T>(items: T[], n: number): { shown: T[]; more: number } {
  return { shown: items.slice(0, n), more: Math.max(0, items.length - n) }
}

/** A sentence's first letter in upper case (the detectors write "colours written by hand…"). */
export const sentence = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** One system and the schemes it was seen on, with their counts. */
export interface SystemSeen {
  system: string
  /** The raw entries, for the hover title. */
  raw: string[]
  schemes: { scheme: string | null; count: number | null }[]
}

/** The "<system>/<scheme> <count>" entries grouped by system: "Moxie: light ×2, dark ×2". */
export function systemsSeen(on: string[]): SystemSeen[] {
  const by = new Map<string, SystemSeen>()
  for (const raw of on) {
    const s = seenOnOf(raw)
    const row = by.get(s.system) ?? { system: s.system, raw: [], schemes: [] }
    row.raw.push(raw)
    row.schemes.push({ scheme: s.scheme, count: s.count })
    by.set(s.system, row)
  }
  return [...by.values()]
}
