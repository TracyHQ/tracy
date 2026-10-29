/**
 * The residue sweep's plan: the host QA's residue items (`apps/tracy-host/src/demo-qa.js` `residueOf`) turned into
 * the site tool calls that clear them, run by dsh after the agent's turn and before the check counts
 * (`demo-lifecycle.mjs`). Pure: no I/O.
 *
 * 🔒 REPLACE, NEVER REMOVE (product owner, 24/10/2026). Every call replaces: a `content.replace` of words, a post's
 * own update call of its date and title, a `link` or an `image` the dsh sweep resolves per platform in the record
 * that keeps it (`tracy-site-tools` `sweep-resolve.mjs`). 🔒 NO FILLER STANDS IN FOR A FACT (plan §7; product owner,
 * 27/10/2026): words with no collected fact become what `placeholderFor` of the Website Opportunities domain leaves, so a
 * dish's name reads the neutral item name of its kind and every other field (a price, a description, a passage) is
 * empty; nothing of `neutral-copy/forbidden.json` is ever written. A
 * template post's date becomes the build day, a button goes back to the page it names and a template link to
 * Contact, a template picture becomes one the business's own import holds. Nothing is hidden, unpublished or
 * deleted.
 *
 * 🔒 THE REPLACE JOB'S OWN GUARDS STAY ON. A replace carries `expect`: the number of places the page read
 * showed the words, so a substring the read did not see ("Ask" inside "Ask about…") makes the job refuse
 * (COUNT_MISMATCH) instead of writing it; a refusal is reported, never retried wider. The longest words go first,
 * so a passage is cleared before a short label it holds is looked for.
 *
 * A whole template passage is the one exception: its words are a block's, so wherever the page holds them it is
 * that passage, and a page often holds it in more places than a visitor sees (a carousel's copy, a hidden tab) or
 * in fewer than the read counted. It goes without `expect`, under the job's own confirm-count rule: at most five
 * places, each matched exactly, else it refuses (lrsweep rig, 24/10/2026: Home's address met two places, read once).
 *
 * 🔒 ONE PAGE, ITS OWN COUNT: `all:"page"`, never `all:true` (review 24/10/2026). `expect` counts one page's read,
 * and `all:true` makes the job count every page of the site (`replace.mjs`), so a dish on Home and on /menu/ was
 * two calls of `expect:1` that each met two places and both refused.
 *
 * Idempotent: a site already swept shows no residue, so it plans nothing.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { neutralFor } from 'website-opportunities/domain/neutral-copy.mjs'
import { placeholderFor } from 'website-opportunities/domain/section-fills.mjs'
import { headOf as titleHeadOf, isPlaceholderText } from 'website-opportunities/domain/editorial-guide.mjs'
import {
  anchorHrefsOf,
  blockUrlsOf,
  dataHrefsOf,
  movedHref,
  postMoves,
  routeKey,
  sameRecord,
  slugFieldOf,
  slugOf,
  storedSlugOf,
  takenSlugsOf,
  uniqueSlug
} from './post-routes.js'

// 🔒 ONE LIST OF WHAT THE REPLACE JOB NEVER EMPTIES (review 26/10/2026): read from site-tools' own leaf
// (`empty-rules.mjs`, which `replace.mjs` imports), copied into the web image beside `src/` (Dockerfile), never a copy
// kept here that drifts from the job.
const EMPTY_RULES_IMAGE = new URL('../site-tools/empty-rules.mjs', import.meta.url)
const EMPTY_RULES_CHECKOUT = new URL(
  '../../../../packages/tools/tracy-site-tools/src/host/empty-rules.mjs',
  import.meta.url
)
const { CANNOT_EMPTY, TEXT_BLOCK } = await import(
  existsSync(EMPTY_RULES_IMAGE) ? EMPTY_RULES_IMAGE.href : EMPTY_RULES_CHECKOUT.href
)

/** The replace job's `expect` ceiling (`REPLACE_MAX_TARGETS` in `tracy-site-tools` `replace.mjs`). */
const EXPECT_MAX = 40
/**
 * How many places the replace job writes without `expect`, each one exact (`REPLACE_CONFIRM_OVER` in
 * `replace.mjs`).
 */
const CONFIRM_OVER = 5
/**
 * How many changes one sweep round takes, the check after it finding what is left. It counts pairs, not calls: with
 * `batches` one call carries a page's pairs (`onePerPage`), so fewer calls go, while each lane's share of a round and
 * what `left` counts stay as they were. 🔒 240, NOT 120 (local measure 29/10/2026): every round ends in a read of the
 * whole site, and JA Restaurant on WordPress (48 pages, four of them showcase copies of the home page) needed ~830 —
 * six rounds of 120 reached `SWEEP_ROUNDS_MAX` with words left, and a counted check ran on them.
 */
export const SWEEP_MAX_CALLS = 240
/** How many pairs one `content.replace` call carries (`REPLACE_MAX_CHANGES` in `tracy-site-tools` `replace.mjs`). */
const CHANGES_MAX = 20
/** How many characters of a text the page read keeps (`TEXT_MAX` in tracy-host `demo-residue-page.js`). */
const READ_LIMIT = 2000
/** The longest words one replace looks for (`REPLACE_FIND_MAX` in `tracy-site-tools` `replace.mjs`). */
const FIND_MAX = 500

/** A text the read cut at its limit, up to its last whole word; any other text as it is. */
function wholeWordsOf(text) {
  if (typeof text !== 'string' || text.length < READ_LIMIT) return text
  const end = text.search(/\s\S*$/)
  return end > 0 ? text.slice(0, end).trimEnd() : text
}

/** The longest head of a text up to `max` characters that ends on a whole word, and what is left after it. */
function headOf(text, max) {
  if (text.length <= max) return [text, '']
  const cut = text.slice(0, max + 1).lastIndexOf(' ')
  const end = cut > 0 ? cut : max
  return [text.slice(0, end).trimEnd(), text.slice(end).trimStart()]
}

/**
 * 🔒 A LONG TEXT IS REPLACED WHOLE (product owner, 25/10/2026): one replace looks for at most `FIND_MAX` characters,
 * so a long template paragraph kept everything after its head. Its head becomes the replacement, then each next part is
 * looked for joined to the replacement already written before it ("Menu item <next words>") and becomes it again; an
 * empty replacement leaves nothing to join, so each next part is looked for alone. The calls run in this order
 * (`demo-lifecycle.mjs`).
 * @returns {string[]} what each call looks for, in order
 */
function partsOf(text, to) {
  const [head, rest] = headOf(text, FIND_MAX)
  const parts = [head]
  // A replacement too long to join leaves room for no words: the head alone, as before.
  const room = to === '' ? FIND_MAX : FIND_MAX - to.length - 1
  for (let left = rest; left !== '' && room >= 40; ) {
    const [part, after] = headOf(left, room)
    parts.push(to === '' ? part : `${to} ${part}`)
    left = after
  }
  return parts
}

/**
 * The site's language, where the build recorded it for its slot fills (`content.writes['slot-fill'].locale`, as the
 * agent's prompt reads it, `renderAgentPrompt`); English when the build recorded none. A language the neutral set lacks
 * falls back in `neutralFor` itself.
 * @param {{content?: {writes?: Record<string, {locale?: string}>}} | null | undefined} build
 */
export const siteLocaleOf = (build) => build?.content?.writes?.['slot-fill']?.locale ?? 'en'

/** Why a linked title with no sourced words is left as it is (`planSweep`): neither label fits a post's or a page's name. */
export const LINKED_TITLE_WHY =
  'a linked title: no sourced title for what it links, and a neutral word would rename the post or page it names'

