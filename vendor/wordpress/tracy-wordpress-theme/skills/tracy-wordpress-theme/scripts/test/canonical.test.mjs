import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import { resolveContract, candidatesFor, bindingsFrom, stalenessOf, identityOf, supersede, contractHash, isGroupCanonicalPath, CANONICAL, ATTEMPTS_DIR } from '../lib/canonical.mjs'
import { namedRoots, recordData, recordPath, recordText, repoRootOf, resolveRecordPath } from '../lib/record-paths.mjs'
import { contractsFor, buildVerification } from '../quickstart/release.mjs'
import { designContract, visualContract } from './quickstart-contracts.mjs'
import { machine, testBase, withHome } from './lib/test-root.mjs'

const SCRATCH = testBase()

function runRoot({ canonical = true, siblings = [], attempts = [] } = {}) {
  const dir = mkdtempSync(path.join(SCRATCH, 'run-root-'))
  const body = (id) => JSON.stringify({ schemaVersion: 1, id, pages: [] })
  if (canonical) writeFileSync(path.join(dir, CANONICAL.design), body('canonical'))
  for (const s of siblings) writeFileSync(path.join(dir, s), body(s))
  for (const a of attempts) {
    mkdirSync(path.join(dir, ATTEMPTS_DIR, a), { recursive: true })
    writeFileSync(path.join(dir, ATTEMPTS_DIR, a, CANONICAL.design), body(a))
  }
  return dir
}
function spec(sections = '{}') {
  const dir = mkdtempSync(path.join(SCRATCH, 'spec-'))
  writeFileSync(path.join(dir, 'page-map.json'), '{"pages":[]}')
  writeFileSync(path.join(dir, 'sections.json'), sections)
  writeFileSync(path.join(dir, 'content.json'), '{}')
  return dir
}

test('canonical: many contracts in scratch never make a tool pick one — attempts are listed, never chosen; a sibling beside the canonical stops the run', () => {
  const dir = runRoot({ attempts: ['pilot-1', 'pilot-2'] })
  const r = resolveContract({ runRoot: dir, name: CANONICAL.design })
  assert.equal(r.path, path.join(dir, CANONICAL.design))
  assert.equal(r.canonical, true)
  assert.equal(r.attempts.length, 2, 'attempts are reported, not used')
  const two = runRoot({ siblings: ['design-contract-v2.json'] })
  assert.throws(() => resolveContract({ runRoot: two, name: CANONICAL.design }), /more than one design-contract contract beside the canonical/)
  assert.equal(candidatesFor(two, CANONICAL.design).length, 2)
})

test('canonical: a missing canonical fails and names what it found; an explicit --contract on an attempt is accepted but marked not canonical', () => {
  const dir = runRoot({ canonical: false, attempts: ['pilot-1'] })
  assert.throws(() => resolveContract({ runRoot: dir, name: CANONICAL.design }), /is missing — the run-root has no canonical design-contract.json; found attempt/)
  assert.throws(() => resolveContract({ name: CANONICAL.design }), /no --contract and no --run-root/)
  const attempt = path.join(dir, ATTEMPTS_DIR, 'pilot-1', CANONICAL.design)
  const r = resolveContract({ runRoot: dir, explicit: attempt, name: CANONICAL.design })
  assert.equal(r.canonical, false)
  assert.equal(r.source, 'explicit')
})

test('canonical: bindings record the input hashes; a changed spec-pack makes the contract stale; identity carries path, hashes and a timestamp', () => {
  const s = spec()
  const bindings = bindingsFrom({ specDir: s })
  const contract = { schemaVersion: 1, id: 'x', bindings }
  assert.deepEqual(stalenessOf(contract, bindingsFrom({ specDir: s })), [])
  writeFileSync(path.join(s, 'sections.json'), '{"changed":true}')
  const stale = stalenessOf(contract, bindingsFrom({ specDir: s }))
  assert.equal(stale.length, 1)
  assert.match(stale[0], /^specHash: contract sha256:/)
  const dir = runRoot()
  const p = path.join(dir, CANONICAL.design)
  writeFileSync(p, JSON.stringify(contract))
  const id = identityOf({ contractPath: p, contract, specDir: s })
  assert.equal(id.contractPath, p)
  assert.equal(id.canonical, true)
  assert.equal(id.contractHash, contractHash(contract))
  assert.equal(id.contractHash, contractHash({ ...contract, bindings: { other: 1 } }), 'rebinding does not move the contract hash')
  assert.ok(id.sourceHash.startsWith('sha256:') && id.capturedAt && id.stale.length === 1)
})

