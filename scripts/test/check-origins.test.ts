/**
 * `findingsIn` — the pure decision `check-origins.ts` makes about one file's text, tested away
 * from the filesystem (same shape as `check-push.test.mjs`).
 *
 *   node --import tsx --test scripts/test/check-origins.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

import { findingsIn } from '../check-origins.ts'

test('a Tracy address written as a plain literal is a finding', () => {
  const found = findingsIn(`export const BAD = 'https://cowork.tracy.ai/api/whatever'\n`, 'x.ts')
  assert.equal(found.length, 1)
  assert.equal(found[0].value, 'https://cowork.tracy.ai/api/whatever')
  assert.equal(found[0].line, 1)
})

test('the bare `tracy.ai` and the GitHub org name are both findings on their own', () => {
  assert.equal(findingsIn(`const z = 'tracy.ai'\n`, 'x.ts').length, 1)
  assert.equal(findingsIn(`const repos = ['TracyHQ/design-inspirations']\n`, 'x.ts').length, 1)
})

test('a comment never counts — findingsIn only looks at string and template literals', () => {
  assert.deepEqual(findingsIn(`// see https://cowork.tracy.ai for context\nconst x = 1\n`, 'x.ts'), [])
  assert.deepEqual(findingsIn(`/** TracyHQ owns this repo */\nconst x = 1\n`, 'x.ts'), [])
})

test('cowork./hooks./seats. alone, with no tracy.ai, are not the bug this gate hunts', () => {
  // The customer-facing package filename `pkg_claudecowork.zip` contains the substring
  // `cowork.` but names no address at all — see the gate's own header for why `cowork\.` is
  // deliberately NOT one of the alternatives on its own.
  assert.deepEqual(findingsIn(`const f = 'pkg_claudecowork.zip'\n`, 'x.ts'), [])
})

test('a github.com or githubusercontent.com reference is exempt — third-party, deployment-invariant', () => {
  assert.deepEqual(findingsIn(`const u = 'https://github.com/TracyHQ/tch/blob/main'\n`, 'x.ts'), [])
  assert.deepEqual(
    findingsIn(`const u = 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/x.json'\n`, 'x.ts'),
    []
  )
})

test('a USER_AGENT / UA constant, or a user-agent/http-referer/x-title header value, is exempt', () => {
  assert.deepEqual(findingsIn(`const USER_AGENT = 'Tracy/1.0 (+https://tracy.ai)'\n`, 'x.ts'), [])
  assert.deepEqual(findingsIn(`const UA = { 'user-agent': 'Bot/1.0 +https://tracy.ai' }\n`, 'x.ts'), [])
  assert.deepEqual(
    findingsIn(`const h = { 'http-referer': 'https://tracy.ai', 'x-title': 'TracyHQ seeder' }\n`, 'x.ts'),
    []
  )
})

test('a JSX placeholder= attribute value is exempt — example text, not a routing address', () => {
  const found = findingsIn(`const el = <Input placeholder="name@tracy.ai" />\n`, 'x.tsx', ts.ScriptKind.TSX)
  assert.deepEqual(found, [])
})

test('a parameter default, a ?? fallback, and a DEFAULT_/FALLBACK const are all exempt', () => {
  assert.deepEqual(findingsIn(`function f(zone = 'tracy.ai') {}\n`, 'x.ts'), [])
  assert.deepEqual(findingsIn(`const zone = config.zone ?? 'tracy.ai'\n`, 'x.ts'), [])
  assert.deepEqual(
    findingsIn(`const DEFAULT_LIBRARY_URL = 'https://cowork.tracy.ai/design-inspiration'\n`, 'x.ts'),
    []
  )
  assert.deepEqual(
    findingsIn(
      `const FALLBACK = Object.freeze({ hostOrg: 'TracyHQ', badgeUrl: 'https://tracy.ai/x' })\n`,
      'x.ts'
    ),
    []
  )
})

test('the exact same literal is NOT exempt once it is not in one of those shapes', () => {
  // A non-default, non-parameter, non-fallback assignment of the same string is the real bug —
  // exempting by VALUE instead of by SHAPE would hide it.
  const found = findingsIn(`const zone = 'tracy.ai'\n`, 'x.ts')
  assert.equal(found.length, 1)
})

test('a sourceUrl property value is exempt — a credit link, not a routing address', () => {
  assert.deepEqual(
    findingsIn(`const brand = { sourceUrl: \`https://cowork.tracy.ai/x/\${id}\` }\n`, 'x.ts'),
    []
  )
})

test('the bare marketing homepage is exempt; a path on it is not', () => {
  assert.deepEqual(findingsIn(`const href = 'https://tracy.ai'\n`, 'x.ts'), [])
  const found = findingsIn(`const href = 'https://tracy.ai/dashboard'\n`, 'x.ts')
  assert.equal(found.length, 1)
})

// ── Fix round 1 — Critical C1: workers/ has a scan again ─────────────────────────────────────

// ── Fix round 1 — Important: isGithubReference anchored to the START of the literal ─────────────

test('a literal that merely CONTAINS a github.com/ substring is NOT exempt — only a literal starting with it', () => {
  const found = findingsIn(`const bad = 'https://cowork.tracy.ai/redirect?to=https://github.com/x'\n`, 'x.ts')
  assert.equal(found.length, 1)
  assert.equal(found[0].value, 'https://cowork.tracy.ai/redirect?to=https://github.com/x')
})

test('a literal that genuinely starts with the github.com/ or githubusercontent.com/ URL is still exempt', () => {
  assert.deepEqual(findingsIn(`const ok = 'https://github.com/TracyHQ/tch'\n`, 'x.ts'), [])
  assert.deepEqual(
    findingsIn(`const ok = 'https://raw.githubusercontent.com/TracyHQ/x/main.json'\n`, 'x.ts'),
    []
  )
})

// ── Fix round 1 — Important: identity-string and default-value exemptions scoped to the DIRECT property ──

test('an unrelated field merely nested inside a const UA object is NOT exempt — only the UA/header value itself is', () => {
  const found = findingsIn(
    `const UA = { 'user-agent': 'Bot/1.0', other: 'https://cowork.tracy.ai/real-bug' }\n`,
    'x.ts'
  )
  assert.equal(found.length, 1)
  assert.equal(found[0].value, 'https://cowork.tracy.ai/real-bug')
})

test('an unrelated field nested two levels inside a FALLBACK object is NOT exempt — only its own direct properties are', () => {
  const found = findingsIn(
    `const FALLBACK = Object.freeze({ hostOrg: 'TracyHQ', nested: { real: 'https://cowork.tracy.ai/real-bug' } })\n`,
    'x.ts'
  )
  assert.equal(found.length, 1)
  assert.equal(found[0].value, 'https://cowork.tracy.ai/real-bug')
})

test("the FALLBACK object's own direct properties are still exempt after the narrowing", () => {
  assert.deepEqual(
    findingsIn(
      `const FALLBACK = Object.freeze({ hostOrg: 'TracyHQ', badgeUrl: 'https://tracy.ai/x' })\n`,
      'x.ts'
    ),
    []
  )
})
