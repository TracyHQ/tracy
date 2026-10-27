/**
 * Gate `web-languages`: every word tracy-web says to a visitor itself — `/login`, `/verify`, the
 * team and invite pages, the no-site pages, every mail, and the `message` of the JSON refusals the
 * product shows verbatim — exists in every interface language (#753).
 *
 * SOURCE: the English dictionary `apps/tracy-web/src/lib/i18n/strings.js` (`en`). TRANSLATIONS:
 * `apps/tracy-web/src/lib/i18n/locales/<id>.json`, one per language of
 * `@tracy/core/interface-languages` with `shown: true`, English excluded.
 *
 * A file is red when:
 *   - it is missing, or is not a JSON object of strings;
 *   - a key of `en` is missing, or its translation is empty;
 *   - a key is not in `en` (a leftover from a renamed or deleted string);
 *   - its `{placeholders}` differ from the English ones (a dropped `{email}` mails a sentence with
 *     a hole in it; a renamed one prints the braces to the customer);
 *   - it contains an em dash (house style for translated copy);
 *   - it is not written one key per line, keys sorted, two-space indent (so a diff names the key).
 * And the gate is red when tracy-web's own copy of the language list (`WEB_LANGUAGES`, repeated
 * because its image cannot import `@tracy/core`) differs from the shown interface languages.
 *
 * Why a separate gate rather than a block in `check-interface-languages.ts`: that gate reads dsh's
 * loaded plugin graph and the debt ledger; tracy-web's dictionary has neither, and it never runs in
 * dsh. A missing translation here has no ledger: it is fixed in the same change or the gate stays red.
 *
 *   node scripts/check-web-languages.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const I18N_DIR = join(ROOT, 'apps/tracy-web/src/lib/i18n')

const PLACEHOLDER = /\{([a-zA-Z]+)\}/g

/** The placeholder names of one string, sorted, duplicates kept. */
export function placeholdersOf(text) {
  return [...String(text).matchAll(PLACEHOLDER)].map((m) => m[1]).sort()
}

/** The canonical text of a dictionary file: sorted keys, one per line, two-space indent. */
export function canonicalText(dict) {
  const sorted = Object.fromEntries(
    Object.keys(dict)
      .sort()
      .map((key) => [key, dict[key]])
  )
  return `${JSON.stringify(sorted, null, 2)}\n`
}

/**
 * The pure decision of this gate.
 * @param {{en: Record<string,string>, languages: string[], files: Record<string, string | undefined>, webLanguages?: readonly string[]}} input
 *   `languages`: the shown interface language ids; `files`: each language's file text (undefined
 *   when the file does not exist); `webLanguages`: tracy-web's own copy of the list.
 * @returns {string[]} one human-readable problem per line; empty when green.
 */
/**
 * Values that may read exactly as the English source (mail audit 04/10/2026: the beta mail went out
 * in English in every language and no gate noticed). A key here may equal English in every
 * language: role names stay English by decision, and the two person shapes carry only placeholders
 * and punctuation. `SAME_IN` lists a language where the word simply is the same.
 */
// Role names are translated (ADR 0028 §7), so no `role.*` key is exempt in every language.
export const SAME_AS_ENGLISH = new Set([
  'mail.n.person',
  'mail.n.reply.line',
  // "Download" is a kept English term in every language (05/10/2026) and quickstart.zip is a file name.
  'bar.templateDownload',
  // The Templates footer's "Download" link: the same kept term, alone.
  'tpl.footer.download',
  // "© {year} Tracy" is the same line in every language.
  'tpl.footer.copyright'
])
export const SAME_IN = {
  // Italian and Spanish Google Docs name this role "Editor": the native term happens to match.
  'role.editor': ['it', 'es'],
  'mail.website': ['vi', 'de', 'nl'],
  'mail.websites': ['de', 'nl'],
  'mail.removalCode': ['de', 'nl'],
  'seats.teamMovedTitle': ['de', 'it', 'nl'],
  'mail.n.badge.invitation': ['fr'],
  'mail.n.badge.mention': ['fr'],
  'mail.confirmationPlatforms': ['nl'],
  // Italian and Dutch sites label their privacy page "Privacy" (spec of 06/10/2026).
  'mail.footerPrivacy': ['it', 'nl'],
  // The French word is "Notifications", as macOS and Windows name the settings page in French.
  'onboard.stepNotify': ['fr'],
  // Public Templates pages: the word is the same in these languages (loanword or shared spelling).
  'tpl.templates': ['de', 'fr', 'nl', 'es'],
  'tpl.layoutsHeading': ['de', 'nl'],
  'tpl.desktop': ['it', 'nl'],
  'tpl.preview.desktop': ['de', 'it', 'nl'],
  'tpl.footer.privacy': ['it', 'nl'],
  'tpl.facts.style': ['fr'],
  'tpl.footer.product': ['nl'],
  'tpl.footer.legal': ['es']
}

