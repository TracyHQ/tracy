/**
 * Gate: every language a customer can pick in Settings › Language is complete, on Tracy's screens
 * AND on dsh's, except for gaps recorded as known debt (spec #730, ticket #732).
 *
 * WHAT IT MEASURES. For each language `shown` in `@tracy/core/interface-languages`:
 *   - Tracy's namespaces: the owning plugin's `en` (`scripts/lib/tracy-owned-namespaces.ts`) against
 *     `packages/locale/tracy-locale-vi/vi/` or `packages/locale/tracy-locales/<lang>/`;
 *   - dsh's namespaces: the `en` of every NON-Tracy client plugin the `native` profile loads,
 *     read from the plugins' built bundles, against whoever registers that language
 *     (`dsh-locale-vi` for vi, the better-locale fork for de/fr/it/nl, dsh itself for zh, a Tracy
 *     locale package for a language nobody else ships).
 * The loaded plugin set is not typed here: `dsh --dump-config` on the materialized `native`
 * profile says it, so enabling or disabling a dsh plugin in a bundle changes what is measured.
 *
 * THE LEDGER (`scripts/locale-debt.json`) lists every gap known on the day the gate was
 * switched on. The gate fails when a gap is NOT in the ledger (a PR added an English string, or a
 * dsh upgrade brought new ones, without translating) and when a ledger row is no longer a gap (a PR
 * translated it and must strike it: `pnpm exec tsx scripts/check-interface-languages.ts --strike`).
 * `--strike` only removes rows; adding debt is a hand edit a reviewer sees.
 *
 * Every failure names the language, namespace and key, and the file the translation belongs in.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, globSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { load } from 'js-yaml'
import { INTERFACE_LANGUAGES } from '../packages/core/tracy-core/src/interface-languages/index.mjs'
import { BUNDLED_LANGUAGES } from '../vendor/tracy/dsh-better-locale/src/client/languages.ts'
import { localeDicts as sidebarDicts } from '../vendor/tracy/dsh-better-sidebar/src/client/chunks/locale.tsx'
import { extractEnglish } from '../vendor/tracy/dsh-locale-vi/tools/lib/extract-en.mjs'
import {
  compareLedger,
  countRows,
  findGaps,
  fingerprints,
  ledgerWarning,
  staleSources,
  strikePaid
} from './lib/locale-ledger.mjs'
import {
  parseUnreadWarning,
  readDictionaryVariable,
  readWrappedRegistrations,
  silentRegistrations
} from './lib/dictionary-variables.mjs'
import { bareLiterals } from './lib/ui-literals.mjs'
import { workspaceProjects } from './workspace-projects.mjs'
import { OWNED } from './lib/tracy-owned-namespaces.ts'

type Dict = Record<string, string>
type Ledger = Record<string, { missing: string[]; placeholder: string[] }>

const ROOT = resolve(import.meta.dirname, '..')
const LEDGER = join(ROOT, 'scripts/locale-debt.json')
const SOURCES = join(ROOT, 'scripts/locale-sources.json')
const PROFILE = 'native'
const PROFILE_DIR = join(ROOT, 'tch/profiles', PROFILE)
const BETTER_LOCALE = 'vendor/tracy/dsh-better-locale/src/client/dictionaries'
const DSH_LOCALE_VI = 'vendor/tracy/dsh-locale-vi/locales'

/**
 * Where Tracy's own translations for a language live: Vietnamese predates the shared package and
 * keeps its own (with its keep-verbatim gate); every other language is a folder of
 * `@tracy/dsh-tracy-locales`.
 */
const tracyDir = (lang: string): string =>
  lang === 'vi' ? 'packages/locale/tracy-locale-vi/vi' : `packages/locale/tracy-locales/${lang}`

const mode = process.argv.includes('--init')
  ? 'init'
  : process.argv.includes('--strike')
    ? 'strike'
    : process.argv.includes('--accept-sources')
      ? 'accept-sources'
      : 'check'

/** Read a JSON dictionary, or nothing when the file does not exist. */
function readJson(path: string): Dict | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Dict) : undefined
}

/** Every `<ns>.json` in a directory, keyed by namespace. */
function readDir(dir: string): Record<string, Dict> {
  if (!existsSync(dir)) return {}
  const out: Record<string, Dict> = {}
  for (const file of readdirSync(dir).sort()) {
    if (file.endsWith('.json')) out[file.slice(0, -'.json'.length)] = readJson(join(dir, file)) ?? {}
  }
  return out
}

