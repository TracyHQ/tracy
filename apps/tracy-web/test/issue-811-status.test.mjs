/**
 * #811 — the two findings of the P2 web/design slice that this change does NOT touch, as facts of
 * the tree, so the status written in the journal is checked rather than remembered.
 *
 * F-S3-010 (already fixed before this change): the My Sites row menu no longer offers "Releases".
 * It offers "Site changes", which opens the changes tab, and the switch catalogue has a
 * `tab-changes` / `launch-changes` pair and no `tab-releases` / `launch-releases`.
 *
 * F-S3-012 (not fixed here): the gateway still forces an approval answer from a seat with a
 * non-null `sandbox_mode` to `rejected`. Whether Approve/Deny has a live path for an Editor or
 * Developer seat needs a run with a real seat; nothing below is that run. The assertion only pins
 * that the guard reads as the finding describes it — whoever settles the finding edits it here too.
 *
 * WHAT THIS FILE READS. Source text and one JSON file. It runs no gateway, no dsh and no seat.
 *
 *   node --test apps/tracy-web/test/issue-811-status.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (file) => readFileSync(path.join(repoRoot, file), 'utf8')

test('F-S3-010 (already fixed): the row menu offers Site changes, not Releases', () => {
  const menu = read('packages/site/tracy-my-sites/src/client/more.tsx')
  assert.match(menu, /onAction\(\{ kind: 'changes' \}\)/, 'the item raises the `changes` action')
  assert.match(menu, /t\('more\.changes'\)/, 'and is labelled by `more.changes`')
  assert.doesNotMatch(menu, /more\.releases|kind: 'releases'/, 'no Releases item is left')

  const strings = read('packages/site/tracy-my-sites/src/client/strings.ts')
  assert.match(strings, /'more\.changes': 'Site changes'/)
  assert.doesNotMatch(strings, /'more\.releases'/)
  assert.doesNotMatch(strings, /: 'Releases'/)
})

test('F-S3-010 (already fixed): the switch catalogue has the changes pair and no releases pair', () => {
  const catalogue = read('packages/core/tracy-core/src/ui-switches/catalogue.json')
  const ids = [...catalogue.matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1])
  assert.ok(ids.includes('tab-changes'))
  assert.ok(ids.includes('launch-changes'))
  assert.ok(!ids.includes('tab-releases'))
  assert.ok(!ids.includes('launch-releases'))
})

test('F-S3-012 (not fixed here): the approval guard for a sandboxed seat is still in the gateway', () => {
  // dsh-passwords 2.7.7 moved the proxy handler from gateway.ts to proxy.ts; the guard is unchanged.
  const gateway = read('vendor/tracy/dsh-passwords/src/proxy.ts')
  const guard =
    /const needsApprovalCheck =\s*reqAs\.dshpwPerms !== undefined &&\s*reqAs\.dshpwPerms\.sandbox_mode !== null &&\s*\(req\.method === 'POST' \|\| req\.method === 'PUT'\) &&\s*\/\^\\\/api\\\/respond\$\/\.test\(proxyPath\);/
  assert.match(gateway, guard, 'the condition is the one the finding describes')
  assert.match(
    gateway,
    /if \(needsApprovalCheck && bodyObj !== null && typeof bodyObj === 'object'\) \{\s*if \(forceRejectApproval\(bodyObj\)\)/,
    'and it still rewrites the answer through `forceRejectApproval`'
  )
})
