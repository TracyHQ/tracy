// The summary / --json switch of the gate CLIs (lib/cli-output.mjs): one bounded line plus the path of the complete
// result by default, the complete JSON on stdout with --json, the same result in both, exit codes unchanged, an input
// never replaced by its own result, and the STATUS.md "Now" block cap warned by checkpoint.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, linkSync, realpathSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { testDir } from './lib/test-root.mjs'
import { assertNotProtected, oneLine, realOf, summarizeResult, takeOutputFlags } from '../lib/cli-output.mjs'
import { STATUS_NOW_LIMIT, statusNowBlock } from '../checkpoint.mjs'
import { acquireLock, releaseLock, pendingRequests, answer, requestsDir } from '../visual/recheck.mjs'

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXAMPLES = path.join(SCRIPTS, '..', 'examples')
const node = (dir, script, args) => {
  // TMPDIR inside the test directory: the default result location never leaves it
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { encoding: 'utf8', env: { ...process.env, TMPDIR: dir }, timeout: 60000 })
  return { code: r.status, out: r.stdout, err: r.stderr }
}
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))
/** A default-mode run: exactly one stdout line `<script> <label>: <summary> -> <file>`; returns the line's parts and the file's JSON. */
function summaryOf(r, prefix) {
  const lines = r.out.split('\n').filter(Boolean)
  assert.equal(lines.length, 1, r.out)
  assert.ok(lines[0].length < 600, 'bounded')
  const m = lines[0].match(/^(.+?): (.*) -> (\/.+\.json)$/)
  assert.ok(m, lines[0])
  assert.ok(m[1].startsWith(prefix), lines[0])
  return { label: m[1], summary: m[2], file: m[3], result: readJson(m[3]) }
}

test('lib: oneLine flattens control characters and bounds length; takeOutputFlags strips only its flags', () => {
  assert.equal(oneLine('a\nb\r\n\tc\u001b[31m d e'), 'a b c [31m d e')
  assert.equal(oneLine('x'.repeat(500), 20).length, 20)
  assert.deepEqual(takeOutputFlags(['validate', '--json', 'f', '--out', 'o.json']), { argv: ['validate', 'f'], json: true, out: 'o.json' })
  assert.deepEqual(takeOutputFlags(['--out', 'keep', '--json'], { out: false }), { argv: ['--out', 'keep'], json: true, out: null })
  assert.throws(() => takeOutputFlags(['--out']), /needs a file/)
  const s = summarizeResult({ ok: false, n: 3, list: [1, 2], long: 'x'.repeat(200), nested: { a: 1 }, note: 'a\nb' })
  assert.equal(s, 'ok=false n=3 list=2 note=a b')
})

test('content-contract: summary line + saved file by default, --json is the same result, errors stay on stderr', () => {
  const dir = testDir('cli-out-content')
  const contract = path.join(EXAMPLES, 'content-contract.json')
  const plan = path.join(EXAMPLES, 'content-plan.json')
  const full = node(dir, 'content-contract.mjs', ['compile', contract, plan, '--json'])
  assert.equal(full.code, 0, full.err)
  const compiled = JSON.parse(full.out)
  const plain = node(dir, 'content-contract.mjs', ['compile', contract, plan])
  assert.equal(plain.code, 0)
  const s = summaryOf(plain, 'content-contract compile')
  assert.deepEqual(s.result, compiled)
  assert.ok(s.file.startsWith(dir), 'default location follows TMPDIR')
  // --out chooses the file, --json + --out writes it and still prints the JSON
  const out = path.join(dir, 'resolved.json')
  assert.equal(summaryOf(node(dir, 'content-contract.mjs', ['compile', contract, plan, '--out', out]), 'content-contract compile').file, out)
  assert.deepEqual(readJson(out), compiled)
  const both = node(dir, 'content-contract.mjs', ['validate', contract, '--json', '--out', path.join(dir, 'v.json')])
  assert.deepEqual(JSON.parse(both.out), readJson(path.join(dir, 'v.json')))
  // an input is never replaced by its result
  const copy = path.join(dir, 'contract.json')
  writeFileSync(copy, readFileSync(contract))
  const clobber = node(dir, 'content-contract.mjs', ['validate', copy, '--out', copy])
  assert.equal(clobber.code, 1)
  assert.match(clobber.err, /must not replace it/)
  assert.deepEqual(readJson(copy), readJson(contract))
  const bad = node(dir, 'content-contract.mjs', ['validate'])
  assert.equal(bad.code, 1)
  assert.equal(bad.out, '')
})

