/**
 * Build the Node half: src/host/index.ts → lib/index.js (ESM, dependencies external so
 * `schemastery` resolves from the installed package at runtime, not from a copy in the bundle).
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

function checkInjectContract() {
  const source = readFileSync(ENTRY, 'utf8')
  const declared = source.match(/^export const inject(?::[^=]*)? = \[([^\]]*)\]/m)
  if (!declared) fail('no `export const inject = [...]` found in src/host/index.ts')
  const injected = new Set([...declared[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
  const used = new Set([...source.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
  // Context methods and the fiber handle, not services.
  for (const method of ['effect', 'inject', 'on', 'fiber']) used.delete(method)
  const missing = [...used].filter((name) => !injected.has(name))
  if (missing.length > 0) fail(`uses ctx.${missing.join(', ctx.')} without declaring it in \`inject\``)
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
  minify: true
})

const code = result.outputFiles[0].text
if (CHECK_ONLY) {
  if (readFileSync(OUT_FILE, 'utf8') !== code)
    fail('lib/index.js is stale — run `pnpm build` here and commit it.')
  console.log('lib/index.js matches its source')
} else {
  writeFileSync(OUT_FILE, code)
  console.log('lib/index.js built')
}
