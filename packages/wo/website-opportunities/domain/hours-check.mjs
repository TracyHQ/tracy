// Which opening hours a business's site shows, and when a person should check them first. Pure.
//
// Measured on a business (Harbour Sport Club, 26/10/2026): Google said "Open 24 hours" all seven days for a coach
// who works by appointment. One source saying a business never closes, for a kind of business that rarely does, is
// treated like two sources that disagree: no hours on the site and none as a site check answer, until someone
// confirms them.

import { hoursDisagree, weekOf } from './opening-hours.mjs'

const MAX_LINES = 14
const MAX_LINE = 120
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== ''
const linesOf = (list) => (Array.isArray(list) ? list.filter(nonEmpty).map((s) => s.trim()) : [])

/**
 * @typedef {{ source: string, hours: string[] }} HoursClaim
 * @typedef {{ choice: 'keep' | 'leave' | 'edit', hours?: string[] }} HoursPick
 * @typedef {{
 *   state: 'none' | 'agreed' | 'conflict' | 'check' | 'chosen',
 *   hours: string[],
 *   claims: HoursClaim[],
 *   choice?: 'keep' | 'leave' | 'edit',
 *   allWeek: boolean
 * }} HoursDecision
 *   `hours` is what the site shows (empty: none, and no sample hours when `state` is conflict, check, or a leave).
 *   `allWeek` says the stated hours were open 24 hours every day, which is why a check is asked.
 */

/** Every day of the week stated, and every one open 24 hours. */
export function isOpenAllWeek(lines) {
  const week = weekOf(linesOf(lines))
  return Boolean(week) && week.size === 7 && [...week.values()].every((v) => v === '0-1440')
}

const ALWAYS_OPEN_WORDS = /hospital|pharmac|drugstore|chemist/i

/**
 * A kind of business that is normally open day and night: a hotel or resort (`hospitality`), or a hospital or
 * pharmacy (a health business only when its kind or words say so; a clinic is not one). Gyms are not: their owner is
 * asked.
 * @param {{ trade?: string | null, words?: (string | null | undefined)[] }} kind
 */
export function usuallyOpenAllWeek({ trade = null, words = [] } = {}) {
  if (trade === 'hospitality') return true
  return trade === 'health' && words.some((w) => typeof w === 'string' && ALWAYS_OPEN_WORDS.test(w))
}

/**
 * Hours lines a person typed, or null when one cannot be read (`weekOf`) or there are too many.
 * @param {unknown} list
 */
export function readableHours(list) {
  const lines = linesOf(list)
  if (!lines.length || lines.length > MAX_LINES || lines.some((l) => l.length > MAX_LINE)) return null
  return weekOf(lines) ? lines : null
}

/** The person's choice for the hours, saved on the candidate (`hoursPick`), or null. */
export function hoursPickOf(candidate) {
  const pick = candidate?.hoursPick
  if (pick?.choice === 'keep' || pick?.choice === 'leave') return { choice: pick.choice }
  if (pick?.choice === 'edit') {
    const hours = readableHours(pick.hours)
    return hours ? { choice: 'edit', hours } : null
  }
  return null
}

/** Each source's hours: the profile's per-source lists (or its own list), then Google's. */
export function hoursClaimsOf(profile, googleHours) {
  const bySource =
    profile?.hoursBySource && typeof profile.hoursBySource === 'object' ? profile.hoursBySource : {}
  const claims = Object.entries(bySource)
    .map(([source, list]) => ({ source, hours: linesOf(list) }))
    .filter((c) => c.hours.length)
  const own = linesOf(profile?.hours)
  if (!claims.length && own.length) claims.push({ source: profile.hoursSource ?? 'website', hours: own })
  const google = linesOf(googleHours)
  if (google.length) claims.push({ source: 'google', hours: google })
  return claims
}

/**
 * The hours the site shows.
 * - The person's edit or "leave off" is final; "keep" confirms hours waiting for a check.
 * - Two sources that disagree: none (`conflict`).
 * - Open 24 hours every day said by ONE source, for a business not normally open day and night: none until checked
 *   (`check`). A second source saying the same confirms it.
 * @param {{ profile?: any, googleHours?: string[], trade?: string | null, words?: string[], pick?: HoursPick | null }} input
 * @returns {HoursDecision}
 */
export function decideHours({ profile = {}, googleHours = [], trade = null, words = [], pick = null } = {}) {
  const claims = hoursClaimsOf(profile, googleHours)
  const own = linesOf(profile?.hours)
  const stated = own.length ? own : linesOf(googleHours)
  const allWeek = stated.length > 0 && isOpenAllWeek(stated)
  if (pick?.choice === 'edit' && pick.hours?.length)
    return { state: 'chosen', choice: 'edit', hours: pick.hours, claims, allWeek }
  if (pick?.choice === 'leave') return { state: 'chosen', choice: 'leave', hours: [], claims, allWeek }
  const differ =
    profile?.hoursConflict === true ||
    claims.some((a, i) => claims.slice(i + 1).some((b) => hoursDisagree(a.hours, b.hours)))
  if (differ && claims.length > 1) return { state: 'conflict', hours: [], claims, allWeek }
  if (!stated.length) return { state: 'none', hours: [], claims, allWeek }
  const sayingAllWeek = claims.filter((c) => isOpenAllWeek(c.hours)).length
  if (allWeek && sayingAllWeek < 2 && !usuallyOpenAllWeek({ trade, words }))
    return pick?.choice === 'keep'
      ? { state: 'chosen', choice: 'keep', hours: stated, claims, allWeek }
      : { state: 'check', hours: [], claims, allWeek }
  return { state: 'agreed', hours: stated, claims, allWeek }
}
