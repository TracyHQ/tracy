/**
 * Builds the Node half: esbuild bundles `src/host/*` into `lib/index.js`, ESM, run inside the dsh process.
 *
 * 🔒 `lib/index.js` IS COMMITTED, like `lib/client.js` (RULE #3 of CLAUDE.md): the image copies the plugin folder
 * as-is and runs no build there. `check-bundles` calls this file with `--check`.
 *
 * 🔒 `@tracy/core` IS BUNDLED, NOT LEFT EXTERNAL, as `tracy-site-tabs` bundles it: the image installs no workspace
 * package for a plugin, so a bare import is a plugin dsh refuses at boot (ERR_MODULE_NOT_FOUND).
 *
 * 🔒 CWD IS PINNED TO THE PACKAGE ROOT (`absWorkingDir`), so the same source gives the same bytes from any directory.
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

/** Every `ctx.<name>` must be in `inject`: cordis throws the moment a property outside it is read. */
function checkInjectContract() {
  const source = readFileSync(ENTRY, 'utf8')
  const declared = source.match(/^export const inject = \[([^\]]*)\]/m)
  if (!declared) fail('no `export const inject = [...]` found in src/host/index.ts')
  const injected = new Set([...declared[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
  const used = new Set([...source.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
  used.delete('effect')
  // `ctx.get(name)` is a method of Context: it answers undefined for a service the composition lacks, the only way
  // to read an optional one (`sessions`, `tracyAssertion`). Same exemption as `tracy-site-tools`' build.
  used.delete('get')
  const missing = [...used].filter((name) => !injected.has(name))
  if (missing.length > 0) fail(`uses ctx.${missing.join(', ctx.')} without declaring it in \`inject\`.`)
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
  plugins: [
    {
      name: 'bundle-tracy-core',
      setup(b) {
        const here = createRequire(path.join(root, 'package.json'))
        b.onResolve({ filter: /^@tracy\/core(\/.*)?$/ }, (args) => ({ path: here.resolve(args.path) }))
      }
    }
  ]
})

const built = result.outputFiles[0].text

// A bare workspace import left in the bundle is ERR_MODULE_NOT_FOUND on the host.
const leaked = [...built.matchAll(/from\s*["'](@tracy\/[^"']+)["']/g)].map((m) => m[1])
if (leaked.length > 0) fail(`lib/index.js would import ${[...new Set(leaked)].join(', ')}: bundle it.`)

if (CHECK_ONLY) {
  let current = ''
  try {
    current = readFileSync(OUT_FILE, 'utf8')
  } catch {
    fail('lib/index.js is missing: run `pnpm build` here and commit it.')
  }
  if (current !== built) fail('lib/index.js differs from src/host: run `pnpm build` here and commit it.')
  console.log('lib/index.js matches src/host')
} else {
  writeFileSync(OUT_FILE, built)
  console.log(`lib/index.js  ${(built.length / 1024).toFixed(1)} kB`)
}
