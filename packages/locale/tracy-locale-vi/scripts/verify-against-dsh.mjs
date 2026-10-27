#!/usr/bin/env node
/**
 * End-to-end check of dsh's Vietnamese WITHOUT a browser.
 *
 * Copies `dsh-client-locale` to a temporary folder, runs `patch-dsh-locale.mjs` on the copy, then
 * loads it and this plugin's `lib/client.js` into a fake cordis context — but `LocaleRuntime`,
 * `setLocale`, `register`, `translate` and the `<html lang>` path are all **dsh's own code**. The
 * real install is not touched.
 *
 * This is as close to "running real dsh" as a script gets, and so far the ONLY automated check of a
 * dsh plugin (`docs/references/testing/README.md` §5 says there is none). It does NOT replace
 * looking at port 51702 — it draws no pixel — but it catches what eyes tend to miss: a locale that
 * fails to register, drifted keys, dropped placeholders.
 *
 * Not in `pnpm build:check`: it needs dsh installed on the machine, which CI does not have.
 *
 * USAGE: node scripts/verify-against-dsh.mjs   (or DSH_ROOT=<path> to point at one)
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..')
const PATCH = path.join(PLUGIN_ROOT, '../../scripts/patch-dsh-locale.mjs')
const DSH =
  process.env.DSH_ROOT ??
  path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), '@deepseek-ai/dsh')
const LOCALE_PKG = path.join(DSH, 'node_modules/@deepseek-ai/dsh-client-locale')

if (!existsSync(LOCALE_PKG)) {
  console.error(
    `verify-against-dsh: no dsh install found at ${DSH}\n` +
      '  Install dsh globally, or set DSH_ROOT. This check needs the real harness source.'
  )
  process.exit(1)
}

// A temporary copy — the patch must NOT touch the machine's real install.
const sandboxRoot = mkdtempSync(path.join(tmpdir(), 'tracy-locale-'))
const stagedLocale = path.join(sandboxRoot, 'node_modules/@deepseek-ai/dsh-client-locale')
cpSync(LOCALE_PKG, stagedLocale, { recursive: true })
execFileSync('node', [PATCH, '--dsh', sandboxRoot], { stdio: 'pipe' })

/** A proxy that swallows everything, for services the plugin touches that this check does not care about. */
function stub(name = 'stub') {
  const fn = function () {
    return stub(name)
  }
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === Symbol.toPrimitive) return () => name
      if (prop === 'then') return undefined
      if (prop === Symbol.iterator) return function* () {}
      return stub(`${name}.${String(prop)}`)
    },
    set: () => true,
    has: () => true,
    apply: () => stub(name),
    construct: () => stub(name)
  })
}

/** `react` needs real own keys: the bundle runs `__toESM`, which copies by getOwnPropertyNames. */
const REACT = Object.fromEntries(
  [
    'memo',
    'forwardRef',
    'createElement',
    'Fragment',
    'useState',
    'useEffect',
    'useMemo',
    'useRef',
    'useCallback',
    'useContext',
    'createContext',
    'useSyncExternalStore',
    'jsx',
    'jsxs'
  ].map((key) => [key, stub(key)])
)
const require_ = (name) => (name.startsWith('react') ? { ...REACT, __esModule: true } : stub(name))

const documentElement = { lang: null }
const modules = new Map()
const sandbox = {
  window: { __ModuleLoader__: { load: (mod) => modules.set(mod.id, mod) } },
  document: new Proxy(
    { documentElement },
    { get: (t, p) => (p in t ? t[p] : stub(`document.${String(p)}`)), set: () => true, has: () => true }
  ),
  navigator: { languages: ['en'], language: 'en' },
  console,
  setTimeout,
  clearTimeout
}
sandbox.globalThis = sandbox

for (const file of [path.join(stagedLocale, 'lib/client.js'), path.join(PLUGIN_ROOT, 'lib/client.js')]) {
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox, { filename: file })
}

const dshLocale = modules.get('@deepseek-ai/dsh-client-locale').factory(require_)
const tracyLocale = modules.get('@tracy/dsh-tracy-locale-vi').factory(require_)

