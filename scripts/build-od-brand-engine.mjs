#!/usr/bin/env node
/**
 * Bundle `vendor/tracy/od-brand-engine` into one ESM file, `vendor/tracy/od-brand-engine/dist/index.js`.
 *
 * WHY A BUNDLE. The vendored sources import `@open-design/contracts` — a package Tracy does not
 * carry; the four files they actually reach are copied under `contracts/`. An esbuild alias maps the
 * bare specifiers onto those copies at build time, so the sources stay byte-identical to upstream
 * (NOTICE) and nothing at run time resolves a package that does not exist. `undici` stays external:
 * it is the library's one dependency and the consuming plugin installs it.
 *
 * The vendor package IS a workspace member since 06/09 — `@tracy/dsh-brand-engine` and
 * `@tracy/dsh-design-system` name it as a dependency, and with the private registry retired
 * (ADR 0014) the workspace is the only place that version can resolve from. It still has no build
 * of its own: this script lives in `scripts/` where the root's esbuild is reachable, and is run by
 * hand after any re-vendor. `dist/` is committed like every other built artefact that leaves this
 * machine (LAW #3).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG = path.join(ROOT, 'vendor', 'tracy', 'od-brand-engine')
const CONTRACTS = path.join(PKG, 'contracts')

/** Bare `@open-design/contracts…` specifiers → the copied files. */
const ALIAS = {
  '@open-design/contracts': path.join(CONTRACTS, 'api', 'brands.ts'),
  '@open-design/contracts/api/connectionTest': path.join(CONTRACTS, 'api', 'connectionTest.ts'),
  '@open-design/contracts/runtime/html-injection-points': path.join(
    CONTRACTS,
    'runtime',
    'html-injection-points.ts'
  )
}

for (const target of Object.values(ALIAS)) {
  if (!existsSync(target)) {
    console.error(`build-od-brand-engine: missing ${path.relative(ROOT, target)} — re-vendor (see NOTICE)`)
    process.exit(1)
  }
}

const contractsAlias = {
  name: 'open-design-contracts',
  setup(b) {
    b.onResolve({ filter: /^@open-design\/contracts(\/.*)?$/ }, (args) => {
      const target = ALIAS[args.path]
      if (!target) return { errors: [{ text: `no vendored copy for ${args.path}` }] }
      return { path: target }
    })
  }
}

const out = path.join(PKG, 'dist')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
await build({
  entryPoints: [path.join(PKG, 'index.ts')],
  outfile: path.join(out, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['undici'],
  plugins: [contractsAlias],
  legalComments: 'none',
  logLevel: 'warning'
})
console.log(`build-od-brand-engine: wrote ${path.relative(ROOT, path.join(out, 'index.js'))}`)

// Declarations beside the bundle, so `@tracy/dsh-brand-engine` type-checks against the engine's
// real signatures instead of `any`. Upstream carries two type errors under our compiler (an undici
// `dispatcher` on RequestInit; a contracts import Tracy does not copy); tsc reports them and still
// emits, so only a MISSING index.d.ts is a failure here.
const tsc = spawnSync(
  path.join(ROOT, 'node_modules', '.bin', 'tsc'),
  ['-p', path.join(PKG, 'tsconfig.dts.json')],
  {
    cwd: PKG,
    encoding: 'utf8'
  }
)
if (!existsSync(path.join(out, 'types', 'index.d.ts'))) {
  console.error(tsc.stdout, tsc.stderr)
  console.error('build-od-brand-engine: dist/types/index.d.ts was not emitted')
  process.exit(1)
}
console.log(`build-od-brand-engine: wrote ${path.relative(ROOT, path.join(out, 'types', 'index.d.ts'))}`)
