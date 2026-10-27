/**
 * THE CONTRACT'S VALUE RULES, CHECKED BEFORE THE RELAY (PLAN v2 P9 item 0; F3 §4.1 step 7): a mirror
 * of `QuickstartContract::checkValue` at claude-cowork `origin/main` 2aa7840
 * (`joomla/cowork/lib/QuickstartContract.php:538-562`, unchanged on `origin/main` a0ab275 as of
 * 25/09/2026) and of `IdentityTokens` (`joomla/cowork/lib/IdentityTokens.php`), in the same order, so
 * the first rule a value breaks here is the one the component would name.
 *
 * 🔒 WHY A MIRROR. The component checks a value only inside an apply, and a sealed Joomla apply is
 * 12–26 s of PHP behind the site's single-writer lock (`GET_LOCK(…,0)`). On r2's model calls 3–5 applies
 * were refused for a rule this file decides in microseconds (2 unknown slots, 3 values the component
 * refused), and the replace job (P9) would spend the same seconds on its own values. The component
 * stays the judge: a value that passes here is still checked there.
 *
 * 🔒 NEVER STRICTER THAN THE COMPONENT. A pre-check that refuses a value the component would accept
 * blocks a valid write with no way round it; one that lets through a value the component refuses
 * costs only the relay it was meant to save. So every doubt resolves to "pass": a Site identity slot is
 * exempt from occupancy whether its `siteIdentity` flag or only its label says so, a slot with no
 * `maxCharacters` has no length rule here, and a picture is checked by its path only (the file, its
 * folder and its shape are the component's to read).
 *
 * Kill switch: `TRACY_CONTRACT_PRECHECK=off` ({@link contractPrecheckOn}) — the callers then leave every
 * value to the component, as before this file.
 */

/**
 * Every identity token a page may carry — `Identity::NAMES` of `plg_system_tracyidentity` and
 * `IdentityTokens::NAMES` of the component, which must be equal. Closed on purpose: anything else in
 * braces is a Joomla directive.
 */
export const IDENTITY_TOKENS = Object.freeze([
  'site.name',
  'site.legalName',
  'site.slogan',
  'site.monogram',
  'contact.email',
  'contact.phone',
  'contact.tel',
  'contact.address',
  'contact.hours',
  'social.facebook',
  'social.instagram',
  'social.linkedin',
  'social.tiktok',
  'social.youtube'
])

/**
 * The `[Tracy] Site identity` block's fields → the token each one fills (`Identity::FIELDS`). A
 * slot's field is the last step of its `jsonPath` (`["site-identity", "phone"]`) and the end of its
 * label (`[Tracy] Site identity / phone`). `contact.tel` has no field: the plugin derives it from the
 * phone (digits and a leading `+`).
 */
export const IDENTITY_FIELDS = Object.freeze({
  'site-name': 'site.name',
  'legal-name': 'site.legalName',
  slogan: 'site.slogan',
  monogram: 'site.monogram',
  email: 'contact.email',
  phone: 'contact.phone',
  address: 'contact.address',
  hours: 'contact.hours',
  facebook: 'social.facebook',
  instagram: 'social.instagram',
  linkedin: 'social.linkedin',
  tiktok: 'social.tiktok',
  youtube: 'social.youtube'
})

/** The longest evidence the component takes, in UTF-8 bytes (`strlen`, QC.php:542). */
export const EVIDENCE_MAX_BYTES = 8000

/**
 * The CTA URL rule (QC.php:555), in PCRE's own terms: no `/u`, so `\s` is the six ASCII spaces
 * (written `\t\n\v\f\r ` here — JavaScript's `\s` would also refuse a no-break space PCRE lets
 * through), and `~D`, so `$` is the very end, as in JavaScript without `m`.
 */
