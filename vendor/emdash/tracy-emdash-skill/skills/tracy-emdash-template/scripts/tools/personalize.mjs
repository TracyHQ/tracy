#!/usr/bin/env node
// Make a customer's copy of this template THEIR site from the questionnaire answers
// (seed/questions.json → name · sector · contact), by the map in seed/personalize.json:
//
//   identity  deterministic fields — brand name and mark, hotline, address, copyright, site title —
//             written exactly; an answer the customer did not give leaves the field EMPTY (or is
//             skipped and reported), never the demo value: a wrong hotline on a live site is worse
//             than none;
//   replace   every mention of the demo brand ("Northgate", «Норткейт») in every string of every
//             entry becomes the customer's name — URLs, slugs and references excluded;
//   copy      the sentences a template cannot write ahead of time (tagline, hero, ledes, calls to
//             action), written by a model per locale from the name, the sector and the demo text as
//             a length-and-register reference. No model key, or the About answer blank (ABOUT-3, K7) →
//             these are SKIPPED and named in the report; the demo copy stays, renamed, as do the
//             demo entries' titles, terms, bodies and card lists.
//   trim      demo rows taken off the site: the first `keep` of each collection stay, the rest leave BEFORE
//             anything is written to them, and links that led to them are taken out (the words stay). Only when
//             the customer described the business (`about`) AND a model rewrites what stays. 🔒 No Tracy template
//             carries a `trim` rule since 11/10/2026 (TCH #1013, decision A): demo entries are rewritten, never cut,
//             so the site keeps as many projects, notes and roles as the demo.
//   facts     the demo company's claims (counts, clients, team, history, prices, project facts): emptied, never
//             invented, only when the customer described the business (`about`); with the About answer
//             blank they stay as the template has them, renamed (ABOUT-3).
//
// All of them write only the locales the customer chose (`localesFrom`), English when they chose
// none, and always the default locale; one language other than the root's is written INTO the
// root. When they chose, every other locale is hidden: its entries unpublished, never deleted, and
// its URLs redirected by the template. When they chose none, no locale is hidden (LANG-5), and every
// edition still served gets the customer's name and nothing else (`nameOnly` of `planFrom`, ABOUT-3).
// A page the customer unticked goes from every edition still served, written or not (PAGE-1).
//
//   node tools/personalize.mjs [--answers <file> | --answers-json <json>] [options]
//     --site <origin>        default http://127.0.0.1:4321 (or $TEMPLATE_SITE)
//     --token-file <path>    default data/tracy-agent.token
//     --seed <dir>           default seed/ (seed.json · personalize.json · questions.json)
//     --receipts <file>      default data/personalize-receipts.json
//     --journal <file>       default data/personalize-journal.jsonl, beside the receipts
//     --dry-run              plan only, write nothing
//     --no-model             skip everything a model writes, even when a key is present
//     --no-images            write the words but draw no pictures
//     --hide-chrome-only     hide a language by unpublishing its `site` entry alone (what the template serves by)
//     --concurrency <n>      requests in flight per lane, 1–16 (default 4)
//     --logo-file <png>      the light-background (or only) logo → settings.logo
//     --logo-dark-file <png> the dark-background logo → the field `brand.logoDark` of the map names
//     --favicon-file <png>   the favicon → settings.favicon
//     --share-file <png>     the share card made from the logo → settings.seo.defaultOgImage
//     --brand-only           write those pictures and nothing else (answers optional; `name` is the logo's alt)
//     --apply-id <id>        journal the run under this id instead of the next `pers-<n>`
//     --json                 print the report as JSON (what the Build stage reads)
//   node tools/personalize.mjs --inspect [--json]        what every run wrote, and what is live now
//   node tools/personalize.mjs --revert <applyId> [--json]   put the latest run's `before` back
//
// Model: TRACY_SEED_TEXT_PROVIDER (`openrouter` | `deepseek`, what /ops assigned) names the door
// when its key is there; else TRACY_MODEL_URL + TRACY_MODEL_KEY + TRACY_MODEL_NAME (an
// OpenAI-compatible chat endpoint — the tests use one); else DEEPSEEK_API_KEY, else
// OPENROUTER_API_KEY. TRACY_SEED_IMAGE_MODEL, then `images.model` of the map, names the picture
// model. The report says which was actually used (`model`).
//
// Exit codes: 0 done · 1 API or tool failure · 2 usage · 3 done, but some copy was skipped ·
// 4 a write failed (`errors` in the report — takes precedence over 3)
//
// Writes follow seed-apply.mjs's discipline for EmDash 0.37: GET the entry, PUT the patched data
// with `_rev` (that is a DRAFT), then POST publish — the public site serves `liveData`, and a PUT
// alone changes nothing a visitor sees. Every mutation is journaled (`data/personalize-journal.jsonl`)
// with the value BEFORE and AFTER, one line before the call and one after, so a crash between the
// two is visible on the next run and `--revert` can put the last run back. Receipts keyed
// `<collection>/<slug>/<locale>` remember the revision we published and the hash of what we wrote:
// a second run with the same answers writes nothing; an entry an editor changed since (live `_rev`
// ≠ receipt) is left alone and reported.
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : dflt
}
const flag = (name) => args.includes(name)

const SITE = opt('--site', process.env.TEMPLATE_SITE ?? 'http://127.0.0.1:4321').replace(/\/+$/, '')
const TOKEN_FILE = opt('--token-file', 'data/tracy-agent.token')
const SEED_DIR = opt('--seed', 'seed')
const RECEIPTS_FILE = opt('--receipts', 'data/personalize-receipts.json')
const JOURNAL_FILE = opt('--journal', path.join(path.dirname(RECEIPTS_FILE), 'personalize-journal.jsonl'))
/** Where the template reads the language tag it prints (`src/lib/display-locale.ts`). */
const DISPLAY_FILE = opt('--display-file', path.join(path.dirname(RECEIPTS_FILE), 'display-locale.json'))
const DRY = flag('--dry-run')
const NO_MODEL = flag('--no-model')
const NO_IMAGES = flag('--no-images')
/**
 * Hide a language by unpublishing only its site chrome entry, not every entry it has. The template serves a locale
 * ONLY when its `site` entry is published (`src/lib/served-locales.ts`: the switcher, the hreflang links, the
 * sitemap and the redirect of its URLs all ask that one question), so the other ~50 entries per language change
 * nothing a visitor can reach — and unpublishing them is ~1,750 round trips (about 56 s measured 03/10/2026)
 * for a site that asked for one language. Off by default: the agent's own runs keep hiding every entry.
 */
const HIDE_CHROME_ONLY = flag('--hide-chrome-only')
const JSON_OUT = flag('--json')
const INSPECT = flag('--inspect')
const REVERT = opt('--revert', null)
/**
 * The customer's brand pictures (TCH #1013, T22): PNG files the caller prepared. Each one given is written — the light
 * (or only) logo to core `settings.logo`, the favicon to core `settings.favicon`, the dark-background logo to the field
 * `brand.logoDark` of seed/personalize.json names, the share card (D5) to core `settings.seo.defaultOgImage` — and none
 * is ever made up. They need no model and no picture door, so `--no-model` and `--no-images` leave them alone.
 */
const BRAND_FILES = Object.freeze({
  logo: opt('--logo-file', null),
  logoDark: opt('--logo-dark-file', null),
  favicon: opt('--favicon-file', null),
  share: opt('--share-file', null)
})
/** Write the brand pictures and nothing else: no words, no languages, no pages. */
const BRAND_ONLY = flag('--brand-only')
/** The id this run is journaled under (what `--revert` takes), instead of the next `pers-<n>`. */
const APPLY_ID_ARG = opt('--apply-id', null)

/**
 * What a `generated` value carries to the site, and the one place the sentence lives. The same
 * words Joomla's contract writes (`site.mjs` in tracy-site-tools): a value a model wrote is not
 * from the brief, and the customer is told so where they see it.
 */
export const EVIDENCE_GENERATED =
  'Invented by Tracy to fit the customer; not from the brief. Replace it with the real one.'
/** Where a value came from — journaled per field, and the `generated` ones need `evidence`. */
export const ORIGINS = Object.freeze(['customer', 'derived', 'removed', 'empty', 'replaced', 'generated'])

/**
 * One line of progress, to stderr, in the grammar the build's task list reads — `words 57 of 114`,
 * `entries 4 of 12`, `pictures 3 of 6` (`progressOf` in tracy-site-build-core/src/host/todos.mjs).
 *
 * 🔒 STDERR, NOT STDOUT. Stdout is the report the `personalize` stage parses as JSON at the end;
 * a progress line there would break the parse. And it is a COUNT, not a sentence: the customer
 * may not read English, so the phrasing is the build plugin's, in their language.
 * @param {'words' | 'entries' | 'pictures'} kind @param {number} done @param {number} total
 */
function say(kind, done, total) {
  process.stderr.write(`${kind} ${String(done)} of ${String(total)}\n`)
}

/**
 * How many model requests are in flight at once, per lane. Four text requests and four image
 * requests together stayed under both DeepSeek's and OpenRouter's rate limits (15/09).
 */
const CONCURRENCY = Math.max(1, Math.min(16, Number(opt('--concurrency', '4')) || 4))

/**
 * `fn` over every item, at most `limit` at a time. A rejection inside `fn` is `fn`'s to catch:
 * one failed item must not stop the others, so nothing here re-throws.
 * @template T @param {T[]} items @param {number} limit @param {(item: T, i: number) => Promise<void>} fn
 */
async function eachLimit(items, limit, fn) {
  const queue = [...items.entries()]
  const worker = async () => {
    for (;;) {
      const next = queue.shift()
      if (next === undefined) return
      const [i, item] = next
      await fn(item, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker))
}

/** A gate that lets at most `limit` of the tasks handed to it run at once; the others wait, in the order they came. */
function limiter(limit) {
  let running = 0
  const waiting = []
  const next = () => {
    if (running >= limit || waiting.length === 0) return
    running += 1
    const { task, resolve, reject } = waiting.shift()
    task()
      .then(resolve, reject)
      .finally(() => {
        running -= 1
        next()
      })
  }
  return (task) =>
    new Promise((resolve, reject) => {
      waiting.push({ task, resolve, reject })
      next()
    })
}

// ───────────────────────── answers ─────────────────────────
function readAnswers() {
  const inline = opt('--answers-json', null)
  const file = opt('--answers', null)
  let raw = null
  if (inline !== null) raw = inline
  else if (file !== null) raw = readFileSync(file, 'utf8')
  else if (BRAND_ONLY) return {}
  else {
    console.error(
      'usage: personalize.mjs --answers <file> | --answers-json <json> [--site url] [--dry-run] [--no-model] [--json]'
    )
    process.exit(2)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.error('answers are not JSON')
    process.exit(2)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error('answers must be an object of question id → answer')
    process.exit(2)
  }
  return parsed
}

const text = (v) => (typeof v === 'string' ? v.trim() : '')
/** One mailbox, no spaces, a dot after the @: enough to keep a phone number off the top bar. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * The social profiles the customer linked, from `answers.social` (a list of `{network, url}` or an object network → address):
 * only web addresses, each with the pieces a template may ask for (`network`, `name`, `handle`, `url`). Never a profile made up
 * from a name.
 * @param {unknown} raw
 * @returns {Array<{ network: string, name: string, handle: string, url: string }>}
 */
export function socialFrom(raw) {
  const entries = Array.isArray(raw)
    ? raw.map((e) => [e?.network ?? e?.name, e?.url])
    : raw && typeof raw === 'object'
      ? Object.entries(raw)
      : []
  const out = []
  for (const [network, url] of entries) {
    const n = typeof network === 'string' ? network.trim().toLowerCase() : ''
    const u = typeof url === 'string' ? url.trim() : ''
    if (!/^[a-z][a-z0-9 ._-]{0,24}$/.test(n) || !/^https?:\/\/[^\s]+$/i.test(u)) continue
    const tail =
      u
        .replace(/[?#].*$/, '')
        .split('/')
        .filter(Boolean)
        .pop() ?? ''
    out.push({
      network: n,
      name: n === 'x' ? 'X' : n.charAt(0).toUpperCase() + n.slice(1),
      handle: `@${tail.replace(/^@/, '')}`.slice(0, 60),
      url: u
    })
  }
  return out
}

/** The facts every value template may name, from the answers. Missing → absent, never invented. */
export function factsFrom(answers, questions = null, now = new Date()) {
  const facts = {}
  const name = text(answers.name)
  if (name) {
    facts.name = name
    facts.NAME = name.toUpperCase()
    facts.initials = initialsOf(name)
  }
  const contact = text(answers.contact)
  if (contact) {
    const phone = phoneIn(contact)
    if (phone) facts.phone = phone
    const address = addressIn(contact, phone)
    if (address) facts.address = address
  }
  // 🔒 A JUNK EMAIL IS NOT A FACT. It lands on the top bar and on the enquiry form of a live site,
  // so a value that is not an address (a phone typed in the wrong box, "n/a") is dropped like a
  // missing answer: the field stays EMPTY rather than showing a mailbox nobody reads.
  const email = text(answers.email)
  if (email && EMAIL.test(email)) facts.email = email
  // Opening hours, as the owner wrote them; a template with an hours field fills it, one with none ignores it.
  const hours = text(answers.hours)
  if (hours) facts.hours = hours
  // The profiles the customer linked; a rule that names `from: "social"` puts them where the demo's own were.
  const social = socialFrom(answers.social)
  if (social.length > 0) facts.social = social
  const sector = text(answers.sector)
  if (sector) {
    facts.sector = sector
    const q = questions?.questions?.find((x) => x.id === 'sector')
    const label = q?.optionLabels?.[sector]
    facts.sectorLabel = label && typeof label === 'object' ? (label.en ?? sector) : sector
  }
  /**
   * 🔒 WHAT THE BUSINESS DOES — THE ONE ANSWER THAT MAKES THIS PERSONALISATION RATHER THAN A RENAME.
   *
   * `name` says what to call them, `sector` puts them in a bucket, `contact` says where they are.
   * None of them says what they SELL, to whom, or why anyone should choose them — and until now
   * nothing here read the answer that does. Measured 20/09/2026 on `site-4x82yk` (`tracy-saas`):
   * the stage reported `320 fields on 188 entries · copy 39 written`, and every one of those 39
   * sentences was written from a name — `bán xe nội thật` — plus a demo about a SaaS log product.
   * The hero kept advertising `helix tail --service=checkout-api`. The customer reads that as
   * "it only changed the title", and they are right about what it means even though 320 fields
   * moved: the words changed, what they SAY did not.
   *
   * Kept as prose, not parsed. It goes to the model as the description it writes from, and the
   * model is already forbidden to invent facts — so a sentence the customer wrote is exactly the
   * kind of input this is safe with, and the only kind that is specific to them.
   */
  const about = text(answers.about)
  if (about) facts.about = about
  // 🔒 THE TONE IS THE VOICE, NOT THE SUBJECT (TCH #1013, T15). It goes to the model beside the description as a field of
  // its own: folded into `about`, a tone given with no description became the thing every line was written about.
  const tone = text(answers.tone)
  if (tone) facts.tone = tone
  facts.year = String(now.getFullYear())
  return facts
}

const STOP = new Set(['and', 'the', 'of', '&', 'co', 'ltd', 'llc', 'jsc', 'inc', 'gmbh', 'và', 'công', 'ty'])
/** A brand mark from the name: up to three initials, the first two words and the last. */
export function initialsOf(name) {
  const words = name.split(/\s+/).filter((w) => w.length > 0 && !STOP.has(w.toLowerCase()))
  const letters = words.map((w) => [...w][0].toUpperCase())
  if (letters.length === 0) return name.slice(0, 2).toUpperCase()
  if (letters.length === 1) return [...words[0]].slice(0, 2).join('').toUpperCase()
  if (letters.length <= 3) return letters.join('')
  return `${letters[0]}${letters[1]}${letters[letters.length - 1]}`
}

/** The first thing that reads as a phone number: seven or more digits with the usual separators. */
export function phoneIn(s) {
  const m = /(\+?\(?\d[\d\s().-]{5,}\d)/.exec(s)
  if (!m) return null
  const candidate = m[1].replace(/\s+/g, ' ').trim()
  return candidate.replace(/\D/g, '').length >= 7 ? candidate : null
}

/** What is left of the contact line once the phone is taken out of it. */
export function addressIn(s, phone) {
  let rest = phone ? s.replace(phone, ' ') : s
  rest = rest
    .replace(/\b(tel|phone|hotline|đt|điện thoại|sđt|тел|телефон)\b\.?:?/gi, ' ')
    .replace(/[·|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '')
    .trim()
  return rest
}

/**
 * Fill `{fact}` slots. Null when a slot has no fact — the caller decides between `empty` and skip.
 */
export function fill(template, facts) {
  let missing = null
  const used = []
  const out = template.replace(/\{([A-Za-z]+)\}/g, (_, key) => {
    if (facts[key] === undefined) {
      missing ??= key
      return ''
    }
    used.push(key)
    return facts[key]
  })
  return missing ? { missing } : { value: out, used }
}

/** The facts this tool works out itself, from an answer rather than in one: their origin is `derived`. */
const DERIVED = new Set(['initials', 'year'])
/** `customer` when any slot is the customer's own word; `derived` when every slot is worked out. */
const originOfFill = (used) => (used.length > 0 && used.every((k) => DERIVED.has(k)) ? 'derived' : 'customer')

/** Which question a fact comes from — what an unanswered rule names, so the reader knows what to answer. */
const ANSWER_OF = {
  name: 'name',
  NAME: 'name',
  initials: 'name',
  phone: 'contact',
  address: 'contact',
  email: 'email',
  hours: 'hours',
  sector: 'sector',
  sectorLabel: 'sector'
}
const noAnswer = (fact) => `no ${ANSWER_OF[fact] ?? fact} in the answers`

// ───────────────────────── plan ─────────────────────────
const SKIP_KEYS = new Set(['id', 'slug', 'url', 'href', 'form', 'locale', 'status', 'type'])
const looksLikeAddress = (s) => /^(\$ref:|\/|https?:\/\/|mailto:|tel:)/.test(s)

/**
 * The same walk as `replaceDeep`, over LINKS instead of words: every link into one of `slugs` — a path
 * `/<slug>`, `/<locale>/<slug>` or `/<section>/<slug>` — is TAKEN OUT, never pointed somewhere else.
 * A field that is the path alone (`cta_url: "/projects/…"`) is emptied, so the view draws its words
 * without a link; an `<a href="…">` in a string keeps its words and loses the anchor; a portable-text
 * link (`markDefs[].href`) is dropped with its mark, the words staying. Returns the value and the paths taken out.
 *
 * 🔒 A LINK INTO A CUT ROW GOES; IT DOES NOT LEAD ELSEWHERE (TCH #1013, PAGE-5, 08/10/2026). Pointed at
 * `/contact`, "See the project" opened the contact page: a button whose words name one page and open
 * another. Taken out, the words stay and nothing misleads.
 *
 * 🔒 `url` AND `href` ARE READ HERE, THOUGH `replaceDeep` SKIPS THEM. A link lives in exactly those keys;
 * the words pass skips them because a slug is an id, and this pass reads them because a path is a link.
 * `$ref:` strings are references, not links, and stay: EmDash resolves an unpublished reference to nothing.
 * @param {unknown} value @param {string[]} slugs @param {string} key
 * @returns {{ value: unknown, removed: { from: string }[] }}
 */
export function unlinkDeep(value, slugs, key = '') {
  const removed = []
  if (slugs.length === 0) return { value, removed }
  const escaped = slugs.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  // A path: optional locale (`/ru/`), optional one section (`/news/`), then the slug, then the end of
  // the path — nothing, a slash, a query or a fragment.
  const PATH = `/(?:[a-z]{2}(?:-[A-Za-z]{2,4})?/)?(?:[a-z0-9_-]+/)?(?:${escaped})(?:[/?#][^"'\\s]*)?`
  const WHOLE = new RegExp(`^${PATH}$`)
  const ANCHOR = new RegExp(`<a\\b[^>]*\\bhref=["'](${PATH})["'][^>]*>([\\s\\S]*?)</a>`, 'g')
  const isGone = (v) => typeof v === 'string' && WHOLE.test(v.trim())
  const walk = (v, k) => {
    if (typeof v === 'string') {
      if (['id', 'slug', 'locale', 'status', 'type', 'form'].includes(k) || v.startsWith('$ref:')) return v
      if (isGone(v)) {
        removed.push({ from: v.trim() })
        return ''
      }
      return v.replace(ANCHOR, (_, from, inner) => {
        removed.push({ from })
        return inner
      })
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, k))
    if (v && typeof v === 'object') {
      // A portable-text block: its link marks into a cut row go, and the spans lose those marks.
      if (Array.isArray(v.markDefs)) {
        const gone = new Set()
        for (const d of v.markDefs)
          if (d && isGone(d.href)) {
            gone.add(d._key)
            removed.push({ from: String(d.href).trim() })
          }
        if (gone.size > 0)
          v = {
            ...v,
            markDefs: v.markDefs.filter((d) => !gone.has(d?._key)),
            children: Array.isArray(v.children)
              ? v.children.map((c) =>
                  Array.isArray(c?.marks) ? { ...c, marks: c.marks.filter((m) => !gone.has(m)) } : c
                )
              : v.children
          }
      }
      return Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, walk(x, kk)]))
    }
    return v
  }
  return { value: walk(value, key), removed }
}

/**
 * Which demo rows a customer's site keeps and which it loses, from the map's `trim` rules. A demo
 * row is EVERY entry of the collection in the seed (not a name match — the demo's rows are the
 * seed's rows, whatever they are called); the first `keep` in seed order stay, the rest are trimmed.
 * Slugs are the same in every locale, so the decision is per collection, not per locale.
 *
 * 🔒 NO TRACY TEMPLATE CUTS ITS DEMO ROWS ANY MORE (product owner, decision A, 11/10/2026, TCH #1013). Every demo entry
 * is rewritten for the business, never cut: Tracy Business trimmed its projects to 4 of 10 and its notes to 0 of 12, and a
 * customer who kept News met an empty /news. The mechanism stays for a map that still names `trim`; none does.
 * @param {any} map @param {any} seed
 * @returns {{ trimmed: { collection: string, slug: string, why: string }[], kept: Record<string, string[]>, emptied: { collection: string, slug: string, why: string }[] }}
 */
export function trimPlan(map, seed, { rewrite = true } = {}) {
  const trimmed = []
  const kept = {}
  const emptied = []
  // 🔒 WITHOUT A MODEL, A KEPT DEMO ROW IS STILL THE DEMO'S ROW. `keep` assumes the model rewrites
  // what stays; with no model key the three kept notes would carry the demo's news with only the
  // brand swapped — the very thing trimming exists to stop. A collection the map also REWRITES
  // (`map.rewrite`) therefore keeps nothing when no model can write, and its list page goes.
  const rewritten = new Set((map.rewrite ?? []).map((r) => r.collection))
  // 🔒 A KEPT ROW MUST NOT CARRY THE DEMO'S NAME IN ITS ADDRESS. A slug is not rewritten (it is
  // the entry's identity), so a kept `northgate-wins-the-zavolzhye-2-…` put the demo brand in the
  // page's URL, its og:url and every search result that lists it (measured 25/09/2026 by
  // scripts/brand-leaks.py). Rows whose slug names the demo brand go to the back of the queue.
  const brandy = (map.replace ?? [])
    .map((r) => String(r.find ?? '').toLowerCase())
    .filter((w) => /^[a-z0-9]+$/.test(w))
  const namesBrand = (slug) => brandy.some((w) => String(slug).toLowerCase().includes(w))
  for (const rule of map.trim ?? []) {
    const rows = seed.content?.[rule.collection] ?? []
    const all = [...new Set(rows.map((e) => e.slug))]
    const slugs = [...all.filter((x) => !namesBrand(x)), ...all.filter((x) => namesBrand(x))]
    const noWriter = !rewrite && rewritten.has(rule.collection)
    const keep = noWriter ? 0 : Math.max(0, Number(rule.keep) || 0)
    kept[rule.collection] = slugs.slice(0, keep)
    for (const [i, slug] of slugs.entries()) {
      if (i < keep) continue
      trimmed.push({
        collection: rule.collection,
        slug,
        why:
          noWriter && i < (Number(rule.keep) || 0)
            ? `a demo ${rule.collection} row, and no model to rewrite it: kept, it is another company's record under the customer's name`
            : (rule.why ?? `a demo ${rule.collection} row beyond the ${String(keep)} kept`)
      })
    }
    // A list page with nothing left to list (`emptied`) stays published, empty: a page goes only when the customer unticked it
    // (TCH #1013, 08/10/2026).
    if (keep === 0 && slugs.length > 0 && rule.list?.collection && rule.list?.slug)
      emptied.push({
        collection: rule.list.collection,
        slug: rule.list.slug,
        why: `its collection ${rule.collection} keeps no demo row`
      })
  }
  return { trimmed, kept, emptied }
}

/**
 * The template's own `hide` rules that still apply: none.
 * 🔒 A PAGE IS HIDDEN ONLY WHEN THE CUSTOMER UNTICKED IT (product owner, 08/10/2026, TCH #1013). A template's rule was its
 * guess for a customer nobody asked: Tracy SaaS hid its Pricing page by rule while the release offered Pricing to keep, so a
 * ticked Pricing answered 404 (measured 08/10/2026), and Tracy Business hid its careers, investors, legal and kit pages on
 * every site. A page no answer can customize now stays published with the template's words, and the customer is not told;
 * the pages the customer unticked go by `unpickedPageRules`. A map that still carries `hide` is read as carrying none.
 * @param {{ hide?: Array<{ collection: string, slug: string }> }} _map
 * @param {Record<string, unknown>} _answers
 * @returns {Array<{ collection: string, slug: string }>}
 */
export function templateHideRules(_map, _answers) {
  return []
}

/**
 * The pages the customer unticked in Tracy's "Pages" question (TCH #1013, T23), as `hide` rules: the answer `hidePages` holds
 * their ids — the slug of each page's record, the ids the release's `tracy_site_pages.json` lists (`tools/release.mjs`
 * `sitePagesFor`). A page record is a `pages` row or the one row of a singleton collection in the default locale, as
 * there; the address its menu item links is found by the same three tests, so the menu item goes even when the page is
 * served at another address than its slug (`services_page` at `/services`). The home page never goes, and an id that is
 * not exactly one page record of this template is said, never guessed.
 * @param {Record<string, unknown>} answers
 * @param {{ defaultLocale?: string, content?: Record<string, any[]>, menus?: any[] }} seed
 * @returns {{ rules: { collection: string, slug: string, path?: string, why: string }[], skipped: { rule: string, why: string }[] }}
 */
export function unpickedPageRules(answers, seed) {
  const ids = [
    ...new Set(
      (Array.isArray(answers?.hidePages) ? answers.hidePages : []).filter(
        (id) => typeof id === 'string' && id !== ''
      )
    )
  ]
  const rules = []
  const skipped = []
  if (ids.length === 0) return { rules, skipped }
  const locale = seed.defaultLocale ?? 'en'
  const rows = []
  for (const [collection, list] of Object.entries(seed.content ?? {}))
    if (collection !== 'site')
      for (const e of list ?? [])
        if ((e.locale ?? locale) === locale && typeof e.slug === 'string')
          rows.push({ collection, slug: e.slug })
  const count = {}
  for (const r of rows) count[r.collection] = (count[r.collection] ?? 0) + 1
  const records = rows.filter(
    (r) => r.collection === 'pages' || r.collection === 'page' || count[r.collection] === 1
  )
  const isHome = (r) => r.collection === 'home' || r.slug === 'home'
  const menu =
    (seed.menus ?? []).find((m) => m.name === 'primary' && (m.locale ?? locale) === locale) ??
    (seed.menus ?? []).find((m) => /main/.test(String(m.name)) && (m.locale ?? locale) === locale) ??
    (seed.menus ?? []).find((m) => (m.locale ?? locale) === locale)
  const recordsAt = (url) => {
    if (url === '/') return records.filter(isHome)
    const seg = url
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .split('/')
      .pop()
    for (const test of [
      (r) => r.slug === seg,
      (r) => r.collection === seg,
      (r) => r.slug === `${seg}_page` || r.collection === `${seg}_page`
    ]) {
      const hits = records.filter(test)
      if (hits.length > 0) return hits
    }
    return []
  }
  for (const id of ids) {
    const hits = records.filter((r) => r.slug === id)
    if (hits.length !== 1) {
      skipped.push({
        rule: `pages ${id}`,
        why: 'no page of this template has that id, so nothing was hidden for it'
      })
      continue
    }
    if (isHome(hits[0])) {
      skipped.push({ rule: `pages ${id}`, why: 'the home page is never hidden' })
      continue
    }
    const item = (menu?.items ?? []).find((it) => {
      const url = String(it.url ?? it.customUrl ?? '')
      if (!url.startsWith('/')) return false
      const at = recordsAt(url)
      return at.length === 1 && at[0].slug === id
    })
    const url = item ? String(item.url ?? item.customUrl) : null
    rules.push({
      collection: hits[0].collection,
      slug: id,
      ...(url && url !== `/${id}` ? { path: url } : {}),
      why: 'the customer did not pick this page'
    })
  }
  return { rules, skipped }
}

/** Every string in an entry's data with the demo brand replaced, keys that are addresses untouched. */
export function replaceDeep(value, rules, key = '') {
  if (typeof value === 'string') {
    if (SKIP_KEYS.has(key) || looksLikeAddress(value)) return value
    let out = value
    for (const r of rules) out = out.split(r.find).join(r.with)
    return out
  }
  if (Array.isArray(value)) return value.map((v) => replaceDeep(v, rules, key))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceDeep(v, rules, k)]))
  return value
}

/**
 * The demo brand's spellings and what each becomes (`map.replace`, filled with the facts), and the rules a missing fact
 * leaves unanswered.
 * @param {any} map @param {Record<string, string>} facts
 */
export function nameRulesOf(map, facts) {
  const rules = []
  const unanswered = []
  for (const r of map.replace ?? []) {
    const filled = fill(r.with, facts)
    if ('missing' in filled) {
      unanswered.push({ rule: `replace ${JSON.stringify(r.find)}`, why: noAnswer(filled.missing) })
      continue
    }
    rules.push({ find: r.find, with: filled.value })
  }
  return { rules, unanswered }
}

/** A key that holds where a social item, a button or a card leads: emptied when that place is the demo company's. */
const LINK_KEY = /^(?:url|href|link)$|_(?:url|href|link)$/i

/**
 * The demo company's social items kept as the template has them, their links emptied (TCH #1013, K6, Akemi 10/10/2026):
 * the buttons and icons stay, in BLANK and FULL alike, and only lead nowhere until the customer gives a profile. A handle
 * that still names the demo company after the name swap (`@northgate_ind`, `vk.com/northgate.ind`) is that company's
 * account, so it is emptied too; every other word (the network's name, a line of text) stays.
 * The handle is judged on the template's own value (`items`), before the name swap turned `@NorthgateIndustrial` into
 * `@Tamarind BakeryIndustrial`; the words kept are the swapped ones (`renamed`, the same rows after `replace`).
 * @param {unknown} items @param {string[]} demoNames every spelling of the demo company (`map.demoCompanyNames`, `replace`)
 * @param {unknown} [renamed]
 */
export function socialKept(items, demoNames, renamed = items) {
  if (!Array.isArray(items)) return []
  const squash = (v) =>
    String(v)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '')
  const names = [...new Set(demoNames.map(squash).filter((n) => n.length >= 3))]
  const namesDemo = (v) => names.some((n) => squash(v).includes(n))
  return items.map((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row
    const words = Array.isArray(renamed) && renamed[i] && typeof renamed[i] === 'object' ? renamed[i] : row
    return Object.fromEntries(
      Object.entries(row).map(([k, v]) => {
        if (typeof v !== 'string') return [k, words[k] ?? v]
        if (LINK_KEY.test(k)) return [k, '']
        if (/handle/i.test(k) && namesDemo(v)) return [k, '']
        return [k, words[k] ?? v]
      })
    )
  })
}