test('design-contract: validate and request in both modes, the adopted contract is never overwritten by a result', () => {
  const dir = testDir('cli-out-design')
  const contract = path.join(EXAMPLES, 'design-contract.json')
  const js = node(dir, 'design-contract.mjs', ['validate', contract, '--json'])
  const parsed = JSON.parse(js.out)
  assert.equal(parsed.ok, true)
  const sm = summaryOf(node(dir, 'design-contract.mjs', ['validate', contract]), 'design-contract validate')
  assert.match(sm.summary, /^ok=true cases=\d+/)
  assert.deepEqual({ ...sm.result, identity: null }, { ...parsed, identity: null })
  const page = readJson(contract).pages[0].id, variant = readJson(contract).variants[0].id
  const req = summaryOf(node(dir, 'design-contract.mjs', ['request', contract, page, variant]), 'design-contract request')
  assert.ok(req.result.url)
  const copy = path.join(dir, 'design-contract.json')
  writeFileSync(copy, readFileSync(contract))
  const clobber = node(dir, 'design-contract.mjs', ['validate', copy, '--out', copy])
  assert.equal(clobber.code, 1)
  assert.match(clobber.err, /must not replace it/)
  assert.deepEqual(readJson(copy), readJson(contract))
  // adopt: summary names the canonical file; --json carries the identity
  const root = path.join(dir, 'run')
  mkdirSync(root)
  const spec = path.join(dir, 'spec')
  mkdirSync(spec)
  writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify({ pages: [] }))
  for (const f of ['sections', 'content']) writeFileSync(path.join(spec, `${f}.json`), '{}')
  writeFileSync(path.join(spec, 'design-contract.json'), readFileSync(contract))
  const adopt = node(dir, 'design-contract.mjs', ['adopt', '--run-root', root, '--from', path.join(spec, 'design-contract.json'), '--spec', spec])
  assert.equal(adopt.code, 0, adopt.err)
  assert.equal(summaryOf(adopt, 'design-contract adopt').result.canonical, path.join(root, 'design-contract.json'))
  const again = node(dir, 'design-contract.mjs', ['adopt', '--run-root', root, '--from', path.join(spec, 'design-contract.json'), '--spec', spec, '--json'])
  assert.equal(JSON.parse(again.out).ok, true)
})

test('verify-render: exit 0 / 1 / 2 unchanged; summary and --json agree; the snapshots are never overwritten', () => {
  const dir = testDir('cli-out-render')
  const a = path.join(dir, 'a.json'), b = path.join(dir, 'b.json'), c = path.join(dir, 'c.json')
  writeFileSync(a, JSON.stringify({ '.btn': { color: '#ffffff' } }))
  writeFileSync(b, JSON.stringify({ '.btn': { color: '#ffffff' } }))
  writeFileSync(c, JSON.stringify({ '.btn': { color: '#000000' } }))
  const same = node(dir, 'verify-render.mjs', [a, b])
  assert.equal(same.code, 0)
  assert.match(summaryOf(same, 'verify-render diff').summary, /^mismatches=0 checked=1$/)
  const diff = node(dir, 'verify-render.mjs', [a, c])
  assert.equal(diff.code, 1)
  const s = summaryOf(diff, 'verify-render diff')
  assert.match(s.summary, /^mismatches=1 checked=1$/)
  const full = node(dir, 'verify-render.mjs', [a, c, '--json'])
  assert.equal(full.code, 1)
  assert.deepEqual(JSON.parse(full.out), s.result)
  assert.equal(node(dir, 'verify-render.mjs', [a]).code, 2)
  const clobber = node(dir, 'verify-render.mjs', [a, b, '--out', a])
  assert.equal(clobber.code, 2)
  assert.deepEqual(readJson(a), { '.btn': { color: '#ffffff' } })
})