const HEADING_TAG = /^h[1-6]$/
// The residue fields whose words a heading may show as its own, so the neutral heading may stand in for them.
const HEADING_WORDS = new Set(['text', 'text-rest', 'title'])
const tagOf = (segment) => /^[a-z][a-z0-9-]*/.exec(String(segment ?? '').trim())?.[0] ?? ''
const squashed = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
// A link that names a category or a tag: no role of the neutral set fits it.
const TERM_LINK = /[.#][\w-]*(?:tag|taxonom|categor|badge|chip)/i
const pathOf = (href) =>
  URL.canParse(String(href ?? ''), 'https://site.invalid')
    ? new URL(String(href), 'https://site.invalid').pathname.replace(/\/+$/, '')
    : null

/**
 * The elements holding a residue item's words, nearest first: the page reader's chain from the words' own element up
 * to their block and any link around it (`holder`, `demo-residue-page.js`), else the two its selector names
 * (`parent > el`, from an older read).
 * @param {{holder?: string[], selector?: string | null}} item
 */
function wordsHolderOf(item) {
  if (Array.isArray(item.holder) && item.holder.length > 0)
    return item.holder.map((t) => tagOf(t)).filter(Boolean)
  return String(item.selector ?? '')
    .split('>')
    .map(tagOf)
    .filter(Boolean)
    .reverse()
}

/**
 * The slot a residue item's words fill, by its nearest meaningful element, not only its own tag and its parent: words
 * anywhere inside a heading (`h2 > span`, `h3 > strong > em`) are the heading's; a heading's link, or a heading inside a
 * link (a card), is a title naming the post or page it opens, never a contact label nor a block heading; a link or a
 * button elsewhere is a call to act, unless it names a term (a tag); a phone, an email, a web address or a street
 * address is a contact `fact` wherever it sits. `refused` is the element
 * the replace job would refuse to leave empty (`CANNOT_EMPTY`): the link or button the words sit in, or a heading, list
 * item or button whose words they are, whole (`emptiedElement` in site-tools `replace.mjs`).
 * @param {{field?: string, text?: string, block?: string, holder?: string[], selector?: string | null}} item
 * @param {string} find
 * @returns {{role: 'title' | 'fact' | 'heading' | 'cta' | null, refused: string | null}}
 */
export function slotOf(item, find = String(item.text ?? '')) {
  const tags = wordsHolderOf(item)
  const heading = tags.some((t) => HEADING_TAG.test(t))
  const link = tags.find((t) => t === 'a' || t === 'button') ?? null
  // A post title the check names with another page's address: the card's link, whatever the selector kept of it. On
  // the post's own page a heading its stored title does not hold is the body's, worded like any other.
  const linksElsewhere =
    item.field === 'title' && typeof item.post === 'string' && pathOf(item.post) !== pathOf(item.page)
  // A contact fact is a fact wherever it sits, never a heading's or a button's words (`neutralOfSlot`).
  // The neutral heading fits the template's words only (filler, a sample name, its text, a card's or a post body's
  // unlinked heading), never a price or a dish's line a heading shows: that one has no role.
  const role = linksElsewhere
    ? 'title'
    : contactKindOf(item)
      ? 'fact'
      : heading && tags.includes('a')
        ? 'title'
        : heading
          ? HEADING_WORDS.has(item.field)
            ? 'heading'
            : null
          : link && !TERM_LINK.test(String(item.selector ?? ''))
            ? 'cta'
            : null
  const block = tags.find((t) => TEXT_BLOCK.has(t)) ?? null
  const shown = typeof item.block === 'string' ? squashed(item.block) : null
  // The page read keeps a block's first 160 characters: a longer one is whole when the words begin with all of it.
  const whole =
    shown === null
      ? tags[0] === block
      : shown === squashed(find) || (shown.length >= 160 && squashed(find).startsWith(shown))
  const refused =
    link && CANNOT_EMPTY.has(link) ? link : block && CANNOT_EMPTY.has(block) && whole ? block : null
  return { role, refused }
}

/** Why a slot the replace job refuses to empty is left as it is (`planSweep`). @param {{role: string | null, refused: string}} slot */
const refusedWhy = (slot) =>
  slot.role === 'fact'
    ? `a contact fact with no sourced value: the replace job refuses to empty a ${slot.refused}, and no neutral wording stands for a fact`
    : slot.role === 'cta'
      ? `the replace job refuses to empty a ${slot.refused}, and the site has no Contact page for its neutral label`
      : `the replace job refuses to empty a ${slot.refused}, and no neutral wording fits its role`

/**
 * What a residue field's words become when nothing sourced replaces them (`placeholderFor`, plan §7): a dish's name the
 * neutral item name of the business's kind, a price empty, anything else null (the slot decides, `neutralOfSlot`).
 * @param {{field?: string}} item @param {{kind?: string, locale?: string}} words
 */
function placeholderOf(item, words) {
  if (item.field === 'dish-name') return placeholderFor('dish-name', words) ?? ''
  if (item.field === 'dish-price' || item.field === 'price') return placeholderFor('price', words) ?? ''
  return null
}

/**
 * 🔒 A SLOT THAT CANNOT BE EMPTIED TAKES ITS ROLE'S NEUTRAL WORDING (product owner, 27/10/2026): a heading the neutral
 * block heading (`editorial.heading`, "Overview"), a link or button the contact label when the site has a Contact page
 * (`contact.cta_label`), in the site's language (`neutralFor`). Empty when no role fits (a list item, a tag) or the
 * contact label would promise what the site lacks; the sweep then plans no call and names the slot unresolved. A contact
 * fact never takes either (review 26/10/2026: a template phone in `h2 > span` became "Overview"): with no sourced
 * value it is left empty where the job allows, else unresolved.
 * @param {{role: string | null}} slot @param {{locale?: string, contactPath?: string | null}} words
 */
function neutralOfSlot(slot, { locale = 'en', contactPath = null } = {}) {
  if (slot.role === 'heading')
    return neutralFor({
      role: 'editorial.heading',
      policy: { policy: 'neutral_key', key: 'neutral.heading.overview' },
      locale
    }).text
  if (slot.role === 'cta')
    return neutralFor({ role: 'contact.cta_label', locale, business: { contactPage: contactPath } }).text
  return ''
}

/**
 * 🔒 A SHORT HEADING NAMING THE TEMPLATE'S BUSINESS TAKES THE BUSINESS'S NAME (product owner, build 13, 25/10/2026):
 * About's "Meet Three BroomSticks" becomes "Meet The Willow Nook", its other words kept. Null for any other item, or
 * when the research gives no name, so the placeholder stands in.
 * @param {{text?: string, short?: boolean, templateName?: string}} item @param {string | null} name
 */
function namedFor(item, name) {
  if (!item.short || typeof item.templateName !== 'string' || typeof name !== 'string' || name.trim() === '')
    return null
  const words = item.templateName.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${words.join('[^\\p{L}\\p{N}]+')}(?![\\p{L}\\p{N}])`, 'iu')
  const swapped = String(item.text ?? '').replace(re, () => name.trim())
  return swapped === item.text ? null : swapped
}

/**
 * The contact fact a template text stands for, by its words' shape, else by the element that holds it: a phone number,
 * an email, a web address or a street address (`span.contact-street`). Null for any other text.
 * @param {{text?: string, selector?: string | null}} item
 * @returns {'phone' | 'email' | 'website' | 'address' | null}
 */
function contactKindOf(item) {
  const text = String(item.text ?? '').trim()
  if (text === '' || text.length > 120) return null
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(text)) return 'email'
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(text)) return 'website'
  if (/^[+(\d][\d\s().\-+/]*$/.test(text) && text.replace(/\D/g, '').length >= 7) return 'phone'
  const where = String(item.selector ?? '').toLowerCase()
  if (/street|address|adr\b|location/.test(where)) return 'address'
  return null
}

/**
 * 🔒 A TEMPLATE'S CONTACT FACT TAKES THE BUSINESS'S, NEVER "Coming soon" (product owner, 25/10/2026): the JA Diner
 * Contact page prints its own street, phone and website through the theme, and the sweep wrote the placeholder over
 * each though the research held all three (The Willow Nook local). The research's fact when it has that kind, else null.
 * @param {{text?: string, selector?: string | null}} item
 * @param {Partial<Record<'phone' | 'email' | 'website' | 'address', string>>} contact
 */
function contactFactOf(item, contact) {
  const kind = contactKindOf(item)
  const fact = kind ? contact?.[kind] : null
  return typeof fact === 'string' && fact.trim() !== '' ? fact.trim() : null
}

/** Whether a template text is prose the agent writes (a sentence of six words or more), not a label or a dish. */
function isProse(item) {
  if (item.field !== 'text' && item.field !== 'text-rest') return false
  return (
    String(item.whole ? (item.passage ?? item.text) : (item.text ?? ''))
      .trim()
      .split(/\s+/).length >= 6
  )
}

/** One key for a path, whatever its trailing slash. */
const pathKey = (p) =>
  String(p ?? '/')
    .split(/[?#]/)[0]
    .replace(/(.)\/+$/, '$1')
    .toLowerCase() || '/'

/** A record's route as a path: WordPress and Joomla keep the path, EmDash a `{pattern}` with the slug filled. */
export const routePath = (r) =>
  typeof r === 'string' ? r : typeof r?.pattern === 'string' ? r.pattern : null

/** Whether an inventory record is a post the platform's sweep can date and title. */
function isPost(record, platform) {
  if (platform === 'wordpress') return record.identity?.kind === 'post'
  if (platform === 'joomla') return record.identity?.kind === 'article'
  if (platform === 'emdash') return typeof record.identity?.collection === 'string'
  return false
}

/** The site's post at an address (a list card's title link, or a single post's own page), or null. */
function postAt(address, inventory, origin, platform) {
  let route = null
  try {
    route = pathKey(new URL(address, origin).pathname)
  } catch {
    return null
  }
  return (
    inventory.find(
      (r) =>
        isPost(r, platform) &&
        (r.routes ?? []).some((p) => routePath(p) !== null && pathKey(routePath(p)) === route)
    ) ?? null
  )
}

/**
 * 🔒 EACH PLATFORM'S OWN DATE FIELD, NEVER A GUESS (product owner, 24/10/2026): WordPress `post_date`, Joomla
 * `publish_up` (`created` is not writable through the door), EmDash the collection's own `dateField` (Bravada's
 * is `date`), in the shape the field already keeps. A collection that names none has no date the sweep can set: the item
 * is reported.
 * @returns {{field: string, value: string} | null}
 */
function dateFieldOf(record, platform, buildDate) {
  if (platform === 'wordpress') return { field: 'post_date', value: `${buildDate} 00:00:00` }
  if (platform === 'joomla') return { field: 'publish_up', value: `${buildDate} 00:00:00` }
  if (platform === 'emdash' && typeof record.dateField === 'string' && record.dateField !== '') {
    // In the shape the field keeps: Tracy Base 0.5.6 stores a full ISO time and refuses a bare day (lrsweep rig,
    // 25/10/2026: `[VALIDATION_ERROR] date: Invalid input` on 38 posts).
    const kept = record.data?.[record.dateField]
    const iso = typeof kept === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(kept)
    return { field: record.dateField, value: iso ? `${buildDate}T00:00:00.000Z` : buildDate }
  }
  return null
}

/** The post's title field: WordPress `post_title`, Joomla `title`, EmDash the collection's `titleField`. */
function titleFieldOf(record, platform) {
  if (platform === 'wordpress') return 'post_title'
  if (platform === 'joomla') return 'title'
  return typeof record.titleField === 'string' && record.titleField !== '' ? record.titleField : 'title'
}

/**
 * Whether a shown heading is the stored title: the same words whatever case a theme prints them in. A title the
 * inventory did not read is taken as the heading's, as before.
 */
function titleIs(stored, shown) {
  if (typeof stored !== 'string') return true
  const words = (t) => proseOf(t).replace(/&amp;/g, '&').toLowerCase()
  return words(stored) === words(shown)
}

/** A body's words: its markup, block comments and spacing taken out. */
const proseOf = (body) =>
  String(body ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Whether a live body still holds the frozen template's words, whatever pictures changed around them. */
const proseStill = (frozen, live) =>
  typeof frozen === 'string' &&
  typeof live === 'string' &&
  proseOf(frozen) !== '' &&
  proseOf(live) === proseOf(frozen)

/** Words too common to say what a text is about. */
const COMMON = new Set(
  'about after also been before being from have here into just like made make more most much only other over some such than that their them then there these they this those very what when where which while with your'.split(
    ' '
  )
)

/** The words of four letters or more a text is about, lower-cased. */
const topicWordsOf = (text) =>
  new Set(
    (
      proseOf(text)
        .toLowerCase()
        .match(/\p{L}{4,}/gu) ?? []
    ).filter((w) => !COMMON.has(w))
  )

/** A text as one sentence, ending on its own stop. */
const sentenceOf = (text) => {
  const t = proseOf(text)
  return t === '' || /[.!?…]$/u.test(t) ? t : `${t}.`
}

/** A post's stored excerpt and body, on WordPress, Joomla or EmDash. */
const excerptOf = (data) => data?.post_excerpt ?? data?.excerpt
const postBodyOf = (data) => data?.post_content ?? data?.introtext ?? data?.content ?? data?.body

/**
 * The lead a blog card showing a template post's excerpt takes: that post's own, as the agent wrote it (its excerpt,
 * else its body's first sentence). Looked up by the card's words, which the template's excerpt or body opens with.
 * Null for words no template post opens with, or a post still holding the template's text or only a placeholder.
 * @param {Array<Record<string, any>>} templatePosts @param {Array<Record<string, any>>} inventory
 * @returns {(words: string) => string | null}
 */
function postLeads(templatePosts, inventory) {
  const key = (text) => proseOf(text).replace(/&amp;/g, '&').toLowerCase()
  const cards = []
  for (const frozen of templatePosts) {
    const live = inventory.find(
      (r) =>
        r.identity?.id === frozen.identity?.id &&
        (r.identity?.collection ?? null) === (frozen.identity?.collection ?? null) &&
        (r.identity?.kind ?? null) === (frozen.identity?.kind ?? null)
    )
    if (!live) continue
    const own = [excerptOf(live.data), postBodyOf(live.data)]
      .map((text, i) => {
        const was = i === 0 ? excerptOf(frozen.data) : postBodyOf(frozen.data)
        if (typeof text !== 'string' || key(text) === '' || key(text) === key(was) || isPlaceholderText(text))
          return null
        return i === 0 ? sentenceOf(text) : sentenceOf(proseOf(text).split(/(?<=[.!?…])\s/u)[0])
      })
      .find(Boolean)
    if (!own) continue
    const opens = [excerptOf(frozen.data), postBodyOf(frozen.data)].map(key).filter((t) => t.length >= 20)
    if (opens.length > 0) cards.push({ opens, own })
  }
  return (words) => {
    const shown = key(String(words ?? '').replace(/(?:\s*(?:…|\.\.\.|\[…\]))+$/u, ''))
    if (shown.length < 20) return null
    return cards.find((card) => card.opens.some((open) => open.startsWith(shown)))?.own ?? null
  }
}

/** A post's opening sentence, its excerpt: the post's own first words. */
const firstSentenceOf = (text) =>
  proseOf(text)
    .match(/^[^.!?…]+[.!?…]+["”’)]*/u)?.[0]
    ?.trim() ?? proseOf(text)

/** Research words written into a paragraph's markup. */
const escapeText = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** How many research facts one post's body takes. */
const BODY_FACTS = 2

/**
 * 🔒 A POST'S BODY IS WRITTEN FROM THAT POST'S OWN MATERIAL, NEVER ONE LINE FOR EVERY POST (product owner, round 10,
 * 25/10/2026): build 13's sweep would have given all 22 posts the research's hero lead, one sentence repeated 22
 * times, which is filler. A body left as the template's takes the post's own excerpt the agent wrote, then up to
 * `BODY_FACTS` research facts sharing a word with the title or excerpt the agent wrote; with no related fact, its
 * excerpt alone; with neither, null, so the placeholder stands in. A sentence one post's body took is never written
 * into another's (`used`).
 * @param {{title: string | null, excerpt: string | null}} own @param {string[]} facts @param {Set<string>} used
 * @returns {string | null}
 */
function ownBodyOf(own, facts, used) {
  const key = (s) => s.toLowerCase()
  const parts = []
  const excerpt = own.excerpt ? sentenceOf(own.excerpt) : ''
  if (excerpt !== '' && !used.has(key(excerpt))) parts.push(excerpt)
  const about = topicWordsOf(`${own.title ?? ''} ${own.excerpt ?? ''}`)
  let taken = 0
  for (const fact of facts) {
    if (taken === BODY_FACTS) break
    const line = sentenceOf(fact)
    if (line === '' || used.has(key(line)) || parts.includes(line)) continue
    if (![...topicWordsOf(line)].some((w) => about.has(w))) continue
    parts.push(line)
    taken += 1
  }
  if (parts.length === 0) return null
  for (const p of parts) used.add(key(p))
  return parts.join(' ')
}

/** One post's fields as the platform's own update call, with what each held when planned (`was`). */
function postUpdate(record, platform, fields, was, slug = null, slugFrom = null) {
  const seen = { ...(was ? { was } : {}), ...(slugFrom ? { slugFrom } : {}) }
  if (platform === 'emdash')
    return {
      action: 'content_update',
      params: {
        collection: record.identity.collection,
        id: record.identity.id,
        ...(record.identity.locale ? { locale: record.identity.locale } : {}),
        data: fields,
        // EmDash keeps an entry's slug beside its data, a parameter of its own (`content_update` `slug`).
        ...(slug ? { slug } : {}),
        ...seen,
        // Without it EmDash only stages a draft: the page keeps the template's words. Never puts an entry live
        // that was not.
        ...(record.publication?.status === 'published' ? { status: 'published' } : {})
      }
    }
  return {
    action: 'content.update',
    params: { kind: platform === 'joomla' ? 'article' : 'post', id: record.identity.id, fields, ...seen }
  }
}

/**
 * 🔒 ONE OWNER PER POST'S SLUG (product owner, 26/10/2026): a post whose title the sweep writes takes its slug from
 * that title in the same write — WordPress `post_name`, Joomla `alias` in its fields, an EmDash entry's `slug` beside
 * its data (`known.slug`), each with what it held when planned (`was`), so the resolver drops it once the agent
 * changed it. A post whose slug is no longer the template's, or that the agent's plan writes, is the agent's: never
 * written. Joomla and EmDash slugs are made unique in their scope here, the ones this plan gives included;
 * WordPress makes its own unique and the resolver reads back what it stored.
 * @param {Map<any, {record: Record<string, any>, fields: Record<string, any>, slug?: string, slugFrom?: string}>} posts
 */
function slugsWithTitles(posts, { platform, inventory, templatePosts, checksLeft, unresolved }) {
  const field = slugFieldOf(platform)
  const view = [...inventory]
  for (const known of posts.values()) {
    const { record } = known
    const heading = known.fields[titleFieldOf(record, platform)]
    if (typeof heading !== 'string') continue
    const frozen = templatePosts.find((f) => sameRecord(f, record))
    if (!frozen) continue
    const page = routePath(record.routes?.[0]) ?? null
    const was = storedSlugOf(frozen, platform)
    const now = storedSlugOf(record, platform)
    const written = checksLeft > 0 && Array.isArray(frozen.written) ? frozen.written : []
    if (!field || now === null || was === null) {
      unresolved.push({
        page,
        field: 'slug',
        why: field
          ? "the post's slug was not read, so its title is written without one: its address keeps the template's"
          : `no slug field is known on ${platform}`
      })
      continue
    }
    if (now !== was || written.includes(field)) continue
    const base = slugOf(heading)
    if (!base) {
      unresolved.push({ page, field: 'slug', why: 'the new title has no letter or digit to make a slug of' })
      continue
    }
    const slug = platform === 'wordpress' ? base : uniqueSlug(base, takenSlugsOf(record, platform, view))
    if (slug === now) continue
    if (platform === 'emdash') known.slug = slug
    else known.fields[field] = slug
    // The title the slug was made of: the resolver writes the slug only beside it (`sweep-resolve.mjs` `slugKept`).
    known.slugFrom = titleFieldOf(record, platform)
    const at = view.findIndex((r) => sameRecord(r, record))
    const renamed =
      platform === 'emdash'
        ? { ...record, identity: { ...record.identity, slug } }
        : { ...record, data: { ...record.data, [field]: slug } }
    if (at >= 0) view[at] = renamed
    else view.push(renamed)
  }
}

/**
 * 🔒 LINKS FOLLOW THE SLUG (product owner, 26/10/2026): a template post whose route moved since the frozen inventory
 * (the agent gave it a slug, or an earlier sweep round did) leaves every stored link to its old route on a page it
 * no longer answers. Each record of the live inventory holding such a link — a page's or post's body, a WordPress
 * navigation block, a Joomla module or URL menu item, an EmDash entry's link field or menu item — gets one `link`
 * call per address it holds, written in that record only, counted (`expect`), in the form the address was written.
 * A record the resolver has no write for (a WordPress template part) is reported.
 * @returns {Array<{action: string, params: Record<string, any>}>}
 */
function oldRouteLinks({ platform, inventory, templatePosts, origin, unresolved }) {
  const moves = postMoves(templatePosts, inventory, platform, () => true).filter(
    (m) => m.route && routeKey(m.was) !== '/' && routeKey(m.route) !== routeKey(m.was)
  )
  if (moves.length === 0) return []
  const calls = []
  const hrefsOf = (r) => {
    if (platform === 'emdash')
      return r.identity?.kind === 'menu'
        ? (r.data?.items ?? []).map((i) => i?.url).filter((u) => typeof u === 'string')
        : r.identity?.collection
          ? dataHrefsOf(r.data)
          : []
    if (platform === 'joomla')
      return r.identity?.kind === 'menuItem'
        ? typeof r.data?.link === 'string'
          ? [r.data.link]
          : []
        : ['introtext', 'fulltext', 'content'].flatMap((f) => anchorHrefsOf(r.data?.[f]))
    return [...anchorHrefsOf(r.data?.post_content), ...blockUrlsOf(r.data?.post_content)]
  }
  for (const record of inventory) {
    if (record.publication?.deletedAt) continue
    const counts = new Map()
    for (const href of hrefsOf(record)) counts.set(href, (counts.get(href) ?? 0) + 1)
    for (const [href, count] of counts) {
      const move = moves.find((m) => movedHref(href, m.was, m.route, origin) !== null)
      if (!move) continue
      const to = movedHref(href, move.was, move.route, origin)
      const path = routePath(record.routes?.[0]) ?? null
      if (record.identity?.id === undefined) {
        unresolved.push({
          page: path,
          href,
          to,
          field: 'link',
          why: `a ${record.identity?.kind ?? 'record'} with no id links the post's old route; the sweep writes posts, pages, menus and modules only`
        })
        continue
      }
      const menu = platform === 'emdash' && record.identity.kind === 'menu'
      const menuItem = platform === 'joomla' && record.identity.kind === 'menuItem'
      calls.push({
        action: 'link',
        params: {
          platform,
          path,
          href,
          to,
          ...(menu ? { menu: record.data?.name } : { records: [holderOf(record)] }),
          ...(menuItem ? { targetLink: to } : { expect: count })
        }
      })
    }
  }
  return calls
}

