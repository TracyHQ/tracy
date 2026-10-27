import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { normaliseModes, packTar, packZip } from '../src/release-pack.mjs'

const has = (cmd, arg) => spawnSync(cmd, [arg], { stdio: 'ignore' }).status === 0
// bsdtar only: GNU tar has no --no-mac-metadata
const BSDTAR = spawnSync('tar', ['--version'], { encoding: 'utf8' }).stdout?.includes('bsdtar')

/** A webroot as a published archive can unpack it: a 0600 file inside a 0700 directory. */
function tree() {
  const root = mkdtempSync(join(tmpdir(), 'release-pack-'))
  const site = join(root, 'site')
  mkdirSync(join(site, 'templates', 'x'), { recursive: true })
  writeFileSync(join(site, 'templates', 'x', 'a.css'), 'a{}')
  writeFileSync(join(site, 'cli.sh'), '#!/bin/sh\n')
  chmodSync(join(site, 'templates', 'x', 'a.css'), 0o600)
  chmodSync(join(site, 'cli.sh'), 0o700)
  chmodSync(join(site, 'templates', 'x'), 0o700)
  return { root, site }
}
const mode = (p) => statSync(p).mode & 0o777

test('normaliseModes: files 0644 (0755 when executable), directories 0755', () => {
  const { root, site } = tree()
  try {
    normaliseModes(site)
    assert.equal(mode(join(site, 'templates', 'x', 'a.css')), 0o644)
    assert.equal(mode(join(site, 'cli.sh')), 0o755)
    assert.equal(mode(join(site, 'templates', 'x')), 0o755)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('packTar sets the modes itself: a 0600 member never reaches the archive', { skip: !BSDTAR }, () => {
  const { root, site } = tree()
  try {
    const file = join(root, 'webroot.tar.gz')
    packTar(site, file)
    const list = execFileSync('tar', ['-tvzf', file], { encoding: 'utf8' })
    assert.match(list, /^-rw-r--r-- .*templates\/x\/a\.css$/m)
    assert.match(list, /^drwxr-xr-x .*templates\/x\/?$/m)
    assert.doesNotMatch(list, /^-rw-------|^drwx------/m)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// the T4 path of release-joomla.mjs: packed once, sheets written into the tree, packed again
test('packZip: a file written after an earlier pack is 0644 in the second archive', {
  skip: !has('zip', '-v')
}, () => {
  const { root, site } = tree()
  try {
    const file = join(root, 'quickstart.zip')
    packZip(site, file)
    mkdirSync(join(site, 'media', 't4', 'css'), { recursive: true, mode: 0o700 })
    writeFileSync(join(site, 'media', 't4', 'css', '9.css'), 'b{}', { mode: 0o600 })
    packZip(site, file)
    const list = execFileSync('zipinfo', [file], { encoding: 'utf8' })
    assert.match(list, /^-rw-r--r-- .* media\/t4\/css\/9\.css$/m)
    assert.match(list, /^drwxr-xr-x .* media\/t4\/$/m)
    assert.doesNotMatch(list, /^-rw-------|^drwx------/m)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