test('canonical: supersede moves the old canonical under attempts with a note, never deletes', () => {
  const dir = runRoot()
  const old = readFileSync(path.join(dir, CANONICAL.design), 'utf8')
  const moved = supersede({ runRoot: dir, name: CANONICAL.design, reason: 'test' })
  assert.ok(moved.includes(`${ATTEMPTS_DIR}${path.sep}superseded-`))
  assert.equal(readFileSync(moved, 'utf8'), old)
  assert.ok(!existsSync(path.join(dir, CANONICAL.design)))
  const note = JSON.parse(readFileSync(path.join(path.dirname(moved), 'SUPERSEDED.json'), 'utf8'))
  assert.equal(note.status, 'superseded')
  assert.equal(supersede({ runRoot: dir, name: CANONICAL.design }), null, 'nothing to supersede the second time')
})

test('canonical: a release refuses a run-root without both canonical contracts or with a stale one, and quotes them in VERIFICATION', () => {
  const s = spec()
  const dir = runRoot()
  assert.throws(() => contractsFor({ runRoot: dir, specDir: s }), /visual.contract.json is missing/)
  writeFileSync(path.join(dir, CANONICAL.visual), JSON.stringify(visualContract(bindingsFrom({ specDir: s }))))
  writeFileSync(path.join(dir, CANONICAL.design), JSON.stringify(designContract(bindingsFrom({ specDir: s }))))
  const contracts = contractsFor({ runRoot: dir, specDir: s })
  assert.equal(contracts.visual.contractPath, path.join(dir, CANONICAL.visual))
  const v = buildVerification({ manifest: { id: 'x/wp7', version: '1.0.0' }, parity: { summary: {} }, restoreReport: null, contracts, visual: { run: '/r', identity: contracts.visual, at: 'now', summary: { stages: {}, findings: 0 } } })
  assert.equal(v.contracts.design.contractPath, path.join(dir, CANONICAL.design))
  assert.equal(v.visual.contractPath, contracts.visual.contractPath)
  writeFileSync(path.join(s, 'content.json'), '{"moved":1}')
  assert.throws(() => contractsFor({ runRoot: dir, specDir: s }), /is stale/)
})

test('canonical: a group contract is canonical only at its exact dossier path — a symlink to it, a copy or an attempts/ link is not', () => {
  const dir = mkdtempSync(path.join(SCRATCH, 'canon-link-'))
  const contract = { group: { id: 'g1', pages: ['/a'], dossier: dir } }
  const real = path.join(dir, 'visual.contract.json')
  writeFileSync(real, JSON.stringify(contract))
  assert.equal(isGroupCanonicalPath(real, contract), true)
  mkdirSync(path.join(dir, 'attempts'))
  const link = path.join(dir, 'attempts', 'visual.contract.json')
  symlinkSync(real, link)
  assert.equal(isGroupCanonicalPath(link, contract), false, 'an attempts/ symlink to the canonical file')
  const alias = path.join(dir, 'alias')
  symlinkSync(dir, alias)
  assert.equal(isGroupCanonicalPath(path.join(alias, 'visual.contract.json'), contract), false, 'a directory link to the dossier is an alias, not the dossier')
  rmSync(path.join(dir, 'attempts'), { recursive: true })
  symlinkSync(dir, path.join(dir, 'attempts'))
  assert.equal(isGroupCanonicalPath(path.join(dir, 'attempts', 'visual.contract.json'), contract), false, 'attempts/ itself linked to the dossier')
  // a symlinked ANCESTOR (a temp root such as /var → /private/var) names the same dossier
  const parent = mkdtempSync(path.join(SCRATCH, 'canon-anc-'))
  mkdirSync(path.join(parent, 'dossier'))
  const root = path.join(parent, 'dossier')
  const ac = { group: { id: 'g1', pages: ['/a'], dossier: root } }
  writeFileSync(path.join(root, 'visual.contract.json'), JSON.stringify(ac))
  const viaLink = path.join(parent, 'via')
  symlinkSync(parent, viaLink)
  assert.equal(isGroupCanonicalPath(path.join(viaLink, 'dossier', 'visual.contract.json'), ac), true, 'the same file through a linked ancestor')
  const swapped = path.join(dir, 'swap')
  mkdirSync(swapped)
  const sc = { group: { id: 'g1', pages: ['/a'], dossier: swapped } }
  symlinkSync(real, path.join(swapped, 'visual.contract.json'))
  assert.equal(isGroupCanonicalPath(path.join(swapped, 'visual.contract.json'), sc), false, 'the dossier file itself a link')
})