test('checkpoint: summary and --json agree; the checkpoint file is never replaced; STATUS.md Now block warns above 40 lines only', () => {
  const dir = testDir('cli-out-checkpoint')
  const file = path.join(dir, 'checkpoint.json')
  const init = node(dir, 'checkpoint.mjs', ['init', file, 'edit', 'src', 'tgt'])
  assert.equal(init.code, 0, init.err)
  const s = summaryOf(init, 'checkpoint init')
  assert.match(s.summary, /^complete=0\/5 next=1$/)
  const st = node(dir, 'checkpoint.mjs', ['status', file, '--json'])
  assert.deepEqual(JSON.parse(st.out), s.result)
  const before = readFileSync(file, 'utf8')
  const clobber = node(dir, 'checkpoint.mjs', ['status', file, '--out', file])
  assert.equal(clobber.code, 2)
  assert.equal(readFileSync(file, 'utf8'), before)
  assert.equal(node(dir, 'checkpoint.mjs', ['bogus', file]).code, 2)

  // no STATUS.md: nothing to warn about
  assert.equal(node(dir, 'checkpoint.mjs', ['status', file]).err, '')
  const now = (n) => ['## Now', ...Array.from({ length: n - 1 }, (_, i) => `- line ${i}`)].join('\n') + '\n\n## History\n- old\n'
  writeFileSync(path.join(dir, 'STATUS.md'), now(STATUS_NOW_LIMIT))
  const ok = node(dir, 'checkpoint.mjs', ['status', file, '--json'])
  assert.equal(ok.err, '')
  assert.equal(JSON.parse(ok.out).warnings, undefined)
  writeFileSync(path.join(dir, 'STATUS.md'), now(STATUS_NOW_LIMIT + 1))
  const over = node(dir, 'checkpoint.mjs', ['status', file, '--json'])
  assert.equal(over.code, 0, 'a warning never changes the exit status')
  assert.match(over.err, /"Now" block is 41 lines \(limit 40\)/)
  const res = JSON.parse(over.out)
  assert.equal(res.warnings.length, 1)
  assert.deepEqual({ ...res, warnings: undefined }, { ...JSON.parse(ok.out), warnings: undefined }, 'phase decisions are the same')
  assert.match(summaryOf(node(dir, 'checkpoint.mjs', ['status', file]), 'checkpoint status').summary, /warnings=1$/)
  writeFileSync(path.join(dir, 'STATUS.md'), '# Status\nno current block\n')
  assert.match(node(dir, 'checkpoint.mjs', ['status', file]).err, /no "## Now" block/)
  // a Now block that does not start the file is not what `head -40` shows
  writeFileSync(path.join(dir, 'STATUS.md'), `${Array.from({ length: STATUS_NOW_LIMIT }, (_, i) => `preface ${i}`).join('\n')}\n## Now\n- short\n`)
  assert.match(node(dir, 'checkpoint.mjs', ['status', file]).err, /starts at line 41/)
  // the ledger files beside the checkpoint are never the result file
  for (const name of ['STATUS.md', 'STATUS-log.md']) {
    writeFileSync(path.join(dir, name), '# Now\n')
    assert.equal(node(dir, 'checkpoint.mjs', ['status', file, '--out', path.join(dir, name)]).code, 2, name)
    assert.equal(readFileSync(path.join(dir, name), 'utf8'), '# Now\n')
  }
})

