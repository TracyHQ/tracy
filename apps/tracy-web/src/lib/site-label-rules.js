/**
 * The name a person may pick for a site born on the fleet — a copy of
 * `packages/site/tracy-add-site/src/client/site-label.mjs` (the plugin answers while the person types;
 * this copy is the gate). The two are held together by `scripts/test/site-label-parity.test.mjs` and
 * gate `infra-contracts`. Lives in `lib/` so any domain may use it; `sites/label.js` re-exports it.
 */
export const SITE_LABEL_RE = /^(?!.{2}--)[a-z0-9](?:[a-z0-9-]{4,28})[a-z0-9]$/
const HASH_SUFFIX_RE = /-[0-9a-f]{8}$/
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
 * Why this name cannot be used, or `null` when it can. Order is part of the contract, not an
 * implementation detail: `shape` is checked first, so a too-short reserved word (`api`, three
 * characters) reads as "too short" rather than "already spoken for" — the regex's own minimum
 * length (six characters) means several words in `RESERVED_LABELS` never reach the reserved
 * check at all. `taken` — a fourth refusal — is NOT here: only the site book knows which
 * addresses already have an owner.
 * @param {string} label - already normalized (lower-case, trimmed).
 * @returns {'shape' | 'reserved' | 'looks_imported' | null}
 */
export function siteLabelRefusal(label) {
  if (!SITE_LABEL_RE.test(label)) return 'shape'
  if (RESERVED_LABELS.has(label)) return 'reserved'
  if (HASH_SUFFIX_RE.test(label)) return 'looks_imported'
  return null
}