// ---------------------------------------------------------------- paths in kept records (lib/record-paths.mjs)

test('record paths: inside the repository → repository-relative; outside, under home → ~/…; anything else unchanged', () => {
  const m = machine()
  assert.equal(recordPath(path.join(m.repo, 'tasks', 'site', 'design-contract.json'), m.opts), 'tasks/site/design-contract.json')
  assert.equal(recordPath(m.repo, m.opts), '.')
  assert.equal(recordPath(path.join(m.home, 'data', 'site', 'j6'), m.opts), '~/data/site/j6')
  assert.equal(recordPath(m.home, m.opts), '~')
  assert.equal(recordPath('/opt/elsewhere/x.json', m.opts), '/opt/elsewhere/x.json', 'neither in the repository nor under home')
  assert.equal(recordPath('tasks/site/x.json', m.opts), 'tasks/site/x.json', 'a relative path is not rewritten')
  assert.equal(recordPath('http://127.0.0.1:8300', m.opts), 'http://127.0.0.1:8300')
  assert.equal(recordPath(null, m.opts), null)
  // the repository wins over home, and without one only home is folded
  assert.equal(recordPath(path.join(m.repo, 'a'), { home: m.home }), '~/work/repo/a')
  // containment is by path component: a sibling whose name starts the same is outside
  assert.equal(recordPath(`${m.repo}-other/tasks/x`, m.opts), '~/work/repo-other/tasks/x')
  assert.equal(recordPath(`${m.home}2/data`, m.opts), `${m.home}2/data`)
  assert.equal(recordPath(path.join(m.repo, 'tasks', '..', '..', 'outside'), m.opts), '~/work/outside', 'a path that climbs out is judged after it is normalised')
})

test('record paths: text and nested data — every path in a reason, a command line or a note is rewritten, whole components only', () => {
  const m = machine()
  assert.equal(recordText(`adopt ${m.repo}/tasks/site/spec/design-contract.json`, m.opts), 'adopt tasks/site/spec/design-contract.json')
  assert.equal(recordText(`node ${m.repo}/tools/x.mjs --out ${m.home}/data/site/out --root ${m.repo} --home=${m.home}`, m.opts), 'node tools/x.mjs --out ~/data/site/out --root . --home=~')
  assert.equal(recordText(`${m.home}/data/site/j6/inventory.json (extensions, com_content extension_id 19)`, m.opts), '~/data/site/j6/inventory.json (extensions, com_content extension_id 19)')
  assert.equal(recordText(`${m.repo}-other/x and ${m.home}2/y and x${m.home}/z`, m.opts), `~/work/repo-other/x and ${m.home}2/y and x${m.home}/z`)
  assert.equal(recordText('plain words, ../../etc/passwd and ~/already', m.opts), 'plain words, ../../etc/passwd and ~/already')
  const data = { n: 1, ok: true, none: null, list: [`${m.home}/data/a`, { deep: `see ${m.repo}/tasks/site/x.json` }], [`${m.home}/key`]: 'kept' }
  assert.deepEqual(recordData(data, m.opts), { n: 1, ok: true, none: null, list: ['~/data/a', { deep: 'see tasks/site/x.json' }], [`${m.home}/key`]: 'kept' })
  assert.deepEqual(recordData(recordData(data, m.opts), m.opts), recordData(data, m.opts), 'writing a record twice changes nothing')
})