test('--out never lands on an input, a binding source or the evidence a command owns (design-contract, group-pages, recheck)', async () => {
  const dir = testDir('cli-out-protect')
  const spec = path.join(dir, 'spec')
  mkdirSync(spec)
  for (const f of ['page-map', 'sections', 'content']) writeFileSync(path.join(spec, `${f}.json`), f === 'page-map' ? '{"pages":[]}' : '{}')
  const contract = path.join(EXAMPLES, 'design-contract.json')
  writeFileSync(path.join(spec, 'design-contract.json'), readFileSync(contract))
  const zip = path.join(dir, 'theme.zip'), seed = path.join(dir, 'seed.json')
  writeFileSync(zip, 'zip')
  writeFileSync(seed, '{}')
  // a file of the spec directory, the artifact and the seed report are bound inputs of validate / adopt
  for (const target of [path.join(spec, 'page-map.json'), zip, seed]) {
    const before = readFileSync(target, 'utf8')
    const r = node(dir, 'design-contract.mjs', ['validate', path.join(spec, 'design-contract.json'), '--spec', spec, '--artifact', zip, '--routes', seed, '--out', target])
    assert.equal(r.code, 1, target)
    assert.match(r.err, /must not replace it/)
    assert.equal(readFileSync(target, 'utf8'), before)
  }
  const root = path.join(dir, 'run')
  mkdirSync(root)
  const adopt = node(dir, 'design-contract.mjs', ['adopt', '--run-root', root, '--from', path.join(spec, 'design-contract.json'), '--spec', spec, '--out', path.join(spec, 'page-map.json')])
  assert.equal(adopt.code, 1)
  assert.equal(readFileSync(path.join(spec, 'page-map.json'), 'utf8'), '{"pages":[]}')

  // recheck: the configuration and the controller's ledger files
  const cfg = path.join(dir, 'round.json')
  writeFileSync(cfg, JSON.stringify({ runRoot: dir, site: 'http://127.0.0.1:1', evidence: path.join(dir, 'ev') }))
  mkdirSync(path.join(dir, 'ev', 's1'), { recursive: true })
  const ledger = path.join(dir, 'ev', 'rounds.jsonl')
  writeFileSync(ledger, '{"a":1}\n')
  for (const target of [cfg, ledger, path.join(dir, 'ev', 's1', 'control.json'), path.join(dir, 'port-audit.json')]) {
    const before = existsSync(target) ? readFileSync(target, 'utf8') : null
    const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'visual', 'recheck.mjs'), '--config', cfg, '--name', 's1', '--status', '--out', target], { encoding: 'utf8' })
    assert.equal(r.status, 2, target)
    assert.match(r.stderr, /must not replace it/)
    assert.equal(existsSync(target) ? readFileSync(target, 'utf8') : null, before)
  }
  // a destination that is a symlink to an input is the input
  const link = path.join(dir, 'link.json')
  symlinkSync(cfg, link)
  assert.equal(spawnSync(process.execPath, [path.join(SCRIPTS, 'visual', 'recheck.mjs'), '--config', cfg, '--name', 's1', '--status', '--out', link], { encoding: 'utf8' }).status, 2)
  assert.ok(readJson(cfg).site)
})

