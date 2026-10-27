/**
 * Build the browser half: esbuild bundles src/client/* to CJS, wrapped in the
 * `__ModuleLoader__.load` factory shape dsh's client module system requires. Output:
 * lib/client.js, served at /plugins/@tracy/dsh-chat-input/client.js.
 */
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ID = '@tracy/dsh-chat-input'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = path.join(root, 'lib', 'client.js')
const ENTRY = path.join(root, 'src', 'client', 'index.tsx')
const CHECK_ONLY = process.argv.includes('--check')

function fail(message) {
  console.error(`build-client: ${message}`)
  process.exit(1)
}

/** Every `ctx.<name>` must be in `inject`: cordis throws the moment a property outside it is read. */
function checkInjectContract() {
  const source = readFileSync(ENTRY, 'utf8')
  // Two cordis shapes: the array (`['slots', …]`) and the map (`{ slots: { required: true }, … }`)
  // — the map is how an OPTIONAL service is declared, and an optional one is still a declared one.
  // The formatter may spread either over several lines; the map's keys are what count.
  const declared = source.match(/^export const inject = (\[[\s\S]*?\]|\{[\s\S]*?\n\})/m)
  if (!declared) fail('no `export const inject = [...]` or `= {...}` found in src/client/index.tsx')
  const injected = declared[1].startsWith('[')
    ? new Set([...declared[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
    : new Set([...declared[1].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*\{/g)].map((m) => m[1]))
  const used = new Set([...source.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
  used.delete('effect')
  const missing = [...used].filter((name) => !injected.has(name))
  if (missing.length > 0) fail(`uses ctx.${missing.join(', ctx.')} without declaring it in \`inject\``)
}

checkInjectContract()

const result = await build({
  entryPoints: [ENTRY],
  absWorkingDir: root,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  minify: true,
  write: false,
  logLevel: 'info',
  // Exactly React's entry points — never `react*`, which also externalises `react-day-picker`.
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client']
})

const code = result.outputFiles[0].text
const bundle = `window.__ModuleLoader__.load({
	id: ${JSON.stringify(PACKAGE_ID)},
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${code}
		return module.exports;
	}
});
`

if (CHECK_ONLY) {
  if (readFileSync(OUT_FILE, 'utf8') !== bundle)
    fail('lib/client.js is stale — run `pnpm build` here and commit it.')
  console.log('lib/client.js matches its source')
} else {
  writeFileSync(OUT_FILE, bundle)
  console.log('lib/client.js built')
}