// A REAL event bus, not a no-op: `<html lang>` only changes through `locale/change`, so swallowing
// events would break the very check we mean to run.
const listeners = new Map()
// dsh 0.1.7 removed `ctx.settingsScope`; the locale plugin now reads its preference through
// `ctx.configForms.get(entryId)` (a ConfigForm). This double is a form that never loaded — the same
// `memory` mode a page served off loopback runs in — so the locale runtime keeps its own choice.
const unloadedForm = () => ({
  getSnapshot: () => ({ status: 'unavailable', value: undefined, writable: false, mode: 'memory' }),
  subscribe: () => () => {},
  set: async () => false,
  unset: async () => false,
  mutate: async () => false
})
const state = {
  locale: undefined,
  configForms: {
    get: unloadedForm,
    whileServed: () => () => {}
  }
}
const ctx = new Proxy(state, {
  get(target, prop) {
    if (prop in target && target[prop] !== undefined) return target[prop]
    if (prop === 'effect') return (callback) => callback?.()
    if (prop === 'on') {
      return (name, fn) => {
        listeners.set(name, [...(listeners.get(name) ?? []), fn])
        return () => {}
      }
    }
    if (prop === 'emit') {
      return (name, ...args) => {
        for (const fn of listeners.get(name) ?? []) fn(...args)
      }
    }
    // The runtime dsh builds itself is the one we want — catch it here, never build a second one.
    if (prop === 'provide') {
      return (name, value) => {
        if (name === 'locale') state.locale = value
      }
    }
    return stub(`ctx.${String(prop)}`)
  },
  set: () => true,
  has: () => true
})

dshLocale.apply(ctx)
const locale = state.locale
if (locale === undefined) {
  console.error('verify-against-dsh: the dsh locale plugin never provided a runtime.')
  process.exit(1)
}
tracyLocale.apply(ctx)

const results = []
const expect = (label, actual, wanted) => results.push({ label, actual, ok: actual === wanted })

expect(
  'vi is a registered locale',
  locale
    .getLocale()
    .locales.map((row) => row.id)
    .join(','),
  'zh,en,vi'
)
expect('locale label', locale.getLocale().locales.find((row) => row.id === 'vi')?.label, 'Tiếng Việt')

let threw = null
try {
  locale.setLocale('vi')
} catch (error) {
  threw = error.message
}
expect('setLocale("vi") does not throw', threw, null)
expect('active locale', locale.getLocale().active, 'vi')
expect('<html lang>', documentElement.lang, 'vi')

// Expectations are read STRAIGHT from vi/*.json, never copied here. Two reasons, the second weighs
// more: (1) `pnpm lang:check` bans Vietnamese in source strings; (2) copying the translations into a
// second file builds a copy that drifts — and a check that drifts from the data it guards stays green
// forever while guarding nothing. What must hold is "what dsh returns equals what we ship", not
// "equals what we typed a second time".
const dictionary = (ns) => JSON.parse(readFileSync(path.join(PLUGIN_ROOT, 'vi', `${ns}.json`), 'utf8'))

expect('common.cancel', locale.translate('common', 'cancel'), dictionary('common').cancel)
expect(
  'conversation.row.running',
  locale.translate('conversation', 'row.running'),
  dictionary('conversation')['row.running']
)
expect(
  'workspace.session.new',
  locale.translate('workspace', 'session.new'),
  dictionary('workspace')['session.new']
)
expect(
  'placeholder substitution',
  locale.translate('job', 'duration.seconds', { seconds: 12 }),
  dictionary('job')['duration.seconds'].replace('{seconds}', '12')
)

// A key missing in vi must fall back to EN, and an unknown key returns itself — these two behaviours
// are why an incomplete translation is still usable, so they are checked, not trusted.
locale.register('verify.probe', 'en', { only: 'English only' })
expect('missing vi key falls back to en', locale.translate('verify.probe', 'only'), 'English only')
expect('unknown key returns the key', locale.translate('verify.probe', 'nope'), 'nope')

const withVi = [...locale.dicts.values()].filter((locales) => locales.has('vi')).length
const shipped = [...locale.dicts.keys()].filter((ns) => ns !== 'verify.probe').length
expect('every namespace carries vi', withVi, shipped)

rmSync(sandboxRoot, { recursive: true, force: true })

let failed = 0
for (const { label, actual, ok } of results) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(34)} ${JSON.stringify(actual)}`)
  if (!ok) failed++
}
console.log(
  failed === 0
    ? `\nverify-against-dsh: ${results.length}/${results.length} passed.`
    : `\nverify-against-dsh: ${failed} failed.`
)
process.exit(failed === 0 ? 0 : 1)
