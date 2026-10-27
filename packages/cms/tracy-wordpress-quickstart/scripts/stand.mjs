// The local stand the release scripts work on: one compose project (stand-compose.yml) whose
// webroot lives in a host folder outside the repo. Every script beside this one reaches the
// restored site through the same wp-cli runner, so they all agree on which stand they mean.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  archiveConfig,
  CONFIG_MEMBERS,
  configFormProblems,
  listArchive,
  readPack,
  renderQuickstartConfig
} from '../../../../vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/scripts/quickstart/lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const COMPOSE_FILE = path.join(HERE, 'stand-compose.yml')
// A local-only database password: the stand listens on loopback and holds a public release.
export const DB_PASSWORD = 'stand'

// `served: 'restore'` serves the project's restore volume instead of the stand's folder
// (stand-compose.yml STAND_WEBROOT).
export function standEnv({ stand, port, served }) {
  const env = {
    ...process.env,
    STAND_DIR: path.resolve(stand),
    STAND_PORT: String(port),
    STAND_DB_PASSWORD: DB_PASSWORD
  }
  delete env.STAND_WEBROOT
  if (served === 'restore') env.STAND_WEBROOT = 'restore'
  return env
}

export function composeArgs(project) {
  return ['compose', '-p', project, '-f', COMPOSE_FILE]
}

// The runner string the vendored method's tools take as `--wp`.
export function runnerFor(project) {
  return `docker ${composeArgs(project).join(' ')} run --rm -T cli`
}

// The vendored restore.mjs extracts as root through `--root-runner` and refuses a webroot whose
// filesystem does not hold files to their modes — a macOS bind mount, like the stand's own
// webroot. So it restores into a named volume of the project's (stand-compose.yml `restore`),
// read by both runners at the container webroot: restore-release.mjs copies the result into the
// stand's folder, pack-and-verify.mjs serves the volume itself.
export const restoreVolume = (project) => `${project}_restore`
const ROOT_IMAGE = 'wordpress:cli-php8.3'
const METHOD_DIR = path.resolve(
  HERE,
  '../../../../vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/scripts/quickstart'
)
const METHOD_RESTORE = path.join(METHOD_DIR, 'restore.mjs')
// The image's wp-config.php the method's accepted form is rendered from (lib.mjs CONFIG_FIXTURE).
const CONFIG_FIXTURE = path.join(METHOD_DIR, '../../assets/quickstart/wp-config-docker.php')

export function restoreRunners(project) {
  const mount = `-v ${restoreVolume(project)}:/var/www/html`
  return {
    root: `docker run --rm -i --user 0:0 ${mount} ${ROOT_IMAGE}`,
    wp: `docker ${composeArgs(project).join(' ')} run --rm -T ${mount} cli`
  }
}

// The method's restore.mjs arguments for one pack; the report is written also on failure.
export function methodRestoreArgs({ project, pack, siteUrl, report }) {
  const runners = restoreRunners(project)
  return [
    '--pack',
    pack,
    '--root-runner',
    runners.root,
    '--wp',
    runners.wp,
    '--site-url',
    siteUrl,
    '--db-host',
    'db',
    '--db-password-env',
    'STAND_DB_PASSWORD',
    '--wipe',
    '--report',
    report
  ]
}

// One pack restored with the method's restore.mjs into a fresh restore volume of the project.
// The volume carries compose's labels for `restore`, so `down -v` removes it with the stand.
export function restorePack({ project, env, pack, siteUrl, report }) {
  const volume = restoreVolume(project)
  spawnSync('docker', ['volume', 'rm', '-f', volume], { stdio: 'ignore' })
  docker([
    'volume',
    'create',
    '--label',
    `com.docker.compose.project=${project}`,
    '--label',
    'com.docker.compose.volume=restore',
    volume
  ])
  const r = spawnSync(
    process.execPath,
    [METHOD_RESTORE, ...methodRestoreArgs({ project, pack, siteUrl, report })],
    {
      stdio: 'inherit',
      env: { ...env, STAND_DB_PASSWORD: DB_PASSWORD }
    }
  )
  if (r.status !== 0) throw new Error(`restore.mjs failed (exit ${r.status}); its report is ${report}`)
}

