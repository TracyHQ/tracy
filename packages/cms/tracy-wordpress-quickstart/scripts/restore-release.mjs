#!/usr/bin/env node
// Restore a published Tracy Business WordPress quickstart onto a local stand, with the vendored
// method's own tool (vendor/wordpress/tracy-wordpress-theme …/quickstart/restore.mjs) — used, not
// modified. This is the first step of making the next version from the published one: the
// extraction and base-change scripts beside this file all read the stand it leaves running.
//
// The release's SHA256SUMS lists every asset of every version still on the release (1.0.0
// archives too), and the method refuses a pack with a listed file missing. So the archives of
// the wanted version are downloaded and a pack folder is made holding exactly them, the
// manifest, and those lines of the release's own SHA256SUMS — the checksums checked are still
// the published ones.
//
// A version cut without the method (tracy-business/wp7 1.2.0, cut by hand from the 1.1.0 archive)
// has its archives on the release but no manifest.json or SHA256SUMS of its own: the release's
// declaration files still describe the version customers get. Then the pack's manifest is BUILT
// on this machine from this repo's contract profile of that version
// (`contracts/<release>/<version>/manifest.json`, whose `quickstart.parts` record the published
// bytes and sha256), and nothing built here is uploaded anywhere. Once the release's own
// manifest names the version, it is used and nothing is built.
//
// A release cut by `tracy-dev quickstart` names the archives under `parts`, its webroot members
// `./<path>` owned by the author, and lays out its wp-config.php other than the method's accepted
// form; the method's restore.mjs takes none of the first three, and its pack.mjs refuses a stand
// restored with the last. The pack then gets the method's manifest fields and an archive as the
// method packs it, made here only after every file matched the published checksums (stand.mjs
// methodPackManifest, canonicalWebroot).
//
// Usage: node restore-release.mjs --stand <dir outside the repo> --version <x.y.z>
//        [--release tracy-business/wp7] [--repo JoomlArt-Products/ja-products]
//        [--port 8291] [--project tracy-business-wp7-stand]
// Needs: gh (signed in with read access to the release), docker.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  canonicalWebroot,
  compose,
  copyRestoreToStand,
  methodPackManifest,
  restorePack,
  restoreVolume,
  standEnv
} from './stand.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../../..')

