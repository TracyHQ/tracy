/**
 * What the customer answered, carried across the sign-in window (tasks/todo-build-new-site.md §Public
 * customer) and across the retries of one press, and the fleet label their business name becomes.
 *
 * WHY BROWSER STORAGE. Creating a site needs a seat, so a visitor who answered the form while signed
 * out has to sign in first — and signing in means a real window (Google refuses to render inside a
 * frame) and a reload afterwards. A reload loses everything the form holds in memory. It does NOT
 * go in the URL: the answers are the customer's own words (their name, what they do, how to reach
 * them), and a query string is copied, logged and shared.
 *
 * 🔒 `sessionStorage`, NOT `localStorage` (13/09, plan first-site-build-onboarding §3). The slot
 * only has to survive a reload of the SAME tab — the sign-in window is another window, and the tab
 * that pressed is the one that reloads. `localStorage` is shared by every tab on the origin and by
 * every account that signs in on this browser: two tabs creating two sites read each other's
 * answers, and B signing in after A found A's business name in the box. Per-tab storage closes the
 * first; the `email` stamp below closes the second — a carry is read back only for the account
 * that wrote it.
 *
 * `buildId` is the press's own identity: one logical build, however many times the request is
 * retried. `POST /api/sites` treats a second request with the same id as the first one asked
 * again, never as a second site.
 *
 * The slot is read repeatedly and cleared once — a reload must not consume it, and the build clears
 * it only when the site exists.
 */

/** The one slot. Named for the plugin so a second feature cannot collide with it. */
export const carryKey = 'tracy-site-build:carry'

/**
 * @typedef {object} Carry
 * @property {string} id the inspiration
 * @property {string} platform
 * @property {Record<string, unknown>} answers
 * @property {string} [email] the account that wrote it — a carry is only read back by the same one
 * @property {string} [buildId] the press's logical build id, kept so a retry is the same build
 * @property {number} [pressedAt] when the customer pressed BUILD (not claim), in ms. Its presence is
 *   what tells a resumed page "this press was interrupted" apart from "this site is claimed and
 *   still waiting for its answers" — see `BuildForm`'s resume effect.
 * @property {string} [siteKey] the site claimed by the name — set once `POST /api/sites/claim`
 *   answered, so the form continues IN that site's own workspace (`todo-claim-then-workspace.md`)
 * @property {string} [label] the fleet label of that site
 * @property {string} [name] what to call the inspiration on screen — the id is not a name
 * @property {string} [jobId] the provision job the press started, written the moment the create door
 *   answers — what a resumed page polls until the site is handed over, before it asks for the build
 *   (`new-site.mjs: waitForProvision`).
 * @property {string} [brandFrom] for a brand press: the site whose `Brand/<host>/` the brand was
 *   extracted in — written where the press began, read in the new site's workspace, where the page
 *   no longer knows it; the create door checks the seat and the host copies the folder.
 */

/**
 * @param {{ getItem: (k: string) => string | null, setItem: (k: string, v: string) => void, removeItem: (k: string) => void }} [storage]
 * @param {{ email?: string | null, platform?: string | null }} [who] - who is asking. `email` is the
 *   signed-in account: a carry stamped for another one is dropped and read as none (B never
 *   continues A's form). `platform` is the CMS the caller builds: a carry written for another CMS
 *   is read as none, and LEFT WHERE IT IS — it belongs to that CMS's form, not to this one.
 * @returns {Carry | null} null when the slot is empty, unreadable, not a carry, somebody else's, or
 *   another CMS's.
 */
