/**
 * The `installer` install shape — the road the 79 older `quickstart/ja-*` releases take
 * (tasks/todo-design-inspiration-card-ops.md §80+ quickstart JA).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/installer-quickstart.test.mjs
 *
 * One of those releases is neither of the shapes the fleet knew: it is a classic Joomla quickstart
 * package — a complete webroot PLUS Joomla's own `installation/` folder — with no .jpa inside and
 * no database dump beside it. So the site is not restored, it is BUILT, by running
 * `php installation/joomla.php install` against the stack's MariaDB. Measured 16/09 on `ja-space`:
 * that CLI loads `installation/sql/mysql/custom.sql`, which is JA's demo content, so the finished
 * site is the demo (23 articles, 57 menu items, `ja_space` the default style).
 *
 * Checked the two ways the other quickstart tests established: `quickstart.py` is RUN, because its
 * refusals are the ones that land on a fleet host; and `platform/joomla.sh` is parsed with `bash -n`
 * and read as text for the properties a reviewer would otherwise have to hold in their head.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))

/**
 * Run quickstart.py against a catalog written for this test, never the shipped one. The package is
 * served through a `file:` address, which quickstart.py reads only from under
 * TRACY_LOCAL_RELEASES_DIR — so the catalog's own directory is named as that directory.
 */
const py = (catalog, ...args) =>
  spawnSync('python3', [`${PROVISION}quickstart.py`, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TRACY_QUICKSTARTS_JSON: catalog,
      TRACY_RELEASES_GITHUB_TOKEN: '',
      TRACY_LOCAL_RELEASES_DIR: dirname(catalog)
    }
  })

/**
 * A quickstart package on disk, served to quickstart.py through a `file:` URL so the download,
 * the size cap, the sha256 and the zip inspection all run for real.
 * @param {string[]} entries `zip` arguments: paths to create inside the package
 */
function packageZip(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'installer-quickstart-'))
  for (const entry of entries) {
    const at = entry.includes('/') ? entry.replace(/\/[^/]*$/, '') : ''
    spawnSync('mkdir', ['-p', join(dir, 'tree', at)])
    writeFileSync(join(dir, 'tree', entry), `x ${entry}\n`)
  }
  const zip = join(dir, 'package.zip')
  assert.equal(spawnSync('zip', ['-q', '-r', zip, '.'], { cwd: join(dir, 'tree') }).status, 0)
  const bytes = readFileSync(zip)
  return { dir, zip, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}

function catalogWith(dir, entry) {
  const file = join(dir, 'quickstarts.json')
  writeFileSync(file, JSON.stringify({ 'quickstart/ja-space/j6': { platform: 'joomla', ...entry } }))
  return file
}

test('--part installer downloads the package and holds it to the pinned size and sha256', () => {
  const pack = packageZip(['index.php', 'installation/joomla.php', 'installation/sql/mysql/custom.sql'])
  const catalog = catalogWith(pack.dir, {
    installer: {
      file: 'ja-space-j6-quickstart.zip',
      url: `file://${pack.zip}`,
      bytes: pack.bytes,
      sha256: pack.sha256
    }
  })
  const out = join(pack.dir, 'downloaded.zip')
  const ok = py(catalog, '--id', 'quickstart/ja-space/j6', '--part', 'installer', '--out', out)
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(readFileSync(out).length, pack.bytes)

  const wrong = catalogWith(pack.dir, {
    installer: {
      file: 'ja-space-j6-quickstart.zip',
      url: `file://${pack.zip}`,
      bytes: pack.bytes,
      sha256: 'a'.repeat(64)
    }
  })
  const bad = py(wrong, '--id', 'quickstart/ja-space/j6', '--part', 'installer', '--out', out)
  assert.notEqual(bad.status, 0)
  assert.match(bad.stderr, /checksum mismatch/)
})

test('a package with no installation/joomla.php is refused here, not on the host', () => {
  // The whole shape rests on that one file: `platform/joomla.sh` runs it to build the site. A zip
  // without it is a webroot nobody can install, and finding that out half way through a customer's
  // provision is the failure this refusal exists to move forward in time.
  const pack = packageZip(['index.php', 'configuration.php'])
  const catalog = catalogWith(pack.dir, {
    installer: { file: 'x.zip', url: `file://${pack.zip}`, bytes: pack.bytes, sha256: pack.sha256 }
  })
  const out = py(
    catalog,
    '--id',
    'quickstart/ja-space/j6',
    '--part',
    'installer',
    '--out',
    join(pack.dir, 'o.zip')
  )
  assert.notEqual(out.status, 0)
  assert.match(out.stderr, /installation\/joomla\.php/)
})

test('an unpinned installer is refused before the network, like every other part', () => {
  const dir = mkdtempSync(join(tmpdir(), 'installer-quickstart-'))
  const catalog = catalogWith(dir, {
    installer: { file: 'x.zip', pending: 'release not cut yet', url: 'https://example.test/x.zip' }
  })
  const out = py(
    catalog,
    '--id',
    'quickstart/ja-space/j6',
    '--part',
    'installer',
    '--out',
    join(dir, 'o.zip')
  )
  assert.notEqual(out.status, 0)
  assert.match(out.stderr, /is not pinned yet \(release not cut yet\)/)
})

test('asking an installer release for a webroot or a database says which road it is on', () => {
  // Not "webroot is missing": a caller asking for one has taken the wrong road entirely, and the
  // generic sentence reads like a broken release rather than like a shape it does not have.
  const dir = mkdtempSync(join(tmpdir(), 'installer-quickstart-'))
  const catalog = catalogWith(dir, {
    installer: { file: 'x.zip', url: 'https://example.test/x.zip', bytes: 10, sha256: 'b'.repeat(64) }
  })
  for (const part of ['webroot', 'database']) {
    const out = py(catalog, '--id', 'quickstart/ja-space/j6', '--part', part, '--out', join(dir, 'o'))
    assert.notEqual(out.status, 0, `${part} must refuse`)
    assert.match(out.stderr, /--part installer/)
  }
})
