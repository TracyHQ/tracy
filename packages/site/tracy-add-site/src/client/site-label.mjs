/**
 * The name a person may give a site born ON the fleet — `<label>.tracy.ai`.
 *
 * 🔒 PLAIN JAVASCRIPT, NOT TYPESCRIPT, AND THAT IS A DECISION.
 * This rule will have two copies: this one (answering instantly while people type) and the one in
 * `workers/seat-registry` (the real gate, which cannot be argued with). In `tracy-desk` the two copies were kept
 * in sync by an `@shared` folder both imported; TCH has no such folder — the Worker deploys
 * independently and cannot reach `packages/`. Writing it in JS from the start turns the copy into the Worker into
 * a VERBATIM copy instead of a translation, and a translation is a chance for the two to drift.
 *
 * The Worker copy, when it exists, must carry a comment pointing back to this file, and
 * `packages/site/tracy-add-site/test/site-label.test.mjs` must run against BOTH.
 *
 * ## The shape, and why each piece is there
 *
 * A DNS label holds `a–z`, `0–9`, `-`, at most 63 characters, not starting or ending with a hyphen
 * (RFC 1035 §2.3.1, RFC 1123 §2.1). Two more rules are Tracy's:
 *
 * - **No `--` at positions 3–4.** RFC 5891 §4.2.3.1 reserves that shape for IDN (`xn--`), and Cloudflare
 *   refuses to create such a record. Measured on a real customer site on 2026-08-10 — it failed at the DNS step,
 *   AFTER the whole export had finished.
 * - **No ending in `-` plus eight hex digits.** Every imported site's label is built as
 *   `<readable>-<8 hex of SHA-256>`, so refusing exactly that tail keeps a name people
 *   make up themselves from ever landing on an imported site's address. This is why the old rule
 *   banned hyphens entirely; banning exactly the collision costs one regex and gives people back
 *   an ordinary hyphenated name.
 *
 * The function **does not normalise**. `siteLabelRefusal('Bakery')` returns `'shape'`, it does not silently lowercase:
 * a function that both checks and fixes would accept one name and send another. The caller does
 * `name.trim().toLowerCase()` first, just like `CreateSiteForm.tsx`.
 */

/** 6–30 characters, hyphens allowed in the middle, and never the IDN shape. */
export const SITE_LABEL_RE = /^(?!.{2}--)[a-z0-9](?:[a-z0-9-]{4,28})[a-z0-9]$/

/** The tail every imported site's label carries (`fleetLabel`) — hence the one shape a chosen name may not have. */
const HASH_SUFFIX_RE = /-[0-9a-f]{8}$/

/**
 * Names the zone itself needs. A customer site answering at `api.tracy.ai` is not a naming
 * matter — it is a site standing exactly where people expect an internal door.
 */
export const RESERVED_LABELS = new Set([
  'admin',
  'api',
  'assets',
  'auth',
  'blog',
  'cdn',
  'dashboard',
  'docs',
  'files',
  'ingress',
  'login',
  'mail',
  'media',
  'preview',
  'registry',
  'relay',
  'seats',
  'static',
  'status',
  'support',
  'tracy',
  'update',
  'webhook',
  'webmail',
  'www'
])

/**
 * Why this name cannot be used, or `null` when it can.
 *
 * The check order is part of the contract, not an implementation detail: `shape` first, so `api`
 * (three characters) reads as "too short" rather than "reserved". Changing the order changes the sentence the user
 * reads.
 *
 * `taken` — the fourth refusal — is NOT here: only the server knows which addresses are in use.
 * @param {string} label The normalised name (lowercase, no stray whitespace).
 * @returns {'shape' | 'reserved' | 'looks_imported' | null}
 */
export function siteLabelRefusal(label) {
  if (!SITE_LABEL_RE.test(label)) return 'shape'
  if (RESERVED_LABELS.has(label)) return 'reserved'
  if (HASH_SUFFIX_RE.test(label)) return 'looks_imported'
  return null
}

/**
 * Whether this name can be used — by the three rules computed in place.
 * @param {string} label The normalised name.
 * @returns {boolean}
 */
export function isSiteLabel(label) {
  return siteLabelRefusal(label) === null
}