/**
 * The patch per entry (`collection/slug/locale` → fields), from the map and the facts. Rules whose
 * value needs a fact the answers lack are listed in `unanswered`; `empty` on a rule says what to
 * write instead (the demo value must not survive). Every field carries its `origin` (`ORIGINS`),
 * and a `generated` one its `evidence` — the write door refuses one without.
 *
 * Trimmed rows (`trimPlan`) never get a patch: they leave the site, and a value written to a row
 * that is then unpublished is a value written for nothing — or, worse, a row published again under
 * the customer's name (`writeEntry` PUTs and then publishes, always).
 * @param {any} map
 * @param {any} seed
 * @param {Record<string, string>} facts
 * @param {{ rewrite?: boolean, cut?: boolean, claims?: boolean, writtenAs?: Record<string, string>, mediaMap?: any,
 *   closed?: string[] }} [options] `closed`: the addresses of the pages the customer unticked (`unpickedPageRules`)
 */
export function planFrom(
  map,
  seed,
  facts,
  { rewrite = true, cut = true, claims = true, writtenAs: as = {}, mediaMap = null, closed = [] } = {}
) {
  /** @type {Map<string, { collection: string, slug: string, locale: string, fields: Record<string, unknown>, origins: Record<string, string>, evidence: Record<string, string> }>} */
  const patches = new Map()
  const unanswered = []
  /** `<collection>/<slug>/<locale>.<field>` whose value is the demo's, with the brand swapped. */
  const replacedOnly = new Set()
  // 🔒 NO DEMO ROW LEAVES UNLESS THE CUSTOMER DESCRIBED THE BUSINESS (TCH #1013, ABOUT-3, K7, 09/10/2026). A blank About
  // answer keeps the template's words with the demo company renamed; cutting 34 demo projects and notes (measured on a blank
  // Tracy Business 1.7.3 site: /news "0 articles") changed far more than the name. `cut` is false then (`main`).
  const trim = cut ? trimPlan(map, seed, { rewrite }) : { trimmed: [], kept: {}, emptied: [] }
  const trimmedKeys = new Set(trim.trimmed.map((t) => `${t.collection}/${t.slug}`))
  const entryOf = (collection, slug, locale) => {
    const k = `${collection}/${slug}/${locale}`
    let p = patches.get(k)
    if (!p) {
      p = { collection, slug, locale, fields: {}, origins: {}, evidence: {} }
      patches.set(k, p)
    }
    return p
  }
  const set = (collection, slug, locale, field, value, origin) => {
    const p = entryOf(collection, slug, locale)
    p.fields[field] = value
    p.origins[field] = origin
  }
  /**
   * The name and nothing else, per entry (`collection/slug/locale` → fields): what an edition the customer did not choose,
   * but which the site still serves, receives (TCH #1013, ABOUT-3). The demo brand swapped (step 1) and the identity fields
   * made from the name alone (brand name, mark, copyright), and the demo company's profiles replaced by the customer's (or
   * none, as in the languages written); never a claim emptied, another contact detail, or a model's words.
   * @type {Map<string, { collection: string, slug: string, locale: string, fields: Record<string, unknown>, origins: Record<string, string>, evidence: Record<string, string> }>}
   */
  const nameOnly = new Map()
  const nameOnlySet = (collection, slug, locale, field, value, origin) => {
    const k = `${collection}/${slug}/${locale}`
    let p = nameOnly.get(k)
    if (!p) {
      p = { collection, slug, locale, fields: {}, origins: {}, evidence: {} }
      nameOnly.set(k, p)
    }
    p.fields[field] = value
    p.origins[field] = origin
  }
  const seedEntries = []
  for (const [collection, rows] of Object.entries(seed.content ?? {}))
    for (const e of rows ?? [])
      if (!trimmedKeys.has(`${collection}/${e.slug}`))
        seedEntries.push({ collection, slug: e.slug, locale: e.locale ?? 'en', data: e.data ?? {} })
  const locales = [...new Set(seedEntries.map((e) => e.locale))]

  // 1. the demo brand, everywhere
  const named = nameRulesOf(map, facts)
  const rules = named.rules
  unanswered.push(...named.unanswered)
  if (rules.length > 0)
    for (const e of seedEntries) {
      const after = replaceDeep(e.data, rules)
      for (const [field, v] of Object.entries(after))
        if (JSON.stringify(v) !== JSON.stringify(e.data[field])) {
          set(e.collection, e.slug, e.locale, field, v, 'replaced')
          nameOnlySet(e.collection, e.slug, e.locale, field, v, 'replaced')
          // 🔒 A SWAPPED NAME IS NOT A REWRITE. "Northgate wins the Zavolzhye 2 tender" with the
          // customer's name in front of it is still another company's news — and because the field
          // now held a value, the rewrite step read it as done (measured 15/09: a bakery's news
          // page announcing an infrastructure tender).
          replacedOnly.add(`${e.collection}/${e.slug}/${e.locale}.${field}`)
        }
    }

  // 1a. THE TEMPLATE'S SAMPLE PAGES, IN THE LANGUAGE THE ROOT IS WRITTEN IN (TCH #1013, task 12, K3). A sample (`map.samples`:
  //     the kit's newsletter, email, form, slides, style guide) keeps its content as the template has it, but a root written in
  //     Vietnamese showed it in English. The template's own edition in that language is its words, the demo brand swapped as
  //     everywhere; a template that ships no such edition leaves the sample to the labels step (`samples.translate`).
  const samples = { borrowed: [], translate: [] }
  const primaryOf = (l) => String(l).toLowerCase().split('-')[0]
  for (const s of map.samples ?? [])
    for (const locale of locales) {
      const other = as?.[locale]
      if (typeof other !== 'string' || primaryOf(other) === primaryOf(locale)) continue
      const same = seedEntries.filter((e) => e.collection === s.collection && e.slug === s.slug)
      const root = same.find((e) => e.locale === locale)
      if (!root) continue
      const editions = same.filter((e) => e !== root)
      const edition =
        editions.find((e) => e.locale.toLowerCase() === other.toLowerCase()) ??
        editions.find((e) => primaryOf(e.locale) === primaryOf(other))
      const k = `${s.collection}/${s.slug}/${locale}`
      if (!edition) {
        samples.translate.push(k)
        continue
      }
      for (const [field, v] of Object.entries(replaceDeep(edition.data, rules)))
        if (JSON.stringify(v) !== JSON.stringify(root.data[field]))
          set(s.collection, s.slug, locale, field, v, 'replaced')
      samples.borrowed.push(k)
    }

  // 1b. links into demo rows that leave the site (trimmed here) are taken out, not pointed at another page (TCH #1013,
  //     PAGE-5, 08/10/2026): the words stay, the link goes (`unlinkDeep`). No page leaves by a template rule, so no link
  //     to a page is touched here; a link to a page the customer unticked is the link gate's (`src/lib/link-gate.ts`).
  const unlinked = []
  const cutSlugs = [...new Set(trim.trimmed.map((t) => t.slug))]
  if (cutSlugs.length > 0)
    for (const e of seedEntries) {
      const current = patches.get(`${e.collection}/${e.slug}/${e.locale}`)?.fields ?? {}
      for (const [field, was] of Object.entries(e.data)) {
        const base = current[field] !== undefined ? current[field] : was
        const out = unlinkDeep(base, cutSlugs, field)
        if (out.removed.length === 0) continue
        set(e.collection, e.slug, e.locale, field, out.value, 'replaced')
        for (const m of out.removed)
          unlinked.push({ entry: `${e.collection}/${e.slug}/${e.locale}`, field, from: m.from })
      }
    }

  // 2. CLAIMS: removed, never invented. A count, a founding year, a certification or a named client
  //    belongs to the business the demo was written for; carried over it is a lie in the customer's
  //    name, and written by a model it is a lie nobody can even trace (CLAUDE.md §0 rule 3).
  // 🔒 ONLY FOR A CUSTOMER WHO DESCRIBED THE BUSINESS (TCH #1013, ABOUT-3, measured 11/10/2026). A blank About answer keeps
  //    the template as it is, renamed: emptying every claim left a blank Tracy Business site (dev, 11/10) with a "Clients we have
  //    built for" heading over no logos and project cards with no tag line. `claims` is false then (`main`).
  for (const rule of claims ? (map.facts ?? []) : []) {
    for (const e of seedEntries) {
      if (e.collection !== rule.collection) continue
      if (rule.slug !== undefined && e.slug !== rule.slug) continue
      const was = e.data[rule.field]
      if (was === undefined) continue
      set(e.collection, e.slug, e.locale, rule.field, Array.isArray(was) ? [] : '', 'removed')
    }
  }

  // 3. identity fields, exactly
  const isBlank = (v) => v === '' || (Array.isArray(v) && v.length === 0)
  for (const rule of map.identity ?? []) {
    for (const locale of locales) {
      if (
        !seedEntries.some(
          (e) => e.collection === rule.collection && e.slug === rule.slug && e.locale === locale
        )
      )
        continue
      // A list of the customer's own (`from: "social"`): each item holds the pieces the rule's `item` names, for the networks
      // the field can hold (`networks`, all when absent). 🔒 A customer who linked none keeps the demo's items with their
      // links emptied (K6, `socialKept`), never an empty list: an empty list drew no social buttons at all (measured
      // 10/10/2026 on g59-biz-emd-blank and -full, footer ×6 and the /contact card gone).
      if (typeof rule.from === 'string') {
        const list = (Array.isArray(facts[rule.from]) ? facts[rule.from] : []).filter(
          (/** @type {any} */ one) => !Array.isArray(rule.networks) || rule.networks.includes(one.network)
        )
        if (list.length === 0 && rule.from === 'social') {
          const e = seedEntries.find(
            (x) => x.collection === rule.collection && x.slug === rule.slug && x.locale === locale
          )
          const planned = patches.get(`${rule.collection}/${rule.slug}/${locale}`)?.fields?.[rule.field]
          const demo = e?.data?.[rule.field]
          if (!Array.isArray(demo)) continue
          const kept = socialKept(demo, demoNamesOf(map), planned !== undefined ? planned : demo)
          // 🔒 ON FULL A KEPT PROFILE SAYS NOTHING OF THE DEMO COMPANY (TCH #1013, K6 + facts, g62). The line under each
          // profile ("Site progress and tender announcements") is what the demo company posts, read on a bakery's /contact
          // (g61-biz-emd-full). A field the rule's `item` sets to "" is words no answer gives a customer's own profile; a
          // kept demo profile takes that "" too when the customer described the business (`claims`, like step 2), never a
          // model's guess. Its name, icon and kept handle stay (K6); BLANK and the name-only editions keep every word.
          const silent = Object.entries(rule.item ?? {})
            .filter(([, v]) => v === '')
            .map(([k]) => k)
          const shown =
            claims && silent.length > 0
              ? kept.map((row) =>
                  row && typeof row === 'object' && !Array.isArray(row)
                    ? { ...row, ...Object.fromEntries(silent.filter((k) => k in row).map((k) => [k, ''])) }
                    : row
                )
              : kept
          // 'replaced': the template's words with the demo company taken out, so a root written in another language
          // translates them like any other label (social buttons are translated, never rewritten).
          set(rule.collection, rule.slug, locale, rule.field, shown, 'replaced')
          nameOnlySet(rule.collection, rule.slug, locale, rule.field, kept, 'replaced')
          continue
        }
        const value = list.map((/** @type {any} */ one) =>
          Object.fromEntries(
            Object.entries(rule.item ?? {}).map(([key, template]) => [
              key,
              fill(String(template), one).value ?? ''
            ])
          )
        )
        set(rule.collection, rule.slug, locale, rule.field, value, value.length > 0 ? 'customer' : 'empty')
        // The demo company's own profiles (`@NorthgateIndustrial`) are its name in every edition: the customer's, or none.
        nameOnlySet(
          rule.collection,
          rule.slug,
          locale,
          rule.field,
          value,
          value.length > 0 ? 'customer' : 'empty'
        )
        continue
      }
      // 🔒 A CONTACT LINE THE CUSTOMER DID NOT GIVE KEEPS THE TEMPLATE'S, AS A PLACEHOLDER (product owner, 11/10/2026,
      // TCH #1013). The questions never ask for a phone, an e-mail, an address or opening hours; emptied, the top bar, the
      // footer and the contact page showed no place for them at all, and the customer could not see what to fill in later
      // through the chat. A rule with `requires` is written only when every fact it names is given (the demo's second
      // address line goes once the customer's address takes the first); one marked `"unanswered": "keep-demo"` leaves the
      // demo's value standing when its fact is missing, and the report names it.
      const lacking = (Array.isArray(rule.requires) ? rule.requires : []).find(
        (/** @type {string} */ f) => facts[f] === undefined
      )
      if (lacking !== undefined) {
        unanswered.push({
          rule: `${rule.collection}.${rule.slug}.${rule.field}`,
          why: `${noAnswer(lacking)}: the template's value stays as a placeholder`
        })
        continue
      }
      const raw = rule.value
      if (Array.isArray(raw) || (raw && typeof raw === 'object' && !(locale in raw) && !('en' in raw))) {
        set(rule.collection, rule.slug, locale, rule.field, raw, isBlank(raw) ? 'empty' : 'customer')
        continue
      }
      // 🔒 A TEMPLATE'S OWN SENTENCE IS IN THE TEMPLATE'S LANGUAGE. "Why {name}" filled for a root written in Vietnamese
      // read "Why Tamarind Bakery" on a Vietnamese page (TCH #1013, measured 08/10/2026). The language the root is written
      // in picks the sentence; with none in that language the filled sentence is marked `templated`, and the labels step
      // translates it like any other label.
      const primary = (l) => String(l).toLowerCase().split('-')[0]
      const written = primary(as?.[locale] ?? locale)
      const own = typeof raw === 'string' ? null : (raw[written] ?? null)
      const template = typeof raw === 'string' ? raw : (own ?? raw[locale] ?? raw.en)
      const filled = fill(template, facts)
      if ('missing' in filled) {
        if (rule.unanswered !== 'keep-demo' && 'empty' in rule)
          set(rule.collection, rule.slug, locale, rule.field, rule.empty, 'empty')
        else
          unanswered.push({
            rule: `${rule.collection}.${rule.slug}.${rule.field}`,
            why:
              rule.unanswered === 'keep-demo'
                ? `${noAnswer(filled.missing)}: the template's value stays as a placeholder`
                : noAnswer(filled.missing)
          })
        continue
      }
      set(
        rule.collection,
        rule.slug,
        locale,
        rule.field,
        filled.value,
        isBlank(filled.value) ? 'empty' : originOfFill(filled.used)
      )
      // A sentence made from the name alone ("{NAME}", "{initials}", "© {year} {name}") is the name, in any edition: a plain
      // one, or one the rule words in that edition's own language (the template's credit after the copyright, TCH #1013).
      if (
        (typeof raw === 'string' || own !== null) &&
        !isBlank(filled.value) &&
        filled.used.length > 0 &&
        filled.used.every((u) => NAME_FACTS.has(u))
      )
        nameOnlySet(rule.collection, rule.slug, locale, rule.field, filled.value, originOfFill(filled.used))
      if (typeof raw !== 'string' && own === null && !isBlank(filled.value)) {
        const p = entryOf(rule.collection, rule.slug, locale)
        p.templated = { ...p.templated, [rule.field]: true }
      }
    }
  }
  // 4. A BUTTON TO A FILE OF THE DEMO COMPANY LEADS TO THE CONTACT PAGE, AND SAYS SO (TCH #1013, DEMO FILE LINKS, Akemi
  //    10/10/2026). Tracy Business's hero offered "Download company profile (PDF)", another company's brochure, on every
  //    site; written for a bakery by a model that never saw where it led, it read "Liên hệ tiệm bánh" and still opened the
  //    PDF (measured on g59-biz-emd-full). The link goes to the contact page; the label is the template's own contact label
  //    of that locale (`contactLabelOf`), so a site with the About answer blank still reads in the demo's words, and a model
  //    that writes the label is told where it leads (`destinationOf`). A sample page keeps its files (K3).
  // 🔒 FULL ONLY (Akemi 11/10/2026, g62). BLANK is the demo with the name swapped, at every step: on g61-biz-emd-blank (1.7.9)
  //    the hero's "Download company profile (PDF)" read "Talk to our sales team" and led to /contact on a site whose customer
  //    typed a name and nothing else. Like the demo's claims (step 2), the file links change only for a customer who described
  //    the business (`claims`).
  // 🔒 A CONTACT PAGE THE CUSTOMER UNTICKED IS NO DESTINATION (TCH #1013, B4, 13/10/2026). A Vietnamese bakery with only
  //    Home ticked got the hero's "Liên hệ tiệm bánh" leading to /contact, which answered 404 (measured on the local
  //    stand). With no open contact page the button has nowhere honest to go: it goes, label and link, as a button to an
  //    unticked page does (`src/lib/link-gate.ts`), and the demo's brochure never stays.
  const fileLinks = claims ? demoFileLinksOf(map, seed, mediaMap) : []
  const contactPath = contactPathOf(seed, map)
  const pathKey = (/** @type {string} */ url) => url.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/'
  const contactOpen = contactPath !== null && !closed.some((c) => pathKey(c) === pathKey(contactPath))
  const borrowedLabels = []
  if (contactPath !== null && !contactOpen)
    for (const link of fileLinks)
      for (const e of seedEntries) {
        if (e.collection !== link.collection || e.slug !== link.slug) continue
        if (link.locale !== undefined && e.locale !== link.locale) continue
        if (typeof e.data[link.labelField] !== 'string') continue
        for (const field of [link.urlField, link.labelField]) {
          set(e.collection, e.slug, e.locale, field, '', 'empty')
          nameOnlySet(e.collection, e.slug, e.locale, field, '', 'empty')
        }
      }
  if (contactOpen)
    for (const link of fileLinks)
      for (const e of seedEntries) {
        if (e.collection !== link.collection || e.slug !== link.slug) continue
        if (link.locale !== undefined && e.locale !== link.locale) continue
        if (typeof e.data[link.labelField] !== 'string') continue
        set(e.collection, e.slug, e.locale, link.urlField, contactPath, 'replaced')
        nameOnlySet(e.collection, e.slug, e.locale, link.urlField, contactPath, 'replaced')
        const from = contactLabelOf(seedEntries, e, contactPath)
        if (from === null) continue
        const words = replaceDeep(from.text, rules, from.field)
        set(e.collection, e.slug, e.locale, link.labelField, words, 'replaced')
        nameOnlySet(e.collection, e.slug, e.locale, link.labelField, words, 'replaced')
        borrowedLabels.push({
          entry: `${e.collection}/${e.slug}/${e.locale}`,
          field: link.labelField,
          from: { collection: from.collection, slug: from.slug, field: from.field }
        })
      }
  return {
    patches,
    unanswered,
    locales,
    seedEntries,
    replacedOnly,
    trim,
    unlinked,
    samples,
    nameOnly,
    fileLinks,
    contactPath,
    borrowedLabels
  }
}