/** The words of a body as the page shows them: markup's text, or the text of Portable Text's spans (EmDash). */
const bodyProseOf = (value) =>
  typeof value === 'string'
    ? proseOf(value)
    : Array.isArray(value)
      ? proseOf(
          value
            .flatMap((block) =>
              Array.isArray(block?.children)
                ? block.children.map((span) => (typeof span?.text === 'string' ? span.text : ''))
                : []
            )
            .join(' ')
        )
      : ''

/**
 * The fields of a Joomla article or an EmDash entry that hold its body, as the template left them: an article's
 * `introtext`, then its `fulltext`; an entry's `content`, else its `body`. Only fields holding words.
 * @param {Record<string, any> | undefined} data @param {string} platform
 * @returns {string[]}
 */
function bodyFieldsOf(data, platform) {
  if (platform === 'joomla') return ['introtext', 'fulltext'].filter((f) => bodyProseOf(data?.[f]) !== '')
  if (platform === 'emdash')
    return ['content', 'body'].filter((f) => bodyProseOf(data?.[f]) !== '').slice(0, 1)
  return []
}

/**
 * A research body in the shape the template's field keeps it: a paragraph of markup for a Joomla article or an
 * EmDash text field, one Portable Text block per paragraph for an EmDash rich-text field.
 * @param {string} body @param {unknown} template
 */
function bodyValueOf(body, template) {
  if (!Array.isArray(template)) return `<p>${escapeText(body)}</p>`
  const key = createHash('sha256').update(body).digest('hex').slice(0, 12)
  return [
    {
      _type: 'block',
      _key: key,
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: `${key}s`, text: body, marks: [] }]
    }
  ]
}

/** The lane a residue item's call is planned in, so one kind never starves another (`SWEEP_MAX_CALLS`). */
function laneOf(field) {
  if (field === 'dish-price' || field === 'price') return 'price'
  if (field === 'dish-name' || field === 'dish-desc') return 'dish'
  if (field === 'title') return 'title'
  return 'passage'
}

/**
 * 🔒 EVERY KIND HAS ITS SHARE (lrsweep rig, 24/10/2026): one longest-first list cut at the cap left a real site's
 * first sweep with no date and no link at all. Calls are taken from each lane in turn up to the cap; what is left
 * is the next round's, since the check after the sweep finds it again.
 * @param {Record<string, Array<{action: string, params: Record<string, any>}>>} lanes
 */
function fairShare(lanes, max) {
  // A lane entry is one call or a run of calls that go together, in their order (`partsOf`): taken whole or not at
  // all, so a round never stops a long text half replaced.
  const queues = Object.values(lanes).map((l) => l.map((e) => (Array.isArray(e) ? e : [e])))
  const picked = []
  let count = 0
  while (count < max && queues.some((q) => q.length > 0))
    for (const q of queues) {
      if (q.length === 0 || count >= max) continue
      if (count + q[0].length > max) {
        q.length = 0
        continue
      }
      count += q[0].length
      picked.push(q.shift())
    }
  // Longest words first whatever their lane, so a passage is cleared before a name it holds is looked for.
  const words = picked.filter(isWords)
  const rest = picked.filter((g) => !words.includes(g))
  return [...words.sort((a, b) => b[0].params.find.length - a[0].params.find.length), ...rest]
}

/** Whether a lane entry replaces words, not a link's address. */
const isWords = (g) => g[0].action === 'content.replace' && !g[0].params.href

