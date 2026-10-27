// The tracy-web image carries `apps/tracy-web` alone (`apps/tracy-web/Dockerfile`): there is no
// `packages/` beside it, and a package's files reach the app only as the copies the Dockerfile lays out
// under `src/` (`@tracy/ds-slot` under `src/ds-slot/`, loaded through `lib/ds-slot.js` `dsSlotModule`).
// So a relative import from `apps/tracy-web/src` that climbs out of the app loads in a checkout and
// crashes in the image. #1405 (16/10/2026) did exactly that in two built-site rules of the Design
// system check: its child process died on ERR_MODULE_NOT_FOUND, /ops stored the last stderr line
// ("Node.js v24.22.0") as the reason, and every release on dev read `ds-error`, locked for customers.
//
// Two guards: every static or literal dynamic import of `src/` stays inside the app, and both readiness
// check runners load their whole module graph from the image layout rebuilt with nothing beside it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const APP = join(ROOT, 'apps/tracy-web')

/** Every `.js` / `.mjs` file under `dir`, `node_modules` left out. @param {string} dir @returns {string[]} */
function codeFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : codeFiles(p)
    return /\.m?js$/.test(name) ? [p] : []
  })
}

/** The relative module specifiers a file imports or re-exports. @param {string} text */
function relativeSpecifiers(text) {
  const found = []
  const pattern =
    /(?:^|\n)\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"](\.[^'"]+)['"]|(?:^|\n)\s*import\s*['"](\.[^'"]+)['"]|\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g
  for (const m of text.matchAll(pattern)) found.push(m[1] ?? m[2] ?? m[3])
  return found
}

test('no module under apps/tracy-web/src imports a file outside the app', () => {
  const escaping = []
  for (const file of codeFiles(join(APP, 'src'))) {
    for (const spec of relativeSpecifiers(readFileSync(file, 'utf8'))) {
      if (relative(APP, resolve(dirname(file), spec)).startsWith('..'))
        escaping.push(`${relative(ROOT, file)} -> ${spec}`)
    }
  }
  assert.deepEqual(
    escaping,
    [],
    'the image has no packages/: load a package through its copy under src/ (ds-slot: dsSlotModule)'
  )
})

test('the readiness check runners load from the image layout alone', (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tracy-web-runner-image-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  // As the Dockerfile lays it out: the app's `src/` and `package.json`, `@tracy/ds-slot` under src/ds-slot/.
  cpSync(join(APP, 'src'), join(root, 'src'), { recursive: true })
  cpSync(join(APP, 'package.json'), join(root, 'package.json'))
  const ds = join(root, 'src', 'ds-slot')
  cpSync(join(ROOT, 'packages/design/tracy-ds-slot/src'), join(ds, 'src'), { recursive: true })
  cpSync(join(ROOT, 'packages/design/tracy-ds-slot/templates'), join(ds, 'templates'), { recursive: true })
  const empty = join(root, 'empty-release')
  mkdirSync(empty)

  for (const runner of [
    'src/lib/template-design-system-readiness/check-runner.mjs',
    'src/lib/template-customization-question-readiness/check-runner.mjs'
  ]) {
    const run = spawnSync(process.execPath, [join(root, runner), empty, 'tracy-business'], {
      cwd: root,
      encoding: 'utf8'
    })
    // An empty folder is refused by the check itself (exit 2, one line), which only happens once
    // every module the runner reaches has loaded; a module that is not in the image crashes first.
    assert.doesNotMatch(run.stderr, /ERR_MODULE_NOT_FOUND|Cannot find module/, `${runner}: ${run.stderr}`)
    assert.equal(run.status, 2, `${runner}: ${run.stderr}`)
  }
})
