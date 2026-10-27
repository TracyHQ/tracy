/**
 * Build the Node half: esbuild bundles `src/host/*` into `lib/index.js`, ESM, run inside the dsh process.
 *
 * 🔒 `lib/index.js` IS COMMITTED, just like `lib/client.js` (RULE #3 of CLAUDE.md). The fleet copies the
 * plugin folder whole and runs no build step there — so "forgot to build" is a **pushable**
 * state, and what reaches the customer is old code. `check-bundles` calls this file with `--check` to block exactly
 * that.
 *
 * 🔒 NODE'S OWN MODULES ARE NOT BUNDLED. `node:http`, `node:fs/promises`, `node:zlib` belong to the runtime;
 * bundling them is pointless and esbuild would ask for polyfills. `platform: 'node'` already keeps them out.
 *
 * 🔒 `@tracy/site-build-core` MUST GO IN. It is a source library with no `lib/`, and the image does not
 * run `pnpm install` for plugins — so this bundle is the only way core reaches a customer.
 *
 * 🔒 CWD PINNED TO THE PACKAGE ROOT. esbuild writes source-path comments **relative to the cwd**, so
 * unpinned, the same source gives two different bundles depending on where the command is typed — and `--check`
 * compares verbatim, so it would go red by folder rather than by content. The lesson `build-client.mjs` records.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

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
  // `ctx.get(name)` is a METHOD of Context, not a property read, so cordis does not throw on it:
  // it answers undefined for a service the composition does not carry. That is the only way to
  // read an OPTIONAL service — `inject` has no optional half (`Inject = (keyof M)[]` in
  // vendor/cordis) — and dsh core itself reads `agents` this way (`interaction/user-questions`).
  // Declaring such a service in `inject` instead would keep this whole plugin from loading where
  // it is absent, which is a worse failure than losing the feature that wanted it.
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
  /**
   * 🔒 NOT `packages: 'external'`. That setting kept every import under node_modules out of the
   * bundle — right when the only such imports were node's own — and it would keep
   * `@tracy/site-build-core` out too, leaving `lib/index.js` importing a package the image never
   * installs: dsh dies at boot with ERR_MODULE_NOT_FOUND. Node's built-ins are external by
   * `platform: 'node'` already; everything else, core included, goes in.
   */
  write: false,
  legalComments: 'none'
})

const built = result.outputFiles[0].text

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
  mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  writeFileSync(OUT_FILE, built)
  console.log(`lib/index.js  ${(built.length / 1024).toFixed(1)} kB`)
}
