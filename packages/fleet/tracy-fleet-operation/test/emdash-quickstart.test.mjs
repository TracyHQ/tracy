/**
 * The EmDash quickstart road through provision — what must hold for `tracy-business/emdash` to
 * reach a customer through the same door Joomla uses (tasks/todo-emdash-quickstart-catalog.md §C).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-quickstart.test.mjs
 *
 * There is no bats harness for the provision scripts here, so the shell is checked the two ways the
 * WordPress quickstart test established: `quickstart.py` is RUN, because its answers are what the
 * gate and the image name stand on; the shell files are parsed with `bash -n` and read as text for
 * the properties a reviewer would otherwise have to hold in their head:
 *
 *   - an EmDash quickstart does NOT get the PHP restore keys. It has no webroot tar and no MariaDB
 *     dump; setting `WEBROOT_KEY=quickstart:webroot` for it would send the provision looking for an
 *     archive that does not exist in the release, and the failure would name the wrong thing;
 *   - the unpack-and-build and the restore-once steps exist ONCE and both roads call them, so a fix
 *     to either cannot be applied to the demo host and forgotten on the customer's;
 *   - an entry whose sha256 is not pinned is refused BEFORE any network — the guard the WordPress
 *     road added, now also covering the two parts only EmDash has.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))
const read = (name) => readFileSync(`${PROVISION}${name}`, 'utf8')
const py = (...args) =>
  spawnSync('python3', [`${PROVISION}quickstart.py`, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TRACY_RELEASES_GITHUB_TOKEN: '' }
  })
const bashOk = (file) => spawnSync('bash', ['-n', `${PROVISION}${file}`], { encoding: 'utf8' })

const catalog = JSON.parse(read('quickstarts.json'))

test('the EmDash entry is a pinned PAIR of its own two parts, and names the template it installs', () => {
  const entry = catalog['tracy-business/emdash']
  assert.ok(entry, 'tracy-business/emdash is missing from the catalog')
  assert.equal(entry.platform, 'emdash')
  assert.equal(entry.template.id, 'tracy-business')
  for (const part of ['source', 'state']) {
    const a = entry[part]
    assert.ok(a, `the entry has no ${part}`)
    assert.match(a.sha256, /^[0-9a-f]{64}$/, `${part} is not pinned by sha256`)
    assert.ok(Number.isInteger(a.bytes) && a.bytes > 0, `${part} has no size`)
    assert.ok(a.url.startsWith('https://github.com/JoomlArt-Products/joomlart-products/releases/'), `${part} url`)
  }
  assert.equal(entry.webroot, undefined, 'an EmDash quickstart restores no webroot tar')
  assert.equal(entry.database, undefined, 'nor a MariaDB dump')
  assert.equal(entry.cowork, undefined, 'and EmDash has no Cowork extension to pin')
})

test('the catalog answers which platform and which template, so the shell lists neither', () => {
  assert.equal(py('--id', 'tracy-business/emdash', '--platform').stdout.trim(), 'emdash')
  assert.equal(py('--id', 'tracy-apple/j6', '--platform').stdout.trim(), 'joomla')
  assert.equal(py('--id', 'tracy-business/emdash', '--field', 'template.id').stdout.trim(), 'tracy-business')
  // Read the expected version from the catalog, not from a literal: a re-pin is a normal event
  // (1.0.0 -> 1.1.0 on 22/09 when the re-cut deleted the old assets), and what this asserts is
  // that the CLI answers the field the catalog holds, not which release is current today.
  assert.match(catalog['tracy-business/emdash'].version, /^\d+\.\d+\.\d+$/)
  assert.equal(
    py('--id', 'tracy-business/emdash', '--field', 'version').stdout.trim(),
    catalog['tracy-business/emdash'].version
  )
  const noTemplate = py('--id', 'tracy-apple/j6', '--field', 'template.id')
  assert.notEqual(noTemplate.status, 0)
  assert.match(noTemplate.stderr, /has no template\.id/)
})

test('an unpinned part is refused before the network, naming the part', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emdash-quickstart-'))
  const file = join(dir, 'quickstarts.json')
  writeFileSync(
    file,
    JSON.stringify({
      'tracy-next/emdash': {
        platform: 'emdash',
        version: '2.0.0',
        template: { id: 'tracy-next' },
        source: { file: 's.zip', pending: 'release not cut yet', url: 'https://example.test/s.zip' },
        state: { file: 'st.tar.gz', pending: 'release not cut yet', url: 'https://example.test/st.tar.gz' }
      }
    })
  )
  for (const part of ['source', 'state']) {
    const out = spawnSync(
      'python3',
      [`${PROVISION}quickstart.py`, '--id', 'tracy-next/emdash', '--part', part, '--out', join(dir, part)],
      { encoding: 'utf8', env: { ...process.env, TRACY_QUICKSTARTS_JSON: file } }
    )
    assert.notEqual(out.status, 0, `${part} must refuse`)
    assert.match(out.stderr, /is not pinned yet \(release not cut yet\)/)
  }
})

test('provision asks the catalog for the platform, and gives an EmDash quickstart no PHP restore keys', () => {
  assert.equal(bashOk('provision.sh').status, 0)
  const sh = read('provision.sh')
  assert.match(
    sh,
    /quickstart\.py" --id "\$QUICKSTART" --platform/,
    'the gate reads the platform from the catalog'
  )
  assert.equal(
    /\[ "\$PLATFORM" = joomla \] && \{ \[ "\$QUICKSTART" = 'tracy-apple\/j6' \]/.test(sh),
    false,
    'the id list in shell is gone — it had to be edited for every new archive'
  )
  assert.match(
    sh,
    /if \[ -n "\$QUICKSTART" \] && \[ "\$PLATFORM" != emdash \]; then\n {2}# Use the same restore[\s\S]*?WEBROOT_KEY=quickstart:webroot/,
    'the webroot/database keys are set only for platforms that restore a captured site'
  )
})

test('both roads into a site call the same unpack-and-build and restore-once steps', () => {
  for (const file of ['emdash/quickstart-restore.sh', 'emdash/deploy-quickstart.sh', 'platform/emdash.sh']) {
    assert.equal(bashOk(file).status, 0, `${file} does not parse`)
  }
  const shared = read('emdash/quickstart-restore.sh')
  assert.match(shared, /emdash_build_image\(\)/)
  assert.match(shared, /emdash_restore_state\(\)/)
  assert.match(shared, /data\/data\.db/, 'restore-once is decided by the database being there already')
  for (const caller of ['emdash/deploy-quickstart.sh', 'platform/emdash.sh']) {
    const text = read(caller)
    assert.match(text, /quickstart-restore\.sh/, `${caller} does not source the shared steps`)
    assert.match(text, /emdash_build_image /, `${caller} builds the image its own way`)
    assert.match(text, /emdash_restore_state /, `${caller} restores state its own way`)
  }
})

test('the platform file names the image after the template and version, never a moving tag', () => {
  const sh = read('platform/emdash.sh')
  assert.match(sh, /WEB_IMAGE="tracy\/\$_q_template-emdash:\$_q_version"/)
  assert.match(sh, /--part source/)
  assert.match(sh, /--part state/)
  assert.match(
    sh,
    /if docker image inspect "\$WEB_IMAGE"[\s\S]*?else[\s\S]*?--part source[\s\S]*?emdash_build_image/,
    'the fetch and the build sit INSIDE the image-missing branch — a re-provision of a correct site downloads nothing, and calling the build with no zip beside it is what broke the second run on 15/09'
  )
  assert.match(
    sh,
    /if \[ -z "\$\{QUICKSTART:-\}" \] && \[ -z "\$\{_emdash_from_site:-\}" \]; then\n {2}WEB_IMAGE="\$\(tracy_emdash_web_image/,
    "the upstream web-image derivation only knows tracy/emdash tags, so a quickstart image — and a running site's own image — skips it"
  )
  assert.match(
    sh,
    /_emdash_ver="\$\(_emdash_local_image \|\| true\)"/,
    'a host with no tracy/emdash image must not end the sourcing script silently under set -e (every EmDash go-live on dev, 16/09)'
  )
  assert.match(
    sh,
    /elif \[ -n "\$_emdash_site_image" \]; then\n {4}WEB_IMAGE="\$_emdash_site_image"/,
    'a site that already runs keeps the image in its compose when this file is sourced by go-live'
  )
})

// ── who may frame a site is DEMO-ONLY, threaded, never defaulted ────────────────────────────────
//
// 🔒 A frameable site is a clickjacking surface. Only a public demo is meant to be shown inside the
// Design inspiration preview iframe, so the frame-ancestors value must reach a site's .env ONLY on
// the demo road and never on a customer provision. The signal is threaded end to end — tracy-web's
// provisionDemo → tracy-host's --frame-ancestors → provision.sh → platform/emdash.sh's .env write —
// and the guard that keeps it demo-only is that provision.sh defaults it EMPTY and emdash.sh writes
// it only when it is non-empty. A default value anywhere in that chain would frame every EmDash
// site, silently, and nothing at the surface would say so.
test('provision.sh parses --frame-ancestors into an empty-by-default variable', () => {
  assert.equal(bashOk('provision.sh').status, 0)
  const sh = read('provision.sh')
  assert.match(sh, /^FRAME_ANCESTORS=""$/m, 'the default is empty — a customer provision frames nobody')
  assert.match(sh, /--frame-ancestors\)\s*FRAME_ANCESTORS="\$2"; shift 2/, 'the flag fills that variable')
})

/**
 * 🔒 A CUSTOMER EMDASH SITE IS AS FRAMABLE AS THE WORDPRESS SITE BESIDE IT — changed 19/09/2026.
 * Before that the write was guarded on a non-empty `FRAME_ANCESTORS`, which only the demo road
 * passes, so a customer EmDash site emitted no `frame-ancestors` at all and Tracy's preview showed
 * an empty pane for it. That was never a policy: WordPress and Joomla sit behind Apache and
 * `scripts/lib/site-apache-conf.sh` writes this header for EVERY site. EmDash runs Astro with no
 * Apache, so it needs its own copy — and only demos ever got one.
 */
