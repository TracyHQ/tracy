// Provenance of the copied legacy ledgers against the out-of-repo originals (QA_LEGACY_SOURCE_ROOT).
// A ledger absent at the source is reported UNVERIFIED with the ENOENT probe; it is never counted as checked.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseLedger } from '../extractors/legacy-findings.mjs'
import { parsePlan } from '../extractors/legacy-plan.mjs'
import { readBytesSync, readTextSync } from '../../lib/bounded-reader.mjs'

const doc = JSON.parse(readTextSync(fileURLToPath(new URL('../legacy/audit-findings.json', import.meta.url))))
const plan = JSON.parse(readTextSync(fileURLToPath(new URL('../legacy/audit-plan.json', import.meta.url))))
const srcRoot = process.env.QA_LEGACY_SOURCE_ROOT

test('every copied ledger is verified by hash, or reported unverified with its probe', (t) => {
  if (!srcRoot) return t.skip('QA_LEGACY_SOURCE_ROOT not set: provenance not verified')
  const verified = []
  const unverified = []
  for (const f of doc.source.files) {
    let text
    try {
      text = readBytesSync(join(srcRoot, doc.source.directory, f.file))
    } catch (error) {
      unverified.push({ file: f.file, probe: error.code })
      continue
    }
    assert.equal(createHash('sha256').update(text).digest('hex'), f.sha256, `${f.file} hash differs`)
    // every copied field, not only the hash: the committed findings equal a fresh parse of the original
    const shard = Number(/S(\d)/.exec(f.file)[1])
    const copied = doc.findings.filter((x) => x.shard === `S${shard}`)
    assert.deepEqual(copied, parseLedger(text.toString('utf8'), shard, f.file), `${f.file} fields differ`)
    assert.equal(
      f.verification?.status,
      'verified',
      `${f.file} is verified at the source but recorded otherwise`
    )
    verified.push(f.file)
  }
  for (const u of unverified) {
    assert.equal(u.probe, 'ENOENT', `${u.file}: unexpected probe ${u.probe}`)
    const f = doc.source.files.find((x) => x.file === u.file)
    assert.deepEqual(
      f.verification,
      { status: 'unverified', probe: 'ENOENT' },
      `${u.file} not recorded unverified`
    )
  }
  assert.equal(verified.length + unverified.length, doc.source.files.length)
  console.log(
    `legacy provenance: verified=[${verified}] unverified(ENOENT)=[${unverified.map((u) => u.file)}]`
  )
})

test('the copied audit plan equals a fresh parse of the original, hash and every item', (t) => {
  if (!srcRoot) return t.skip('QA_LEGACY_SOURCE_ROOT not set: provenance not verified')
  let text
  try {
    text = readBytesSync(join(srcRoot, plan.source.path))
  } catch (error) {
    assert.equal(error.code, 'ENOENT')
    assert.notEqual(
      plan.source.verification?.status,
      'verified',
      'recorded verified but the original is absent'
    )
    return
  }
  assert.equal(createHash('sha256').update(text).digest('hex'), plan.source.sha256)
  assert.deepEqual(plan.items, parsePlan(text.toString('utf8')))
  assert.equal(plan.source.verification?.status, 'verified')
})

test('the committed data states which ledgers are verified, so a reader needs no external path', () => {
  for (const f of doc.source.files)
    assert.match(f.verification?.status ?? '', /^(verified|unverified)$/, f.file)
})
