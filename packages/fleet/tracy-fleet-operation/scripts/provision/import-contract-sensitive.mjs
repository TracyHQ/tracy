/**
 * Which slot values an imported copy's documents must not show.
 *
 * The Claude Cowork plugin derives its map from the copy's own database. Until it has rendered the pages to
 * see which words are visible, it keeps EVERY string leaf of the module and option params, so a password,
 * an API key or a webhook address that the customer typed into a setting is a slot like any heading. The
 * documents land in a folder the agent reads (and the model that drives it), so such a value is withheld:
 * the slot keeps its key and stays writable through the plugin, but no file carries what it holds.
 *
 * Two independent signals, either one withholds:
 *   - the NAME of the setting (the slot's column, its leaf path or its key): `smtp_password`, `apiKey`...
 *   - the SHAPE of the value, for the settings that are named innocently: a Google or Stripe key, a JWT, a
 *     webhook address, a URL that carries a token, an opaque token.
 *
 * ⚠ BIASED TOWARDS WITHHOLDING, on purpose. A leaked key is a silent, lasting harm; a withheld heading costs
 * the agent one `content.read` to find the slot. What must never be withheld is what the agent is asked to
 * change: words, e-mails, phone numbers, ordinary links, picture paths, colours. `import-contract-sensitive
 * .test.mjs` pins both sides.
 */

/** A setting NAME that holds a credential or a private value, whatever its value looks like. */
const NAME =
  /secret|passw(?:or)?d|token|api[_-]?key|apikey|private|credential|salt|webhook|licen[sc]e[_-]?key|smtp|recaptcha|captcha|client[_-]?secret|access[_-]?key|signature|bearer/i

/** `pass` and `pwd` as a word of their own (`db_pass`), never inside `passport` or `bypass`. */
const NAME_WORD = /(?:^|[^a-z])(?:pass|pwd)(?:$|[^a-z])/i

/** Shapes that give a value away wherever it sits. Each is anchored on its own prefix, never on a length. */
const SHAPES = [
  // Google API key
  /(?<![0-9A-Za-z])AIza[0-9A-Za-z_-]{30,}/,
  // Stripe secret, publishable and restricted keys
  /(?<![0-9A-Za-z])(?:sk|pk|rk)_(?:live|test)_[0-9A-Za-z]{10,}/,
  // AWS access key id
  /(?<![0-9A-Za-z])(?:AKIA|ASIA)[0-9A-Z]{16}(?![0-9A-Za-z])/,
  // JWT: three base64url parts, the first two opening with the encoded `{"`
  /(?<![0-9A-Za-z])eyJ[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}/,
  // Slack and GitHub tokens
  /(?<![0-9A-Za-z])xox[abprs]-[0-9A-Za-z-]{10,}/,
  /(?<![0-9A-Za-z])gh[pousr]_[0-9A-Za-z]{30,}/,
  /(?<![0-9A-Za-z])github_pat_[0-9A-Za-z_]{40,}/,
  // Slack and Discord webhook addresses: the address IS the credential
  /hooks\.slack\.com\/services\/[0-9A-Za-z/_-]{10,}/i,
  /discord(?:app)?\.com\/api\/webhooks\/\d+\/[0-9A-Za-z_-]{20,}/i,
  // A private key block
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // An Authorization header value
  /^(?:bearer|basic)\s+[0-9A-Za-z._~+/=-]{16,}$/i,
  // A URL that carries `user:password@`. The scheme is bounded so a long run of letters cannot make the
  // scan quadratic.
  /(?<![a-z0-9+.-])[a-z][a-z0-9+.-]{1,20}:\/\/[^\s/:@]+:[^\s/@]+@/i,
  // A URL that carries a secret-looking query parameter
  /[?&;#](?:api[_-]?key|apikey|key|token|access[_-]?token|auth[_-]?token|secret|client[_-]?secret|password|passwd|pwd|sig|signature)=[^&#\s]{6,}/i
]

/** A value that is nothing but hex, 32 characters or more (an MD5, a SHA, a Mailchimp key `…-us12`). */
const HEX = /^[0-9a-fA-F]{32,}(?:-[a-z]{2}\d{1,2})?$/

/**
 * The characters of an opaque token. No `/`, `.` or `:`, so a link, a path or an e-mail address is never one:
 * those are ordinary content and are judged by the shapes above only.
 */
const OPAQUE = /^[0-9A-Za-z_+=-]{24,}$/

/** How much of a value is read. A secret is short; the cap keeps a 20 kB paragraph cheap. */
const SCAN = 4096

/**
 * An opaque token: no whitespace, 24 characters or more, letters and digits mixed. A name made of words and
 * short numbers (`Summer-Sale-2024-Collection-Page`) is not one.
 * @param {string} value
 */
function opaqueToken(value) {
  if (!OPAQUE.test(value) || !/[A-Za-z]/.test(value) || !/\d/.test(value)) return false
  const parts = value.split(/[-_]/).filter(Boolean)
  return !(parts.length > 1 && parts.every((part) => /^(?:[A-Za-z]{2,}|\d{1,4})$/.test(part)))
}

/**
 * Whether a setting NAME says its value is a credential.
 * @param {unknown} name a column, a leaf path (`key:smtp_password|text:`) or a slot key
 */
export function isSensitiveName(name) {
  return typeof name === 'string' && (NAME.test(name) || NAME_WORD.test(name))
}

/**
 * Whether a value's SHAPE says it is a credential. Only strings are judged.
 * @param {unknown} value
 */
export function isSensitiveValue(value) {
  if (typeof value !== 'string') return false
  const shown = value.trim().slice(0, SCAN)
  if (shown === '') return false
  return HEX.test(shown) || opaqueToken(shown) || SHAPES.some((shape) => shape.test(shown))
}

/**
 * Whether a slot's value must be withheld from every document.
 * @param {{ key?: unknown, column?: unknown, leaf?: unknown, current?: unknown }} slot
 */
export function isSensitiveSlot({ key, column, leaf, current }) {
  return isSensitiveName(column) || isSensitiveName(leaf) || isSensitiveName(key) || isSensitiveValue(current)
}
