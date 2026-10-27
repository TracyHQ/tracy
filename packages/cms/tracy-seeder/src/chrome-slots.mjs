/**
 * Site chrome, resolved without a model.
 *
 * 🔒 WHY THIS FILE EXISTS. A few slots in the Joomla quickstart contract are not customer content
 * and never were: the footer colophon and the legal line. They arrived from the base archive
 * carrying the base's own branding — `Built on the OpenDesign **apple** design system — 56 tokens,
 * one blue accent, capsule geometry.` and `© 2026 Tracy Apple. A JoomlArt T4 template.` — and one
 * base archive now serves more than one design, so an Airbnb site was rendering the word "apple"
 * in its footer.
 *
 * Handing those slots to the content planner cannot fix it, and the planner is right to refuse:
 * its rule is "do not invent facts and do not keep demo facts as customer content", so with no
 * customer fact to put there it marks them pending and the whole seed stage waits. The build then
 * stops for a reason no brief can answer, because the answer was never the customer's to give.
 *
 * So these slots are resolved here instead, deterministically, and removed from the batches the
 * model ever sees. Two rules decide the values, and they come from the product decision, not from
 * this file's convenience:
 *
 *   - the colophon carries NEUTRAL text that suits whatever template is actually installed, and
 *     asks the customer for nothing technical about a design system;
 *   - the legal line is the CUSTOMER'S, built from a fact they supplied. Never invented.
 *
 * The second rule is why this file can still produce `pending`. No business name means no legal
 * line, and a missing fact stays missing — the fail-closed behaviour is preserved, just moved to
 * the one place that can tell the difference between "the customer did not say" and "nobody was
 * ever going to say".
 *
 * ⚠ The WORDS below are a product decision and are meant to be edited. The mechanism is what is
 * engineered. `check-design-templates` holds every key here against the profile's own
 * content-map, so a profile that renames or drops one of these slots fails a gate instead of
 * quietly restoring the leak.
 */

import table from './chrome-slots.json' with { type: 'json' }

/**
 * Chrome slots per contract profile, as data. Keys are slot keys as the contract reports them.
 *
 * `text`     — a literal, used as-is.
 * `template` — `{year}`, `{business}`, `{BUSINESS}` (the name in capitals) and `{initials}` are
 *              substituted, and so are the customer's own contact facts: `{phone}`, `{email}`,
 *              `{address}`, `{hours}` and one profile per network (`{facebook}`, `{instagram}`,
 *              `{linkedin}`, `{tiktok}`, `{youtube}`); anything it `requires` that is missing sends
 *              the slot to pending rather than to a guess, and `emptyWhenMissing` empties it instead.
 *
 * It lives in JSON rather than in this file so that `check-design-templates` can read it without
 * importing a module, and so that changing the wording is a data edit reviewed as data.
 */
export const CHROME_SLOTS = table.profiles

/** Words a brand mark skips — the same list the EmDash template's `initialsOf` skips. */
const STOP = new Set(['and', 'the', 'of', '&', 'co', 'ltd', 'llc', 'jsc', 'inc', 'gmbh', 'và', 'công', 'ty'])

/**
 * A brand mark from the name: up to three initials, the first two words and the last. The same rule
 * as the EmDash template's `initialsOf` (`tools/personalize.mjs`), so one customer wears one mark on
 * every CMS.
 * @param {string} name
 */
export function initialsOf(name) {
  const words = name.split(/\s+/).filter((w) => w.length > 0 && !STOP.has(w.toLowerCase()))
  const letters = words.map((w) => [...w][0].toUpperCase())
  if (letters.length === 0) return name.slice(0, 2).toUpperCase()
  if (letters.length === 1) return [...words[0]].slice(0, 2).join('').toUpperCase()
  if (letters.length <= 3) return letters.join('')
  return `${letters[0]}${letters[1]}${letters[letters.length - 1]}`
}

