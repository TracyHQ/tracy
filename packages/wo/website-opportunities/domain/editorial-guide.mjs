/**
 * How a demo's posts are written: the template's blog posts become new posts of the business, written from its
 * research. One guide, read three ways — the agent's prompt is generated from it (`editorialGuideText`), a plan's
 * post rows are checked against it (`postIssues`, `apps/tracy-web/src/opportunities-build/agent-demo.js`), and
 * the check after the turn reports a blog the research could not fill (`thinResearch`). There is no second copy
 * of these rules in prompt text.
 *
 * 🔒 THE TEMPLATE'S POSTS BECOME THE BUSINESS'S OWN (product owner, 24/10/2026). Its own social posts come first and
 * keep their words; then posts written from its profile, menu, reviews, hours, address, neighbourhood and social
 * bio, one small topic each (one dish, one drink, one review quoted with its author, the story, the place, its hours,
 * its neighbourhood, its events, its people, each page of its own website).
 *
 * 🔒 A POST IS NEVER "Coming soon"; FEWER TOPICS THAN POSTS ARE SPLIT, NOT LEFT (product owner, 25/10/2026; The Willow
 * Nook local build 16: 2 topics for 22 posts, the sweep wrote "Coming soon" into 20 and posts-written failed on
 * exactly those). When the research holds fewer topics than the template has posts, a topic of several facts is split
 * into one fact each (`splitTopics`), and the residue sweep writes a post the agent left from the next one
 * (`composePost`). Only when every fact is a post of its own does the check record thin research, a note for the
 * operator, never text on the site.
 *
 * 🔒 EVERY CLAIM HAS ITS SOURCE'S WORDS (council 24/10/2026): a post row lists its claims, each tied to a quote of a
 * research part by `sourceRefs` (`source-span.mjs`, the quality dossier's own check). A claim no quote holds is
 * refused before anything is written.
 *
 * No word count or excerpt length is fixed here: a post's length follows the template's card and post layout,
 * looked at in the browser. The excerpt is the post's own opening words, and a post's date is the build day.
 */
import { forbiddenFillerText } from './slot-fill-manifest.mjs'
import { sourceSpan } from './source-span.mjs'

/**
 * 🔒 A POST IS NEVER A COPIED REVIEW (product owner, 25/10/2026): "the agent composes blog posts from research; a
 * post may quote a short, attributed line, but must not be a copied review." The Willow Nook (lrsweep rig, build 7):
 * the review topic said "quoted exactly", and twenty posts became TripAdvisor and Google reviews copied whole. The
 * longest a review's words may run in a post; the host's `no-copied-reviews` check fails a post mostly one review.
 */
export const REVIEW_QUOTE_MAX = 25

/** The topics a post is written on, in the order they are taken. `from`: the research part it is written from. */
export const POST_TOPICS = Object.freeze([
  {
    id: 'own-post',
    from: 'posts',
    says: "one of the business's own social posts: its words kept, tidied into a title and paragraphs, never reworded into a claim it does not make"
  },
  { id: 'story', from: 'profile', says: "the business's story, as its profile and social bio tell it" },
  {
    id: 'dish',
    from: 'menu',
    says: 'one collected dish: its name, what the menu says of it and its price exactly as collected'
  },
  {
    id: 'review',
    from: 'reviews',
    says: `what guests say, written in your own words from the collected reviews and ratings, quoting at most one short line of one review (${REVIEW_QUOTE_MAX} words or fewer) exactly, with its author and platform; never a review copied whole`
  },
  { id: 'drink', from: 'menu', says: 'one collected drink, the same way as a dish' },
  { id: 'place', from: 'profile', says: 'the place: its address and how it is described, as collected' },
  { id: 'hours', from: 'profile', says: 'the opening hours, as collected' },
  { id: 'neighbourhood', from: 'profile', says: 'the neighbourhood around it, as collected' },
  { id: 'event', from: 'profile', says: 'one event a collected source states, with its date as collected' },
  { id: 'people', from: 'profile', says: 'one of the people behind it, as a collected source names them' },
  {
    id: 'page',
    from: 'website',
    says: "one page of the business's own website (its menu, reservations, visit or about page): what that page says, in your own words"
  }
])

