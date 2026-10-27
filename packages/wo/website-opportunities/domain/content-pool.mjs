// The restaurant's own social posts, made into content a demo site can show — deterministically, no model.
//
// 🔒 A BODY IS THE PAGE'S OWN WORDS, CLEANED, NEVER REWRITTEN. Nothing here adds a fact: a line is kept, cut or
// read for a date, a price or a link. The footer a page repeats under its posts (menu link, booking link,
// address, opening hours) is cut from the bodies and its links kept as evidence.

/** A line in this share of a source's posts, in their closing block, is the page's footer. */
const FOOTER_SHARE = 0.3
/** Fewer posts than this say nothing about what repeats. */
const FOOTER_MIN_POSTS = 5

const URL_RE = /https?:\/\/[^\s)]+/gi
const HAS_URL = /https?:\/\//i
const PICTOGRAPH_RE =
  /\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}|[\u{1F1E6}-\u{1F1FF}]|[\u{1F3FB}-\u{1F3FF}]/gu

/** Unicode bold/italic letters (`𝐓𝐡𝐞`) → plain ones; pictographs out; spacing tidied. */
export function plainLine(line) {
  return String(line ?? '')
    .normalize('NFKC')
    .replace(PICTOGRAPH_RE, '')
    .replace(/[ \t ]+/g, ' ')
    .trim()
}

/** A line that is only hashtags, rule marks (`____`) or a bracketed keyword list carries no content. */
function noise(line) {
  if (!line) return false
  if (!/\p{L}|\p{N}/u.test(line)) return true
  if (/^(#[\p{L}\p{N}_]+\s*)+$/u.test(line) || (line.startsWith('#') && (line.match(/#/g) ?? []).length >= 3))
    return true
  // `( Les Gourmet, Dubai Food, Sushi, … )` / `[Burgers, Steak, BBQ]`: keywords for search, not words for a reader.
  if (/^[([].*[)\]]?$/.test(line) && (line.match(/,/g) ?? []).length >= 2) return true
  // `Les Gourmet Dubai, ice cream Dubai, Dubai desserts, …` / `Dubai food • Dubai restaurants`: the same, unbracketed.
  const parts = line.split(/\s*[,•|]\s*/).filter(Boolean)
  if (
    parts.length >= 2 &&
    !/[.!?]$/.test(line) &&
    parts.filter((p) => p.split(' ').length <= 4).length >= parts.length * 0.8 &&
    (parts.length >= 5 || /•/.test(line))
  )
    return true
  // `@fernhollow.albarari`: a handle alone tags the account, it says nothing.
  if (/^@[\w.]+$/.test(line)) return true
  return FEED_BAIT.test(line)
}

/** What a post says to its followers, which means nothing on a website. */
const FEED_BAIT =
  /\b(tag (someone|a friend|the person|your)|in the comments|comment below|drop (a|your) [^.]{0,20}(comment|below|initial)|save this|share this|send (it|this) to|double tap|follow (us|for more)|link in (our )?bio|swipe (left|right|up)|tell us (in|below)|let us know (in|below))/i

/** The footer key of a line: links and digits masked, so `Reserve your table: <another link>` is the same line. */
const keyOf = (line) =>
  line
    .toLowerCase()
    .replace(URL_RE, '<url>')
    .replace(/[\d][\d .,:+()–-]*/g, '0')
    .replace(/\s+/g, ' ')

/** A line that only says how to reach the place: a link, a phone number, an address or hours label. */
function contactLike(line, facts) {
  if (facts.mentions(line)) return true
  if (/\blinks? in (our )?bio\b/i.test(line)) return true
  if (HAS_URL.test(line)) return true
  if ((line.match(/\d/g) ?? []).length >= 7 && line.replace(/[\d\s+().-]/g, '').length <= 3) return true
  return /^(open|opening hours|hours|address|location|contact|hotline|call|phone|tel|order|delivery|whatsapp|zalo|for reservations?|reservations?|booking|giờ mở cửa|địa chỉ|liên hệ|đặt bàn)\b[^:]{0,30}:/i.test(
    line
  )
}

/**
 * Template text the owner pasted and never filled in (`[Your Location]`, `{{business_name}}`): a line holding it is
 * never a page's words nor a quote (#1780).
 */
export const PLACEHOLDER_RE =
  /\[\s*(?:your|insert|enter|add|type|company|business|brand|location|address|city|phone|name|email)\b[^\]]{0,40}\]|\{\{[^}]{1,40}\}\}/i

