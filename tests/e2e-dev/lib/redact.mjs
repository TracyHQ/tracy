// Everything the suite writes to disk passes through here first (plan §2 D7): session cookies,
// tokens, sign-in codes, invitation links and authentication headers are replaced, so a results
// folder can be pushed or pasted without leaking a way into somebody's account.

const MASK = '[redacted]'

/** Object keys whose VALUE is a secret, compared case-insensitively. `code` is NOT one: it is the
 * API's error code (`NOT_SIGNED_IN`), the most useful field in a failure. */
const SECRET_KEYS = new Set([
  'cookie',
  'set-cookie',
  'authorization',
  'proxy-authorization',
  'x-tracy-email-signature',
  'x-tracy-seat-token',
  'token',
  'accesstoken',
  'refreshtoken',
  'sessiontoken',
  'secret',
  'password',
  'otp',
  'otpcode',
  'invitelink',
  'inviteurl',
  'releasestoken',
  'tracy_sess'
])

/** @type {[RegExp, string | ((...m: string[]) => string)][]} */
const PATTERNS = [
  // A session token, wherever it appears: `v1.<payload>.<signature>`.
  [/\bv1\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, MASK],
  // `tracy_sess=<value>` in a Cookie or Set-Cookie line (attributes after `;` survive).
  [/(tracy_[a-z_]*=)[^;\s"']+/gi, `$1${MASK}`],
  // Authorization headers and bearer tokens.
  [/(authorization["']?\s*[:=]\s*["']?)(bearer\s+|basic\s+)?[^\s"',}]+/gi, `$1${MASK}`],
  [/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${MASK}`],
  // A seat key on its own (`trk_<id>.<secret>`, `apps/tracy-web/src/lib/api-key.js`), wherever it sits.
  [/\btrk_[a-z2-7]{16}\.[A-Za-z0-9_-]+/g, MASK],
  // A cookie or authorization value quoted under its key in JSON-like text (`"cookie": "…"`):
  // `redact` masks such keys in objects, this catches them in text that was never parsed.
  [/("(?:cookie|set-cookie|authorization)"\s*:\s*")(?!\[redacted\])[^"]+/gi, `$1${MASK}`],
  // GitHub tokens (installation, personal, OAuth).
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, MASK],
  // Invitation and sign-in links: the token in their query or path.
  [/([?&](?:token|t|invite|code|n|sig|signature)=)[^&\s"'#]+/gi, `$1${MASK}`],
  [/(\/(?:invite|join|verify|magic)\/)[A-Za-z0-9._~-]{8,}/gi, `$1${MASK}`],
  // A six-digit sign-in code when it is named as one.
  // (`code is 482913` too: up to four non-digits between the word and the digits.)
  [/((?:otp|code)\b\D{0,4})\d{6}(?!\d)/gi, `$1${MASK}`]
]

/**
 * Redact a string.
 * @param {string} text
 */
export function redactText(text) {
  let out = text
  for (const [re, to] of PATTERNS) out = out.replace(re, /** @type {any} */ (to))
  return out
}

/**
 * Redact any JSON-able value: secret keys lose their value, every string is pattern-scrubbed.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function redact(value) {
  if (typeof value === 'string') return /** @type {T} */ (redactText(value))
  if (Array.isArray(value)) return /** @type {T} */ (value.map((v) => redact(v)))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.has(k.toLowerCase()) && v !== null && v !== undefined ? MASK : redact(v)
    }
    return /** @type {T} */ (out)
  }
  return value
}

/**
 * What must never be pushed, checked AFTER redaction: anything here is a secret `redact` missed
 * (or a file that never went through it). Each pattern skips the `[redacted]` mask.
 * @type {[string, RegExp][]}
 */
const LEAKS = [
  ['session token', /\bv1\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/],
  ['tracy cookie value', /\btracy_[a-z_]*=(?!\[redacted\])[^;\s"'&,]+/i],
  // A cookie value: `[redacted]` itself, or `name=[redacted]`, is what redaction leaves.
  ['cookie header', /\bcookie["']?\s*[:=]\s*["']?(?!\[redacted\])(?![a-z_]+=\[redacted\])[^\s"';]{8,}/i],
  ['bearer token', /\bbearer\s+(?!\[redacted\])[A-Za-z0-9._~+/=-]{8,}/i],
  ['six digits after "code"', /\bcode\b\D{0,4}\d{6}(?!\d)/i],
  ['invitation link', /\/invite\/(?!\[redacted\])[A-Za-z0-9._~-]{8,}/i],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}/]
]

/**
 * Secrets left in a text, one entry per hit, with the hit itself masked (the finding is printed).
 * @param {string} text
 * @returns {{ line: number, kind: string, excerpt: string }[]}
 */
export function findLeaks(text) {
  const hits = []
  text.split('\n').forEach((line, i) => {
    for (const [kind, re] of LEAKS) {
      const m = re.exec(line)
      if (m) hits.push({ line: i + 1, kind, excerpt: `${m[0].slice(0, 12)}…` })
    }
  })
  return hits
}

/**
 * The attributes of a `Set-Cookie` line without its value: what J0 records about a cookie.
 * @param {string} line
 * @returns {{ name: string, attributes: Record<string, string | true> }}
 */
export function cookieAttributes(line) {
  const [pair, ...rest] = line.split(';')
  const name = pair.split('=')[0].trim()
  /** @type {Record<string, string | true>} */
  const attributes = {}
  for (const part of rest) {
    const [k, ...v] = part.trim().split('=')
    if (!k) continue
    attributes[k.toLowerCase()] = v.length ? v.join('=') : true
  }
  return { name, attributes }
}
