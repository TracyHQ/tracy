/**
 * The languages of a Joomla "Apply" that the template does not ship: made from the words the site holds, translated
 * BEFORE the site exists wherever the words are already known.
 *
 * A Joomla site gets a language the template does not carry by DERIVING it (`multilingual.plan` → translate every text
 * slot → `multilingual.apply` until the plugin says it is complete): the plugin hands over the site's current words, a model
 * translates them, the plugin builds the edition. The seeder does exactly that (`tracy-seeder/src/cli.mjs` `addLanguages`)
 * and its modules do the work here — the planner that turns slots into batches and asks again for a string the plugin refused
 * (`plan-joomla-language.mjs`), the loop that drives the plugin phase by phase (`apply-joomla-language.mjs`), the
 * translations a quickstart ships for its own demo copy (`shipped-translations.mjs`).
 *
 * What changes is WHEN the model is asked. The plan the site would hand over is, for every slot the customer's text
 * wrote or the template ships, a string this process already holds: our own words, or the demo's. So each
 * translation is made while the site installs, into a cache keyed the way the planner reads it
 * (`<locale>:<limit>:<source>`), and once the site is up the real plan finds every string answered: what is left of the
 * language is the site's own work.
 *
 * 🔒 A TRANSLATION IS NEVER A GUESS KEPT. A call that failed fails the plan (`planConcurrently(…, {failure: 'throw'})`), so a
 * string whose answer never came is not cached as itself: it is asked again when the site is up, and a language
 * that cannot be made at all is said, not half-written. The plugin remains the judge of whether a translation is usable
 * (a figure that must survive, a length a slot cannot exceed); this only asks again, as the seeder does.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { seeder } from '../../lib/seeder.js'
import { planConcurrently } from './shared.js'

/** The language's English name for the prompt: `vi-VN` → "Vietnamese (Vietnam)". */
export function languageName(tag) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(String(tag)) ?? String(tag)
  } catch {
    return String(tag)
  }
}

/** The answer a translation planner is given while it is only counting its questions: every string as it is. */
const echo = ({ input }) =>
  JSON.stringify((Array.isArray(input) ? input : []).map(({ i, text }) => ({ i, text })))

/** One model turn per batch, answering with the array the planner expects. @param {{chat: Function}} model @param {AbortSignal} [signal] */
const translateWith =
  (model, signal) =>
  ({ system, input }) =>
    model.chat({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(input) }
      ],
      maxTokens: 8192,
      signal
    })

/**
 * A plan's text slots translated, every string the cache lacks asked of the model AT ONCE.
 *
 * 🔒 THE COUNTING PASS KEEPS NOTHING. `planConcurrently` runs the planner twice, first only to count its questions (each
 * answered with the string as it stands, so the planner takes it for a usable translation and SAVES it) and then for
 * real. The counting pass is given a copy of the cache: saved into the real one, its echoes would be answers, the real pass
 * would find every string "already translated", and the language would go up in the source's own words.
 * @param {object} input
 * @param {{locale: string, slots: Array<{key: string, type: string, source: string, maxCharacters: number}>}} input.plan
 * @param {Map<string, string>} input.cache - read, and filled with what the model answers
 * @param {{chat: Function}} input.model
 * @param {AbortSignal} [input.signal]
 * @param {string[]} [input.keep] - the business's own names, kept as written
 */
async function translatePlan({ plan, cache, model, signal, keep = [] }) {
  const { planLanguageTranslation, parseTranslationAnswer } = await seeder('plan-joomla-language')
  let pass = 0
  return planConcurrently(
    (ask) => {
      pass += 1
      const memory = pass === 1 ? new Map(cache) : cache
      return planLanguageTranslation({
        plan,
        languageName: languageName(plan.locale),
        keep,
        translate: async (items, system) => parseTranslationAnswer(await ask({ system, input: items })),
        read: (key) => memory.get(key),
        save: (key, value) => memory.set(key, value)
      })
    },
    translateWith(model, signal),
    { quiet: echo, failure: 'throw' }
  )
}