/** A document a link opens rather than a page: a file the CMS stores, or an address ending in a document's extension. */
const FILE_LINK = /^\/_emdash\/api\/media\/file\/|\.(?:pdf|docx?|xlsx?|pptx?|odt|zip)(?:[?#].*)?$/i

/** The words beside a link field: `hero_cta2_url` → `hero_cta2_label`, then `_button`, `_text`. */
function labelFieldOf(data, urlField) {
  const base = urlField.replace(/_(?:url|href|link)$/i, '')
  if (base === urlField) return null
  return (
    [`${base}_label`, `${base}_button`, `${base}_text`].find((f) => typeof data?.[f] === 'string') ?? null
  )
}

/**
 * The buttons of a template that open a file of the demo company (`DEMO FILE LINKS`): a top-level link field the
 * importer fills with a document (`seed/media-map.json`, any type but a picture), or whose seed value is one, beside a
 * label. Sample pages (`map.samples`) keep theirs (K3).
 * @param {any} map @param {any} seed @param {any} mediaMap
 * @returns {Array<{ collection: string, slug: string, locale?: string, urlField: string, labelField: string }>}
 */
export function demoFileLinksOf(map, seed, mediaMap) {
  const samples = new Set((map?.samples ?? []).map((x) => `${x.collection}/${x.slug}`))
  const out = new Map()
  const dataOf = (collection, slug, locale) =>
    (seed.content?.[collection] ?? []).find((e) => e.slug === slug && (e.locale ?? 'en') === locale)?.data
  const add = (collection, slug, urlField, data) => {
    if (samples.has(`${collection}/${slug}`) || !/^[A-Za-z0-9_]+$/.test(urlField)) return
    const labelField = labelFieldOf(data, urlField)
    if (labelField === null) return
    out.set(`${collection}/${slug}.${urlField}`, { collection, slug, urlField, labelField })
  }
  const items = Array.isArray(mediaMap?.items) ? mediaMap.items : Array.isArray(mediaMap) ? mediaMap : []
  for (const item of items) {
    if (/^image\//i.test(String(item?.mime ?? 'image/'))) continue
    for (const t of item.targets ?? [])
      add(t.collection, t.slug, String(t.path ?? ''), dataOf(t.collection, t.slug, t.locale ?? 'en'))
  }
  for (const [collection, rows] of Object.entries(seed.content ?? {}))
    for (const e of rows ?? [])
      for (const [field, v] of Object.entries(e.data ?? {}))
        if (typeof v === 'string' && FILE_LINK.test(v.trim())) add(collection, e.slug, field, e.data)
  return [...out.values()]
}

/**
 * The address of the template's contact page: the map's `contactPath`, else a link field of the seed that leads there
 * (`/contact`, `/contact-us`), else a menu item that does. Null when the template has none.
 * @param {any} seed @param {any} map
 */
export function contactPathOf(seed, map) {
  if (typeof map?.contactPath === 'string' && map.contactPath.startsWith('/')) return map.contactPath
  const CONTACT = /^\/contact(?:-[a-z]+)?\/?$/i
  const counts = new Map()
  for (const rows of Object.values(seed.content ?? {}))
    for (const e of rows ?? [])
      for (const [k, v] of Object.entries(e.data ?? {}))
        if (LINK_KEY.test(k) && typeof v === 'string' && CONTACT.test(v.trim()))
          counts.set(v.trim(), (counts.get(v.trim()) ?? 0) + 1)
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (best) return best
  const walk = (items) => {
    for (const it of items ?? []) {
      const url = String(it?.url ?? it?.customUrl ?? '').trim()
      if (CONTACT.test(url)) return url
      const deeper = walk(it?.children)
      if (deeper) return deeper
    }
    return null
  }
  for (const menu of seed.menus ?? []) {
    const hit = walk(menu.items)
    if (hit) return hit
  }
  return null
}

/**
 * The template's own label for a button to the contact page, in the entry's locale: one of the same entry first (the
 * home page's "Talk to our sales team"), else one of any entry of that locale. Null when the template has none.
 * @param {Array<{ collection: string, slug: string, locale: string, data: Record<string, any> }>} seedEntries
 * @param {{ collection: string, slug: string, locale: string }} entry @param {string} contactPath
 */
export function contactLabelOf(seedEntries, entry, contactPath) {
  const inLocale = seedEntries.filter((e) => e.locale === entry.locale)
  const ordered = [
    ...inLocale.filter((e) => e.collection === entry.collection && e.slug === entry.slug),
    ...inLocale.filter((e) => e.collection !== entry.collection || e.slug !== entry.slug)
  ]
  for (const e of ordered)
    for (const [k, v] of Object.entries(e.data ?? {})) {
      if (!LINK_KEY.test(k) || typeof v !== 'string' || v.trim() !== contactPath) continue
      const field = labelFieldOf(e.data, k)
      const words = field ? e.data[field] : null
      if (typeof words === 'string' && isLabelText(words) && words.length <= 60)
        return { collection: e.collection, slug: e.slug, field, text: words }
    }
  return null
}

/** Every spelling of the demo company a template names: `demoCompanyNames`, and every `replace` rule's `find`. */
export function demoNamesOf(map) {
  return [
    ...(Array.isArray(map?.demoCompanyNames) ? map.demoCompanyNames : []),
    ...(map?.replace ?? []).map((r) => r?.find)
  ].filter((n) => typeof n === 'string' && n.trim() !== '')
}

/** The facts that are the customer's name, or made from it alone (`factsFrom`), plus the year a copyright line carries. */
const NAME_FACTS = new Set(['name', 'NAME', 'initials', 'year'])

/** The languages the answers name, as they were typed: `languages` (a list) or `language` (one). */
function answeredLanguages(answers) {
  return Array.isArray(answers.languages)
    ? answers.languages.map(String)
    : typeof answers.language === 'string' && answers.language !== ''
      ? [answers.language]
      : []
}

/**
 * Which locales this site's words are written in, from the `language` answer — and which are
 * hidden.
 *
 * A template ships its locales at BUILD time (`astro.config.mjs`: `locales: ['en','ru']`), so this
 * chooses AMONG them — it cannot add one. No language in the answers means English only; a
 * language this build does not ship is said out loud, and English is written.
 *
 * 🔒 THE OTHER LOCALES ARE HIDDEN, AS JOOMLA HIDES THEM (David, 23/09/2026, after PR #267). Kept
 * published, a customer's site offered 39 languages of the demo company in its switcher. Hidden
 * means every entry unpublished — never deleted, so the admin keeps the words — while the template
 * redirects the locale's URLs to the default locale's page (`src/middleware.ts`): unpublished
 * alone, EmDash answered `/ru` from the default locale's entry, English under `lang="ru"`.
 *
 * 🔒 THE DEFAULT LOCALE IS ALWAYS WRITTEN, EVEN WHEN NOBODY CHOSE IT. It is served at the root and
 * cannot be hidden, so a customer who chose only Vietnamese would otherwise open their own site on
 * the demo company's English home page.
 *
 * 🔒 ONE LANGUAGE THAT IS NOT THE ROOT'S IS WRITTEN INTO THE ROOT (TCH #1013, D10, O2). The language
 * question asks for ONE language, and `/` is the default locale's. So the default locale's entries
 * are written in the language chosen (`as: { en: 'vi' }`), no second edition is left under a prefix,
 * and every other locale is hidden — the shipped locale of that language too. A language the
 * template does not ship is written at the root all the same. Several languages keep the editions.
 * @param {Record<string, unknown>} answers
 * @param {string[]} locales every locale the seed carries
 * @param {string} defaultLocale
 * @returns {{ write: string[], hide: string[], why: string | null, as?: Record<string, string> }}
 *   `as`: the language a written locale is written in when it is not its own
 */
export function localesFrom(answers, locales, defaultLocale) {
  const asked = answeredLanguages(answers)
  // 🔒 MATCHED BY PRIMARY SUBTAG, BECAUSE THE SAME LANGUAGE IS SPELT THREE WAYS. On one day
  // (22/09/2026) the three Build questionnaires answered `en-gb` (Joomla), `en-us` (WordPress) and
  // `en` (EmDash) for the same English. A template that ships its locales bare (`en`, `ru`) matched
  // only the third on a full-tag comparison — and an answer of `en-us` fell through to the
  // `wanted.length === 0` line below, which then wrote EVERY LOCALE and said nothing: the
  // customer's business written into languages they never asked for, silently.
  // An exact tag still wins over its language, so a template shipping `pt-BR` and `pt-PT` keeps the
  // one the customer named; only an answer no locale spells exactly falls back to the FIRST locale
  // of that language.
  const primary = (l) => String(l).toLowerCase().split('-')[0]
  const exact = new Map(locales.map((l) => [String(l).toLowerCase(), l]))
  const byLanguage = new Map()
  for (const l of locales) if (!byLanguage.has(primary(l))) byLanguage.set(primary(l), l)
  const pick = (l) => exact.get(String(l).toLowerCase()) ?? byLanguage.get(primary(l))
  const wanted = [...new Set(asked.map(pick).filter((l) => l !== undefined))]
  const english = pick('en') ?? defaultLocale
  const root = locales.includes(defaultLocale) ? [defaultLocale] : []
  // 🔒 NO LANGUAGE CHOSEN IS THE ROOT'S: THE ROOT IS WRITTEN IN THE FIRST ONE (TCH #1013, D2). The switcher offers only the
  // languages the customer chose; a root left in its own language put one nobody asked for beside them. The others keep
  // their shipped editions, and the edition of the language written into the root is hidden, as with one language (O2).
  if (asked.length > 0 && root.length === 1 && !asked.some((l) => primary(l) === primary(defaultLocale))) {
    const [first, ...rest] = asked.filter((l, i) => asked.findIndex((m) => primary(m) === primary(l)) === i)
    const others = [...new Set(rest.map(pick).filter((l) => l !== undefined && l !== defaultLocale))]
    const missing = rest.filter((l) => pick(l) === undefined)
    const write = [defaultLocale, ...others]
    return {
      write,
      hide: locales.filter((l) => !write.includes(l)),
      why:
        missing.length > 0
          ? `this template ships ${locales.join(', ')}, not ${missing.join(', ')}: the words were written in ${[first, ...rest.filter((l) => !missing.includes(l))].join(', ')}`
          : null,
      as: { [defaultLocale]: pick(first) ?? String(first).toLowerCase() }
    }
  }
  const write = [...new Set([...root, ...(wanted.length > 0 ? wanted : [english])])]
  // 🔒 NO LANGUAGE CHOSEN HIDES NOTHING (TCH #1013, LANG-5, 09/10/2026): a blank answer keeps the template's languages as
  // they are. The words are still written in the root and English only (David, 23/09/2026); the rest keep their editions.
  if (asked.length === 0) return { write, hide: [], why: null }
  const hide = locales.filter((l) => !write.includes(l))
  if (wanted.length > 0) return { write, hide, why: null }
  return {
    write,
    hide,
    why: `this template ships ${locales.join(', ')}, not ${asked.join(', ')}: the words were written in ${english}`
  }
}

/**
 * The tag each written locale is SHOWN under, when the customer named a region of it: `en-us`
 * answered, `en` stored → `{ en: 'en-US' }`. Only a bare stored locale takes one (a template that
 * ships `pt-BR` already says so), and only the first region named per language.
 *
 * 🔒 THE URL AND THE ADMIN LOCALE DO NOT MOVE. The Build form's English row answers `en-us`
 * (Joomla's does too); the template ships one English. Printing `en-US` in `<html lang>` and
 * hreflang is the whole of the difference, so it is a label, not a second locale.
 * @param {Record<string, unknown>} answers @param {string[]} write
 * @returns {Record<string, string>}
 */
export function displayLocalesFrom(answers, write, as = {}) {
  const out = {}
  // The root written in another language is shown as that language, in the spelling the customer
  // answered (`vi-vn` → `vi-VN`).
  for (const [stored, language] of Object.entries(as ?? {})) {
    if (!write.includes(stored)) continue
    const tag = answeredLanguages(answers).find(
      (t) => String(t).toLowerCase().split('-')[0] === String(language).toLowerCase().split('-')[0]
    )
    const [lang, region] = String(tag ?? language).split('-')
    out[stored] =
      region && /^[a-z]{2}$/i.test(region)
        ? `${lang.toLowerCase()}-${region.toUpperCase()}`
        : lang.toLowerCase()
  }
  for (const tag of answeredLanguages(answers)) {
    const [lang, region] = String(tag).split('-')
    if (!lang || !region || !/^[a-z]{2}$/i.test(region)) continue
    const stored = write.find((l) => l.toLowerCase() === lang.toLowerCase())
    if (stored === undefined || out[stored] !== undefined) continue
    out[stored] = `${lang.toLowerCase()}-${region.toUpperCase()}`
  }
  return out
}

/**
 * The language decision a run works to: the answers', or — when they name no language — the one
 * the site's receipts recorded.
 *
 * 🔒 A RUN THAT DOES NOT MENTION LANGUAGES KEEPS THE SITE'S LANGUAGES. The tool is run again after
 * the build — a new name, a redrawn picture — with answers that carry nothing about languages, and
 * "no language means English only" would then hide every language the customer chose at the
 * build. What the first run decided is recorded (`receipts.language`) and a later run without a
 * language answer works to it; an answer that names languages always wins.
 * 🔒 AND HIDES WHAT THAT RUN HID, NOT EVERYTHING ELSE (TCH #1013, LANG-5): a build that chose no language hid nothing, so
 * the record carries `hide`, and a later run hides only that. A record from before `hide` was kept was made by a run that
 * hid every locale it did not write, so it reads that way.
 * @param {Record<string, unknown>} answers
 * @param {string[]} locales
 * @param {string} defaultLocale
 * @param {unknown} remembered `receipts.language` of an earlier run (`{ write, hide?, as }`, or the bare `write` list), if any
 * @returns {{ write: string[], hide: string[], why: string | null }}
 */
export function languageDecision(answers, locales, defaultLocale, remembered) {
  // A record is the list a run wrote, or `{ write, as }` since a root can be written in another language.
  const record = Array.isArray(remembered) ? { write: remembered } : remembered
  if (answeredLanguages(answers).length === 0 && Array.isArray(record?.write)) {
    const write = record.write.filter((l) => locales.includes(l))
    const as = Object.fromEntries(
      Object.entries(record.as ?? {}).filter(
        ([l, language]) => write.includes(l) && typeof language === 'string'
      )
    )
    const hide = Array.isArray(record.hide)
      ? record.hide.filter((l) => locales.includes(l) && !write.includes(l))
      : locales.filter((l) => !write.includes(l))
    if (write.length > 0)
      return {
        write,
        hide,
        why: null,
        ...(Object.keys(as).length > 0 ? { as } : {})
      }
  }
  return localesFrom(answers, locales, defaultLocale)
}

/**
 * The English name of the language a locale's words are written in: its own, or the one the root is
 * written in (`localesFrom` `as`).
 * @param {string} locale @param {Record<string, string> | undefined} as
 */
export function languageNameOfWritten(locale, as) {
  return languageName(as?.[locale] ?? locale)
}

/** The language each written locale is written in, for this run (`localesFrom` `as`); set once the decision is made. */
let writtenAs = {}

// ───────────────────────── the model gate ─────────────────────────
/**
 * What each step of this tool asks a model for: `write` makes the business's own words in place of the demo's, `translate`
 * says the template's own words in the language a root is written in.
 *
 * 🔒 ONE GATE FOR EVERY MODEL CALL (TCH #1013, g60; Akemi 10/10/2026: "BLANK = demo except the name swap, every step,
 * every model call"). The About guard lived in each lane (`rewritesIn`), and the enquiry form's lane had none: a BLANK
 * Tracy Business site got a bakery's request types and consent line, while the report said "only the company name was
 * changed" (measured on g59-biz-emd-blank). Every question to the text model now goes through `askModel`, keyed by its
 * step and its locale, and `modelMay` answers for all of them: no step can be added that forgets the rule.
 */
export const MODEL_STEPS = Object.freeze({
  copy: 'write',
  entries: 'write',
  body: 'write',
  blocks: 'write',
  terms: 'write',
  form: 'write',
  pictures: 'write',
  labels: 'translate'
})

/**
 * Whether a step may ask the model for one locale. A `write` step needs the customer's description (`about`): without
 * it the template's words stay, renamed (ABOUT-3, K7). A `translate` step runs only for a root written in another
 * language than its own (`localesFrom` `as`), where the template's words would otherwise be in the wrong language.
 * Both need the customer's name.
 * @param {keyof typeof MODEL_STEPS | string} step @param {string} locale
 * @param {{ name?: string, about?: string }} facts @param {Record<string, string>} [as]
 */
export function modelMay(step, locale, facts, as = writtenAs) {
  const kind = MODEL_STEPS[/** @type {keyof typeof MODEL_STEPS} */ (step)]
  if (kind === undefined || !facts) return false
  if (kind === 'translate') return writtenOtherThan(locale, as) !== null
  return Boolean(facts.about)
}

/** Why the gate refused a question: said in the report, never a silent nothing. */
export const GATE_REFUSED = 'not asked: the About answer is blank, so the template’s words stay (ABOUT-3)'

/**
 * The one door to the text model: refuses what `modelMay` refuses, carries the deadline and the headers every call
 * needs, and answers the parsed JSON object. Throws `HTTP <status>`, or that the answer was not a JSON object.
 * @param {{ model: any, step: string, locale: string, facts: any, system: string, user: string, temperature?: number,
 *   maxTokens?: number, fetchImpl?: typeof fetch }} input
 */
export async function askModel({
  model,
  step,
  locale,
  facts,
  system,
  user,
  temperature = 0.7,
  maxTokens,
  fetchImpl = fetch
}) {
  if (!modelMay(step, locale, facts)) throw new Error(`${step} (${locale}): ${GATE_REFUSED}`)
  const res = await fetchImpl(model.url, {
    method: 'POST',
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    headers: {
      'content-type': 'application/json',
      ...(model.key ? { authorization: `Bearer ${model.key}` } : {}),
      'HTTP-Referer': 'https://tracy.ai',
      'X-Title': 'Tracy personalize'
    },
    body: JSON.stringify({
      model: model.model,
      ...noThinking(model),
      temperature,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}`)
  const body = await res.json()
  const content = body?.choices?.[0]?.message?.content
  try {
    return JSON.parse(typeof content === 'string' ? content.replace(/^```(?:json)?\s*|\s*```$/g, '') : '')
  } catch {
    throw Object.assign(new Error('model answered something that is not a JSON object'), { content })
  }
}

// ───────────────────────── model copy ─────────────────────────
/**
 * 🔒 EVERY MODEL CALL CARRIES A DEADLINE. Without one a provider that accepts the connection and
 * never answers hangs the whole build for ever — the stage has no timeout of its own, and the
 * customer watches "Putting your details in" until they give up (measured 15/09 against a test
 * server that threw mid-response). Two minutes is longer than any of these answers take.
 */
const MODEL_TIMEOUT_MS = 120_000
/**
 * What each of the customer's three tones means on the page (TCH #1013, U11: `plain | warm | bold`).
 *
 * 🔒 ONE WORD IS NOT A VOICE. Until 08/10/2026 every prompt carried `tone: "Bold"` and one line saying it was the voice,
 * while the same prompt said "Plain, specific, no exclamation marks" and "the demo text is a reference for REGISTER":
 * twin Tracy Business sites differing only in tone came out with the same H1 and nearly the same voice (measured on dev,
 * tamq-7q-tone-ea vs -eb). So each tone is defined (sentence length, word choice, punctuation, headline and CTA style,
 * what to avoid), the definition wins over the demo's register, and the house style line steps aside for it.
 * The same definitions live in the seeder (`packages/cms/tracy-seeder/src/tone.mjs` in TCH) for WordPress and Joomla;
 * change one, change the other.
 */
export const TONE_RULES = Object.freeze({
  plain:
    'PLAIN: clear, calm and direct, like a capable professional explaining. Sentences of 8 to 16 words, one idea each; ' +
    'everyday, concrete words that name the thing itself. Full stops only: no exclamation marks, no rhetorical questions. ' +
    'Headlines say plainly what is offered ("Sourdough baked every morning"). CTAs are literal verb + object ("View the menu", ' +
    '"Contact us"). Avoid slogans, wordplay, hype adjectives (amazing, ultimate, world-class), superlatives and emotional language.',
  warm:
    'WARM: friendly and personal, like the owner talking to a neighbour. Address the reader as "you" and the business as ' +
    '"we"; contractions are welcome (we\'re, you\'ll). Sentences of 10 to 20 words with an easy rhythm; words of care, ' +
    'welcome, comfort and people. At most one exclamation mark per section. Headlines invite or reassure ("Come in, the ' +
    'bread is still warm"). CTAs are inviting and personal ("Come say hello", "Find your favourite"). Avoid hard selling, ' +
    'jargon, cold corporate phrasing and commands.',
  bold:
    'BOLD: confident and punchy, like a brand sure of what it makes. Short sentences of 3 to 10 words; fragments are fine. ' +
    'Strong active verbs, imperatives, vivid concrete nouns, rhythm and contrast ("Small batches. Big crust."). Headlines ' +
    'are short declarations, 2 to 6 words where the slot allows. CTAs are direct commands ("Order now", "Taste it today", ' +
    '"Book your table"). An exclamation mark is allowed once per section, never more. Avoid hedging (may, might, perhaps, ' +
    'we try), filler, passive voice and long qualifiers; confidence comes from wording, never from claims the brief does ' +
    'not make (no "best in town", no "#1").'
})

/**
 * The tone instruction a copy prompt carries, or '' when the customer gave no tone. The answer is the option's English
 * label ("Bold") or id; any other text (an older free phrase) is still binding, in its own words.
 * @param {unknown} tone
 */
export function toneLine(tone) {
  if (typeof tone !== 'string' || tone.trim() === '') return ''
  const id = /^\s*(plain|warm|bold)\b/i.exec(tone)?.[1].toLowerCase()
  const voice = id
    ? TONE_RULES[/** @type {'plain' | 'warm' | 'bold'} */ (id)]
    : `"${tone.trim().slice(0, 200)}"`
  return (
    'TONE OF VOICE (binding; the `tone` field): write EVERY value in this tone, headings, button labels and calls to ' +
    'action included, not only the body text. The tone decides how a line sounds, never what it is about or which facts ' +
    "it states. It overrides the demo text's register: the demo shows the role and the length only. Two sites with the " +
    `same description and different tones must read clearly differently. The tone: ${voice}`
  )
}

/** The house style when the customer named no tone, and the part of it that stays when they did. */
const houseStyle = (tone) =>
  toneLine(tone) ? 'Specific, no emoji.' : 'Plain, specific, no exclamation marks, no emoji.'
/** What the demo text is a reference for: its register too, unless the customer's tone sets one. */
const demoRuler = (tone) =>
  toneLine(tone) ? 'LENGTH only (the tone sets the register)' : 'LENGTH and REGISTER only'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
/**
 * 🔒 DEEPSEEK THINKS BEFORE IT ANSWERS UNLESS TOLD NOT TO, and slot-sized JSON gains nothing from it. Measured
 * 03/10/2026 on the local stand: the same copy and rewrite calls took 32 s and came back EMPTY with the API's
 * default (every one of 8192 completion tokens went on reasoning), and 2.6 s with `thinking: disabled`; a whole
 * run went from 114 s to 84 s. Only DeepSeek's own door knows the field; any other door is left as it was.
 * @param {{ url?: string } | null | undefined} model
 */
export const noThinking = (model) =>
  String(model?.url ?? '').startsWith('https://api.deepseek.com/') ? { thinking: { type: 'disabled' } } : {}
/** The picture model when neither /ops nor the map names one. */
const DEFAULT_IMAGE_MODEL = 'google/gemini-3.1-flash-lite-image'
/**
 * Which chat endpoint writes the copy, or null — and the report's `model` block says which one
 * was actually used.
 *
 * Order: (1) `TRACY_SEED_TEXT_PROVIDER`, what /ops assigned (`openrouter` | `deepseek`), when that
 * provider's key is in the environment — a provider named without its key falls through rather
 * than failing every call; (2) `TRACY_MODEL_URL`, a custom OpenAI-compatible door (the tests');
 * (3) DeepSeek's own door; (4) OpenRouter. `defaults.imageModel` is the map's `images.model`,
 * read only when /ops named none (`TRACY_SEED_IMAGE_MODEL`).
 *
 * 🔒 `deepseek-flash`, NOT `deepseek-chat`, FOR DEEPSEEK DIRECT. `deepseek-chat` left DeepSeek's
 * price list (RAISE of 23/09, todo-beta-01-10 §2.3) and a dead default name fails every copy
 * call with a 400 nobody reads until the stage says "0 copy written". Through OpenRouter the
 * route is still `deepseek/deepseek-chat-v3.1`.
 *
 * 🔒 DEEPSEEK'S OWN DOOR BEFORE OPENROUTER WHEN NOBODY CHOSE. Measured 15/09: the same model
 * asked through OpenRouter four pages at a time answered five of eight pages with none of the
 * keys asked for (the route lands on providers that ignore `response_format`), while DeepSeek
 * direct answered all eight in under two seconds. /ops overrides this by naming the provider.
 * @param {NodeJS.ProcessEnv} env @param {{ imageModel?: string }} defaults
 */
export function modelFrom(env = process.env, defaults = {}) {
  const openrouterKey = env.OPENROUTER_API_KEY?.trim() || ''
  const deepseekKey = env.DEEPSEEK_API_KEY?.trim() || ''
  const textModel = env.TRACY_SEED_TEXT_MODEL?.trim() || ''
  // Only OpenRouter answers with images, whichever door the words go through.
  const image = openrouterKey
    ? {
        imageUrl: OPENROUTER_URL,
        imageKey: openrouterKey,
        imageModel: env.TRACY_SEED_IMAGE_MODEL?.trim() || defaults.imageModel || DEFAULT_IMAGE_MODEL
      }
    : {}
  const openrouter = () => ({
    provider: 'openrouter',
    url: OPENROUTER_URL,
    key: openrouterKey,
    model: textModel || 'deepseek/deepseek-chat-v3.1',
    ...image
  })
  const deepseek = () => ({
    provider: 'deepseek',
    url: DEEPSEEK_URL,
    key: deepseekKey,
    model: textModel || 'deepseek-flash',
    ...image
  })
  const chosen = env.TRACY_SEED_TEXT_PROVIDER?.trim().toLowerCase() || ''
  if (chosen === 'openrouter' && openrouterKey) return openrouter()
  if (chosen === 'deepseek' && deepseekKey) return deepseek()
  if (env.TRACY_MODEL_URL?.trim())
    return {
      provider: 'custom',
      url: env.TRACY_MODEL_URL.trim(),
      key: env.TRACY_MODEL_KEY?.trim() ?? '',
      model: env.TRACY_MODEL_NAME?.trim() || 'deepseek-flash',
      ...image
    }
  if (deepseekKey) return deepseek()
  if (openrouterKey) return openrouter()
  return null
}

// The four the template was written in are named by hand, because their names were chosen and
// reviewed; every other locale asks ICU. `LANGUAGE[locale] ?? locale` was fine at four locales and
// is a bug at forty: an unnamed tag reaches the model as "write in af", and the answer comes back
// in English with nothing to say it went wrong.
const LANGUAGE = {
  en: 'English',
  ru: 'Russian',
  vi: 'Vietnamese',
  zh: 'Chinese'
}
/** The English name of a locale, for the one line of the prompt that names the language. */
export function languageName(locale) {
  if (LANGUAGE[locale]) return LANGUAGE[locale]
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale
  } catch {
    return locale
  }
}
/** Characters one word of the brief's English is worth: an English word and its space average about six, with room. */
const LETTERS_PER_WORD = 8

/**
 * 🔒 A WORD LIMIT IS NOT A SPACE COUNT (TCH #1013). The briefs count English words, and the answer was counted by spaces:
 * Vietnamese puts a space between syllables, so two ordinary sentences under a 32-word hero ran to 60 "words", were thrown
 * away, and the demo's English stayed in the hero and in the page's meta description (measured 08/10/2026 on dev,
 * tamq-9e-bizvi). Chinese and Japanese have no spaces at all. The limit is measured in characters, which every script has:
 * the brief's words with half again of slack, at `LETTERS_PER_WORD` each. `lenient` doubles it, for an answer asked twice.
 * @param {string} text @param {number} maxWords @param {{ lenient?: boolean }} [options]
 */
export function withinWords(text, maxWords, { lenient = false } = {}) {
  if (typeof maxWords !== 'number' || !Number.isFinite(maxWords) || maxWords <= 0) return true
  const budget = Math.ceil(maxWords * 1.5) * LETTERS_PER_WORD
  return [...String(text).trim()].length <= (lenient ? budget * 2 : budget)
}

/**
 * Ask the model for every `copy` field of one locale at once. Returns `{ field-key → text }` for the
 * answers that came back well-formed; anything else is left out (and so skipped, named).
 */
export async function writeCopy({
  model,
  map,
  facts,
  locale,
  seedEntries,
  fetchImpl = fetch,
  only = null,
  keys = null,
  again = false,
  tooLong = null,
  patches = null,
  linkless = null
}) {
  const items = (map.copy ?? [])
    .filter((c) => only === null || only.includes(`${c.collection}.${c.slug}`))
    .filter((c) => keys === null || keys.includes(`${c.collection}.${c.slug}.${c.field}`))
    .map((c) => {
      const e = seedEntries.find(
        (x) => x.collection === c.collection && x.slug === c.slug && x.locale === locale
      )
      if (!e || typeof e.data[c.field] !== 'string') return null
      const key = `${c.collection}.${c.slug}.${c.field}`
      // 🔒 A LABEL IS WRITTEN FOR WHERE ITS LINK GOES (TCH #1013, PAGE-5, g60). Asked with a brief and the demo's words
      // only, the hero's second button read "Liên hệ tiệm bánh" over a PDF and the footer's "Xem bánh →" opened /contact
      // (measured 10/10/2026 on g59-biz-emd-full). The link it sits on goes with it; a button whose link is not known is
      // not asked at all, and keeps the template's action (translated with the rest on a root written in another language).
      const planned = patches?.get(`${c.collection}/${c.slug}/${locale}`)?.fields ?? null
      const leadsTo = destinationOf(c, e.data, planned)
      if (leadsTo === null && linkBearing(c, e.data)) {
        linkless?.push(key)
        return null
      }
      // The example is the field as the run already leaves it (the demo brand swapped; a brochure button already the
      // template's contact label), so it never shows a promise its link no longer keeps.
      const example =
        typeof planned?.[c.field] === 'string' && planned[c.field].trim() !== ''
          ? planned[c.field]
          : e.data[c.field]
      return {
        key,
        brief: c.brief,
        maxWords: c.maxWords,
        example,
        ...(leadsTo ? { leadsTo } : {})
      }
    })
    .filter(Boolean)
  if (items.length === 0) return {}
  const language = languageNameOfWritten(locale, writtenAs)
  // 🔒 THE LANGUAGE IS THE CUSTOMER'S ANSWER, NOT THE NAME'S. "Tiệm hoa Mai Vàng" at "45 Hàng Lược, language-allow
  // Hà Nội" pulled the whole page into Vietnamese on a site the customer asked for in English
  // (measured 15/09) — every prompt says so, not only the entries'.
  const system = [
    `You write website copy in ${language} for a small business. Answer with ONE JSON object: key → text, nothing else.`,
    `Write in ${language} even when the business name, its address or the sector are in another language.`,
    `Each entry below has a brief, a maximum number of words, and the text of a demo site of the same kind as a reference for ${demoRuler(facts.tone)} — do not reuse its facts, places or numbers.`,
    // 🔒 THE DEMO IS A RULER, THE DESCRIPTION IS THE SUBJECT — and without this line the model had
    // only the ruler. `business.about` is the customer's own sentence about what they do; it is the
    // one field here that can make a page about THEM rather than a renamed page about somebody
    // else. Said explicitly because the demo text is longer, more concrete and right there: a model
    // handed both, with no ranking between them, writes from the demo.
    'The `about` field is what this business actually does. Every line must be about THAT. When the demo text is about a different trade, keep only its shape and write the customer’s subject instead.',
    `Never invent credentials, years, prices, addresses, phone numbers or certifications that were not given. ${houseStyle(facts.tone)}`,
    items.some((it) => it.leadsTo)
      ? 'An entry with "leadsTo" is the words of a link or a button, or of the call to action around it: they say what that link really does for the visitor. kind "page": name that page or what the visitor does there (a page like /contact is getting in touch, asking for a quote or ordering); kind "email": writing to that address; kind "phone": calling; kind "file": opening that document. Never promise a download, a document, a product or a page the link does not open.'
      : '',
    again
      ? 'These entries are asked again because the last answer was missing or too long: write each one SHORTER than its maximum number of words, counted as English words.'
      : '',
    toneLine(facts.tone)
  ]
    .filter(Boolean)
    .join(' ')
  const user = JSON.stringify({
    business: {
      name: facts.name ?? null,
      about: facts.about ?? null,
      ...(facts.tone ? { tone: facts.tone } : {}),
      sector: facts.sectorLabel ?? facts.sector ?? null,
      address: facts.address ?? null,
      phone: facts.phone ?? null
    },
    fields: items.map(({ key, brief, maxWords, example, leadsTo }) => ({
      key,
      brief,
      maxWords,
      example,
      ...(leadsTo ? { leadsTo } : {})
    }))
  })
  const parsed = await askModel({ model, step: 'copy', locale, facts, system, user, fetchImpl })
  const out = {}
  for (const it of items) {
    const v = parsed?.[it.key]
    if (typeof v !== 'string' || v.trim() === '') continue
    if (!withinWords(v, it.maxWords, { lenient: again })) {
      tooLong?.push(it.key)
      continue
    }
    out[it.key] = v.trim()
  }
  if (Object.keys(out).length === 0)
    process.stderr.write(
      `copy: none of the ${String(items.length)} keys asked came back usable (${JSON.stringify(parsed).replace(/\s+/g, ' ').slice(0, 160)})\n`
    )
  return out
}

/** The link field beside a copy field: `hero_cta1_label` → `hero_cta1_url` (`_href`, `_link`); null for none. */
function siblingLinkOf(field, data, planned) {
  const base = String(field).replace(/_(?:label|button|text|title|cta)$/i, '')
  if (base === field) return null
  for (const k of [`${base}_url`, `${base}_href`, `${base}_link`]) {
    const v = planned?.[k] !== undefined ? planned[k] : data?.[k]
    if (typeof v === 'string') return { key: k, url: v.trim() }
  }
  return null
}

/**
 * Where the words of a copy field lead: the rule's `leadsTo` (a template whose view links the field elsewhere, the
 * footer's closing line to the contact page), else its sibling link field as the run will leave it. Null when it leads
 * nowhere known.
 * @param {{ field: string, leadsTo?: string }} rule @param {Record<string, unknown>} data @param {Record<string, unknown> | null} planned
 * @returns {{ url: string, kind: 'page' | 'email' | 'phone' | 'file' | 'external' } | null}
 */
export function destinationOf(rule, data, planned = null) {
  const url =
    typeof rule.leadsTo === 'string' ? rule.leadsTo.trim() : siblingLinkOf(rule.field, data, planned)?.url
  if (typeof url !== 'string' || url === '' || url === '#') return null
  const kind = /^mailto:/i.test(url)
    ? 'email'
    : /^tel:/i.test(url)
      ? 'phone'
      : FILE_LINK.test(url)
        ? 'file'
        : /^https?:\/\//i.test(url)
          ? 'external'
          : 'page'
  return { url, kind }
}

/**
 * Whether a copy field is the label of a link or a button: a `_label`, `_button` or `_cta` field that names where it
 * leads (`leadsTo`) or has a link field beside it, or any `_button`/`_cta`. A heading or a sentence beside a link is not.
 */
export function linkBearing(rule, data) {
  const field = String(rule.field)
  if (rule.link === false || !/_(?:label|button|cta)$/i.test(field)) return false
  return (
    typeof rule.leadsTo === 'string' ||
    siblingLinkOf(field, data, null) !== null ||
    /_(?:button|cta)$/i.test(field)
  )
}

/** Plain paragraphs → the portable-text blocks EmDash stores a body as. */
export function blocksFrom(text, keyPrefix) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p, i) => ({
      _type: 'block',
      _key: `${keyPrefix}${String(i)}`,
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: `${keyPrefix}${String(i)}s`, text: p, marks: [] }]
    }))
}

/**
 * The parts of a demo body a model rewrites one by one, in order: each text block with its kind and its length; a picture
 * or any other block is not a part, and stays where it is. Null for a body of plain paragraphs only: it is asked as one text.
 * @param {unknown} blocks
 * @returns {{ at: number, kind: string, words: number }[] | null}
 */
export function bodyOutline(blocks) {
  if (!Array.isArray(blocks)) return null
  const parts = []
  let shaped = false
  for (const [at, b] of blocks.entries()) {
    if (b?._type !== 'block') {
      shaped = true
      continue
    }
    const style = String(b.style ?? 'normal')
    const kind = b.listItem
      ? 'list item'
      : /^h[1-6]$/.test(style)
        ? 'heading'
        : style === 'blockquote'
          ? 'quote'
          : 'paragraph'
    if (kind !== 'paragraph') shaped = true
    const text = (Array.isArray(b.children) ? b.children : []).map((c) => String(c?.text ?? '')).join('')
    parts.push({ at, kind, words: Math.max(1, text.split(/\s+/).filter(Boolean).length) })
  }
  return shaped && parts.length > 0 ? parts : null
}

/**
 * A demo body with each part's words replaced by the model's (`bodyOutline` order): every block keeps its key, kind, style,
 * list level and place, its words become one span, and its links go with the demo's words; a picture stays as it was.
 * Null when the answer is not one string per part.
 * @param {any[]} blocks @param {{ at: number }[]} outline @param {unknown} answer
 */
export function bodyFromOutline(blocks, outline, answer) {
  if (!Array.isArray(answer) || answer.length !== outline.length) return null
  if (!answer.every((t) => typeof t === 'string' && t.trim() !== '')) return null
  const out = blocks.map((b) => b)
  outline.forEach((part, i) => {
    const b = blocks[part.at]
    const key = String(b._key ?? `b${String(part.at)}`)
    out[part.at] = {
      ...b,
      _key: key,
      markDefs: [],
      children: [{ _type: 'span', _key: `${key}s`, text: String(answer[i]).trim(), marks: [] }]
    }
  })
  return out
}

/** How many demo entries go into one request to the model. */
const REWRITE_BATCH = 6

/**
 * Rewrite whole demo entries for the customer's sector — the services, the work, the notes, the
 * roles (Lee, 15/09: the model rewrites them rather than leaving another company's).
 *
 * 🔒 THE SLUG, THE REFERENCES, THE IMAGES AND THE TAXONOMIES ARE NOT TOUCHED. A slug is an entry's
 * id in EmDash 0.37 and menus and `$ref`s point at it; rewriting one breaks the site rather than
 * translating it. And every field that is a CLAIM (a client, a date, a measurement, a salary) is
 * emptied by `facts` BEFORE this runs, so the model is never asked to invent one.
 *
 * 🔒 ANOTHER COMPANY'S ENTRY IS NOT AN ANSWER, AND A RETRY SAYS WHY (TCH #1013, L4). `isDemo(slug, field, text)` names the
 * demo's own words (`demoWordsOf`): an answer that is one of them is rejected like an echo, and `rejected` (slug → reason)
 * says why each entry was not taken; passed back as `told`, the next ask carries that reason to the model.
 * @returns {Promise<{ written: Record<string, Record<string, unknown>>, skipped: {entry?: string, why: string}[],
 *   bodyMisses: string[], rejected: Record<string, string> }>}
 */
export async function rewriteEntries({
  model,
  rule,
  facts,
  locale,
  entries,
  fetchImpl = fetch,
  batch = rule.batch ?? REWRITE_BATCH,
  only = null,
  tally = null,
  given = null,
  told = null,
  isDemo = null
}) {
  const written = {}
  const skipped = []
  /** slug → why the answer for that entry was not taken, in words the model may read (never a slug or demo text). */
  const rejected = {}
  /** The entries whose body came back without one string per part of its outline. */
  const bodyMisses = []
  const language = languageNameOfWritten(locale, writtenAs)
  const lists = rule.lists ?? {}
  /** A batch is over, written or not: the count moves so the customer sees the run moving. */
  const count = (n) => {
    if (!tally) return
    tally.done += n
    say('entries', tally.done, tally.total)
  }
  const starts = []
  for (let at = 0; at < entries.length; at += batch) starts.push(at)
  // The batches do not depend on each other, so they fly together: 34 entries in batches of
  // three took six minutes one after the other (15/09) and a quarter of that four at a time.
  await eachLimit(starts, CONCURRENCY, async (at) => {
    const slice = entries.slice(at, at + batch)
    const asked = slice.map((e, i) => {
      // A retry names the fields that are still missing, and asks for those alone: a model that
      // dropped `title` once drops it again when asked the same way (measured 15/09 — four
      // projects and a service kept the contractor's titles through a second full pass).
      // A field already decided (`given` — the title, chosen before the body so the customer saw
      // it first) is not asked again; it is shown so the rest is written to match it.
      const decided = given?.[e.slug] ?? null
      const wanted = (only?.[e.slug] ?? rule.fields ?? []).filter((f) => decided?.[f] === undefined)
      const example = {}
      for (const f of wanted) if (typeof e.data[f] === 'string') example[f] = e.data[f]
      if (only === null)
        for (const [listField, itemKey] of Object.entries(lists))
          if (Array.isArray(e.data[listField]))
            example[listField] = e.data[listField].map((row) => String(row?.[itemKey] ?? ''))
      // 🔒 A BODY WITH AN OUTLINE IS ASKED PART BY PART (TCH #1013). Asked as one text, the legal pages came back as five
      // plain paragraphs (measured 11/10/2026 on dev, g58-biz-emd-full: /terms 7 headings to 1, its lists gone).
      const outline = rule.body ? bodyOutline(e.data[rule.body]) : null
      if (rule.body && only === null && Array.isArray(e.data[rule.body]))
        example.body = outline
          ? outline.map((p) => `${p.kind}, about ${String(p.words)} words`)
          : `${String(rule.bodyWords ?? 150)} words`
      // 🔒 THE SLUG STAYS OUT OF THE PROMPT. It is the demo's — `northgate-wins-the-zavolzhye-2-
      // infrastructure-tender` — and shown as the key it became a fact: the bakery "won the
      // contract to supply bread to the new Northgate housing development" (measured 15/09).
      // The entries are keyed `entry-1`, `entry-2`, … and mapped back below.
      const why = told?.[e.slug]
      return {
        key: `entry-${String(at + i + 1)}`,
        ...(decided ? { given: decided } : {}),
        ...(typeof why === 'string' ? { rejected: why } : {}),
        example
      }
    })
    const system = [
      `You write website content in ${language} for one business. Answer with ONE JSON object keyed by the "key" of each entry you are given, nothing else.`,
      `Each entry is ${rule.brief}. Answer with EVERY key the example has and no others, with the same shape: a string stays a string, a list of strings stays a list of the same length.`,
      `Write in ${language} even when the business name, its address or the sector are in another language.`,
      rule.body
        ? `Also give "body": where the example's "body" is a list, one string per part in the same order and of the same kind (a heading stays a short heading, a list item a short list item, a paragraph a paragraph); otherwise about ${String(rule.bodyWords ?? 150)} words as plain paragraphs separated by blank lines.`
        : '',
      `The demo text is a reference for ${demoRuler(facts.tone)} — never reuse its facts, places, clients or numbers.`,
      given
        ? 'Where an entry carries "given", those fields are already decided: do not answer them, and write the rest to match them.'
        : '',
      told && Object.keys(told).length > 0
        ? 'Where an entry carries "rejected", your last answer for it was not used, for the reason it gives: answer it again with every key its example has, for this business and its trade only, never anything of the demo company.'
        : '',
      `Do not invent counts, dates, prices, addresses, certifications or named people. ${houseStyle(facts.tone)}`,
      toneLine(facts.tone)
    ]
      .filter(Boolean)
      .join(' ')
    const user = JSON.stringify({
      business: {
        name: facts.name ?? null,
        about: facts.about ?? null,
        ...(facts.tone ? { tone: facts.tone } : {}),
        sector: facts.sectorLabel ?? facts.sector ?? null
      },
      entries: asked
    })
    let parsed
    try {
      // 🔒 ROOM TO ANSWER. A default cap cut the answer for the heavier collections and the JSON came back missing whole
      // entries — reported as "the model gave nothing usable" for ten projects in a row (measured 15/09). The batch size
      // above is the other half.
      parsed = await askModel({
        model,
        step: 'entries',
        locale,
        facts,
        system,
        user,
        maxTokens: 4000,
        fetchImpl
      })
    } catch (error) {
      skipped.push({
        why: `${rule.collection} ${String(at + 1)}–${String(at + slice.length)}: ${error.message}`
      })
      count(slice.length)
      return
    }
    count(slice.length)
    for (const [i, e] of slice.entries()) {
      const key = `entry-${String(at + i + 1)}`
      // 🔒 ASKED FOR ONE ENTRY, THE MODEL ANSWERS THE ENTRY — not a map with one key. Measured
      // 15/09: the per-entry round wrote nothing for six projects because every answer came back
      // as `{title, summary}` while this looked for `{<key>: {…}}`.
      const direct = parsed && typeof parsed === 'object' && parsed[key] === undefined && slice.length === 1
      const answer = direct ? parsed : parsed?.[key]
      if (!answer || typeof answer !== 'object') {
        rejected[e.slug] = 'no JSON object came back for this entry'
        skipped.push({ entry: `${rule.collection}/${e.slug}`, why: 'the model gave nothing usable' })
        continue
      }
      const fields = {}
      const reasons = []
      // An answer whose deciding field is another of the demo's entries IS that entry: none of its fields are taken.
      const decides = rule.decides ?? ['title']
      const another = decides.some(
        (f) =>
          given?.[e.slug]?.[f] === undefined &&
          typeof answer[f] === 'string' &&
          answer[f].trim().toLowerCase() !==
            String(e.data[f] ?? '')
              .trim()
              .toLowerCase() &&
          isDemo?.(e.slug, f, answer[f])
      )
      for (const f of only?.[e.slug] ?? rule.fields ?? []) {
        if (given?.[e.slug]?.[f] !== undefined) continue
        if (typeof e.data[f] !== 'string') continue
        if (typeof answer[f] !== 'string' || answer[f].trim() === '') {
          reasons.push(`"${f}" was missing or empty`)
          continue
        }
        // 🔒 AN ECHO IS NOT AN ANSWER. The demo text is shown as a reference for length and
        // register, and a model that hands it back unchanged has written nothing — measured
        // 15/09: "General contracting" came back verbatim on a bakery through every round, and
        // counted as written because something arrived.
        if (answer[f].trim().toLowerCase() === e.data[f].trim().toLowerCase()) {
          reasons.push(`"${f}" repeated the demo company's text`)
          continue
        }
        // Nor is another of the demo company's entries, or this one in another of its editions: a bakery's careers page
        // read the construction company's "Structural engineer" in Vietnamese (measured 11/10/2026 on dev, g65).
        if (another || isDemo?.(e.slug, f, answer[f])) {
          reasons.push(`"${f}" is the demo company's own text (one of its entries), not this business's`)
          continue
        }
        fields[f] = answer[f].trim()
      }
      if (reasons.length > 0) rejected[e.slug] = reasons.join('; ')
      for (const [listField, itemKey] of Object.entries(lists)) {
        const was = e.data[listField]
        const now = answer[listField]
        if (!Array.isArray(was) || !Array.isArray(now)) continue
        fields[listField] = was.map((row, i) => ({
          ...row,
          ...(typeof now[i] === 'string' && now[i].trim() !== '' ? { [itemKey]: now[i].trim() } : {})
        }))
      }
      const outline = rule.body ? bodyOutline(e.data[rule.body]) : null
      const shaped = outline ? bodyFromOutline(e.data[rule.body], outline, answer.body) : null
      if (shaped) fields[rule.body] = shaped
      else if (rule.body && outline && only === null)
        // A body that does not keep the outline is never flattened: it is asked again on its own (`rewriteBody`), then
        // falls back to the template's words in the site's language (`demoWordsWork`).
        bodyMisses.push(e.slug)
      else if (rule.body && typeof answer.body === 'string' && answer.body.trim() !== '') {
        const blocks = blocksFrom(answer.body, `${e.slug.slice(0, 8)}-`)
        if (blocks.length > 0) fields[rule.body] = blocks
      }
      if (Object.keys(fields).length > 0) written[`${rule.collection}/${e.slug}/${locale}`] = fields
      else
        skipped.push({
          entry: `${rule.collection}/${e.slug}`,
          why: `nothing in the answer fitted the entry${rejected[e.slug] ? ` (${rejected[e.slug]})` : ''}`
        })
    }
  })
  return { written, skipped, bodyMisses, rejected }
}

/**
 * The test `rewriteEntries` takes as `isDemo` for one rewrite rule: whether a text is the demo's own words for a field.
 * A field the rule decides (`decides`, the title) may be no entry's of the collection in any edition the seed ships; any
 * other field may not be this entry's own in any edition (a `type` like "Full-time" may well be another entry's too).
 * @param {any} rule @param {Array<{ slug: string, data: Record<string, unknown> }>} demoEntries every edition the seed ships
 * @returns {(slug: string, field: string, text: string) => boolean}
 */
export function demoWordsOf(rule, demoEntries) {
  const norm = (/** @type {unknown} */ v) => String(v).trim().toLowerCase().replace(/\s+/g, ' ')
  const decides = rule.decides ?? ['title']
  return (slug, field, text) => {
    const t = norm(text)
    return demoEntries.some(
      (x) =>
        (x.slug === slug || decides.includes(field)) &&
        typeof x.data?.[field] === 'string' &&
        norm(x.data[field]) === t
    )
  }
}

/**
 * One entry's body asked again on its own, its part count stated (TCH #1013, g60). Asked with the rest of the entry, the
 * legal pages came back one part short (18 parts asked, 17 answered) and the body stayed the demo's English under a
 * Vietnamese lede (measured 10/10/2026 on g59-biz-emd-full /terms). Null when the answer still does not keep the outline.
 * @param {{ model: any, rule: any, facts: any, locale: string, entry: { slug: string, data: Record<string, any> },
 *   given?: Record<string, unknown> | null, fetchImpl?: typeof fetch }} input
 */
export async function rewriteBody({ model, rule, facts, locale, entry, given = null, fetchImpl = fetch }) {
  const blocks = entry.data[rule.body]
  const outline = bodyOutline(blocks)
  if (!outline) return null
  const language = languageNameOfWritten(locale, writtenAs)
  const system = [
    `You write the body of ${rule.brief}, in ${language}, for one business. Answer with ONE JSON object: {"body": [...]}, nothing else.`,
    `"body" is a list of EXACTLY ${String(outline.length)} strings, one per part below and in the same order; each keeps the kind of its part (a heading stays a short heading, a list item a short list item, a paragraph a paragraph). Count them before you answer: ${String(outline.length)}, no more and no fewer.`,
    `Write in ${language} even when the business name, its address or the sector are in another language.`,
    `Do not invent counts, dates, prices, addresses, certifications or named people. ${houseStyle(facts.tone)}`,
    toneLine(facts.tone)
  ]
    .filter(Boolean)
    .join(' ')
  const user = JSON.stringify({
    business: {
      name: facts.name ?? null,
      about: facts.about ?? null,
      ...(facts.tone ? { tone: facts.tone } : {}),
      sector: facts.sectorLabel ?? facts.sector ?? null
    },
    ...(given ? { given } : {}),
    parts: outline.map((p, i) => ({ part: i + 1, kind: p.kind, words: p.words }))
  })
  let parsed
  try {
    parsed = await askModel({ model, step: 'body', locale, facts, system, user, maxTokens: 4000, fetchImpl })
  } catch {
    return null
  }
  return bodyFromOutline(blocks, outline, parsed?.body)
}

/**
 * The card lists that live ON a page entry — the home page's offer cards, the about page's pillars,
 * the steps of a process. Same road as `rewriteEntries`, different shape: one request per list, and
 * the answer keeps the list's length and every key the row already had (an icon, an order).
 * @returns {Promise<{ rows: unknown[] | null, why: string | null }>}
 */
export async function rewriteBlock({ model, rule, facts, locale, rows, fetchImpl = fetch }) {
  if (!Array.isArray(rows) || rows.length === 0) return { rows: null, why: 'nothing to write' }
  const language = languageNameOfWritten(locale, writtenAs)
  const example = rows.map((row) =>
    Object.fromEntries(rule.itemFields.map((f) => [f, typeof row?.[f] === 'string' ? row[f] : '']))
  )
  const system = [
    `You write website copy in ${language} for one business. Answer with ONE JSON object: {"rows": [...]}, nothing else.`,
    `Each row is ${rule.brief}. Give exactly ${String(rows.length)} rows, each with the keys ${rule.itemFields.join(', ')}.`,
    `Write in ${language} even when the business name or its address are in another language.`,
    `The demo rows are a reference for ${demoRuler(facts.tone)} — never reuse their facts, places or numbers.`,
    `Do not invent counts, dates, prices, certifications or named people. ${houseStyle(facts.tone)}`,
    toneLine(facts.tone)
  ]
    .filter(Boolean)
    .join(' ')
  const user = JSON.stringify({
    business: {
      name: facts.name ?? null,
      sector: facts.sectorLabel ?? facts.sector ?? null,
      ...(facts.tone ? { tone: facts.tone } : {})
    },
    rows: example
  })
  let parsed
  try {
    parsed = await askModel({ model, step: 'blocks', locale, facts, system, user, fetchImpl })
  } catch (error) {
    return { rows: null, why: error.message }
  }
  const answer = Array.isArray(parsed?.rows) ? parsed.rows : null
  if (answer === null) return { rows: null, why: 'the model gave no rows' }
  let filled = 0
  const out = rows.map((row, i) => {
    const got = answer[i]
    if (!got || typeof got !== 'object') return row
    const next = { ...row }
    for (const f of rule.itemFields)
      if (typeof got[f] === 'string' && got[f].trim() !== '' && typeof row?.[f] === 'string') {
        next[f] = got[f].trim()
        filled += 1
      }
    return next
  })
  return filled > 0 ? { rows: out, why: null } : { rows: null, why: 'nothing in the answer fitted the rows' }
}

/**
 * The labels a visitor filters by — a taxonomy's terms. The SLUG is the term's identity and the
 * content points at it, so only the label is written.
 * @returns {Promise<{ labels: Record<string, string>, why: string | null }>}
 */
export async function rewriteTerms({ model, rule, facts, locale, terms, fetchImpl = fetch }) {
  if (!Array.isArray(terms) || terms.length === 0) return { labels: {}, why: 'no terms' }
  const language = languageNameOfWritten(locale, writtenAs)
  const system = [
    `You name the categories a website filters by, in ${language}, for one business. Answer with ONE JSON object: slug → label, nothing else.`,
    `Write in ${language} even when the business name, its address or the sector are in another language.`,
    `Each label is ${rule.brief}. One or two words. Keep the same number of labels and use the slugs you are given as keys.`,
    'Do not invent counts, places or named people.'
  ].join(' ')
  const user = JSON.stringify({
    business: { name: facts.name ?? null, sector: facts.sectorLabel ?? facts.sector ?? null },
    terms: terms.map((t) => ({ slug: t.slug, label: t.label }))
  })
  try {
    const parsed = await askModel({
      model,
      step: 'terms',
      locale,
      facts,
      system,
      user,
      temperature: 0.6,
      fetchImpl
    })
    const labels = {}
    for (const t of terms)
      if (typeof parsed?.[t.slug] === 'string' && parsed[t.slug].trim() !== '')
        labels[t.slug] = parsed[t.slug].trim()
    return { labels, why: Object.keys(labels).length > 0 ? null : 'the model named none of them' }
  } catch (error) {
    return { labels: {}, why: error.message }
  }
}

// ───────────────────────── chrome labels ─────────────────────────
/**
 * 🔒 A ROOT WRITTEN IN ANOTHER LANGUAGE TAKES ITS LABELS WITH IT (TCH #1013). The copy, titles and bodies are written in the
 * language the customer chose (`localesFrom` `as`), but the words of the chrome around them — the menu, the header and
 * footer labels the template keeps in a content entry — were nobody's step, so a site asked for in Vietnamese opened on
 * Vietnamese pages under "Home · About · Contact" and a "Subscribe" button (measured 08/10/2026 on dev, tamq-7q-edvi). They
 * are translated by the model the copy is written with, and written through the same journaled doors.
 */
/**
 * Keys whose value is an address, a switch, a picture or a name — never words a visitor reads as a label. A list field is
 * not judged by its own key (`footer_links` holds labels); its rows' keys are.
 */
const NOT_A_LABEL_KEY =
  /^_|(?:^|_)(?:url|urls|link|links|href|slug|email|phone|hotline|image|img|icon|logo|network|platform|size|align|key|mark|id|code|handle|show|brand|name|layout|variant|state|status|style|color|colour|form)(?:_|$)|(?:url|link|href)$/i
/** A key that is a picture's description: read aloud and shown when it does not load, so it is words. */
const ALT_KEY = /(?:^|_)alt$/i
/** A key that says it holds words — `hotline_label` is the word "Hotline", not the number (TCH #1013, a contact page). */
const WORDS_KEY = /_(?:label|title|text|button|placeholder|heading|caption)$/i
/** The field the language switcher names the root's language by; set to the language's own name, never translated. */
const LANGUAGE_NAME_FIELD = 'language_name'
/** At most this many labels in one question: a chrome entry and its menus are well under it. */
const LABELS_PER_ASK = 80

/** Words a visitor reads, not an address, a handle, a number or a paragraph. */
export function isLabelText(value) {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (v === '' || v.length > 240 || !/\p{L}/u.test(v)) return false
  if (/^(?:https?:|mailto:|tel:|www\.|\/|#|\$ref:)/i.test(v)) return false
  if (/^\S*@\S+$/.test(v)) return false
  return true
}

const labelKey = (key) => ALT_KEY.test(key) || WORDS_KEY.test(key) || !NOT_A_LABEL_KEY.test(key)

/**
 * Whether an entry is chrome: one the map's `labels` names (`{ collection, slug? }`), or the `site` entry when it names none
 * (where the business and base templates keep their header and footer words).
 * @param {any} map @param {{ collection: string, slug: string }} e
 */
export function isChromeEntry(map, e) {
  return labelFieldsOf(map, e) !== null
}

/**
 * The fields of an entry the map's `labels` names: null when none names it, `'all'` when a rule names the entry without a
 * `fields` list, else the fields the rules list (a rule over a page of mixed content names only its headings).
 * @param {any} map @param {{ collection: string, slug: string }} e @returns {null | 'all' | Set<string>}
 */
export function labelFieldsOf(map, e) {
  const targets = Array.isArray(map?.labels) && map.labels.length > 0 ? map.labels : [{ collection: 'site' }]
  const hits = targets.filter(
    (t) => t.collection === e.collection && (t.slug === undefined || t.slug === e.slug)
  )
  if (hits.length === 0) return null
  if (hits.some((t) => !Array.isArray(t.fields))) return 'all'
  return new Set(hits.flatMap((t) => t.fields))
}

/**
 * 🔒 A FIELD ANOTHER LANE WRITES IS NEVER A LABEL, decided by the MAP, not by what the plan holds yet. The lanes run side by
 * side: read from the plan, a block the model was still rewriting looked untouched, was translated from the demo, and
 * whichever lane wrote last won. `copy`, `blocks` and `rewrite` fields, and the pictures, are named here once.
 * @param {any} map @returns {Set<string>} `<collection>/<slug>.<field>`, with `*` for a whole collection
 */
function ownedByAnotherLane(map) {
  const out = new Set()
  for (const c of map?.copy ?? []) out.add(`${c.collection}/${c.slug}.${c.field}`)
  for (const b of map?.blocks ?? []) out.add(`${b.collection}/${b.slug ?? '*'}.${b.field}`)
  for (const t of map?.images?.targets ?? []) out.add(`${t.collection}/${t.slug}.${t.field}`)
  for (const r of map?.rewrite ?? [])
    for (const f of [...(r.fields ?? []), ...Object.keys(r.lists ?? {}), ...(r.body ? [r.body] : [])])
      for (const slug of Array.isArray(r.slugs) ? r.slugs : ['*']) out.add(`${r.collection}/${slug}.${f}`)
  return out
}

/**
 * The labels of the chrome entries of one locale: the entries the map's `labels` names (`{ collection, slug? }`), the
 * `site` entry when it names none. A field the run already decides — a copy field, an answer, a removed claim — is left to
 * that step; a field whose only change is the demo's name swapped is read as it will stand.
 * @param {{ map: any, seedEntries: Array<{ collection: string, slug: string, locale: string, data: Record<string, any> }>, locale: string, patches: Map<string, any> }} input
 * @returns {Array<{ id: string, collection: string, slug: string, field: string, index?: number, prop?: string, text: string }>}
 */
export function chromeLabelsOf({ map, seedEntries, locale, patches }) {
  const owned = ownedByAnotherLane(map)
  const out = []
  for (const e of seedEntries) {
    if (e.locale !== locale) continue
    const only = labelFieldsOf(map, e)
    if (only === null) continue
    const p = patches.get(`${e.collection}/${e.slug}/${e.locale}`)
    for (const [field, seedValue] of Object.entries(e.data ?? {})) {
      const where = `${e.collection}/${e.slug}`
      if (field === LANGUAGE_NAME_FIELD || (only !== 'all' && !only.has(field))) continue
      if (owned.has(`${where}.${field}`) || owned.has(`${e.collection}/*.${field}`)) continue
      const decided = p?.fields?.[field] !== undefined
      // A value decided elsewhere is final, except the demo's words with the name swapped and a template's own sentence
      // filled with the customer's facts (`planFrom` `templated`): both are still the template's language.
      if (decided && p.origins?.[field] !== 'replaced' && p.templated?.[field] !== true) continue
      const value = decided ? p.fields[field] : seedValue
      const base = { collection: e.collection, slug: e.slug, field }
      if (typeof value === 'string') {
        if (labelKey(field) && isLabelText(value))
          out.push({ id: `${where}.${field}`, ...base, text: value.trim() })
        continue
      }
      if (!Array.isArray(value)) continue
      value.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return
        for (const [prop, v] of Object.entries(item))
          if (labelKey(prop) && isLabelText(v))
            out.push({
              id: `${where}.${field}.${String(index)}.${prop}`,
              ...base,
              index,
              prop,
              text: v.trim()
            })
      })
    }
  }
  return out
}

/** A value that names a thing rather than saying it: `kit-email`, `hero_split`, a colour `rgba(20,23,26,.9)`. */
const ID_LIKE = /^(?:[a-z0-9]+(?:[-_][a-z0-9]+)+|(?:rgba?|hsla?)\(.*\))$/i

/**
 * The words of a sample page (`map.samples`) to translate when the template ships no edition in the language the root is
 * written in: every label-like string leaf, at any depth, that is not an id and that differs in at least one other edition
 * (a value every edition shares, such as a layout id, a number or an address, is not language). With no other edition, every
 * label-like leaf is words.
 * @param {Record<string, unknown>} data the root entry's data @param {Array<Record<string, unknown>>} editions the others'
 * @returns {Array<{ path: Array<string | number>, text: string }>}
 */
export function sampleLeavesOf(data, editions) {
  const out = []
  const at = (value, path) => path.reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), value)
  const walk = (value, path, key) => {
    if (typeof value === 'string') {
      const words = labelKey(String(key)) && isLabelText(value) && !ID_LIKE.test(value.trim())
      if (words && (editions.length === 0 || editions.some((e) => at(e, path) !== value)))
        out.push({ path, text: value.trim() })
      return
    }
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, [...path, i], key))
    else if (value && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) if (!SKIP_KEYS.has(k)) walk(v, [...path, k], k)
  }
  walk(data, [], '')
  return out
}

