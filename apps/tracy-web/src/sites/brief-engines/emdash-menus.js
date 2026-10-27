/**
 * The labels of an EmDash site's menus that name the template's own company, made the customer's.
 *
 * 🔒 THE TOOL WRITES THE FIELDS, AND A MENU LABEL IS NOT A FIELD. Measured 03/10/2026 on a bakery's `tracy-business`: every
 * entry was rewritten for the business, the footer on every page still offered "Industrial park infrastructure",
 * "Pre-engineered buildings", "M&E engineering" and "Maintenance & retrofit". The personalize tool deletes the menu items
 * of a page it hides and has no step that renames one, so the labels are made here, through the site's own menu API
 * (`PUT /_emdash/api/menus/:name/items/:id`, the label alone), from the same brief the words were made from.
 *
 * What is asked of the model is small and checked: only labels that name what this business does not do are returned, each a
 * few words in the language of its menu, from the description alone (`FACT_RULES`, and a label carrying a phone, an email, a
 * price or a year the owner did not give is dropped). It is asked while the site installs; the writes are a few requests just
 * before the tool runs, so the tool, which translates the seed's own labels for a root written in another language, leaves them.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FACT_RULES, factsOf, ungrounded } from './guard.js'
import { jsonObjectIn } from './shared.js'

/** The longest label that stays a label. */
const MAX_LABEL = 40
/** At most this many menus' labels are put to the model at once: a template has a dozen. */
const MAX_MENUS = 40

const SYSTEM =
  'You are tidying the navigation of a website that a small business has just made from a template. The template was ' +
  'written for another company, so some menu labels name things this business does not do. You are given a description ' +
  'of the business and the menus of the site, each with its language and its labels. Return ONLY the labels that must ' +
  "change: a label that names the template company's own services, products, projects or departments gets a short label of " +
  'one to three words for what THIS business offers, taken from the description. A list of services or products keeps ' +
  'its number of entries: every entry gets a label of its own that names one distinct service or product this business ' +
  'plausibly offers, the ones the description names first, then others a business like it offers; each label is the ' +
  'name of a service or a product, never a filler word for when, how or for whom (no "daily", "made to order", "for ' +
  'families", "for shops"), and no two labels of one menu the same. Ordinary labels stay as they ' +
  'are: Home, About, Services, Products, Projects, News, Blog, Contact, Careers, Pricing, Terms, Privacy, Sitemap. Write each ' +
  'new label in the language of its menu: its `language` when it has one (the site is written in it), else its locale. The ' +
  'description and the sector may be written in another language (often English): say what they name in the language ' +
  'of the menu, never copy their words. Answer with JSON only: {"relabel": [{"menu": "<name>", "locale": "<locale>", ' +
  '"from": "<label>", "to": "<new label>"}]}, using only menus, locales and labels you were given.' +
  FACT_RULES

/** @type {Map<string, any>} a seed's menus, read once: a release never changes. */
const seeds = new Map()

/**
 * The slugs of the pages a template keeps as it ships them: its sample pages (`seed/personalize.json` `samples`, the
 * Resources kit of Tracy Business, K3). None when the template declares none.
 * @param {string} seedDir
 * @returns {Set<string>}
 */
function samplePagesOf(seedDir) {
  try {
    const map = JSON.parse(readFileSync(path.join(seedDir, 'personalize.json'), 'utf8'))
    return new Set(
      (Array.isArray(map.samples) ? map.samples : [])
        .map((/** @type {any} */ s) => String(s?.slug ?? ''))
        .filter(Boolean)
    )
  } catch {
    return new Set()
  }
}

/**
 * The seed entries a template rewrites the title of for the business, as `<collection>/<slug>` and `<collection>/*` for a whole
 * collection (`seed/personalize.json`: a `copy` or `blocks` rule for the field `title`, a `rewrite` rule whose `fields` hold
 * it). None when the template declares none.
 * @param {string} seedDir
 * @returns {Set<string>}
 */
function retitledOf(seedDir) {
  /** @type {Set<string>} */
  const out = new Set()
  try {
    const map = JSON.parse(readFileSync(path.join(seedDir, 'personalize.json'), 'utf8'))
    for (const rule of [...(map.copy ?? []), ...(map.blocks ?? [])])
      if (rule?.field === 'title' && rule.collection && rule.slug) out.add(`${rule.collection}/${rule.slug}`)
    for (const rule of map.rewrite ?? [])
      if (Array.isArray(rule?.fields) && rule.fields.includes('title') && rule.collection) {
        if (Array.isArray(rule.slugs)) for (const slug of rule.slugs) out.add(`${rule.collection}/${slug}`)
        else out.add(`${rule.collection}/*`)
      }
  } catch {
    // no map: nothing is known to be rewritten
  }
  return out
}

