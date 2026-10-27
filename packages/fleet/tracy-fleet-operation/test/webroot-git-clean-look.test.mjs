/**
 * A look at a site whose webroot did not change since the last seal must not pay for the
 * whole-webroot walks that only a dirty tree needs (`find -size +50M`, `git add -A -f`, the
 * housekeeping scan). Measured 12/10/2026 on the local stand, demo-tb-joomla (42,650 files): the
 * `history` op took 4.5 s, of which those walks were ~3.2 s, and Site changes asks it on every open.
 *
 * What stays guarded: a dirty tree still takes the full road, so a new giant file is still kept
 * out, an edit in a folder the customer's own .gitignore names is still sealed, and an exclude list
 * written by an older script still triggers housekeeping.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/webroot-git-clean-look.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
  existsSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const GIT = join(here, '..', 'scripts', 'webroot', 'webroot-git.sh')
const LABEL = 'site-under-test'

/** A WordPress-shaped webroot in a throwaway stack, plus a `find` that logs each call. */
function stack() {
  const srv = mkdtempSync(join(tmpdir(), 'tracy-srv-'))
  const webroot = join(srv, LABEL, '.webroot')
  mkdirSync(join(webroot, 'wp-includes'), { recursive: true })
  mkdirSync(join(webroot, 'wp-content', 'themes', 'tracy'), { recursive: true })
  writeFileSync(join(webroot, 'wp-includes', 'version.php'), '<?php $wp_version = "6.6";\n')
  writeFileSync(join(webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'body { margin: 0 }\n')
  // The customer's own .gitignore, as JoomlArt ships one: Tracy's snapshot must ignore it.
  writeFileSync(join(webroot, '.gitignore'), 'images/\n')
  const bin = join(srv, 'bin')
  mkdirSync(bin)
  const realFind = execFileSync('bash', ['-c', 'command -v find'], { encoding: 'utf8' }).trim()
  const log = join(srv, 'find.log')
  writeFileSync(join(bin, 'find'), `#!/usr/bin/env bash\necho "$*" >> "${log}"\nexec "${realFind}" "$@"\n`)
  chmodSync(join(bin, 'find'), 0o755)
  return {
    srv,
    webroot,
    repo: join(srv, LABEL, 'webroot-baseline.git'),
    /** How many whole-webroot size walks ran since the last call. */
    sizeWalks() {
      const lines = existsSync(log) ? readFileSync(log, 'utf8').split('\n') : []
      rmSync(log, { force: true })
      return lines.filter((l) => l.includes('-size')).length
    },
    run(...args) {
      const out = execFileSync('bash', [GIT, '--label', LABEL, ...args], {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          TRACY_SRV: srv,
          TRACY_SITES_ROOT: srv,
          TRACY_HEAVY_LOCK: join(srv, 'heavy.lock'),
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null'
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      })
      return JSON.parse(out.trim().split('\n').at(-1) ?? '')
    },
    git(...args) {
      return execFileSync('git', ['--git-dir', this.repo, '--work-tree', webroot, ...args], {
        encoding: 'utf8',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
      })
    },
    dispose: () => rmSync(srv, { recursive: true, force: true })
  }
}

test('a look at an unchanged webroot seals nothing and skips the size walk', () => {
  const s = stack()
  try {
    s.run('--op', 'ensure')
    s.sizeWalks()
    const first = s.run('--op', 'history')
    assert.equal(first.sealed, null)
    const head = s.git('rev-parse', 'HEAD').trim()
    s.sizeWalks()
    const again = s.run('--op', 'history')
    assert.equal(again.sealed, null)
    assert.equal(s.sizeWalks(), 0, 'no find -size over a clean webroot')
    assert.equal(s.git('rev-parse', 'HEAD').trim(), head, 'no commit')
  } finally {
    s.dispose()
  }
})

test('after a clean look, an edit, a new file and a deletion are still sealed', () => {
  const s = stack()
  try {
    s.run('--op', 'ensure')
    s.run('--op', 'history')
    writeFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'body { margin: 1px }\n')
    const edited = s.run('--op', 'history')
    assert.deepEqual(edited.sealed?.files, ['wp-content/themes/tracy/style.css'])
    s.run('--op', 'history')
    rmSync(join(s.webroot, 'wp-includes', 'version.php'))
    assert.deepEqual(s.run('--op', 'history').sealed?.files, ['wp-includes/version.php'])
    // A folder the customer's .gitignore names is still the customer's content.
    mkdirSync(join(s.webroot, 'images'))
    writeFileSync(join(s.webroot, 'images', 'hero.jpg'), 'jpg\n')
    assert.deepEqual(s.run('--op', 'history').sealed?.files, ['images/hero.jpg'])
  } finally {
    s.dispose()
  }
})

