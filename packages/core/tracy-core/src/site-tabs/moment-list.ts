/**
 * The pure half of a Site changes row's times and of one moment's files (`MomentFiles`): the short
 * "4 min ago" at the right of a row, the words a row needs about time, and how a moment's files are
 * grouped and folded. No React and no runtime imports, so `test/moment-list.test.mjs` loads this file
 * straight through Node's type stripping.
 */

/** The words a row needs about time: "4 min ago" and the absolute moment a hover reads. */
export interface TimeWords {
  ago: (iso: string) => string
  absolute: (iso: string) => string
}

/** The words for a short age, so this file stays free of any translation runtime. */
export interface ShortAgoWords {
  justNow: string
  minutes: (count: number) => string
  hours: (count: number) => string
  days: (count: number) => string
}

/** "4 min ago", "1h ago", "3d ago" — the short time at the right of a row. */
export function shortAgo(at: number, now: number, words: ShortAgoWords): string {
  const minutes = Math.max(0, Math.floor((now - at * 1000) / 60000))
  if (minutes < 1) return words.justNow
  if (minutes < 60) return words.minutes(minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return words.hours(hours)
  return words.days(Math.floor(hours / 24))
}

/**
 * One moment's files by zone, when the host's answer carries zones (`zone` on each file); one
 * group with no heading when it does not — a zone nobody measured is not drawn as a guess.
 */
export function fileGroups<F extends { path: string; zone?: string }>(
  files: readonly F[],
  order: readonly string[]
): { zone: string | null; files: F[] }[] {
  if (!files.some((f) => typeof f.zone === 'string'))
    return files.length ? [{ zone: null, files: [...files] }] : []
  const groups = new Map<string, F[]>()
  for (const f of files) {
    const zone = f.zone ?? 'other'
    groups.set(zone, [...(groups.get(zone) ?? []), f])
  }
  const zones = [
    ...order.filter((z) => groups.has(z)),
    ...[...groups.keys()].filter((z) => z !== 'other' && !order.includes(z)),
    ...(groups.has('other') ? ['other'] : [])
  ]
  return zones.map((zone) => ({ zone, files: groups.get(zone) ?? [] }))
}

/**
 * One moment's files, minus those the host flags `excluded`: a CMS cache or a Tracy working file
 * that rode into a moment made before the exclude list named it (Q4, scjo1002 c0a061d4: two T4
 * optimizer files beside the real edit). The tab draws them as one quiet count, never as files
 * Tracy changed. A host older than Q4 flags nothing, and every file is shown as before.
 */
export function splitExcluded<F extends { excluded?: boolean }>(
  files: readonly F[]
): { shown: F[]; excluded: number } {
  const shown = files.filter((f) => f.excluded !== true)
  return { shown, excluded: files.length - shown.length }
}