/**
 * The seed's entries by slug, in its default locale: `slug` → the collections that hold an entry of it.
 * @param {any} whole - `seed.json`
 * @returns {Map<string, string[]>}
 */
function entriesOf(whole) {
  /** @type {Map<string, string[]>} */
  const out = new Map()
  const root = String(whole.defaultLocale ?? 'en')
  for (const [collection, rows] of Object.entries(whole.content ?? {}))
    for (const row of Array.isArray(rows) ? rows : []) {
      if (typeof row?.slug !== 'string' || (row.locale && row.locale !== root)) continue
      out.set(row.slug, [...(out.get(row.slug) ?? []), collection])
    }
  return out
}

/**
 * The words each seed entry is called by, in its default locale: `slug` → the words of its `breadcrumb` and its `title`, each
 * a set (lower-cased, a plural `s` taken off), so a label can be read against the page it opens.
 * @param {any} whole - `seed.json`
 * @returns {Map<string, Array<Set<string>>>}
 */
function namesOf(whole) {
  /** @type {Map<string, Array<Set<string>>>} */
  const out = new Map()
  const root = String(whole.defaultLocale ?? 'en')
  for (const rows of Object.values(whole.content ?? {}))
    for (const row of Array.isArray(rows) ? rows : []) {
      if (typeof row?.slug !== 'string' || (row.locale && row.locale !== root)) continue
      const names = ['breadcrumb', 'title']
        .map((f) => row.data?.[f])
        .filter((v) => typeof v === 'string' && v.trim() !== '')
        .map((v) => new Set(nameWords(v)))
      out.set(row.slug, [...(out.get(row.slug) ?? []), ...names])
    }
  return out
}

/** The words of a name as a label is compared with it: lower-cased letters, a plural `s` taken off. */
const nameWords = (/** @type {unknown} */ text) =>
  (
    String(text ?? '')
      .toLowerCase()
      .match(/\p{L}+/gu) ?? []
  ).map((w) => (w.length > 3 ? w.replace(/s$/, '') : w))

/**
 * Whether a menu item's label names the page it opens: every word of the label is a word of that page's breadcrumb or
 * title in the seed ("Careers" of "Careers", "About" of "About us").
 *
 * 🔒 A LABEL NAMES ITS DESTINATION (TCH #1013, PAGE-5). Measured 11/10/2026 on dev (g58-biz-emd-full, Tracy Business 1.7.5): the
 * careers page's heading is written for the business, so the topbar link to /careers was put to the planner and came back
 * "Đặt bánh" (order a cake) while the footer, by luck, named it "Tuyển dụng". The page is still the careers page, so the
 * label stays the template's, and the tool translates it. A label that names something else (a demo service leading to
 * /services) is still planned.
 * @param {unknown} url @param {unknown} label @param {string} locale @param {{ names: Map<string, Array<Set<string>>> }} seed
 */
