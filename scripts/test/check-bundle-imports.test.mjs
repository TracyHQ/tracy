/**
 * `bareImports` / `installedTracyPackages` — the half of the bundles gate that reads what a
 * committed plugin build IMPORTS, not whether it matches its source.
 *
 *   node --test scripts/test/check-bundle-imports.test.mjs
 *
 * The subject: the dsh image copies each plugin folder as-is and runs no `pnpm install` for it, so
 * a bundle that still says `from "@tracy/site-build-core/…"` is a plugin dsh never loads. The
 * byte-for-byte check cannot see that (the bundle matches its source perfectly). It happened
 * twice on 29/09/2026: `tracy-site-tools` (#586, caught on the local stand) and `tracy-site-tabs`
 * (#595, caught by `boot-graph` on CI).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bareImports, installedTracyPackages } from '../lib/bundle-imports.mjs'

const DOCKERFILE = `
COPY vendor/tracy/od-brand-engine /desk-home/profiles/native/node_modules/@tracy/od-brand-engine
COPY packages/tools/tracy-site-tools  /desk-home/profiles/native/node_modules/@tracy/dsh-site-tools
RUN echo not a copy of node_modules/@tracy/ghost
`

test('the packages the image installs are read from its COPY lines, nothing else', () => {
  assert.deepEqual([...installedTracyPackages(DOCKERFILE)].sort(), [
    '@tracy/dsh-site-tools',
    '@tracy/od-brand-engine'
  ])
})

test('a bundle importing only what the image installs, or nothing from @tracy, is clean', () => {
  const installed = installedTracyPackages(DOCKERFILE)
  assert.deepEqual(
    bareImports('import { x } from "@tracy/od-brand-engine";\nimport fs from "node:fs"', installed),
    []
  )
  assert.deepEqual(bareImports('const a = 1', installed), [])
})

test('a bundle importing a workspace package the image never installs is named, once per package', () => {
  const installed = installedTracyPackages(DOCKERFILE)
  const text = [
    'import { a } from "@tracy/site-build-core/design-check";',
    "import { b } from '@tracy/site-build-core/design-record';",
    'const c = await import("@tracy/core/session");',
    'export { d } from "@tracy/od-brand-engine";'
  ].join('\n')
  assert.deepEqual(bareImports(text, installed), ['@tracy/core', '@tracy/site-build-core'])
})

test('a type written in a comment is not an import: JSDoc `import(...)` types stay in bundles', () => {
  const installed = installedTracyPackages(DOCKERFILE)
  const text = [
    "/** @param {Parameters<import('@tracy/site-build-core/host').StageFn>[0]} job */",
    '// see import("@tracy/site-build-core/build")',
    'async function theme(job) {}'
  ].join('\n')
  assert.deepEqual(bareImports(text, installed), [])
})
