// checkpoint.mjs (durable phase evidence, inputs that invalidate it) and gates.mjs (one line per gate of
// a qa.mjs report). Both are read/record-only; these tests prove a changed input or evidence file turns a
// recorded phase back into work, and that the gate reader reports what the report says — no more.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { checkpoint, DEFAULT_INPUTS, PHASE_INPUTS, PHASES } from '../tools/checkpoint.mjs'
import { gateRows } from '../tools/gates.mjs'

const TOOLS = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../tools')
const cli = (tool, args, cwd) => spawnSync(process.execPath, [path.join(TOOLS, tool), ...args], { cwd, encoding: 'utf8' })

function template() {
  const root = mkdtempSync(path.join(tmpdir(), 'checkpoint-'))
  mkdirSync(path.join(root, 'inventory'))
  mkdirSync(path.join(root, 'seed'))
  mkdirSync(path.join(root, 'evidence'))
  writeFileSync(path.join(root, 'inventory/source-inventory.json'), '{"files":[]}\n')
  writeFileSync(path.join(root, 'seed/seed.json'), '{}\n')
  writeFileSync(path.join(root, 'qa.contract.json'), '{"revision":1}\n')
  writeFileSync(path.join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
  writeFileSync(path.join(root, 'template.config.json'), '{"locales":["en"]}\n')
  writeFileSync(path.join(root, 'seed/personalize.json'), '{}\n')
  for (const p of PHASES) writeFileSync(path.join(root, 'evidence', `${p}.md`), `${p} done\n`)
  return root
}
const ev = (root, p) => path.join(root, 'evidence', `${p}.md`)

describe('checkpoint.mjs — phase evidence and the inputs that invalidate it', () => {
  it('records phases in order, with P4.5/P4.6 between P4 and P5, and refuses one whose predecessor is open', () => {
    assert.deepEqual(PHASES, ['P0', 'P1', 'P2', 'P3', 'P4', 'P4.5', 'P4.6', 'P5', 'P6', 'P7', 'P8'])
    const root = template()
    try {
      const file = path.join(root, 'checkpoint.json')
      let s = checkpoint(file, 'init')
      assert.equal(s.next, 'P0')
      assert.throws(() => checkpoint(file, 'complete', ['P2', ev(root, 'P2')]), /P0 is not complete/)
      assert.throws(() => checkpoint(file, 'complete', ['P0']), /evidence/)
      assert.throws(() => checkpoint(file, 'complete', ['P0', path.join(tmpdir(), 'x.md')]), /beside the checkpoint/)
      for (const p of ['P0', 'P1', 'P2', 'P3']) s = checkpoint(file, 'complete', [p, ev(root, p)])
      assert.equal(s.next, 'P4')
      assert.equal(s.phases.filter((p) => p.status === 'complete').length, 4)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  const statuses = (s) => Object.fromEntries(s.phases.map((p) => [p.phase, p.status]))
  const staleOf = (s) => s.phases.filter((p) => p.status === 'stale').map((p) => p.phase)

  it('a changed input makes stale every phase that reads it — and only those; no cascade', () => {
    const root = template()
    try {
      const file = path.join(root, 'checkpoint.json')
      checkpoint(file, 'init')
      for (const p of PHASES) checkpoint(file, 'complete', [p, ev(root, p)])
      assert.equal(checkpoint(file, 'status').next, null)
      // seed/personalize.json is read by P4.5, P4.6 and P8
      writeFileSync(path.join(root, 'seed/personalize.json'), '{"identity":[1]}\n')
      let s = checkpoint(file, 'status')
      assert.deepEqual(staleOf(s), ['P4.5', 'P4.6', 'P8'])
      assert.equal(s.next, 'P4.5')
      assert.equal(s.phases.find((p) => p.phase === 'P4.5').reason, 'input personalize changed')
      assert.equal(statuses(s).P5, 'complete', 'P5 does not read it')
      // re-recording P4.5 keeps every later record; each is judged by its own hashes
      s = checkpoint(file, 'complete', ['P4.5', ev(root, 'P4.5')])
      assert.deepEqual(staleOf(s), ['P4.6', 'P8'])
      for (const p of ['P4.6', 'P8']) s = checkpoint(file, 'complete', [p, ev(root, p)])
      assert.equal(s.next, null)
      // the seed is read from P2 on by every phase that builds or measures the site
      writeFileSync(path.join(root, 'seed/seed.json'), '{"changed":true}\n')
      s = checkpoint(file, 'status')
      assert.deepEqual(staleOf(s), ['P2', 'P3', 'P4', 'P4.5', 'P4.6', 'P5', 'P7', 'P8'])
      assert.equal(s.phases.find((p) => p.phase === 'P2').reason, 'input seed changed')
      writeFileSync(path.join(root, 'seed/seed.json'), '{}\n')
      assert.equal(checkpoint(file, 'status').next, null, 'restoring the bytes restores the phases')
      // an edited evidence file makes its own phase stale
      writeFileSync(ev(root, 'P1'), 'rewritten afterwards\n')
      s = checkpoint(file, 'status')
      assert.deepEqual(staleOf(s), ['P1'])
      assert.match(s.phases[1].reason, /evidence evidence\/P1\.md changed/)
      // the lockfile: the pins P0 settled, the build of P3, the measured (P7) and shipped (P8) site
      writeFileSync(ev(root, 'P1'), 'P1 done\n')
      writeFileSync(path.join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.1'\n")
      assert.deepEqual(staleOf(checkpoint(file, 'status')), ['P0', 'P3', 'P7', 'P8'])
      // a phase cannot be recorded while an earlier one does not hold
      assert.throws(() => checkpoint(file, 'complete', ['P5', ev(root, 'P5')]), /P0 is not complete/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('P5 adds layouts[] to qa.contract.json: P3, P5 and P7 go stale, P4–P4.6 and P6 hold; re-recording P3 keeps P4–P7', () => {
    // P3 hashes the whole contract because the Fast Gate verdict does (contractHash, "stale: the contract changed")
    const root = template()
    try {
      const file = path.join(root, 'checkpoint.json')
      checkpoint(file, 'init')
      for (const p of PHASES.slice(0, PHASES.indexOf('P7') + 1)) checkpoint(file, 'complete', [p, ev(root, p)])
      assert.equal(checkpoint(file, 'status').next, 'P8')
      writeFileSync(path.join(root, 'qa.contract.json'), '{"revision":2,"layouts":[{"id":"News","family":"list"}]}\n')
      let s = checkpoint(file, 'status')
      assert.deepEqual(staleOf(s), ['P3', 'P5', 'P7'])
      for (const p of ['P0', 'P1', 'P2', 'P4', 'P4.5', 'P4.6', 'P6']) assert.equal(statuses(s)[p], 'complete', p)
      assert.equal(s.phases.find((p) => p.phase === 'P3').reason, 'input contract changed')
      assert.equal(s.next, 'P3')
      // the Fast Gate verdict is rerun and P3 recorded again: P4–P7 keep their records
      s = checkpoint(file, 'complete', ['P3', ev(root, 'P3')])
      assert.deepEqual(staleOf(s), ['P5', 'P7'])
      for (const p of ['P4', 'P4.5', 'P4.6', 'P6']) assert.equal(statuses(s)[p], 'complete', p)
      assert.equal(s.next, 'P5')
      for (const p of ['P5', 'P7']) s = checkpoint(file, 'complete', [p, ev(root, p)])
      assert.equal(s.next, 'P8')
      assert.equal(statuses(s).P8, 'open')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('every phase that reads an input lists it; the first reader of each is the phase SKILL.md builds it for', () => {
    for (const keys of Object.values(PHASE_INPUTS)) for (const k of keys) assert.ok(DEFAULT_INPUTS[k], k)
    const first = (k) => PHASES.find((p) => PHASE_INPUTS[p].includes(k))
    assert.deepEqual(
      Object.fromEntries(Object.keys(DEFAULT_INPUTS).map((k) => [k, first(k)])),
      {
        inventory: 'P1',
        lockfile: 'P0',
        config: 'P2',
        'site-model': 'P2',
        seed: 'P2',
        'content-api-map': 'P2',
        contract: 'P3',
        questions: 'P4.5',
        personalize: 'P4.5'
      }
    )
    // the Fast Gate runs in P3 and P5, the acceptance run in P7 and the package in P8: all read the contract
    for (const p of ['P3', 'P5', 'P7', 'P8']) assert.ok(PHASE_INPUTS[p].includes('contract'), p)
    // template.config.json is read by every phase that builds or measures the site
    for (const p of ['P2', 'P3', 'P4', 'P4.6', 'P5', 'P7', 'P8']) assert.ok(PHASE_INPUTS[p].includes('config'), p)
  })

  it('an absent input is recorded as absent, and its appearance is a change', () => {
    const root = template()
    try {
      rmSync(path.join(root, 'qa.contract.json'))
      const file = path.join(root, 'checkpoint.json')
      checkpoint(file, 'init', [], { phases: 'P0,P1,P7' })
      for (const p of ['P0', 'P1', 'P7']) checkpoint(file, 'complete', [p, ev(root, p)])
      assert.equal(checkpoint(file, 'status').next, null)
      writeFileSync(path.join(root, 'qa.contract.json'), '{}\n')
      assert.equal(checkpoint(file, 'status').next, 'P7')
      assert.throws(() => checkpoint(path.join(root, 'other.json'), 'init', [], { phases: 'P1,P0' }), /ordered/)
      assert.throws(() => checkpoint(path.join(root, 'other.json'), 'init', [], { phases: 'P9' }), /ordered/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('CLI: one summary line by default, one line per phase with --verbose, full state with --json, exit 2 on refusal', () => {
    const root = template()
    try {
      let r = cli('checkpoint.mjs', ['init', 'checkpoint.json'], root)
      assert.equal(r.status, 0, r.stderr)
      assert.match(r.stdout, /^checkpoint init: complete=0\/11 next=P0 -> .*checkpoint\.json\n$/)
      r = cli('checkpoint.mjs', ['complete', 'checkpoint.json', 'P0', 'evidence/P0.md'], root)
      assert.match(r.stdout, /^checkpoint complete: complete=1\/11 next=P1 -> /)
      r = cli('checkpoint.mjs', ['complete', 'checkpoint.json', 'P3', 'evidence/P3.md'], root)
      assert.equal(r.status, 2)
      assert.match(r.stderr, /P1 is not complete/)
      writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'changed\n')
      r = cli('checkpoint.mjs', ['status', 'checkpoint.json', '--verbose'], root)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /^P0 \| archaeology \| stale \| input lockfile changed$/m)
      assert.match(r.stdout, /^P4\.5 \| personalization \| open \| not recorded$/m)
      assert.match(r.stdout, /stale=P0\(input lockfile changed\)/)
      r = cli('checkpoint.mjs', ['status', 'checkpoint.json', '--json'], root)
      assert.equal(JSON.parse(r.stdout).next, 'P0')
      assert.equal(cli('checkpoint.mjs', ['init', 'checkpoint.json'], root).status, 2, 'init never overwrites')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('gates.mjs — one line per gate of a qa.mjs report', () => {
  const run = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gates-'))
    mkdirSync(path.join(dir, 'visual'))
    writeFileSync(path.join(dir, 'visual', 'VISUAL.md'), '# visual\n')
    writeFileSync(path.join(dir, 'REPORT.md'), '# Acceptance\n')
    const report = {
      status: 'fail',
      gates: {
        contracts: { status: 'pass', errors: [] },
        visual: { status: 'fail', errors: ['3 finding(s)', 'home/desktop-light: scan:contrast'] },
        browser: { status: 'pending', reason: 'No browser measurements requested' },
        independent: { status: 'pending', reason: 'Current acceptance receipt required' },
        email: { status: 'not-applicable', reason: 'no forms | none' }
      }
    }
    writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report))
    return dir
  }

  it('reports each gate with its recorded status, first reason and detail file; exit follows the report status', () => {
    const dir = run()
    try {
      const { rows } = gateRows(path.join(dir, 'report.json'))
      assert.deepEqual(
        rows.map((r) => [r.gate, r.status]),
        [
          ['contracts', 'pass'],
          ['visual', 'fail'],
          ['browser', 'pending'],
          ['independent', 'pending'],
          ['email', 'not-applicable']
        ]
      )
      assert.equal(rows[1].reason, '3 finding(s) (+1 more)')
      assert.equal(rows[1].file, path.join(dir, 'visual', 'VISUAL.md'))
      assert.equal(rows[2].file, path.join(dir, 'REPORT.md'), 'a detail file that does not exist falls back to REPORT.md')
      let r = cli('gates.mjs', [dir], dir)
      assert.equal(r.status, 1)
      const lines = r.stdout.trim().split('\n')
      assert.equal(lines.length, 6)
      assert.equal(lines[1], `visual | fail | 3 finding(s) (+1 more) | ${path.join(dir, 'visual', 'VISUAL.md')}`)
      assert.match(lines[4], /^email \| not-applicable \| no forms %7C none \| /, 'a | inside a field keeps the row shape')
      assert.match(lines[5], /^gates: status=fail pass=1 fail=1 pending=2 not-applicable=1 -> .*report\.json$/)
      const report = JSON.parse(readFileSync(path.join(dir, 'report.json'), 'utf8'))
      report.status = 'pass'
      for (const g of Object.values(report.gates)) if (g.status !== 'not-applicable') g.status = 'pass'
      writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report))
      r = cli('gates.mjs', [path.join(dir, 'report.json')], dir)
      assert.equal(r.status, 0, r.stdout + r.stderr)
      assert.equal(cli('gates.mjs', [path.join(dir, 'missing')], dir).status, 2)
      assert.equal(JSON.parse(execFileSync(process.execPath, [path.join(TOOLS, 'gates.mjs'), dir, '--json'], { encoding: 'utf8' })).rows.length, 5)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
