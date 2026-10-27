/**
 * `vendorRuns` — how the gate runs `vendor/tracy/dsh-passwords`'s own suite.
 *
 * WHY THIS IS PINNED. Since 2.7.7 the fork runs its tests as two commands: `test:tracy`, and
 * `test:upstream` under a preload that swaps in upstream's pass-through policy. One glob over
 * `test/**` without that preload runs upstream's tests against the Tracy policy: on 05/10/2026 that
 * turned the row red and then hung it until the 45-minute job timeout. The gate must run exactly
 * what the package declares, and refuse loudly when the package's scripts drift from that shape.
 *
 *   node --import tsx --test scripts/test/check-tests-vendor.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { vendorBuild, vendorRuns } from '../check-tests.ts'

const SCRIPTS = {
  'test:tracy': 'node --import tsx --test "test/tracy/**/*.test.ts"',
  'test:upstream':
    'node --import tsx --import ./test/tracy/upstream-policy-preload.ts --test "test/*.test.ts"'
}

test('runs test:tracy, then test:upstream with its preload, each with the skip pattern', () => {
  const runs = vendorRuns(SCRIPTS, 'a|b')
  assert.ok(!('error' in runs), JSON.stringify(runs))
  assert.deepEqual(
    runs.map((r) => r.name),
    ['test:tracy', 'test:upstream']
  )
  assert.deepEqual(runs[0].args, [
    '--import',
    'tsx',
    '--test',
    '--test-skip-pattern=a|b',
    'test/tracy/**/*.test.ts'
  ])
  assert.deepEqual(runs[1].args, [
    '--import',
    'tsx',
    '--import',
    './test/tracy/upstream-policy-preload.ts',
    '--test',
    '--test-skip-pattern=a|b',
    'test/*.test.ts'
  ])
})

test('a package whose test scripts changed shape is refused, not run the old way', () => {
  const runs = vendorRuns({ ...SCRIPTS, 'test:upstream': 'vitest run' }, 'a')
  assert.ok('error' in runs)
  assert.match(runs.error, /test:upstream/)
})

test('a missing script is refused', () => {
  const runs = vendorRuns({ 'test:tracy': SCRIPTS['test:tracy'] }, 'a')
  assert.ok('error' in runs)
  assert.match(runs.error, /test:upstream/)
})

const BUILD = { pretest: 'npm run build', build: 'tsc -p tsconfig.json && node scripts/build-client.mjs' }

test('the package build runs before its tests: tsc emitting without type-check, then the client build', () => {
  assert.deepEqual(vendorBuild({ ...SCRIPTS, ...BUILD }), [
    { bin: 'tsc', args: ['-p', 'tsconfig.json', '--noCheck'] },
    { bin: 'node', args: ['scripts/build-client.mjs'] }
  ])
})

test('a package whose pretest or build changed shape is refused by name, not tested unbuilt', () => {
  const cases: [Record<string, string>, RegExp][] = [
    [SCRIPTS, /"pretest"/],
    [{ ...SCRIPTS, ...BUILD, pretest: 'true' }, /"pretest"/],
    [{ ...SCRIPTS, pretest: 'npm run build' }, /"build"/],
    [{ ...SCRIPTS, ...BUILD, build: 'tsc' }, /"build"/]
  ]
  for (const [scripts, name] of cases) {
    const build = vendorBuild(scripts)
    assert.ok('error' in build, JSON.stringify(build))
    assert.match(build.error, name)
  }
})