/**
 * Translate what is known: the strings of the source edition as they will stand once the words are written.
 * @param {object} input
 * @param {string} input.locale - a Joomla tag, `vi-VN`
 * @param {Array<{key: string, type: string, sample?: string, maxCharacters: number}>} input.slots - the template's slots, the source edition's
 * @param {Record<string, string>} input.changes - what the words will say instead of the sample, by slot key
 * @param {Map<string, string>} input.shipped - what the template ships translated, by cache key
 * @param {{chat: Function}} input.model
 * @param {AbortSignal} [input.signal]
 * @param {string[]} [input.keep] - the business's own names, kept as written
 * @returns {Promise<{cache: Map<string, string>, asked: number, failed: number, unmarked: number}>}
 */
export async function warmTranslations({ locale, slots, changes, shipped, model, signal, keep = [] }) {
  const cache = new Map(shipped)
  const plan = {
    locale,
    slots: slots
      .filter((slot) => slot.type === 'text')
      .map((slot) => ({
        key: slot.key,
        type: 'text',
        source: changes[slot.key] ?? String(slot.sample ?? ''),
        maxCharacters: slot.maxCharacters
      }))
  }
  const { result, failed } = await translatePlan({ plan, cache, model, signal, keep })
  return { cache, asked: result.asked, failed, unmarked: result.unmarked }
}

/**
 * Give the site each language, one whole edition at a time, from the translations made ahead.
 *
 * Never throws for a language: one that fails is said and the others go on, as the Build's language stage does.
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply - the Apply door as the person who pressed
 * @param {string} input.siteKey
 * @param {Array<{locale: string, cache: Map<string, string>}>} input.languages
 * @param {{chat: Function}} input.model - for the strings the cache lacks
 * @param {AbortSignal} [input.signal]
 * @param {(note: string) => void} input.note
 * @param {((name: string, fn: () => Promise<any>) => Promise<any>) & {add?: (name: string, ms: number) => void}} [input.time] - a stopwatch (`stopwatch` in `shared.js`)
 * @returns {Promise<{added: string[]}>}
 */
export async function addDerivedLanguages({
  apply,
  siteKey,
  languages,
  model,
  signal,
  note,
  time = (_name, fn) => fn()
}) {
  const [{ addJoomlaLanguage }, { doorRefusal }] = await Promise.all([
    seeder('apply-joomla-language'),
    seeder('apply-joomla-contract')
  ])
  const contract = (params) => apply({ siteKey, action: 'content.contract', params })
  const added = []
  for (const { locale, cache } of languages) {
    try {
      const plan = await time(`planLanguageMs`, () => contract({ operation: 'multilingual.plan', locale }))
      if (!plan?.ok) throw new Error(doorRefusal(plan))
      // Every string the cache answers costs nothing; the few it does not are asked now, all at once.
      const { result } = await time('translateMs', () => translatePlan({ plan, cache, model, signal }))
      // Where the time goes, for the report: the language pack, the phases the plugin commits one call at a time, the check.
      const marks = { started: Date.now(), packed: 0, phased: 0 }
      await time('addLanguageMs', () =>
        addJoomlaLanguage({
          apply,
          siteKey,
          locale,
          translations: result.translations,
          expectedRevision: plan.revision,
          contract: plan.contract,
          // The first line is said once the pack is in; every phase after it moves the last mark.
          log: () => {
            marks.packed ||= Date.now()
          },
          onPhase: () => {
            marks.phased = Date.now()
          }
        })
      )
      if (marks.packed && marks.phased) {
        time.add?.('languagePackMs', marks.packed - marks.started)
        time.add?.('languagePhasesMs', marks.phased - marks.packed)
        time.add?.('languageVerifyMs', Date.now() - marks.phased)
      }
      added.push(locale)
    } catch (error) {
      note(
        `the ${languageName(String(locale).split('-')[0])} version could not be added: ${error instanceof Error ? error.message : error}`
      )
    }
  }
  return { added }
}

/** How the Claude Cowork plugin masks a content slot in a presentation (`MultilingualProfile::CONTENT_SLOT`): never words. */
export const CONTENT_SLOT_MASK = '__CONTENT_SLOT__'

/** The longest heading the Claude Cowork plugin takes: a module title is a VARCHAR(100). */
const HEADING_MAX = 100

/** The longest module words the Claude Cowork plugin takes from a written language (`WRITTEN_TEXT_MAX`). */
const MODULE_WORDS_MAX = 400

