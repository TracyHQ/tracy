#!/usr/bin/env node
/**
 * Generate the sign-in waiting page's words (src/signin-waiting-strings.json) in the eight interface
 * languages, from the SAME source as tracy-web's pages: `apps/tracy-web/src/lib/i18n` (`strings.js`
 * for English, `locales/<id>.json` for the rest) — tasks/todo-desktop-onboard-v2.md, contract 4: no
 * second hand-written set. The app carries the result (the page is local and must work offline).
 *
 * build/waiting-strings.source.json names the keys and stands in for any key tracy-web does not have
 * yet; a key tracy-web has always wins. Once every key lives in tracy-web the stand-in values can go.
 * JSON, not JS: translations are data (gate `language` scans code files).
 *
 *   node build/waiting-strings.mjs           # write src/signin-waiting-strings.json
 *   node build/waiting-strings.mjs --check   # fail when the committed file differs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WEB_I18N = path.resolve(PKG, '../../../apps/tracy-web/src/lib/i18n')
const OUT = path.join(PKG, 'src/signin-waiting-strings.json')
const LANGUAGES = ['en', 'vi', 'de', 'it', 'fr', 'nl', 'zh', 'es']

const source = JSON.parse(readFileSync(path.join(PKG, 'build/waiting-strings.source.json'), 'utf8'))
const { en } = await import(pathToFileURL(path.join(WEB_I18N, 'strings.js')).href)
const web = Object.fromEntries(
  LANGUAGES.map((id) => [
    id,
    id === 'en' ? en : JSON.parse(readFileSync(path.join(WEB_I18N, 'locales', `${id}.json`), 'utf8'))
  ])
)

const keys = Object.keys(source.en)
const words = Object.fromEntries(
  LANGUAGES.map((id) => [
    id,
    Object.fromEntries(
      keys.map((key) => {
        const value = web[id][key] ?? source[id]?.[key]
        if (typeof value !== 'string' || value === '')
          throw new Error(`waiting-strings: no ${id} text for ${key}`)
        return [key, value]
      })
    )
  ])
)
const text = `${JSON.stringify(words, null, 2)}\n`

if (process.argv.includes('--check')) {
  let committed = ''
  try {
    committed = readFileSync(OUT, 'utf8')
  } catch {
    // missing: differs
  }
  if (committed !== text) {
    process.stderr.write(
      'waiting-strings: src/signin-waiting-strings.json is stale; run node build/waiting-strings.mjs\n'
    )
    process.exit(1)
  }
} else {
  writeFileSync(OUT, text)
  const fromWeb = keys.filter((key) => en[key] !== undefined).length
  process.stdout.write(
    `waiting-strings: ${keys.length} keys × ${LANGUAGES.length} languages (${fromWeb} from tracy-web)\n`
  )
}
