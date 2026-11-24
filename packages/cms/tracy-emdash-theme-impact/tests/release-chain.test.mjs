// release-chain.mjs runs the P8 tools in order and adds no check of its own. Stub tools record their
// argv in a journal so the order, the arguments handed on and the stop-on-first-failure are visible;
// the real clean-install.sh is used where its target guard is the point (sentinel files must survive).
// The qa step against the mock EmDash with a real pack is in qa.test.mjs ("release-chain").
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

const TOOLS = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../tools')
const STUBBED = ['generate-docs.mjs', 'artifact.mjs', 'distribution.mjs', 'qa.mjs', 'content-api-gate.mjs', 'release.mjs']

function fixture({ realCleanInstall = false } = {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'chain-'))
  const tpl = path.join(base, 'template')
  mkdirSync(path.join(tpl, 'tools'), { recursive: true })
  for (const f of ['release-chain.mjs', 'cli-output.mjs']) copyFileSync(path.join(TOOLS, f), path.join(tpl, 'tools', f))
  for (const name of STUBBED)
    writeFileSync(
      path.join(tpl, 'tools', name),
      `import { appendFileSync, cpSync, mkdirSync, writeFileSync } from 'node:fs'
const argv = process.argv.slice(2)
appendFileSync(process.env.CHAIN_JOURNAL, JSON.stringify({ name: ${JSON.stringify(name)}, argv, cwd: process.cwd() }) + '\\n')
console.log(${JSON.stringify(name)} + ' ran')
if (${JSON.stringify(name)} === 'distribution.mjs') cpSync(${JSON.stringify(path.join(tpl, 'tools'))}, argv[2] + '/tools', { recursive: true })
if (${JSON.stringify(name)} === 'qa.mjs') {
  const out = argv[argv.indexOf('--out') + 1]
  mkdirSync(out, { recursive: true })
  writeFileSync(out + '/report.json', JSON.stringify({ origin: new URL(argv[argv.indexOf('--site') + 1]).origin }))
}
process.exit(process.env.CHAIN_FAIL === ${JSON.stringify(name)} ? 3 : 0)
`
    )
  if (realCleanInstall) copyFileSync(path.join(TOOLS, 'clean-install.sh'), path.join(tpl, 'tools', 'clean-install.sh'))
  else writeFileSync(path.join(tpl, 'tools', 'clean-install.sh'), 'echo "{\\"name\\":\\"clean-install.sh\\",\\"argv\\":[\\"$1\\",\\"$2\\"],\\"cwd\\":\\"$PWD\\"}" >> "$CHAIN_JOURNAL"\n[ "$CHAIN_FAIL" = clean-install.sh ] && exit 3\nexit 0\n')
  chmodSync(path.join(tpl, 'tools', 'clean-install.sh'), 0o755)
  const journal = path.join(base, 'journal.jsonl')
  writeFileSync(journal, '')
  const args = (extra = []) => [
    '--pack', path.join(base, 'pack'), '--target', path.join(base, 'site'), '--port', '4399',
    '--source', path.join(base, 'design'), '--reviews', path.join(base, 'reviews'), '--out', path.join(base, 'chain'),
    ...extra
  ]
  const run = (extra = [], env = {}) => {
    const r = spawnSync(process.execPath, [path.join(tpl, 'tools', 'release-chain.mjs'), ...args(extra)], {
      cwd: tpl,
      encoding: 'utf8',
      env: { ...process.env, CHAIN_JOURNAL: journal, CHAIN_FAIL: '', ...env }
    })
    return { code: r.status, out: r.stdout, err: r.stderr, lines: r.stdout.trim().split('\n') }
  }
  const calls = () => readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const reset = () => writeFileSync(journal, '')
  return { base, tpl, run, calls, reset, done: () => rmSync(base, { recursive: true, force: true }) }
}

