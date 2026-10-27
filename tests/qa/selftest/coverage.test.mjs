import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { SHA, HERE, cli, fakeFingerprint, fakeGit, latestRunDir, readJson, tmpDir } from './helpers.mjs'
import { makeCase } from './fixtures/kit.mjs'
import { readBytesAsync, readTextAsync } from '../lib/bounded-reader.mjs'

const KIT = pathToFileURL(path.join(HERE, 'fixtures/kit.mjs')).href
const INDEX = `import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { passWithProof, result } from ${JSON.stringify(KIT)};
export const layer = 'unit';
const here = path.dirname(fileURLToPath(import.meta.url));
const read = async (f) => JSON.parse(await fs.readFile(path.join(here, f), 'utf8'));
export const listCases = async () => {
  const names = (await fs.readdir(path.join(here, 'cases'))).sort();
  return (await Promise.all(names.map((f) => read(path.join('cases', f))))).flat().filter((m) => m.id !== 'QA-UNIT-broken');
};
export async function run({ cases, outDir }) {
  const behavior = await read('behavior.json');
  return Promise.all(cases.map(async (m) => {
    const b = behavior[m.id] ?? 'PASS';
    if (b === 'PASS') return passWithProof(m, outDir);
    if (b === 'NOPROOF') return result(m, 'PASS');
    return result(m, b);
  }));
}
`

async function setup({ items, cases, denominator, behavior = {}, unresolved = [] }) {
  const layersDir = await tmpDir('cov-layers')
  const dir = path.join(layersDir, 'unit')
  await fs.mkdir(path.join(dir, 'cases'), { recursive: true })
  await fs.writeFile(path.join(dir, 'index.mjs'), INDEX)
  await fs.writeFile(path.join(dir, 'behavior.json'), JSON.stringify(behavior))
  for (const [i, c] of cases.entries())
    await fs.writeFile(path.join(dir, 'cases', `c${i}.json`), JSON.stringify(c))
  if (denominator !== false) {
    await fs.writeFile(
      path.join(dir, 'denominator.json'),
      JSON.stringify(tabled(denominator ?? { ...HEAD, revision: SHA, items, unresolved }))
    )
  }
  const resultsRoot = await tmpDir('cov-results')
  const state = { sha: SHA, dirty: '' }
  const env = { layersDir, resultsRoot, git: fakeGit(state), fingerprint: fakeFingerprint(state) }
  return {
    env,
    dir,
    state,
    resultsRoot,
    run: () => cli(['unit'], env),
    coverage: async (extra = []) => {
      const r = await cli(['coverage', '--layer', 'unit', '--json', ...extra], env)
      return { ...r, report: r.out ? JSON.parse(r.out)[0] : null }
    },
    text: (extra = []) => cli(['coverage', ...extra], env)
  }
}

// What every denominator must say besides its items (contracts/denominator.schema.json).
const HEAD = { schema: 'tracy-qa-denominator/v1', layer: 'unit', source: 'selftest', command: 'selftest' }
// Tests write an item's N-A as text; the file stores each text once in `naReasons` and the key in the item.
function tabled(doc) {
  if (!Array.isArray(doc.items)) return doc
  const naReasons = {}
  const items = doc.items.map((it) => ({
    ...it,
    na: Object.fromEntries(
      Object.entries(it.na ?? {}).map(([tag, text], i) => {
        const key = `${it.id}-${i}`
        naReasons[key] = text
        return [tag, key]
      })
    )
  }))
  return { naReasons, ...doc, items }
}
const item = (id, tags, na = {}) => ({
  id,
  kind: 'test-area',
  requiredTags: tags.filter((t) => !(t in na)),
  na
})
const caseFor = (key, tag, extra = {}) =>
  makeCase('unit', `${key}-${tag}`, { itemIds: [key], edgeTags: [tag], ...extra })

test('complete layer: every obligation PASS with RED proof, N-A has a reason → exit 0', async () => {
  const s = await setup({
    items: [
      item('a', ['happy', 'invalid']),
      item('b', ['happy', 'empty'], { empty: 'no collection; ADR 14 §2' })
    ],
    cases: [caseFor('a', 'happy'), caseFor('a', 'invalid'), caseFor('b', 'happy')]
  })
  assert.equal((await s.run()).code, 0)
  const r = await s.coverage(['--require-complete'])
  assert.equal(r.code, 0, JSON.stringify(r.report, null, 1))
  assert.equal(r.report.items, 2)
  assert.deepEqual(r.report.obligations, {
    required: 3,
    na: 1,
    implemented: 3,
    executed: 3,
    redProven: 3,
    verdicts: { PASS: 3, FAIL: 0, ENV: 0, PENDING: 0 }
  })
  assert.equal(r.report.open, 0)
  const text = await s.text(['--layer', 'unit'])
  assert.doesNotMatch(text.out, /%/, 'no blended percentage is ever printed')
  assert.match(text.out, /required 3 · N-A 1 · implemented 3 · executed 3 · RED-proven 3/)
})

test('--require-complete rejects open obligations: unimplemented, unexecuted, unproven, ENV, PENDING', async () => {
  const s = await setup({
    items: [
      item('a', ['happy', 'invalid', 'empty']),
      item('b', ['happy']),
      item('c', ['happy']),
      item('d', ['happy'])
    ],
    cases: [
      caseFor('a', 'happy'),
      caseFor('a', 'invalid'),
      caseFor('b', 'happy'),
      caseFor('c', 'happy'),
      caseFor('d', 'happy')
    ],
    behavior: {
      'QA-UNIT-a-invalid-happy': 'PENDING',
      'QA-UNIT-b-happy-happy': 'NOPROOF',
      'QA-UNIT-c-happy-happy': 'ENV'
    }
  })
  const before = await s.coverage(['--require-complete'])
  assert.equal(before.code, 3, 'no run yet: nothing executed')
  assert.equal((await s.run()).code, 3)
  const r = await s.coverage(['--require-complete'])
  assert.equal(r.code, 3)
  const o = r.report.obligations
  assert.equal(o.required, 6)
  assert.equal(o.implemented, 5, 'a/empty has no case')
  assert.equal(o.verdicts.PASS, 2, 'a/happy and d/happy')
  assert.equal(o.verdicts.ENV, 1)
  assert.equal(o.verdicts.PENDING, 3, 'a/invalid pending, a/empty unimplemented, b/happy downgraded')
  assert.equal(o.redProven, 2)
  assert.equal(r.report.open, 4)
  const plain = await s.coverage()
  assert.equal(plain.code, 0, 'plain coverage reports gaps without failing')
})