/** A copy of `value` with the leaf at `path` set to `to`. */
function withLeaf(value, path, to) {
  if (path.length === 0) return to
  const [k, ...rest] = path
  const copy = Array.isArray(value) ? [...value] : { ...value }
  copy[k] = withLeaf(copy[k], rest, to)
  return copy
}

/**
 * The labels of the menus the seed ships in one locale, children included, each once. Read from the SEED, not the site,
 * so the question is the same in the warm-up run (whose stand-in site holds no menus) and the real one: a label the site
 * holds that the seed does not — one Tracy already made the customer's — is not the seed's to translate.
 * @param {{ defaultLocale?: string, menus?: any[] }} seed @param {string} locale
 */
export function menuLabelsOf(seed, locale) {
  const out = new Set()
  const walk = (items) => {
    for (const it of items ?? []) {
      const label = String(it?.label ?? '').trim()
      if (label !== '') out.add(label)
      walk(it?.children)
    }
  }
  for (const menu of seed.menus ?? [])
    if ((menu.locale ?? seed.defaultLocale ?? 'en') === locale) walk(menu.items)
  return [...out]
}

/**
 * Where each label of one locale leads, in the order its name is chosen: the menus as the seed lists them (the primary
 * menu first), then the chrome's rows that carry a link beside their label (`{ label, url }`). Ids as `labelsWork` asks
 * them: `menu.<i>` for a menu label (`menuLabelsOf`), the chrome label's id for a row.
 * @param {{ seed: any, locale: string, menus: string[], chromeLabels: Array<{ id: string, collection: string, slug: string,
 *   field: string, index?: number, prop?: string, text: string }>, rowOf: (l: any) => any }} input
 * @returns {Array<{ id: string, text: string, url: string }>}
 */
export function labelDestinations({ seed, locale, menus, chromeLabels, rowOf }) {
  const out = []
  const walk = (items) => {
    for (const it of items ?? []) {
      const label = String(it?.label ?? '').trim()
      const at = menus.indexOf(label)
      if (at >= 0 && typeof it?.url === 'string')
        out.push({ id: `menu.${String(at)}`, text: label, url: it.url })
      walk(it?.children)
    }
  }
  for (const menu of seed.menus ?? [])
    if ((menu.locale ?? seed.defaultLocale ?? 'en') === locale) walk(menu.items)
  for (const l of chromeLabels) {
    if (l.prop === undefined) continue
    const row = rowOf(l)
    const url = row?.url ?? row?.href ?? row?.link
    if (typeof url === 'string') out.push({ id: l.id, text: l.text, url })
  }
  return out
}

/**
 * 🔒 ONE PAGE, ONE NAME, IN ONE LANGUAGE (TCH #1013, PAGE-5, g65). On g64-biz-emd-full the menu called /about "Giới language-allow
 * thiệu" and the footer "Về chúng tôi": "About" and "About us" were translated as two labels. A label that leads to a
 * page whose name is already chosen (the first translated label for that URL) and that names the same thing (a word in
 * common, a plural `s` aside) takes that name; a label to the same page that names something else (a service in the
 * footer's list of services) keeps its own translation.
 * @param {Array<{ id: string, text: string, url: string }>} links in the order the names are chosen
 * @param {Record<string, string>} got id → translation @returns {Record<string, string>}
 */
