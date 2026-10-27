#!/usr/bin/env node
/**
 * Keep `src/client/upstream-coverage.ts` in lockstep with the upstream DSH
 * source tree. The coverage assertion only sees the merge modules that file
 * imports; a merge upstream forgot here would silently narrow the assertion's
 * namespace table. This script scans the DSH checkout for every
 * `LocaleNamespaceMap` merge (an indented `interface LocaleNamespaceMap {`
 * declaration with members — the base declaration in ui-slots and signature
 * text inside string literals never match) and diffs the discovered module
 * list against the assertion file's imports.
 *
 * Fails with the exact import lines to add or remove. Run via
 * `pnpm typecheck`. Override the checkout root with DSH_SOURCE_ROOT
 * (default: C:/Users/Administrator/.dsh/source/current — the same checkout
 * tsconfig.json paths point at; run pull + install + build there first).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_ROOT = process.env.DSH_SOURCE_ROOT ?? 'C:/Users/Administrator/.dsh/source/current'
const PACKAGES = join(SOURCE_ROOT, 'packages')
const COVERAGE_FILE = join(ROOT, 'src', 'client', 'upstream-coverage.ts')

const MERGE_HEADER = /^\s+interface LocaleNamespaceMap \{$/
// `ns: KeyType` / `'ns': KeyType` / `ns: import('../x.ts').KeyType`
const MEMBER = /^\s+(?:'([^']+)'|([A-Za-z_][\w.-]*)):\s+(?:import\([^)]*\)\.)?[A-Za-z_]\w*\s*$/

if (!existsSync(PACKAGES)) {
  console.error(`DSH checkout not found: ${PACKAGES} (set DSH_SOURCE_ROOT)`)
  process.exit(1)
}

/** Every .ts file under packages/<group>/<pkg>/src/client (experimental excluded). */
function walkClient(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'lib') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (p.replaceAll(sep, '/').includes('/packages/experimental/')) continue
      walkClient(p, out)
    } else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}

/** Nearest ancestor directory containing package.json. */
function packageRootOf(file) {
  let dir = dirname(file)
  while (dir.split(sep).length > SOURCE_ROOT.split(sep).length + 2) {
    if (existsSync(join(dir, 'package.json'))) return dir
    dir = dirname(dir)
  }
  return null
}

/** Import specifier of a merge file relative to its package (``, `/client`, `/client/apply`, ...). */
function mergeSpecifier(file) {
  const pkgRoot = packageRootOf(file)
  if (pkgRoot === null) return null
  const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).name
  const rel = relative(pkgRoot, file).replaceAll(sep, '/')
  const sub = rel.replace(/^src\//, '').replace(/\.ts$/, '').replace(/\/index$/, '')
  return sub === '' ? pkg : `${pkg}/${sub}`
}

// discover merge modules
const discovered = new Set()
for (const file of walkClient(PACKAGES)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (!MERGE_HEADER.test(lines[i])) continue
    // require at least one member line before the closing brace
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*\}/.test(lines[j])) break
      if (MEMBER.test(lines[j])) {
        const spec = mergeSpecifier(file)
        if (spec === null) {
          console.error(`could not resolve package of merge file: ${file}`)
          process.exit(1)
        }
        discovered.add(spec)
        break
      }
    }
  }
}

// parse the assertion file's import list
const coverage = readFileSync(COVERAGE_FILE, 'utf8')
const imported = new Set()
for (const m of coverage.matchAll(/^import type \{\} from '([^']+)'/gm)) imported.add(m[1])

const missing = [...discovered].filter(s => !imported.has(s)).sort()
const stale = [...imported].filter(s => !discovered.has(s)).sort()

if (missing.length > 0 || stale.length > 0) {
  for (const s of missing) {
    console.error(`upstream merge not imported by upstream-coverage.ts — add:\n  import type {} from '${s}'`)
  }
  for (const s of stale) {
    console.error(`import in upstream-coverage.ts has no upstream merge anymore — remove:\n  import type {} from '${s}'`)
  }
  console.error(`sync ${relative(process.cwd(), COVERAGE_FILE).replaceAll(sep, '/')} with the upstream merge list (${discovered.size} modules).`)
  process.exit(1)
}

console.log(`check-upstream-merges: ${discovered.size} merge modules in lockstep with upstream-coverage.ts`)
