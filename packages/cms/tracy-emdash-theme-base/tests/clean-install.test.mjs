// F1: tools/clean-install.sh must refuse every dangerous target BEFORE writing anything, and
// still copy into a fresh directory. Real script, real source tree, sentinel files; package
// installation is replaced by a stub `pnpm` on PATH that records its call and fails (71), so the
// happy path proves preflight → copy order without a real install/build.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..')
const SCRIPT = path.join(ROOT, 'tools/clean-install.sh')
const run = (args, env = {}) => {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
  return { code: r.status, out: r.stdout + r.stderr }
}
const tmp = () => mkdtempSync(path.join(tmpdir(), 'ci-'))
const freePort = () =>
  new Promise((res) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => res(p))
    })
  })

describe('F1 — clean-install refuses before it writes', () => {
  it('non-empty target: refused, sentinel untouched', async () => {
    const t = tmp()
    writeFileSync(path.join(t, 'customer-file.txt'), 'keep me')
    const r = run([t, String(await freePort())])
    assert.notEqual(r.code, 0)
    assert.match(r.out, /not empty/)
    assert.equal(readFileSync(path.join(t, 'customer-file.txt'), 'utf8'), 'keep me')
    assert.deepEqual(readdirSync(t), ['customer-file.txt'])
  })
  it('symlink target: refused', async () => {
    const t = tmp()
    const real = path.join(t, 'real')
    mkdirSync(real)
    writeFileSync(path.join(real, 'x.txt'), 'x')
    const link = path.join(t, 'link')
    symlinkSync(real, link)
    const r = run([link, String(await freePort())])
    assert.notEqual(r.code, 0)
    assert.match(r.out, /symlink/)
    assert.deepEqual(readdirSync(real), ['x.txt'])
  })
  it('target inside the source: refused and not created', async () => {
    const t = path.join(ROOT, 'tmp-clean-install-test')
    const r = run([t, String(await freePort())])
    assert.notEqual(r.code, 0)
    assert.match(r.out, /inside the source/)
    assert.equal(existsSync(t), false)
  })
  it('the source itself and its parent: refused', async () => {
    let r = run([ROOT, String(await freePort())])
    assert.notEqual(r.code, 0)
    assert.match(r.out, /not empty|source directory/)
    r = run([path.dirname(ROOT), String(await freePort())])
    assert.notEqual(r.code, 0)
    assert.match(r.out, /not empty|ancestor/)
  })
  it('target inside another project (ancestor has package.json / data/data.db): refused, not created', async () => {
    const t = tmp()
    writeFileSync(path.join(t, 'package.json'), '{}')
    let r = run([path.join(t, 'site'), String(await freePort())])
    assert.notEqual(r.code, 0)
    assert.match(r.out, /inside another project/)
    assert.equal(existsSync(path.join(t, 'site')), false)
    const u = tmp()
    mkdirSync(path.join(u, 'data'))
    writeFileSync(path.join(u, 'data/data.db'), '')
    r = run([path.join(u, 'nested', 'site'), String(await freePort())])
    assert.notEqual(r.code, 0)
    assert.match(r.out, /inside another project|parent directory .* does not exist/)
    assert.equal(existsSync(path.join(u, 'nested')), false)
  })
  it('busy port: refused before any copy', async () => {
    const srv = net.createServer()
    await new Promise((res) => srv.listen(0, '127.0.0.1', res))
    const port = srv.address().port
    const t = path.join(tmp(), 'site')
    const r = run([t, String(port)])
    srv.close()
    assert.notEqual(r.code, 0)
    assert.match(r.out, /already in use/)
    assert.equal(existsSync(t), false)
  })
  it('non-numeric port: refused', () => {
    const t = path.join(tmp(), 'site')
    const r = run([t, 'abc'])
    assert.notEqual(r.code, 0)
    assert.match(r.out, /port must be a number/)
    assert.equal(existsSync(t), false)
  })
  it('fresh target: preflight passes, source is copied without runtime state, then install runs from the lockfile', async () => {
    const bin = tmp()
    const log = path.join(bin, 'pnpm.log')
    writeFileSync(path.join(bin, 'pnpm'), `#!/bin/sh\necho "$@" >> "${log}"\nexit 71\n`)
    chmodSync(path.join(bin, 'pnpm'), 0o755)
    const t = path.join(tmp(), 'site')
    const r = run([t, String(await freePort())], { PATH: `${bin}:${process.env.PATH}` })
    assert.notEqual(r.code, 0, 'stubbed install fails → script stops there')
    assert.match(r.out, /preflight ok/)
    for (const f of [
      'package.json',
      'pnpm-lock.yaml',
      'astro.config.mjs',
      'template.config.json',
      'tools/bootstrap-site.sh',
      'seed/seed.json',
      'src/pages'
    ])
      assert.ok(existsSync(path.join(t, f)), `${f} copied`)
    for (const f of ['node_modules', 'data', 'uploads', 'dist', '.astro', '.env', 'evidence', 'backups'])
      assert.equal(existsSync(path.join(t, f)), false, `${f} must not be copied`)
    assert.match(readFileSync(log, 'utf8'), /^install --frozen-lockfile/m)
  })
})
