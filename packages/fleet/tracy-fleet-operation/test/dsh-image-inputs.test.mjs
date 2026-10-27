#!/usr/bin/env node
/**
 * The dsh image fingerprint (`scripts/tools/dsh-image-context.sh`) names what the CMS seeder is
 * built FROM, because the seeder is a build output the Dockerfile copies and git cannot hash it
 * directly. A name missing from that list is an image that silently does not rebuild.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/dsh-image-inputs.test.mjs
 *
 * Measured 15/09 when this test was written: the list named four inputs and the build read eight.
 * So this does not trust the list — it runs the real seeder build and records every path the build
 * touches, two ways at once:
 *   - the file-system calls of `build.mjs` itself (the trees it copies into dist), through a preload
 *     that wraps `node:fs` before the script imports it;
 *   - the esbuild metafile (every module the bundle inlines) — esbuild reads files from Go, where no
 *     JavaScript wrapper sees them, so `build.mjs` writes that list when asked.
 * Every recorded path must lie under an input the fingerprint declares. A dependency resolved
 * through `node_modules` counts as covered only when `pnpm-lock.yaml` is declared.
 *
 * Needs an installed tree (esbuild); CI's Tracy CI job has one.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const ROOT = realpathSync(fileURLToPath(new URL('../../../../', import.meta.url)))
const CONTEXT = path.join(ROOT, 'packages/fleet/tracy-fleet-operation/scripts/tools/dsh-image-context.sh')
const BUILD = path.join(ROOT, 'packages/cms/tracy-seeder/scripts/build.mjs')
const SEEDER_DIST = 'packages/cms/tracy-seeder/dist'

/** What the fingerprint says `dsh/cms` is built from: the `<- input` lines of `--explain`. */
function declaredInputs() {
  const explain = execFileSync('bash', [CONTEXT, '--explain'], { cwd: ROOT, encoding: 'utf8' })
  return explain
    .split('\n')
    .map((line) => line.match(/ packages\/fleet\/tracy-fleet-operation\/dsh\/cms <- (.+)$/)?.[1])
    .filter(Boolean)
}

const RECORDER = `
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
const seen = new Set()
for (const fn of ['readFileSync', 'copyFileSync', 'cpSync', 'readdirSync', 'statSync', 'lstatSync', 'existsSync', 'opendirSync']) {
  const orig = fs[fn]
  fs[fn] = function (p, ...rest) {
    const out = orig.call(this, p, ...rest)
    // Only paths that exist: an existsSync on an optional file that is absent reads nothing.
    if (typeof p === 'string' && (fn !== 'existsSync' || out)) seen.add(p)
    return out
  }
}
syncBuiltinESMExports()
process.on('exit', () => fs.writeFileSync(process.env.RECORD_OUT, JSON.stringify([...seen])))
`

test('every path the seeder build reads is an input the dsh image fingerprint declares', (t) => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'dsh-image-inputs-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const recorder = path.join(tmp, 'record.mjs')
  writeFileSync(recorder, RECORDER)
  const fsOut = path.join(tmp, 'fs.json')
  const bundleOut = path.join(tmp, 'bundle.json')

  const res = spawnSync(process.execPath, ['--import', recorder, BUILD], {
    cwd: path.dirname(path.dirname(BUILD)),
    encoding: 'utf8',
    env: { ...process.env, RECORD_OUT: fsOut, TRACY_SEEDER_BUNDLE_INPUTS: bundleOut }
  })
  assert.equal(res.status, 0, `seeder build failed:\n${res.stderr}`)

  const declared = declaredInputs()
  assert.ok(declared.length > 0, 'dsh-image-context.sh --explain named no inputs for dsh/cms')
  const lockDeclared = declared.includes('pnpm-lock.yaml')

  const recorded = [
    ...JSON.parse(readFileSync(fsOut, 'utf8')),
    ...JSON.parse(readFileSync(bundleOut, 'utf8'))
  ]
  assert.ok(
    recorded.length > 20,
    `recorded only ${recorded.length} paths — the recorder is not seeing the build`
  )

  const outside = new Set()
  for (const raw of recorded) {
    let real
    try {
      real = realpathSync(path.resolve(path.dirname(path.dirname(BUILD)), raw))
    } catch {
      continue // written then removed during the build, or a directory created on the way
    }
    const rel = path.relative(ROOT, real)
    if (rel.startsWith('..')) continue // outside the repository: node itself, the OS
    if (rel === '' || rel.startsWith(SEEDER_DIST)) continue // the build's own output
    if (rel.split(path.sep).includes('node_modules')) {
      if (!lockDeclared) outside.add(`${rel}  (a dependency, and pnpm-lock.yaml is not declared)`)
      continue
    }
    const covered = declared.some((input) => rel === input || rel.startsWith(`${input}/`))
    // Directories the build walks on the way down to a declared input (e.g. `packages/cms`).
    const ancestor = declared.some((input) => input.startsWith(`${rel}/`))
    if (!covered && !ancestor) outside.add(rel)
  }

  assert.deepEqual(
    [...outside].sort(),
    [],
    'the seeder build reads these, and the dsh image fingerprint does not declare them — a change ' +
      'there would not rebuild the image. Add their directory to generated_inputs in ' +
      'packages/fleet/tracy-fleet-operation/scripts/tools/dsh-image-context.sh'
  )
})