test('a FAIL obligation makes --require-complete exit 3', async () => {
  const s = await setup({
    items: [item('a', ['happy'])],
    cases: [caseFor('a', 'happy')],
    behavior: { 'QA-UNIT-a-happy-happy': 'FAIL' }
  })
  assert.equal((await s.run()).code, 1)
  const r = await s.coverage(['--require-complete'])
  assert.equal(r.code, 3)
  assert.equal(r.report.obligations.verdicts.FAIL, 1)
})

test('stale results stay open: other commit, or manifest changed after the run', async () => {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await s.run()
  assert.equal((await s.coverage(['--require-complete'])).code, 0)
  await fs.writeFile(
    path.join(s.dir, 'cases/c0.json'),
    JSON.stringify(caseFor('a', 'happy', { requirement: 'edited after the run' }))
  )
  const edited = await s.coverage(['--require-complete'])
  assert.equal(edited.code, 3)
  assert.match(edited.report.reasons.join(' '), /stale/)
  assert.equal(edited.report.obligations.executed, 0)
  await s.run()
  assert.equal((await s.coverage(['--require-complete'])).code, 0)
  s.state.sha = 'b'.repeat(40)
  const moved = await s.coverage(['--require-complete'])
  assert.equal(moved.code, 3)
  assert.match(moved.report.reasons.join(' '), /stale/)
})

test('only full local runs count: an --area run or a prod run does not satisfy coverage', async () => {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await cli(['unit', '--area', 'x'], {
    layersDir: path.dirname(s.dir),
    resultsRoot: s.resultsRoot,
    git: fakeGit()
  })
  assert.equal((await s.coverage(['--require-complete'])).code, 3)
})

test('missing denominator, invalid denominator, unresolved items and N-A without reason are open', async () => {
  const noDenominator = await setup({ items: [], cases: [caseFor('a', 'happy')], denominator: false })
  const r1 = await noDenominator.coverage(['--require-complete'])
  assert.equal(r1.code, 3)
  assert.match(r1.report.reasons.join(' '), /denominator\.json is missing/)
  const invalid = await setup({ items: [], cases: [], denominator: { source: 's' } })
  assert.equal((await invalid.coverage(['--require-complete'])).code, 3)
  const unresolved = await setup({
    items: [item('a', ['happy'])],
    cases: [caseFor('a', 'happy')],
    unresolved: [{ source: 'routes/x.js', reason: 'extractor could not read the file' }]
  })
  await unresolved.run()
  const r3 = await unresolved.coverage(['--require-complete'])
  assert.equal(r3.code, 3)
  assert.equal(r3.report.unresolved, 1)
  const blankNa = await setup({
    items: [item('a', ['happy', 'empty'], { empty: '  ' })],
    cases: [caseFor('a', 'happy')]
  })
  await blankNa.run()
  const r4 = await blankNa.coverage(['--require-complete'])
  assert.equal(r4.code, 3)
  assert.match(r4.report.reasons.join(' '), /denominator\.json invalid: .*N-A for empty is not/)
})

test('missing layers and invalid manifests stay visible and open', async () => {
  const s = await setup({
    items: [item('a', ['happy'])],
    cases: [caseFor('a', 'happy'), { id: 'QA-UNIT-broken' }]
  })
  await fs.writeFile(path.join(s.dir, 'cases/c1.json'), JSON.stringify({ id: 'QA-UNIT-broken' }))
  const r = await s.coverage(['--require-complete'])
  assert.equal(r.code, 3)
  assert.equal(r.report.cases.invalid, 1)
  const all = await s.text(['--require-complete'])
  assert.equal(all.code, 3)
  assert.match(all.out, /static: MISSING/)
  const gone = await s.text(['--layer', 'static', '--require-complete'])
  assert.equal(gone.code, 3)
})

test('manual obligations: captured needs the artifact hash, reviewed needs a receipt bound to hash and revision', async () => {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await s.run()
  const runDir = await latestRunDir(s.resultsRoot, 'unit')
  const png = Buffer.from('fake screenshot bytes')
  const sha = createHash('sha256').update(png).digest('hex')
  await fs.mkdir(path.join(runDir, 'screenshots'))
  await fs.writeFile(path.join(runDir, 'screenshots/home.png'), png)
  await fs.writeFile(
    path.join(runDir, 'manual-checklist.json'),
    JSON.stringify({
      schema_version: '1',
      items: [
        { id: 'home-en', artifact: 'screenshots/home.png', sha256: sha },
        { id: 'home-vi', artifact: 'screenshots/missing.png', sha256: sha }
      ]
    })
  )
  let r = await s.coverage(['--require-complete'])
  assert.deepEqual(r.report.manual, { required: 2, captured: 1, reviewed: 0, rejected: 0 })
  assert.equal(r.code, 3)
  const review = (extra = {}, receipts) => ({
    schema_version: '1',
    reviewer: 'reviewer',
    reviewed_at: '2026-10-05T10:00:00Z',
    revision: SHA,
    receipts: receipts ?? [{ id: 'home-en', status: 'accepted', artifact_sha256: sha }],
    ...extra
  })
  const write = (doc) => fs.writeFile(path.join(runDir, 'manual-review.json'), JSON.stringify(doc))
  await write(review())
  r = await s.coverage()
  assert.deepEqual(r.report.manual, { required: 2, captured: 1, reviewed: 1, rejected: 0 })
  await write(review({ revision: 'c'.repeat(40) }))
  assert.equal((await s.coverage()).report.manual.reviewed, 0, 'receipt bound to another revision is ignored')
  await write(review({}, [{ id: 'home-en', status: 'accepted', artifact_sha256: 'f'.repeat(64) }]))
  assert.equal(
    (await s.coverage()).report.manual.reviewed,
    0,
    'receipt for a different artifact hash is ignored'
  )
  await write(review({}, [{ id: 'home-en', status: 'rejected', artifact_sha256: sha }]))
  assert.equal((await s.coverage()).report.manual.rejected, 1)
  await write({ nonsense: true })
  r = await s.coverage()
  assert.equal(r.report.manual.reviewed, 0)
  assert.match(r.report.reasons.join(' '), /manual-review\.json invalid/)
  await fs.writeFile(path.join(runDir, 'screenshots/home.png'), 'changed after capture')
  await write(review())
  assert.equal(
    (await s.coverage()).report.manual.captured,
    0,
    'artifact edited after capture no longer counts'
  )
  const manualJson = await readJson(path.join(runDir, 'manual-checklist.json'))
  assert.equal(manualJson.items.length, 2)
})

