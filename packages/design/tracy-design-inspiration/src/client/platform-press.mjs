/**
 * The CMS a "Change design" press from the Add site wizard asks the gallery to filter by (Akemi,
 * 30/09): the wizard opens this tab with `meta: { platform, pressedAt }`, and the gallery ticks that
 * platform's chip. Opening the tab any other way sends no platform, and nothing is preselected.
 *
 * ONE PRESS, ONE PRESELECT. The meta can outlive the press (a remount re-reads it, and a tab with
 * no site keeps the meta as it came), so each press is applied once, by its `pressedAt`: a customer
 * who unticks the chip does not see it come back on the next tab switch — only on the next press.
 *
 * Plain `.mjs`, not `.ts`, so `test/platform-press.test.mjs` imports it — same as `platforms.mjs`.
 */
import { PLATFORMS } from './platforms.mjs'

/** Presses already applied in this page, by key. */
const applied = new Set()

/**
 * The press a tab's meta carries, or null: a platform the filter offers, keyed by its press time.
 * @param {unknown} meta - the tab's `meta`.
 * @returns {{ platform: string, key: string } | null}
 */
export function platformPressOf(meta) {
  if (meta === null || typeof meta !== 'object') return null
  const { platform, pressedAt } = /** @type {{ platform?: unknown, pressedAt?: unknown }} */ (meta)
  if (typeof platform !== 'string' || !PLATFORMS.some((p) => p.id === platform)) return null
  return { platform, key: `${String(pressedAt ?? '')}:${platform}` }
}

/**
 * Claim a press: true the first time its key is seen in this page, false after.
 * @param {string} key - `platformPressOf(...).key`.
 * @param {Set<string>} [seen] - the record of applied presses; the page's own by default.
 * @returns {boolean}
 */
export function claimPress(key, seen = applied) {
  if (seen.has(key)) return false
  seen.add(key)
  return true
}

/**
 * The selection with the pressed platform as its only CMS chip; categories and brands are kept.
 * @template {{ platforms: ReadonlySet<string> }} S
 * @param {S} selection
 * @param {string} platform
 * @returns {S}
 */
export function withPlatformChip(selection, platform) {
  return { ...selection, platforms: new Set([platform]) }
}
