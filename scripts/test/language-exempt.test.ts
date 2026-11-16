/**
 * The files the language gate leaves out (`scripts/lib/language-exempt.ts`), held to exactly what each reason covers.
 * The build chat's host bundle is left out by its exact path because it embeds the plugin's interface translation
 * tables (#609); the package's sources and its client bundle are still judged, so a Vietnamese string written in them
 * still turns the gate red.
 *
 *   node --test --test-concurrency=1 scripts/test/language-exempt.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isExempt } from '../lib/language-exempt.ts'

test('the build chat host bundle is left out by its exact path, and nothing next to it is', () => {
  assert.equal(isExempt('packages/ui/tracy-build-chat/lib/index.js'), true)
  for (const rel of [
    // The sources the bundle is built from: a Vietnamese string here is still a hit.
    'packages/ui/tracy-build-chat/src/host/ask-words.mjs',
    'packages/ui/tracy-build-chat/src/host/build-tool.mjs',
    'packages/ui/tracy-build-chat/src/client/strings.ts',
    // The browser bundle loads its tables at run time and holds none.
    'packages/ui/tracy-build-chat/lib/client.js',
    // Any other file or package with a similar name.
    'packages/ui/tracy-build-chat/lib/index.mjs',
    'packages/ui/tracy-build-chat/lib/other.js',
    'packages/ui/tracy-build-chat-extra/lib/index.js',
    'packages/ui/tracy-site-tabs/lib/index.js',
    'packages/ui/tracy-build-chat/lib/index.js.map',
    'x/packages/ui/tracy-build-chat/lib/index.js'
  ])
    assert.equal(isExempt(rel), false, rel)
})

test('the older exemptions keep their own reach', () => {
  for (const rel of [
    'packages/locale/tracy-locale-vi/vi/tracy-build-chat.json',
    'packages/locale/tracy-locales/lib/client.js',
    'packages/ui/tracy-build-chat/test/plan-codes.test.mjs'
  ])
    assert.equal(isExempt(rel), true, rel)
  for (const rel of [
    'packages/ui/tracy-add-site/lib/client.js',
    'packages/locale/tracy-locales/src/index.ts'
  ])
    assert.equal(isExempt(rel), false, rel)
})
