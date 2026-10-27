/**
 * Build the browser half: esbuild bundles src/client/* to CJS, then we wrap it in the
 * `__ModuleLoader__.load` factory shape dsh's client module system requires (a classic
 * script, not ESM). Output: lib/client.js, served at /plugins/@tracy/dsh-site-build-wordpress/client.js.
 *
 * 🔒 `@tracy/site-build-core` IS BUNDLED IN, on purpose. It is a source library with no `lib/`;
 * the image copies this plugin's directory whole and runs no build there, so the only way core
 * reaches a customer is inside THIS file. It is a workspace symlink under node_modules, and
 * esbuild follows it like any other import.
 *
 * Same recipe as @tracy/dsh-my-sites -- react* MUST stay external: dsh shares one React with every
 * plugin, and a second copy leaves hooks without a dispatcher (blank screen, no error).
 */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ID = '@tracy/dsh-site-build-wordpress'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = path.join(root, 'lib', 'client.js')
const ENTRY = path.join(root, 'src', 'client', 'index.tsx')
const CSS_ENTRY = path.join(root, 'src', 'client', 'site-build.css')
const CHECK_ONLY = process.argv.includes('--check')

/**
 * Every `ctx.<name>` must be in `inject`.
 *
 * 🔒 WHY. cordis has NO optional injection, and its context proxy **throws the moment a property
 * outside `inject` is READ**. `tracy-view` once declared `export const optional = ['locale']` — a
 * made-up export nobody reads — then guarded with `if (!ctx.locale)`; the guard never ran because
 * the read itself is the throw. The whole plugin died silently, dsh painted its stock UI, and no gate
 * complained because the bundle still built normally.
 *
 * Checked here rather than in a separate test: this is the ONLY place sure to run before the bundle exists.
 */
function checkInjectContract() {
  const source = readFileSync(ENTRY, 'utf8')

  if (/^export const optional\b/m.test(source)) {
    fail('`export const optional` is not a cordis API — nothing reads it. Put the name in `inject`.')
  }

  const declared = source.match(/^export const inject = \[([^\]]*)\]/m)
  if (!declared) fail('no `export const inject = [...]` found in src/client/index.tsx')
  const injected = new Set([...declared[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))

  // Scan the WHOLE FILE, not only the `apply` body: every helper here takes that same context.
  const used = new Set([...source.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
  // Context methods, not services: `get` reads a service by name (ui-sidebar does the same for uiWorkspace).
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

/**
 * Run Tailwind on `src/client/site-build.css` and return the generated CSS.
 *
 * WHY INSIDE THE PLUGIN'S BUILD. dsh serves exactly ONE `lib/client.js` per plugin and runs no CSS
 * build step on the host. So the CSS must be generated at build time and carried as a string
 * — the same way `@tracy/dsh-my-sites` injects its `CSS` through a `<style>` tag in `ctx.effect`.
 *
 * Written to a temp folder, not to `lib/`: this file is an intermediate step, and an intermediate
 * artifact inside the source tree will sooner or later be committed and drift from what produced it.
 *
 * `--minify` on purpose: this CSS goes into a JavaScript string, so every extra byte is a byte in the
 * bundle nobody reads. The unminified output is just as reproducible — `--check` compares verbatim, and
 * that is the only condition to keep.
 */
function buildStyles() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'tracy-site-build.css-'))
  const outFile = path.join(outDir, 'site-build.css')
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

    /**
     * NO GATE HERE YET, AND THAT IS A DECISION, NOT AN OMISSION.
     *
     * The failure to guard is "Tailwind did not scan the source, so the CSS lacks classes". I tried three
     * measures and none of them went red when `@source` pointing at the library was broken on purpose:
     *
     *   - `css.length < 500` — `theme.css` alone is over the threshold.
     *   - `classes.size < 50` — the broken build still gives 197 classes, same as the full one.
     *   - a list of required classes (`.divide-y`, `.bg-card`…) — still all there.
     *
     * Reason: Tailwind v4 detects sources itself, and `node_modules/@tracy/ui` is a symlink to
     * `packages/ui/tracy-ui`, so it finds the library even when `@source` is wrong. A gate that cannot
     * go red when things break is worse than no gate — it only teaches readers to trust green.
     *
     * The numbers are still printed: full build 197 classes / 49469 bytes, broken 197 classes / 17360 bytes.
     * The byte difference is real but I could not yet explain it by any class, so it is not used as a
     * threshold. A real gate becomes possible at step 4, when the gallery uses each component's own
     * classes and "class X is missing" becomes a checkable statement.
     */
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
  /**
   * PIN ESBUILD'S CWD TO THE PACKAGE ROOT; never let it follow where the command was typed.
   *
   * esbuild writes source-path comments (`// src/client/index.tsx`) **relative to the cwd**. Unpinned,
   * the same source gives two different bundles just because `pnpm --filter … build` runs from the
   * repo root while `node scripts/build-client.mjs` runs from here. `--check` compares verbatim, so it
   * would go red by folder, not by content.
   */
  absWorkingDir: root,
  /**
   * Tailwind's CSS goes into the bundle as a constant, not as a file.
   *
   * `define` substitutes at the token level, so `__TAILWIND_CSS__` in the source becomes a string
   * literal — no `import './site-build.css'` for esbuild to understand, and no second CSS file
   * for dsh to serve. TypeScript sees it through a `declare const` in
   * `src/client/styles.ts`.
   */
  define: { __TAILWIND_CSS__: JSON.stringify(css) },
  /**
   * `@tracy/ui/src/index.ts` starts with `import './tokens.css'` — right for an app bundler
   * but meaningless here: esbuild builds ONE JavaScript file with no output path for CSS, so it
   * stops with "Cannot import … without an output path configured".
   *
   * `empty` turns that import into a no-op. Nothing is lost: that same `tokens.css` is already in the
   * bundle through the Tailwind step above — it is one of the three `@import`s of `src/client/site-build.css`.
   * Letting esbuild emit another CSS file would mean two copies of the tokens, and which one dsh
   * serves would depend on load order.
   */
  loader: { '.css': 'empty' },
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  /**
   * 🔒 MINIFY IS THERE TO DROP COMMENTS — a language rule, not a size optimisation. Comments in `src/`
   * were once written in Vietnamese, and esbuild copies them verbatim into the bundle the customer's
   * browser downloads. `legalComments` is not enough: it only drops licence comments.
   */
  minify: true,
  write: false,
  logLevel: 'info',
  external: [
    '@deepseek-ai/dsh-client-ui-slots/client',
    '@deepseek-ai/dsh-client-ui-settings/client',
    '@deepseek-ai/dsh-client-locale/client',
    // Exactly React's entry points — NOT `react*`: that glob also externalised `react-day-picker`
    // (pulled in through @tracy/ui's calendar) and the bundle died at load with "missed the module
    // table" (03/09/2026). dsh's shared module table holds these four and nothing else React-shaped.
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

// `--check` writes nothing: the merge gate only asks "does the bundle match the source", and a gate
// that fixes the file itself and reports green checks nothing at all.
if (CHECK_ONLY) {
  const onDisk = readFileSync(OUT_FILE, 'utf8')
  if (onDisk !== bundle) {
    fail('lib/client.js is stale — run `node scripts/build-client.mjs` and commit it.')
  }
  console.log('lib/client.js matches its source')
} else {
  mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  writeFileSync(OUT_FILE, bundle)
  console.log('lib/client.js built')
}
