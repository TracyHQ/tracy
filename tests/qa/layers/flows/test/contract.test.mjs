import assert from 'node:assert/strict'
import { cpSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { LAYER_DIR, REPO, sha256File } from '../util.mjs'
import {
  COMMAND,
  build,
  diffAgainstDisk,
  extractCapabilities,
  extractDoors,
  extractJourneys
} from '../generate.mjs'
import { AREAS, listCases, readManifests } from '../index.mjs'
import { tmpDir } from './helpers.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'
import { docRel } from '../../../lib/doc-source.mjs'

test('the committed denominator and manifests regenerate byte for byte', () => {
  const files = build()
  assert.deepEqual(diffAgainstDisk(files), [], `run: ${COMMAND}`)
  assert.deepEqual(build(), files, 'two builds are identical')
})

test('listCases: every manifest is valid, ids are unique, areas filter, unknown area is refused', async () => {
  const all = await listCases()
  assert.ok(all.length > 50)
  assert.equal(new Set(all.map((c) => c.id)).size, all.length)
  for (const c of all) {
    assert.match(c.id, /^QA-FLOWS-/)
    assert.deepEqual(c.targets, ['local'], 'every case writes, so only local')
    assert.equal(c.redProof, null, 'a manifest never carries a proof: proofs are produced by a run')
  }
  const team = await listCases({ area: 'team-invite' })
  assert.ok(team.length > 0 && team.every((c) => c.itemIds.includes('flow:team-invite')))
  assert.ok((await listCases({ area: 'legacy' })).every((c) => c.kind === 'legacy'))
  await assert.rejects(() => listCases({ area: 'nope' }), /unknown area/)
  assert.ok(AREAS.includes('scripted'))
})

test('legacy cases keep the journey id in legacyIds; scripted cases name their assertions', async () => {
  const all = await listCases()
  for (const c of all.filter((x) => x.kind === 'legacy')) assert.deepEqual(c.legacyIds, [c.ref])
  for (const c of all.filter((x) => x.kind === 'scripted'))
    assert.ok(c.assertionIds.length > 0 && c.assertionIds.every((a) => a.startsWith(`${c.ref}#`)))
  for (const c of all.filter((x) => x.kind === 'pending')) assert.ok(c.pendingReason.length > 5)
})

test('readManifests refuses empty, malformed and duplicate files, symlinks and non-arrays', () => {
  const dir = tmpDir('manifests')
  const good = path.join(LAYER_DIR, 'cases')
  assert.throws(() => readManifests(path.join(dir, 'missing')), /no cases directory/)
  assert.throws(() => readManifests(dir), /no cases found/)
  writeFileSync(path.join(dir, 'a.json'), '')
  assert.throws(() => readManifests(dir), /unreadable|empty/)
  writeFileSync(path.join(dir, 'a.json'), '{ not json')
  assert.throws(() => readManifests(dir), /malformed JSON/)
  writeFileSync(path.join(dir, 'a.json'), '{}')
  assert.throws(() => readManifests(dir), /array/)
  cpSync(path.join(good, 'settings.json'), path.join(dir, 'a.json'))
  cpSync(path.join(good, 'settings.json'), path.join(dir, 'b.json'))
  assert.throws(() => readManifests(dir), /duplicate case id/)
  const dir2 = tmpDir('manifests-link')
  symlinkSync(path.join(good, 'settings.json'), path.join(dir2, 'c.json'))
  assert.throws(() => readManifests(dir2), /unreadable|not a regular file/)
  mkdirSync(path.join(dir2, 'd'))
})

test('extractors: capabilities, and the journey and door extractors on the committed shapes', () => {
  const j = extractJourneys(
    "const JOURNEYS = [\n  { id: 'J13', perCms: false, smoke: true },\n  // a comment\n  { id: 'J2c', perCms: true, notCovered: 'no source (plan §5 Q4)' },\n  { id: 'J14', perCms: false }\n]\n"
  )
  assert.deepEqual(j.unresolved, [])
  assert.deepEqual(j.items, [
    { id: 'J13', perCms: false, notCovered: null },
    { id: 'J2c', perCms: true, notCovered: 'no source (plan §5 Q4)' },
    { id: 'J14', perCms: false, notCovered: null }
  ])
  assert.match(extractCapabilities('# x').problem, /no §6/)
  assert.equal(extractCapabilities('## 6. t\n\n| **Team** | one | why |\n## 7. x').items[0].name, 'Team')
  const { doors, unresolved } = extractDoors([
    { rel: 'a.mjs', text: "x.post('/api/sites', {}); y.get(`/api/sites/${k}/state`); z.get(path)" }
  ])
  assert.deepEqual([...doors.keys()], ['door:POST /api/sites', 'door:GET /api/sites/:param/state'])
  assert.equal(unresolved.length, 1)
})

test('oracles/flows/requirements.json pins the sha256 of every oracle source the cases cite', async () => {
  const { existsSync, readdirSync } = await import('node:fs')
  const pinned = JSON.parse(readTextSync(path.join(REPO, 'tests/qa/oracles/flows/requirements.json')))
  const byPath = new Map(pinned.sources.map((s) => [s.path, s.sha256]))
  const dir = path.join(LAYER_DIR, 'cases')
  for (const f of readdirSync(dir))
    for (const m of JSON.parse(readTextSync(path.join(dir, f)))) {
      assert.ok(byPath.has(m.oracle.source), `${m.id}: oracle source ${m.oracle.source} is not pinned`)
      const file = path.join(REPO, docRel(REPO, m.oracle.source))
      assert.equal(existsSync(file) ? sha256File(file) : null, byPath.get(m.oracle.source), m.oracle.source)
    }
})
