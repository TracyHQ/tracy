// Finish audit (review/port-audit.mjs) and its input refusals: a read-only reporter over the rendered site and the dossier's decisions.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { testDir } from './lib/test-root.mjs'
import { PORT_AUDIT_TOOL, checkOut, exceptionSurfaceErrors, originOf, runPortAudit, writeReport } from '../review/port-audit.mjs'
import { claimHash, scanBehaviorCopy } from '../review/behavior-copy.mjs'
import { parseDecisions } from '../lib/parity-acceptance.mjs'
import { footerPage } from './audit-fixture.mjs'

const CLI = fileURLToPath(new URL('../review/port-audit.mjs', import.meta.url))
const DECISIONS = '| D-ji-gb-1 | Joomla footer wording "Powered by Joomla!" kept | OPEN |\n| D-12 | mega panel corner | OPEN |\n'
const remind = `<!doctype html><html><head><title>R</title></head><body><main><p>Your username will be emailed to you.</p><form action="/wp-login.php?action=lostpassword" method="post"><input name="user_login"><button>Send</button></form></main></body></html>`
const clean = footerPage('<p>© 2026 Acme</p>', '<p>Welcome to the demo.</p>')
const pagesOf = (map) => async (url) => {
  const u = new URL(url)
  const html = map[u.pathname]
  return html === undefined ? { status: 404, html: '' } : { status: 200, html, url }
}
const base = (over = {}) => ({
  site: 'http://site.test',
  source: 'http://source.test',
  routes: [{ path: '/', status: null }],
  inputs: { decisions: DECISIONS, allow: null, reviews: null, exceptionFiles: [{ file: '/x/accepted.json', json: [] }], ...(over.inputs ?? {}) },
  fetchUrl: pagesOf(over.pages ?? { '/': clean }),
  ...(over.top ?? {})
})
const run = (args, opts = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 60000, ...opts })
const failing = (r) => Object.entries(r.checks).filter(([, c]) => !c.ok).map(([k]) => k)

test('port-audit: a clean site with current evidence passes every check', async () => {
  const r = await runPortAudit(base())
  assert.equal(r.ok, true, JSON.stringify(failing(r)))
  assert.equal(r.blocking, 0)
  assert.deepEqual(Object.keys(r.checks).sort(), ['behavior-copy', 'cms-leftovers', 'decisions', 'exceptions'])
})

test('port-audit: each class blocks the finish on its own', async () => {
  assert.deepEqual(failing(await runPortAudit(base({ pages: { '/': footerPage('<p>Powered by Joomla!</p>') } }))), ['cms-leftovers'])
  assert.deepEqual(failing(await runPortAudit(base({ pages: { '/': remind } }))), ['behavior-copy'])
  assert.deepEqual(failing(await runPortAudit(base({ inputs: { decisions: `${DECISIONS}| D-71 | The author cards are replaced by post cards | OPEN |\n` } }))), ['decisions'])
  assert.deepEqual(failing(await runPortAudit(base({ inputs: { exceptionFiles: [{ file: '/x/visual.contract.json', json: { design: { exceptions: [{ kind: 'identity-mismatch', match: 'footer', key: 'Powered by Joomla!', reason: 'r', decision: 'D-gb-1' }] } } }] } }))), ['exceptions'])
})

test('port-audit: in a patch scope only the site-facing classes block; decisions and exceptions are advisories with counts', async () => {
  const dirtyPaper = base({ inputs: { decisions: `${DECISIONS}| D-71 | The author cards are replaced by post cards | OPEN |\n`, exceptionFiles: [{ file: '/x/visual.contract.json', json: { design: { exceptions: [{ kind: 'identity-mismatch', match: 'footer', key: 'Powered by Joomla!', reason: 'r', decision: 'D-gb-1' }] } } }] } })
  const full = await runPortAudit(dirtyPaper)
  assert.deepEqual(failing(full), ['decisions', 'exceptions'])
  assert.equal(full.ok, false)
  assert.equal(full.advisories, undefined)
  const patch = await runPortAudit({ ...dirtyPaper, scope: 'patch' })
  assert.deepEqual(failing(patch), ['decisions', 'exceptions'], 'still computed')
  assert.equal(patch.ok, true)
  assert.equal(patch.blocking, 0)
  assert.ok(patch.advisories.decisions > 0 && patch.advisories.exceptions > 0, JSON.stringify(patch.advisories))
  const leftover = await runPortAudit({ ...base({ pages: { '/': footerPage('<p>Powered by Joomla!</p>') } }), scope: 'patch' })
  assert.equal(leftover.ok, false)
  assert.equal(leftover.blocking, 1)
})

test('port-audit: an --out whose ancestor is a symbolic link is refused, as is a link to the file', () => {
  const dir = testDir('port-audit-anc')
  mkdirSync(join(dir, 'real'))
  mkdirSync(join(dir, 'real', 'sub'))
  symlinkSync(join(dir, 'real'), join(dir, 'via'))
  assert.throws(() => checkOut(join(dir, 'via', 'sub', 'r.json')), /is a symbolic link/)
  assert.throws(() => writeReport(join(dir, 'via', 'sub', 'r.json'), {}), /is a symbolic link/)
  assert.equal(existsSync(join(dir, 'real', 'sub', 'r.json')), false, 'nothing was published through the link')
  assert.doesNotThrow(() => checkOut(join(dir, 'real', 'sub', 'r.json')))
})

