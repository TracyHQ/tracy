/**
 * "Apply" for an EmDash site built from a template that ships the personalize tool (`tracy-business`, `tracy-saas`,
 * `tracy-base`): the customer's words and pictures, written by the template's own tool — in a fraction of the wait.
 *
 *   prepare  (while the site installs, no site needed)
 *     the tool is run once against a STAND-IN for the site that lives in `emdash-preload.mjs`: every question it
 *     asks the model (the copy of each page, the demo entries rewritten for the business, the card lists, the
 *     pictures) goes out for real and its answer is written down. Nothing is written anywhere.
 *   apply    (the moment the site is up)
 *     the same run, against the real site: every question is answered from what was written down, so the model costs
 *     nothing now and what is left is the writing itself, with the languages nobody asked for hidden by their chrome entry.
 *   after    (the site is handed over; the run's end waits for it)
 *     the rest of each hidden language comes off, entry by entry (`hideRest`): nothing a visitor can reach changes, but
 *     the hreflang links and EmDash's sitemap read it.
 *
 * It is the tool's own sequence — the one the Build runs inside the site's container — run from here with the site's
 * agent token, because the model is the slow part and the model needs nothing from the site. The tool, its rules (a
 * claim the customer did not give is EMPTIED, never invented; the demo entries about another company leave the site only
 * when the customer described the business, and with About blank only the name changes, in every edition still served;
 * only the chosen languages are written) and its writes are untouched; see `emdash-preload.mjs` for why a replay is
 * exact and a miss merely slower.
 *
 * 🔒 THE SOURCE LANGUAGE STAYS IN FRONT, as on the other two CMS: the tool always writes the default locale and serves it at
 * the root, and with several languages a chosen one lives under its own prefix. One language other than the root's is
 * written INTO the root and every other locale is hidden (`localesFrom` of the tool, TCH #1013 D10/O2). No language chosen
 * hides nothing: the template's languages stay as they are (LANG-5), so `report.language.hidden` is empty and `hideRest`
 * does not run.
 * 🔒 NO SECRET OF THIS PROCESS REACHES THE TOOL. It runs with an environment of its own: the model's door, the picture
 * door, and the files it is told about.
 */
import { writeEmdashMainMenu } from './main-menu-emdash.js'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { emdashToolFor, runNode } from '../../lib/emdash-tool.js'
import { connectEmdashBrand } from './brand-emdash.js'
import { keptById, unpickedById } from './picked-pages.js'
import { planMenuLabels, renameMenuItems, seedMenus, siteApi } from './emdash-menus.js'
import { writeWoPosts } from './emdash-wo-content.js'
import {
  cardCount,
  emdashCardPictures,
  emdashCardPictureSlots,
  emdashSlotRoles,
  writeWoCopy
} from './emdash-wo-copy.js'
import { emdashReadySidecar } from '../../lib/slot-roles-for.js'
import { woContentOf } from './wo-content.js'
import { writeEmdashButtonActions } from './emdash-button-actions.js'
import { realPicturesOf } from './real-pictures.js'
import {
  emdashPictureInventory,
  writeEmdashPictures,
  verifyEmdashPictureBindings
} from './emdash-real-pictures.js'
import {
  ABOUT_BLANK_NOTE,
  aboutGiven,
  briefForJudges,
  budgetSignal,
  nameAnswered,
  spokenOf,
  recordedDoor
} from './shared.js'

const PRELOAD = fileURLToPath(new URL('./emdash-preload.mjs', import.meta.url))
/** The address the warm-up run is given: nothing answers there, and the preload answers for it. */
const WARMUP_ORIGIN = 'http://emdash-warmup.invalid'
/** A token of the shape the tool insists on; the stand-in accepts any. */
const WARMUP_TOKEN = 'ec_pat_warmup0000000000000000000000'
/** Requests in flight per lane when the site is real. The tool's own default is 4; a site on this host's network takes more. */
const AT_ONCE = Math.max(1, Math.min(32, Number(process.env.TRACY_EMDASH_CONCURRENCY) || 8))
/** The longest the tool may take once the site is up. */
const TOOL_MS = 150_000
/** The longest the rest of the hidden languages may take to come off, once the site is handed over. */
const HIDE_MS = 5 * 60_000
/** Requests in flight for that, while the customer is already on the site: fewer than the writing takes. */
const HIDE_AT_ONCE = 4
/** A run's folder older than this belongs to a process that is gone: the run itself is capped at 25 minutes. */
const STALE_MS = 3 * 60 * 60_000
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/

/** The answers the normalizer reads as typed and holds to its own rules: its reading is sent, not the raw answer. */
const NORMALIZED = new Set(['name', 'languages'])

/**
 * What the tool's questionnaire is answered with: the answers to the template's OWN questions as the customer typed
 * them, and, for the rest, what the popup's text was read for. Only what the customer gave: the tool empties a field
 * with no answer rather than keeping the demo's.
 *
 * 🔒 A TEMPLATE QUESTION'S ANSWER GOES AS TYPED. The tool reads its own questions (`seed/questions.json`: the sector by
 * its option, the contact line it parses itself) exactly as the Build hands them over. Rebuilt from the normalizer's
 * fields, the sector never arrived (the copy, form and picture prompts wrote for no trade) and a typed street address
 * survived only when the model had echoed it (ledger L10).
 *
 * 🔒 EXCEPT THE NAME AND THE LANGUAGES, which the normalizer already reads as typed (`brief-normalize.js` `typedOf`) and
 * holds to its rules: the languages cleaned and capped (`MAX_LANGUAGES`). Its reading is the one the menu labels are
 * planned for (`prepare`), so the tool writes the same set.
 * @param {{name: string, about: string, tone?: string, sector?: string | null, contact?: string, phone?: string, address?: string, hours?: string, social?: Record<string, string>, languages?: string[], languagesFrom?: string}} normalized
 * @param {Array<{id?: unknown, value?: unknown}>} [typed] - the brief's answers (`briefFromAnswers`), when the popup asked questions
 * @param {Iterable<string>} [questionIds] - the ids the template's own questionnaire defines; an answer to any other is not sent
 * @param {unknown} [sitePages] - `brief.pages` (`{ all, picked }`): the pages the customer unticked go as `hidePages`, by id
 *   (`unpickedById`: never the home page), and they are the only pages the tool hides (T23; TCH #1013, 08/10/2026: no
 *   template `hide` rule applies); the pages kept go as `keepPages` (`keptById`)
 */