test('an empty extraction, a stale denominator revision and a missing run are never complete', async () => {
  const empty = await setup({ items: [], cases: [] })
  await empty.run()
  const r1 = await empty.coverage(['--require-complete'])
  assert.equal(r1.code, 3)
  assert.match(r1.report.reasons.join(' '), /no items/)
  const none = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  assert.equal((await none.coverage(['--require-complete'])).code, 3, 'never run')
  const stale = await setup({
    denominator: {
      ...HEAD,
      revision: 'b'.repeat(40),
      items: [item('a', ['happy'])],
      unresolved: []
    },
    cases: [caseFor('a', 'happy')]
  })
  await stale.run()
  const r2 = await stale.coverage(['--require-complete'])
  assert.equal(r2.code, 3)
  assert.match(r2.report.reasons.join(' '), /denominator\.json is stale/)
})

test('unreadable git state keeps coverage open instead of disabling the revision check', async () => {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await s.run()
  const r = await cli(['coverage', '--layer', 'unit', '--json', '--require-complete'], {
    layersDir: path.dirname(s.dir),
    resultsRoot: s.resultsRoot,
    git: async () => {
      throw new Error('not a git repository')
    }
  })
  assert.equal(r.code, 3)
  assert.match(JSON.parse(r.out)[0].reasons.join(' '), /git state unavailable/)
})

test('a run whose cases.json or complete.json is malformed is not credited', async () => {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await s.run()
  const runDir = await latestRunDir(s.resultsRoot, 'unit')
  const original = await readTextAsync(path.join(runDir, 'cases.json'))
  for (const broken of ['{"schema_version":"1","cases":[{"id":"x"}]}', 'not json', '{"cases":{}}']) {
    await fs.writeFile(path.join(runDir, 'cases.json'), broken)
    const r = await s.coverage(['--require-complete'])
    assert.equal(r.code, 3, broken)
    assert.equal(r.report.obligations.executed, 0, broken)
  }
  await fs.writeFile(path.join(runDir, 'cases.json'), original)
  assert.equal((await s.coverage(['--require-complete'])).code, 0)
  const complete = await readJson(path.join(runDir, 'complete.json'))
  await fs.writeFile(
    path.join(runDir, 'complete.json'),
    JSON.stringify({ ...complete, git_sha: 'short', started_at: 'yesterday' })
  )
  assert.equal((await s.coverage(['--require-complete'])).code, 3)
})

test('manual: declared checks stay required without a checklist; repeated checklist ids and receipts stay open', async () => {
  const s = await setup({
    denominator: {
      ...HEAD,
      revision: SHA,
      items: [item('a', ['happy'])],
      unresolved: [],
      manual: [{ id: 'home-en' }, { id: 'home-vi' }]
    },
    cases: [caseFor('a', 'happy')]
  })
  await s.run()
  const runDir = await latestRunDir(s.resultsRoot, 'unit')
  let r = await s.coverage(['--require-complete'])
  assert.deepEqual(r.report.manual, { required: 2, captured: 0, reviewed: 0, rejected: 0 })
  assert.equal(r.code, 3)
  const png = Buffer.from('shot')
  const sha = createHash('sha256').update(png).digest('hex')
  await fs.writeFile(path.join(runDir, 'home.png'), png)
  await fs.writeFile(
    path.join(runDir, 'manual-checklist.json'),
    JSON.stringify({ schema_version: '1', items: [{ id: 'home-en', artifact: 'home.png', sha256: sha }] })
  )
  await fs.writeFile(
    path.join(runDir, 'manual-review.json'),
    JSON.stringify({
      schema_version: '1',
      reviewer: 'reviewer',
      reviewed_at: '2026-10-05T10:00:00Z',
      revision: SHA,
      receipts: [
        { id: 'home-en', status: 'accepted', artifact_sha256: sha },
        { id: 'home-en', status: 'accepted', artifact_sha256: sha }
      ]
    })
  )
  r = await s.coverage(['--require-complete'])
  assert.deepEqual(
    r.report.manual,
    { required: 2, captured: 1, reviewed: 0, rejected: 0 },
    'two receipts for one id, even identical, leave it open'
  )
  assert.match(r.report.reasons.join(' '), /repeated or conflicting receipts for home-en/)
  const review = path.join(runDir, 'manual-review.json')
  const doc = await readJson(review)
  await fs.writeFile(review, JSON.stringify({ ...doc, receipts: [doc.receipts[0]] }))
  r = await s.coverage(['--require-complete'])
  assert.deepEqual(r.report.manual, { required: 2, captured: 1, reviewed: 1, rejected: 0 }, 'one receipt')
  assert.equal(r.code, 3, 'home-vi is neither captured nor reviewed')
  await fs.writeFile(
    path.join(runDir, 'manual-checklist.json'),
    JSON.stringify({
      schema_version: '1',
      items: [
        { id: 'home-en', artifact: 'home.png', sha256: sha },
        { id: 'home-en', artifact: 'home.png', sha256: sha }
      ]
    })
  )
  r = await s.coverage()
  assert.equal(r.report.manual.captured, 0, 'a repeated checklist id stays open')
  assert.equal(r.report.manual.reviewed, 0)
})

