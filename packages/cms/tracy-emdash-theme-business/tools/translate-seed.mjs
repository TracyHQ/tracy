#!/usr/bin/env node
// Give the seed one more language: every `en` entry, menu, taxonomy and term is cloned into the
// target locale — same slug, `translationOf` pointing at the English one — and every text in the
// clone is written in that language by the model. The media map gains the same targets for the
// new locale, so the importer places the same photographs.
//
//   node tools/translate-seed.mjs <locale> [--seed seed] [--from en] [--batch 6] [--dry-run]
//        [--table <content-map.json> --table-file <tag.json>] [--report <file.json>]
//
// A SHIPPED TABLE FIRST, THE MODEL FOR THE REST. All three Tracy CMS ship the same demo site, so
// the Joomla quickstart's machine translations (`packages/cms/tracy-joomla-quickstart/translations/`)
// already hold most of these sentences in 41 languages. `--table` gives this run that table: a
// content map (slot -> English `sample`) plus one locale file (slot -> translation), joined into
// source-string -> translation the way the seeder's planner keys its cache
// (`packages/cms/tracy-seeder/src/shipped-translations.mjs`). A text the table answers is never
// sent to the model -- it is cheaper AND it is the same sentence the Joomla demo was verified
// with. Without `--table` this tool behaves exactly as it did before.
//
// Runs AFTER build-seed.mjs and writes back into <seed>/seed.json and <seed>/media-map.json; a
// rerun for the same locale replaces what it made before. The languages a Business site can be
// built in are exactly the ones this has been run for (`template.config.json` lists them, and
// the seed must carry each) — see tasks/todo-emdash-business-localized.md.
//
// What is NOT translated: keys that are identity or structure (`slug`, `url`, `href`, `id`,
// `_key`, `_type`, `style`, `template`, `image`, `icon`, `variant`), values that are URLs,
// mail, phone numbers, dates, ISO stamps, slugs or bare numbers, and the brand name lines the
// personalize map swaps anyway. A model answer that drops a text leaves the English one, and
// the run says which.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { modelFrom } from './personalize.mjs'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : dflt
}
const TARGET = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'))
const SEED_DIR = path.resolve(
  opt('--seed', path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'seed'))
)
const FROM = opt('--from', 'en')
const BATCH = Number(opt('--batch', '6'))
const DRY = args.includes('--dry-run')
// The model is told the language by name. ICU's English name is right for almost every tag, and
// wrong where a language is written in two scripts: `sr` says "Serbian" and gets Latin, while the
// shipped table is Cyrillic — a page in two alphabets. `--language` says which one out loud.
const LANGUAGE_OVERRIDE = opt('--language')
const TABLE_MAP = opt('--table')
const TABLE_FILE = opt('--table-file')
const REPORT = opt('--report')
/** One request's worth of source text, when the table path batches by size instead of by object. */
const CHARS_PER_REQUEST = Number(opt('--chars', '3000'))
const TEXTS_PER_REQUEST = Number(opt('--texts', '40'))
const TRIES = 3
const MODEL_TIMEOUT_MS = 180_000

