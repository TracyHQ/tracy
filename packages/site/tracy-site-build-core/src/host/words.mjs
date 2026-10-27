/**
 * The few sentences THIS HALF puts in front of a customer, in the languages Tracy speaks.
 *
 * ⚠ EVERY OTHER STRING OF THIS PLUGIN LIVES IN `src/client/strings.ts`, and it should stay that
 * way. dsh's dictionaries and its `t` are a CLIENT service; the host has neither. Until the
 * question panel took a decision out of the tab and put it over the composer, the host never had
 * to say anything to a person, so there was nowhere for this to go and the first draft simply
 * hardcoded English (caught on 09/09: "did you add that Leave it for now yourself?").
 *
 * So this file is the host's own small dictionary, and it carries two obligations:
 *
 *  1. **A key that also exists on the client must read the same.** `retry` is `building.retry`
 *     there, in English and in Vietnamese. `test/words.test.mjs` compares them against
 *     `src/client/strings.ts` and against `@tracy/dsh-tracy-locale-vi`, so a drift fails a test
 *     instead of shipping two spellings of one button.
 *  2. **A new sentence goes to the client if the client can say it.** This place is for what the
 *     host alone can say: the retry question, and the task-list lines it writes into the session.
 *     A stage's `detail` is the client's to translate (`host-messages.mjs`); the `details` table here
 *     is a copy of those lines for the one host-drawn place that shows a detail, the retry question.
 *
 * The language is the interface language the customer's page sent (`job.uiLang`, or `lang` on a
 * provision report), else the conversation's own; `localeOf` below says why never the harness's
 * locale setting.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { SHOWN_LANGUAGE_IDS } from '../../../../core/tracy-core/src/interface-languages/index.mjs'

/**
 * ⚠ THE TRANSLATIONS ARE DATA IN `words/<lang>.json`, AND THEY ARE READ AT RUN TIME ON PURPOSE.
 *
 * `check-language` refuses Vietnamese in a string under `packages/`, and its exemption list is
 * deliberately narrow: only the dictionary package. That comment records what a wider one cost
 * (01/09, 30 leaked lines). This plugin therefore may not carry translated strings in its SOURCE,
 * and — because `lib/index.js` is committed and scanned too (LAW #3) — not in its BUNDLE either.
 * Importing the JSON put it straight back in the bundle and the gate caught that as well (09/09).
 *
 * Reading the file keeps the words out of both. The image copies the plugin directory whole, so
 * `words/` stands beside `lib/` there exactly as it does here; the package root is found by
 * walking up to the `package.json`, which is the one path that holds from `src/` and from `lib/`.
 *
 * English is ALSO in the mail below, not only in `words/en.json`: a question with no words is
 * worse than a question in the wrong language, so a missing or unreadable file still answers.
 */
const EN = Object.freeze({
  header: 'Build on {site}',
  question: '"{task}" failed at step {n} of {total}. Try that step again?',
  retry: 'Retry this step',
  retryWhy: 'Run it again from where it stopped.',
  leave: 'Leave it for now',
  leaveWhy: 'Keep the site as it is. Retry is still in the Build tab.',
  /**
   * The retry, when what stopped the step was WHO it acted as rather than the site
   * (`AUTH_REFUSALS`). Offering "run it again" there promises something the same call cannot
   * deliver, so the label names the thing that has to happen first — and the action behind it is
   * still the retry, because `wantsRetry` reads whichever label was offered.
   */
  signIn: 'Sign in again, then retry',
  signInWhy:
    'This step was refused because nobody was signed in behind it. Reload the page, then choose this.',
  /**
   * 🔒 NO STAGE NAMES HERE. The stages are the plugin's (WordPress has `theme`, Joomla has
   * `template`), so the words for them live in the plugin's `words/<lang>.json`, which is where
   * `wordsFor` reads — the bundle carries this module into the plugin's `lib/`, and the package root
   * it walks up to is the plugin's. What stays is every line a list needs whatever the CMS.
   */
  stages: {
    skipped: '{task} (skipped)',
    copyLang: 'Write your words in {lang}',
    seedPages: 'Lay out {n} pages',
    styleWaiting: 'Apply the look (Tracy does this one)'
  },
  progress: {
    covers: '{done} of {total} pictures',
    posts: 'writing the blog',
    sections: 'writing the page'
  },
  /**
   * The task list while the fleet sets the new site up, before any stage runs: one line per step
   * the fleet reports (the route `provision`), then the line that names a stop. `failed` carries the
   * fleet's own reason as `{detail}`; `failedBare` is the same line when it gave none.
   */
  provision: {
    creating: 'Create the site',
    fetching: 'Fetch the site files',
    baseline: 'Record the starting point of the files',
    database: 'Start the database',
    importing: 'Import the database',
    configuring: 'Configure the site',
    failed: 'Site setup stopped: {detail}. Press Try again in the Build tab.',
    failedBare: 'Site setup stopped. Press Try again in the Build tab.'
  },
  // Casing is language data: `Intl` answers with a standalone form, and one of the three lowercases
  // a language name inside a sentence where that form is capitalised. Declared in all three files
  // rather than only in the one that needs it, so the shape is a single contract. (The example
  // cannot be written here: this file's words reach the committed bundle, which `check-language`
  // scans, and the example would be in the language being described.)
  langNameLower: false
})

