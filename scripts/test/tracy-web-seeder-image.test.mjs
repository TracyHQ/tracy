// The tracy-web image carries the seeder's `src/` and nothing beside it: `apps/tracy-web/Dockerfile`
// runs `COPY packages/cms/tracy-seeder/src ./src/seeder`, and `lib/seeder.js` imports from there.
// A seeder module that reaches outside its own directory (`../../<other package>/…`) loads fine in
// a checkout, where the sibling packages exist, and fails with ERR_MODULE_NOT_FOUND in the image.
// That is what #1019 shipped: `wordpress-contract-door` pulled the WordPress language catalogue
// from `../../tracy-wordpress-quickstart/`, and every WordPress brief on dev failed at `prepare`.
//
// This suite rebuilds the image's layout in a temporary directory — the seeder's `src/` copied to
// `src/seeder/` with no siblings, exactly the Dockerfile's line — and imports every module
// `lib/seeder.js` is allowed to load (`SEEDER_MODULES`). Each import runs in a fresh Node process so
// one module's failure, or the module cache, cannot hide another's.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { SEEDER_MODULES } from '../../apps/tracy-web/src/lib/seeder.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SEEDER_SRC = join(ROOT, 'packages/cms/tracy-seeder/src')

test('the Dockerfile copies the seeder source to src/seeder, the layout this suite rebuilds', () => {
  const dockerfile = readFileSync(join(ROOT, 'apps/tracy-web/Dockerfile'), 'utf8')
  assert.match(dockerfile, /^COPY packages\/cms\/tracy-seeder\/src \.\/src\/seeder$/m)
})

test('every seeder module tracy-web loads imports from the image layout, with no sibling package', async (t) => {
  // `/opt/tracy-web/src/seeder` in the image; a bare temporary root here, so `../..` resolves to
  // nothing, as it does there.
  const root = mkdtempSync(join(tmpdir(), 'tracy-web-image-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const seederDir = join(root, 'src', 'seeder')
  cpSync(SEEDER_SRC, seederDir, { recursive: true })

  assert.ok(SEEDER_MODULES.length > 0, 'lib/seeder.js names the modules it loads')
  for (const name of SEEDER_MODULES) {
    await t.test(name, () => {
      const href = pathToFileURL(join(seederDir, `${name}.mjs`)).href
      const run = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', `await import(${JSON.stringify(href)})`],
        {
          cwd: root,
          encoding: 'utf8'
        }
      )
      assert.equal(run.status, 0, `${name}.mjs does not load from src/seeder:\n${run.stderr}`)
    })
  }
})