// The names of the four locales this template shipped with are written out, because they were
// chosen by hand and reviewed; every other locale asks ICU, which is the only list that stays
// right as locales are added. `nameOf` is the language IN ITSELF (the switcher's label),
// `languageOf` is its English name (what the model is told to translate into).
const NATIVE = {
  vi: 'Tiếng Việt',
  zh: '中文',
  ru: 'Русский',
  en: 'English'
}
const LANGUAGE = {
  vi: 'Vietnamese',
  zh: 'Simplified Chinese',
  ru: 'Russian',
  en: 'English'
}
/** @param {string} tag */
export function nameOf(tag) {
  if (NATIVE[tag]) return NATIVE[tag]
  try {
    const n = new Intl.DisplayNames([tag], { type: 'language' }).of(tag)
    return n && n !== tag ? n[0].toLocaleUpperCase(tag) + n.slice(1) : tag
  } catch {
    return tag
  }
}
/** @param {string} tag */
export function languageOf(tag) {
  if (LANGUAGE[tag]) return LANGUAGE[tag]
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

if (!TARGET || !/^[a-z]{2}(-[A-Z]{2})?$/.test(TARGET)) {
  console.error('use: translate-seed.mjs <locale> [--seed dir] [--from en] [--batch 6] [--dry-run]')
  process.exit(2)
}

const SKIP_KEYS = new Set([
  'slug',
  'url',
  'href',
  'id',
  '_key',
  '_type',
  'style',
  'template',
  'image',
  'icon',
  'variant',
  'layout',
  'markDefs',
  'marks',
  'listItem',
  'level',
  'brand_mark',
  // Row identity, not prose: both are ids this tool writes itself, and a model asked to translate
  // them will sometimes oblige.
  'locale',
  'translationOf',
  // A taxonomy term's SLUG stored in a row (`projects_page.sectors[].sector`), not a label: the
  // list page builds `/projects/sector/<it>` from it. Translated, 37 locales linked every sector
  // chip to a 404 (`/vi/projects/sector/sản xuất`, measured 25/09/2026 by scripts/brand-leaks.py).
  'sector'
])

/**
 * A menu item's `type` is one of five words EmDash matches exactly (`custom`, `page`, …), so it is
 * structure here — while a vacancy's `type` ("Full-time") is prose. The two cannot share one list,
 * which is why the menu job carries its own. Measured 22/09: without this, 19 of 36 locales came
 * back with `"type": "personalizado"` and the seed refused to validate.
 */
const MENU_SKIP_KEYS = new Set([...SKIP_KEYS, 'type'])

/** @param {string} v */
function isText(v) {
  if (typeof v !== 'string') return false
  const s = v.trim()
  if (s === '') return false
  if (/^(https?:)?\/\//.test(s) || s.startsWith('/') || s.startsWith('#')) return false
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(s)) return false
  if (/^[+\d][\d\s().-]{5,}$/.test(s)) return false
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return false
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(s)) return false
  if (/^[A-Z0-9_]{2,}$/.test(s)) return false
  if (/^[\d\s.,%+×x/-]+$/.test(s)) return false
  return /\p{L}/u.test(s)
}

/**
 * Every translatable string in a value, as `[path, text]` pairs — a dotted path with array
 * indices, e.g. `content.0.children.1.text`.
 * @param {unknown} value @param {string} [at] @param {Array<[string, string]>} [out]
 */
function textsOf(value, at = '', out = [], skip = SKIP_KEYS) {
  if (typeof value === 'string') {
    if (isText(value)) out.push([at, value])
    return out
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => textsOf(v, at === '' ? String(i) : `${at}.${i}`, out, skip))
    return out
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (skip.has(k)) continue
      textsOf(v, at === '' ? k : `${at}.${k}`, out, skip)
    }
  }
  return out
}

/**
 * Write a translation over the source text at `at`, keeping the source's leading and trailing
 * spaces: answers come back trimmed, and a span that ended in a space before a link otherwise
 * glues its last word to the link's ("trong" + "Chính sách" printed "trongChính sách", g60).
 * @param {unknown} root @param {string} at @param {string} text
 */
function setAt(root, at, text) {
  const parts = at.split('.')
  let o = root
  for (const p of parts.slice(0, -1)) o = o[Array.isArray(o) ? Number(p) : p]
  const last = parts[parts.length - 1]
  const key = Array.isArray(o) ? Number(last) : last
  const before = typeof o[key] === 'string' ? o[key] : ''
  const lead = /^\s*/.exec(before)?.[0] ?? ''
  const trail = /\s*$/.exec(before)?.[0] ?? ''
  o[key] = `${lead}${text.trim()}${trail}`
}

/**
 * One request: a map of key → text, back as the same map in the target language.
 * @param {ReturnType<typeof modelFrom>} model @param {Record<string, string>} texts @param {string} language
 * @returns {Promise<Record<string, string>>}
 */