test('coverage binds to tree content: committing the tested tree keeps the run, any edit makes it stale', async () => {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await s.run()
  assert.equal((await s.coverage(['--require-complete'])).code, 0)
  // Same content on a new commit (and a denominator extracted at the old commit): still current.
  const oldSha = s.state.sha
  s.state.commits = [oldSha]
  s.state.sha = 'c'.repeat(40)
  s.state.content = ''
  // fingerprint depends on sha in the fake; model "same content, new commit" by pinning it
  const env = { layersDir: path.dirname(s.dir), resultsRoot: s.resultsRoot, git: fakeGit(s.state) }
  const fp = fakeFingerprint({ sha: oldSha, dirty: '', content: '' })
  const same = await cli(['coverage', '--layer', 'unit', '--json', '--require-complete'], {
    ...env,
    fingerprint: fp
  })
  assert.equal(same.code, 0, same.out)
  // An edit to a product file (dirty tree, same HEAD) changes the fingerprint: stale.
  const edited = await cli(['coverage', '--layer', 'unit', '--json', '--require-complete'], {
    ...env,
    fingerprint: fakeFingerprint({ sha: oldSha, dirty: ' M apps/x.js\0', content: 'edit' })
  })
  assert.equal(edited.code, 3)
  assert.match(JSON.parse(edited.out)[0].reasons.join(' '), /other tree content/)
})

test('denominator staleness: changed or new source paths since its revision, non-ancestor, unknown commit', async () => {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await s.run()
  s.state.changed = 'apps/tracy-web/src/route.js\0'
  let r = await s.coverage(['--require-complete'])
  assert.equal(r.code, 3)
  assert.match(r.report.reasons.join(' '), /1 source path\(s\) changed since/)
  s.state.changed = ''
  s.state.untracked = 'apps/new.js\0'
  r = await s.coverage(['--require-complete'])
  assert.equal(r.code, 3)
  s.state.untracked = ''
  s.state.notAncestor = true
  r = await s.coverage(['--require-complete'])
  assert.match(r.report.reasons.join(' '), /not an ancestor/)
  s.state.notAncestor = false
  assert.equal((await s.coverage(['--require-complete'])).code, 0)
})

