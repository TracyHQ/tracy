/**
 * Build the browser half: esbuild bundles src/client/* to CJS, then wraps it in the
 * `__ModuleLoader__.load` factory shape dsh's client module system requires. Output: lib/client.js,
 * served at /plugins/@tracy/dsh-assistant/client.js.
 *
 * No Tailwind here on purpose: the widget is one button and one panel, drawn with plain CSS under
 * the `tv-assistant` prefix (DESIGN.md §3, way 1) and injected as a string by `styles.ts`. Same
 * wrapper and the same React externals as `tracy-tab-link`, so the module table finds the same four
 * names.
 */
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ID = '@tracy/dsh-assistant'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = path.join(root, 'lib', 'client.js')
const ENTRY = path.join(root, 'src', 'client', 'index.tsx')
const CHECK_ONLY = process.argv.includes('--check')

function fail(message) {
  console.error(`build-client: ${message}`)
  process.exit(1)
}

/** Every `ctx.<name>` must be in `inject` — cordis throws the moment a property outside it is READ. */
function checkInjectContract() {
  const source = readFileSync(ENTRY, 'utf8')
  const declared = source.match(/^export const inject(?::[^=]+)? = \[([^\]]*)\]/m)
  if (!declared) fail('no `export const inject = [...]` found in src/client/index.tsx')
  const injected = new Set([...declared[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
  const used = new Set([...source.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
  for (const method of ['effect', 'get']) used.delete(method)
  const missing = [...used].filter((name) => !injected.has(name))
  if (missing.length > 0) fail(`uses ctx.${missing.join(', ctx.')} without declaring it in \`inject\`.`)
  console.log(`inject contract: ${used.size} services used, all declared`)
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
  // Minify drops comments: the customer's browser downloads this file.
  minify: true,
  write: false,
  logLevel: 'info',
  // Exactly React's entry points, never a `react*` glob.
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
  const onDisk = readFileSync(OUT_FILE, 'utf8')
  if (onDisk !== bundle) fail('lib/client.js is stale — run `node scripts/build-client.mjs` and commit it.')
  console.log('lib/client.js matches its source')
} else {
  writeFileSync(OUT_FILE, bundle)
  console.log('lib/client.js built')
}