/** Words as the replace job compares them: one case, one space (`demo-lifecycle.mjs` `wordsKey`). */
const wordsKey = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * ONE PAGE'S WORDS, ONE CALL, ONE WRITE OF EACH RECORD (dev, ja-diner WordPress, 27/10/2026): one call per
 * (page, words) saved the same record once per pair, so four colour copies of Home took 58 saves each in one check, a
 * second or two apart. The pairs a round took for a page go as one `content.replace` with `changes`, each pair
 * carrying the count its read gave (`expect`, counted on its own by the job), and the job saves each record it
 * changes once. The same words on five pages are still five calls: each page is its own count (`all:"page"`).
 *
 * The order the sequential sweep gave stays where it matters: a pair whose words an earlier, longer pair of its page
 * holds waits for a later call (a passage before a label inside it, else the job refuses the two as one overlap), and
 * each next part of a long text waits for the part before it (`partsOf`). A call carries at most `CHANGES_MAX` pairs
 * and `EXPECT_MAX` places, and the places no `expect` counts (a whole passage, a category's name) at most
 * `CONFIRM_OVER`, so a call stays within what the job writes unasked; a page past that takes more calls. A
 * single pair goes in the shape it always had.
 *
 * The job writes a call whole or not at all (`locateAll`); dsh sets a refused pair aside, reports it as that pair's
 * own refusal and sends the rest again, and a refusal naming no pair has each pair sent alone, as before
 * (`demo-lifecycle.mjs` `sweepRound`).
 * @param {Array<Array<{action: string, params: Record<string, any>}>>} groups - `fairShare`'s picks, in order
 * @param {WeakMap<object, number>} looseCount - the places the read showed for a pair sent without `expect`
 */
function onePerPage(groups, looseCount) {
  const words = groups.filter(isWords)
  const rest = groups.filter((g) => !isWords(g)).flat()
  /** @type {Map<string, Array<{params: Record<string, any>, find: string, layer: number}>>} */
  const pages = new Map()
  for (const run of words) {
    let after = -1
    for (const { params } of run) {
      const page = pages.get(params.path) ?? []
      const find = wordsKey(params.find)
      let layer = after + 1
      for (const q of page) if (q.find.includes(find)) layer = Math.max(layer, q.layer + 1)
      page.push({ params, find, layer })
      pages.set(params.path, page)
      after = layer
    }
  }
  /** @type {Array<{layer: number, longest: number, pairs: Array<Record<string, any>>}>} */
  const batches = []
  for (const page of pages.values()) {
    const layers = [...new Set(page.map((q) => q.layer))].sort((a, b) => a - b)
    for (const layer of layers) {
      let open = null
      for (const { params } of page.filter((q) => q.layer === layer)) {
        const counted = typeof params.expect === 'number'
        const places = counted ? params.expect : (looseCount.get(params) ?? CONFIRM_OVER)
        const fits =
          open !== null &&
          open.pairs.length < CHANGES_MAX &&
          open.places + places <= EXPECT_MAX &&
          (counted || open.loose + places <= CONFIRM_OVER)
        if (!fits) {
          open = { layer, longest: params.find.length, pairs: [], places: 0, loose: 0 }
          batches.push(open)
        }
        open.pairs.push(params)
        open.places += places
        if (!counted) open.loose += places
      }
    }
  }
  // Every page's first calls before any page's later ones, longest words first, as the sweep always sent them.
  batches.sort((a, b) => a.layer - b.layer || b.longest - a.longest)
  return [
    ...batches.map(({ pairs }) => {
      if (pairs.length === 1) return { action: 'content.replace', params: pairs[0] }
      const { path, all } = pairs[0]
      return {
        action: 'content.replace',
        params: {
          path,
          all,
          changes: pairs.map((p) => ({
            find: p.find,
            replace: p.replace,
            ...(typeof p.expect === 'number' ? { expect: p.expect } : {})
          }))
        }
      }
    }),
    ...rest
  ]
}

/** An address as a path key on this site, or null for another site's. */
function routeOf(address, origin) {
  try {
    const url = new URL(address, origin)
    return url.origin === new URL(origin).origin ? pathKey(url.pathname) : null
  } catch {
    return null
  }
}

/**
 * Whether a template picture is the site's logo, on any CMS (lrsweep rig, JA Spa j6, 24/10/2026: the T4 header's
 * `span.logo-wrap > img.logo-img` was taken for a photo): a class or id naming a logo on the picture or a wrapper
 * (`custom-logo`, `site-logo`, `logo-img`; never a plural `client-logos`, which holds others' logos), or a picture
 * linking to the site's home (`/`, Joomla's `/index.php`). A CSS background never counts by its link: the reader's
 * `link` is also the one home link in a box around it, and JA Spa's `.ja-masthead` banner "linked" home through its
 * breadcrumb (lrsweep rig, 25/10/2026).
 * 🔒 A HOME LINK MARKS A LOGO-SIZED PICTURE ONLY (The Willow Nook local, 25/10/2026): JA Diner's reservation banner
 * (1440×389) and its photos (570×371) link home, were taken for the logo and kept the template's pictures. A picture
 * shown larger than {@link LOGO_BOX} is a photo whatever it links to; one the reader gave no size still counts.
 */
function siteLogo(picture, origin) {
  if (/[.#][\w-]*logo(?!s)/i.test(String(picture.selector ?? ''))) return true
  if (picture.kind === 'background') return false
  const home = typeof picture.link === 'string' ? routeOf(picture.link, origin) : null
  if (home !== '/' && home !== '/index.php') return false
  const [width, height] = String(picture.size ?? '')
    .split(/[×x]/)
    .map(Number)
  return !(width > LOGO_BOX.width || height > LOGO_BOX.height)
}

/** The largest box a header logo is shown in, in CSS pixels: wider or taller is a banner or a photo. */
const LOGO_BOX = Object.freeze({ width: 480, height: 240 })

/** An address in full, on this site when it names no host: what the site's `media.usage` resolves. */
function absoluteUrl(address, origin) {
  try {
    return new URL(address, origin).href
  } catch {
    return address
  }
}

/** The inventory records whose route is this path. */
const recordsAt = (path, inventory) =>
  inventory.filter((r) =>
    (r.routes ?? []).some((p) => routePath(p) !== null && pathKey(routePath(p)) === path)
  )

/** Whether a record is the one a holder names. */
const sameHolder = (record, holder) => JSON.stringify(holderOf(record)) === JSON.stringify(holder)

/** A record's identity as the resolver reads it. */
const holderOf = (record) =>
  record.identity?.collection
    ? {
        collection: record.identity.collection,
        id: record.identity.id,
        locale: record.identity.locale ?? null
      }
    : {
        kind: record.identity.kind,
        id: record.identity.id,
        // A Joomla menu item's link as the plan saw it: the resolver writes the item only while it still holds it.
        ...(record.identity.kind === 'menuItem' && typeof record.data?.link === 'string'
          ? { link: record.data.link }
          : {})
      }

/**
 * The records that may keep a page's link, in the order the resolver tries them: the page's own record, then what
 * every page shares — a WordPress navigation block, the Joomla menu item the link is.
 */
function holdersOf(link, { platform, inventory, origin }) {
  const page = recordsAt(pathKey(link.page), inventory).filter(
    (r) => !['menu', 'menuItem', 'option'].includes(r.identity?.kind) && mayHold(r, link)
  )
  const shared = []
  if (platform === 'wordpress')
    shared.push(
      ...inventory.filter((r) => r.identity?.kind === 'post' && r.data?.post_type === 'wp_navigation')
    )
  if (platform === 'joomla') {
    const route = routeOf(link.href, origin)
    if (route !== null)
      shared.push(...recordsAt(route, inventory).filter((r) => r.identity?.kind === 'menuItem'))
  }
  // EmDash: an entry no page is routed to is the site's own (Tracy Base's `site`, its footer's social links); it is
  // named only when its stored content keeps the address itself (lrsweep rig, 25/10/2026).
  if (platform === 'emdash')
    shared.push(
      ...inventory.filter(
        (r) =>
          r.identity?.collection &&
          (r.routes ?? []).length === 0 &&
          JSON.stringify(r.data ?? null).includes(JSON.stringify(link.href).slice(1, -1))
      )
    )
  return [...page, ...shared].map(holderOf)
}

/**
 * 🔒 A PAGE'S RECORD HOLDS ONLY A LINK ITS STORED CONTENT KEEPS (lrsweep rig, JA Spa j6, 25/10/2026): the footer's
 * "Joomla!" and licence links, printed by a module from a language string, were sent to the article routed at the page,
 * which keeps neither, and came back NOT_FOUND on every round. A record whose content was read (`data`) and holds
 * neither the link's address (`&amp;` read as `&`) nor any of its words is not named; one read without its content is.
 * The words count too because a stored address need not be the shown one (Joomla's `index.php?option=…` behind a SEF
 * path).
 */
function mayHold(record, link) {
  if (!record.data || typeof record.data !== 'object') return true
  const stored = JSON.stringify(record.data).replace(/&amp;/g, '&')
  const words = [link.text, ...(link.texts ?? [])].filter((w) => typeof w === 'string' && w.trim())
  return [link.href, ...words].some(
    (needle) => typeof needle === 'string' && stored.includes(JSON.stringify(needle).slice(1, -1))
  )
}

/** The Joomla menu item `link` of the page at `to`, which a menu item sent there takes; null if none. */
function menuLinkAt(to, inventory, origin) {
  const route = routeOf(to, origin)
  if (route === null) return null
  const item = recordsAt(route, inventory).find((r) => r.identity?.kind === 'menuItem')
  return typeof item?.data?.link === 'string' ? item.data.link : null
}

/**
 * The record whose meta a picture no record holds is printed from: the post or term the picture leads to (`link`,
 * read by the browser). `{kind, id}`, or null when none is known.
 *
 * 🔒 A PICTURE WITHOUT A LINK NAMES NO RECORD (lrsweep rig round 6, 24/10/2026): the blog sidebar's banner is an
 * option's (`wp_ja_diner_blog_banner_image`), shown on the blog list and on every post; the page's own post was named
 * as its holder there, and post 41's on a post's page. A record is named only when the picture leads to it.
 * @param {Record<string, any>} picture @param {Array<Record<string, any>>} inventory
 */
function metaOwnerOf(picture, inventory) {
  if (typeof picture.link !== 'string' || !URL.canParse(picture.link)) return null
  const record = recordsAt(pathKey(new URL(picture.link).pathname), inventory).find((r) =>
    ['post', 'term'].includes(r.identity?.kind)
  )
  return record ? { kind: record.identity.kind, id: record.identity.id } : null
}

/** A file of the theme or template itself: WordPress `wp-content/themes/…`, Joomla `templates/…`. */
const THEME_FILE = /(?:^|\/)(?:wp-content\/themes|templates)\//

/** A photo's file, as opposed to a stamp, a mask or a texture drawn as PNG, SVG or GIF. */
const PHOTO_FILE = /\.(?:jpe?g|webp|avif)(?:[?#]|$)/i

/** Whether a record of the picture's page holds its file, under any size WordPress cut of it. */
function heldOnPage(picture, inventory) {
  const stem = stemOf(picture.file)
  return recordsAt(pathKey(picture.page), inventory).some((r) => JSON.stringify(r.data ?? {}).includes(stem))
}

/** A picture file's name without its size suffix and extension: every size WordPress cut of one upload. */
/** A picture file named in a post's stored data, up to its extension (a Joomla `#joomlaImage://…` suffix left out). */
const POST_PICTURE = /[^"'\s(),#?]+\.(?:jpe?g|png|webp|avif|gif)\b/gi

const stemOf = (address) =>
  String(address)
    .split(/[?#]/)[0]
    .split('/')
    .at(-1)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/-(?:\d+x\d+|scaled)$/i, '')

/** A picture's width over its height from `"1440×840"`, or null. */
function aspectOf(size) {
  const m = /^(\d+)\s*[×x]\s*(\d+)$/.exec(String(size ?? ''))
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null
}

/**
 * 🔒 THE BUSINESS'S OWN PICTURE, OF THE FRAME'S SHAPE (product owner, 24/10/2026): a template picture becomes one of
 * the photos the build imported (`agentDemo.imports`), the one closest to the frame's aspect that this page shows
 * least, so a page's frames show different photos before one is used twice. Never a picture from elsewhere.
 * 🔒 THE BEST PHOTO FIRST (product owner, round 10, 24/10/2026): among the photos this page shows least, the one the
 * research rates higher wins (`worth`, `handoff.js` `pictureWorth`: food, drink, a room or the building over people,
 * a sharp photo over a blurry one, a photograph over a video's frame); a `poor` one (a video frame, blurry, a person
 * filling the frame) counts as shown once already, so it fills a frame only after every better photo is on the page.
 * The order changes, the list never shrinks: no imported photo is ever dropped.
 * @param {Array<{url: string, id?: number | string | null, width?: number | null, height?: number | null, worth?: number, poor?: boolean}>} media
 * @param {number | null} aspect
 * @param {Map<string, number>} used - this page's uses of each picture
 */
function pictureFor(media, aspect, used) {
  const ratio = (m) => (m.width && m.height ? m.width / m.height : null)
  const distance = (m) =>
    aspect === null || ratio(m) === null ? 1 : Math.abs(Math.log(ratio(m)) - Math.log(aspect))
  const shown = (m) => (used.get(m.url) ?? 0) + (m.poor === true ? 1 : 0)
  return [...media].sort(
    (a, b) => shown(a) - shown(b) || (b.worth ?? 3) - (a.worth ?? 3) || distance(a) - distance(b)
  )[0]
}

/** The platforms whose terms the sweep's `terms` call reads (`sweep-resolve.mjs`). */
const TERM_PLATFORMS = new Set(['wordpress', 'joomla', 'emdash'])

/**
 * @param {{items?: Array<Record<string, any>>} | null} residue
 * @param {{buildDate: string, platform: string, inventory?: Array<{identity?: any, routes?: string[]}>, contactPath?: string | null, origin?: string, pictures?: Array<Record<string, any>>, media?: Array<{url: string, id?: number | string | null, width?: number | null, height?: number | null, worth?: number, poor?: boolean}>, templatePosts?: Array<Record<string, any>>, logo?: {url: string, id?: number | string | null} | null, fittedLogo?: {png: string, logo?: string, matches?: boolean} | null, wordmark?: {png: string, name?: string} | null, design?: Array<Record<string, any>>}} options
 *   `templatePosts`: the template's posts as the frozen inventory read them, each with the fields the agent's plan
 *   writes on it as `written`, which the sweep leaves alone while counted checks remain (`agent-demo.js`
 *   `templatePostsLeft`). `name`: the business's name, which a short heading naming the template's takes. `logo`: the business's imported logo, `fittedLogo` the same laid in the
 *   template logo's box by the page reader (`demo-qa-browser.js`); `wordmark`: its name drawn in the
 *   theme's type when there is none (`demo-qa.js`). `design`: the template pictures the QA passed as the theme's
 *   design (`no-demo-pictures` `unresolved`), reported by name, never written. `contact`: the research's phone,
 *   email, website and address, which a template's own contact fact takes (`contactFactOf`). `checksLeft`: the
 *   counted checks left after this one; while any remain, prose is left for the agent (`isProse`). `renamedBefore`:
 *   the template category names an earlier sweep round of this counted check sent a rename for (`renamed`).
 *   `batches`: the pairs of one page go as one call (`onePerPage`).
 * @returns {{calls: Array<{action: string, params: Record<string, any>}>, unresolved: Array<Record<string, any>>, renamed: string[], left: number, shown: string[]}}
 */
export function planSweep(
  residue,
  {
    buildDate,
    platform,
    inventory = [],
    contactPath = null,
    origin = 'https://site.invalid',
    pictures = [],
    media = [],
    templatePosts = [],
    logo = null,
    fittedLogo = null,
    wordmark = null,
    design = [],
    categories = [],
    topicNames = [],
    renamedBefore = [],
    leadLine = null,
    postFacts = [],
    postDrafts = [],
    name = null,
    contact = {},
    checksLeft = 0,
    sweepTerms = false,
    // The neutral name a template dish takes speaks of what the business offers, in the site's language.
    itemKind = 'dish',
    locale = 'en',
    // dsh sends one call's pairs together and sets a refused one aside (`sweepBatches` on `check.start`): a page's
    // words go as one call (`onePerPage`). An older dsh sends each call as it is, so it is given one pair per call.
    batches = false
  }
) {
  // 🔒 A TEMPLATE PHOTO A RECORD HOLDS IS THE BUSINESS'S TO FILL, WHATEVER IT PASSED AS (product owner, 25/10/2026):
  // a background photo the page's own record keeps (a cover block's image) takes an imported picture like any other.
  // A stamp, a mask or a texture (PNG, SVG, GIF) and a file only the theme's stylesheet draws stay named unresolved.
  const unresolved = []
  const designPhotos = []
  for (const d of design) {
    if (typeof d?.file !== 'string') continue
    if (typeof d.page === 'string' && PHOTO_FILE.test(d.file) && heldOnPage(d, inventory))
      designPhotos.push(d)
    else
      unresolved.push({
        why: "a stamp, mask or texture drawn into the theme's own picture: the theme's design, the owner's to replace",
        ...d,
        field: 'picture'
      })
  }
  const shownPictures = [...pictures, ...designPhotos]
  const items = residue?.items ?? []
  /** @type {Record<string, Array<{action: string, params: Record<string, any>}>>} */
  const lanes = { post: [], link: [], image: [], term: [], price: [], dish: [], title: [], passage: [] }
  /** The places a page's read showed for a pair sent without `expect`, so a call keeps them within `CONFIRM_OVER`. */
  const looseCount = new WeakMap()
  // 🔒 A TERM DESCRIPTION STILL THE TEMPLATE'S LOREM IS CLEARED (product owner, round 10, 25/10/2026): no page this
  // QA reads may print it, so the sweep asks once, on the last counted check, for every term of the site to be read
  // and its lorem description emptied (`sweep-resolve.mjs` `loremTerms`); `sweepTerms` is false once it has asked.
  if (checksLeft === 0 && sweepTerms && TERM_PLATFORMS.has(platform))
    lanes.term.push({ action: 'terms', params: { platform } })
  // Posts: a template post's date becomes the build day and its title a research post's, on the post itself: the
  // post its card links, or the page's own post on a single post page. 🔒 A DATE NEVER BECOMES "Coming soon"
  // (review 24/10/2026): a date on no post of the site is reported, not worded over.
  const posts = new Map()
  const words = []
  for (const item of items) {
    if (item.field !== 'date' && item.field !== 'title') {
      if (item.field !== 'link') words.push(item)
      continue
    }
    // 🔒 A CARD'S DATE IS ITS POST'S, NEVER THE PAGE'S (review 24/10/2026): a card linking an address no post of
    // the inventory has is reported; the page's own post takes only a date with no card link of its own. A title
    // of no known post is words like any other.
    const record = postAt(
      item.field === 'date' ? (item.post ?? item.page) : item.post,
      inventory,
      origin,
      platform
    )
    const date = record && item.field === 'date' ? dateFieldOf(record, platform, buildDate) : null
    if (!record || (item.field === 'date' && !date)) {
      if (item.field === 'title') words.push(item)
      else
        unresolved.push({
          ...item,
          why: !record ? 'no post of the site has this address' : `no post date field is known on ${platform}`
        })
      continue
    }
    // 🔒 A HEADING IS THE POST'S TITLE ONLY WHEN THE POST STORES THOSE WORDS AS ITS TITLE (lrsweep rig, 25/10/2026):
    // an article's own `h2` on its page was taken for the title, so every round wrote the title again and the
    // heading stayed. Words the stored title does not hold are body words, worded where they are.
    const field = titleFieldOf(record, platform)
    if (!date && !titleIs(record.data?.[field], item.text)) {
      words.push(item)
      continue
    }
    const known = posts.get(record.identity.id) ?? { record, fields: {} }
    if (date) known.fields[date.field] = date.value
    else known.title = { item, field }
    posts.set(record.identity.id, known)
  }
  // 🔒 EVERY TEMPLATE POST, NOT ONLY THE ONE THE CHECK OPENS (lrsweep rig, 24/10/2026): the check reads one post's
  // page and the blog's first page, so the twelve posts left unwritten kept their template bodies, and the four on
  // the blog's second page their titles too. Each field of a template post the plan did not write that still holds
  // the frozen template's value is swept: the placeholder for its title, excerpt and body, the build day for its
  // date, an imported photo for its featured picture. A field the site no longer holds as the template had it is
  // left alone, so a swept site plans nothing.
  // The research's sourced lead (`pinnedCopy` `hero.lead`, the business's own bio): a lead left as the template's
  // takes it. A post body takes its own material and the research facts related to it (`ownBodyOf`).
  const sourcedLead = typeof leadLine === 'string' && leadLine.trim() !== '' ? leadLine.trim() : null
  const postLeadOf = postLeads(templatePosts, inventory)
  const featuredUse = new Map()
  const seenFeatured = new Set()
  const sweptPictures = new Set()
  const bodies = new Map()
  const fieldBodies = new Map()
  const bodyLines = new Set()
  const templates = new Map()
  // 🔒 A POST THE AGENT LEFT IS WRITTEN FROM THE RESEARCH, NEVER "Coming soon" (product owner, 25/10/2026; The Willow
  // Nook local build 16: 2 topics for 22 posts, 20 swept to "Coming soon" and posts-written failed on exactly them).
  // Each takes the next research post (`postDrafts`, `agent-demo.js` `postDraftsOf`): one sharing a word with the
  // title the agent wrote first, and never one whose facts another post's body already took.
  const drafts = [...postDrafts]
  const lineKey = (line) => sentenceOf(line).toLowerCase()
  const takeDraft = (about) => {
    for (let i = drafts.length - 1; i >= 0; i--)
      if (drafts[i].lines.some((line) => bodyLines.has(lineKey(line)))) drafts.splice(i, 1)
    if (drafts.length === 0) return null
    const related = drafts.findIndex((d) => [...topicWordsOf(d.body)].some((w) => about.has(w)))
    const [draft] = drafts.splice(Math.max(0, related), 1)
    for (const line of draft.lines) bodyLines.add(lineKey(line))
    return draft
  }
  for (const frozen of templatePosts) {
    const live = inventory.find(
      (r) =>
        isPost(r, platform) &&
        r.identity.id === frozen.identity?.id &&
        (r.identity.collection ?? null) === (frozen.identity?.collection ?? null)
    )
    if (!live) continue
    const known = posts.get(live.identity.id) ?? { record: live, fields: {} }
    // 🔒 ONLY THE FIELDS THE AGENT DID NOT WRITE, WHILE COUNTED CHECKS REMAIN (review 24/10/2026): a post whose title
    // the plan rewrote keeps that title and still takes the placeholder body and the build day where the template's
    // stayed. 🔒 AFTER THE AGENT, WHAT STILL SHOWS THE TEMPLATE'S IS SWEPT, WRITTEN IN THE PLAN OR NOT (product owner,
    // build 13, 25/10/2026): the plan wrote all 22 bodies and every post page kept the lorem, so on the last check a
    // field still holding the template's value is the sweep's.
    const written = new Set(checksLeft > 0 && Array.isArray(frozen.written) ? frozen.written : [])
    const still = (field) =>
      !written.has(field) &&
      typeof frozen.data?.[field] === 'string' &&
      frozen.data[field].trim() !== '' &&
      live.data?.[field] === frozen.data[field]
    const title = titleFieldOf(live, platform)
    const page = routePath(live.routes?.[0]) ?? null
    // A field the agent wrote: the live value, changed from the template's and more than a placeholder.
    const own = (field) => {
      const v = live.data?.[field]
      return typeof v === 'string' && proseOf(v) !== '' && v !== frozen.data?.[field] && !isPlaceholderText(v)
        ? v
        : null
    }
    // The post's words once swept: what the sweep writes into its body, or the body the agent wrote.
    let wrote = null
    const date = dateFieldOf(live, platform, buildDate)
    if (date && still(date.field) && !frozen.data[date.field].startsWith(buildDate))
      known.fields[date.field] = date.value
    // 🔒 A POST WHOSE TITLE THE SWEEP WRITES TAKES ITS SLUG FROM THAT TITLE (product owner, 26/10/2026; it kept the
    // template's slug until then): set in the same write once both loops gave the title (`slugsWithTitles`). The
    // QA reads the route the post answers at now and the links to its old route follow it (`oldRouteLinks`).
    if (platform === 'wordpress') {
      // 🔒 A BODY OF ONE BLOCK IS SENT TOO (product owner, 24/10/2026): the door's BODY_SHRINK guard passes the
      // sweep's placeholder only on a read of the record made for that write, which the resolver makes.
      // 🔒 A BODY IS THE TEMPLATE'S WHILE ITS PROSE IS (review 24/10/2026): an agent's picture swapped inside it
      // changes the markup, not the template's words, so the words are compared. The frozen body goes with the call
      // so the resolver gives way only to the template's own blocks and keeps the ones the agent wrote.
      const bodyStill = proseStill(frozen.data?.post_content, live.data?.post_content)
      if (written.has('post_content') && bodyStill)
        unresolved.push({
          page: routePath(live.routes?.[0]) ?? null,
          field: 'post_content',
          why: "written in the plan, the page still shows the template's body: the agent writes it from a research topic"
        })
      // The body takes the post's own material (`ownBodyOf`), never the template's lorem; with none, the next
      // research post (`takeDraft`); with no research left, it is reported, never a placeholder.
      if (!written.has('post_content') && bodyStill) {
        const ownTitle = own(title)
        const ownExcerpt = own('post_excerpt')
        const body = ownBodyOf({ title: ownTitle, excerpt: ownExcerpt }, postFacts, bodyLines)
        const draft = body ? null : takeDraft(topicWordsOf(ownTitle ?? ''))
        wrote = body ? { title: titleHeadOf(ownExcerpt ?? body), body } : draft
        if (wrote) {
          bodies.set(live.identity.id, escapeText(wrote.body))
          if (live.data.post_content !== frozen.data.post_content)
            templates.set(live.identity.id, frozen.data.post_content)
        } else
          unresolved.push({
            page,
            field: 'post_content',
            why: "thin research: no research fact is left for this post's body, so it keeps the template's until one is collected"
          })
      } else if (!bodyStill) {
        const body = own('post_content')
        if (body) wrote = { title: titleHeadOf(proseOf(body)), body: proseOf(body) }
      }
      if (still('post_excerpt')) {
        const opening = wrote ? firstSentenceOf(wrote.body) : null
        if (opening) known.fields.post_excerpt = opening
      }
      if (
        !written.has('featured_image_id') &&
        live.featured?.url &&
        frozen.featured?.url &&
        stemOf(live.featured.url) === stemOf(frozen.featured.url)
      ) {
        const chosen = pictureFor(
          media.filter((m) => m.id != null),
          null,
          featuredUse
        )
        if (chosen) {
          featuredUse.set(chosen.url, (featuredUse.get(chosen.url) ?? 0) + 1)
          known.fields.featured_image_id = chosen.id
          seenFeatured.add(`${live.identity.kind}/${live.identity.id}`)
        } else
          unresolved.push({
            page: routePath(live.routes?.[0]) ?? null,
            file: frozen.featured.url,
            field: 'picture',
            why: 'no imported picture has a media id to feature'
          })
      }
    } else {
      // 🔒 A JOOMLA OR EMDASH POST'S PICTURES ARE ITS OWN DATA (product owner, round 8, 25/10/2026): an article keeps
      // its card and page pictures in `images`, an EmDash entry its featured one in a field of its data, and no
      // featured id stands apart. Each template picture a field the plan did not write still holds is replaced
      // with an imported photo, once per file and post; with none imported it is reported on the post's page.
      const files = []
      for (const [field, value] of Object.entries(frozen.data ?? {})) {
        if (written.has(field) || JSON.stringify(live.data?.[field]) !== JSON.stringify(value)) continue
        for (const m of JSON.stringify(value ?? null).matchAll(POST_PICTURE))
          if (!files.some((f) => stemOf(f) === stemOf(m[0]))) files.push(m[0])
      }
      for (const file of files) {
        sweptPictures.add(stemOf(file))
        const chosen = pictureFor(media, null, featuredUse)
        if (!chosen) {
          unresolved.push({ page, file, field: 'picture', why: 'no picture of the business was imported' })
          continue
        }
        featuredUse.set(chosen.url, (featuredUse.get(chosen.url) ?? 0) + 1)
        lanes.image.push({
          action: 'image',
          params: {
            platform,
            path: page,
            find: file,
            media: { url: chosen.url, ...(chosen.id != null ? { id: chosen.id } : {}) },
            records: [holderOf(live)]
          }
        })
      }
      // 🔒 A JOOMLA OR EMDASH POST'S BODY IS SWEPT LIKE WORDPRESS'S (review of round 12, 26/10/2026): only its
      // pictures and title were, so every article and entry the agent left kept the template's lorem body. The
      // first body field still holding the template's words takes the post's own material or the next research
      // post, the template's other body fields still holding its words are emptied, and the frozen values go with
      // the call so the resolver writes only over the template's own. With no research left, it is reported.
      // 🔒 Each body field is judged on its own (review 26/10/2026, second pass): an article whose intro the agent
      // wrote kept the template's full text, neither emptied nor reported.
      const held = bodyFieldsOf(frozen.data, platform)
      const stillBody = held.filter((f) => bodyProseOf(live.data?.[f]) === bodyProseOf(frozen.data[f]))
      const lead = held[0]
      const swept = {}
      for (const f of stillBody.filter((f) => f !== lead)) {
        if (written.has(f))
          unresolved.push({
            page,
            field: 'post_content',
            why: `written in the plan, the page still shows the template's ${f}: the agent writes it from a research topic`
          })
        else swept[f] = Array.isArray(frozen.data[f]) ? [] : ''
      }
      if (lead && stillBody.includes(lead)) {
        if (written.has(lead))
          unresolved.push({
            page,
            field: 'post_content',
            why: "written in the plan, the page still shows the template's body: the agent writes it from a research topic"
          })
        else {
          const ownTitle = own(title)
          const body = ownBodyOf({ title: ownTitle, excerpt: null }, postFacts, bodyLines)
          const draft = body ? null : takeDraft(topicWordsOf(ownTitle ?? ''))
          wrote = body ? { title: titleHeadOf(body), body } : draft
          if (wrote) swept[lead] = bodyValueOf(wrote.body, frozen.data[lead])
          else
            unresolved.push({
              page,
              field: 'post_content',
              why: "thin research: no research fact is left for this post's body, so it keeps the template's until one is collected"
            })
        }
      } else if (lead) {
        const body = bodyProseOf(live.data?.[lead])
        if (body !== '' && !isPlaceholderText(body)) wrote = { title: titleHeadOf(body), body }
      }
      // The lead first, as the template holds them.
      const order = held.filter((f) => f in swept)
      if (order.length > 0)
        fieldBodies.set(live.identity.id, {
          bodyFields: Object.fromEntries(order.map((f) => [f, swept[f]])),
          template: Object.fromEntries(order.map((f) => [f, frozen.data[f]]))
        })
    }
    // The title takes the swept post's heading, or the next research post's where the body is not the sweep's to
    // write; never a placeholder, and with no research left it is reported.
    if (still(title)) {
      const heading = wrote?.title ?? (platform === 'wordpress' ? null : takeDraft(new Set())?.title)
      if (heading) known.fields[title] = heading
      else
        unresolved.push({
          page,
          field: 'title',
          why: 'thin research: no research fact is left to title this post, so it keeps the template title until one is collected'
        })
    }
    if (
      Object.keys(known.fields).length > 0 ||
      bodies.has(live.identity.id) ||
      fieldBodies.has(live.identity.id)
    )
      posts.set(live.identity.id, known)
  }
  // A template title the check saw on a post the loop above gave no heading: the next research post's, never a
  // placeholder; with no research left, reported.
  for (const [id, known] of posts) {
    if (!known.title || known.fields[known.title.field] !== undefined) continue
    // A body the agent wrote titles its own post.
    const frozenBody = postBodyOf(templatePosts.find((f) => f.identity?.id === id)?.data)
    const liveBody = postBodyOf(known.record.data)
    const ownBody =
      typeof liveBody === 'string' &&
      typeof frozenBody === 'string' &&
      proseOf(liveBody) !== '' &&
      proseOf(liveBody) !== proseOf(frozenBody) &&
      !isPlaceholderText(liveBody)
        ? proseOf(liveBody)
        : null
    const heading = ownBody ? titleHeadOf(ownBody) : takeDraft(new Set())?.title
    if (heading) known.fields[known.title.field] = heading
    else if (!unresolved.some((u) => u.field === 'title' && u.page === routePath(known.record.routes?.[0])))
      unresolved.push({
        ...known.title.item,
        why: 'thin research: no research fact is left to title this post'
      })
    if (Object.keys(known.fields).length === 0 && !bodies.has(id) && !fieldBodies.has(id)) posts.delete(id)
  }
  slugsWithTitles(posts, { platform, inventory, templatePosts, checksLeft, unresolved })
  for (const { record, fields, slug, slugFrom } of posts.values()) {
    // What each field held when the sweep planned over it: the resolver writes a field only while it still does
    // (`sweep-resolve.mjs` `fieldsStill`). A WordPress featured picture is read from the list, not the record, so it
    // carries none.
    const seen = Object.keys(fields).filter(
      (f) => f !== 'featured_image_id' && Object.hasOwn(record.data ?? {}, f)
    )
    const was =
      seen.length > 0 || slug
        ? {
            was: {
              ...Object.fromEntries(seen.map((f) => [f, record.data[f]])),
              // An EmDash slug is the entry's, beside its data: the resolver writes it only while it still is.
              ...(slug ? { slug: record.identity.slug } : {})
            }
          }
        : {}
    // A slug made of the sweep's title goes with that title: dropped with it, the agent's title and slug stand.
    const moved = { ...(slug ? { slug } : {}), ...(slugFrom ? { slugFrom } : {}) }
    const body = bodies.get(record.identity.id)
    const template = templates.get(record.identity.id)
    const fieldBody = fieldBodies.get(record.identity.id)
    // A Joomla article's or EmDash entry's body: the resolver reads it now and writes it only while it still holds
    // the template's (`sweep-resolve.mjs` `templatePost`).
    if (fieldBody) {
      const { identity } = record
      lanes.post.push({
        action: 'post',
        params: {
          platform,
          ...(platform === 'emdash'
            ? {
                collection: identity.collection,
                id: identity.id,
                ...(identity.locale ? { locale: identity.locale } : {}),
                ...(record.publication?.status === 'published' ? { status: 'published' } : {})
              }
            : { kind: identity.kind, id: identity.id }),
          fields,
          ...moved,
          ...was,
          ...fieldBody
        }
      })
      continue
    }
    // 🔒 A FEATURED PICTURE ALONE IS ITS POST META ON WORDPRESS (The Willow Nook local, build 8c, 25/10/2026): the
    // plugin writes `featured_image_id` only beside a field of the post's row and refuses it alone ("no writable field
    // for kind post"), so every post the agent wrote kept the template's picture through every sweep round.
    if (platform === 'wordpress' && !body && Object.keys(fields).join() === 'featured_image_id') {
      lanes.post.push({
        action: 'content.update',
        params: {
          kind: 'postmeta',
          id: record.identity.id,
          key: '_thumbnail_id',
          fields: { value: fields.featured_image_id }
        }
      })
      continue
    }
    lanes.post.push(
      body
        ? {
            action: 'post',
            params: {
              platform,
              kind: record.identity.kind,
              id: record.identity.id,
              fields,
              ...was,
              ...(slugFrom ? { slugFrom } : {}),
              body,
              ...(template ? { template } : {})
            }
          }
        : postUpdate(record, platform, fields, was.was, slug, slugFrom)
    )
  }
  // Words: one replace per page and words, counting every place the read showed them. A passage the template
  // shows whole is replaced as one (`whole`), so its other nodes are not looked for.
  // 🔒 A LEAD LEFT AS THE TEMPLATE'S TAKES THE RESEARCH'S OWN LINE, NEVER "Coming soon" FIRST (product owner,
  // 24/10/2026). The agent writes every page lead (`editorialLeads`, `agent-demo.js`); a line its write missed takes
  // the research's sourced lead (`pinnedCopy` `hero.lead`, the business's own bio), never invented words. With none,
  // the line is left empty and the check records thin research (`thinLeads`).
  let thinLeads = 0
  const byWords = new Map()
  const wholes = new Set()
  for (const item of words)
    if (item.whole && item.field === 'text') wholes.add(`${item.page}\u0000${item.block}`)
  // 🔒 A CUT TEXT IS LOOKED FOR UP TO ITS LAST WHOLE WORD (lrsweep rig, JA Spa j6, 25/10/2026): the page read keeps a
  // text's first READ_LIMIT characters, often ending inside a word ("…easy to distingu"), and the replace job matches
  // whole words only, so the article's long paragraphs came back NOT_FOUND.
  const findOf = (item) => wholeWordsOf(item.whole && item.field === 'text' ? item.passage : item.text)
  // 🔒 A LEAD ANYWHERE IS A LEAD EVERYWHERE (lrsweep rig, JA Spa j6, 24/10/2026): one record's text is a page's lead
  // and another page's intro (a blog list showing the article's opening). Worded apart, whichever call ran first
  // wrote the record and the other found nothing, so the article's lead said "Coming soon".
  const leadWords = new Set(words.filter((i) => i.lead === true && i.field === 'text').map(findOf))
  for (const item of words) {
    if (item.whole && wholes.has(`${item.page}\u0000${item.block}`) && item.field === 'text-rest') continue
    const find = findOf(item)
    const lead = item.field === 'text' && leadWords.has(find)
    // 🔒 A POST CARD'S LEAD IS THAT POST'S OWN (product owner, round 11, 25/10/2026): a blog card still showing its
    // template post's excerpt takes the excerpt the agent wrote for that post, never the one research line every card
    // would then repeat.
    const ownLead = lead ? postLeadOf(find) : null
    if (lead && !ownLead && item.lead === true && !sourcedLead) thinLeads += 1
    const fact = item.field === 'text' ? contactFactOf(item, contact) : null
    // 🔒 PROSE IS THE AGENT'S WHILE CHECKS REMAIN (product owner, 25/10/2026): an emptied field stands for a concrete
    // missing fact, never for a lead, an about or a description the agent writes from its research. Written over
    // early, the template's words were gone when the agent's write looked for them (The Willow Nook local, build 8c),
    // so they stay, named for the agent, and only the last check's sweep empties them.
    if (checksLeft > 0 && !fact && !ownLead && !item.filler && (lead ? !sourcedLead : isProse(item))) {
      unresolved.push({ ...item, why: 'a lead or description: the agent writes it from its research' })
      continue
    }
    let to = lead
      ? (ownLead ?? sourcedLead ?? '')
      : (fact ?? namedFor(item, name) ?? placeholderOf(item, { kind: itemKind, locale }) ?? '')
    // 🔒 NO EMPTY VALUE FOR A SLOT THE REPLACE JOB REFUSES TO EMPTY, AND NO NEUTRAL WORD OVER A TITLE (review
    // 26/10/2026): `h2 > span` went empty and was refused, an `li` too, and a post card's linked title became "Contact"
    // while it still linked the post. Such a slot takes its role's neutral wording, or no call: it is named unresolved,
    // with why, and the check still reads its words.
    if (to === '') {
      const slot = slotOf(item, find)
      if (slot.role === 'title') {
        unresolved.push({
          ...item,
          ...(slot.refused ? { refused: slot.refused } : {}),
          why: LINKED_TITLE_WHY
        })
        continue
      }
      if (slot.refused) {
        to = neutralOfSlot(slot, { locale, contactPath })
        if (to === '') {
          unresolved.push({ ...item, refused: slot.refused, why: refusedWhy(slot) })
          continue
        }
      }
    }
    const key = `${item.page}\u0000${find}`
    const known = byWords.get(key)
    if (!known) {
      byWords.set(key, { page: item.page, text: find, to, count: 1, item })
      continue
    }
    known.count += 1
    if (known.to !== to) known.clash = true
  }
  for (const w of byWords.values()) {
    if (w.clash) unresolved.push({ ...w.item, why: 'the same words fill two kinds of field on this page' })
    else if (w.count > EXPECT_MAX)
      unresolved.push({ ...w.item, why: `shown in ${w.count} places, over the replace job's limit` })
    else {
      const loose = w.item.whole && w.count <= CONFIRM_OVER
      const run = partsOf(w.text, w.to).map((find) => ({
        action: 'content.replace',
        params: {
          find,
          replace: w.to,
          path: w.page,
          all: 'page',
          ...(loose ? {} : { expect: w.count })
        }
      }))
      if (loose) for (const c of run) looseCount.set(c.params, w.count)
      lanes[laneOf(w.item.field)].push(run.length === 1 ? run[0] : run)
    }
  }
  // Links: a button back to the page it names, a booking or template link to Contact, written in the record that
  // keeps it (`link`, resolved per platform by dsh's `sweep-resolve.mjs`).
  const links = new Map()
  for (const item of items.filter((i) => i.field === 'link')) {
    const to = item.to === 'contact' ? contactPath : item.to
    if (!to) {
      unresolved.push({ ...item, why: 'the site has no Contact page to point it at' })
      continue
    }
    const key = `${item.page}\u0000${item.href}\u0000${item.text ?? ''}`
    const known = links.get(key)
    if (known && known.to !== to) known.clash = true
    else if (known) known.count += 1
    else links.set(key, { page: item.page, href: item.href, text: item.text ?? null, to, count: 1, item })
  }
  // 🔒 ONE CALL FOR A PAGE'S BUTTONS THAT SHARE AN ADDRESS AND A DESTINATION (lrsweep rig, 24/10/2026): Contact's
  // four social buttons all led to the vendor's site, so each call's `expect:1` met four places and every one
  // refused. They go as one call naming each button's words, counting them all.
  const byAddress = new Map()
  for (const l of links.values()) {
    const key = `${l.page}\u0000${l.href}`
    byAddress.set(key, [...(byAddress.get(key) ?? []), l])
  }
  const planned = []
  for (const group of byAddress.values())
    if (group.length > 1 && group.every((l) => !l.clash && l.to === group[0].to && l.text))
      planned.push({
        ...group[0],
        text: null,
        texts: group.map((l) => l.text),
        count: group.reduce((n, l) => n + l.count, 0)
      })
    else planned.push(...group)
  // A link every page shows, held only by what every page shares, is one write, not one per page.
  const sharedOnce = new Set()
  for (const l of planned) {
    // One anchor, by its address and its words, that must go two ways is two places nothing tells apart:
    // reported, not guessed.
    if (l.clash) {
      unresolved.push({ ...l.item, why: 'the same button must lead to two different pages' })
      continue
    }
    const records = holdersOf(l, { platform, inventory, origin })
    // A link no record keeps is one the theme prints, which the replace job's `href:true` writes on WordPress
    // only (`rendered-words.mjs`); the resolver takes it when no record named holds the link.
    const rendered =
      platform === 'wordpress'
        ? { find: l.href, replace: l.to, path: l.page, all: 'page', expect: l.count, href: true }
        : null
    if (records.length === 0 && !rendered) {
      unresolved.push({ ...l.item, why: 'no record of the site is known to hold this link' })
      continue
    }
    if (
      !rendered &&
      recordsAt(pathKey(l.page), inventory).every((r) => !records.some((h) => sameHolder(r, h)))
    ) {
      const once = JSON.stringify([l.href, l.to, l.text, l.texts ?? null, records])
      if (sharedOnce.has(once)) continue
      sharedOnce.add(once)
    }
    lanes.link.push({
      action: 'link',
      params: {
        platform,
        path: l.page,
        href: l.href,
        to: l.to,
        ...(l.text ? { text: l.text } : {}),
        ...(l.texts ? { texts: l.texts } : {}),
        records,
        ...(rendered ? { rendered } : {}),
        ...(platform === 'joomla' ? { targetLink: menuLinkAt(l.to, inventory, origin) } : {})
      }
    })
  }
  lanes.link.push(...oldRouteLinks({ platform, inventory, templatePosts, origin, unresolved }))
  // Pictures: each template file a page shows, once per page, written where that page's record keeps it.
  const seenFiles = new Set()
  const seenInRecord = new Set()
  const usedOn = new Map()
  let seenLogo = false
  for (const picture of shownPictures) {
    if (typeof picture?.file !== 'string' || typeof picture.page !== 'string') continue
    const key = `${picture.page}\u0000${picture.file}\u0000${picture.link ?? ''}`
    if (seenFiles.has(key)) continue
    seenFiles.add(key)
    const file = picture.file.split('/').at(-1)
    // 🔒 THE TEMPLATE'S LOGO BECOMES THE BUSINESS'S (product owner, 24/10/2026): the research's logo where one was
    // imported, else the business's name drawn as text in the theme's heading type (`wordmark`, measured on the
    // page). Text only: no symbol, emblem or slogan is ever invented. The resolver sets it through the site's
    // logo setting, once per site; a CMS it has no writer for comes back unresolved.
    if (siteLogo(picture, origin)) {
      if (seenLogo) continue
      // 🔒 THE BUSINESS'S LOGO IN THE TEMPLATE LOGO'S BOX (product owner, round 9, 24/10/2026): the page reader laid
      // it whole in that box (`fittedLogo`), so it is set as that picture, a png the WordPress resolver uploads and
      // the Joomla and EmDash brand writers wear (`wornLogo`). Unread (another origin), the imported file as it is.
      const image =
        logo?.url && typeof fittedLogo?.png === 'string' && fittedLogo.png
          ? { png: fittedLogo.png, media: { url: logo.url } }
          : logo?.url
            ? { media: { url: logo.url, ...(logo.id != null ? { id: logo.id } : {}) } }
            : typeof wordmark?.png === 'string' && wordmark.png
              ? { png: wordmark.png, ...(wordmark.name ? { name: wordmark.name } : {}) }
              : null
      if (!image) {
        unresolved.push({
          ...picture,
          field: 'picture',
          why: 'no logo of the business was imported and no wordmark could be drawn'
        })
        continue
      }
      seenLogo = true
      lanes.image.push({ action: 'logo', params: { platform, path: picture.page, find: file, ...image } })
      continue
    }
    // A template post's own picture (a Joomla card's `image_intro`) is swept with that post above.
    if (sweptPictures.has(stemOf(file))) continue
    // A file of the theme itself (a stylesheet's background) is in no record: reported, never sent to be refused.
    // 🔒 A THEME FILE A RECORD NAMES IS THE RECORD'S (lrsweep rig, JA Diner wp7, 25/10/2026): a pattern writes the
    // theme's `placeholder.svg` into the page's blocks by its theme address, so the page's record holds it.
    if (THEME_FILE.test(picture.file) && !heldOnPage(picture, inventory)) {
      unresolved.push({
        ...picture,
        field: 'picture',
        why: `the picture ${file} is a file of the theme's own, which no record holds; any words the template drew into it stay`
      })
      continue
    }
    if (media.length === 0) {
      unresolved.push({ ...picture, field: 'picture', why: 'no picture of the business was imported' })
      continue
    }
    // A post's featured picture (WordPress prints it as `attachment-<size>`: a blog card, a post's head) is the
    // post's own field, set to an imported photo: once per post, whatever page shows it.
    const thumbnail = /\.(?:attachment-[\w-]+|wp-post-image)\b/.test(String(picture.selector ?? ''))
    const featured = thumbnail
      ? inventory.filter((r) => r.featured?.url && stemOf(r.featured.url) === stemOf(file))
      : []
    if (featured.length > 0) {
      for (const record of featured) {
        const id = `${record.identity.kind}/${record.identity.id}`
        if (seenFeatured.has(id)) continue
        seenFeatured.add(id)
        const chosen = pictureFor(
          media.filter((m) => m.id != null),
          aspectOf(picture.size),
          featuredUse
        )
        if (!chosen) {
          unresolved.push({
            ...picture,
            field: 'picture',
            why: 'no imported picture has a media id to feature'
          })
          continue
        }
        featuredUse.set(chosen.url, (featuredUse.get(chosen.url) ?? 0) + 1)
        // 🔒 ON WORDPRESS A FEATURED PICTURE ALONE IS ITS POST META (lrsweep rig, JA Diner wp7, 25/10/2026): the
        // plugin writes `featured_image_id` only beside a field of the post's row, and refuses it alone ("no writable
        // field for kind post"), so all 34 of a round's featured pictures failed.
        lanes.image.push({
          action: 'content.update',
          params:
            platform === 'wordpress'
              ? {
                  kind: 'postmeta',
                  id: record.identity.id,
                  key: '_thumbnail_id',
                  fields: { value: chosen.id }
                }
              : {
                  kind: record.identity.kind,
                  id: record.identity.id,
                  fields: { featured_image_id: chosen.id }
                }
        })
      }
      continue
    }
    const records = holdersOf({ page: picture.page, href: '' }, { platform: 'none', inventory, origin })
    if (records.length === 0) {
      unresolved.push({
        ...picture,
        field: 'picture',
        why: 'no record of the site is known to hold this picture'
      })
      continue
    }
    // 🔒 A PICTURE NO RECORD OF THE PAGE HOLDS IS THE THEME'S OWN DATA (product owner, 24/10/2026): a card's picture
    // printed from a post's or a term's meta, or a banner from an option, is in no record a content door writes.
    const stem = stemOf(file)
    const holds = recordsAt(pathKey(picture.page), inventory).some((r) =>
      JSON.stringify(r.data ?? {}).includes(stem)
    )
    if (!holds) {
      // 🔒 THE KEY COMES FROM THE SITE'S DATA OR NOT AT ALL (integrator, round 6, 24/10/2026): no per-template list
      // of meta keys or options. The WordPress plugin reads a post meta or an option by one named key
      // (`content.get`), and no door lists a post's meta keys or the site's options, so which one holds this
      // picture cannot be found from the site: reported by name, once per owner and file, never written.
      const owner = metaOwnerOf(picture, inventory)
      // 🔒 THE SITE NAMES WHERE IT IS KEPT (product owner, round 9, 24/10/2026): WordPress's `media.usage` lists every
      // post meta and option holding a picture, so the resolver writes each one (`sweep-resolve.mjs`
      // `pictureInStorage`); one call per file, since it finds the file wherever the site keeps it. A term's meta
      // is in no list it reads.
      const withId = media.filter((m) => m.id != null)
      if (platform === 'wordpress' && owner?.kind !== 'term' && withId.length > 0) {
        const once = `usage\u0000${file}`
        if (seenInRecord.has(once)) continue
        seenInRecord.add(once)
        const used = usedOn.get(picture.page) ?? new Map()
        usedOn.set(picture.page, used)
        const chosen = pictureFor(withId, aspectOf(picture.size), used)
        used.set(chosen.url, (used.get(chosen.url) ?? 0) + 1)
        lanes.image.push({
          action: 'usage',
          params: {
            platform,
            path: picture.page,
            find: file,
            url: absoluteUrl(picture.file, origin),
            media: { url: chosen.url, id: chosen.id }
          }
        })
        continue
      }
      const once = `${owner ? `${owner.kind}:${owner.id}` : picture.page}\u0000${file}`
      if (seenInRecord.has(once)) continue
      seenInRecord.add(once)
      const of = owner?.kind === 'post' ? ` of post ${owner.id}` : ''
      unresolved.push({
        ...picture,
        field: 'picture',
        ...(owner ? { record: owner } : {}),
        why:
          owner?.kind === 'term'
            ? `the picture ${file} is kept in a term's meta, which no door of the site writes`
            : platform === 'wordpress'
              ? `the picture ${file}${of} is printed from the theme's own data (a post meta or an option), and no imported picture has a media id to put there`
              : `the picture ${file}${of} is printed from the theme's own data, which no door of ${platform} writes`
      })
      continue
    }
    const used = usedOn.get(picture.page) ?? new Map()
    usedOn.set(picture.page, used)
    const chosen = pictureFor(media, aspectOf(picture.size), used)
    used.set(chosen.url, (used.get(chosen.url) ?? 0) + 1)
    // A record's own picture is one write whichever card links where: once per page and file.
    const inPage = `${picture.page}\u0000${picture.file}`
    if (seenInRecord.has(inPage)) continue
    seenInRecord.add(inPage)
    const attachment = /\bwp-image-(\d+)\b/.exec(String(picture.selector ?? ''))?.[1]
    lanes.image.push({
      action: 'image',
      params: {
        platform,
        path: picture.page,
        find: file,
        ...(attachment ? { attachment: Number(attachment) } : {}),
        media: { url: chosen.url, ...(chosen.id != null ? { id: chosen.id } : {}) },
        records
      }
    })
  }
  // 🔒 THE FITTED BUSINESS LOGO WINS (product owner, round 10, 24/10/2026): whatever the agent set as the logo, an
  // unfitted upload included, the fitted copy is set over it. It replaces the setting only: the agent's upload stays
  // in the Media Library. Once the page shows the fitted copy (`matches`, the page reader's pixel compare), nothing is
  // planned, so a second run is a no-op.
  if (
    !seenLogo &&
    logo?.url &&
    typeof fittedLogo?.png === 'string' &&
    fittedLogo.png &&
    fittedLogo.matches !== true
  ) {
    const shown = typeof fittedLogo.logo === 'string' ? fittedLogo.logo : ''
    lanes.image.push({
      action: 'logo',
      params: {
        platform,
        path: '/',
        find: shown.split(/[?#]/)[0].split('/').at(-1) || 'logo',
        png: fittedLogo.png,
        media: { url: logo.url }
      }
    })
  }
  // 🔒 A TEMPLATE CATEGORY TAKES A NAME FROM THE POSTS' RESEARCH TOPICS (product owner, 25/10/2026): the QA's
  // `no-demo-words` finds each category or tag the template named that the page still names (`category` is its
  // link); each takes the next topic name the written posts cover, in the CMS's own taxonomy (the replace job
  // writes a term's name). A category past the last topic is reported: two terms never share one name.
  // `name` is the label as the page writes it; `words` the QA's case-blind key, used only when no name came.
  const named = categories
    .map((c) => ({ ...c, was: String(c?.name ?? c?.words ?? '').trim() }))
    .filter((c) => typeof c.page === 'string' && c.was !== '')
  const kept = new Set(named.map((c) => c.was))
  // A topic's name a category already has is taken: that category keeps it and no other is given it.
  const names = [...new Set(topicNames.filter((n) => typeof n === 'string' && n.trim() !== ''))]
  const free = names.filter((n) => !kept.has(n))
  const renamed = new Map()
  const onPage = new Set()
  // A TERM'S NAME IS WRITTEN ON ITS OWN ARCHIVE, AND ONLY ON WORDPRESS (dev 27/10/2026): ja-diner's four template
  // categories were planned on the post pages that show them, six rounds in a row, and stayed. The replace job reads a
  // term only where the page names its id — WordPress prints it on the category's or tag's own archive (`<body class=
  // "category-<id>">`, `replace-wordpress.mjs` `archiveOf`); a post's category link is a road to that page, never a
  // write. On Joomla a category title has no content slot and on EmDash a taxonomy label is not writable by a replace:
  // no text replace clears them, so they are reported unresolved on the first check, never planned, never in `left`.
  // A rename already sent in an earlier round of this counted check (`renamedBefore`) whose name the page still shows
  // did not take: it is reported the same way rather than planned again.
  const tried = new Set(renamedBefore)
  for (const c of named) {
    const { was } = c
    const archive = typeof c.category === 'string' && c.category.startsWith('/') ? c.category : null
    const path = archive ?? c.page
    if (names.includes(was) || onPage.has(`${path}\u0000${was}`)) continue
    onPage.add(`${path}\u0000${was}`)
    const cannot =
      platform !== 'wordpress'
        ? `a ${platform} category or tag name is not words a text replace can write: rename it through its own door`
        : !archive
          ? 'the page links this category to no page of the site, and a term is renamed only on its own archive'
          : tried.has(was)
            ? "renamed on its own archive in an earlier round, the page still shows the template's name"
            : null
    if (cannot) {
      unresolved.push({ ...c, field: 'category', why: cannot })
      continue
    }
    if (!renamed.has(was)) renamed.set(was, free[renamed.size] ?? null)
    const to = renamed.get(was)
    if (!to) {
      unresolved.push({
        ...c,
        field: 'category',
        why: 'the research has no further post topic to name this category after'
      })
      continue
    }
    lanes.term.push({
      action: 'content.replace',
      params: { find: was, replace: to, path, all: 'page' }
    })
  }
  const firstOf = (e) => (Array.isArray(e) ? e[0] : e)
  for (const lane of [lanes.price, lanes.dish, lanes.title, lanes.passage])
    lane.sort((a, b) => firstOf(b).params.find.length - firstOf(a).params.find.length)
  const asked = Object.values(lanes).flat(2)
  const picked = fairShare(lanes, SWEEP_MAX_CALLS)
  // The calls this round takes, before a page's pairs are joined into one call (`onePerPage`).
  const sent = picked.flat()
  return {
    calls: batches ? onePerPage(picked, looseCount) : sent,
    unresolved,
    // The template category names this round sends a rename for: one that still shows next round did not take.
    renamed: lanes.term.filter((c) => sent.includes(c)).map((c) => c.params.find),
    // The page leads this read left with no sourced line: they say the placeholder.
    thinLeads,
    // Every change this read asks for, before the cap, a page's words counted pair by pair however few calls carry
    // them: what a round must make smaller (`client-demo.js` `settle`).
    left: asked.length,
    // Every page's words a replace would still clear, cap or not: the evidence a `cleared` row is checked against
    // after the round (`demo-lifecycle.mjs`).
    shown: asked
      .filter((c) => c.action === 'content.replace' && !c.params.href)
      .map((c) => `${c.params.path}\u0000${c.params.find}`)
  }
}

/**
 * 🔒 THE SWEEP RUNS AFTER EVERY AGENT TURN THAT LEFT RESIDUE (product owner, 24/10/2026), whatever else is red: a
 * site whose words the agent left half done still must not show the template's dishes. Other checks stay the
 * agent's job; the sweep costs no attempt and has its own rounds (`client-demo.js`, `demo-lifecycle.mjs`).
 */
export const sweepOf = (plan) => (plan.calls.length > 0 ? plan : null)
