/**
 * Build `lib/client.js` from the hand-written dictionaries in `locales/`.
 *
 * The output is a client plugin bundle in the exact shape the DSH client module
 * system expects: `window.__ModuleLoader__.load({ id, factory })`, where the
 * factory returns CommonJS exports carrying `inject` and `apply`. The plugin
 * registers the `vi` language definition and one dictionary per namespace, each
 * as its own `ctx.effect` so a stop or reload removes it again.
 *
 * Usage: node tools/build-client.mjs
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const localesDir = join(root, 'locales')
const packageName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name

const namespaces = readdirSync(localesDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => basename(name, '.json'))
  .sort()

const dictionaries = {}
for (const ns of namespaces) {
  const dict = JSON.parse(readFileSync(join(localesDir, `${ns}.json`), 'utf8'))
  const entries = Object.entries(dict)
  if (entries.length === 0) throw new Error(`locales/${ns}.json is empty`)
  for (const [key, value] of entries) {
    if (typeof value !== 'string') throw new Error(`locales/${ns}.json key ${key} is not a string`)
  }
  dictionaries[ns] = Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

const body = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(packageName)},
\tfactory: () => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

\t\t/** Locale id and self-described label for the Vietnamese language pack. */
\t\tconst LOCALE_ID = "vi";
\t\tconst LOCALE_LABEL = "Tiếng Việt";
\t\t/** Every chain must terminate at English, the registry's only built-in terminal. */
\t\tconst LOCALE_FALLBACK = "en";

\t\t/** Hand-written dictionaries, one entry per namespace owned by a mounted plugin. */
\t\tconst DICTIONARIES = ${JSON.stringify(dictionaries, null, 2).split('\n').join('\n\t\t')};

\t\t/** Hard dependency: without the locale registry there is no catalog to extend. */
\t\tconst inject = ["locale"];

\t\t/**
\t\t* Client plugin body: add the language, then register every namespace
\t\t* dictionary. Each registration is its own effect, so unloading this row
\t\t* removes exactly what it added and the catalog falls back to English.
\t\t* @param ctx - client root context.
\t\t*/
\t\tfunction apply(ctx) {
\t\t\tctx.effect(() => ctx.locale.addLanguage({
\t\t\t\tid: LOCALE_ID,
\t\t\t\tlabel: LOCALE_LABEL,
\t\t\t\tfallback: LOCALE_FALLBACK,
\t\t\t}), "locale-vi: language definition");
\t\t\tfor (const namespace of Object.keys(DICTIONARIES)) {
\t\t\t\tconst dictionary = DICTIONARIES[namespace];
\t\t\t\tctx.effect(
\t\t\t\t\t() => ctx.locale.register(namespace, LOCALE_ID, dictionary),
\t\t\t\t\t"locale-vi: " + namespace + " dictionary",
\t\t\t\t);
\t\t\t}
\t\t}

\t\texports.apply = apply;
\t\texports.inject = inject;
\t\treturn module.exports;
\t}
});
`

mkdirSync(join(root, 'lib'), { recursive: true })
writeFileSync(join(root, 'lib', 'client.js'), body, 'utf8')

const keyCount = namespaces.reduce((sum, ns) => sum + Object.keys(dictionaries[ns]).length, 0)
console.log(`built lib/client.js — ${namespaces.length} namespaces, ${keyCount} keys`)