/**
 * The client plugins the profile loads, as package names. `!!js` values (a conditional `disabled`
 * or config) are kept as opaque strings; only a literal `disabled: true` takes a row out.
 */
function loadedPackages(): string[] {
  const materialize = spawnSync('node', [join(ROOT, 'scripts/materialize-profile.mjs'), PROFILE], {
    cwd: ROOT,
    encoding: 'utf8'
  })
  if (materialize.status !== 0)
    throw new Error(`materialize-profile ${PROFILE} failed:\n${materialize.stderr}`)
  const dump = spawnSync(join(ROOT, 'node_modules/.bin/dsh'), ['--profile', PROFILE, '--dump-config'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, DSH_HOME: join(ROOT, 'tch') },
    maxBuffer: 64 * 1024 * 1024
  })
  if (dump.status !== 0) throw new Error(`dsh --dump-config failed:\n${dump.stderr}`)
  const rows: { name: string; disabled: unknown }[] = []
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) for (const item of node) walk(item)
    else if (node !== null && typeof node === 'object') {
      const row = node as Record<string, unknown>
      if (typeof row.name === 'string') rows.push({ name: row.name, disabled: row.disabled })
      for (const [key, value] of Object.entries(row)) if (key !== 'config') walk(value)
    }
  }
  // `!!js` marks an expression the Loader evaluates; dropping the tag leaves it a plain string,
  // which is all this reader needs (only a literal `disabled: true` removes a row).
  walk(load(dump.stdout.replaceAll(/([:-]\s*)!!js\b/g, '$1')))
  const names = rows.filter((r) => r.disabled !== true).map((r) => packageName(r.name))
  return [...new Set(names)].sort()
}

/** `@scope/pkg/sub` → `@scope/pkg`; `pkg/sub` → `pkg`. */
function packageName(entry: string): string {
  const parts = entry.split('/')
  return entry.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/**
 * Plugin packages the gate could not find on disk. Not a skip: an unmeasured plugin is a blind
 * spot, so the gate fails on it (`problems` below).
 */
const unresolved: string[] = []

/**
 * The built client bundle of a package that declares `dsh.client`, or nothing for a non-client
 * package. Found by NAME in the pnpm workspace first (dsh's own packages and the vendored forks),
 * then in the profile's `node_modules` (npm-only plugins). Never through Node's resolver: what it
 * finds depends on how `node_modules` happened to be hoisted on this machine, and on 02/10 that
 * made a laptop measure 31 namespaces where CI measured more.
 */
function clientBundle(name: string): string | undefined {
  const fromProfile = join(PROFILE_DIR, 'node_modules', name)
  const dir =
    workspaceProjects().get(name) ?? (existsSync(join(fromProfile, 'package.json')) ? fromProfile : undefined)
  if (dir === undefined) {
    unresolved.push(name)
    return undefined
  }
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    dsh?: { client?: unknown }
    exports?: Record<string, unknown>
  }
  if (manifest.dsh?.client === undefined) return undefined
  const entry = manifest.exports?.['./client']
  const rel =
    typeof entry === 'string'
      ? entry
      : ((entry as { default?: string } | undefined)?.default ?? './lib/client.js')
  const bundle = join(dir, rel)
  if (!existsSync(bundle)) unresolved.push(`${name} (no built ${rel}: run pnpm dsh:build)`)
  return existsSync(bundle) ? bundle : undefined
}

// ── Sources ──────────────────────────────────────────────────────────────────────────────────

const tracyNamespaces = new Set(Object.keys(OWNED))
const dshBundles = loadedPackages()
  .filter((name) => !name.startsWith('@tracy/'))
  .map(clientBundle)
  .filter((b): b is string => b !== undefined)
/** What the first reader returns: dictionaries and owning package by namespace, and warnings. */
type Extracted = { dicts: Record<string, Dict>; owners: Record<string, string>; warnings: string[] }
const dshEn = extractEnglish(dshBundles, 'en') as Extracted
const dshZh = extractEnglish(dshBundles, 'zh') as Extracted

/**
 * Dictionaries the first reader cannot read back out of a built bundle (a spread of another
 * dictionary, a minified comma declaration) go through a second reader
 * (`scripts/lib/dictionary-variables.mjs`). What neither can read is a blind spot, and fails the
 * gate below: there is no list of exempt dictionaries.
 */
