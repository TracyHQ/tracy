#!/usr/bin/env node
/**
 * The host half's Claude Cowork version source — `packages/site/tracy-add-site/src/host/manifest.ts`.
 *
 *   node --test scripts/test/cowork-manifest.test.mjs
 *
 * Runs through `tsx` because the source is TypeScript; `check-tests.ts` calls it with the interop suite.
 *
 * FOUR THINGS WORTH PINNING, and none of them is "can it be called":
 *
 *   1. **The package URL must belong to that exact repo's releases.** The package is handed to the CUSTOMER'S SITE to
 *      download and install itself; a foreign address slipping through is foreign code installed on their server.
 *   2. **A broken manifest THROWS, it does not guess.** There is no floor to fall back to — decided 31/08, and
 *      this test is where it does not get quietly added back.
 *   3. **Versions compare by NUMBER, not by string.** `0.10.0` must be newer than `0.9.0`.
 *   4. **Unknown installed version means install over it.** "Cannot say which version I am" almost always
 *      means a version older than the ones that can.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  isNewer,
  latestExtension,
  ManifestUnavailable,
  needsInstall
} from '../../packages/site/tracy-add-site/src/host/manifest.ts'

const RELEASE = 'https://github.com/TracyHQ/claude-cowork/releases/download'

/** A fake `fetch` that gives exactly one answer. */
const answering = (body: unknown, { ok = true, json = true } = {}): typeof fetch =>
  (async () => ({
    ok,
    json: async () => {
      if (!json) throw new Error('not json')
      return body
    }
  })) as unknown as typeof fetch

test('reads the published manifest version, and exposes both addresses', async () => {
  const latest = await latestExtension(
    'joomla',
    answering({
      version: '0.8.19',
      package: `${RELEASE}/joomla-v0.8.19/pkg_claudecowork-0.8.19.zip`,
      url: 'https://github.com/TracyHQ/claude-cowork/releases/tag/joomla-v0.8.19'
    })
  )
  assert.equal(latest.version, '0.8.19')
  assert.ok(latest.packageUrl.endsWith('.zip'))
  assert.equal(latest.releaseUrl, 'https://github.com/TracyHQ/claude-cowork/releases/tag/joomla-v0.8.19')
})

test("a package URL outside that repo's releases is REJECTED — even when the manifest says so", async () => {
  // The manifest is a file on the network. If it is tampered with, the only thing between a customer site and a
  // foreign package is this prefix comparison.
  for (const evil of [
    'https://evil.example/pkg.zip',
    'https://github.com/EvilHQ/claude-cowork/releases/download/v1/pkg.zip',
    // Right repo name, different owner — the shape most likely to slip through a substring check.
    'https://github.com/attacker/claude-cowork/releases/download/joomla-v9.9.9/pkg.zip'
  ]) {
    await assert.rejects(
      () => latestExtension('joomla', answering({ version: '9.9.9', package: evil })),
      (error: unknown) => error instanceof ManifestUnavailable && error.reason === 'untrusted_url',
      evil
    )
  }
})

test('a silent manifest THROWS — there is no floor to quietly install an old version from', async () => {
  // Decided 31/08: `BUNDLED_VERSION` is gone for good. This test is where it does not come back without anyone
  // noticing — if this function one day "falls back to the floor" instead of throwing, this test goes red.
  await assert.rejects(
    () =>
      latestExtension('joomla', async () => {
        throw new Error('network down')
      }),
    (error: unknown) => error instanceof ManifestUnavailable && error.reason === 'unreachable'
  )
  await assert.rejects(
    () => latestExtension('joomla', answering({}, { ok: false })),
    (error: unknown) => error instanceof ManifestUnavailable && error.reason === 'unreachable'
  )
  await assert.rejects(
    () => latestExtension('joomla', answering(null, { json: false })),
    (error: unknown) => error instanceof ManifestUnavailable && error.reason === 'unreadable'
  )
  await assert.rejects(
    () => latestExtension('wordpress', answering({ package: `${RELEASE}/x/y.zip` })),
    (error: unknown) => error instanceof ManifestUnavailable && error.reason === 'no_version'
  )
})

test('versions compare by NUMBER: 0.10.0 is newer than 0.9.0', async () => {
  assert.equal(isNewer('0.10.0', '0.9.0'), true)
  assert.equal(isNewer('0.9.0', '0.10.0'), false)
  assert.equal(isNewer('0.2', '0.2.0'), false, 'a missing part reads as 0')
  assert.equal(isNewer('1.0.0', '0.8.19'), true)
  assert.equal(isNewer('0.8.19', '0.8.19'), false)
})

test('a site that cannot say which version it runs → install over it', async () => {
  assert.equal(needsInstall(undefined, '0.8.19'), true)
  assert.equal(needsInstall('0.8.0', '0.8.19'), true)
  assert.equal(needsInstall('0.8.19', '0.8.19'), false)
  // The site runs a NEWER version than the manifest: leave it alone. Rolling the manifest back is a real move
  // (pulling a broken release), but it is not an order to downgrade a customer's site.
  assert.equal(needsInstall('0.9.0', '0.8.19'), false)
})
