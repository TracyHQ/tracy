/**
 * Restore the QA stand from a golden snapshot (tasks/todo-daily-qa.md §4.9, Q21 as approved).
 *
 *   q21Labels({ dbLabels, ledgerLabels }) -> string[]
 *   planRestore({ manifest, dbLabels, ledgerLabels, extraVolumes?, docker? })
 *     -> { deleteVolumes: string[], extraSites: string[] }      // throws on a refused volume
 *   assertDeletable(volume, allowed: Set<string>)                // throws, names the volume
 *   restore({ manifest, snapshotDir, qaHome, srcDir, envFile, runId, dbLabels, ledgerLabels,
 *             imageTag?, extraVolumes?, docker?, tar?, log?, sleep? }) -> { deleted, extraSites }
 *
 * What may be deleted (Q21): every volume in the snapshot manifest, plus every volume belonging
 * to the compose project of a site that has a row in the QA stand's `site` table or in the QA
 * gate's ledger (sites created after the snapshot). Any other volume is refused, by name, before
 * anything is touched. Each deletion prints the volume name first.
 *
 * Images: the stand comes back on the images the manifest names. `imageTag` (default `qa`; `qa-prev`
 * after a failed upgrade) must point at exactly those IDs, or the restore refuses; a tag other
 * than `qa` is re-tagged to `qa` so compose starts the manifest's images. Never old images on newer
 * data: the caller restores a snapshot no newer than the images it names.
 *
 * After `restore` the caller runs deploy() (up, netfilter, health, core suite).
 */
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { DUMP_FILE, HELPER_IMAGE, runSteps } from './snapshot.mjs'
import { QA, composeArgs, dockerRunner, sha256 } from './qa-stand.mjs'

const out = (r) => (r.code === 0 ? r.stdout : '')
const lines = (t) =>
  t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
const LABEL_RE = /^[a-z0-9][a-z0-9_-]*$/

export function q21Labels({ dbLabels = [], ledgerLabels = [] }) {
  const all = [...new Set([...dbLabels, ...ledgerLabels])]
  for (const l of all)
    if (!LABEL_RE.test(l)) throw new Error(`refusing an unsafe site label: ${JSON.stringify(l)}`)
  // Never a project of the stand itself or of the shared stand.
  return all.filter((l) => l !== QA.project && l !== 'tracy').sort()
}

export function assertDeletable(volume, allowed) {
  if (!allowed.has(volume)) {
    throw new Error(
      `refusing to delete volume ${volume}: not in the snapshot manifest nor owned by a QA site (Q21)`
    )
  }
}