export function oneLabelPerDestination(links, got) {
  const out = { ...got }
  const words = (s) =>
    new Set((String(s).match(/\p{L}{3,}/gu) ?? []).map((w) => w.toLowerCase().replace(/s$/, '')))
  const page = (url) => (/^\/(?!\/)/.test(url) ? url.replace(/[?#].*$/, '').replace(/(.)\/$/, '$1') : null)
  /** @type {Map<string, { words: Set<string>, to: string }>} */
  const named = new Map()
  for (const l of links) {
    const at = page(l.url.trim())
    if (at === null) continue
    const first = named.get(at)
    if (!first) {
      if (typeof out[l.id] === 'string') named.set(at, { words: words(l.text), to: out[l.id] })
      continue
    }
    if ([...words(l.text)].some((w) => first.words.has(w))) out[l.id] = first.to
  }
  return out
}

/** A translated label, or null when it lost a placeholder or stopped being a label. */
export function acceptLabel(from, to) {
  if (typeof to !== 'string') return null
  const v = to.trim()
  if (v === '' || v.length > Math.max(from.length * 3, from.length + 40)) return null
  const holes = (s) => (s.match(/\{[A-Za-z_]+\}/g) ?? []).sort().join(' ')
  return holes(v) === holes(from) ? v : null
}

/**
 * The language a locale's root is written in when it is not its own (`localesFrom` `as`), or null.
 * @param {string} locale @param {Record<string, string> | undefined} as
 */
export function writtenOtherThan(locale, as) {
  const other = as?.[locale]
  if (typeof other !== 'string') return null
  const primary = (l) => String(l).toLowerCase().split('-')[0]
  return primary(other) === primary(locale) ? null : other
}

/** A language's name in itself (`vi` → "Tiếng Việt"), for the switcher. */
export function nativeLanguageName(language) {
  try {
    const name = new Intl.DisplayNames([language], { type: 'language' }).of(language)
    return name ? name.charAt(0).toLocaleUpperCase(language) + name.slice(1) : null
  } catch {
    return null
  }
}

/**
 * Ask the model to translate the labels of one locale into the language it is written in. Returns `{ id → text }` for
 * the answers that came back usable (`acceptLabel`); anything else keeps the template's words. `prose` asks for running
 * text (a paragraph, a body part, a card's sentence) rather than interface labels: same door, the length kept instead of
 * kept short. Asked through the gate as the `labels` step: only a root written in another language translates.
 * @param {{ model: any, locale: string, labels: Record<string, string>, facts: any, prose?: boolean,
 *   fetchImpl?: typeof fetch }} input
 */
export async function translateLabels({
  model,
  locale,
  labels,
  facts,
  prose = false,
  kept = null,
  fetchImpl = fetch
}) {
  const ids = Object.keys(labels)
  if (ids.length === 0) return {}
  const language = languageNameOfWritten(locale, writtenAs)
  const system = [
    prose
      ? `You translate the text of a small business's website into ${language}. Answer with ONE JSON object: key → translated text, nothing else.`
      : `You translate the interface labels of a small business's website into ${language}. Answer with ONE JSON object: key → translated text, nothing else.`,
    prose
      ? 'Translate every value you are given and use the keys you are given. Keep the meaning, the order and about the length of each one: add nothing, drop nothing, and keep each value one value.'
      : 'Translate every value you are given and use the keys you are given. Keep each one about as short as it is: these are menu items, buttons and headings.',
    'Keep brand and product names, people’s names, email addresses, phone numbers, web addresses and numbers as they are, and keep every placeholder in curly braces, such as {count}, exactly as written.',
    'A place, a street or a company keeps its name, but the words around it are translated: an address line is words too.',
    `A value already in ${language} is returned unchanged. No quotes around values, no exclamation marks, no emoji.`
  ].join(' ')
  const out = {}
  const ask = async (chunk, again) =>
    askModel({
      model,
      step: 'labels',
      locale,
      facts,
      system: again ? `${system} ${askedAgain(language)}` : system,
      user: JSON.stringify({ language, labels: chunk }),
      temperature: 0,
      fetchImpl
    })
  for (let i = 0; i < ids.length; i += LABELS_PER_ASK) {
    const chunk = Object.fromEntries(ids.slice(i, i + LABELS_PER_ASK).map((id) => [id, labels[id]]))
    const parsed = await ask(chunk, false)
    for (const [id, from] of Object.entries(chunk)) {
      const to = acceptLabel(from, parsed?.[id])
      if (to !== null) out[id] = to
    }
  }
  // 🔒 A LINE OF WORDS THAT COMES BACK UNCHANGED IS ASKED AGAIN, NEVER DROPPED IN SILENCE (TCH #1013, LANG-2, g63). On
  // g62-biz-emd-full the model handed back "Lipetsk SEZ, 6 Tekhnologichesky proezd" and "Fabrication yard, Zavolzhye IP"
  // as they were (an address to keep, as it read them) where g61 had them in Vietnamese, and the unchanged answer was
  // skipped without a word. A key left out, or a value of two words or more given back as it was, is asked again with the
  // others like it, then one at a time; one still unchanged is handed to `kept` for the caller's report. One word given
  // back (a network, a product name) stands. A root written in English has nothing to ask again.
  // 🔒 HALF TRANSLATED IS UNCHANGED TOO (g64): on g63-biz-emd-full (1.7.11) the same lines came back "7/22 Derbenevskaya emb.,
  // tầng 8" and "Khu xưởng Fabrication, Zavolzhye IP": a common word of the template's language left in a short line of language-allow
  // another language (`wordsLeft`) is asked again like a line given back whole.
  // 🔒 A CAPITALISED ADDRESS IS NOT A NAME (g65): on g64-biz-emd-full (1.7.12) "Vorsino Industrial Park, lô 12" passed as
  // done, "Industrial Park" read as part of a name. A line is a name only when it is one name; the capitalised words after
  // the first of a run in a longer line are words (`wordsLeft`). A word of the customer's own answers is theirs, never left.
  if (primaryLanguage(writtenAs?.[locale] ?? locale) === 'en') return out
  const theirs = new Set(
    Object.values(facts ?? {}).flatMap((v) => (typeof v === 'string' ? (v.match(/\p{L}+/gu) ?? []) : []))
  )
  const left = (id, to) => wordsLeft(labels[id], to, theirs).length
  const unchanged = (id) =>
    out[id] === undefined ||
    (out[id] === labels[id].trim() && wordsIn(labels[id]) >= 2) ||
    left(id, out[id]) > 0
  const retry = async (list) => {
    try {
      const parsed = await ask(Object.fromEntries(list.map((id) => [id, labels[id]])), true)
      for (const id of list) {
        const to = acceptLabel(labels[id], parsed?.[id])
        // 🔒 NEVER A WORSE ANSWER OVER A BETTER ONE (g65): asked again, the model can hand back more English than before
        // ("7/22 Derbenevskaya emb." after "7/22 bờ kè Derbenevskaya").
        if (
          to !== null &&
          (out[id] === undefined || (to !== labels[id].trim() && left(id, to) <= left(id, out[id])))
        )
          out[id] = to
      }
    } catch {
      // A retry the model fails to answer leaves the line as the first question did; the caller says so.
    }
  }
  const again = ids.filter(unchanged)
  for (let i = 0; i < again.length; i += LABELS_PER_ASK) await retry(again.slice(i, i + LABELS_PER_ASK))
  const alone = again.filter(unchanged)
  if (again.length > 1) for (const id of alone) await retry([id])
  if (Array.isArray(kept)) kept.push(...ids.filter(unchanged))
  return out
}

/** The primary subtag of a language tag, lowercased: `vi-VN` → `vi`. */
const primaryLanguage = (tag) => String(tag).toLowerCase().split('-')[0]

/** How many words of three letters or more a value holds (any script). */
const wordsIn = (text) => (String(text).match(/\p{L}{3,}/gu) ?? []).length

/**
 * The common nouns of an English address that a capitalised address line writes with capitals ("Vorsino Industrial Park",
 * "Borovsk District", "Kaluga Region"): words to translate, never part of the place's name (`wordsLeft`). Names cannot be
 * told from words by their capitals alone ("Nizhny Novgorod" is a name), so the words are listed.
 */
const ADDRESS_NOUNS = new Set(
  (
    'industrial park business technology science estate zone district region province county state territory city town ' +
    'village street road avenue boulevard lane drive square embankment highway quay harbour harbor port building tower ' +
    'centre center plaza mall market office floor suite unit block plot site campus complex house hall quarter yard ' +
    'warehouse plant factory free economic special'
  ).split(' ')
)

/** The longest line, in words, read for words left in the template's language: a label or an address, never a paragraph. */
const LEFT_MOST_WORDS = 16

/**
 * The common words of the template's language a translation kept, in a short line of two words or more, found again as
 * they were in the answer: a word of three letters or more written in lower case in the template's line ("yard", "floor",
 * the abbreviation "emb."); its first word when the word after it is a lower-case word ("Fabrication yard"), not an
 * abbreviation (in "Derbenevskaya emb." the street's name comes first); and, in a line that is more than one name, a
 * capitalised common noun of an address (`ADDRESS_NOUNS`: "Vorsino Industrial Park" keeps "Industrial" and "Park" in
 * English). A line that is one name keeps its capitals ("Nizhny Novgorod"), and so do a name in a longer line ("Kaluga,
 * Lipetsk and Nizhny Novgorod regions"), an acronym, the customer's own words (`theirs`), placeholders, web and email
 * addresses.
 * @param {string} from the template's line @param {unknown} to the answer @param {Set<string>} [theirs]
 * @returns {string[]}
 */
export function wordsLeft(from, to, theirs = new Set()) {
  if (typeof to !== 'string') return []
  const plain = (s) => String(s).replace(/\{[A-Za-z_]+\}|https?:\/\/\S+|www\.\S+|\S+@\S+/g, ' ')
  const source = plain(from)
  const own = [...source.matchAll(/\p{L}+/gu)].map((m) => ({
    word: m[0],
    short: source[m.index + m[0].length] === '.'
  }))
  if (own.length < 2 || own.length > LEFT_MOST_WORDS) return []
  const answer = plain(to)
  const said = new Set(answer.match(/\p{L}+/gu) ?? [])
  const lower = (w) => w === w.toLocaleLowerCase()
  const titled = (w) => /^\p{Lu}\p{Ll}{2,}$/u.test(w)
  // One name: capitalised words only, nothing between them but spaces.
  const oneName = own.every(({ word }) => !lower(word)) && !/[\d,;·|/()]/.test(source)
  return own
    .filter(
      ({ word }, i) =>
        word.length >= 3 &&
        said.has(word) &&
        !theirs.has(word) &&
        (lower(word) ||
          (!oneName && titled(word) && ADDRESS_NOUNS.has(word.toLowerCase())) ||
          (i === 0 && titled(word) && lower(own[1].word) && own[1].word.length >= 3 && !own[1].short))
    )
    .map(({ word }) => word)
}

/** What the second question adds to the first, for the lines that came back unchanged or not at all. */
function askedAgain(language) {
  return [
    `These values came back unchanged, or not at all, the first time. Each is words a visitor reads, so each is written in ${language}:`,
    'translate every word that is not a proper name. In "North warehouse, Riverside Industrial Park", "North warehouse" and',
    `"Industrial Park" are words and "Riverside" is a name; an abbreviation of such words is written out in ${language}.`,
    'Numbers, phone numbers and placeholders stay exactly as written.'
  ].join(' ')
}

/**
 * The report line for the labels a model gave back in the template's words after every retry, or null when there are none.
 * @param {string[]} kept the ids `translateLabels` handed back @param {Record<string, string>} asked id → the template's words
 * @param {string} language the language they were to be written in
 */
export function keptLabelsWhy(kept, asked, language) {
  if (kept.length === 0) return null
  const shown = kept
    .slice(0, 5)
    .map((id) => `"${String(asked[id]).trim()}"`)
    .join(', ')
  return `${String(kept.length)} label(s) came back in the template’s words after asking again and one at a time, so they stay as the template has them, not in ${language}: ${shown}${kept.length > 5 ? ', …' : ''}`
}

// ───────────────────────── pictures ─────────────────────────

/**
 * One picture for this business, from the model that answers with images.
 *
 * 🔒 A PICTURE THE MODEL WILL NOT MAKE LEAVES THE FIELD EMPTY. The demo's photographs are a steel
 * frame, a substation, a crane — under a bakery's name they are not "a placeholder", they are a
 * claim about premises the customer does not have. Empty is honest; wrong is not.
 * @returns {Promise<{ bytes: Buffer, mime: string } | null>}
 */
export async function drawPicture({ model, style, what, facts, redraw = false, fetchImpl = fetch }) {
  // The same gate as the words (`modelMay`): a picture the customer named in a redraw is theirs to ask for.
  if (!redraw && !modelMay('pictures', '', facts)) throw new Error(`pictures: ${GATE_REFUSED}`)
  const sector = facts.sectorLabel ?? facts.sector ?? ''
  const prompt = [
    `A photograph for the website of ${facts.name ?? 'a business'}${sector ? `, a ${String(sector).toLowerCase()} business` : ''}.`,
    `Show ${what}.`,
    style ?? ''
  ]
    .filter(Boolean)
    .join(' ')
  let json
  try {
    const res = await fetchImpl(model.imageUrl ?? model.url, {
      method: 'POST',
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${model.imageKey ?? model.key}`,
        'content-type': 'application/json',
        'http-referer': 'https://tracy.ai',
        'x-title': 'Tracy personalize'
      },
      body: JSON.stringify({
        model: model.imageModel,
        modalities: ['image', 'text'],
        messages: [{ role: 'user', content: prompt }]
      })
    })
    json = await res.json()
    if (!res.ok || json?.error) throw new Error(json?.error?.message ?? `HTTP ${String(res.status)}`)
  } catch (error) {
    throw new Error(error.message)
  }
  // OpenRouter hands images back on the message, as data URIs (the seeder reads them the same way).
  for (const im of json?.choices?.[0]?.message?.images ?? []) {
    const url = im?.image_url?.url
    const m = typeof url === 'string' ? /^data:([a-z0-9/+.-]+);base64,(.+)$/i.exec(url) : null
    if (m) return { mime: m[1], bytes: Buffer.from(m[2], 'base64') }
  }
  return null
}

/**
 * Which picture a person meant. `home.hero_image`, `home/home.hero_image` and a bare `hero_image`
 * (when only one page has one) all name the same spot; anything else is answered as unknown rather
 * than drawn somewhere nobody asked for.
 * @returns {{ collection: string, slug: string, field: string, what: string } | null}
 */
export function pictureSpot(where, images, seedEntries) {
  const text = String(where ?? '').trim()
  if (text === '') return null
  const [head, field] = text.includes('.')
    ? [text.slice(0, text.lastIndexOf('.')), text.slice(text.lastIndexOf('.') + 1)]
    : ['', text]
  const [collection, slug] = head.includes('/') ? head.split('/') : [head, head]
  const targets = images.targets ?? []
  const named = targets.find(
    (t) =>
      t.field === field &&
      (head === '' || (t.collection === collection && (slug === collection || t.slug === slug)))
  )
  if (named) return { collection: named.collection, slug: named.slug, field: named.field, what: named.what }
  // An entry's own picture: `projects/elektra-lipetsk.image`.
  for (const rule of images.entries ?? []) {
    if (rule.field !== field || (collection !== '' && rule.collection !== collection)) continue
    const entry = seedEntries.find(
      (e) => e.collection === rule.collection && (slug === collection || e.slug === slug)
    )
    if (entry) return { collection: rule.collection, slug: entry.slug, field: rule.field, what: rule.what }
  }
  return null
}

// ───────────────────────── API ─────────────────────────
function makeApi(token) {
  const H = { authorization: `Bearer ${token}`, 'X-EmDash-Request': '1', accept: 'application/json' }
  return async function api(method, route, body) {
    const res = await fetch(`${SITE}${route}`, {
      method,
      headers: { ...H, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const raw = await res.text()
    let json = null
    try {
      json = JSON.parse(raw)
    } catch {}
    if (!res.ok || (json && json.success === false)) {
      const err = new Error(
        `${method} ${route} -> ${res.status} ${json?.error?.code ?? ''} ${json?.error?.message ?? raw.slice(0, 160)}`
      )
      err.status = res.status
      throw err
    }
    return json?.data ?? json
  }
}

const hashOf = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16)

/**
 * A field written whole, with every key the site holds that the written value does not name, at any depth.
 *
 * 🔒 A ROW IS WRITTEN FROM THE SEED, BUT THE SITE'S ROW HOLDS MORE (TCH #1013). The importer places the template's pictures
 * after the seed (`seed-apply.mjs`, media-map `life[2].image`), so a seed row is the words alone. A card list rewritten from
 * it and written whole replaced the site's rows with picture-less ones: measured 11/10/2026 on dev (g57-biz-emd-full,
 * Tracy Business 1.7.4), /careers "Life on our sites" showed three placeholders where the demo shows three photographs.
 * A key the written row names (a picture drawn, a claim emptied) still wins. Rows that carry an identity (`_key`, `id`) are
 * matched by it; the others by position, over the rows both lists have, so a list longer than the site's keeps the
 * site's pictures on the rows the site has (a list whose length changed lost every picture before, TCH #1013).
 *
 * 🔒 AN OBJECT IS MERGED THE SAME WAY, ALL THE WAY DOWN (TCH #1013, measured 11/10/2026 on dev, Tracy Business 1.7.5). A kit
 * page's `sample` is one object written whole (the demo brand swapped, or the template's edition in the site's language),
 * and its pictures sit inside it (`sample.image`, `sample.frames.ratio16`, `sample.slides[3].image`): BLANK, /kit/newsletter
 * showed a placeholder for its photograph; FULL in Vietnamese, /kit/style-guide lost its three frames and /kit/slides both
 * photographs. Two objects are merged key by key, and two lists row by row, at every depth.
 * @param {unknown} value - what the run writes @param {unknown} live - what the site holds now
 */
export function keepSiteRowKeys(value, live) {
  const isRow = (/** @type {unknown} */ r) => r !== null && typeof r === 'object' && !Array.isArray(r)
  if (isRow(value) && isRow(live)) {
    const out = { ...live }
    for (const [k, v] of Object.entries(value)) out[k] = keepSiteRowKeys(v, live[k])
    return out
  }
  if (!Array.isArray(value) || !Array.isArray(live)) return value
  const idOf = (/** @type {any} */ r) => (isRow(r) ? (r._key ?? r.id ?? null) : null)
  const keyed = value.some((r) => idOf(r) !== null) && live.some((r) => idOf(r) !== null)
  const byId = new Map(live.filter((r) => idOf(r) !== null).map((r) => [idOf(r), r]))
  return value.map((row, i) => {
    const site = keyed ? byId.get(idOf(row)) : live[i]
    return isRow(row) && isRow(site) ? keepSiteRowKeys(row, site) : row
  })
}

/** JSON with every object's keys sorted, so the same answers hash the same however they were typed. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`
  return JSON.stringify(v) ?? 'null'
}

// ───────────────────────── journal ─────────────────────────
// One line BEFORE every mutation and one AFTER it. EmDash is many REST calls and no transaction:
// a PUT can land and its publish fail, a run can be killed between the two, an editor can change
// a field in between. The journal is what says which of those happened — the receipts, written
// at the END of a run, cannot (a killed run leaves none). `--inspect` and `--revert` read it.
//
//   { at, applyId, requestId, phase: 'run', mode }                              a run starts
//   { at, applyId, requestId, step, phase: 'before', target, before, after, rev, origins, evidence }
//   { at, applyId, requestId, step, phase: 'ok', target, rev, hash }            the call landed
//   { at, applyId, requestId, step, phase: 'failed', target, why }              it did not
//   { at, applyId, requestId, phase: 'done', written, errors }                  the run ended
//
// `target.kind` ∈ entry · settings · publish · unpublish · menu · menu-label · term · form.

/** Every parsed line of the journal; a line that is not JSON (a crash mid-write) is skipped. */
export function readJournal(file) {
  if (!existsSync(file)) return []
  const lines = []
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (raw.trim() === '') continue
    try {
      lines.push(JSON.parse(raw))
    } catch {
      // a line cut by a crash: the mutation it was for is dangling, and `dangling` says so
    }
  }
  return lines
}

const APPLY_ID = /^pers-(\d+)/
/** `pers-<n>`, one above the highest the journal holds (a revert run counts under its own number). */
export function nextApplyId(lines) {
  let n = 0
  for (const l of lines) {
    const m = APPLY_ID.exec(String(l.applyId ?? ''))
    if (m) n = Math.max(n, Number(m[1]))
  }
  return `pers-${String(n + 1)}`
}

/** `before` lines with no `ok` or `failed` for the same step: a run stopped between the two. */
export function dangling(lines) {
  const closed = new Set()
  for (const l of lines)
    if (l.phase === 'ok' || l.phase === 'failed') closed.add(`${l.applyId}#${String(l.step)}`)
  return lines.filter((l) => l.phase === 'before' && !closed.has(`${l.applyId}#${String(l.step)}`))
}

/**
 * The applyId of an earlier run with this `requestId` that ended with every mutation `ok`, or
 * null. Such a run is the same answers, the same map, the same seed, the same template version —
 * so this run has nothing to do, and says so rather than sending sixty GETs to find out.
 */
export function repeatOf(lines, requestId) {
  const open = new Set(dangling(lines).map((l) => l.applyId))
  const failed = new Set(lines.filter((l) => l.phase === 'failed').map((l) => l.applyId))
  // 🔒 A REVERTED RUN IS NOT ON THE SITE ANY MORE. Its `done` line still says every mutation
  // landed, and without this the run after a revert — same answers, "put my name back" — would
  // be answered "nothing to do" while the site shows the demo.
  const reverted = new Set(
    lines
      .filter((l) => l.phase === 'run' && String(l.applyId ?? '').endsWith('-revert'))
      .map((l) => String(l.applyId).slice(0, -'-revert'.length))
  )
  // 🔒 ONLY THE LATEST PASS CAN BE REPEATED. A pass is a repeat of what the site holds NOW, and
  // the site holds the last pass's words: after pass 2 (model A) and pass 3 (model B), asking
  // for model A again is not "nothing to do" — measured 25/09/2026 on hb0355, the stage answered
  // "0 fields on 0 entries" while the site kept pass 3's words.
  const last = [...lines]
    .reverse()
    .find((l) => l.phase === 'done' && !String(l.applyId ?? '').endsWith('-revert'))
  if (!last || last.requestId !== requestId) return null
  if (open.has(last.applyId) || failed.has(last.applyId) || reverted.has(last.applyId)) return null
  return last.applyId
}

/** The `ok` mutations of one run, each paired with its `before` line, in journal order. */
export function mutationsOf(lines, applyId) {
  const befores = new Map()
  for (const l of lines) if (l.applyId === applyId && l.phase === 'before') befores.set(String(l.step), l)
  const out = []
  for (const l of lines)
    if (l.applyId === applyId && l.phase === 'ok' && befores.has(String(l.step)))
      out.push({ ...befores.get(String(l.step)), rev: l.rev ?? befores.get(String(l.step)).rev })
  return out
}

/** The runs the journal holds, oldest first — `pers-3-revert` is a run of its own. */
export function applyIdsOf(lines) {
  return [...new Set(lines.filter((l) => l.phase === 'run').map((l) => l.applyId))]
}

/**
 * The journal a run writes to: `mutate` wraps one call with its before and after lines, and
 * whatever `fn` throws is rethrown once the `failed` line is on disk.
 */
function openJournal(file, applyId, requestId) {
  const lines = readJournal(file)
  let step = 0
  const append = (obj) => {
    const line = { at: new Date().toISOString(), applyId, requestId, ...obj }
    lines.push(line)
    if (!DRY) {
      mkdirSync(path.dirname(file), { recursive: true })
      appendFileSync(file, `${JSON.stringify(line)}\n`)
    }
    return line
  }
  return {
    lines,
    append,
    /**
     * @template T
     * @param {{ target: object, before: unknown, after: unknown, rev?: string | null, origins?: object, evidence?: object }} record
     * @param {() => Promise<{ rev?: string | null, hash?: string } | void>} fn
     * @returns {Promise<T>}
     */
    async mutate(record, fn) {
      step += 1
      const mine = step
      append({ step: mine, phase: 'before', ...record })
      try {
        const got = (await fn()) ?? {}
        append({
          step: mine,
          phase: 'ok',
          target: record.target,
          rev: got.rev ?? null,
          hash: got.hash ?? null
        })
        return got
      } catch (error) {
        append({ step: mine, phase: 'failed', target: record.target, why: error.message })
        throw error
      }
    }
  }
}

/** The one place a `generated` value is checked for its evidence: the write door. */
export function refuseUnevidenced(fields, origins = {}, evidence = {}) {
  const ok = {}
  const refused = []
  for (const [f, v] of Object.entries(fields)) {
    if (origins[f] === 'generated' && !evidence[f]) refused.push(f)
    else ok[f] = v
  }
  return { ok, refused }
}

/**
 * Take an entry off the public site, keeping it in the admin. Absent or already gone: false.
 * With a journal, the call is recorded as an `unpublish` mutation (so `--revert` can publish it
 * back).
 */
async function unpublishEntry(api, collection, slug, locale, journal = null) {
  try {
    const live = await api(
      'GET',
      `/_emdash/api/content/${collection}/${encodeURIComponent(slug)}?locale=${locale}`
    )
    const item = live.item ?? live
    if (item.status !== 'published') return false
    const call = async () => {
      const r = await api(
        'POST',
        `/_emdash/api/content/${collection}/${item.id}/unpublish?locale=${locale}`,
        {}
      )
      return { rev: r?._rev ?? null }
    }
    if (journal)
      await journal.mutate(
        {
          target: { kind: 'unpublish', collection, slug, locale, id: item.id },
          before: { status: 'published' },
          after: { status: 'draft' },
          rev: live._rev ?? null
        },
        call
      )
    else await call()
    return true
  } catch (error) {
    if (error.status === 404) return false
    throw error
  }
}

/** The opposite door, for `--revert`: put an entry back on the site. */
async function publishEntry(api, collection, id, locale) {
  const r = await api('POST', `/_emdash/api/content/${collection}/${id}/publish?locale=${locale}`, {})
  return { rev: r?._rev ?? null }
}

/**
 * The items of one menu as the site holds them — the ids, which the seed does not carry, and the
 * whole row (`raw`), which is what `--revert` needs to create the item again.
 * @returns {Promise<{id: string, label: string, url: string, raw: Record<string, unknown>}[]>}
 */
async function menuItems(api, menu, locale) {
  try {
    const answer = await api('GET', `/_emdash/api/menus/${encodeURIComponent(menu)}?locale=${locale}`)
    const rows = answer.items ?? answer.menu?.items ?? answer.item?.items ?? []
    return rows.map((row) => ({
      id: String(row.id ?? ''),
      label: String(row.label ?? ''),
      url: String(row.customUrl ?? row.url ?? row.path ?? ''),
      raw: row
    }))
  } catch (error) {
    if (error.status === 404) return []
    throw error
  }
}

/**
 * What `POST /menus/<name>/items` accepts of a row the site once answered (`createMenuItemBody`
 * in EmDash's API schema is `.strict()`: an unknown key is a 400). Null when the row names no
 * destination — neither a `customUrl` nor a reference — so a revert can say so before it starts.
 */
export function menuItemPayload(row) {
  if (!row || typeof row !== 'object') return null
  const type = typeof row.type === 'string' ? row.type : 'custom'
  const out = { type, label: String(row.label ?? '') }
  if (typeof row.customUrl === 'string' && row.customUrl !== '') out.customUrl = row.customUrl
  else if (type === 'custom' && typeof row.url === 'string' && row.url !== '') out.customUrl = row.url
  if (typeof row.referenceCollection === 'string') out.referenceCollection = row.referenceCollection
  if (typeof row.referenceId === 'string') out.referenceId = row.referenceId
  for (const k of ['target', 'titleAttr', 'cssClasses', 'parentId'])
    if (typeof row[k] === 'string' && row[k] !== '') out[k] = row[k]
  if (Number.isInteger(row.sortOrder) && row.sortOrder >= 0) out.sortOrder = row.sortOrder
  if (out.label === '') return null
  if (!out.customUrl && !(out.referenceCollection && out.referenceId)) return null
  return out
}

/** Remove one item from a menu; an item that is already gone is not an error. */
async function deleteMenuItem(api, menu, itemId, locale) {
  try {
    await api(
      'DELETE',
      `/_emdash/api/menus/${encodeURIComponent(menu)}/items/${encodeURIComponent(itemId)}?locale=${locale}`
    )
    return true
  } catch (error) {
    if (error.status === 404) return false
    throw error
  }
}

/**
 * Rename one menu item — the label alone (`PUT /menus/<name>/items/<id>`), journaled as a `menu-label` with the label before
 * and after, so `--revert` puts the old one back and `--inspect` sees an editor's rename since.
 * @param {(method: string, route: string, body?: unknown) => Promise<any>} api
 * @param {{ menu: string, locale: string, item: { id: string, label: string }, label: string, journal: any }} input
 */
async function menuLabel(api, { menu, locale, item, label, journal }) {
  await journal.mutate(
    {
      target: { kind: 'menu-label', menu, locale, id: item.id, label: item.label },
      before: { label: item.label },
      after: { label },
      origins: { label: 'generated' },
      evidence: { label: EVIDENCE_GENERATED }
    },
    async () => {
      await api(
        'PUT',
        `/_emdash/api/menus/${encodeURIComponent(menu)}/items/${encodeURIComponent(item.id)}?locale=${locale}`,
        { label }
      )
      return {}
    }
  )
}

/**
 * The enquiry form's own words: the labels a visitor reads and the request types they choose from.
 * The field NAMES are what a submission is keyed by, so only labels, placeholders and option labels
 * change — the values a form stores stay what they were.
 */
async function personaliseForm(api, { model, rule, facts, locale, journal = null }) {
  // 🔒 THE FORM'S WORDS ARE WRITTEN ONLY FOR A CUSTOMER WHO DESCRIBED THE BUSINESS (TCH #1013, ABOUT-3, g60), asked through
  // the gate like every other step: a BLANK site keeps the demo's request types and consent line, translated when its root
  // is written in another language. Measured 10/10/2026 on g59-biz-emd-blank: a bakery's options on a name-only build.
  const writesWords = Boolean(model && modelMay('form', locale, facts))
  const translates = Boolean(model && modelMay('labels', locale, facts))
  const wantsWords = writesWords || translates
  if (!wantsWords && !facts.email) return { slug: null, why: null }
  const slug = `${rule.slug}-${locale}`
  let form
  try {
    const list = await api('POST', '/_emdash/api/plugins/emdash-forms/forms/list', {})
    form = (list.forms ?? list.items ?? list ?? []).find((f) => f.slug === slug)
  } catch (error) {
    return { slug: null, why: error.message, error: true }
  }
  if (!form) return { slug: null, why: null }
  // 🔒 THE CUSTOMER'S MAILBOX RECEIVES THE ENQUIRIES, NOT THE DEMO'S. `notifyEmails` is where a
  // submission is mailed; left as the demo's it sends the customer's first lead to nobody they
  // know. It is the customer's own answer, so it needs no model and carries no evidence.
  const notify = Array.isArray(form.settings?.notifyEmails) ? form.settings.notifyEmails : []
  const settings =
    facts.email && !(notify.length === 1 && notify[0] === facts.email)
      ? { ...form.settings, notifyEmails: [facts.email] }
      : form.settings
  const fields = (form.pages ?? []).flatMap((page) => page.fields ?? [])
  const asked = writesWords ? fields.filter((f) => rule.fields?.[f.name] !== undefined) : []
  let parsed = null
  let modelWhy = null
  if (asked.length > 0) {
    const language = languageNameOfWritten(locale, writtenAs)
    const system = [
      `You write the words of an enquiry form in ${language} for one business. Answer with ONE JSON object keyed by field name, nothing else.`,
      `Write in ${language} even when the business name, its address or the sector are in another language.`,
      'For each field give {"label": "…", "placeholder": "…"} and, when the field has options, {"options": ["…"]} with the SAME number of options.',
      'Write what THIS business takes from its description when there is one: a field whose example names another kind of business is rewritten for this one, never repeated.',
      `Do not invent counts, prices or named people. ${toneLine(facts.tone) ? 'Short.' : 'Plain, short, no exclamation marks.'}`,
      toneLine(facts.tone)
    ]
      .filter(Boolean)
      .join(' ')
    const user = JSON.stringify({
      business: {
        name: facts.name,
        sector: facts.sectorLabel ?? facts.sector ?? null,
        ...(facts.about ? { about: facts.about } : {}),
        ...(facts.tone ? { tone: facts.tone } : {})
      },
      form: rule.brief,
      fields: asked.map((f) => ({
        name: f.name,
        what: rule.fields[f.name],
        label: f.label,
        placeholder: f.placeholder ?? '',
        options: (f.options ?? []).map((o) => o.label)
      }))
    })
    try {
      parsed = await askModel({ model, step: 'form', locale, facts, system, user, temperature: 0.6 })
    } catch (error) {
      modelWhy = error.message
    }
  }
  let touched = 0
  const pages = (form.pages ?? []).map((page) => ({
    ...page,
    fields: (page.fields ?? []).map((f) => {
      const got = parsed?.[f.name]
      if (!got || typeof got !== 'object') return f
      const next = { ...f }
      if (typeof got.label === 'string' && got.label.trim() !== '') {
        next.label = got.label.trim()
        touched += 1
      }
      if (typeof got.placeholder === 'string' && got.placeholder.trim() !== '' && f.placeholder !== undefined)
        next.placeholder = got.placeholder.trim()
      if (Array.isArray(got.options) && Array.isArray(f.options)) {
        // 🔒 THE VALUE IS WHAT THE OWNER IS MAILED, so it follows the label: a visitor who picked "Cake order" must not arrive in the
        // inbox as "Request type: Construction quote". Measured 03/10/2026 on a bakery's form: the labels were rewritten and every
        // value stayed the demo's. A model that gives a different number of options than the demo has (two to eight of them) is
        // still believed — the number was never the point — and a field whose options it did not answer keeps its own.
        const labels = got.options
          .filter((l) => typeof l === 'string' && l.trim() !== '')
          .map((l) => l.trim().slice(0, 60))
        if (labels.length >= 2 && labels.length <= 8) {
          next.options = labels.map((label, i) => ({ ...f.options[i], label, value: label }))
          touched += 1
        }
      }
      return next
    })
  }))
  // 🔒 THE REST OF THE FORM IS IN THE ROOT'S LANGUAGE TOO (TCH #1013). Only the fields the map briefs are written above, so a
  // form on a root written in Vietnamese kept "Email", "Phone" and a "Send request" button (measured 08/10/2026 on dev,
  // tamq-9e-bizvi). Every other label, placeholder and option, and the button and the confirmation, are translated with the
  // labels' own question; a value the visitor picks follows its label, as above.
  let wordsSettings = settings
  if (translates) {
    const asks = {}
    pages.forEach((page, pi) =>
      page.fields.forEach((f, fi) => {
        // Help text remains the editor's words even when the business brief rewrites the label.
        if (isLabelText(f.helpText)) asks[`${String(pi)}.${String(fi)}.helpText`] = f.helpText
        if (parsed?.[f.name] && typeof parsed[f.name] === 'object') return
        if (isLabelText(f.label)) asks[`${String(pi)}.${String(fi)}.label`] = f.label
        if (isLabelText(f.placeholder)) asks[`${String(pi)}.${String(fi)}.placeholder`] = f.placeholder
        ;(f.options ?? []).forEach((o, oi) => {
          if (isLabelText(o?.label)) asks[`${String(pi)}.${String(fi)}.option.${String(oi)}`] = o.label
        })
      })
    )
    for (const key of ['submitLabel', 'confirmationMessage'])
      if (isLabelText(settings?.[key])) asks[`settings.${key}`] = settings[key]
    let got = {}
    if (Object.keys(asks).length > 0)
      try {
        got = await translateLabels({ model, locale, labels: asks, facts })
      } catch (error) {
        modelWhy = modelWhy ?? error.message
      }
    for (const [id, to] of Object.entries(got)) {
      const [a, b, what, oi] = id.split('.')
      if (a === 'settings') {
        wordsSettings = { ...wordsSettings, [b]: to }
        continue
      }
      const f = pages[Number(a)]?.fields?.[Number(b)]
      if (!f) continue
      if (what === 'option') {
        const options = [...f.options]
        options[Number(oi)] = { ...options[Number(oi)], label: to, value: to }
        pages[Number(a)].fields[Number(b)] = { ...f, options }
      } else pages[Number(a)].fields[Number(b)] = { ...f, [what]: to }
      touched += 1
    }
  }
  const settingsWords = wordsSettings !== settings
  const mailboxMoved = settings !== form.settings
  if (touched === 0 && !mailboxMoved && !settingsWords)
    return {
      slug: null,
      why: modelWhy ?? (asked.length > 0 ? 'nothing in the answer fitted the form' : null)
    }
  const body = {
    id: form.id,
    name: form.name,
    pages: touched > 0 ? pages : (form.pages ?? []),
    settings: wordsSettings
  }
  const origins = {
    ...(touched > 0 ? { pages: 'generated' } : {}),
    ...(settingsWords ? { settings: 'generated' } : mailboxMoved ? { settings: 'customer' } : {})
  }
  const call = async () => {
    await api('POST', '/_emdash/api/plugins/emdash-forms/forms/update', body)
  }
  try {
    if (journal)
      await journal.mutate(
        {
          target: { kind: 'form', form: slug, id: form.id, locale },
          before: { id: form.id, name: form.name, pages: form.pages ?? [], settings: form.settings },
          after: body,
          origins,
          evidence: {
            ...(touched > 0 ? { pages: EVIDENCE_GENERATED } : {}),
            ...(settingsWords ? { settings: EVIDENCE_GENERATED } : {})
          }
        },
        call
      )
    else await call()
  } catch (error) {
    return { slug: null, why: error.message, error: true }
  }
  return { slug, why: touched === 0 ? modelWhy : null }
}

/**
 * Put one picture in the site's library and answer the value an image field holds — the same shape
 * `tools/seed-apply.mjs` writes, so the site resolves it the way it resolves the template's own.
 */
async function uploadPicture(api, token, { bytes, mime, filename, alt }) {
  const hash = `sha1:${createHash('sha1').update(bytes).digest('hex')}`
  const ask = await api('POST', '/_emdash/api/media/upload-url', {
    filename,
    contentType: mime,
    size: bytes.length,
    contentHash: hash,
    deduplicate: true,
    ensureUniqueFilename: true
  })
  if (!ask.existing) {
    // The upload door is the site's own, and it wants the same bearer the API calls carry —
    // without it the PUT is answered 401 and the picture is drawn for nothing (measured 15/09).
    const headers = new Headers(ask.headers ?? {})
    headers.set('authorization', `Bearer ${token}`)
    headers.set('X-EmDash-Request', '1')
    headers.set('content-type', mime)
    const put = await fetch(ask.uploadUrl.startsWith('http') ? ask.uploadUrl : `${SITE}${ask.uploadUrl}`, {
      method: ask.method ?? 'PUT',
      headers,
      body: bytes
    })
    if (!put.ok) throw new Error(`upload ${filename} → HTTP ${String(put.status)}`)
    await api('POST', `/_emdash/api/media/${ask.mediaId}/confirm`, { contentHash: hash, size: bytes.length })
  }
  const item = await api('GET', `/_emdash/api/media/${ask.mediaId}`)
  const media = item.item ?? item
  if (alt) await api('PUT', `/_emdash/api/media/${ask.mediaId}`, { alt })
  const url = media.url ?? (media.storageKey ? `/_emdash/api/media/file/${media.storageKey}` : null)
  return {
    id: ask.mediaId,
    src: url,
    alt: alt ?? '',
    ...(media.width ? { width: media.width, height: media.height } : {}),
    filename: media.filename ?? filename,
    mimeType: mime,
    ...(media.storageKey ? { provider: 'local', meta: { storageKey: media.storageKey } } : {})
  }
}

// ───────────────────────── brand pictures ─────────────────────────
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * The brand pictures the flags name, read. A file that cannot be read or is not a PNG is a skip with its reason, never a
 * guess at what it holds.
 * @param {{ logo?: string | null, logoDark?: string | null, favicon?: string | null }} files
 * @returns {{ pictures: Record<string, Buffer>, skipped: { where: string, why: string }[] }}
 */
export function brandPicturesFrom(files, readFile = readFileSync) {
  const pictures = {}
  const skipped = []
  for (const [role, file] of Object.entries(files)) {
    if (typeof file !== 'string' || file === '') continue
    let bytes
    try {
      bytes = readFile(file)
    } catch (error) {
      skipped.push({ where: role, why: `the file could not be read (${error.message})` })
      continue
    }
    if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
      skipped.push({ where: role, why: 'the file is not a PNG' })
      continue
    }
    pictures[role] = bytes
  }
  return { pictures, skipped }
}

/** A core media setting as the settings door takes it back: `{ mediaId, alt? }`, or null for none. */
export function mediaRefOf(value) {
  if (!value || typeof value !== 'object' || typeof value.mediaId !== 'string') return null
  return { mediaId: value.mediaId, ...(typeof value.alt === 'string' ? { alt: value.alt } : {}) }
}

/**
 * Write the customer's brand pictures (TCH #1013, T22, D9):
 *
 *   logo       the light-background (or only) logo → core `settings.logo` `{ mediaId, alt }`
 *   favicon    → core `settings.favicon` `{ mediaId }`; EmDash's head prints `<link rel=icon>` from it
 *   share      → core `settings.seo.defaultOgImage` `{ mediaId }` (TCH #1013, D5): EmDash's head prints it as og:image
 *              on every page that passes no picture of its own; only that key of `seo` is written and taken back
 *   logoDark   → the image field `brand.logoDark` of the map names (`{ collection, slug, field, label }`, the template's
 *              chrome entry), in every language whose entry is PUBLISHED: a language hidden by its chrome entry is
 *              never published again by this. The field is made first when the site's schema has none (an older
 *              release), journaled, so `--revert` takes it away again.
 *
 * Every write goes through the journal (`settings`, `field`, `entry`), so `--revert <applyId>` puts the site back as it
 * was; a picture already in the library is reused by its hash. A refused write is a `skipped` line and an error; the
 * other pictures still go.
 * @returns {Promise<{ written: string[], skipped: { where: string, why: string }[] }>}
 */
async function writeBrand({ api, token, journal, map, seed, pictures, name, fail }) {
  const written = []
  const skipped = []
  const refuse = (where, error) => {
    skipped.push({ where, why: error.message })
    fail(`brand ${where}`, error)
  }
  const placed = {}
  for (const [role, bytes] of Object.entries(pictures)) {
    const sha = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
    const kebab = role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
    try {
      placed[role] = await uploadPicture(api, token, {
        bytes,
        mime: 'image/png',
        filename: `${kebab}-${sha}.png`,
        alt: role === 'favicon' || role === 'share' ? '' : (name ?? '')
      })
    } catch (error) {
      refuse(role, error)
    }
  }
  const values = {}
  if (placed.logo) values.logo = { mediaId: placed.logo.id, ...(name ? { alt: name } : {}) }
  if (placed.favicon) values.favicon = { mediaId: placed.favicon.id }
  if (placed.share) values.seo = { defaultOgImage: { mediaId: placed.share.id } }
  /** A written setting as the report names it, and as the caller names a refusal of it. */
  const label = (k) => (k === 'seo' ? 'settings.seo.defaultOgImage' : `settings.${k}`)
  if (Object.keys(values).length > 0) {
    try {
      let current = {}
      try {
        current = (await api('GET', '/_emdash/api/settings')) ?? {}
      } catch {
        // a site that cannot say what it holds is written all the same; the revert then clears the setting
      }
      // `seo` is a group: only its default share picture is this run's, and only it is put back (null clears it).
      const before = Object.fromEntries(
        Object.keys(values).map((k) => [
          k,
          k === 'seo' ? { defaultOgImage: mediaRefOf(current.seo?.defaultOgImage) } : mediaRefOf(current[k])
        ])
      )
      await journal.mutate(
        {
          target: { kind: 'settings', fields: Object.keys(values) },
          before,
          after: values,
          origins: Object.fromEntries(Object.keys(values).map((k) => [k, 'customer']))
        },
        async () => {
          await api('POST', '/_emdash/api/settings', values)
          return { hash: hashOf(values) }
        }
      )
      for (const k of Object.keys(values)) written.push(label(k))
    } catch (error) {
      for (const k of Object.keys(values)) refuse(k === 'seo' ? 'share' : k, error)
    }
  }
  if (!placed.logoDark) return { written, skipped }
  const rule = map.brand?.logoDark
  if (!rule?.collection || !rule.slug || !rule.field) {
    skipped.push({ where: 'logoDark', why: 'this template names no place for a dark-background logo' })
    return { written, skipped }
  }
  try {
    const fields = await api(
      'GET',
      `/_emdash/api/schema/collections/${encodeURIComponent(rule.collection)}/fields`
    )
    if (!(fields?.items ?? []).some((f) => f.slug === rule.field))
      await journal.mutate(
        {
          target: { kind: 'field', collection: rule.collection, field: rule.field },
          before: null,
          after: 'image'
        },
        async () => {
          await api('POST', `/_emdash/api/schema/collections/${encodeURIComponent(rule.collection)}/fields`, {
            slug: rule.field,
            label: rule.label ?? 'Logo for dark backgrounds',
            type: 'image',
            required: false,
            validation: null
          })
        }
      )
  } catch (error) {
    refuse('logoDark', error)
    return { written, skipped }
  }
  const locales = [
    ...new Set(
      (seed.content?.[rule.collection] ?? [])
        .filter((e) => e.slug === rule.slug)
        .map((e) => e.locale ?? seed.defaultLocale ?? 'en')
    )
  ]
  for (const locale of locales) {
    const where = `${rule.collection}/${rule.slug}/${locale}.${rule.field}`
    try {
      const live = await liveEntry(api, rule.collection, rule.slug, locale)
      // 🔒 A HIDDEN LANGUAGE STAYS HIDDEN. Its chrome entry is what makes the template serve it, and a write here ends
      // with a publish: only an entry the site already publishes is written.
      if (live === null || live.item.status !== 'published') continue
      const value = placed.logoDark
      await journal.mutate(
        {
          target: {
            kind: 'entry',
            collection: rule.collection,
            slug: rule.slug,
            locale,
            id: live.item.id,
            fields: [rule.field]
          },
          before: { [rule.field]: live.data[rule.field] ?? null },
          after: { [rule.field]: value },
          rev: live.rev,
          origins: { [rule.field]: 'customer' }
        },
        async () => {
          const upd = await api(
            'PUT',
            `/_emdash/api/content/${rule.collection}/${live.item.id}?locale=${locale}`,
            {
              data: { ...live.data, [rule.field]: value },
              _rev: live.rev
            }
          )
          const pub = await api(
            'POST',
            `/_emdash/api/content/${rule.collection}/${live.item.id}/publish?locale=${locale}`,
            {}
          )
          return { rev: pub?._rev ?? upd?._rev ?? null }
        }
      )
      written.push(where)
    } catch (error) {
      refuse(where, error)
    }
  }
  return { written, skipped }
}

/** The brand pictures alone (`--brand-only`): tracy-web's brand step, after the words, under its own apply id. */
async function brandOnly() {
  const answers = readAnswers()
  const read = (f) => JSON.parse(readFileSync(path.join(SEED_DIR, f), 'utf8'))
  const map = read('personalize.json')
  const seed = read('seed.json')
  const { pictures, skipped } = brandPicturesFrom(BRAND_FILES)
  const report = {
    site: SITE,
    dryRun: DRY,
    applyId: null,
    brandOnly: true,
    brand: { written: [], skipped },
    written: [],
    unchanged: [],
    editor: [],
    errors: [],
    unanswered: [],
    skipped: [],
    copy: { done: [], skipped: [] },
    trimmed: [],
    generated: []
  }
  if (DRY || Object.keys(pictures).length === 0) return finish(report)
  const token = existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : ''
  if (!/^ec_pat_[A-Za-z0-9_-]{16,}$/.test(token)) {
    console.error(`no agent token at ${TOKEN_FILE}`)
    process.exit(1)
  }
  const api = makeApi(token)
  const applyId = APPLY_ID_ARG ?? nextApplyId(readJournal(JOURNAL_FILE))
  report.applyId = applyId
  const requestId = hashOf({
    brand: Object.fromEntries(
      Object.entries(pictures).map(([k, b]) => [k, createHash('sha256').update(b).digest('hex')])
    ),
    rule: map.brand ?? null,
    version: templateVersion()
  })
  const journal = openJournal(JOURNAL_FILE, applyId, requestId)
  journal.append({ phase: 'run', mode: { brandOnly: true, pictures: Object.keys(pictures) } })
  const fail = (rule, error) =>
    report.errors.push({ rule, why: error.message, ...(error.status ? { status: error.status } : {}) })
  const name = text(answers.name) || null
  const out = await writeBrand({ api, token, journal, map, seed, pictures, name, fail })
  report.brand = { written: out.written, skipped: [...skipped, ...out.skipped] }
  journal.append({ phase: 'done', written: out.written.length, errors: report.errors.length })
  return finish(report)
}

// ───────────────────────── main ─────────────────────────
/** The template's own version, for the request hash: a new release is a new request. */
function templateVersion() {
  const file = path.resolve(SEED_DIR, '..', 'template.config.json')
  try {
    return String(JSON.parse(readFileSync(file, 'utf8')).version ?? '')
  } catch {
    return ''
  }
}

/** One entry as the site holds it now, or null when the site has no such entry. */
async function liveEntry(api, collection, slug, locale) {
  try {
    const live = await api(
      'GET',
      `/_emdash/api/content/${collection}/${encodeURIComponent(slug)}?locale=${locale}`
    )
    const item = live.item ?? live
    return { item, rev: live._rev ?? null, data: item.liveData ?? item.data ?? {} }
  } catch (error) {
    if (error.status === 404) return null
    throw error
  }
}

async function main() {
  const answers = readAnswers()
  const read = (f) => JSON.parse(readFileSync(path.join(SEED_DIR, f), 'utf8'))
  const templateMap = read('personalize.json')
  // No template rule hides a page (`templateHideRules`): only the customer's own Pages answer does.
  const map = { ...templateMap, hide: templateHideRules(templateMap, answers) }
  const seed = read('seed.json')
  const questions = existsSync(path.join(SEED_DIR, 'questions.json')) ? read('questions.json') : null
  // Where the importer puts the template's files (`DEMO FILE LINKS`): a link to a document of the demo company.
  const mediaMap = (() => {
    try {
      return existsSync(path.join(SEED_DIR, 'media-map.json')) ? read('media-map.json') : null
    } catch {
      return null
    }
  })()
  const facts = factsFrom(answers, questions)
  const model = NO_MODEL ? null : modelFrom(process.env, { imageModel: map.images?.model })
  // 🔒 A NAME LEFT BLANK STOPS NO WORD (TCH #1013, 13/10/2026). Tracy sends no name when the customer left Name blank, so
  // the template keeps its own; the copy is still written from the description, and a root in another language is still
  // translated. The model gate decides (`modelMay`): a name was never what made a step worth asking for.
  const rewrite = Boolean(model)
  // Demo rows are cut only for a customer who described the business, with a model to rewrite what stays (`planFrom`).
  const cut = Boolean(rewrite && facts.about)
  // The demo's claims (`map.facts`) are emptied only for a customer who described the business, model or not (`planFrom`).
  const claims = Boolean(facts.about)
  const shipped = planFrom(map, seed, facts, { rewrite, cut, claims }).locales
  const skipped = []
  // 🔒 A MISSING MEDIA MAP IS SAID, NEVER SILENT (DEMO FILE LINKS, TCH #1013): it is the only file that says which link the
  // importer fills with a document of the demo company. Apply ran this tool without it (the tracy-web image did not carry
  // it, measured 10/10/2026 on g60-biz-emd-full), and the hero kept the demo company's PDF with no word in the report.
  if (mediaMap === null)
    skipped.push({
      rule: 'demo-files',
      why: 'seed/media-map.json was not found: a button to a document of the demo company cannot be told and keeps its link'
    })
  // The languages the customer asked for, among the ones this template ships: the only locales
  // written, by the model or otherwise. Every other locale is hidden (see `localesFrom`).
  const remembered = (() => {
    try {
      return existsSync(RECEIPTS_FILE) ? JSON.parse(readFileSync(RECEIPTS_FILE, 'utf8')).language : undefined
    } catch {
      return undefined
    }
  })()
  const language = languageDecision(answers, shipped, seed.defaultLocale ?? shipped[0], remembered)
  if (language.why) skipped.push({ rule: 'language', why: language.why })
  const locales = language.write
  writtenAs = language.as ?? {}
  // Planned once the language is known: an identity sentence is picked by the language the root is written in.
  const {
    patches,
    unanswered,
    seedEntries,
    replacedOnly,
    trim,
    unlinked,
    samples,
    nameOnly,
    borrowedLabels
  } = planFrom(map, seed, facts, {
    rewrite,
    cut,
    claims,
    writtenAs,
    mediaMap,
    closed: unpickedPageRules(answers, seed).rules.map((r) => r.path ?? `/${r.slug}`)
  })
  const nameRules = nameRulesOf(map, facts).rules

  // 🔒 A REDRAW IS ONLY A REDRAW. Asked for one picture ("make the home one bread"), this used to
  // rewrite every word of the site first and reach the pictures minutes later — measured 15/09, the
  // run was killed at ten minutes before a single picture was drawn. When the answers name
  // pictures, nothing else is asked of the model.
  const redrawOnly =
    answers.pictures !== undefined &&
    answers.pictures !== null &&
    typeof answers.pictures === 'object' &&
    !Array.isArray(answers.pictures)

  // The pages the customer unticked go the way a `hide` rule's page goes: unpublished, their menu items dropped (T23).
  const unpicked = unpickedPageRules(answers, seed)
  for (const s of unpicked.skipped) skipped.push(s)
  // 🔒 ONLY THE PAGES THE CUSTOMER UNTICKED (TCH #1013, 08/10/2026): no template rule and no emptied list page hides one.
  const hideRules = redrawOnly ? [] : unpicked.rules
  // 🔒 AN ENTRY A `hide` RULE NAMES IS NOT WRITTEN TO AGAIN, BY ANY LANE. The write door PUTs and then PUBLISHES, so a page
  // hidden by the customer and written to afterwards was published again (measured 03/10/2026: the Careers page of a bakery,
  // live with a hiring process nobody had described; and 08/10/2026 on a site in Vietnamese: Projects unticked, `/projects`
  // 200, because the labels of the root written in Vietnamese are translated on that page). Known before any lane runs, and
  // checked at the door (`writeEntry`), so a lane added later cannot forget it. Whether THIS run did the unpublishing does
  // not matter (a repeat finds it already hidden), so the set is made from the rules, not from `report.hidden`.
  // 🔒 AN UNTICKED PAGE GOES FROM EVERY EDITION THE SITE SERVES (TCH #1013, PAGE-1, 09/10/2026). With no language chosen the
  // editions written neither in the root nor in English stay published (LANG-5), and the unticked page was unpublished only
  // in the locales written: `/de/careers` stayed open, its menus still leading there. `served` is every locale still served.
  const served = [...locales, ...shipped.filter((l) => !locales.includes(l) && !language.hide.includes(l))]
  const hiddenByRule = new Set(hideRules.flatMap((r) => served.map((l) => `${r.collection}/${r.slug}/${l}`)))
  // 🔒 EVERY EDITION THE SITE STILL SERVES CARRIES THE CUSTOMER'S NAME (TCH #1013, ABOUT-3, 09/10/2026). No language chosen
  // keeps every edition published (LANG-5), and the 39 written neither in the root nor in English kept the demo company's
  // name (measured on a blank Tracy Business 1.7.3 site). They get the name and nothing else (`nameOnly`), never the words.
  const renamedOnly = facts.name && !redrawOnly ? served.filter((l) => !locales.includes(l)) : []

  const copy = { done: [], skipped: [] }
  /** `emptied`: entries of a rule with `"unwritten": "empty"` whose fields the model never wrote for this business. */
  const rewritten = { done: new Set(), skipped: [], emptied: [] }
  const retried = []
  /** `<collection>/<slug>/<locale>.<body>`: bodies the model did not answer one part per part, twice. */
  const bodyFell = new Set()
  /** `<collection>/<slug>/<locale>.<field>` → the row indexes a card list kept as the demo's after two asks. */
  const echoedRows = new Map()
  const pictures = { done: [], skipped: [] }
  const canWrite = Boolean(model && !redrawOnly)
  // 🔒 ABOUT LEFT BLANK CHANGES THE NAME AND NOTHING ELSE (TCH #1013, ABOUT-3, K7, 09/10/2026; g60, 10/10/2026). With a model
  // and a name but no description, the copy, titles, terms, bodies and card lists were still rewritten by the model from the
  // name alone: the demo's words replaced by sentences nobody described. The lanes that rewrite the demo's words run only for
  // a customer who described the business (`modelMay`, the one gate every model call goes through). A root written in
  // another language keeps the template's words too, in that language: its shipped edition of that language, else a
  // translation (`demoWordsWork`); until g60 such a root was rewritten from the name alone.
  const rewritesIn = (locale) => Boolean(canWrite && modelMay('copy', locale, facts))
  /** A root written in another language than its own, whose template words are said in that language. */
  const translatesIn = (locale) => Boolean(canWrite && modelMay('labels', locale, facts))
  const canRewrite = locales.some(rewritesIn)
  if (redrawOnly) copy.skipped.push({ why: 'a redraw: the words are left as they are' })
  else if (!model)
    copy.skipped.push({
      why: NO_MODEL
        ? '--no-model'
        : 'no model key (OPENROUTER_API_KEY, DEEPSEEK_API_KEY or TRACY_MODEL_URL): the demo copy stays'
    })
  // A choice, not a failure: not a `copy.skipped` line, which Tracy reports as text that could not be written.
  else if (!canRewrite) skipped.push({ rule: 'copy', why: 'About left blank: the demo copy stays, renamed' })
  if (!canRewrite && !redrawOnly)
    rewritten.skipped.push({
      why: !model
        ? 'no model key: the demo entries keep their words'
        : 'About left blank: the demo entries keep their words, renamed'
    })

  // The brand pictures the flags name, written after everything else (`writeBrand`).
  const brand = brandPicturesFrom(BRAND_FILES)
  for (const s of brand.skipped) skipped.push({ rule: `brand ${s.where}`, why: s.why })

  // settings
  const settings = {}
  for (const [k, tpl] of Object.entries(map.settings ?? {})) {
    const filled = fill(tpl, facts)
    if ('missing' in filled) unanswered.push({ rule: `settings.${k}`, why: noAnswer(filled.missing) })
    else settings[k] = filled.value
  }

  // 🔒 WHAT MAKES TWO RUNS THE SAME REQUEST: the answers, the map, the seed, the template's
  // version — and the mode. A run without a model key followed by one with a key is not a repeat:
  // the second has copy to write that the first could not (the receipts would let it through, the
  // journal must too).
  const requestId = createHash('sha256')
    .update(
      canonical({
        answers,
        map,
        seed: hashOf(seed),
        version: templateVersion(),
        mode: {
          model: model ? [model.provider, model.model, model.imageModel ?? null] : null,
          images: !NO_IMAGES,
          // A new logo is a new request: a run that would otherwise repeat the last one still has a picture to write.
          ...(Object.keys(brand.pictures).length > 0
            ? {
                brand: Object.fromEntries(
                  Object.entries(brand.pictures).map(([k, b]) => [
                    k,
                    createHash('sha256').update(b).digest('hex')
                  ])
                )
              }
            : {})
        }
      })
    )
    .digest('hex')
    .slice(0, 16)

  const report = {
    site: SITE,
    dryRun: DRY,
    applyId: null,
    requestId,
    repeatOf: null,
    model: model ? { provider: model.provider, text: model.model, image: model.imageModel ?? null } : null,
    facts: { ...facts },
    written: [],
    unchanged: [],
    editor: [],
    generated: [],
    errors: [],
    unanswered,
    skipped,
    copy,
    rewritten: { done: 0, retried: 0, skipped: rewritten.skipped, emptied: rewritten.emptied },
    terms: [],
    labels: [],
    forms: [],
    language: {
      write: language.write,
      ...(language.as ? { as: language.as } : {}),
      hidden: language.hide,
      renamedOnly,
      unpublished: 0
    },
    hidden: [],
    trimmed: [],
    unlinked: [],
    settings: Object.keys(settings)
  }
  // The trim plan and the links it moves, for every locale written — decided before any write.
  const trimmedNow = []
  for (const t of trim.trimmed)
    for (const locale of locales)
      if (
        (seed.content?.[t.collection] ?? []).some((e) => e.slug === t.slug && (e.locale ?? 'en') === locale)
      )
        trimmedNow.push({ ...t, locale })
  report.unlinked = unlinked.filter((r) => locales.includes(r.entry.split('/')[2]))
  if (DRY) {
    report.planned = [...patches.values()]
      .filter((p) => locales.includes(p.locale))
      .map((p) => ({
        entry: `${p.collection}/${p.slug}/${p.locale}`,
        fields: Object.keys(p.fields),
        origins: { ...p.origins }
      }))
    report.trimmed = trimmedNow.map((t) => ({ entry: `${t.collection}/${t.slug}/${t.locale}`, why: t.why }))
    return finish(report)
  }

  const token = existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : ''
  if (!/^ec_pat_[A-Za-z0-9_-]{16,}$/.test(token)) {
    console.error(`no agent token at ${TOKEN_FILE}`)
    process.exit(1)
  }
  const api = makeApi(token)
  const receipts = existsSync(RECEIPTS_FILE)
    ? JSON.parse(readFileSync(RECEIPTS_FILE, 'utf8'))
    : { entries: {} }
  receipts.entries ??= {}

  // ── The journal: what an earlier run left, and whether this one is a repeat ──────────────────
  const history = readJournal(JOURNAL_FILE)
  const applyId = APPLY_ID_ARG ?? nextApplyId(history)
  report.applyId = applyId
  const again = repeatOf(history, requestId)
  if (again !== null) {
    // Same request, every mutation of it landed: nothing to do, and no call to the site to prove
    // it. The entries that run wrote are reported unchanged, under the run they came from.
    report.repeatOf = again
    report.unchanged = [
      ...new Set(
        mutationsOf(history, again)
          .filter((m) => m.target.kind === 'entry')
          .map((m) => `${m.target.collection}/${m.target.slug}/${m.target.locale}`)
      )
    ]
    return finish(report)
  }
  const journal = openJournal(JOURNAL_FILE, applyId, requestId)
  // 🔒 A `before` WITH NO `ok` IS A RUN THAT DIED MID-WRITE. The PUT may have landed and the
  // publish not, or neither: the site is the only witness. It is named in `errors` (the customer
  // is told a write was cut), closed in the journal so the next run does not report it again, and
  // the entry is read from the site before any write — the receipt and `_rev` logic below then
  // decides, as it does for any moved revision.
  for (const open of dangling(history)) {
    const t = open.target ?? {}
    const rule =
      t.kind === 'entry' || t.kind === 'unpublish' || t.kind === 'publish'
        ? `${t.collection}/${t.slug}/${t.locale}`
        : t.kind === 'menu' || t.kind === 'menu-label'
          ? `menu ${t.menu}/${t.locale}/${t.label ?? t.id}`
          : t.kind === 'term'
            ? `term ${t.taxonomy}/${t.term}`
            : t.kind === 'form'
              ? `form ${t.form}`
              : String(t.kind ?? 'unknown')
    report.errors.push({ rule, why: 'a previous run stopped mid-write', applyId: open.applyId })
    journal.append({
      applyId: open.applyId,
      step: open.step,
      phase: 'failed',
      target: t,
      why: `stopped mid-write; found by ${applyId}`
    })
  }
  journal.append({
    phase: 'run',
    mode: { model: report.model, images: !NO_IMAGES, redrawOnly, locales }
  })
  const fail = (rule, error) => {
    report.errors.push({
      rule,
      why: error.message,
      ...(error.status ? { status: error.status } : {})
    })
  }

  // ── The road to the site ─────────────────────────────────────────────────────────────────────
  // Every field the run decides goes through here: the receipt says whether it was written
  // before, an editor's own revision is left alone, and the write is a PUT (a draft) followed by
  // a publish. From 15/09 it is called as each thing lands, not once at the end — the customer
  // watches the site, and six minutes of Northgate followed by everything at once read as stuck.
  //
  // 🔒 ONE WRITER PER ENTRY. Copy, bodies and pictures land on `pages/home` from three lanes at
  // once, and EmDash checks the `_rev` on every PUT: two writes in flight on one entry would
  // have the second refused. Writes to one entry queue behind each other; writes to different
  // entries do not wait. The same entry written twice reports once, with the union of fields.
  const lanes = new Map()
  /** @type {Map<string, Set<string>>} */
  const wrote = new Map()
  /** @type {Map<string, Set<string>>} the `generated` fields that landed, per entry */
  const invented = new Map()
  const unchanged = new Set()
  const editor = new Set()
  /**
   * The fields a collection has ON THIS SITE, read once per collection; null when the site does not say (a write then
   * names whatever the plan holds, as before).
   *
   * 🔒 THE TOOL MAY BE AHEAD OF THE SITE'S RELEASE (TCH #1013). Apply runs the tool and the seed shipped in the tracy-web
   * image, the site runs the release it was made from, and EmDash refuses a whole write that names a field its collection
   * does not have (`unknown_field`): one field added in a later release cost a site made from the earlier one every word
   * of that page. A field the site has not is left, named in the report, and the rest of the entry is written.
   * @type {Map<string, Promise<Set<string> | null>>}
   */
  const siteFields = new Map()
  const fieldsOnSite = (collection) => {
    if (!siteFields.has(collection))
      siteFields.set(
        collection,
        api('GET', `/_emdash/api/schema/collections/${encodeURIComponent(collection)}/fields`)
          .then((answer) => {
            const items = Array.isArray(answer?.items) ? answer.items : []
            return items.length > 0 ? new Set(items.map((f) => String(f.slug))) : null
          })
          .catch(() => null)
      )
    return siteFields.get(collection)
  }
  const writeEntry = async (k) => {
    const planned = patches.get(k)
    if (!planned) return
    // A language the customer did not choose keeps the template's words; one still served takes the name alone.
    const p = locales.includes(planned.locale)
      ? planned
      : renamedOnly.includes(planned.locale)
        ? nameOnly.get(k)
        : null
    if (!p || Object.keys(p.fields).length === 0) return
    // A page the customer unticked is never written, so never published again (`hiddenByRule`).
    if (hiddenByRule.has(k)) return
    // 🔒 THE CHECK AT THE DOOR. A value a model wrote reaches the site only with its evidence —
    // the sentence the customer reads beside it. Whatever lane forgot to attach it, the field
    // stops here, named, and the rest of the entry still goes.
    const gate = refuseUnevidenced(p.fields, p.origins, p.evidence)
    for (const f of gate.refused)
      report.errors.push({ rule: `${k}.${f}`, why: 'a generated value carries no evidence' })
    if (Object.keys(gate.ok).length === 0) return
    const live = await liveEntry(api, p.collection, p.slug, p.locale)
    if (live === null) {
      skipped.push({ rule: k, why: 'the site has no such entry' })
      return
    }
    const { item, rev, data: liveData } = live
    const known = await fieldsOnSite(p.collection)
    for (const f of Object.keys(gate.ok))
      if (known && !known.has(f))
        skipped.push({ rule: `${k}.${f}`, why: "this site's release of the template has no such field" })
    // A list keeps the keys only the site's rows hold (the importer's pictures), before anything is hashed or journaled.
    const fields = Object.fromEntries(
      Object.entries(gate.ok)
        .filter(([f]) => !known || known.has(f))
        .map(([f, v]) => [f, keepSiteRowKeys(v, liveData[f])])
    )
    if (Object.keys(fields).length === 0) return
    const receipt = receipts.entries[k]
    const fingerprint = hashOf(bareFields(fields))
    if (receipt && receipt.rev === rev && receipt.hash === fingerprint) {
      unchanged.add(k)
      return
    }
    if (receipt && receipt.rev !== rev) {
      // 🔒 A MOVED REVISION IS NOT YET AN EDITOR. The revision also moves when this tool
      // unpublishes the entry, when an older run wrote a picture outside the receipts, when the
      // admin republishes — measured 15/09: 66 entries "left to an editor" on a site nobody had
      // touched, `home/en` among them, so its copy and pictures never landed. What says an
      // editor was here is the VALUE: the fields this tool wrote last time still read as it wrote
      // them, or they do not. A receipt from before the field list was kept (15/09, the two
      // test sites on the stand — no customer site had one) cannot be checked and is adopted:
      // it was written by this tool, and a revision it cannot explain is more likely its own
      // unpublish than a person.
      const theirs = Array.isArray(receipt.fields)
        ? hashOf(bareFields(Object.fromEntries(receipt.fields.map((f) => [f, liveData[f]]))))
        : receipt.hash
      if (theirs !== receipt.hash) {
        editor.add(k)
        return
      }
    }
    const data = { ...liveData, ...fields }
    const before = Object.fromEntries(Object.keys(fields).map((f) => [f, liveData[f] ?? null]))
    const origins = Object.fromEntries(Object.keys(fields).map((f) => [f, p.origins[f] ?? 'customer']))
    const evidence = Object.fromEntries(
      Object.keys(fields)
        .filter((f) => p.evidence[f])
        .map((f) => [f, p.evidence[f]])
    )
    const got = await journal.mutate(
      {
        target: {
          kind: 'entry',
          collection: p.collection,
          slug: p.slug,
          locale: p.locale,
          id: item.id,
          fields: Object.keys(fields)
        },
        before,
        after: fields,
        rev,
        origins,
        evidence
      },
      async () => {
        const upd = await api('PUT', `/_emdash/api/content/${p.collection}/${item.id}?locale=${p.locale}`, {
          data,
          _rev: rev
        })
        const pub = await api(
          'POST',
          `/_emdash/api/content/${p.collection}/${item.id}/publish?locale=${p.locale}`,
          {}
        )
        return { rev: pub._rev ?? upd._rev ?? null, hash: fingerprint }
      }
    )
    // The receipt is the journal's `ok` line, kept in the shape other code reads.
    receipts.entries[k] = {
      id: item.id,
      rev: got.rev,
      hash: got.hash,
      fields: Object.keys(fields),
      at: new Date().toISOString()
    }
    const had = wrote.get(k) ?? new Set()
    for (const f of Object.keys(fields)) had.add(f)
    wrote.set(k, had)
    for (const f of Object.keys(fields))
      if (origins[f] === 'generated') {
        const set = invented.get(k) ?? new Set()
        set.add(f)
        invented.set(k, set)
      }
  }
  // At most this many entries are written at once. Every edition still served takes the name now (ABOUT-3), so one
  // flush can name a few hundred entries; opening them all at once reset connections (measured 09/10/2026 on the
  // template's mock: 50 to 138 entries failed with "fetch failed", ECONNRESET on connect).
  const writeSlots = limiter(CONCURRENCY * 4)
  /** @param {Iterable<string>} keys */
  const flush = (keys) =>
    Promise.all(
      [...new Set(keys)].map((k) => {
        const next = (lanes.get(k) ?? Promise.resolve())
          .then(() => writeSlots(() => writeEntry(k)))
          .catch((error) => fail(k, error))
        lanes.set(k, next)
        return next
      })
    )
  const patchOf = (collection, slug, locale) => {
    const k = `${collection}/${slug}/${locale}`
    const p = patches.get(k) ?? { collection, slug, locale, fields: {}, origins: {}, evidence: {} }
    patches.set(k, p)
    return p
  }
  /** A value the model wrote, into the plan, with its origin and the sentence that goes with it. */
  const generated = (p, field, value) => {
    p.fields[field] = value
    p.origins[field] = 'generated'
    p.evidence[field] = EVIDENCE_GENERATED
  }
  /** What the model wrote, into the plan — never over a field the customer's facts already set. */
  const takeInto = (out) => {
    const keys = []
    for (const [key, fields] of Object.entries(out.written)) {
      const [collection, slug, loc] = key.split('/')
      const p = patchOf(collection, slug, loc)
      // `facts` already emptied the claim fields on this entry; a rewrite never fills them back.
      for (const [f, v] of Object.entries(fields))
        if (p.fields[f] === undefined || replacedOnly.has(`${key}.${f}`)) {
          generated(p, f, v)
          replacedOnly.delete(`${key}.${f}`)
        }
      keys.push(key)
    }
    return keys
  }
  // `seedEntries` already leaves the trimmed rows out (`planFrom`), so no lane — titles, bodies,
  // pictures — ever reaches one.
  // A rule's `slugs` keeps it to those entries of its collection (the two legal pages of `pages`, not the kit's samples).
  const entriesOf = (rule, locale) =>
    seedEntries.filter(
      (e) =>
        e.collection === rule.collection &&
        e.locale === locale &&
        (!Array.isArray(rule.slugs) || rule.slugs.includes(e.slug))
    )
  const pairs = (rules) => {
    const out = []
    for (const rule of rules ?? []) for (const locale of locales) out.push({ rule, locale })
    return out
  }
  /** The pairs whose locale the model may rewrite the demo's words in (`rewritesIn`, ABOUT-3, K7). */
  // 🔒 A RULE THAT KEEPS THE TEMPLATE'S WORDS IS NEVER HANDED TO THE MODEL (TCH #1013, Akemi's decision 2 of 12/10/2026). The
  // legal pages of a FULL site keep the template's text, the demo company's name swapped (`replace`): `keep: true` on a
  // rewrite rule names the fields so a root written in another language still gets them in that language (`demoWordsWork`).
  const rewritePairs = (rules) =>
    pairs(rules).filter(({ rule, locale }) => rule?.keep !== true && rewritesIn(locale))

  // ── 1. What a visitor meets first: the site's name, the menu, the titles ─────────────────────
  // The cheap and visible things, published the moment they exist: the name on every page, the
  // pages and languages the customer did not ask for gone from the menu, and every entry's title
  // — one small request per collection. The title is decided HERE so the body below can be
  // written to match it, and so the customer never sees a headline change twice.
  // The receipt keeps the hash of what phase 1 posted (`first`) next to the hash of the whole
  // (`hash`, below): a rerun with the same answers posts neither, and reports nothing written.
  const postSettings = async (values, phase) => {
    let current = {}
    try {
      const got = await api('GET', '/_emdash/api/settings')
      current = got && typeof got === 'object' ? got : {}
    } catch {
      // a site without the settings door answers the POST all the same
    }
    const before = Object.fromEntries(Object.keys(values).map((k) => [k, current[k] ?? null]))
    const origins = Object.fromEntries(
      Object.keys(values).map((k) => [k, phase === 'first' ? 'customer' : 'generated'])
    )
    const evidence =
      phase === 'first' ? {} : Object.fromEntries(Object.keys(values).map((k) => [k, EVIDENCE_GENERATED]))
    await journal.mutate(
      { target: { kind: 'settings', fields: Object.keys(values) }, before, after: values, origins, evidence },
      async () => {
        await api('POST', '/_emdash/api/settings', values)
        return { hash: hashOf(values) }
      }
    )
  }
  if (Object.keys(settings).length > 0 && receipts.settings?.first !== hashOf(settings)) {
    try {
      await postSettings(settings, 'first')
      receipts.settings = { ...receipts.settings, first: hashOf(settings) }
      report.written.push({ entry: 'settings', fields: Object.keys(settings) })
    } catch (error) {
      fail('settings', error)
    }
  }
  await flush(patches.keys())

  // The languages nobody chose, taken off the site the way Joomla retires them (PR #267): every
  // entry unpublished, never deleted, and the template redirects the locale's URLs. The switcher,
  // the hreflang links and the sitemaps then leave it out by themselves — all three list published
  // entries only. Menus are left as they are: nothing links into a hidden language any more.
  // 🔒 AT MOST `CONCURRENCY` AT ONCE. Writes to 40 locales in flight together used to open a
  // connection each and ran the test host out of ports (`EADDRNOTAVAIL`, 23/09); a hidden locale
  // is ~50 entries, and 39 of them is a queue, not a burst.
  // A redraw is only a redraw: it hides nothing.
  if (!redrawOnly && language.hide.length > 0) {
    const everyRow = []
    for (const [collection, rows] of Object.entries(seed.content ?? {}))
      for (const e of rows ?? [])
        if (language.hide.includes(e.locale ?? 'en') && (!HIDE_CHROME_ONLY || collection === 'site'))
          everyRow.push({ collection, slug: e.slug, locale: e.locale ?? 'en' })
    await eachLimit(everyRow, CONCURRENCY, async (e) => {
      try {
        if (await unpublishEntry(api, e.collection, e.slug, e.locale, journal))
          report.language.unpublished += 1
      } catch (error) {
        fail(`${e.collection}/${e.slug}/${e.locale}`, error)
      }
    })
  }
  receipts.language = {
    write: language.write,
    hide: language.hide,
    ...(language.as ? { as: language.as } : {}),
    at: new Date().toISOString()
  }

  // The tag the template prints for each written locale (`en` shown as `en-US`). Decided only by
  // a run that names languages: a later run without a language answer keeps what the build chose.
  if (!redrawOnly && answeredLanguages(answers).length > 0) {
    const shown = displayLocalesFrom(answers, language.write, language.as)
    const was = (() => {
      try {
        return existsSync(DISPLAY_FILE) ? JSON.parse(readFileSync(DISPLAY_FILE, 'utf8')) : null
      } catch {
        return null
      }
    })()
    if (canonical(was ?? {}) !== canonical(shown)) {
      try {
        await journal.mutate(
          {
            target: { kind: 'file', file: path.basename(DISPLAY_FILE) },
            before: was,
            after: shown,
            origins: { status: 'customer' }
          },
          async () => {
            mkdirSync(path.dirname(DISPLAY_FILE), { recursive: true })
            writeFileSync(DISPLAY_FILE, `${JSON.stringify(shown)}\n`)
            return { hash: hashOf(shown) }
          }
        )
      } catch (error) {
        fail(path.basename(DISPLAY_FILE), error)
      }
    }
    report.displayLocale = shown
  }

  // ── Off the site: the demo rows beyond `keep`, and the pages that are nothing but claims ─────
  // Unpublished rather than deleted: the words stay in the admin for a customer who does want
  // them, and a menu item pointing at nothing is what a visitor would have met otherwise.
  // Both go through the same two doors — unpublish, then the menu items that led there.
  const goneSlugs = new Set()
  /** The slugs of the pages the customer unticked: their menu items go from every edition served, not only the written. */
  const hiddenSlugs = new Set()
  /** Paths a hide rule names outright (`path`): a page served somewhere other than `/<slug>`. */
  const gonePaths = new Set()
  if (!redrawOnly)
    for (const t of trimmedNow) {
      try {
        if (!(await unpublishEntry(api, t.collection, t.slug, t.locale, journal))) continue
        report.trimmed.push({ entry: `${t.collection}/${t.slug}/${t.locale}`, why: t.why })
        goneSlugs.add(t.slug)
      } catch (error) {
        fail(`${t.collection}/${t.slug}/${t.locale}`, error)
      }
    }
  // The pages the customer unticked (`hideRules`, decided before any lane wrote), in every edition still served.
  for (const rule of hideRules) {
    for (const locale of served) {
      try {
        if (!(await unpublishEntry(api, rule.collection, rule.slug, locale, journal))) continue
        report.hidden.push({ entry: `${rule.collection}/${rule.slug}/${locale}`, why: rule.why })
        if (typeof rule.path === 'string' && rule.path.startsWith('/')) gonePaths.add(rule.path)
        else hiddenSlugs.add(rule.slug)
      } catch (error) {
        fail(`${rule.collection}/${rule.slug}/${locale}`, error)
      }
    }
  }
  // The menu items that led there, in every edition still served (a trimmed row is cut in the locales written only, and
  // its links elsewhere are none of this run's). The ids come from the SITE, not from the seed: the seed names items by
  // label, and EmDash deletes them by id.
  const dropMenuItems = async (slugs, paths = new Set(), where = locales) => {
    if (slugs.size === 0 && paths.size === 0) return
    for (const menu of seed.menus ?? []) {
      if (!where.includes(menu.locale)) continue
      // 🔒 THE SITE KNOWS THE MENU BY NAME AND LOCALE, NOT BY THE SEED'S ID. `menu:footer_legal:en`
      // is the importer's handle; EmDash answers `/menus/footer_legal?locale=en` and 404 for the
      // other — which this loop took for "no items" and left every footer link pointing at an
      // unpublished page (measured 15/09: /terms, /privacy, /investors all 404 from the footer).
      const name = menu.name ?? String(menu.id).split(':')[1] ?? String(menu.id)
      const locale = menu.locale ?? locales[0]
      let items
      try {
        items = await menuItems(api, name, locale)
      } catch (error) {
        fail(`menu ${name}/${locale}`, error)
        continue
      }
      for (const item of items) {
        const hit =
          [...slugs].some((slug) => item.url === `/${slug}` || item.url.endsWith(`/${slug}`)) ||
          [...paths].some((p) => item.url === p || item.url.endsWith(p))
        if (!hit) continue
        try {
          const gone = await journal.mutate(
            {
              target: { kind: 'menu', menu: name, locale, id: item.id, label: item.label },
              before: item.raw,
              after: null
            },
            async () => ({ deleted: await deleteMenuItem(api, name, item.id, locale) })
          )
          if (gone.deleted) report.hidden.push({ menu: `${name}/${locale}/${item.label}` })
        } catch (error) {
          fail(`menu ${name}/${locale}/${item.label}`, error)
        }
      }
    }
  }
  await dropMenuItems(goneSlugs)
  await dropMenuItems(hiddenSlugs, gonePaths, served)

  /** One rule's demo words, every edition the seed ships (`demoWordsOf`): an answer that is one of them is not taken. */
  const isDemoOf = (rule) => demoWordsOf(rule, seed.content?.[rule.collection] ?? [])
  /** `<collection>/<slug>/<locale>` → why the model's last answer for that entry was not taken: told on the next ask. */
  const rejectedBy = new Map()
  const noteRejected = (rule, locale, out) => {
    for (const k of Object.keys(out.written ?? {})) rejectedBy.delete(k)
    for (const [slug, why] of Object.entries(out.rejected ?? {}))
      rejectedBy.set(`${rule.collection}/${slug}/${locale}`, why)
  }
  const toldOf = (rule, locale, entries) =>
    Object.fromEntries(
      entries
        .map((e) => [e.slug, rejectedBy.get(`${rule.collection}/${e.slug}/${locale}`)])
        .filter(([, why]) => typeof why === 'string')
    )
  const titlesWork = async () => {
    if (!canRewrite) return
    await eachLimit(rewritePairs(map.rewrite), CONCURRENCY, async ({ rule, locale }) => {
      const entries = entriesOf(rule, locale)
      const decides = (rule.decides ?? ['title']).filter((f) =>
        entries.some((e) => typeof e.data[f] === 'string')
      )
      if (entries.length === 0 || decides.length === 0) return
      const out = await rewriteEntries({
        model,
        rule,
        facts,
        locale,
        entries,
        only: Object.fromEntries(entries.map((e) => [e.slug, decides])),
        batch: entries.length,
        isDemo: isDemoOf(rule)
      })
      noteRejected(rule, locale, out)
      const keys = takeInto(out)
      for (const k of keys) rewritten.done.add(k)
      await flush(keys)
    })
  }
  // The labels a visitor filters by — on the list pages, next to the titles.
  /** `<taxonomy>/<slug>/<locale>` of every term label this run wrote. */
  const termsDone = new Set()
  /** One term's label, through the journaled door; `origin` says whose words they are. */
  const putTerm = async (rule, locale, slug, was, label, origin) => {
    try {
      await journal.mutate(
        {
          target: { kind: 'term', taxonomy: rule.taxonomy, term: slug, locale },
          before: { label: was },
          after: { label },
          origins: { label: origin },
          ...(origin === 'generated' ? { evidence: { label: EVIDENCE_GENERATED } } : {})
        },
        async () => {
          await api(
            'PUT',
            `/_emdash/api/taxonomies/${encodeURIComponent(rule.taxonomy)}/terms/${encodeURIComponent(slug)}?locale=${locale}`,
            { label }
          )
        }
      )
      report.terms.push(`${rule.taxonomy}/${slug}`)
      termsDone.add(`${rule.taxonomy}/${slug}/${locale}`)
    } catch (error) {
      fail(`term ${rule.taxonomy}/${slug}`, error)
    }
  }
  const termsWork = async () => {
    if (!canRewrite) return
    await eachLimit(rewritePairs(map.terms), CONCURRENCY, async ({ rule, locale }) => {
      const tax = (seed.taxonomies ?? []).find((t) => t.name === rule.taxonomy && t.locale === locale)
      if (!tax) return
      const out = await rewriteTerms({ model, rule, facts, locale, terms: tax.terms ?? [] })
      for (const [slug, label] of Object.entries(out.labels)) {
        const was = (tax.terms ?? []).find((t) => t.slug === slug)?.label ?? null
        await putTerm(rule, locale, slug, was, label, 'generated')
      }
      if (out.why) skipped.push({ rule: `terms ${rule.taxonomy} (${locale})`, why: out.why })
    })
  }
  const lane = (name, work) => work().catch((error) => fail(name, error))
  await Promise.all([lane('titles', titlesWork), lane('terms', termsWork)])

  // ── 2. Everything else, at once ──────────────────────────────────────────────────────────────
  // Four lanes side by side — the copy on the pages, the bodies of the entries, the card lists,
  // the pictures — each with its own count on the customer's task list. A picture needs only the
  // name, the sector and (for an entry) the title decided above, so it never waits for a body.
  const entryTally = { done: 0, total: 0 }
  if (canRewrite) {
    for (const { rule, locale } of rewritePairs(map.rewrite))
      entryTally.total += entriesOf(rule, locale).length
    for (const { rule, locale } of rewritePairs(map.blocks))
      if (
        !hiddenByRule.has(`${rule.collection}/${rule.slug}/${locale}`) &&
        seedEntries.some(
          (x) =>
            x.collection === rule.collection &&
            x.slug === rule.slug &&
            x.locale === locale &&
            Array.isArray(x.data[rule.field])
        )
      )
        entryTally.total += 1
    if (entryTally.total > 0) say('entries', 0, entryTally.total)
  }

  // The copy, page by page: each page is one request and goes live as soon as it is answered.
  const copyWork = async () => {
    if (!canRewrite) return
    const pages = [...new Set((map.copy ?? []).map((c) => `${c.collection}.${c.slug}`))]
    const total = (map.copy ?? []).length * locales.filter(rewritesIn).length
    let done = 0
    if (total > 0) say('words', 0, total)
    const jobs = []
    for (const locale of locales.filter(rewritesIn))
      for (const page of pages)
        if (!hiddenByRule.has(`${page.replace('.', '/')}/${locale}`)) jobs.push({ page, locale })
    await eachLimit(jobs, CONCURRENCY, async ({ page, locale }) => {
      const items = (map.copy ?? []).filter((c) => `${c.collection}.${c.slug}` === page)
      /** Buttons whose link is not known: not asked, they keep the template's action (`writeCopy`). */
      const linkless = []
      try {
        const written = await writeCopy({
          model,
          map,
          facts,
          locale,
          seedEntries,
          only: [page],
          patches,
          linkless
        })
        for (const key of linkless)
          skipped.push({
            rule: `copy ${key} (${locale})`,
            why: 'a button whose link is not known keeps the template’s words'
          })
        // Asked once more for every field that did not come back usable — the whole page answered off-key, or one answer
        // too long — shorter this time (TCH #1013: a hero rejected once was the demo's English in the hero and the meta
        // description of every second build). A field still missing after that is reported, never papered over.
        const missing = items
          .map((c) => `${c.collection}.${c.slug}.${c.field}`)
          .filter((key) => written[key] === undefined && !linkless.includes(key))
        if (missing.length > 0)
          Object.assign(
            written,
            await writeCopy({
              model,
              map,
              facts,
              locale,
              seedEntries,
              only: [page],
              keys: missing,
              again: true,
              patches
            })
          )
        const keys = []
        for (const c of items) {
          const key = `${c.collection}.${c.slug}.${c.field}`
          if (linkless.includes(key)) continue
          if (written[key] === undefined) {
            if (
              seedEntries.some(
                (x) => x.collection === c.collection && x.slug === c.slug && x.locale === locale
              )
            )
              copy.skipped.push({ field: key, locale, why: 'the model gave no usable text' })
            continue
          }
          const k = `${c.collection}/${c.slug}/${locale}`
          generated(patchOf(c.collection, c.slug, locale), c.field, written[key])
          copy.done.push({ field: key, locale })
          keys.push(k)
        }
        await flush(keys)
      } catch (e) {
        copy.skipped.push({ locale, page, why: e.message })
      }
      done += items.length
      say('words', done, total)
    })
  }

  // Whole demo entries, for the customer's sector — the titles are given, the rest is written.
  const bodiesWork = async () => {
    if (!canRewrite) return
    for (const { rule, locale } of rewritePairs(map.rewrite)) {
      const entries = entriesOf(rule, locale)
      if (entries.length === 0) continue
      const decides = rule.decides ?? ['title']
      const given = {}
      for (const e of entries) {
        const have = patches.get(`${e.collection}/${e.slug}/${locale}`)?.fields ?? {}
        const fixed = {}
        for (const f of decides) if (typeof have[f] === 'string') fixed[f] = have[f]
        if (Object.keys(fixed).length > 0) given[e.slug] = fixed
      }
      const isDemo = isDemoOf(rule)
      const out = await rewriteEntries({
        model,
        rule,
        facts,
        locale,
        entries,
        tally: entryTally,
        given,
        told: toldOf(rule, locale, entries),
        isDemo
      })
      noteRejected(rule, locale, out)
      const keys = takeInto(out)
      for (const k of keys) rewritten.done.add(k)
      rewritten.skipped.push(...out.skipped)
      await flush(keys)
      // A body that lost its outline is asked once more on its own, its part count stated; still wrong, it is left to
      // `demoWordsWork`, which puts the template's words there in the site's language, and the report says so.
      await eachLimit(out.bodyMisses ?? [], CONCURRENCY, async (slug) => {
        const e = entries.find((x) => x.slug === slug)
        if (!e) return
        const k = `${rule.collection}/${slug}/${locale}`
        const shaped = await rewriteBody({ model, rule, facts, locale, entry: e, given: given[slug] ?? null })
        if (shaped) {
          generated(patchOf(rule.collection, slug, locale), rule.body, shaped)
          retried.push(k)
          await flush([k])
        } else bodyFell.add(`${k}.${rule.body}`)
      })

      // TWO retries of what the model left behind, the second one entry at a time.
      //
      // 🔒 A BATCH LOSES ENTRIES, AND WHICH ONES IS LUCK. Asked for six entries in one JSON the
      // model answers for four; asked again for the two, it drops one. Measured 15/09 across five
      // runs — the stragglers were different every time, which is why the last round asks for ONE
      // entry with the exact fields named. A field still the demo's after that is reported, never
      // papered over.
      const stillMissing = (e) => {
        const have = patches.get(`${e.collection}/${e.slug}/${locale}`)?.fields ?? {}
        return (rule.fields ?? []).filter(
          (f) =>
            typeof e.data[f] === 'string' &&
            (have[f] === undefined || replacedOnly.has(`${e.collection}/${e.slug}/${locale}.${f}`))
        )
      }
      const missing = entries.filter((e) => stillMissing(e).length > 0)
      if (missing.length === 0) continue
      const only = Object.fromEntries(missing.map((e) => [e.slug, stillMissing(e)]))
      const take = (got) => {
        noteRejected(rule, locale, got)
        const taken = takeInto(got)
        retried.push(...taken)
        return taken
      }
      await flush(
        take(
          await rewriteEntries({
            model,
            rule,
            facts,
            locale,
            entries: missing,
            only,
            given,
            told: toldOf(rule, locale, missing),
            isDemo
          })
        )
      )
      // Round two: one entry per request, the missing fields named. Asked alone, and asked again:
      // the model drops a field at random, so a straggler gets its own request up to three times
      // before the entry is reported below.
      await eachLimit(missing, CONCURRENCY, async (e) => {
        for (let round = 0; round < 3; round += 1) {
          const left = stillMissing(e)
          if (left.length === 0) break
          await flush(
            take(
              await rewriteEntries({
                model,
                rule,
                facts,
                locale,
                entries: [e],
                only: { [e.slug]: left },
                batch: 1,
                given,
                told: toldOf(rule, locale, [e]),
                isDemo
              })
            )
          )
        }
      })
      // 🔒 WHAT DECIDES IS THE TITLE, NOT EVERY FIELD. A model that echoes `type` ("Full-time")
      // or a call-to-action has still written the entry; one that hands the demo's TITLE back
      // has not. Measured 15/09: judging on every field flagged 22 entries on a site that mostly read fine.
      // 🔒 STILL THE DEMO'S AFTER THREE ASKS, IT STAYS ON THE SITE (TCH #1013, decision A, 11/10/2026). It was unpublished:
      // one open role, one project fewer than the demo lists, the template's structure changed. It keeps the template's
      // words (renamed, as `planFrom` left it) and is named in the report, as a card-list row the model echoed is.
      // 🔒 A RULE WITH `"unwritten": "empty"` NEVER KEEPS ANOTHER COMPANY'S ENTRY (product owner, TCH #1013, L4, 11/10/2026).
      // A vacancy the model never wrote for this business kept the demo construction company's job on a bakery's /careers,
      // in Vietnamese ("Kỹ sư dự toán", "luân phiên 15/15"; measured on dev, g65, Tracy Business 1.7.13). Such an entry
      // stays on the site with the fields the rule names emptied, as `facts` empties another company's claims, never
      // invented and never the template's words; the report names it in `rewritten.emptied`, not as words kept.
      if (rule.unwritten === 'empty') {
        for (const e of missing) {
          const left = stillMissing(e)
          if (left.length === 0) continue
          const k = `${e.collection}/${e.slug}/${locale}`
          const p = patchOf(e.collection, e.slug, locale)
          for (const f of left) {
            p.fields[f] = ''
            p.origins[f] = 'removed'
            delete p.evidence[f]
            replacedOnly.delete(`${k}.${f}`)
          }
          const why = rejectedBy.get(k)
          rewritten.emptied.push({
            entry: k,
            fields: left,
            why: `not written for this business after every ask${why ? ` (${why})` : ''}: emptied, never another company's`
          })
          for (let i = rewritten.skipped.length - 1; i >= 0; i -= 1) {
            const at = String(rewritten.skipped[i].entry ?? '')
            if (at === `${e.collection}/${e.slug}` || at === k || at.startsWith(`${k}.`))
              rewritten.skipped.splice(i, 1)
          }
          await flush([k])
        }
        continue
      }
      for (const e of missing) {
        const left = stillMissing(e).filter((f) => decides.includes(f))
        if (left.length === 0) continue
        rewritten.skipped.push({
          entry: `${e.collection}/${e.slug}/${locale}`,
          why: `kept the template's words in ${left.join(', ')} after three asks`
        })
      }
    }
  }

  // The card lists that live on a page.
  const blocksWork = async () => {
    if (!canRewrite) return
    await eachLimit(rewritePairs(map.blocks), CONCURRENCY, async ({ rule, locale }) => {
      const e = seedEntries.find(
        (x) => x.collection === rule.collection && x.slug === rule.slug && x.locale === locale
      )
      if (!e || !Array.isArray(e.data[rule.field])) return
      if (hiddenByRule.has(`${rule.collection}/${rule.slug}/${locale}`)) return
      let out = await rewriteBlock({ model, rule, facts, locale, rows: e.data[rule.field] })
      if (out.rows === null)
        out = await rewriteBlock({ model, rule, facts, locale, rows: e.data[rule.field] })
      entryTally.done += 1
      say('entries', entryTally.done, entryTally.total)
      const key = `${rule.collection}/${rule.slug}/${locale}`
      if (out.rows === null) {
        rewritten.skipped.push({ entry: `${key}.${rule.field}`, why: out.why })
        return
      }
      // 🔒 A ROW THE MODEL LEFT AS THE DEMO'S IS ASKED AGAIN, NEVER DROPPED (TCH #1013, decision A, 11/10/2026). Dropping it
      // changed the template's structure (one card fewer than the demo) and, the list now shorter than the site's, put the
      // importer's photographs under the wrong captions. The rows still the demo's are asked once more on their own; a row
      // still the demo's after that keeps the template's words (renamed) and is named in the report.
      const sig = (row) => JSON.stringify(rule.itemFields.map((f) => row?.[f] ?? ''))
      const demoRows = e.data[rule.field] ?? []
      const echoed = () => out.rows.flatMap((row, i) => (sig(row) === sig(demoRows[i]) ? [i] : []))
      const again = echoed()
      if (again.length > 0) {
        const retry = await rewriteBlock({ model, rule, facts, locale, rows: again.map((i) => demoRows[i]) })
        if (retry.rows !== null)
          again.forEach((at, j) => {
            if (sig(retry.rows[j]) !== sig(demoRows[at])) out.rows[at] = retry.rows[j]
          })
      }
      const left = echoed()
      if (left.length > 0) echoedRows.set(`${key}.${rule.field}`, left)
      if (left.length > 0)
        rewritten.skipped.push({
          entry: `${key}.${rule.field}`,
          why: `${String(left.length)} row(s) kept the template's words after two asks`
        })
      generated(patchOf(rule.collection, rule.slug, locale), rule.field, out.rows)
      rewritten.done.add(`${key}.${rule.field}`)
      await flush([key])
    })
  }

  // ── The pictures ─────────────────────────────────────────────────────────────────────────────
  // A page picture needs the name and the sector; an entry's picture also wants the title decided
  // in phase 1, so it shows that project and not "a project". Neither waits for a body. The
  // fields live on the SITE (the template's importer put the demo's photographs there), not in
  // the seed.
  const picturesWork = async () => {
    const images = map.images ?? {}
    const wantPictures = model && (facts.name || facts.about) && !NO_IMAGES
    if (!wantPictures) {
      pictures.skipped.push({
        why: NO_IMAGES ? '--no-images' : model ? 'no name and no description in the answers' : 'no model key'
      })
      return
    }
    // About left blank keeps the template's pictures (ABOUT-3): only a redraw the customer asked for is drawn.
    if (!redrawOnly && !modelMay('pictures', locales[0], facts)) {
      pictures.skipped.push({ why: 'About left blank: the template’s pictures stay' })
      return
    }
    if (!model.imageModel) {
      pictures.skipped.push({
        why: 'this model key writes words only (an image model needs OPENROUTER_API_KEY)'
      })
      return
    }
    /**
     * One picture: drawn ONCE, uploaded once, and written into the field of every locale the
     * customer kept — a photograph has no language, and drawing it per locale doubled the bill
     * on a two-language site (15/09). A locale whose entry has no such field is left alone.
     */
    const placeOne = async (collection, slug, field, what) => {
      const key = `${collection}/${slug}.${field}`
      /** @type {string[]} the locales whose entry carries this field */
      const carrying = []
      for (const locale of locales) {
        try {
          const live = await liveEntry(api, collection, slug, locale)
          if (live && live.data[field] !== undefined && live.data[field] !== null) carrying.push(locale)
        } catch {
          // no entry in this locale: nothing to place there
        }
      }
      if (carrying.length === 0) return
      let drawn
      try {
        drawn = await drawPicture({ model, style: images.style, what, facts, redraw: redrawOnly })
      } catch (error) {
        pictures.skipped.push({ field: key, why: error.message })
        return
      }
      if (!drawn) {
        pictures.skipped.push({ field: key, why: 'the model returned no picture' })
        return
      }
      try {
        const value = await uploadPicture(api, token, {
          ...drawn,
          filename: `${slug}-${field}.${drawn.mime.split('/')[1] ?? 'png'}`,
          alt: facts.name ?? ''
        })
        const keys = []
        for (const locale of carrying) {
          generated(patchOf(collection, slug, locale), field, value)
          keys.push(`${collection}/${slug}/${locale}`)
        }
        pictures.done.push(key)
        await flush(keys)
      } catch (error) {
        pictures.skipped.push({ field: key, why: error.message })
      }
    }
    // 🔒 A REDRAW ASKS FOR ONE PICTURE, NOT THIRTEEN. When the customer tells the agent in the
    // chat "make the home picture bread, not a factory", the agent reruns this stage with
    // `pictures: {"home.hero_image": "loaves fresh from the oven"}` — and only that field is
    // drawn. Without this the answer to one sentence would be a new set of photographs.
    const asked = redrawOnly ? /** @type {Record<string, unknown>} */ (answers.pictures) : null
    /** @type {Array<[string, string, string, string]>} every picture this run draws, once each */
    const wanted = []
    if (asked !== null) {
      for (const [where, what] of Object.entries(asked)) {
        const spot = pictureSpot(where, images, seedEntries)
        if (spot === null) {
          pictures.skipped.push({ field: where, why: 'no picture on this page goes by that name' })
          continue
        }
        const text = typeof what === 'string' && what.trim() !== '' ? what.trim() : spot.what
        wanted.push([spot.collection, spot.slug, spot.field, text])
      }
    }
    // A page a `hide` rule names is not drawn for: the picture would be written to it and publish it again.
    for (const t of asked === null ? (images.targets ?? []) : [])
      if (!hiddenByRule.has(`${t.collection}/${t.slug}/${locales[0]}`))
        wanted.push([t.collection, t.slug, t.field, t.what])
    for (const rule of asked === null ? (images.entries ?? []) : []) {
      // The entries of the first kept locale name the pictures; the same slugs exist in every
      // locale. An entry the bodies lane later gives up on keeps the template's title under its new
      // picture — cheaper than every picture waiting for every body.
      const first = locales[0]
      const rows = entriesOf(rule, first).slice(0, rule.limit ?? 3)
      for (const e of rows) {
        const title = patches.get(`${e.collection}/${e.slug}/${first}`)?.fields?.title
        const what = typeof title === 'string' ? `${rule.what} — the one titled "${title}"` : rule.what
        wanted.push([e.collection, e.slug, rule.field, what])
      }
    }
    const tally = { done: 0, total: wanted.length }
    if (wanted.length > 0) say('pictures', 0, wanted.length)
    await eachLimit(wanted, CONCURRENCY, async (one) => {
      try {
        await placeOne(...one)
      } finally {
        tally.done += 1
        say('pictures', tally.done, tally.total)
      }
    })
  }

  // The enquiry form's own words.
  const formsWork = async () => {
    if (redrawOnly) return
    await eachLimit(pairs(map.forms), CONCURRENCY, async ({ rule, locale }) => {
      const changed = await personaliseForm(api, { model, rule, facts, locale, journal })
      if (changed.slug) report.forms.push(changed.slug)
      if (changed.why) {
        const row = { rule: `form ${rule.slug}-${locale}`, why: changed.why }
        if (changed.error) report.errors.push(row)
        else skipped.push(row)
      }
    })
  }

  // The chrome's own words — the menu, the header and footer labels — when the root is written in another language
  // (`chromeLabelsOf`, TCH #1013). One question per locale, asked from the seed so the warm-up asks it too; the entry
  // fields go through the road every other field takes, the menu items through `menuLabel` (journaled, revertible).
  const labelsWork = async () => {
    if (redrawOnly) return
    for (const locale of locales) {
      const other = writtenOtherThan(locale, writtenAs)
      if (other === null) continue
      const chromeLabels = chromeLabelsOf({ map, seedEntries, locale, patches })
      // The switcher names the root's language in itself, decided by the answer, not by a model.
      const named = nativeLanguageName(other)
      const keys = []
      if (named)
        for (const e of seedEntries)
          if (
            e.locale === locale &&
            typeof e.data[LANGUAGE_NAME_FIELD] === 'string' &&
            isChromeEntry(map, e)
          ) {
            const p = patchOf(e.collection, e.slug, locale)
            p.fields[LANGUAGE_NAME_FIELD] = named
            p.origins[LANGUAGE_NAME_FIELD] = 'customer'
            keys.push(`${e.collection}/${e.slug}/${locale}`)
          }
      // The sample pages the template has no edition of in that language (`planFrom` `samples.translate`): their words.
      const sampleWords = samples.translate
        .filter((k) => k.endsWith(`/${locale}`))
        .flatMap((k) => {
          const [collection, slug] = k.split('/')
          const same = seedEntries.filter((e) => e.collection === collection && e.slug === slug)
          const root = same.find((e) => e.locale === locale)
          if (!root) return []
          const p = patches.get(k)
          const data = { ...root.data, ...p?.fields }
          const others = same.filter((e) => e !== root).map((e) => e.data)
          return sampleLeavesOf(data, others).map((l, i) => ({ id: `sample.${k}.${String(i)}`, k, ...l }))
        })
      if (!canWrite) {
        for (const k of new Set(sampleWords.map((w) => w.k)))
          skipped.push({
            rule: `sample ${k}`,
            why: `the template ships no ${languageName(other)} edition of this sample page and no model can translate it: it keeps the template's words`
          })
        await flush(keys)
        continue
      }
      const menus = menuLabelsOf(seed, locale)
      const asked = Object.fromEntries([
        ...chromeLabels.map((l) => [l.id, l.text]),
        ...sampleWords.map((w) => [w.id, w.text]),
        ...menus.map((label, i) => [`menu.${String(i)}`, label])
      ])
      let got = {}
      const kept = []
      try {
        got = await translateLabels({ model, locale, labels: asked, facts, kept })
      } catch (error) {
        skipped.push({ rule: `labels (${locale})`, why: error.message })
      }
      // One page, one name: a label that names a page already named takes that name (`oneLabelPerDestination`).
      const rowOf = (l) => {
        const k = `${l.collection}/${l.slug}/${locale}`
        const p = patches.get(k)
        const rows =
          p?.fields?.[l.field] !== undefined
            ? p.fields[l.field]
            : seedEntries.find((e) => `${e.collection}/${e.slug}/${e.locale}` === k)?.data[l.field]
        return Array.isArray(rows) ? rows[l.index ?? -1] : undefined
      }
      got = oneLabelPerDestination(labelDestinations({ seed, locale, menus, chromeLabels, rowOf }), got)
      // A label that took the page's name is no longer one left in the template's words.
      for (let i = kept.length - 1; i >= 0; i -= 1) {
        const id = kept[i]
        if (
          typeof got[id] === 'string' &&
          got[id] !== asked[id] &&
          wordsLeft(asked[id], got[id]).length === 0
        )
          kept.splice(i, 1)
      }
      const keptWhy = keptLabelsWhy(kept, asked, languageName(other))
      if (keptWhy !== null) skipped.push({ rule: `labels (${locale})`, why: keptWhy })
      // Entry labels, a field at a time: a list keeps every row and every key it had, only the words change.
      /** @type {Map<string, Record<string, any>>} */
      const next = new Map()
      for (const l of chromeLabels) {
        const to = got[l.id]
        if (to === undefined || to === l.text) continue
        const k = `${l.collection}/${l.slug}/${locale}`
        const fields = next.get(k) ?? {}
        next.set(k, fields)
        if (l.prop === undefined) {
          fields[l.field] = to
          continue
        }
        const p = patches.get(k)
        const base =
          fields[l.field] ??
          (p?.fields?.[l.field] !== undefined
            ? p.fields[l.field]
            : seedEntries.find(
                (e) => e.collection === l.collection && e.slug === l.slug && e.locale === locale
              )?.data[l.field])
        const rows = Array.isArray(base)
          ? base.map((row) => (row && typeof row === 'object' ? { ...row } : row))
          : []
        if (rows[l.index] && typeof rows[l.index] === 'object') rows[l.index][l.prop] = to
        fields[l.field] = rows
      }
      // Sample words, a leaf at a time: every other value of the page stays as the template has it.
      for (const w of sampleWords) {
        const to = got[w.id]
        if (to === undefined || to === w.text) continue
        const [field, ...rest] = w.path
        const fields = next.get(w.k) ?? {}
        next.set(w.k, fields)
        const p = patches.get(w.k)
        const base =
          fields[field] ??
          (p?.fields?.[field] !== undefined
            ? p.fields[field]
            : seedEntries.find((e) => `${e.collection}/${e.slug}/${e.locale}` === w.k)?.data[field])
        fields[field] = withLeaf(base, rest, to)
      }
      for (const [k, fields] of next) {
        const [collection, slug] = k.split('/')
        const p = patchOf(collection, slug, locale)
        for (const [f, v] of Object.entries(fields)) generated(p, f, v)
        keys.push(k)
        report.labels.push(...Object.keys(fields).map((f) => `${k}.${f}`))
      }
      await flush(keys)
      // Menu items, by the label the seed gave them; an item the site holds under another label is somebody's already.
      const renames = new Map()
      menus.forEach((label, i) => {
        const to = got[`menu.${String(i)}`]
        if (to !== undefined && to !== label) renames.set(label, to)
      })
      if (renames.size === 0) continue
      const names = [
        ...new Set(
          (seed.menus ?? [])
            .filter((m) => (m.locale ?? seed.defaultLocale ?? 'en') === locale)
            .map((m) => m.name ?? String(m.id).split(':')[1] ?? String(m.id))
        )
      ]
      for (const name of names) {
        let items
        try {
          items = await menuItems(api, name, locale)
        } catch (error) {
          fail(`menu ${name}/${locale}`, error)
          continue
        }
        await eachLimit(items, CONCURRENCY, async (item) => {
          const to = renames.get(item.label.trim())
          if (to === undefined) return
          try {
            await menuLabel(api, { menu: name, locale, item, label: to, journal })
            report.labels.push(`menu ${name}/${locale}/${item.label}`)
          } catch (error) {
            fail(`menu ${name}/${locale}/${item.label}`, error)
          }
        })
      }
    }
  }

  await Promise.all([
    lane('copy', copyWork),
    lane('labels', labelsWork),
    lane('bodies', bodiesWork),
    lane('blocks', blocksWork),
    lane('pictures', picturesWork),
    lane('forms', formsWork)
  ])

  // ── 2b. The template's words, in the language the root is written in ─────────────────────────
  // 🔒 A FALLBACK IS NEVER IN ANOTHER LANGUAGE (TCH #1013, LANG-2, g60). A field the model did not write keeps the
  // template's words, and on a root written in another language those words were English: /terms and /privacy of a
  // Vietnamese site read a Vietnamese lede over the demo's English body (measured 10/10/2026 on g59-biz-emd-full, the model
  // one part short), and a BLANK site in Vietnamese was rewritten from the name alone because nothing else could put the
  // demo's words in Vietnamese. Every field the word lanes own that no model wrote takes the template's own edition of that
  // language when the seed ships one (the demo's words, renamed), else the template's words translated part by part (an
  // outline kept: headings stay headings, list items list items). Said in the report, field by field.
  const demoWordsWork = async () => {
    if (redrawOnly) return
    // A root in its own language keeps the template's body as it is: said, once per body.
    for (const k of bodyFell) {
      const locale = k.split('.')[0].split('/')[2]
      if (writtenOtherThan(locale, writtenAs) === null)
        rewritten.skipped.push({
          entry: k,
          why: 'the model did not answer one part per part of the body, twice: the template’s body stays, renamed'
        })
    }
    for (const locale of locales) {
      // A shipped edition needs no model; a translation does (`translatesIn`, the gate's `labels` step).
      if (writtenOtherThan(locale, writtenAs) === null) continue
      const other = /** @type {string} */ (writtenOtherThan(locale, writtenAs))
      const named = languageName(other)
      const writing = rewritesIn(locale)
      const primaryOf = (l) => String(l).toLowerCase().split('-')[0]
      const editionOf = (collection, slug) =>
        seedEntries.find(
          (e) =>
            e.collection === collection &&
            e.slug === slug &&
            e.locale !== locale &&
            e.locale.toLowerCase() === other.toLowerCase()
        ) ??
        seedEntries.find(
          (e) =>
            e.collection === collection &&
            e.slug === slug &&
            e.locale !== locale &&
            primaryOf(e.locale) === primaryOf(other)
        ) ??
        null
      /** @type {Array<{ e: any, field: string, kind: 'text' | 'rows' | 'body', keys?: string[], kept?: boolean }>} */
      const targets = []
      const rootOf = (collection, slug) =>
        seedEntries.find((x) => x.collection === collection && x.slug === slug && x.locale === locale)
      for (const c of map.copy ?? []) {
        const e = rootOf(c.collection, c.slug)
        if (e && typeof e.data[c.field] === 'string') targets.push({ e, field: c.field, kind: 'text' })
      }
      for (const r of map.rewrite ?? [])
        for (const e of entriesOf(r, locale)) {
          // A rule that keeps the template's words: no model was asked, so the report says nothing about it.
          const kept = r.keep === true
          for (const f of r.fields ?? [])
            if (typeof e.data[f] === 'string') targets.push({ e, field: f, kind: 'text', kept })
          for (const [f, itemKey] of Object.entries(r.lists ?? {}))
            if (Array.isArray(e.data[f]))
              targets.push({ e, field: f, kind: 'rows', keys: [String(itemKey)], kept })
          if (r.body && Array.isArray(e.data[r.body])) targets.push({ e, field: r.body, kind: 'body', kept })
        }
      for (const b of map.blocks ?? []) {
        const e = rootOf(b.collection, b.slug)
        if (e && Array.isArray(e.data[b.field]))
          targets.push({ e, field: b.field, kind: 'rows', keys: b.itemFields ?? [] })
      }
      /** @type {Map<string, string>} leaf id → the template's words to translate */
      const leaves = new Map()
      /** @type {Array<{ e: any, field: string, kind: string, keys?: string[], base: any, rows?: number[], kept?: boolean }>} */
      const toTranslate = []
      let fromEdition = 0
      const keys = []
      const said = (k, field, how, kept = false) => {
        if (!writing || kept) return
        rewritten.skipped.push({ entry: `${k}.${field}`, why: how })
        // A copy field said here is no longer a line left in the template's language.
        const key = `${k.split('/')[0]}.${k.split('/')[1]}.${field}`
        for (let i = copy.skipped.length - 1; i >= 0; i -= 1)
          if (copy.skipped[i].field === key && copy.skipped[i].locale === locale) copy.skipped.splice(i, 1)
      }
      for (const t of targets) {
        const k = `${t.e.collection}/${t.e.slug}/${locale}`
        if (hiddenByRule.has(k)) continue
        const p = patchOf(t.e.collection, t.e.slug, locale)
        const origin = p.origins[t.field]
        const echoed = echoedRows.get(`${k}.${t.field}`) ?? null
        if (origin === 'generated' && echoed === null) continue
        if (origin !== undefined && origin !== 'replaced' && origin !== 'generated') continue
        const edition = editionOf(t.e.collection, t.e.slug)
        const borrowed = borrowedLabels.find((b) => b.entry === k && b.field === t.field)
        let value
        if (edition && borrowed) {
          const from = editionOf(borrowed.from.collection, borrowed.from.slug)
          const words = from?.data?.[borrowed.from.field]
          if (typeof words === 'string') value = replaceDeep(words, nameRules, t.field)
        } else if (edition && edition.data[t.field] !== undefined)
          value = replaceDeep(edition.data[t.field], nameRules, t.field)
        if (value !== undefined && echoed !== null && Array.isArray(value)) {
          // Only the rows the model left as the demo's take the edition's: the rest are the model's.
          const rows = [...p.fields[t.field]]
          for (const i of echoed) if (value[i] !== undefined) rows[i] = { ...rows[i], ...value[i] }
          value = rows
        }
        if (value !== undefined) {
          p.fields[t.field] = value
          if (origin !== 'generated') p.origins[t.field] = 'replaced'
          keys.push(k)
          fromEdition += 1
          said(
            k,
            t.field,
            `the model wrote no usable words: the template’s ${named} edition stands, renamed`,
            t.kept
          )
          continue
        }
        const base = p.fields[t.field] !== undefined ? p.fields[t.field] : t.e.data[t.field]
        const at = toTranslate.length
        const id = (rest) => `w${String(at)}.${rest}`
        if (t.kind === 'text') {
          if (typeof base === 'string' && /\p{L}/u.test(base)) leaves.set(id('t'), base)
        } else if (t.kind === 'rows') {
          const rows = Array.isArray(base) ? base : []
          rows.forEach((row, i) => {
            if (echoed !== null && !echoed.includes(i)) return
            for (const key of t.keys ?? [])
              if (typeof row?.[key] === 'string' && /\p{L}/u.test(row[key]))
                leaves.set(id(`${String(i)}.${key}`), row[key])
          })
        } else if (Array.isArray(base))
          base.forEach((b, i) => {
            if (b?._type !== 'block') return
            const text = (Array.isArray(b.children) ? b.children : [])
              .map((c) => String(c?.text ?? ''))
              .join('')
            if (/\p{L}/u.test(text)) leaves.set(id(`b${String(i)}`), text)
          })
        toTranslate.push({ ...t, base })
      }
      let got = {}
      if (leaves.size > 0 && !translatesIn(locale))
        skipped.push({
          rule: `words (${locale})`,
          why: `the template ships no ${named} edition of ${String(toTranslate.length)} field(s) and no model can translate them: they keep the template’s words`
        })
      else if (leaves.size > 0) {
        const kept = []
        try {
          got = await translateLabels({
            model,
            locale,
            labels: Object.fromEntries(leaves),
            facts,
            prose: true,
            kept
          })
        } catch (error) {
          skipped.push({ rule: `words (${locale})`, why: error.message })
        }
        const keptWhy = keptLabelsWhy(kept, Object.fromEntries(leaves), named)
        if (keptWhy !== null) skipped.push({ rule: `words (${locale})`, why: keptWhy })
      }
      let translated = 0
      toTranslate.forEach((t, at) => {
        const k = `${t.e.collection}/${t.e.slug}/${locale}`
        const p = patchOf(t.e.collection, t.e.slug, locale)
        const mine = [...leaves.keys()].filter((id) => id.startsWith(`w${String(at)}.`))
        if (mine.length === 0) return
        const missing = mine.filter((id) => got[id] === undefined)
        let value
        if (t.kind === 'text') value = got[`w${String(at)}.t`]
        else if (t.kind === 'rows')
          value = t.base.map((row, i) => {
            const next = { ...row }
            for (const key of t.keys ?? []) {
              const to = got[`w${String(at)}.${String(i)}.${key}`]
              if (to !== undefined) next[key] = to
            }
            return next
          })
        else {
          const outline = t.base.flatMap((b, i) =>
            got[`w${String(at)}.b${String(i)}`] !== undefined ? [{ at: i }] : []
          )
          value =
            outline.length > 0
              ? bodyFromOutline(
                  t.base,
                  outline,
                  outline.map((o) => got[`w${String(at)}.b${String(o.at)}`])
                )
              : undefined
        }
        if (missing.length > 0)
          rewritten.skipped.push({
            entry: `${k}.${t.field}`,
            why: `${String(missing.length)} of ${String(mine.length)} part(s) could not be put in ${named}: they keep the template’s words`
          })
        if (value === undefined || value === null) return
        generated(p, t.field, value)
        keys.push(k)
        translated += 1
        said(
          k,
          t.field,
          `the model wrote no usable words: the template’s words, translated into ${named}`,
          t.kept
        )
      })
      // The labels a visitor filters by: the template's edition of that language, else translated.
      for (const rule of map.terms ?? []) {
        const tax = (seed.taxonomies ?? []).find((t) => t.name === rule.taxonomy && t.locale === locale)
        if (!tax) continue
        const left = (tax.terms ?? []).filter((t) => !termsDone.has(`${rule.taxonomy}/${t.slug}/${locale}`))
        if (left.length === 0) continue
        const edition = (seed.taxonomies ?? []).find(
          (t) => t.name === rule.taxonomy && t.locale !== locale && primaryOf(t.locale) === primaryOf(other)
        )
        let labels = {}
        let origin = 'replaced'
        if (edition)
          for (const t of left) {
            const own = (edition.terms ?? []).find((x) => x.slug === t.slug)?.label
            if (typeof own === 'string') labels[t.slug] = replaceDeep(own, nameRules, 'label')
          }
        else if (translatesIn(locale))
          try {
            origin = 'generated'
            labels = await translateLabels({
              model,
              locale,
              labels: Object.fromEntries(left.map((t) => [t.slug, t.label])),
              facts
            })
          } catch (error) {
            skipped.push({ rule: `terms ${rule.taxonomy} (${locale})`, why: error.message })
          }
        for (const t of left) {
          const label = labels[t.slug]
          if (typeof label !== 'string' || label === t.label) continue
          await putTerm(rule, locale, t.slug, t.label, label, origin)
          if (origin === 'replaced') fromEdition += 1
          else translated += 1
        }
      }
      await flush(keys)
      if (!writing && fromEdition + translated > 0)
        skipped.push({
          rule: `words (${locale})`,
          why: `About left blank: the template’s words stand in ${named}, ${String(fromEdition)} from its own ${named} edition and ${String(translated)} translated`
        })
    }
  }
  await lane('words', demoWordsWork)

  // ── 3. What needed the words: settings copied from the copy, and the receipts ────────────────
  for (const [k, spec] of Object.entries(map.copySettings ?? {})) {
    const [collection, slug, field] = String(spec.from).split('.')
    const v = patches.get(`${collection}/${slug}/${locales[0]}`)?.fields?.[field]
    if (typeof v === 'string') settings[k] = v
  }
  if (Object.keys(settings).length > 0) {
    const fingerprint = hashOf(settings)
    if (receipts.settings?.hash === fingerprint) unchanged.add('settings')
    else {
      try {
        await postSettings(settings, 'copy')
        receipts.settings = { ...receipts.settings, hash: fingerprint, at: new Date().toISOString() }
        const had = report.written.find((w) => w.entry === 'settings')
        if (had) had.fields = Object.keys(settings)
        else report.written.push({ entry: 'settings', fields: Object.keys(settings) })
      } catch (error) {
        fail('settings', error)
      }
    }
  }
  report.settings = Object.keys(settings)
  // The brand pictures, last: every other write to the chrome entry has landed, so this one does not race them.
  if (Object.keys(brand.pictures).length > 0) {
    const out = await writeBrand({
      api,
      token,
      journal,
      map,
      seed,
      pictures: brand.pictures,
      name: facts.name ?? null,
      fail
    })
    report.brand = { written: out.written, skipped: [...brand.skipped, ...out.skipped] }
  }
  for (const [entry, fields] of wrote) report.written.push({ entry, fields: [...fields] })
  for (const [entry, fields] of invented) report.generated.push({ entry, fields: [...fields] })
  report.unchanged = [...unchanged].filter((k) => !wrote.has(k))
  report.editor = [...editor]
  report.rewritten = {
    done: rewritten.done.size,
    retried: retried.length,
    skipped: rewritten.skipped,
    emptied: rewritten.emptied
  }
  report.pictures = { done: pictures.done.length, skipped: pictures.skipped }
  journal.append({ phase: 'done', written: report.written.length, errors: report.errors.length })
  mkdirSync(path.dirname(RECEIPTS_FILE), { recursive: true })
  writeFileSync(RECEIPTS_FILE, `${JSON.stringify(receipts, null, 2)}\n`)
  return finish(report)
}

// ───────────────────────── inspect · revert ─────────────────────────
/** The site's current value of what one journaled mutation wrote: `same`, `edited` or `gone`. */
/**
 * Whether the site still holds what a mutation wrote.
 *
 * 🔒 A PICTURE IS ITS MEDIA ID. EmDash stores an image field in its own shape — it drops keys this
 * tool sent and adds its own — so comparing the whole object read every drawn picture as
 * "edited" (26 of 26 on a two-language build, 25/09/2026) and refused every revert. Two image
 * values with the same media `id` are the same picture.
 */
export function sameValue(a, b) {
  const isMedia = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.id === 'string'
  if (isMedia(a) && isMedia(b)) return a.id === b.id
  // A core media setting (`settings.logo`, `settings.favicon`) is written `{ mediaId, alt }` and read back with the
  // resolved URL and size added: the same picture is the same `mediaId`.
  const isRef = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.mediaId === 'string'
  if (isRef(a) && isRef(b)) return a.mediaId === b.mediaId
  return JSON.stringify(withoutRowIds(a) ?? null) === JSON.stringify(withoutRowIds(b) ?? null)
}

/**
 * A repeater value without the `_rowId` the site stamps on every stored row.
 *
 * 🔒 A ROW ID IS NOT CONTENT. The Content API gives each repeater row an identity by stamping
 * `_rowId` into the stored row (tools/content-api/identity-sqlite.mjs). Rows this tool writes
 * without one read back with one; compared whole they would read as "edited" and refuse the
 * revert, and a receipt would read as an editor's change.
 */
export function withoutRowIds(v) {
  if (!Array.isArray(v)) return v
  return v.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !('_rowId' in row)) return row
    const { _rowId, ...rest } = row
    return rest
  })
}
const bareFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, withoutRowIds(v)]))