export function answersOf(normalized, typed = [], questionIds = [], sitePages = null) {
  const parts = String(normalized.contact ?? '')
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean)
  const email = parts.find((part) => EMAIL.test(part))?.match(EMAIL)?.[0] ?? ''
  const rest = parts.filter((part) => !EMAIL.test(part))
  // The phone is the part that is mostly digits; what is left is the address.
  const phone =
    normalized.phone?.trim() ||
    rest.find((part) => part.replace(/\D/g, '').length >= 7 && !/\p{L}{3,}/u.test(part)) ||
    ''
  const address = normalized.address?.trim() || rest.filter((part) => part !== phone).join(', ')
  // The tool reads one line and takes the phone out of it, whatever is left being the address. A street number
  // that follows a phone would be read as the end of it ("0912 345 678 12"), so the address goes first and a
  // semicolon, which no phone has, stands between them.
  const contact = [address, phone].filter(Boolean).join(' ; ')
  // 🔒 THE TONE GOES AS A FIELD OF ITS OWN, NEVER INSIDE THE DESCRIPTION (T15). The tool hands it to the model beside
  // `about` as the voice to write in (`factsFrom`, `toneLine` of tools/personalize.mjs); folded into `about`, a tone given
  // with no description became the subject the model is told to write every line about.
  const tone = typeof normalized.tone === 'string' ? normalized.tone.trim() : ''
  const sector = typeof normalized.sector === 'string' ? normalized.sector.trim() : ''
  const hidePages = unpickedById(sitePages)
  // The pages the customer kept, home included. The tool applies no template `hide` rule at all (`templateHideRules`): only the
  // Pages answer takes a page off (U9; TCH #1013, 08/10/2026).
  const keepPages = keptById(sitePages)
  /** @type {Record<string, string | string[]>} */
  const own = {}
  const asked = new Set(questionIds)
  for (const answer of Array.isArray(typed) ? typed : []) {
    if (!answer || typeof answer.id !== 'string' || !asked.has(answer.id) || NORMALIZED.has(answer.id))
      continue
    const value = answer.value
    if (typeof value === 'string' && value.trim() !== '') own[answer.id] = value.trim()
    else if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string'))
      own[answer.id] = value
  }
  return {
    // a name left blank is sent as none: the tool keeps the template's own (`factsFrom`: "missing → absent, never invented")
    ...(nameAnswered(normalized) ? { name: normalized.name } : {}),
    ...(normalized.about ? { about: normalized.about } : {}),
    ...(tone ? { tone } : {}),
    ...(sector ? { sector } : {}),
    ...(contact ? { contact } : {}),
    ...(email ? { email } : {}),
    ...(normalized.hours ? { hours: normalized.hours } : {}),
    ...(normalized.social && Object.keys(normalized.social).length > 0 ? { social: normalized.social } : {}),
    // Regional tags (`vi-VN`, `en-GB`) go as cleaned, not cut to `vi`/`en`: the tool matches a shipped locale by its
    // primary subtag (`localesFrom`) and prints the region in `<html lang>` and hreflang (`displayLocalesFrom`).
    // 🔒 NO LANGUAGE CHOSEN SENDS NO LANGUAGE (TCH #1013, LANG-5, 09/10/2026). The normalizer falls back to English
    // (`languagesFrom: 'default'`) for the menu labels; sent, the tool read it as a choice and hid every other locale
    // (1911 entries unpublished on a blank Tracy Business build). Blank stays blank, and the tool hides nothing.
    ...(normalized.languages?.length && normalized.languagesFrom !== 'default'
      ? { languages: normalized.languages }
      : {}),
    ...(hidePages.length > 0 ? { hidePages } : {}),
    ...(keepPages.length > 0 ? { keepPages } : {}),
    ...own
  }
}

/** A small file of a template's seed, read once per process; null when it is missing or not JSON. @type {Map<string, any>} */
const seedFiles = new Map()
/** @param {string} seedDir @param {string} name */
function seedFile(seedDir, name) {
  const file = path.join(seedDir, name)
  if (!seedFiles.has(file)) {
    try {
      seedFiles.set(file, JSON.parse(readFileSync(file, 'utf8')))
    } catch {
      seedFiles.set(file, null)
    }
  }
  return seedFiles.get(file)
}

/**
 * The questions the template's tool reads its answers by (`seed/questions.json`); none when the seed ships no such file.
 * @param {string} seedDir
 * @returns {string[]}
 */
export function templateQuestionIds(seedDir) {
  const questions = seedFile(seedDir, 'questions.json')?.questions
  return (Array.isArray(questions) ? questions : [])
    .map((/** @type {any} */ q) => q?.id)
    .filter((/** @type {unknown} */ id) => typeof id === 'string')
}

/**
 * The forms the template's tool makes the business's own (`seed/personalize.json` `forms`): one per language, named
 * `<slug>-<locale>` on the site.
 * @param {string} seedDir
 * @returns {string[]}
 */
export function templateFormSlugs(seedDir) {
  const forms = seedFile(seedDir, 'personalize.json')?.forms
  return (Array.isArray(forms) ? forms : [])
    .map((/** @type {any} */ f) => f?.slug)
    .filter((/** @type {unknown} */ slug) => typeof slug === 'string' && slug !== '')
}

const ACCOUNT_EMAIL = new RegExp(`^${EMAIL.source}$`)
/**
 * What the TOOL takes for an email answer (`factsFrom` in `tools/personalize.mjs`): one that fails it ("n/a", a phone typed
 * in the box) is dropped there like no answer, so it must not stop the account's address from reaching the forms.
 */
const TOOL_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Each seed entry's collection, slug and locale, kept per seed folder: the seed itself is megabytes. @type {Map<string, Array<{collection: string, slug: string, locale: string}>>} */
const seedRows = new Map()
/** The locale each seed serves at the root. @type {Map<string, string>} */
const seedDefaults = new Map()
/** @param {string} seedDir */
function rowsOf(seedDir) {
  let rows = seedRows.get(seedDir)
  if (!rows) {
    rows = []
    try {
      const seed = JSON.parse(readFileSync(path.join(seedDir, 'seed.json'), 'utf8'))
      seedDefaults.set(seedDir, String(seed.defaultLocale ?? 'en'))
      for (const [collection, list] of Object.entries(seed?.content ?? {}))
        for (const e of Array.isArray(list) ? list : [])
          if (typeof e?.slug === 'string')
            rows.push({ collection, slug: e.slug, locale: String(e.locale ?? seed.defaultLocale ?? 'en') })
    } catch {
      // no seed, nothing to take off
    }
    seedRows.set(seedDir, rows)
  }
  return rows
}