test('--out accepts one form only: no "..", no symlink, no hard link to an input; a refusal happens before the command changes anything', async () => {
  const dir = testDir('cli-out-form')
  const contract = path.join(EXAMPLES, 'content-contract.json')
  // link -> a/b: "dir/link/../x" is dir/a/x for the filesystem and dir/x for a string resolver
  mkdirSync(path.join(dir, 'a', 'b'), { recursive: true })
  symlinkSync(path.join(dir, 'a', 'b'), path.join(dir, 'link'))
  const input = path.join(dir, 'a', 'contract.json')
  writeFileSync(input, readFileSync(contract))
  const via = node(dir, 'content-contract.mjs', ['validate', input, '--out', `${dir}/link/../contract.json`])
  assert.equal(via.code, 1)
  assert.match(via.err, /"\.\." is not accepted/)
  assert.deepEqual(readJson(input), readJson(contract))
  // the same trick on the INPUT side: the command reads dir/a/contract.json through link/.., and a plain --out to it is refused
  const through = node(dir, 'content-contract.mjs', ['validate', `${dir}/link/../contract.json`, '--out', input])
  assert.equal(through.code, 1)
  assert.match(through.err, /must not replace it/)
  assert.deepEqual(readJson(input), readJson(contract))
  // a backslash is an ordinary character of a POSIX file name: the directory "a\\b" is not "a/b"
  if (path.sep === '/') {
    mkdirSync(path.join(dir, 'a\\b'))
    symlinkSync(path.join(dir, 'a\\b'), path.join(dir, 'alias'))
    const odd = path.join(dir, 'a\\b', 'contract.json')
    writeFileSync(odd, readFileSync(contract))
    const viaAlias = node(dir, 'content-contract.mjs', ['validate', odd, '--out', path.join(dir, 'alias', 'contract.json')])
    assert.equal(viaAlias.code, 1)
    assert.match(viaAlias.err, /must not replace it/)
    assert.deepEqual(readJson(odd), readJson(contract))
    assert.equal(realOf(path.join(dir, 'alias', 'new.json')), path.join(realpathSync(dir), 'a\\b', 'new.json'))
  }
  // evidence that does not exist yet is located the same way
  const evidence = path.join(dir, 'a', 'later.json')
  assert.equal(realOf(`${dir}/link/../later.json`), path.join(realpathSync(dir), 'a', 'later.json'))
  assert.throws(() => assertNotProtected(evidence, [`${dir}/link/../later.json`]), /must not replace it/)
  assert.doesNotThrow(() => assertNotProtected(path.join(dir, 'later.json'), [`${dir}/link/../later.json`]))
  // a symlink named as the destination, and a second name of the input
  const sym = path.join(dir, 'sym.json')
  symlinkSync(input, sym)
  assert.match(node(dir, 'content-contract.mjs', ['validate', input, '--out', sym]).err, /symbolic link/)
  const hard = path.join(dir, 'hard.json')
  linkSync(input, hard)
  assert.match(node(dir, 'content-contract.mjs', ['validate', input, '--out', hard]).err, /hard-linked/)
  assert.deepEqual(readJson(input), readJson(contract))
  // a plain new destination works and leaves no temporary file behind
  const fresh = path.join(dir, 'fresh', 'r.json')
  assert.equal(node(dir, 'content-contract.mjs', ['validate', input, '--out', fresh]).code, 0)
  assert.deepEqual(readdirSync(path.dirname(fresh)), ['r.json'])
  // a rerun replaces its own earlier result
  assert.equal(node(dir, 'content-contract.mjs', ['validate', input, '--out', fresh]).code, 0)

  // checkpoint: a bad --out leaves the checkpoint as it was
  const cp = path.join(dir, 'cp', 'checkpoint.json')
  mkdirSync(path.dirname(cp))
  assert.equal(node(dir, 'checkpoint.mjs', ['init', cp, 'edit', 's', 't']).code, 0)
  const ev = path.join(dir, 'cp', 'ev.txt')
  writeFileSync(ev, 'evidence')
  const before = readFileSync(cp, 'utf8')
  const bad = node(dir, 'checkpoint.mjs', ['complete', cp, '1', ev, '--out', ev])
  assert.equal(bad.code, 2)
  assert.equal(readFileSync(cp, 'utf8'), before, 'no phase was completed')
  assert.equal(readFileSync(ev, 'utf8'), 'evidence')
  const notInit = path.join(dir, 'cp2.json')
  assert.equal(node(dir, 'checkpoint.mjs', ['init', notInit, 'edit', 's', 't', '--out', notInit]).code, 2)
  assert.ok(!existsSync(notInit), 'init did not create the checkpoint')

  // design-contract adopt: the canonical contract is not superseded when the destination is refused
  const spec = path.join(dir, 'spec')
  mkdirSync(spec)
  for (const f of ['page-map', 'sections', 'content']) writeFileSync(path.join(spec, `${f}.json`), f === 'page-map' ? '{"pages":[]}' : '{}')
  writeFileSync(path.join(spec, 'design-contract.json'), readFileSync(path.join(EXAMPLES, 'design-contract.json')))
  const root = path.join(dir, 'run')
  mkdirSync(root)
  const adopt = (...extra) => node(dir, 'design-contract.mjs', ['adopt', '--run-root', root, '--from', path.join(spec, 'design-contract.json'), '--spec', spec, ...extra])
  assert.equal(adopt().code, 0)
  const canonical = readFileSync(path.join(root, 'design-contract.json'), 'utf8')
  assert.equal(adopt('--out', path.join(root, 'design-contract.json')).code, 1)
  assert.equal(readFileSync(path.join(root, 'design-contract.json'), 'utf8'), canonical)
  assert.ok(!existsSync(path.join(root, 'attempts')), 'nothing was superseded')

  // group-pages --kind: a valid plan whose result file would replace the contract writes nothing, not even the route files
  const gp = path.join(dir, 'gp')
  mkdirSync(path.join(gp, 'spec'), { recursive: true })
  writeFileSync(path.join(gp, 'spec', 'page-map.json'), JSON.stringify({ pages: [{ file: 'Home.html', view: 'front-page', title: 'Home', path: '/', locale: 'en' }] }))
  writeFileSync(path.join(gp, 'spec', 'reference.json'), JSON.stringify({ kind: 'html', pages: [{ page: 'Home.html', kind: 'html' }] }))
  const group = path.join(gp, 'group-pages-html.json')
  const groupBody = JSON.stringify({ group: { id: 'g1', pages: ['/'] }, pages: [{ id: 'en-home', path: '/', pagemapPath: '/' }] })
  const gpArgs = (contract, outDir) => ['visual/group-pages.mjs', ['--contract', contract, '--spec', path.join(gp, 'spec'), '--kind', 'html', '--out-dir', outDir]]
  // control: the same plan in a free directory succeeds, so the refusal below is the destination check and nothing else
  const okContract = path.join(gp, 'ok.contract.json')
  writeFileSync(okContract, groupBody)
  assert.equal(node(dir, ...gpArgs(okContract, path.join(dir, 'gp-ok'))).code, 0)
  writeFileSync(group, groupBody)
  const gpr = node(dir, ...gpArgs(group, gp))
  assert.equal(gpr.code, 2)
  assert.match(gpr.err, /input or evidence of this command/)
  assert.equal(readFileSync(group, 'utf8'), groupBody)
  assert.deepEqual(readdirSync(gp).sort(), ['group-pages-html.json', 'ok.contract.json', 'spec'])

  // recheck: a refused destination sends no request to the controller
  const cfg = path.join(dir, 'round.json')
  writeFileSync(cfg, JSON.stringify({ runRoot: dir, site: 'http://127.0.0.1:1', evidence: path.join(dir, 'ev2') }))
  const ev2 = path.join(dir, 'ev2')
  mkdirSync(requestsDir(ev2, 's1'), { recursive: true })
  acquireLock(ev2, 's1')
  try {
    const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'visual', 'recheck.mjs'), '--config', cfg, '--name', 's1', '--changed', 'a.css', '--out', cfg, '--timeout', '5'], { encoding: 'utf8' })
    assert.equal(r.status, 2)
    assert.deepEqual(pendingRequests(ev2, 's1'), [])
  } finally {
    releaseLock(ev2)
  }
})

