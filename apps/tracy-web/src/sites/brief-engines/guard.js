/**
 * What a model is not allowed to put on a customer's site on its own: a phone number, an email address, a
 * street address, a price, a year, because the customer never gave one.
 *
 * 🔒 AN INVENTED FACT ON A LIVE SITE IS WORSE THAN THE DEMO'S (CLAUDE.md §0.3: invented data is worse than
 * empty, because people trust it). Measured 03/10/2026 on the stand, planning `tracy-business/j6` for a
 * bakery whose owner had given a name and one sentence: the model wrote "Hotline: +84 24 3555 0144",
 * three street addresses with phone numbers, "Baking since 2010", a five-year timeline and a
 * "Prices as at 2026" — plausible, specific and false. The seeder's prompt already says not to; a model
 * still does, so the prompt says it again, firmly (`FACT_RULES`), and what comes back is checked here
 * (`ungrounded`): a value carrying a fact that is not in the customer's own text is not written, and the slot
 * keeps what it had.
 *
 * 🔒 THE TEMPLATE'S OWN SAMPLE IS NOT EVIDENCE (product owner, 05/10/2026, ledger L09). A fact the slot's sample
 * carries is the template company's — its hotline, its mailbox, its street, its prices, its founding year — and a
 * line rewritten around it ("Call our team on <the demo's hotline>") put that company's contact details on the
 * customer's site under the customer's words. Only the brief's facts count.
 *
 * It is deliberately narrow — phone, email, street address, price, year — because every pattern here
 * can be proved wrong by a string comparison against the customer's own words. Statistics ("60+ cake
 * flavours") and claims ("family owned") cannot, and stay the model's, with the limit said in the report.
 */
import PLACEHOLDER_WORDS from './placeholder-words.json' with { type: 'json' }

/**
 * Appended to the planners' own instructions.
 *
 * 🔒 A SLOT WHOSE SAMPLE STATES A FACT IS REWRITTEN WITHOUT IT, NOT LEFT. Measured 03/10/2026 on a bakery's
 * `tracy-business/wp7`: told only "put it in pending", the model pended 58 slots — the About page's staff
 * ("Andrey Kulagin, Chief Executive Officer"), its counters ("380+ projects delivered"), the Investors page —
 * and the customer's site went out wearing another company's people and numbers. An honest line that states
 * no fact ("Baked daily", "Our bakers") is better than the demo's, and never an invention. Only a slot with no
 * such line (a ticker symbol, a dividend) stays pending.
 */
export const FACT_RULES =
  ' HARD RULE: never write a phone number, email address, street address, opening hours, price, year, date, ' +
  "statistic, award, certification, testimonial, client, project or the name of a person unless the input's brief states it. " +
  'A slot whose sample states one of those is NOT filled with an invented one and NOT kept as it is: write a short line ' +
  'in the same role that states none of them — a plain label, a quality or a category taken from the brief ' +
  '(for example "Baked daily" where the sample counts projects, "Our bakers" where it names a person). ' +
  'Only a slot for which no such honest line exists goes into "pending". ' +
  'STATISTIC TILES are an exception to neutral prose: keep one accepted numeric value with its matching label and source as a unit. ' +
  'Never write a place, category or sentence in a stat.value slot. If no complete sourced statistic fits, leave the whole stat group pending so it can be taken off.'

const PHONE = /\+?\d[\d\s().-]{5,}\d/g
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const YEAR = /\b(?:19|20)\d{2}\b/g
const PRICE =
  /(?:[$€£¥₫]\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:USD|EUR|GBP|VND|đ|₫|\$|dollars?|euros?|pounds?|dong|đồng|nghìn|ngàn|triệu|Euro|Franken|rubles?|руб\.?|元|块)(?![\p{L}]))/giu
/** `2024-2026`, `2026-10-03`, `03/10/2026`: digits and separators that are dates, not phone numbers. */
const DATE_LIKE =
  /^(?:(?:19|20)\d{2}[\s.-]+(?:19|20)\d{2}|(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-](?:19|20)?\d{2})$/