test('record paths: read back — the new forms resolve from any working directory, and the absolute path an older tool wrote is read as it is', () => {
  const m = machine()
  const cwd = process.cwd()
  try {
    process.chdir(m.root)
    for (const abs of [path.join(m.repo, 'tasks', 'site', 'design-contract.json'), path.join(m.home, 'data', 'site', 'j6', 'inventory.json'), m.repo, m.home, '/opt/elsewhere/x.json'])
      assert.equal(resolveRecordPath(recordPath(abs, m.opts), m.opts), abs, abs)
    const legacy = '/srv/legacy/worktrees/branch/tasks/site/design-contract.json'
    assert.equal(resolveRecordPath(legacy, m.opts), legacy, 'no remapping of a record made elsewhere')
    assert.throws(() => resolveRecordPath('tasks/site/x.json', { home: m.home }), /relative to a repository root/)
    assert.throws(() => resolveRecordPath('', m.opts), /non-empty string/)
  } finally {
    process.chdir(cwd)
  }
  assert.equal(repoRootOf(path.join(m.repo, 'tasks', 'site', 'not', 'there', 'yet')), m.repo, 'found from a path that does not exist yet')
  assert.equal(repoRootOf(path.join(m.home, 'data')) === m.repo, false)
})

test('canonical: SUPERSEDED.json names the old canonical and the reason without the machine\'s layout, from any working directory', () => {
  const m = machine()
  const dossier = m.dossier
  const body = JSON.stringify({ schemaVersion: 1, id: 'site', pages: [] })
  const noteOf = (moved) => JSON.parse(readFileSync(path.join(path.dirname(moved), 'SUPERSEDED.json'), 'utf8'))
  withHome(m.home, () => {
    writeFileSync(path.join(dossier, CANONICAL.design), body)
    const adopted = path.join(dossier, 'spec', 'design-contract.json')
    const first = noteOf(supersede({ runRoot: dossier, name: CANONICAL.design, reason: `adopt ${adopted}` }))
    assert.equal(first.from, 'tasks/site/design-contract.json')
    assert.equal(first.reason, 'adopt tasks/site/spec/design-contract.json')
    assert.equal(resolveRecordPath(first.from, m.opts), path.join(dossier, CANONICAL.design), 'the record resolves to the file it names')
    // a relative run-root is resolved against the working directory before it is recorded, never written as given
    const cwd = process.cwd()
    try {
      process.chdir(dossier)
      writeFileSync(CANONICAL.design, body)
      const second = noteOf(path.resolve(supersede({ runRoot: '.', name: CANONICAL.design, reason: `evidence in ${m.home}/data/site/round-1` })))
      assert.equal(second.from, 'tasks/site/design-contract.json')
      assert.equal(second.reason, 'evidence in ~/data/site/round-1')
    } finally {
      process.chdir(cwd)
    }
    // a dossier outside any repository: under home it is written with ~
    const loose = path.join(m.home, 'data', 'site')
    writeFileSync(path.join(loose, CANONICAL.visual), body)
    assert.equal(noteOf(supersede({ runRoot: loose, name: CANONICAL.visual })).from, '~/data/site/visual.contract.json')
  })
})