async function liveOf(api, m) {
  const t = m.target
  const same = sameValue
  try {
    if (t.kind === 'entry') {
      const live = await liveEntry(api, t.collection, t.slug, t.locale)
      if (live === null) return () => 'gone'
      return (field) => (same(live.data[field], m.after?.[field]) ? 'same' : 'edited')
    }
    if (t.kind === 'publish' || t.kind === 'unpublish') {
      const live = await liveEntry(api, t.collection, t.slug, t.locale)
      if (live === null) return () => 'gone'
      const want = t.kind === 'publish' ? 'published' : 'draft'
      return () => ((live.item.status === 'published' ? 'published' : 'draft') === want ? 'same' : 'edited')
    }
    if (t.kind === 'settings') {
      const got = await api('GET', '/_emdash/api/settings')
      // A group (`seo`) is compared on the keys this run wrote: the rest of it was never this run's.
      const group = (field, after) =>
        Object.keys(after).every((k) => same(got?.[field]?.[k] ?? null, after[k] ?? null))
      return (field) => {
        const after = m.after?.[field]
        const isGroup = field === 'seo' && after && typeof after === 'object'
        return (isGroup ? group(field, after) : same(got?.[field], after)) ? 'same' : 'edited'
      }
    }
    if (t.kind === 'file') {
      let now = null
      try {
        now = existsSync(DISPLAY_FILE) ? JSON.parse(readFileSync(DISPLAY_FILE, 'utf8')) : null
      } catch {}
      return () => (canonical(now ?? {}) === canonical(m.after ?? {}) ? 'same' : 'edited')
    }
    if (t.kind === 'menu') {
      const items = await menuItems(api, t.menu, t.locale)
      return () => (items.some((i) => i.id === String(t.id)) ? 'edited' : 'same')
    }
    if (t.kind === 'menu-label') {
      const item = (await menuItems(api, t.menu, t.locale)).find((i) => i.id === String(t.id))
      if (!item) return () => 'gone'
      return () => (item.label === m.after?.label ? 'same' : 'edited')
    }
  } catch (error) {
    if (error.status === 404) return () => 'gone'
    throw error
  }
  // terms and forms: no cheap read that names one — reported as written, not compared
  return () => 'unknown'
}