test('a file only Tracy writes for itself does not make a clean webroot look dirty', () => {
  const s = stack()
  try {
    s.run('--op', 'ensure')
    s.run('--op', 'history')
    writeFileSync(join(s.webroot, 'tracy-changed.json'), '{"at":2}\n')
    mkdirSync(join(s.webroot, 'cache'))
    writeFileSync(join(s.webroot, 'cache', 'page.html'), '<html>\n')
    s.sizeWalks()
    assert.equal(s.run('--op', 'history').sealed, null)
    assert.equal(s.sizeWalks(), 0, 'excluded files alone are no reason for the full walk')
  } finally {
    s.dispose()
  }
})

test('a new giant file after a clean look takes the full road and is kept out of the history', () => {
  const s = stack()
  try {
    s.run('--op', 'ensure')
    s.run('--op', 'history')
    s.sizeWalks()
    // Sparse: 60 MB by size, nothing on disk.
    const big = join(s.webroot, 'wp-content', 'backup.zip')
    writeFileSync(big, '')
    truncateSync(big, 60 * 1024 * 1024)
    const look = s.run('--op', 'history')
    assert.equal(s.sizeWalks(), 1, 'a dirty tree still runs the size walk')
    assert.equal(look.sealed, null, 'the giant file alone seals nothing')
    assert.ok(!s.git('ls-files').includes('backup.zip'))
    // Known now, it no longer makes the tree look dirty.
    s.run('--op', 'history')
    assert.equal(s.sizeWalks(), 0)
  } finally {
    s.dispose()
  }
})

test('an exclude list written by an older script takes the full road, so housekeeping still runs', () => {
  const s = stack()
  try {
    s.run('--op', 'ensure')
    // What an older script left: tracy-changed.json tracked, and an exclude list without its line.
    writeFileSync(join(s.webroot, 'tracy-changed.json'), '{"at":1}\n')
    s.git('add', '-f', '--', 'tracy-changed.json')
    s.git('-c', 'user.name=Agent', '-c', 'user.email=agent@tracy.ai', 'commit', '-q', '-m', 'agent: Ok')
    const exclude = join(s.repo, 'info', 'exclude')
    writeFileSync(exclude, readFileSync(exclude, 'utf8').replace('/tracy-changed.json\n', ''))
    s.run('--op', 'history')
    const subject = s.git('log', '-1', '--format=%s').trim()
    assert.equal(subject, 'outside Tracy: housekeeping, internal files taken out of the history')
    assert.ok(!s.git('ls-files').includes('tracy-changed.json'))
  } finally {
    s.dispose()
  }
})

test("the first backup's file count (the whole baseline) is read once and kept beside the repo", () => {
  const s = stack()
  try {
    const built = s.run('--op', 'ensure')
    const v1 = () => s.run('--op', 'history').rows.find((r) => r.kind === 'backup' && r.version === 1)
    assert.equal(v1().files, 3)
    const record = join(s.repo, 'tracy-tree-files', built.baseline)
    assert.equal(readFileSync(record, 'utf8'), '3')
    // Read from the record from now on; an unreadable record is counted again.
    writeFileSync(record, 'garbage')
    assert.equal(v1().files, 3)
    assert.equal(readFileSync(record, 'utf8'), '3')
  } finally {
    s.dispose()
  }
})