// The method's verify-parity.mjs arguments between stand `a` and the restored stand `b` (each
// {project, env, siteUrl}). It runs one process against both stands, and the compose file takes
// each stand's folder, port, password and webroot from the environment: one environment cannot
// hold two stands, and compose recreates a service whose environment changed, database included.
// So each wp runner carries its own stand's variables. `b` is read as the fleet reads it: the root
// runner on its restore volume for the access probe, and the restore report bound to the pack.
export function methodParityArgs({ a, b, routes, pack, restoreReport, report, skipStyles = false }) {
  const standRunner = ({ project, env }) =>
    `env ${['STAND_DIR', 'STAND_PORT', 'STAND_DB_PASSWORD', 'STAND_WEBROOT']
      .filter((k) => env[k] !== undefined)
      .map((k) => `${k}='${env[k]}'`)
      .join(' ')} ${runnerFor(project)}`
  return [
    '--a',
    a.siteUrl,
    '--b',
    b.siteUrl,
    '--routes',
    routes,
    '--wp-a',
    standRunner(a),
    '--wp-b',
    standRunner(b),
    '--root-b',
    restoreRunners(b.project).root,
    '--pack',
    pack,
    '--restore-report',
    restoreReport,
    '--dark-hook',
    'cookie:tracy_theme=dark',
    '--out',
    report,
    ...(skipStyles ? ['--skip-styles'] : [])
  ]
}

// The method's restore.mjs reads the two archives at the manifest's top level (`webroot`,
// `database`); published release manifests carry them under `parts`. The published manifest is
// kept whole and the two entries are set beside it; one that already has them is returned as is.
export function methodPackManifest(released) {
  if (released.webroot && released.database) return released
  const { webroot, database } = released.parts ?? {}
  if (!webroot?.file || !database?.file)
    throw new Error(
      `manifest.json of ${released.version} names its archives neither at the top level nor under parts`
    )
  return { ...released, webroot, database }
}

// Webroot archives cut by `tracy-dev quickstart` (TracyHQ/tracy-template-dev, `tar -C <webroot> .`
// on the author's machine) name every member `./<path>`, carry a `./` member for the webroot itself,
// and keep the author's owner (501:20): tracy-business/wp7 1.3.8, tracy-base/wp7 1.1.6,
// quickstart/ja-kinetic/wp7 1.0.12. The method's restore.mjs refuses any name with a `.` segment,
// and after extracting refuses a file not owned by root — its own pack writes root:root
// (archive.py base_info). Neither reaches a site: the fleet extracts `./a` where it extracts `a`,
// and gives the webroot to www-data after (provision.sh own_webroot). So only the leading `./` is
// taken off, the `./` member dropped and the owner set to root:root, as the method's pack writes
// them; every other field of every member is kept, and any other name that is not canonical is
// refused as restore would refuse it (lib.mjs archiveConfig). Only the webroot's own directory entry
// is dropped: anything else named `.` stops the rewrite, and so does a setuid or setgid bit on a
// member whose owner would change to root (the method's pack never writes either bit). A third
// argument is a file whose bytes replace wp-config.php's.
const CANONICAL_HEADERS_PY = `
import gzip, io, sys, tarfile
src, dst = sys.argv[1], sys.argv[2]
config = open(sys.argv[3], 'rb').read() if len(sys.argv) > 3 else None
def bare(n):
    return n[2:] if n.startswith('./') else n
changed = 0
with tarfile.open(src, 'r|gz') as tin, open(dst, 'wb') as raw:
    with gzip.GzipFile(filename='', mode='wb', fileobj=raw, compresslevel=6, mtime=0) as gz:
        with tarfile.open(fileobj=gz, mode='w', format=tarfile.PAX_FORMAT) as tout:
            for m in tin:
                if m.name in ('.', './'):
                    if not m.isdir():
                        sys.exit('member %r is a %s, not the webroot directory' % (m.name, 'file' if m.isreg() else 'type %r entry' % m.type))
                    changed += 1
                    continue
                name = bare(m.name)
                if m.mode & 0o6000 and (m.uid, m.gid) != (0, 0):
                    sys.exit('member %r is setuid/setgid (mode %o) and owned by %d:%d; the bridge would make it root-owned' % (m.name, m.mode, m.uid, m.gid))
                link = bare(m.linkname) if m.islnk() else m.linkname
                if (name, link, m.uid, m.gid, m.uname, m.gname) != (m.name, m.linkname, 0, 0, 'root', 'root'):
                    changed += 1
                m.name, m.linkname = name, link
                m.uid = m.gid = 0
                m.uname = m.gname = 'root'
                # pax keys override the fields just set, and would otherwise be written back as read
                drop = ('path', 'linkpath', 'uid', 'gid', 'uname', 'gname', 'size')
                m.pax_headers = {k: v for k, v in m.pax_headers.items() if k not in drop}
                if config is not None and name == 'wp-config.php' and m.isreg():
                    m.size = len(config)
                    tout.addfile(m, io.BytesIO(config))
                    continue
                tout.addfile(m, tin.extractfile(m) if m.isreg() else None)
print(changed)
`
const sha256Of = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