/**
 * The interface languages a customer can pick (spec #730): the one list the picker and the
 * translation gate read too. Anything else falls back to English.
 */
const LANGS = new Set(SHOWN_LANGUAGE_IDS)

/** @type {Map<string, typeof EN>} read once per language, per process. */
const loaded = new Map()

/**
 * The package root: the nearest ancestor holding `package.json`, from a file inside it.
 *
 * From `lib/index.js` of a PLUGIN — where this module actually runs, bundled — that is the plugin's
 * root, and `words/` beside it is the plugin's. From `src/host/` of the core library it is the
 * core's root, which ships no `words/`: English, and no stage names.
 * @param {string} [from] - a `file:` URL inside the package; this module's own by default.
 * @returns {string | null}
 */
export function packageRootOf(from = import.meta.url) {
  let at = path.dirname(fileURLToPath(from))
  for (;;) {
    if (readable(path.join(at, 'package.json'))) return at
    const up = path.dirname(at)
    if (up === at) return null
    at = up
  }
}

/** @type {string | null | undefined} where `words/` is looked for; undefined = this package's root. */
let wordsRoot

/**
 * Point `wordsFor` at another package's `words/` — a test's fixture, or a plugin that for some
 * reason does not bundle this module. Clears what was read before, since the answer changed.
 * @param {string | null} root - a package root, or null to go back to this module's own.
 */
export function setWordsRoot(root) {
  wordsRoot = root ?? undefined
  loaded.clear()
}

function packageRoot() {
  return wordsRoot === undefined ? packageRootOf() : wordsRoot
}

/** @param {string} file */
function readable(file) {
  try {
    readFileSync(file)
    return true
  } catch {
    return false
  }
}

/** @param {string} lang @returns {typeof EN} */
function table(lang) {
  const have = loaded.get(lang)
  if (have) return have
  const root = packageRoot()
  let words = EN
  if (root !== null) {
    try {
      const parsed = JSON.parse(readFileSync(path.join(root, 'words', `${lang}.json`), 'utf8'))
      // Every key of the English table must be present and of the same shape, or the panel and the
      // task list show holes. A partial file is not a translation, it is a bug, and English is the
      // honest answer to it.
      const whole = Object.entries(EN).every(([key, value]) =>
        typeof value === 'string'
          ? typeof parsed[key] === 'string' && parsed[key] !== ''
          : Object.keys(value).every((inner) => typeof parsed[key]?.[inner] === 'string')
      )
      // The stage table is the plugin's: any set of keys, every one a sentence.
      const stagesOk =
        parsed.stages &&
        typeof parsed.stages === 'object' &&
        Object.values(parsed.stages).every((v) => typeof v === 'string' && v !== '')
      // So is the table of host sentences (`details`), and it is optional: a code it lacks reads
      // in English (`detailIn`), the same as on the client.
      const detailsOk =
        parsed.details === undefined ||
        (parsed.details &&
          typeof parsed.details === 'object' &&
          Object.values(parsed.details).every((v) => typeof v === 'string' && v !== ''))
      if (whole && stagesOk && detailsOk) words = Object.freeze(parsed)
    } catch {
      // A missing or broken file leaves English in place.
    }
  }
  // A supported language whose file is missing or broken reads the plugin's ENGLISH file, not the
  // bare frame: the frame names no stage (the same rule `wordsFor` applies to an unknown language).
  if (words === EN && lang !== 'en') words = table('en')
  loaded.set(lang, words)
  return words
}

/**
 * The dictionary for a language tag, English when it is unknown or missing.
 *
 * A tag may carry a region (`vi-VN`), which `@tracy/i18n` maps to `vi`; doing the same here by
 * taking the primary subtag keeps this file from needing that table.
 * @param {unknown} tag - a BCP-47-ish language tag, or anything at all.
 * @returns {typeof EN}
 */
export function wordsFor(tag) {
  const primary = typeof tag === 'string' ? tag.toLowerCase().split(/[-_]/)[0] : ''
  // A language Tracy does not speak reads the plugin's ENGLISH file, not the bare frame: the frame
  // names no stage, and a French customer is owed "Check the site" rather than "check".
  return table(LANGS.has(primary) ? primary : 'en')
}

