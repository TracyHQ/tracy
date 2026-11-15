// The gate's write on a real site keeps its journal and record in the run folder so a stopped run resumes (ticket
// #585). A journal is only ever resumed on the site, key and contract it was written on: one from another site is
// refused before any write. Invented answers; no site.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { realWrite } from '../ai-quickstart/gate/site-write.mjs'

const send =
  (revision = 'rev-1') =>
  async (operation) =>
    operation === 'info'
      ? { info: { component: '1.0.0' } }
      : operation === 'content.contract'
        ? { contract: 'petal-blank/j6/1.0.0', revision }
        : { ok: true }
const input = (out, extra = {}) => ({
  send: send(),
  base: 'http://florist.example',
  siteKey: 'a'.repeat(64),
  built: { writePlan: { ops: [] } },
  out,
  pin: '1.0.0',
  log: () => {},
  open: async () => null,
  ...extra
})

test('the journal names the site it was written on, and one from another site is refused', async () => {
  const out = mkdtempSync(path.join(tmpdir(), 'gate-write-'))
  try {
    await realWrite(input(out))
    const journal = JSON.parse(readFileSync(path.join(out, 'journal.json'), 'utf8'))
    assert.deepEqual(journal.__site, {
      site: 'http://florist.example',
      siteKey: 'a'.repeat(64),
      contract: 'petal-blank/j6/1.0.0',
      revision: 'rev-1'
    })
    // The same site resumes, also once its revision has moved (every write moves it); the journal keeps the first.
    await realWrite(input(out))
    await realWrite(input(out, { send: send('rev-2') }))
    assert.equal(JSON.parse(readFileSync(path.join(out, 'journal.json'), 'utf8')).__site.revision, 'rev-1')
    // Another site, another key or another contract: refused before any write.
    await assert.rejects(realWrite(input(out, { base: 'http://other.example' })), /another site/)
    await assert.rejects(realWrite(input(out, { siteKey: 'b'.repeat(64) })), /another site/)
    const otherContract = async (operation) =>
      operation === 'content.contract'
        ? { contract: 'other-blank/j6/1.0.0', revision: 'rev-1' }
        : send()(operation)
    await assert.rejects(realWrite(input(out, { send: otherContract })), /another site/)
    // A journal with no site named is from before this check: refused too.
    writeFileSync(path.join(out, 'journal.json'), JSON.stringify({ 'gate-run:x': { ok: true } }))
    await assert.rejects(realWrite(input(out)), /another site/)
    // A write record left with no journal is refused too.
    rmSync(path.join(out, 'journal.json'))
    writeFileSync(path.join(out, 'write-record.json'), '{}')
    await assert.rejects(realWrite(input(out)), /no journal naming its site/)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})
