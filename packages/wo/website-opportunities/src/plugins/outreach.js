/**
 * Outreach templates: the text of a first message in one language. Built-in languages live in
 * `src/outreach-templates.json` (keyed by language); a language can also be one folder, `outreach/<lang>/`, with one
 * file per kind of message. The only kind today is `demo.json`: the offer of a demo website.
 *
 * A template has five strings with the placeholders `{place}`, `{url}` and `{expires}`: `greeting`, `body` (must hold
 * `{url}`), `expiry` (closing line when the demo has an end date, must hold `{expires}`), `kept` (closing line when
 * it has none) and `subject`. Read once, synchronously, when the module loads; a malformed file stops the start.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const OUTREACH_DIR = fileURLToPath(new URL('./outreach/', import.meta.url))
export const BUILT_IN_TEMPLATES_FILE = fileURLToPath(new URL('../outreach-templates.json', import.meta.url))
export const MESSAGE_KINDS = Object.freeze(['demo'])
export const TEMPLATE_KEYS = Object.freeze(['greeting', 'body', 'expiry', 'kept', 'subject'])
const LANGUAGE = /^[a-z]{2,3}(-[A-Z]{2})?$/
const REQUIRED_PLACEHOLDER = { body: '{url}', expiry: '{expires}' }

/** The template, checked and frozen; a TypeError names the language, the kind and what is wrong. */
export function checkOutreachTemplate(language, kind, template) {
  const where = `outreach template ${language}/${kind}`
  if (!LANGUAGE.test(language)) throw new TypeError(`${where}: ${language} is not a language code`)
  if (!MESSAGE_KINDS.includes(kind))
    throw new TypeError(`${where}: the kinds are ${MESSAGE_KINDS.join(', ')}`)
  if (!template || typeof template !== 'object' || Array.isArray(template))
    throw new TypeError(`${where}: not an object`)
  const keys = Object.keys(template)
  const unknown = keys.filter((k) => !TEMPLATE_KEYS.includes(k))
  if (unknown.length) throw new TypeError(`${where}: unknown keys ${unknown.join(', ')}`)
  for (const key of TEMPLATE_KEYS) {
    if (typeof template[key] !== 'string' || !template[key].trim())
      throw new TypeError(`${where}: ${key} is missing`)
    const needed = REQUIRED_PLACEHOLDER[key]
    if (needed && !template[key].includes(needed))
      throw new TypeError(`${where}: ${key} must contain ${needed}`)
  }
  return Object.freeze(Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, template[k]])))
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/** `{ [kind]: template }` of each `outreach/<lang>/` folder in `dir`, by language. */
function readFolders(dir) {
  const out = {}
  const languages = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
  for (const language of languages) {
    const files = readdirSync(join(dir, language))
      .filter((f) => f.endsWith('.json'))
      .sort()
    out[language] = Object.fromEntries(
      files.map((f) => {
        const kind = f.slice(0, -'.json'.length)
        return [kind, checkOutreachTemplate(language, kind, readJson(join(dir, language, f)))]
      })
    )
  }
  return out
}

/**
 * Every template by language and kind: the built-in file's, then each folder's. A language in two places is
 * refused: it would leave two texts to keep in step.
 * @returns {Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>}
 */
export function readOutreachTemplates({ builtInFile = BUILT_IN_TEMPLATES_FILE, dirs = [OUTREACH_DIR] } = {}) {
  const all = {}
  const add = (language, kinds, from) => {
    if (Object.hasOwn(all, language))
      throw new TypeError(`outreach templates for ${language} are defined twice (${from})`)
    all[language] = Object.freeze(kinds)
  }
  for (const [language, template] of Object.entries(builtInFile ? readJson(builtInFile) : {}))
    add(language, { demo: checkOutreachTemplate(language, 'demo', template) }, builtInFile)
  for (const dir of dirs)
    for (const [language, kinds] of Object.entries(readFolders(dir))) add(language, kinds, dir)
  if (!all.en?.demo)
    throw new TypeError('outreach templates: English (en/demo) is required, it is the fallback')
  return Object.freeze(all)
}

export const OUTREACH_TEMPLATES = readOutreachTemplates()

/** The demo-offer template of each language, the shape `outreach.js` renders. */
export const DEMO_TEMPLATES = Object.freeze(
  Object.fromEntries(
    Object.entries(OUTREACH_TEMPLATES)
      .filter(([, kinds]) => kinds.demo)
      .map(([language, kinds]) => [language, kinds.demo])
  )
)

/** The languages a message can be drafted in. */
export const OUTREACH_LANGUAGES = Object.freeze(Object.keys(DEMO_TEMPLATES))