/** What every post keeps to, whatever its topic. */
export const POST_RULES = Object.freeze([
  'Write the title, the body and the excerpt in the language of the site, from the research only.',
  'Every sentence that states a fact (a dish, a price, an hour, an address, a quote, a story) is a claim: list it in post.claims with sourceRefs [{sourceId, quote}] whose quote is the research words it rests on, copied exactly.',
  `You write every post yourself from the research. A review's words appear in a post only as one short line of at most ${REVIEW_QUOTE_MAX} words, quoted exactly with its author and platform; a post made of a review's text is refused.`,
  'An event or an offer is a topic only when a collected source states it; an old social offer is history, never a current offer.',
  'The excerpt is the opening words of the post itself, never a summary of your own.',
  "The post's date is the day the site was built; never a date of your own.",
  "Length follows the template: as long as the template's post and its card show, checked on the page.",
  "The body keeps the template post's own blocks: put the words into its existing blocks (headings, paragraphs, quotes, pictures), one for one, in order, and never add, drop, merge or reorder a block. Write it block by block on the site (content.get {kind, id, outline:true}, then the blocks by position); post.body is the words in that order, or the template's markup with only its words changed."
])

const DRINK =
  /\b(drinks?|cocktails?|wines?|beers?|coffees?|teas?|bar|beverages?|juices?|spirits?|ales?|lagers?)\b/i

