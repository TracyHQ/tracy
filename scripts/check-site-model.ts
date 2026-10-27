/**
 * The three site-building skills still speak ONE source contract (ADR 0016).
 *
 * WHY THIS GATE LIVES IN TCH AND NOWHERE ELSE. The contract is defined in the EmDash skill and
 * spoken by the WordPress skill, and those are two separate repositories that may never import
 * from each other (ADR 0006: no dependency points at a live repo). Neither can therefore test
 * that it still agrees with the other. TCH is the one tree that vendors all three skills, so the
 * agreement is TCH's to check — and if it ever stops being checked here, the two drift apart in
 * silence and the failure surfaces as a customer site missing half its content.
 *
 * WHAT IT PROVES, END TO END, ON REAL FIXTURE DATA:
 *   1. the WordPress skill's Joomla adapter emits a site-model.json,
 *   2. the EmDash skill's validator — a different repository — accepts it,
 *   3. the EmDash compiler turns it into a seed,
 *   4. and no vocabulary of a foreign CMS survives the trip.
 *
 * It needs no Docker, no database and no network: the fixture is the one the WordPress skill
 * already ships for its own tests.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WP = join(ROOT, 'vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme')
const EMDASH = join(ROOT, 'vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template')
const JOOMLA = join(ROOT, 'vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template')
const FIXTURE = join(WP, 'scripts/test/fixtures/joomla-min')

/** The version string each skill declares for itself; they may not import it from one another. */
const DECLARED = [
  [EMDASH, 'scripts/contract/site-model.mjs', 'SITE_MODEL_SCHEMA'],
  [WP, 'scripts/ingest/site-model.mjs', 'SITE_MODEL_SCHEMA'],
  [JOOMLA, 'scripts/ingest/site-model.mjs', 'SITE_MODEL_SCHEMA']
] as const

/** Storage words of the three CMSes: none may appear in a neutral model. */
const FOREIGN = ['wp:paragraph', 'wp-content', 'wp-block', 'wp_navigation', 'com_content', 'mod_custom']

function fail(message: string): never {
  console.error(`!! ${message}`)
  process.exit(1)
}

// The WordPress skill's adapter imports `jsdom` from the skill's OWN package.json — that directory
// is a vendored subtree, not a workspace member, so the root install never puts anything there.
// Measured 15/09 on a fresh worktree and on CI (the gate's first run after it landed): a clean
// checkout answers `ERR_MODULE_NOT_FOUND: jsdom`, inside a Buffer that names nothing. Install the
// skill's dependencies when they are missing, from the lockfile the subtree ships, scripts off
// (Playwright's browser download is not wanted here).
if (!existsSync(join(WP, 'node_modules/jsdom/package.json'))) {
  console.error("check-site-model: installing the WordPress skill's own dependencies (jsdom) …")
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: WP, stdio: 'inherit' })
}

const work = mkdtempSync(join(tmpdir(), 'site-model-gate-'))
try {
  // 1. the WordPress skill writes a model from a Joomla source
  const spec = join(work, 'spec')
  execFileSync(
    process.execPath,
    [
      '-e',
      `import(${JSON.stringify(join(WP, 'scripts/ingest/from-joomla.mjs'))}).then((m) => m.buildSpecPack({ j6Dir: ${JSON.stringify(FIXTURE)}, out: ${JSON.stringify(spec)}, pageFloor: 1, now: '2026-01-01T00:00:00.000Z' }))`
    ],
    { cwd: WP, stdio: 'pipe' }
  )
  const modelPath = join(spec, 'site-model.json')
  const model = JSON.parse(readFileSync(modelPath, 'utf8')) as {
    $schema: string
    types: unknown[]
    records: unknown[]
  }

  // 2. the EmDash skill's validator — another repository — accepts it
  execFileSync(process.execPath, [join(EMDASH, 'scripts/contract/validate.mjs'), modelPath], {
    stdio: 'pipe'
  })

  // 3. and its compiler turns it into a seed
  const seedDir = join(work, 'seed')
  execFileSync(process.execPath, [join(EMDASH, 'scripts/tools/compile-seed.mjs'), modelPath, seedDir], {
    stdio: 'pipe'
  })
  const seed = JSON.parse(readFileSync(join(seedDir, 'seed.json'), 'utf8')) as { collections: unknown[] }

  // 4. nothing of a foreign CMS survived
  const serialised = JSON.stringify(model)
  const leaked = FOREIGN.filter((word) => serialised.includes(word))
  if (leaked.length > 0)
    fail(`site-model: another CMS's vocabulary leaked into the contract: ${leaked.join(', ')}`)

  if (seed.collections.length !== model.types.length) {
    fail(
      `site-model: ${model.types.length} types in, ${seed.collections.length} collections out — the compiler dropped some`
    )
  }

  // 5. all three skills declare the same contract version — the thing none of them can check
  const versions = DECLARED.map(([dir, file, name]) => {
    const source = readFileSync(join(dir, file), 'utf8')
    const match = source.match(new RegExp(`${name}\\s*=\\s*'([^']+)'`))
    if (!match) fail(`site-model: ${file} does not declare ${name}`)
    return [dir.replace(`${ROOT}/`, ''), match[1]] as const
  })
  const distinct = new Set(versions.map(([, v]) => v))
  if (distinct.size !== 1) {
    fail(
      `site-model: the three skills declare different versions — ${versions.map(([d, v]) => `${d.split('/')[1]}=${v}`).join(', ')}`
    )
  }

  // 6. the Joomla skill emits one the same validator accepts.
  //    Its adapter is called through its site-model module rather than from-html.mjs: that script
  //    pulls in jsdom from its own tree, which this repo does not install, and a gate that skips
  //    when a dependency is missing reports the same green as a gate that ran.
  const joomlaModel = join(work, 'joomla-site-model.json')
  execFileSync(
    process.execPath,
    [
      '-e',
      `import(${JSON.stringify(join(JOOMLA, 'scripts/ingest/site-model.mjs'))}).then((m) => {` +
        `const pageMap = JSON.parse(require('node:fs').readFileSync(${JSON.stringify(join(JOOMLA, 'scripts/test/fixtures/page-map-min.json'))}, 'utf8'));` +
        `require('node:fs').writeFileSync(${JSON.stringify(joomlaModel)}, JSON.stringify(m.buildSiteModel(pageMap, { kind: 'html' })));` +
        `})`
    ],
    { stdio: 'pipe' }
  )
  execFileSync(process.execPath, [join(EMDASH, 'scripts/contract/validate.mjs'), joomlaModel], {
    stdio: 'pipe'
  })

  console.log(
    `Source contract ${[...distinct][0]}: all three skills declare it; the WordPress skill's Joomla adapter ` +
      `(${model.types.length} types · ${model.records.length} records) and the Joomla skill's HTML adapter both pass ` +
      `the EmDash validator + compiler, with no trace of another CMS.`
  )
} finally {
  rmSync(work, { recursive: true, force: true })
}