test('record paths: a named root — a run\'s artifact or state directory is written as <name>/…, never by its path, and wins over the repository and home', () => {
  const m = machine()
  const artifacts = path.join(m.home, '.state', 'repos', 'ab12', 'tasks', 'cd34')
  const inRepo = path.join(m.repo, 'out')
  const opts = { ...m.opts, roots: [{ name: 'artifacts', dir: artifacts }, { name: 'out', dir: inRepo }] }
  assert.equal(recordPath(path.join(artifacts, 'finish', 'round.json'), opts), '<artifacts>/finish/round.json')
  assert.equal(recordPath(artifacts, opts), '<artifacts>')
  assert.equal(recordPath(path.join(inRepo, 'a.json'), opts), '<out>/a.json', 'a named root inside the repository still wins')
  assert.equal(recordPath(`${artifacts}2/x`, opts), '~/.state/repos/ab12/tasks/cd342/x', 'whole components only')
  assert.equal(recordPath(path.join(m.home, '.state', 'other'), opts), '~/.state/other')
  assert.equal(recordText(`node x.mjs --out ${artifacts}/tmp --root ${artifacts} --spec ${m.repo}/tasks/site/spec`, opts), 'node x.mjs --out <artifacts>/tmp --root <artifacts> --spec tasks/site/spec')
  assert.deepEqual(recordData({ argv: ['--zip', `${artifacts}/zip/a.zip`], inputs: { zip: `${artifacts}/zip/a.zip` } }, opts), { argv: ['--zip', '<artifacts>/zip/a.zip'], inputs: { zip: '<artifacts>/zip/a.zip' } })
  // read back: with the root given the record resolves; without it the record says which root it needs
  assert.equal(resolveRecordPath('<artifacts>/finish/round.json', opts), path.join(artifacts, 'finish', 'round.json'))
  assert.equal(resolveRecordPath('<artifacts>', opts), artifacts)
  assert.throws(() => resolveRecordPath('<artifacts>/finish/round.json', m.opts), /named root <artifacts> and none was given/)
  // TRACY_RECORD_ROOTS names roots for every tool; the caller's come first, the deepest directory is tried first
  const env = [`state=${path.join(m.home, '.state')}`, `task=${artifacts}`].join(path.delimiter)
  assert.deepEqual(namedRoots([], env).map((r) => r.name), ['task', 'state'])
  const before = process.env.TRACY_RECORD_ROOTS
  process.env.TRACY_RECORD_ROOTS = env
  try {
    assert.equal(recordPath(path.join(artifacts, 'x'), m.opts), '<task>/x')
    assert.equal(recordPath(path.join(m.home, '.state', 'y'), m.opts), '<state>/y')
    assert.equal(recordText(`see ${artifacts}/x`, opts), 'see <artifacts>/x', 'the caller\'s root for the same directory wins')
  } finally {
    if (before === undefined) delete process.env.TRACY_RECORD_ROOTS
    else process.env.TRACY_RECORD_ROOTS = before
  }
  assert.throws(() => namedRoots([{ name: 'Bad Name', dir: artifacts }]), /lower-case word/)
  assert.throws(() => namedRoots([{ name: 'x', dir: 'relative/dir' }]), /not an absolute directory/)
  assert.deepEqual(namedRoots([{ name: 'x', dir: null }, { name: 'root', dir: path.parse(artifacts).root }]), [], 'no directory, or the file system root, names nothing')
})

test('record paths: a root reached through a link is the same root — a path given by its real name is still written from it', () => {
  const made = machine()
  // the real names of the machine's directories (the scratch root may itself sit behind a link)
  const real = realpathSync(made.root)
  const m = { root: real, home: path.join(real, 'home'), repo: path.join(real, 'home', 'work', 'repo'), dossier: path.join(real, 'home', 'work', 'repo', 'tasks', 'site'), data: path.join(real, 'home', 'data', 'site') }
  // `via` is a link to the machine: home and the repository are named through it, the paths by their real names (as a working directory is)
  const via = path.join(m.root, 'via')
  symlinkSync(m.home, via)
  const opts = { repoRoot: path.join(via, 'work', 'repo'), home: via }
  assert.equal(recordPath(path.join(m.repo, 'tasks', 'site', 'x.json'), opts), 'tasks/site/x.json')
  assert.equal(recordPath(path.join(m.data, 'j6'), opts), '~/data/site/j6')
  assert.equal(recordPath(path.join(via, 'data', 'site', 'j6'), opts), '~/data/site/j6', 'and by the linked name')
  assert.equal(recordText(`adopt ${m.dossier}/spec/design-contract.json from ${m.data}/j6 and ${via}/data/site/j6`, opts), 'adopt tasks/site/spec/design-contract.json from ~/data/site/j6 and ~/data/site/j6')
  assert.equal(recordPath(path.join(m.data, 'art', 'r.json'), { ...opts, roots: [{ name: 'artifacts', dir: path.join(via, 'data', 'site', 'art') }] }), '~/data/site/art/r.json', 'a named root that does not exist yet has one name only')
  mkdirSync(path.join(m.data, 'art'))
  assert.equal(recordPath(path.join(m.data, 'art', 'r.json'), { ...opts, roots: [{ name: 'artifacts', dir: path.join(via, 'data', 'site', 'art') }] }), '<artifacts>/r.json')
})