export const CTA_URL =
  /^(https:\/\/[^\t\n\v\f\r ]+|mailto:[^\t\n\v\f\r ]+|tel:[+0-9 ()-]+|index\.php\?Itemid=[0-9]+|\/[a-zA-Z0-9/_?&=.%#-]*|#[a-zA-Z0-9_-]+)$/

/** A picture path the component can look for (QC.php:557) — the file itself is its to find. */
export const IMAGE_PATH = /^images\/[a-zA-Z0-9/_-]+\.(png|jpe?g|webp)$/

/** PHP `trim()`'s default set: space, tab, line feed, carriage return, NUL and vertical tab. */
const PHP_TRIM_SET = new Set([' ', '\t', '\n', '\r', '\0', '\v'])

/**
 * `trim()` as PHP does it — NOT JavaScript's, which also strips a no-break space and every other
 * Unicode space: `"\u00a0"` is empty to `String#trim` and occupied to the component.
 * @param {string} s
 */
export function phpTrim(s) {
  let a = 0
  let b = s.length
  while (a < b && PHP_TRIM_SET.has(s[a])) a += 1
  while (b > a && PHP_TRIM_SET.has(s[b - 1])) b -= 1
  return s.slice(a, b)
}

/**
 * PHP `empty()` for the flags a slot carries: `false`, `0`, `""`, `"0"`, `null` and absence.
 * @param {unknown} v
 */
const phpEmpty = (v) => v === undefined || v === null || v === false || v === 0 || v === '' || v === '0'

/** Every identity token as one alternation: `IdentityTokens::strip`'s `strtr` table in one pattern. */
const IDENTITY_TOKEN = new RegExp(
  `\\{(${IDENTITY_TOKENS.map((n) => n.replace('.', '\\.')).join('|')})\\}`,
  'g'
)

/**
 * The text with every identity token taken out (`IdentityTokens::strip`).
 *
 * 🔒 ONE PASS, AS `strtr` DOES IT — never one name after another. `strtr` scans the text once and
 * never looks again at what a removal joins, so `{contact.{site.name}email}` becomes
 * `{contact.email}` there — a directive the component refuses. Taking out `{site.name}` first and
 * then `{contact.email}` from the result (split/join per name, until 25/09/2026) removed that too,
 * and passed a value the component refuses one relay later.
 * @param {string} value
 */
export function stripIdentityTokens(value) {
  return value.replace(IDENTITY_TOKEN, '')
}

/**
 * What an evidence-required slot is given for words Tracy wrote (Lee, 23/09/2026): the component
 * accepts it, and its record says where the words came from. 🔒 ONE SENTENCE FOR EVERY READER —
 * `refusalNext`'s "Customer evidence required" next (`site.mjs`) and the replace job's evidence
 * answers (`replace-joomla.mjs`) both quote it; `test/replace-joomla.test.mjs` holds them equal.
 */
export const INVENTED_EVIDENCE =
  'Invented by Tracy to fit the customer; not from the brief. Replace it with the real one.'

/**
 * Does the value carry a Joomla directive once the identity tokens are set aside
 * (`IdentityTokens::hasDirective`, `/\{\/?[a-z][^{}]*\}/i`)?
 * @param {string} value
 */
export function hasDirective(value) {
  return /\{\/?[a-z][^{}]*\}/i.test(stripIdentityTokens(value))
}

/**
 * Markup or a control character (QC.php:551, `/[<>\x00-\x08\x0b\x0c\x0e-\x1f]/u`): a tab, a line feed
 * and a carriage return pass, DEL passes. A loop, not a regex: a control range in a pattern is what
 * oxlint's `no-control-regex` exists to flag.
 * @param {string} value
 */
export function hasMarkup(value) {
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i)
    if (c === 60 || c === 62) return true
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) return true
  }
  return false
}

/**
 * Is this slot part of the `[Tracy] Site identity` block? Its `siteIdentity` flag (content-map.json)
 * or, when an answer dropped the flag, its label — either one exempts it from occupancy, never stricter
 * than the component.
 * @param {{ siteIdentity?: unknown, label?: unknown }} slot
 */
export function isIdentitySlot(slot) {
  return !phpEmpty(slot?.siteIdentity) || String(slot?.label ?? '').startsWith('[Tracy] Site identity')
}

/**
 * @typedef {{ key: string, type?: string, sample?: string, maxCharacters?: number,
 *   requiresEvidence?: unknown, siteIdentity?: unknown, label?: string }} ContractSlot
 *   One slot of an inspect answer (or of `content-map.json`); `current` is not read here.
 * @typedef {'evidence' | 'cannot-empty' | 'cannot-fill' | 'no-markup' | 'no-directive'
 *   | 'max-characters' | 'url' | 'image'} ContractRule
 * @typedef {{ rule: ContractRule, key: string, message: string, limit?: number, length?: number }} ContractRefusal
 *   `message` is the component's own sentence, word for word — a caller that answers it as a
 *   `contract_failed` gets the `next` `refusalNext` already gives that sentence.
 */