async function translate(model, texts, language) {
  if (!model) throw new Error('no model key (DEEPSEEK_API_KEY, OPENROUTER_API_KEY or TRACY_MODEL_URL)')
  const system = [
    `You translate the text of a company website into ${language}. Answer with ONE JSON object with exactly the same keys, each value the translation, nothing else.`,
    'Keep names of products, places, companies and people as they are; keep numbers, units, currency codes and years; keep {placeholders} in braces untouched.',
    'Natural, plain business register; no exclamation marks; no notes.'
  ].join(' ')
  const res = await fetch(model.url, {
    method: 'POST',
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    headers: {
      'content-type': 'application/json',
      ...(model.key ? { authorization: `Bearer ${model.key}` } : {}),
      'HTTP-Referer': 'https://tracy.ai',
      'X-Title': 'Tracy translate-seed'
    },
    body: JSON.stringify({
      model: model.model,
      temperature: 0.3,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(texts) }
      ]
    })
  })
  if (!res.ok) throw new Error(`model ${model.url} → HTTP ${String(res.status)}`)
  const body = await res.json()
  const content = body?.choices?.[0]?.message?.content
  const parsed = JSON.parse(
    typeof content === 'string' ? content.replace(/^```(?:json)?\s*|\s*```$/g, '') : ''
  )
  const out = {}
  for (const k of Object.keys(texts))
    if (typeof parsed?.[k] === 'string' && parsed[k].trim() !== '') out[k] = parsed[k].trim()
  return out
}

/** Translate the texts of several objects in one request each batch; returns how many were left. */
async function translateAll(model, jobs, language) {
  let left = 0
  for (let at = 0; at < jobs.length; at += BATCH) {
    const slice = jobs.slice(at, at + BATCH)
    const texts = {}
    for (const [i, job] of slice.entries()) for (const [p, t] of job.texts) texts[`${String(i)}|${p}`] = t
    if (Object.keys(texts).length === 0) continue
    let got = {}
    try {
      got = DRY ? {} : await translate(model, texts, language)
    } catch (error) {
      console.error(`  ! ${slice.map((j) => j.name).join(', ')}: ${error.message}`)
    }
    for (const [i, job] of slice.entries()) {
      for (const [p] of job.texts) {
        const v = got[`${String(i)}|${p}`]
        if (v === undefined) left += 1
        else setAt(job.target, p, v)
      }
    }
    process.stderr.write(
      `translated ${String(Math.min(at + BATCH, jobs.length))} of ${String(jobs.length)}\n`
    )
  }
  return left
}

/**
 * The shipped table, joined the way `shipped-translations.mjs` joins it: a content map holds both
 * the slot key and the English `sample`, the locale file holds slot key -> translation. Keyed by
 * the SOURCE STRING, so a text this template shares with the Joomla edition hits and a text only
 * this one has misses — nothing has to know which is which.
 * @param {string} mapFile @param {string} localeFile @returns {Map<string, string>}
 */
function loadTable(mapFile, localeFile) {
  const out = new Map()
  const map = JSON.parse(readFileSync(mapFile, 'utf8'))
  const byKey = JSON.parse(readFileSync(localeFile, 'utf8'))
  for (const slot of map.slots ?? []) {
    if (slot.type !== 'text') continue
    const text = byKey[slot.key]
    const source = typeof slot.sample === 'string' ? slot.sample.trim() : ''
    if (typeof text !== 'string' || text.trim() === '' || source === '') continue
    // A sentence the OTHER CMS says about ITSELF is not a translation of ours: the Joomla footer
    // names Joomla, and importing it would put that word on an EmDash site.
    if (/joomla/i.test(text) && !/joomla/i.test(source)) continue
    if (!out.has(source)) out.set(source, text.trim())
  }
  return out
}

