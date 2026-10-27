import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dropFlag, dropGuard } from '../scripts/provision/emdash/drop-old-guard.mjs'

const here = (/** @type {string} */ p) => new URL(p, import.meta.url)
// The middleware Tracy Business EmDash 1.4.3 shipped, verbatim (what a running site holds in /app).
const OLD_MIDDLEWARE = readFileSync(here('fixtures/emdash-business-1.4.3-middleware.ts.txt'), 'utf8')
// What the helper must produce: the 1.4.3 file without its guard (ADR 0022), pinned as a fixture.
// Until 27/09/2026 this compared against the template's middleware TODAY, which held only when the
// guard was the sole difference. The template has moved on since (provenance stamps, comment-to-edit
// P1: `./lib/stamps` and the no-store/Vary headers for a picked page), and this helper deliberately
// does not port such changes: it only takes the old guard out of a RUNNING site's file. A site
// upgraded this way therefore stays without stamps until the template itself is redeployed
// (`redeploy-template.mjs`).
const NEW_MIDDLEWARE = readFileSync(
  here('fixtures/emdash-business-1.4.3-middleware-unguarded.ts.txt'),
  'utf8'
)
const OLD = ['content', 'only'].join('-')

test('the 1.4.3 middleware without its guard is, byte for byte, the template middleware today', () => {
  assert.equal(dropGuard(OLD_MIDDLEWARE), NEW_MIDDLEWARE)
})

test('a middleware with no guard, or one in a shape it does not know, is left alone', () => {
  assert.equal(dropGuard(NEW_MIDDLEWARE), null)
  const edited = OLD_MIDDLEWARE.replace('refusal !== null', 'refusal !== null && false')
  assert.equal(typeof dropGuard(edited), 'string', 'an edit inside the block still drops the block')
  const moved = OLD_MIDDLEWARE.replace(
    "  if (context.request.method === 'POST' && pathname === '/_emdash/api/mcp') {",
    "  if (pathname === '/_emdash/api/mcp' && context.request.method === 'POST') {"
  )
  assert.equal(dropGuard(moved), null)
})

test('the flag and the capability leave a config; everything else stays', () => {
  const key = ['content', 'Only'].join('')
  const r = dropFlag({ id: 'tracy-business', [key]: true, capabilities: ['forms', OLD, 'seo'] })
  assert.equal(r.changed, true)
  assert.deepEqual(r.json, { id: 'tracy-business', capabilities: ['forms', 'seo'] })
  assert.equal(dropFlag({ id: 'x', capabilities: ['forms'] }).changed, false)
})

test('both helpers run on their own source text, as they do inside a site container', () => {
  const g = new Function(`return ${dropGuard.toString()}`)()
  const f = new Function(`return ${dropFlag.toString()}`)()
  assert.equal(g(OLD_MIDDLEWARE), NEW_MIDDLEWARE)
  assert.equal(f({ [['content', 'Only'].join('')]: true }).changed, true)
})
