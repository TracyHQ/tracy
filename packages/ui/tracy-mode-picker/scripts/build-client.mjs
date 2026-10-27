/**
 * Build the browser half: esbuild bundles src/client/* to CJS, wrapped in the
 * `__ModuleLoader__.load` factory shape dsh's client module system requires. Output:
 * lib/client.js, served at /plugins/@tracy/dsh-mode-picker/client.js.
 */
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ID = '@tracy/dsh-mode-picker'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = path.join(root, 'lib', 'client.js')
const ENTRY = path.join(root, 'src', 'client', 'index.tsx')
const MATRIX_FILE = path.join(root, '..', '..', '..', 'config', 'mode-matrix.json')
const CHECK_ONLY = process.argv.includes('--check')

/**
 * Per-platform "adds N tool · M skill" counts, computed from the same SSOT `gen-presets.ts`
 * reads — not invented, not hand-synced. Counts ROWS (not individual tool names inside a row),
 * matching the mockup's own `overlaySize()`: a `tools` or `skills` row counts once per platform
 * it's marked `true` for, regardless of how many tool names it lists.
 */
function platformCounts() {
  const matrix = JSON.parse(readFileSync(MATRIX_FILE, 'utf8'))
  const counts = {}
  for (const platform of matrix.platforms) {
    counts[platform.id] = {
      tools: matrix.tools.filter((row) => row.platforms?.[platform.id] === true).length,
      skills: matrix.skills.filter((row) => row.platforms?.[platform.id] === true).length
    }
  }
  return counts
}

function fail(message) {
  console.error(`build-client: ${message}`)
  process.exit(1)
}

/** Every `ctx.<name>` must be in `inject`: cordis throws the moment a property outside it is read. */
function checkInjectContract() {
  const source = readFileSync(ENTRY, 'utf8')
  const declared = source.match(/^export const inject = \[([^\]]*)\]/m)
  if (!declared) fail('no `export const inject = [...]` found in src/client/index.tsx')
  const injected = new Set([...declared[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
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
  external: [
    '@deepseek-ai/dsh-client-ui-primitives',
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react-dom/client'
  ],
  define: { __PLATFORM_COUNTS__: JSON.stringify(platformCounts()) }
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