function recoverUnread(result: Extracted): string[] {
  const bundleByLabel = new Map(dshBundles.map((b) => [basename(dirname(dirname(b))), b]))
  const left: string[] = []
  for (const warning of new Set(result.warnings)) {
    const unread = parseUnreadWarning(warning)
    const bundle = unread === undefined ? undefined : bundleByLabel.get(unread.label)
    const dict =
      unread === undefined || bundle === undefined
        ? undefined
        : readDictionaryVariable(readFileSync(bundle, 'utf8'), unread.variable)
    if (unread === undefined || dict === undefined) {
      left.push(warning)
      continue
    }
    result.dicts[unread.ns] = { ...result.dicts[unread.ns], ...dict }
    result.owners[unread.ns] = unread.label
  }
  return left
}
const unreadable = [...recoverUnread(dshEn), ...recoverUnread(dshZh)]

/** The label a reader files a bundle under (`<package dir>/lib/client.js` → `<package dir>`). */
const labelOf = (bundle: string): string => basename(dirname(dirname(bundle)))
const bundleTexts = dshBundles.map((b) => ({ label: labelOf(b), text: readFileSync(b, 'utf8') }))

/**
 * Bundles that call `locale.register(` without giving any reader an English namespace are a blind
 * spot and fail the gate, except the ones below, each with its reason: a language pack registers
 * only OTHER plugins' namespaces in a non-English language (it is the target side, not a source).
 */
const NO_ENGLISH_NAMESPACE = new Map([
  ['dsh-locale-vi', "language pack: vi for other plugins' namespaces"],
  ['dsh-better-locale', "language pack: de/fr/it/nl and others for other plugins' namespaces"],
  [
    'dsh-better-sidebar',
    'betterSidebar: en/zh registered by variable, every other language rides in its own lazy chunk; measured by sidebarMissing below and the build key-set check (chunks/locale.tsx)'
  ]
])
/**
 * Third shape: a wrapper called once per language (`addLocale('en', en)`, `dsh-subscriptions`,
 * #765). Read only for namespaces the first two readers did not already take.
 */
for (const { label, text } of bundleTexts.filter((b) => !NO_ENGLISH_NAMESPACE.has(b.label))) {
  for (const [result, locale] of [
    [dshEn, 'en'],
    [dshZh, 'zh']
  ] as const) {
    const wrapped = readWrappedRegistrations(text, locale)
    unreadable.push(...wrapped.warnings.map((w) => `${label}/${w}`))
    for (const [ns, dict] of Object.entries(wrapped.dicts)) {
      if (ns in result.dicts) continue
      result.dicts[ns] = dict
      result.owners[ns] = label
    }
  }
}

const silent = silentRegistrations(bundleTexts, new Set(Object.values(dshEn.owners)), NO_ENGLISH_NAMESPACE)
const staleNoEnglish = [...NO_ENGLISH_NAMESPACE.keys()]
  .filter((label) => !bundleTexts.some((b) => b.label === label))
  .map(
    (label) =>
      `  NO_ENGLISH_NAMESPACE names ${label}, which the native profile does not load → remove the entry`
  )
const dshSource: Record<string, Dict> = Object.fromEntries(
  Object.entries(dshEn.dicts as Record<string, Dict>).filter(([ns]) => !tracyNamespaces.has(ns))
)
const owners = dshEn.owners as Record<string, string>

/** better-locale's dictionaries for a language it registers, or nothing. */
function betterLocale(lang: string): Record<string, Dict> {
  return BUNDLED_LANGUAGES.find((l) => l.id === lang)?.dicts ?? {}
}

/**
 * Where a missing dsh-namespace string for `lang` belongs: the package that already registers that
 * namespace for that language (a second registration throws), else Tracy's locale package.
 */
function dshHome(lang: string, ns: string, betterHasNs: boolean): string {
  if (lang === 'vi') return `${DSH_LOCALE_VI}/${ns}.json`
  if (lang === 'zh')
    return `the zh dictionary of ${owners[ns] ?? 'its owning plugin'} (dsh fork or plugin fork)`
  if (betterHasNs) return `${BETTER_LOCALE}/${lang}.ts`
  return `${tracyDir(lang)}/${ns}.json`
}

const measured: Ledger = {}
const homes = new Map<string, string>()
const collisions: string[] = []