/** The seed's locale served at the root. @param {string} seedDir */
function seedDefaultLocale(seedDir) {
  rowsOf(seedDir)
  return seedDefaults.get(seedDir) ?? 'en'
}

/** Every language the template's seed carries: the ones it ships, written or hidden. @param {string} seedDir */
function seedLocales(seedDir) {
  return [...new Set(rowsOf(seedDir).map((r) => r.locale))]
}

/**
 * @typedef {{ unpublished: number, failed: number, notReached: number, served: string[], error?: string }} HideResult
 */

/**
 * Every entry of the languages nobody chose, off the site, beyond the chrome entry the tool took (`--hide-chrome-only`).
 *
 * 🔒 WHY, AND WHY ONCE THE SITE IS HANDED OVER (ledger L18). The chrome entry is the one the template's switcher and its
 * redirect of a language's URLs ask about, so the tool takes only that and Apply stays a matter of seconds. But a page
 * names every PUBLISHED translation of itself in its hreflang links (`src/layouts/Base.astro`, `getTranslations`), and
 * EmDash's sitemap lists every published entry: measured 05/10/2026, a site written in two of 40 languages declared 41
 * alternates on every page, the inner ones ending in 404. The rest is ~50 entries a language, two requests each: roughly
 * two minutes for 38 languages at HIDE_AT_ONCE (an estimate, not measured on a real site) — not worth the customer's
 * wait, since nothing they can reach changes. So it runs after Apply returns, and the run's end (`dispose`) waits for it.
 * Unpublished, never deleted, as the tool does it: the words stay in the admin.
 *
 * 🔒 ONLY A LANGUAGE THE SITE NO LONGER SERVES. `hidden` is what the tool DECIDED to hide, not a confirmed result: its
 * unpublish of a chrome entry can fail, and someone can switch a language back on before this gets to it. So each
 * language's chrome entry is read first, and a language whose chrome entry is still published keeps every entry.
 * @param {object} input
 * @param {(method: string, route: string, body?: unknown) => Promise<any>} input.api - `siteApi(...)`
 * @param {string} input.seedDir
 * @param {string[]} input.hidden - the languages the tool decided to hide (`report.language.hidden`), checked here
 * @param {number} [input.concurrency]
 * @param {number} [input.deadlineAt] - epoch ms after which no entry is started
 * @returns {Promise<HideResult>} what came off, what was refused (or could not be checked), the rows never started before
 *   `deadlineAt`, and the languages left whole because their chrome entry is still published
 */
export async function hideRest({
  api,
  seedDir,
  hidden,
  concurrency = HIDE_AT_ONCE,
  deadlineAt = Date.now() + HIDE_MS
}) {
  const all = rowsOf(seedDir)
  /** @param {{collection: string, slug: string, locale: string}} row */
  const read = async (row) => {
    const live = await api(
      'GET',
      `/_emdash/api/content/${encodeURIComponent(row.collection)}/${encodeURIComponent(row.slug)}?locale=${encodeURIComponent(row.locale)}`
    )
    return live?.item ?? live
  }
  /** @type {string[]} the hidden languages whose chrome entry is confirmed off the site */
  const gone = []
  /** @type {string[]} the hidden languages the site still serves: left whole */
  const served = []
  let unpublished = 0
  let failed = 0
  let notReached = 0
  await eachAtOnce(hidden, concurrency, async (locale) => {
    const chrome = all.find((r) => r.collection === 'site' && r.locale === locale)
    if (!chrome) return
    try {
      if ((await read(chrome))?.status === 'published') served.push(locale)
      else gone.push(locale)
    } catch (error) {
      // No chrome entry at all is a language the site does not serve; any other answer is not a confirmation.
      if (/** @type {any} */ (error)?.status === 404) gone.push(locale)
      else failed += 1
    }
  })
  const rows = all.filter((r) => r.collection !== 'site' && gone.includes(r.locale))
  await eachAtOnce(rows, concurrency, async (row) => {
    if (Date.now() >= deadlineAt) {
      notReached += 1
      return
    }
    try {
      const item = await read(row)
      if (item?.status !== 'published' || !item.id) return
      await api(
        'POST',
        `/_emdash/api/content/${encodeURIComponent(row.collection)}/${encodeURIComponent(String(item.id))}/unpublish?locale=${encodeURIComponent(row.locale)}`,
        {}
      )
      unpublished += 1
    } catch (error) {
      // An entry the site does not hold has nothing to take off.
      if (/** @type {any} */ (error)?.status !== 404) failed += 1
    }
  })
  return { unpublished, failed, notReached, served: hidden.filter((l) => served.includes(l)) }
}

/**
 * `work` for every item, at most `limit` at a time, in order.
 * @template T
 * @param {T[]} items @param {number} limit @param {(item: T) => Promise<void>} work
 */
async function eachAtOnce(items, limit, work) {
  let next = 0
  const lane = async () => {
    while (next < items.length) await work(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, lane))
}

/**
 * Point the template's forms, in every language it ships, at one mailbox: the account of the person who pressed Apply,
 * when the customer typed no email of their own.
 *
 * 🔒 A RECIPIENT, NEVER A LINE ON THE SITE (ledger L05, decided 05/10/2026). Left alone, every enquiry and every newsletter
 * signup went to the demo company's sales desk. The tool sets `notifyEmails` from the email ANSWER, and the same answer
 * fills the top bar and the sales line, so the account's address is not given to the tool: it is written here, into the
 * forms' settings alone, through the forms door the tool uses. A typed email the tool takes (`TOOL_EMAIL`) is the tool's to
 * write, and wins.
 *
 * Every language, the hidden ones too (decided 05/10/2026): a language switched on later must not bring back a form that
 * mails the demo company's domain.
 * @param {object} input
 * @param {(method: string, route: string, body?: unknown) => Promise<any>} input.api - `siteApi(...)`
 * @param {string} input.email
 * @param {string[]} input.slugs - `templateFormSlugs`
 * @param {string[]} input.locales - every language the template ships
 * @returns {Promise<{ moved: number, notes: string[] }>}
 */
