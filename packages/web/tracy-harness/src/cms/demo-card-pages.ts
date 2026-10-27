/**
 * The pure rules of the Listing section's Pages list (Templates page, Akemi 10/10/2026): a page's key
 * from its path, what is wrong with a row before Save listing would send it, reordering, removing,
 * and putting the pictures one page's shoot brought back onto that page only.
 *
 * No React here (words via `tr`), so `test/demo-card-pages.test.mjs` pins every rule without a screen.
 */

import { tr } from '../i18n'

/** One page of a card, as far as these rules read it (`Layout` in DesignInspiration.tsx). */
export interface PageLike {
  key: string
  label: string
  path: string
  shots?: { desktop?: string; mobile?: string }
}

/** The store's key shape (`SLUG` in tracy-setting.mjs): the key names the picture file. */
const KEY = /^[a-z0-9][a-z0-9-]*$/

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * A page's key from its path, the server's own rule (`layoutKey` in card-draft.js): `/` is
 * `home`, `/company/about` is `company-about`; a path that slugs to nothing gives `page`.
 */
export function keyFromPath(path: string): string {
  const p = normalPath(path)
  if (p === '/') return 'home'
  const fromPath = slug(p).slice(0, 40).replace(/-+$/, '')
  return KEY.test(fromPath) ? fromPath : 'page'
}

/** `base`, or `base-2`, `base-3`… : the first one no other page of the card already wears. */
export function uniqueKey(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base
  for (let n = 2; ; n += 1) {
    const next = `${base}-${String(n)}`
    if (!taken.includes(next)) return next
  }
}

/** A path as it is compared: trimmed, and without a trailing slash except the root's own. */
export function normalPath(path: string): string {
  const p = path.trim()
  return p.length > 1 ? p.replace(/\/+$/, '') || '/' : p
}

/** Whether this page is the home page, whose picture the card wears (`homeShot`). */
export const isHome = (l: PageLike) => normalPath(l.path) === '/'

/**
 * What is wrong with each row's PATH, in the order of the rows: null when nothing is. An empty
 * path, one not starting with "/" (the capture and the validator both refuse it), and one another
 * page already uses (two tabs on one page).
 */
export function pathProblems(layouts: readonly PageLike[]): (string | null)[] {
  const paths = layouts.map((l) => normalPath(l.path))
  return paths.map((p, i) => {
    if (p === '') return tr('cms-demos.pages.noPath')
    if (!p.startsWith('/')) return tr('cms-demos.pages.noSlash')
    if (paths.some((other, j) => j !== i && other === p)) return tr('cms-demos.pages.taken', { path: p })
    return null
  })
}

/**
 * What is wrong with each row, path first (`pathProblems`), then an empty label: the validator
 * refuses a tab with no name.
 */
export function pageProblems(layouts: readonly PageLike[]): (string | null)[] {
  return pathProblems(layouts).map(
    (p, i) => p ?? (layouts[i]?.label.trim() === '' ? tr('cms-demos.pages.noLabel') : null)
  )
}

/** The rows moved: row `i` swapped with its neighbour `delta` away; unchanged at either end. */
export function moveLayout<T>(layouts: readonly T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta
  if (i < 0 || i >= layouts.length || j < 0 || j >= layouts.length) return [...layouts]
  const next = [...layouts]
  const a = next[i] as T
  next[i] = next[j] as T
  next[j] = a
  return next
}

/** The rows without row `i`. */
export function removeLayout<T>(layouts: readonly T[], i: number): T[] {
  return layouts.filter((_, j) => j !== i)
}

/** One picture the capture door stored: which layout, at which width, under which name. */
export interface StoredShot {
  key: string
  width: number
  file: string
}

/** What one page's shoot brought back for `key`: desktop at 1440, mobile at 390, each if any. */
export function shotsFor(stored: readonly StoredShot[], key: string): { desktop?: string; mobile?: string } {
  const at = (width: number) => stored.find((s) => s.key === key && s.width === width)?.file
  const desktop = at(1440)
  const mobile = at(390)
  return { ...(desktop ? { desktop } : {}), ...(mobile ? { mobile } : {}) }
}

/**
 * The rows with what one page's shoot brought back put on THAT page only, found by key (the rows
 * may have been reordered or edited while the shoot ran). A shape the shoot did not bring back
 * keeps the picture the page had; every other page is returned as it was.
 */
export function mergePageShots<T extends PageLike>(
  layouts: readonly T[],
  key: string,
  shots: { desktop?: string; mobile?: string }
): T[] {
  if (!shots.desktop && !shots.mobile) return [...layouts]
  return layouts.map((l) => (l.key === key ? { ...l, shots: { ...l.shots, ...shots } } : l))
}