test('port-audit: an unreadable, redirected-away or empty route is unmeasured and the audit is not clean', async () => {
  const r = await runPortAudit(base({ top: { routes: [{ path: '/', status: null }, { path: '/gone/', status: null }, { path: '/away/', status: null }] }, pages: { '/': clean } }))
  assert.equal(r.ok, false)
  assert.deepEqual(r.checks['cms-leftovers'].unmeasured.map((u) => u.route).sort(), ['/away/', '/gone/'])
  const off = await runPortAudit({ ...base(), fetchUrl: async () => ({ status: 200, html: clean, url: 'http://elsewhere.test/' }) })
  assert.equal(off.checks['cms-leftovers'].ok, false, 'a page served from another origin is not this site')
  const err = await runPortAudit({ ...base(), fetchUrl: async () => { throw new Error('connection refused') } })
  assert.equal(err.ok, false)
})

test('port-audit: a page the map declares as 404 (the error page) is read at that status, and its Joomla wording is a finding', async () => {
  const fetchUrl = async (u) => ({ status: 404, html: footerPage('<p>Each JA Joomla Template has its own matching page</p><p>Powered by Joomla!</p>'), url: u })
  const r = await runPortAudit({ ...base(), routes: [{ path: '/error/', status: 404 }], fetchUrl })
  assert.ok(r.checks['cms-leftovers'].findings.length >= 1)
})

test('port-audit: the behaviour-copy review makes a truthful promise pass; a stale review does not', async () => {
  const truthful = footerPage('<p>© 2026</p>', '<p>Enter your email and we will send you a link to reset your password.</p><form action="/wp-login.php?action=lostpassword"><input name="user_login"></form>')
  const [claim] = scanBehaviorCopy(truthful, { route: '/' }).claims
  const rv = { route: '/', claim: claim.claim, claimHash: claim.claimHash, observed: 'mail arrived', evidence: 'log', reviewer: 'Hano', disposition: 'truthful' }
  assert.equal((await runPortAudit(base({ pages: { '/': truthful }, inputs: { reviews: [rv] } }))).ok, true)
  assert.deepEqual(failing(await runPortAudit(base({ pages: { '/': truthful }, inputs: { reviews: [{ ...rv, claimHash: claimHash({ ...claim, copy: 'older copy' }) }] } }))), ['behavior-copy'])
})

test('exception surfaces: every file shape is read; a file with no list in it is refused, not skipped', () => {
  const d = parseDecisions(DECISIONS)
  const ok = { kind: 'identity-mismatch', match: 'footer', key: 'Powered by Joomla!', reason: 'r', decision: 'D-ji-gb-1' }
  assert.deepEqual(exceptionSurfaceErrors({ design: { exceptions: [ok] } }, d, 'visual.contract.json'), [])
  assert.deepEqual(exceptionSurfaceErrors({ visual: { exceptions: [ok] } }, d, 'review.config.json'), [])
  assert.ok(exceptionSurfaceErrors({ visual: { exceptions: [{ ...ok, decision: 'D-gb-1' }] } }, d, 'review.config.json')[0].startsWith('review.config.json'))
  assert.ok(exceptionSurfaceErrors({ exceptions: [{ page: 'a', rule: 'hero', decision: 'D-12' }] }, d, 'design-contract.json').length, 'a design-contract exception citing an unrelated decision')
  assert.ok(exceptionSurfaceErrors([{ match: 'Written by', routes: ['*'], reason: 'r', decision: 'D-12' }], d, 'parity-accepted.json').length)
  assert.match(exceptionSurfaceErrors({ unrelated: true }, d, 'x.json').join(), /no exception list/)
  // a malformed field is an error even when another list of the same file is valid (siblings: every list-shaped field)
  for (const bad of [{ design: { exceptions: { not: 'a list' } }, visual: { exceptions: [ok] } }, { visual: { exceptions: 'x' }, design: { exceptions: [ok] } }, { accept: {}, exceptions: [{ rule: 'a', decision: 'D-ji-gb-1' }] }, { design: { menus: { pairs: 5 } }, visual: { exceptions: [ok] } }, { visual: { menuPairs: {}, exceptions: [ok] } }, { exceptions: [null, { rule: 'Powered by Joomla!', decision: 'D-ji-gb-1' }] }, { exceptions: [{ page: 'a' }] }])
    assert.ok(exceptionSurfaceErrors(bad, d, 'x.json').some((m) => /not a list|neither a rule nor a kind/.test(m)), JSON.stringify(bad))
})