const { values: o } = parseArgs({
  options: {
    stand: { type: 'string' },
    version: { type: 'string' },
    release: { type: 'string', default: 'tracy-business/wp7' },
    repo: { type: 'string', default: 'JoomlArt-Products/ja-products' },
    port: { type: 'string', default: '8291' },
    project: { type: 'string', default: 'tracy-business-wp7-stand' }
  }
})
if (!o.stand) throw new Error('--stand <dir> is required (a folder outside the repo)')
// No default: a default restores one version while the pack step labels another.
if (!o.version) throw new Error('--version <x.y.z> is required: the published version to restore')
const stand = path.resolve(o.stand)
if (stand.startsWith(REPO_ROOT + path.sep)) throw new Error('--stand must be outside the repo')

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status})`)
}

// 1. Download the version's archives, the manifest and the release's checksum list — every run,
// over whatever an earlier run left: a re-cut release keeps its asset names, so a file already on
// disk may be the version before it.
// The asset prefix is the tag's last two segments, as the method's pack.mjs (`slugOf`) names them:
// `quickstart/ja-kinetic/wp7` ships `ja-kinetic-wp7-webroot-<v>.tar.gz`, not `quickstart-ja-kinetic-…`.
const slug = o.release
  .split('/')
  .slice(-2)
  .join('/')
  .replace(/[^a-z0-9]+/gi, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase()
const archives = [`${slug}-webroot-${o.version}.tar.gz`, `${slug}-database-${o.version}.sql.gz`]
const download = path.join(stand, 'release', o.version)
mkdirSync(download, { recursive: true })
const patterns = [...archives, 'manifest.json', 'SHA256SUMS'].flatMap((f) => ['-p', f])
run('gh', ['release', 'download', o.release, '--repo', o.repo, ...patterns, '--dir', download, '--clobber'])
const released = JSON.parse(readFileSync(path.join(download, 'manifest.json'), 'utf8'))

// 2. A pack folder with exactly this version's files and their published checksums.
const pack = path.join(stand, 'pack', o.version)
mkdirSync(pack, { recursive: true })
if (released.version === o.version) {
  const sums = readFileSync(path.join(download, 'SHA256SUMS'), 'utf8')
    .split('\n')
    .filter((line) => ['manifest.json', ...archives].includes(line.trim().split(/\s+/)[1]))
  if (sums.length !== 3)
    throw new Error(`SHA256SUMS lists ${sums.length} of manifest.json + ${archives.join(' + ')}`)
  const manifest = methodPackManifest(released)
  if (manifest === released) {
    for (const f of ['manifest.json', ...archives]) copyFileSync(path.join(download, f), path.join(pack, f))
    writeFileSync(path.join(pack, 'SHA256SUMS'), sums.join('\n') + '\n')
  } else {
    // The pack's manifest is no longer the published bytes, so restore.mjs cannot check those
    // against the release's SHA256SUMS; that check is made here, on the downloaded file, first.
    const published = sums
      .find((line) => line.trim().split(/\s+/)[1] === 'manifest.json')
      .trim()
      .split(/\s+/)[0]
    const downloaded = createHash('sha256')
      .update(readFileSync(path.join(download, 'manifest.json')))
      .digest('hex')
    if (downloaded !== published)
      throw new Error(`manifest.json is ${downloaded}, the release's SHA256SUMS says ${published}`)
    const text = JSON.stringify(manifest, null, 2) + '\n'
    for (const f of archives) copyFileSync(path.join(download, f), path.join(pack, f))
    writeFileSync(path.join(pack, 'manifest.json'), text)
    const lines = sums.filter((line) => line.trim().split(/\s+/)[1] !== 'manifest.json')
    lines.push(`${createHash('sha256').update(text).digest('hex')}  manifest.json`)
    writeFileSync(path.join(pack, 'SHA256SUMS'), lines.join('\n') + '\n')
  }
} else {
  const { manifest, sums } = manifestFromProfile(download, archives, released)
  for (const f of archives) copyFileSync(path.join(download, f), path.join(pack, f))
  writeFileSync(path.join(pack, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  writeFileSync(path.join(pack, 'SHA256SUMS'), sums.join('\n') + '\n')
  console.log(`the release's manifest names ${released.version}: built ${o.version}'s from ${profilePath()}`)
}
const rewritten = canonicalWebroot(pack)
if (rewritten)
  console.log(
    `the webroot archive is not as the method packs it: ${rewritten.members} members and ${rewritten.config} wp-config.php layout edits made for restore.mjs (stand.mjs canonicalWebroot)`
  )

function profilePath() {
  return path.join(HERE, '..', 'contracts', o.release, o.version, 'manifest.json')
}

// The method's pack manifest for a version the release does not describe. Every field comes from
// this repo's contract profile of that version; the downloaded archives must match the bytes and
// sha256 it records, or nothing goes further. Fields the profile does not carry are not invented:
// `built` says where the manifest came from, and the theme's version, plugin list and counts are
// left out (the method's restore.mjs reads none of them).
function manifestFromProfile(dir, files, released) {
  const file = profilePath()
  if (!existsSync(file))
    throw new Error(`the release's manifest names ${released.version}, and ${file} does not exist`)
  const q = JSON.parse(readFileSync(file, 'utf8')).quickstart ?? {}
  if (q.release !== o.release || q.version !== o.version)
    throw new Error(`${file} describes ${q.release} ${q.version}, not ${o.release} ${o.version}`)
  const parts = { webroot: q.parts?.webroot, database: q.parts?.database }
  const sums = []
  for (const [i, name] of ['webroot', 'database'].entries()) {
    const part = parts[name]
    if (part?.file !== files[i]) throw new Error(`${file}: quickstart.parts.${name}.file is not ${files[i]}`)
    const onDisk = path.join(dir, part.file)
    const bytes = statSync(onDisk).size
    const sha256 = createHash('sha256').update(readFileSync(onDisk)).digest('hex')
    if (bytes !== part.bytes || sha256 !== part.sha256)
      throw new Error(
        `${part.file}: downloaded ${bytes} bytes sha256 ${sha256}, the profile records ${part.bytes} bytes sha256 ${part.sha256}`
      )
    sums.push(`${sha256}  ${part.file}`)
  }
  const manifest = {
    schemaVersion: released.schemaVersion,
    id: q.release,
    version: q.version,
    platform: q.platform,
    wpVersion: q.platformVersion,
    phpVersion: q.phpVersion,
    prefix: q.tablePrefix,
    placeholderUrl: q.placeholderUrl,
    theme: { name: q.theme },
    webroot: { file: parts.webroot.file, bytes: parts.webroot.bytes, sha256: parts.webroot.sha256 },
    database: { file: parts.database.file, bytes: parts.database.bytes, sha256: parts.database.sha256 },
    built: `on this machine from ${path.relative(REPO_ROOT, file)}; the release carries no manifest for ${q.version}`
  }
  return { manifest, sums }
}

// 3. Database up, restore with the method's tool into a fresh volume (stand.mjs restorePack),
// copy it into the stand's folder, then serve the result.
mkdirSync(path.join(stand, 'webroot'), { recursive: true })
const env = standEnv({ stand, port: o.port })
compose(o.project, env, ['up', '-d', '--wait', 'db'])
compose(o.project, env, ['stop', 'web'])
const siteUrl = `http://127.0.0.1:${o.port}`
try {
  restorePack({
    project: o.project,
    env,
    pack,
    siteUrl,
    report: path.join(stand, `restore-${o.version}.json`)
  })
  copyRestoreToStand(o.project, stand)
} finally {
  spawnSync('docker', ['volume', 'rm', '-f', restoreVolume(o.project)], { stdio: 'ignore' })
}
compose(o.project, env, ['up', '-d', 'web'])
console.log(`restored ${o.release} ${o.version} → ${siteUrl} (stand ${stand}, project ${o.project})`)