test('run artifacts must agree: PASS without proof, repeated ids, results.json and provenance.json drift', async () => {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await s.run()
  const runDir = await latestRunDir(s.resultsRoot, 'unit')
  const files = ['cases.json', 'results.json', 'provenance.json', 'complete.json']
  const original = Object.fromEntries(
    await Promise.all(files.map(async (f) => [f, await readJson(path.join(runDir, f))]))
  )
  original.report = await readTextAsync(path.join(runDir, 'report.md'))
  const write = (f, doc) => fs.writeFile(path.join(runDir, f), JSON.stringify(doc))
  const mutations = {
    'PASS without redProof': () =>
      write('cases.json', {
        ...original['cases.json'],
        cases: original['cases.json'].cases.map((c) => ({ ...c, redProof: null }))
      }),
    'repeated case id': () =>
      write('cases.json', {
        ...original['cases.json'],
        cases: [...original['cases.json'].cases, ...original['cases.json'].cases]
      }),
    'cases.json of another run': () => write('cases.json', { ...original['cases.json'], run_id: 'other' }),
    'results.json missing': () => fs.rm(path.join(runDir, 'results.json')),
    'results.json invalid': () => write('results.json', { ...original['results.json'], outcome: 'maybe' }),
    'results.json other run': () => write('results.json', { ...original['results.json'], run_id: 'other' }),
    'provenance.json missing': () => fs.rm(path.join(runDir, 'provenance.json')),
    'provenance.json other tree': () =>
      write('provenance.json', { ...original['provenance.json'], tree_fingerprint: 'e'.repeat(64) }),
    'results.json outcome failure': () =>
      write('results.json', { ...original['results.json'], outcome: 'failure' }),
    'results.json exit code 1': () => write('results.json', { ...original['results.json'], exit_code: 1 }),
    'complete.json outcome failure': () =>
      write('complete.json', { ...original['complete.json'], outcome: 'failure' }),
    'cases.json other target': () => write('cases.json', { ...original['cases.json'], target: 'dev' }),
    'cases.json other area': () => write('cases.json', { ...original['cases.json'], area: 'x' }),
    'provenance.json other target': () =>
      write('provenance.json', { ...original['provenance.json'], target: 'dev' }),
    'provenance.json other area': () =>
      write('provenance.json', { ...original['provenance.json'], area: 'x' }),
    'both exit codes 1 on an all-PASS run': () =>
      Promise.all([
        write('results.json', { ...original['results.json'], exit_code: 1 }),
        write('complete.json', { ...original['complete.json'], exit_code: 1 })
      ]),
    'both outcomes failure on an all-PASS run': () =>
      Promise.all([
        write('results.json', { ...original['results.json'], outcome: 'failure' }),
        write('complete.json', { ...original['complete.json'], outcome: 'failure' })
      ]),
    'cases.json counts drift': () =>
      write('cases.json', { ...original['cases.json'], counts: { PASS: 0, FAIL: 0, ENV: 0, PENDING: 1 } }),
    'cases.json counts missing': () => {
      const { counts: _counts, ...rest } = original['cases.json']
      return write('cases.json', rest)
    },
    'results.json started_at drift': () =>
      write('results.json', { ...original['results.json'], started_at: '2001-01-01T00:00:00.000Z' }),
    'results.json finished_at drift': () =>
      write('results.json', { ...original['results.json'], finished_at: '2001-01-01T00:00:00.000Z' }),
    'provenance dirty flag drift': () =>
      write('provenance.json', {
        ...original['provenance.json'],
        dirty: !original['provenance.json'].dirty
      }),
    'complete.json dirty missing': () => {
      const { dirty: _dirty, ...rest } = original['complete.json']
      return write('complete.json', rest)
    },
    'report.md replaced by another report': () =>
      fs.writeFile(path.join(runDir, 'report.md'), `${original.report}\nextra line\n`),
    'report.md tally line forged': () =>
      fs.writeFile(
        path.join(runDir, 'report.md'),
        original.report.replace('PASS 1 · FAIL 0', 'PASS 2 · FAIL 0')
      ),
    'provenance.json lacks node_version': () => {
      const { node_version: _v, ...rest } = original['provenance.json']
      return write('provenance.json', rest)
    },
    'provenance.json lacks the report receipt': () => {
      const { report_sha256: _h, ...rest } = original['provenance.json']
      return write('provenance.json', rest)
    },
    'report.md deleted': () => fs.rm(path.join(runDir, 'report.md')),
    'report.md emptied': () => fs.writeFile(path.join(runDir, 'report.md'), ''),
    'report.md is a directory': async () => {
      await fs.rm(path.join(runDir, 'report.md'))
      await fs.mkdir(path.join(runDir, 'report.md'))
    },
    'artifact list lacks report.md': () =>
      write('results.json', {
        ...original['results.json'],
        artifacts: original['results.json'].artifacts.filter((a) => a !== 'report.md')
      }),
    'artifact list names a file no case lists': () =>
      write('results.json', {
        ...original['results.json'],
        artifacts: [...original['results.json'].artifacts, 'ghost.txt']
      }),
    'unsolicited extra case, counts adjusted to match': () => {
      const extra = { ...original['cases.json'].cases[0], id: 'QA-UNIT-unsolicited' }
      const counts = { PASS: 2, FAIL: 0, ENV: 0, PENDING: 0 }
      return Promise.all([
        write('cases.json', {
          ...original['cases.json'],
          counts,
          cases: [...original['cases.json'].cases, extra]
        }),
        write('complete.json', { ...original['complete.json'], counts })
      ])
    },
    'counts drift': () =>
      write('complete.json', {
        ...original['complete.json'],
        counts: { PASS: 0, FAIL: 0, ENV: 0, PENDING: 1 }
      })
  }
  for (const [name, mutate] of Object.entries(mutations)) {
    for (const f of files) await write(f, original[f])
    await mutate()
    const r = await s.coverage(['--require-complete'])
    assert.equal(r.code, 3, name)
    assert.equal(r.report.obligations.executed, 0, name)
    assert.equal(r.report.obligations.redProven, 0, name)
    assert.match(
      r.report.reasons.join(' '),
      /the run is not credited|complete\.json invalid|do not match the current manifests/,
      name
    )
    await fs.rm(path.join(runDir, 'report.md'), { recursive: true, force: true })
    await fs.writeFile(path.join(runDir, 'report.md'), original.report)
  }
  for (const f of files) await write(f, original[f])
  assert.equal((await s.coverage(['--require-complete'])).code, 0)
})

test('a case outside the required tags that is not PASS keeps the layer open', async () => {
  const s = await setup({
    items: [item('a', ['happy'])],
    cases: [caseFor('a', 'happy'), caseFor('a', 'extra')],
    behavior: { 'QA-UNIT-a-extra-happy': 'FAIL' }
  })
  await s.run()
  const r = await s.coverage(['--require-complete'])
  assert.equal(r.code, 3)
  assert.equal(r.report.fail, 1)
  assert.match(r.report.reasons.join(' '), /outside the required obligations/)
  const pending = await setup({
    items: [item('a', ['happy'])],
    cases: [caseFor('a', 'happy'), caseFor('a', 'extra')],
    behavior: { 'QA-UNIT-a-extra-happy': 'PENDING' }
  })
  await pending.run()
  assert.equal((await pending.coverage(['--require-complete'])).code, 3)
})

test('N-A needs a reason and a source', async () => {
  for (const reason of [
    'not applicable',
    'x',
    '  ',
    'not applicable /',
    'not applicable, source:',
    'not applicable, source: -',
    'see ADR',
    'not applicable §',
    'not applicable; source: --',
    'not applicable; --',
    'not applicable; source: /',
    'source: docs/x.md',
    'docs/x.md',
    'docs/x.md; ADR 14',
    'not applicable; source: ../x.md',
    'not applicable; source: /etc/passwd.md',
    'not applicable; source: ADR',
    'not applicable; source: #',
    'not applicable; source: http://',
    'not applicable; docs/x.md and more words'
  ]) {
    const s = await setup({
      items: [item('a', ['happy', 'empty'], { empty: reason })],
      cases: [caseFor('a', 'happy')]
    })
    await s.run()
    const r = await s.coverage(['--require-complete'])
    assert.equal(r.code, 3, reason)
    assert.match(
      r.report.reasons.join(' '),
      /denominator\.json invalid: .*(N-A for empty is not|shorter than)/,
      reason
    )
  }
})

test('a full run written with --out is found by name-independent discovery and by --runs', async () => {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  const canary = path.join(s.resultsRoot, 'canary')
  assert.equal((await cli(['unit', '--out', canary], s.env)).code, 0)
  assert.equal((await s.coverage(['--require-complete'])).code, 0)
  // A run kept outside the results root is only credited when pointed at with --runs.
  const outside = await tmpDir('cov-outside')
  const elsewhere = path.join(outside, 'run')
  await fs.rename(canary, elsewhere)
  assert.equal((await s.coverage(['--require-complete'])).code, 3)
  assert.equal((await s.coverage(['--require-complete', '--runs', outside])).code, 0)
  assert.equal((await s.coverage(['--require-complete', '--runs', elsewhere])).code, 0)
})

