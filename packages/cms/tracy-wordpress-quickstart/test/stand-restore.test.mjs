import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  canonicalWebroot,
  methodConfigLayout,
  methodPackManifest,
  methodParityArgs,
  methodRestoreArgs,
  restoreRunners,
  restoreVolume,
  standEnv
} from '../scripts/stand.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const METHOD_RESTORE = path.resolve(
  HERE,
  '../../../../vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/scripts/quickstart/restore.mjs'
)
const {
  archiveConfig,
  configFormProblems,
  listArchive,
  manifestProblems,
  readPack,
  renderQuickstartConfig,
  unsafeMembers
} = await import(path.join(path.dirname(METHOD_RESTORE), 'lib.mjs'))
// A wp-config.php in the method's accepted form, rendered as pack.mjs renders one.
const acceptedConfig = () =>
  renderQuickstartConfig(
    readFileSync(
      path.join(path.dirname(METHOD_RESTORE), '../../assets/quickstart/wp-config-docker.php'),
      'utf8'
    )
  ).source
// tracy-business/wp7 1.3.8's layout: no blank line before the marker the fleet anchors on.
const markerUnspaced = (text) => text.replace(/\n\n(\/\* That's all, stop editing)/, '\n$1')

// restore-release.mjs passed `--into <host dir>` long after the vendored restore.mjs dropped it for
// `--root-runner`; every restore then ended in a usage error (exit 2) before reading the pack.
test('the vendored restore.mjs accepts the arguments restore-release.mjs gives it', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wpq-restore-'))
  try {
    const marker = path.join(dir, 'runner-called')
    const args = methodRestoreArgs({
      project: 'wpq-test',
      pack: path.join(dir, 'pack'),
      siteUrl: 'http://127.0.0.1:8291',
      report: path.join(dir, 'restore.json')
    })
    // The runners are swapped for ones that leave a marker: an empty pack must stop restore at
    // readPack, after the arguments are accepted and before any runner is called.
    const swap = {
      [restoreRunners('wpq-test').root]: `touch ${marker};`,
      [restoreRunners('wpq-test').wp]: `touch ${marker};`
    }
    const r = spawnSync(process.execPath, [METHOD_RESTORE, ...args.map((a) => swap[a] ?? a)], {
      encoding: 'utf8',
      env: { ...process.env, STAND_DB_PASSWORD: 'x' }
    })
    assert.doesNotMatch(r.stderr, /usage error/, r.stderr)
    assert.equal(r.status, 1, r.stderr)
    assert.equal(existsSync(marker), false, 'a runner ran before the pack was read')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('both restore runners work on the same volume, the wp one as www-data through the stand', () => {
  const { root, wp } = restoreRunners('tracy-business-wp7-stand')
  const mount = `-v ${restoreVolume('tracy-business-wp7-stand')}:/var/www/html`
  assert.match(root, /^docker run --rm -i --user 0:0 /)
  assert.ok(root.includes(mount))
  assert.match(wp, / -p tracy-business-wp7-stand -f .*stand-compose\.yml run --rm -T /)
  assert.ok(wp.endsWith(`${mount} cli`))
})

// Published release manifests (tracy-business/wp7 1.3.8) name the archives under `parts`; the
// method's readPack refused every one with "manifest.json names no webroot archive".
test('a published manifest with its archives under parts becomes one the method accepts', () => {
  const part = (file) => ({ file, bytes: 1, sha256: 'a'.repeat(64) })
  const released = {
    schemaVersion: 'tracy-quickstart/v1',
    id: 'tracy-business/wp7',
    version: '1.3.8',
    platform: 'wordpress',
    wpVersion: '7.1.3',
    theme: { name: 'wp-tracy-business' },
    parts: {
      webroot: part('tracy-business-wp7-webroot-1.3.8.tar.gz'),
      database: part('tracy-business-wp7-database-1.3.8.sql.gz')
    }
  }
  assert.notDeepEqual(manifestProblems(released), [])
  const manifest = methodPackManifest(released)
  assert.deepEqual(manifestProblems(manifest), [])
  assert.deepEqual(manifest.parts, released.parts)
  const flat = { ...released, webroot: released.parts.webroot, database: released.parts.database }
  assert.equal(methodPackManifest(flat), flat)
  assert.throws(
    () => methodPackManifest({ ...released, parts: {} }),
    /neither at the top level nor under parts/
  )
})

// pack-and-verify.mjs gave verify-parity.mjs no root runner, pack or restore report: its access
// check, which proves the restored stand is readable the way the fleet reads it, never ran.
test('verify-parity.mjs accepts the arguments pack-and-verify.mjs gives it and runs the access probe', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wpq-parity-'))
  try {
    const routes = path.join(dir, 'routes.json')
    writeFileSync(routes, '["/"]')
    const report = path.join(dir, 'parity.json')
    const args = methodParityArgs({
      a: { project: 'wpq-a', env: standEnv({ stand: dir, port: 9 }), siteUrl: 'http://127.0.0.1:9' },
      b: {
        project: 'wpq-b',
        env: standEnv({ stand: dir, port: 9, served: 'restore' }),
        siteUrl: 'http://127.0.0.1:9'
      },
      routes,
      pack: path.join(dir, 'pack'),
      restoreReport: path.join(dir, 'restore.json'),
      report,
      skipStyles: true
    })
    assert.ok(
      args.some((a) => a.includes("STAND_WEBROOT='restore'")),
      'the b runner does not serve the restore volume'
    )
    // No stand runs here: every runner is `false`, and both sites refuse the connection.
    const runner = (a) => (/^(docker|env) /.test(a) ? 'false' : a)
    const r = spawnSync(
      process.execPath,
      [path.join(path.dirname(METHOD_RESTORE), 'verify-parity.mjs'), ...args.map(runner)],
      {
        encoding: 'utf8',
        timeout: 60000
      }
    )
    assert.doesNotMatch(r.stderr, /usage/i, r.stderr)
    assert.equal(r.status, 1, r.stderr)
    const access = JSON.stringify(JSON.parse(readFileSync(report, 'utf8')))
    assert.doesNotMatch(access, /access probe did not run/)
    assert.match(access, /root runner cannot write the access probe/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// tracy-dev quickstart packs with `tar -C <webroot> .`: tracy-business/wp7 1.3.8 names all 7893
// members `./<path>`, owned 501:20, and the method's restore refused every name as "not a canonical
// relative path"; past the names, it refused the owner ("not root — the fleet's files are root-owned").
test('a webroot archive packed as ./<path> by its author gets canonical names and root owners, every other member field kept', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wpq-canonical-'))
  try {
    const web = path.join(dir, 'web')
    mkdirSync(path.join(web, 'wp-content/themes/t'), { recursive: true })
    writeFileSync(path.join(web, 'index.php'), '<?php // index')
    writeFileSync(path.join(web, 'wp-content/themes/t/style.css'), '/* t */')
    writeFileSync(path.join(web, 'run.sh'), '#!/bin/sh')
    writeFileSync(path.join(web, 'wp-config.php'), acceptedConfig())
    chmodSync(path.join(web, 'run.sh'), 0o755)
    const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
    const makePack = (name, tarArgs) => {
      const pack = path.join(dir, name)
      mkdirSync(pack)
      const archive = path.join(pack, 'q-webroot-1.0.0.tar.gz')
      assert.equal(spawnSync('tar', ['-czf', archive, '-C', web, ...tarArgs]).status, 0)
      writeFileSync(path.join(pack, 'q-database-1.0.0.sql.gz'), 'sql')
      const part = (file) => ({ file, sha256: sha(path.join(pack, file)) })
      const manifest = {
        schemaVersion: 'tracy-quickstart/v1',
        id: 'q/wp7',
        version: '1.0.0',
        platform: 'wordpress',
        wpVersion: '7.1.3',
        theme: { name: 't' },
        webroot: part('q-webroot-1.0.0.tar.gz'),
        database: part('q-database-1.0.0.sql.gz')
      }
      writeFileSync(path.join(pack, 'manifest.json'), JSON.stringify(manifest))
      const files = ['manifest.json', manifest.webroot.file, manifest.database.file]
      writeFileSync(
        path.join(pack, 'SHA256SUMS'),
        files.map((f) => `${sha(path.join(pack, f))}  ${f}`).join('\n') + '\n'
      )
      return { pack, archive }
    }
    const rows = (archive) =>
      listArchive(archive).map(({ name, type, mode, uid, gid, uname, gname, size }) => ({
        name,
        type,
        mode,
        uid,
        gid,
        uname,
        gname,
        size
      }))

    const dotted = makePack('dotted', ['.'])
    const before = rows(dotted.archive)
    assert.ok(
      before.every((r) => r.name === '.' || r.name.startsWith('./')),
      JSON.stringify(before)
    )
    assert.notDeepEqual(unsafeMembers(listArchive(dotted.archive)), [])
    const published = sha(dotted.archive)
    assert.deepEqual(canonicalWebroot(dotted.pack), { members: before.length, config: 0 })
    assert.deepEqual(unsafeMembers(listArchive(dotted.archive)), [])
    assert.ok(
      before.some((r) => r.uid !== 0),
      'the test archive carries the author owner'
    )
    const strip = (r) => ({
      ...r,
      name: r.name.replace(/^\.\//, ''),
      uid: 0,
      gid: 0,
      uname: 'root',
      gname: 'root'
    })
    assert.deepEqual(rows(dotted.archive), before.filter((r) => r.name !== '.' && r.name !== './').map(strip))
    const { manifest } = readPack(dotted.pack)
    assert.equal(manifest.canonicalised.webroot.sha256, published)
    assert.equal(manifest.webroot.sha256, sha(dotted.archive))
    const style = spawnSync('tar', ['-xzOf', dotted.archive, 'wp-content/themes/t/style.css'], {
      encoding: 'utf8'
    })
    assert.equal(style.stdout, '/* t */')

    // GNU tar (Linux runners) has no --uid/--gid/--uname/--gname; bsdtar (macOS) has no NAME:ID --owner.
    const gnuTar = /GNU tar/.test(spawnSync('tar', ['--version'], { encoding: 'utf8' }).stdout)
    const rootOwner = gnuTar
      ? ['--owner=root:0', '--group=root:0']
      : ['--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root']
    const plain = makePack('plain', [...rootOwner, 'index.php', 'run.sh', 'wp-config.php', 'wp-content'])
    const bytes = readFileSync(plain.archive)
    assert.equal(canonicalWebroot(plain.pack), null)
    assert.deepEqual(readFileSync(plain.archive), bytes)
    assert.equal(
      existsSync(path.join(plain.pack, 'manifest.json')) && readPack(plain.pack).manifest.canonicalised,
      undefined
    )

    const tampered = makePack('tampered', ['.'])
    writeFileSync(path.join(tampered.pack, 'q-database-1.0.0.sql.gz'), 'other')
    const kept = readFileSync(tampered.archive)
    assert.throws(() => canonicalWebroot(tampered.pack), /SHA256SUMS mismatch: q-database-1.0.0.sql.gz/)
    assert.deepEqual(readFileSync(tampered.archive), kept)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// tracy-business/wp7 1.3.8's wp-config.php is the accepted form without one blank line, and the
// method's pack.mjs refused the stand restored from it ("differs from the accepted form at line 112").
test('a wp-config.php off the accepted form only in its layout is laid out again; any other difference is refused', () => {
  const accepted = acceptedConfig()
  assert.equal(methodConfigLayout(accepted), null)
  const unspaced = markerUnspaced(accepted)
  assert.notEqual(unspaced, accepted)
  assert.notDeepEqual(configFormProblems(unspaced), [])
  const fixed = methodConfigLayout(unspaced)
  assert.equal(fixed.text, accepted)
  assert.deepEqual(configFormProblems(fixed.text), [])
  assert.equal(fixed.edits.length, 1)
  assert.match(fixed.edits[0], /blank line added/)
  // CRLF, trailing spaces and an extra blank line are layout too
  const loose = unspaced
    .replace("define( 'WP_DEBUG', false );", "define( 'WP_DEBUG', false );   \n")
    .replace(/\n/g, '\r\n')
  assert.equal(methodConfigLayout(loose).text, accepted)

  const refused = [
    unspaced.replace("define( 'WP_DEBUG', false );", "define( 'WP_DEBUG', true );"),
    unspaced.replace(/^define\( 'DB_HOST'.*\n/m, ''),
    unspaced.replace("define( 'WP_DEBUG', false );", "define( 'WP_DEBUG', false ); define( 'X', 1 );"),
    `${unspaced}\n$extra = 1;\n`
  ]
  for (const text of refused) {
    assert.notEqual(text, unspaced)
    assert.throws(() => methodConfigLayout(text), /beyond its layout/)
  }
})

test('the webroot archive gets its wp-config.php laid out as the method packs it, under the published checksums', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wpq-config-'))
  try {
    const sha = (data) => createHash('sha256').update(data).digest('hex')
    const makePack = (name, config) => {
      const web = path.join(dir, `${name}-web`)
      mkdirSync(web)
      writeFileSync(path.join(web, 'index.php'), '<?php // index')
      writeFileSync(path.join(web, 'wp-config.php'), config)
      const pack = path.join(dir, name)
      mkdirSync(pack)
      const archive = path.join(pack, 'q-webroot-1.0.0.tar.gz')
      assert.equal(spawnSync('tar', ['-czf', archive, '-C', web, '.']).status, 0)
      writeFileSync(path.join(pack, 'q-database-1.0.0.sql.gz'), 'sql')
      const part = (file) => ({ file, sha256: sha(readFileSync(path.join(pack, file))) })
      const manifest = {
        schemaVersion: 'tracy-quickstart/v1',
        id: 'q/wp7',
        version: '1.0.0',
        platform: 'wordpress',
        wpVersion: '7.1.3',
        theme: { name: 't' },
        webroot: part('q-webroot-1.0.0.tar.gz'),
        database: part('q-database-1.0.0.sql.gz')
      }
      writeFileSync(path.join(pack, 'manifest.json'), JSON.stringify(manifest))
      const files = ['manifest.json', manifest.webroot.file, manifest.database.file]
      writeFileSync(
        path.join(pack, 'SHA256SUMS'),
        files.map((f) => `${sha(readFileSync(path.join(pack, f)))}  ${f}`).join('\n') + '\n'
      )
      return { pack, archive }
    }
    const unspaced = markerUnspaced(acceptedConfig())
    const off = makePack('off', unspaced)
    const result = canonicalWebroot(off.pack)
    assert.equal(result.config, 1)
    const found = archiveConfig(listArchive(off.archive, { read: ['wp-config.php'] }), 'archive')
    assert.deepEqual(found.problems, [])
    assert.equal(found.text, methodConfigLayout(unspaced).text)
    const { manifest } = readPack(off.pack)
    assert.equal(manifest.canonicalised.config.sha256, sha(unspaced))
    assert.equal(manifest.canonicalised.config.edits.length, 1)
    assert.equal(
      spawnSync('tar', ['-xzOf', off.archive, 'index.php'], { encoding: 'utf8' }).stdout,
      '<?php // index'
    )

    const wrong = makePack(
      'wrong',
      unspaced.replace("define( 'WP_DEBUG', false );", "define( 'WP_DEBUG', true );")
    )
    const kept = readFileSync(wrong.archive)
    assert.throws(() => canonicalWebroot(wrong.pack), /beyond its layout/)
    assert.deepEqual(readFileSync(wrong.archive), kept)
    assert.deepEqual(readdirSync(wrong.pack).sort(), [
      'SHA256SUMS',
      'manifest.json',
      'q-database-1.0.0.sql.gz',
      'q-webroot-1.0.0.tar.gz'
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The bridge replaces the manifest's webroot hash and size and drops one member, so whatever it
// refuses must be refused before anything changes: a pack restore would refuse, or a member the
// method's pack never writes.
const refusalPack = (dir) => {
  const sha = (data) => createHash('sha256').update(data).digest('hex')
  // members: [name, {type, data, mode, uid}] written as tracy-dev writes them (author owner 501:20)
  const makePack = (name, members, edit = (m) => m) => {
    const pack = path.join(dir, name)
    mkdirSync(pack)
    const archive = path.join(pack, 'q-webroot-1.0.0.tar.gz')
    const py = `
import io, json, sys, tarfile
with tarfile.open(sys.argv[1], 'w:gz', format=tarfile.PAX_FORMAT) as t:
  for name, m in json.load(sys.stdin):
      i = tarfile.TarInfo(name)
      i.uid, i.gid, i.uname, i.gname = m.get('uid', 501), 20, 'author', 'staff'
      i.mode = int(m.get('mode', '755' if m['type'] == 'dir' else '644'), 8)
      if m['type'] == 'dir':
          i.type = tarfile.DIRTYPE
          t.addfile(i)
      else:
          data = m['data'].encode()
          i.size = len(data)
          t.addfile(i, io.BytesIO(data))
`
    const r = spawnSync('python3', ['-c', py, archive], { input: JSON.stringify(members), encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    writeFileSync(path.join(pack, 'q-database-1.0.0.sql.gz'), 'sql')
    const part = (file) => ({
      file,
      sha256: sha(readFileSync(path.join(pack, file))),
      bytes: readFileSync(path.join(pack, file)).length
    })
    const manifest = edit({
      schemaVersion: 'tracy-quickstart/v1',
      id: 'q/wp7',
      version: '1.0.0',
      platform: 'wordpress',
      wpVersion: '7.1.3',
      theme: { name: 't' },
      webroot: part('q-webroot-1.0.0.tar.gz'),
      database: part('q-database-1.0.0.sql.gz')
    })
    writeFileSync(path.join(pack, 'manifest.json'), JSON.stringify(manifest))
    const files = ['manifest.json', manifest.webroot.file, manifest.database.file]
    writeFileSync(
      path.join(pack, 'SHA256SUMS'),
      files.map((f) => `${sha(readFileSync(path.join(pack, f)))}  ${f}`).join('\n') + '\n'
    )
    return { pack, archive }
  }
  const config = acceptedConfig()
  const site = [
    ['./', { type: 'dir' }],
    ['./index.php', { type: 'file', data: '<?php // index' }],
    ['./wp-config.php', { type: 'file', data: config }]
  ]
  const refuses = (pack, pattern) => {
    const files = readdirSync(pack.pack).sort()
    const bytes = Object.fromEntries(files.map((f) => [f, readFileSync(path.join(pack.pack, f))]))
    assert.throws(() => canonicalWebroot(pack.pack), pattern)
    assert.deepEqual(readdirSync(pack.pack).sort(), files)
    for (const f of files) assert.deepEqual(readFileSync(path.join(pack.pack, f)), bytes[f], f)
  }

  return { makePack, refuses, sha, site }
}
const withDir = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wpq-refuse-'))
  try {
    fn(refusalPack(dir))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('the bridge refuses a manifest whose webroot hash or size is not the archive SHA256SUMS lists', () =>
  withDir(({ makePack, refuses, sha, site }) => {
    assert.deepEqual(canonicalWebroot(makePack('ok', site).pack), { members: 3, config: 0 })
    const wrongSha = makePack('wrong-sha', site, (m) => ({
      ...m,
      webroot: { ...m.webroot, sha256: sha('other') }
    }))
    assert.throws(() => readPack(wrongSha.pack), /manifest.json says q-webroot-1.0.0.tar.gz is/)
    refuses(wrongSha, /manifest.json says q-webroot-1.0.0.tar.gz is/)
    const wrongBytes = makePack('wrong-bytes', site, (m) => ({
      ...m,
      webroot: { ...m.webroot, bytes: m.webroot.bytes + 1 }
    }))
    refuses(wrongBytes, /manifest.json says q-webroot-1.0.0.tar.gz is \d+ bytes, it is \d+/)
  }))

test('the bridge drops only a `./` directory entry; a `.` or `./` that is anything else is refused', () =>
  withDir(({ makePack, refuses, site }) => {
    refuses(
      makePack('dot-file', [['.', { type: 'file', data: '17 bytes of data.' }], ...site.slice(1)]),
      /member '\.' is a file, not the webroot directory/
    )
    refuses(
      makePack('dot-slash-file', [['./', { type: 'file', data: 'x' }], ...site.slice(1)]),
      /member '\.\/' is a file/
    )
  }))

test('the bridge refuses a setuid member it would make root-owned', () =>
  withDir(({ makePack, refuses, site }) => {
    const setuid = makePack('setuid', [...site, ['./run', { type: 'file', data: '#!/bin/sh', mode: '4755' }]])
    refuses(setuid, /member '\.\/run' is setuid\/setgid \(mode 4755\) and owned by 501:20/)
  }))

// `./index.php` and `index.php` in one archive become one name once `./` is taken off.
test('the bridge refuses an archive where taking ./ off makes one name twice', () =>
  withDir(({ makePack, refuses, site }) => {
    refuses(
      makePack('twice', [...site, ['index.php', { type: 'file', data: '<?php // other' }]]),
      /duplicate index\.php/
    )
  }))