function linesOf(caption) {
  return String(caption ?? '')
    .split(/\r?\n/)
    .filter((l) => !PLACEHOLDER_RE.test(l))
    .map(plainLine)
    .map((l) => l.replace(/(\s*#[\p{L}\p{N}_]+)+$/u, '').trim())
}

/** What a link in a post points at, read from its words and address. */
function linkKind(line, url) {
  const text = `${line} ${url}`.toLowerCase()
  if (/reserv|book|tablecheck|opentable|sevenrooms|quandoo|resy\.com|eatigo|chope/.test(text))
    return 'booking'
  if (/menu/.test(text)) return 'menu'
  return 'link'
}

/**
 * The lines one source's posts close with often enough to be its footer. Counted once per distinct caption, so a
 * post collected twice does not make its own lines look repeated.
 */
function footerOf(posts) {
  const captions = [...new Set(posts.map((p) => p.caption).filter((c) => typeof c === 'string' && c.trim()))]
  if (captions.length < FOOTER_MIN_POSTS) return new Set()
  const seen = new Map()
  for (const caption of captions) {
    const keys = new Set(
      linesOf(caption)
        .filter((l) => l && !noise(l))
        .map(keyOf)
    )
    for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  return new Set([...seen].filter(([, n]) => n / captions.length >= FOOTER_SHARE).map(([k]) => k))
}

/**
 * @param {{posts: Array<{source: string, id?: string, url?: string, caption?: string, postedAt?: string}>, now: string,
 *   facts?: {phone?: string|null, address?: string|null}}} args - `facts`: the brief's own phone and address, so a line
 *   repeating them is read as footer
 * @returns {{items: object[], links: Array<{kind: string, url: string, source: string}>}}
 */
export function contentPool({ posts = [], now, facts = {} } = {}) {
  const known = knownFacts(facts)
  const bySource = new Map()
  for (const p of posts) bySource.set(p.source, [...(bySource.get(p.source) ?? []), p])
  const links = new Map()
  const items = []
  for (const [source, list] of bySource) {
    const footer = footerOf(list)
    for (const post of list) {
      const credited = CREDIT_RE.test(String(post.caption ?? ''))
      const heading = headingOf(post.caption)
      const lines = linesOf(post.caption).filter((l) => !CREDIT_LINE.test(l))
      const kept = []
      // From the first footer line on, the closing block: contact lines there are footer too, even unrepeated ones.
      let closing = false
      for (const line of lines) {
        const isFooter = footer.has(keyOf(line)) || known.mentions(line)
        closing ||= isFooter
        for (const url of line.match(URL_RE) ?? []) {
          if (!links.has(url)) links.set(url, { kind: linkKind(line, url), url, source })
        }
        if (isFooter || noise(line) || (closing && contactLike(line, known))) continue
        kept.push(line)
      }
      const body = paragraphs(kept).join('\n\n')
      if (!body) continue
      items.push({
        body,
        heading,
        credited,
        posts: [{ source, id: post.id ?? null, url: post.url ?? null, publishedAt: post.postedAt ?? null }]
      })
    }
  }
  const at = String(now ?? '').slice(0, 10)
  const finished = mergeRepeats(items)
    .map((it) => finish(it, at))
    .filter(Boolean)
  return { items: mainLanguage(finished), links: [...links.values()] }
}

/** Words alike this much are one post said twice — unless their numbers (a date, a price, a time) differ. */
const SAME_WORDS = 0.8

const wordsOf = (text) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
const numbersOf = (text) => (text.match(/\d+(?:[.,:]\d+)*/g) ?? []).sort().join(' ')

function alike(a, b) {
  if (a.numbers !== b.numbers) return false
  let shared = 0
  for (const w of a.words) if (b.words.has(w)) shared += 1
  return shared / (a.words.size + b.words.size - shared || 1) >= SAME_WORDS
}

/** One item per post said more than once, naming every post it was said in; the most recent one's words. */
function mergeRepeats(items) {
  const groups = []
  for (const it of items) {
    const sig = { words: wordsOf(it.body), numbers: numbersOf(it.body) }
    const group = groups.find((g) => alike(g.sig, sig))
    if (group) group.items.push(it)
    else groups.push({ sig, items: [it] })
  }
  return groups.map(({ items: same }) => {
    const posts = same
      .flatMap((it) => it.posts)
      .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    const newest = same.find((it) => it.posts.includes(posts[0])) ?? same[0]
    return { ...newest, posts }
  })
}

/** Lines regrouped into paragraphs at the blank lines the post had. */
function paragraphs(lines) {
  const out = []
  let cur = []
  for (const l of lines) {
    if (l) cur.push(l)
    else if (cur.length) {
      out.push(cur.join('\n'))
      cur = []
    }
  }
  if (cur.length) out.push(cur.join('\n'))
  return out
}

/** Whether a line repeats the place's phone (its last 7 digits) or the street part of its address. */
function knownFacts({ phone, address } = {}) {
  const digits = String(phone ?? '')
    .replace(/\D/g, '')
    .slice(-7)
  const street = String(address ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  return {
    mentions(line) {
      if (digits.length === 7 && line.replace(/\D/g, '').includes(digits)) return true
      return street.length >= 6 && line.toLowerCase().includes(street)
    }
  }
}

/** A post that credits its picture or words to someone else (`📸: name`, `credit: @x`, `repost`). */
const CREDIT_RE =
  /(📸|📷|🎥)\s*:|(^|\s)(photo|pic|picture|video|credits?|cr|via|repost(ed)?|regram)\s*(by\s*)?[:@]/im
/** The credit line itself, once its pictograph is gone (`: Hoian.recorder`). */
const CREDIT_LINE = /^(:\s*\S+$|(photo|pic|picture|video|credits?|cr|via|repost(ed)?|regram)\s*(by\s*)?[:@])/i

/** The post's first line when the post sets it as a heading: Unicode bold, or every letter a capital. */
function headingOf(caption) {
  const raw =
    String(caption ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /\p{L}/u.test(l)) ?? ''
  const plain = plainLine(raw)
    .replace(/[.!:]+$/, '')
    .trim()
  if (!plain || plain.length > 70) return null
  const bold = /[\u{1D400}-\u{1D7FF}]/u.test(raw)
  const caps = /\p{Lu}{3}/u.test(plain) && !/\p{Ll}/u.test(plain)
  return bold || caps ? { line: plainLine(raw), text: caps ? titleCase(plain) : plain } : null
}

const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  '&'
])
function titleCase(text) {
  return text
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.replace(/\p{L}/u, (c) => c.toUpperCase())))
    .join(' ')
}

/** Lower-case ASCII words, diacritics stripped, padded with spaces so ` word ` matches whole words. */
function fold(text) {
  return ` ${String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9%$€£]+/g, ' ')} `
}
const has = (folded, words) => words.some((w) => folded.includes(` ${w} `))

const WORDS = {
  event: [
    'match',
    'matches',
    'world cup',
    'football',
    'kickoff',
    'kick off',
    'semi final',
    'final',
    'screening',
    'fifa',
    'grand prix',
    'live music',
    'live band',
    'live singer',
    'live performance',
    'live performances',
    'live',
    'dj',
    'party',
    'festival',
    'concert',
    'exhibition',
    'workshop',
    'tasting',
    'performance',
    'performances',
    'karaoke',
    'quiz',
    'trivia',
    'jazz night',
    'ladies night',
    'latino nights',
    'su kien',
    'nhac song',
    'le hoi',
    'dem nhac'
  ],
  // A word alone ("only", "free", "70%") says nothing: "not only a joy", "gluten free", "70% Arabica". A price does (`PRICE_RE`).
  offer: [
    'discount',
    'discounts',
    'promo',
    'promotion',
    'special offer',
    'happy hour',
    'combo',
    'buy 1',
    'buy one',
    'for free',
    'free flow',
    'set menu',
    'all you can eat',
    'all you can enjoy',
    'all you can drink',
    'giam gia',
    'khuyen mai',
    'uu dai'
  ],
  dish: [
    'dish',
    'dishes',
    'menu',
    'eggs',
    'benedict',
    'toast',
    'raclette',
    'cheese',
    'charcuterie',
    'roll',
    'rolls',
    'sushi',
    'sashimi',
    'poke',
    'cod',
    'crab',
    'prawn',
    'prawns',
    'shrimp',
    'fish',
    'chicken',
    'beef',
    'pork',
    'lamb',
    'roast',
    'pasta',
    'risotto',
    'curry',
    'bread',
    'salad',
    'sandwich',
    'wrap',
    'taco',
    'tacos',
    'burger',
    'burgers',
    'steak',
    'bbq',
    'ribs',
    'brisket',
    'dessert',
    'cake',
    'ice cream',
    'coffee',
    'espresso',
    'latte',
    'cocktail',
    'cocktails',
    'mojito',
    'wine',
    'beer',
    'seafood',
    'noodle',
    'noodles',
    'soup',
    'pizza',
    'breakfast',
    'brunch',
    'shakshuka',
    'pho',
    'banh mi',
    'bun',
    'com',
    'mon an',
    'do an'
  ],
  // What a coaching, beauty, health or education business sells in its posts (#1780: 11 of 12 posts were dropped).
  service: [
    'class',
    'classes',
    'lesson',
    'lessons',
    'session',
    'sessions',
    'coaching',
    'course',
    'courses',
    'programme',
    'programmes',
    'program',
    'programs',
    'training',
    'trainings',
    'workshop',
    'workshops',
    'membership',
    'memberships'
  ],
  product: [
    'on the shelves',
    'now available',
    'packaged',
    'packaging',
    'take home',
    'blend',
    'gift card',
    'merchandise',
    'retail',
    'bottled'
  ]
}
/** A post that says the place is closed, reopening or changed for a while: true only on the day it was posted. */
const NOTICE = [
  'hiring',
  'we re hiring',
  'join our team',
  'vacancy',
  'vacancies',
  'recruiting',
  'recruitment',
  'is seeking',
  'is searching for',
  'we are looking for',
  'send your cv',
  'apply now',
  'job opening',
  'tuyen dung',
  'giveaway',
  'contest',
  'up for grabs',
  'competition',
  'closed',
  'closure',
  'closing',
  'reopen',
  'reopening',
  'renovation',
  'renovations',
  'limited menu',
  'sold out',
  'cancelled',
  'canceled',
  'postponed',
  'tam dong cua',
  'tam nghi',
  'mo cua lai'
]
const GREETING = [
  'happy new year',
  'merry christmas',
  'happy holidays',
  'season s greetings',
  'wishes you',
  'wish you',
  'happy reunification day',
  'independence',
  'thank you for celebrating',
  'chuc mung'
]
const PRICE_RE =
  /(aed|vnd|usd|sgd|thb|eur|gbp|[$€£đ])\s?\d|\d[\d.,]*\s?(aed|vnd|usd|sgd|thb|k|đ|dong|dhs)\b|\d+\s?%\s?off\b/i

/** Item bodies shorter than this are a joke or a caption for a picture, not something a page can show. */
const MIN_BODY = 80
/** A post about nothing a page shows (no dish, story, product, event or offer) needs this much to be news. */
const MIN_NEWS = 200

/** Where the place comes from: a year it opened, its story, its age — not any post that says "family" or "since". */
const STORY_RE =
  /\b(since|opened|founded|established|began|started|opened its doors)\b[^.]{0,60}\b(19|20)\d{2}\b|\bour (story|history|origins?|roots)\b|\b\d{2,3}[- ]years?[- ]old\b|\byears ago\b|\b(cau chuyen|thanh lap)\b/

/** How many dish words a text names: what makes one food post a better menu entry than another. */
export function dishWordsIn(text) {
  const f = fold(text)
  return WORDS.dish.filter((w) => f.includes(` ${w} `)).length
}

/** An item's kinds, strongest first: the kind with the most words in it leads. */
function kindsOf(text, temporal) {
  const f = fold(text)
  const hits = Object.entries(WORDS)
    .map(([k, words]) => [k, words.filter((w) => f.includes(` ${w} `)).length])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
  const kinds = hits.map(([k]) => k)
  if (STORY_RE.test(f)) kinds.push('story')
  if (PRICE_RE.test(text) && !kinds.includes('offer') && /\b(only|just|from|special|off)\b/i.test(text))
    kinds.push('offer')
  if (temporal?.recurs && /\d{1,2}(:\d{2})?\s?(am|pm)|\d{1,2}:\d{2}/i.test(text) && !kinds.includes('event'))
    kinds.push('event')
  return kinds
}

/** The item as a page reads it, or null when it is nothing a page should show. */
function finish(item, now) {
  let body = item.body
  let title = item.heading?.text ?? null
  if (item.heading) body = body.replace(item.heading.line, '').replace(/^\s+/, '')
  body = oneScript(body)
  const f = fold(`${title ?? ''} ${body}`)
  if (body.length < MIN_BODY) return null
  if (has(f, NOTICE)) return null
  const temporal = temporalOf(`${title ?? ''}\n${body}`, item.posts[item.posts.length - 1]?.publishedAt, now)
  const kinds = kindsOf(`${title ?? ''}\n${body}`, temporal)
  if (has(f, GREETING) && !kinds.some((k) => k === 'offer' || k === 'event')) return null
  if (!kinds.length && body.length < MIN_NEWS) return null
  if (!title) title = firstSentence(body)
  return {
    lang: langOf(body),
    id: `post:${item.posts[0].source}:${item.posts[0].id ?? hashOf(body)}`,
    kinds: kinds.length ? kinds : ['news'],
    title,
    body,
    temporal:
      kinds.includes('event') || kinds.includes('offer')
        ? (temporal ?? { startsAt: null, endsAt: null, recurs: null, status: 'unknown' })
        : null,
    authorship: item.credited ? 'credited' : 'page',
    posts: item.posts
  }
}

function hashOf(text) {
  let h = 0
  for (const c of text) h = (h * 31 + c.codePointAt(0)) >>> 0
  return h.toString(36)
}

/** The first sentence, at most 70 characters, cut at a word with an ellipsis. */
function firstSentence(body) {
  const line = body.split('\n')[0]
  const sentence = (line.match(/^.+?[.!?](\s|$)/)?.[0] ?? line).trim().replace(/[.!:]+$/, '')
  const caps = /\p{Lu}{3}/u.test(sentence) && !/\p{Ll}/u.test(sentence)
  const text = caps ? titleCase(sentence) : sentence
  if (text.length <= 70) return text
  // A clause ending inside the limit reads better than a sentence cut mid-phrase.
  const clause = text.slice(0, 71).match(/^(.{30,}?)[,;:—–](?=\s)/)?.[1]
  if (clause) return clause.replace(/[,;:–-]+$/, '').trim()
  // A sentence cut mid-phrase says it goes on.
  return `${text
    .slice(0, 70)
    .replace(/\s+\S*$/, '')
    .replace(/[,;:–-]+$/, '')
    .trim()}…`
}

/** Paragraphs in the post's main script only: a bilingual post keeps one language. */
function oneScript(body) {
  const script = (t) => {
    const counts = {
      latin: (t.match(/\p{Script=Latin}/gu) ?? []).length,
      arabic: (t.match(/\p{Script=Arabic}/gu) ?? []).length,
      hangul: (t.match(/\p{Script=Hangul}/gu) ?? []).length,
      han: (t.match(/\p{Script=Han}/gu) ?? []).length,
      thai: (t.match(/\p{Script=Thai}/gu) ?? []).length,
      cyrillic: (t.match(/\p{Script=Cyrillic}/gu) ?? []).length
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  }
  const main = script(body)
  return body
    .split('\n\n')
    .filter((p) => script(p) === main)
    .join('\n\n')
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
]
const MONTH = `(${MONTHS.map((m) => `${m.slice(0, 3)}${m.slice(3) ? `(?:${m.slice(3)})?` : ''}`).join('|')})\\.?`
const ORD = '(?:st|nd|rd|th)?'
const HOLIDAYS = [
  [/christmas|noel|giang sinh/i, '12-25'],
  [/new year'?s eve/i, '12-31'],
  [/valentine/i, '02-14'],
  [/halloween/i, '10-31']
]
const RECURS =
  /\b(every|each)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|day|night|evening)|\b(mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)\b|\b(daily|hang ngay|moi ngay)\b/i

const monthOf = (name) => MONTHS.findIndex((m) => m.startsWith(name.toLowerCase().slice(0, 3))) + 1
const pad = (n) => String(n).padStart(2, '0')

/** Year for a month-day said in a post: the post's year, or the next when that day had passed long before the post. */
function dated(month, day, posted) {
  const y = Number(posted.slice(0, 4))
  const iso = `${y}-${pad(month)}-${pad(day)}`
  return Date.parse(posted) - Date.parse(iso) > 300 * 864e5 ? `${y + 1}-${pad(month)}-${pad(day)}` : iso
}

/**
 * When an event or offer runs, from its own words: a date, a date range, a holiday or "every Wednesday". The day it was
 * posted only gives the year. Nothing said → null; a weekly or daily thing is `unknown`, since a post is no proof it still runs.
 */
export function temporalOf(text, postedAt, now) {
  const posted = typeof postedAt === 'string' && postedAt.length >= 10 ? postedAt.slice(0, 10) : null
  const recurs = RECURS.test(text)
    ? /daily|hang ngay|moi ngay|every day/i.test(text)
      ? 'daily'
      : 'weekly'
    : null
  let startsAt = null
  let endsAt = null
  if (posted) {
    const range = text.match(
      new RegExp(`\\b(\\d{1,2})${ORD}\\s*[–-]\\s*(\\d{1,2})${ORD}\\s+${MONTH}\\b`, 'i')
    )
    const rangeM = text.match(
      new RegExp(`\\b${MONTH}\\s+(\\d{1,2})${ORD}\\s*[–-]\\s*(\\d{1,2})${ORD}\\b`, 'i')
    )
    const dayM = text.match(new RegExp(`\\b(\\d{1,2})${ORD}\\s+(?:of\\s+)?${MONTH}\\b`, 'i'))
    const mDay = text.match(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})${ORD}\\b(?!:)`, 'i'))
    if (range)
      [startsAt, endsAt] = [
        dated(monthOf(range[3]), +range[1], posted),
        dated(monthOf(range[3]), +range[2], posted)
      ]
    else if (rangeM)
      [startsAt, endsAt] = [
        dated(monthOf(rangeM[1]), +rangeM[2], posted),
        dated(monthOf(rangeM[1]), +rangeM[3], posted)
      ]
    else if (dayM) startsAt = dated(monthOf(dayM[2]), +dayM[1], posted)
    else if (mDay) startsAt = dated(monthOf(mDay[1]), +mDay[2], posted)
    else {
      const holiday = HOLIDAYS.find(([re]) => re.test(text))
      if (holiday) startsAt = dated(+holiday[1].slice(0, 2), +holiday[1].slice(3), posted)
    }
  }
  if (!startsAt && !recurs) return null
  const last = endsAt ?? startsAt
  const status = !startsAt || !now ? 'unknown' : last < now ? 'past' : startsAt > now ? 'upcoming' : 'active'
  return { startsAt, endsAt, recurs, status: recurs && status !== 'past' ? 'unknown' : status }
}

/** Vietnamese by its letters (`ă â đ ê ô ơ ư` and tone marks); another script by its script; else Latin, read as English. */
function langOf(text) {
  const letters = (text.match(/\p{L}/gu) ?? []).length || 1
  const vi = (text.match(/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/giu) ?? []).length
  if (vi / letters >= 0.03) return 'vi'
  const scripts = [
    ['ar', /\p{Script=Arabic}/gu],
    ['ko', /\p{Script=Hangul}/gu],
    ['zh', /\p{Script=Han}/gu],
    ['th', /\p{Script=Thai}/gu],
    ['ru', /\p{Script=Cyrillic}/gu]
  ]
  for (const [lang, re] of scripts) if ((text.match(re) ?? []).length / letters > 0.5) return lang
  return 'en'
}

/** The items in the language most of them are written in: a site speaks one, and translating is not this module's job. */
function mainLanguage(items) {
  const count = new Map()
  for (const it of items) count.set(it.lang, (count.get(it.lang) ?? 0) + 1)
  const main = [...count].sort((a, b) => b[1] - a[1])[0]?.[0]
  return items.filter((it) => it.lang === main)
}