test('a case naming an item the denominator does not list keeps the layer open', async () => {
  const s = await setup({
    items: [item('a', ['happy'])],
    cases: [caseFor('a', 'happy'), caseFor('a', 'extra', { itemIds: ['a', 'ghost'] })]
  })
  await s.run()
  const r = await s.coverage(['--require-complete'])
  assert.equal(r.code, 3)
  assert.match(r.report.reasons.join(' '), /item ghost that denominator\.json does not list/)
})

test('N-A accepts exactly the documented reference forms', async () => {
  for (const reason of [
    'no collection here; source: docs/x.md',
    'no collection here; docs/references/x.md#part',
    'no collection here; ADR 14 §2',
    'no collection here; source: ADR 0014',
    'no collection here; #123',
    'no collection here; source: https://example.test/spec'
  ]) {
    const s = await setup({
      items: [item('a', ['happy', 'empty'], { empty: reason })],
      cases: [caseFor('a', 'happy')]
    })
    await s.run()
    assert.equal((await s.coverage(['--require-complete'])).code, 0, reason)
  }
})

async function passingRun() {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await s.run()
  const runDir = await latestRunDir(s.resultsRoot, 'unit')
  const casesFile = path.join(runDir, 'cases.json')
  return { s, runDir, casesFile, cases: await readJson(casesFile) }
}

test('proof logs are re-verified after the run: deleted, emptied, changed, wrong kind, wrong assertion', async () => {
  const { s, runDir, casesFile, cases } = await passingRun()
  assert.equal((await s.coverage(['--require-complete'])).code, 0, 'positive control')
  const entry = cases.cases[0]
  assert.ok(entry.receipts.proof.sha256, 'the runner recorded a proof receipt')
  const log = path.join(runDir, entry.redProof.log)
  const original = await readBytesAsync(log)
  const mutations = {
    deleted: async () => fs.rm(log),
    emptied: async () => fs.writeFile(log, ''),
    changed: async () => fs.writeFile(log, 'different bytes'),
    directory: async () => {
      await fs.rm(log)
      await fs.mkdir(log)
    },
    symlink: async () => {
      await fs.rm(log)
      await fs.symlink(casesFile, log)
    }
  }
  for (const [name, mutate] of Object.entries(mutations)) {
    await mutate()
    const r = await s.coverage(['--require-complete'])
    assert.equal(r.code, 3, name)
    assert.equal(r.report.obligations.redProven, 0, name)
    assert.equal(r.report.obligations.verdicts.PASS, 0, name)
    await fs.rm(log, { recursive: true, force: true })
    await fs.writeFile(log, original)
  }
  assert.equal((await s.coverage(['--require-complete'])).code, 0, 'restored bytes are credited again')
  const doc = JSON.parse(await readTextAsync(casesFile))
  const tweak = async (change) => {
    const copy = structuredClone(doc)
    change(copy.cases[0])
    await fs.writeFile(casesFile, JSON.stringify(copy))
    return s.coverage(['--require-complete'])
  }
  for (const [name, change] of Object.entries({
    'assertion not in the manifest': (e) => {
      e.redProof.assertionId = 'ghost'
      e.assertionIds.push('ghost')
    },
    'assertion not reported': (e) => {
      e.assertionIds = []
    },
    'receipt removed': (e) => {
      delete e.receipts
    },
    'receipt hash wrong': (e) => {
      e.receipts.proof.sha256 = 'f'.repeat(64)
    }
  })) {
    assert.equal((await tweak(change)).code, 3, name)
  }
  await fs.writeFile(casesFile, JSON.stringify(doc))
  assert.equal((await s.coverage(['--require-complete'])).code, 0)
})

test('evidence files are re-verified after the run: deleted or changed evidence is not credited', async () => {
  const layersDir = await tmpDir('cov-evidence')
  const dir = path.join(layersDir, 'unit')
  await fs.mkdir(path.join(dir, 'cases'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'index.mjs'),
    INDEX.replace(
      "if (b === 'PASS') return passWithProof(m, outDir);",
      "if (b === 'PASS') { const r = await passWithProof(m, outDir); await fs.mkdir(path.join(outDir, 'ev'), { recursive: true }); await fs.writeFile(path.join(outDir, 'ev/a.txt'), 'seen'); return { ...r, evidence: ['ev/a.txt'] }; }"
    )
  )
  await fs.writeFile(path.join(dir, 'behavior.json'), '{}')
  await fs.writeFile(path.join(dir, 'cases/c0.json'), JSON.stringify(caseFor('a', 'happy')))
  await fs.writeFile(
    path.join(dir, 'denominator.json'),
    JSON.stringify(tabled({ ...HEAD, revision: SHA, items: [item('a', ['happy'])], unresolved: [] }))
  )
  const resultsRoot = await tmpDir('cov-evidence-results')
  const state = { sha: SHA, dirty: '' }
  const env = { layersDir, resultsRoot, git: fakeGit(state), fingerprint: fakeFingerprint(state) }
  assert.equal((await cli(['unit'], env)).code, 0)
  const check = async () =>
    (await cli(['coverage', '--layer', 'unit', '--json', '--require-complete'], env)).code
  assert.equal(await check(), 0, 'positive control')
  const evidence = path.join(await latestRunDir(resultsRoot, 'unit'), 'ev/a.txt')
  await fs.writeFile(evidence, 'tampered')
  assert.equal(await check(), 3)
  await fs.writeFile(evidence, 'seen')
  assert.equal(await check(), 0)
  await fs.rm(evidence)
  assert.equal(await check(), 3)
})