/**
 * The params in which a module keeps words a visitor reads, per module type, as the Claude Cowork plugin lists them
 * (`QuickstartContract::WRITTEN_MODULE_TEXTS`): an AcyMailing form's "Join 70,000 subscribers!" and "Sign up" on JA
 * Essence. The plugin decides what it takes; this copy only lets them be translated before the site exists, and a word
 * it misses is asked of the model when the site's own plan names it.
 */
const MODULE_WORDS = /** @type {Record<string, string[]>} */ ({
  mod_acym: ['introtext', 'posttext', 'subtext', 'subtextlogged', 'unsubtext', 'confirmation_message'],
  mod_login: ['pretext', 'posttext'],
  mod_finder: ['alt_label'],
  mod_jaquickcontact: ['intro_text', 'thank_msg', 'sender_label', 'email_label', 'message_label']
})

/** The plain words of one module's listed params, as slots keyed `<key>.params.<name>`. @param {string} key @param {any} row */
function moduleWords(key, row) {
  const names = MODULE_WORDS[String(row.module ?? '')]
  if (!names) return []
  let params
  try {
    params = JSON.parse(String(row.params ?? '{}'))
  } catch {
    return []
  }
  return names
    .map((name) => [name, params?.[name]])
    .filter(([, value]) => typeof value === 'string' && /\p{L}/u.test(value) && !/[<>]/.test(value))
    .map(([name, value]) => ({
      key: `${key}.params.${name}`,
      type: 'text',
      sample: String(value),
      maxCharacters: MODULE_WORDS_MAX
    }))
}

/** @type {Map<string, Array<{key: string, type: string, sample: string, maxCharacters: number}>>} */
const headingsByContract = new Map()

/**
 * The headings a source edition shows that the base contract has no slot for: every front-end module of the source (or of
 * every language) that is published and SHOWS its title — Tracy Business's footer columns "Services", "Company",
 * "Contact" — and the words such a module keeps in its params (`MODULE_WORDS`, JA Essence's newsletter line). Read from
 * the contract's presentation lock, the way the plugin reads them from the binding a fresh site starts with
 * (`QuickstartContract::writtenTitles`, `writtenModuleTexts`), so they can be translated before the site exists.
 * @param {{id: string, dir: string}} contract
 * @param {string} source - the tag the source edition is published under
 */
export function sourceHeadings(contract, source) {
  let headings = headingsByContract.get(contract.id)
  if (!headings) {
    headings = []
    try {
      const lock = JSON.parse(readFileSync(path.join(contract.dir, 'presentation-lock.json'), 'utf8'))
      for (const [key, row] of Object.entries(lock.entities ?? {})) {
        if (!/^module-\d+$/.test(key)) continue
        if (String(row.client_id ?? '0') !== '0' || String(row.published ?? '0') !== '1') continue
        if (!['*', source].includes(String(row.language ?? ''))) continue
        if (String(row.showtitle ?? '0') === '1')
          headings.push({
            key: `${key}.title`,
            type: 'text',
            sample: String(row.title ?? ''),
            maxCharacters: HEADING_MAX
          })
        headings.push(...moduleWords(key, row))
      }
    } catch {
      // A contract without a readable lock has no headings to make ahead: the site's own plan still names them.
    }
    headingsByContract.set(contract.id, headings)
  }
  return headings
}

/**
 * The headings a plan names, in `locale`: the cache first, the model for the rest, and only what the plugin takes (plain text
 * within the limit, with words in it). Throws what the model throws.
 * @param {object} input
 * @param {Array<{ key: string, type: string, source: string, maxCharacters: number }>} input.slots
 * @param {string} input.locale
 * @param {Map<string, string>} input.cache
 * @param {{chat: Function} | null} input.model
 * @param {AbortSignal} [input.signal]
 * @returns {Promise<Record<string, string>>}
 */
