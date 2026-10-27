/**
 * The directories the live side's walker skips but an extension needs to exist come back on the copy,
 * empty (`lib/webroot-skipped-dirs.sh`, #1650): Akeeba Backup's output folder, after an import
 * (provision.sh `own_webroot`) and after a Sync from live apply (webroot-sync.sh `after_apply`).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/webroot-skipped-dirs.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', 'scripts')
const LIB = join(scripts, 'lib', 'webroot-skipped-dirs.sh')
const AKEEBA = 'administrator/components/com_akeebabackup'
const AKEEBA_7 = 'administrator/components/com_akeeba'

const restore = (webroot) =>
  spawnSync('bash', ['-c', '. "$1"; tracy_webroot_restore_skipped_dirs "$2"', 'x', LIB, webroot], {
    encoding: 'utf8'
  })

const withWebroot = (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'skipped-dirs-'))
  try {
    const webroot = join(root, 'webroot')
    mkdirSync(webroot)
    fn(webroot, root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test("Akeeba's output folder is made, empty but for the files that keep it from being served", () =>
  withWebroot((webroot) => {
    mkdirSync(join(webroot, AKEEBA), { recursive: true })
    const r = restore(webroot)
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(r.stdout.split('\0').filter(Boolean), [
      `${AKEEBA}/backup`,
      `${AKEEBA}/backup/.htaccess`,
      `${AKEEBA}/backup/index.html`
    ])
    assert.deepEqual(readdirSync(join(webroot, AKEEBA, 'backup')).sort(), ['.htaccess', 'index.html'])
    assert.match(readFileSync(join(webroot, AKEEBA, 'backup', '.htaccess'), 'utf8'), /Require all denied/)
    // Akeeba 7.x is not installed here: no component folder appears for it.
    assert.equal(existsSync(join(webroot, AKEEBA_7)), false)
  }))

test('both component names: com_akeeba (7.x) gets its folder too', () =>
  withWebroot((webroot) => {
    mkdirSync(join(webroot, AKEEBA_7), { recursive: true })
    assert.equal(restore(webroot).status, 0)
    assert.ok(existsSync(join(webroot, AKEEBA_7, 'backup', '.htaccess')))
    assert.equal(existsSync(join(webroot, AKEEBA)), false)
  }))

test('a site without Akeeba, or one whose folder already holds its guard files, is left as it is', () =>
  withWebroot((webroot) => {
    let r = restore(webroot)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
    assert.deepEqual(readdirSync(webroot), [])

    // Akeeba's own files are never replaced, and nothing is given away again.
    const backup = join(webroot, AKEEBA, 'backup')
    mkdirSync(backup, { recursive: true })
    writeFileSync(join(backup, 'site.jpa'), 'x')
    writeFileSync(join(backup, '.htaccess'), 'akeeba')
    writeFileSync(join(backup, 'index.html'), 'akeeba')
    r = restore(webroot)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
    assert.deepEqual(readdirSync(backup).sort(), ['.htaccess', 'index.html', 'site.jpa'])
    assert.equal(readFileSync(join(backup, '.htaccess'), 'utf8'), 'akeeba')
    assert.equal(readFileSync(join(backup, 'index.html'), 'utf8'), 'akeeba')
  }))

// An earlier run that died after its `mkdir` left the folder without the files that keep archives
// from being served: a later run writes the ones missing, and prints only those.
test('a folder made half-way gets the guard files it lacks, and only those are printed', () =>
  withWebroot((webroot) => {
    const backup = join(webroot, AKEEBA, 'backup')
    mkdirSync(backup, { recursive: true })
    let r = restore(webroot)
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(r.stdout.split('\0').filter(Boolean), [
      `${AKEEBA}/backup/.htaccess`,
      `${AKEEBA}/backup/index.html`
    ])
    assert.match(readFileSync(join(backup, '.htaccess'), 'utf8'), /Require all denied/)

    rmSync(join(backup, 'index.html'))
    writeFileSync(join(backup, '.htaccess'), 'akeeba')
    r = restore(webroot)
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(r.stdout.split('\0').filter(Boolean), [`${AKEEBA}/backup/index.html`])
    assert.equal(readFileSync(join(backup, '.htaccess'), 'utf8'), 'akeeba')
  }))

test('a guard file or an output folder that is a link is not written through', () =>
  withWebroot((webroot, root) => {
    const outside = join(root, 'outside')
    mkdirSync(outside)
    const backup = join(webroot, AKEEBA, 'backup')
    mkdirSync(backup, { recursive: true })
    symlinkSync(join(outside, 'htaccess'), join(backup, '.htaccess'))
    let r = restore(webroot)
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(r.stdout.split('\0').filter(Boolean), [`${AKEEBA}/backup/index.html`])
    assert.deepEqual(readdirSync(outside), [])

    rmSync(backup, { recursive: true })
    symlinkSync(outside, backup)
    r = restore(webroot)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
    assert.deepEqual(readdirSync(outside), [])
  }))

test('a component folder that is a symlink out of the webroot is not written through', () =>
  withWebroot((webroot, root) => {
    const outside = join(root, 'outside')
    mkdirSync(outside)
    mkdirSync(join(webroot, 'administrator', 'components'), { recursive: true })
    symlinkSync(outside, join(webroot, AKEEBA))
    const r = restore(webroot)
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(readdirSync(outside), [])
  }))

test('a link anywhere on the way out of the webroot is not written through, not only the component folder', () => {
  for (const link of ['administrator', 'administrator/components'])
    withWebroot((webroot, root) => {
      // The outside tree holds Akeeba as the webroot would, so only the link check can stop it.
      const outside = join(root, 'outside')
      const rest = AKEEBA.slice(link.length + 1)
      mkdirSync(join(outside, rest), { recursive: true })
      mkdirSync(join(webroot, dirname(link)), { recursive: true })
      symlinkSync(outside, join(webroot, link))
      const r = restore(webroot)
      assert.equal(r.status, 0, r.stderr)
      assert.equal(r.stdout, '', link)
      assert.deepEqual(readdirSync(join(outside, rest)), [], `written through ${link}`)
    })
})

test('the owner step refuses a printed path that leads out of the webroot through a link', () =>
  withWebroot((webroot, root) => {
    const outside = join(root, 'outside')
    mkdirSync(join(outside, 'com_akeebabackup', 'backup'), { recursive: true })
    mkdirSync(join(webroot, 'administrator'))
    symlinkSync(outside, join(webroot, 'administrator', 'components'))
    const given = join(root, 'given')
    // `tracy_webroot_owner` and `chown` stubbed: the test records what would be given away.
    mkdirSync(join(root, 'bin'))
    writeFileSync(join(root, 'bin', 'chown'), `#!/bin/sh\nshift 2\nprintf '%s\\n' "$@" >> '${given}'\n`, {
      mode: 0o755
    })
    const r = spawnSync(
      'bash',
      [
        '-c',
        '. "$1"; tracy_webroot_owner() { echo nobody; }; PATH="$3:$PATH"; ' +
          'printf "%s\\0" "$4/backup" "$4/backup/.htaccess" administrator | tracy_webroot_own "$2"',
        'x',
        join(scripts, 'lib', 'webroot-repo-git.sh'),
        webroot,
        join(root, 'bin'),
        AKEEBA
      ],
      { encoding: 'utf8' }
    )
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stderr, /outside the webroot: administrator\/components\/com_akeebabackup\/backup/)
    assert.deepEqual(existsSync(given) ? readFileSync(given, 'utf8').split('\n').filter(Boolean) : [], [
      './administrator'
    ])
  }))

test('the folders it makes stay out of the webroot history, as the walker keeps them out of the import', () => {
  const rules = spawnSync('bash', ['-c', '. "$1"; tracy_webroot_skipped_dir_rules', 'x', LIB], {
    encoding: 'utf8'
  })
  const excludes = spawnSync(
    'bash',
    ['-c', '. "$1"; tracy_webroot_exclude_rules', 'x', join(scripts, 'lib', 'webroot-excludes.sh')],
    { encoding: 'utf8' }
  )
  assert.equal(excludes.status, 0, excludes.stderr)
  const dirs = rules.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split(' ')[0])
  assert.equal(dirs.length, 2)
  for (const d of dirs)
    assert.ok(excludes.stdout.split('\n').includes(`/${d}/`), `${d} is not in info/exclude`)
})

test('an import makes them before the webroot is given to the web user, and a Sync from live apply too', () => {
  const provision = readFileSync(join(scripts, 'provision', 'provision.sh'), 'utf8')
  const own = provision.slice(provision.indexOf('own_webroot() {'), provision.indexOf('\nown_webroot\n'))
  const made = own.indexOf('tracy_webroot_restore_skipped_dirs')
  assert.ok(made > 0, 'own_webroot does not make the skipped folders')
  assert.ok(made < own.indexOf('chown -R www-data:www-data'), 'the skipped folders are made after the chown')
  assert.match(provision, /^\. "\$HERE\/\.\.\/lib\/webroot-skipped-dirs\.sh"$/m)

  const sync = readFileSync(join(scripts, 'webroot', 'webroot-sync.sh'), 'utf8')
  const after = sync.slice(
    sync.indexOf('after_apply() {'),
    sync.indexOf('\n}\n', sync.indexOf('after_apply() {'))
  )
  assert.match(after, /tracy_webroot_restore_skipped_dirs "\$WEBROOT" \| tracy_webroot_own "\$WEBROOT"/)
  assert.match(sync, /^\. "\$LIB_DIR\/webroot-skipped-dirs\.sh"$/m)
})
