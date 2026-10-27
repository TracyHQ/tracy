import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const clientPath = fileURLToPath(new URL('../lib/client.js', import.meta.url))

test('client.js parses without syntax errors', () => {
  execFileSync(process.execPath, ['--check', clientPath], { stdio: 'pipe' })
})

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

test('client factory uses CommonJS shim and scoped id', () => {
  assert.match(src, /var module = \{ exports: \{\} \}/)
  assert.match(src, /var exports = module.exports/)
  assert.match(src, /return module.exports/)
  assert.match(src, /id: '@goodandready\/dsh-subscriptions'/)
  assert.match(src, /\/dsh-subscriptions\/oauth/)
})

test('registers plugins.item card with ROW_ID and no rogue settings.plugin.item', () => {
  assert.match(src, /plugins\.item/)
  assert.match(src, /plugins\.row\.config/)
  assert.doesNotMatch(src, /settings\.plugin\.item/)
  // #282: no top-level settings.section by default. It is registered only when the
  // host opts in with cardPlacement settings/both (test/client-surfaces.test.mjs).
})

test('exposes schema controls in SubsSection', () => {
  assert.match(src, /autoLoopback/)
  assert.match(src, /hideDeprecatedModels/)
  assert.match(src, /composerQuota/)
  assert.match(src, /expiryNotifyDays/)
  assert.match(src, /codexFastMode/)
  assert.match(src, /codexVerbosity/)
  assert.match(src, /ollamaFallback/)
  assert.match(src, /ollamaBaseUrl/)
  assert.match(src, /ollamaFallbackModel/)
  assert.match(src, /cooldownMs/)
  assert.match(src, /probeIntervalMin/)
  assert.match(src, /notifyLimits/)
})

test('client includes clinebot-style status badges, telemetry cards and smoke ping', () => {
  assert.match(src, /dsub-header-bar/)
  assert.match(src, /dsub-badge/)
  assert.match(src, /dsub-stat-box/)
  assert.match(src, /runSmokeTest/)
  assert.match(src, /reloadTelemetry/)
})

test('#408: PluginCard handles host snapshot status loading and unavailable', () => {
  const updatedSrc = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(updatedSrc, /props\.status === 'loading'/)
  assert.match(updatedSrc, /props\.status === 'unavailable'/)
  assert.match(updatedSrc, /"unavailable": "Settings are unavailable"/)
  assert.match(updatedSrc, /"unavailable": "设置不可用"/)
})

test('#459: registers plugins.bundle.config and native openBundle navigation for DSH 0.2', () => {
  const updatedSrc = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(updatedSrc, /plugins\.bundle\.config/)
  assert.match(updatedSrc, /key:\s*PKG/)
  assert.match(updatedSrc, /nav\.openBundle\(PKG\)/)
  assert.match(updatedSrc, /ROW_ID \+ '#' \+ ROW_ID/)
  assert.match(updatedSrc, /props\.status === 'error'/)
  assert.match(updatedSrc, /layout\.selectPanel\('plugins'\)/)
})

test('#318 / #459: openPluginSettings supports language-independent navigation with 0 Cyrillic in lib', () => {
  const updatedSrc = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.equal(/'плагины'/.test(updatedSrc), false, 'lib/client.js must not hardcode Russian literals')
  assert.match(updatedSrc, /resolvePluginLabels/)
  assert.match(updatedSrc, /matchesPluginLabel/)
  assert.match(updatedSrc, /findAndClickCard/)
  assert.match(updatedSrc, /data-plugin-package/)
  assert.match(updatedSrc, /path\[d\*="M10\.3232"\]/)
  assert.equal(/[А-Яа-яЁё]/.test(updatedSrc), false, 'lib/client.js must contain 0 Cyrillic characters')
})
