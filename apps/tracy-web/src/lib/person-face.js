/**
 * One person's face — the letter, the colour and the picture every surface draws for them.
 *
 * 🔒 THE ONE PLACE THIS RULE LIVES (`tasks/evidence/team-badge-count/contract.md` § 1). The Team
 * roster (`seats/route.js` `rosterRow`, also behind a site's `GET /sites/:key/seats`), the comment
 * doors (`sites/comments.js`: author, resolver, each send) and `GET /auth/me` all answer with it, so
 * the pin on a page, its thread card, the Comments tab and the Team tab show one person the same
 * way. Clients only draw what this returns: no client hashes a colour of its own any more.
 *
 * Pure and shared (`lib/`): `sites/` and `seats/` both import it without importing each other
 * (`test/module-graph.test.mjs`).
 */
import { avatarSource } from './avatar-source.js'

/**
 * The colours a face takes: Tailwind 600/700 fills that carry white text, never terracotta (the
 * primary action colour). The order is part of the rule — a person's colour is an index into it.
 */
export const AUTHOR_COLOURS = Object.freeze([
  '#0284c7',
  '#7c3aed',
  '#059669',
  '#db2777',
  '#4f46e5',
  '#0d9488',
  '#c026d3',
  '#4d7c0f'
])

/**
 * FNV-1a, 32 bits, over the code points of `key` — the hash the sidebar fork used client-side until
 * this helper took the rule over, kept bit for bit so nobody's colour changes with the move.
 * @param {string} key
 * @returns {number} an unsigned 32-bit hash
 */
export function fnv1a32(key) {
  let hash = 0x811c9dc5
  for (const ch of key) {
    hash ^= ch.codePointAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/**
 * The face of one account.
 *
 * - `initial`: the first character (a whole code point) of the display name, else the email, upper
 *   case; `?` when there is neither.
 * - `color`: keyed by the ACCOUNT id, so a person keeps it when renamed. Two people may share one —
 *   there is deliberately no step that moves a namesake to another colour; name and email tell
 *   them apart.
 * - `avatarUrl`: Tracy's own address for the account's picture (`GET /auth/avatar/:accountId`,
 *   `identity/avatar.js`), or null when the account holds none. The stored value is the provider
 *   address the last Google/GitHub sign-in handed over; it never leaves the server, so no page asks
 *   a third party for it and `img-src 'self'` holds. `?v=` changes with the stored address, so a
 *   browser holding the old picture asks again when the person changed theirs.
 *
 * @param {{ id: string, email?: string | null, display_name?: string | null, avatar_url?: string | null }} account
 * @returns {{ initial: string, color: string, avatarUrl: string | null }}
 */
export function personFace({ id, email, display_name, avatar_url }) {
  const label = (display_name || email || '?').trim() || '?'
  const [first] = label
  return {
    initial: first.toUpperCase(),
    color: AUTHOR_COLOURS[fnv1a32(`account:${id}`) % AUTHOR_COLOURS.length],
    avatarUrl: avatarPath(id, avatar_url)
  }
}

/**
 * The same-origin address of an account's picture, or null when the stored source is none Tracy
 * fetches from (`lib/avatar-source.js`).
 * @param {string} id - the account id
 * @param {string | null | undefined} stored - `account.avatar_url`
 * @returns {string | null}
 */
export function avatarPath(id, stored) {
  const source = avatarSource(stored)
  if (!source || !id) return null
  const version = fnv1a32(source).toString(16).padStart(8, '0')
  return `/auth/avatar/${encodeURIComponent(id)}?v=${version}`
}