export function readCarry(storage = globalThis.sessionStorage, who = undefined) {
  let raw = null
  try {
    raw = storage?.getItem(carryKey) ?? null
  } catch {
    // A private window, or site data blocked: no carry, not a crash.
    return null
  }
  if (raw === null) return null
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const { id, platform, answers, email, buildId, siteKey, label, name, pressedAt, jobId, brandFrom } =
    /** @type {Record<string, unknown>} */ (parsed)
  if (typeof id !== 'string' || id === '') return null
  if (typeof platform !== 'string' || platform === '') return null
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null
  const stamped = typeof email === 'string' && email !== '' ? email.toLowerCase() : undefined
  if (
    who !== undefined &&
    typeof who.email === 'string' &&
    stamped !== undefined &&
    stamped !== who.email.toLowerCase()
  ) {
    // Another account's answers. Dropped, not merely ignored: the slot would otherwise keep
    // offering them to every account that signs in on this tab after.
    try {
      storage?.removeItem(carryKey)
    } catch {
      // Nothing to do; the read already answers null.
    }
    return null
  }
  // 🔒 ONE CARRY PER CMS — A BUILD ID IS NOT SHARED ACROSS PLATFORMS.
  //
  // The carry keeps `buildId` so a retry is the same build. `site_creation` is keyed by
  // (account, buildId) and the claim compares a `payload_hash` that INCLUDES the platform — so one
  // buildId reused under a second CMS is not a retry, it is a different request under an old name,
  // and the door answers `IDEMPOTENCY_CONFLICT` (`sites/route.js`).
  //
  // Measured 21/09/2026: a customer built `tracy-business` with Joomla, then picked the SAME
  // inspiration with WordPress. `BuildForm` adopted the carry because the INSPIRATION matched —
  // it never looked at the platform — restored the Joomla buildId, and the claim was refused:
  // "The site could not be started: IDEMPOTENCY_CONFLICT". Two CMSes from one design inspiration
  // is an ordinary thing to want, and it could not be done at all.
  //
  // ⚠ NOT DROPPED, unlike another account's. A carry for another CMS is not stale and not
  // somebody else's — it is the other Build tab's live work, and all three plugins run in one
  // page. `client.tsx` learned the same lesson on 15/09 (a claim opening three Build tabs) and
  // guards there; keeping the check here is what stops the next caller from having to remember.
  if (
    who !== undefined &&
    typeof who.platform === 'string' &&
    who.platform !== '' &&
    platform !== who.platform
  )
    return null
  return {
    id,
    platform,
    answers: /** @type {Record<string, unknown>} */ (answers),
    ...(stamped !== undefined ? { email: stamped } : {}),
    ...(typeof buildId === 'string' && buildId !== '' ? { buildId } : {}),
    ...(typeof siteKey === 'string' && siteKey !== '' ? { siteKey } : {}),
    ...(typeof label === 'string' && label !== '' ? { label } : {}),
    ...(typeof name === 'string' && name !== '' ? { name } : {}),
    ...(Number.isFinite(pressedAt) ? { pressedAt: /** @type {number} */ (pressedAt) } : {}),
    ...(typeof jobId === 'string' && jobId !== '' ? { jobId } : {}),
    ...(typeof brandFrom === 'string' && brandFrom !== '' ? { brandFrom } : {})
  }
}

/**
 * Write the carry, or clear it with `null`.
 * @param {Carry | null} carry
 * @param {{ getItem: (k: string) => string | null, setItem: (k: string, v: string) => void, removeItem: (k: string) => void }} [storage]
 */
export function writeCarry(carry, storage = globalThis.sessionStorage) {
  try {
    if (carry === null) storage?.removeItem(carryKey)
    else storage?.setItem(carryKey, JSON.stringify(carry))
  } catch {
    // Losing the carry costs the customer one re-typing; throwing here costs them the press.
  }
}

/** How long a fleet label may be; longer names are cut rather than refused by the fleet. */
const LABEL_MAX = 32
/** Vietnamese and other Latin diacritics fold to ASCII — `Cô Ba` is `coba`, not `c-ba`. */
/** @param {string} text */
function fold(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
}

/**
 * The short name of each CMS in an address nobody typed. The same table as `bornLabel` in
 * `apps/tracy-web/src/lib/born-label.js` — the claim door's copy — held equal by a test here
 * (`test/new-site.test.mjs`): this runs in the browser and cannot import the server's module.
 */
export const PLATFORM_SHORT = { joomla: 'j', wordpress: 'wp', emdash: 'ed' }

/**
 * The fleet label for a new site, from what the customer called their business. `POST /api/sites`
 * takes `label`; the fleet builds the address from it, so it must be a-z, 0-9 and dashes.
 *
 * Nothing usable in the name still yields a label — a press must never fail because someone left the
 * box empty — and two such labels never collide. That label names the CMS (`j-35m9pa`,
 * `wp-35m9pa`, `ed-35m9pa`); a name the customer typed is used as typed.
 *
 * @param {Record<string, unknown>} answers
 * @param {string} [platform] - `joomla` · `wordpress` · `emdash`; anything else keeps `site-`.
 * @returns {string}
 */
export function labelOf(answers, platform) {
  const name = typeof answers?.name === 'string' ? answers.name : ''
  const slug = fold(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LABEL_MAX)
    .replace(/-+$/g, '')
  if (slug !== '') return slug
  const cms = PLATFORM_SHORT[/** @type {keyof typeof PLATFORM_SHORT} */ (platform)] ?? 'site'
  return `${cms}-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`
}