/**
 * The first rule `value` breaks in `slot`, or null — `QuickstartContract::checkValue`, rule by rule
 * and in its order (each line cited). Evidence is judged from `options.evidence`, the apply's own
 * `evidence` map.
 * @param {ContractSlot} slot
 * @param {string} value
 * @param {{ evidence?: Record<string, unknown> | null }} [options]
 * @returns {ContractRefusal | null}
 */
export function checkSlotValue(slot, value, { evidence = null } = {}) {
  const key = String(slot.key)
  const sample = typeof slot.sample === 'string' ? slot.sample : ''
  // QC.php:540-543 — a value other than the demo's, in a slot that asks where its words come from.
  if (!phpEmpty(slot.requiresEvidence) && value !== slot.sample) {
    const given = evidence?.[key]
    if (
      typeof given !== 'string' ||
      phpTrim(given) === '' ||
      Buffer.byteLength(given, 'utf8') > EVIDENCE_MAX_BYTES
    )
      return { rule: 'evidence', key, message: `Customer evidence required: ${key}` }
  }
  // QC.php:547-550 — occupancy, except the identity block (a fact the customer lacks is emptied).
  if (!isIdentitySlot(slot)) {
    if (phpTrim(value) === '' && phpTrim(sample) !== '')
      return { rule: 'cannot-empty', key, message: `Content cannot remove an occupied slot: ${key}` }
    if (phpTrim(value) !== '' && phpTrim(sample) === '')
      return { rule: 'cannot-fill', key, message: `Content cannot activate an empty slot: ${key}` }
  }
  // QC.php:551
  if (hasMarkup(value))
    return { rule: 'no-markup', key, message: `Markup and control characters are not content: ${key}` }
  // QC.php:552
  if (hasDirective(value))
    return { rule: 'no-directive', key, message: `Joomla plugin directives are not content: ${key}` }
  // QC.php:553 — `mb_strlen`: code points, not UTF-16 units ("𝐀" is one).
  const length = [...value].length
  if (Number.isFinite(slot.maxCharacters) && length > Number(slot.maxCharacters))
    return {
      rule: 'max-characters',
      key,
      message: `Content too long: ${key}`,
      limit: Number(slot.maxCharacters),
      length
    }
  if (slot.type === 'url') {
    // QC.php:554 — a scheme-relative address and a backslash, whatever the pattern says.
    if (value.startsWith('//') || value.includes('\\'))
      return { rule: 'url', key, message: `Unsupported CTA URL: ${key}` }
    // QC.php:555
    if (value !== '' && !CTA_URL.test(value))
      return { rule: 'url', key, message: `Unsupported CTA URL: ${key}` }
  }
  // QC.php:557 — the path only; the file, `realpath` and the aspect ratio (558-561) are the site's.
  if (slot.type === 'image' && value !== '' && !IMAGE_PATH.test(value))
    return { rule: 'image', key, message: `Image must already exist in the site media library: ${key}` }
  return null
}

/**
 * Every change of one apply checked against the slots of the inspect it was planned on, in the
 * order they were sent — the first refusal, or null. A key the inspect does not list is left to the
 * component (`plan()`'s own "Unknown content slot"; a language job's `::` copy may be one this
 * snapshot predates).
 * @param {readonly ContractSlot[]} slots
 * @param {Record<string, unknown>} changes
 * @param {{ evidence?: Record<string, unknown> | null }} [options]
 * @returns {ContractRefusal | null}
 */
export function checkChanges(slots, changes, options = {}) {
  const byKey = new Map(slots.map((s) => [String(s.key), s]))
  for (const [key, value] of Object.entries(changes ?? {})) {
    const slot = byKey.get(key)
    if (!slot || typeof value !== 'string') continue
    const refusal = checkSlotValue(slot, value, options)
    if (refusal) return refusal
  }
  return null
}

/**
 * Is the pre-check on? Off only when `TRACY_CONTRACT_PRECHECK` is exactly `off` — the one switch that
 * hands every value back to the component, should this mirror and the component ever disagree.
 * @param {Record<string, string | undefined>} [env]
 */
export function contractPrecheckOn(env = process.env) {
  return (
    String(env?.TRACY_CONTRACT_PRECHECK ?? '')
      .trim()
      .toLowerCase() !== 'off'
  )
}