for (const language of INTERFACE_LANGUAGES.filter((l) => l.shown && l.id !== 'en')) {
  const lang = language.id
  const own = readDir(join(ROOT, tracyDir(lang)))
  const fromBetter = betterLocale(lang)
  const upstream: Record<string, Dict> =
    lang === 'vi'
      ? readDir(join(ROOT, DSH_LOCALE_VI))
      : lang === 'zh'
        ? (dshZh.dicts as Record<string, Dict>)
        : fromBetter

  // A Tracy locale package may fill a dsh namespace only where nobody else registers it for this
  // language: a second `locale.register(ns, lang)` throws and takes down dsh's plugin tree.
  for (const ns of Object.keys(own)) {
    if (!tracyNamespaces.has(ns) && ns in upstream) {
      collisions.push(
        `${lang} ${ns}: ${tracyDir(lang)} and ${dshHome(lang, ns, ns in fromBetter)} both register it`
      )
    }
  }

  const tracyGaps = findGaps(OWNED, own)
  const dshTranslated = Object.fromEntries(
    Object.keys(dshSource).map((ns) => [ns, { ...own[ns], ...upstream[ns] }])
  )
  const dshGaps = findGaps(dshSource, dshTranslated)
  measured[lang] = {
    missing: [...tracyGaps.missing, ...dshGaps.missing].sort(),
    placeholder: [...tracyGaps.placeholder, ...dshGaps.placeholder].sort()
  }
  for (const ns of Object.keys(OWNED)) homes.set(`${lang} ${ns}`, `${tracyDir(lang)}/${ns}.json`)
  for (const ns of Object.keys(dshSource)) homes.set(`${lang} ${ns}`, dshHome(lang, ns, ns in fromBetter))
}

/**
 * The side card (`dsh-better-sidebar`, namespace `betterSidebar`) loads its dictionaries itself
 * from a lazy chunk instead of through `locale.register`, so the extractor above never sees them
 * (02/10/2026: an es interface kept the toolbar's Edit / Comments in English with this gate
 * green). Its build already forces every dictionary to carry every key (`chunks/locale.tsx`
 * `checked`), so the one thing left to check is that each shown language HAS one.
 */
const sidebarMissing = INTERFACE_LANGUAGES.filter(
  (l) => l.shown && l.id !== 'en' && l.id !== 'zh' && !(l.id in sidebarDicts)
).map(
  (l) =>
    `${l.id} betterSidebar: no dictionary → vendor/tracy/dsh-better-sidebar/src/client/locales-${l.id}.ts, listed in chunks/locale.tsx`
)

/**
 * English written straight into Tracy's plugin code (`scripts/lib/ui-literals.mjs`), outside
 * `t()`: it reads English in every language. Scope (#754): the client code of EVERY Tracy dsh
 * plugin (a package with a `cordis.patch.yml`, the plugin test of CLAUDE.md §1), of every client
 * SOURCE library a plugin bundles into its own `lib/` (a package exporting `./client`, today
 * `@tracy/site-build-core`, which draws the whole Build tab), and all of `@tracy/core/src`, whose
 * shared views and helpers those plugins draw. Not the `@tracy/ui` library (its dialogs take their
 * labels from the caller), not stories, mockups, tests or the generated `lib/`.
 */
const PLUGIN_DIRS = globSync('packages/*/*/package.json', { cwd: ROOT })
  .map((f) => dirname(f))
  .filter((dir) => {
    if (existsSync(join(ROOT, dir, 'cordis.patch.yml'))) return true
    const manifest = JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')) as {
      exports?: Record<string, unknown>
    }
    return manifest.exports?.['./client'] !== undefined
  })
const UI_FILES = [
  ...PLUGIN_DIRS.flatMap((dir) => globSync(`${dir}/src/client/**/*.{tsx,ts,mjs}`, { cwd: ROOT })),
  ...globSync('packages/core/tracy-core/src/**/*.{tsx,ts,mjs}', { cwd: ROOT })
]
  .filter(
    (f) =>
      !f.startsWith('packages/ui/tracy-ui/') &&
      !/stories|mock|(^|\/)(test|tests|__tests__)\/|\.test\.|\/lib\//.test(f)
  )
  .sort()

