/**
 * Builds the Node half: esbuild bundles `src/host/*` into `lib/index.js`, ESM, run inside the dsh process.
 *
 * 🔒 `lib/index.js` IS COMMITTED, just like `lib/client.js` (RULE #3 of CLAUDE.md). The fleet copies the
 * plugin folder as-is and runs no build step there — so "forgot to build" is a **pushable** state, and
 * what reaches customers is old code. `check-bundles` calls this file with `--check` to block exactly
 * that.
 *
 * 🔒 DO NOT BUNDLE NODE MODULES. `node:http`, `node:fs/promises`, `node:zlib` belong to the runtime;
 * bundling them is pointless and esbuild would demand polyfills.
 *
 * 🔒 CWD IS PINNED TO THE PACKAGE ROOT. esbuild writes source-path comments **relative to cwd**, so
 * unpinned, the same source yields two different bundles depending on where the command is typed — and
 * `--check` compares verbatim, so it would go red by directory, not by content. The same lesson
 * `build-client.mjs` recorded.
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
 * the plugin dies, dsh still boots, and the only symptom is that half the features do not exist.
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
  // `ctx.get(name)` is a METHOD of Context, not a property read, so cordis does not throw on it:
  // it answers undefined for a service the composition does not carry. That is the only way to
  // read an OPTIONAL service — `inject` has no optional half (`Inject = (keyof M)[]` in
  // vendor/cordis) — and dsh core itself reads `agents` this way (`interaction/user-questions`).
  // Declaring such a service in `inject` instead would keep this whole plugin from loading where
  // it is absent, which is a worse failure than losing the feature that wanted it. Here that is
  // `sessions` (who typed) and `tracyAssertion` (the gate's signer): a lane without either still
  // writes, as the viewer, exactly as it did before.
  used.delete('get')
  // `ctx.inject(names, callback)` is cordis's scoped activation, a METHOD like `on`: the services it
  // names are declared in its own call and reached only inside the callback (the title provider,
  // `session-title.mjs`), so a composition without them still loads this plugin.
  used.delete('inject')
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
  // 🔒 ONE PACKAGE IS BUNDLED, NOT LEFT TO THE PLUGIN'S FOLDER. `media.draw` shares the seeder's
  // picture code, which cuts a JPEG with `jpeg-js`; the plugin folder the image copies has no
  // node_modules of its own, so an external `jpeg-js` made dsh refuse the whole plugin at import
  // ("tracy-site-tools: failed to import", measured 23/09/2026 on the local stand).
  plugins: [
    {
      name: 'bundle-jpeg-js',
      setup(b) {
        const fromSeeder = createRequire(path.join(root, '../../cms/tracy-seeder/package.json'))
        b.onResolve({ filter: /^jpeg-js$/ }, () => ({ path: fromSeeder.resolve('jpeg-js') }))
      }
    },
    // 🔒 `@tracy/site-build-core` IS BUNDLED TOO, the way the three Build plugins bundle it: it is
    // a source library with no `lib/`, and the image copies this plugin's folder without a
    // `pnpm install`, so an external import of it is a plugin dsh refuses at boot
    // (ERR_MODULE_NOT_FOUND — the WordPress build script says the same). Measured 29/09/2026 on
    // the local stand before shipping: the design record (`design-record`, `library-ids`) came in
    // as `from "@tracy/site-build-core/…"`, and `check-bundles` cannot see that (it compares bytes).
    {
      name: 'bundle-site-build-core',
      setup(b) {
        const fromHere = createRequire(path.join(root, 'package.json'))
        b.onResolve({ filter: /^@tracy\/site-build-core(\/.*)?$/ }, (args) => ({
          path: fromHere.resolve(args.path)
        }))
      }
    },
    // 🔒 `@tracy/core` IS BUNDLED TOO, as `tracy-site-tabs` bundles it (15/10/2026): the visual check
    // (`visual-check.mjs`) reads a turn with site-tabs' own `turn.mjs` / `turn-record.mjs`, which reach
    // the chat input's `comment-turn.mjs` by relative path, and that file imports `@tracy/core/language`
    // and `@tracy/core/mention`. Resolved from this package, which declares `@tracy/core`.
    {
      name: 'bundle-tracy-core',
      setup(b) {
        const here = createRequire(path.join(root, 'package.json'))
        b.onResolve({ filter: /^@tracy\/core(\/.*)?$/ }, (args) => ({ path: here.resolve(args.path) }))
      }
    }
  ],
  write: false,
  legalComments: 'none'
})

const built = result.outputFiles[0].text

// A bare workspace import left in the bundle is the ERR_MODULE_NOT_FOUND above, one build later.
const leaked = [...built.matchAll(/from\s*["'](@tracy\/[^"']+)["']/g)].map((m) => m[1])
if (leaked.length > 0)
  fail(
    `lib/index.js would import ${[...new Set(leaked)].join(', ')} — the image installs no workspace package for a plugin; bundle it (see the plugins above).`
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