// The wp-config.php of tracy-dev quickstart releases (tracy-business/wp7 1.3.8) is the method's
// accepted form but for its layout: the blank line the method's render leaves where the image's
// WORDPRESS_CONFIG_EXTRA block was is missing before "That's all, stop editing", and pack.mjs refuses
// a stand restored from it. Only the layout is rewritten — blank lines and the whitespace at either
// end of a line, placed as the accepted form places them; every non-blank line keeps its content and
// order. Anything else stays the method's refusal, and the method's own check (configFormProblems)
// must find nothing in the result. Returns null for a file already in the accepted form, else
// { text, edits } with one entry per line added, removed or re-indented.
export function methodConfigLayout(source) {
  const problems = configFormProblems(source)
  if (!problems.length) return null
  const refuse = (why) =>
    new Error(
      `wp-config.php differs from the method's accepted form beyond its layout (${why}): ${problems.join('; ')}`
    )
  // The salts this renders are random; only the layout of the form is read from it.
  const form = renderQuickstartConfig(readFileSync(CONFIG_FIXTURE, 'utf8')).source.split('\n')
  const have = source.replace(/\r\n?/g, '\n').split('\n')
  const lines = have.filter((line) => line.trim())
  const shaped = form.filter((line) => line.trim())
  if (lines.length !== shaped.length)
    throw refuse(`${lines.length} non-blank lines, the accepted form has ${shaped.length}`)
  let next = 0
  const out = form.map((line) => (line.trim() ? line.match(/^\s*/)[0] + lines[next++].trim() : ''))
  const text = out.join('\n')
  const left = configFormProblems(text)
  if (left.length) throw refuse(left.join('; '))
  const edits = []
  let j = 0
  for (const [i, line] of out.entries()) {
    if (!line) {
      if (j < have.length && !have[j].trim()) j++
      else edits.push(`line ${i + 1}: blank line added`)
      continue
    }
    for (; !have[j].trim(); j++) edits.push(`line ${j + 1} of the original: blank line removed`)
    if (have[j] !== line) edits.push(`line ${i + 1}: whitespace of line ${j + 1} of the original`)
    j++
  }
  for (; j < have.length; j++) edits.push(`line ${j + 1} of the original: blank line removed`)
  return { text, edits }
}