/**
 * The catalogue a reader's tag resolves to — English when Tracy does not speak theirs.
 *
 * `wordsFor` answers with words and says nothing about which language they are in, and a caller
 * that reaches for `Intl` needs to know: asking `Intl` in French while the sentence around it is
 * English gives half a line in each.
 * @param {unknown} tag @returns {string}
 */
export function spokenLang(tag) {
  const primary = typeof tag === 'string' ? tag.toLowerCase().split(/[-_]/)[0] : ''
  return LANGS.has(primary) ? primary : 'en'
}

/**
 * The language the CUSTOMER IS SPEAKING, read from what they typed in this session.
 *
 * ⚠ NOT the harness's `locale` setting. That row says what language the INTERFACE is in, and the
 * two come apart the moment they differ: measured 09/09, a session whose chat and whose whole
 * screen were English carried a task list reading "Kiem tra site", because the setting on that
 * machine said `vi` (Lee: do not take the language from dsh's global setting). What the panel and
 * the task list must match is the conversation they appear inside.
 *
 * dsh carries no conversation language — there is no such field on a session or an agent — so it
 * is read off the messages. Script tells Tracy's three apart and needs no model: Vietnamese by its
 * diacritics, Chinese by Han characters, English by neither being present.
 *
 * 🔒 ONLY WHAT A PERSON TYPED counts. A plugin's own injected lines are English by construction
 * (`settledLine`), and so is the sentence the Build form sends on the customer's behalf; folding
 * either in would answer English for every customer alive. `user/message` events whose source is
 * `user` are the ones a person actually sent.
 */

/** Vietnamese-only letters: the marked vowels and d-with-stroke, in both cases. */
const VIETNAMESE =
  /[\u00e0-\u00e3\u00e8-\u00ea\u00ec\u00ed\u00f2-\u00f5\u00f9\u00fa\u00fd\u0103\u0111\u0129\u0169\u01a1\u01b0\u1ea1-\u1ef9]/i
/** Han characters, which cover the zh catalogue. */
const HAN = /[\u4e00-\u9fff]/

/**
 * The language one piece of text is written in, or null when its script says nothing — which plain
 * English and most Latin-script languages do. The caller then reads the next message.
 * @param {string} text
 * @returns {'vi' | 'zh' | null}
 */
export function scriptOf(text) {
  if (HAN.test(text)) return 'zh'
  if (VIETNAMESE.test(text)) return 'vi'
  return null
}

/**
 * The language to speak to whoever is in this session.
 *
 * Newest message first, because a customer who switches language means the new one. English is the
 * answer when nothing in the log says otherwise: every catalogue has it, and a session that has
 * said nothing yet has given no reason to choose another.
 * @param {{ snapshotEvents?: () => readonly unknown[] } | undefined} session
 * @param {number} [look] - how many of the newest person-sent messages to read.
 * @returns {string}
 */
export function localeOf(session, look = 12) {
  let events
  try {
    events = session?.snapshotEvents?.()
  } catch {
    return 'en'
  }
  if (!Array.isArray(events)) return 'en'
  let read = 0
  for (let i = events.length - 1; i >= 0 && read < look; i -= 1) {
    const event = /** @type {{ type?: string, data?: { source?: { kind?: string }, content?: unknown } }} */ (
      events[i]
    )
    if (event?.type !== 'user/message') continue
    if (event.data?.source?.kind !== 'user') continue
    read += 1
    const blocks = Array.isArray(event.data.content) ? event.data.content : []
    const text = blocks
      .map((block) => (block && typeof block === 'object' && 'text' in block ? String(block.text ?? '') : ''))
      .join(' ')
    const said = scriptOf(text)
    if (said !== null) return said
  }
  return 'en'
}

/**
 * A stage's `detail` in the reader's language, for what the HOST itself shows (the retry question).
 *
 * The same rule the Build tab follows on the client (`hostText`): a detail with a code the plugin's
 * `words/<lang>.json` translates is read in that language; anything else — no code, an unknown
 * code, a language without the line — is the detail as written. The `details` table is a copy of the
 * client catalogue's `host.*` lines, kept equal by `test/host-words.test.mjs`.
 * @param {{ detail?: string, detailCode?: string, detailParams?: Record<string, string | number> }} stage
 * @param {unknown} lang - the reader's language tag.
 * @returns {string | undefined}
 */
export function detailIn(stage, lang) {
  const code = stage.detailCode
  if (typeof code !== 'string' || code === '') return stage.detail
  const words = /** @type {{ details?: Record<string, string> }} */ (wordsFor(lang))
  const template = words.details?.[code]
  if (typeof template !== 'string') return stage.detail
  return fill(template, stage.detailParams ?? {})
}

/** Fill `{name}` holes, the same shape the client's `t` uses. @param {string} text @param {Record<string, string | number>} into */
export function fill(text, into) {
  return text.replace(/\{(\w+)\}/g, (whole, key) => (key in into ? String(into[key]) : whole))
}
