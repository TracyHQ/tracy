/**
 * Build the browser half: esbuild bundles src/client/* to CJS, then we wrap it in the
 * `__ModuleLoader__.load` factory shape dsh's client module system requires (a classic script, not
 * ESM). Output: lib/client.js, served at /plugins/@tracy/dsh-inbox/client.js.
 *
 * Same recipe as @tracy/dsh-my-sites (its build-client.mjs explains each step at length): the inject
 * contract is checked first, Tailwind (theme + utilities, no preflight) runs on src/client/inbox.css
 * and rides into the bundle through `define`, and only React's four entry points stay external.
 */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ID = '@tracy/dsh-inbox'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = path.join(root, 'lib', 'client.js')
const ENTRY = path.join(root, 'src', 'client', 'index.tsx')
const CSS_ENTRY = path.join(root, 'src', 'client', 'inbox.css')
const CHECK_ONLY = process.argv.includes('--check')

/**
 * Every `ctx.<name>` must be in `inject`: cordis has no optional injection, and its context proxy
 * throws the moment a property outside `inject` is READ, so the plugin would die silently.
 */
function checkInjectContract() {
  const source = readFileSync(ENTRY, 'utf8')
  if (/^export const optional\b/m.test(source)) {
    fail('`export const optional` is not a cordis API — nothing reads it. Put the name in `inject`.')
  }
  const declared = source.match(/^export const inject = \[([^\]]*)\]/m)
  if (!declared) fail('no `export const inject = [...]` found in src/client/index.tsx')
  const injected = new Set([...declared[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
  const used = new Set([...source.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
  // Context methods, not services: `get` reads a service by name.
  for (const method of ['effect', 'get']) used.delete(method)
  const missing = [...used].filter((name) => !injected.has(name))
  if (missing.length > 0) {
    fail(
      `uses ctx.${missing.join(', ctx.')} without declaring it in \`inject\`.\n` +
        '  cordis throws the moment a property outside inject is READ — the plugin will not load.'
    )
  }
  console.log(`inject contract: ${used.size} services used, all declared`)
}

function fail(message) {
  console.error(`build-client: ${message}`)
  process.exit(1)
}

/** Tailwind on src/client/inbox.css, written to a temp dir and returned as a string. */
function buildStyles() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'tracy-inbox-css-'))
  const outFile = path.join(outDir, 'inbox.css')
  try {
    execFileSync(
      process.execPath,
      [
        path.join(root, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs'),
        '--input',
        CSS_ENTRY,
        '--output',
        outFile,
        '--minify'
      ],
      { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] }
    )
    const css = readFileSync(outFile, 'utf8')
    const classes = new Set(css.match(/\.[a-z][\w-]*(?=[,{:>\s])/g) ?? [])
    console.log(`tailwind: ${classes.size} class, ${css.length} byte`)
    return css
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

checkInjectContract()
const css = buildStyles()

const result = await build({
  entryPoints: [ENTRY],
  // Pinned so the source-path comments esbuild writes do not depend on where the command ran.
  absWorkingDir: root,
  define: { __TAILWIND_CSS__: JSON.stringify(css) },
  // `@tracy/ui` imports its tokens.css; that file already reached the bundle through Tailwind above.
  loader: { '.css': 'empty' },
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  // Minify drops comments: the customer's browser downloads this file.
  minify: true,
  write: false,
  logLevel: 'info',
  external: [
    '@deepseek-ai/dsh-client-ui-slots/client',
    '@deepseek-ai/dsh-client-locale/client',
    // Exactly React's entry points, never a `react*` glob (that caught react-day-picker, 03/09/2026).
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react-dom/client'
  ]
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

// `--check` writes nothing: the merge gate only asks whether the bundle matches its source.
if (CHECK_ONLY) {
  const onDisk = readFileSync(OUT_FILE, 'utf8')
  if (onDisk !== bundle) {
    fail('lib/client.js is stale — run `node scripts/build-client.mjs` and commit it.')
  }
  console.log('lib/client.js matches its source')
} else {
  writeFileSync(OUT_FILE, bundle)
  console.log('lib/client.js built')
}
