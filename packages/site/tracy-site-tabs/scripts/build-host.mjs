/**
 * Build the Node half: esbuild bundles `src/host/*` into `lib/index.js`, ESM, run inside the dsh process.
 *
 * 🔒 `lib/index.js` IS COMMITTED, just like `lib/client.js` (RULE #3 of CLAUDE.md). The fleet copies the
 * plugin folder whole and runs no build step there — so "forgot to build" is a **pushable**
 * state, and what reaches the customer is old code. `check-bundles` calls this file with `--check` to block exactly
 * that.
 *
 * 🔒 NODE'S OWN MODULES ARE NOT BUNDLED. `node:http`, `node:fs/promises`, `node:zlib` belong to the runtime;
 * bundling them is pointless and esbuild would ask for polyfills.
 *
 * 🔒 CWD PINNED TO THE PACKAGE ROOT. esbuild writes source-path comments **relative to the cwd**, so
 * unpinned, the same source gives two different bundles depending on where the command is typed — and `--check`
 * compares verbatim, so it would go red by folder rather than by content. The lesson `build-client.mjs` records.
 */
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = path.join(root, 'lib', 'index.js')
const ENTRY = path.join(root, 'src', 'host', 'index.ts')
const CHECK_ONLY = process.argv.includes('--check')

function fail(message) {
  console.error(`build-host: ${message}`)
  process.exit(1)
}

/**
 * Every `ctx.<name>` must be in `inject` — the same cordis contract the client half is gated on.
 *
 * cordis throws the moment a property outside `inject` is READ, so a missing name is not a warning:
 * the plugin dies, dsh still boots, and the only symptom is that half the feature does not exist.
 */
function checkInjectContract() {
  const source = readFileSync(ENTRY, 'utf8')
  const declared = source.match(/^export const inject = \[([^\]]*)\]/m)
  if (!declared) fail('no `export const inject = [...]` found in src/host/index.ts')
  const injected = new Set([...declared[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
  const used = new Set([...source.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
  used.delete('effect')
  // `ctx.on` is cordis's own event seam, not an injected service — like `effect`.
  used.delete('on')
  // `ctx.get(name)` is a METHOD of Context, not a property read, so cordis does not throw on it: it
  // answers undefined for a service the composition does not carry. That is the only way to read an
  // OPTIONAL service (`inject` has no optional half), and `tracyAssertion` is one — a lane without the
  // gate's signer must still load this plugin. Same exemption as `tracy-site-tools`' build.
  used.delete('get')
  const missing = [...used].filter((name) => !injected.has(name))
  if (missing.length > 0) {
    fail(
      `uses ctx.${missing.join(', ctx.')} without declaring it in \`inject\`.\n` +
        '  cordis throws the moment a property outside inject is READ — the plugin will not load.'
    )
  }
  console.log(`inject contract: ${used.size} services used, all declared`)
}

checkInjectContract()

const result = await build({
  entryPoints: [ENTRY],
  absWorkingDir: root,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  packages: 'external',
  write: false,
  legalComments: 'none',
  // `moment.mjs` borrows two functions from `tracy-subprocess-docker/src/route.mjs`, whose frozen
  // tables this bundle never reads. Declared pure, an unused `Object.freeze(...)` is dropped instead
  // of copied in — so an edit to those tables is not a stale `lib/index.js` here.
  pure: ['Object.freeze'],
  // 🔒 `@tracy/site-build-core` IS BUNDLED, NOT LEFT EXTERNAL. This plugin reaches site-tools'
  // source by relative path (`site-context.mjs`, `site.mjs`), and that source imports build-core
  // (`design-check`, `design-record`). The image copies this folder without a `pnpm install`, so a
  // bare import is a plugin dsh never loads — measured on #595: `boot-graph` red (1 plugin missing:
  // @tracy/dsh-site-tabs) and ERR_MODULE_NOT_FOUND in its built-plugin test. Resolved through
  // site-tools, which declares the dependency; this package declares none.
  //
  // 🔒 `@tracy/core` IS BUNDLED TOO, for the same reason: `moment.mjs` reads the chat input's
  // `comment-turn.mjs` by relative path, and that file imports `@tracy/core/language` (the one
  // reading of a comment's language, 30/09). Resolved from this package, which declares `@tracy/core`.
  plugins: [
    {
      name: 'bundle-tracy-core',
      setup(b) {
        const here = createRequire(path.join(root, 'package.json'))
        b.onResolve({ filter: /^@tracy\/core(\/.*)?$/ }, (args) => ({ path: here.resolve(args.path) }))
      }
    },
    {
      name: 'bundle-site-build-core',
      setup(b) {
        const viaSiteTools = createRequire(path.join(root, '../../tools/tracy-site-tools/package.json'))
        b.onResolve({ filter: /^@tracy\/site-build-core(\/.*)?$/ }, (args) => ({
          path: viaSiteTools.resolve(args.path)
        }))
      }
    }
  ]
})

const built = result.outputFiles[0].text

// A bare workspace import left in the bundle is the unloaded plugin above, one build later.
const leaked = [...built.matchAll(/from\s*["'](@tracy\/[^"']+)["']/g)].map((m) => m[1])
if (leaked.length > 0)
  fail(
    `lib/index.js would import ${[...new Set(leaked)].join(', ')} — the image installs no workspace package for a plugin; bundle it.`
  )

if (CHECK_ONLY) {
  let current = ''
  try {
    current = readFileSync(OUT_FILE, 'utf8')
  } catch {
    fail('lib/index.js is missing — run `pnpm build` and commit it.')
  }
  if (current !== built) fail('lib/index.js differs from src/host — run `pnpm build` and commit it.')
  console.log('lib/index.js matches src/host')
} else {
  writeFileSync(OUT_FILE, built)
  console.log(`lib/index.js  ${(built.length / 1024).toFixed(1)} kB`)
}