/** Literals kept on purpose, `<file>|<text>`, each with its reason. */
const KEPT_LITERALS = new Map([
  // A CSS unit beside a number field.
  ['packages/brand/tracy-brand/src/client/rows.tsx|px', 'unit'],
  // The word the customer types to confirm a delete; the code compares against it (`DELETE_WORD`).
  ['packages/site/tracy-my-sites/src/client/more.tsx|Delete', 'confirmation word'],
  // The same for Restore everything (`RESTORE_WORD`, 03/10/2026).
  ['packages/core/tracy-core/src/site-tabs/BackupDialogs.tsx|Restore', 'confirmation word'],
  // Example addresses, nothing to translate.
  ['packages/site/tracy-add-site/src/client/import-wizard.tsx|yoursite.com', 'example domain'],
  ['packages/site/tracy-add-site/src/client/wizard.tsx|example.com', 'example domain'],
  // The brand name, in a component only the deleted Tracy-shell SPA rendered; not a dsh plugin.
  ['packages/core/tracy-core/src/Cowork.tsx|Tracy', 'brand name'],
  // English fallback only: the job carries `key: 'version.forgotten'` and the dialog renders that
  // key through t(); `message` is what a log or an old caller reads.
  [
    'packages/design/tracy-design-inspiration/src/client/api.ts|The lane forgot this take (it restarted). Try again.',
    'fallback beside a t() key'
  ],
  // Same shape in the Build tab's create path: `messageKey` is what BuildForm renders through t().
  [
    'packages/site/tracy-site-build-core/src/client/new-site.mjs|The site is still being claimed. Press again in a moment; the same request is continued, not repeated.',
    'fallback beside messageKey form.stillClaiming'
  ],
  [
    'packages/site/tracy-site-build-core/src/client/new-site.mjs|The fleet answered without a site.',
    'fallback beside messageKey form.noSite'
  ],
  // A provision that died on a site that exists: the panel shows t('form.provisionFailed'), never
  // this text. It goes only to `reportProvision` → the host's task-list line, whose step names are
  // host-side English today (a separate gap, outside this gate's client scan; issue #754).
  [
    'packages/site/tracy-site-build-core/src/client/new-site.mjs|The site is building, but this page could not read its progress{}. Reload to pick it up again.',
    'host task-list detail, panel shows a t() key'
  ],
  [
    'packages/site/tracy-site-build-core/src/client/new-site.mjs|The fleet could not finish the site{}.',
    'host task-list detail, panel shows a t() key'
  ],
  [
    'packages/site/tracy-site-build-core/src/client/new-site.mjs|The site {} is still building. It will show up in My Sites when the fleet finishes.',
    'host task-list detail, panel shows a t() key'
  ]
])

/**
 * Files that build prompts for the AGENT: their English sentences are read by the model, never
 * shown to the customer, so the sentence rule (shape 3) skips them. JSX rules still apply. Each
 * entry says what it builds; an entry naming a file outside the scan fails the gate, so the list
 * cannot rot into a blanket pass.
 */
const AGENT_PROMPT_FILES = new Map([
  // The turn sent to the agent when the customer sends page comments (rules for writing them).
  ['packages/ui/tracy-chat-input/src/client/comment-turn.mjs', 'agent prompt for comment turns']
])
const staleAllowlist = [...AGENT_PROMPT_FILES.keys()]
  .filter((f) => !UI_FILES.includes(f))
  .map((f) => `  AGENT_PROMPT_FILES names ${f}, which the scan does not read → remove the entry`)

const literals = UI_FILES.flatMap((f) => bareLiterals(f, readFileSync(join(ROOT, f), 'utf8'))).filter(
  (x) =>
    !KEPT_LITERALS.has(`${x.file}|${x.text}`) && !(x.rule === 'sentence' && AGENT_PROMPT_FILES.has(x.file))
)

/**
 * The fingerprint of every English source the translations were made against
 * (`scripts/locale-sources.json`). Reword an English string and its translations still say the
 * old thing while every key is present; the fingerprint is what notices.
 */
const currentSources = fingerprints({ ...OWNED, ...dshSource })

// ── Ledger ───────────────────────────────────────────────────────────────────────────────────