/** Split unique texts into requests small enough to come back whole. @param {string[]} keys */
function requestsOf(keys) {
  const out = []
  let batch = []
  let chars = 0
  for (const k of keys) {
    if (batch.length > 0 && (chars + k.length > CHARS_PER_REQUEST || batch.length >= TEXTS_PER_REQUEST)) {
      out.push(batch)
      batch = []
      chars = 0
    }
    batch.push(k)
    chars += k.length
  }
  if (batch.length > 0) out.push(batch)
  return out
}

/**
 * The table first, the model for what is left, each unique text asked once and written everywhere
 * it occurs. Returns the counts the run reports.
 * @param {ReturnType<typeof modelFrom>} model
 * @param {Array<{ name: string, target: unknown, texts: Array<[string, string]> }>} jobs
 * @param {Map<string, string>} table @param {string} language
 */
async function fillAll(model, jobs, table, language) {
  let fromTable = 0
  let instances = 0
  /** @type {Map<string, Array<[number, string]>>} unique source text -> where it sits */
  const missing = new Map()
  jobs.forEach((job, i) => {
    for (const [at, text] of job.texts) {
      instances += 1
      const hit = table.get(text.trim())
      if (hit !== undefined) {
        setAt(job.target, at, hit)
        fromTable += 1
        continue
      }
      const seats = missing.get(text) ?? []
      seats.push([i, at])
      missing.set(text, seats)
    }
  })
  const keys = [...missing.keys()]
  const requests = requestsOf(keys)
  let asked = 0
  let left = 0
  let done = 0
  for (const batch of requests) {
    const texts = {}
    batch.forEach((k, i) => {
      texts[String(i)] = k
    })
    asked += batch.length
    let got = {}
    for (let attempt = 1; attempt <= TRIES && !DRY; attempt += 1) {
      try {
        got = await translate(model, texts, language)
        if (Object.keys(got).length >= batch.length) break
      } catch (error) {
        console.error(`  ! request ${String(done + 1)} try ${String(attempt)}: ${error.message}`)
      }
      if (attempt < TRIES) await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
    batch.forEach((k, i) => {
      const v = got[String(i)]
      const seats = missing.get(k) ?? []
      if (v === undefined) left += seats.length
      else for (const [j, at] of seats) setAt(jobs[j].target, at, v)
    })
    done += 1
    process.stderr.write(`  ${String(done)}/${String(requests.length)} requests\n`)
  }
  return { instances, fromTable, unique: keys.length, asked, left }
}

const seedFile = path.join(SEED_DIR, 'seed.json')
const mapFile = path.join(SEED_DIR, 'media-map.json')
const seed = JSON.parse(readFileSync(seedFile, 'utf8'))
const mediaMap = JSON.parse(readFileSync(mapFile, 'utf8'))
const language = LANGUAGE_OVERRIDE ?? languageOf(TARGET)
const model = modelFrom()
const clone = (v) => JSON.parse(JSON.stringify(v))
const reLocale = (id) => id.replace(new RegExp(`:${FROM}$`), `:${TARGET}`)
const rePath = (url) =>
  typeof url === 'string' && url.startsWith('/') && !url.startsWith(`/${TARGET}/`)
    ? url === '/'
      ? `/${TARGET}`
      : `/${TARGET}${url}`
    : url

/** @type {Array<{ name: string, target: unknown, texts: Array<[string, string]> }>} */
const jobs = []

// content
for (const [collection, rows] of Object.entries(seed.content ?? {})) {
  const kept = rows.filter((e) => e.locale !== TARGET)
  const made = rows
    .filter((e) => e.locale === FROM)
    .map((e) => {
      const c = clone(e)
      c.id = reLocale(e.id)
      c.locale = TARGET
      c.translationOf = e.id
      if (typeof c.data?.title === 'string' && c.data.title.endsWith('(EN)'))
        c.data.title = c.data.title.replace(/\(EN\)$/, `(${TARGET.toUpperCase()})`)
      // The switcher's label is the CURRENT language's own name, not "English" translated.
      if (collection === 'site' && typeof c.data?.language_name === 'string')
        c.data.language_name = nameOf(TARGET)
      jobs.push({ name: `${collection}/${e.slug}`, target: c.data, texts: textsOf(c.data) })
      return c
    })
  seed.content[collection] = [...kept, ...made]
}
// menus
{
  const kept = (seed.menus ?? []).filter((m) => m.locale !== TARGET)
  const made = (seed.menus ?? [])
    .filter((m) => m.locale === FROM)
    .map((m) => {
      const c = clone(m)
      c.id = reLocale(m.id)
      c.locale = TARGET
      c.translationOf = m.id
      for (const item of c.items ?? []) item.url = rePath(item.url)
      jobs.push({
        name: `menu ${m.name}`,
        target: c,
        texts: textsOf({ label: c.label, items: c.items }, '', [], MENU_SKIP_KEYS)
      })
      return c
    })
  seed.menus = [...kept, ...made]
}
// taxonomies and their terms
{
  const kept = (seed.taxonomies ?? []).filter((t) => t.locale !== TARGET)
  const made = (seed.taxonomies ?? [])
    .filter((t) => t.locale === FROM)
    .map((t) => {
      const c = clone(t)
      c.id = reLocale(t.id)
      c.locale = TARGET
      c.translationOf = t.id
      for (const term of c.terms ?? []) {
        term.id = reLocale(term.id)
        term.locale = TARGET
        term.translationOf = term.id.replace(new RegExp(`:${TARGET}$`), `:${FROM}`)
      }
      jobs.push({
        name: `taxonomy ${t.name}`,
        target: c,
        texts: textsOf({ label: c.label, labelSingular: c.labelSingular, terms: c.terms })
      })
      return c
    })
  seed.taxonomies = [...kept, ...made]
}
// the media map: the same pictures on the same fields of the new locale
for (const item of mediaMap.items ?? []) {
  const targets = (item.targets ?? []).filter((t) => t.locale !== TARGET)
  const made = (item.targets ?? []).filter((t) => t.locale === FROM).map((t) => ({ ...t, locale: TARGET }))
  item.targets = [...targets, ...made]
}

const texts = jobs.reduce((n, j) => n + j.texts.length, 0)
console.error(
  `${String(jobs.length)} objects, ${String(texts)} texts → ${language}${DRY ? ' (dry run)' : ''}`
)

let left = 0
/** @type {Record<string, number | string>} */
let stats = {}
if (TABLE_MAP || TABLE_FILE) {
  // The table path: needs both halves, refuses with one.
  if (!TABLE_MAP || !TABLE_FILE) {
    console.error('--table <content-map.json> and --table-file <tag.json> go together')
    process.exit(2)
  }
  const table = loadTable(TABLE_MAP, TABLE_FILE)
  console.error(`table: ${String(table.size)} source strings from ${path.basename(TABLE_FILE)}`)
  stats = await fillAll(model, jobs, table, language)
  left = stats.left
} else {
  // The original path, unchanged: every object's texts asked with its siblings, no table.
  left = await translateAll(model, jobs, language)
  stats = { instances: texts, fromTable: 0, unique: texts, asked: texts, left }
}
if (!DRY) {
  writeFileSync(seedFile, `${JSON.stringify(seed, null, 2)}\n`)
  writeFileSync(mapFile, `${JSON.stringify(mediaMap, null, 2)}\n`)
}
if (REPORT)
  writeFileSync(
    REPORT,
    `${JSON.stringify({ locale: TARGET, language, from: FROM, objects: jobs.length, ...stats }, null, 2)}\n`
  )
console.error(
  `done: ${String(texts - left)} of ${String(texts)} in ${language} (${String(stats.fromTable)} from the table, ${String(texts - left - Number(stats.fromTable))} from the model), ${String(left)} left in ${FROM}${DRY ? '' : `; written to ${seedFile}`}`
)
process.exit(left > 0 && !DRY ? 3 : 0)
