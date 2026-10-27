/**
 * Build the Node half: esbuild bundles `src/host/*` into `lib/index.js`, ESM, run in the dsh process.
 *
 * 🔒 `lib/index.js` IS COMMITTED, just like `lib/client.js` (RULE #3 of CLAUDE.md). The fleet copies
 * the plugin folder as-is and runs no build step there — so "forgot to build" is a **pushable**
 * state, and what reaches customers is old code. `check-bundles` calls this file with `--check` to
 * block exactly that.
 *
 * 🔒 DO NOT BUNDLE NODE MODULES. `node:http`, `node:fs/promises`, `node:zlib` belong to the runtime;
 * bundling them is pointless and esbuild would demand polyfills.
 *
 * 🔒 CWD PINNED TO THE PACKAGE ROOT. esbuild writes source-path comments **relative to cwd**, so
 * unpinned, the same source yields two different bundles depending on where the command was typed —
 * and `--check` compares verbatim, so it would go red by directory, not by content. Same lesson
 * `build-client.mjs` records.
 */
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
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
 * Every `ctx.<name>` must be listed in `inject` — the same cordis contract the client half is gated on.
 *
 * cordis throws the moment a property outside `inject` is READ, so a missing name is not a warning:
 * the plugin dies, dsh still boots, and the only symptom is that half the functionality does not exist.
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
   * 🔒 ONLY `dependencies` STAY EXTERNAL — they are what the image installs. Everything else goes
   * in: node's built-ins are external by `platform: 'node'` already, and a workspace SOURCE
   * library (`@tracy/core/site-dir`, a devDependency with no `lib/`) must be bundled, or
   * `lib/index.js` imports a package the image never installs and dsh dies at boot with
   * ERR_MODULE_NOT_FOUND. Same lesson `tracy-site-build-*`'s build-host.mjs already carries.
   */
  external: Object.keys(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies ?? {}),
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
  writeFileSync(OUT_FILE, built)
  console.log(`lib/index.js  ${(built.length / 1024).toFixed(1)} kB`)
}
