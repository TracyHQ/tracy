#!/usr/bin/env node
// Run the kit's regression tests the way they are meant to run: from inside a TEMPLATE.
//
// 🔒 WHY THIS EXISTS. `scripts/tools/*` and `scripts/tests/*` are written to be COPIED into a
// template and run from there (SKILL.md): `restore.test.mjs` reads `template.config.json` beside
// the tools, and `clean-install.sh` computes its source as `dirname($0)/..`, which inside a
// template is the template root and inside the kit is `scripts/`. Run in place, four tests failed
// on a clean checkout for reasons that were about neither the product nor the machine — and a
// suite that is permanently N-red is a suite its readers learn to skip, which is the same defect
// the suite exists to catch.
//
// So: build a throwaway template, copy the kit into it, and run the tests there. What the fixture
// carries is exactly what `clean-install.test.mjs` asserts a fresh target must receive; nothing
// more, so the test still proves the copier selects rather than dumps.
//
//   node scripts/test-kit.mjs [--keep] [-- <node --test args>]
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const kit = path.dirname(here) // .../tracy-emdash-template
const keep = process.argv.includes('--keep')
const passthrough = process.argv.includes('--') ? process.argv.slice(process.argv.indexOf('--') + 1) : []

const site = mkdtempSync(path.join(tmpdir(), 'kit-template-'))
try {
  for (const dir of ['tools', 'tests', 'contract', 'ingest', 'src'])
    if (existsSync(path.join(here, dir))) cpSync(path.join(here, dir), path.join(site, dir), { recursive: true })

  // The identity the generic tools read. The kit ships an example precisely because every template
  // has one; using it keeps the fixture honest instead of inventing a shape no template has.
  cpSync(path.join(here, 'template.config.example.json'), path.join(site, 'template.config.json'))

  // What `clean-install.test.mjs` asserts a fresh target must receive. Kept minimal on purpose: if
  // the copier ever starts dumping the whole tree, these assertions must still be able to notice.
  writeFileSync(
    path.join(site, 'package.json'),
    JSON.stringify({ name: 'kit-test-template', private: true, type: 'module' }, null, 2) + '\n'
  )
  writeFileSync(path.join(site, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
  writeFileSync(path.join(site, 'astro.config.mjs'), 'export default {}\n')
  mkdirSync(path.join(site, 'seed'), { recursive: true })
  writeFileSync(path.join(site, 'seed', 'seed.json'), '{}\n')
  mkdirSync(path.join(site, 'src', 'pages'), { recursive: true })
  writeFileSync(path.join(site, 'src', 'pages', 'index.astro'), '<h1>fixture</h1>\n')
  mkdirSync(path.join(site, 'public'), { recursive: true })
  if (!existsSync(path.join(site, 'tools', 'bootstrap-site.sh')))
    writeFileSync(path.join(site, 'tools', 'bootstrap-site.sh'), "#!/bin/sh\nexit 0\n", { mode: 0o755 })

  // 🔒 THE FORBIDDEN CONTENT HAS TO EXIST, OR ITS ABSENCE PROVES NOTHING. `clean-install.test.mjs`
  // asserts the target receives no node_modules, data, uploads, dist, .astro, .env, evidence or
  // backups. Against a fixture that never had them, those seven assertions pass whether the
  // copier excludes them or not — the exclusions could be deleted outright and the suite would
  // stay green. Seeded here so the test measures the copier instead of the fixture.
  for (const d of ['data', 'uploads', 'dist', '.astro', 'evidence', 'backups']) {
    mkdirSync(path.join(site, d), { recursive: true })
    writeFileSync(path.join(site, d, 'must-not-travel'), 'runtime state\n')
  }
  writeFileSync(path.join(site, '.env'), 'SECRET=must-not-travel\n')

  // The tools resolve their dependencies from the TEMPLATE. A link, not a copy: 39 packages of
  // which one is a native build, and copying them would make a two-second run a minute-long one.
  // `clean-install.sh` excludes node_modules, so its "must not be copied" assertion still holds.
  symlinkSync(path.join(kit, 'node_modules'), path.join(site, 'node_modules'), 'dir')

  // Listed, not globbed: `node --test tests/` is read as an entry point to resolve, and spawn
  // without a shell does not expand `tests/*.test.mjs`.
  const files = readdirSync(path.join(site, 'tests'))
    .filter((f) => f.endsWith('.test.mjs'))
    .sort()
    .map((f) => path.join('tests', f))
  if (!files.length) throw new Error('no tests were copied into the fixture')
  const r = spawnSync('node', ['--test', ...(passthrough.length ? passthrough : files)], {
    cwd: site,
    stdio: 'inherit',
    env: { ...process.env, KIT_TEST_TEMPLATE: site }
  })
  if (keep) console.error(`\n(kept: ${site})`)
  // 🔒 `process.exitCode`, NOT `process.exit()`. `process.exit()` terminates before `finally`
  // runs, so every completed run left its fixture behind — measured 19/09/2026, one directory per
  // run, `--keep` or not. Setting the code lets the process end normally and the cleanup happen.
  process.exitCode = r.status ?? 1
} finally {
  if (!keep) rmSync(site, { recursive: true, force: true })
}