/** Which field of which thing one journaled mutation wrote — the key two writes of the same field share. */
export function fieldKey(target, field) {
  const t = target ?? {}
  const where =
    t.kind === 'entry' || t.kind === 'publish' || t.kind === 'unpublish'
      ? `entry:${t.collection}/${t.slug}/${t.locale}`
      : t.kind === 'menu' || t.kind === 'menu-label'
        ? `menu:${t.menu}/${t.locale}/${t.id}`
        : t.kind === 'term'
          ? `term:${t.taxonomy}/${t.term}/${t.locale}`
          : t.kind === 'form'
            ? `form:${t.form}`
            : t.kind === 'file'
              ? `file:${t.file}`
              : t.kind === 'field'
                ? `field:${t.collection}.${t.field}`
                : String(t.kind)
  // publish and unpublish are the same switch; a field of an entry is its own
  const what = t.kind === 'publish' || t.kind === 'unpublish' ? 'status' : String(field)
  return `${where}#${what}`
}

/** The fields one mutation wrote, as `--inspect` lists them (`null` for a whole-thing mutation). */
const fieldsOfMutation = (m) =>
  m.target.kind === 'entry' || m.target.kind === 'settings'
    ? Object.keys(m.after ?? {})
    : m.target.kind === 'term' || m.target.kind === 'menu-label'
      ? ['label']
      : [null]