const write = (ledger: Ledger): void => {
  writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`)
}

if (mode === 'init') {
  if (existsSync(LEDGER)) {
    console.error('check-interface-languages: --init refuses to overwrite an existing ledger; use --strike.')
    process.exit(1)
  }
  write(measured)
  writeFileSync(SOURCES, `${JSON.stringify(currentSources, null, 2)}\n`)
  console.log(
    `check-interface-languages: ledger written, rows per language ${JSON.stringify(countRows(measured))}`
  )
  process.exit(0)
}

if (mode === 'accept-sources') {
  writeFileSync(SOURCES, `${JSON.stringify(currentSources, null, 2)}\n`)
  console.log(
    `check-interface-languages: ${String(Object.keys(currentSources).length)} English sources recorded`
  )
  process.exit(0)
}

const ledger: Ledger = existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger) : {}

if (mode === 'strike') {
  const struck = strikePaid(measured, ledger)
  write(struck)
  console.log(
    `check-interface-languages: ledger struck, rows per language ${JSON.stringify(countRows(struck))}`
  )
  process.exit(0)
}

const { added, paid } = compareLedger(measured, ledger)

// Honour-based ledger (#754): a non-empty one is said loudly on every run, so CI logs show it.
const debtWarning = ledgerWarning(ledger)
if (debtWarning !== null) console.warn(debtWarning)
const problems: string[] = [
  ...collisions.map((c) => `  duplicate registration: ${c}`),
  ...unreadable.map((w) => `  cannot read a dictionary, so it is not measured: ${w}`),
  ...silent.map(
    (label) =>
      `  ${label} calls locale.register( but no reader found an English namespace in it, so it is not measured → teach scripts/lib/dictionary-variables.mjs its shape (or NO_ENGLISH_NAMESPACE with a reason)`
  ),
  ...staleNoEnglish,
  ...unresolved.map((n) => `  plugin package not found, so it is not measured: ${n}`),
  ...sidebarMissing.map((m) => `  ${m}`),
  ...staleAllowlist,
  ...literals.map((x) =>
    x.rule === 'sentence'
      ? `  ${x.file}:${String(x.line)}: English sentence as ${x.kind} "${x.text}" outside t() → a key in the plugin's strings.ts (or AGENT_PROMPT_FILES / KEPT_LITERALS with a reason)`
      : `  ${x.file}:${String(x.line)}: English ${x.kind} "${x.text}" outside t() → a key in the plugin's strings.ts`
  )
]
for (const row of added) {
  const [lang, kind, ns, key] = row.split(' ')
  const what = kind === 'missing' ? 'no translation' : 'placeholders differ from English'
  problems.push(`  ${lang} ${ns}.${key}: ${what} → ${homes.get(`${lang} ${ns}`) ?? '?'}`)
}
for (const row of paid) {
  const [lang, kind, ns, key] = row.split(' ')
  problems.push(
    `  ${lang} ${ns}.${key}: translated (${kind} no longer applies) but still in the ledger → run with --strike`
  )
}

const recordedSources: Record<string, string> = existsSync(SOURCES)
  ? (JSON.parse(readFileSync(SOURCES, 'utf8')) as Record<string, string>)
  : {}
const { reworded, unrecorded } = staleSources(currentSources, recordedSources)
for (const entry of reworded)
  problems.push(
    `  ${entry.replace(' ', '.')}: the English changed since it was translated → retranslate it in every language, then --accept-sources`
  )
for (const entry of unrecorded)
  problems.push(
    `  ${entry.replace(' ', '.')}: new English source → translate it in every language, then --accept-sources`
  )

if (problems.length > 0) {
  console.error(`check-interface-languages: ${problems.length} problem(s)\n`)
  console.error(problems.join('\n'))
  console.error(
    '\n  Translate the string where the arrow points (one key per line, sorted), or, for a ledger row\n' +
      '  you just translated, run `pnpm exec tsx scripts/check-interface-languages.ts --strike`.\n' +
      '  After (re)translating a new or reworded English string in every language: --accept-sources.\n' +
      '  Rules: docs/references/i18n.md.'
  )
  // Not process.exit(1): on a pipe stderr is written asynchronously, and exiting at once dropped
  // everything past the first ~64 KB (906 of 1,246 lines seen, #765). Setting the code lets Node
  // drain the stream and then exit with it.
  process.exitCode = 1
} else {
  console.log(
    `check-interface-languages: ${INTERFACE_LANGUAGES.filter((l) => l.shown).length} languages, ` +
      `${Object.keys(OWNED).length} Tracy + ${Object.keys(dshSource).length} dsh namespaces, ` +
      `known debt ${JSON.stringify(countRows(ledger))}`
  )
}
