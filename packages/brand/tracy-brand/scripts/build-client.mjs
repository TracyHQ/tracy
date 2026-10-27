/**
 * Build the browser half: esbuild bundles src/client/* to CJS, wrapped in the
 * `__ModuleLoader__.load` factory shape dsh's client module system requires (a classic script,
 * not ESM). Output: lib/client.js, served by dsh at /plugins/@tracy/dsh-brand/client.js.
 *
 * react* MUST stay external: dsh shares one React with every plugin, and a second copy leaves
 * hooks without a dispatcher (blank screen, no error).
 */
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ID = '@tracy/dsh-brand'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = path.join(root, 'lib', 'client.js')
const ENTRY = path.join(root, 'src', 'client', 'index.tsx')
const CHECK_ONLY = process.argv.includes('--check')

function fail(message) {
  console.error(`build-client: ${message}`)
  process.exit(1)
}

/**
 * Every `ctx.<name>` must be in `inject`: cordis' context proxy throws the moment a property
 * outside `inject` is READ, the plugin dies, and dsh draws its own interface with nothing in the
 * console. This is the one place guaranteed to run before the bundle exists.
 */
function checkInjectContract() {
  const source = readFileSync(ENTRY, 'utf8')
  const declared = source.match(/^export const inject = \[([^\]]*)\]/m)
  if (!declared) fail('no `export const inject = [...]` found in src/client/index.tsx')
  const injected = new Set([...declared[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
  const used = new Set([...source.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
  // Context methods, not services. A nested `ctx.inject([...], (scope) => …)` declares its own
  // services; code inside it reads them from `scope`, which this check does not police.
  for (const method of ['effect', 'on', 'inject']) used.delete(method)
  const missing = [...used].filter((name) => !injected.has(name))
  if (missing.length > 0) fail(`uses ctx.${missing.join(', ctx.')} without declaring it in \`inject\``)
  console.log(`inject contract: ${used.size} services used, all declared`)
}

checkInjectContract()

const result = await build({
  entryPoints: [ENTRY],
  // Pinned so the same source yields the same bundle from any cwd (`--check` compares bytes).
  absWorkingDir: root,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  // Comments in src/ may be Vietnamese by repo rule; the bundle reaches customers, so strip them.
  minify: true,
  write: false,
  logLevel: 'info',
  external: ['react*']
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