async function headingWords({ slots: named, locale, cache, model, signal }) {
  // 🔒 THE MASK IS NO HEADING (25/10/2026, JA Boxing 1.0.4 vi): the plugin reads these headings off the binding's presentation,
  // which masks every CONTENT SLOT as `__CONTENT_SLOT__` (`QuickstartContract::presentation`). A heading the contract carries
  // as a slot (footer "GET IN TOUCH", a `title-btn` "Start practicing") was handed over as the mask, echoed back by the model
  // and written: 196 visible `__CONTENT_SLOT__` on 61 pages. Such a heading is the content contract's, written (and
  // translated) slot by slot, so it is neither asked nor sent here; an answer still carrying the mask is never written.
  const slots = named.filter((slot) => !String(slot.source).includes(CONTENT_SLOT_MASK))
  /** @type {Record<string, string>} */
  let translations = {}
  if (model)
    translations = (await translatePlan({ plan: { locale, slots }, cache, model, signal })).result
      .translations
  else
    for (const slot of slots) {
      const known = cache.get(`${locale}:${slot.maxCharacters}:${slot.source}`)
      if (typeof known === 'string') translations[slot.key] = known
    }
  const limits = new Map(slots.map((slot) => [slot.key, slot.maxCharacters]))
  return Object.fromEntries(
    Object.entries(translations).filter(
      ([key, text]) =>
        limits.has(key) &&
        typeof text === 'string' &&
        text.trim() !== '' &&
        !text.includes(CONTENT_SLOT_MASK) &&
        !/[<>]/.test(text) &&
        [...text].length <= (limits.get(key) ?? 0)
    )
  )
}

/**
 * Call a two-edition site's source edition by the ONE language it was written in (TCH #1013): `<html lang>`, Joomla's own
 * words and the content language follow the text, and the headings the contract has no slot for are written in it
 * (`sourceLanguage.set` with `written`, Claude Cowork plugin; the archive's hidden edition of that language trades tags with
 * the source, so nothing is merged).
 *
 * 🔒 THE PREFIX STAYS `/en/`. The plugin keeps the source's content-language row and with it its `sef`: Tracy Business keys
 * the T4 navigation, `tb-main-<sef>` and its footer menus by it in hash-locked files, so a new prefix would empty every
 * menu. The prefix is left out of the addresses instead (`dropDefaultPrefix`, D8): `/about`, and `/en/about` redirects there.
 *
 * Only after every other edition is hidden (`multilingual.retire`): the plugin refuses a tag a visitor can still reach.
 * Never throws: a site that cannot be relabelled keeps its words, and says so.
 * @param {object} input
 * @param {(params: Record<string, unknown>) => Promise<any>} input.contract - `content.contract` on the site
 * @param {string} input.locale - a Joomla tag, `vi-VN`
 * @param {Map<string, string>} input.cache - the headings translated ahead (`warmTranslations` over `sourceHeadings`)
 * @param {{chat: Function} | null} input.model - for a heading the cache lacks
 * @param {AbortSignal} [input.signal]
 * @param {(note: string) => void} input.note
 * @returns {Promise<boolean>} whether the site now declares `locale`
 */
export async function writeSourceLanguage({ contract, locale, cache, model, signal, note }) {
  const kept = `${locale} could not be made the language the site declares, so it keeps declaring en-GB`
  const said = (/** @type {any} */ answer) => String(answer?.message ?? answer?.error ?? 'the site refused')
  try {
    const plan = await contract({ operation: 'sourceLanguage.plan', locale, written: true })
    if (!plan?.ok || plan.written !== true) {
      const why = said(plan)
      note(
        /not a variant|unknown (contract|sourceLanguage) operation|unknown action|unsupported/i.test(why) ||
          (plan?.ok && plan.written !== true)
          ? `this site's Claude Cowork plugin cannot call its ${locale} words ${locale}, so the site keeps declaring en-GB`
          : `${kept}: ${why}`
      )
      return false
    }
    const slots = (Array.isArray(plan.titles) ? plan.titles : []).map((/** @type {any} */ t) => ({
      key: String(t.key),
      type: 'text',
      source: String(t.source ?? ''),
      maxCharacters: Number(t.maxCharacters) || HEADING_MAX
    }))
    /** @type {Record<string, string>} */
    let titles = {}
    if (slots.length > 0) {
      try {
        titles = await headingWords({ slots, locale, cache, model, signal })
      } catch (error) {
        note(
          `the headings could not be put into ${locale} (${error instanceof Error ? error.message : error}), so they keep the template's words`
        )
      }
    }
    const stamp = Date.now().toString(36)
    const answer = await contract({
      operation: 'sourceLanguage.set',
      locale,
      written: true,
      titles,
      apply_id: `srclang-brief-${stamp}`,
      request_id: `brief-${locale}-${stamp}`
    })
    if (answer?.ok) return true
    note(`${kept}: ${said(answer)}`)
  } catch (error) {
    note(`${kept}: ${error instanceof Error ? error.message : error}`)
  }
  return false
}