const STREET =
  /\b\d{1,4}[A-Za-z]?\s+(?:[A-ZÀ-Ỹ][\p{L}'’-]*\s+){1,4}(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Drive|Dr\.?)\b/gu

/**
 * A street address in the languages Tracy is offered in. English keeps its own pattern above; the rest
 * are a number next to a capitalised street word (`12 rue de la Paix`, `Hauptstraße 12`,
 * `Calle Mayor 5`, `123 Nguyễn Trãi`, `Via Roma 7`, `Kerkstraat 9`), in either order.
 */
const STREET_OTHER =
  /(?:\b\d{1,4}[A-Za-z]?,?\s+(?:bis\s+)?(?:rue|avenue|boulevard|chemin|place|calle|avenida|via|viale|piazza|straat|laan|weg|đường|phố|ngõ|улица|ул\.)\s+[\p{L}'’ .-]{2,40}|\b\d{1,4}[A-Za-z]?,?\s+[\p{Lu}][\p{L}'’-]*(?:straße|strasse|straat|laan|gasse)\b|\b[\p{Lu}][\p{L}'’-]*(?:straße|strasse|str\.|straat|laan|weg|platz|gasse)\s+\d{1,4}[A-Za-z]?\b|\b(?:Calle|Avenida|Via|Viale|Piazza|Rue)\s+[\p{Lu}][\p{L}'’ -]{2,30}\s*,?\s*\d{1,4}\b|\b\d{1,4}\s+(?:[\p{Lu}][\p{L}'’-]*\s+){1,3}(?:Trãi|Huệ|Du|Hùng|Trường)\b)/gu
/** A web address: only the customer's own may be written. */
const URL_LIKE = /\b(?:https?:\/\/|www\.)[^\s<>"')]*[^\s<>"').,;:!?]/gi

/** `name.tld/path`, written without a scheme. */
const BARE_HOST = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?=\/)[^\s<>"')]*[^\s<>"').,;:!?]/gi

/** The digits of a string, for comparing phone numbers across their punctuation. */
const digits = (s) => String(s).replace(/\D+/g, '')

/**
 * @param {string} text
 * @param {RegExp} pattern
 * @returns {string[]}
 */
function all(text, pattern) {
  return [
    ...String(text).matchAll(
      new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
    )
  ].map((m) => m[0])
}

/** The host of a web address, lower-cased, without `www.`. */
function hostOf(url) {
  try {
    return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname
      .toLowerCase()
      .replace(/^www\./, '')
  } catch {
    return url.toLowerCase()
  }
}

/** The facts the customer's own words state, as sets a value can be checked against. */
export function factsOf(...texts) {
  const joined = texts.filter(Boolean).join(' \n ')
  return {
    text: joined.toLowerCase(),
    digits: digits(joined),
    emails: new Set(all(joined, EMAIL).map((e) => e.toLowerCase())),
    years: new Set(all(joined, YEAR)),
    prices: new Set(all(joined, PRICE).map((p) => digits(p))),
    streets: new Set([...all(joined, STREET), ...all(joined, STREET_OTHER)].map((s) => s.toLowerCase())),
    // The customer may write an address bare (`instagram.com/goldencrust`); a link built from it is theirs.
    urls: new Set([...all(joined, URL_LIKE), ...all(joined, BARE_HOST)].map((u) => hostOf(u)))
  }
}

/**
 * Why a value must not be written, or null when it carries no fact the customer did not give.
 * @param {string} value - what the model wrote
 * @param {string} sample - what the slot holds now (the template's own words): never evidence, only named in the reason
 * @param {ReturnType<typeof factsOf>} facts - the customer's own facts (`factsOf` of the brief)
 * @returns {string | null}
 */
export function ungrounded(value, sample, facts) {
  const own = factsOf(sample)
  /** The reason, saying when the fact is the template's own (kept in the template's words, not the customer's). */
  const why = (/** @type {string} */ reason, /** @type {boolean} */ template) =>
    template ? `${reason}: it is the template’s own` : reason
  for (const phone of all(value, PHONE)) {
    const d = digits(phone)
    // A run of digits is a phone number from seven on; a year or a count is shorter.
    if (d.length < 7) continue
    // A range of years or a numeric date is digits and punctuation too, and is not a phone number.
    if (DATE_LIKE.test(phone.trim())) continue
    if (facts.digits.includes(d)) continue
    return why('phone number not given', own.digits.includes(d))
  }
  for (const email of all(value, EMAIL)) {
    const e = email.toLowerCase()
    // `you@example.com` is a placeholder in an email template, not a fact about anybody.
    if (/@example\.(?:com|org|net|co\.uk)$/.test(e)) continue
    if (!facts.emails.has(e)) return why('email address not given', own.emails.has(e))
  }
  for (const street of all(value, STREET)) {
    const s = street.toLowerCase()
    if (!facts.streets.has(s)) return why('street address not given', own.streets.has(s))
  }
  for (const street of all(value, STREET_OTHER)) {
    const t = street.toLowerCase()
    if (!facts.streets.has(t)) return why('street address not given', own.streets.has(t))
  }
  for (const url of all(value, URL_LIKE)) {
    const host = hostOf(url)
    // A link to the site itself or to a placeholder is not a claim about the business.
    if (/(^|\.)example\.(?:com|org|net)$/.test(host) || host === 'localhost') continue
    if (!facts.urls.has(host)) return why('web address not given', own.urls.has(host))
  }
  for (const price of all(value, PRICE)) {
    const d = digits(price)
    if (d !== '' && !facts.prices.has(d)) return why('price not given', own.prices.has(d))
  }
  for (const year of all(value, YEAR)) {
    // The year of the day and the one before it are what a copyright line or a date legitimately carries.
    const now = new Date().getUTCFullYear()
    if (Number(year) >= now - 1 && Number(year) <= now + 1) continue
    if (!facts.years.has(year)) return why('year not given', own.years.has(year))
  }
  return null
}

/**
 * 🔒 A SOCIAL OR ICON LINK'S NAME IS NOT A LINE OF THE BUSINESS, AND A PLACEHOLDER IS NOT A LINE AT ALL. Measured 13–14/10/2026
 * (sq-check mod-lad1..8, a full Vietnamese brief for a bakery): JA Mood j6 1.0.2's Social List draws four icons, each an `<a>`
 * whose `title` attribute names its network ("Facebook", "Google plus") over an invisible `<span>` that says "empty". Apply
 * wrote the bakery's phrases into the titles ("Bánh mì Việt", "Tiệm bánh gia đình", "Chưa có mạng xã hội"), "trống" into every
 * span, and in other runs "Google cộng". JA Donate's titles were swapped for other networks ("twitter" → "Instagram") over the
 * same icons, and JA Essence's `social-intro[title]` "Rss" became "Nguồn cấp dữ liệu", "Facebook" "Kênh của tiệm". A title is
 * what a screen reader says for an icon and what a pointer shows over it: it names the network the icon draws. So, read from
 * the slot's own description and its neighbours, never from a template's name or a module id:
 *   - a slot holding nothing but a social network's name, on a link (the link's text or attribute, or a field of a social item
 *     beside its link), keeps that name: never rewritten, never translated (`isNetworkName`);
 *   - the `title` / `aria-label` of a link that is a social network's, or an icon with no words or picture of its own, is never
 *     written from the brief (`guardChanges`); a translation of the template's own words there is allowed (`guardWritten`);
 *   - a slot the template leaves as a placeholder ("empty") is never written, and no slot is written with a placeholder
 *     ("trống", "N/A", "—"): a line Apply has nothing for keeps what it holds.
 */

/** The social networks a template's icon links name, as the words of their names. */
const NETWORKS = new Set([
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'youtube',
  'twitter',
  'x',
  'pinterest',
  'behance',
  'dribbble',
  'github',
  'vimeo',
  'zalo',
  'whatsapp',
  'telegram',
  'skype',
  'flickr',
  'tumblr',
  'vk',
  'vkontakte',
  'snapchat',
  'threads',
  'messenger',
  'wechat',
  'weibo',
  'reddit',
  'soundcloud',
  'spotify',
  'discord',
  'twitch',
  'mastodon',
  'bluesky',
  'yelp',
  'tripadvisor',
  'rss',
  'google',
  'googleplus'
])
/** What may stand beside a network's name without making it another line: `Google plus`, `Google+`. */
const NETWORK_EXTRA = new Set(['plus', '+'])
/** A social network's address, or the token a template fills with one (`{social.facebook}`). */
const NETWORK_ADDRESS =
  /\{social\.|(?:^|\/\/|\.)(?:facebook|fb|instagram|linkedin|tiktok|youtube|youtu|twitter|x|pinterest|behance|dribbble|github|vimeo|zalo|wa|whatsapp|t|telegram|skype|flickr|tumblr|vk|snapchat|threads|reddit|soundcloud|spotify|discord|twitch|yelp|tripadvisor)\.(?:com|me|be|net|org|gg|tv|ru|app)\b/i
/** An attribute that names its element for a screen reader or a pointer; never drawn as words on the page. */
const NAME_ATTRIBUTE = /\/@(?:title|aria-label)$/i
/** An `<a>` step of an XPath. */
const LINK_STEP = /^a(?:\[\d+\])?$/i

/** The words of a value, lower-cased, with a `+` as a word of its own (`Google+` → `google`, `+`). */
const wordsOf = (/** @type {unknown} */ value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\+/g, ' + ')
    .split(/[^\p{L}\p{N}+]+/u)
    .filter(Boolean)

/**
 * Whether a value is nothing but a social network's name: `Facebook`, `Google plus`, `X (Twitter)`, `rss`.
 * @param {unknown} value
 */
export function isNetworkName(value) {
  const words = wordsOf(value)
  return words.some((w) => NETWORKS.has(w)) && words.every((w) => NETWORKS.has(w) || NETWORK_EXTRA.has(w))
}

/** Whether a value names a social network among other words ("Follow us on Instagram"). A lone `x` is a letter, not X. */
const namesNetwork = (/** @type {unknown} */ value) =>
  wordsOf(value).some((w) => w !== 'x' && NETWORKS.has(w))

/** A value as a placeholder is compared: lower-cased, one space between words, without the quotes, brackets and dots around it. */
const bare = (/** @type {unknown} */ value) =>
  String(value ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”‘’«»()[\]{}*_.…:-]+|[\s"'“”‘’«»()[\]{}*_.…:!-]+$/gu, '')

/**
 * What a model writes for a line it has nothing for, in the languages Tracy writes sites in. Whole values only, and none that is
 * an ordinary word in another of those languages: Spanish `leer` ("read") and `todo` ("all") are not here, nor is `na`.
 */
const PLACEHOLDERS = new Set(/** @type {string[]} */ (PLACEHOLDER_WORDS.words).map(bare))
/** What a template ships in a line it leaves empty on purpose (JA Mood's invisible `<span>empty</span>`). */
const TEMPLATE_BLANKS = new Set(
  ['empty', 'blank', 'placeholder', 'null', 'undefined', 'n/a', 'tbd', 'tba'].map(bare)
)

/**
 * Whether the customer's own text holds these words as words ("trống" in "bán trống và kèn", a drum shop's).
 * @param {{ text?: string } | null | undefined} facts @param {string} words - already `bare`
 */
function saidBy(facts, words) {
  const escaped = words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'u').test(
    String(facts?.text ?? '').normalize('NFC')
  )
}

/**
 * Whether a value is a placeholder rather than words: one of `PLACEHOLDERS`, or nothing but marks ("—", "...") where the line
 * holds words. A placeholder word the customer wrote themselves is their word, and passes.
 * @param {unknown} value - what would be written
 * @param {unknown} held - what the line holds now
 * @param {{ text?: string } | null | undefined} facts - the customer's own facts (`factsOf` of the brief)
 */
export function isPlaceholder(value, held, facts) {
  const text = String(value ?? '')
  if (text.trim() === '') return false
  if (!/[\p{L}\p{N}]/u.test(text)) return /\p{L}/u.test(String(held ?? ''))
  const word = bare(text)
  return PLACEHOLDERS.has(word) && !saidBy(facts, word)
}

/** Where a slot lives: one entity's column, or one JSON document inside it. The slots of one place are neighbours. */
const placeOf = (/** @type {any} */ slot) =>
  JSON.stringify([slot?.entity ?? null, slot?.column ?? null, slot?.nestedJson ?? null])

/**
 * The slots of each place, built once for a whole set of changes.
 * @param {Iterable<any>} slots
 * @returns {Map<string, any[]>}
 */
function neighbourhood(slots) {
  /** @type {Map<string, any[]>} */
  const out = new Map()
  for (const slot of slots) {
    if (!slot) continue
    const at = placeOf(slot)
    const list = out.get(at)
    if (list) list.push(slot)
    else out.set(at, [slot])
  }
  return out
}

/** What a line holds now: what the site says, else what the template ships. */
const heldOf = (/** @type {any} */ slot) => String(slot?.current ?? slot?.sample ?? '')

/**
 * The `<a>` an XPath slot belongs to (its own element, or one it sits inside), as an XPath; null when it is not a link's.
 * @param {any} slot @param {any[]} near - the slots of its place
 */
function linkOf(slot, near) {
  const xpath = typeof slot?.xpath === 'string' ? slot.xpath : ''
  if (!xpath) return null
  const steps = xpath.split('/')
  for (let i = steps.length - 2; i > 0; i -= 1)
    if (LINK_STEP.test(steps[i])) return steps.slice(0, i + 1).join('/')
  // An element that is no `<a>` but carries the link itself: its name attribute sits beside its `@href`.
  if (NAME_ATTRIBUTE.test(xpath)) {
    const element = xpath.replace(NAME_ATTRIBUTE, '')
    if (near.some((s) => s.type === 'url' && s.xpath === `${element}/@href`)) return element
  }
  return null
}

/**
 * Whether a link is an icon: it shows no words of its own (every text inside it is empty, a placeholder or markup) and no
 * picture. A picture link (a footer logo titled "JA Vega", a banner) is the template's company or its offer, and its title is a
 * line the brief may rewrite, as before.
 * @param {string} anchor @param {any[]} near
 */
function isIconLink(anchor, near) {
  const inside = near.filter((s) => typeof s.xpath === 'string' && s.xpath.startsWith(`${anchor}/`))
  if (inside.some((s) => s.type === 'image' || /\/img(?:\[\d+\])?\//i.test(s.xpath))) return false
  return inside
    .filter((s) => s.type === 'text' && s.xpath.endsWith('text()'))
    .every((s) => {
      const words = heldOf(s)
        .replace(/<[^>]*>|\(\([\s\S]*?\)\)/g, ' ')
        .trim()
      return (
        words === '' ||
        TEMPLATE_BLANKS.has(bare(words)) ||
        PLACEHOLDERS.has(bare(words)) ||
        !/\p{L}{2,}/u.test(words)
      )
    })
}

/** The item a JSON slot belongs to: its path with the field it names left out (`social-intro[title]`, 0 → `social-intro[]`, 0). */
function itemOf(/** @type {unknown} */ jsonPath) {
  if (!Array.isArray(jsonPath) || jsonPath.length < 2) return null
  const field = String(jsonPath.at(-2))
  const shared = /\[[^[\]]*\]$/.test(field) ? field.replace(/\[[^[\]]*\]$/, '[]') : ''
  return JSON.stringify([...jsonPath.slice(0, -2), shared, jsonPath.at(-1)])
}

/**
 * Whether a JSON slot is a field of a social item: its label or field says so, or the item's link is a network's address.
 * @param {any} slot @param {any[]} near
 */
function socialItem(slot, near) {
  const item = itemOf(slot?.jsonPath)
  if (item === null) return false
  if (/social/i.test(`${slot.label ?? ''} ${String(slot.jsonPath.at(-2))}`)) return true
  return near.some(
    (s) => s !== slot && s.type === 'url' && itemOf(s.jsonPath) === item && NETWORK_ADDRESS.test(heldOf(s))
  )
}

/**
 * What an address looks like: a fragment, a site path, a URL with a scheme, a Joomla route, a mail or phone link, or a file
 * or host name (a dot or a slash in one unspaced token). A line of words is none of these.
 */
const ADDRESS =
  /^(?:#\S*|\/\S*|[a-z][a-z0-9+.-]*:\S+|index\.php\S*|[\w~%+-]+(?:[./][\w~%+-]+)+\/?(?:[?#]\S*)?)$/i

/** An alias is a slug: lower-case letters, figures and hyphens. */
const SLUG = /^[\p{Ll}\p{N}]+(?:-[\p{Ll}\p{N}]+)*$/u

/** The words of a field name that make it hold an address (`link-btn`, `href`, `image_src`), and those that make it words (`link-text`, `email_label`). */
const ADDRESS_WORDS = new Set([
  'link',
  'href',
  'url',
  'uri',
  'src',
  'srcset',
  'alias',
  'email',
  'mail',
  'mailto',
  'phone',
  'tel'
])
const TEXT_WORDS = new Set([
  'text',
  'title',
  'label',
  'name',
  'caption',
  'alt',
  'desc',
  'description',
  'heading',
  'intro'
])

/** The field a slot writes: the last named step of its JSON path, else its column. @param {any} slot */
function fieldOf(slot) {
  const named = Array.isArray(slot?.jsonPath) ? slot.jsonPath.filter((part) => typeof part === 'string') : []
  return String(named.at(-1) ?? slot?.column ?? '')
}

/** Whether a field's name says it holds an address. @param {string} field */
function namesAddress(field) {
  const words = field
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return words.some((word) => ADDRESS_WORDS.has(word)) && !words.some((word) => TEXT_WORDS.has(word))
}

/** Whether `value` may go into the address slot `slot`: an address, or a slug where the field is an alias. @param {any} slot @param {string} value */
function fitsAddress(slot, value) {
  const text = value.trim()
  if (text === '') return true
  const words = fieldOf(slot)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
  if (words.includes('alias')) return SLUG.test(text)
  // An e-mail or a phone field holds the address itself, as a visitor reads it ("0912 345 678").
  if (words.some((word) => word === 'email' || word === 'mail') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
    return true
  if (words.some((word) => word === 'phone' || word === 'tel') && /^\+?[\d\s()./-]{5,}$/.test(text))
    return true
  // A picture's path is the library's own spelling (a space is allowed in a file name): it only has to be a path.
  if (slot?.type === 'image') return /[./]/.test(text)
  return ADDRESS.test(text)
}

/**
 * Whether a slot holds an address rather than a line a visitor reads, whatever its declared type: a `url` or `image` slot, an
 * `@href`/`@src` of the markup, a column or JSON field named for one (JA Boxing 1.0.4 types `features-intro[link-btn]` as
 * text, sample "#": a Vietnamese site wrote "Xem chi tiết" into it and four pricing buttons led to `/Xem chi tiết`,
 * 25/10/2026), or a text slot whose template value is itself an address ("#", "/index.php/...", "mailto:...").
 * @param {any} slot
 */
export function isAddressSlot(slot) {
  if (!slot) return false
  if (slot.type === 'url' || slot.type === 'image') return true
  if (/\/@(?:href|src|srcset|action)$/i.test(String(slot.xpath ?? ''))) return true
  if (namesAddress(fieldOf(slot))) return true
  const held = heldOf(slot).trim()
  return (
    held !== '' && /^(?:#\S*|\/\S*|[a-z][a-z0-9+.-]*:\/\/\S+|mailto:\S+|tel:\S+|index\.php\S*)$/i.test(held)
  )
}

/**
 * Why a value must not be written into a slot because the slot holds no line of the business, or the value is no line at all;
 * null when it may be.
 * @param {any} slot
 * @param {string} value
 * @param {{ text?: string }} facts
 * @param {any[]} near - the slots of its place
 * @param {boolean} fromBrief - the value was written from the customer's brief, not translated from the template's own words
 */
function notWords(slot, value, facts, near, fromBrief) {
  const held = heldOf(slot)
  if (isAddressSlot(slot) && !fitsAddress(slot, value))
    return 'an address slot (a link, a picture, an alias): it takes an address, never words'
  // Words only: a link or a picture holds an address, and "#" over a demo company's address is a link taken off, not a placeholder.
  const words = slot?.type !== 'url' && slot?.type !== 'image'
  if (words && TEMPLATE_BLANKS.has(bare(held))) return 'the template leaves this line empty'
  if (words && isPlaceholder(value, held, facts)) return 'a placeholder, not words'
  if (!slot) return null
  const anchor = linkOf(slot, near)
  if (isNetworkName(held) && (anchor !== null || socialItem(slot, near)))
    return 'a social network’s name: it names its icon'
  if (fromBrief && anchor !== null && NAME_ATTRIBUTE.test(String(slot.xpath))) {
    const href = near.find((s) => s.type === 'url' && s.xpath === `${anchor}/@href`)
    const social =
      namesNetwork(held) || /social/i.test(String(slot.label ?? '')) || NETWORK_ADDRESS.test(heldOf(href))
    if (social || isIconLink(anchor, near))
      return 'the name of a social or icon link, not the business’s words'
  }
  return null
}

/**
 * @param {Map<string, any> | ((key: string) => any)} slotOf
 * @returns {(key: string) => any}
 */
const lookupOf = (slotOf) => (typeof slotOf === 'function' ? slotOf : (key) => slotOf.get(key))

/**
 * Split a plan's changes into what may be written and what may not.
 *
 * `dropped` states a fact nobody gave: a caller may ask for that line again. `held` is no line of the business at all (a
 * placeholder, a social or icon link's name, a line the template leaves empty): it keeps what it holds, and asking again
 * would only bring the same kind of answer back.
 * @param {Record<string, string>} changes
 * @param {Map<string, any> | ((key: string) => any)} slotOf
 * @param {ReturnType<typeof factsOf>} facts
 * @param {Iterable<any>} [slots] - every slot of the contract, for a slot's neighbours (a link's `@href`, the words inside it);
 *   read off `slotOf` when it is a Map
 * @returns {{ kept: Record<string, string>, dropped: Array<{ key: string, reason: string }>, held: Array<{ key: string, reason: string }> }}
 */
export function guardChanges(changes, slotOf, facts, slots = slotOf instanceof Map ? slotOf.values() : []) {
  const lookup = lookupOf(slotOf)
  const places = neighbourhood(slots)
  /** @type {Record<string, string>} */
  const kept = {}
  const dropped = []
  const held = []
  for (const [key, value] of Object.entries(changes)) {
    const slot = lookup(key)
    const not = notWords(slot, String(value), facts, places.get(placeOf(slot)) ?? [], true)
    if (not) {
      held.push({ key, reason: not })
      continue
    }
    const reason = ungrounded(String(value), String(slot?.sample ?? ''), facts)
    if (reason) dropped.push({ key, reason })
    else kept[key] = value
  }
  return { kept, dropped, held }
}

/**
 * The last look at the lines a run is about to write, whatever step made them (the plan, a translation of the template's own
 * words, the demo company renamed): no placeholder goes in, a line the template leaves empty stays so, and a social network's
 * name stays the network's ("Google plus" never becomes "Google cộng"). A translation of an icon link's own name is allowed
 * here; keeping the brief's words out of it is `guardChanges`'s.
 * @param {Record<string, string>} changes
 * @param {Map<string, any> | ((key: string) => any)} slotOf
 * @param {ReturnType<typeof factsOf>} facts
 * @param {Iterable<any>} [slots]
 * @returns {{ kept: Record<string, string>, held: Array<{ key: string, reason: string }> }}
 */
export function guardWritten(changes, slotOf, facts, slots = slotOf instanceof Map ? slotOf.values() : []) {
  const lookup = lookupOf(slotOf)
  const places = neighbourhood(slots)
  /** @type {Record<string, string>} */
  const kept = {}
  const held = []
  for (const [key, value] of Object.entries(changes)) {
    const slot = lookup(key)
    const not = notWords(slot, String(value), facts, places.get(placeOf(slot)) ?? [], false)
    if (not) held.push({ key, reason: not })
    else kept[key] = value
  }
  return { kept, held }
}