describe('release-chain — the P8 commands in order, nothing added', () => {
  it('runs docs → artifact → pack → clean-install (from the pack) → qa on the artifact → content-api → release, one line each', () => {
    const f = fixture()
    try {
      const r = f.run(['--version', '1.2.3', '--', '--visual', '--source-site', 'http://127.0.0.1:4350'])
      assert.equal(r.code, 0, r.out + r.err)
      const pack = path.join(f.base, 'pack')
      assert.deepEqual(
        f.calls().map((c) => c.name),
        ['generate-docs.mjs', 'artifact.mjs', 'distribution.mjs', 'clean-install.sh', 'qa.mjs', 'content-api-gate.mjs', 'release.mjs']
      )
      const [docs, , packCall, install, qa, capi, release] = f.calls()
      assert.deepEqual(docs.argv, ['--check'])
      assert.deepEqual(packCall.argv, ['pack', 'qa.contract.json', pack])
      assert.equal(install.cwd, pack, 'the clean site is installed from the PACKAGE, not the checkout')
      assert.deepEqual(install.argv, [path.join(f.base, 'site'), '4399'])
      for (const [flag, v] of [['--artifact', pack], ['--site', 'http://127.0.0.1:4399'], ['--reviews', path.join(f.base, 'reviews')], ['--source-site', 'http://127.0.0.1:4350']])
        assert.equal(qa.argv[qa.argv.indexOf(flag) + 1], v, flag)
      assert.ok(qa.argv.includes('--browser') && qa.argv.includes('--visual'))
      assert.deepEqual(capi.argv, [pack])
      assert.equal(release.argv[release.argv.indexOf('--report') + 1], path.join(f.base, 'chain', 'qa.1', 'report.json'))
      assert.equal(release.argv[release.argv.indexOf('--version') + 1], '1.2.3')
      assert.equal(r.lines.length, 8)
      assert.match(r.lines[0], /^release-chain docs: ok [\d.]+ s -> .*logs\/1-01-docs\.log$/)
      assert.match(r.lines[7], /^release-chain: status=ok steps=7 -> .*chain\.json$/)
      assert.match(readFileSync(path.join(f.base, 'chain', 'logs', '1-05-qa.log'), 'utf8'), /qa\.mjs ran/)
    } finally {
      f.done()
    }
  })

  it('stops on the first failing step with its log path; --from resumes there with a new qa run and its report', () => {
    const f = fixture()
    try {
      let r = f.run([], { CHAIN_FAIL: 'qa.mjs' })
      assert.equal(r.code, 1)
      assert.match(r.lines.at(-2), /^release-chain qa: FAIL \(exit 3\) [\d.]+ s -> .*1-05-qa\.log$/)
      assert.match(r.lines.at(-1), /^release-chain: status=fail at=qa -> .*1-05-qa\.log$/)
      assert.ok(!f.calls().some((c) => c.name === 'content-api-gate.mjs' || c.name === 'release.mjs'), 'nothing after the failure')
      f.reset()
      r = f.run(['--from', 'qa'])
      assert.equal(r.code, 0, r.out + r.err)
      assert.deepEqual(r.lines.slice(0, 4).map((l) => l.replace(/:.*/, '')), ['docs', 'artifact', 'pack', 'clean-install'].map((s) => `release-chain ${s}`))
      assert.ok(r.lines.slice(0, 4).every((l) => l.endsWith('skipped (--from qa)')))
      assert.deepEqual(f.calls().map((c) => c.name), ['qa.mjs', 'content-api-gate.mjs', 'release.mjs'])
      const release = f.calls()[2]
      assert.equal(release.argv[release.argv.indexOf('--report') + 1], path.join(f.base, 'chain', 'qa.2', 'report.json'), 'the failed run is kept, not overwritten')
      assert.ok(existsSync(path.join(f.base, 'chain', 'logs', '1-05-qa.log')) && existsSync(path.join(f.base, 'chain', 'logs', '2-05-qa.log')))
    } finally {
      f.done()
    }
  })

  it('release without a qa report from this chain fails (no report is invented); usage errors exit 2', () => {
    const f = fixture()
    try {
      // a chain that installed its clean site but whose qa failed has no report to release
      assert.equal(f.run([], { CHAIN_FAIL: 'qa.mjs' }).code, 1)
      let r = f.run(['--from', 'release'])
      assert.equal(r.code, 1)
      assert.match(r.out, /release-chain release: FAIL \(no qa report/)
      writeFileSync(path.join(f.base, 'given-report.json'), JSON.stringify({ origin: 'http://127.0.0.1:4399' }))
      r = f.run(['--from', 'release', '--report', path.join(f.base, 'given-report.json')])
      assert.equal(r.code, 0, r.out + r.err)
      assert.equal(f.calls().at(-1).argv[f.calls().at(-1).argv.indexOf('--report') + 1], path.join(f.base, 'given-report.json'))
      const usage = (args) =>
        spawnSync(process.execPath, [path.join(f.tpl, 'tools', 'release-chain.mjs'), ...args], { cwd: f.tpl, encoding: 'utf8' }).status
      assert.equal(usage(['--pack', 'p']), 2, 'no --out')
      assert.equal(usage(['--out', 'o', '--from', 'publish']), 2, 'unknown step')
      assert.equal(usage(['--out', 'o', '--from', 'clean-install', '--pack', 'p']), 2, 'clean-install needs --target and --port')
      assert.equal(usage(['--out', 'o', '--from', 'content-api', '--pack', 'p', '--force', 'x']), 2, 'no flag the chain does not know')
    } finally {
      f.done()
    }
  })
})

describe('release-chain — QA and release are the same site', () => {
  it('--site is refused, also after --; the qa origin is the one clean-install gives the site', () => {
    const f = fixture()
    try {
      let r = f.run(['--site', 'http://127.0.0.1:9999'])
      assert.equal(r.code, 2)
      assert.match(r.err, /--site is refused/)
      r = f.run(['--', '--site', 'http://127.0.0.1:9999'])
      assert.equal(r.code, 2)
      assert.deepEqual(f.calls(), [], 'nothing ran')
      // EMDASH_SITE_URL is the URL the site calls itself; clean-install.sh still starts it on 127.0.0.1:<port>
      r = f.run([], { EMDASH_SITE_URL: 'https://preview.example.test/' })
      assert.equal(r.code, 0, r.out + r.err)
      const qa = f.calls().find((c) => c.name === 'qa.mjs')
      assert.equal(qa.argv[qa.argv.indexOf('--site') + 1], 'http://127.0.0.1:4399', 'QA measures the site clean-install started')
      assert.equal(JSON.parse(readFileSync(path.join(f.base, 'chain', 'chain.json'), 'utf8')).cleanInstall.origin, 'http://127.0.0.1:4399')
      // a report taken from the external URL is not the released site's
      writeFileSync(path.join(f.base, 'external.json'), JSON.stringify({ origin: 'https://preview.example.test' }))
      r = f.run(['--from', 'release', '--report', path.join(f.base, 'external.json')], { EMDASH_SITE_URL: 'https://preview.example.test/' })
      assert.equal(r.code, 1)
      assert.match(r.out, /qa report measured https:\/\/preview\.example\.test, the clean site released is http:\/\/127\.0\.0\.1:4399/)
    } finally {
      f.done()
    }
  })

  it('a qa report of another site fails the release step; release.mjs is not run', () => {
    const f = fixture()
    try {
      assert.equal(f.run([], { CHAIN_FAIL: 'qa.mjs' }).code, 1)
      f.reset()
      writeFileSync(path.join(f.base, 'other-site.json'), JSON.stringify({ origin: 'http://127.0.0.1:4500' }))
      const r = f.run(['--from', 'release', '--report', path.join(f.base, 'other-site.json')])
      assert.equal(r.code, 1)
      assert.match(r.out, /release-chain release: FAIL \(qa report measured http:\/\/127\.0\.0\.1:4500, the clean site released is http:\/\/127\.0\.0\.1:4399: not the same site\)/)
      assert.ok(!f.calls().some((c) => c.name === 'release.mjs'))
    } finally {
      f.done()
    }
  })

  it('resuming after clean-install with no recorded clean install is refused (exit 2): a --report cannot ship with any target', () => {
    const f = fixture()
    try {
      writeFileSync(path.join(f.base, 'report.json'), JSON.stringify({ origin: 'http://127.0.0.1:4399' }))
      for (const from of ['qa', 'content-api', 'release']) {
        const r = f.run(['--from', from, '--report', path.join(f.base, 'report.json')])
        assert.equal(r.code, 2, from)
        assert.match(r.err, /records no clean install/)
      }
      assert.deepEqual(f.calls(), [], 'nothing ran')
      // once the chain ran clean-install it holds the record, and a later resume is accepted
      assert.equal(f.run([], { CHAIN_FAIL: 'qa.mjs' }).code, 1)
      assert.equal(f.run(['--from', 'release', '--report', path.join(f.base, 'report.json')]).code, 0)
    } finally {
      f.done()
    }
  })

  it('after the chain installed a clean site, a later run naming another target or port is refused (exit 2)', () => {
    const f = fixture()
    try {
      assert.equal(f.run([]).code, 0)
      f.reset()
      let r = f.run(['--from', 'qa', '--target', path.join(f.base, 'elsewhere')])
      assert.equal(r.code, 2)
      assert.match(r.err, /QA and release must be the same site/)
      r = f.run(['--from', 'release', '--port', '4400'])
      assert.equal(r.code, 2)
      assert.deepEqual(f.calls(), [], 'nothing ran')
      r = f.run(['--from', 'qa'])
      assert.equal(r.code, 0, 'the same site resumes')
    } finally {
      f.done()
    }
  })

  it('a new clean install drops the qa report of the previous one', () => {
    const f = fixture()
    try {
      assert.equal(f.run([], { CHAIN_FAIL: 'content-api-gate.mjs' }).code, 1)
      // reinstall on another target, then fail qa: release must not take the old site's report
      const r = f.run(['--from', 'clean-install', '--target', path.join(f.base, 'site2')], { CHAIN_FAIL: 'qa.mjs' })
      assert.equal(r.code, 1)
      const state = JSON.parse(readFileSync(path.join(f.base, 'chain', 'chain.json'), 'utf8'))
      assert.equal(state.qaReport, null)
      assert.equal(state.cleanInstall.target, path.join(f.base, 'site2'))
      assert.match(f.run(['--from', 'release', '--target', path.join(f.base, 'site2')]).out, /FAIL \(no qa report/)
    } finally {
      f.done()
    }
  })
})

describe('release-chain — the recorded site is recomputed, every origin compared in one form', () => {
  it('a chain.json whose clean install carries an external origin is refused on resume (exit 2); nothing runs', () => {
    const f = fixture()
    try {
      mkdirSync(path.join(f.base, 'chain'))
      writeFileSync(
        path.join(f.base, 'chain', 'chain.json'),
        JSON.stringify({
          runs: [],
          qaReport: null,
          cleanInstall: { target: path.join(f.base, 'site'), port: '4399', origin: 'https://preview.example.test' }
        })
      )
      writeFileSync(path.join(f.base, 'external.json'), JSON.stringify({ origin: 'https://preview.example.test' }))
      for (const from of ['qa', 'release']) {
        const r = f.run(['--from', from, '--report', path.join(f.base, 'external.json')])
        assert.equal(r.code, 2, `${from}: ${r.out}${r.err}`)
        assert.match(r.err, /records a clean install this chain could not have recorded .*listens on http:\/\/127\.0\.0\.1:4399/)
      }
      // a bad port in the record is refused the same way
      writeFileSync(
        path.join(f.base, 'chain', 'chain.json'),
        JSON.stringify({ runs: [], qaReport: null, cleanInstall: { target: path.join(f.base, 'site'), port: '70000', origin: 'http://127.0.0.1:70000' } })
      )
      assert.equal(f.run(['--from', 'release', '--report', path.join(f.base, 'external.json')]).code, 2)
      assert.deepEqual(f.calls(), [], 'nothing ran')
    } finally {
      f.done()
    }
  })

  it('--port 080 is the port 80: clean-install, qa and the release check all use the canonical form, and the chain releases its own report', () => {
    const f = fixture()
    try {
      const r = f.run(['--port', '080'])
      assert.equal(r.code, 0, r.out + r.err)
      const calls = f.calls()
      assert.deepEqual(calls.find((c) => c.name === 'clean-install.sh').argv.slice(1), ['80'])
      const qa = calls.find((c) => c.name === 'qa.mjs')
      assert.equal(qa.argv[qa.argv.indexOf('--site') + 1], 'http://127.0.0.1')
      assert.ok(calls.some((c) => c.name === 'release.mjs'), 'release accepted the report qa wrote')
      const state = JSON.parse(readFileSync(path.join(f.base, 'chain', 'chain.json'), 'utf8'))
      assert.deepEqual([state.cleanInstall.port, state.cleanInstall.origin], ['80', 'http://127.0.0.1'])
      f.reset()
      assert.equal(f.run(['--from', 'release', '--port', '80']).code, 0, 'the same port, spelled canonically, resumes')
      assert.equal(f.run(['--from', 'release', '--port', '0080']).code, 0, 'and so does another spelling of it')
      for (const bad of ['0', '65536', '8a', '-1', '4399.0'])
        assert.equal(f.run(['--port', bad]).code, 2, `--port ${bad}`)
    } finally {
      f.done()
    }
  })

  it('a resume names the recorded target by any path that reaches it (symlink); another folder is refused', () => {
    const f = fixture()
    try {
      mkdirSync(path.join(f.base, 'site'))
      assert.equal(f.run([], { CHAIN_FAIL: 'qa.mjs' }).code, 1)
      symlinkSync(path.join(f.base, 'site'), path.join(f.base, 'alias'))
      f.reset()
      let r = f.run(['--from', 'qa', '--target', path.join(f.base, 'alias')])
      assert.equal(r.code, 0, r.out + r.err)
      const release = f.calls().find((c) => c.name === 'release.mjs')
      assert.equal(release.argv[release.argv.indexOf('--site') + 1], realpathSync(path.join(f.base, 'site')))
      mkdirSync(path.join(f.base, 'other'))
      r = f.run(['--from', 'qa', '--target', path.join(f.base, 'other')])
      assert.equal(r.code, 2)
    } finally {
      f.done()
    }
  })
})

describe('release-chain — the clean-install target guard holds (real clean-install.sh, sentinel files)', () => {
  it('a non-empty target is refused before any write: sentinel intact, chain stops, nothing after it runs', () => {
    const f = fixture({ realCleanInstall: true })
    try {
      const target = path.join(f.base, 'site')
      mkdirSync(target)
      writeFileSync(path.join(target, 'SENTINEL'), 'keep me\n')
      const r = f.run([])
      assert.equal(r.code, 1, r.out)
      assert.match(r.lines.at(-1), /status=fail at=clean-install/)
      assert.match(readFileSync(path.join(f.base, 'chain', 'logs', '1-04-clean-install.log'), 'utf8'), /is not empty/)
      assert.equal(readFileSync(path.join(target, 'SENTINEL'), 'utf8'), 'keep me\n')
      assert.deepEqual(readdirSync(target), ['SENTINEL'], 'nothing written into the target')
      assert.ok(!f.calls().some((c) => c.name === 'qa.mjs'))
    } finally {
      f.done()
    }
  })
  it('a target inside the package (the clean-install source) is refused and not created', () => {
    const f = fixture({ realCleanInstall: true })
    try {
      const inside = path.join(f.base, 'pack', 'site')
      const r = f.run(['--target', inside])
      assert.equal(r.code, 1, r.out)
      assert.match(readFileSync(path.join(f.base, 'chain', 'logs', '1-04-clean-install.log'), 'utf8'), /inside the source/)
      assert.ok(!existsSync(inside))
      assert.ok(existsSync(path.join(f.base, 'pack', 'tools', 'clean-install.sh')), 'the package is untouched')
    } finally {
      f.done()
    }
  })
})