export function namesItsPage(url, label, locale, seed) {
  const raw = String(url ?? '')
  if (!raw.startsWith('/')) return false
  const segments = raw
    .replace(/[?#].*$/, '')
    .split('/')
    .filter(Boolean)
  if (segments[0] === locale) segments.shift()
  if (segments.length === 0) return false
  const words = nameWords(label)
  if (words.length === 0) return false
  const names = [...new Set([segments.join('-'), String(segments.at(-1))])].flatMap(
    (slug) => seed.names.get(slug) ?? []
  )
  return names.some((name) => words.every((w) => name.has(w)))
}

/**
 * Whether a menu item leads to a page of the seed whose title stays the template's: its label names that page, so it stays
 * the template's too, and the tool translates it.
 *
 * 🔒 A RELABEL STILL NAMES WHAT ITS PAGE IS (TCH #1013, PAGE-5). Measured 10/10/2026 on dev (g56-biz-emd-full, Tracy Business
 * 1.7.4): put to the planner, the topbar link to /investors, a page still titled "Investor relations", came back "Gia đình"
 * (family). A label follows the business only where the page it opens is itself titled for the business; an address the seed
 * holds no entry for (a category, an anchor) is judged by its label alone, as before.
 * @param {unknown} url @param {string} locale - the menu's locale (an edition's items carry it as a first segment)
 * @param {{ entries: Map<string, string[]>, retitled: Set<string> }} seed
 */
export function leadsToKeptTitle(url, locale, seed) {
  const raw = String(url ?? '')
  if (!raw.startsWith('/')) return false
  const segments = raw
    .replace(/[?#].*$/, '')
    .split('/')
    .filter(Boolean)
  if (segments[0] === locale) segments.shift()
  if (segments.length === 0) return false
  const found = [...new Set([segments.join('-'), String(segments.at(-1))])].flatMap((slug) =>
    (seed.entries.get(slug) ?? []).map((collection) => ({ collection, slug }))
  )
  if (found.length === 0) return false
  return !found.some(
    ({ collection, slug }) =>
      seed.retitled.has(`${collection}/${slug}`) || seed.retitled.has(`${collection}/*`)
  )
}

/**
 * Whether a menu item leads to a page whose words are not the business's to rename after: a sample page the template
 * keeps as it ships it, or an error page (`/404`). Its label says what that page is, so it stays the template's.
 *
 * 🔒 A LABEL IS RENAMED, ITS ADDRESS NEVER IS (TCH #1013, PAGE-5, K3). Measured 10/10/2026 on dev (g55-biz-emd-full, Tracy
 * Business 1.7.4): put to the planner with the rest, the Resources menu came back as the bakery's products ("Bánh mì",
 * "Sourdough", "Dubai") and still opened /kit/newsletter, /kit/email and /404.
 * @param {unknown} url @param {string} locale - the menu's locale (an edition's items carry it as a first segment)
 * @param {Set<string>} samples
 */
export function leadsToTemplatePage(url, locale, samples) {
  const raw = String(url ?? '')
  if (!raw.startsWith('/')) return false
  const segments = raw
    .replace(/[?#].*$/, '')
    .split('/')
    .filter(Boolean)
  if (segments[0] === locale) segments.shift()
  if (segments.length === 0) return false
  if (segments.length === 1 && /^[45]\d\d$/.test(segments[0])) return true
  return samples.has(segments.join('-')) || samples.has(String(segments.at(-1)))
}

/**
 * The menus a template ships, in the languages asked for.
 *
 * 🔒 ONE LANGUAGE THAT IS NOT THE ROOT'S IS WRITTEN INTO THE ROOT (TCH #1013, O2; `localesFrom` of tools/personalize.mjs): the
 * tool writes the default locale's entries in that language and hides every other locale. So only the default locale's
 * menus are planned, each carrying the `language` its labels are written in: planned by locale alone, a bakery written in
 * Vietnamese read "Breads · Baked Goods" in its menu (measured 08/10/2026 on dev, tamq-7q-edvi).
 * @param {string} seedDir
 * @param {string[]} languages - what the owner asked for (`en`, `vi`, `vi-VN`…); the default language is always among them
 * @returns {Array<{ name: string, locale: string, labels: string[], language?: string }>}
 */
export function seedMenus(seedDir, languages) {
  let seed = seeds.get(seedDir)
  if (!seed) {
    const whole = JSON.parse(readFileSync(path.join(seedDir, 'seed.json'), 'utf8'))
    seed = {
      defaultLocale: String(whole.defaultLocale ?? 'en'),
      menus: whole.menus ?? [],
      samples: samplePagesOf(seedDir),
      entries: entriesOf(whole),
      names: namesOf(whole),
      retitled: retitledOf(seedDir)
    }
    seeds.set(seedDir, seed)
  }
  const primary = (/** @type {unknown} */ l) => String(l).split('-')[0].toLowerCase()
  const asked = [...new Set(languages.map(primary))]
  // The tool's own test (`localesFrom`): no language answered is the root's, so the root is written in the first one and
  // that language's own edition is hidden (TCH #1013, D2); the others keep their editions.
  const into = asked.length > 0 && !asked.includes(primary(seed.defaultLocale)) ? asked[0] : null
  const wanted = new Set(into ? [seed.defaultLocale, ...asked.slice(1)] : [seed.defaultLocale, ...asked])
  /** @type {Array<{ name: string, locale: string, labels: string[], language?: string }>} */
  const out = []
  for (const menu of seed.menus) {
    const locale = String(menu.locale ?? seed.defaultLocale)
    const labels = (menu.items ?? [])
      .filter(
        (/** @type {any} */ item) =>
          !leadsToTemplatePage(item.url ?? item.customUrl, locale, seed.samples) &&
          !leadsToKeptTitle(item.url ?? item.customUrl, locale, seed) &&
          !namesItsPage(item.url ?? item.customUrl, item.label, locale, seed)
      )
      .map((/** @type {any} */ item) => String(item.label ?? '').trim())
      .filter(Boolean)
    if (wanted.has(locale) && labels.length > 0 && typeof menu.name === 'string')
      out.push({
        name: menu.name,
        locale,
        labels,
        ...(into && locale === seed.defaultLocale ? { language: into } : {})
      })
  }
  return out.slice(0, MAX_MENUS)
}

/** A language's English name for the model (`vi` → "Vietnamese"), else the tag itself. */
function languageName(/** @type {string} */ tag) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

/** The words of a text, lower-cased, letters only. */
const wordsOf = (/** @type {unknown} */ text) =>
  String(text ?? '')
    .toLowerCase()
    .match(/\p{L}+/gu) ?? []

/**
 * Whether a label meant for a menu written in `language` only repeats unaccented words of the business's own description
 * or sector instead of saying them in that language.
 *
 * 🔒 THE DESCRIPTION'S LANGUAGE IS NOT THE SITE'S (TCH #1013, LANG-2). Measured 10/10/2026 on dev (g55-biz-emd-full): a
 * Vietnamese site's footer read "Sourdough", "Vietnamese bread", "Freshly baked" and "Family bakery" beside "Bánh mì":
 * words lifted from the owner's English description and the sector, which the normaliser always writes in English.
 * An English menu never trips it.
 * @param {string} label @param {string} language - the tag the menu is written in @param {string} source
 */
export function copiedFrom(label, language, source) {
  if (String(language).split('-')[0].toLowerCase() === 'en') return false
  const words = wordsOf(label)
  if (words.length === 0 || !words.every((w) => /^[a-z]+$/.test(w))) return false
  const known = new Set(wordsOf(source))
  return words.every((w) => known.has(w))
}

/** A label as two labels of one menu are compared: case and spacing aside. */
const sameLabel = (/** @type {unknown} */ text) =>
  String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()

/**
 * The labels the model would change.
 *
 * A label for a menu in another language than English that only repeats English words of the description (`copiedFrom`),
 * or that repeats another label of its own menu (`repeated`), is asked for once more, those labels alone; one that comes
 * back the same is dropped, so the item keeps its seed label, which the personalize tool then translates into the site's
 * language.
 *
 * 🔒 ONE MENU NEVER NAMES TWO ITEMS THE SAME (TCH #1013). Measured 11/10/2026 on dev (g57-biz-emd-full, Tracy Business
 * 1.7.4): the description named two breads and the footer had four service links; it read
 * "Bánh mì sourdough, Bánh mì Việt, Bánh mì sourdough, Bánh mì Việt" where the demo lists four services.
 * @param {object} input
 * @param {{ chat: Function }} input.model
 * @param {{ name: string, about: string, sector: string | null }} input.business
 * @param {Array<{ name: string, locale: string, labels: string[], language?: string }>} input.menus
 * @param {string} [input.given] - what the owner wrote, for the fact check
 * @param {AbortSignal} [input.signal]
 * @returns {Promise<Array<{ menu: string, locale: string, from: string, to: string }>>} only labels of `menus`
 */
export async function planMenuLabels({ model, business, menus, given = '', signal }) {
  if (menus.length === 0) return []
  const written = [...new Set(menus.map((m) => m.language).filter((l) => typeof l === 'string' && l !== ''))]
  const system =
    written.length > 0
      ? `${SYSTEM}\nThe site is written in ${written.map(languageName).join(', ')}: every new label of a menu that carries a \`language\` is in it.`
      : SYSTEM
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify({ business, menus }) }
  ]
  /** @type {any} */
  let parsed = null
  /** @type {string} */
  let said = ''
  for (let attempt = 1; attempt <= 2 && parsed === null; attempt += 1) {
    said = await model.chat({ messages, maxTokens: 1500, temperature: 0, signal })
    const found = jsonObjectIn(said)
    if (found && Array.isArray(found.relabel)) parsed = found
  }
  if (parsed === null) throw new Error('the model did not say which menu labels to change')
  const facts = factsOf(given, business.about)
  const source = [business.about, business.sector, given].join('\n')
  const known = new Map(menus.map((m) => [`${m.name}\u0000${m.locale}`, new Set(m.labels)]))
  const languageOf = new Map(menus.map((m) => [`${m.name}\u0000${m.locale}`, m.language ?? m.locale]))
  /** The rows of an answer that are labels of `menus`, cleaned; `taken` keeps one per item. */
  const accepted = (/** @type {any[]} */ rows, /** @type {Set<string>} */ taken) => {
    /** @type {Array<{ menu: string, locale: string, from: string, to: string }>} */
    const out = []
    for (const row of rows) {
      const menu = String(row?.menu ?? '')
      const locale = String(row?.locale ?? '')
      const from = String(row?.from ?? '')
      const to = String(row?.to ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      const id = `${menu}\u0000${locale}\u0000${from}`
      if (!known.get(`${menu}\u0000${locale}`)?.has(from) || taken.has(id)) continue
      if (to === '' || to === from || to.length > MAX_LABEL || ungrounded(to, from, facts)) continue
      taken.add(id)
      out.push({ menu, locale, from, to })
    }
    return out
  }
  const copied = (/** @type {{ menu: string, locale: string, to: string }} */ r) =>
    copiedFrom(r.to, String(languageOf.get(`${r.menu}\u0000${r.locale}`) ?? r.locale), source)
  const first = accepted(parsed.relabel, new Set())
  const rowId = (/** @type {{ menu: string, locale: string, from: string }} */ r) =>
    `${r.menu}\u0000${r.locale}\u0000${r.from}`
  /** Per menu, the labels its items keep (the ones no row renames). */
  const keptOf = (/** @type {string} */ key) => {
    const renamed = new Set(first.filter((r) => `${r.menu}\u0000${r.locale}` === key).map((r) => r.from))
    return [...(known.get(key) ?? [])].filter((l) => !renamed.has(l))
  }
  /** The rows that repeat a label their menu already shows: an item it keeps, or an earlier row of the answer. */
  const repeated = new Set()
  /** @type {Map<string, Set<string>>} */
  const seen = new Map()
  for (const r of first) {
    const key = `${r.menu}\u0000${r.locale}`
    if (!seen.has(key)) seen.set(key, new Set(keptOf(key).map(sameLabel)))
    const taken = /** @type {Set<string>} */ (seen.get(key))
    if (taken.has(sameLabel(r.to))) repeated.add(rowId(r))
    else taken.add(sameLabel(r.to))
  }
  const again = first.filter((r) => copied(r) || repeated.has(rowId(r)))
  if (again.length === 0) return first
  // Once more, for the copied labels alone; an answer that is not one leaves them dropped, the rest stands.
  /** @type {Map<string, string>} */
  const redone = new Map()
  try {
    const copies = again.filter(copied)
    const repeats = again.filter((r) => !copied(r))
    const names = [
      ...new Set(again.map((r) => languageName(String(languageOf.get(`${r.menu}\u0000${r.locale}`)))))
    ]
    const asks = []
    if (copies.length > 0)
      asks.push(
        `These labels repeat words of the description instead of being written in ${names.join(', ')}: ${JSON.stringify(copies)}.`
      )
    if (repeats.length > 0) {
      const taken = Object.fromEntries(
        [...new Set(repeats.map((r) => `${r.menu}\u0000${r.locale}`))].map((key) => [
          key.split('\u0000')[0],
          [
            ...keptOf(key),
            ...first
              .filter((r) => `${r.menu}\u0000${r.locale}` === key && !again.includes(r))
              .map((r) => r.to)
          ]
        ])
      )
      asks.push(
        `These labels repeat another label of their menu: ${JSON.stringify(repeats)}. Each menu already shows ` +
          `${JSON.stringify(taken)}; give each a label of its own that none of those is.`
      )
    }
    const answer = await model.chat({
      messages: [
        ...messages,
        { role: 'assistant', content: said },
        {
          role: 'user',
          content:
            `${asks.join(' ')} Give each of them again, written in ${names.join(', ')}, in the same JSON shape, ` +
            'with only these labels.'
        }
      ],
      maxTokens: 800,
      temperature: 0,
      signal
    })
    const found = jsonObjectIn(answer)
    if (found && Array.isArray(found.relabel))
      for (const r of accepted(found.relabel, new Set()))
        if (!copied(r) && again.some((a) => rowId(a) === rowId(r))) redone.set(rowId(r), r.to)
  } catch (error) {
    if (signal?.aborted) throw error
    // otherwise dropped below
  }
  // The labels each menu shows once the plan lands: what it keeps, what was right the first time, then each label
  // asked again, in order, if it is still its own.
  /** @type {Map<string, Set<string>>} */
  const shown = new Map()
  const shownIn = (/** @type {{ menu: string, locale: string }} */ r) => {
    const key = `${r.menu}\u0000${r.locale}`
    if (!shown.has(key))
      shown.set(
        key,
        new Set(
          [
            ...keptOf(key),
            ...first
              .filter((x) => `${x.menu}\u0000${x.locale}` === key && !again.includes(x))
              .map((x) => x.to)
          ].map(sameLabel)
        )
      )
    return /** @type {Set<string>} */ (shown.get(key))
  }
  return first.flatMap((r) => {
    if (!again.includes(r)) return [r]
    const to = redone.get(rowId(r))
    const taken = shownIn(r)
    if (!to || taken.has(sameLabel(to))) return []
    taken.add(sameLabel(to))
    return [{ ...r, to }]
  })
}

/**
 * Rename the menu items the plan names, by label, through the site's menu API; never rejects (a rename is not worth a site).
 * @param {object} input
 * @param {(method: string, route: string, body?: unknown) => Promise<any>} input.api - the site's API as the agent
 * @param {Array<{ menu: string, locale: string, from: string, to: string }>} input.changes
 * @param {number} [input.concurrency]
 * @returns {Promise<{ renamed: number, notes: string[] }>}
 */
export async function renameMenuItems({ api, changes, concurrency = 4 }) {
  /** @type {string[]} */
  const notes = []
  let renamed = 0
  /** @type {Map<string, Array<{ from: string, to: string }>>} */
  const byMenu = new Map()
  for (const c of changes) {
    const key = `${c.menu}\u0000${c.locale}`
    byMenu.set(key, [...(byMenu.get(key) ?? []), { from: c.from, to: c.to }])
  }
  /** @type {Array<() => Promise<void>>} */
  const jobs = []
  for (const [key, list] of byMenu) {
    const [menu, locale] = key.split('\u0000')
    jobs.push(async () => {
      try {
        const answer = await api(
          'GET',
          `/_emdash/api/menus/${encodeURIComponent(menu)}?locale=${encodeURIComponent(locale)}`
        )
        const rows = answer?.items ?? answer?.menu?.items ?? answer?.item?.items ?? []
        for (const { from, to } of list) {
          const row = rows.find((/** @type {any} */ r) => String(r.label ?? '').trim() === from)
          if (!row?.id) continue
          try {
            await api(
              'PUT',
              `/_emdash/api/menus/${encodeURIComponent(menu)}/items/${encodeURIComponent(String(row.id))}?locale=${encodeURIComponent(locale)}`,
              { label: to }
            )
            renamed += 1
          } catch (error) {
            notes.push(
              `the ${menu} menu's "${from}" could not be renamed: ${error instanceof Error ? error.message : error}`
            )
          }
        }
      } catch (error) {
        notes.push(`the ${menu} menu could not be read: ${error instanceof Error ? error.message : error}`)
      }
    })
  }
  // A few menus at a time: each is one read and a handful of renames.
  for (let i = 0; i < jobs.length; i += concurrency)
    await Promise.all(jobs.slice(i, i + concurrency).map((job) => job()))
  return { renamed, notes }
}

/**
 * The site's API as the agent, in the shape the personalize tool uses it: bearer token, JSON in, the answer's `data` out;
 * a refusal throws, carrying the HTTP `status`.
 * @param {string} origin
 * @param {string} token
 * @param {AbortSignal} [signal]
 * @param {typeof fetch} [fetchImpl] - a test's stand-in for the site
 */
export function siteApi(origin, token, signal, fetchImpl = fetch) {
  return async (/** @type {string} */ method, /** @type {string} */ route, /** @type {unknown} */ body) => {
    const res = await fetchImpl(`${origin.replace(/\/+$/, '')}${route}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'X-EmDash-Request': '1',
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000)
    })
    const raw = await res.text()
    /** @type {any} */
    let json = null
    try {
      json = JSON.parse(raw)
    } catch {
      // read as a failure below
    }
    if (!res.ok || (json && json.success === false))
      throw Object.assign(
        new Error(`${method} ${route} -> ${res.status} ${json?.error?.message ?? raw.slice(0, 120)}`),
        { status: res.status }
      )
    return json?.data ?? json
  }
}