export function webLanguageProblems({ en, languages, files, webLanguages }) {
  const problems = []
  if (webLanguages) {
    const want = languages.join(',')
    const have = [...webLanguages].join(',')
    if (want !== have)
      problems.push(
        `WEB_LANGUAGES in apps/tracy-web/src/lib/i18n/index.js is [${have}], the shown interface languages are [${want}]`
      )
  }
  const sourceKeys = Object.keys(en)
  for (const lang of languages) {
    if (lang === 'en') continue
    const where = `locales/${lang}.json`
    const text = files[lang]
    if (text === undefined) {
      problems.push(`${where}: missing (${sourceKeys.length} keys to translate)`)
      continue
    }
    let dict
    try {
      dict = JSON.parse(text)
    } catch (error) {
      problems.push(`${where}: not valid JSON (${error.message})`)
      continue
    }
    if (!dict || typeof dict !== 'object' || Array.isArray(dict)) {
      problems.push(`${where}: not a JSON object`)
      continue
    }
    for (const key of sourceKeys) {
      if (!Object.hasOwn(dict, key)) {
        problems.push(`${where}: missing key "${key}" (English: ${JSON.stringify(en[key])})`)
        continue
      }
      const value = dict[key]
      if (typeof value !== 'string' || value.trim() === '') {
        problems.push(`${where}: "${key}" is empty or not a string`)
        continue
      }
      const want = placeholdersOf(en[key]).join(',')
      const have = placeholdersOf(value).join(',')
      if (want !== have) problems.push(`${where}: "${key}" has placeholders {${have}}, English has {${want}}`)
      if (value.includes('—')) problems.push(`${where}: "${key}" contains an em dash`)
      if (value === en[key] && !SAME_AS_ENGLISH.has(key) && !(SAME_IN[key] ?? []).includes(lang))
        problems.push(
          `${where}: "${key}" is still the English text (translate it, or add it to SAME_AS_ENGLISH / SAME_IN with a reason)`
        )
    }
    for (const key of Object.keys(dict)) {
      if (!Object.hasOwn(en, key)) problems.push(`${where}: extra key "${key}" (not in strings.js)`)
    }
    if (text !== canonicalText(dict))
      problems.push(`${where}: not canonical (sorted keys, one per line, two-space indent, final newline)`)
  }
  return problems
}

async function main() {
  const { INTERFACE_LANGUAGES } = await import(
    pathToFileURL(join(ROOT, 'packages/core/tracy-core/src/interface-languages/index.mjs')).href
  )
  const languages = INTERFACE_LANGUAGES.filter((l) => l.shown).map((l) => l.id)
  const { en } = await import(pathToFileURL(join(I18N_DIR, 'strings.js')).href)
  const files = {}
  for (const lang of languages) {
    const path = join(I18N_DIR, 'locales', `${lang}.json`)
    files[lang] = existsSync(path) ? readFileSync(path, 'utf8') : undefined
  }
  // Read the list as text, not by import: importing index.js loads every locale file, and a broken
  // one should be reported by the checks above, not crash this gate before it can say which.
  const source = readFileSync(join(I18N_DIR, 'index.js'), 'utf8')
  const listed = source.match(/export const WEB_LANGUAGES = Object\.freeze\(\[([^\]]*)\]\)/)
  const webLanguages = listed ? [...listed[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]) : ['<not found>']

  const problems = webLanguageProblems({ en, languages, files, webLanguages })
  const rel = relative(ROOT, I18N_DIR)
  if (problems.length > 0) {
    console.error(`web-languages: ${problems.length} problem(s) in ${rel}`)
    for (const problem of problems) console.error(`  ${problem}`)
    console.error(
      'Fix: translate every key of strings.js into each locales/<lang>.json, same {placeholders}, no em dash, keys sorted.'
    )
    process.exit(1)
  }
  console.log(
    `web-languages: ${Object.keys(en).length} strings complete in ${languages.length - 1} languages (${rel})`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
