/**
 * `importAddressRefusal` — a Tracy lane is not a site to import (Task 11: `zone` is a parameter,
 * not the `tracy.ai` literal it used to be, so it matches whatever `fork-url.test.mjs` already
 * covers for the Fork branch's twin rule).
 *
 *   node --import tsx --test scripts/test/import-address.test.ts
 *
 * WHY HERE, NOT `packages/site/tracy-add-site/test/`. `import.ts` imports `./dsh-url` with no
 * extension — this package builds through esbuild (`scripts/build-client.mjs`), which resolves
 * that fine, but plain `node --test` (what every package's own `test/*.test.mjs` runs under) cannot:
 * Node's own ESM resolver needs the exact filename, and TypeScript's `moduleResolution: Bundler`
 * refuses an explicit `.ts` extension without `allowImportingTsExtensions` (`TS5097`) — so
 * neither side of that mismatch can be fixed by editing one import. `--import tsx` resolves it
 * correctly, same as `scripts/test/host-artifacts.test.ts` already does for a sibling file in
 * this same package.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { importAddressRefusal } from '../../packages/site/tracy-add-site/src/client/import.ts'

test('an empty siteKey is never refused', () => {
  assert.equal(importAddressRefusal(''), null)
})

test('zone defaults to tracy.ai — production, unchanged from before the parameter existed', () => {
  assert.equal(importAddressRefusal('tracy.ai'), 'tracy')
  assert.equal(importAddressRefusal('lucaswp.tracy.ai'), 'tracy')
  assert.equal(importAddressRefusal('example.com'), null)
})

test('a caller passing its own deployment zone refuses THAT zone instead', () => {
  assert.equal(importAddressRefusal('dev-cowork.tracy.test', 'dev-cowork.tracy.test'), 'tracy')
  assert.equal(importAddressRefusal('lucaswp.dev-cowork.tracy.test', 'dev-cowork.tracy.test'), 'tracy')
  // A site on production's zone is a perfectly good import reference on a dev deployment.
  assert.equal(importAddressRefusal('lucaswp.tracy.ai', 'dev-cowork.tracy.test'), null)
})
