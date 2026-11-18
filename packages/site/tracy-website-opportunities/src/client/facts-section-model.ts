/**
 * The section level of the Business facts sub-page (#537, layout B): the one source a section names in its header
 * ("From Google", "From Instagram", "From your website"), whether a row's own chip repeats it (then the row draws no
 * chip), and the opening hours read as one row when every day has the same hours. Pure.
 */
import { SOCIAL_LABEL } from './cms-label.ts'
import { type SourceChipView, normalSource } from './source-chip-model.ts'

type T = (key: string, params?: Record<string, unknown>) => string

/** The platform a chip stands for, or null for the owner's own value, Not found, or no named source. */
const platformOf = (chip: SourceChipView | null): string | null =>
  chip === null || chip.word === 'you' || chip.word === 'none' || chip.source === null
    ? null
    : normalSource(chip.source) === 'google-maps'
      ? 'google-places'
      : normalSource(chip.source)

/** The section's source: the platform most of its rows come from (the first on a tie); null when none is named. */
export function mainChip(chips: readonly (SourceChipView | null)[]): SourceChipView | null {
  const counts = new Map<string, { chip: SourceChipView; n: number }>()
  for (const chip of chips) {
    const key = platformOf(chip)
    if (key === null || chip === null) continue
    const hit = counts.get(key)
    if (hit === undefined) counts.set(key, { chip, n: 1 })
    else hit.n += 1
  }
  let best: { chip: SourceChipView; n: number } | null = null
  for (const c of counts.values()) if (best === null || c.n > best.n) best = c
  return best?.chip ?? null
}

/** A row's chip names the same platform as its section: the row draws no chip of its own. */
export function sameSource(chip: SourceChipView | null, section: SourceChipView | null): boolean {
  const a = platformOf(chip)
  return a !== null && a === platformOf(section)
}

/** "From Google", "From Instagram", "From your website": the words of a section's source. */
export function fromLabel(t: T, chip: SourceChipView): string {
  const p = platformOf(chip)
  if (p === null) return t(chip.word === 'you' ? 'facts.from.you' : 'facts.from.website')
  if (p === 'google-places') return t('facts.from', { source: t('chip.word.google') })
  const name = SOCIAL_LABEL[p]
  return name === undefined ? t('facts.from.website') : t('facts.from', { source: name })
}

/** One line of opening hours split at its first ": " (the days, then the times). */
const partsOf = (line: string): { days: string; times: string } => {
  const at = line.indexOf(': ')
  return at <= 0 ? { days: '', times: line } : { days: line.slice(0, at), times: line.slice(at + 2) }
}

/**
 * The hours as rows: one row "Monday to Sunday: Open 24 hours" when two or more lines name days and every one has the
 * same times; otherwise every line, as it was. `range` joins the first and the last days in the interface language.
 */
export function collapseHours(
  lines: readonly string[],
  range: (from: string, to: string) => string
): string[] {
  const parts = lines.map(partsOf)
  const first = parts[0]
  const last = parts[parts.length - 1]
  if (first === undefined || last === undefined || parts.length < 2) return [...lines]
  if (parts.some((p) => p.days === '' || p.times.trim().toLowerCase() !== first.times.trim().toLowerCase()))
    return [...lines]
  return [`${range(first.days, last.days)}: ${first.times}`]
}
