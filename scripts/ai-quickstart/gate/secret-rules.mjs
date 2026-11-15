// The value-shape rules of the secret scan (ticket #586), the same on every CMS: a password hash (bcrypt, argon2,
// phpass, an md5 with its salt, sha-crypt), a signed token (JWT), a private key block, a login in an address
// (`scheme://user:password@host`) and serialized PHP session data. A rule names a shape, never a table or a file: the
// CMS adapters (`adapters/`) say which rows and settings are secret wherever their shape is.
//
// A match is returned as its rule, its offset and its fingerprint (the first 12 hex characters of the value's
// sha256), never as the value: nothing downstream can print what it never received. Pure.
import { createHash } from 'node:crypto'

/** The fingerprint of a value: the first 12 hex characters of its sha256. */
export const fingerprintOf = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 12)

// Words that stand in for a password or a user in documentation: never a credential.
const PLACEHOLDER =
  /^(?:x+|\*+|\.+|pass|passw(?:or)?d|pwd|secret|user(?:name)?|login|admin|changeme|test|demo|example|foo|bar|baz|token|apikey|key)$/i
const TEMPLATED = /[${}<>%[\]()]/
// Hosts that stand in for a real one in documentation.
const EXAMPLE_HOST =
  /^(?:[^.]+\.)*example(?:\.(?:com|org|net))?(?::\d+)?(?:$|[/?#])|^(?:host|hostname|domain|server)(?::\d+)?$/i

/** Where a run of base64url characters starting at `i` ends. */
function tokenEnd(text, i) {
  let at = i
  while (at < text.length && /[A-Za-z0-9_-]/.test(text[at])) at += 1
  return at
}

const placeholder = (s) => !s || PLACEHOLDER.test(s) || TEMPLATED.test(s)

/**
 * The value-shape rules: `{id, what, re}`, `check(match)` when a shape alone is not enough, `value(match, text)` when
 * the value runs past the match.
 */
export const SECRET_RULES = Object.freeze([
  { id: 'bcrypt_hash', what: 'a bcrypt password hash', re: /\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}/g },
  {
    id: 'argon2_hash',
    what: 'an argon2 password hash',
    re: /\$argon2(?:id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]{8,}\$[A-Za-z0-9+/]{16,}/g
  },
  { id: 'phpass_hash', what: 'a phpass password hash', re: /\$[PH]\$[./0-9A-Za-z]{31}(?![./0-9A-Za-z])/g },
  {
    id: 'md5_salt_hash',
    what: 'an md5 password hash with its salt',
    re: /\b[0-9a-f]{32}:[./0-9A-Za-z]{16,32}\b/g
  },
  {
    id: 'sha_crypt_hash',
    what: 'a sha-crypt password hash',
    re: /\$[56]\$(?:rounds=\d+\$)?[./0-9A-Za-z]{1,16}\$[./0-9A-Za-z]{43,86}/g
  },
  {
    id: 'jwt',
    what: 'a signed token (JWT)',
    // The header and the start of the payload: a bounded match, then the token read to its end by hand, since an
    // open-ended pattern overflows the regular expression stack on a token of megabytes (a signed metadata file).
    re: /\beyJ[A-Za-z0-9_-]{10,2000}\.eyJ[A-Za-z0-9_-]{10}/g,
    check: (m) => {
      const end = tokenEnd(m.input, m.index + m[0].length)
      return /^\.[A-Za-z0-9_-]{10}/.test(m.input.slice(end, end + 11))
    },
    value: (m, text) => text.slice(m.index, tokenEnd(text, tokenEnd(text, m.index + m[0].length) + 1))
  },
  {
    id: 'private_key',
    what: 'a private key block',
    // A header followed by a key body (optional `Name: value` lines, then base64): code that only writes the header
    // around a key it builds is no key.
    re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----\r?\n(?:[A-Za-z-]+:[^\n]{0,200}\r?\n){0,4}\s{0,4}[A-Za-z0-9+/=]{40}/g,
    // The block runs to its END line when one follows within a key's length; its first line of body otherwise.
    value: (m, text) => {
      const end = text
        .slice(m.index, m.index + 12000)
        .search(/-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/)
      return end === -1 ? m[0] : text.slice(m.index, m.index + end)
    }
  },
  {
    id: 'uri_credentials',
    what: 'a login in an address',
    re: /\b[a-z][a-z0-9+.-]{1,15}:\/\/([^\s:/@'"`<>\\]{1,256}):([^\s/@'"`<>\\]{1,256})@([^\s'"`<>\\]{1,256})/gi,
    check: (m) => !placeholder(m[1]) && !placeholder(m[2]) && !EXAMPLE_HOST.test(m[3])
  },
  {
    id: 'php_session_data',
    what: 'serialized PHP session data',
    re: /(?<=^|[\s;}'"])[A-Za-z_][A-Za-z0-9_-]{0,64}\|(?:a:\d+:\{|s:\d+:"|O:\d+:")/gm
  }
])

/** Every rule match in a text: `[{rule, index, fingerprint}]`, the value hashed and dropped. */
export function matchRules(text, rules = SECRET_RULES) {
  const out = []
  if (!text) return out
  for (const rule of rules) {
    rule.re.lastIndex = 0
    for (const m of String(text).matchAll(rule.re)) {
      if (rule.check && !rule.check(m)) continue
      const value = rule.value ? rule.value(m, String(text)) : m[0]
      out.push({ rule: rule.id, index: m.index, fingerprint: fingerprintOf(value) })
    }
  }
  return out.sort((a, b) => a.index - b.index || (a.rule < b.rule ? -1 : 1))
}

/** The line of an offset in a text, counted from 1. */
export function lineOf(text, index) {
  let line = 1
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line += 1
  return line
}

/** The findings of a text file: `[{file, at: 'line:<n>', rule, fingerprint}]`. */
export function textFindings(file, text, rules) {
  return matchRules(text, rules).map((m) => ({
    file,
    at: 'line:' + lineOf(text, m.index),
    rule: m.rule,
    fingerprint: m.fingerprint
  }))
}

const pointerPart = (k) => String(k).replaceAll('~', '~0').replaceAll('/', '~1')

/** The findings of a JSON document, each placed by its JSON pointer (`/blocks/hero/fields/0`). */
export function jsonFindings(file, doc, rules) {
  const out = []
  const walk = (value, at) => {
    if (typeof value === 'string')
      for (const m of matchRules(value, rules))
        out.push({ file, at: at || '/', rule: m.rule, fingerprint: m.fingerprint })
    else if (value && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) walk(v, at + '/' + pointerPart(k))
  }
  walk(doc, '')
  return out
}