test('port-audit CLI: unknown, duplicate, valueless and missing options and bad origins are refused with exit 2 before any fetch', () => {
  assert.equal(run(['--nope', 'x']).status, 2)
  assert.equal(run(['--site', 'http://a', '--site', 'http://b', '--routes', '/']).status, 2)
  assert.equal(run(['--site']).status, 2)
  assert.match(run(['--routes', '/']).stderr, /--site is required/)
  assert.match(run(['--site', 'http://a.test']).stderr, /--routes is required/)
  for (const bad of ['ftp://a.test', 'not a url', 'http://a.test/path', 'http://u:p@a.test', 'http://a.test/?q=1']) assert.equal(run(['--site', bad, '--routes', '/']).status, 2, bad)
  assert.throws(() => originOf('http://a.test/x', '--site'), /bare http/)
  assert.equal(originOf('http://a.test', '--site'), 'http://a.test')
})

test('port-audit CLI: a directory, a symlink loop, a FIFO-like non-file, an empty or malformed input and an unsafe --out are refused', async () => {
  const dir = testDir('port-audit-io')
  mkdirSync(join(dir, 'adir'))
  writeFileSync(join(dir, 'empty.md'), '')
  writeFileSync(join(dir, 'bad.json'), '{')
  writeFileSync(join(dir, 'real.json'), '[]')
  symlinkSync(join(dir, 'loop-b'), join(dir, 'loop-a'))
  symlinkSync(join(dir, 'loop-a'), join(dir, 'loop-b'))
  symlinkSync(join(dir, 'real.json'), join(dir, 'link.json'))
  const common = ['--site', 'http://127.0.0.1:9', '--routes', '/']
  assert.match(run([...common, '--decisions', join(dir, 'adir')]).stderr, /not a regular file/)
  // a FIFO would hold a reader forever: it is refused by type before it is opened
  const fifo = join(dir, 'pipe')
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0)
  for (const flag of ['--decisions', '--allow', '--exceptions', '--behavior-reviews']) {
    const r = run([...common, flag, fifo], { timeout: 20000 })
    assert.equal(r.status, 2, `${flag}: ${r.stderr}`)
  }
  assert.match(run([...common, '--decisions', join(dir, 'empty.md')]).stderr, /empty/)
  assert.match(run([...common, '--decisions', join(dir, 'loop-a')]).stderr, /--decisions/)
  assert.match(run([...common, '--allow', join(dir, 'bad.json')]).stderr, /not valid JSON/)
  assert.match(run([...common, '--exceptions', join(dir, 'nope.json')]).stderr, /no such file/)
  for (const out of [join(dir, 'adir'), join(dir, 'link.json'), join(dir, 'missing-dir', 'r.json')]) {
    const r = run([...common, '--out', out])
    assert.equal(r.status, 2, out)
    assert.match(r.stderr, /--out/)
  }
  assert.throws(() => checkOut(join(dir, 'link.json')), /not a regular file/)
})

test('port-audit CLI: against a real server the exit is 0 clean, 1 with a leftover, and the report is published atomically', async () => {
  const dir = testDir('port-audit-cli')
  let html = clean
  const server = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(html) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    writeFileSync(join(dir, 'DECISIONS.md'), DECISIONS)
    writeFileSync(join(dir, 'parity-accepted.json'), '[]')
    const args = ['--site', origin, '--source', origin, '--routes', '/', '--decisions', join(dir, 'DECISIONS.md'), '--accept', join(dir, 'parity-accepted.json'), '--out', join(dir, 'report.json')]
    const exec = () => new Promise((resolve) => { const c = spawn(process.execPath, [CLI, ...args]); let out = ''; c.stdout.on('data', (d) => (out += d)); c.on('close', (code) => resolve({ code, out })) })
    const ok = await exec()
    assert.equal(ok.code, 0, ok.out)
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.tmp')), [], 'no temporary file is left')
    html = footerPage('<p>Powered by Joomla!</p>')
    const bad = await exec()
    assert.equal(bad.code, 1, bad.out)
    assert.match(bad.out, /FAIL cms-leftovers/)
    assert.equal(JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')).ok, false, 'the report of a failed run says so')
    // the clean report is a read-only record: no other gate consumes it (docs/follow-ups/audit-gates.md)
    html = clean
    assert.equal((await exec()).code, 0)
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'))
    assert.equal(report.tool, PORT_AUDIT_TOOL)
    assert.deepEqual(Object.keys(report.checks).sort(), ['behavior-copy', 'cms-leftovers', 'decisions', 'exceptions'])
    // a bad acceptance file blocks
    writeFileSync(join(dir, 'parity-accepted.json'), '[{"match":"Written by","routes":["*"],"reason":"r","decision":"D-12"}]')
    const again = await exec()
    assert.equal(again.code, 1, again.out)
    assert.match(again.out, /FAIL exceptions/)
  } finally {
    server.close()
  }
})

test('port-audit: concurrent writers use their own temporary files; a failed write leaves the earlier report', () => {
  const dir = testDir('port-audit-write')
  const file = join(dir, 'r.json')
  writeReport(file, { ok: true, n: 1 })
  writeReport(file, { ok: false, n: 2 })
  assert.deepEqual(readdirSync(dir), ['r.json'])
  assert.throws(() => writeReport(join(dir, 'nodir', 'r.json'), {}), /--out/)
  assert.ok(existsSync(file))
})