test('results.json workflow_ref, adapter and command must match what the runner writes', async () => {
  const { s, runDir } = await passingRun()
  const resultsFile = path.join(runDir, 'results.json')
  const provenanceFile = path.join(runDir, 'provenance.json')
  const results = await readJson(resultsFile)
  const provenance = await readJson(provenanceFile)
  const cases = {
    workflow_ref: async () =>
      fs.writeFile(
        resultsFile,
        JSON.stringify({ ...results, environment: { ...results.environment, workflow_ref: 'ci:nightly' } })
      ),
    adapter: async () => fs.writeFile(resultsFile, JSON.stringify({ ...results, adapter: 'tch-qa-other' })),
    'command differs from provenance': async () =>
      fs.writeFile(resultsFile, JSON.stringify({ ...results, command: 'pnpm qa unit --target dev' })),
    'prove_red differs': async () =>
      fs.writeFile(provenanceFile, JSON.stringify({ ...provenance, prove_red: !provenance.prove_red }))
  }
  for (const [name, mutate] of Object.entries(cases)) {
    await mutate()
    assert.equal((await s.coverage(['--require-complete'])).code, 3, name)
    await fs.writeFile(resultsFile, JSON.stringify(results))
    await fs.writeFile(provenanceFile, JSON.stringify(provenance))
  }
  assert.equal((await s.coverage(['--require-complete'])).code, 0, 'restored')
})

test('an item that requires no edge tag is an empty extraction, not completeness', async () => {
  const s = await setup({ items: [item('a', [])], cases: [] })
  await s.run()
  const r = await s.coverage(['--require-complete'])
  assert.equal(r.code, 3)
  assert.equal(r.report.obligations.required, 0)
  assert.match(r.report.reasons.join(' '), /require no edge tag/)
  const ok = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await ok.run()
  assert.equal((await ok.coverage(['--require-complete'])).code, 0, 'positive control')
})

test('a newer run that never finished is not hidden by an older complete PASS', async () => {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await s.run()
  const check = async (extra = []) => s.coverage(['--require-complete', ...extra])
  assert.equal((await check()).code, 0, 'positive control')
  const make = async (root, name, files = {}) => {
    const dir = path.join(root, name)
    await fs.mkdir(dir, { recursive: true })
    for (const [file, text] of Object.entries(files)) await fs.writeFile(path.join(dir, file), text)
    return dir
  }
  const reservation = (extra) =>
    JSON.stringify({ run_id: 'x', layer: 'unit', target: 'local', area: null, ...extra })
  const FUTURE = '2999-01-01T00:00:00.000Z'
  const cases = {
    'default-named dir without complete.json': ['29990101T000000Z-unit', {}],
    'reserved custom --out that never completed': [
      'canary',
      { '.qa-reserved': reservation({ started_at: FUTURE }) }
    ],
    'unparseable complete.json': ['29990101T000001Z-unit', { 'complete.json': '{nope' }],
    'schema-invalid complete.json': [
      'canary2',
      { '.qa-reserved': reservation({ started_at: FUTURE }), 'complete.json': '{"layer":"unit"}' }
    ]
  }
  for (const [name, [dir, files]] of Object.entries(cases)) {
    const made = await make(s.resultsRoot, dir, files)
    const r = await check()
    assert.equal(r.code, 3, name)
    assert.equal(r.report.run, null, name)
    assert.match(r.report.reasons.join(' '), /never completed/, name)
    await fs.rm(made, { recursive: true })
    assert.equal((await check()).code, 0, `${name}: removed`)
  }
  // Runs that cannot have been credited, or that are older, do not shadow.
  const ignored = {
    'older unfinished run': ['20000101T000000Z-unit', {}],
    'another layer': ['29990101T000000Z-api', {}],
    'an --area slice': ['slice', { '.qa-reserved': reservation({ area: 'x', started_at: FUTURE }) }],
    'a prod run': ['prod', { '.qa-reserved': reservation({ target: 'prod', started_at: FUTURE }) }],
    'the stands directory': ['stands', {}]
  }
  for (const [name, [dir, files]] of Object.entries(ignored)) {
    const made = await make(s.resultsRoot, dir, files)
    assert.equal((await check()).code, 0, name)
    await fs.rm(made, { recursive: true })
  }
  // The same holds for a folder passed with --runs.
  const outside = await tmpDir('cov-shadow')
  await make(outside, 'later', { '.qa-reserved': reservation({ started_at: FUTURE }) })
  assert.equal((await check()).code, 0, 'a folder nobody pointed at is not looked at')
  const pointed = await check(['--runs', outside])
  assert.equal(pointed.code, 3)
  assert.match(pointed.report.reasons.join(' '), /never completed/)
})

test('a result under a stale manifest hash is not credited as executed or RED-proven', async () => {
  const s = await setup({
    items: [item('a', ['happy', 'invalid'])],
    cases: [caseFor('a', 'happy'), caseFor('a', 'invalid')]
  })
  await s.run()
  const before = await s.coverage(['--require-complete'])
  assert.equal(before.code, 0, 'positive control')
  assert.equal(before.report.obligations.executed, 2)
  const file = path.join(s.dir, 'cases', 'c0.json')
  const manifest = await readJson(file)
  await fs.writeFile(file, JSON.stringify({ ...manifest, requirement: `${manifest.requirement} (edited)` }))
  const r = await s.coverage(['--require-complete'])
  assert.equal(r.code, 3)
  assert.equal(r.report.obligations.executed, 0, 'the unchanged case is not credited either')
  assert.equal(r.report.obligations.redProven, 0)
  assert.equal(r.report.cases.verdicts.PASS, 0)
})