/** The customer's own name for themselves, or null. Never a fallback, never a guess. */
function businessOf(site) {
  for (const key of ['name', 'business', 'businessName', 'title']) {
    const value = site?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/**
 * Resolve the chrome slots of one contract.
 *
 * @param {object} args
 * @param {string} args.contract      contract id as the Claude Cowork plugin reports it
 * @param {{ key: string, sample: string, maxCharacters: number }[]} args.slots  the full inventory
 * @param {object} [args.site]        the customer brief
 * @param {Date} [args.now]           injected so a test does not depend on the calendar
 * @returns {{ values: Record<string,string>, pending: string[], handled: Set<string> }}
 *   `handled` is every chrome key present in this contract, whether it resolved or not — the
 *   planner must skip all of them, because a chrome slot the model gets to see is a chrome slot
 *   the model will try to write customer copy into.
 */
export function resolveChromeSlots({ contract, slots, site, now = new Date() }) {
  const table = CHROME_SLOTS[contract] ?? {}
  const byKey = new Map(slots.map((slot) => [slot.key, slot]))
  const business = businessOf(site)
  const contact = contactOf(site)
  const facts = {
    year: String(now.getUTCFullYear()),
    business,
    BUSINESS: business?.toLocaleUpperCase() ?? null,
    initials: business ? initialsOf(business) : null,
    phone: contact.phone,
    email: contact.email,
    address: contact.address,
    hours: typeof site?.hours === 'string' && site.hours.trim() ? site.hours.trim() : null,
    ...profilesOf(site)
  }
  const values = {}
  const pending = []
  const handled = new Set()

  for (const [key, rule] of Object.entries(table)) {
    const slot = byKey.get(key)
    // A key this contract does not carry is not this resolver's business. The gate is what makes
    // that a loud failure at build time; here it must simply not invent a slot.
    if (!slot) continue
    handled.add(key)

    if (typeof rule.text === 'string') {
      if ([...rule.text].length > slot.maxCharacters) pending.push(key)
      else values[key] = rule.text
      continue
    }

    const missing = (rule.requires ?? []).filter((fact) => !facts[fact])
    if (missing.length) {
      pending.push(key)
      continue
    }
    // An identity slot the brief has no fact for is EMPTY, not the demo's value and not a question
    // that stalls the build: the Claude Cowork plugin lets an identity slot be emptied and the page hides it.
    const used = [...rule.template.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
    if (rule.emptyWhenMissing && used.some((fact) => !facts[fact])) {
      values[key] = ''
      continue
    }
    const rendered = rule.template.replace(/\{(\w+)\}/g, (_, fact) => facts[fact] ?? '')
    // Too long is a refusal, not a truncation. A silently clipped legal line is worse than a
    // build that waits and says so.
    if ([...rendered].length > slot.maxCharacters) pending.push(key)
    else values[key] = rendered
  }

  return { values, pending, handled }
}

/** An email address, as the brief's normaliser reads one (`brief-normalize.js` `EMAIL`). */
const EMAIL = String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}`
/** A phone: a run of digits long enough to dial (`brief-normalize.js` `PHONE`). */
const PHONE = String.raw`\+?\d[\d\s().-]{6,}\d`
/** What may follow a number and is part of no address: an extension ("ext. 89", "x 12", "máy lẻ 3"). */
const EXTENSION = String.raw`(?:\s*,?\s*(?:ext\.?|extension|máy lẻ|доб\.?|x)\s*\d{1,6})?`
/** A label as its own word ("Hotline:", "Tel.", "Email:"), never the end of another word ("Hotel"). */
const labelled = (/** @type {string} */ words, /** @type {string} */ value) =>
  new RegExp(String.raw`(?:(?<![\p{L}\p{N}])(?:${words})\s*:?\s*)?(?:${value})`, 'giu')
const PHONE_LABELLED = labelled(
  'hotline|telephone|tel\\.?|phone|mobile|điện thoại|sđt|đt|di động|горячая линия|телефон|тел\\.?',
  PHONE + EXTENSION
)
const EMAIL_LABELLED = labelled('e-?mail|mail|почта', EMAIL)
/** A label in front of the address itself ("Địa chỉ:", "Address:"). */
const ADDRESS_LABEL = /^(?:địa chỉ|dia chi|address|addr\.?|адрес)(?![\p{L}\p{N}])\s*:?\s*/iu
/** What stands between two facts on the line. */
const LEAD = /^[\s·|;,:–-]*/u
const TRAIL = /[\s·|;,:–-]*$/u
/** Where a fact was taken out. */
const GONE = '\u0000'

/** A fact as given: a non-empty string, trimmed, or null. */
const given = (/** @type {unknown} */ value) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

/**
 * The customer's phone, email and address.
 *
 * Apply's normaliser has already read them apart (`brief-normalize.js`: the model's reading, kept only
 * where the owner's text holds it) and joined them into `contact` for the copy: those it read are
 * the facts, and the line is not parsed again — a fact it did not find is not looked for twice.
 *
 * A brief with none of them (a Build brief: one "Address and hotline" answer) has only the free line,
 * read here: every email with its label, then the first number long enough to dial as the phone and
 * every number with its label and extension, taken out of it; what is left, its address label off, is
 * the address — the separators the customer typed kept, only the empty places the removals left
 * closed up. Nothing is invented: no digits, no phone; no `@`, no email.
 *
 * ⚠ Until 05/10/2026 only the phone was taken out, so Apply's email stayed in the address
 * ("hello@goldencrust.example · 12 Hang Bac, Hanoi") and the identity email was never written (L32).
 * @param {object} [site]
 * @returns {{ phone: string | null, email: string | null, address: string | null }}
 */
export function contactOf(site) {
  const read = { phone: given(site?.phone), email: given(site?.email), address: given(site?.address) }
  if (read.phone || read.email || read.address) return read
  const text = given(site?.contact)
  if (!text) return { phone: null, email: null, address: null }
  const email = new RegExp(EMAIL, 'u').exec(text)?.[0] ?? null
  const noEmail = text.replace(EMAIL_LABELLED, GONE)
  // Read after the emails are out, so the digits of `hello2024@…` are never a phone.
  const phone = new RegExp(PHONE, 'u').exec(noEmail)?.[0].trim() ?? null
  const parts = noEmail.replace(PHONE_LABELLED, GONE).split(GONE)
  /** @type {Array<{ text: string, before: string, after: string }>} */
  const kept = []
  parts.forEach((part, i) => {
    // The separators beside a fact taken out went with it; the ones inside what is left stay as typed.
    const before = i > 0 ? (LEAD.exec(part)?.[0] ?? '') : ''
    const rest = part.slice(before.length)
    const after = i < parts.length - 1 ? (TRAIL.exec(rest)?.[0] ?? '') : ''
    const words = rest.slice(0, rest.length - after.length).replace(ADDRESS_LABEL, '')
    if (words.trim() !== '') kept.push({ text: words, before, after })
  })
  // Two pieces a removal parted are joined by the separator the customer typed there.
  const joint = (/** @type {string} */ a, /** @type {string} */ b) =>
    /\S/u.test(a) ? a : /\S/u.test(b) ? b : a || b || ' '
  const address = kept
    .map((piece, i) => (i === 0 ? piece.text : joint(kept[i - 1].after, piece.before) + piece.text))
    .join('')
    .replace(/^[\s·|;,:–-]+|[\s·|;,:–-]+$/gu, '')
  return { phone, email, address: address || null }
}

/** The networks a Tracy identity block keeps a profile for (`Identity::FIELDS`). */
const NETWORKS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube']

/**
 * The profiles the customer linked (`site.social`, network → address, as `socialLinksIn` reads them),
 * one per network the identity block has a field for. Only an `https://` address with no space in it:
 * that is all the Claude Cowork plugin takes in a url slot.
 * @param {object} [site]
 * @returns {Record<string, string | null>}
 */
function profilesOf(site) {
  const social = site?.social && typeof site.social === 'object' ? site.social : {}
  return Object.fromEntries(
    NETWORKS.map((network) => {
      const url = social[network]
      return [network, typeof url === 'string' && /^https:\/\/\S+$/.test(url.trim()) ? url.trim() : null]
    })
  )
}

/**
 * A brace a link percent-encoded (`%7B`, `%7d`) read back as the brace it is. The Claude Cowork plugin
 * saves an HTML row it wrote into through PHP `saveHTML`, and libxml2 2.9 (the Joomla site image's)
 * percent-encodes the braces of every `href`/`src`/`action` it serialises — the rest of the row's
 * links included, so `tel:{contact.tel}` comes back `tel:%7Bcontact.tel%7D` (L32, 05/10/2026).
 * `plg_system_tracyidentity` fills both spellings.
 * @param {unknown} value
 */
const decodeBraces = (value) =>
  String(value ?? '')
    .replace(/%7B/gi, '{')
    .replace(/%7D/gi, '}')

/**
 * A slot holding nothing but identity tokens (`{site.name}`, `tel:{contact.tel}`, or the same with
 * its braces percent-encoded) is chrome: the page fills it from the identity module, so the seed
 * keeps it exactly as it is and the model never sees it — a model asked to "replace demo content"
 * would write a literal name over the token.
 */
export function isTokenOnly(sample) {
  const value = decodeBraces(sample).trim()
  return /^((tel:|mailto:)?\{(site|contact|social)\.[a-zA-Z]+\}[\s·|,]*)+$/.test(value)
}

/**
 * A slot whose sample is the site's OWN navigation is chrome too, and there are many more of these
 * than there are colophons.
 *
 * ⚠ MEASURED 12/09/2026. `index.php?Itemid=263` is a link to a menu item this very site carries.
 * The content planner is told to pend a missing CTA destination, so with no customer fact naming
 * that link it pends — and asks the customer to supply an internal Joomla route. Nobody can answer
 * that, and it is already correct: the menu item it points at is still there, because the contract
 * forbids changing menus at all. Keeping it is the only right answer; pending it stalls a build on
 * a question with no asker and no answer.
 *
 * Kept narrow ON PURPOSE. An external CTA (`https://…`) or an empty destination is NOT covered: a
 * customer's booking link is a real fact and must still be asked for. Only a route that points back
 * into this same site qualifies.
 */
export function isInternalRoute(sample) {
  const value = (sample ?? '').trim()
  if (value === '') return false
  return /^index\.php(\?|$)/.test(value) || value.startsWith('/')
}

/**
 * The identity tokens a Tracy quickstart's copy may carry — a closed list that must equal
 * `IdentityTokens::NAMES` in the Cowork component and `Identity::NAMES` in plg_system_tracyidentity.
 */
export const IDENTITY_TOKENS = [
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
]

/** The text with every identity token taken out, for a directive check to look at. */
export function withoutIdentityTokens(text) {
  let out = text
  for (const name of IDENTITY_TOKENS) out = out.split(`{${name}}`).join('')
  return out
}