/**
 * The rows `--inspect` prints: one per field of every `ok` mutation, newest run last.
 *
 * 🔒 A FIELD WRITTEN TWICE IS COMPARED ONCE. One run writes `home.title` with the brand swapped,
 * then again with the model's words; a later run writes it once more. Only the LAST write of a
 * field is compared with the site — the earlier ones are `superseded`, not `edited`: reading the
 * first write against the live value would call the tool's own second write an editor, and
 * refuse every revert of a run that had a model.
 */
async function inspectRows(api, lines, applyIds) {
  const all = []
  for (const applyId of applyIds) for (const m of mutationsOf(lines, applyId)) all.push({ applyId, m })
  const last = new Map()
  all.forEach(({ m }, i) => {
    for (const field of fieldsOfMutation(m)) last.set(fieldKey(m.target, field), i)
  })
  const rows = []
  for (const [i, { applyId, m }] of all.entries()) {
    const fields = fieldsOfMutation(m)
    const current = fields.some((field) => last.get(fieldKey(m.target, field)) === i)
    const live = current ? await liveOf(api, m) : () => 'superseded'
    for (const field of fields)
      rows.push({
        applyId,
        target: field === null ? m.target : { ...m.target, field },
        origin: field === null ? (m.origins?.status ?? null) : (m.origins?.[field] ?? null),
        ...(field !== null && m.evidence?.[field] ? { evidence: m.evidence[field] } : {}),
        before: field === null ? (m.before ?? null) : (m.before?.[field] ?? null),
        after: field === null ? (m.after ?? null) : (m.after?.[field] ?? null),
        rev: m.rev ?? null,
        live: last.get(fieldKey(m.target, field)) === i ? live(field) : 'superseded'
      })
  }
  return rows
}

async function inspect() {
  const token = existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : ''
  if (!/^ec_pat_[A-Za-z0-9_-]{16,}$/.test(token)) {
    console.error(`no agent token at ${TOKEN_FILE}`)
    process.exit(1)
  }
  const api = makeApi(token)
  const lines = readJournal(JOURNAL_FILE)
  const applyIds = applyIdsOf(lines)
  const runs = applyIds.filter((id) => !id.endsWith('-revert'))
  const out = {
    applyIds,
    latest: runs.at(-1) ?? null,
    fields: await inspectRows(api, lines, applyIds)
  }
  if (JSON_OUT) console.log(JSON.stringify(out))
  else {
    console.log(`personalize: ${String(applyIds.length)} run(s), latest ${out.latest ?? 'none'}`)
    for (const f of out.fields)
      console.log(
        `  · ${f.applyId} ${f.target.kind} ${[f.target.collection, f.target.slug, f.target.locale, f.target.field].filter(Boolean).join('/')}${f.origin ? ` [${f.origin}]` : ''}: ${f.live}`
      )
  }
  process.exitCode = 0
}

/**
 * Put the latest run's `before` values back, newest mutation first.
 *
 * 🔒 ONLY THE LATEST RUN, AND ONLY WHILE NOBODY EDITED SINCE. Reverting an older run would put
 * back values a later run has already replaced; reverting over an editor's change would throw
 * their work away under the name of "undo". Both are refused with the field named, before any
 * call — a revert that stops halfway leaves a site that is neither.
 */
async function revert(applyId) {
  const say = (out, code) => {
    if (JSON_OUT) console.log(JSON.stringify(out))
    else
      console.log(
        out.ok
          ? `personalize: reverted ${applyId} (${String(out.reverted)} steps)`
          : `personalize: revert refused — ${out.why}`
      )
    process.exitCode = code
  }
  const token = existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : ''
  if (!/^ec_pat_[A-Za-z0-9_-]{16,}$/.test(token)) {
    console.error(`no agent token at ${TOKEN_FILE}`)
    process.exit(1)
  }
  const api = makeApi(token)
  const lines = readJournal(JOURNAL_FILE)
  const runs = applyIdsOf(lines).filter((id) => !id.endsWith('-revert'))
  const latest = runs.at(-1) ?? null
  if (applyId !== latest)
    return say({ ok: false, why: `only the latest run can be reverted, and that is ${latest ?? 'none'}` }, 4)
  if (lines.some((l) => l.applyId === `${applyId}-revert` && l.phase === 'done'))
    return say({ ok: false, why: `${applyId} was already reverted` }, 4)
  const mutations = mutationsOf(lines, applyId)
  const rows = await inspectRows(api, lines, [applyId])
  const touched = rows.find((r) => r.live === 'edited' || r.live === 'gone')
  if (touched)
    return say(
      {
        ok: false,
        why: `${touched.target.kind} ${[touched.target.collection, touched.target.slug, touched.target.locale, touched.target.field, touched.target.menu, touched.target.id].filter(Boolean).join('/')} was ${touched.live} since ${applyId}`
      },
      4
    )
  // A menu item can only come back with a destination; said before the first call, not at step 9.
  for (const m of mutations)
    if (m.target.kind === 'menu' && menuItemPayload(m.before) === null)
      return say(
        {
          ok: false,
          why: `menu item ${m.target.menu}/${m.target.locale}/${m.target.label ?? m.target.id} cannot be re-created: the journal holds no destination for it`
        },
        4
      )
  const journal = openJournal(JOURNAL_FILE, `${applyId}-revert`, mutations[0]?.requestId ?? null)
  journal.append({ phase: 'run', mode: { revertOf: applyId } })
  const done = []
  for (const m of [...mutations].reverse()) {
    const t = m.target
    try {
      await journal.mutate({ target: t, before: m.after, after: m.before, rev: null }, async () => {
        if (t.kind === 'entry') {
          const live = await liveEntry(api, t.collection, t.slug, t.locale)
          if (live === null) throw new Error('the site has no such entry')
          const data = { ...live.data }
          // 🔒 A FIELD THAT HELD NOTHING IS WRITTEN BACK AS NULL, NOT LEFT OUT: EmDash keeps a field's column as it is when
          // the data names no value for it, so a field left out kept what this run wrote (the dark logo, T22).
          for (const [f, v] of Object.entries(m.before ?? {})) {
            if (v === undefined) delete data[f]
            else data[f] = v
          }
          await api('PUT', `/_emdash/api/content/${t.collection}/${live.item.id}?locale=${t.locale}`, {
            data,
            _rev: live.rev
          })
          return publishEntry(api, t.collection, live.item.id, t.locale)
        }
        if (t.kind === 'settings') {
          await api('POST', '/_emdash/api/settings', m.before ?? {})
          return {}
        }
        if (t.kind === 'unpublish') return publishEntry(api, t.collection, t.id, t.locale)
        if (t.kind === 'publish') {
          const r = await api(
            'POST',
            `/_emdash/api/content/${t.collection}/${t.id}/unpublish?locale=${t.locale}`,
            {}
          )
          return { rev: r?._rev ?? null }
        }
        if (t.kind === 'menu') {
          await api(
            'POST',
            `/_emdash/api/menus/${encodeURIComponent(t.menu)}/items?locale=${t.locale}`,
            menuItemPayload(m.before)
          )
          return {}
        }
        if (t.kind === 'menu-label') {
          await api(
            'PUT',
            `/_emdash/api/menus/${encodeURIComponent(t.menu)}/items/${encodeURIComponent(String(t.id))}?locale=${t.locale}`,
            { label: m.before?.label ?? '' }
          )
          return {}
        }
        if (t.kind === 'term') {
          await api(
            'PUT',
            `/_emdash/api/taxonomies/${encodeURIComponent(t.taxonomy)}/terms/${encodeURIComponent(t.term)}?locale=${t.locale}`,
            { label: m.before?.label ?? '' }
          )
          return {}
        }
        if (t.kind === 'form') {
          await api('POST', '/_emdash/api/plugins/emdash-forms/forms/update', m.before)
          return {}
        }
        if (t.kind === 'file') {
          writeFileSync(DISPLAY_FILE, `${JSON.stringify(m.before ?? {})}\n`)
          return {}
        }
        if (t.kind === 'field') {
          // A field this tool made (the dark-background logo's, on a release without one) goes again; one already gone is not an error.
          try {
            await api(
              'DELETE',
              `/_emdash/api/schema/collections/${encodeURIComponent(t.collection)}/fields/${encodeURIComponent(t.field)}`
            )
          } catch (error) {
            if (error.status !== 404) throw error
          }
          return {}
        }
        throw new Error(`no way back for a ${String(t.kind)} mutation`)
      })
      done.push(t)
    } catch (error) {
      journal.append({ phase: 'done', written: done.length, errors: 1 })
      forgetReceipts(done)
      return say(
        {
          ok: false,
          why: `${t.kind} ${[t.collection, t.slug, t.locale, t.menu, t.id].filter(Boolean).join('/')}: ${error.message}`,
          reverted: done.length,
          done
        },
        4
      )
    }
  }
  journal.append({ phase: 'done', written: done.length, errors: 0 })
  forgetReceipts(done)
  return say({ ok: true, applyId, reverted: done.length, done }, 0)
}

/**
 * The receipts of what a revert put back, dropped. A receipt says "this tool wrote this value at
 * this revision"; after a revert neither is true, and a receipt left behind reads the reverted
 * field as an editor's change — so the next run would leave the demo value in place for ever.
 * @param {{ kind: string, collection?: string, slug?: string, locale?: string }[]} targets
 */
function forgetReceipts(targets) {
  if (DRY || !existsSync(RECEIPTS_FILE)) return
  let receipts
  try {
    receipts = JSON.parse(readFileSync(RECEIPTS_FILE, 'utf8'))
  } catch {
    return
  }
  for (const t of targets) {
    if (t.kind === 'entry') delete receipts.entries?.[`${t.collection}/${t.slug}/${t.locale}`]
    if (t.kind === 'settings') delete receipts.settings
  }
  writeFileSync(RECEIPTS_FILE, `${JSON.stringify(receipts, null, 2)}\n`)
}

function finish(report) {
  if (JSON_OUT) console.log(JSON.stringify(report))
  else {
    const n = (a) => a.length
    console.log(
      `personalize${report.applyId ? ` ${report.applyId}` : ''}: ${n(report.written)} written, ${n(report.unchanged)} unchanged, ${n(report.editor)} left to an editor, ${n(report.errors)} failed, ${n(report.unanswered)} unanswered, ${n(report.skipped)} skipped; copy ${n(report.copy.done)} written, ${n(report.copy.skipped)} skipped${report.repeatOf ? ` (repeat of ${report.repeatOf})` : ''}${report.dryRun ? ' (dry run)' : ''}`
    )
    for (const s of report.errors) console.log(`  · FAILED ${s.rule}: ${s.why}`)
    for (const s of report.unanswered) console.log(`  · unanswered ${s.rule}: ${s.why}`)
    for (const s of report.skipped) console.log(`  · skipped ${s.rule}: ${s.why}`)
    for (const s of report.copy.skipped)
      console.log(
        `  · copy skipped${s.field ? ` ${s.field}` : ''}${s.locale ? ` (${s.locale})` : ''}: ${s.why}`
      )
    for (const t of report.trimmed) console.log(`  · trimmed ${t.entry}: ${t.why}`)
    for (const g of report.generated) console.log(`  · written by Tracy ${g.entry}: ${g.fields.join(', ')}`)
  }
  // 🔒 NOT `process.exit`. Stdout to a pipe is written asynchronously, and exiting right after a
  // large `console.log` cut the report at 64 KB once it named four locales' entries (16/09) —
  // the stage then read half a JSON. The exit code is set and the process ends on its own.
  process.exitCode = exitCodeOf(report)
}

/** 4 when a write failed (it wins), 3 when some copy was skipped, else 0. */
export function exitCodeOf(report) {
  if (report.errors?.length > 0) return 4
  if (report.copy?.skipped?.length > 0) return 3
  return 0
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain)
  (INSPECT ? inspect() : REVERT !== null ? revert(REVERT) : BRAND_ONLY ? brandOnly() : main()).catch((e) => {
    console.error(e.message ?? e)
    process.exit(1)
  })