/**
 * Make the one language a one-edition site is written in its default, for the site and the administrator
 * (`siteLanguage.set`): the Claude Cowork plugin installs that language's reviewed pack and switches both, so
 * `<html lang>`, dates and Joomla's own words follow the text instead of staying en-GB (#1013, D10).
 *
 * 🔒 ONLY ON A ONE-EDITION SITE. The plugin refuses the door once the site has a second edition: switching a
 * two-edition template's default would point `/` at an edition that holds nothing. A two-edition template written in
 * one language calls its source edition by it instead (`writeSourceLanguage`). Never throws: a site that cannot be
 * switched keeps its words, and says so.
 * @param {object} input
 * @param {(params: Record<string, unknown>) => Promise<any>} input.contract - `content.contract` on the site
 * 🔒 THE HEADINGS FOLLOW (TCH #1013, LANG-2): a module that shows its title has no slot ("Newsletter", "Tags cloud" on JA
 * Essence, measured 10/10/2026 on dev g58-ess-j-full), so the headings the plan names are given in `locale` with the same
 * call, translated ahead where they are known (`cache`, `sourceHeadings`). A plugin that names none sets the language alone.
 * @param {string} input.locale - a Joomla tag, `vi-VN`
 * @param {(note: string) => void} input.note
 * @param {Map<string, string>} [input.cache] - the headings translated ahead
 * @param {{chat: Function} | null} [input.model] - for a heading the cache lacks
 * @param {AbortSignal} [input.signal]
 * @returns {Promise<boolean>} whether the site now speaks `locale`
 */
export async function setSiteLanguage({ contract, locale, note, cache = new Map(), model = null, signal }) {
  const stamp = Date.now().toString(36)
  try {
    /** @type {Record<string, string>} */
    let titles = {}
    try {
      const plan = await contract({ operation: 'siteLanguage.plan', locale })
      // A newer plugin names the date formats it rewrites itself (`dates`, to the language's own DATE_FORMAT_LC3): they are
      // information, and a date key sent back in `titles` is refused, so none is.
      const dates = new Set(
        (Array.isArray(plan?.dates) ? plan.dates : []).map((/** @type {any} */ d) => String(d?.key))
      )
      const slots = (plan?.ok && Array.isArray(plan.titles) ? plan.titles : [])
        .filter((/** @type {any} */ t) => !dates.has(String(t?.key)))
        .map((/** @type {any} */ t) => ({
          key: String(t.key),
          type: 'text',
          source: String(t.source ?? ''),
          maxCharacters: Number(t.maxCharacters) || HEADING_MAX
        }))
      if (slots.length > 0) titles = await headingWords({ slots, locale, cache, model, signal })
    } catch (error) {
      note(
        `the headings could not be put into ${locale} (${error instanceof Error ? error.message : error}), so they keep the template's words`
      )
    }
    const answer = await contract({
      operation: 'siteLanguage.set',
      locale,
      ...(Object.keys(titles).length > 0 ? { titles } : {}),
      apply_id: `slang-brief-${stamp}`,
      request_id: `brief-${locale}-${stamp}`
    })
    if (answer?.ok) {
      // 🔒 DATES ARE VISITOR WORDS (10/10/2026, DATES): the plugin writes the date formats the template's modules keep
      // (`M d, Y`) in the language's own; said in the build report, so a site still printing "Jun 09, 2023" is traced to it.
      if (typeof answer.dates === 'number')
        note(`${answer.dates} date format(s) of the template now follow ${locale}`)
      return true
    }
    const why = String(answer?.message ?? answer?.error ?? 'the site refused')
    note(
      /unknown (contract|siteLanguage) operation|unknown action|unsupported/i.test(why)
        ? `this site's Claude Cowork plugin cannot make ${locale} its default language, so Joomla keeps speaking en-GB`
        : `${locale} could not be made the site's default language: ${why}`
    )
  } catch (error) {
    note(
      `${locale} could not be made the site's default language: ${error instanceof Error ? error.message : error}`
    )
  }
  return false
}