export async function mailFormsTo({ api, email, slugs, locales }) {
  const wanted = new Set(slugs.flatMap((slug) => locales.map((locale) => `${slug}-${locale}`)))
  /** @type {string[]} */
  const notes = []
  let moved = 0
  if (wanted.size === 0) return { moved, notes }
  let forms
  try {
    const list = await api('POST', '/_emdash/api/plugins/emdash-forms/forms/list', {})
    forms = list?.forms ?? list?.items ?? (Array.isArray(list) ? list : [])
  } catch (error) {
    notes.push(
      `the site's forms could not be read, so they still mail the template's mailbox: ${error instanceof Error ? error.message : error}`
    )
    return { moved, notes }
  }
  for (const form of forms) {
    if (!wanted.has(form?.slug)) continue
    const notify = Array.isArray(form.settings?.notifyEmails) ? form.settings.notifyEmails : []
    if (notify.length === 1 && notify[0] === email) continue
    try {
      // The recipient alone: the forms plugin's update (`formsUpdateHandler`, @emdash-cms/plugin-forms 0.2.9) keeps the
      // pages when none are sent and merges the settings, so resending the pages could only fail their validation.
      await api('POST', '/_emdash/api/plugins/emdash-forms/forms/update', {
        id: form.id,
        settings: { ...form.settings, notifyEmails: [email] }
      })
      moved += 1
    } catch (error) {
      notes.push(
        `the ${form.slug} form still mails the template's mailbox: ${error instanceof Error ? error.message : error}`
      )
    }
  }
  return { moved, notes }
}

