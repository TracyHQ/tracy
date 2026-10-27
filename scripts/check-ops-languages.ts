/**
 * Gate `ops-languages`: every word the /ops SPA (`@tracy/harness-web`) says through its dictionaries
 * exists in every interface language, for every namespace under `src/i18n/ns/`, and the screens a
 * namespace owns hold no bare English (plan `tasks/todo-ops-i18n.md`, D2). No debt ledger: a gap
 * is fixed in the change that opens it. What counts as a problem: `scripts/lib/ops-dictionaries.ts`.
 *
 *   pnpm exec tsx scripts/check-ops-languages.ts                     # check
 *   pnpm exec tsx scripts/check-ops-languages.ts --accept-sources    # record every namespace's English
 *   pnpm exec tsx scripts/check-ops-languages.ts --accept-sources shell   # only the named ones
 *
 * Per-namespace fingerprint files, so two changes on two namespaces never touch the same file.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { INTERFACE_LANGUAGES } from '../packages/core/tracy-core/src/interface-languages/index.mjs'
import { fingerprintText, type NamespaceModule, opsLanguageProblems } from './lib/ops-dictionaries.ts'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'packages/web/tracy-harness/src')
const I18N = join(SRC, 'i18n')

const readIf = (path: string): string | undefined =>
  existsSync(path) ? readFileSync(path, 'utf8') : undefined
const listDir = (path: string): string[] => (existsSync(path) ? readdirSync(path).sort() : [])

async function main(): Promise<void> {
  const files = listDir(join(I18N, 'ns')).filter((f) => f.endsWith('.ts'))
  const namespaces: NamespaceModule[] = []
  for (const file of files) {
    const mod = (await import(pathToFileURL(join(I18N, 'ns', file)).href)) as Record<string, unknown>
    namespaces.push({ file, NS: mod.NS, SCREENS: mod.SCREENS, en: mod.en })
  }

  const acceptAt = process.argv.indexOf('--accept-sources')
  if (acceptAt !== -1) {
    const only = process.argv.slice(acceptAt + 1).filter((a) => !a.startsWith('--'))
    const chosen = namespaces.filter((m) => only.length === 0 || only.includes(m.file.replace(/\.ts$/, '')))
    for (const mod of chosen) {
      const ns = mod.file.replace(/\.ts$/, '')
      if (mod.en === null || typeof mod.en !== 'object') continue
      writeFileSync(
        join(I18N, 'fingerprints', `${ns}.json`),
        fingerprintText(mod.en as Record<string, string>)
      )
      console.log(`ops-languages: English of ${ns} recorded (${String(Object.keys(mod.en).length)} keys)`)
    }
    return
  }

  const locales: Record<string, Record<string, string | undefined>> = {}
  for (const lang of listDir(join(I18N, 'locales'))) {
    const dir = join(I18N, 'locales', lang)
    if (!statSync(dir).isDirectory()) continue
    locales[lang] = {}
    for (const file of listDir(dir).filter((f) => f.endsWith('.json')))
      locales[lang][file.replace(/\.json$/, '')] = readFileSync(join(dir, file), 'utf8')
  }
  const fingerprints: Record<string, string | undefined> = {}
  const screens: Record<string, string | undefined> = {}
  for (const mod of namespaces) {
    const ns = mod.file.replace(/\.ts$/, '')
    fingerprints[ns] = readIf(join(I18N, 'fingerprints', `${ns}.json`))
    if (Array.isArray(mod.SCREENS))
      for (const screen of mod.SCREENS)
        if (typeof screen === 'string') screens[screen] = readIf(join(SRC, screen))
  }

  const languages = INTERFACE_LANGUAGES.filter((l) => l.shown).map((l) => l.id)
  const problems = opsLanguageProblems({ languages, namespaces, locales, fingerprints, screens })
  if (problems.length > 0) {
    console.error(
      `ops-languages: ${String(problems.length)} problem(s) in packages/web/tracy-harness/src/i18n\n`
    )
    console.error(problems.map((p) => `  ${p}`).join('\n'))
    console.error(
      '\n  Translate every key of ns/<ns>.ts into each locales/<lang>/<ns>.json (same {placeholders}, no em dash,\n' +
        '  kept terms of packages/locale/tracy-locale-vi/terms.ts kept, keys sorted), move bare English into t(),\n' +
        '  then record the English with --accept-sources <ns>.'
    )
    process.exitCode = 1
  } else {
    const keys = namespaces.reduce((n, m) => n + Object.keys((m.en as object | null) ?? {}).length, 0)
    console.log(
      `ops-languages: ${String(namespaces.length)} namespace(s), ${String(keys)} strings complete in ${String(languages.length - 1)} languages`
    )
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
