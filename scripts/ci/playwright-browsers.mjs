/**
 * The Playwright browsers a GitHub-hosted `build-check` row needs (03/11/2026). Our runners' image
 * carries them; a fresh `ubuntu-latest` VM does not, and its system Google Chrome is not what the
 * suites launch (`browserOpens` in `check-tests.ts`). Run 41581075192: 86 e2e tests red with
 * `Executable doesn't exist at …/chromium_headless_shell-1243/…`.
 *
 * The versions come from the lockfiles, never typed here: every root importer that `check-tests.ts`
 * may open a browser from (the root, `apps/*`, `packages/*` — not `vendor/`, whose suites the gate
 * does not run) and the three EmDash templates, which keep their own lockfile. One install per
 * distinct version: two pins may want two Chromium revisions.
 *
 *   node scripts/ci/playwright-browsers.mjs --print     the versions, one line, space-separated
 *   node scripts/ci/playwright-browsers.mjs --install   `playwright install --with-deps chromium` for each
 *
 * Chromium only: no suite launches another browser (`chromium.launch` everywhere, 03/11/2026).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { load } from 'js-yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** The standalone templates: their own lockfile, outside the workspace (`pnpm-workspace.yaml`). */
export const STANDALONE_LOCKS = ['base', 'business', 'saas', 'restaurant', 'diner'].map(
  (t) => `packages/cms/tracy-emdash-theme-${t}/pnpm-lock.yaml`
)
const NAMES = ['playwright', '@playwright/test']
const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies']
/** Importers of the root lockfile whose tests the gate runs: `.`, `apps/<x>`, `packages/<g>/<x>`. */
const GATED = /^(?:\.|apps\/[^/]+|packages\/[^/]+\/[^/]+)$/

/**
 * The resolved `playwright` / `@playwright/test` versions of the matching importers of one lockfile.
 * @param {string} text - a `pnpm-lock.yaml`
 * @param {RegExp} [importers] - which importers count
 * @returns {string[]}
 */
export function lockVersions(text, importers = GATED) {
  const lock = /** @type {any} */ (load(text))
  const out = []
  for (const [path, importer] of Object.entries(lock?.importers ?? {})) {
    if (!importers.test(path)) continue
    for (const section of SECTIONS)
      for (const name of NAMES) {
        const version = importer?.[section]?.[name]?.version
        // A peer suffix `1.63.0(react@19…)` is not part of the version.
        if (typeof version === 'string') out.push(version.replace(/\(.*$/, ''))
      }
  }
  return out
}

/**
 * Every distinct version, sorted. A missing template lockfile is refused: a browser row would then
 * install nothing for a suite that opens one.
 * @param {(rel: string) => string} [read]
 * @returns {string[]}
 */
export function playwrightVersions(read = (rel) => readFileSync(join(ROOT, rel), 'utf8')) {
  const versions = [
    ...lockVersions(read('pnpm-lock.yaml')),
    ...STANDALONE_LOCKS.flatMap((rel) => lockVersions(read(rel), /^\.$/))
  ]
  const distinct = [...new Set(versions)].sort()
  if (distinct.length === 0) throw new Error('no lockfile resolves playwright or @playwright/test')
  for (const v of distinct) if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(v)) throw new Error(`odd version ${v}`)
  return distinct
}

/**
 * The root's own `playwright` bin (from `@playwright/test`, which pins the same `playwright`) when it
 * is that version, so nothing more is downloaded; otherwise `pnpm dlx` of exactly that version.
 */
function installArgs(version) {
  const own = join(ROOT, 'node_modules/@playwright/test/package.json')
  const ownVersion = existsSync(own) ? JSON.parse(readFileSync(own, 'utf8')).version : null
  const tail = ['install', '--with-deps', 'chromium']
  return ownVersion === version ? ['exec', 'playwright', ...tail] : ['dlx', `playwright@${version}`, ...tail]
}

/** One `pnpm <args>` with its output shown; true when it exited 0. */
function install(args) {
  console.log(`playwright-browsers: pnpm ${args.join(' ')}`)
  return spawnSync('pnpm', args, { cwd: ROOT, stdio: 'inherit' }).status === 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]
  const versions = playwrightVersions()
  if (mode === '--print') console.log(versions.join(' '))
  else if (mode === '--install') {
    for (const version of versions) {
      const args = installArgs(version)
      if (install(args)) continue
      // `--with-deps` runs apt for Chromium's libraries and fonts, and a runner whose apt mirror does not
      // resolve fails there with the browser itself already restored from the cache. Retry once for a
      // passing fault, then take the browser alone: the hosted image carries the libraries, so only the
      // extra fonts are missed.
      console.error(`playwright-browsers: --with-deps failed for playwright ${version}; retrying once`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20_000)
      if (install(args)) continue
      console.error('playwright-browsers: apt still fails; installing the browser without --with-deps')
      if (install(args.filter((arg) => arg !== '--with-deps'))) continue
      console.error(`playwright-browsers: installing Chromium for playwright ${version} failed`)
      process.exit(1)
    }
  } else {
    console.error('usage: node scripts/ci/playwright-browsers.mjs --print | --install')
    process.exit(2)
  }
}