test('platform/emdash.sh always writes TRACY_FRAME_ANCESTORS, defaulting to the Apache policy', () => {
  assert.equal(bashOk('platform/emdash.sh').status, 0)
  const sh = read('platform/emdash.sh')
  // Stale-cleared first, so a redeploy tracks the current origin rather than stacking lines.
  assert.match(sh, /sed -i '\/\^TRACY_FRAME_ANCESTORS=\/d' "\$SITE_DIR\/\.env"/)
  // Unconditional now: the value is either the one passed in, or the default computed above it —
  // and QUOTED, which `a frame policy survives the dotenv parser` below explains and measures.
  assert.match(sh, /echo "TRACY_FRAME_ANCESTORS=\\"\$frame\\"" >> "\$SITE_DIR\/\.env"/)
  assert.doesNotMatch(sh, /if \[ -n "\$\{FRAME_ANCESTORS:-\}" \]; then/, 'the demo-only guard is gone')

  // Both CMS paths call one renderer, so changing an origin cannot split their defaults.
  const apache = read('../lib/site-apache-conf.sh')
  const shared = read('../lib/frame-policy.sh')
  assert.match(sh, /tracy_frame_ancestors/)
  assert.match(apache, /tracy_frame_ancestors/)
  for (const part of ["'self'", 'https://*.', 'http://127.0.0.1:*', 'http://localhost:*'])
    assert.ok(shared.includes(part), `the shared policy is missing ${part}`)
  assert.match(shared, /FLEET_ZONE:-\$\{SITE_DOMAIN:-tracy\.ai/)
  assert.match(shared, /TRACY_ORIGIN:-/)
})

/**
 * A package that ships no Dockerfile is completed from the fleet's stock files, not refused —
 * Tracy SaaS 1.0.0 is exactly that package (16/09: `lstat app.new/Dockerfile: no such file`).
 * `docker` is a shim on PATH that records its argv and answers "no such image" to inspect, so
 * the function runs for real up to the build, and what it would have built with is read back.
 */
function packageDir(withRecipe) {
  const dir = mkdtempSync(join(tmpdir(), 'emdash-package-'))
  const put = (rel, text) => {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  put('package.json', JSON.stringify({ name: 'x', version: '1.0.0', dependencies: { emdash: '0.37.0' } }))
  put('template.config.json', JSON.stringify({ id: 'tracy-next', version: '1.2.3' }))
  put('distribution.json', JSON.stringify({ artifactHash: 'sha256:abc' }))
  put(
    'tools/artifact.mjs',
    'import { writeFileSync } from \'node:fs\'; writeFileSync(process.argv[2], \'{"templateId":"tracy-next"}\\n\')'
  )
  if (withRecipe) {
    put('Dockerfile', 'FROM scratch\n')
    put('tools/docker-entrypoint.sh', '#!/bin/sh\nexec "$@"\n')
    put('artifact.json', '{"templateId":"own"}\n')
  }
  const zip = join(dir, 'package.zip')
  assert.equal(spawnSync('zip', ['-q', '-r', zip, '.', '-x', 'package.zip'], { cwd: dir }).status, 0)
  return { dir, zip }
}

function buildWithShim(zip, expected) {
  const site = mkdtempSync(join(tmpdir(), 'emdash-site-'))
  const bin = mkdtempSync(join(tmpdir(), 'emdash-bin-'))
  const log = join(bin, 'docker.log')
  writeFileSync(
    join(bin, 'docker'),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\n[ "$1" = image ] && exit 1\nexit 0\n`,
    { mode: 0o755 }
  )
  const run = spawnSync(
    'bash',
    [
      '-euo',
      'pipefail',
      '-c',
      `. "${PROVISION}emdash/quickstart-restore.sh"; emdash_build_image "$1" "$2" "$3" "$4"`,
      'x',
      zip,
      'tracy/next:1.2.3',
      site,
      expected
    ],
    { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }
  )
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
  return { run, site, calls }
}

test('a package without Dockerfile, entrypoint or artifact.json is completed from the stock files, then built', () => {
  const { zip } = packageDir(false)
  const { run, site, calls } = buildWithShim(zip, 'sha256:abc')
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /ships no Dockerfile/)
  assert.match(run.stdout, /ships no artifact\.json/)
  const app = join(site, 'app')
  assert.equal(readFileSync(join(app, 'Dockerfile'), 'utf8'), read('emdash/quickstart.Dockerfile'))
  assert.equal(
    readFileSync(join(app, 'tools/docker-entrypoint.sh'), 'utf8'),
    read('emdash/quickstart-entrypoint.sh')
  )
  assert.equal(JSON.parse(readFileSync(join(app, 'artifact.json'), 'utf8')).templateId, 'tracy-next')
  const build = calls.find((c) => c.startsWith('build '))
  assert.ok(build, `docker build was not called: ${calls}`)
  assert.match(build, /--build-arg TEMPLATE_ID=tracy-next /)
  assert.match(build, /--build-arg TEMPLATE_VERSION=1\.2\.3 /)
  assert.match(build, /--build-arg CMS_VERSION=0\.37\.0 /)
})

// 🔒 A zip packed in +07 and unpacked here in UTC dated every source file of Tracy Business 1.7.11 seven
// hours in the future, newer than the image's own build, so the first site.rebuild of every new site read
// the whole template as written by the agent (TCH #1134 walkthrough, 11/10/2026). The build dates the
// unpacked tree now.
test('the unpacked source is dated at the unpack, never in the future, whatever time the zip carries', () => {
  const { dir } = packageDir(true)
  // The zip's own times, seven hours ahead of the file system's clock. Measured against that clock,
  // not against `Date.now()`: CI runs this file again with the process clock 400 days ahead
  // (`scripts/clock-shift.mjs`), while `touch` in the build dates files with the system's clock.
  const clockDir = mkdtempSync(join(tmpdir(), 'emdash-clock-'))
  const tick = () => {
    const probe = join(clockDir, `tick-${Math.random().toString(36).slice(2)}`)
    writeFileSync(probe, '')
    return statSync(probe).mtimeMs
  }
  const future = Math.floor(tick() / 1000) + 7 * 3600
  for (const rel of [
    'package.json',
    'template.config.json',
    'distribution.json',
    'Dockerfile',
    'tools/artifact.mjs'
  ])
    utimesSync(join(dir, rel), future, future)
  const zip = join(dir, 'future.zip')
  assert.equal(spawnSync('zip', ['-q', '-r', '-X', zip, '.', '-x', '*.zip'], { cwd: dir }).status, 0)
  const before = tick()
  const { run, site } = buildWithShim(zip, 'sha256:abc')
  assert.equal(run.status, 0, run.stderr)
  const after = tick()
  const app = join(site, 'app')
  for (const rel of ['package.json', 'template.config.json', 'Dockerfile', 'tools/artifact.mjs']) {
    const at = statSync(join(app, rel)).mtimeMs
    assert.ok(
      at <= after + 1000,
      `${rel} is dated in the future (${new Date(at).toISOString()} > ${new Date(after).toISOString()})`
    )
    assert.ok(
      at >= before - 2000,
      `${rel} keeps an older time than the unpack (${new Date(at).toISOString()} < ${new Date(before).toISOString()})`
    )
  }
})

test('a package with its own recipe is built as shipped — nothing copied over, no build args', () => {
  const { zip } = packageDir(true)
  const { run, site, calls } = buildWithShim(zip, 'sha256:abc')
  assert.equal(run.status, 0, run.stderr)
  // Its RECIPE is untouched. The completion may still add what the package does not carry at all —
  // since 20/09 that includes `tools/personalize.mjs`, without which the build cannot put the
  // customer's own words in (emdash-personalize.test.mjs) — so this asserts on the recipe rather
  // than on the absence of the word "stock" anywhere in the run.
  assert.doesNotMatch(run.stdout, /stock (Dockerfile|entrypoint)|no Dockerfile/)
  const app = join(site, 'app')
  assert.equal(readFileSync(join(app, 'Dockerfile'), 'utf8'), 'FROM scratch\n')
  assert.equal(JSON.parse(readFileSync(join(app, 'artifact.json'), 'utf8')).templateId, 'own')
  const build = calls.find((c) => c.startsWith('build '))
  assert.ok(build)
  assert.doesNotMatch(build, /--build-arg/)
})

/**
 * The Content API reader (28/09/2026): Tracy Business ≤ 1.4.5 ships `tools/content-api/` with a
 * Dockerfile that defaults the switch OFF, so every site built from it answered
 * CONTENT_ADAPTER_UNSUPPORTED. A package that ships the reader AND declares the switch is built with
 * it; one that does not declare it is left alone; a cached image of the tag built without the
 * reader is rebuilt once. `imageLabel` makes the docker shim answer `image inspect` as an existing
 * image carrying that `io.tracy.content-api.scalars` label.
 */
function readerPackage({ declaresArg }) {
  const dir = mkdtempSync(join(tmpdir(), 'emdash-package-'))
  const put = (rel, text) => {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  put('package.json', JSON.stringify({ name: 'x', version: '1.4.5', dependencies: { emdash: '0.38.0' } }))
  put('template.config.json', JSON.stringify({ id: 'tracy-business', version: '1.4.5' }))
  put('distribution.json', JSON.stringify({ artifactHash: 'sha256:abc' }))
  put('Dockerfile', declaresArg ? 'FROM scratch\nARG TRACY_CONTENT_API_SCALARS=0\n' : 'FROM scratch\n')
  put('tools/docker-entrypoint.sh', '#!/bin/sh\nexec "$@"\n')
  put('artifact.json', '{"templateId":"tracy-business"}\n')
  put('tools/content-api/integration.mjs', 'export default () => ({})\n')
  const zip = join(dir, 'package.zip')
  assert.equal(spawnSync('zip', ['-q', '-r', zip, '.', '-x', 'package.zip'], { cwd: dir }).status, 0)
  return zip
}

function buildOverImage(zip, imageLabel) {
  const site = mkdtempSync(join(tmpdir(), 'emdash-site-'))
  const bin = mkdtempSync(join(tmpdir(), 'emdash-bin-'))
  const log = join(bin, 'docker.log')
  const inspect =
    imageLabel === undefined
      ? '[ "$1" = image ] && exit 1'
      : `if [ "$1" = image ]; then case "$*" in *--format*) printf '%s\\n' '${imageLabel}';; esac; exit 0; fi`
  writeFileSync(join(bin, 'docker'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\n${inspect}\nexit 0\n`, {
    mode: 0o755
  })
  const run = spawnSync(
    'bash',
    [
      '-euo',
      'pipefail',
      '-c',
      `. "${PROVISION}emdash/quickstart-restore.sh"; emdash_build_image "$1" "$2" "$3" "$4"`,
      'x',
      zip,
      'tracy/tracy-business-emdash:1.4.5',
      site,
      'sha256:abc'
    ],
    { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }
  )
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
  return { run, build: calls.find((c) => c.startsWith('build ')) }
}

test('a package that ships the Content API reader and declares its switch is built WITH the reader', () => {
  const { run, build } = buildOverImage(readerPackage({ declaresArg: true }))
  assert.equal(run.status, 0, run.stderr)
  assert.ok(build, 'docker build was not called')
  assert.match(build, /--build-arg TRACY_CONTENT_API_SCALARS=1 /)
})

test('a Dockerfile that never declares the switch gets no reader argument, even beside the reader', () => {
  const { run, build } = buildOverImage(readerPackage({ declaresArg: false }))
  assert.equal(run.status, 0, run.stderr)
  assert.ok(build)
  assert.doesNotMatch(build, /TRACY_CONTENT_API_SCALARS/)
})

test('a cached image of the tag built without the reader is rebuilt with it; one built with it is reused', () => {
  const stale = buildOverImage(readerPackage({ declaresArg: true }), '0')
  assert.equal(stale.run.status, 0, stale.run.stderr)
  assert.match(stale.run.stdout, /built without the Content API reader .* rebuilding it with the reader/)
  assert.ok(stale.build, 'the stale image was not rebuilt')
  assert.match(stale.build, /--build-arg TRACY_CONTENT_API_SCALARS=1 /)
  const fresh = buildOverImage(readerPackage({ declaresArg: true }), '1')
  assert.equal(fresh.run.status, 0, fresh.run.stderr)
  assert.match(fresh.run.stdout, /exists — not rebuilding/)
  assert.equal(fresh.build, undefined)
  // A template that does not ship the reader keeps its cached image whatever its label says.
  const other = buildOverImage(readerPackage({ declaresArg: false }), '0')
  assert.match(other.run.stdout, /exists — not rebuilding/)
  assert.equal(other.build, undefined)
})

/**
 * The build is fenced against a same-site race and runs on BuildKit. A shim that records the build's
 * env AND argv lets both be read back: the context directory is this run's own (`app.build.<pid>`),
 * never the fixed `app.new` two concurrent runs would `rm -rf` from under each other, and the
 * builder is BuildKit — the legacy store is what corrupted its snapshot cache under a concurrent
 * build ("parent snapshot ... does not exist"). See emdash_build_image in quickstart-restore.sh.
 */
function buildCapturingEnv(zip) {
  const site = mkdtempSync(join(tmpdir(), 'emdash-site-'))
  const bin = mkdtempSync(join(tmpdir(), 'emdash-bin-'))
  const log = join(bin, 'docker.log')
  writeFileSync(
    join(bin, 'docker'),
    `#!/bin/sh\nprintf 'buildkit=%s|args=%s\\n' "\${DOCKER_BUILDKIT:-}" "$*" >> "${log}"\n[ "$1" = image ] && exit 1\nexit 0\n`,
    { mode: 0o755 }
  )
  const run = spawnSync(
    'bash',
    [
      '-euo',
      'pipefail',
      '-c',
      `. "${PROVISION}emdash/quickstart-restore.sh"; emdash_build_image "$1" "$2" "$3" "$4"`,
      'x',
      zip,
      'tracy/next:1.2.3',
      site,
      'sha256:abc'
    ],
    { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }
  )
  const lines = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
  const build = lines.find((l) => l.includes('|args=build '))
  return { run, site, build }
}

test('the source builds on BuildKit and unpacks into a unique per-run directory', () => {
  const shell = read('emdash/quickstart-restore.sh')
  // BuildKit is set on the one build command, and the deprecated legacy builder is gone.
  assert.match(shell, /DOCKER_BUILDKIT=1 docker build -q /)
  // The unpack directory is derived from the run's pid, so two provisions never share one.
  assert.match(shell, /local build="\$dir\/app\.build\.\$\$"/)
  assert.match(shell, /unzip -q "\$zip" -d "\$build"/)
  assert.match(shell, /mv "\$build" "\$dir\/app"/)
  // Nothing unpacks or builds into a fixed shared directory any more (the old `app.new`).
  assert.doesNotMatch(shell, /-d "\$dir\/app\.new"/, 'the fixed shared unpack dir is gone')
  assert.doesNotMatch(shell, /docker build[^\n]*"\$dir\/app\.new"/, 'the build context is not shared')
})

test('emdash_build_image runs docker with DOCKER_BUILDKIT=1 and its own build directory', () => {
  const { zip } = packageDir(true)
  const { run, site, build } = buildCapturingEnv(zip)
  assert.equal(run.status, 0, run.stderr)
  assert.ok(build, 'docker build was not called')
  assert.match(build, /^buildkit=1\|/, 'the build ran under BuildKit')
  // The last argument to `docker build` is the context directory: this run's own, under the site.
  const context = build.split('|args=build ')[1].trim().split(/\s+/).pop()
  assert.match(context, new RegExp(`^${site}/app\\.build\\.\\d+$`), `context was ${context}`)
  // The scratch directory is cleaned up and the served tree is `app`; no `app.new` is left behind.
  assert.ok(existsSync(join(site, 'app')), 'the built tree became app')
  assert.deepEqual(
    readdirSync(site).filter((n) => n.startsWith('app.build.') || n === 'app.new'),
    [],
    'no scratch unpack directory is left behind'
  )
})

test('the stock Dockerfile and entrypoint are what Tracy Business ships, minus the typed labels', () => {
  const stock = read('emdash/quickstart.Dockerfile')
  assert.match(stock, /^ARG TEMPLATE_ID=/m)
  assert.match(stock, /io\.tracy\.cms="emdash"/)
  assert.match(stock, /ENTRYPOINT \["bash", "\/app\/tools\/docker-entrypoint\.sh"\]/)
  assert.match(read('emdash/quickstart-entrypoint.sh'), /gosu www-data/)
  assert.equal(bashOk('emdash/quickstart-entrypoint.sh').status, 0)
  assert.equal(bashOk('emdash/quickstart-restore.sh').status, 0)
})

/**
 * 🔒 A `RETURN` TRAP OUTLIVES THE FUNCTION THAT SET IT, and the first EmDash provision to get past
 * the builder died on that — AFTER building a 1.01 GB image, so every second of the work was lost.
 * Measured 19/09/2026 on the local stand (`stageem2`, `tracy-business/emdash-0.x`, 210 s):
 *
 *     ==> EmDash image (quickstart tracy-business/emdash-0.x): tracy/tracy-business-emdash:1.0.1
 *     /opt/tracy-fleet/provision/provision.sh: line 324: build: unbound variable
 *
 * Line 324 is `. "$HERE/platform/$PLATFORM.sh"`. The trap fires a SECOND time when that sourced
 * file returns, and `local build` is gone by then — under `set -u` that is fatal, and the message
 * names a file that never mentions `build`. Reproduced in bash 5.2 in eight lines.
 *
 * ⚠ THIS ASSERTION IS STATIC, AND THAT IS A DELIBERATE CHOICE, NOT LAZINESS. The failure needs
 * bash 4+; the Mac this repo is developed on ships bash 3.2, where the eight-line reproduction
 * exits 0. A runtime test here would pass on every developer's machine WITHOUT EXERCISING ANYTHING
 * and only ever fail on CI — a test that is green for the wrong reason on the machine where the
 * code is written. So the property is asserted on the text: the handler must not read the local
 * when it fires, and it must disarm itself so the second firing is a no-op.
 */
test('the unpack directory trap cannot read a dead local, and disarms itself', () => {
  const sh = read('emdash/quickstart-restore.sh')
  // Take the WHOLE LINE, do not try to peel the string out of the quotes: the handler contains both
  // the word `RETURN` and nested parentheses (`$(printf '%q' "$build")`), so any regex keyed on
  // bracket pairs cuts it short and the test ends up checking a fragment instead of the handler —
  // exactly the mistake made while writing this test.
  const handler = sh.split('\n').find((line) => /^\s*trap\b/.test(line) && /\bRETURN\s*$/.test(line))
  assert.ok(handler, 'the unpack directory has no RETURN trap at all')
  // What tells them apart is HOW the handler is quoted, not where the word `$build` appears: a
  // SINGLE-quoted handler defers everything until it fires (`trap 'rm -rf "$build"' RETURN` — the
  // old version, and the bug), while in a DOUBLE-quoted one everything is already expanded when the
  // trap is set. Checking for the word `$build` flags `$(printf '%q' "$build")` — the right way — as
  // wrong too; that exact trap was hit while writing this test.
  assert.match(
    handler,
    /trap\s+"/,
    'the handler is single-quoted, so it reads `$build` at fire time — when the function local is gone'
  )
  assert.match(
    handler,
    /trap - RETURN/,
    'the handler does not disarm itself, so the source-return fires it again'
  )
  assert.equal(bashOk('emdash/quickstart-restore.sh').status, 0)
})

// ── The policy has to survive being read back, not merely being written ─────────────────────────
//
// 🔒 A STRING MATCH ON THE LINE THIS SCRIPT WRITES CANNOT SEE THIS BUG, AND DID NOT. The value
// begins with `'self'` and carries spaces; compose reads the site's `.env` with a dotenv parser.
// Written bare, that parser sees a single-quoted value, takes `self`, and discards every origin
// after the closing quote — so the container holds `TRACY_FRAME_ANCESTORS=self`, the EmDash
// middleware renders `frame-ancestors 'self' self`, Tracy's origin is not in the list, and the
// preview pane says "refused to connect" while `curl` fetches the same URL with 200. A refusal to
// FRAME is not a refusal to serve, which is why it reads as a broken site rather than a header.
//
// Measured 22/09/2026 on `site-g5dm6x`, beside a WordPress site of the same age carrying the full
// list. So this test does not look at the line: it READS IT BACK the way compose does.

/**
 * The dotenv rule compose follows, in the one respect that matters here: a value whose first
 * character is a quote ends at the matching quote; an unquoted value runs to end of line. Modelled
 * rather than imported so the test states the rule it is holding us to.
 */
function dotenvValue(line) {
  const eq = line.indexOf('=')
  const raw = line.slice(eq + 1)
  const q = raw[0]
  if (q !== '"' && q !== "'") return raw
  const close = raw.indexOf(q, 1)
  return close === -1 ? raw.slice(1) : raw.slice(1, close)
}

test('a frame policy survives the dotenv parser compose reads the site env with', () => {
  const policy = "'self' https://*.tracy.test http://127.0.0.1:* http://localhost:* http://tracy.test:51710"
  const sh = read('platform/emdash.sh')

  // The line this script writes, with the shell expansion done the way bash would.
  const written = /echo "(TRACY_FRAME_ANCESTORS=.*?)" >> "\$SITE_DIR\/\.env"/.exec(sh)
  assert.ok(written, 'the script still writes the line this test is about')
  const line = written[1].replace(/\\"/g, '"').replace('$frame', policy)

  assert.equal(
    dotenvValue(line),
    policy,
    `the whole policy must come back, not just its first token — line written: ${line}`
  )
  // The specific loss this guards: Tracy's own origin is what the preview needs, and it sits
  // AFTER the first quoted token.
  assert.match(dotenvValue(line), /http:\/\/tracy\.test:51710/)
})
