import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { measurementBytesOf } from '../src/lib/template-design-system-readiness/readers/measurement.js'

test('the /ops fingerprint of a measurement holds the evidence and every link its inheritance proof reads', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'measurement-fingerprint-'))
  try {
    for (const v of ['1.0.0', '1.0.1']) mkdirSync(path.join(root, v))
    const file = path.join(root, '1.0.1', 'design-system-measurement.json')
    writeFileSync(path.join(root, '1.0.0', 'design-system-measurement.json'), '{"version":"1.0.0"}')
    writeFileSync(path.join(root, '1.0.0', 'presentation-lock.json'), '{"files":{}}')
    writeFileSync(path.join(root, '1.0.1', 'presentation-lock.json'), '{"files":{}}')
    writeFileSync(file, '{"version":"1.0.1","inheritedFrom":"1.0.0"}')
    writeFileSync(path.join(root, '1.0.1', 'patch-evidence.json'), '{"a":1}')
    const first = measurementBytesOf([file])
    // the evidence edited, the measurement left as it was: the fingerprint moves, so /ops checks again
    writeFileSync(path.join(root, '1.0.1', 'patch-evidence.json'), '{"a":2}')
    const edited = measurementBytesOf([file])
    assert.notEqual(edited, first)
    // the evidence removed
    rmSync(path.join(root, '1.0.1', 'patch-evidence.json'))
    assert.notEqual(measurementBytesOf([file]), edited)
    // the previous link's measurement changed
    const before = measurementBytesOf([file])
    writeFileSync(path.join(root, '1.0.0', 'design-system-measurement.json'), '{"version":"1.0.0","x":1}')
    assert.notEqual(measurementBytesOf([file]), before)
    // a measurement with no evidence and no inheritance keeps the fingerprint it always had: its own bytes
    const own = path.join(root, '1.0.0', 'design-system-measurement.json')
    assert.equal(measurementBytesOf([own]), '{"version":"1.0.0","x":1}')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
