/**
 * Golden snapshot of the QA stand (tasks/todo-daily-qa.md §4.9).
 *
 *   preconditions({ siteLabels, jobsRunning, openLedgerRows }) -> string[]   // [] = may snapshot
 *   siteVolumes({ label, privateRoot, docker }) -> string[]   // EXACT, from the site's compose file
 *   planSnapshot({ qaHome, siteLabels, sourceSha, runId, docker }) -> Manifest (files: {})
 *   snapshotSteps(manifest, { srcDir, envFile, outDir }) -> Step[]
 *   takeSnapshot({ manifest, srcDir, envFile, outDir, docker?, tar? }) -> Manifest (with sha256s)
 *   readStandSites({ docker }) -> string[]                  // labels in the QA stand's `site` table
 *
 * The manifest lists everything EXACTLY, never by name pattern: the three stand volumes (postgres
 * as a pg_dump), every volume each site's compose project declares (`docker compose config
 * --volumes` → `<label>_<key>`: `_db` for WordPress/Joomla, `_app` for EmDash), each site's
 * folders under sites/ and private/, dsh-home/, the source SHA, the stand's and every site's
 * image IDs, the last migration, and the sha256 of every file written.
 *
 * Step = { docker: string[] } | { tar: string[] } | { note: string }
 */
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { QA, atomicWrite, composeArgs, dockerRunner, sha256 } from './qa-stand.mjs'

export const HELPER_IMAGE = 'postgres:16-alpine' // already on the daemon for the stand; has tar
export const DUMP_FILE = 'postgres.dump'

const out = (r) => (r.code === 0 ? r.stdout : '')
const lines = (t) =>
  t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
const fileFor = (kind, name) => `${kind}-${name.replace(/[^A-Za-z0-9_.-]/g, '_')}.tar`

export function preconditions({ siteLabels, jobsRunning, openLedgerRows }) {
  const problems = []
  const want = [...QA.fixedSites].sort()
  const have = [...siteLabels].sort()
  if (JSON.stringify(want) !== JSON.stringify(have))
    problems.push(`site table must hold exactly ${want.join(', ')} (has: ${have.join(', ') || 'none'})`)
  if (jobsRunning > 0) problems.push(`${jobsRunning} provision job(s) still running`)
  if (openLedgerRows > 0) problems.push(`${openLedgerRows} open row(s) in sites.jsonl`)
  return problems
}

export function readStandSites({ docker = dockerRunner() } = {}) {
  const r = docker([
    'exec',
    QA.postgresContainer,
    'psql',
    '-U',
    'tracy',
    '-d',
    'tracy',
    '-At',
    '-c',
    'select label from site order by label'
  ])
  if (r.code !== 0) throw new Error(`cannot read the site table: ${r.stderr.trim()}`)
  return lines(r.stdout)
}

export function siteVolumes({ label, privateRoot, docker = dockerRunner() }) {
  const dir = path.join(privateRoot, label)
  const r = docker([
    'compose',
    '--project-directory',
    dir,
    '-p',
    label,
    '-f',
    path.join(dir, 'docker-compose.yml'),
    'config',
    '--volumes'
  ])
  if (r.code !== 0) throw new Error(`cannot read the volumes of ${label}: ${r.stderr.trim()}`)
  return lines(r.stdout).map((key) => `${label}_${key}`)
}

function containerImages(docker, project) {
  const fmt = '{{.Label "com.docker.compose.service"}}\t{{.ID}}'
  const images = {}
  for (const l of lines(
    out(docker(['ps', '-a', '--filter', `label=com.docker.compose.project=${project}`, '--format', fmt]))
  )) {
    const [svc, id] = l.split('\t')
    images[svc] = out(docker(['inspect', '--format', '{{.Image}}', id])).trim() || null
  }
  return images
}

export function planSnapshot({
  qaHome,
  siteLabels,
  sourceSha,
  runId,
  docker = dockerRunner(),
  now = () => new Date().toISOString()
}) {
  const privateRoot = path.join(qaHome, 'private')
  const sitesRoot = path.join(qaHome, 'sites')
  const sites = siteLabels.map((label) => ({
    label,
    volumes: siteVolumes({ label, privateRoot, docker }),
    images: containerImages(docker, label)
  }))
  const volumes = [QA.standVolumes.minio, QA.standVolumes.jobs, ...sites.flatMap((s) => s.volumes)].map(
    (name) => ({ name, file: fileFor('vol', name) })
  )
  const dirs = [
    ...siteLabels.flatMap((l) => [path.join(sitesRoot, l), path.join(privateRoot, l)]),
    path.join(qaHome, 'dsh-home')
  ].map((p) => ({ path: p, file: fileFor('dir', path.relative(qaHome, p)) }))
  const standImages = Object.fromEntries(
    QA.appImages.map((img) => [
      img,
      out(docker(['image', 'inspect', '--format', '{{.Id}}', `${img}:${QA.imageTag}`])).trim() || null
    ])
  )
  const lastMigration =
    out(
      docker([
        'exec',
        QA.postgresContainer,
        'psql',
        '-U',
        'tracy',
        '-d',
        'tracy',
        '-At',
        '-c',
        'select max(name) from schema_migration'
      ])
    ).trim() || null
  return {
    version: 1,
    runId,
    createdAt: now(),
    sourceSha,
    project: QA.project,
    pgDump: { volume: QA.standVolumes.pg, file: DUMP_FILE },
    volumes,
    dirs,
    sites,
    standImages,
    lastMigration,
    files: {}
  }
}