test('a damaged or deleted marker on a newer --out run is reported, never skipped', async () => {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await s.run()
  assert.equal((await s.coverage(['--require-complete'])).code, 0, 'positive control')
  const newer = path.join(s.resultsRoot, 'canary')
  await fs.mkdir(newer)
  const base = { run_id: 'x', layer: 'unit', target: 'local', area: null }
  const variants = {
    'reservation corrupt': { '.qa-reserved': '{nope', 'cases.json': '{}' },
    'reservation deleted, cases.json left': { 'cases.json': JSON.stringify({ layer: 'unit' }) },
    'reservation deleted, only a report left': { 'report.md': '# partial' },
    'reservation intact, complete.json corrupt': {
      '.qa-reserved': JSON.stringify({ ...base, started_at: '2999-01-01T00:00:00.000Z' }),
      'complete.json': '[]'
    }
  }
  for (const [name, files] of Object.entries(variants)) {
    for (const [file, text] of Object.entries(files)) await fs.writeFile(path.join(newer, file), text)
    const r = await s.coverage(['--require-complete'])
    assert.equal(r.code, 3, name)
    assert.equal(r.report.run, null, name)
    assert.match(r.report.reasons.join(' '), /never completed/, name)
    await fs.rm(newer, { recursive: true })
    await fs.mkdir(newer)
  }
  await fs.rm(newer, { recursive: true })
  assert.equal((await s.coverage(['--require-complete'])).code, 0, 'removed again')
})

test('--runs naming a missing path, a regular file or a symlink is reported open', async () => {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await s.run()
  const outside = await tmpDir('cov-runs')
  const file = path.join(outside, 'file')
  await fs.writeFile(file, 'x')
  const link = path.join(outside, 'link')
  await fs.symlink(s.resultsRoot, link)
  for (const [name, target] of Object.entries({
    missing: path.join(outside, 'absent'),
    'regular file': file,
    symlink: link
  })) {
    const r = await s.coverage(['--require-complete', '--runs', target])
    assert.equal(r.code, 3, name)
    assert.equal(r.report.run, null, name)
    assert.match(r.report.reasons.join(' '), /cannot search for runs/, name)
  }
  assert.equal((await s.coverage(['--require-complete', '--runs', outside])).code, 0, 'a real folder')
  // A results root that is a regular file is an error too, not "no run".
  const rootFile = await tmpDir('cov-rootfile')
  await fs.writeFile(path.join(rootFile, 'r'), 'x')
  const bad = await cli(['coverage', '--layer', 'unit', '--json', '--require-complete'], {
    ...s.env,
    resultsRoot: path.join(rootFile, 'r')
  })
  assert.equal(bad.code, 3)
  assert.match(JSON.parse(bad.out)[0].reasons.join(' '), /cannot search for runs/)
})

const without = (doc, key) => Object.fromEntries(Object.entries(doc).filter(([k]) => k !== key))

test('a completed run without a valid .qa-reserved marker is not credited', async () => {
  const s = await setup({ items: [item('a', ['happy'])], cases: [caseFor('a', 'happy')] })
  await s.run()
  const runDir = await latestRunDir(s.resultsRoot, 'unit')
  const marker = path.join(runDir, '.qa-reserved')
  const good = await readTextAsync(marker)
  assert.equal((await s.coverage(['--require-complete'])).code, 0, 'positive control')
  const variants = {
    deleted: null,
    corrupt: '{nope',
    'another run id': JSON.stringify({ ...JSON.parse(good), run_id: 'other' }),
    'another layer': JSON.stringify({ ...JSON.parse(good), layer: 'other' }),
    'started_at missing': JSON.stringify(without(JSON.parse(good), 'started_at')),
    'started_at shifted': JSON.stringify({
      ...JSON.parse(good),
      started_at: new Date(Date.parse(JSON.parse(good).started_at) + 1000).toISOString()
    }),
    'started_at wrong type': JSON.stringify({ ...JSON.parse(good), started_at: 5 }),
    'area missing': JSON.stringify(without(JSON.parse(good), 'area')),
    'area wrong type': JSON.stringify({ ...JSON.parse(good), area: 3 }),
    'pid missing': JSON.stringify(without(JSON.parse(good), 'pid')),
    'pid corrupted': JSON.stringify({ ...JSON.parse(good), pid: 'abc' }),
    'pid not positive': JSON.stringify({ ...JSON.parse(good), pid: -4 }),
    'unknown extra field': JSON.stringify({ ...JSON.parse(good), extra: true })
  }
  for (const [name, text] of Object.entries(variants)) {
    if (text === null) await fs.rm(marker)
    else await fs.writeFile(marker, text)
    const r = await s.coverage(['--require-complete'])
    assert.equal(r.code, 3, name)
    assert.equal(r.report.cases.verdicts.PASS, 0, name)
    assert.equal(r.report.obligations.executed, 0, name)
  }
  await fs.writeFile(marker, good)
  assert.equal((await s.coverage(['--require-complete'])).code, 0, 'restored marker credits again')
})

test('a run whose case IDs differ from the manifests in either direction is not credited', async () => {
  const s = await setup({
    items: [item('a', ['happy']), item('b', ['happy'])],
    cases: [caseFor('a', 'happy'), caseFor('b', 'happy')]
  })
  await s.run()
  const runDir = await latestRunDir(s.resultsRoot, 'unit')
  const read = (f) => readJson(path.join(runDir, f))
  const write = (f, doc) => fs.writeFile(path.join(runDir, f), JSON.stringify(doc))
  const cases = await read('cases.json')
  const complete = await read('complete.json')
  assert.equal((await s.coverage(['--require-complete'])).code, 0, 'positive control')
  // Drop one result and make counts consistent; the manifest set still has two cases.
  const kept = { ...cases, cases: cases.cases.slice(1), counts: { PASS: 1, FAIL: 0, ENV: 0, PENDING: 0 } }
  await write('cases.json', kept)
  await write('complete.json', { ...complete, counts: kept.counts })
  const r = await s.coverage(['--require-complete'])
  assert.equal(r.code, 3)
  assert.equal(r.report.obligations.executed, 0)
  assert.equal(r.report.obligations.redProven, 0)
  assert.match(r.report.reasons.join(' '), /case IDs differ/)
})