test('a result path with a newline or a separator is printed reversibly on one line', () => {
  const dir = testDir('cli-out-odd')
  const odd = path.join(dir, 'a\nb|c%d.json')
  const r = node(dir, 'content-contract.mjs', ['validate', path.join(EXAMPLES, 'content-contract.json'), '--out', odd])
  assert.equal(r.code, 0, r.err)
  const lines = r.out.split('\n').filter(Boolean)
  assert.equal(lines.length, 1)
  assert.equal(decodeURIComponent(lines[0].split(' -> ')[1]), odd)
  assert.equal(readJson(odd).ok, true)
})

test('statusNowBlock: from the Now heading to the next level 1-2 heading, trailing blank lines not counted', () => {
  assert.equal(statusNowBlock('# Title\n'), null)
  assert.deepEqual(statusNowBlock('# Now\na\nb\n\n\n## Log\nz\n'), { start: 1, lines: 3 })
  assert.deepEqual(statusNowBlock('x\n## Now\na\n### sub\nb'), { start: 2, lines: 4 })
  assert.deepEqual(statusNowBlock('## Now'), { start: 1, lines: 1 })
})

test('recheck: status, an answered request and the no-controller error each print one line; --json / --verbose print the complete result', async () => {
  const dir = testDir('cli-out-recheck')
  const cfg = path.join(dir, 'round.json')
  writeFileSync(cfg, JSON.stringify({ runRoot: dir, site: 'http://127.0.0.1:1', evidence: path.join(dir, 'ev') }))
  const ev = path.join(dir, 'ev')
  const cli = (args) => new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(SCRIPTS, 'visual', 'recheck.mjs'), '--config', cfg, '--name', 's1', ...args], { env: { ...process.env, TMPDIR: dir } })
    let out = '', err = ''
    c.stdout.on('data', (d) => (out += d))
    c.stderr.on('data', (d) => (err += d))
    c.on('close', (code) => resolve({ code, out, err }))
  })
  const st = await cli(['--status'])
  assert.equal(st.code, 0, st.err)
  const s = summaryOf(st, 'recheck status')
  assert.match(s.summary, /^runs=0 work=0/)
  assert.deepEqual(JSON.parse((await cli(['--status', '--json'])).out), s.result)

  // no controller: an error answer, exit 2, nothing queued
  const none = await cli(['--changed', 'a.css'])
  assert.equal(none.code, 2)
  assert.match(summaryOf(none, 'recheck recheck').summary, /^verdict=error closesGate=false why=no rolling controller/)

  // a live controller (this process) and an answer: the line points at the existing result file
  mkdirSync(requestsDir(ev, 's1'), { recursive: true })
  acquireLock(ev, 's1')
  const ask = (args) => {
    const running = cli(args)
    return (async () => {
      let req
      for (let i = 0; i < 100 && !req; i++) {
        req = pendingRequests(ev, 's1')[0]
        if (!req) await new Promise((r) => setTimeout(r, 50))
      }
      assert.ok(req, 'the request was queued')
      answer(ev, 's1', req.id, { verdict: 'clean', closesGate: false, pages: { 'light-desktop': { '/': { findings: 0 } } } })
      return { ...(await running), id: req.id }
    })()
  }
  try {
    const plain = await ask(['--changed', 'a.css'])
    assert.equal(plain.code, 0, plain.err)
    const lines = plain.out.split('\n').filter(Boolean)
    assert.equal(lines.length, 1)
    const detail = path.join(requestsDir(ev, 's1'), `${plain.id}.result.json`)
    assert.equal(lines[0], `recheck recheck: verdict=clean closesGate=false -> ${detail}`)
    assert.ok(existsSync(detail))
    for (const flag of ['--json', '--verbose']) {
      const full = await ask(['--changed', 'a.css', flag])
      assert.equal(full.code, 0)
      assert.equal(JSON.parse(full.out).pages['light-desktop']['/'].findings, 0, flag)
    }
  } finally {
    releaseLock(ev)
  }
})