export function snapshotSteps(manifest, { srcDir, envFile, outDir }) {
  const qa = composeArgs({ srcDir, envFile })
  const steps = [{ docker: [...qa, 'stop', 'tracy-web', 'tracy-host', 'tracy-dsh'] }]
  for (const s of manifest.sites) steps.push({ docker: ['stop', ...siteContainersPlaceholder(s.label)] })
  steps.push(
    {
      docker: [
        'exec',
        QA.postgresContainer,
        'pg_dump',
        '-U',
        'tracy',
        '-Fc',
        '-f',
        '/tmp/qa-snapshot.dump',
        'tracy'
      ]
    },
    { docker: ['cp', `${QA.postgresContainer}:/tmp/qa-snapshot.dump`, path.join(outDir, DUMP_FILE)] },
    { docker: ['exec', QA.postgresContainer, 'rm', '-f', '/tmp/qa-snapshot.dump'] }
  )
  for (const v of manifest.volumes) {
    steps.push({
      docker: [
        'run',
        '--rm',
        '--label',
        `qa.run=${manifest.runId}`,
        '-v',
        `${v.name}:/v:ro`,
        '-v',
        `${outDir}:/out`,
        '--entrypoint',
        'tar',
        HELPER_IMAGE,
        '-C',
        '/v',
        '-cf',
        `/out/${v.file}`,
        '.'
      ]
    })
  }
  for (const d of manifest.dirs) steps.push({ tar: ['-C', d.path, '-cf', path.join(outDir, d.file), '.'] })
  for (const s of manifest.sites) steps.push({ docker: ['start', ...siteContainersPlaceholder(s.label)] })
  steps.push({ docker: [...qa, 'start', 'tracy-web', 'tracy-host', 'tracy-dsh'] })
  return steps
}

// A site's containers are `<label>-web-1` and `<label>-db-1` (EmDash: `<label>-web-1` only); the
// executor expands this marker to the IDs `docker ps` reports for the project, so nothing is
// stopped by a name guess.
const siteContainersPlaceholder = (label) => [`@project:${label}`]

function expand(docker, argv) {
  return argv.flatMap((a) =>
    a.startsWith('@project:')
      ? lines(out(docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${a.slice(9)}`])))
      : [a]
  )
}

export function runSteps(
  steps,
  { docker = dockerRunner(), tar = (args) => spawnSync('tar', args, { encoding: 'utf8' }) } = {}
) {
  for (const step of steps) {
    if (step.docker) {
      const argv = expand(docker, step.docker)
      const marker = step.docker.some((a) => a.startsWith('@project:'))
      if (marker && argv.length === step.docker.length - 1) continue // the project has no containers
      const r = docker(argv)
      if (r.code !== 0) throw new Error(`docker ${argv.slice(0, 4).join(' ')} … failed: ${r.stderr.trim()}`)
    } else if (step.tar) {
      const r = tar(step.tar)
      if ((r.status ?? r.code) !== 0) throw new Error(`tar ${step.tar.join(' ')} failed: ${r.stderr ?? ''}`)
    }
  }
}

export function takeSnapshot({
  manifest,
  srcDir,
  envFile,
  outDir,
  docker = dockerRunner(),
  tar,
  write = atomicWrite
}) {
  const steps = snapshotSteps(manifest, { srcDir, envFile, outDir })
  try {
    runSteps(steps, { docker, tar })
  } catch (error) {
    // Whatever failed, the stand must not stay stopped.
    runSteps(
      steps.filter((s) => s.docker?.includes('start')),
      { docker, tar }
    )
    throw error
  }
  const files = {}
  for (const f of [DUMP_FILE, ...manifest.volumes.map((v) => v.file), ...manifest.dirs.map((d) => d.file)]) {
    const p = path.join(outDir, f)
    if (!existsSync(p)) throw new Error(`snapshot file missing after the run: ${f}`)
    files[f] = sha256(readFileSync(p))
  }
  const done = { ...manifest, files }
  write(path.join(outDir, 'manifest.json'), `${JSON.stringify(done, null, 2)}\n`)
  return done
}