export function planRestore({
  manifest,
  dbLabels,
  ledgerLabels,
  extraVolumes = [],
  docker = dockerRunner()
}) {
  const manifestVolumes = [manifest.pgDump.volume, ...manifest.volumes.map((v) => v.name)]
  const labels = q21Labels({ dbLabels, ledgerLabels })
  const siteVolumes = labels.flatMap((l) =>
    lines(out(docker(['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${l}`])))
  )
  const allowed = new Set([...manifestVolumes, ...siteVolumes])
  for (const v of extraVolumes) assertDeletable(v, allowed)
  const known = new Set(manifest.sites.map((s) => s.label))
  return {
    deleteVolumes: [...new Set([...manifestVolumes, ...siteVolumes, ...extraVolumes])],
    extraSites: labels.filter((l) => !known.has(l)),
    allowed
  }
}

function within(root, p) {
  const rel = path.relative(root, p)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

export async function restore({
  manifest,
  snapshotDir,
  qaHome,
  srcDir,
  envFile,
  runId,
  dbLabels,
  ledgerLabels,
  imageTag = QA.imageTag,
  extraVolumes = [],
  docker = dockerRunner(),
  tar,
  log = (m) => console.log(m),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms))
}) {
  // 1. Everything that can refuse, refuses before anything is touched.
  for (const [file, want] of Object.entries(manifest.files ?? {})) {
    if (sha256(readFileSync(path.join(snapshotDir, file))) !== want)
      throw new Error(`snapshot file ${file} does not match its sha256`)
  }
  for (const [img, id] of Object.entries(manifest.standImages)) {
    const have = out(docker(['image', 'inspect', '--format', '{{.Id}}', `${img}:${imageTag}`])).trim()
    if (have !== id)
      throw new Error(`${img}:${imageTag} is not the image the snapshot names (${String(id).slice(0, 19)})`)
  }
  for (const d of manifest.dirs)
    if (!within(qaHome, d.path)) throw new Error(`snapshot dir ${d.path} is outside QA_HOME`)
  const plan = planRestore({ manifest, dbLabels, ledgerLabels, extraVolumes, docker })
  for (const l of plan.extraSites) {
    for (const sub of ['sites', 'private'])
      if (!within(qaHome, path.join(qaHome, sub, l))) throw new Error(`unsafe site path for ${l}`)
  }

  const qa = composeArgs({ srcDir, envFile })
  const steps = []
  // 2. Remove the containers of every QA site (fixed and extra) — they hold endpoints on the
  //    stand's `tracy` network — then take the stand down (volumes are kept by `down`).
  for (const l of q21Labels({
    dbLabels,
    ledgerLabels: [...ledgerLabels, ...manifest.sites.map((s) => s.label)]
  })) {
    steps.push({ docker: ['rm', '-f', `@project:${l}`] })
  }
  steps.push({ docker: [...qa, 'down'] })
  runSteps(steps, { docker, tar })

  // 3. Delete exactly the planned volumes, each named first.
  const deleted = []
  for (const v of plan.deleteVolumes) {
    assertDeletable(v, plan.allowed)
    const exists = docker(['volume', 'inspect', v]).code === 0
    if (!exists) continue
    log(`restore: deleting volume ${v}`)
    const r = docker(['volume', 'rm', v])
    if (r.code !== 0) throw new Error(`docker volume rm ${v} failed: ${r.stderr.trim()}`)
    deleted.push(v)
  }
  for (const l of plan.extraSites) {
    docker(['network', 'rm', `${l}_default`])
    for (const sub of ['sites', 'private'])
      rmSync(path.join(qaHome, sub, l), { recursive: true, force: true })
  }

  // 4. Load the volumes and folders back.
  const load = []
  for (const v of manifest.volumes) {
    const project = v.name.startsWith(`${QA.project}_`)
      ? QA.project
      : v.name.slice(0, v.name.lastIndexOf('_'))
    const key = v.name.slice(project.length + 1)
    load.push(
      {
        docker: [
          'volume',
          'create',
          '--label',
          `qa.run=${runId}`,
          '--label',
          `com.docker.compose.project=${project}`,
          '--label',
          `com.docker.compose.volume=${key}`,
          v.name
        ]
      },
      {
        docker: [
          'run',
          '--rm',
          '--label',
          `qa.run=${runId}`,
          '-v',
          `${v.name}:/v`,
          '-v',
          `${snapshotDir}:/in:ro`,
          '--entrypoint',
          'tar',
          HELPER_IMAGE,
          '-C',
          '/v',
          '-xf',
          `/in/${v.file}`
        ]
      }
    )
  }
  for (const d of manifest.dirs) {
    rmSync(d.path, { recursive: true, force: true })
    load.push({ mkdir: d.path }, { tar: ['-C', d.path, '-xf', path.join(snapshotDir, d.file)] })
  }
  for (const step of load) {
    if (step.mkdir) mkdirSync(step.mkdir, { recursive: true })
    else runSteps([step], { docker, tar })
  }

  // 5. Postgres from the dump.
  runSteps([{ docker: [...qa, 'up', '-d', 'postgres'] }], { docker, tar })
  let ready = false
  for (let i = 0; i < 60 && !ready; i++) {
    ready = docker(['exec', QA.postgresContainer, 'pg_isready', '-U', 'tracy']).code === 0
    if (!ready) await sleep(2000)
  }
  if (!ready) throw new Error('postgres did not become ready after the restore')
  runSteps(
    [
      { docker: ['cp', path.join(snapshotDir, DUMP_FILE), `${QA.postgresContainer}:/tmp/qa-restore.dump`] },
      {
        docker: [
          'exec',
          QA.postgresContainer,
          'pg_restore',
          '-U',
          'tracy',
          '-d',
          'tracy',
          '--clean',
          '--if-exists',
          '/tmp/qa-restore.dump'
        ]
      },
      { docker: ['exec', QA.postgresContainer, 'rm', '-f', '/tmp/qa-restore.dump'] }
    ],
    { docker, tar }
  )

  // 6. The manifest's images under the tag compose starts.
  if (imageTag !== QA.imageTag) {
    for (const img of Object.keys(manifest.standImages))
      runSteps([{ docker: ['tag', `${img}:${imageTag}`, `${img}:${QA.imageTag}`] }], { docker, tar })
  }
  // 7. The fixed sites come back up; the stand itself comes up through deploy().
  for (const s of manifest.sites) {
    const dir = path.join(qaHome, 'private', s.label)
    runSteps(
      [
        {
          docker: [
            'compose',
            '--project-directory',
            dir,
            '-p',
            s.label,
            '-f',
            path.join(dir, 'docker-compose.yml'),
            'up',
            '-d'
          ]
        }
      ],
      { docker, tar }
    )
  }
  return { deleted, extraSites: plan.extraSites }
}