// The pack's webroot archive with canonical member names and owners and its wp-config.php in the
// method's layout, made in place. The pack must first be one the method's readPack accepts — every
// file SHA256SUMS lists its published bytes, and the manifest's archive hashes those SHA256SUMS
// lists — and the webroot its manifest's size, because both are replaced; then the archive is rewritten, and the manifest and SHA256SUMS name the
// new bytes and keep the published ones in `canonicalised`. Returns null when the pack is left byte
// for byte, else { members, config }: members renamed, re-owned or dropped, and wp-config.php edits.
export function canonicalWebroot(pack) {
  const sumsFile = path.join(pack, 'SHA256SUMS')
  const sums = readFileSync(sumsFile, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => line.trim().split(/\s+/))
  const { manifest } = readPack(pack)
  const manifestFile = path.join(pack, 'manifest.json')
  const archive = path.join(pack, manifest.webroot.file)
  if (manifest.webroot.bytes !== undefined && manifest.webroot.bytes !== statSync(archive).size)
    throw new Error(
      `manifest.json says ${manifest.webroot.file} is ${manifest.webroot.bytes} bytes, it is ${statSync(archive).size}`
    )
  const partial = `${archive}.canonical-${process.pid}`
  const configured = `${partial}.config`
  const rewrite = (src, dst, ...config) => {
    const r = spawnSync('python3', ['-c', CANONICAL_HEADERS_PY, src, dst, ...config], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`rewriting the members of ${archive} failed: ${r.stderr.trim()}`)
    return Number(r.stdout.trim())
  }
  try {
    const members = rewrite(archive, partial)
    const found = archiveConfig(listArchive(partial, { read: CONFIG_MEMBERS }), manifest.webroot.file)
    if (found.problems.length && found.text === null) throw new Error(found.problems.join('; '))
    const layout = found.problems.length ? methodConfigLayout(found.text) : null
    if (!members && !layout) return null
    if (layout) {
      writeFileSync(`${configured}.php`, layout.text)
      rewrite(partial, configured, `${configured}.php`)
      renameSync(configured, partial)
    }
    renameSync(partial, archive)
    const sha256 = sha256Of(archive)
    manifest.canonicalised = {
      note: 'the webroot archive as the method packs it, made on this machine for restore.mjs from the published one',
      webroot: { sha256: manifest.webroot.sha256, bytes: manifest.webroot.bytes },
      members,
      ...(layout && {
        config: {
          sha256: createHash('sha256').update(found.text).digest('hex'),
          edits: layout.edits
        }
      })
    }
    manifest.webroot = { ...manifest.webroot, bytes: statSync(archive).size, sha256 }
    const text = JSON.stringify(manifest, null, 2) + '\n'
    writeFileSync(manifestFile, text)
    const fresh = {
      [manifest.webroot.file]: sha256,
      'manifest.json': createHash('sha256').update(text).digest('hex')
    }
    writeFileSync(sumsFile, sums.map(([sha, file]) => `${fresh[file] ?? sha}  ${file}`).join('\n') + '\n')
    return { members, config: layout?.edits.length ?? 0 }
  } finally {
    for (const file of [partial, configured, `${configured}.php`]) rmSync(file, { force: true })
  }
}

// The restored volume becomes the stand's folder, owned by the user running the release scripts
// (as the host `tar` of the earlier restore left it), so they can read and change it in place.
export function copyRestoreToStand(project, stand) {
  const webroot = path.join(path.resolve(stand), 'webroot')
  const owner = `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`
  const script = `find /var/www/html -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && cp -a /restored/. /var/www/html/ && chown -R ${owner} /var/www/html`
  docker([
    'run',
    '--rm',
    '--user',
    '0:0',
    '-v',
    `${restoreVolume(project)}:/restored:ro`,
    '-v',
    `${webroot}:/var/www/html`,
    ROOT_IMAGE,
    'sh',
    '-c',
    script
  ])
}

export function docker(args) {
  const r = spawnSync('docker', args, { encoding: 'utf8', stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`docker ${args.slice(0, 3).join(' ')} failed (exit ${r.status})`)
}

export function compose(project, env, args) {
  const r = spawnSync('docker', [...composeArgs(project), ...args], {
    env,
    encoding: 'utf8',
    stdio: 'inherit'
  })
  if (r.status !== 0) throw new Error(`docker compose ${args.join(' ')} failed (exit ${r.status})`)
}

// One wp-cli call on the stand; stdout as text.
export function wp(project, env, args, { input } = {}) {
  const r = spawnSync('docker', [...composeArgs(project), 'run', '--rm', '-T', 'cli', ...args], {
    env,
    input,
    encoding: 'utf8',
    maxBuffer: 1 << 30
  })
  if (r.status !== 0)
    throw new Error(`wp ${args.slice(0, 2).join(' ')} failed (exit ${r.status}): ${r.stderr}`)
  return r.stdout
}
