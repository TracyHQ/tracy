/**
 * Gate: every translated language keeps the terms of `terms.ts` verbatim (05/10/2026).
 *
 * Every catalogue Tracy ships in the seven translated languages: Vietnamese
 * (`packages/locale/tracy-locale-vi/vi`) and the six of `packages/locale/tracy-locales` for the dsh
 * plugins, tracy-web's server pages (`apps/tracy-web/src/lib/i18n/locales`), `@tracy/i18n`
 * (`packages/locale/tracy-i18n/src/locales`) and the sign-in door (`vendor/tracy/dsh-passwords`). For each Tracy namespace, an English
 * source that holds a listed term must hold it in every translation. Missing keys and
 * placeholders belong to `interface-languages` and `dsh-locale`; this gate reads only terms.
 *
 * Why a gate: a translator (person or model) renders "file" as "Datei" or "文件" by reflex, the
 * string still shows, and nobody notices until the screen disagrees with the docs and the API.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lostTerms, type LostTerm } from './lib/kept-terms.ts'
import { OWNED } from './lib/tracy-owned-namespaces.ts'
import { en as webEnglish } from '../apps/tracy-web/src/lib/i18n/strings.js'
import { t as gatewayText } from '../vendor/tracy/dsh-passwords/src/tracy/i18n/index.ts'

// The password plugin's card dictionaries. Imported by a path held in a variable so the scripts'
// typecheck does not follow it: that file augments a dsh client module this workspace does not hold.
const cardLocales: string = '../vendor/tracy/dsh-passwords/src/client/locales.ts'
const { en: doorCardEnglish, zh: doorCardChinese } = createRequire(import.meta.url)(cardLocales) as {
  en: Record<string, unknown>
  zh: Record<string, unknown>
}

const ROOT = resolve(import.meta.dirname, '..')

/** The seven translated catalogues, by language. */
export const CATALOGUE_DIRS: Readonly<Record<string, string>> = {
  vi: 'packages/locale/tracy-locale-vi/vi',
  de: 'packages/locale/tracy-locales/de',
  it: 'packages/locale/tracy-locales/it',
  fr: 'packages/locale/tracy-locales/fr',
  nl: 'packages/locale/tracy-locales/nl',
  zh: 'packages/locale/tracy-locales/zh',
  es: 'packages/locale/tracy-locales/es'
}

type Dict = Record<string, string>

/** A nested catalogue flattened to dotted keys (`@tracy/i18n`, tracy-web). */
function flat(node: unknown, prefix = ''): Dict {
  const out: Dict = {}
  if (node === null || typeof node !== 'object') return out
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === 'string') out[prefix + key] = value
    else Object.assign(out, flat(value, `${prefix}${key}.`))
  }
  return out
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(join(ROOT, path), 'utf8'))

/** The catalogues outside the dsh plugins: tracy-web's pages, `@tracy/i18n`, the sign-in door. */
function otherSurfaces(): LostTerm[] {
  const out: LostTerm[] = []
  const web = flat(webEnglish)
  for (const lang of Object.keys(CATALOGUE_DIRS)) {
    const file = `apps/tracy-web/src/lib/i18n/locales/${lang}.json`
    if (existsSync(join(ROOT, file))) out.push(...lostTerms(lang, 'tracy-web', web, flat(readJson(file))))
  }
  const i18nEnglish = flat(readJson('packages/locale/tracy-i18n/src/locales/en-us.json'))
  for (const [lang, file] of [
    ['vi', 'vi-vn'],
    ['zh', 'zh-cn']
  ] as const) {
    const path = `packages/locale/tracy-i18n/src/locales/${file}.json`
    out.push(...lostTerms(lang, 'tracy-i18n', i18nEnglish, flat(readJson(path))))
  }
  // The password plugin's card (`dshpw`), as Tracy translates it in `tracy-locales`. The Vietnamese
  // one lives in the community pack (`vendor/tracy/dsh-locale-vi`), which Tracy does not patch.
  const cardEnglish = flat(doorCardEnglish)
  for (const lang of ['de', 'it', 'fr', 'nl', 'es']) {
    const path = `packages/locale/tracy-locales/${lang}/dshpw.json`
    if (existsSync(join(ROOT, path))) out.push(...lostTerms(lang, 'dshpw', cardEnglish, flat(readJson(path))))
  }
  // The card's Chinese is written in the fork itself (`src/client/locales.ts`).
  out.push(...lostTerms('zh', 'dshpw', cardEnglish, flat(doorCardChinese)))
  const doorDir = 'vendor/tracy/dsh-passwords/src/tracy/i18n/locales'
  // No silent skip: a moved folder would make this gate green while it reads nothing.
  if (!existsSync(join(ROOT, doorDir, 'vi.json'))) throw new Error(`kept-terms: ${doorDir}/vi.json not found`)
  {
    const keys = Object.keys(readJson(`${doorDir}/vi.json`) as Dict)
    const english = Object.fromEntries(keys.map((key) => [key, gatewayText('en', key)]))
    for (const lang of ['vi', 'de', 'it', 'fr', 'nl', 'es']) {
      out.push(...lostTerms(lang, 'dsh-passwords', english, readJson(`${doorDir}/${lang}.json`) as Dict))
    }
    const chinese = Object.fromEntries(keys.map((key) => [key, gatewayText('zh', key)]))
    out.push(...lostTerms('zh', 'dsh-passwords', english, chinese))
  }
  return out
}

/** Every lost term in every shipped catalogue. */
export function allLostTerms(): LostTerm[] {
  const out: LostTerm[] = [...otherSurfaces()]
  for (const [lang, dir] of Object.entries(CATALOGUE_DIRS)) {
    for (const [ns, source] of Object.entries(OWNED as Record<string, Record<string, string>>)) {
      const file = join(ROOT, dir, `${ns}.json`)
      if (!existsSync(file)) continue
      out.push(...lostTerms(lang, ns, source, JSON.parse(readFileSync(file, 'utf8'))))
    }
  }
  return out
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lost = allLostTerms()
  if (lost.length === 0) {
    process.stdout.write('kept-terms: every translation keeps every listed term.\n')
  } else {
    const byLang = new Map<string, number>()
    for (const l of lost) byLang.set(l.lang, (byLang.get(l.lang) ?? 0) + 1)
    process.stdout.write(`kept-terms: ${lost.length} translation(s) dropped a listed term (terms.ts):\n`)
    for (const l of lost)
      process.stdout.write(`  ${l.lang} ${l.ns}.${l.key}: keep "${l.term}" — en: ${l.source}\n`)
    process.stdout.write(`by language: ${[...byLang].map(([k, v]) => `${k} ${v}`).join(', ')}\n`)
    // exitCode, not exit(): a piped stdout must drain before the process ends.
    process.exitCode = 1
  }
}