/** A fact's words: one line, spaces collapsed. */
const lineOf = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** A text's sentences, each a fact of its own. */
const sentencesOf = (text) =>
  (lineOf(text).match(/[^.!?]+[.!?]+["”’)]*|[^.!?]+$/g) ?? []).map((t) => t.trim()).filter(Boolean)

/** The longest a fact line runs: a page's text with no sentence end (a navigation run) is not a fact. */
const LINE_MAX = 300

/** A fact worth a post: a few words, not a navigation run. */
const factLine = (line) => line.split(' ').length >= 3 && line.length <= LINE_MAX

/** The longest a post's title runs, cut at a whole word. */
const TITLE_MAX = 70

/** A heading cut to `TITLE_MAX` at a whole word, with no trailing stop. */
const titleOf = (text) => {
  const head = lineOf(text).replace(/[.!?,;:]+$/, '')
  if (head.length <= TITLE_MAX) return head
  const cut = head.slice(0, TITLE_MAX + 1)
  return cut
    .slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : TITLE_MAX)
    .replace(/[,;:–—-]+$/, '')
    .trim()
}

/** A line's first clause, as a title: its words up to the first clause break, cut at a whole word. */
export function headOf(line) {
  const text = lineOf(line).replace(/^["“'‘]+/, '')
  const clause = text
    .split(/[.!?;:]\s|\s[–—-]\s|,\s/)[0]
    .replace(/[.!?,;:]+$/, '')
    .trim()
  return titleOf(clause.split(' ').length >= 2 ? clause : text)
}

/** A value's lines: a string, or a list of strings or of objects naming one (`name`, `title`, `text`…). */
function linesOfValue(value) {
  if (typeof value === 'string') return [lineOf(value)].filter(Boolean)
  if (Array.isArray(value)) return value.flatMap(linesOfValue)
  if (value && typeof value === 'object') {
    if (Array.isArray(value.weekdayDescriptions)) return linesOfValue(value.weekdayDescriptions)
    const named = ['name', 'title'].map((k) => lineOf(value[k])).find(Boolean)
    const told = ['role', 'date', 'when', 'description', 'bio', 'text']
      .map((k) => lineOf(value[k]))
      .filter(Boolean)
    const line = [named, ...told].filter(Boolean).join(' — ')
    return line ? [line] : []
  }
  return []
}

/** A website page's title as a heading: before its site name ("Reservations | The Willow Nook"). */
const pageHead = (title, name) => {
  const head = lineOf(title)
    .split(/\s[|–—-]\s|\s·\s/)[0]
    .trim()
  if (head === '' || (name && head.toLowerCase().includes(name.toLowerCase()))) return null
  return head
}

/** A page's text without the site name and page heading its navigation repeats at the start. */
function pageText(text, strip) {
  let rest = lineOf(text)
  for (let changed = true; changed; ) {
    changed = false
    for (const s of strip)
      if (s && rest.toLowerCase().startsWith(`${s.toLowerCase()} `)) {
        rest = rest.slice(s.length).trim()
        changed = true
      }
  }
  return rest
}

/**
 * The topics a business's research holds, in the order posts take them: its own posts first, then the story, then
 * dishes, reviews and drinks taken in turn, then the place, its hours, its neighbourhood, its events, its people and
 * each page of its own website. Each topic carries the facts a post on it is written from (`lines`) and the words a
 * title takes (`head`); a line one topic holds is in no other.
 * @param {{posts?: unknown[], menu?: Array<Record<string, any>>, reviews?: unknown[], profile?: Record<string, any> | null, pages?: Array<{title?: string, text?: string, url?: string, sourceId?: string}>, name?: string | null}} research
 * @returns {Array<{topic: string, sourceId: string, index: number | null, head: string, lines: string[]}>}
 */
export function postTopics(research) {
  const topics = []
  const seen = new Set()
  const key = (line) => wordsOf(line).join(' ')
  const fresh = (lines) =>
    lines.filter((line) => {
      const k = key(line)
      if (k === '' || seen.has(k)) return false
      seen.add(k)
      return true
    })
  const add = (topic, sourceId, index, lines, head = null) => {
    const kept = fresh(lines)
    if (kept.length > 0) topics.push({ topic, sourceId, index, head: head ?? headOf(kept[0]), lines: kept })
  }
  const profile = research.profile ?? {}
  const name = lineOf(research.name ?? profile.name) || null
  const own = (research.posts ?? []).filter((p) => p && typeof p === 'object')
  own.forEach((p, index) => {
    const post = /** @type {Record<string, any>} */ (p)
    add(
      'own-post',
      'part:posts',
      index,
      sentencesOf(post.text ?? post.caption ?? post.message ?? post.title ?? '')
    )
  })
  const story = ['description', 'about', 'story', 'bio', 'editorialSummary', 'summary'].flatMap((k) =>
    typeof profile[k] === 'string' ? sentencesOf(profile[k]) : linesOfValue(profile[k]?.text)
  )
  add('story', 'part:profile', null, story)
  const items = (research.menu ?? []).filter((i) => i && typeof i.name === 'string' && i.name.trim() !== '')
  const isDrink = (i) => DRINK.test(`${i.category ?? ''} ${i.section ?? ''} ${i.kind ?? ''}`)
  const dishLine = (i) => {
    const price = i.price != null && i.price !== '' ? `${i.price}${i.currency ? ` ${i.currency}` : ''}` : ''
    const said = lineOf(i.description)
    return `${lineOf(i.name)}${said ? `: ${said.replace(/[.!?]*$/, '.')}` : '.'}${price ? ` ${price}` : ''}`
  }
  const queues = [
    items.flatMap((i, index) =>
      isDrink(i) ? [] : [['dish', 'part:menu', index, [dishLine(i)], lineOf(i.name)]]
    ),
    (research.reviews ?? []).map((r, index) => {
      const review = /** @type {Record<string, any>} */ (r ?? {})
      const said = review.review && typeof review.review === 'object' ? review.review : review
      return ['review', 'part:reviews', index, [lineOf(said.text) || JSON.stringify(said)]]
    }),
    items.flatMap((i, index) =>
      isDrink(i) ? [['drink', 'part:menu', index, [dishLine(i)], lineOf(i.name)]] : []
    )
  ]
  while (queues.some((q) => q.length > 0))
    for (const q of queues)
      if (q.length > 0) add(.../** @type {[string, string, number, string[], string]} */ (q.shift()))
  const address = lineOf(profile.formattedAddress ?? profile.address)
  if (address) add('place', 'part:profile', null, [address], address)
  const hours = linesOfValue(profile.openingHours ?? profile.hours ?? profile.regularOpeningHours)
  if (hours.length) add('hours', 'part:profile', null, hours, hours[0])
  const around = linesOfValue(profile.neighbourhood ?? profile.neighborhood)
  if (around.length) add('neighbourhood', 'part:profile', null, around, around[0])
  linesOfValue(profile.events).forEach((line, index) => add('event', 'part:profile', index, [line]))
  for (const k of ['people', 'team', 'staff', 'owners', 'founders', 'chefs'])
    linesOfValue(profile[k]).forEach((line, index) => add('people', 'part:profile', index, [line]))
  ;(research.pages ?? []).forEach((page, index) => {
    const head = pageHead(page?.title, name)
    const text = pageText(page?.text, [name, head, name])
    add('page', page?.sourceId ?? 'part:profile', index, sentencesOf(text).filter(factLine), head)
  })
  return topics
}

/**
 * 🔒 FEWER TOPICS THAN POSTS ARE SPLIT INTO NARROWER ONES (product owner, 25/10/2026): the topic holding the most
 * facts is cut in two, its facts kept in order, until there are `want` topics or every topic holds one fact. The
 * second half takes its own first clause as its title.
 * @param {ReturnType<typeof postTopics>} topics @param {number} want
 */
export function splitTopics(topics, want) {
  const out = topics.map((t) => ({ ...t, lines: [...t.lines] }))
  while (out.length < want) {
    let at = -1
    out.forEach((t, i) => {
      if (t.lines.length > 1 && (at < 0 || t.lines.length > out[at].lines.length)) at = i
    })
    if (at < 0) break
    const from = out[at]
    // Halves, not single facts: a question keeps its answer while the topics are enough. The second half sits next
    // to the first, so a page's facts stay in the order taken.
    const rest = from.lines.splice(Math.ceil(from.lines.length / 2))
    out.splice(at + 1, 0, { ...from, head: headOf(rest[0]), lines: rest })
  }
  return out
}

/**
 * A post the residue sweep writes from one topic's facts, when the agent left a template post unwritten: its title the
 * topic's heading, its body the facts in order, its excerpt the body's opening sentence. No word of its own: only the
 * research's. A review is never one (a post made of a review's words is a copied review): null.
 * @param {{topic: string, head: string, lines: string[]}} topic
 * @returns {{topic: string, title: string, body: string, excerpt: string, lines: string[]} | null}
 */
export function composePost(topic) {
  if (!topic || topic.topic === 'review') return null
  const lines = topic.lines.map(lineOf).filter(Boolean)
  const title = titleOf(topic.head || headOf(lines[0] ?? ''))
  if (lines.length === 0 || title === '') return null
  const body = lines.map((l) => (/[.!?]["”’)]*$/.test(l) ? l : `${l}.`)).join(' ')
  return { topic: topic.topic, title, body, excerpt: sentencesOf(body)[0] ?? body, lines }
}

/**
 * 🔒 A PAGE'S LEAD IS WRITTEN, NEVER "Coming soon" (product owner, 24/10/2026). The short line under a page's or a
 * section's heading (a banner's lead, a tagline, a section's intro) is editorial copy: the agent writes it from the
 * research for that page, adding no fact the research does not hold, and never filler (`neutral-copy/forbidden.json`).
 * The lines a template has are listed to the agent (`editorialLeads`, `apps/tracy-web/src/opportunities-build/
 * agent-demo.js`) and a plan that leaves one out is sent back.
 */
export const LEAD_RULE = `Each line of editorialLeads, returned by plan.read with its page and where it sits (the short line under a page's or a section's heading: a banner lead, a tagline, a section intro), is written for its page by a rewrite row on the record that holds it (a page printing another page's banner, such as a post under its blog page's, holds none of its own: the row targets the record or slot that stores the line), carrying lead:{page, was:<the line as listed>, text:<the new line>} and citing its sourceIds. The new line says what the page or section offers this business's visitors, in its own words, at about the template line's length, with no fact the research does not hold and never filler ("Coming soon", "TBD").`

/** The longest a lead line may be: a banner line, never a passage. */
export const LEAD_MAX = 200

/**
 * What is wrong with a plan row's lead: no page or template line, no new line, a new line that is the template's,
 * the placeholder, or a passage.
 * @param {unknown} lead
 * @returns {Array<{path: string, message: string}>}
 */
export function leadIssues(lead) {
  if (!lead || typeof lead !== 'object') return [{ path: 'lead', message: 'lead is {page, was, text}.' }]
  const { page, was, text: line } = /** @type {{page?: unknown, was?: unknown, text?: unknown}} */ (lead)
  const issues = []
  const text = plain(line)
  if (typeof page !== 'string' || !page.startsWith('/'))
    issues.push({ path: 'lead.page', message: 'The public path of the page the line is on, as listed.' })
  if (!plain(was))
    issues.push({ path: 'lead.was', message: "The template's line, as editorialLeads lists it." })
  if (!text) issues.push({ path: 'lead.text', message: 'The new line is required.' })
  else if (text === plain(was))
    issues.push({ path: 'lead.text', message: "The new line must not be the template's." })
  else if (isPlaceholderText(text) || forbiddenFillerText(text))
    issues.push({
      path: 'lead.text',
      message: 'A lead is written from the research, never filler.'
    })
  else if (text.length > LEAD_MAX)
    issues.push({ path: 'lead.text', message: `A lead is one line of at most ${LEAD_MAX} characters.` })
  return issues
}

/** The prompt's words for posts, generated from the topics and rules above. */
export function editorialGuideText() {
  const topics = POST_TOPICS.map((t, i) => `${i + 1}) ${t.id}: ${t.says}`).join('; ')
  return `Template blog posts become new posts of this business, one topic each, in this order: ${topics}. Each written post is a plan row on that post's own record (operation rewrite, target its body field (post_content on WordPress, introtext on Joomla); a second row on its title field writes the title) carrying post:{topic, title, body, excerpt, claims:[{text, sourceRefs:[{sourceId, quote}]}]}. ${POST_RULES.join(' ')} Every post is composed from the research: a fact the research does not hold is left out, never written as filler ("Coming soon", "TBD"), and a post left showing only filler fails the check. When the research has fewer topics than the template has posts, split them into narrower ones taken from its facts (one dish or drink, one review, the place, its hours, one event, one of its people, one page of its website, then one fact each); never repeat a topic or invent one. A post you leave unwritten is written by the build from the facts no written post says.`
}

/** A text's words, lower-cased: letters and digits only. */
const wordsOf = (t) =>
  String(t ?? '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? []

/**
 * The share of `text`'s words that sit in a run of six words found in `source` too (0..1). The host's
 * `no-copied-reviews` (`apps/tracy-host/src/demo-qa.js` `copiedShare`) measures a built post the same way.
 * @param {string} text @param {string} source
 */
export function copiedShare(text, source) {
  const RUN = 6
  const w = wordsOf(text)
  const s = wordsOf(source)
  if (w.length < RUN || s.length < RUN) return 0
  const runs = new Set()
  for (let i = 0; i + RUN <= s.length; i++) runs.add(s.slice(i, i + RUN).join(' '))
  const covered = new Uint8Array(w.length)
  for (let i = 0; i + RUN <= w.length; i++)
    if (runs.has(w.slice(i, i + RUN).join(' '))) covered.fill(1, i, i + RUN)
  return covered.reduce((n, c) => n + c, 0) / w.length
}

/** A post's words as a reader reads them: no tags, entities read, spaces collapsed. */
const plain = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0*39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

/** A line that only holds a slot open: "Coming soon", "TBD", "To be announced", "Details coming soon"… */
const PLACEHOLDER_LINE =
  /^(?:(?:more|details|menu|post|posts|content|story|updates?|news) )?(?:coming soon|to come)$|^(?:tbd|tba|tbc|n\/a|placeholder|lorem ipsum)$|^to be (?:announced|confirmed|added|written|updated)$/

/**
 * 🔒 A POST IS COMPOSED FROM THE RESEARCH, NEVER "Coming soon" (product owner, 25/10/2026; The Willow Nook local
 * build 15: 17 posts got "Coming soon" as title and body and posts-written passed). Whether a text is only a
 * placeholder: every sentence of it is one of `PLACEHOLDER_LINE`. Empty text is not (it is missing, not filled).
 * @param {unknown} text
 */
export function isPlaceholderText(text) {
  // Each block of a body is a line of its own: `<p>Coming soon</p><p>Coming soon.</p>` is two placeholders.
  const lines = plain(String(text ?? '').replace(/<\/(?:p|h[1-6]|li|div|blockquote)>|<br\s*\/?>/gi, '. '))
    .toLowerCase()
    .split(/[.!?…]+|\s[-–—|:]\s/)
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.length > 0 && lines.every((line) => PLACEHOLDER_LINE.test(line))
}

/** The refusal of a post whose title, body or excerpt is only a placeholder. */
export const PLACEHOLDER_POST =
  "A post is composed from the research: write its title, body and excerpt from a research topic's facts. A fact the research does not hold is left out, never written as filler."

/**
 * What is wrong with a plan row's post: an empty title, body or excerpt, an excerpt that is not the post's own
 * words, a claim the post does not make or no research quote holds, a review or own post whose words were not
 * kept.
 * @param {unknown} post
 * @param {Array<{id: string, body: string}>} sources - each research part as one text (`source-span.mjs` `sourceText`)
 * @returns {Array<{path: string, message: string}>}
 */
export function postIssues(post, sources) {
  const issues = []
  const issue = (path, message) => issues.push({ path, message })
  if (!post || typeof post !== 'object') return [{ path: 'post', message: 'post must be an object.' }]
  const p = /** @type {Record<string, any>} */ (post)
  if (!POST_TOPICS.some((t) => t.id === p.topic))
    issue('post.topic', `Use one of ${POST_TOPICS.map((t) => t.id).join(', ')}.`)
  for (const key of ['title', 'body', 'excerpt'])
    if (typeof p[key] !== 'string' || plain(p[key]) === '')
      issue(`post.${key}`, `A written ${key} is required; a post the research cannot fill is not a row.`)
    else if (isPlaceholderText(p[key])) issue(`post.${key}`, PLACEHOLDER_POST)
  const body = plain(p.body)
  const words = `${plain(p.title)} ${body}`
  if (typeof p.excerpt === 'string' && !body.includes(plain(p.excerpt)))
    issue('post.excerpt', "The excerpt is the post's own words: copy them from its body.")
  if (!Array.isArray(p.claims) || p.claims.length === 0) {
    issue('post.claims', 'List every factual sentence of the post as a claim with its sourceRefs.')
    return issues
  }
  const quotes = []
  p.claims.forEach((claim, i) => {
    const at = `post.claims[${i}]`
    if (!claim || typeof claim.text !== 'string' || claim.text.trim() === '') {
      issue(`${at}.text`, 'A claim is a sentence of the post.')
      return
    }
    if (!words.includes(plain(claim.text))) issue(`${at}.text`, 'A claim must be words the post says.')
    if (!Array.isArray(claim.sourceRefs) || claim.sourceRefs.length === 0) {
      issue(`${at}.sourceRefs`, 'A claim needs at least one research quote.')
      return
    }
    claim.sourceRefs.forEach((ref, j) => {
      const span = sourceSpan(ref, sources, { locate: true })
      if (!span.ok)
        issue(
          `${at}.sourceRefs[${j}]`,
          `The quote must be words of ${ref?.sourceId ?? 'a research part'}, copied exactly.`
        )
      else quotes.push(span)
    })
  })
  // A review is quoted in one short line, never copied into a post (`REVIEW_QUOTE_MAX`): a longer quote, or a body
  // whose words mostly run as the reviews' do, is refused.
  quotes.forEach((q) => {
    if (q.source.id === 'part:reviews' && wordsOf(q.quote).length > REVIEW_QUOTE_MAX)
      issue('post.claims', `Quote at most ${REVIEW_QUOTE_MAX} words of a review; write the rest yourself.`)
  })
  const reviews = sources.find((src) => src.id === 'part:reviews')?.body ?? ''
  if (copiedShare(body, reviews) >= 0.5)
    issue(
      'post.body',
      "The post is mostly a review's words: write it yourself from the research, quoting one short line."
    )
  // A review keeps its words, a post of the business its own: the longest words it quotes of that part are in
  // its body as quoted (an author's name alone is not the review).
  if (p.topic === 'review' || p.topic === 'own-post') {
    const part = p.topic === 'review' ? 'part:reviews' : 'part:posts'
    const longest = quotes
      .filter((q) => q.source.id === part)
      .sort((a, b) => b.quote.length - a.quote.length)[0]
    if (!longest || !body.includes(plain(longest.quote)))
      issue('post.body', `A ${p.topic} post keeps the quoted words of ${part} in its body.`)
  }
  return issues
}

/**
 * The check's note on a blog the research could not fill: the template's posts, the posts written, the topics
 * the research held once split to one fact each (`splitTopics`) and, when known, the posts the residue sweep composes
 * from the topics no written post used (`drafts`). Thin when posts are left that no research fact is left for; null
 * otherwise. A note for the operator, never text on the site.
 * @param {{templatePosts: number, written: number, topics: number, drafts?: number}} counts
 */
export function thinResearch({ templatePosts, written, topics, drafts }) {
  const left = templatePosts - written - (drafts ?? 0)
  if (left <= 0 || (drafts === undefined && written < topics)) return null
  return {
    code: 'THIN_RESEARCH',
    left,
    message: `${left} of the template's ${templatePosts} posts are left unwritten: the research held ${topics} topics.`
  }
}