/** The environment the tool is given, and nothing else of ours. */
function environment({ textDoor, imageDoor, extra }) {
  /** @type {Record<string, string>} */
  const env = { PATH: process.env.PATH ?? '', LANG: 'C.UTF-8' }
  for (const name of ['NODE_EXTRA_CA_CERTS', 'TZ', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY'])
    if (process.env[name]) env[name] = /** @type {string} */ (process.env[name])
  if (textDoor) {
    env.TRACY_MODEL_URL = `${textDoor.baseUrl.replace(/\/+$/, '')}/chat/completions`
    env.TRACY_MODEL_KEY = textDoor.apiKey
    env.TRACY_MODEL_NAME = textDoor.words
  }
  if (imageDoor) {
    env.OPENROUTER_API_KEY = imageDoor.key
    env.TRACY_SEED_IMAGE_MODEL = imageDoor.imageModel
  }
  return { ...env, ...extra }
}

/** The report the tool prints on stdout, or null. */
function reportOf(stdout) {
  try {
    const report = JSON.parse(stdout)
    return report && typeof report === 'object' ? report : null
  } catch {
    return null
  }
}

const cacheStats = (stderr) => {
  const m = /fetch-cache \w+: hits=(\d+) misses=(\d+) kept=(\d+)/.exec(stderr)
  return m ? { hits: Number(m[1]), misses: Number(m[2]), kept: Number(m[3]) } : null
}

/**
 * @param {object} deps
 * @param {() => Promise<{textDoor?: {apiKey: string, baseUrl: string, words: string} | null, image?: {url: string, key: string, imageModel: string} | null}>} deps.models
 * @param {(siteKey: string) => Promise<{origin: string, token: string}>} deps.siteAccess - where the site's own API is, and its agent token
 * @param {typeof runNode} [deps.run] - how the tool is run; a test's stand-in
 * @param {typeof fetch} [deps.fetchImpl] - the site's own API, for the menu labels; a test's stand-in
 * @param {string} [deps.workRoot] - where a run keeps its files
 * @param {{info?: Function, warn?: Function}} [deps.log] - where the clean-up after the hand-over is said, one line a site
 * @param {((siteKey: string, locales: Record<string, string>) => Promise<void>) | null} [deps.displayLocale] - hands the
 *   tag the site prints for each stored locale (`{ en: 'vi-VN' }`) to the site's host, which writes it where the template
 *   reads it; throws when it could not
 * @param {{isOpportunity?: Function, forSite: Function, recordBefore: Function, recordWrite: Function} | null} [deps.woContent] - the restaurant's own
 *   posts for a site an opportunity built (`opportunities-build/site-content.js`); none writes none
 * @param {Function | null} [deps.applyFor] - the existing Apply door used for audited media uploads
 * @param {{forSite: Function} | null} [deps.realPictures] - the restaurant's own photographs for a site an opportunity built
 *   (`opportunities-build/site-pictures.js`); WO photographs are placed before deterministic text setup
 */
export function createEmdashEngine({
  models,
  siteAccess,
  displayLocale = null,
  woContent = null,
  realPictures = null,
  applyFor = null,
  run = runNode,
  workRoot = tmpdir(),
  fetchImpl = fetch,
  log = console
}) {
  // The brand step reaches the site through the same door, with the same tool (`brand-emdash.js`, plan T22).
  connectEmdashBrand({ siteAccess, run, workRoot })
  // A run that died with its process left its folder behind (a token in it, too): clear the ones nobody can still be using.
  try {
    for (const name of readdirSync(workRoot))
      if (
        name.startsWith('tracy-emdash-') &&
        Date.now() - statSync(path.join(workRoot, name)).mtimeMs > STALE_MS
      )
        rmSync(path.join(workRoot, name), { recursive: true, force: true })
  } catch {
    // no folder to look in is nothing to clear
  }
  const pictures = async (ctx, prepared = null) => {
    if (!realPictures || !applyFor) return null
    const tool = prepared?.tool ?? emdashToolFor(ctx.quickstart)
    if (!tool) throw new Error('this quickstart has no EmDash picture map')
    const seed = JSON.parse(readFileSync(path.join(tool.seedDir, 'seed.json'), 'utf8'))
    const inventory =
      prepared?.pictureInventory ??
      (await emdashPictureInventory({
        seedDir: tool.seedDir,
        locales: [
          ...new Set([
            seed.defaultLocale,
            ...(ctx.normalized.languages?.length > 1 ? ctx.normalized.languages : [])
          ])
        ],
        hiddenPageIds: unpickedById(ctx.brief?.pages),
        admit: emdashCardPictureSlots(emdashReadySidecar(tool.templateId)?.doc)
      }))
    const real =
      prepared?.realPictures ??
      (await realPictures.forSite({
        siteKey: ctx.siteKey,
        email: ctx.email,
        strict: true,
        signal: ctx.signal,
        visionNeeds: inventory.slots.map((s) => s.demo)
      }))
    if (!real) {
      ctx.note('no collected photographs are available; image replacement is incomplete')
      return null
    }
    const { origin, token } = await siteAccess(ctx.siteKey)
    const apply = recordedDoor(ctx, applyFor(ctx.email, ctx.runId))
    // Each card's picture is its own entity's (`emdashCardPictures`): never another dish's photo beside a dish's name.
    const cards = prepared?.woCopy
      ? await emdashCardPictures({ ...prepared.woCopy, pictures: real.pictures }).catch(() => null)
      : null
    const report = await writeEmdashPictures({
      inventory,
      real,
      bound: cards?.pictures ?? {},
      realPictures,
      api: siteApi(origin, token, ctx.signal, fetchImpl),
      signal: ctx.signal,
      upload: ({ bytes, hash, ext }) =>
        apply({
          siteKey: ctx.siteKey,
          action: 'media.upload',
          params: {
            apply_id: `media-brief-${hash.slice(0, 16)}`,
            path: `tracy-content/${hash}.${ext}`,
            content_b64: bytes.toString('base64')
          }
        })
    })
    ctx.time('realPicturesPlaced', report.placed)
    ctx.time('realPicturesGaps', report.gaps.length)
    if (report.gaps.length)
      ctx.note(`${report.gaps.length} picture position(s) need attention; image replacement is incomplete`)
    return report
  }
  return {
    pictures,
    /** @param {import('../brief-build.js').BriefContext} ctx */
    async prepare(ctx) {
      const tool = emdashToolFor(ctx.quickstart)
      if (!tool) throw new Error('this template ships no personalize tool, so its words stay as released')
      // Decide from the build's identity, not the availability of posts. Missing posts still belong to a WO demo.
      const who = { siteKey: ctx.siteKey, email: ctx.email }
      const isOpportunity = Boolean(await woContent?.isOpportunity?.(who))
      // The restaurant's own photographs, when an opportunity built this site, read beside the models: asked only when a
      // picture could be drawn at all (About given, models asked), as WordPress and Joomla ask (`real-pictures.js`).
      const inventory =
        isOpportunity && realPictures && applyFor
          ? await emdashPictureInventory({
              seedDir: tool.seedDir,
              locales: (() => {
                const seed = JSON.parse(readFileSync(path.join(tool.seedDir, 'seed.json'), 'utf8'))
                return [
                  ...new Set([
                    seed.defaultLocale,
                    ...(ctx.normalized.languages?.length > 1 ? ctx.normalized.languages : [])
                  ])
                ]
              })(),
              hiddenPageIds: unpickedById(ctx.brief?.pages),
              admit: emdashCardPictureSlots(emdashReadySidecar(tool.templateId)?.doc)
            })
          : null
      const reading = inventory
        ? realPictures.forSite({
            ...who,
            strict: true,
            signal: ctx.signal,
            visionNeeds: inventory.slots.map((s) => s.demo)
          })
        : !isOpportunity && aboutGiven(ctx.brief)
          ? realPicturesOf(realPictures, ctx)
          : Promise.resolve(null)
      const { text = null, textDoor = null, image = null } = isOpportunity ? {} : await models()
      const answers = answersOf(
        ctx.normalized,
        ctx.brief?.answers,
        templateQuestionIds(tool.seedDir),
        ctx.brief?.pages
      )
      // About left blank keeps the template's words and pictures (`aboutGiven`): the tool keeps its demo words itself
      // (`rewritesIn` of tools/personalize.mjs), but it draws pictures from the name, and the menu labels below are Tracy's.
      const described = aboutGiven(ctx.brief)
      // Pictures are drawn by the tool through OpenRouter (its own door; no other is known to it).
      const openrouter = image?.url.startsWith('https://openrouter.ai/') ? image : null
      // A real place gets no invented rooms or dishes. WO photographs use the image-only adapter before the tool.
      const real = await reading
      const imageDoor = described && !real ? openrouter : null
      if (real && openrouter) ctx.note('the restaurant has photographs of its own, so no pictures are drawn')
      if (textDoor && !openrouter) ctx.note('no picture model is set, so the template keeps its own pictures')
      if (isOpportunity)
        ctx.note('Website Opportunities uses sourced content; remaining text is left for the agent')
      else if (!textDoor) ctx.note('no text model is set, so only the details you gave were written')
      else if (!described) ctx.note(ABOUT_BLANK_NOTE)
      // Read before creating a scratch directory: a strict read failure must leave no credential folder behind.
      const woRead =
        isOpportunity && woContent
          ? await woContent.forSite({ ...who, strict: true })
          : await woContentOf(woContent, ctx)
      const woCopy = await woCopyOf(woContent, ctx, tool, isOpportunity, real?.pictures)
      const work = mkdtempSync(path.join(workRoot, 'tracy-emdash-'))
      const cache = path.join(work, 'answers.jsonl')
      /** @type {Array<{ menu: string, locale: string, from: string, to: string }>} the menu labels that name the template's company */
      const noLabels = []
      const prepared = {
        tool,
        pictureInventory: inventory,
        realPictures: real,
        work,
        cache,
        answers,
        textDoor,
        imageDoor,
        isOpportunity,
        warmed: false,
        menuLabels: noLabels,
        // Where the forms mail when the customer typed no email: the account's own address, written to the forms alone.
        recipient:
          !TOOL_EMAIL.test(String(answers.email ?? '').trim()) && ACCOUNT_EMAIL.test(String(ctx.email ?? ''))
            ? String(ctx.email)
            : null,
        siteKey: ctx.siteKey,
        /** @type {Promise<HideResult> | null} the rest of the hidden languages coming off (`hideRest`) */
        hiding: null,
        // Read once, while the site installs: the restaurant's posts, when an opportunity built this site.
        woRead,
        // …and its sourced words by slot role, where the template has a map for them (`emdash-wo-copy.js`).
        woCopy
      }
      if (!textDoor) return prepared
      // The menu labels the tool never touches are judged beside its warm-up: one small question, asked while the site installs.
      const planning =
        text && described
          ? planMenuLabels({
              model: text,
              business: {
                ...(nameAnswered(ctx.normalized) ? { name: ctx.normalized.name } : {}),
                about: briefForJudges(ctx.brief),
                sector: ctx.normalized.sector ?? null
              },
              menus: (() => {
                try {
                  return seedMenus(tool.seedDir, ctx.normalized.languages ?? [])
                } catch {
                  return []
                }
              })(),
              given: spokenOf(ctx.brief),
              signal: budgetSignal(ctx.signal, ctx.deadlineAt)
            }).catch((error) => {
              ctx.note(
                `the template's menu labels could not be judged: ${error instanceof Error ? error.message : error}`
              )
              return noLabels
            })
          : Promise.resolve(noLabels)
      try {
        const started = Date.now()
        mkdirSync(path.join(work, 'warm'))
        writeFileSync(path.join(work, 'warm', 'token'), `${WARMUP_TOKEN}\n`, { mode: 0o600 })
        const result = await run({
          args: [
            '--import',
            PRELOAD,
            ...toolArgs({
              tool,
              answers,
              imageDoor,
              site: WARMUP_ORIGIN,
              dir: path.join(work, 'warm'),
              real: false,
              noModel: false
            })
          ],
          env: environment({
            textDoor,
            imageDoor,
            extra: {
              TRACY_FETCH_MODE: 'record',
              TRACY_FETCH_CACHE: cache,
              TRACY_FETCH_SITE: WARMUP_ORIGIN,
              TRACY_FETCH_SEED: tool.seedDir
            }
          }),
          cwd: work,
          signal: budgetSignal(ctx.signal, ctx.deadlineAt)
        })
        const stats = cacheStats(result.stderr)
        // A warm-up that failed or was cut short costs time, not words: what it asked before it stopped is kept, the rest is asked live.
        if (result.killed)
          ctx.note('the words were still being made when the site came up, so the rest are made now')
        else if (![0, 3, 4].includes(result.code))
          ctx.note(
            `the words could not be made ahead (${result.stderr.trim().split('\n').at(-1) ?? 'no reason'}), so they are made now`
          )
        prepared.warmed = Boolean(stats && stats.kept > 0)
        ctx.time('warmMs', Date.now() - started)
        if (stats) ctx.time('modelCalls', stats.kept)
        prepared.menuLabels = await planning
        return prepared
      } catch (error) {
        rmSync(work, { recursive: true, force: true })
        throw error
      }
    },

    /**
     * @param {import('../brief-build.js').BriefContext} ctx
     * @param {Awaited<ReturnType<ReturnType<typeof createEmdashEngine>['prepare']>>} prepared
     */
    async apply(ctx, prepared) {
      const { origin, token } = await siteAccess(ctx.siteKey)
      const placedPictures = prepared.pictureInventory ? await pictures(ctx, prepared) : null
      const real = path.join(prepared.work, 'real')
      mkdirSync(real, { recursive: true })
      writeFileSync(path.join(real, 'token'), `${token}\n`, { mode: 0o600 })
      // The menu labels the tool has no step for: the template's own services in the footer become the customer's.
      // 🔒 BEFORE THE TOOL, NOT AFTER (TCH #1013). A root written in another language has the tool translate the seed's own
      // menu labels; run first, it turned "Industrial park infrastructure" into that language and this rename, which finds an
      // item by its seed label, found nothing. Renamed first, the item no longer holds a seed label and the tool leaves it.
      if (prepared.menuLabels.length > 0) {
        const renamedAt = Date.now()
        const renamed = await renameMenuItems({
          api: siteApi(origin, token, ctx.signal, fetchImpl),
          changes: prepared.menuLabels,
          concurrency: AT_ONCE
        })
        ctx.time('menusMs', Date.now() - renamedAt)
        ctx.time('menusRenamed', renamed.renamed)
        for (const note of renamed.notes.slice(0, 3)) ctx.note(note)
      }
      const started = Date.now()
      const preload = Boolean(prepared.textDoor)
      const result = await run({
        args: [
          ...(preload ? ['--import', PRELOAD] : []),
          ...toolArgs({
            tool: prepared.tool,
            answers: prepared.answers,
            imageDoor: prepared.imageDoor,
            site: origin,
            dir: real,
            real: true,
            noModel: !prepared.textDoor
          })
        ],
        env: environment({
          textDoor: prepared.textDoor,
          imageDoor: prepared.imageDoor,
          extra: preload
            ? { TRACY_FETCH_MODE: 'replay', TRACY_FETCH_CACHE: prepared.cache, TRACY_FETCH_SITE: origin }
            : {}
        }),
        cwd: prepared.work,
        signal: ctx.signal,
        timeoutMs: TOOL_MS
      })
      ctx.time('toolMs', Date.now() - started)
      const stats = cacheStats(result.stderr)
      if (stats) {
        ctx.time('replayHits', stats.hits)
        ctx.time('replayMisses', stats.misses)
      }
      const report = reportOf(result.stdout)
      if (result.killed) throw new Error('writing into the site took too long')
      if (!report)
        throw new Error(
          `the personalize tool gave no report (exit ${result.code}): ${result.stderr.trim().split('\n').at(-1) ?? 'no reason'}`
        )
      const errors = report.errors ?? []
      // The tool uses 4 for failed writes, 3 for skipped copy, and 0 for success. Missing copy is left for the agent;
      // an interrupted or refused write is not a completed fill and must not reach handoff.
      if (prepared.isOpportunity && (errors.length > 0 || ![0, 3].includes(result.code)))
        throw new Error(`Website Opportunities setup did not finish its writes (exit ${result.code})`)
      if (errors.length > 0)
        ctx.note(`${errors.length} write(s) were refused by the site and keep the template’s words`)
      const copySkipped = report.copy?.skipped ?? []
      if (copySkipped.length > 0 && prepared.textDoor)
        ctx.note(`${copySkipped.length} line(s) of text could not be written and keep the template’s words`)
      // 🔒 WHAT THE MODEL DID NOT WRITE IS SAID TOO, NOT ONLY THE COPY (TCH #1013, g60). A legal page whose body the model
      // answered one part short kept the template's words, and the run said nothing: the build row of g59-biz-emd-full
      // had no note while /terms read English under a Vietnamese lede. Every entry, body or card list the tool names in
      // `rewritten.skipped` (and what it put there instead) is counted here; a line without an entry is a choice, not a miss.
      const entrySkipped = (report.rewritten?.skipped ?? []).filter(
        (/** @type {any} */ s) => s && typeof s.entry === 'string'
      )
      if (entrySkipped.length > 0 && prepared.textDoor) {
        ctx.note(
          `${entrySkipped.length} entr${entrySkipped.length === 1 ? 'y' : 'ies'} of the template could not be written by the model and keep the template’s words in the site’s language`
        )
        for (const s of entrySkipped.slice(0, 3)) ctx.note(`${s.entry}: ${String(s.why ?? '').slice(0, 160)}`)
      }
      // 🔒 L4 (product owner after g65): an entry the model never wrote for the business after asking again (a vacancy of the
      // demo's trade) is emptied by the tool, never left as another company's; that is said too (`rewritten.emptied`).
      const entryEmptied = (report.rewritten?.emptied ?? []).filter(
        (/** @type {any} */ s) => s && typeof s.entry === 'string'
      )
      if (entryEmptied.length > 0 && prepared.textDoor) {
        ctx.note(
          `${entryEmptied.length} entr${entryEmptied.length === 1 ? 'y of the template was' : 'ies of the template were'} not written for the business after asking again and ${entryEmptied.length === 1 ? 'was' : 'were'} emptied, never left as another company’s`
        )
        for (const s of entryEmptied.slice(0, 3)) ctx.note(`${s.entry}: ${String(s.why ?? '').slice(0, 160)}`)
      }
      const pictureSkipped = report.pictures?.skipped ?? []
      if (pictureSkipped.length > 0 && prepared.imageDoor)
        ctx.note(`${pictureSkipped.length} picture(s) could not be placed, so the template keeps its own`)
      for (const s of report.skipped ?? []) if (s.rule === 'language') ctx.note(String(s.why).slice(0, 160))
      // 🔒 THE TAG THE PAGE PRINTS IS A FILE OF THE SITE, NOT OF THIS RUN (#1013). The tool decides it (`report.displayLocale`,
      // `{ en: 'vi-VN' }` for a root written in Vietnamese) and writes it beside its receipts, which here is this run's
      // scratch folder, deleted at `dispose`. The template reads `<SITE_DATA_DIR>/display-locale.json`, so until 08/10/2026
      // every site Apply wrote in another language still said `<html lang="en">`. The site's host writes it there.
      const shown = report.displayLocale
      if (displayLocale && shown && typeof shown === 'object' && !Array.isArray(shown)) {
        try {
          await displayLocale(ctx.siteKey, shown)
          ctx.time('displayLocale', Object.keys(shown).length)
        } catch (error) {
          const tags = Object.values(shown).join(', ') || 'its own'
          ctx.note(
            `the site could not be told to name its language ${tags}, so its pages keep the template's tag: ${error instanceof Error ? error.message : error}`
          )
        }
      }
      // 🔒 THE RESTAURANT'S SOURCED WORDS RIGHT AFTER THE TOOL, whose model writes the same hero and About fields. Before the
      // posts: two entries every visitor sees first, on collections the posts step never touches. A failure is said, never the build's.
      if (prepared.woCopy && woContent) {
        const wroteAt = Date.now()
        const done = await writeWoCopy({
          api: siteApi(origin, token, ctx.signal, fetchImpl),
          copy: prepared.woCopy.copy,
          map: prepared.woCopy.map,
          seed: prepared.woCopy.seed,
          slotRoles: prepared.woCopy.slotRoles,
          locale: prepared.woCopy.locale,
          pictures: prepared.woCopy.pictures ?? [],
          woContent,
          note: ctx.note
        }).catch((error) => {
          if (prepared.isOpportunity) throw error
          ctx.note(
            `the restaurant's words could not be written, so the model's stay: ${error instanceof Error ? error.message : error}`
          )
          return null
        })
        if (done) {
          ctx.time('woCopyMs', Date.now() - wroteAt)
          ctx.time('woCopyWritten', done.written)
          ctx.time('woCopySkipped', done.skipped)
          if (done.conflict > 0) ctx.time('woCopyConflict', done.conflict)
          if (done.failed > 0) ctx.time('woCopyFailed', done.failed)
          if (prepared.isOpportunity && done.failed > 0)
            throw new Error("The restaurant's sourced words could not be written")
        }
      }
      // Declared button actions run after every generic and sourced copy writer.
      const actionPlan = await woContent?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
      if (actionPlan) {
        const actions = await writeEmdashButtonActions({
          api: siteApi(origin, token, ctx.signal, fetchImpl),
          fieldMap: seedFile(prepared.tool.seedDir, 'field-map.json'),
          seed: seedFile(prepared.tool.seedDir, 'seed.json'),
          sitePlan: actionPlan,
          locale: ctx.normalized.languages?.[0] ?? 'en',
          model: (await models()).text ?? null,
          signal: ctx.signal,
          note: ctx.note,
          woContent,
          buildId: prepared.woCopy?.copy?.buildId ?? prepared.woRead?.buildId
        })
        if (actions.written) ctx.time('buttonActionsWritten', actions.written)
      }
      // 🔒 THE RESTAURANT'S POSTS RIGHT AFTER THE TOOL, which rewrites the demo posts with its model and runs once per Apply:
      // nothing of this run writes the posts after them (`emdash-wo-content.js`). A failure is said, never the build's.
      if (prepared.woRead && woContent) {
        const wroteAt = Date.now()
        try {
          const done = await writeWoPosts({
            api: siteApi(origin, token, ctx.signal, fetchImpl),
            read: prepared.woRead,
            woContent,
            slugs: rowsOf(prepared.tool.seedDir)
              .filter(
                (r) => r.collection === 'posts' && r.locale === seedDefaultLocale(prepared.tool.seedDir)
              )
              .map((r) => r.slug),
            locale: seedDefaultLocale(prepared.tool.seedDir),
            templateId: prepared.tool.templateId,
            note: ctx.note
          })
          if (done) {
            ctx.time('woPostsMs', Date.now() - wroteAt)
            ctx.time('woPostsWritten', done.written)
            ctx.time('woPostsHidden', done.hidden)
            if (done.failed > 0) ctx.time('woPostsFailed', done.failed)
            if (prepared.isOpportunity && done.failed > 0)
              throw new Error("The restaurant's sourced posts could not be written")
          }
        } catch (error) {
          if (prepared.isOpportunity) throw error
          ctx.note(
            `the restaurant's posts could not be written, so the template's posts stay: ${error instanceof Error ? error.message : error}`
          )
        }
      }
      if (prepared.recipient) {
        const mailed = await mailFormsTo({
          api: siteApi(origin, token, ctx.signal, fetchImpl),
          email: prepared.recipient,
          slugs: templateFormSlugs(prepared.tool.seedDir),
          locales: seedLocales(prepared.tool.seedDir)
        })
        ctx.time('formsMailed', mailed.moved)
        for (const note of mailed.notes.slice(0, 2)) ctx.note(note)
      }
      if (placedPictures?.bindings?.length) {
        const checked = await verifyEmdashPictureBindings({
          api: siteApi(origin, token, ctx.signal, fetchImpl),
          bindings: placedPictures.bindings
        })
        ctx.time('realPicturesAfterText', checked.verified)
        if (checked.hidden.length)
          ctx.note(
            `${checked.hidden.length} picture binding(s) belong to content hidden after text setup; render verification is still required`
          )
      }
      // Final menu labels follow kept page roles after the personalize tool and sourced copy.
      const menuPlan = await woContent?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
      if (menuPlan?.pages?.some((p) => p.decision === 'keep')) {
        const { text: menuModel } = await models()
        const menu = await writeEmdashMainMenu({
          api: siteApi(origin, token, ctx.signal, fetchImpl),
          seed: JSON.parse(readFileSync(path.join(prepared.tool.seedDir, 'seed.json'), 'utf8')),
          sitePlan: menuPlan,
          model: menuModel,
          locale: ctx.normalized.languages?.[0] ?? 'en',
          signal: ctx.signal
        })
        ctx.time('mainMenuLabels', menu.items.length)
      }
      // The rest of the languages nobody chose, once the site is handed over: not awaited here, awaited by `dispose`.
      const hidden = Array.isArray(report.language?.hidden) ? report.language.hidden.map(String) : []
      // 🔒 ITS OWN CLOCK, NEVER THE RUN'S SIGNAL: the run aborts its signal as it ends, before `dispose` waits for this
      // (measured 05/10/2026: "0 unpublished, 39 failed" on every EmDash Apply). HIDE_MS bounds it instead.
      if (hidden.length > 0)
        prepared.hiding = hideRest({
          api: siteApi(origin, token, AbortSignal.timeout(HIDE_MS), fetchImpl),
          seedDir: prepared.tool.seedDir,
          hidden
        }).catch((/** @type {unknown} */ error) => ({
          unpublished: 0,
          failed: 0,
          notReached: 0,
          served: [],
          error: error instanceof Error ? error.message : String(error)
        }))
      return {
        wrote: (report.written ?? []).length,
        kept: copySkipped.length + errors.length + entrySkipped.length
      }
    },

    /** The run's files, whatever became of it — once the hidden languages Apply left coming off are off. */
    async dispose(prepared) {
      if (prepared?.hiding) {
        // The row is final by now (`applied`), so this line is the only place the clean-up's result is said.
        const done = await prepared.hiding
        const line =
          `[brief] ${prepared.siteKey}: hidden languages after hand-over: ${done.unpublished} unpublished, ` +
          `${done.failed} failed, ${done.notReached} not reached` +
          (done.served.length > 0 ? `; left whole, still served: ${done.served.join(', ')}` : '') +
          (done.error ? `; stopped: ${done.error}` : '')
        if (done.failed > 0 || done.notReached > 0 || done.error) log.warn?.(line)
        else log.info?.(line)
      }
      if (prepared?.work) rmSync(prepared.work, { recursive: true, force: true })
    }
  }
}

/**
 * The build's sourced words, the template's slot-role map and its seed, or null: no opportunity built the site, the reader
 * cannot say (a test's `woContent` without `copyFor`), or the WO domain maps no field of this template.
 * @param {{copyFor?: Function} | null} woContent
 * @param {{siteKey: string, email: string, normalized?: {languages?: string[]}, note: (n: string) => void}} ctx
 * @param {{templateId: string, seedDir: string}} tool
 * @param {boolean} [strict]
 * @param {any[]} [pictures] - this build's (`realPictures.forSite`): a dish photo its vision accepts fills its dish's slot
 */
async function woCopyOf(woContent, ctx, tool, strict = false, pictures = []) {
  if (typeof woContent?.copyFor !== 'function') return null
  const map = emdashSlotRoles(tool.templateId)
  // A `ready` sidecar (ADR 0037) fills its groups from the place profile, over the hand-made map's roles.
  const slotRoles = emdashReadySidecar(tool.templateId)?.doc ?? null
  const seed = map || slotRoles ? seedFile(tool.seedDir, 'seed.json') : null
  if (!(map || slotRoles) || !seed) return null
  // The language the root is written in: the pinned words of the restaurant in any other stay off it.
  const lang = String(ctx.normalized?.languages?.[0] ?? 'en')
    .split('-')[0]
    .toLowerCase()
  try {
    const copy = await woContent.copyFor({
      siteKey: ctx.siteKey,
      email: ctx.email,
      lang,
      cards: cardCount(map, seed),
      ...(pictures?.length ? { pictures } : {}),
      ...(strict ? { strict: true } : {})
    })
    return copy ? { copy, map, seed, slotRoles, locale: lang, pictures: pictures ?? [] } : null
  } catch (error) {
    if (strict) throw error
    ctx.note(
      `the restaurant's words could not be read, so the model's stay: ${error instanceof Error ? error.message : error}`
    )
    return null
  }
}

/** The tool's arguments, the same for the warm-up and the real run except for the site and where it keeps its notes. */
function toolArgs({ tool, answers, imageDoor, site, dir, real, noModel }) {
  return [
    tool.tool,
    '--answers-json',
    JSON.stringify(answers),
    '--site',
    site,
    '--token-file',
    path.join(dir, 'token'),
    '--seed',
    tool.seedDir,
    '--receipts',
    path.join(dir, 'receipts.json'),
    '--hide-chrome-only',
    ...(noModel ? ['--no-model'] : []),
    ...(imageDoor && !noModel ? [] : ['--no-images']),
    ...(real ? ['--concurrency', String(AT_ONCE)] : []),
    '--json'
  ]
}
