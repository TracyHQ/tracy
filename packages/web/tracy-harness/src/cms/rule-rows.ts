/**
 * The rows of one rule group on the Road to live (Design system), with the rules that wait for the
 * same measurement folded into ONE row (U1 of PR 2, 14/10/2026): a preview not measured, or measured
 * without its stylesheets, held 21 preview rules as must-fix, each row repeating the same line, the same
 * reason and the same long fix. Folded, the row names the rules once and says the reason and the fix once.
 */
import type { CustomizeRule } from './problem-guides'

/** One row: a rule alone, or several rules that share their line, their reason and their fix. */
export type RuleRow =
  | { kind: 'one'; rule: CustomizeRule }
  | {
      kind: 'folded'
      rules: CustomizeRule[]
      text: string
      question: string
      reason: string
      fix: string | null
    }

/** How many characters of a reason must match before two messages count as saying the same thing. */
const PROBE = 40

/**
 * The words after the rule's own title that every message of the group says ("Title: that run
 * could not read it (…)"), or null when they differ. Titles may hold a colon (PREV-1), so every
 * ": " of the first message is tried. The server clips each message to a length that depends on its
 * title (Tracy Business WordPress 1.3.6, 15/10/2026: 28 rows, each cut at a different word), so the
 * reason is the part every message shares, cut at a word and ended with "…" when one was longer.
 */
function sharedReason(rules: CustomizeRule[]): string | null {
  // the stamp and the how that follow it are cut to a length, so they differ by title: read before them
  const said = (r: CustomizeRule) =>
    r.message
      .replace(/\s*Measured on .*$/, '')
      .replace(/…$/, '')
      .trim()
  const first = said(rules[0])
  for (let at = first.indexOf(': '); at !== -1; at = first.indexOf(': ', at + 2)) {
    const probe = first.slice(at + 2, at + 2 + PROBE)
    if (!probe) continue
    const tails: string[] = []
    for (const r of rules) {
      const m = said(r)
      const i = m.indexOf(`: ${probe}`)
      if (i === -1) break
      tails.push(m.slice(i + 2))
    }
    if (tails.length !== rules.length) continue
    let n = Math.min(...tails.map((t) => t.length))
    for (let i = 0; i < n; i += 1)
      if (tails.some((t) => t[i] !== tails[0][i])) {
        n = i
        break
      }
    const whole = tails.every((t) => t.length === n)
    let tail = tails[0].slice(0, n)
    if (!whole) tail = `${tail.slice(0, tail.lastIndexOf(' ')).replace(/[\s,;(]+$/, '')}…`
    // said once for several rules: a sentence of its own, about these rules
    return (tail.charAt(0).toUpperCase() + tail.slice(1)).replace(/\bthis rule\b/, 'these rules')
  }
  return null
}

/** Rules that wait for a measurement fold when two or more share their line, their fix and their reason. */
export function ruleRows(rules: CustomizeRule[], waiting: boolean): RuleRow[] {
  const keyOf = (r: CustomizeRule) =>
    waiting || r.unmeasured ? `${r.question}\n${r.text}\n${r.fix ?? ''}` : null
  const byKey = new Map<string, CustomizeRule[]>()
  for (const r of rules) {
    const key = keyOf(r)
    if (key !== null) byKey.set(key, [...(byKey.get(key) ?? []), r])
  }
  const rows: RuleRow[] = []
  const done = new Set<string>()
  for (const r of rules) {
    const key = keyOf(r)
    const same = key === null ? [] : (byKey.get(key) ?? [])
    const reason = same.length > 1 ? sharedReason(same) : null
    if (key === null || reason === null) {
      rows.push({ kind: 'one', rule: r })
      continue
    }
    if (done.has(key)) continue
    done.add(key)
    rows.push({ kind: 'folded', rules: same, text: r.text, question: r.question, reason, fix: r.fix })
  }
  return rows
}
