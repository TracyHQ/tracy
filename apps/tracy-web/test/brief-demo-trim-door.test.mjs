/**
 * A brief build asks the site to hide its demo rows by the contract's demo-trim profile only when the contract ships one; the
 * receiver answers every other contract "unsupported", which the report used to show as a refused write.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { hasDemoTrim } from '../src/sites/brief-engines/joomla.js'

test('a contract folder with a demo-trim map is asked to trim; one without is not', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'trim-door-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(path.join(dir, 'content-map.json'), '{}')
  assert.equal(hasDemoTrim({ dir }), false)
  writeFileSync(path.join(dir, 'demo-trim-map.json'), '{"hide":[]}')
  assert.equal(hasDemoTrim({ dir }), true)
})

test('an unknown contract is asked, so its answer decides', () => {
  assert.equal(hasDemoTrim(null), true)
  assert.equal(hasDemoTrim(undefined), true)
})
