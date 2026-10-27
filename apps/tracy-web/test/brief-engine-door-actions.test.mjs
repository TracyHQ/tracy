/**
 * Every action the build calls on a site is one the Apply door lets through (TCH #1013).
 *
 * Measured 10/10/2026 on dev g59-ess-j-full (JA Essence j6 1.0.4, FULL, Vietnamese): the build called
 * `template.languageOverrides` through `applyAs`, the door's allowlist (`APPLY_RULES`) did not name it, and the door answered
 * ACTION_NOT_ALLOWED before the call reached the site, so no Joomla site got its template's words in its language. Every engine
 * test handed the engine a fake site that answered the action directly, so nothing caught it. This reads the action names the
 * build's own code writes (brief engines, `brief-build.js`, and the seeder modules the build loads) and asks the door for each.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { SEEDER_DIR, SEEDER_MODULES } from '../src/lib/seeder.js'
import { APPLY_ACTIONS, applyDoorRefusal } from '../src/sites/route.js'

const sites = fileURLToPath(new URL('../src/sites/', import.meta.url))
const engines = path.join(sites, 'brief-engines')

/** The files whose code calls a site during a build. */
const files = [
  ...readdirSync(engines)
    .filter((f) => /\.m?js$/.test(f))
    .map((f) => path.join(engines, f)),
  path.join(sites, 'brief-build.js'),
  ...SEEDER_MODULES.map((name) => path.join(SEEDER_DIR, `${name}.mjs`))
]

/** A name that is a file, not an action (`read('manifest.json')`). */
const FILE = /\.(?:json|m?js|ts|md|php|ini|xml|ya?ml|txt)$/

/**
 * The action names a file calls: `action: '<name>'`, and the first argument of the engines' door helpers
 * (`write('site.identity', …)`, `read('content.get', …)`, `call('content.update', …)`).
 * @param {string} source
 * @returns {string[]}
 */
export function actionsCalled(source) {
  const out = new Set()
  for (const m of source.matchAll(/\baction:\s*'([a-z]+(?:\.[A-Za-z]+)?)'/g)) out.add(m[1])
  for (const m of source.matchAll(/\b(?:write|read|call|door)\(\s*'([a-z]+\.[A-Za-z]+)'/g)) out.add(m[1])
  return [...out].filter((name) => !FILE.test(name))
}

test('every action the build calls on a site is on the Apply door’s allowlist', () => {
  /** @type {Map<string, string[]>} action → the files calling it */
  const called = new Map()
  for (const file of files) {
    let source
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const action of actionsCalled(source))
      called.set(action, [...(called.get(action) ?? []), path.basename(file)])
  }
  assert.ok(called.has('content.contract'), 'the scan finds the actions the build calls')
  const refused = [...called].filter(([action]) => applyDoorRefusal(action) !== null)
  assert.deepEqual(
    refused,
    [],
    `the door refuses ${refused.map(([a, f]) => `${a} (${f.join(', ')})`).join('; ')}: add each to APPLY_RULES in sites/route.js, with its entry in api-reference/actions.js`
  )
  for (const action of called.keys()) assert.ok(APPLY_ACTIONS.includes(action), action)
})

test('the scan reads both ways the build names an action, and leaves file names out', () => {
  assert.deepEqual(
    actionsCalled(
      "apply({ siteKey, action: 'template.languageOverrides', params })\nawait write('site.identity', {})\nread('manifest.json')"
    ).sort(),
    ['site.identity', 'template.languageOverrides']
  )
})

test('the door refuses an action it does not name, as the build sees it', () => {
  assert.deepEqual(applyDoorRefusal('template.nothing'), {
    status: 400,
    body: { code: 'ACTION_NOT_ALLOWED' }
  })
  assert.equal(applyDoorRefusal('template.languageOverrides'), null)
})
